import { Employee, Organization } from '../models/index.js';

const codeNumber = value => /^APX-(\d+)$/.exec(value || '')?.[1] ? Number(/^APX-(\d+)$/.exec(value)[1]) : 0;
const formatCode = value => `APX-${String(value).padStart(4, '0')}`;

async function reserveEmployeeCode(organizationId) {
  const highest = await Employee.find({ organizationId, employeeCode: /^APX-\d+$/ }).select('employeeCode').lean();
  const maxCode = highest.reduce((max, employee) => Math.max(max, codeNumber(employee.employeeCode)), 0);
  await Organization.updateOne({ _id: organizationId }, { $max: { employeeCodeCounter: maxCode } });
  const organization = await Organization.findOneAndUpdate({ _id: organizationId }, { $inc: { employeeCodeCounter: 1 } }, { new: true }).select('employeeCodeCounter').lean();
  if (!organization) throw new Error('Organization not found while assigning an employee code');
  return formatCode(organization.employeeCodeCounter);
}

export async function ensureEmployeeCode(employee) {
  if (employee.employeeCode) return employee.employeeCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const employeeCode = await reserveEmployeeCode(employee.organizationId);
    try {
      const result = await Employee.updateOne({ _id: employee._id, organizationId: employee.organizationId, $or: [{ employeeCode: { $exists: false } }, { employeeCode: null }, { employeeCode: '' }] }, { $set: { employeeCode } });
      if (result.modifiedCount) { employee.employeeCode = employeeCode; return employeeCode; }
      const current = await Employee.findOne({ _id: employee._id, organizationId: employee.organizationId }).select('employeeCode').lean();
      if (current?.employeeCode) { employee.employeeCode = current.employeeCode; return current.employeeCode; }
      throw new Error('Employee was not found while assigning a code');
    } catch (error) {
      if (error.code !== 11000 || attempt === 4) throw error;
    }
  }
}

export async function backfillEmployeeCodes(organizationId) {
  // Make the unique index explicit before writing any codes.
  await Employee.init();
  const employees = await Employee.find({ organizationId, $or: [{ employeeCode: { $exists: false } }, { employeeCode: null }, { employeeCode: '' }] })
    .sort({ createdAt: 1, _id: 1 }).lean();
  for (const employee of employees) await ensureEmployeeCode(employee);
  return employees.length;
}

export async function createEmployeeCode(organizationId) {
  return reserveEmployeeCode(organizationId);
}
