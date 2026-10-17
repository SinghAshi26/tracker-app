import mongoose from 'mongoose';

const { Schema } = mongoose;
const ref = (model, required = true) => ({ type: Schema.Types.ObjectId, ref: model, required });
const tenant = { organizationId: { ...ref('Organization'), index: true } };
const options = { timestamps: true, versionKey: false };
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

export const Organization = model('Organization', new Schema({ name: { type: String, required: true } }, options));
const userSchema = new Schema({
  ...tenant, name: { type: String, required: true },
  login: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'partner', 'employee'], required: true },
  employeeId: ref('Employee', false)
}, options);
userSchema.index({ organizationId: 1, employeeId: 1 }, { unique: true, partialFilterExpression: { employeeId: { $type: 'objectId' } } });
export const User = model('User', userSchema);
export const Employee = model('Employee', new Schema({
  ...tenant, name: { type: String, required: true }, phone: { type: String, default: '' },
  monthlySalary: { type: Number, required: true, min: 0 }, perDayRate: { type: Number, required: true, min: 0 },
  joiningDate: { type: String, required: true }, active: { type: Boolean, default: true }
}, options));
const attendanceSchema = new Schema({
  ...tenant, employeeId: ref('Employee'), date: { type: String, required: true },
  status: { type: String, enum: ['present', 'absent', 'half', 'leave'], required: true }
}, options);
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ organizationId: 1, date: 1 });
export const Attendance = model('Attendance', attendanceSchema);
export const Advance = model('Advance', new Schema({
  ...tenant, employeeId: ref('Employee'), amount: { type: Number, required: true, min: 0.01 },
  date: { type: String, required: true }, note: { type: String, default: '' }
}, options));
export const Expense = model('Expense', new Schema({
  ...tenant, amount: { type: Number, required: true, min: 0.01 }, paidBy: ref('User'),
  category: { type: String, required: true }, date: { type: String, required: true }, note: { type: String, default: '' },
  splitType: { type: String, enum: ['equal', 'custom'], required: true },
  splits: [{ _id: false, userId: ref('User'), share: { type: Number, required: true, min: 0 } }]
}, options));
const settlementSchema = new Schema({
  ...tenant, fromUserId: ref('User'), toUserId: ref('User'), createdBy: ref('User'),
  amount: { type: Number, required: true, min: 0.01 }, date: { type: String, required: true },
  note: { type: String, default: '' }, requestId: { type: String, required: true }
}, options);
settlementSchema.index({ organizationId: 1, requestId: 1 }, { unique: true });
export const Settlement = model('Settlement', settlementSchema);
const attemptSchema = new Schema({
  ...tenant, key: { type: String, required: true }, count: { type: Number, default: 0 }, expiresAt: Date
});
attemptSchema.index({ organizationId: 1, key: 1 }, { unique: true });
attemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const LoginAttempt = model('LoginAttempt', attemptSchema);
