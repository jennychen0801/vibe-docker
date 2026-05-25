import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from './db.js';
import { sendPasswordEmail, sendNotificationEmail } from './mail.js';

// Extend Request interface to include user
interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: 'ADMIN' | 'MANAGER' | 'USER';
    name: string;
  };
}

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

// Middleware for JWT Authentication
const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;

    // Check if password change is required
    const userRes = await pool.query('SELECT must_change_password FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length > 0 && userRes.rows[0].must_change_password) {
      const isAllowedRoute = (req.path === '/api/auth/me' && req.method === 'GET') || 
                             (req.path === '/api/auth/password' && req.method === 'PUT');
      if (!isAllowedRoute) {
        return res.status(403).json({ 
          error: 'Password change required', 
          code: 'PASSWORD_CHANGE_REQUIRED' 
        });
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// Middleware for Admin permission
const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Admin access only' });
  }
  next();
};

// Helper to calculate hours between two timestamps
const parseAsUTC = (dateStr: string): Date => {
  const cleanStr = dateStr.slice(0, 19).replace(' ', 'T');
  return new Date(cleanStr + 'Z');
};

const calculateHours = (startStr: string, endStr: string): number => {
  const start = parseAsUTC(startStr);
  const end = parseAsUTC(endStr);
  if (start.getTime() >= end.getTime()) return 0;

  let totalMilliseconds = 0;

  const currentDay = new Date(start);
  currentDay.setUTCHours(0, 0, 0, 0);

  const lastDay = new Date(end);
  lastDay.setUTCHours(0, 0, 0, 0);

  while (currentDay.getTime() <= lastDay.getTime()) {
    const dayOfWeek = currentDay.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dayStart = new Date(currentDay);
      dayStart.setUTCHours(9, 0, 0, 0);

      const dayEnd = new Date(currentDay);
      dayEnd.setUTCHours(18, 0, 0, 0);

      const lunchStart = new Date(currentDay);
      lunchStart.setUTCHours(12, 0, 0, 0);

      const lunchEnd = new Date(currentDay);
      lunchEnd.setUTCHours(13, 0, 0, 0);

      const overlapStart = new Date(Math.max(start.getTime(), dayStart.getTime()));
      const overlapEnd = new Date(Math.min(end.getTime(), dayEnd.getTime()));

      if (overlapStart.getTime() < overlapEnd.getTime()) {
        const amStart = Math.max(overlapStart.getTime(), dayStart.getTime());
        const amEnd = Math.min(overlapEnd.getTime(), lunchStart.getTime());
        if (amStart < amEnd) {
          totalMilliseconds += (amEnd - amStart);
        }

        const pmStart = Math.max(overlapStart.getTime(), lunchEnd.getTime());
        const pmEnd = Math.min(overlapEnd.getTime(), dayEnd.getTime());
        if (pmStart < pmEnd) {
          totalMilliseconds += (pmEnd - pmStart);
        }
      }
    }

    currentDay.setUTCDate(currentDay.getUTCDate() + 1);
  }

  const totalHours = totalMilliseconds / (1000 * 60 * 60);
  return Number(totalHours.toFixed(2));
};

// Database seed function
const seedDatabase = async () => {
  try {
    const client = await pool.connect();
    try {
      const userRes = await client.query('SELECT COUNT(*) FROM users');
      if (parseInt(userRes.rows[0].count) === 0) {
        console.log('Seeding initial data...');
        
        // Hash passwords
        const adminHash = await bcrypt.hash('admin123', 10);
        const managerHash = await bcrypt.hash('manager123', 10);
        const userHash = await bcrypt.hash('user123', 10);

        // Insert Users
        const adminUser = await client.query(
          `INSERT INTO users (email, password_hash, role, name) 
           VALUES ($1, $2, $3, $4) RETURNING id`,
          ['admin@attendance.com', adminHash, 'ADMIN', '系統管理員']
        );

        const managerUser = await client.query(
          `INSERT INTO users (email, password_hash, role, name) 
           VALUES ($1, $2, $3, $4) RETURNING id`,
          ['manager@attendance.com', managerHash, 'MANAGER', '部門主管']
        );

        const regularUser = await client.query(
          `INSERT INTO users (email, password_hash, role, name, manager_id) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          ['user@attendance.com', userHash, 'USER', '一般員工', managerUser.rows[0].id]
        );

        // Insert Leave Balances
        await client.query(
          `INSERT INTO leave_balances (user_id, annual_hours, compensatory_hours) 
           VALUES ($1, 80.00, 0.00)`,
          [adminUser.rows[0].id]
        );
        await client.query(
          `INSERT INTO leave_balances (user_id, annual_hours, compensatory_hours) 
           VALUES ($1, 80.00, 0.00)`,
          [managerUser.rows[0].id]
        );
        await client.query(
          `INSERT INTO leave_balances (user_id, annual_hours, compensatory_hours) 
           VALUES ($1, 80.00, 0.00)`,
          [regularUser.rows[0].id]
        );

        console.log('Initial seeding completed.');
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error seeding database:', err);
  }
};

// -----------------------------------------------------------------------------
// Auth Routes
// -----------------------------------------------------------------------------

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      token,
      user: { 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        name: user.name, 
        must_change_password: user.must_change_password 
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userRes = await pool.query(
      'SELECT id, email, role, name, must_change_password FROM users WHERE id = $1', 
      [req.user!.id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: userRes.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

app.put('/api/auth/password', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Old password and new password are required' });
  }

  try {
    const userRes = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid old password' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [hash, req.user!.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during password update' });
  }
});

// -----------------------------------------------------------------------------
// User Management (Admin only)
// -----------------------------------------------------------------------------

// List all users
app.get('/api/users', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const usersRes = await pool.query(
      `SELECT u.id, u.email, u.role, u.name, u.manager_id, m.name as manager_name, 
              lb.annual_hours, lb.compensatory_hours
       FROM users u
       LEFT JOIN users m ON u.manager_id = m.id
       LEFT JOIN leave_balances lb ON u.id = lb.user_id
       ORDER BY u.id ASC`
    );
    res.json(usersRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Add user
app.post('/api/users', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  const { name, email, role, manager_id, annual_hours } = req.body;
  if (!name || !email || !role) {
    return res.status(400).json({ error: 'Name, email, and role are required' });
  }

  // Generate random 8-character password
  const tempPassword = Math.random().toString(36).slice(-8);
  
  try {
    const hash = await bcrypt.hash(tempPassword, 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        `INSERT INTO users (name, email, password_hash, role, manager_id) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role`,
        [name, email, hash, role, manager_id || null]
      );

      const userId = userRes.rows[0].id;
      
      // Default balance
      const initialAnnual = annual_hours ? parseFloat(annual_hours) : 0;
      await client.query(
        `INSERT INTO leave_balances (user_id, annual_hours, compensatory_hours) 
         VALUES ($1, $2, 0.00)`,
        [userId, initialAnnual]
      );

      await client.query('COMMIT');

      // Send email in background
      sendPasswordEmail(email, name, tempPassword);

      res.status(201).json(userRes.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(err);
    if (err.constraint === 'users_email_key') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user and balance
app.put('/api/users/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = parseInt(req.params.id);
  const { name, email, role, manager_id, annual_hours, compensatory_hours } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE users 
         SET name = $1, email = $2, role = $3, manager_id = $4 
         WHERE id = $5`,
        [name, email, role, manager_id || null, userId]
      );

      if (annual_hours !== undefined || compensatory_hours !== undefined) {
        await client.query(
          `INSERT INTO leave_balances (user_id, annual_hours, compensatory_hours) 
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) 
           DO UPDATE SET annual_hours = EXCLUDED.annual_hours, 
                         compensatory_hours = EXCLUDED.compensatory_hours`,
          [userId, annual_hours || 0, compensatory_hours || 0]
        );

        await client.query(
          `INSERT INTO approval_logs (request_type, request_id, operator_id, action, comment) 
           VALUES ('BALANCE', $1, $2, 'APPROVE', $3)`,
          [
            userId,
            req.user!.id,
            `管理員調整額度：年假 = ${annual_hours !== undefined ? annual_hours : '未變更'} 小時, 補休 = ${compensatory_hours !== undefined ? compensatory_hours : '未變更'} 小時`
          ]
        );
      }

      await client.query('COMMIT');
      res.json({ message: 'User updated successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
app.delete('/api/users/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = parseInt(req.params.id);
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// -----------------------------------------------------------------------------
// Clock In/Out API
// -----------------------------------------------------------------------------

// Record clock in/out
app.post('/api/clock', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { type, gps_coords } = req.body;
  if (!type || !['IN', 'OUT'].includes(type)) {
    return res.status(400).json({ error: 'Type must be IN or OUT' });
  }

  const userId = req.user!.id;
  const ip = req.ip || '127.0.0.1';

  try {
    const result = await pool.query(
      `INSERT INTO clock_records (user_id, type, ip, gps_coords) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, type, ip, gps_coords ? JSON.stringify(gps_coords) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record clock-in/out' });
  }
});

// Get today's clock records
app.get('/api/clock/today', authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const result = await pool.query(
      `SELECT * FROM clock_records 
       WHERE user_id = $1 AND timestamp::date = CURRENT_DATE 
       ORDER BY timestamp ASC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch today\'s clock records' });
  }
});

// Get user history
app.get('/api/clock/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const result = await pool.query(
      `SELECT * FROM clock_records 
       WHERE user_id = $1 
       ORDER BY timestamp DESC LIMIT 50`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch clock history' });
  }
});

// -----------------------------------------------------------------------------
// Leave Requests API
// -----------------------------------------------------------------------------

// Submit leave request
app.post('/api/leaves', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { leave_type, start_time, end_time, reason, proxy_id, approver_id } = req.body;
  if (!leave_type || !start_time || !end_time || !proxy_id || !approver_id) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const userId = req.user!.id;
  const hoursRequested = calculateHours(start_time, end_time);
  if (hoursRequested <= 0) {
    return res.status(400).json({ error: 'Invalid start/end time duration' });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check for overlapping requests
      const overlapRes = await client.query(
        `SELECT COUNT(*) FROM leave_requests 
         WHERE user_id = $1 
           AND status != 'REJECTED' 
           AND (start_time, end_time) OVERLAPS ($2::timestamp with time zone, $3::timestamp with time zone)`,
        [userId, start_time, end_time]
      );
      if (parseInt(overlapRes.rows[0].count) > 0) {
        return res.status(400).json({ error: 'Time range overlaps with an existing request' });
      }

      // Check balance
      const balanceRes = await client.query(
        'SELECT annual_hours, compensatory_hours FROM leave_balances WHERE user_id = $1',
        [userId]
      );
      if (balanceRes.rows.length === 0) {
        return res.status(400).json({ error: 'No leave balance found for user' });
      }

      const balance = balanceRes.rows[0];
      if (leave_type === 'ANNUAL' && parseFloat(balance.annual_hours) < hoursRequested) {
        return res.status(400).json({ error: 'Insufficient leave balance' });
      }
      if (leave_type === 'COMPENSATORY' && parseFloat(balance.compensatory_hours) < hoursRequested) {
        return res.status(400).json({ error: 'Insufficient leave balance' });
      }

      // Create request in PENDING_PROXY
      const requestRes = await client.query(
        `INSERT INTO leave_requests (user_id, leave_type, start_time, end_time, reason, status, proxy_user_id, approver_id) 
         VALUES ($1, $2, $3, $4, $5, 'PENDING_PROXY', $6, $7) RETURNING *`,
        [userId, leave_type, start_time, end_time, reason || '', proxy_id, approver_id]
      );

      await client.query('COMMIT');

      // Get proxy details for email
      const proxyUser = await pool.query('SELECT email, name FROM users WHERE id = $1', [proxy_id]);
      if (proxyUser.rows.length > 0) {
        sendNotificationEmail(
          proxyUser.rows[0].email,
          '出缺勤系統：待簽核代理人通知',
          `您好，同仁 ${req.user!.name} 申請了自 ${new Date(start_time).toLocaleString()} 至 ${new Date(end_time).toLocaleString()} 的請假，並指派您為職務代理人。請登入系統進行核准。`
        );
      }

      res.status(201).json(requestRes.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit leave request' });
  }
});

// Get user leave balances
app.get('/api/leaves/balances', authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const result = await pool.query(
      'SELECT annual_hours, compensatory_hours FROM leave_balances WHERE user_id = $1',
      [userId]
    );
    res.json(result.rows[0] || { annual_hours: 0, compensatory_hours: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leave balances' });
  }
});

// Get pending tasks for current user (either proxy or approver)
app.get('/api/leaves/pending', authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const result = await pool.query(
      `SELECT lr.*, u.name as user_name, u.email as user_email
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       WHERE (lr.status = 'PENDING_PROXY' AND lr.proxy_user_id = $1)
          OR (lr.status = 'PENDING_APPROVAL' AND lr.approver_id = $1)`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

// Approve leave request (handles both proxy and manager)
app.post('/api/leaves/:id/approve', authMiddleware, async (req: AuthRequest, res: Response) => {
  const requestId = parseInt(req.params.id);
  const userId = req.user!.id;
  const { comment } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const reqRes = await client.query('SELECT * FROM leave_requests WHERE id = $1', [requestId]);
      if (reqRes.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }

      const request = reqRes.rows[0];
      const hoursRequested = calculateHours(request.start_time, request.end_time);

      if (request.status === 'PENDING_PROXY' && request.proxy_user_id === userId) {
        // Proxy approved, transition to PENDING_APPROVAL
        await client.query(
          `UPDATE leave_requests SET status = 'PENDING_APPROVAL' WHERE id = $1`,
          [requestId]
        );
        
        await client.query(
          `INSERT INTO approval_logs (request_type, request_id, operator_id, action, comment) 
           VALUES ('LEAVE', $1, $2, 'APPROVE', $3)`,
          [requestId, userId, comment || '代理人同意']
        );

        // Notify Approver/Manager
        const approverUser = await client.query('SELECT email, name FROM users WHERE id = $1', [request.approver_id]);
        if (approverUser.rows.length > 0) {
          sendNotificationEmail(
            approverUser.rows[0].email,
            '出缺勤系統：待簽核假單通知',
            `您好，同仁 ${request.user_id} 申請的假單已由代理人同意，目前等待您的主管審核。請登入系統處理。`
          );
        }

      } else if (request.status === 'PENDING_APPROVAL' && request.approver_id === userId) {
        // Manager approved, double check balance and deduct
        const balanceRes = await client.query(
          'SELECT annual_hours, compensatory_hours FROM leave_balances WHERE user_id = $1 FOR UPDATE',
          [request.user_id]
        );
        
        if (balanceRes.rows.length === 0) {
          return res.status(400).json({ error: 'Balance not found' });
        }

        const balance = balanceRes.rows[0];
        if (request.leave_type === 'ANNUAL') {
          if (parseFloat(balance.annual_hours) < hoursRequested) {
            return res.status(400).json({ error: 'Insufficient leave balance' });
          }
          await client.query(
            `UPDATE leave_balances SET annual_hours = annual_hours - $1 WHERE user_id = $2`,
            [hoursRequested, request.user_id]
          );
        } else if (request.leave_type === 'COMPENSATORY') {
          if (parseFloat(balance.compensatory_hours) < hoursRequested) {
            return res.status(400).json({ error: 'Insufficient leave balance' });
          }
          await client.query(
            `UPDATE leave_balances SET compensatory_hours = compensatory_hours - $1 WHERE user_id = $2`,
            [hoursRequested, request.user_id]
          );
        }

        await client.query(
          `UPDATE leave_requests SET status = 'APPROVED' WHERE id = $1`,
          [requestId]
        );

        await client.query(
          `INSERT INTO approval_logs (request_type, request_id, operator_id, action, comment) 
           VALUES ('LEAVE', $1, $2, 'APPROVE', $3)`,
          [requestId, userId, comment || '主管核准']
        );

        // Notify user
        const applicant = await client.query('SELECT email, name FROM users WHERE id = $1', [request.user_id]);
        if (applicant.rows.length > 0) {
          sendNotificationEmail(
            applicant.rows[0].email,
            '出缺勤系統：假單已核准',
            `您好，您申請的假單（自 ${new Date(request.start_time).toLocaleString()} 起）已獲得主管正式核准。`
          );
        }
      } else {
        return res.status(403).json({ error: 'Forbidden: You cannot approve this request in its current state' });
      }

      await client.query('COMMIT');
      res.json({ message: 'Request approved successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// Reject leave request
app.post('/api/leaves/:id/reject', authMiddleware, async (req: AuthRequest, res: Response) => {
  const requestId = parseInt(req.params.id);
  const userId = req.user!.id;
  const { comment } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const reqRes = await client.query('SELECT * FROM leave_requests WHERE id = $1', [requestId]);
      if (reqRes.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }

      const request = reqRes.rows[0];
      if ((request.status === 'PENDING_PROXY' && request.proxy_user_id === userId) ||
          (request.status === 'PENDING_APPROVAL' && request.approver_id === userId)) {
        
        await client.query(
          `UPDATE leave_requests SET status = 'REJECTED' WHERE id = $1`,
          [requestId]
        );

        await client.query(
          `INSERT INTO approval_logs (request_type, request_id, operator_id, action, comment) 
           VALUES ('LEAVE', $1, $2, 'REJECT', $3)`,
          [requestId, userId, comment || '退回']
        );

        // Notify user
        const applicant = await client.query('SELECT email, name FROM users WHERE id = $1', [request.user_id]);
        if (applicant.rows.length > 0) {
          sendNotificationEmail(
            applicant.rows[0].email,
            '出缺勤系統：假單被退回',
            `您好，您申請的假單（自 ${new Date(request.start_time).toLocaleString()} 起）已被代理人或主管退回。退回原因：${comment || '無'}`
          );
        }
      } else {
        return res.status(403).json({ error: 'Forbidden: You cannot reject this request' });
      }

      await client.query('COMMIT');
      res.json({ message: 'Request rejected successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// List user's requests history
app.get('/api/leaves/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const result = await pool.query(
      `SELECT lr.*, p.name as proxy_name, a.name as approver_name
       FROM leave_requests lr
       JOIN users p ON lr.proxy_user_id = p.id
       JOIN users a ON lr.approver_id = a.id
       WHERE lr.user_id = $1
       ORDER BY lr.start_time DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leave history' });
  }
});

// -----------------------------------------------------------------------------
// Overtime Requests API
// -----------------------------------------------------------------------------

// Submit overtime request
app.post('/api/overtime', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { date, hours, reason } = req.body;
  if (!date || !hours || !reason) {
    return res.status(400).json({ error: 'Date, hours, and reason are required' });
  }

  const userId = req.user!.id;

  try {
    // Get user's manager as approver
    const userRes = await pool.query('SELECT manager_id FROM users WHERE id = $1', [userId]);
    const managerId = userRes.rows[0]?.manager_id;
    if (!managerId) {
      return res.status(400).json({ error: 'You must have a designated manager to apply for overtime' });
    }

    const result = await pool.query(
      `INSERT INTO overtime_requests (user_id, date, hours, reason, status, approver_id) 
       VALUES ($1, $2, $3, $4, 'PENDING_APPROVAL', $5) RETURNING *`,
      [userId, date, hours, reason, managerId]
    );

    // Notify Manager
    const managerUser = await pool.query('SELECT email, name FROM users WHERE id = $1', [managerId]);
    if (managerUser.rows.length > 0) {
      sendNotificationEmail(
        managerUser.rows[0].email,
        '出缺勤系統：待簽核加班申請通知',
        `您好，同仁 ${req.user!.name} 申請了日期 ${date} 的加班共 ${hours} 小時，理由為「${reason}」。請登入系統進行審核。`
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit overtime request' });
  }
});

// Get user's overtime history
app.get('/api/overtime/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const result = await pool.query(
      `SELECT ot.*, a.name as approver_name
       FROM overtime_requests ot
       JOIN users a ON ot.approver_id = a.id
       WHERE ot.user_id = $1
       ORDER BY ot.date DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch overtime history' });
  }
});

// Get pending overtime tasks (for manager)
app.get('/api/overtime/pending', authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  try {
    const result = await pool.query(
      `SELECT ot.*, u.name as user_name, u.email as user_email
       FROM overtime_requests ot
       JOIN users u ON ot.user_id = u.id
       WHERE ot.status = 'PENDING_APPROVAL' AND ot.approver_id = $1`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pending overtime requests' });
  }
});

// Approve overtime request
app.post('/api/overtime/:id/approve', authMiddleware, async (req: AuthRequest, res: Response) => {
  const requestId = parseInt(req.params.id);
  const userId = req.user!.id;
  const { comment } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const reqRes = await client.query('SELECT * FROM overtime_requests WHERE id = $1', [requestId]);
      if (reqRes.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }

      const request = reqRes.rows[0];
      if (request.approver_id !== userId || request.status !== 'PENDING_APPROVAL') {
        return res.status(403).json({ error: 'Forbidden: You cannot approve this request' });
      }

      // Update request status to APPROVED
      await client.query(
        `UPDATE overtime_requests SET status = 'APPROVED' WHERE id = $1`,
        [requestId]
      );

      // Add to compensatory balance (Overtime Request and Comp-time Conversion)
      await client.query(
        `UPDATE leave_balances 
         SET compensatory_hours = compensatory_hours + $1 
         WHERE user_id = $2`,
        [parseFloat(request.hours), request.user_id]
      );

      // Record approval log
      await client.query(
        `INSERT INTO approval_logs (request_type, request_id, operator_id, action, comment) 
         VALUES ('OVERTIME', $1, $2, 'APPROVE', $3)`,
        [requestId, userId, comment || '主管核准加班']
      );

      await client.query('COMMIT');

      // Notify user
      const applicant = await pool.query('SELECT email, name FROM users WHERE id = $1', [request.user_id]);
      if (applicant.rows.length > 0) {
        sendNotificationEmail(
          applicant.rows[0].email,
          '出缺勤系統：加班申請已核准',
          `您好，您申請的日期 ${request.date} 的 ${request.hours} 小時加班已核准。對應補休時數已存入您的帳戶。`
        );
      }

      res.json({ message: 'Overtime approved successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve overtime' });
  }
});

// Reject overtime request
app.post('/api/overtime/:id/reject', authMiddleware, async (req: AuthRequest, res: Response) => {
  const requestId = parseInt(req.params.id);
  const userId = req.user!.id;
  const { comment } = req.body;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const reqRes = await client.query('SELECT * FROM overtime_requests WHERE id = $1', [requestId]);
      if (reqRes.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }

      const request = reqRes.rows[0];
      if (request.approver_id !== userId || request.status !== 'PENDING_APPROVAL') {
        return res.status(403).json({ error: 'Forbidden: You cannot reject this request' });
      }

      // Update request status to REJECTED
      await client.query(
        `UPDATE overtime_requests SET status = 'REJECTED' WHERE id = $1`,
        [requestId]
      );

      // Record approval log
      await client.query(
        `INSERT INTO approval_logs (request_type, request_id, operator_id, action, comment) 
         VALUES ('OVERTIME', $1, $2, 'REJECT', $3)`,
        [requestId, userId, comment || '退回加班申請']
      );

      await client.query('COMMIT');

      // Notify user
      const applicant = await pool.query('SELECT email, name FROM users WHERE id = $1', [request.user_id]);
      if (applicant.rows.length > 0) {
        sendNotificationEmail(
          applicant.rows[0].email,
          '出缺勤系統：加班申請已被退回',
          `您好，您申請的日期 ${request.date} 的加班已被退回。原因：${comment || '無'}`
        );
      }

      res.json({ message: 'Overtime rejected successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reject overtime' });
  }
});

// -----------------------------------------------------------------------------
// Start server and seed database
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Backend server is running on port ${PORT}`);
  await seedDatabase();
});
