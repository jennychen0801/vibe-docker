import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Calendar, 
  Users, 
  CheckSquare, 
  LogOut, 
  Plus, 
  Trash2, 
  Edit, 
  Mail, 
  MapPin, 
  Activity,
  UserCheck,
  AlertCircle,
  FileText,
  FileCheck
} from 'lucide-react';

// API Base Url (Use environment variable in production, fallback to '/api' in dev proxy)
const API_URL = import.meta.env.VITE_API_URL || '/api';

interface User {
  id: number;
  email: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'USER';
  manager_id: number | null;
  manager_name?: string;
  annual_hours?: number;
  compensatory_hours?: number;
}

interface ClockRecord {
  id: number;
  type: 'IN' | 'OUT';
  timestamp: string;
  ip: string;
  gps_coords: { lat: number; lng: number } | null;
}

interface LeaveRequest {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  leave_type: 'ANNUAL' | 'COMPENSATORY';
  start_time: string;
  end_time: string;
  reason: string;
  status: 'PENDING_PROXY' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  proxy_user_id: number;
  proxy_name?: string;
  approver_id: number;
  approver_name?: string;
}

interface OvertimeRequest {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  date: string;
  hours: number;
  reason: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  approver_id: number;
  approver_name?: string;
}

function App() {
  // Auth state
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // UI state
  const [currentTab, setCurrentTab] = useState<'punch' | 'leave' | 'overtime' | 'approvals' | 'admin'>('punch');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Business state
  const [balances, setBalances] = useState({ annual_hours: 0, compensatory_hours: 0 });
  const [todayClocks, setTodayClocks] = useState<ClockRecord[]>([]);
  const [clockHistory, setClockHistory] = useState<ClockRecord[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [leaveHistory, setLeaveHistory] = useState<LeaveRequest[]>([]);
  const [overtimeHistory, setOvertimeHistory] = useState<OvertimeRequest[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [pendingOvertimes, setPendingOvertimes] = useState<OvertimeRequest[]>([]);

  // Forms state
  // Leave Form
  const [leaveType, setLeaveType] = useState<'ANNUAL' | 'COMPENSATORY'>('ANNUAL');
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveProxy, setLeaveProxy] = useState('');
  const [leaveApprover, setLeaveApprover] = useState('');

  // Overtime Form
  const [otDate, setOtDate] = useState('');
  const [otHours, setOtHours] = useState('');
  const [otReason, setOtReason] = useState('');

  // Admin user form modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    role: 'USER' as 'ADMIN' | 'MANAGER' | 'USER',
    manager_id: '',
    annual_hours: '80',
    compensatory_hours: '0'
  });

  // Approval comment state
  const [approvalComment, setApprovalComment] = useState<Record<string, string>>({});

  // Show toast utility
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch helper
  const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    };
    const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'API Request failed');
    }
    return data;
  };

  // Fetch initial profile
  useEffect(() => {
    if (token) {
      apiFetch('/auth/me')
        .then(data => {
          setUser(data.user);
        })
        .catch(err => {
          console.error(err);
          handleLogout();
        });
    }
  }, [token]);

  // Load context based on active tab & user authentication
  useEffect(() => {
    if (!user) return;

    if (currentTab === 'punch') {
      fetchPunchData();
    } else if (currentTab === 'leave') {
      fetchLeaveData();
    } else if (currentTab === 'overtime') {
      fetchOvertimeData();
    } else if (currentTab === 'approvals') {
      fetchApprovalData();
    } else if (currentTab === 'admin' && user.role === 'ADMIN') {
      fetchAdminData();
    }
  }, [user, currentTab]);

  const fetchPunchData = async () => {
    try {
      const today = await apiFetch('/clock/today');
      const history = await apiFetch('/clock/history');
      setTodayClocks(today);
      setClockHistory(history);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const fetchLeaveData = async () => {
    try {
      const bal = await apiFetch('/leaves/balances');
      const hist = await apiFetch('/leaves/history');
      const users = await apiFetch('/users');
      setBalances(bal);
      setLeaveHistory(hist);
      setAllUsers(users);
      
      // Auto pre-fill default manager if available
      const currentFullUser = users.find((u: User) => u.id === user.id);
      if (currentFullUser && currentFullUser.manager_id) {
        setLeaveApprover(String(currentFullUser.manager_id));
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const fetchOvertimeData = async () => {
    try {
      const hist = await apiFetch('/overtime/history');
      setOvertimeHistory(hist);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const fetchApprovalData = async () => {
    try {
      const pendingL = await apiFetch('/leaves/pending');
      const pendingO = await apiFetch('/overtime/pending');
      setPendingLeaves(pendingL);
      setPendingOvertimes(pendingO);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const fetchAdminData = async () => {
    try {
      const users = await apiFetch('/users');
      setAllUsers(users);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      localStorage.setItem('token', data.token);
      setToken(data.token);
      setUser(data.user);
      showToast('登入成功！');
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setCurrentTab('punch');
    showToast('已登出系統');
  };

  // Clock In/Out handler
  const handleClock = async (type: 'IN' | 'OUT') => {
    // Attempt GPS capture
    let gps_coords = null;
    
    const sendClockRequest = async (coords: any) => {
      try {
        const record = await apiFetch('/clock', {
          method: 'POST',
          body: JSON.stringify({ type, gps_coords: coords })
        });
        showToast(`${type === 'IN' ? '上班' : '下班'} 打卡成功！`);
        fetchPunchData();
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          gps_coords = {
            lat: Number(position.coords.latitude.toFixed(6)),
            lng: Number(position.coords.longitude.toFixed(6))
          };
          sendClockRequest(gps_coords);
        },
        (error) => {
          console.warn('GPS location access denied or failed, proceeding with IP record only.', error);
          sendClockRequest(null);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      sendClockRequest(null);
    }
  };

  // Submit Leave Request
  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveStart || !leaveEnd || !leaveProxy || !leaveApprover) {
      showToast('請填寫所有必要欄位', 'error');
      return;
    }

    try {
      await apiFetch('/leaves', {
        method: 'POST',
        body: JSON.stringify({
          leave_type: leaveType,
          start_time: leaveStart,
          end_time: leaveEnd,
          reason: leaveReason,
          proxy_id: parseInt(leaveProxy),
          approver_id: parseInt(leaveApprover)
        })
      });
      showToast('請假申請已送出，目前待職務代理人簽核。');
      setLeaveStart('');
      setLeaveEnd('');
      setLeaveReason('');
      setLeaveProxy('');
      fetchLeaveData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Submit Overtime Request
  const handleOvertimeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otDate || !otHours || !otReason) {
      showToast('請填寫所有欄位', 'error');
      return;
    }

    try {
      await apiFetch('/overtime', {
        method: 'POST',
        body: JSON.stringify({
          date: otDate,
          hours: parseFloat(otHours),
          reason: otReason
        })
      });
      showToast('加班申請成功送出，已通知主管審核。');
      setOtDate('');
      setOtHours('');
      setOtReason('');
      fetchOvertimeData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Approve / Reject Leave Action
  const handleLeaveApproval = async (id: number, action: 'approve' | 'reject') => {
    const comment = approvalComment[`leave_${id}`] || '';
    try {
      await apiFetch(`/leaves/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ comment })
      });
      showToast(`假單簽核已 ${action === 'approve' ? '核准' : '退回'}`);
      setApprovalComment(prev => ({ ...prev, [`leave_${id}`]: '' }));
      fetchApprovalData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Approve / Reject Overtime Action
  const handleOvertimeApproval = async (id: number, action: 'approve' | 'reject') => {
    const comment = approvalComment[`ot_${id}`] || '';
    try {
      await apiFetch(`/overtime/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ comment })
      });
      showToast(`加班申請已 ${action === 'approve' ? '核准，已自動轉發補休' : '退回'}`);
      setApprovalComment(prev => ({ ...prev, [`ot_${id}`]: '' }));
      fetchApprovalData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Admin User Actions
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        // Update user
        await apiFetch(`/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: userForm.name,
            email: userForm.email,
            role: userForm.role,
            manager_id: userForm.manager_id ? parseInt(userForm.manager_id) : null,
            annual_hours: parseFloat(userForm.annual_hours),
            compensatory_hours: parseFloat(userForm.compensatory_hours)
          })
        });
        showToast('使用者修改成功');
      } else {
        // Create user
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            name: userForm.name,
            email: userForm.email,
            role: userForm.role,
            manager_id: userForm.manager_id ? parseInt(userForm.manager_id) : null,
            annual_hours: parseFloat(userForm.annual_hours)
          })
        });
        showToast('使用者建立成功，初始密碼郵件已發送！');
      }
      setShowUserModal(false);
      setEditingUser(null);
      fetchAdminData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleEditClick = (u: User) => {
    setEditingUser(u);
    setUserForm({
      name: u.name,
      email: u.email,
      role: u.role,
      manager_id: u.manager_id ? String(u.manager_id) : '',
      annual_hours: String(u.annual_hours || 0),
      compensatory_hours: String(u.compensatory_hours || 0)
    });
    setShowUserModal(true);
  };

  const handleDeleteUser = async (id: number) => {
    if (!window.confirm('確定要刪除此使用者嗎？此動作將會清除其所有關聯打卡與假單資料。')) return;
    try {
      await apiFetch(`/users/${id}`, { method: 'DELETE' });
      showToast('使用者已刪除');
      fetchAdminData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const openAddUserModal = () => {
    setEditingUser(null);
    setUserForm({
      name: '',
      email: '',
      role: 'USER',
      manager_id: '',
      annual_hours: '80',
      compensatory_hours: '0'
    });
    setShowUserModal(true);
  };

  // Helper to render leave status label
  const renderStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      PENDING_PROXY: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', label: '待代理人同意' },
      PENDING_APPROVAL: { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', label: '待主管審核' },
      APPROVED: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', label: '已核准' },
      REJECTED: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', label: '已退回' }
    };
    const style = styles[status] || { bg: 'rgba(255,255,255,0.1)', text: '#fff', label: status };
    return (
      <span style={{ 
        backgroundColor: style.bg, 
        color: style.text, 
        padding: '4px 8px', 
        borderRadius: '6px', 
        fontSize: '0.85rem',
        fontWeight: 500,
        border: `1px solid ${style.text}22`
      }}>
        {style.label}
      </span>
    );
  };

  // Login Screen
  if (!token || !user) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        padding: '1rem'
      }}>
        <div className="glass-card" style={{ 
          width: '100%', 
          maxWidth: '420px', 
          padding: '2.5rem',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Ambient Glows */}
          <div style={{
            position: 'absolute',
            top: '-50px',
            right: '-50px',
            width: '150px',
            height: '150px',
            background: 'var(--accent-primary)',
            filter: 'blur(60px)',
            opacity: 0.4,
            zIndex: 0
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-50px',
            left: '-50px',
            width: '150px',
            height: '150px',
            background: 'var(--accent-secondary)',
            filter: 'blur(60px)',
            opacity: 0.4,
            zIndex: 0
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ 
                width: '60px', 
                height: '60px', 
                borderRadius: '50%', 
                background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
                boxShadow: '0 8px 24px rgba(168, 85, 247, 0.4)'
              }}>
                <Clock size={28} color="white" />
              </div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '1px' }}>出缺勤管理系統</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>E-Attendance Smart Portal</p>
            </div>

            {authError && (
              <div style={{ 
                backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                border: '1px solid var(--accent-red)', 
                color: '#fca5a5',
                padding: '10px 14px', 
                borderRadius: '8px', 
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.9rem'
              }}>
                <AlertCircle size={16} />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>電子信箱 (Email)</label>
                <input 
                  type="email" 
                  className="glass-input" 
                  placeholder="admin@attendance.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>登入密碼 (Password)</label>
                <input 
                  type="password" 
                  className="glass-input" 
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required 
                />
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '1rem', padding: '14px' }}>
                安全登入
              </button>
            </form>
            
            <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              預設帳號密碼請見專案開發文件或 Seed 設定
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Layout
  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          backgroundColor: toast.type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.95rem',
          fontWeight: 600,
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {toast.type === 'success' ? <UserCheck size={20} /> : <AlertCircle size={20} />}
          {toast.message}
        </div>
      )}

      {/* Top Navigation */}
      <header className="glass-card" style={{ 
        margin: '1rem 1rem 0 1rem', 
        padding: '1rem 2rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderRadius: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={24} color="var(--accent-primary)" />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>E-Attendance Portal</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {user.role === 'ADMIN' ? '系統管理員' : user.role === 'MANAGER' ? '部門主管' : '一般員工'}
            </div>
          </div>
          <button 
            onClick={handleLogout}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-secondary)', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '6px'
            }}
            title="登出"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div style={{ display: 'flex', flex: 1, padding: '1rem', gap: '1rem', flexDirection: window.innerWidth < 768 ? 'column' : 'row' }}>
        
        {/* Sidebar Nav */}
        <aside className="glass-card" style={{ 
          width: window.innerWidth < 768 ? '100%' : '240px', 
          padding: '1.5rem 1rem',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div 
            onClick={() => setCurrentTab('punch')}
            className={`sidebar-link ${currentTab === 'punch' ? 'active' : ''}`}
          >
            <Clock size={18} />
            <span>今日打卡</span>
          </div>

          <div 
            onClick={() => setCurrentTab('leave')}
            className={`sidebar-link ${currentTab === 'leave' ? 'active' : ''}`}
          >
            <Calendar size={18} />
            <span>請假申請</span>
          </div>

          <div 
            onClick={() => setCurrentTab('overtime')}
            className={`sidebar-link ${currentTab === 'overtime' ? 'active' : ''}`}
          >
            <Activity size={18} />
            <span>加班申請</span>
          </div>

          <div 
            onClick={() => setCurrentTab('approvals')}
            className={`sidebar-link ${currentTab === 'approvals' ? 'active' : ''}`}
          >
            <CheckSquare size={18} />
            <span>審核任務</span>
          </div>

          {user.role === 'ADMIN' && (
            <div 
              onClick={() => setCurrentTab('admin')}
              className={`sidebar-link ${currentTab === 'admin' ? 'active' : ''}`}
            >
              <Users size={18} />
              <span>管理員後台</span>
            </div>
          )}
        </aside>

        {/* Tab Content Panel */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          
          {/* Tab 1: Today Clock Punch */}
          {currentTab === 'punch' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
              <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                <h3 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', fontWeight: 600 }}>上下班智慧打卡</h3>
                
                {/* Big Punch Circle Button */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  gap: '2.5rem', 
                  margin: '2rem 0' 
                }}>
                  <button 
                    onClick={() => handleClock('IN')}
                    style={{
                      width: '140px',
                      height: '140px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '1.25rem',
                      cursor: 'pointer',
                      boxShadow: '0 8px 30px rgba(16, 185, 129, 0.4)',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 12px 40px rgba(16, 185, 129, 0.6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 8px 30px rgba(16, 185, 129, 0.4)';
                    }}
                  >
                    上班打卡
                  </button>

                  <button 
                    onClick={() => handleClock('OUT')}
                    style={{
                      width: '140px',
                      height: '140px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      border: 'none',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '1.25rem',
                      cursor: 'pointer',
                      boxShadow: '0 8px 30px rgba(239, 68, 68, 0.4)',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 12px 40px rgba(239, 68, 68, 0.6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 8px 30px rgba(239, 68, 68, 0.4)';
                    }}
                  >
                    下班打卡
                  </button>
                </div>

                <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                  系統將會自動抓取您目前的網路 IP 位址與 GPS 地理位置以供稽核。
                </div>
              </div>

              {/* Today's Punch Records */}
              <div className="glass-card" style={{ padding: '1.5rem', flex: 1 }}>
                <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} color="var(--accent-primary)" />
                  今日打卡狀態
                </h4>

                {todayClocks.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-secondary)' }}>
                    本日尚未有打卡記錄。
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {todayClocks.map((rec) => (
                      <div 
                        key={rec.id} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          padding: '12px 20px', 
                          borderRadius: '8px', 
                          background: 'rgba(255,255,255,0.03)',
                          borderLeft: `4px solid ${rec.type === 'IN' ? '#10b981' : '#ef4444'}`
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                          <span style={{ 
                            fontWeight: 700, 
                            color: rec.type === 'IN' ? '#10b981' : '#ef4444' 
                          }}>
                            {rec.type === 'IN' ? '🌅 上班' : '🌇 下班'}
                          </span>
                          <span style={{ fontSize: '1.1rem', fontFamily: 'monospace' }}>
                            {new Date(rec.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Mail size={14} /> IP: {rec.ip}
                          </span>
                          {rec.gps_coords && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <MapPin size={14} /> GPS: {rec.gps_coords.lat}, {rec.gps_coords.lng}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Leave Request */}
          {currentTab === 'leave' && (
            <div style={{ display: 'flex', gap: '1rem', flexDirection: window.innerWidth < 1024 ? 'column' : 'row' }}>
              {/* Balance Card & Request Form */}
              <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Balance display */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="glass-card" style={{ padding: '1.25rem', textAlign: 'center', borderTop: '4px solid var(--accent-blue)' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>可用年假額度</div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-blue)', margin: '4px 0' }}>
                      {balances.annual_hours} <span style={{ fontSize: '1rem' }}>小時</span>
                    </div>
                  </div>
                  <div className="glass-card" style={{ padding: '1.25rem', textAlign: 'center', borderTop: '4px solid var(--accent-primary)' }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>可用補休額度</div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-primary)', margin: '4px 0' }}>
                      {balances.compensatory_hours} <span style={{ fontSize: '1rem' }}>小時</span>
                    </div>
                  </div>
                </div>

                {/* Form */}
                <div className="glass-card" style={{ padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', fontWeight: 600 }}>填寫假單申請</h3>
                  <form onSubmit={handleLeaveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>假別選擇</label>
                        <select 
                          className="glass-input" 
                          value={leaveType}
                          onChange={(e) => setLeaveType(e.target.value as any)}
                        >
                          <option value="ANNUAL">特休/年假</option>
                          <option value="COMPENSATORY">補休</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>職務代理人</label>
                        <select 
                          className="glass-input"
                          value={leaveProxy}
                          onChange={(e) => setLeaveProxy(e.target.value)}
                          required
                        >
                          <option value="">選擇代理同仁...</option>
                          {allUsers
                            .filter(u => u.id !== user.id)
                            .map(u => (
                              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                            ))
                          }
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>開始時間</label>
                        <input 
                          type="datetime-local" 
                          className="glass-input"
                          value={leaveStart}
                          onChange={(e) => setLeaveStart(e.target.value)}
                          required 
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>結束時間</label>
                        <input 
                          type="datetime-local" 
                          className="glass-input"
                          value={leaveEnd}
                          onChange={(e) => setLeaveEnd(e.target.value)}
                          required 
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>審核主管 (自動依直屬或手動調整)</label>
                      <select 
                        className="glass-input"
                        value={leaveApprover}
                        onChange={(e) => setLeaveApprover(e.target.value)}
                        required
                      >
                        <option value="">選擇核准主管...</option>
                        {allUsers
                          .filter(u => ['ADMIN', 'MANAGER'].includes(u.role))
                          .map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.role === 'ADMIN' ? 'Admin' : 'Manager'})</option>
                          ))
                        }
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>請假事由</label>
                      <textarea 
                        className="glass-input" 
                        rows={3} 
                        placeholder="請敘述請假事由..."
                        value={leaveReason}
                        onChange={(e) => setLeaveReason(e.target.value)}
                        style={{ resize: 'none' }}
                        required
                      />
                    </div>

                    {/* Validation helper: calculate leave length */}
                    {leaveStart && leaveEnd && (
                      <div style={{ 
                        fontSize: '0.9rem', 
                        color: calculateHours(leaveStart, leaveEnd) > (leaveType === 'ANNUAL' ? balances.annual_hours : balances.compensatory_hours) ? '#f87171' : 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <AlertCircle size={16} />
                        本次請假預計：{calculateHours(leaveStart, leaveEnd)} 小時 
                        {calculateHours(leaveStart, leaveEnd) > (leaveType === 'ANNUAL' ? balances.annual_hours : balances.compensatory_hours) && " (額度不足！無法送出)"}
                      </div>
                    )}

                    <button 
                      type="submit" 
                      className="btn-primary"
                      disabled={
                        leaveStart && leaveEnd && calculateHours(leaveStart, leaveEnd) > (leaveType === 'ANNUAL' ? balances.annual_hours : balances.compensatory_hours)
                      }
                      style={{ 
                        marginTop: '0.5rem',
                        opacity: (leaveStart && leaveEnd && calculateHours(leaveStart, leaveEnd) > (leaveType === 'ANNUAL' ? balances.annual_hours : balances.compensatory_hours)) ? 0.5 : 1
                      }}
                    >
                      送出請假單
                    </button>
                  </form>
                </div>
              </div>

              {/* History list */}
              <div className="glass-card" style={{ flex: 2, padding: '1.5rem', minHeight: '400px' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="var(--accent-primary)" />
                  請假紀錄歷史
                </h3>

                {leaveHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-secondary)' }}>
                    尚無歷史請假紀錄。
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '550px', overflowY: 'auto', paddingRight: '4px' }}>
                    {leaveHistory.map((req) => (
                      <div 
                        key={req.id} 
                        style={{ 
                          padding: '12px 16px', 
                          borderRadius: '10px', 
                          background: 'rgba(255,255,255,0.02)', 
                          border: '1px solid rgba(255,255,255,0.05)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>
                            {req.leave_type === 'ANNUAL' ? '🏝️ 特休/年假' : '⏰ 補休'}
                          </span>
                          {renderStatusBadge(req.status)}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          時間：{new Date(req.start_time).toLocaleString()} ~ {new Date(req.end_time).toLocaleString()}
                          <br />
                          時數：{calculateHours(req.start_time, req.end_time)} 小時
                          <br />
                          代理人：{req.proxy_name || req.proxy_user_id}
                          <br />
                          審核主管：{req.approver_name || req.approver_id}
                          {req.reason && <><br />事由：{req.reason}</>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Overtime Request */}
          {currentTab === 'overtime' && (
            <div style={{ display: 'flex', gap: '1rem', flexDirection: window.innerWidth < 1024 ? 'column' : 'row' }}>
              
              {/* Form */}
              <div className="glass-card" style={{ flex: 3, padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', fontWeight: 600 }}>填寫加班單申請</h3>
                <form onSubmit={handleOvertimeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>加班日期</label>
                      <input 
                        type="date" 
                        className="glass-input"
                        value={otDate}
                        onChange={(e) => setOtDate(e.target.value)}
                        required 
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>加班時數 (小時)</label>
                      <input 
                        type="number" 
                        step="0.5"
                        min="0.5"
                        className="glass-input"
                        placeholder="2.5"
                        value={otHours}
                        onChange={(e) => setOtHours(e.target.value)}
                        required 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>加班事由</label>
                    <textarea 
                      className="glass-input" 
                      rows={4} 
                      placeholder="請描述加班工作事項..."
                      value={otReason}
                      onChange={(e) => setOtReason(e.target.value)}
                      style={{ resize: 'none' }}
                      required
                    />
                  </div>

                  <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }}>
                    送出加班單
                  </button>
                </form>
              </div>

              {/* History list */}
              <div className="glass-card" style={{ flex: 2, padding: '1.5rem', minHeight: '400px' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="var(--accent-primary)" />
                  加班紀錄歷史
                </h3>

                {overtimeHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-secondary)' }}>
                    尚無歷史加班紀錄。
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '550px', overflowY: 'auto', paddingRight: '4px' }}>
                    {overtimeHistory.map((req) => (
                      <div 
                        key={req.id} 
                        style={{ 
                          padding: '12px 16px', 
                          borderRadius: '10px', 
                          background: 'rgba(255,255,255,0.02)', 
                          border: '1px solid rgba(255,255,255,0.05)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>
                            🛠️ 加加班申請
                          </span>
                          {renderStatusBadge(req.status)}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          加班日期：{req.date}
                          <br />
                          申報時數：{req.hours} 小時
                          <br />
                          核准主管：{req.approver_name || req.approver_id}
                          {req.reason && <><br />事由：{req.reason}</>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: Approval Inbox */}
          {currentTab === 'approvals' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Leave Requests Box */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCheck size={18} color="var(--accent-primary)" />
                  待簽核假單 ({pendingLeaves.length})
                </h3>

                {pendingLeaves.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
                    目前沒有等待您簽核的請假申請。
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 1024 ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                    {pendingLeaves.map((lr) => (
                      <div 
                        key={lr.id} 
                        style={{ 
                          padding: '1.25rem', 
                          borderRadius: '12px', 
                          background: 'rgba(255,255,255,0.02)', 
                          border: '1px solid rgba(255,255,255,0.06)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>{lr.user_name} 的假單 ({lr.leave_type === 'ANNUAL' ? '年假' : '補休'})</span>
                          <span style={{ 
                            fontSize: '0.8rem', 
                            color: lr.status === 'PENDING_PROXY' ? '#3b82f6' : '#a855f7',
                            fontWeight: 600 
                          }}>
                            {lr.status === 'PENDING_PROXY' ? '[您為職務代理人]' : '[您為主管審核人]'}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          時間：{new Date(lr.start_time).toLocaleString()} ~ {new Date(lr.end_time).toLocaleString()}
                          <br />
                          總時數：{calculateHours(lr.start_time, lr.end_time)} 小時
                          <br />
                          請假原因：{lr.reason}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                          <input 
                            type="text" 
                            className="glass-input" 
                            placeholder="簽核評語 (選填)..."
                            value={approvalComment[`leave_${lr.id}`] || ''}
                            onChange={(e) => setApprovalComment({
                              ...approvalComment,
                              [`leave_${lr.id}`]: e.target.value
                            })}
                          />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              onClick={() => handleLeaveApproval(lr.id, 'approve')}
                              className="btn-primary" 
                              style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem' }}
                            >
                              核准同意
                            </button>
                            <button 
                              onClick={() => handleLeaveApproval(lr.id, 'reject')}
                              className="btn-secondary" 
                              style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                            >
                              退回申請
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Overtime Requests Box */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileCheck size={18} color="var(--accent-primary)" />
                  待簽核加班申請 ({pendingOvertimes.length})
                </h3>

                {pendingOvertimes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
                    目前沒有等待您簽核的加班申請。
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 1024 ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                    {pendingOvertimes.map((ot) => (
                      <div 
                        key={ot.id} 
                        style={{ 
                          padding: '1.25rem', 
                          borderRadius: '12px', 
                          background: 'rgba(255,255,255,0.02)', 
                          border: '1px solid rgba(255,255,255,0.06)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>{ot.user_name} 的加班申請</span>
                          <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>[補休增量申請]</span>
                        </div>

                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          加班日期：{ot.date}
                          <br />
                          申報時數：{ot.hours} 小時
                          <br />
                          工作說明：{ot.reason}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                          <input 
                            type="text" 
                            className="glass-input" 
                            placeholder="簽核評語 (選填)..."
                            value={approvalComment[`ot_${ot.id}`] || ''}
                            onChange={(e) => setApprovalComment({
                              ...approvalComment,
                              [`ot_${ot.id}`]: e.target.value
                            })}
                          />
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              onClick={() => handleOvertimeApproval(ot.id, 'approve')}
                              className="btn-primary" 
                              style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem' }}
                            >
                              核准同意
                            </button>
                            <button 
                              onClick={() => handleOvertimeApproval(ot.id, 'reject')}
                              className="btn-secondary" 
                              style={{ flex: 1, padding: '8px 12px', fontSize: '0.9rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                            >
                              退回申請
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 5: Admin Panel (Admin Only) */}
          {currentTab === 'admin' && user.role === 'ADMIN' && (
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>公司同仁使用者管理</h3>
                <button onClick={openAddUserModal} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '0.9rem' }}>
                  <Plus size={16} />
                  建立同仁帳號
                </button>
              </div>

              {/* Users Table List */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      <th style={{ padding: '12px 8px' }}>姓名</th>
                      <th style={{ padding: '12px 8px' }}>Email</th>
                      <th style={{ padding: '12px 8px' }}>角色權限</th>
                      <th style={{ padding: '12px 8px' }}>直屬主管</th>
                      <th style={{ padding: '12px 8px' }}>年假額度 (小時)</th>
                      <th style={{ padding: '12px 8px' }}>補休額度 (小時)</th>
                      <th style={{ padding: '12px 8px', textAlign: 'center' }}>操作編輯</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map((u) => (
                      <tr 
                        key={u.id} 
                        style={{ 
                          borderBottom: '1px solid rgba(255,255,255,0.05)', 
                          fontSize: '0.95rem',
                          background: u.id === user.id ? 'rgba(255,255,255,0.02)' : 'none'
                        }}
                      >
                        <td style={{ padding: '14px 8px', fontWeight: 600 }}>{u.name} {u.id === user.id && "(您)"}</td>
                        <td style={{ padding: '14px 8px', color: 'var(--text-secondary)' }}>{u.email}</td>
                        <td style={{ padding: '14px 8px' }}>
                          <span style={{ 
                            fontSize: '0.8rem', 
                            padding: '3px 8px', 
                            borderRadius: '4px',
                            background: u.role === 'ADMIN' ? 'rgba(239, 68, 68, 0.15)' : u.role === 'MANAGER' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255,255,255,0.08)',
                            color: u.role === 'ADMIN' ? '#f87171' : u.role === 'MANAGER' ? '#c084fc' : 'var(--text-primary)'
                          }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '14px 8px', color: 'var(--text-secondary)' }}>
                          {u.manager_name || (u.manager_id ? `ID: ${u.manager_id}` : '無')}
                        </td>
                        <td style={{ padding: '14px 8px', fontWeight: 500 }}>{u.annual_hours || 0}</td>
                        <td style={{ padding: '14px 8px', fontWeight: 500 }}>{u.compensatory_hours || 0}</td>
                        <td style={{ padding: '14px 8px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button 
                            onClick={() => handleEditClick(u)}
                            className="btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Edit size={14} />
                            編輯
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(u.id)}
                            className="btn-secondary" 
                            disabled={u.id === user.id}
                            style={{ 
                              padding: '6px 12px', 
                              fontSize: '0.85rem', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '4px',
                              backgroundColor: 'rgba(239,68,68,0.1)',
                              color: '#ef4444',
                              border: '1px solid rgba(239,68,68,0.15)',
                              opacity: u.id === user.id ? 0.4 : 1
                            }}
                          >
                            <Trash2 size={14} />
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* User Modal Backdrop */}
              {showUserModal && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  zIndex: 9999,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(4px)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '1rem'
                }}>
                  <div className="glass-card" style={{
                    width: '100%',
                    maxWidth: '500px',
                    padding: '2rem',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                  }}>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', fontWeight: 600 }}>
                      {editingUser ? `編輯同仁：${editingUser.name}` : '建立新同仁帳號'}
                    </h3>

                    <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>姓名</label>
                        <input 
                          type="text" 
                          className="glass-input"
                          value={userForm.name}
                          onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                          required 
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Email</label>
                        <input 
                          type="email" 
                          className="glass-input"
                          value={userForm.email}
                          onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                          required 
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>角色權限</label>
                          <select 
                            className="glass-input"
                            value={userForm.role}
                            onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any })}
                          >
                            <option value="USER">一般員工 (USER)</option>
                            <option value="MANAGER">部門主管 (MANAGER)</option>
                            <option value="ADMIN">系統管理員 (ADMIN)</option>
                          </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>直屬主管</label>
                          <select 
                            className="glass-input"
                            value={userForm.manager_id}
                            onChange={(e) => setUserForm({ ...userForm, manager_id: e.target.value })}
                          >
                            <option value="">無主管</option>
                            {allUsers
                              .filter(u => ['ADMIN', 'MANAGER'].includes(u.role) && (editingUser ? u.id !== editingUser.id : true))
                              .map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))
                            }
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>年假特休 (小時)</label>
                          <input 
                            type="number" 
                            className="glass-input"
                            value={userForm.annual_hours}
                            onChange={(e) => setUserForm({ ...userForm, annual_hours: e.target.value })}
                            required 
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>補休額度 (小時)</label>
                          <input 
                            type="number" 
                            className="glass-input"
                            disabled={!editingUser} // Only editable on edit user
                            value={userForm.compensatory_hours}
                            onChange={(e) => setUserForm({ ...userForm, compensatory_hours: e.target.value })}
                            required 
                          />
                        </div>
                      </div>

                      {!editingUser && (
                        <div style={{ 
                          fontSize: '0.8rem', 
                          color: 'var(--accent-secondary)', 
                          backgroundColor: 'rgba(236,72,153,0.1)', 
                          padding: '10px', 
                          borderRadius: '6px', 
                          border: '1px solid rgba(236,72,153,0.15)',
                          display: 'flex',
                          gap: '6px',
                          alignItems: 'center'
                        }}>
                          <AlertCircle size={16} />
                          建立後，系統會隨機產生初始密碼，並發送 E-mail 密碼信給該同仁。
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                        <button type="submit" className="btn-primary" style={{ flex: 1 }}>儲存設定</button>
                        <button type="button" onClick={() => setShowUserModal(false)} className="btn-secondary" style={{ flex: 1 }}>取消</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
