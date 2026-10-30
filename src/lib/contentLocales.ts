export const CONTENT_LOCALES = [
  { code: "en-US", label: "English" }, { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" }, { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" }, { code: "de-DE", label: "Deutsch" },
  { code: "pt-BR", label: "Português (Brasil)" }, { code: "ru-RU", label: "Русский" },
  { code: "ar-SA", label: "العربية" }, { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" }, { code: "hi-IN", label: "हिन्दी" }
] as const;
export function localeLabel(code: string) { return CONTENT_LOCALES.find(locale => locale.code === code)?.label ?? code; }
