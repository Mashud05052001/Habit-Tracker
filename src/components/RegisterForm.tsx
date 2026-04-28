"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./AuthForm.module.css";
import { AuthRoutes } from "@/app/api/auth/auth.route";
import ThemeToggle from "./ThemeToggle";

type TRegisterNotice = {
  tone: "success" | "error";
  message: string;
  verificationUrl?: string;
  emailPreviewUrl?: string;
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

export default function RegisterForm() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<TRegisterNotice | null>(null);
  const topNotice = notice && notice.tone === "success" ? notice : null;
  const errorNotice = notice?.tone === "error" ? notice : null;

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
    <div className={styles.page}>
      <div className={styles.pageBar}>
        <div className={styles.brandPill}>Habitee</div>
        <ThemeToggle />
      </div>

      <div className={styles.shell}>
        <section className={styles.showcase}>
          <div className={styles.showcaseBadge}>Start your calm habit system</div>
          <h1 className={styles.showcaseTitle}>Habitee</h1>
          <p className={styles.showcaseText}>
            Create your account, verify your email, and step into a lighter, clearer daily routine.
          </p>

          <div className={styles.showcaseGrid}>
            <div className={styles.showcaseCard}>
              <div className={styles.showcaseValue}>Monthly clarity</div>
              <div className={styles.showcaseLabel}>Review progress in one place without losing the details.</div>
            </div>
            <div className={styles.showcaseCard}>
              <div className={styles.showcaseValue}>Thoughtful design</div>
              <div className={styles.showcaseLabel}>Deep-blue nights, pure-light days, and cleaner focus.</div>
            </div>
            <div className={styles.showcaseCard}>
              <div className={styles.showcaseValue}>Private by default</div>
              <div className={styles.showcaseLabel}>Email verification protects every personal workspace.</div>
            </div>
          </div>
        </section>

        <div className={styles.card}>
          <div className={styles.formHeader}>
            <div className={styles.eyebrow}>Create your account</div>
            <h2 className={styles.title}>Register</h2>
            <p className={styles.subtitle}>
              Set up Habitee, verify your email, and then log in to your personal tracker.
            </p>
          </div>

          {topNotice ? (
            <div className={`${styles.notice} ${styles.noticeSuccess}`}>
              <div>{topNotice.message}</div>
              {topNotice.verificationUrl ? (
                <div className={styles.devLink}>
                  <a className={styles.link} href={topNotice.verificationUrl}>
                    {topNotice.verificationUrl}
                  </a>
                </div>
              ) : null}
              {topNotice.emailPreviewUrl ? (
                <div className={styles.devLink}>
                  <a className={styles.link} href={topNotice.emailPreviewUrl} target="_blank" rel="noreferrer">
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
                <div className={styles.passwordField}>
                  <input
                    id="register-password"
                    className={`${styles.input} ${styles.passwordInput}`}
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={event => updateField("password", event.target.value)}
                    autoComplete="new-password"
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

              <div className={styles.field}>
                <label className={styles.label} htmlFor="register-confirm-password">Confirm password</label>
                <div className={styles.passwordField}>
                  <input
                    id="register-confirm-password"
                    className={`${styles.input} ${styles.passwordInput}`}
                    type={showConfirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={event => updateField("confirmPassword", event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowConfirmPassword(prev => !prev)}
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    title={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    <EyeIcon open={showConfirmPassword} />
                  </button>
                </div>
              </div>
            </div>

            {errorNotice ? (
              <div className={`${styles.notice} ${styles.noticeError}`}>
                {errorNotice.message}
              </div>
            ) : null}

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
    </div>
  );
}
