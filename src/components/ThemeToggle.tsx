"use client";

import { useTheme } from "./ThemeProvider";
import styles from "./ThemeToggle.module.css";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className={`${styles.toggle} ${theme === "light" ? styles.toggleLight : ""}`}
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb}>
          <span className={styles.glyph}>{theme === "dark" ? "☾" : "☼"}</span>
        </span>
      </span>
      <span className={styles.copy}>
        <span className={styles.label}>
          {theme === "dark" ? "Dark" : "Light"}
        </span>
      </span>
    </button>
  );
}
