import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import connectDB from '../lib/mongodb.js';
import { Organization, Attendance, SalaryPayment } from '../models/index.js';
import { id } from '../lib/validation.js';

export async function migratePayrollDefaults(organizationId) {
  id.parse(String(organizationId));
  if (!await Organization.exists({ _id: organizationId })) throw new Error('Organization not found');
  // Only missing fields are populated. Existing false settings and rebates survive.
  await Organization.updateOne({ _id: organizationId, sundayPaid: { $exists: false } }, { $set: { sundayPaid: true } });
  await Attendance.updateMany({ organizationId, rebate: { $exists: false } }, { $set: { rebate: false } });
  await Attendance.updateMany({ organizationId, rebateNote: { $exists: false } }, { $set: { rebateNote: '' } });
  await SalaryPayment.init();
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const organizationId = process.argv.find(value => value.startsWith('--organization-id='))?.split('=')[1];
  Promise.resolve().then(() => id.parse(organizationId)).then(() => connectDB()).then(() => migratePayrollDefaults(organizationId))
    .then(() => console.log('Payroll defaults applied. Existing records and settings preserved.'))
    .catch(() => { console.error('Migration failed. Supply --organization-id=<24-character ID> and check database configuration.'); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
}
