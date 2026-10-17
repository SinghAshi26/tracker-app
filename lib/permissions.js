export const ALL_ROLES = ['admin', 'partner', 'employee'];
export const FINANCE_ROLES = ['admin', 'partner'];
const routes = {
  '/api/auth/me': { GET: ALL_ROLES }, '/api/auth/logout': { POST: ALL_ROLES },
  '/api/dashboard': { GET: ['admin'] },
  '/api/employees': { GET: ['admin'], POST: ['admin'], PATCH: ['admin'] },
  '/api/users': { GET: FINANCE_ROLES, POST: ['admin'] },
  '/api/attendance': { GET: ['admin', 'employee'], PUT: ['admin'] },
  '/api/advances': { GET: ['admin', 'employee'], POST: ['admin'] },
  '/api/salary': { GET: ['admin', 'employee'] },
  '/api/salary-slip': { GET: ['admin', 'employee'] },
  '/api/salary-payments': { POST: ['admin'] },
  '/api/organization/settings': { PATCH: ['admin'] },
  '/api/expenses': { GET: FINANCE_ROLES, POST: FINANCE_ROLES },
  '/api/balances': { GET: FINANCE_ROLES },
  '/api/settlements': { GET: FINANCE_ROLES, POST: FINANCE_ROLES }
};
export function canAccessAPI(path, method, role) { return !!routes[path]?.[method]?.includes(role); }
export const homeFor = role => role === 'admin' ? '/dashboard' : role === 'partner' ? '/expenses' : '/me';
export function canAccessPage(path, role) {
  const base = '/' + path.split('/')[1];
  return role === 'admin' ? ['/dashboard', '/employees', '/attendance', '/salary', '/expenses'].includes(base)
    : role === 'partner' ? base === '/expenses' : role === 'employee' && base === '/me';
}
