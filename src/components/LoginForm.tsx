"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./AuthForm.module.css";
import { AuthRoutes } from "@/app/api/auth/auth.route";

type TNotice = {
  tone: "success" | "error" | "info";
  message: string;
};

export default function LoginForm({ initialNotice }: { initialNotice?: TNotice | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<TNotice | null>(initialNotice ?? null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setNotice(null);

    try {
      const response = await fetch(AuthRoutes.loginApi, {
        method: "POST",
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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.eyebrow}>HabitQuest Access</div>
        <h1 className={styles.title}>Log in</h1>
        <p className={styles.subtitle}>
          Verified accounts can sign in and continue tracking habits from their own workspace.
        </p>

        {notice ? (
          <div
            className={`${styles.notice} ${
              notice.tone === "success"
                ? styles.noticeSuccess
                : notice.tone === "error"
                  ? styles.noticeError
                  : styles.noticeInfo
            }`}
          >
            {notice.message}
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
            <input
              id="login-password"
              className={styles.input}
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button className={styles.submit} type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className={styles.helperRow}>
          <span className={styles.helperText}>
            Need an account? <Link className={styles.link} href={AuthRoutes.registerPage}>Register</Link>
          </span>
          <button className={styles.mutedButton} type="button" disabled>
            Forgot password coming later
          </button>
        </div>
      </div>
    </div>
  );
}
