'use client';
import { useState } from 'react';
import { ArrowRight, CalendarCheck2, ShieldCheck, Wallet } from 'lucide-react';
import { send } from '@/lib/client';
import { homeFor } from '@/lib/permissions';
import { ErrorBox, Field } from '@/components/ui';
export default function Login() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try { const data = await send('/api/auth/login', 'POST', values); window.location.replace(homeFor(data.role)); }
    catch (e) { setError(e.message); setBusy(false); }
  }
  return <div className="login-page"><section className="login-story"><div className="brand text-white"><span className="brand-mark !bg-white/15">a<span>↗</span></span><span>appnix<small>STAFF MANAGER</small></span></div><div><p className="eyebrow !text-emerald-200">LESS ADMIN. MORE MOMENTUM.</p><h1>A good day<br />starts with<br /><span>your people.</span></h1><p className="max-w-sm text-emerald-100/80 mt-6 leading-7">Attendance, salaries, and shared expenses. Everything your team needs, in one calm workspace.</p><div className="flex flex-wrap gap-3 mt-8"><span className="story-chip"><CalendarCheck2 size={17} /> Track attendance</span><span className="story-chip"><Wallet size={17} /> Keep things balanced</span></div></div><p className="text-xs text-emerald-100/60">Built for the people behind your business.</p></section><section className="login-form-wrap"><form onSubmit={submit} className="login-form"><span className="login-icon"><ShieldCheck size={28} /></span><p className="eyebrow mt-7">WELCOME BACK</p><h2 className="!text-3xl mt-2">Your workspace awaits.</h2><p className="text-muted mt-3 mb-8">Sign in with the credentials from your administrator.</p><ErrorBox message={error} /><div className="space-y-4"><Field label="Organization ID" hint="Your administrator receives this ID during setup."><input name="organizationId" placeholder="24-character organization ID" required minLength={24} maxLength={24} autoCapitalize="none" spellCheck={false} /></Field><Field label="Email or phone"><input name="login" autoComplete="username" placeholder="you@company.com" required autoCapitalize="none" /></Field><Field label="Password"><input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required maxLength={72} /></Field></div><button className="btn w-full mt-7" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={18} /></button><p className="text-xs text-muted text-center mt-5">Secure access, personalized for your role.</p></form></section></div>;
}
