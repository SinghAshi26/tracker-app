# Appnix Staff Manager

A mobile-first staff workspace built with **Next.js 14 App Router, JavaScript, React 18, MongoDB Atlas / Mongoose, Tailwind CSS, jose, bcryptjs, and Zod**. It includes role-based attendance, employee accounts, salary estimates, advances, shared expenses, settlements, and an installable PWA.

## Run locally

Use Node.js 22 LTS and npm. The minimum supported Node version is 20.9.

```powershell
npm install
Copy-Item .env.example .env
```

**If `.env` already exists, keep it and update its values instead of overwriting it.** Set:

```dotenv
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/appnix?retryWrites=true&w=majority
JWT_SECRET=your-random-secret-of-at-least-32-bytes
SEED_ORG_NAME=Appnix
SEED_ADMIN_NAME=Administrator
SEED_ADMIN_LOGIN=admin@example.com
SEED_ADMIN_PASSWORD=your-strong-initial-password
```

Generate a JWT secret locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Create an Atlas database user with read/write access to the application database, copy its connection URI, and configure Atlas network access for your development machine. URL-encode reserved characters in the database password. Never use your Atlas website account password in the connection string.

```powershell
npm run seed
npm run dev
```

Open **http://localhost:3000**. The seed prints the **Organization ID** and admin login. Sign in with that ID, login, and your configured password. The organization ID is a public tenant identifier, not an authentication secret.

The seed creates an organization and its first admin in a MongoDB transaction, initializes all collections/indexes, and preserves an existing account's password. It locates the organization by the configured seed name; use a distinct name when seeding another organization. Atlas supports the required transactions. A local standalone MongoDB instance must be configured as a replica set to run the seed.

Next.js loads `.env` automatically. `npm run seed` explicitly reads `.env`; use the same values for both. If you choose `.env.local`, invoke `node --env-file=.env.local scripts/seed.js` instead and keep your environment files consistent.

## First-use workflow

1. Add employees from **Employees**, including monthly salary and joining date. Changing monthly salary suggests a per-day rate using `SALARY_DAY_DIVISOR` in `lib/payroll-settings.js` (default **30**, rounded to two decimals). You can override the rate; the override remains until monthly salary changes again. Opening an existing employee preserves their saved rate.
2. Use **Create login** on an employee card to set their email/phone and initial password. Share those credentials and the organization ID securely.
3. Use **Add partner** to create an expense participant. Admins and partners can participate in splits; employee accounts cannot.
4. Pick a date in **Attendance**, tap P / A / H / L, or mark all present, then **Save attendance**.
5. Review **Salary & advances**, issue advances, and download the selected month's CSV.
6. Add an expense with selected participants. Equal splits distribute leftover paise deterministically; custom splits must total the full amount.
7. Review the all-time balances. After a real payment happens, choose **Settle up** to record it. Appnix records payments; it does not send money.

Deactivating an employee blocks their login and invalidates access on their next authenticated API call. Historical attendance, salary, and advances remain visible to the admin. Reactivating restores access to the existing login.

## Roles and access

| Capability | Admin | Partner | Employee |
| --- | --- | --- | --- |
| Dashboard and employee directory | Yes | No | No |
| Create employee/partner accounts | Yes | No | No |
| Attendance | Read / write | No | Own records, read only |
| Salary and advances | Read / issue advances / CSV | No | Own records, read only |
| Expenses and balances | Read / add | Read / add | **Never** |
| Settlements | Record any organization payment | Record own outgoing payments | No |

Middleware uses a default-deny route/method/role matrix and verified JWTs. **Each API handler independently enforces roles and revalidates the user against the database**, so access does not depend on middleware or hidden buttons. Every tenant-owned query uses the authenticated `organizationId`. Employee APIs derive `employeeId` from the account, not client input; requests for another employee are rejected.

The `Organization` collection is the tenancy root and is looked up by `_id`, which is the authenticated organization ID. The seed is the only bootstrap operation that finds this root by name. No tenant-owned query operates without an organization filter. No unscoped `populate()` calls are used.

Logins use a globally unique normalized `login` field accepting either an email or a phone number. Enter phone numbers consistently, including the country prefix if used. Logins also require an organization ID so the password lookup stays tenant-scoped.

Authentication uses 12-hour HS256 JWTs (issuer and audience verified), bcrypt cost 12, and `httpOnly`, `SameSite=Lax` cookies, with `Secure` in production. JWTs and passwords never go into localStorage. Database-backed login attempt limits allow 10 attempts per organization/login per 15 minutes; this works across serverless instances. Successful login clears the counter. Passwords must contain 10–72 characters and at most 72 UTF-8 bytes.

All mutations, including login/logout, require a same-origin `Origin` header. API clients must send it explicitly along with the session cookie. All authenticated JSON and CSV responses use `Cache-Control: no-store`. Error responses do not expose connection strings or stack traces. Employee deactivation/user removal/current-role changes are checked on every API call.

## Salary and splits

```text
payableDays = presentDays + 0.5 × halfDays + sundayPaidDays + rebateDays
earnedSalary = payableDays × perDayRate
estimatedSalary = earnedSalary − advances dated within the selected month
```

Sundays are weekly off and paid by default. The admin's **Paid Sundays** checkbox on Salary changes the organization-level `sundayPaid` setting. A Sunday marked Present counts once as a normal worked day; other legacy Sunday statuses remain stored but are treated as weekly off. Weekday Leave/Absent records can receive a **Give rebate** toggle and optional note; each rebate adds one paid day. Rebates never double-count Sundays, Present, or Half days. Dates before joining are disabled and excluded from salary, rebates, Sundays, and advances.

Each employee/date still has at most one attendance record. Advances are selected by payment date within the month. Estimates use integer paise, round the final earned amount to two decimals, allow negative net salary, and include the full selected month's eligible Sundays (including remaining Sundays in the current month). Current rates and attendance affect estimates. Overtime, statutory deductions, and historical rate schedules are not included.

Admin **Mark as credited** requires confirmation and freezes the rate, day counts, rebates, advances, gross/net salary, employee name/phone, credited date, and crediting admin. Concurrent/repeated credit requests cannot replace a credited snapshot. **Undo** returns the month to Pending and withdraws the slip; re-credit uses the latest calculation. SalaryPayment has a unique organization/employee/month index. The PDF always reads the frozen snapshot, even after attendance, salary, or organization settings change.

Employees can navigate from their joining month through the current month, see rebate dates/notes and totals, and download a Salary Slip only for credited months. Pending months show **Salary slip not available yet**. `GET /api/salary-slip?month=YYYY-MM&employeeId=...` permits only the owning employee or an admin in the same organization; partners are denied. Payment writes (`POST /api/salary-payments`) and settings (`PATCH /api/organization/settings`) are admin-only, validated with Zod, and checked in both middleware and the route. Slips use a small server-side PDF writer and a bundled OFL-licensed Noto Latin font, without native executables, added dependencies, or runtime downloads. Currency is labeled INR; characters outside the bundled font are explicitly represented by their Unicode code rather than omitted.

Legacy reads safely default missing `Attendance.rebate` to false, `rebateNote` to an empty string, and `Organization.sundayPaid` to true. No destructive migration is required. To persist defaults and create the SalaryPayment index for an existing organization, run the idempotent, tenant-scoped command (or rerun the existing seed):

```powershell
npm run migrate:payroll -- --organization-id=YOUR_ORGANIZATION_ID
```

The migration only fills missing fields. Existing attendance, explicit settings (including `sundayPaid: false`), rebates, and employee rates are preserved. Existing records are never credited automatically.

```text
expenseBalance = totalPaid − totalShares
remainingBalance = expenseBalance + settlementsSent − settlementsReceived
```

Positive balance means money to receive; negative means money owed. Balances use **all expenses and settlements across all months**. The month/category/payer filters apply to the expense list and its total, not the balances. Suggested transfers reduce each debtor/creditor balance until the ledger is settled. Settlement entries are separate from expenses and do not inflate expense totals. A unique organization/request ID protects settlement retries from duplicate records. An overpayment is recorded as an actual payment and reverses the corresponding balance.

## Screens and API

| Screen | Route |
| --- | --- |
| Login | `/login` |
| Admin overview | `/dashboard` |
| Employee directory and account creation | `/employees` |
| Daily attendance | `/attendance` |
| Salary, advances, CSV | `/salary` |
| Expenses, splits, and settlements | `/expenses` |
| Employee personal calendar and salary | `/me` |

| API | Methods | Purpose |
| --- | --- | --- |
| `/api/auth/login` | POST | Organization ID, login, password |
| `/api/auth/logout` | POST | Clear session cookie |
| `/api/auth/me` | GET | Current safe user profile and organization |
| `/api/dashboard?date=YYYY-MM-DD` | GET | Admin daily/monthly overview |
| `/api/employees` | GET, POST, PATCH | Manage tenant employees; PATCH requires `employeeId` |
| `/api/users` | GET, POST | Participants / account creation |
| `/api/attendance?date=YYYY-MM-DD` or `?month=YYYY-MM` | GET, PUT | Read attendance / save a batch |
| `/api/advances?month=YYYY-MM` | GET, POST | Monthly advances / add advance |
| `/api/salary?month=YYYY-MM[&format=csv]` | GET | Salary with attendance/advance breakdown |
| `/api/expenses?month=YYYY-MM[&category=Meals&paidBy=ID]` | GET, POST | Filtered expense ledger / add expense |
| `/api/balances` | GET | All-time balances and suggested payments |
| `/api/settlements` | GET, POST | Settlement ledger / record repayment |

Attendance, advance, and salary GET endpoints optionally accept `employeeId`; employee accounts can only supply their own ID. Zod validates request bodies, ObjectIds, money precision, calendar dates, statuses, duplicate participants, and months. JSON bodies are limited to 64 KiB. Write routes only accept documented fields and never accept an organization ID from the client, except public login.

## PWA

- `public/manifest.json`, 192px/512px icons, a maskable icon, and an Apple touch icon are included.
- A manual service worker registers in **production**. It caches public assets and hashed framework JS/CSS only. It never caches authenticated pages, API responses, CSV, or session data.
- An offline navigation displays a neutral reconnect page. Mutations require connectivity; there is no offline write queue and no claim of offline attendance sync.
- Android Chrome exposes an install prompt where supported. On iPhone/iPad, open in Safari and select **Share → Add to Home Screen**; the app shows an installation hint.
- Bottom navigation, 44px+ controls, safe-area padding, and responsive layouts support 360px-wide screens. Calendar status includes a letter as well as color.
- Production cookies require HTTPS. Test a full authenticated production build on an HTTPS deployment; use `npm run dev` for ordinary localhost login. The service worker can be inspected using localhost as a secure browser context.
- Regenerate the checked-in icons with `node scripts/generate-icons.js`.

## Deploy to Vercel

The app uses standard Next.js Node.js functions and cached Mongoose connections; it does not require a separate server, paid queue, Redis, or cron.

1. Commit the project to a private GitHub/GitLab/Bitbucket repository. Keep all `.env` files and secrets out of Git. After a successful `npm install`, commit the generated `package-lock.json` for reproducible deployments.
2. Create a MongoDB Atlas free cluster where available. Create a least-privilege database user and configure the [Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/) so Vercel can connect. Standard serverless outbound addresses vary. If using `0.0.0.0/0`, restrict the database user's privileges and use a strong, unique password; this permits connections from all addresses but still requires database authentication and TLS.
3. Import the repository into Vercel. Select **Next.js**, repository root, Node.js **22.x**, build command `npm run build`, and the default output directory.
4. Add `MONGODB_URI` and `JWT_SECRET` to the appropriate Vercel environments. Use a separate database and secret for preview deployments. Seed variables are only needed locally, not on Vercel.
5. Run `npm run seed` locally against the intended deployment database once. Keep the printed organization ID. Never seed at build time or on public unauthenticated routes.
6. Deploy and open the HTTPS deployment URL. Sign in with the seeded credentials, add a team member and partner, and check each role.
7. Install the PWA from the deployment URL. Redeploy after changing Vercel environment variables.

**Free-plan qualification:** Vercel Hobby is restricted to personal, non-commercial use. A personal demo can use the free tier within its limits; operating this as an actual business staff system may require a paid plan. See [Vercel Hobby](https://vercel.com/docs/plans/hobby) and [Vercel terms](https://vercel.com/legal/terms). Hosting eligibility cannot be changed by the application code.

**Framework version:** The project deliberately stays on the requested Next.js 14 line, with `^14.2.35` as its minimum. Next.js 14 is outside current LTS support. Install the latest available security patches in that line and plan an upgrade before long-term production operation. Consult the [Next.js support policy](https://nextjs.org/support-policy) and [security update](https://nextjs.org/blog/security-update-2025-12-11).

## Verification

```powershell
npm test
npm run test:integration
npm run build
```

- Unit tests cover salary, half days, advance deductions, rounding, paise conservation, balancing/settling, CSV formula escaping, API roles, and page access.
- Integration tests start an isolated temporary MongoDB instance and exercise the actual route handlers and middleware. They check login cookies, tenant isolation, employee expense denial and own-record access, partner restrictions, attendance uniqueness, invalid expense participants/sums, settlement retries, CSRF protection, and deactivation. They do not use the configured Atlas database. The first run downloads a MongoDB binary and needs internet access and process-spawning permission.
- For environments that prohibit test-runner subprocesses, the dependency-free suites can run directly: `node tests/calculations.test.js` and `node tests/permissions.test.js`.
- Manual acceptance: test 360px and desktop layouts, all three roles, sign out/sign in as another user, cross-tenant ID rejection, CSV downloads, equal/custom splits, settlement history, and offline/install behavior over HTTPS.

Payroll-change verification: **21 unit tests passed**, including full-month Sundays, worked-Sunday and rebate deduplication, pre-joining exclusions, legacy defaults, role permissions, and PDF cross-reference/font/content checks. JavaScript/JSX syntax checks passed. The production build and isolated MongoDB integration suite were attempted but blocked by the environment's `spawn EPERM` restriction. No live payroll data was changed or migrated during implementation.

## Folder structure

```text
app/
  (workspace)/          # Authenticated mobile/desktop screens
  api/                  # Independently authorized route handlers
  login/                # Organization-aware login
  globals.css           # Tailwind + responsive design system
  layout.js             # Metadata, PWA registration
components/
  shell.js              # Session context, sidebar, bottom navigation
  ui.js                 # Forms, dialogs, loading/errors, data hook
  pwa.js                # Install prompts and connectivity state
lib/
  api.js                # Tenant-scoped authentication and route wrapper
  calculations.js       # Salary, integer-money splits, balances, CSV
  client.js             # Browser API and presentation helpers
  finance.js            # Organization ledger aggregation
  mongodb.js            # Global cached serverless connection
  permissions.js        # Default-deny role matrix
  salary.js             # Monthly employee calculations
  token.js              # jose JWT and cookie settings
  validation.js         # Zod schemas and calendar validation
models/index.js         # Mongoose schemas and indexes
public/                 # Manifest, service worker, offline page, icons
scripts/                # Organization/admin seed and icon renderer
tests/                  # Unit and isolated MongoDB integration suites
middleware.js           # Edge-compatible role and JWT gate
```

The ledger is intended for small teams. All-time balance aggregation reads the organization's ledger in memory; for a larger deployment, introduce pagination and database aggregation. Password reset, MFA, account revocation beyond role/deactivation checks, expense editing/deletion, and a full audit trail are not included in the requested workflows. Clearing a cookie signs out the current browser; a previously copied JWT remains valid until expiry unless its user is removed, role changes, or linked employee is deactivated.
