// timeline-i18n.js
//
// loc(key, fallback, ...args): compose a localized string via the engine's
// Locale, falling back to a plain template with positional {1_X} substitution
// when the key is missing (so untranslated builds still read sensibly).
//
// num(n): format an integer with locale-aware thousands grouping via the
// engine's `Locale.toNumber` — the same API the base game uses for scores and
// yields, so a German player sees "1.234" and a French player "1 234". Off the
// engine (or if the API is ever unavailable) it falls back to English comma
// grouping, so nothing throws in a bare context.

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

export function num(n) {
  if (typeof n !== "number" || !isFinite(n)) return String(n);
  const rounded = Math.round(n);
  try {
    if (typeof Locale !== "undefined" && typeof Locale.toNumber === "function") {
      return Locale.toNumber(rounded);
    }
  } catch (_) { /* Locale.toNumber can throw on odd input; use the manual fallback. */ }
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
