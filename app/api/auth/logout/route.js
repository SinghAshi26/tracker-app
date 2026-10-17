import { endpoint, json } from '../../../../lib/api.js';
import { ALL_ROLES } from '../../../../lib/permissions.js';
import { COOKIE_NAME, cookieOptions } from '../../../../lib/token.js';
export const POST = endpoint(ALL_ROLES, async () => {
  const response = json({ ok: true });
  response.cookies.set(COOKIE_NAME, '', { ...cookieOptions, maxAge: 0 });
  return response;
});
