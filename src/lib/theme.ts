export type ThemeMode = "dark" | "light";

export const THEME_STORAGE_KEY = "habitee-theme";

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "dark" || value === "light";
}

export const THEME_INIT_SCRIPT = `
  (function () {
    try {
      var stored = window.localStorage.getItem("${THEME_STORAGE_KEY}");
      var theme = stored === "light" || stored === "dark" ? stored : "dark";
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.style.colorScheme = theme;
    } catch (error) {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.style.colorScheme = "dark";
    }
  })();
`;
