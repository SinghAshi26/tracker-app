'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, KeyRound, UserPlus, Eye, EyeOff } from 'lucide-react';
import { api, send, today, currency } from '@/lib/client';
import { SALARY_DAY_DIVISOR, suggestedPerDayRate } from '@/lib/payroll-settings';
import { useLoad, PageTitle, Loading, ErrorBox, Empty, Field, Modal, Avatar } from '@/components/ui';
export default function Employees() {
  const { data, loading, error, reload } = useLoad(async () => { const [a, b] = await Promise.all([api('/api/employees'), api('/api/users')]); return { ...a, ...b }; });
  const [search, setSearch] = useState(''), [modal, setModal] = useState(null), [busy, setBusy] = useState(false), [formError, setFormError] = useState('');
  const [loginId, setLoginId] = useState(''), [newPassword, setNewPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState(''), [showPassword, setShowPassword] = useState(false), [toast, setToast] = useState(null);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3500); return () => clearTimeout(timer); }, [toast]);
  const filtered = useMemo(() => data?.employees.filter(e => `${e.name} ${e.phone}`.toLowerCase().includes(search.toLowerCase())) || [], [data, search]);
  const [monthlySalary, setMonthlySalary] = useState(''), [perDayRate, setPerDayRate] = useState('');
  function open(value) { setFormError(''); setMonthlySalary(value.employee?.monthlySalary ?? ''); setPerDayRate(value.employee?.perDayRate ?? ''); setModal(value); }
  function openLogin(user) { setFormError(''); setLoginId(user.login || ''); setNewPassword(''); setConfirmPassword(''); setShowPassword(false); setModal({ type: 'update-login', user }); }
  function changeMonthlySalary(value) { setMonthlySalary(value); setPerDayRate(value === '' ? '' : suggestedPerDayRate(value).toFixed(2)); }
  async function save(e) {
    e.preventDefault(); setBusy(true); setFormError('');
    const v = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (modal.type === 'employee') await send('/api/employees', modal.employee ? 'PATCH' : 'POST', { ...v, monthlySalary: Number(v.monthlySalary), perDayRate: Number(v.perDayRate), active: v.active === 'true', ...(modal.employee ? { employeeId: modal.employee._id } : {}) });
      else await send('/api/users', 'POST', { ...v, role: modal.type === 'partner' ? 'partner' : 'employee', ...(modal.employee ? { employeeId: modal.employee._id } : {}) });
      setModal(null); await reload();
    } catch (err) { setFormError(err.message); } finally { setBusy(false); }
  }
  async function saveLogin(e) {
    e.preventDefault(); setBusy(true); setFormError('');
    if (newPassword && newPassword !== confirmPassword) { setFormError('Passwords do not match.'); setBusy(false); return; }
    try {
      await send(`/api/users/${modal.user._id}/login`, 'PATCH', { loginId, ...(newPassword ? { password: newPassword, confirmPassword } : {}) });
      setModal(null); setToast({ message: 'Login updated successfully.', error: false }); await reload();
    } catch (err) { setFormError(err.message); setToast({ message: err.message, error: true }); } finally { setBusy(false); }
  }
  async function toggleLoginDisabled() {
    const disabled = !modal.user.loginDisabled;
    if (!window.confirm(`${disabled ? 'Disable' : 'Enable'} this login? ${disabled ? 'The user will be signed out and cannot sign in.' : 'The user will be able to sign in again.'}`)) return;
    setBusy(true); setFormError('');
    try {
      await send(`/api/users/${modal.user._id}/login`, 'PATCH', { disabled });
      setModal(null); setToast({ message: disabled ? 'Login disabled.' : 'Login enabled.', error: false }); await reload();
    } catch (err) { setFormError(err.message); setToast({ message: err.message, error: true }); } finally { setBusy(false); }
  }
  return <>
    <PageTitle eyebrow="PEOPLE FIRST" title="Your team" subtitle="Good work starts with a well-supported team.">
      <button className="btn-secondary" onClick={() => open({ type: 'partner' })}><UserPlus size={17} />Add partner</button>
      <button className="btn" onClick={() => open({ type: 'employee' })}><Plus size={18} />Add employee</button>
    </PageTitle>
    <ErrorBox message={error} />
    <section className="panel">
      <div className="panel-title">
        <div><h2>Employee directory</h2><p>{data?.employees.filter(e => e.active).length || 0} active team members</p></div>
        <label className="search-box"><Search size={18} /><input aria-label="Search employees" placeholder="Search your team" value={search} onChange={e => setSearch(e.target.value)} /></label>
      </div>
      {loading ? <Loading /> : filtered.length ? <div className="employee-grid">
        {filtered.map(employee => {
          const loginUser = data.users.find(user => user.employeeId === employee._id);
          return <article className="employee-card" key={employee._id}>
            <div className="flex items-center gap-3"><Avatar name={employee.name} /><div className="flex-1 min-w-0"><h3 className="truncate">{employee.name}</h3><p className="text-xs text-muted mt-1">{employee.phone || 'No phone added'}</p><p className="text-xs text-muted">ID · {employee.employeeCode || 'Assigning…'}</p></div><span className={`status ${employee.active ? 'status-present' : 'status-unmarked'}`}>{employee.active ? 'Active' : 'Inactive'}</span></div>
            <div className="grid grid-cols-2 gap-3 my-5"><div><p className="text-xs text-muted">Monthly salary</p><strong className="text-lg">{currency(employee.monthlySalary)}</strong></div><div><p className="text-xs text-muted">Per day</p><strong className="text-lg">{currency(employee.perDayRate)}</strong></div></div>
            <div className="flex flex-wrap justify-between items-center gap-2 border-t pt-3">
              <button className="text-link touch-button" onClick={() => open({ type: 'employee', employee })}><Pencil size={15} />Edit details</button>
              {loginUser ? <button className="text-link touch-button" onClick={() => openLogin(loginUser)}><KeyRound size={15} />Update login</button> : employee.active && <button className="text-link touch-button" onClick={() => open({ type: 'login', employee })}><KeyRound size={15} />Create login</button>}
            </div>
          </article>;
        })}
      </div> : <Empty title={search ? 'No matching employees' : 'Make room for your people'} text={search ? 'Try another name or phone number.' : 'Add an employee to start tracking attendance and salary.'} />}
    </section>
    {data?.users.some(user => user.role === 'partner') && <section className="panel mt-6"><div className="panel-title"><div><h2>Partners</h2><p>Shared expenses, shared visibility.</p></div></div>
      {data.users.filter(user => user.role === 'partner').map(user => <div className="list-row" key={user._id}><Avatar name={user.name} /><div className="flex-1 min-w-0"><h3>{user.name}</h3><p className="text-xs text-muted">{user.login}</p></div><button className="text-link touch-button" onClick={() => openLogin(user)}><KeyRound size={15} />Update login</button></div>)}
    </section>}
    {modal && <Modal title={modal.type === 'employee' ? modal.employee ? 'Edit employee' : 'Add employee' : modal.type === 'partner' ? 'Add partner login' : modal.type === 'login' ? `Create login for ${modal.employee.name}` : 'Update login'} onClose={() => { if (!busy) setModal(null); }}>
      {modal.type === 'update-login' ? <form onSubmit={saveLogin}>
        <ErrorBox message={formError} />
        <div className="space-y-4">
          <Field label="Login ID (phone or email)"><input type="text" required maxLength={120} autoComplete="username" value={loginId} onChange={e => setLoginId(e.target.value)} /></Field>
          <Field label="New password" hint="Leave blank to keep the current password. Minimum 8 characters."><div className="relative"><input className="pr-11" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={72} value={newPassword} onChange={e => setNewPassword(e.target.value)} /><button type="button" className="icon-button absolute right-1 top-1/2 -translate-y-1/2" aria-label={showPassword ? 'Hide new password' : 'Show new password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></Field>
          {newPassword && <Field label="Confirm new password"><input type="password" required autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></Field>}
          <button disabled={busy} type="submit" className="btn w-full">{busy ? 'Saving…' : 'Save login'}</button>
          <div className="border-t pt-4"><button type="button" disabled={busy} className="text-link touch-button" onClick={toggleLoginDisabled}>{modal.user.loginDisabled ? 'Enable login' : 'Disable login'}</button></div>
        </div>
        {toast && <div role={toast.error ? 'alert' : 'status'} aria-live={toast.error ? 'assertive' : 'polite'} className={`fixed z-[90] bottom-24 left-1/2 -translate-x-1/2 w-[min(420px,calc(100%-24px))] ${toast.error ? 'error-box' : 'info-box'}`}>{toast.message}</div>}
      </form> : <form onSubmit={save}>
        <ErrorBox message={formError} />
        <div className="space-y-4"><Field label="Full name"><input name="name" required maxLength={100} defaultValue={modal.employee?.name || ''} /></Field>
          {modal.type === 'employee' ? <><Field label="Phone number"><input name="phone" type="tel" maxLength={30} defaultValue={modal.employee?.phone || ''} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Monthly salary (₹)"><input name="monthlySalary" type="number" min="0" max="100000000" step="0.01" required value={monthlySalary} onChange={e => changeMonthlySalary(e.target.value)} /></Field><Field label="Per-day rate (₹)"><input name="perDayRate" type="number" min="0" max="100000000" step="0.01" required value={perDayRate} onChange={e => setPerDayRate(e.target.value)} /></Field></div><p className="text-xs text-muted">Auto-calculated from monthly salary (÷{SALARY_DAY_DIVISOR}). You can edit it.</p><Field label="Joining date"><input name="joiningDate" type="date" required defaultValue={modal.employee?.joiningDate || today()} /></Field><Field label="Employment status" hint="Deactivating blocks employee login and new attendance; historical records remain."><select name="active" defaultValue={String(modal.employee?.active ?? true)}><option value="true">Active</option><option value="false">Inactive</option></select></Field></> : <><Field label="Login email or phone"><input name="login" required maxLength={120} autoComplete="off" placeholder="name@example.com or +919876543210" /></Field><Field label="Initial password" hint="10–72 characters. Share these credentials securely with the account holder."><input name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" /></Field><div className="info-box">{modal.type === 'partner' ? 'Partners can view and add expenses, see balances, and record their outgoing settlements.' : 'This login only has read access to this employee’s attendance, advances, and salary estimate.'}</div></>}
        </div>
        <button disabled={busy} className="btn w-full mt-6">{busy ? 'Saving…' : modal.type === 'employee' ? 'Save employee' : 'Create login'}</button>
      </form>}
    </Modal>}
    {toast && !modal && <div role={toast.error ? 'alert' : 'status'} aria-live={toast.error ? 'assertive' : 'polite'} className={`fixed z-[90] bottom-24 left-1/2 -translate-x-1/2 w-[min(420px,calc(100%-24px))] ${toast.error ? 'error-box' : 'info-box'}`}>{toast.message}</div>}
  </>;
}
