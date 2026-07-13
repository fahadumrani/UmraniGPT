# UmraniGPT

<div align="center">

<img src="assets/logo.svg" width="80" alt="UmraniGPT Logo">

### Premium AI Chat Interface for Ollama

A production-ready, feature-complete AI assistant web app —
beautiful as ChatGPT, private as your local machine.

[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](#license)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-blue.svg)](#pwa)
[![Local AI](https://img.shields.io/badge/Backend-Local_AI-orange.svg)]

</div>

---

## ✨ Features

### 💬 Chat
- **Streaming responses** — see tokens appear in real time
- **Full Markdown** — tables, lists, headings, blockquotes, links
- **Syntax-highlighted code blocks** — with copy, collapse & line numbers
- **KaTeX math rendering** — inline `$x^2$` and display `$$\int$$`
- **Message reactions** — emoji reactions on any message
- **Edit, regenerate & continue** — edit any user message; regenerate an
  AI reply from scratch; continue a reply that got cut off, without
  losing what was already generated
- **Voice I/O** — microphone input + text-to-speech output
- **File attachments with real text extraction** — no placeholders:
  - **PDF** — real text layer via PDF.js; automatically falls back to
    **OCR** (Tesseract.js) for scanned/image-only PDFs, page by page
  - **DOCX** — real Word document text via mammoth.js
  - **ZIP** — lists contents and reads text files inside
  - **Images** — OCR (English, Urdu, and Arabic script) so the AI can
    answer questions about text in photos and screenshots
- **Typing indicator** — animated dots while waiting
- **Auto-scroll** with manual scroll button
- **Auto-reconnect** — if the AI server drops, the app retries with
  backoff and recovers automatically once it's back

### 🗂 History
- **Unlimited chats** stored in LocalStorage (in-memory cached for speed)
- **Grouped by time** — Today / Yesterday / This Week / Older
- **Pin** important chats to the top
- **Favourites**, rename, duplicate, archive
- **Folders** for organisation
- **Export** single chat as JSON or Markdown
- **Import / export all** as a full JSON backup

### 🎨 Themes
| Theme | Style |
|-------|-------|
| Dark | Deep purple-black OLED-friendly |
| Light | Clean white with violet accents |
| OLED | Pure black — perfect for OLED screens |
| Cyber | Cyan on dark navy |
| Ocean | Blue tones |
| Purple | Rich purple |
| Forest | Emerald green |
| Glass | Frosted glass morphism |

### ⚙️ Settings
- Configurable **Server URL** — supports Cloudflare Tunnel
- **Connection tester** with latency measurement
- Full **model parameter** control (temperature, top-p, top-k, repeat penalty, seed, context)
- **System prompt** configuration
- **Streaming toggle**
- Voice speed, pitch & volume
- Font size & animation preferences

### ⌨️ Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Send message |
| `Ctrl+N` | New chat |
| `Ctrl+K` | Focus search |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+,` | Open settings |
| `Ctrl+Shift+T` | Cycle theme |
| `Ctrl+/` | Show all shortcuts |
| `Escape` | Cancel / close |

---

## 🚀 Setup

### Prerequisites
- A local AI server (e.g. Ollama) installed and running
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) for tunnel
- A web host (GitHub Pages, Netlify, etc.)

### 1 — Clone & Deploy

```bash
git clone https://github.com/yourusername/umranigpt.git
cd umranigpt
# Deploy to GitHub Pages or any static host
```

### 2 — Start Ollama

```bash
# Pull a model
# pull a model via your AI server CLI

# Serve with CORS enabled
# start your AI server with CORS enabled
```

### 3 — Create Cloudflare Tunnel

```bash
# Install cloudflared, then:
cloudflared tunnel --url http://localhost:11434
# Copy the generated URL, e.g. https://random-name.trycloudflare.com
```

### 4 — Set Up the Backend

Every chat request now goes through a small Node.js + SQLite server
in `server/` — it's what talks to Ollama, tracks usage, and runs
accounts, sessions and the admin dashboard. Users never see any of
this; there's nothing for them to configure.

```bash
cd server
npm install
```

Three separate config files so each concern stays clean:

```bash
# 1) AI connection — OLLAMA_URL only
cp config/ollama.env.example config/ollama.env

# 2) Runtime settings — provider, model, generation, memory
cp config/app.json.example config/app.json
# Edit app.json: set "defaultModel", change "provider" if needed, etc.

# 3) Server secrets — accounts, sessions, social login
cp .env.example .env
# Set ADMIN_EMAIL, ADMIN_PASSWORD, FRONTEND_ORIGINS at minimum
```

```bash
npm start
```

On first run, the server creates the administrator account from
`ADMIN_EMAIL` / `ADMIN_PASSWORD`. Change that password after your
first login.

Point a **second** Cloudflare Tunnel at this server (the first one
you made in Step 3 stays pointed at Ollama directly — this is a
separate, additional tunnel just for the backend):

```bash
cloudflared tunnel --url http://localhost:3001
```

Then set `window.UMRANI_API_URL` to that tunnel's URL at the top of
`login.html`, `signup.html`, `index.html` and `admin.html` (leave it
as `''` if the backend shares an origin with the frontend).

> `better-sqlite3` is an *optional* dependency — if its native build
> ever fails during `npm install` (uncommon, but possible on unusual
> platforms), the server automatically falls back to Node's built-in
> `node:sqlite` (needs Node 22.5+). Either way, `npm start` works.

### 5 — Sign In & Choose a Model

Open `login.html`, sign in with your admin account (or create a
regular account from `signup.html`). Administrators can also open
`admin.html` directly — it isn't linked anywhere in the UI on purpose.

In `admin.html` → **Model Control**, pick which model every user is
served (defaults to `tinyllama`). Users never see a model list or
picker — the admin dashboard is the only place this is chosen.

### 6 — Optional: Social Login

To let people sign in with Google or Facebook instead of an email +
password, add credentials to `server/.env`:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
FRONTEND_URL=https://yourusername.github.io/umranigpt
OAUTH_CALLBACK_BASE_URL=https://your-backend-tunnel.trycloudflare.com
```

Get these from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
and [Meta for Developers](https://developers.facebook.com/apps) — both
are free for basic sign-in. Register the redirect URI shown in each
console as `{OAUTH_CALLBACK_BASE_URL}/api/auth/google/callback` (or
`/facebook/callback`). Leave a provider's variables blank to hide its
button entirely — nothing else is affected.

X/Twitter is intentionally not supported: since 2026 its API no
longer has a free tier for OAuth login, so it isn't included here.

> A Cloudflare *quick* tunnel gets a new random URL on every restart,
> which breaks the registered redirect URI. For social login to keep
> working long-term, use a named Cloudflare Tunnel on a domain you own.

---

## 🏗 Architecture

```
                Browser (GitHub Pages)
                          |
                   HTTPS  ↓  (chat, auth, admin — all of it)
              Cloudflare Tunnel  →  UmraniGPT Backend (:3001)
                                         |         \
                                    SQLite      Provider Manager
                                 (server/data)  /       \
                                          Ollama    OpenAI-compat
                                       (:11434)  (LM Studio/vLLM)
                                             |
                                         Your GPU / CPU
```

All AI processing happens **on your machine**. No data sent to
third-party servers. Every chat request, login, and admin action goes
through the backend. The browser never talks to any AI server directly,
and never learns its address, the active provider, or the active model.

Switch between Ollama and any OpenAI-compatible API (LM Studio, vLLM,
LocalAI) from `admin.html → Provider Settings` with no restart needed —
the change takes effect on the very next request. This is also where
you change the **Ollama URL** itself — useful since a Cloudflare quick
tunnel gives Ollama a new address on every restart if you tunnel it
directly, or simply if you move Ollama to another machine. Once saved,
it's written to `server/config/app.json` and used immediately, with no
env var silently overriding it afterwards.

**Live dashboard chart** — `admin.html → Dashboard` shows a live line
chart of how many users are online / logged in over time (last 6h,
24h, 3d, or 7d). The server snapshots this every 5 minutes and the
dashboard polls for fresh points every 20 seconds while it's open, so
the chart genuinely moves rather than being a static historical graph.

A second chart right below it — **Token & request usage** — shows AI
usage volume over the same time ranges (tokens on the left axis,
request count on the right), built directly from the existing usage
log so it needs no separate tracking of its own.

Both the **Ollama URL** and the **OpenAI-compatible provider URL**
(LM Studio / vLLM / LocalAI) can be changed from `admin.html →
Provider Settings` and take effect on the very next request — no
server restart needed either way.

---

## 📁 Project Structure

```
umranigpt/
├── index.html          # Main chat app (requires login)
├── login.html          # Sign in (email + application password)
├── signup.html         # Create account
├── admin.html          # Administrator dashboard (never linked from the UI)
├── style.css           # CSS entry point (@imports all modules)
├── script.js           # JS entry shim
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline support)
│
├── css/
│   ├── variables.css   # Design tokens & 8 themes
│   ├── animations.css  # All keyframes & animation classes
│   ├── layout.css      # App shell, loading screen, drag overlay
│   ├── sidebar.css     # Sidebar, chat list, context menu
│   ├── chat.css        # Messages, bubbles, code blocks, typing
│   ├── components.css  # Buttons, inputs, dropdowns, status
│   ├── modal.css       # Settings modal, overlays, forms
│   ├── responsive.css  # Mobile/tablet breakpoints
│   ├── auth.css        # Login / signup card
│   └── admin.css       # Admin dashboard (glassmorphism)
│
├── js/
│   ├── config.js       # App constants & defaults
│   ├── utils.js        # Helpers: DOM, events, file, string, etc.
│   ├── storage.js      # LocalStorage wrapper + data layer
│   ├── security.js     # DOMPurify config, URL validation
│   ├── notifications.js# Toast notification system
│   ├── theme.js        # Theme switching & previews
│   ├── voice.js        # Web Speech API (recognition + TTS)
│   ├── markdown.js     # Marked + KaTeX + DOMPurify pipeline
│   ├── codeblock.js    # Highlight.js code blocks
│   ├── search.js       # Real-time sidebar search
│   ├── dragdrop.js     # File drag & drop + clipboard paste
│   ├── history.js      # Chat CRUD, export, import, search
│   ├── sidebar.js      # Sidebar render, context menus, rename
│   ├── settings.js     # Settings modal (incl. Temperature), bindings
│   ├── shortcuts.js    # Keyboard shortcut handler
│   ├── chat.js         # Send, stream, render messages, reactions
│   ├── ui.js            # Connection monitor, status UI, PWA prompt
│   ├── api.js            # Fetch wrapper for the backend (server/)
│   ├── auth.js           # Session guard used by index.html / admin.html
│   ├── page-login.js     # login.html form logic + OAuth buttons
│   ├── page-signup.js    # signup.html form logic + OAuth buttons
│   ├── admin.js          # admin.html bootstrap, dashboard, nav, theme
│   ├── admin-users.js    # Users: search/filter/suspend/delete/reset
│   ├── admin-activity.js # Live line chart: users active over time (Chart.js)
│   ├── admin-model.js    # Model Control: pick the active model
│   ├── admin-provider.js # Provider Settings: switch backends, gen defaults
│   ├── admin-system.js   # System: CPU/RAM/disk/uptime/Ollama status
│   ├── admin-logs.js     # Logs: view + export error/warning logs
│   └── app.js          # Bootstrap — initialises all modules
│
├── services/
│   ├── ollama.js       # Talks to the backend's /api/chat (never Ollama directly)
│   └── stream.js       # Streaming fetch handler (SSE/NDJSON)
│
├── server/              # Backend — the only thing that knows Ollama exists
│   ├── package.json
│   ├── .env.example         # Accounts, sessions, social login → copy to .env
│   ├── config/
│   │   ├── app.json.example    # Runtime config: provider, model, gen, memory → copy to app.json
│   │   └── ollama.env.example  # JUST OLLAMA_URL + optional API key → copy to ollama.env
│   ├── data/             # umranigpt.db (SQLite, created on first run)
│   └── src/
│       ├── index.js      # Entry point (loads both config files)
│       ├── app.js        # Express app, CORS, security headers
│       ├── db.js         # SQLite schema + migrations
│       ├── bootstrapAdmin.js   # Creates the first admin from .env
│       ├── middleware/auth.js  # Session + API-key verification
│       ├── routes/auth.js      # /api/auth/signup, login, logout, me
│       ├── routes/oauth.js     # /api/auth/google, /api/auth/facebook (+callback)
│       ├── routes/admin.js     # Dashboard, users, model, system, logs
│       ├── routes/chat.js      # The chat proxy — enforces model + temperature-only
│       ├── services/ollama.js  # Real Ollama client (URL lives only here)
│       ├── services/providers.js # Provider manager: Ollama + OpenAI-compat routing
│       ├── services/config.js  # Runtime app.json manager (read/write/reload)
│       ├── services/oauth.js   # Google/Facebook token exchange + profile fetch
│       ├── services/activity.js # Periodic snapshots powering the live dashboard chart
│       ├── services/memory.js  # Silent long-term memory: extract, store, inject
│       ├── routes/config.js    # /api/config — read (users) + update (admin only)
│       ├── utils/auth.js       # Password hashing, session tokens, validation
│       ├── utils/logger.js     # Persists errors/warnings for the Logs view
│       └── utils/system.js     # CPU/RAM/disk/uptime snapshot
│
└── assets/
    ├── logo.svg
    └── icons/          # PWA icons (generate with generate-icons.py)
```

---

## 🛠 Technical Details

### Backend API
| Endpoint | Purpose |
|----------|---------|
| `POST /api/chat` | Streaming chat — the only thing users touch, and even then indirectly |
| `GET /api/chat/status` | Powers the Ready/Connected/Offline indicator |
| `POST /api/auth/*` | Signup, login, logout, session restore |
| `GET /api/auth/google`, `/facebook` | Social login (optional, free tier only) |
| `GET/PUT /api/admin/model` | View Ollama's model list, set the active model |
| `GET /api/admin/system` | CPU / RAM / disk / uptime / Ollama status |
| `GET /api/admin/logs` | Error/warning log viewer + CSV export |
| `GET/POST /api/admin/users/:id/memory` | View / reset a user's long-term memory |

The backend itself talks to Ollama's native `/api/tags` and
`/api/chat` — the browser never calls Ollama directly.

### Generation Parameters
| Parameter | Who controls it | Range / Default |
|-----------|------------------|------------------|
| Temperature | **User**, via Settings → AI Response | 0–2, default 0.7 |
| Model | **Administrator**, via admin.html → Model Control | any installed model, default `tinyllama` |
| Top-P, Top-K, Repeat Penalty, Context Length, Seed | Fixed server-side (`server/.env`) | not exposed to anyone through the UI |

### Long-Term Memory
UmraniGPT remembers things about each person across conversations —
preferences, projects, communication style — without ever retraining
the model or showing any "memory" indicator in the UI. After each
reply, a small background call to the same model extracts anything
worth keeping and folds it into that user's private summary; on their
next message, it's quietly added to the system prompt. Nobody sees
this happen — the model is simply told to use it "naturally" and
never mention having it.

Configurable in `server/.env` (`MEMORY_ENABLED`, `MEMORY_EXTRACT_EVERY`,
`MEMORY_MAX_FACTS`, `MEMORY_MODEL`). Administrators can view or reset
any user's memory from `admin.html` → Users → **Memory**. Deleting a
user deletes their memory with it.

### PWA Features
- Offline-capable via service worker cache
- Installable on desktop and mobile
- App-like experience (no browser chrome in standalone mode)
- Background sync ready
- Push notification skeleton

---

## 🩺 Troubleshooting

### 401 Unauthorized from GitHub Pages / Cloudflare Tunnel

If your frontend (GitHub Pages) gets `401` on every protected route
even though the browser is clearly sending the cookie, it's almost
always one of these — in `server/.env`:

```
COOKIE_SECURE=true       # must be true for cross-origin
COOKIE_SAME_SITE=none    # required — 'lax' silently drops the cookie cross-origin
FRONTEND_ORIGINS=https://YOURUSERNAME.github.io   # your EXACT origin, no trailing slash
```

Then check the server's startup log — it prints the active cookie
config and allowed origins every time it starts:
```
[UmraniGPT] Cookie config: secure=true, sameSite=none
[UmraniGPT] Allowed origins: https://YOURUSERNAME.github.io
```

If `FRONTEND_ORIGINS` is empty, the server warns loudly on startup.
If an origin gets blocked, the server logs exactly which one and
reminds you to add it — check the terminal running `npm start`.

**Why this happens:** `SameSite=Lax` cookies are not sent on
cross-origin `fetch()` calls (only on top-level navigation), and
`SameSite=None` cookies are rejected by the browser entirely unless
`Secure` is also set. GitHub Pages (`https://...github.io`) and a
Cloudflare Tunnel (`https://...trycloudflare.com`) are different
origins even though both are HTTPS, so this combination is required.

### AI won't respond / spinner never stops
Check `admin.html → System` — if "AI server" shows Offline, Ollama
isn't reachable from the backend. Verify `server/config/ollama.env`
has the right `OLLAMA_URL` and that `ollama serve` is running.

---

## 🔒 Privacy & Security

- **Zero telemetry** — no analytics, no tracking
- **Local-first** — chat history stays in your browser's LocalStorage
- **DOMPurify** sanitises all rendered HTML
- **Content Security** via strict attribute filtering
- All AI server communication goes through your own tunnel
- **Accounts** — email + a separate application password (never your
  email account password), hashed with bcrypt, never stored in plain text
- **Sessions** — random tokens, only their SHA-256 hash is stored
  server-side; cookies are `httpOnly` so page JavaScript can't read them
- **Admin routes** are rejected server-side for any non-admin session —
  hiding `admin.html` from the UI is a convenience, not the security
  boundary; the API itself enforces the role check
- Auth endpoints are rate-limited to slow down brute-force attempts
- **Model & backend details are never sent to the browser** — the
  active model, Ollama's URL, and every generation parameter except
  temperature are enforced server-side; there is no client-side
  setting that can override them
- **Social login** (if enabled) only ever creates an account from an
  email a provider has verified — never trusts an unverified email
  for linking to an existing account
- **Long-term memory** is per-user, never shared across accounts, and
  is deleted automatically when the account is deleted. Only
  administrators can view or reset it — regular users never see it
  directly, by design (see Technical Details above).

---

## 📱 PWA Icons

Generate required icons by running:

```bash
pip install cairosvg
python3 assets/generate-icons.py
```

Or manually export `assets/logo.svg` to PNG at these sizes and save to `assets/icons/`:
`72, 96, 128, 144, 152, 192, 384, 512`

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with ❤️ using vanilla JS, CSS, and the power of local AI.

Thanks to [SUSRC](https://susrc.com/) — susrc.com

</div>
