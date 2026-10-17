import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import connectDB from '../lib/mongodb.js';
import { Organization, User, Employee, Attendance, Advance, Expense, Settlement, LoginAttempt } from '../models/index.js';
import { login, password } from '../lib/validation.js';

async function seed() {
  const adminLogin = login.parse(process.env.SEED_ADMIN_LOGIN || 'admin@example.com');
  const adminPassword = password.parse(process.env.SEED_ADMIN_PASSWORD || '');
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) throw new Error('Set a JWT_SECRET of at least 32 bytes');
  const organizationName = (process.env.SEED_ORG_NAME || 'Appnix').trim();
  const adminName = (process.env.SEED_ADMIN_NAME || 'Administrator').trim();
  if (!organizationName || !adminName) throw new Error('Organization and administrator names cannot be blank');
  await connectDB();
  // Explicitly initialize all collections/indexes before accepting traffic.
  await Promise.all([Organization, User, Employee, Attendance, Advance, Expense, Settlement, LoginAttempt].map(model => model.init()));
  const hash = await bcrypt.hash(adminPassword, 12);
  const session = await mongoose.startSession();
  let organization;
  try {
    await session.withTransaction(async () => {
      // Organization is the tenancy root, so it has no organizationId itself.
      organization = await Organization.findOne({ name: organizationName }).session(session);
      if (!organization) [organization] = await Organization.create([{ name: organizationName }], { session });
      const existing = await User.findOne({ organizationId: organization._id, login: adminLogin }).session(session);
      if (existing && existing.role !== 'admin') throw new Error('This seed login already belongs to a non-admin account');
      if (!existing) await User.create([{ organizationId: organization._id, name: adminName, login: adminLogin, passwordHash: hash, role: 'admin' }], { session });
    });
    console.log(`Organization: ${organization.name}\nOrganization ID: ${organization._id}\nAdmin login: ${adminLogin}\nSign in using the configured seed password. Existing passwords are never overwritten.`);
  } finally { await session.endSession(); }
}
seed().catch(error => { console.error('Seed failed:', error.code === 11000 ? 'A login is already in use. Choose another SEED_ADMIN_LOGIN.' : error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
