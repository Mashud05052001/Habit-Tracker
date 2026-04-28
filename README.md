# HabitQuest 🎮
> Level up your life — a full-stack habit tracker built with Next.js 14 + MongoDB.

---

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Database | MongoDB Atlas via Mongoose |
| Styling | CSS Modules (zero external UI libs) |
| Language | TypeScript |

---

## Project Structure
```
habitquest/
├── .env.local              ← your MongoDB URI goes here
├── .env.example            ← template (safe to commit)
├── scripts/
│   └── seed.mjs            ← optional: seed default habits
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── globals.css
    │   └── api/
    │       ├── habits/
    │       │   ├── route.ts          GET, POST
    │       │   └── [id]/route.ts     PATCH, DELETE
    │       ├── logs/
    │       │   └── route.ts          GET, POST (toggle)
    │       └── stats/
    │           └── route.ts          GET (analytics)
    ├── components/
    │   ├── HabitTracker.tsx          main UI (client component)
    │   └── HabitTracker.module.css
    ├── lib/
    │   └── mongodb.ts                connection helper (cached)
    ├── models/
    │   └── Habit.ts                  Habit + Log mongoose models
    └── types/
        └── index.ts                  shared TypeScript types
```

---

## Quick Start

### 1 · Clone & Install
```bash
git clone <your-repo>
cd habitquest
npm install
```

### 2 · Configure Environment
Copy `.env.example` to `.env.local` and fill in your credentials:
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster0.j7t5o8c.mongodb.net/habitquest?appName=Cluster0
```
> Replace `YOUR_USERNAME` and `YOUR_PASSWORD` with your real MongoDB Atlas credentials.

### 3 · (Optional) Seed Default Habits
```bash
node scripts/seed.mjs
```
This inserts 9 default habits into your DB. You can also add them from the UI.

### 4 · Run Dev Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### 5 · Build for Production
```bash
npm run build
npm start
```

---

## API Reference

### Habits
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/habits` | List all active habits |
| `POST` | `/api/habits` | Create a habit `{ name, icon }` |
| `PATCH` | `/api/habits/:id` | Update name / icon / order |
| `DELETE` | `/api/habits/:id` | Soft-delete + remove logs |

### Logs
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/logs?year=&month=` | Get all logs for a month |
| `POST` | `/api/logs` | Toggle a day `{ habitId, year, month, day }` |

### Stats
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/stats?year=&month=` | Monthly analytics summary |

---

## Features
- ✅ Click any day cell to mark/unmark a habit
- ✅ Add custom habits with emoji icons
- ✅ Remove habits (soft-delete, logs purged)
- ✅ Navigate between months
- ✅ Streak tracking per habit
- ✅ Daily % completion row
- ✅ Area chart of completion rate over the month
- ✅ Analysis cards (total done, perfect days, etc.)
- ✅ Optimistic UI updates (instant feedback, rolls back on error)
- ✅ Data persisted in MongoDB Atlas
- ✅ Seed script for quick setup

---

## MongoDB Atlas Setup (if needed)
1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a free **M0** cluster
3. Under **Database Access** → add a user with read/write permissions
4. Under **Network Access** → add `0.0.0.0/0` (or your IP)
5. Click **Connect** → **Drivers** → copy the connection string
6. Paste into `.env.local` replacing `<db_username>` and `<db_password>`
