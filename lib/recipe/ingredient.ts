/**
 * Ingredient line parsing.
 *
 * "1/2 pound bacon strips, chopped" is the format every recipe on earth uses
 * and no source publishes structured. Turning it into
 * `{ quantity: 0.5, unit: 'pound', item: 'bacon strips', note: 'chopped' }` is
 * the part a consumer cannot do for themselves, so it is the part worth
 * getting right.
 *
 * The parser is deliberately conservative: anything it cannot read confidently
 * is left off the record rather than guessed at, and `raw` always survives so
 * a consumer can fall back to the original string.
 */

import type { Ingredient } from './types';

/** Unicode vulgar fractions that show up constantly in PDF extractions. */
const VULGAR: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅐': 1 / 7,
  '⅑': 1 / 9,
  '⅒': 0.1,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

/**
 * Unit spellings mapped to a single canonical token. Keys are matched
 * lowercased with any trailing period removed.
 */
const UNITS: Record<string, string> = {
  c: 'cup',
  cup: 'cup',
  cups: 'cup',
  tsp: 'teaspoon',
  tsps: 'teaspoon',
  teaspoon: 'teaspoon',
  teaspoons: 'teaspoon',
  tbsp: 'tablespoon',
  tbsps: 'tablespoon',
  tbs: 'tablespoon',
  tablespoon: 'tablespoon',
  tablespoons: 'tablespoon',
  oz: 'ounce',
  ounce: 'ounce',
  ounces: 'ounce',
  lb: 'pound',
  lbs: 'pound',
  pound: 'pound',
  pounds: 'pound',
  g: 'gram',
  gram: 'gram',
  grams: 'gram',
  kg: 'kilogram',
  kilogram: 'kilogram',
  kilograms: 'kilogram',
  ml: 'milliliter',
  milliliter: 'milliliter',
  milliliters: 'milliliter',
  l: 'liter',
  liter: 'liter',
  liters: 'liter',
  pint: 'pint',
  pints: 'pint',
  quart: 'quart',
  quarts: 'quart',
  gallon: 'gallon',
  gallons: 'gallon',
  pinch: 'pinch',
  pinches: 'pinch',
  dash: 'dash',
  dashes: 'dash',
  clove: 'clove',
  cloves: 'clove',
  can: 'can',
  cans: 'can',
  package: 'package',
  packages: 'package',
  pkg: 'package',
  jar: 'jar',
  jars: 'jar',
  tub: 'tub',
  tubs: 'tub',
  sheet: 'sheet',
  sheets: 'sheet',
  slice: 'slice',
  slices: 'slice',
  stick: 'stick',
  sticks: 'stick',
  bunch: 'bunch',
  bunches: 'bunch',
  head: 'head',
  heads: 'head',
  stalk: 'stalk',
  stalks: 'stalk',
  sprig: 'sprig',
  sprigs: 'sprig',
  container: 'container',
  containers: 'container',
  bottle: 'bottle',
  bottles: 'bottle',
  envelope: 'envelope',
  envelopes: 'envelope',
};

/**
 * Reads a leading quantity token: "1", "1/2", "1-1/2", "1 1/2", "½", "1½",
 * and ranges like "1-2" or "1 to 2".
 *
 * Returns the value(s) and how many characters were consumed.
 */
function readQuantity(input: string): { value: number; max?: number; length: number } | undefined {
  // Longest-match first so "1-1/2" is not read as the range "1-1".
  const patterns = [
    // 1-1/2 or 1 1/2 (mixed number)
    /^(\d+)[\s-](\d+)\s*\/\s*(\d+)/,
    // 1/2
    /^(\d+)\s*\/\s*(\d+)/,
    // 1½ (integer glued to a vulgar fraction)
    /^(\d+)\s*([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/,
    // ½
    /^([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/,
    // 1.5
    /^(\d+\.\d+)/,
    // 12
    /^(\d+)/,
  ];

  let base: { value: number; length: number } | undefined;

  for (const re of patterns) {
    const m = re.exec(input);
    if (!m) continue;

    if (re.source.startsWith('^(\\d+)[\\s-](\\d+)')) {
      const whole = Number(m[1]);
      const denom = Number(m[3]);
      // "1-1/2" is a mixed number, but only if the fraction is a real one.
      if (denom === 0) continue;
      base = { value: whole + Number(m[2]) / denom, length: m[0].length };
    } else if (re.source.startsWith('^(\\d+)\\s*\\/')) {
      const denom = Number(m[2]);
      if (denom === 0) continue;
      base = { value: Number(m[1]) / denom, length: m[0].length };
    } else if (m[2] && VULGAR[m[2]] !== undefined) {
      base = { value: Number(m[1]) + VULGAR[m[2]], length: m[0].length };
    } else if (VULGAR[m[1]] !== undefined) {
      base = { value: VULGAR[m[1]], length: m[0].length };
    } else {
      base = { value: Number(m[1]), length: m[0].length };
    }
    break;
  }

  if (!base) return undefined;

  // A range: "1 to 2 cups", "1-2 cups". Only when what follows is a bare
  // number, so "1-1/2" (already consumed above) cannot reach here.
  const rest = input.slice(base.length);
  const range = /^\s*(?:-|–|to\s)\s*(\d+(?:\.\d+)?)(?!\s*\/)/.exec(rest);
  if (range) {
    return { value: base.value, max: Number(range[1]), length: base.length + range[0].length };
  }

  return { value: base.value, length: base.length };
}

/** Pulls "(14-1/2 ounces)" off the front, which pack-size lines lead with. */
function readPackSize(input: string): { packSize: string; length: number } | undefined {
  const m = /^\s*\(([^)]{1,40})\)/.exec(input);
  if (!m) return undefined;
  // Only treat it as a pack size if it mentions a measurement.
  if (!/\d/.test(m[1])) return undefined;
  return { packSize: m[1].trim(), length: m[0].length };
}

/** Splits a trailing preparation note: "bacon strips, chopped". */
function splitNote(text: string): { item: string; note?: string } {
  const idx = text.indexOf(',');
  if (idx === -1) return { item: text.trim() };
  return {
    item: text.slice(0, idx).trim(),
    note: text.slice(idx + 1).trim() || undefined,
  };
}

/**
 * Parses one ingredient line.
 *
 * @param raw - the line exactly as the source printed it
 * @param group - the sub-heading it sat under, if any
 */
export function parseIngredient(raw: string, group?: string): Ingredient {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const result: Ingredient = { raw: cleaned };
  if (group) result.group = group;

  // "Minced fresh parsley, optional" / "1 tsp thyme (optional)"
  let working = cleaned;
  const optional = /(,\s*optional\b|\(\s*optional\s*\))/i.exec(working);
  if (optional) {
    result.optional = true;
    working = working.replace(optional[0], '').trim();
  }

  const qty = readQuantity(working);
  if (qty) {
    result.quantity = Number(qty.value.toFixed(4));
    if (qty.max !== undefined) result.quantityMax = qty.max;
    working = working.slice(qty.length).trim();
  }

  // A unit, if the next token is one we know.
  const unitMatch = /^([A-Za-z.]+)\b/.exec(working);
  if (unitMatch) {
    const key = unitMatch[1].toLowerCase().replace(/\.$/, '');
    const canonical = UNITS[key];
    // "1 can (14-1/2 ounces) diced tomatoes" — the unit is the container.
    if (canonical) {
      result.unit = canonical;
      working = working.slice(unitMatch[0].length).trim();
    }
  }

  const pack = readPackSize(working);
  if (pack) {
    result.packSize = pack.packSize;
    working = working.slice(pack.length).trim();
  }

  if (working) {
    const { item, note } = splitNote(working);
    if (item) result.item = item;
    if (note) result.note = note;
  }

  return result;
}

/**
 * True for a line that is a section heading rather than an ingredient,
 * e.g. "**FILLING:**" or "TOPPING:".
 */
export function isIngredientGroupHeading(line: string): boolean {
  const bare = line.replace(/\*\*/g, '').trim();
  if (!bare.endsWith(':')) return false;
  const words = bare.slice(0, -1).trim();
  // Headings are short and typically shouted.
  return words.length > 0 && words.length <= 40 && words === words.toUpperCase();
}

/** Strips the trailing colon and emphasis from a group heading. */
export function groupHeadingText(line: string): string {
  return line
    .replace(/\*\*/g, '')
    .trim()
    .replace(/:$/, '')
    .trim();
}
