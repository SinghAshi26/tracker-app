import { NextResponse } from 'next/server.js';
import { ZodError } from 'zod';
import connectDB from './mongodb.js';
import { User, Employee } from '../models/index.js';
import { verifyToken, COOKIE_NAME, cookieOptions } from './token.js';

export class APIError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function json(data, status = 200) { return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store, private' } }); }
export function assertOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new APIError(403, 'Cross-origin request rejected');
}
export async function body(request, schema) {
  if (Number(request.headers.get('content-length')) > 65536) throw new APIError(413, 'Request too large');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 65536) throw new APIError(413, 'Request too large');
  let value;
  try { value = JSON.parse(raw); } catch { throw new APIError(400, 'Invalid JSON'); }
  return schema.parse(value);
}
export async function authenticate(request, roles) {
  let claims;
  try { claims = await verifyToken(request.cookies.get(COOKIE_NAME)?.value); } catch { throw new APIError(401, 'Please sign in'); }
  if (!roles.includes(claims.role)) throw new APIError(403, 'Access denied');
  await connectDB();
  const user = await User.findOne({ _id: claims.sub, organizationId: claims.organizationId }).lean();
  if (!user || user.role !== claims.role) throw new APIError(401, 'Session is no longer valid');
  if (Number(user.tokenVersion ?? 0) !== claims.tokenVersion || user.loginDisabled === true) throw new APIError(401, 'Your session is no longer active. Please sign in again.');
  if (user.role === 'employee') {
    const employee = user.employeeId && await Employee.findOne({ _id: user.employeeId, organizationId: user.organizationId, active: true }).lean();
    if (!employee) throw new APIError(401, 'Employee account is inactive');
  }
  return user;
}
export function endpoint(roles, handler) {
  return async request => {
    try {
      assertOrigin(request);
      const user = roles ? await authenticate(request, roles) : null;
      return await handler(request, user);
    } catch (error) {
      if (error instanceof ZodError) return json({ error: error.issues.map(i => `${i.path.join('.') || 'Input'}: ${i.message}`).join('; ') }, 400);
      if (error instanceof APIError) {
        const response = json({ error: error.message }, error.status);
        if (error.status === 401) response.cookies.set(COOKIE_NAME, '', { ...cookieOptions, maxAge: 0 });
        return response;
      }
      if (error.code === 11000) return json({ error: 'This record or login already exists' }, 409);
      console.error('API failure:', error.name, error.code || '');
      return json({ error: 'Unable to complete the request. Check your connection and server configuration.' }, 500);
    }
  };
}
export function employeeFilter(user, requested) {
  if (user.role === 'employee') {
    if (requested && requested !== String(user.employeeId)) throw new APIError(403, 'You can only access your own records');
    return { employeeId: user.employeeId };
  }
  return requested ? { employeeId: requested } : {};
}
