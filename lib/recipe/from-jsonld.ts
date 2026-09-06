/**
 * Extracts a canonical recipe from schema.org JSON-LD.
 *
 * This is the second ingest path: food blogs embed a `Recipe` object for
 * Google's rich results, so the structured data is already on the page and no
 * inference is needed to read it. A sample of 22 feeds from the rssamplifier
 * directory found complete markup on every post that was a single recipe (the
 * misses were roundups and news items, not missing markup).
 *
 * Publishers are loose with the spec — `recipeIngredient` may be a string,
 * `recipeInstructions` may be a string, a list of strings, a list of
 * `HowToStep`, or a `HowToSection` containing steps — so every reader here
 * accepts the variants rather than assuming the happy path.
 */

import { parseIngredient } from './ingredient';
import { slugify } from './from-markdown';
import type { Ingredient, Nutrition, Recipe, RecipeSource, Step, Times, Yield } from './types';

type Json = Record<string, unknown>;

/** Walks any JSON-LD payload and yields every node typed `Recipe`. */
export function* findRecipeNodes(node: unknown): Generator<Json> {
  if (Array.isArray(node)) {
    for (const child of node) yield* findRecipeNodes(child);
    return;
  }
  if (!node || typeof node !== 'object') return;

  const record = node as Json;
  const type = record['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => typeof t === 'string' && t.toLowerCase() === 'recipe')) {
    yield record;
  }
  for (const value of Object.values(record)) yield* findRecipeNodes(value);
}

/** Pulls every `application/ld+json` block out of an HTML document. */
export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Publishers ship invalid JSON-LD often enough that skipping is the
      // only sane response; the page is still worth the other blocks.
    }
  }
  return blocks;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return asString(value[0]);
  if (value && typeof value === 'object') {
    const record = value as Json;
    return asString(record.name ?? record['@value'] ?? record.text);
  }
  return undefined;
}

function asStringList(value: unknown): string[] {
  if (typeof value === 'string') {
    // A single string holding a whole list, newline separated.
    return value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap(asStringList);
  const single = asString(value);
  return single ? [single] : [];
}

/** Reads `recipeInstructions` in each of the shapes publishers actually emit. */
function readSteps(value: unknown): Step[] {
  const texts: string[] = [];

  const walk = (node: unknown) => {
    if (!node) return;
    if (typeof node === 'string') {
      // Some publishers put the entire method in one string.
      for (const part of node.split(/\r?\n+/)) {
        const trimmed = part.trim();
        if (trimmed) texts.push(trimmed);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node !== 'object') return;

    const record = node as Json;
    const type = asString(record['@type']) ?? '';
    if (/HowToSection/i.test(type)) {
      walk(record.itemListElement ?? record.steps);
      return;
    }
    const text = asString(record.text) ?? asString(record.name);
    if (text) texts.push(text);
  };

  walk(value);

  return texts
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter((text) => text.length > 1)
    .map((text, i) => ({ n: i + 1, text }));
}

/** Validates an ISO 8601 duration, which is what schema.org asks for. */
function readDuration(value: unknown): string | undefined {
  const text = asString(value);
  if (!text) return undefined;
  return /^P(?:\d+[YMWD])*(?:T(?:\d+[HMS])*)?$/.test(text) && text !== 'P' ? text : undefined;
}

function readYield(value: unknown): Yield | undefined {
  const text = asString(value);
  if (!text) return undefined;
  const servings = /(\d+)/.exec(text);
  const result: Yield = { text: /^\d+$/.test(text) ? `${text} servings` : text };
  if (servings) result.servings = Number(servings[1]);
  return result;
}

/** Reads schema.org `NutritionInformation`, whose values carry their units. */
function readNutrition(value: unknown): Nutrition | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Json;
  const num = (key: string): number | undefined => {
    const text = asString(record[key]);
    if (!text) return undefined;
    const m = /(\d+(?:\.\d+)?)/.exec(text);
    return m ? Number(m[1]) : undefined;
  };
  const nutrition: Nutrition = {
    basis: 'publisher',
    calories: num('calories'),
    proteinG: num('proteinContent'),
    fatG: num('fatContent'),
    saturatedFatG: num('saturatedFatContent'),
    carbohydrateG: num('carbohydrateContent'),
    fiberG: num('fiberContent'),
    sugarG: num('sugarContent'),
    sodiumMg: num('sodiumContent'),
    cholesterolMg: num('cholesterolContent'),
  };
  const hasAny = Object.entries(nutrition).some(([k, v]) => k !== 'basis' && v !== undefined);
  return hasAny ? nutrition : undefined;
}

export type JsonLdOptions = {
  /** URL the document was fetched from, used as the canonical source. */
  url?: string;
  /** rssamplifier feed slug, when the page came from the directory. */
  feedSlug?: string;
  publisher?: string;
  now?: string;
};

/** Builds a canonical recipe from one schema.org `Recipe` node. */
export function recipeFromJsonLdNode(node: Json, options: JsonLdOptions = {}): Recipe | undefined {
  const title = asString(node.name);
  if (!title) return undefined;

  const ingredientLines = asStringList(node.recipeIngredient ?? node.ingredients);
  const steps = readSteps(node.recipeInstructions);
  if (ingredientLines.length === 0 && steps.length === 0) return undefined;

  const ingredients: Ingredient[] = ingredientLines.map((line) => parseIngredient(line));

  const times: Times = {};
  const prep = readDuration(node.prepTime);
  const cook = readDuration(node.cookTime);
  const total = readDuration(node.totalTime);
  if (prep) times.prep = prep;
  if (cook) times.cook = cook;
  if (total) times.total = total;

  const source: RecipeSource = { kind: 'jsonld' };
  const url = options.url ?? asString(node.url) ?? asString(node['@id']);
  if (url) source.url = url;
  if (options.feedSlug) source.feedSlug = options.feedSlug;
  const publisher =
    options.publisher ??
    asString((node.publisher as Json)?.name) ??
    (url ? hostName(url) : undefined);
  if (publisher) source.name = publisher;

  const author = asString(node.author);
  const images = asStringList(node.image).slice(0, 5);
  const description = asString(node.description);

  return {
    slug: slugify(title),
    title,
    source,
    times: Object.keys(times).length ? times : undefined,
    recipeYield: readYield(node.recipeYield),
    ingredients,
    steps,
    nutrition: readNutrition(node.nutrition),
    cuisine: asString(node.recipeCuisine),
    category: asString(node.recipeCategory),
    keywords: asStringList(node.keywords).flatMap((k) =>
      k.split(',').map((s) => s.trim()).filter(Boolean),
    ),
    editorial: {
      description,
      author,
      images: images.length ? images : undefined,
    },
    ingestedAt: options.now ?? new Date().toISOString(),
  };
}

function hostName(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const stem = host.split('.')[0];
    return stem.charAt(0).toUpperCase() + stem.slice(1);
  } catch {
    return undefined;
  }
}

/**
 * Extracts the first recipe from a full HTML document.
 * Returns undefined for a page with no `Recipe` markup — a roundup, a news
 * item or a category page.
 */
export function recipeFromHtml(html: string, options: JsonLdOptions = {}): Recipe | undefined {
  for (const block of extractJsonLdBlocks(html)) {
    for (const node of findRecipeNodes(block)) {
      const recipe = recipeFromJsonLdNode(node, options);
      if (recipe) return recipe;
    }
  }
  return undefined;
}
