import assert from 'assert';

const g = global as any;
const fetchMock = g.fetch;

const PORT = 5000;
const baseUrl = `http://127.0.0.1:${PORT}`;
const maildevUrl = `http://127.0.0.1:1080`;

// Helper to wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runLiveTests() {
  console.log('\n--- STARTING LIVE DOCKER INTEGRATION TESTS ---');
  
  let adminToken = '';
  let managerToken = '';
  let userToken = '';
  
  let adminId = 1;
  let managerId = 2;
  let userId = 3;

  // Test 1: Verify seed users can login
  console.log('Test 1: Verify seed users can login on live server');
  
  // Login as admin
  const resAdmin = await fetchMock(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@attendance.com', password: 'admin123' })
  });
  assert.strictEqual(resAdmin.status, 200, 'Admin login failed');
  const dataAdmin = await resAdmin.json();
  adminToken = dataAdmin.token;
  adminId = dataAdmin.user.id;
  assert.strictEqual(dataAdmin.user.role, 'ADMIN');
  console.log('✔ Admin logged in successfully.');

  // Login as manager
  const resManager = await fetchMock(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@attendance.com', password: 'manager123' })
  });
  assert.strictEqual(resManager.status, 200, 'Manager login failed');
  const dataManager = await resManager.json();
  managerToken = dataManager.token;
  managerId = dataManager.user.id;
  assert.strictEqual(dataManager.user.role, 'MANAGER');
  console.log('✔ Manager logged in successfully.');

  // Login as regular user
  const resUser = await fetchMock(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@attendance.com', password: 'user123' })
  });
  assert.strictEqual(resUser.status, 200, 'Regular user login failed');
  const dataUser = await resUser.json();
  userToken = dataUser.token;
  userId = dataUser.user.id;
  assert.strictEqual(dataUser.user.role, 'USER');
  console.log('✔ Regular user logged in successfully.');

  // Test 2: User management & Maildev integration (Admin creates a new user, reads password from Maildev)
  console.log('\nTest 2: User creation & Maildev password extraction');
  
  const testEmail = `test_employee_${Date.now()}@attendance.com`;
  
  // Clear Maildev inbox first
  try {
    await fetchMock(`${maildevUrl}/email`, { method: 'DELETE' });
    console.log('✔ Cleared Maildev inbox.');
  } catch (err) {
    console.warn('⚠ Failed to clear Maildev inbox. Continuing anyway.');
  }

  // Create new user as admin
  const resCreate = await fetchMock(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name: '全新測試員工',
      email: testEmail,
      role: 'USER',
      manager_id: managerId,
      annual_hours: 40
    })
  });
  assert.strictEqual(resCreate.status, 201, 'Failed to create user');
  const createdUser = await resCreate.json();
  console.log(`✔ User created: ${createdUser.name} (${createdUser.email})`);

  // Wait a short moment for Maildev to receive SMTP email
  await sleep(1500);

  // Read email from Maildev
  const resMails = await fetchMock(`${maildevUrl}/email`);
  assert.strictEqual(resMails.status, 200, 'Failed to connect to Maildev REST API');
  const mails = await resMails.json() as any[];
  
  // Find email for this user
  const userMail = mails.find(m => m.to && m.to[0] && m.to[0].address === testEmail);
  assert.ok(userMail, 'Email not found in Maildev inbox');
  
  // Extract password from HTML content
  const htmlContent = userMail.html;
  const match = htmlContent.match(/初始密碼：<strong>(.*?)<\/strong>/);
  assert.ok(match, 'Password pattern not found in email HTML');
  const tempPassword = match[1];
  console.log(`✔ Successfully extracted password from Maildev: "${tempPassword}"`);

  // Test logging in with extracted password
  const resTempLogin = await fetchMock(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: tempPassword })
  });
  assert.strictEqual(resTempLogin.status, 200, 'Login failed with temp password');
  const tempLoginData = await resTempLogin.json();
  const newEmpToken = tempLoginData.token;
  const newEmpId = tempLoginData.user.id;
  console.log('✔ Logged in successfully with temporary password.');

  // Test 3: Clock In/Out Recording
  console.log('\nTest 3: Clock In / Out API (Live)');
  
  const resClockIn = await fetchMock(`${baseUrl}/api/clock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${newEmpToken}`
    },
    body: JSON.stringify({
      type: 'IN',
      gps_coords: { lat: 25.0330, lng: 121.5654 }
    })
  });
  assert.strictEqual(resClockIn.status, 201);
  const clockInRecord = await resClockIn.json();
  assert.strictEqual(clockInRecord.type, 'IN');
  assert.strictEqual(clockInRecord.user_id, newEmpId);
  console.log('✔ Clock-in successfully recorded with live IP and GPS coordinates.');

  // Verify clock today
  const resTodayClock = await fetchMock(`${baseUrl}/api/clock/today`, {
    headers: { 'Authorization': `Bearer ${newEmpToken}` }
  });
  assert.strictEqual(resTodayClock.status, 200);
  const todayRecords = await resTodayClock.json() as any[];
  assert.ok(todayRecords.some(r => r.type === 'IN'));
  console.log('✔ Today\'s clock records verify successfully on live DB.');

  // Test 4: Leave Approval Workflow and Balance Deduction
  console.log('\nTest 4: Leave Approval Workflow (Live)');
  
  // Check user balance first
  const resBalancePre = await fetchMock(`${baseUrl}/api/leaves/balances`, {
    headers: { 'Authorization': `Bearer ${newEmpToken}` }
  });
  const balancePre = await resBalancePre.json();
  assert.strictEqual(parseFloat(balancePre.annual_hours), 40.00);
  console.log(`✔ Initial annual leave balance for new employee: ${balancePre.annual_hours} hours.`);

  // Submit leave request: User requests 8 hours. Proxy is Manager, Approver is Admin.
  const start_time = '2026-06-01T09:00:00.000Z';
  const end_time = '2026-06-01T17:00:00.000Z'; // 8 hours
  const resLeaveReq = await fetchMock(`${baseUrl}/api/leaves`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${newEmpToken}`
    },
    body: JSON.stringify({
      leave_type: 'ANNUAL',
      start_time,
      end_time,
      reason: '請假特休',
      proxy_id: managerId,
      approver_id: adminId
    })
  });
  assert.strictEqual(resLeaveReq.status, 201);
  const leaveReq = await resLeaveReq.json();
  assert.strictEqual(leaveReq.status, 'PENDING_PROXY');
  console.log(`✔ Leave request submitted. Status: ${leaveReq.status}`);

  // Fetch pending list for Manager
  const resPendingProxy = await fetchMock(`${baseUrl}/api/leaves/pending`, {
    headers: { 'Authorization': `Bearer ${managerToken}` }
  });
  const pendingProxyList = await resPendingProxy.json() as any[];
  const myPendingTask = pendingProxyList.find(r => r.id === leaveReq.id);
  assert.ok(myPendingTask, 'Manager failed to see the proxy request');
  console.log('✔ Manager (Proxy) correctly sees the pending request.');

  // Manager approves (Proxy approval -> PENDING_APPROVAL)
  const resProxyApprove = await fetchMock(`${baseUrl}/api/leaves/${leaveReq.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${managerToken}`
    },
    body: JSON.stringify({ comment: '代理人已同意' })
  });
  assert.strictEqual(resProxyApprove.status, 200);
  console.log('✔ Manager approved as proxy.');

  // Fetch pending list for Admin (should see it as PENDING_APPROVAL now)
  const resPendingAdmin = await fetchMock(`${baseUrl}/api/leaves/pending`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const pendingAdminList = await resPendingAdmin.json() as any[];
  const myPendingApproval = pendingAdminList.find(r => r.id === leaveReq.id);
  assert.ok(myPendingApproval, 'Admin failed to see approval request');
  console.log('✔ Admin (Approver) correctly sees the pending approval.');

  // Admin approves (Final approval -> APPROVED, balance deducted)
  const resFinalApprove = await fetchMock(`${baseUrl}/api/leaves/${leaveReq.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ comment: '核准' })
  });
  assert.strictEqual(resFinalApprove.status, 200);
  console.log('✔ Admin approved the leave.');

  // Check balance deduction
  const resBalancePost = await fetchMock(`${baseUrl}/api/leaves/balances`, {
    headers: { 'Authorization': `Bearer ${newEmpToken}` }
  });
  const balancePost = await resBalancePost.json();
  assert.strictEqual(parseFloat(balancePost.annual_hours), 32.00); // 40 - 8 = 32
  console.log(`✔ Balance after approval: ${balancePost.annual_hours} hours (decreased by 8).`);

  // Test 5: Overtime request and balance increase
  console.log('\nTest 5: Overtime Request & Compensatory hours (Live)');
  
  // Submit overtime: User applies for 4.5 hours overtime. Manager is approver.
  const resOvertimeReq = await fetchMock(`${baseUrl}/api/overtime`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${newEmpToken}`
    },
    body: JSON.stringify({
      date: '2026-05-23',
      hours: 4.5,
      reason: '加班修復 Docker 環境'
    })
  });
  assert.strictEqual(resOvertimeReq.status, 201);
  const overtimeReq = await resOvertimeReq.json();
  assert.strictEqual(overtimeReq.status, 'PENDING_APPROVAL');
  console.log(`✔ Overtime request submitted. Status: ${overtimeReq.status}`);

  // Fetch pending overtime for Manager
  const resPendingOT = await fetchMock(`${baseUrl}/api/overtime/pending`, {
    headers: { 'Authorization': `Bearer ${managerToken}` }
  });
  const pendingOTList = await resPendingOT.json() as any[];
  assert.ok(pendingOTList.some(r => r.id === overtimeReq.id), 'Manager failed to see overtime request');
  console.log('✔ Manager correctly sees the pending overtime.');

  // Manager approves overtime -> Compensatory balance increases
  const resApproveOT = await fetchMock(`${baseUrl}/api/overtime/${overtimeReq.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${managerToken}`
    },
    body: JSON.stringify({ comment: '加班辛苦了，核准' })
  });
  assert.strictEqual(resApproveOT.status, 200);
  console.log('✔ Manager approved overtime.');

  // Check compensatory balance
  const resBalancePostOT = await fetchMock(`${baseUrl}/api/leaves/balances`, {
    headers: { 'Authorization': `Bearer ${newEmpToken}` }
  });
  const balancePostOT = await resBalancePostOT.json();
  assert.strictEqual(parseFloat(balancePostOT.compensatory_hours), 4.50); // 0 + 4.5 = 4.5
  console.log(`✔ Compensatory leave balance after approval: ${balancePostOT.compensatory_hours} hours (increased by 4.5).`);

  console.log('\n--- ALL LIVE INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
}

runLiveTests().catch(err => {
  console.error('Live integration test run failed:', err);
  process.exit(1);
});
