// Requires npm install and an available MongoDB binary download on the first run.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { NextRequest } from 'next/server.js';
import { Organization, User, Employee, Attendance, Advance, Expense, Settlement, LoginAttempt, SalaryPayment, WorkSession } from '../../models/index.js';
import { signToken, COOKIE_NAME } from '../../lib/token.js';
import { middleware } from '../../middleware.js';
import * as login from '../../app/api/auth/login/route.js';
import * as attendance from '../../app/api/attendance/route.js';
import * as advances from '../../app/api/advances/route.js';
import * as salary from '../../app/api/salary/route.js';
import * as expenses from '../../app/api/expenses/route.js';
import * as employees from '../../app/api/employees/route.js';
import * as users from '../../app/api/users/route.js';
import * as userLogin from '../../app/api/users/[id]/login/route.js';
import * as balances from '../../app/api/balances/route.js';
import * as settlements from '../../app/api/settlements/route.js';
import * as salaryPayments from '../../app/api/salary-payments/route.js';
import * as salarySlip from '../../app/api/salary-slip/route.js';
import * as settings from '../../app/api/organization/settings/route.js';
import * as workCheckIn from '../../app/api/work/check-in/route.js';
import * as workCheckOut from '../../app/api/work/check-out/route.js';
import * as workMe from '../../app/api/work/me/route.js';
import * as workLive from '../../app/api/work/live/route.js';
import * as workReport from '../../app/api/work/report/route.js';
import * as workSession from '../../app/api/work/sessions/[id]/route.js';
import { migratePayrollDefaults } from '../../scripts/migrate-payroll.js';
import { date, monthRange } from '../../lib/validation.js';
import { istDate, istMonth } from '../../lib/work-hours.js';

let mongo, orgA, orgB, admin, partner, employeeUser, employeeA, employeeB, adminB;
const tokens = {};
before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri(); process.env.JWT_SECRET = 'test-only-secret-at-least-32-bytes-long';
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([Organization, User, Employee, Attendance, Advance, Expense, Settlement, LoginAttempt, SalaryPayment, WorkSession].map(m => m.init()));
  [orgA, orgB] = await Organization.create([{ name: 'A' }, { name: 'B' }]);
  [employeeA, employeeB] = await Employee.create([{ organizationId: orgA._id, name: 'Employee A', phone: '', monthlySalary: 30000, perDayRate: 1000, joiningDate: '2026-01-01' }, { organizationId: orgB._id, name: 'Employee B', phone: '', monthlySalary: 60000, perDayRate: 2000, joiningDate: '2026-01-01' }]);
  const passwordHash = await bcrypt.hash('testing-password-123', 4);
  [admin, partner, employeeUser, adminB] = await User.create([
    { organizationId: orgA._id, name: 'Admin A', login: 'admin-a@example.com', passwordHash, role: 'admin' },
    { organizationId: orgA._id, name: 'Partner A', login: 'partner-a@example.com', passwordHash, role: 'partner' },
    { organizationId: orgA._id, name: 'Employee A', login: 'employee-a@example.com', passwordHash, role: 'employee', employeeId: employeeA._id },
    { organizationId: orgB._id, name: 'Admin B', login: 'admin-b@example.com', passwordHash, role: 'admin' }
  ]);
  for (const u of [admin, partner, employeeUser, adminB]) tokens[String(u._id)] = await signToken(u);
  await Attendance.create([{ organizationId: orgA._id, employeeId: employeeA._id, date: '2026-10-01', status: 'present' }, { organizationId: orgA._id, employeeId: employeeA._id, date: '2026-10-02', status: 'half' }, { organizationId: orgB._id, employeeId: employeeB._id, date: '2026-10-01', status: 'present' }]);
  await Advance.create([{ organizationId: orgA._id, employeeId: employeeA._id, date: '2026-10-03', amount: 200 }, { organizationId: orgA._id, employeeId: employeeA._id, date: '2026-09-03', amount: 999 }, { organizationId: orgB._id, employeeId: employeeB._id, date: '2026-10-03', amount: 1000 }]);
  await Expense.create({ organizationId: orgB._id, amount: 999, paidBy: adminB._id, category: 'Other', date: '2026-10-01', splitType: 'equal', splits: [{ userId: adminB._id, share: 999 }] });
});
after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
function request(path, user, method = 'GET', data, origin = 'http://localhost:3000') {
  return new NextRequest(`http://localhost:3000${path}`, { method, headers: { origin, 'Content-Type': 'application/json', ...(user ? { cookie: `${COOKIE_NAME}=${tokens[String(user._id)]}` } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
}
test('login requires correct tenant and sets an httpOnly SameSite cookie', async () => {
  const wrong = await login.POST(request('/api/auth/login', null, 'POST', { organizationId: String(orgB._id), login: admin.login, password: 'testing-password-123' }));
  assert.equal(wrong.status, 401);
  const success = await login.POST(request('/api/auth/login', null, 'POST', { organizationId: String(orgA._id), login: admin.login, password: 'testing-password-123' }));
  assert.equal(success.status, 200); assert.match(success.headers.get('set-cookie'), /HttpOnly/i); assert.match(success.headers.get('set-cookie'), /SameSite=lax/i);
});
test('unauthenticated route requests and middleware are rejected', async () => {
  assert.equal((await expenses.GET(request('/api/expenses?month=2026-10'))).status, 401);
  assert.equal((await middleware(request('/api/expenses?month=2026-10'))).status, 401);
  assert.equal((await workCheckIn.POST(request('/api/work/check-in', null, 'POST', {}))).status, 401);
  assert.equal((await middleware(request('/api/work/check-in', null, 'POST', {}))).status, 401);
});
test('employee is denied expenses both in route and middleware, including crafted POST', async () => {
  for (const [module, path] of [[expenses, '/api/expenses'], [balances, '/api/balances'], [settlements, '/api/settlements'], [users, '/api/users']]) {
    assert.equal((await module.GET(request(`${path}?month=2026-10`, employeeUser))).status, 403);
    assert.equal((await middleware(request(path, employeeUser))).status, 403);
  }
  assert.equal((await expenses.POST(request('/api/expenses', employeeUser, 'POST', {}))).status, 403);
});
test('employee salary and advances are own-only and month-scoped', async () => {
  const response = await salary.GET(request('/api/salary?month=2026-10', employeeUser)), data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.rows.length, 1); assert.equal(data.rows[0].employeeId, String(employeeA._id)); assert.equal(data.rows[0].netSalary, 5300); assert.equal(data.advances.length, 1);
  for (const [module, path] of [[salary, '/api/salary'], [attendance, '/api/attendance'], [advances, '/api/advances']]) assert.equal((await module.GET(request(`${path}?month=2026-10&employeeId=${employeeB._id}`, employeeUser))).status, 403);
});
test('partner cannot access attendance, salary, advances, or create users', async () => {
  assert.equal((await salary.GET(request('/api/salary?month=2026-10', partner))).status, 403);
  assert.equal((await attendance.PUT(request('/api/attendance', partner, 'PUT', {}))).status, 403);
  assert.equal((await advances.POST(request('/api/advances', partner, 'POST', {}))).status, 403);
  assert.equal((await users.POST(request('/api/users', partner, 'POST', {}))).status, 403);
});
test('admin cannot read or modify employees across organizations', async () => {
  const response = await employees.GET(request('/api/employees', admin)); const data = await response.json();
  assert.equal(data.employees.length, 1); assert.equal(data.employees[0]._id, String(employeeA._id));
  assert.equal((await employees.PATCH(request('/api/employees', admin, 'PATCH', { employeeId: String(employeeB._id), name: 'Intruder' }))).status, 404);
  assert.equal((await attendance.PUT(request('/api/attendance', admin, 'PUT', { date: '2026-10-05', records: [{ employeeId: String(employeeB._id), status: 'present' }] }))).status, 400);
});
test('attendance upsert is unique and rejects duplicate records in one request', async () => {
  const input = { date: '2026-10-10', records: [{ employeeId: String(employeeA._id), status: 'present' }] };
  assert.equal((await attendance.PUT(request('/api/attendance', admin, 'PUT', input))).status, 200);
  input.records[0].status = 'leave';
  assert.equal((await attendance.PUT(request('/api/attendance', admin, 'PUT', input))).status, 200);
  assert.equal(await Attendance.countDocuments({ organizationId: orgA._id, employeeId: employeeA._id, date: input.date }), 1);
  input.records.push(input.records[0]); assert.equal((await attendance.PUT(request('/api/attendance', admin, 'PUT', input))).status, 400);
});
test('expense validates tenant participants and shares and separates tenant reads', async () => {
  const base = { amount: 100, paidBy: String(admin._id), category: 'Meals', date: '2026-10-05', splitType: 'custom', splits: [{ userId: String(admin._id), share: 50 }, { userId: String(partner._id), share: 50 }] };
  assert.equal((await expenses.POST(request('/api/expenses', partner, 'POST', { ...base, paidBy: String(adminB._id) }))).status, 400);
  assert.equal((await expenses.POST(request('/api/expenses', partner, 'POST', { ...base, amount: 99 }))).status, 400);
  assert.equal((await expenses.POST(request('/api/expenses', partner, 'POST', base))).status, 201);
  const response = await expenses.GET(request('/api/expenses?month=2026-10', partner)); const data = await response.json();
  assert.equal(data.expenses.length, 1); assert.equal(data.expenses[0].amount, 100);
});
test('settlement adjusts balances, is idempotent, and partners cannot record another payer', async () => {
  const input = { fromUserId: String(partner._id), toUserId: String(admin._id), amount: 50, date: '2026-10-06', requestId: crypto.randomUUID() };
  assert.equal((await settlements.POST(request('/api/settlements', partner, 'POST', { ...input, fromUserId: String(admin._id), toUserId: String(partner._id) }))).status, 403);
  assert.equal((await settlements.POST(request('/api/settlements', partner, 'POST', input))).status, 201);
  assert.equal((await settlements.POST(request('/api/settlements', partner, 'POST', input))).status, 200);
  const data = await (await balances.GET(request('/api/balances', partner))).json();
  assert.ok(data.balances.every(b => b.balance === 0)); assert.equal(data.settlements.length, 1);
});
test('mutation rejects cross-origin and missing-origin requests', async () => {
  assert.equal((await employees.POST(request('/api/employees', admin, 'POST', {}, 'https://evil.example'))).status, 403);
  const req = request('/api/employees', admin, 'POST', {}); req.headers.delete('origin');
  assert.equal((await employees.POST(req)).status, 403);
});
test('invalid dates and month boundaries are validated', () => {
  assert.equal(date.safeParse('2026-02-30').success, false); assert.equal(date.safeParse('2024-02-29').success, true);
  assert.deepEqual(monthRange('2026-12'), { $gte: '2026-12-01', $lt: '2027-01-01' });
});
test('salary slips reject partners, other employees, cross-tenant admins and uncredited months', async () => {
  const path = `/api/salary-slip?month=2026-10&employeeId=${employeeA._id}`;
  assert.equal((await salarySlip.GET(request(path, partner))).status, 403);
  assert.equal((await middleware(request(path, partner))).status, 403);
  assert.equal((await salarySlip.GET(request(path, admin))).status, 404);
  assert.equal((await salarySlip.GET(request(path, employeeUser))).status, 404);
  assert.equal((await salarySlip.GET(request(`/api/salary-slip?month=2026-10&employeeId=${employeeB._id}`, employeeUser))).status, 403);
  assert.equal((await salarySlip.GET(request(path, adminB))).status, 404);
  for (const u of [partner, employeeUser]) assert.equal((await salaryPayments.POST(request('/api/salary-payments', u, 'POST', { employeeId: String(employeeA._id), month: '2026-10', action: 'credit' }))).status, 403);
});
test('rebate is saved and cleared when changing to a non-rebatable status', async () => {
  const input = { date: '2026-10-07', records: [{ employeeId: String(employeeA._id), status: 'leave', rebate: true, rebateNote: 'Approved paid leave' }] };
  assert.equal((await attendance.PUT(request('/api/attendance', admin, 'PUT', input))).status, 200);
  let data = await (await salary.GET(request('/api/salary?month=2026-10', employeeUser))).json();
  assert.equal(data.rows[0].rebateDays, 1); assert.equal(data.rows[0].rebateAmount, 1000);
  input.records[0] = { employeeId: String(employeeA._id), status: 'present' };
  assert.equal((await attendance.PUT(request('/api/attendance', admin, 'PUT', input))).status, 200);
  data = await (await attendance.GET(request('/api/attendance?date=2026-10-07', employeeUser))).json();
  assert.equal(data.attendance[0].rebate, false); assert.equal(data.attendance[0].rebateNote, '');
});
test('credit freezes the complete slip and concurrent credit attempts never overwrite it', async () => {
  const input = { employeeId: String(employeeA._id), month: '2026-10', action: 'credit' };
  const responses = await Promise.all([salaryPayments.POST(request('/api/salary-payments', admin, 'POST', input)), salaryPayments.POST(request('/api/salary-payments', admin, 'POST', input))]);
  assert.ok(responses.every(r => r.status === 200));
  const scope = { organizationId: orgA._id, employeeId: employeeA._id, month: '2026-10' };
  assert.equal(await SalaryPayment.countDocuments(scope), 1);
  const before = await SalaryPayment.findOne(scope).lean();
  const path = `/api/salary-slip?month=2026-10&employeeId=${employeeA._id}`;
  const first = await salarySlip.GET(request(path, employeeUser));
  assert.equal(first.status, 200); assert.equal(first.headers.get('content-type'), 'application/pdf');
  assert.equal(first.headers.get('cache-control'), 'no-store, private');
  const firstBytes = Buffer.from(await first.arrayBuffer());
  await Employee.updateOne({ organizationId: orgA._id, _id: employeeA._id }, { $set: { perDayRate: 9999, name: 'Edited after payment' } });
  await Attendance.updateOne({ organizationId: orgA._id, employeeId: employeeA._id, date: '2026-10-01' }, { $set: { status: 'absent', rebate: true } });
  await salaryPayments.POST(request('/api/salary-payments', admin, 'POST', input));
  const after = await SalaryPayment.findOne(scope).lean();
  assert.deepEqual(after.snapshot, before.snapshot); assert.deepEqual(after.creditedAt, before.creditedAt);
  const second = await salarySlip.GET(request(path, admin));
  assert.ok(firstBytes.equals(Buffer.from(await second.arrayBuffer())));
});
test('undo is admin-only, removes slip availability, and re-credit uses latest calculation', async () => {
  const scope = { organizationId: orgA._id, employeeId: employeeA._id, month: '2026-10' };
  const payment = await SalaryPayment.findOne(scope).lean();
  const input = { employeeId: String(employeeA._id), month: '2026-10', action: 'undo', creditedAt: payment.creditedAt.toISOString() };
  assert.equal((await salaryPayments.POST(request('/api/salary-payments', partner, 'POST', input))).status, 403);
  assert.equal((await salaryPayments.POST(request('/api/salary-payments', admin, 'POST', { ...input, creditedAt: '2020-01-01T00:00:00Z' }))).status, 409);
  assert.equal((await salaryPayments.POST(request('/api/salary-payments', admin, 'POST', input))).status, 200);
  assert.equal((await salarySlip.GET(request(`/api/salary-slip?month=2026-10&employeeId=${employeeA._id}`, employeeUser))).status, 404);
  const credited = await salaryPayments.POST(request('/api/salary-payments', admin, 'POST', { employeeId: String(employeeA._id), month: '2026-10', action: 'credit' }));
  assert.equal((await credited.json()).payment.snapshot.perDayRate, 9999);
});
test('organization setting is admin-only and cannot affect another organization', async () => {
  assert.equal((await settings.PATCH(request('/api/organization/settings', partner, 'PATCH', { sundayPaid: false }))).status, 403);
  assert.equal((await settings.PATCH(request('/api/organization/settings', admin, 'PATCH', { sundayPaid: false, organizationId: String(orgB._id) }))).status, 400);
  assert.equal((await settings.PATCH(request('/api/organization/settings', admin, 'PATCH', { sundayPaid: false }))).status, 200);
  const row = (await (await salary.GET(request('/api/salary?month=2026-10', employeeUser))).json()).rows[0];
  assert.equal(row.sundayPaidDays, 0);
  assert.equal((await Organization.findOne({ _id: orgB._id }).lean()).sundayPaid, true);
});
test('migration is idempotent and preserves explicit settings, rebates and other organizations', async () => {
  const scope = { organizationId: orgA._id, employeeId: employeeA._id, date: '2026-10-02' };
  await Attendance.collection.updateOne(scope, { $unset: { rebate: '', rebateNote: '' } });
  await migratePayrollDefaults(orgA._id); await migratePayrollDefaults(orgA._id);
  const record = await Attendance.findOne(scope).lean();
  assert.equal(record.rebate, false); assert.equal(record.rebateNote, '');
  assert.equal((await Organization.findOne({ _id: orgA._id }).lean()).sundayPaid, false);
  assert.equal((await Attendance.findOne({ organizationId: orgA._id, employeeId: employeeA._id, date: '2026-10-01' }).lean()).rebate, true);
});

test('work check-in/out, reporting, auto-close, corrections, and role boundaries', async () => {
  const originalEmployee = await Employee.findOne({ _id: employeeA._id, organizationId: orgA._id }).lean();
  const month = istMonth(), today = istDate();
  await Employee.updateOne({ _id: employeeA._id, organizationId: orgA._id }, { $set: { active: true, joiningDate: `${month}-01` } });
  try {
    const checkIn = await workCheckIn.POST(request('/api/work/check-in', employeeUser, 'POST', {}));
    assert.equal(checkIn.status, 201);
    const open = (await checkIn.json()).session;
    assert.equal(open.status, 'open'); assert.equal(open.date, today);
    assert.equal((await workCheckIn.POST(request('/api/work/check-in', employeeUser, 'POST', {}))).status, 409);
    assert.equal((await workCheckOut.POST(request('/api/work/check-out', employeeUser, 'POST', {}))).status, 429);

    await WorkSession.updateOne({ _id: open._id, organizationId: orgA._id }, { $set: { checkInAt: new Date(Date.now() - 11 * 60000) } });
    const checkOut = await workCheckOut.POST(request('/api/work/check-out', employeeUser, 'POST', {}));
    assert.equal(checkOut.status, 200);
    const closed = (await checkOut.json()).session;
    assert.equal(closed.status, 'closed'); assert.ok(closed.durationMinutes >= 10 && closed.durationMinutes <= 11);
    assert.equal((await workCheckOut.POST(request('/api/work/check-out', employeeUser, 'POST', {}))).status, 409);

    const own = await workMe.GET(request(`/api/work/me?month=${month}`, employeeUser));
    assert.equal(own.status, 200);
    const ownData = await own.json(); assert.equal(ownData.todaySessions.length, 1); assert.ok(ownData.todayTotalMinutes >= 10);
    assert.equal((await workMe.GET(request(`/api/work/me?month=${month}&employeeId=${employeeB._id}`, employeeUser))).status, 403);

    const dashboard = await workLive.GET(request('/api/work/live', admin));
    assert.equal(dashboard.status, 200);
    const dayReport = await workReport.GET(request(`/api/work/report?date=${today}`, admin));
    assert.equal(dayReport.status, 200);
    const monthly = await workReport.GET(request(`/api/work/report?month=${month}&employeeId=${employeeA._id}`, admin));
    assert.equal(monthly.status, 200);
    assert.ok((await monthly.json()).employees[0].totalMinutes >= 10);
    assert.equal((await workReport.GET(request(`/api/work/report?month=${month}&format=csv`, admin))).headers.get('content-type'), 'text/csv; charset=utf-8');

    const staleIn = new Date(Date.now() - 15 * 3600000);
    const stale = await WorkSession.create({ organizationId: orgA._id, employeeId: employeeA._id, date: istDate(staleIn), checkInAt: staleIn, checkOutAt: null, status: 'open' });
    await workLive.GET(request('/api/work/live', admin));
    const autoClosed = await WorkSession.findOne({ _id: stale._id, organizationId: orgA._id }).lean();
    assert.equal(autoClosed.status, 'auto_closed'); assert.equal(autoClosed.durationMinutes, 14 * 60);
    const fixOut = new Date(Date.now() - 60 * 60000);
    const fixed = await workSession.PATCH(request(`/api/work/sessions/${stale._id}`, admin, 'PATCH', { checkInAt: staleIn.toISOString(), checkOutAt: fixOut.toISOString(), editNote: 'Confirmed with employee' }));
    assert.equal(fixed.status, 200);
    const corrected = (await fixed.json()).session;
    assert.equal(corrected.status, 'closed'); assert.equal(corrected.editedBy, String(admin._id)); assert.equal(corrected.editNote, 'Confirmed with employee');

    for (const user of [partner, adminB]) {
      assert.equal((await workCheckIn.POST(request('/api/work/check-in', user, 'POST', {}))).status, 403);
      assert.equal((await workLive.GET(request('/api/work/live', user))).status, 403);
      assert.equal((await middleware(request('/api/work/live', user))).status, 403);
    }
    assert.equal((await workLive.GET(request('/api/work/live', employeeUser))).status, 403);
  } finally {
    await WorkSession.deleteMany({ organizationId: orgA._id, employeeId: employeeA._id });
    await Employee.updateOne({ _id: employeeA._id, organizationId: orgA._id }, { $set: { active: originalEmployee.active, joiningDate: originalEmployee.joiningDate } });
  }
});

test('employee history rejects pre-joining months and future months at the API', async () => {
  assert.equal((await salary.GET(request('/api/salary?month=2025-12', employeeUser))).status, 400);
  assert.equal((await salary.GET(request('/api/salary?month=9999-12', employeeUser))).status, 400);
});
test('deactivated employees lose access even with an existing valid JWT', async () => {
  await Employee.updateOne({ _id: employeeA._id, organizationId: orgA._id }, { $set: { active: false } });
  const response = await salary.GET(request('/api/salary?month=2026-10', employeeUser));
  assert.equal(response.status, 401); assert.match(response.headers.get('set-cookie'), /Max-Age=0/i);
});

test('admin can update, disable, and re-enable employee and partner logins safely', async () => {
  const path = `/api/users/${partner._id}/login`;
  const updated = await userLogin.PATCH(request(path, admin, 'PATCH', { loginId: 'partner-new@example.com' }));
  assert.equal(updated.status, 200);
  const safeUser = (await updated.json()).user;
  assert.equal(safeUser.login, 'partner-new@example.com');
  assert.equal(safeUser.loginDisabled, false);
  assert.equal('passwordHash' in safeUser, false);

  const duplicate = await userLogin.PATCH(request(path, admin, 'PATCH', { loginId: employeeUser.login }));
  assert.equal(duplicate.status, 409);
  assert.match((await duplicate.json()).error, /already used/i);

  for (const user of [partner, employeeUser]) {
    assert.equal((await userLogin.PATCH(request(path, user, 'PATCH', { disabled: true }))).status, 403);
    assert.equal((await middleware(request(path, user, 'PATCH', { disabled: true }))).status, 403);
  }

  assert.equal((await userLogin.PATCH(request(path, admin, 'PATCH', { disabled: true }))).status, 200);
  assert.equal((await login.POST(request('/api/auth/login', null, 'POST', { organizationId: String(orgA._id), login: 'partner-new@example.com', password: 'testing-password-123' }))).status, 403);
  assert.equal((await balances.GET(request('/api/balances', partner))).status, 401);
  assert.equal((await userLogin.PATCH(request(path, admin, 'PATCH', { disabled: false }))).status, 200);
  const reenabled = await login.POST(request('/api/auth/login', null, 'POST', { organizationId: String(orgA._id), login: 'partner-new@example.com', password: 'testing-password-123' }));
  assert.equal(reenabled.status, 200);

  assert.equal((await userLogin.PATCH(request(path, admin, 'PATCH', { password: 'new-testing-password-123', confirmPassword: 'new-testing-password-123', loginId: 'partner-new@example.com' }))).status, 200);
  assert.equal((await balances.GET(request('/api/balances', partner))).status, 401);
  assert.equal((await login.POST(request('/api/auth/login', null, 'POST', { organizationId: String(orgA._id), login: 'partner-new@example.com', password: 'testing-password-123' }))).status, 401);
  assert.equal((await login.POST(request('/api/auth/login', null, 'POST', { organizationId: String(orgA._id), login: 'partner-new@example.com', password: 'new-testing-password-123' }))).status, 200);
});
