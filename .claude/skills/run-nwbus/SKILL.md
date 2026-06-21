---
name: run-nwbus
description: Run, build, start, launch, screenshot, test, verify the NWBus (نورث وست باص) station management web app. Use when asked to run the app, check for errors, verify a feature works, or confirm the UI looks correct.
---

# NWBus — Run & Verify Skill

React + Vite + Supabase web app for station revenue and transportation management.
Driven via `chromium-cli` against the Vite dev server on **localhost:5173**.

## Prerequisites

```bash
cd "/Users/abdulkarimalharbi/Stations NWBUS/nwbus"
node -v   # must be 18+
npm install
```

## Build

```bash
npm run build   # production check — must exit 0 with no errors
```

## Run (agent path — chromium-cli)

Start the dev server in the background, then drive with chromium-cli:

```bash
# 1. Start dev server (background)
cd "/Users/abdulkarimalharbi/Stations NWBUS/nwbus"
npm run dev &
sleep 3

# 2. Screenshot the login page
chromium-cli screenshot http://localhost:5173/login /tmp/nwbus-login.png

# 3. Screenshot the sales/revenue page (requires auth — use dev login)
# Login first via chromium-cli fill then screenshot
chromium-cli navigate http://localhost:5173/login
chromium-cli fill 'input[type=text]' 'admin'
chromium-cli fill 'input[type=password]' 'yourpassword'
chromium-cli click 'button[type=submit]'
chromium-cli screenshot http://localhost:5173/sales /tmp/nwbus-sales.png
```

## Check for JS errors

```bash
npm run build 2>&1 | grep -iE "error|warning"
```

## Key pages

| Route | Description |
|---|---|
| `/login` | تسجيل الدخول |
| `/` | Dashboard — الرئيسية |
| `/sales` | الإيرادات — Revenue records with accordion by day |
| `/transportation` | الترحيل |
| `/users` | الفريق — Team management (admin only) |

## Print feature

Confirmed sales records have a 🖨 print button (visible to employee + accountant).
Print uses a hidden div injected into DOM with `@media print` CSS — no popup.
The print div appears after 200ms delay then `window.print()` fires.

## Known issues fixed in this session

- `created_by_user` join replaced with separate query (Supabase FK not mapped)
- Print `display:none` overriding `@media print` → fixed with `position:fixed;top:-99999px` screen hiding
- RLS DELETE policy added for `sales_records` (general_admin only)

## Run (human path)

```bash
npm run dev
# Open http://localhost:5173 in browser
# Ctrl-C to stop
```

## Gotchas

- Session expires on page refresh (`persistSession: false`) — by design
- Email domain is `@nwbus.sa` not `@nwbus.internal`
- User creation uses separate Supabase client with unique `storageKey` to avoid session overwrite
- Confirmed records are read-only for non-admins; admin can still edit
- Accountant cannot add revenue entries (`canAdd = !isAccountant`)
