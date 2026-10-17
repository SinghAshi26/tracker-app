import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, equalSplits, salaryBreakdown, splitBalances, csvCell } from '../lib/calculations.js';

test('salary includes present and half days and deducts only supplied monthly advances', () => {
  const employee = { _id: 'e1', name: 'Asha', perDayRate: 1000, monthlySalary: 30000, active: true };
  const rows = ['present', 'present', 'half', 'absent', 'leave'].map(status => ({ status }));
  const result = salaryBreakdown(employee, rows, [{ amount: 500 }, { amount: 125.50 }]);
  assert.equal(result.payableDays, 2.5); assert.equal(result.earned, 2500); assert.equal(result.advances, 625.5); assert.equal(result.netSalary, 1874.5);
  assert.deepEqual(result.days, { present: 2, half: 1, absent: 1, leave: 1 });
});
test('salary allows a negative balance and rounds fractional paise to nearest paise', () => {
  const result = salaryBreakdown({ _id: 'x', perDayRate: 100.01 }, [{ status: 'half' }], [{ amount: 100 }]);
  assert.equal(result.earned, 50.01); assert.equal(result.netSalary, -49.99);
});
test('equal split conserves every paise even for tiny expenses', () => {
  for (const total of [.01, .02, 1, 10, 100.01]) {
    const rows = equalSplits(total, ['a', 'b', 'c']);
    assert.equal(rows.reduce((sum, r) => sum + cents(r.share), 0), cents(total));
    assert.ok(Math.max(...rows.map(r => cents(r.share))) - Math.min(...rows.map(r => cents(r.share))) <= 1);
  }
});
const users = [{ _id: 'a', name: 'A' }, { _id: 'b', name: 'B' }, { _id: 'c', name: 'C' }];
test('balances are paid minus shares; settling decreases debts without inflating expenses', () => {
  const expenses = [{ amount: 90, paidBy: 'a', splits: equalSplits(90, ['a', 'b', 'c']) }];
  const before = splitBalances(users, expenses, []);
  assert.deepEqual(before.balances.map(u => u.balance), [60, -30, -30]);
  const after = splitBalances(users, expenses, [{ fromUserId: 'b', toUserId: 'a', amount: 30 }]);
  assert.deepEqual(after.balances.map(u => u.balance), [30, 0, -30]);
  assert.equal(after.transfers.length, 1); assert.equal(after.transfers[0].fromUserId, 'c');
  assert.equal(after.balances[0].paid, 90);
});
test('suggested transfers settle a mixed ledger and always sum balances to zero', () => {
  const expenses = [{ amount: 100.01, paidBy: 'a', splits: equalSplits(100.01, ['a', 'b', 'c']) }, { amount: 42.49, paidBy: 'b', splits: [{ userId: 'a', share: 10 }, { userId: 'b', share: 12.49 }, { userId: 'c', share: 20 }] }];
  const result = splitBalances(users, expenses, []);
  assert.equal(result.balances.reduce((s, b) => s + cents(b.balance), 0), 0);
  const final = splitBalances(users, expenses, result.transfers);
  assert.ok(final.balances.every(b => b.balance === 0));
  assert.equal(final.transfers.length, 0);
});
test('CSV escapes quotes and protects against spreadsheet formula injection', () => {
  assert.equal(csvCell('A "name", test'), '"A ""name"", test"');
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell(0), '"0"');
});
