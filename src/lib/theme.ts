export type Theme = "light" | "dark"
const storageKey = "surprising-admin.theme"

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === "light" || saved === "dark") return saved
  } catch {
    /* Theme switching remains available without browser storage. */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function saveTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(storageKey, theme)
  } catch {
    /* Keep the current tab's selection. */
  }
}
