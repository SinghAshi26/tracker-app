import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessAPI, canAccessPage, homeFor } from '../lib/permissions.js';

test('employee cannot access any expense or settlement API using any method', () => {
  for (const path of ['/api/expenses', '/api/balances', '/api/settlements', '/api/users', '/api/employees', '/api/dashboard']) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(canAccessAPI(path, method, 'employee'), false, `${path} ${method}`);
  }
});
test('employee can only read their allowed business resources', () => {
  for (const path of ['/api/attendance', '/api/advances', '/api/salary']) {
    assert.equal(canAccessAPI(path, 'GET', 'employee'), true);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(canAccessAPI(path, method, 'employee'), false);
  }
});
test('partners have finance access and cannot read or change salary or attendance', () => {
  for (const path of ['/api/expenses', '/api/settlements']) for (const method of ['GET', 'POST']) assert.equal(canAccessAPI(path, method, 'partner'), true);
  for (const path of ['/api/salary', '/api/advances', '/api/attendance', '/api/employees']) for (const method of ['GET', 'POST', 'PUT', 'PATCH']) assert.equal(canAccessAPI(path, method, 'partner'), false);
  assert.equal(canAccessAPI('/api/users', 'POST', 'partner'), false);
});
test('unknown routes and methods are denied and page roles match landing routes', () => {
  assert.equal(canAccessAPI('/api/new-resource', 'GET', 'admin'), false);
  assert.equal(canAccessAPI('/api/expenses', 'DELETE', 'admin'), false);
  for (const role of ['admin', 'partner', 'employee']) assert.equal(canAccessPage(homeFor(role), role), true);
  assert.equal(canAccessPage('/expenses', 'employee'), false);
  assert.equal(canAccessPage('/salary', 'partner'), false);
});
test('salary credit/settings writes are admin-only, slips are never available to partners', () => {
  assert.equal(canAccessAPI('/api/salary-slip', 'GET', 'admin'), true);
  assert.equal(canAccessAPI('/api/salary-slip', 'GET', 'employee'), true);
  assert.equal(canAccessAPI('/api/salary-slip', 'GET', 'partner'), false);
  for (const role of ['admin', 'partner', 'employee']) {
    assert.equal(canAccessAPI('/api/salary-payments', 'POST', role), role === 'admin');
    assert.equal(canAccessAPI('/api/organization/settings', 'PATCH', role), role === 'admin');
  }
});
test('login update endpoint is admin-only for concrete user IDs', () => {
  const path = '/api/users/0123456789abcdef01234567/login';
  assert.equal(canAccessAPI(path, 'PATCH', 'admin'), true);
  assert.equal(canAccessAPI(path, 'PATCH', 'partner'), false);
  assert.equal(canAccessAPI(path, 'PATCH', 'employee'), false);
  assert.equal(canAccessAPI(path, 'GET', 'admin'), false);
});
test('work-hours endpoints and page are restricted to admins and employees as intended', () => {
  const paths = ['/api/work/check-in', '/api/work/check-out', '/api/work/me'];
  for (const path of paths) {
    assert.equal(canAccessAPI(path, path.endsWith('/me') ? 'GET' : 'POST', 'employee'), true);
    assert.equal(canAccessAPI(path, path.endsWith('/me') ? 'GET' : 'POST', 'admin'), false);
    assert.equal(canAccessAPI(path, path.endsWith('/me') ? 'GET' : 'POST', 'partner'), false);
  }
  for (const [path, method] of [['/api/work/live', 'GET'], ['/api/work/report', 'GET'], ['/api/work/sessions/0123456789abcdef01234567', 'PATCH']]) {
    assert.equal(canAccessAPI(path, method, 'admin'), true);
    assert.equal(canAccessAPI(path, method, 'employee'), false);
    assert.equal(canAccessAPI(path, method, 'partner'), false);
  }
  assert.equal(canAccessPage('/work-hours', 'employee'), true);
  assert.equal(canAccessPage('/work-hours', 'admin'), true);
  assert.equal(canAccessPage('/work-hours', 'partner'), false);
});
