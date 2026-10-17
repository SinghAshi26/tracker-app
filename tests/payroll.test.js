import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { salaryBreakdown, salarySnapshot } from '../lib/calculations.js';
import { attendanceDay, datesInMonth } from '../lib/attendance.js';
import { suggestedPerDayRate, SALARY_DAY_DIVISOR } from '../lib/payroll-settings.js';
import { attendanceSchema, salaryPaymentSchema } from '../lib/validation.js';
import { Organization, Attendance, SalaryPayment } from '../models/index.js';
import { createSalarySlip } from '../lib/salary-slip.js';

const employee = { _id: 'employee', name: 'Asha', phone: '9876543210', perDayRate: 1000, monthlySalary: 30000, joiningDate: '2026-10-01', active: true };
const calculate = (attendance = [], advances = [], options = {}) => salaryBreakdown(employee, attendance, advances, { month: '2026-10', ...options });
test('monthly rate suggestion uses one configurable divisor and two decimals', () => {
  assert.equal(SALARY_DAY_DIVISOR, 30);
  assert.equal(suggestedPerDayRate(30000), 1000);
  assert.equal(suggestedPerDayRate(10000), 333.33);
  assert.equal(suggestedPerDayRate(0), 0);
});
test('unmarked Sundays are paid by default, including the full selected month', () => {
  const row = calculate();
  assert.equal(row.sundayPaidDays, 4); assert.equal(row.netSalary, 4000);
  assert.equal(row.days.absent, 0);
  assert.equal(calculate([], [], { sundayPaid: false }).netSalary, 0);
});
test('Sunday Present replaces weekly off without double counting, regardless of setting', () => {
  const attendance = [{ date: '2026-10-04', status: 'present', rebate: true }];
  assert.equal(calculate(attendance).sundayPaidDays, 3);
  assert.equal(calculate(attendance).netSalary, 4000);
  assert.equal(calculate(attendance).rebateDays, 0);
  assert.equal(calculate(attendance, [], { sundayPaid: false }).netSalary, 1000);
});
test('legacy Sunday absent, half, and leave records remain weekly off and are never deducted', () => {
  for (const status of ['absent', 'half', 'leave']) {
    const row = calculate([{ date: '2026-10-04', status, rebate: true }]);
    assert.equal(row.netSalary, 4000); assert.equal(row.days[status], 0); assert.equal(row.rebateDays, 0);
  }
});
test('rebates pay leave/absence once and preserve their dates and notes', () => {
  const row = calculate([
    { date: '2026-10-01', status: 'leave', rebate: true, rebateNote: 'Approved' },
    { date: '2026-10-02', status: 'absent', rebate: true },
    { date: '2026-10-03', status: 'half', rebate: true },
    { date: '2026-10-05', status: 'present', rebate: true }
  ], [{ amount: 500, date: '2026-10-06' }, { amount: 9000, date: '2026-09-01' }]);
  assert.equal(row.rebateDays, 2); assert.equal(row.rebateAmount, 2000);
  assert.equal(row.grossSalary, 7500); assert.equal(row.netSalary, 7000);
  assert.deepEqual(row.rebatedDates, [{ date: '2026-10-01', note: 'Approved' }, { date: '2026-10-02', note: '' }]);
});
test('joining mid-month excludes earlier Sundays, attendance, rebates and advances', () => {
  const row = salaryBreakdown({ ...employee, joiningDate: '2026-10-12' }, [{ date: '2026-10-01', status: 'present' }, { date: '2026-10-02', status: 'leave', rebate: true }, { date: '2026-10-12', status: 'present' }], [{ date: '2026-10-03', amount: 2000 }], { month: '2026-10' });
  assert.equal(row.sundayPaidDays, 2); assert.equal(row.days.present, 1); assert.equal(row.rebateDays, 0); assert.equal(row.advances, 0); assert.equal(row.netSalary, 3000);
  assert.equal(attendanceDay('2026-10-11', { status: 'present' }, '2026-10-12').status, 'not_joined');
  assert.equal(datesInMonth('2024-02').length, 29);
});
test('legacy missing rebate defaults false, and explicit false sundayPaid is preserved', () => {
  assert.equal(calculate([{ date: '2026-10-01', status: 'leave' }]).rebateDays, 0);
  assert.equal(new Organization({ name: 'Legacy' }).sundayPaid, true);
  assert.equal(new Organization({ name: 'Unpaid Sundays', sundayPaid: false }).sundayPaid, false);
  assert.equal(new Attendance({}).rebate, false);
  assert.equal(new SalaryPayment({}).status, 'pending');
});
test('attendance input disallows Sunday absence and rebates on worked days', () => {
  const employeeId = 'a'.repeat(24);
  const parse = (date, status, rebate) => attendanceSchema.safeParse({ date, records: [{ employeeId, status, rebate }] }).success;
  assert.equal(parse('2026-10-04', 'absent', false), false);
  assert.equal(parse('2026-10-04', 'present', false), true);
  assert.equal(parse('2026-10-04', 'weekly_off', false), true);
  assert.equal(parse('2026-10-05', 'weekly_off', false), false);
  assert.equal(parse('2026-10-05', 'present', true), false);
  assert.equal(parse('2026-10-05', 'half', true), false);
  assert.equal(parse('2026-10-05', 'leave', true), true);
  assert.equal(salaryPaymentSchema.safeParse({ employeeId, month: '2026-10', action: 'undo' }).success, false);
});
test('snapshot stores scalar copies of every slip field', () => {
  const row = calculate([{ date: '2026-10-01', status: 'present' }]);
  const snapshot = salarySnapshot(row);
  row.days.present = 99; row.perDayRate = 1; row.name = 'Edited';
  assert.equal(snapshot.presentDays, 1); assert.equal(snapshot.perDayRate, 1000); assert.equal(snapshot.employeeName, 'Asha');
  assert.equal(snapshot.employeePhone, employee.phone); assert.equal(snapshot.grossSalary, 5000);
});
test('salary slip is a valid PDF with consistent cross references, embedded font and frozen text', async () => {
  const snapshot = salarySnapshot(calculate());
  const pdf = await createSalarySlip({ month: '2026-10', creditedAt: '2026-10-18T10:00:00Z', snapshot });
  assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.7');
  const ascii = pdf.toString('latin1');
  const offset = Number(ascii.match(/startxref\n(\d+)/)[1]);
  assert.equal(pdf.subarray(offset, offset + 4).toString(), 'xref');
  const rows = ascii.slice(offset).match(/\d{10} 00000 n/g);
  rows.forEach((row, i) => assert.ok(pdf.subarray(Number(row.slice(0, 10))).toString('latin1').startsWith(`${i + 1} 0 obj`)));
  assert.ok(ascii.includes('/FontFile2')); assert.ok(ascii.includes('/ToUnicode'));
  const streams = [];
  const regex = /\/Length (\d+) \/Filter \/FlateDecode[^]*?stream\n/g;
  let match;
  while ((match = regex.exec(ascii))) { streams.push(inflateSync(pdf.subarray(regex.lastIndex, regex.lastIndex + Number(match[1])))); regex.lastIndex += Number(match[1]); }
  const cmap = streams.find(stream => stream.toString().includes('beginbfchar')).toString();
  const mapping = new Map([...cmap.matchAll(/<([0-9a-f]{4})> <([0-9a-f]+)>/g)].map(m => [m[1], Buffer.from(m[2], 'hex').swap16().toString('utf16le')]));
  const text = [...streams[0].toString().matchAll(/<([0-9a-f]+)> Tj/g)].map(m => m[1].match(/.{4}/g).map(cid => mapping.get(cid)).join('')).join('\n');
  for (const expected of ['Appnix Technologies', 'Employee: Asha', '9876543210', '2026-10', 'Paid Sundays', 'Rebate days', 'INR 4,000.00', 'Net salary credited']) assert.ok(text.includes(expected), expected);
});
