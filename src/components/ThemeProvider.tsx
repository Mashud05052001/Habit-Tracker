"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isThemeMode, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme";

type ThemeContextValue = {
  isDark: boolean;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof document !== "undefined") {
      const current = document.documentElement.getAttribute("data-theme");
      if (isThemeMode(current)) {
        return current;
      }
    }

    return "dark";
  });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemeMode(stored)) {
        setThemeState(stored);
        applyTheme(stored);
        return;
      }
    } catch {
      // Ignore localStorage access issues and fall back to the default theme.
    }

    applyTheme(theme);
  }, []);

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore localStorage access issues and still apply the theme in memory.
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    isDark: theme === "dark",
    theme,
    setTheme: setThemeState,
    toggleTheme: () => setThemeState(current => current === "dark" ? "light" : "dark"),
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
