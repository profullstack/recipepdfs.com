/**
 * Parses the markdown produced by the PDF conversion into a canonical recipe.
 *
 * Two publisher layouts account for essentially the whole corpus, and they
 * differ in how they print times and number their steps:
 *
 *   Taste of Home  `**Total Time** Prep: 20 Min. Bake: 40 Min. **Yield** 4 Servings`
 *                  directions as `- **1** Preheat oven ...`
 *   Allrecipes     `**Prep Time:** 10 mins **Total Time:** 20 mins **Servings:** 4`
 *                  directions as `### **Step 1**` followed by a paragraph
 *
 * Both put ingredients under `## Ingredients` and method under `## Directions`,
 * so section splitting is shared and only the small readers differ.
 */

import {
  groupHeadingText,
  isIngredientGroupHeading,
  parseIngredient,
} from './ingredient';
import type { Ingredient, Nutrition, Recipe, RecipeSource, Step, Times, Yield } from './types';

/** Removes markdown emphasis so headings compare cleanly. */
function plain(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').trim();
}

/** Minutes to an ISO 8601 duration. */
function isoDuration(minutes: number): string {
  if (minutes <= 0) return 'PT0M';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `PT${hours ? `${hours}H` : ''}${mins ? `${mins}M` : ''}` || 'PT0M';
}

/** Reads "20 Min.", "1 hr 10 mins", "75 Min." into minutes. */
function readMinutes(text: string): number | undefined {
  let total = 0;
  let matched = false;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi)) {
    const value = Number(m[1]);
    const unit = m[2].toLowerCase();
    total += unit.startsWith('h') ? value * 60 : value;
    matched = true;
  }
  return matched ? total : undefined;
}

/**
 * Pulls prep/cook/total out of whichever header line carries them.
 * Returns undefined when the document prints no timings at all.
 */
function parseTimes(header: string): Times | undefined {
  const flat = plain(header).replace(/\s+/g, ' ');
  const times: Times = {};

  // Allrecipes: labelled pairs.
  const prep = /Prep(?:\s*Time)?:?\s*([^A-Z]*?(?:mins?|minutes?|hours?|hrs?)\.?)/i.exec(flat);
  const cook = /(?:Cook|Bake|Broil|Grill|Roast)(?:\s*Time)?:?\s*([^A-Z]*?(?:mins?|minutes?|hours?|hrs?)\.?)/i.exec(flat);
  const total = /Total(?:\s*Time)?:?\s*([^A-Z]*?(?:mins?|minutes?|hours?|hrs?)\.?)/i.exec(flat);

  const prepMin = prep ? readMinutes(prep[1]) : undefined;
  const cookMin = cook ? readMinutes(cook[1]) : undefined;
  let totalMin = total ? readMinutes(total[1]) : undefined;

  if (prepMin !== undefined) times.prep = isoDuration(prepMin);
  if (cookMin !== undefined) times.cook = isoDuration(cookMin);

  // Taste of Home prints "Total Time" as a heading then lists the parts under
  // it, so the "total" capture is really the prep leg. Sum instead.
  if (totalMin === undefined && prepMin !== undefined && cookMin !== undefined) {
    totalMin = prepMin + cookMin;
  } else if (totalMin !== undefined && prepMin !== undefined && cookMin !== undefined) {
    const sum = prepMin + cookMin;
    if (totalMin < sum) totalMin = sum;
  }
  if (totalMin !== undefined) times.total = isoDuration(totalMin);

  const display = flat.match(/(?:Total Time|Prep).*/i)?.[0]?.trim();
  if (display) times.display = display;

  return Object.keys(times).length ? times : undefined;
}

/** Reads "**Yield** 4 Servings" / "**Servings:** 4". */
function parseYield(header: string): Yield | undefined {
  const flat = plain(header).replace(/\s+/g, ' ');
  const m = /(?:Yield|Servings|Makes)\s*:?\s*([^*\n]{1,60})/i.exec(flat);
  if (!m) return undefined;
  // Stop at the next label so "Yield 4 Servings Prep: ..." does not swallow it.
  const text = m[1].split(/\b(?:Prep|Total|Cook|Bake)\b/i)[0].trim().replace(/[.,;]$/, '');
  if (!text) return undefined;
  const servings = /(\d+)/.exec(text);
  const result: Yield = { text: /^\d+$/.test(text) ? `${text} servings` : text };
  if (servings) result.servings = Number(servings[1]);
  return result;
}

/** Reads the Allrecipes-style "Per serving: 380 calories; protein 25g ; ..." block. */
function parseNutrition(text: string): Nutrition | undefined {
  if (!/calorie/i.test(text)) return undefined;
  const num = (re: RegExp): number | undefined => {
    const m = re.exec(text);
    return m ? Number(m[1]) : undefined;
  };
  const nutrition: Nutrition = { basis: 'publisher' };
  nutrition.calories = num(/(\d+(?:\.\d+)?)\s*calories/i);
  nutrition.proteinG = num(/protein\s*(\d+(?:\.\d+)?)\s*g/i);
  nutrition.fatG = num(/total fat\s*(\d+(?:\.\d+)?)\s*g/i);
  nutrition.saturatedFatG = num(/saturated fat\s*(\d+(?:\.\d+)?)\s*g/i);
  nutrition.carbohydrateG = num(/total carbohydrate\s*(\d+(?:\.\d+)?)\s*g/i);
  nutrition.fiberG = num(/dietary fiber\s*(\d+(?:\.\d+)?)\s*g/i);
  nutrition.sugarG = num(/total sugars\s*(\d+(?:\.\d+)?)\s*g/i);
  nutrition.sodiumMg = num(/sodium\s*(\d+(?:\.\d+)?)\s*mg/i);
  nutrition.cholesterolMg = num(/cholesterol\s*(\d+(?:\.\d+)?)\s*mg/i);

  const hasAny = Object.entries(nutrition).some(([k, v]) => k !== 'basis' && v !== undefined);
  return hasAny ? nutrition : undefined;
}

type Section = { heading: string; level: number; lines: string[] };

/**
 * Splits the document on any `##`..`######` heading, keeping a preamble.
 *
 * Heading depth is not a reliable guide to structure here: Allrecipes prints
 * ingredient groups at `###` and steps at `####` in one document and at `###`
 * in another, so the level is recorded but sections are grouped by name.
 */
function splitSections(markdown: string): { preamble: string[]; sections: Section[] } {
  const preamble: string[] = [];
  const sections: Section[] = [];
  let current: Section | undefined;

  for (const line of markdown.split('\n')) {
    const heading = /^(#{2,6})\s+(.*)$/.exec(line);
    if (heading) {
      current = { heading: plain(heading[2]), level: heading[1].length, lines: [] };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  return { preamble, sections };
}

/**
 * Headings that begin a new top-level block, whatever depth they are printed
 * at. "Step 1" is deliberately excluded: a numbered step is a child of
 * Directions, not a sibling block, and treating it as one ends the walk before
 * a single step is collected.
 */
const TOP_LEVEL =
  /^(ingredients?|directions?|instructions?|method|steps?(?!\s*\d)|nutrition|notes?|tips?|equipment|cook'?s notes?)\b/i;

/**
 * Every section from `start + 1` up to the next top-level heading.
 * These are the sub-sections belonging to the block at `start`.
 */
function childSections(sections: Section[], start: number): Section[] {
  const out: Section[] = [];
  for (let i = start + 1; i < sections.length; i += 1) {
    if (TOP_LEVEL.test(sections[i].heading)) break;
    out.push(sections[i]);
  }
  return out;
}

function findSectionIndex(sections: Section[], pattern: RegExp): number {
  return sections.findIndex((s) => pattern.test(s.heading));
}

/** Ingredient bullets, tracking the sub-headings they sit under. */
function parseIngredients(lines: string[]): Ingredient[] {
  const out: Ingredient[] = [];
  let group: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const body = bullet ? bullet[1].trim() : trimmed;
    if (!body || body.startsWith('![')) continue;

    if (isIngredientGroupHeading(body)) {
      group = groupHeadingText(body);
      continue;
    }
    // A non-bulleted line inside the ingredient block is still an ingredient
    // when the converter dropped the marker ("cracked black pepper, for garnish").
    out.push(parseIngredient(body, group));
  }
  return out;
}

/**
 * Method steps from either layout.
 *
 * Taste of Home numbers inline (`- **1** Preheat ...`); Allrecipes puts each
 * step behind its own `### Step N` heading, in which case the caller passes the
 * following sections' bodies here already joined.
 */
function parseSteps(lines: string[]): Step[] {
  const out: Step[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('![')) continue;
    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const body = (bullet ? bullet[1] : trimmed).trim();
    if (!body) continue;

    // Leading step number, emphasised or not.
    const numbered = /^\*{0,2}(\d+)[.)]?\*{0,2}\s+(.*)$/.exec(body);
    if (numbered) {
      out.push({ n: out.length + 1, text: plain(numbered[2]).trim() });
      continue;
    }
    // A continuation of the previous step rather than a new one.
    if (out.length) {
      out[out.length - 1].text = `${out[out.length - 1].text} ${plain(body)}`.trim();
    } else {
      out.push({ n: 1, text: plain(body).trim() });
    }
  }
  return out.filter((s) => s.text.length > 0).map((s, i) => ({ n: i + 1, text: s.text }));
}

/** Turns `Step N` sub-sections into steps, in document order. */
function stepsFromSections(children: Section[]): Step[] {
  const out: Step[] = [];
  for (const section of children) {
    const text = section.lines
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('!['))
      .join(' ');
    if (!text) continue;
    // A named sub-section that is not a numbered step (e.g. "For the sauce")
    // still contributes its body, prefixed so the label is not lost.
    const numbered = /^step\s*\d+/i.test(section.heading);
    const body = plain(text);
    out.push({
      n: out.length + 1,
      text: numbered ? body : `${section.heading.replace(/:$/, '')}: ${body}`,
    });
  }
  return out;
}

/** Recovers a publisher and URL from the converted filename. */
export function sourceFromFileName(fileName: string): RecipeSource {
  const base = fileName.replace(/\.pdf$/i, '');
  const source: RecipeSource = { kind: 'pdf', file: fileName };

  // "allrecipes.com_easy-spaghetti-carbonara-recipe-11998102_print=" — the
  // converter replaced "/" with "_" and kept the query string.
  const web = /^([a-z0-9.-]+\.[a-z]{2,})_(.+)$/i.exec(base);
  if (web) {
    const host = web[1];
    const path = web[2].replace(/_print=?$/, '').replace(/_/g, '/');
    source.name = publisherName(host);
    source.url = `https://www.${host}/${path}`;
    return source;
  }

  // Taste of Home exports are titled "<Recipe>: How to Make It".
  if (/how to make it$/i.test(base)) source.name = 'Taste of Home';
  return source;
}

function publisherName(host: string): string {
  const stem = host.replace(/^www\./, '').split('.')[0];
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

/** Slugifies a title for use in URLs. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export type ParseOptions = {
  /** Original PDF filename, used to recover publisher and URL. */
  fileName?: string;
  /** Overrides the timestamp, for deterministic tests. */
  now?: string;
};

/**
 * Parses converted markdown into a canonical recipe.
 *
 * Returns undefined when the document has neither ingredients nor steps —
 * a roundup post or a cover page rather than a recipe.
 */
export function recipeFromMarkdown(
  markdown: string,
  options: ParseOptions = {},
): Recipe | undefined {
  const { preamble, sections } = splitSections(markdown);

  const titleLine = /^#\s+(.*)$/m.exec(markdown);
  const title = titleLine ? plain(titleLine[1]) : undefined;
  if (!title) return undefined;

  const ingredientsIndex = findSectionIndex(sections, /^ingredients?\b/i);
  const directionsIndex = findSectionIndex(sections, /^(directions?|instructions?|method|steps?)\b/i);

  if (ingredientsIndex < 0 && directionsIndex < 0) return undefined;

  // Ingredients: the block's own lines, plus any sub-sections, whose headings
  // ("Dressing:", "FILLING:") name the group their lines belong to.
  const ingredients: Ingredient[] = [];
  if (ingredientsIndex >= 0) {
    ingredients.push(...parseIngredients(sections[ingredientsIndex].lines));
    for (const child of childSections(sections, ingredientsIndex)) {
      const group = child.heading.replace(/:$/, '').trim() || undefined;
      for (const parsed of parseIngredients(child.lines)) {
        ingredients.push(group ? { ...parsed, group } : parsed);
      }
    }
  }

  // Steps: either numbered inline under the heading (Taste of Home) or one
  // sub-section per step (Allrecipes, at whatever depth it chose today).
  let steps: Step[] = [];
  if (directionsIndex >= 0) {
    steps = parseSteps(sections[directionsIndex].lines);
    const children = childSections(sections, directionsIndex);
    if (children.length) {
      const fromChildren = stepsFromSections(children);
      // Inline text under the heading is usually a stray lead-in when the real
      // steps are in sub-sections; prefer the sub-sections when they exist.
      if (fromChildren.length >= steps.length) steps = fromChildren;
    }
  }

  if (ingredients.length === 0 && steps.length === 0) return undefined;

  // Times, yield and the headnote all live above the first `##`.
  const header = preamble.join('\n');
  const times = parseTimes(header);
  const recipeYield = parseYield(header);

  const nutritionIndex = findSectionIndex(sections, /nutrition/i);
  const nutrition =
    nutritionIndex >= 0
      ? parseNutrition(sections[nutritionIndex].lines.join(' '))
      : parseNutrition(markdown);

  const source = options.fileName ? sourceFromFileName(options.fileName) : { kind: 'pdf' as const };
  // The converter lifts the canonical URL out of the print-view footer, which
  // is the only place a Taste of Home export names where it came from.
  const declared = /^Source:\s*(https?:\/\/\S+)\s*$/m.exec(markdown)?.[1];
  if (declared) {
    source.url = declared;
    if (!source.name) source.name = publisherName(new URL(declared).hostname.replace(/^www\./, ''));
  }
  // Taste of Home exports do not all carry the publisher in the filename, but
  // they all carry its test-kitchen badge in the body.
  if (!source.name && /Test Kitchen Approved/i.test(markdown)) source.name = 'Taste of Home';

  // The headnote: the first substantial prose line anywhere above the
  // ingredients. It is not always in the preamble — Taste of Home prints a
  // "Test Kitchen Approved" sub-heading between the title and the headnote —
  // so this scans the whole document up to the ingredient list.
  const beforeIngredients = markdown.split(/^#{2,6}\s+\**\s*ingredients?/im)[0];
  const description = beforeIngredients
    .split('\n')
    .map((l) => l.trim())
    .find(
      (l) =>
        l.length > 60 &&
        !l.startsWith('![') &&
        !l.startsWith('#') &&
        !/^Source:/i.test(l) &&
        !/Total Time|Prep:|Yield|Servings/i.test(l),
    );

  const author = /By\s+\*\*([^*]+)\*\*/.exec(markdown)?.[1]?.trim();
  const images = [...markdown.matchAll(/!\[\]\(<?([^)>]+)>?\)/g)].map((m) => m[1]);

  return {
    slug: slugify(title),
    title,
    source,
    times,
    recipeYield,
    ingredients,
    steps,
    nutrition,
    editorial: {
      description: description ? plain(description) : undefined,
      author,
      images: images.length ? images : undefined,
    },
    ingestedAt: options.now ?? new Date().toISOString(),
  };
}
