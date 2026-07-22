# CodeSync 🔄

> **Automatically sync your accepted LeetCode solutions to GitHub — organized, deduped, and beautiful.**

CodeSync is a full-stack application (Next.js web app + Chrome extension) that detects when you solve a LeetCode problem and commits your solution directly to a GitHub repository — organized by topic, with no duplicates.

---

## 📸 How It Looks

| Landing Page | Dashboard | Settings |
|---|---|---|
| Animated hero, features, CTA | Stats, recent syncs, connected repo | Repo picker, auto-sync toggle, danger zone |

---

## 🏗️ Architecture

```
┌───────────────────────────────────────────────────────────┐
│                     Chrome Extension                       │
│                                                           │
│  content.js          background.js         popup.js       │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐  │
│  │ Detects     │    │ Routes msgs  │    │ Shows auth  │  │
│  │ "Accepted"  │───▶│ Calls API    │    │ & last sync │  │
│  │ on LeetCode │    │ Updates badge│    │             │  │
│  └─────────────┘    └──────┬───────┘    └─────────────┘  │
└─────────────────────────────│─────────────────────────────┘
                              │  HTTPS (credentialed)
                              ▼
┌───────────────────────────────────────────────────────────┐
│                   Next.js Web App                          │
│                                                           │
│  /api/auth/extension  ── Verify user session              │
│  /api/sync            ── Dedupe + commit to GitHub        │
│  /api/sync/history    ── Paginated history                │
│  /api/github/repos    ── List / create repos              │
│  /api/settings        ── Read user settings               │
│  /api/account         ── Delete account                   │
│                                                           │
│  Dashboard  ── Stats, recent syncs, connected repo        │
│  History    ── Full paginated + searchable history        │
│  Settings   ── Repo selection, auto-sync, danger zone     │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │   Prisma Postgres DB    │
              │                        │
              │  User · Account        │
              │  Session               │
              │  Repository            │
              │  SyncHistory           │
              │  Settings              │
              └─────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │     GitHub API          │
              │  (via Octokit)          │
              │                        │
              │  Commit files           │
              │  Create repos           │
              │  List repos             │
              └─────────────────────────┘
```

---

## 🔄 Full Sync Workflow

```
User submits solution on LeetCode
         │
         ▼
content.js detects "Accepted" result via MutationObserver
         │
         ▼
Extracts: problem name, slug, difficulty, language, code, category (topic tag)
         │
         ▼
Sends message → background.js (SYNC_SOLUTION)
         │
         ▼
background.js checks auth → GET /api/auth/extension
         │
         ├── Not authenticated → show toast error
         │
         └── Authenticated
                  │
                  ▼
         POST /api/sync  { problemName, slug, difficulty, language, code, category }
                  │
                  ▼
         Server: validate session ──▶ get selectedRepo from DB
                  │
                  ▼
         Hash the code (SHA-256). Already synced with same hash? → return SKIPPED
                  │
                  ▼
         Build file path: `{Category}/{Problem Name}/solution.{ext}`
         e.g. `Arrays/Two Sum/solution.py`
                  │
                  ▼
         Get existing file SHA from GitHub (if updating)
                  │
                  ▼
         Commit via GitHub API (create or update file)
                  │
                  ▼
         Save SyncHistory record (SUCCESS / FAILED / SKIPPED)
                  │
                  ▼
         Extension shows toast + badge ✓
         Popup updates "Last Sync" card
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A PostgreSQL database (or [Prisma Postgres](https://www.prisma.io/postgres))
- A GitHub OAuth App

---

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/codesync.git
cd codesync
npm install
```

---

### 2. Create a GitHub OAuth App

1. Go to **GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App**
2. Fill in:
   - **Application name**: CodeSync
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
3. Copy the **Client ID** and **Client Secret**

---

### 3. Set Up Environment Variables

Create or edit `.env` in the project root:

```env
# Database (Prisma Postgres or any PostgreSQL)
DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"

# NextAuth — BOTH must be set and identical
AUTH_SECRET=your_random_32_char_secret_here
NEXTAUTH_SECRET=your_random_32_char_secret_here

# GitHub OAuth App credentials
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret

# App URL
AUTH_URL=http://localhost:3000
```

> **Tip**: Generate a strong secret with:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

### 4. Set Up the Database

```bash
# Push the schema to your database (creates all tables)
npx prisma db push

# Or run migrations (for production)
npx prisma migrate deploy
```

---

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the landing page.

---

### 6. Install the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project
5. The CodeSync icon will appear in your browser toolbar

---

### 7. Connect the Extension to the Web App

1. Click the **CodeSync** extension icon
2. Make sure the **Server URL** field shows `http://localhost:3000` (or your deployed URL)
3. Click the **Sign in with GitHub** link in the popup → you'll be redirected to the web app
4. Sign in with GitHub on the web app
5. The popup will now show you as "Connected ✓"

---

### 8. Select a Target Repository

1. Go to the web app → **Dashboard → Settings**
2. Under **Target Repository**, either:
   - Select an existing repo from the list
   - Click **Create New** to create a dedicated `leetcode-solutions` repo
3. Enable **Auto-Sync** (it's on by default)

---

### 9. Solve Problems!

1. Navigate to any problem on [leetcode.com](https://leetcode.com/problems/)
2. Write your solution and submit
3. When you get **"Accepted"**, CodeSync detects it automatically
4. A toast notification appears confirming the sync
5. Your solution appears on GitHub at:
   ```
   {Category}/{Problem Name}/solution.{ext}
   ```
   e.g. `Arrays/Two Sum/solution.py`

---

## 📁 Project Structure

```
codesync/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── layout.tsx
│   ├── globals.css
│   ├── providers.tsx               # NextAuth SessionProvider
│   ├── dashboard/
│   │   ├── layout.tsx              # Sidebar layout
│   │   ├── page.tsx                # Dashboard home (stats + recent syncs)
│   │   ├── loading.tsx
│   │   ├── history/
│   │   │   ├── page.tsx            # Full paginated history
│   │   │   └── loading.tsx
│   │   └── settings/
│   │       ├── page.tsx            # Settings (repo, auto-sync, delete)
│   │       └── loading.tsx
│   └── api/
│       ├── auth/
│       │   ├── [...nextauth]/      # NextAuth handler
│       │   └── extension/          # GET — extension auth check
│       ├── sync/
│       │   ├── route.ts            # POST — main sync endpoint
│       │   ├── history/            # GET — paginated sync history
│       │   └── retry/              # POST — retry info (security note)
│       ├── github/
│       │   └── repos/              # GET list / POST create repos
│       ├── settings/               # GET user settings
│       └── account/                # DELETE account
├── action/
│   ├── settings.ts                 # Server actions: autoSync, selectRepo, disconnect
│   └── account.ts                  # Server action: deleteAccount
├── components/
│   ├── sidebar.tsx
│   ├── stat-card.tsx
│   ├── sync-history-table.tsx
│   └── ui/
├── lib/
│   ├── auth.ts                     # NextAuth config + callbacks
│   ├── github.ts                   # Octokit helpers (commit, repos, hashing)
│   ├── prisma.ts                   # Prisma client singleton
│   └── utils.ts
├── types/
│   └── index.ts                    # Shared TypeScript types
├── prisma/
│   └── schema.prisma               # Database schema
├── extension/
│   ├── manifest.json               # Chrome Extension MV3 manifest
│   ├── content.js                  # LeetCode submission detector
│   ├── background.js               # Service worker — API calls, message routing
│   ├── popup.html/css/js           # Extension popup UI
│   ├── utils.js                    # Shared utilities (slug, language helpers)
│   └── icons/                      # Extension icons (16, 48, 128px)
└── .env                            # Environment variables (not committed)
```

---

## 🔑 Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | ✅ | Secret for signing NextAuth sessions (must be set) |
| `AUTH_SECRET` | ✅ | Same value as NEXTAUTH_SECRET (used by some adapters) |
| `GITHUB_CLIENT_ID` | ✅ | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | ✅ | GitHub OAuth App Client Secret |
| `AUTH_URL` | ✅ | Base URL of your deployment (e.g. `https://codesync.example.com`) |

---

## 🌐 Deploying to Production

### Web App (Vercel recommended)

1. Push the code to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Set all environment variables in Vercel's dashboard (same as `.env`)
4. Update your GitHub OAuth App's callback URL to:
   ```
   https://your-domain.com/api/auth/callback/github
   ```

### Extension (Production URL)

After deploying:

1. Open the CodeSync extension popup
2. In the **Server URL** field, enter your production URL (e.g. `https://codesync.example.com`)
3. Click **Save**
4. Update `extension/manifest.json` — replace `https://YOUR_PRODUCTION_DOMAIN/*` with your actual domain
5. Reload the extension in `chrome://extensions/`

---

## 🧠 Key Design Decisions

| Decision | Why |
|---|---|
| **Code is never stored server-side** | Privacy & security. Only a SHA-256 hash is stored for deduplication. |
| **Session-cookie auth for extension** | The extension makes credentialed requests using the same browser session as the web app. No extra tokens needed. |
| **File path format**: `Category/Problem Name/solution.ext` | Clean, browsable repo structure that mirrors how you'd organize notes. |
| **Deduplication by hash** | Prevents spam commits when you re-submit identical code. Only updates when the solution actually changes. |
| **Octokit REST (not GraphQL)** | Simpler to use for file operations; REST endpoints for file commits are well-documented. |

---

## 🛠️ API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/auth/extension` | Session | Check if user is authenticated (used by extension) |
| `POST` | `/api/sync` | Session | Main sync endpoint — dedupe + commit to GitHub |
| `GET` | `/api/sync/history` | Session | Paginated sync history. Query: `page`, `limit`, `status`, `search` |
| `GET` | `/api/github/repos` | Session | List user's GitHub repos |
| `POST` | `/api/github/repos` | Session | Create a new GitHub repo |
| `GET` | `/api/settings` | Session | Get user settings |
| `DELETE` | `/api/account` | Session | Delete account and optionally the GitHub repo |

---

## 🐛 Troubleshooting

### Extension shows "Not connected"
- Make sure you're signed in on the **web app** in the same browser
- Check that the **Server URL** in the popup matches where your app is running
- Try refreshing the popup

### Solutions not syncing
- Check that **Auto-Sync** is enabled in both the popup and web app settings
- Make sure a **Target Repository** is selected in Settings
- Check the **History** page for FAILED entries with error details
- Open browser DevTools Console on leetcode.com and look for `CodeSync:` logs

### "NEXTAUTH_SECRET not set" error
- Ensure `.env` has `NEXTAUTH_SECRET=your_secret` (not just `AUTH_SECRET`)
- Restart the dev server after changing `.env`

### Prisma connection errors
- Verify `DATABASE_URL` is correct
- Run `npx prisma db push` to ensure the schema is applied
- Check your database allows connections from your machine/host

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Pull requests are welcome! For major changes, open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

*Built for developers who love clean code and a green GitHub graph. ⚡*
