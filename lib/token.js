import { SignJWT, jwtVerify } from 'jose';
export const COOKIE_NAME = 'appnix_session';
export const SESSION_SECONDS = 60 * 60 * 12;
function key() {
  const secret = process.env.JWT_SECRET;
  if (!secret || new TextEncoder().encode(secret).length < 32) throw new Error('JWT_SECRET must contain at least 32 bytes');
  return new TextEncoder().encode(secret);
}
export async function signToken(user) {
  return new SignJWT({ organizationId: String(user.organizationId), role: user.role })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(String(user._id)).setIssuer('appnix').setAudience('appnix-staff')
    .setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(key());
}
export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'], issuer: 'appnix', audience: 'appnix-staff' });
  if (!/^[a-f\d]{24}$/i.test(payload.sub) || !/^[a-f\d]{24}$/i.test(payload.organizationId) || !['admin', 'partner', 'employee'].includes(payload.role)) throw new Error('Invalid session');
  return payload;
}
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS };
