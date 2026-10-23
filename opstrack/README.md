# OpsTrack

**Time tracking and IT service management (ITSM) for engineering and support teams.**

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
- **Tickets (ITSM)** – service-desk queue following the ITIL incident process: P1–P4 priority
  from impact × urgency, response and resolution SLAs (24×7 or business hours), on-hold pausing,
  escalation, resolution codes, auto-close and reopen; plus conversation, internal notes,
  history and time logging against tickets. See [SLA and priority (ITIL)](#sla-and-priority-itil).
- **Devices & Remote** – inventory of PCs, servers and network devices, with one-click
  **remote desktop, terminal and file sessions** through MeshCentral or Apache Guacamole.
  Sessions open inside OpsTrack with a timer and notes. When an engineer ends a session,
  its time is logged to their Daily Tracker, linked to the ticket and project.
  See [Remote management](#remote-management).
- **Projects** – create / modify / delete projects with code, client,
  manager, budget hours and auto-detect keywords; project page shows effort by
  engineer and activity.
- **Reports** – Project × Engineer effort summary and detailed log, CSV export.
- **Team** – directory and reporting-manager org chart.
- **Push notifications** – browser and phone alerts (Chrome, Edge, Firefox, Safari, Android,
  iPhone) for tickets assigned to you, changes and comments on your tickets, and new tickets.
  Each person chooses what they receive. See [Push notifications](#push-notifications).
- **Email notifications for ticket updates** – requesters hear about status changes and replies,
  engineers about changes and comments by others, and CC addresses on a ticket get updates too. See
  [Email notifications](#email-notifications-for-ticket-updates).
- **Notifications** – new and assigned tickets are posted to Microsoft Teams and Slack
  channels and sent by WhatsApp (Meta Cloud API or Twilio) and SMS (Twilio, Vonage or any HTTP
  SMS gateway), filtered by priority. See [Notifications](#notifications-teams-slack-whatsapp-sms).
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
    target hours, categories and statuses.
  - **SLA & Priority (ITIL)** – priority matrix, response / resolution targets, business hours,
    holidays, pending statuses, escalation and auto-close.
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
npm run demo     # optional: sample team, roles, projects, ticket types, tickets, 3 weeks of entries
npm start        # http://localhost:3000
```

Sign in with **username `admin`, password `admin`**. Change the password from
the user menu after the first sign-in.

#### Demo data (`npm run demo`)

The demo script loads a realistic sample organisation. It runs only on an empty database.

| What | Count | Examples |
|------|-------|----------|
| Team members | 15 | managers, team leads, engineers, L1/L2 support, intern, auditor |
| Roles (profiles) | 13 | Administrator, Manager, Project Manager, Team Lead, Engineer, Cloud / DevOps Engineer, Network Engineer, Security Analyst, L2 Support Engineer, Support Agent, Customer Success, Intern, Auditor (read-only) |
| Projects | 13 | Cloud Migration, ERP Upgrade, Network Refresh, SD-WAN Deployment, Kubernetes Platform, SIEM Implementation (Planned), Backup Modernisation (On Hold), CRM Integration (Completed)… |
| Ticket types | 12 | Incident, Service Request, Problem, Change Request, Access Request, Hardware, Software Installation, Network, Security, Email & Collaboration, Password Reset, Query |
| Tickets | 15 | spread over every status, priority and channel (web, email, form, portal, automation) |
| Tracker entries | ~1,200 | 3 weeks of project work, customer support, meetings and training |
| Devices | 12 | laptops, servers, VMs, firewall, switch, printer (one retired), with 6 past remote sessions |
| Workflows | 4 | critical-incident auto-assign, VPN/network routing, security routing, daily health-check ticket |

All demo users have the password `Welcome@123`:

| Username | Name | Role | Reports to |
|----------|------|------|------------|
| `priya` | Priya Sharma | Manager – Engineering | admin |
| `rahul` | Rahul Verma | Manager – Service Desk | admin |
| `anjali` | Anjali Desai | Project Manager | admin |
| `karan` | Karan Singh | Team Lead – Cloud | priya |
| `meera` | Meera Iyer | Team Lead – Service Desk | rahul |
| `amit` | Amit Patil | Engineer | karan |
| `sneha` | Sneha Kulkarni | Cloud / DevOps Engineer | karan |
| `sameer` | Sameer Khan | Cloud / DevOps Engineer | karan |
| `vikram` | Vikram Rao | Network Engineer | priya |
| `rohan` | Rohan Gupta | Security Analyst | priya |
| `pooja` | Pooja Nair | L2 Support Engineer | meera |
| `neha` | Neha Joshi | Support Agent (L1) – has 4 open tickets, so shows the red “busy” light | meera |
| `arjun` | Arjun Mehta | Support Agent (L1) | meera |
| `fatima` | Fatima Shaikh | Intern | amit |
| `lakshmi` | Lakshmi Rao | Auditor (read-only) | admin |

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
| `HTTPS_PROXY` | – | Outbound proxy for push notifications (e.g. `http://proxy.corp:8080`) |

## SLA and priority (ITIL)

Tickets follow the ITIL incident process. Everything below can be changed under
**Settings → SLA & Priority (ITIL)**.

**Priority = impact × urgency.** When a ticket is raised you pick the impact (who is affected) and
the urgency (how soon it hurts); the matrix gives the priority. You can still set a priority by
hand. Email and API callers can send `P1`…`P4` or the priority name.

| Impact ↓ / Urgency → | High (work stopped) | Medium (degraded) | Low (can wait) |
|----------------------|---------------------|-------------------|----------------|
| **High** – organisation, a site or many users | P1 Critical | P2 High | P3 Medium |
| **Medium** – a department or several users | P2 High | P3 Medium | P4 Low |
| **Low** – one user | P3 Medium | P4 Low | P4 Low |

**Standard service levels**

| Priority | First response | Resolution | Clock |
|----------|----------------|------------|-------|
| P1 – Critical | 15 minutes | 4 hours | 24×7 |
| P2 – High | 30 minutes | 8 hours | 24×7 |
| P3 – Medium | 2 hours | 16 working hours (2 working days) | Business hours |
| P4 – Low | 8 hours | 40 working hours (5 working days) | Business hours |

- **Business hours:** Monday–Friday, 09:00–18:00 in the server's time zone by default. Set your
  own time zone, hours, working days and holidays. Business-hours targets only count working time.
- **Response:** met by the first reply to the requester (a comment that is not an internal note),
  or by moving the ticket on from *New* / *Open*.
- **Resolution:** met when the ticket reaches *Resolved* or *Closed*.
- **On Hold (pending):** stops the resolution clock until the ticket moves on. A reason is
  recorded: awaiting requester, third party / vendor, a change, or scheduled for later.
- **Warning and breach:**
  - At 75% of a target the assignee is warned. A breach is escalated to the assignee and their
    reporting manager; if nobody owns the ticket, it goes to everyone who can assign tickets.
  - Both appear in the ticket history and the bell, and can be sent to Teams / Slack / WhatsApp /
    SMS channels (events *SLA at risk* and *SLA breached*).
  - Both can start workflows (triggers *SLA is at risk* / *SLA is breached*) to reassign, raise the
    priority or email someone. The demo data includes an example workflow for breached P1 / P2
    tickets.
- **Resolution and closure:**
  - Resolving or closing needs a resolution code (Fixed, Workaround provided, Known error,
    Duplicate, Not reproducible, User guidance given, Cancelled by requester) and resolution
    notes. The notes are included in the status email to the requester.
  - Resolved tickets close automatically after 3 days.
  - A reply from the requester reopens the ticket; reopens are counted.
- **Where you see it:**
  - Each ticket shows both clocks with a progress bar.
  - The ticket list has an SLA column and an SLA filter (breached / at risk / paused / on track).
  - The dashboard has *SLA compliance* and an *SLA performance by priority* table.
  - The CSV export includes both SLAs.

Changing targets recalculates open tickets straight away. Older databases are upgraded
automatically; a custom "hours to resolve" setting carries over as the resolution target.

## In-app notifications

The bell in the top bar shows each person's notifications with an unread count. Notifications arrive
live (no page refresh) and show a short pop-up. The count also appears in the browser tab title.
Clicking a notification opens the ticket and marks it read; **Mark all as read** clears the rest.
Read state is kept in step across all of a person's open tabs.

People get a notification when:
- a ticket is assigned to them;
- someone else changes or comments on their ticket (including requester email replies);
- an SLA on their ticket is at risk or breached (breaches also go to their manager);
- someone **@mentions** them in a comment. Type `@username`, for example `@amit`. The mention only
  notifies people who are allowed to see that ticket;
- a new ticket arrives, if they can see all tickets and chose that.

Nobody is notified about their own changes. Each person picks what they get under user menu →
**Notification settings**; the same choices apply to the bell and to push notifications. The latest
200 notifications per person are kept.

Live updates use Server-Sent Events (`/api/notifications/stream`). Render, the `deploy/` installer
(Caddy) and most proxies work without changes. If you put OpsTrack behind nginx yourself, turn off
response buffering for that path.

## Push notifications

Engineers get alerts on their computer or phone, even when OpsTrack isn't open, using the
standard Web Push built into browsers. No app store app and no third-party account is needed. The
server creates its signing keys (VAPID) on first start and keeps them out of the settings that
browsers can see.

**To turn it on (each person, on each device):** user menu (top right) → **Notification settings** →
**Turn on for this device** → allow notifications. **Send a test** checks it works.

| Device | How |
|--------|-----|
| Windows / macOS / Linux | Chrome, Edge, Firefox or Safari 16+, while the browser is running |
| Android | Chrome or Firefox |
| iPhone / iPad (iOS 16.4+) | Open OpsTrack in Safari, tap **Share → Add to Home Screen**, open it from the new icon, then turn on push |

**Each person chooses what they get** (the same choices as the bell, see above): a ticket
assigned to them, someone else changing or commenting on their ticket (including requester email
replies), @mentions, and new tickets. People who can see
all tickets choose *none*, *Critical only*, *High and Critical* or *all* new tickets. Clicking an alert
opens the ticket. Critical alerts stay on screen until dismissed. Nobody is alerted about their own
changes.

**Requirements**
- OpsTrack must be served over **HTTPS**. Render and the installer in `deploy/` already do this.
  `http://localhost` also works for testing.
- The server must be able to reach the browsers' push services: `fcm.googleapis.com` and `*.google.com`
  (Chrome, Edge, Android), `*.push.services.mozilla.com` (Firefox), `*.push.apple.com` (Safari) and
  `*.notify.windows.com`. Only these hosts are accepted as subscription endpoints. If outbound traffic goes
  through a proxy, set `HTTPS_PROXY`.
- Devices whose subscription has expired (the push service answers 404/410) are removed automatically.
  Failed sends appear in the Notifications delivery log as "Browser push".

## Email notifications for ticket updates

These use your outbound email channel (**Settings → Email**). Choose which ones to send in
**Settings → Notifications (chat & SMS) → Email notifications for ticket updates**:

| Who | Gets an email when | Default |
|-----|--------------------|---------|
| **Requester** | The status changes to one of the ticked statuses (default: In Progress, On Hold, Resolved, Closed) | on |
| **Requester** | An engineer posts a public reply | on |
| **Assigned engineer** | Someone else changes the ticket (status, priority, category, description…) | on |
| **Assigned engineer** | Someone else comments, including requester email replies and internal notes | on |
| **CC on the ticket** | Status, priority or assignee changes, and public replies | on |

- **CC addresses:** add them in the **Notify also (CC)** field on any ticket, for example the
  customer's manager. They're stored de-duplicated, and invalid addresses are dropped.
- **Internal notes** only ever go to the assigned engineer.
- **Your own changes:** nobody is emailed about a change they made themselves.
- **What requesters and CCs see:** their emails show only status, priority, assignee and subject
  changes. They don't include the OpsTrack link, which needs a login. The engineer's email lists every
  change and links to the ticket.
- **Replies:** replying to any email (keeping `[INC-1234]` in the subject) adds a comment to the ticket.
  If the requester replies to a resolved or closed ticket, it reopens. The engineer and CCs then get a
  single email about the reply, which notes that the ticket was reopened.
- **Other emails:** the email to an engineer when a ticket is assigned to them, and the acknowledgement to
  requesters of new email or portal tickets, are set in **Settings → General**.

## Notifications (Teams, Slack, WhatsApp, SMS)

**Settings → Notifications (chat & SMS)** sends a message whenever a ticket is **created** and/or **assigned**.
Each channel can be limited to certain priorities, for example only High and Critical.
Set **OpsTrack web address** at the top of that page so messages link back to the ticket.

**Microsoft Teams**
1. In Teams, open the channel, click **⋯ → Workflows**, and choose
   *“Post to a channel when a webhook request is received”*. Copy the address it gives you.
   An older **Connectors → Incoming Webhook** address also works.
2. In OpsTrack, click **Add channel**, choose type *Microsoft Teams*, paste the address and click **Send test**.

The message is an Adaptive Card showing the ticket number, subject, priority, category, status,
requester and assignee, with an **Open ticket** button.

**Slack**
1. Go to **api.slack.com/apps → Create New App → From scratch**, choose your workspace, then open
   **Incoming Webhooks**, switch it on and click **Add New Webhook to Workspace**. Pick the channel.
2. Copy the `https://hooks.slack.com/services/…` address. In OpsTrack, click **Add channel**,
   choose type *Slack*, paste the address and click **Send test**.

The message shows the ticket number and subject, the priority, category, status, requester and
assignee, and an **Open ticket** button (red for Critical tickets). Tick **Mention @here for
Critical tickets** to alert everyone active in the channel.

**WhatsApp**

WhatsApp only lets businesses start a conversation with a **pre-approved message template**.
Plain-text messages are delivered only within 24 hours of the recipient messaging you, so they suit testing.

- **Meta WhatsApp Cloud API** (official, free tier available):
  1. Create an app at developers.facebook.com, add the *WhatsApp* product, and note the **Phone number ID**.
  2. Create a permanent **System User access token** with `whatsapp_business_messaging` permission.
  3. In WhatsApp Manager, create a *Utility* template, for example `new_ticket_alert` with the body
     “New ticket {{1}}: {{2}} (priority {{3}}). Open: {{4}}”, and wait for approval.
  4. In OpsTrack, choose *WhatsApp – Meta Cloud API*. Enter the phone number ID, the token, the template
     name and language, and the variables in order, for example `number,subject,priority,link`.
- **Twilio**:
  1. Use your Twilio Account SID (`AC…`), auth token and WhatsApp sender number. For the Twilio
     Sandbox, the sender is `+14155238886`.
  2. Create an approved *Content template* and enter its SID (`HX…`).
  3. In the Sandbox, you can use plain-text mode after each recipient has joined the sandbox.

**SMS**

The text is one short message, for example
“[OpsTrack] New ticket INC-1023 (Critical): Email server down. Assignee: Ravi.”, followed by the ticket
link. It is kept within three SMS segments.

- **Twilio:** enter your Account SID, auth token and sender. The sender can be a Twilio phone number,
  an alphanumeric sender ID where the destination country allows it, or a Messaging Service SID (`MG…`).
- **Vonage (Nexmo):** enter your API key and secret and the sender. Vonage reports rejected messages,
  for example unroutable numbers, in its reply, and OpsTrack shows them as failed in the log.
- **Other gateway (HTTP API):** works with most local providers, for example MSG91, Textlocal, Fast2SMS,
  ClickSend or Plivo. Enter the provider's address and, for POST, a JSON or form body. Use the placeholders
  `{to}` (`+919812345678`), `{to_digits}` (`919812345678`) and `{message}`, plus any header your provider
  needs, for example `Authorization: Bearer …`. Example JSON body:
  `{"to": "{to}", "message": "{message}", "sender": "OPSTRK"}`.
- **India:** business SMS must use a DLT-registered sender ID and a registered message template. Register
  the OpsTrack text above as a template with your provider, and add any template ID it requires to the
  address or body.

Recipients are phone numbers in international format, one per line or separated by commas.
Tick **Also send to the assigned engineer** to message the engineer at the phone number in their
user profile.

Every send is recorded in the **Delivery log** with the provider's error if it failed. Workflows can
also send to any channel with the action **Send a Teams / Slack / WhatsApp / SMS message**, with optional extra
text that can use `{{ticket.number}}`-style placeholders.

## Remote management

Engineers start remote sessions from **Devices & Remote**, or from a ticket that has a device
linked. OpsTrack doesn't stream screens itself. It connects to a free, self-hosted
remote-management server that you run:

| Server | What engineers get | Device ID to enter in OpsTrack |
|--------|--------------------|-------------------------------|
| **MeshCentral** (recommended) | Remote desktop, terminal and file transfer for Windows, Linux and macOS. A small agent connects out to MeshCentral, so devices behind firewalls and NAT work. | The node ID. In MeshCentral, open the device and copy the value after `gotonode=` in the address bar. |
| **Apache Guacamole** | RDP, VNC and SSH in the browser, with no agent on the device. Guacamole must be able to reach each device. | The connection ID shown in Guacamole's connection settings. |
| **Other tool** | Any tool that can open a device from a URL. | Whatever your URL template's `{id}` expects. |

**Setting up MeshCentral.** The quickest way is the one-command installer in
[`deploy/`](deploy/README.md). It puts OpsTrack and MeshCentral on one Ubuntu server with automatic HTTPS.
To set it up by hand:
1. Install it on a server that engineers and devices can reach:
   `npm install meshcentral && node node_modules/meshcentral`. The official Docker image also works.
2. Create the admin account and a device group. Install the agent on each device from **Add Agent**.
3. To show sessions inside OpsTrack, add this to `meshcentral-data/config.json` and restart:
   ```json
   { "settings": { "allowedFramingOrigins": "https://ops.yourcompany.com" } }
   ```
   This lets only your OpsTrack address embed MeshCentral.
4. Serve OpsTrack and MeshCentral over **HTTPS on the same domain**, for example
   `ops.yourcompany.com` and `mesh.yourcompany.com`. MeshCentral's login cookie is `SameSite=Lax`,
   so browsers don't send it to an embedded view from another site. If the two run on different
   domains (for example OpsTrack on `onrender.com`), untick **Open sessions inside OpsTrack** in
   Settings → Remote Desktop, and sessions open in a new tab instead.
5. Give each engineer a MeshCentral account with rights on their device groups. They sign in to
   MeshCentral once in their browser.
6. In OpsTrack: **Settings → Remote Desktop**, choose MeshCentral, enter the server address, then
   add devices with their node IDs.

**How sessions are recorded**
- **Start:** clicking Remote desktop, Terminal or Files creates a session record (engineer, device,
  ticket, start time) and adds an entry to the audit log.
- **During:** the session page shows a timer, a ticket selector and a notes box that saves as you type.
- **End:** *End session & log time* writes a Daily Tracker entry, for example
  "Remote desktop – GLOBEX-SAP-APP01 (INC-1012)". The entry uses the activity type chosen in
  settings and links to the device's project and the ticket. Closing the browser also ends the session.
- **History:** every device shows its session history and the tickets linked to it.

**Permissions** (Profiles → *Devices & Remote*): *View* the inventory, *Create / Modify / Delete*
devices, and *Connect* to start sessions. Engineers and support agents can view and connect by
default. Managers can also add and edit devices.

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
lib/sla.js           ITIL priority matrix, SLA clocks (business hours, pausing), warnings, escalation, auto-close
lib/alerts.js        who is notified about which ticket event (personal preferences, @mentions)
lib/inbox.js         in-app notifications (the bell) with live updates over Server-Sent Events
lib/push.js          browser push notifications (Web Push / VAPID)
public/sw.js         service worker that shows push notifications
lib/ticketmail.js    email notifications for ticket updates and comments
lib/notify.js        Teams, Slack, WhatsApp (Meta / Twilio) and SMS (Twilio / Vonage / HTTP) notifications
lib/remote.js        remote desktop links (MeshCentral / Guacamole / custom) and session logging
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
