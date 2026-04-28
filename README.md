# Habitee

[![Live Demo](https://img.shields.io/badge/Visit-Live%20Site-blue?style=for-the-badge&logo=vercel)](https://habit-tracker-xi-sable.vercel.app)

Habitee is a full-stack habit tracker for daily check-ins, monthly progress,
streaks, deleted-habit recovery, and account-based personal workspaces. It is
built with Next.js App Router, MongoDB, and a custom CSS Modules interface.

## Features

- Email-verified registration and login
- Authenticated habit dashboard per user
- Monthly habit grid with today-only check-ins
- Daily completion percentage row
- Current streak cards for every active habit
- Insight charts for daily completion and habit success rate
- Add custom habits with emoji icons
- Case-insensitive duplicate-name protection
- Inline habit rename by triple-clicking a habit name
- Soft-delete habits into a Deleted Habits modal
- Restore deleted habits with their saved logs
- Permanently delete a habit and all of its logs from the database
- Light and dark theme toggle

## Tech Stack

| Area      | Technology                     |
| --------- | ------------------------------ |
| Framework | Next.js 14 App Router          |
| UI        | React 18, CSS Modules          |
| Database  | MongoDB with Mongoose          |
| Auth      | JWT access and refresh cookies |
| Email     | Nodemailer SMTP                |
| Language  | TypeScript                     |

## Project Structure

```text
src/
  app/
    api/
      auth/              Auth, session, refresh, email verification
      habits/            Habit CRUD, restore, soft/permanent delete
      logs/              Daily habit log reads and today toggle
      stats/             Monthly analytics summary
    login/               Login page
    register/            Registration page
    page.tsx             Main dashboard route
  components/
    HabitTracker.tsx     Main dashboard UI
    ThemeToggle.tsx      Theme switcher
  lib/
    mongodb.ts           Cached MongoDB connection
  models/
    Habit.ts             Habit and Log models
    User.ts              User model
  types/
    index.ts             Shared TypeScript types
scripts/
  seed.mjs               Optional starter habit seed script
```

## Getting Started

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
copy .env.example .env.local
```

On macOS or Linux:

```bash
cp .env.example .env.local
```

Fill in `.env.local` with your MongoDB, JWT, app URL, and SMTP values.

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Build for production:

```bash
npm run build
npm start
```

## Environment Variables

The real `.env` and `.env.local` files are ignored by git. Use
`.env.example` as the safe template.

| Variable                          | Required    | Purpose                                                           |
| --------------------------------- | ----------- | ----------------------------------------------------------------- |
| `MONGODB_URI`                     | Yes         | MongoDB connection string                                         |
| `APP_BASE_URL`                    | Recommended | Base URL used for email verification links                        |
| `SMTP_HOST`                       | Optional    | SMTP host for verification emails                                 |
| `SMTP_PORT`                       | Optional    | SMTP port, usually `587` or `465`                                 |
| `SMTP_SECURE`                     | Optional    | `true` for SSL/TLS SMTP, usually with port `465`                  |
| `SMTP_USER`                       | Optional    | SMTP account username                                             |
| `SMTP_PASS`                       | Optional    | SMTP account password or app password                             |
| `EMAIL_FROM`                      | Optional    | Sender address for verification emails                            |
| `JWT_ACCESS_SECRET`               | Recommended | Secret for access tokens                                          |
| `JWT_REFRESH_SECRET`              | Recommended | Secret for refresh tokens                                         |
| `JWT_ACCESS_EXPIRES_IN`           | Optional    | Access-token duration, default `15m`                              |
| `JWT_REFRESH_EXPIRES_IN`          | Optional    | Refresh-token duration, default `7d`                              |
| `EMAIL_VERIFICATION_TOKEN_SECRET` | Optional    | Separate secret for email verification tokens                     |
| `BCRYPT_SALT_ROUNDS`              | Optional    | Legacy/local env key; current password hashing uses Node `scrypt` |

If SMTP is not configured, registration still returns a verification URL in
the API response for local development.

## Useful Scripts

```bash
npm run dev      # start Next.js in development
npm run build    # production build and type check
npm start        # start the production server
node scripts/seed.mjs
```

The seed script reads `.env.local` and inserts starter habits if no active
habits exist.

## API Overview

### Auth

| Method | Endpoint                  | Description                                |
| ------ | ------------------------- | ------------------------------------------ |
| `POST` | `/api/auth/register`      | Create account and send verification email |
| `GET`  | `/api/auth/verify?token=` | Verify email address                       |
| `POST` | `/api/auth/login`         | Log in and set auth cookies                |
| `POST` | `/api/auth/refresh`       | Refresh auth cookies                       |
| `GET`  | `/api/auth/session`       | Get current session user                   |
| `POST` | `/api/auth/logout`        | Log out and clear cookies                  |

### Habits

| Method   | Endpoint                         | Description                               |
| -------- | -------------------------------- | ----------------------------------------- |
| `GET`    | `/api/habits`                    | List active habits                        |
| `GET`    | `/api/habits?status=all`         | List active and deleted habits            |
| `GET`    | `/api/habits?status=deleted`     | List deleted habits                       |
| `POST`   | `/api/habits`                    | Create habit, with duplicate-name checks  |
| `PATCH`  | `/api/habits/:id`                | Rename, edit icon/order, or restore habit |
| `DELETE` | `/api/habits/:id`                | Soft-delete habit                         |
| `DELETE` | `/api/habits/:id?permanent=true` | Permanently delete habit and logs         |

### Logs and Stats

| Method | Endpoint                  | Description                       |
| ------ | ------------------------- | --------------------------------- |
| `GET`  | `/api/logs?year=&month=`  | Get active-habit logs for a month |
| `POST` | `/api/logs`               | Toggle today's habit log          |
| `GET`  | `/api/stats?year=&month=` | Monthly analytics summary         |

## Habit Name Rules

Habit names are compared case-insensitively. For example, `Gym`, `gym`, and
`GYM` count as the same habit name.

- If an active habit already has the name, creation or rename is blocked.
- If a deleted habit has the name, creation offers restore or create-new.
- Rename is blocked when the name exists in Deleted Habits, so the old habit
  can be restored from the archive instead.

## MongoDB Setup

1. Create a MongoDB Atlas cluster or use a local MongoDB instance.
2. Create a database user with read/write access.
3. Copy the connection string.
4. Set `MONGODB_URI` in `.env.local`.
5. Run `npm run dev`.

## Notes

- `.env`, `.env.local`, and other local env files should never be committed.
- Use long random strings for JWT secrets in production.
- Set `APP_BASE_URL` to your deployed URL before using email verification in
  production.
