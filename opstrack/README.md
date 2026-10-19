# OpsTrack

A self-hosted web application for engineering and support teams that combines:

- **Daily Tracker** – every engineer logs what they worked on each day: project,
  activity type (Project Work, Customer Support, Meeting, …), duration, related
  ticket and customer. If no project is selected but the text mentions a
  project name, code or keyword, the entry is **linked to that project
  automatically**. That lets you see exactly how many minutes/hours each
  engineer spent on each project and what they did.
- **Dashboard with widgets** – hours logged, project vs. support split, daily
  effort trend, activity mix, effort by project, a *who worked on which
  project* matrix, engineer effort vs. daily target, tickets by status /
  priority, team workload, latest updates and *not logged today*. Filter by
  date range, engineer and project; show/hide widgets per user.
- **Tickets (ITSM)** – service-desk queue with priorities, SLA due dates,
  conversation, internal notes, history and time logging against tickets.
- **Projects** – create / modify / delete projects with code, client,
  manager, budget hours and auto-detect keywords; project page shows effort by
  engineer and activity.
- **Reports** – Project × Engineer effort summary and detailed log, CSV export.
- **Team** – directory and reporting-manager org chart.
- **Settings (⚙ gear icon)**
  - **Users** – create, modify, delete, enable/disable, reset password,
    assign **profile** and **reporting manager**.
  - **Profiles & Permissions** – customised profiles (roles) with a
    per-module permission matrix (view / create / modify / delete / see
    everyone / assign). Clone existing profiles.
  - **Forms** – form builder; each form creates tickets. Forms can be published
    as a public self-service portal link (`/portal/<form-id>`, no login needed).
  - **Email (Inbound / Outbound)** – connect any cloud or on-premises mail
    system: Microsoft 365, Google Workspace, Zoho, Amazon SES, SendGrid,
    Exchange Server, or any SMTP/IMAP server. Inbound mailboxes are polled and
    emails become tickets (replies with `[INC-1234]` in the subject are added to
    the existing ticket). Outbound sends assignment notifications,
    acknowledgements and workflow emails. Built-in *Test*, *Fetch now* and
    *Send test* buttons, plus an email activity log.
  - **Workflow Automation** – build your own workflows:
    *trigger* (ticket created / updated, form submitted, email received, or a
    **schedule** for automatic ticket creation) → *conditions* (any field,
    including individual form fields) → ordered *actions* (assign to user,
    round-robin, **least-loaded by workload**, set priority/status/category/
    project, add note, send email, create ticket). Includes an execution log.
  - **General** – workspace name, ticket prefix, workload thresholds, daily
    target hours, categories, statuses and SLA hours.
  - **Audit log**.

### Workload lights and online status

Wherever you assign a ticket, each person shows a light with their number of
open tickets. Hover over it to see the breakdown by priority and status:

| Light | Meaning |
|-------|---------|
| ⚪ White | Free – no open tickets |
| 🟢 Green | Available – 1 to *N* open tickets (N is set in Settings → General, default 3) |
| 🔴 Red | Busy – more than *N* open tickets |

A **green dot** on a person's avatar means they are signed in and active right
now. The browser sends a heartbeat every 30 seconds, and signing out removes
the dot immediately.

## Running it

Requires Node.js 18+.

```bash
cd opstrack
npm install
npm run demo     # optional: sample engineers, projects, 3 weeks of entries, tickets, workflows
npm start        # http://localhost:3000
```

Sign in with **username `admin`, password `admin`**. Change the password from
the user menu after the first sign-in. Demo users (if you ran `npm run demo`):
`priya`, `rahul` (managers), `amit`, `sneha`, `vikram` (engineers), `neha`,
`arjun` (support), all with password `Welcome@123`.

Environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | Where `db.json` is stored |

For production, put it behind HTTPS (nginx, IIS ARR, Caddy, or a cloud load
balancer) and back up `data/db.json`.

## Deploying online

### Render – free (recommended)

Render's free plan has no permanent disk, so the app stores its data in a free
PostgreSQL database instead. Neither service needs a payment card.

1. **Create the database.** Sign up at [neon.tech](https://neon.tech) (or
   [supabase.com](https://supabase.com)) and create a project. Copy its connection string.
   It looks like `postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`.
   On Supabase, use the *Session pooler* string from **Connect**.
2. **Create the app.** Sign in at [render.com](https://render.com) with GitHub, click
   **New → Blueprint** and pick this repository. Render reads `render.yaml`.
3. When Render asks for:
   - `DATABASE_URL`: paste the connection string from step 1.
   - `ADMIN_PASSWORD`: choose the password for the `admin` account. If you leave it blank,
     the password is `admin`, which anyone could guess on a public site.
4. Click **Apply**. After the build, Render shows the address, for example
   `https://opstrack.onrender.com`.

Free-plan behaviour: the app goes to sleep after 15 minutes without visitors.
The next visit wakes it in about a minute. Your data is not affected.

If Supabase rejects the connection with a certificate error, add the variable
`DATABASE_SSL_VERIFY=false` in the Render service's **Environment** tab.

To load sample data into the hosted database, run this from a computer that has a copy of the repository:

```bash
cd opstrack
npm install
DATABASE_URL='<your connection string>' npm run demo
```

For permanent file storage instead of PostgreSQL, change `plan: free` to
`plan: starter` in `render.yaml` and add a disk. That costs about US$7.25 per month.

### Docker (any cloud VM, Azure, AWS, on-premises server)

```bash
cd opstrack
docker build -t opstrack .
docker run -d --name opstrack -p 3000:3000 -v opstrack-data:/data \
  -e ADMIN_PASSWORD='choose-a-strong-password' opstrack
```

Put it behind HTTPS (nginx, Caddy, IIS, or your cloud's load balancer).

| Variable | Default | Purpose |
|----------|---------|---------|
| `ADMIN_PASSWORD` | `admin` | Password for the `admin` account created on first start (ignored once it exists) |
| `DATABASE_URL` | – | PostgreSQL connection string. When set, data is stored there instead of `DATA_DIR` |
| `DATABASE_SSL_VERIFY` | `true` | Set to `false` if the database uses a certificate Node.js can't verify |
| `TRUST_PROXY` | `1` | Number of reverse proxies in front of the app; set to `0` when exposed directly |

## Data visibility rules

- Users with **Daily Tracker → See everyone** see everyone's entries.
  Everyone else sees their own entries plus those of their direct and indirect
  reportees (via *reporting manager*).
- Users with **Tickets → See everyone** see the whole queue. Everyone else
  sees tickets assigned to them, raised by them, or assigned to their reportees.
- Without **Tickets → Assign**, an engineer can only pick up an unassigned
  ticket for themselves.

## Project structure

```
server.js            Express API + static hosting
lib/db.js            datastore: JSON file, or PostgreSQL when DATABASE_URL is set
lib/auth.js          password hashing (scrypt), sessions, presence, permissions
lib/seed.js          default profiles, admin user, settings, sample form
lib/tickets.js       ticket service, workload calculation, notifications
lib/workflow.js      workflow engine + scheduler
lib/email.js         SMTP (nodemailer) / IMAP (imapflow) channels
public/              single-page web app (vanilla JS + Chart.js)
scripts/seed-demo.js demo data
```

## Notes

- Email passwords and tokens are stored in `data/db.json` and are never sent
  back to the browser. Restrict file-system access to that folder.
- OAuth2 for Microsoft 365 / Google is supported by pasting an access token. If
  your tenant allows it, an app password is simpler to set up.
- The datastore suits teams up to a few hundred users. The `lib/db.js` API is
  small, so it can be replaced with PostgreSQL / SQL Server later.
