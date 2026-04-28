"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./AuthForm.module.css";
import { AuthRoutes } from "@/app/api/auth/auth.route";

type TRegisterNotice = {
  tone: "success" | "error";
  message: string;
  verificationUrl?: string;
  emailPreviewUrl?: string;
};

export default function RegisterForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<TRegisterNotice | null>(null);

  function updateField<K extends keyof typeof form>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setNotice(null);

    try {
      const response = await fetch(AuthRoutes.registerApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }

      setNotice({
        tone: "success",
        message: data.emailDelivered
          ? "Registration complete. Check your email and verify the account within 5 minutes."
          : "Registration complete. SMTP is not configured locally, so use the temporary verification link below.",
        verificationUrl: data.verificationUrl,
        emailPreviewUrl: data.emailPreviewUrl,
      });
      setForm({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Registration failed",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.eyebrow}>Create Account</div>
        <h1 className={styles.title}>Register</h1>
        <p className={styles.subtitle}>
          Create your HabitQuest account, verify your email, and then log in to your private tracker.
        </p>

        {notice ? (
          <div
            className={`${styles.notice} ${
              notice.tone === "success" ? styles.noticeSuccess : styles.noticeError
            }`}
          >
            <div>{notice.message}</div>
            {notice.verificationUrl ? (
              <div className={styles.devLink}>
                <a className={styles.link} href={notice.verificationUrl}>
                  {notice.verificationUrl}
                </a>
              </div>
            ) : null}
            {notice.emailPreviewUrl ? (
              <div className={styles.devLink}>
                <a className={styles.link} href={notice.emailPreviewUrl} target="_blank" rel="noreferrer">
                  Open sent email preview
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="register-name">Name</label>
            <input
              id="register-name"
              className={styles.input}
              type="text"
              value={form.name}
              onChange={event => updateField("name", event.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="register-email">Email</label>
            <input
              id="register-email"
              className={styles.input}
              type="email"
              value={form.email}
              onChange={event => updateField("email", event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className={styles.gridTwo}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="register-password">Password</label>
              <input
                id="register-password"
                className={styles.input}
                type="password"
                value={form.password}
                onChange={event => updateField("password", event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="register-confirm-password">Confirm password</label>
              <input
                id="register-confirm-password"
                className={styles.input}
                type="password"
                value={form.confirmPassword}
                onChange={event => updateField("confirmPassword", event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <button className={styles.submit} type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className={styles.helperRow}>
          <span className={styles.helperText}>
            Already verified? <Link className={styles.link} href={AuthRoutes.loginPage}>Log in</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
