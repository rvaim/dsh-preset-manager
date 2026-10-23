/**
 * Locale dictionaries for the settings page.
 *
 * DSH's locale service resolves a key with a flat `dict[key]` lookup: it does
 * not walk nested objects and does not split on dots. Handing it a nested tree
 * means only top-level keys resolve, and every `t('action.import')` falls back
 * to the literal key — which is what a page full of `action.import` buttons is.
 *
 * The dictionaries are authored as trees because that is readable, and flattened
 * here once at module load so the runtime receives the flat map it actually
 * reads. Doing it in code keeps the two languages structurally identical: a key
 * added to one and forgotten in the other shows up as a missing entry, not as a
 * silent English fallback.
 */
import { zh as zhTree } from './zh.js'
import { en as enTree } from './en.js'

/**
 * Flatten a nested dictionary into `{ 'a.b.c': 'text' }`.
 *
 * A non-string leaf throws at load time rather than rendering as
 * `[object Object]`: a locale file is authored by hand, and a wrong shape should
 * fail loudly during the build instead of shipping a broken label.
 */
export function flattenLocale(
  tree: Record<string, unknown>,
  prefix = '',
  into: Record<string, string> = {},
): Record<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (typeof value === 'string') {
      into[path] = value
      continue
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flattenLocale(value as Record<string, unknown>, path, into)
      continue
    }
    throw new TypeError(`locale key ${JSON.stringify(path)} must be a string`)
  }
  return into
}

/** The flat Chinese dictionary handed to `ctx.locale.register`. */
export const zh = Object.freeze(flattenLocale(zhTree))

/** The flat English dictionary. */
export const en = Object.freeze(flattenLocale(enTree))

/**
 * Keys present in one language and missing in the other.
 *
 * Exported so a test can assert the two stay in sync; a missing key is a
 * visible defect, not an acceptable fallback.
 */
export function localeKeyDiff(): { missingInZh: string[]; missingInEn: string[] } {
  const zhKeys = new Set(Object.keys(zh))
  const enKeys = new Set(Object.keys(en))
  return {
    missingInZh: [...enKeys].filter((key) => !zhKeys.has(key)).sort(),
    missingInEn: [...zhKeys].filter((key) => !enKeys.has(key)).sort(),
  }
}
