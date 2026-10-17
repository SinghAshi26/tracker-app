import { NextResponse } from 'next/server.js';
import { COOKIE_NAME, verifyToken } from './lib/token.js';
import { canAccessAPI, canAccessPage, homeFor } from './lib/permissions.js';

export async function middleware(request) {
  const path = request.nextUrl.pathname.replace(/\/$/, '') || '/';
  if (path === '/api/auth/login') return NextResponse.next();
  let claims;
  try { claims = await verifyToken(request.cookies.get(COOKIE_NAME)?.value); } catch {}
  if (path === '/login') return claims ? NextResponse.redirect(new URL(homeFor(claims.role), request.url)) : NextResponse.next();
  if (path.startsWith('/api/')) {
    if (!claims) return NextResponse.json({ error: 'Please sign in' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    if (!canAccessAPI(path, request.method, claims.role)) return NextResponse.json({ error: 'Access denied' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.next();
  }
  if (!claims) return NextResponse.redirect(new URL('/login', request.url));
  if (path === '/' || !canAccessPage(path, claims.role)) return NextResponse.redirect(new URL(homeFor(claims.role), request.url));
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store, private');
  return response;
}
export const config = { matcher: ['/', '/login', '/dashboard/:path*', '/employees/:path*', '/attendance/:path*', '/salary/:path*', '/expenses/:path*', '/me/:path*', '/work-hours/:path*', '/api/:path*'] };
