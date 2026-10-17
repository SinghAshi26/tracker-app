import { endpoint, json } from '../../../lib/api.js';
import { FINANCE_ROLES } from '../../../lib/permissions.js';
import { financialSummary } from '../../../lib/finance.js';
export const dynamic = 'force-dynamic';
export const GET = endpoint(FINANCE_ROLES, async (_r, u) => json(await financialSummary(u.organizationId)));
