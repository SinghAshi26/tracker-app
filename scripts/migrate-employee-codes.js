import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import connectDB from '../lib/mongodb.js';
import { Organization } from '../models/index.js';
import { id } from '../lib/validation.js';
import { backfillEmployeeCodes } from '../lib/employee-code.js';

export async function migrateEmployeeCodes(organizationId) {
  id.parse(String(organizationId));
  if (!await Organization.exists({ _id: organizationId })) throw new Error('Organization not found');
  const count = await backfillEmployeeCodes(organizationId);
  return count;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const organizationId = process.argv.find(value => value.startsWith('--organization-id='))?.split('=')[1];
  Promise.resolve().then(() => id.parse(organizationId)).then(() => connectDB()).then(() => migrateEmployeeCodes(organizationId))
    .then(count => console.log(`Employee codes assigned to ${count} existing employees in createdAt order.`))
    .catch(() => { console.error('Migration failed. Supply --organization-id=<24-character ID> and check database configuration.'); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
}
