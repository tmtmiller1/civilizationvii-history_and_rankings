// timeline-i18n.js
//
// loc(key, fallback, ...args): compose a localized string via the engine's
// Locale, falling back to a plain template with positional {1_X} substitution
// when the key is missing (so untranslated builds still read sensibly).

export function loc(key, fallback, ...args) {
  try {
    if (typeof Locale !== "undefined" && Locale.compose) {
      const v = Locale.compose(key, ...args);
      if (typeof v === "string" && v && !v.startsWith("LOC_")) return v;
    }
  } catch (_) { /* ignore */ }
  return String(fallback).replace(/\{(\d+)_[A-Za-z]+\}/g, (m, n) => {
    const a = args[Number(n) - 1];
    return a == null ? m : String(a);
  });
}
