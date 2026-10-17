// Requires npm install and an available MongoDB binary download on the first run.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { NextRequest } from 'next/server.js';
import { Organization, User, Employee, Attendance, Advance, Expense, Settlement, LoginAttempt } from '../../models/index.js';
import { signToken, COOKIE_NAME } from '../../lib/token.js';
import { middleware } from '../../middleware.js';
import * as login from '../../app/api/auth/login/route.js';
import * as attendance from '../../app/api/attendance/route.js';
import * as advances from '../../app/api/advances/route.js';
import * as salary from '../../app/api/salary/route.js';
import * as expenses from '../../app/api/expenses/route.js';
import * as employees from '../../app/api/employees/route.js';
import * as users from '../../app/api/users/route.js';
import * as balances from '../../app/api/balances/route.js';
import * as settlements from '../../app/api/settlements/route.js';
import { date, monthRange } from '../../lib/validation.js';

let mongo, orgA, orgB, admin, partner, employeeUser, employeeA, employeeB, adminB;
const tokens = {};
before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri(); process.env.JWT_SECRET = 'test-only-secret-at-least-32-bytes-long';
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([Organization, User, Employee, Attendance, Advance, Expense, Settlement, LoginAttempt].map(m => m.init()));
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
  assert.equal(response.status, 200); assert.equal(data.rows.length, 1); assert.equal(data.rows[0].employeeId, String(employeeA._id)); assert.equal(data.rows[0].netSalary, 1300); assert.equal(data.advances.length, 1);
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
test('deactivated employees lose access even with an existing valid JWT', async () => {
  await Employee.updateOne({ _id: employeeA._id, organizationId: orgA._id }, { $set: { active: false } });
  const response = await salary.GET(request('/api/salary?month=2026-10', employeeUser));
  assert.equal(response.status, 401); assert.match(response.headers.get('set-cookie'), /Max-Age=0/i);
});
