> **Also in this repository:** [Time Management and ITSM](time-management-itsm/) – a daily effort tracker, dashboards, ticketing, email-to-ticket and workflow automation web app.

# VAPT Navigator

A dependency-free field toolkit for Vulnerability Assessment & Penetration
Testing (VAPT). It packages methodology checklists, a plain-English jargon
glossary, and a searchable command reference across nine security domains
into a single fast, offline-capable web app.

This project is a knowledge/reference toolkit for **authorized** security
testing — it does not execute scans itself. Every technique documented here
assumes a signed Rules of Engagement and explicit written authorization from
the system owner. Running these commands against systems you don't own or
aren't contracted to test is illegal in most jurisdictions.

## What's inside

- **Dashboard** — overall checklist progress and quick links into every domain.
- **Methodology** — the eight-phase VAPT lifecycle, from scoping through retesting.
- **Domains** — Reconnaissance & OSINT, Network, Web Application, API,
  Mobile, Cloud (AWS/Azure/GCP), Active Directory, Wireless, and
  Container/Kubernetes assessment. Each domain page has:
  - a plain-language overview of what the domain covers and why it matters
  - a **Jargon Buster** — the domain's acronyms and terms explained without
    assuming prior background
  - an interactive **methodology checklist**, grouped by phase, with
    progress saved locally in your browser
  - a **command reference** with copy-to-clipboard ready-to-run syntax
  - a **recommended tools** list
- **Command Library** — every command from every domain, searchable and
  filterable in one place.
- **Glossary** — every jargon term across the toolkit, searchable.
- Light/dark theme, responsive layout, and a global search box.

## Running it

No build step, no dependencies, no network calls. Either:

```bash
# open directly
open index.html      # macOS
xdg-open index.html   # Linux

# or serve it (recommended, avoids browser file:// quirks with some setups)
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Project structure

```
index.html               entry point / app shell markup
assets/css/styles.css     design system (light + dark themes)
assets/js/data.js         all content: methodology, glossary, domains, commands
assets/js/app.js          routing, rendering, search, checklist persistence
```

## Extending it

All content lives in `assets/js/data.js` as a single `VAPT_DATA` object —
add a new domain by adding an entry to `categories`, or extend an existing
domain's `jargon`, `checklist`, `commands`, or `tools` arrays. No other file
needs to change; icons for new domains can be added to the `ICON_PATHS` map
in `assets/js/app.js`.

Checklist progress is stored per-domain in `localStorage` on the visitor's
own browser — nothing is sent anywhere.
