import Module from 'module';
import assert from 'assert';
import fs from 'fs';
import path from 'path';

// Cast global variables to bypass typescript lib checks
const g = global as any;
const fetchMock = g.fetch;
const processMock = g.process;

// 1. Setup Module Interceptor to Mock 'pg' and 'nodemailer' before loading the app
const originalRequire = (Module.prototype as any).require;

// In-memory database
const db = {
  users: [] as any[],
  clock_records: [] as any[],
  leave_requests: [] as any[],
  overtime_requests: [] as any[],
  leave_balances: [] as any[],
  approval_logs: [] as any[]
};

// Store sent emails for verification
const sentEmails: any[] = [];

const mockQuery = async (text: string, params: any[] = []) => {
  const sql = text.replace(/\s+/g, ' ').trim();
  
  if (sql.startsWith('SELECT COUNT(*) FROM users')) {
    return { rows: [{ count: db.users.length.toString() }] };
  }
  
  if (sql.startsWith('INSERT INTO users')) {
    const hasManager = sql.includes('manager_id');
    const id = db.users.length + 1;
    const email = params[0];
    const password_hash = params[1];
    const role = params[2];
    const name = params[3];
    const manager_id = hasManager ? params[4] : null;
    const newUser = { id, email, password_hash, role, name, manager_id, created_at: new Date() };
    db.users.push(newUser);
    return { rows: [newUser] };
  }
  
  if (sql.startsWith('INSERT INTO leave_balances')) {
    const id = db.leave_balances.length + 1;
    const user_id = params[0];
    const annual_hours = params[1];
    const compensatory_hours = params[2] || 0.00;
    const balance = { id, user_id, annual_hours, compensatory_hours, updated_at: new Date() };
    db.leave_balances.push(balance);
    return { rows: [balance] };
  }

  if (sql.startsWith('SELECT * FROM users WHERE email = $1')) {
    const user = db.users.find(u => u.email === params[0]);
    return { rows: user ? [user] : [] };
  }

  if (sql.startsWith('SELECT u.id, u.email, u.role, u.name, u.manager_id')) {
    const rows = db.users.map(u => {
      const mgr = db.users.find(m => m.id === u.manager_id);
      const bal = db.leave_balances.find(b => b.user_id === u.id) || { annual_hours: 0, compensatory_hours: 0 };
      return {
        id: u.id,
        email: u.email,
        role: u.role,
        name: u.name,
        manager_id: u.manager_id,
        manager_name: mgr ? mgr.name : null,
        annual_hours: bal.annual_hours,
        compensatory_hours: bal.compensatory_hours
      };
    });
    return { rows };
  }

  if (sql.startsWith('SELECT email, name FROM users WHERE id = $1')) {
    const user = db.users.find(u => u.id === params[0]);
    return { rows: user ? [{ email: user.email, name: user.name }] : [] };
  }

  if (sql.startsWith('INSERT INTO clock_records')) {
    const id = db.clock_records.length + 1;
    const newRecord = {
      id,
      user_id: params[0],
      type: params[1],
      ip: params[2],
      gps_coords: params[3] ? JSON.parse(params[3]) : null,
      timestamp: new Date()
    };
    db.clock_records.push(newRecord);
    return { rows: [newRecord] };
  }

  if (sql.startsWith('SELECT * FROM clock_records WHERE user_id = $1 AND timestamp::date = CURRENT_DATE')) {
    const user_id = params[0];
    const records = db.clock_records.filter(r => r.user_id === user_id);
    return { rows: records };
  }

  if (sql.startsWith('SELECT * FROM clock_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 50')) {
    const user_id = params[0];
    const records = [...db.clock_records].filter(r => r.user_id === user_id).reverse();
    return { rows: records };
  }

  if (sql.startsWith('SELECT annual_hours, compensatory_hours FROM leave_balances WHERE user_id = $1')) {
    const bal = db.leave_balances.find(b => b.user_id === params[0]);
    return { rows: bal ? [bal] : [] };
  }

  if (sql.startsWith('INSERT INTO leave_requests')) {
    const id = db.leave_requests.length + 1;
    const req = {
      id,
      user_id: params[0],
      leave_type: params[1],
      start_time: params[2],
      end_time: params[3],
      reason: params[4],
      status: 'PENDING_PROXY',
      proxy_user_id: params[5],
      approver_id: params[6]
    };
    db.leave_requests.push(req);
    return { rows: [req] };
  }

  if (sql.startsWith('SELECT * FROM leave_requests WHERE id = $1')) {
    const req = db.leave_requests.find(r => r.id === params[0]);
    return { rows: req ? [req] : [] };
  }

  if (sql.startsWith('UPDATE leave_requests SET status =')) {
    let status = '';
    if (sql.includes("'PENDING_APPROVAL'")) {
      status = 'PENDING_APPROVAL';
    } else if (sql.includes("'APPROVED'")) {
      status = 'APPROVED';
    } else if (sql.includes("'REJECTED'")) {
      status = 'REJECTED';
    }
    const id = params[0];
    const req = db.leave_requests.find(r => r.id === id);
    if (req) req.status = status;
    return { rows: req ? [req] : [] };
  }

  if (sql.startsWith('INSERT INTO approval_logs')) {
    const id = db.approval_logs.length + 1;
    const log = {
      id,
      request_type: params[0],
      request_id: params[1],
      operator_id: params[2],
      action: params[3],
      comment: params[4],
      timestamp: new Date()
    };
    db.approval_logs.push(log);
    return { rows: [log] };
  }

  if (sql.startsWith('UPDATE leave_balances SET annual_hours = annual_hours - $1 WHERE user_id = $2')) {
    const hours = params[0];
    const user_id = params[1];
    const bal = db.leave_balances.find(b => b.user_id === user_id);
    if (bal) {
      bal.annual_hours = (parseFloat(bal.annual_hours) - hours).toFixed(2);
    }
    return { rows: [] };
  }

  if (sql.startsWith('UPDATE leave_balances SET compensatory_hours = compensatory_hours - $1 WHERE user_id = $2')) {
    const hours = params[0];
    const user_id = params[1];
    const bal = db.leave_balances.find(b => b.user_id === user_id);
    if (bal) {
      bal.compensatory_hours = (parseFloat(bal.compensatory_hours) - hours).toFixed(2);
    }
    return { rows: [] };
  }

  if (sql.startsWith('SELECT lr.*, u.name as user_name')) {
    const user_id = params[0];
    const pending = db.leave_requests.filter(r => 
      (r.status === 'PENDING_PROXY' && r.proxy_user_id === user_id) ||
      (r.status === 'PENDING_APPROVAL' && r.approver_id === user_id)
    ).map(r => {
      const u = db.users.find(usr => usr.id === r.user_id);
      return {
        ...r,
        user_name: u ? u.name : '',
        user_email: u ? u.email : ''
      };
    });
    return { rows: pending };
  }

  if (sql.startsWith('SELECT lr.*, p.name as proxy_name')) {
    const user_id = params[0];
    const history = db.leave_requests.filter(r => r.user_id === user_id).map(r => {
      const p = db.users.find(usr => usr.id === r.proxy_user_id);
      const a = db.users.find(usr => usr.id === r.approver_id);
      return {
        ...r,
        proxy_name: p ? p.name : '',
        approver_name: a ? a.name : ''
      };
    });
    return { rows: history };
  }

  // OVERTIME MOCKS
  if (sql.startsWith('SELECT manager_id FROM users WHERE id = $1')) {
    const user = db.users.find(u => u.id === params[0]);
    return { rows: user ? [{ manager_id: user.manager_id }] : [] };
  }

  if (sql.startsWith('INSERT INTO overtime_requests')) {
    const id = db.overtime_requests.length + 1;
    const req = {
      id,
      user_id: params[0],
      date: params[1],
      hours: params[2],
      reason: params[3],
      status: 'PENDING_APPROVAL',
      approver_id: params[4]
    };
    db.overtime_requests.push(req);
    return { rows: [req] };
  }

  if (sql.startsWith('SELECT ot.*, a.name as approver_name')) {
    const user_id = params[0];
    const history = db.overtime_requests.filter(r => r.user_id === user_id).map(r => {
      const a = db.users.find(usr => usr.id === r.approver_id);
      return {
        ...r,
        approver_name: a ? a.name : ''
      };
    });
    return { rows: history };
  }

  if (sql.startsWith('SELECT ot.*, u.name as user_name')) {
    const manager_id = params[0];
    const pending = db.overtime_requests.filter(r => r.status === 'PENDING_APPROVAL' && r.approver_id === manager_id).map(r => {
      const u = db.users.find(usr => usr.id === r.user_id);
      return {
        ...r,
        user_name: u ? u.name : '',
        user_email: u ? u.email : ''
      };
    });
    return { rows: pending };
  }

  if (sql.startsWith('SELECT * FROM overtime_requests WHERE id = $1')) {
    const req = db.overtime_requests.find(r => r.id === params[0]);
    return { rows: req ? [req] : [] };
  }

  if (sql.startsWith('UPDATE overtime_requests SET status =')) {
    let status = '';
    if (sql.includes("'APPROVED'")) {
      status = 'APPROVED';
    } else if (sql.includes("'REJECTED'")) {
      status = 'REJECTED';
    }
    const id = params[0];
    const req = db.overtime_requests.find(r => r.id === id);
    if (req) req.status = status;
    return { rows: req ? [req] : [] };
  }

  if (sql.startsWith('UPDATE leave_balances SET compensatory_hours = compensatory_hours + $1 WHERE user_id = $2')) {
    const hours = params[0];
    const user_id = params[1];
    const bal = db.leave_balances.find(b => b.user_id === user_id);
    if (bal) {
      bal.compensatory_hours = (parseFloat(bal.compensatory_hours) + hours).toFixed(2);
    }
    return { rows: [] };
  }

  g.console.log('UNHANDLED SQL:', sql, params);
  return { rows: [] };
};

const mockClient = {
  query: mockQuery,
  release: () => {}
};

const mockPool = {
  connect: async () => mockClient,
  query: mockQuery
};

Module.prototype.require = function (id) {
  let targetId = id;
  // If it's a relative require ending in .js, and the file doesn't exist, change it to .ts
  if (id.startsWith('.') && id.endsWith('.js')) {
    const absolutePath = path.resolve(__dirname, id);
    if (!fs.existsSync(absolutePath)) {
      const tsPath = absolutePath.slice(0, -3) + '.ts';
      if (fs.existsSync(tsPath)) {
        targetId = tsPath;
      }
    }
  }

  if (targetId === 'pg' || targetId.endsWith('db.js') || targetId.endsWith('db.ts') || targetId.endsWith('db')) {
    return {
      default: mockPool,
      Pool: function() {
        return mockPool;
      }
    };
  }
  if (targetId === 'nodemailer') {
    return {
      createTransport: () => ({
        sendMail: async (options: any) => {
          sentEmails.push(options);
          g.console.log(`[SMTP Mock] Sent mail to ${options.to}: ${options.subject}`);
        }
      })
    };
  }
  return originalRequire.call(this, targetId);
};

// 2. Set PORT and import index.ts to start the mocked server
const PORT = 5001;
processMock.env.PORT = PORT.toString();
processMock.env.JWT_SECRET = 'testjwtsecretkey';

g.console.log('Starting backend server with mocked database...');
import './index.js';

// Helper to wait
const sleep = (ms: number) => new Promise(resolve => g.setTimeout(resolve, ms));

async function runTests() {
  await sleep(1000); // Wait for express app to boot up and run seeds
  
  g.console.log('\n--- STARTING INTEGRATION TESTS ---');
  const baseUrl = `http://localhost:${PORT}`;
  
  let adminToken = '';
  let managerToken = '';
  let userToken = '';
  
  let adminId = 1;
  let managerId = 2;
  let userId = 3;

  // Test 1: Seed data verification via direct login
  g.console.log('Test 1: Verify seed users can login');
  
  // Login as admin
  const resAdmin = await fetchMock(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@attendance.com', password: 'admin123' })
  });
  assert.strictEqual(resAdmin.status, 200);
  const dataAdmin = await resAdmin.json() as any;
  adminToken = dataAdmin.token;
  assert.strictEqual(dataAdmin.user.role, 'ADMIN');
  g.console.log('✔ Admin logged in successfully.');

  // Login as manager
  const resManager = await fetchMock(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@attendance.com', password: 'manager123' })
  });
  assert.strictEqual(resManager.status, 200);
  const dataManager = await resManager.json() as any;
  managerToken = dataManager.token;
  assert.strictEqual(dataManager.user.role, 'MANAGER');
  g.console.log('✔ Manager logged in successfully.');

  // Login as regular user
  const resUser = await fetchMock(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@attendance.com', password: 'user123' })
  });
  assert.strictEqual(resUser.status, 200);
  const dataUser = await resUser.json() as any;
  userToken = dataUser.token;
  assert.strictEqual(dataUser.user.role, 'USER');
  g.console.log('✔ User logged in successfully.');

  // Test 2: User management (Admin only)
  g.console.log('\nTest 2: User list and creation (Admin vs Non-admin)');
  
  // List users as admin
  const resList = await fetchMock(`${baseUrl}/api/users`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.strictEqual(resList.status, 200);
  const userList = await resList.json() as any[];
  assert.strictEqual(userList.length, 3);
  g.console.log(`✔ Admin fetched user list successfully. Total users: ${userList.length}`);

  // Create new user (Non-admin should get forbidden)
  const resCreateForbidden = await fetchMock(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      name: '測試員工',
      email: 'test_employee@attendance.com',
      role: 'USER',
      manager_id: managerId,
      annual_hours: 40
    })
  });
  assert.strictEqual(resCreateForbidden.status, 403);
  g.console.log('✔ Non-admin user creation blocked with 403 Forbidden.');

  // Create new user as admin (should succeed and trigger email)
  const mailCountBefore = sentEmails.length;
  const resCreateSuccess = await fetchMock(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name: '測試員工',
      email: 'test_employee@attendance.com',
      role: 'USER',
      manager_id: managerId,
      annual_hours: 40
    })
  });
  assert.strictEqual(resCreateSuccess.status, 201);
  const createdUser = await resCreateSuccess.json() as any;
  assert.strictEqual(createdUser.name, '測試員工');
  assert.strictEqual(sentEmails.length, mailCountBefore + 1);
  assert.ok(sentEmails[sentEmails.length - 1].html.includes('初始密碼'));
  g.console.log('✔ Admin successfully created new user and random password email was sent.');

  // Test 3: Clock In/Out Recording
  g.console.log('\nTest 3: Clock In / Out API');
  
  const resClockIn = await fetchMock(`${baseUrl}/api/clock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      type: 'IN',
      gps_coords: { lat: 25.0330, lng: 121.5654 }
    })
  });
  assert.strictEqual(resClockIn.status, 201);
  const clockInRecord = await resClockIn.json() as any;
  assert.strictEqual(clockInRecord.type, 'IN');
  assert.strictEqual(clockInRecord.user_id, userId);
  g.console.log('✔ Clock-in successfully recorded with GPS coordinates.');

  // Verify clock today
  const resTodayClock = await fetchMock(`${baseUrl}/api/clock/today`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  assert.strictEqual(resTodayClock.status, 200);
  const todayRecords = await resTodayClock.json() as any[];
  assert.ok(todayRecords.some(r => r.type === 'IN'));
  g.console.log('✔ Today\'s clock records verify successfully.');

  // Test 4: Leave Approval Workflow and Balance Deduction
  g.console.log('\nTest 4: Leave Approval Workflow (PENDING_PROXY -> PENDING_APPROVAL -> APPROVED)');
  
  // Check user balance first
  const resBalancePre = await fetchMock(`${baseUrl}/api/leaves/balances`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  const balancePre = await resBalancePre.json() as any;
  assert.strictEqual(parseFloat(balancePre.annual_hours), 80.00);
  g.console.log(`✔ Initial annual leave balance: ${balancePre.annual_hours} hours.`);

  // Submit leave request: User requests 8 hours of annual leave. Proxy is Manager (id=2), Approver is Admin (id=1).
  const start_time = '2026-06-01T09:00:00.000Z';
  const end_time = '2026-06-01T17:00:00.000Z'; // 8 hours
  const resLeaveReq = await fetchMock(`${baseUrl}/api/leaves`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      leave_type: 'ANNUAL',
      start_time,
      end_time,
      reason: '特休一天',
      proxy_id: managerId,
      approver_id: adminId
    })
  });
  assert.strictEqual(resLeaveReq.status, 201);
  const leaveReq = await resLeaveReq.json() as any;
  assert.strictEqual(leaveReq.status, 'PENDING_PROXY');
  g.console.log(`✔ Leave request submitted. Current status: ${leaveReq.status}`);

  // Fetch pending list for Manager (should see this request)
  const resPendingProxy = await fetchMock(`${baseUrl}/api/leaves/pending`, {
    headers: { 'Authorization': `Bearer ${managerToken}` }
  });
  const pendingProxyList = await resPendingProxy.json() as any[];
  const myPendingTask = pendingProxyList.find(r => r.id === leaveReq.id);
  assert.ok(myPendingTask);
  g.console.log('✔ Manager (Proxy) correctly sees the pending request in their task list.');

  // Manager approves (Proxy approval -> status becomes PENDING_APPROVAL)
  const resProxyApprove = await fetchMock(`${baseUrl}/api/leaves/${leaveReq.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${managerToken}`
    },
    body: JSON.stringify({ comment: '代理人已確認同意代班' })
  });
  assert.strictEqual(resProxyApprove.status, 200);
  g.console.log('✔ Manager approved as proxy. Request status should transition to PENDING_APPROVAL.');

  // Fetch pending list for Admin (should see this request now as PENDING_APPROVAL)
  const resPendingAdmin = await fetchMock(`${baseUrl}/api/leaves/pending`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const pendingAdminList = await resPendingAdmin.json() as any[];
  const myPendingApproval = pendingAdminList.find(r => r.id === leaveReq.id);
  assert.ok(myPendingApproval);
  g.console.log('✔ Admin (Approver) correctly sees the request pending manager/admin approval.');

  // Admin approves (Final approval -> status becomes APPROVED, balance deducted)
  const resFinalApprove = await fetchMock(`${baseUrl}/api/leaves/${leaveReq.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ comment: '核准請假' })
  });
  assert.strictEqual(resFinalApprove.status, 200);
  g.console.log('✔ Admin approved. Request status should transition to APPROVED.');

  // Check balance deduction
  const resBalancePost = await fetchMock(`${baseUrl}/api/leaves/balances`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  const balancePost = await resBalancePost.json() as any;
  assert.strictEqual(parseFloat(balancePost.annual_hours), 72.00); // 80 - 8 = 72
  g.console.log(`✔ Annual leave balance after approval: ${balancePost.annual_hours} hours (decreased by 8).`);

  // Test 5: Overtime request and balance increase
  g.console.log('\nTest 5: Overtime Request & Compensatory hours accumulation');
  
  // Submit overtime: User applies for 4 hours overtime. Manager is automatic approver.
  const resOvertimeReq = await fetchMock(`${baseUrl}/api/overtime`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      date: '2026-05-23',
      hours: 4.0,
      reason: '系統上線準備'
    })
  });
  assert.strictEqual(resOvertimeReq.status, 201);
  const overtimeReq = await resOvertimeReq.json() as any;
  assert.strictEqual(overtimeReq.status, 'PENDING_APPROVAL');
  g.console.log(`✔ Overtime request submitted. Status: ${overtimeReq.status}`);

  // Fetch pending overtime for Manager
  const resPendingOT = await fetchMock(`${baseUrl}/api/overtime/pending`, {
    headers: { 'Authorization': `Bearer ${managerToken}` }
  });
  const pendingOTList = await resPendingOT.json() as any[];
  assert.ok(pendingOTList.some(r => r.id === overtimeReq.id));
  g.console.log('✔ Manager correctly sees the pending overtime request.');

  // Manager approves overtime -> Compensatory balance increases
  const resApproveOT = await fetchMock(`${baseUrl}/api/overtime/${overtimeReq.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${managerToken}`
    },
    body: JSON.stringify({ comment: '加班核准' })
  });
  assert.strictEqual(resApproveOT.status, 200);
  g.console.log('✔ Manager approved overtime.');

  // Check compensatory balance
  const resBalancePostOT = await fetchMock(`${baseUrl}/api/leaves/balances`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  const balancePostOT = await resBalancePostOT.json() as any;
  assert.strictEqual(parseFloat(balancePostOT.compensatory_hours), 4.00); // 0 + 4 = 4
  g.console.log(`✔ Compensatory leave balance after approval: ${balancePostOT.compensatory_hours} hours (increased by 4).`);

  g.console.log('\n--- ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
  processMock.exit(0);
}

runTests().catch(err => {
  g.console.error('Test run failed:', err);
  processMock.exit(1);
});
