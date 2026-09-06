/**
 * The canonical recipe record.
 *
 * Three ingest paths produce this same shape — converted PDFs
 * (`from-markdown`), schema.org JSON-LD scraped off the open web
 * (`from-jsonld`), and anything a publisher hands us directly — so the serving
 * layer never has to care where a recipe came from.
 *
 * What we serve is the structured, factual half: ingredients, steps, times,
 * yields, nutrition. Headnote prose, bylines and photography stay on
 * `editorial` where the corpus build can keep them out of the public feed;
 * every record carries its `source` so a consumer can go read the original.
 */

export type SourceKind = 'pdf' | 'jsonld' | 'publisher';

export type RecipeSource = {
  /** Publisher name, e.g. "Allrecipes" or "Taste of Home". */
  name?: string;
  /** Canonical URL of the original recipe, when we can recover one. */
  url?: string;
  kind: SourceKind;
  /** Basename of the PDF this came from, for `kind: 'pdf'`. */
  file?: string;
  /** Feed slug in the rssamplifier directory, for `kind: 'jsonld'`. */
  feedSlug?: string;
};

/**
 * One ingredient line, kept both raw and resolved.
 *
 * `raw` is always exactly what the source said — it is the only field we can
 * guarantee. Everything else is our parse and may be absent.
 */
export type Ingredient = {
  raw: string;
  /** Sub-heading the line sat under, e.g. "FILLING". */
  group?: string;
  /** Numeric quantity, fractions and unicode vulgars already resolved. */
  quantity?: number;
  /** Upper bound when the source gave a range ("1 to 2 cups"). */
  quantityMax?: number;
  /** Normalised unit token, e.g. "cup", "tablespoon", "ounce". */
  unit?: string;
  /** Parenthetical pack size, e.g. "14-1/2 ounces" from "1 can (14-1/2 ounces)". */
  packSize?: string;
  /** The food itself, with quantity, unit and preparation stripped. */
  item?: string;
  /** Trailing preparation note, e.g. "chopped", "softened, divided". */
  note?: string;
  /** True when the source marked the line optional. */
  optional?: boolean;
  /** USDA FoodData Central id, filled in by the resolver pass. */
  fdcId?: number;
  /** Mass in grams once resolved against USDA portion data. */
  grams?: number;
};

export type Step = {
  n: number;
  text: string;
};

export type Times = {
  /** ISO 8601 duration, e.g. "PT20M". */
  prep?: string;
  cook?: string;
  total?: string;
  /** Exactly what the source printed, e.g. "Prep: 20 Min. Bake: 40 Min." */
  display?: string;
};

export type Yield = {
  text: string;
  servings?: number;
};

export type Nutrition = {
  /** Per serving unless the source said otherwise. */
  calories?: number;
  proteinG?: number;
  fatG?: number;
  saturatedFatG?: number;
  carbohydrateG?: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  cholesterolMg?: number;
  /** Whether the publisher supplied this or we computed it from USDA data. */
  basis: 'publisher' | 'usda';
};

/**
 * Copyrightable material from the original page.
 *
 * Held separately so `buildPublicRecord` can drop it: ingredient lists and
 * procedural steps are facts, but headnotes and photographs are the
 * publisher's expression and are not ours to redistribute.
 */
export type Editorial = {
  description?: string;
  author?: string;
  notes?: string[];
  images?: string[];
};

export type Recipe = {
  slug: string;
  title: string;
  source: RecipeSource;
  times?: Times;
  recipeYield?: Yield;
  ingredients: Ingredient[];
  steps: Step[];
  nutrition?: Nutrition;
  cuisine?: string;
  category?: string;
  keywords?: string[];
  editorial?: Editorial;
  /** ISO timestamp of when we parsed it. */
  ingestedAt: string;
};

/** A recipe with the publisher's expression stripped, safe to serve in bulk. */
export type PublicRecipe = Omit<Recipe, 'editorial'> & {
  attribution: string;
};

/**
 * Drops editorial prose and attaches a human-readable attribution line.
 * This is what the API and the agent feeds return.
 */
export function buildPublicRecord(recipe: Recipe): PublicRecipe {
  const { editorial: _editorial, ...rest } = recipe;
  const publisher = recipe.source.name ?? 'an independent publisher';
  const where = recipe.source.url ? ` — ${recipe.source.url}` : '';
  return {
    ...rest,
    attribution: `Recipe facts extracted from ${publisher}${where}. Ingredients, quantities and method are reproduced as facts; the original wording, photography and headnotes remain with the publisher.`,
  };
}
