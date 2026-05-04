"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./AuthForm.module.css";
import { AuthRoutes } from "@/app/api/auth/auth.route";
import ThemeToggle from "./ThemeToggle";

type TNotice = {
  tone: "success" | "error" | "info";
  message: string;
};

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 3l18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.6 6.3A11.3 11.3 0 0 1 12 6c6.5 0 10 6 10 6a17.7 17.7 0 0 1-3.1 3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.7 6.8C4.1 8.4 2 12 2 12s3.5 6 10 6c1.5 0 2.9-.3 4.1-.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.9 9.9a3 3 0 0 0 4.2 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LoginForm({ initialNotice }: { initialNotice?: TNotice | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<TNotice | null>(initialNotice ?? null);
  const topNotice = notice && notice.tone !== "error" ? notice : null;
  const errorNotice = notice?.tone === "error" ? notice : null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setNotice(null);

    try {
      const response = await fetch(AuthRoutes.loginApi, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Login failed");
      }

      router.push(AuthRoutes.homePage);
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Login failed",
      });
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageBar}>
        <div className={styles.brandPill}>Habitee</div>
        <ThemeToggle />
      </div>

      <div className={styles.shell}>
        <section className={styles.showcase}>
          <div className={styles.showcaseBadge}>Daily rhythm, beautifully kept</div>
          <h1 className={styles.showcaseTitle}>Habitee</h1>
          <p className={styles.showcaseText}>
            A clearer habit tracker for focused days, cleaner streaks, and a calmer monthly view.
          </p>

          <div className={styles.showcaseGrid}>
            <div className={styles.showcaseCard}>
              <div className={styles.showcaseValue}>Track today</div>
              <div className={styles.showcaseLabel}>Mark the day that matters and keep the grid simple.</div>
            </div>
            <div className={styles.showcaseCard}>
              <div className={styles.showcaseValue}>See momentum</div>
              <div className={styles.showcaseLabel}>Spot streaks, perfect days, and your monthly consistency.</div>
            </div>
            <div className={styles.showcaseCard}>
              <div className={styles.showcaseValue}>Private access</div>
              <div className={styles.showcaseLabel}>Verified accounts keep each habit workspace personal.</div>
            </div>
          </div>
        </section>

        <div className={styles.card}>
          <div className={styles.formHeader}>
            <div className={styles.eyebrow}>Welcome back</div>
            <h2 className={styles.title}>Log in</h2>
            <p className={styles.subtitle}>
              Sign in to continue with your habits, streaks, and monthly progress.
            </p>
          </div>

          {topNotice ? (
            <div
              className={`${styles.notice} ${
                topNotice.tone === "success" ? styles.noticeSuccess : styles.noticeInfo
              }`}
            >
              {topNotice.message}
            </div>
          ) : null}

          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className={styles.input}
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-password">Password</label>
              <div className={styles.passwordField}>
                <input
                  id="login-password"
                  className={`${styles.input} ${styles.passwordInput}`}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword(prev => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {errorNotice ? (
              <div className={`${styles.notice} ${styles.noticeError}`}>
                {errorNotice.message}
              </div>
            ) : null}

            <button className={styles.submit} type="submit" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className={styles.helperRow}>
            <span className={styles.helperText}>
              Need an account? <Link className={styles.link} href={AuthRoutes.registerPage}>Register</Link>
            </span>
            <button className={styles.mutedButton} type="button" disabled>
              Password reset coming soon
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
