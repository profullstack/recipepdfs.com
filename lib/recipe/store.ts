/**
 * Lazy recipe store.
 *
 * Nothing is converted until somebody asks for it. Listing the library is
 * cheap — it reads PDF filenames and never opens a file — and a recipe is
 * parsed only when it is actually requested, then cached on disk so the work
 * happens exactly once.
 *
 * The cache is keyed by slug and carries the source file's mtime and size, so
 * replacing a PDF invalidates its entry without anything having to remember to
 * clear it.
 */

import { readdir, readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { recipeFromMarkdown, slugify, sourceFromFileName } from './from-markdown';
import { buildPublicRecord } from './types';
import type { PublicRecipe, Recipe } from './types';

const run = promisify(execFile);

/** Where the source PDFs and their converted markdown live. */
export const pdfDir =
  process.env.RECIPE_PDF_DIR || path.join(process.env.HOME ?? '', 'public/recipes');

/** Where converted records are cached. */
const cacheDir =
  process.env.RECIPE_CACHE_DIR || path.join(process.env.RECIPEPDFS_DATA_DIR || '.data', 'recipes');

export type LibraryEntry = {
  slug: string;
  title: string;
  file: string;
  publisher?: string;
  sourceUrl?: string;
  bytes: number;
  /** True once a converted record is cached. */
  converted: boolean;
};

type CacheEnvelope = {
  /** Source file identity, so a replaced PDF invalidates the entry. */
  mtimeMs: number;
  bytes: number;
  recipe: Recipe;
};

/**
 * Turns a PDF filename into the title we advertise before parsing anything.
 *
 * Export tooling leaves boilerplate on both layouts — Allrecipes files end
 * `_print=` and carry a numeric id, Taste of Home files end
 * "Recipe_ How to Make It" — and none of it belongs in a slug an agent has to
 * type. The parsed document's own title wins later; this only has to be a
 * good name for the index.
 */
function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, '');

  const web = /^[a-z0-9.-]+\.[a-z]{2,}_(.+)$/i.exec(base);
  const stem = web
    ? web[1]
        .replace(/_print=?$/, '')
        .replace(/-recipe-\d+$/, '')
        .replace(/-\d{4,}$/, '')
        .replace(/^recipe_\d+_/, '')
        .replace(/[-_]+/g, ' ')
    : base.replace(/_/g, ' ');

  return stem
    // "Bacon Cheeseburger Recipe: How to Make It" -> "Bacon Cheeseburger"
    .replace(/\s*Recipe[:\s]*How to Make It\s*$/i, '')
    .replace(/\s*How to Make It\s*$/i, '')
    .replace(/\s+Recipe\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function cachePathFor(slug: string): Promise<string> {
  return path.join(cacheDir, `${slug}.json`);
}

/**
 * The library listing is memoised for a short window.
 *
 * Building it costs a readdir plus two stats per PDF, and both the index route
 * and every single-recipe lookup need it. At the request rates the paid tiers
 * promise that is thousands of syscalls a second for a directory that changes
 * when somebody uploads a cookbook. A few seconds of staleness is the right
 * trade; `LIBRARY_TTL_MS=0` disables it.
 */
const libraryTtlMs = Number(process.env.LIBRARY_TTL_MS ?? 5000);
let libraryCache: { at: number; entries: LibraryEntry[] } | undefined;

/**
 * Converted records held in process, bounded so a large library cannot grow
 * the heap without limit. Oldest entry out when full — recipe traffic is
 * heavily skewed to a few popular slugs, so a plain bound is enough.
 */
const memoLimit = Number(process.env.RECORD_MEMO_LIMIT ?? 500);
const recordMemo = new Map<
  string,
  { mtimeMs: number; bytes: number; record: PublicRecipe }
>();

function rememberRecord(
  slug: string,
  mtimeMs: number,
  bytes: number,
  record: PublicRecipe,
): void {
  if (memoLimit <= 0) return;
  if (recordMemo.size >= memoLimit) {
    const oldest = recordMemo.keys().next().value;
    if (oldest !== undefined) recordMemo.delete(oldest);
  }
  recordMemo.set(slug, { mtimeMs, bytes, record });
}

/** Drops the memoised listing and records, so an upload shows up at once. */
export function invalidateLibrary(): void {
  libraryCache = undefined;
  recordMemo.clear();
}

/**
 * Every PDF in the library, without opening any of them.
 * Slugs are derived from the filename so they are stable across conversions.
 */
export async function listLibrary(): Promise<LibraryEntry[]> {
  if (libraryCache && libraryTtlMs > 0 && Date.now() - libraryCache.at < libraryTtlMs) {
    return libraryCache.entries;
  }

  const entries = await readdir(pdfDir, { withFileTypes: true }).catch(() => []);

  const pdfs = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const seen = new Map<string, number>();

  // The two stats per PDF are independent, so run them together rather than
  // walking the directory serially.
  const library = (
    await Promise.all(
      pdfs.map(async (pdf) => {
        const title = titleFromFileName(pdf.name);
        let slug = slugify(title);
        const count = seen.get(slug) ?? 0;
        seen.set(slug, count + 1);
        if (count > 0) slug = `${slug}-${count + 1}`;

        const source = sourceFromFileName(pdf.name);

        const [info, cached] = await Promise.all([
          stat(path.join(pdfDir, pdf.name)).catch(() => undefined),
          stat(await cachePathFor(slug)).catch(() => undefined),
        ]);

        // A file that vanished between readdir and stat is simply skipped.
        if (!info) return undefined;

        const entry: LibraryEntry = {
          slug,
          title,
          file: pdf.name,
          publisher: source.name,
          sourceUrl: source.url,
          bytes: info.size,
          converted: Boolean(cached),
        };
        return entry;
      }),
    )
  ).filter((entry): entry is LibraryEntry => entry !== undefined);

  libraryCache = { at: Date.now(), entries: library };
  return library;
}

async function readCache(slug: string, mtimeMs: number, bytes: number): Promise<Recipe | undefined> {
  try {
    const raw = await readFile(await cachePathFor(slug), 'utf8');
    const envelope = JSON.parse(raw) as CacheEnvelope;
    // A replaced PDF invalidates the entry.
    if (envelope.mtimeMs !== mtimeMs || envelope.bytes !== bytes) return undefined;
    return envelope.recipe;
  } catch {
    return undefined;
  }
}

async function writeCache(slug: string, envelope: CacheEnvelope): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  const target = await cachePathFor(slug);
  // Write-then-rename so a concurrent reader never sees a half-written file.
  const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  await rename(tmp, target);
}

/**
 * Converts one PDF to markdown, if that has not happened already.
 * Returns the markdown, or undefined when the PDF cannot be converted.
 */
async function markdownFor(fileName: string): Promise<string | undefined> {
  const base = fileName.replace(/\.pdf$/i, '');
  const mdPath = path.join(pdfDir, `${base}-md`, `${base}.md`);

  try {
    return await readFile(mdPath, 'utf8');
  } catch {
    // Not converted yet — convert this one file, now.
  }

  const script = path.join(process.cwd(), 'scripts', 'pdf-to-markdown.py');
  try {
    await run('python3', [script, path.join(pdfDir, fileName)], { timeout: 120_000 });
  } catch (error) {
    console.error(`pdf conversion failed for ${fileName}:`, (error as Error).message);
    return undefined;
  }

  try {
    return await readFile(mdPath, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * The parsed recipe for a slug, converting on first request and caching the
 * result. Returns undefined when no such PDF exists or it holds no recipe.
 */
export async function getRecipe(slug: string): Promise<PublicRecipe | undefined> {
  const library = await listLibrary();
  const entry = library.find((e) => e.slug === slug);
  if (!entry) return undefined;

  const info = await stat(path.join(pdfDir, entry.file)).catch(() => undefined);
  if (!info) return undefined;

  // In-process memo, checked against the source file's identity so a replaced
  // PDF still invalidates it. Saves a readFile and a JSON.parse on the hot
  // path, which is the whole cost of a served request once converted.
  const memo = recordMemo.get(slug);
  if (memo && memo.mtimeMs === info.mtimeMs && memo.bytes === info.size) {
    return memo.record;
  }

  const cached = await readCache(slug, info.mtimeMs, info.size);
  if (cached) {
    const record = buildPublicRecord(cached);
    rememberRecord(slug, info.mtimeMs, info.size, record);
    return record;
  }

  const markdown = await markdownFor(entry.file);
  if (!markdown) return undefined;

  const parsed = recipeFromMarkdown(markdown, { fileName: entry.file });
  if (!parsed) return undefined;

  // Keep the filename-derived slug: it is what the index advertised.
  const recipe: Recipe = { ...parsed, slug };
  await writeCache(slug, { mtimeMs: info.mtimeMs, bytes: info.size, recipe });

  const record = buildPublicRecord(recipe);
  rememberRecord(slug, info.mtimeMs, info.size, record);
  return record;
}

export type SearchOptions = {
  q?: string;
  limit?: number;
  offset?: number;
};

/**
 * Searches the library by title and publisher only.
 *
 * Deliberately shallow: matching on ingredients would mean converting every
 * PDF to answer one query, which is exactly what this store exists to avoid.
 * Agents that want ingredient-level search fetch the recipes they care about.
 */
export async function searchLibrary(
  options: SearchOptions = {},
): Promise<{ total: number; results: LibraryEntry[] }> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  let entries = await listLibrary();

  if (options.q) {
    const terms = options.q.toLowerCase().split(/\s+/).filter(Boolean);
    entries = entries.filter((entry) => {
      const text = `${entry.title} ${entry.publisher ?? ''}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }

  return { total: entries.length, results: entries.slice(offset, offset + limit) };
}

/** Minutes in an ISO 8601 duration. */
export function durationMinutes(iso?: string): number | undefined {
  if (!iso) return undefined;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(iso);
  if (!m) return undefined;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return total > 0 ? total : undefined;
}

/** Renders a recipe as markdown, which is what most agents would rather read. */
export function recipeToMarkdown(recipe: PublicRecipe): string {
  const lines: string[] = [`# ${recipe.title}`, ''];

  const meta: string[] = [];
  if (recipe.source.name) meta.push(`**Publisher:** ${recipe.source.name}`);
  if (recipe.source.url) meta.push(`**Source:** ${recipe.source.url}`);
  if (recipe.recipeYield) meta.push(`**Yield:** ${recipe.recipeYield.text}`);
  const total = durationMinutes(recipe.times?.total);
  if (total) meta.push(`**Total time:** ${total} min`);
  if (meta.length) lines.push(meta.join('  \n'), '');

  if (recipe.ingredients.length) {
    lines.push('## Ingredients', '');
    let group: string | undefined;
    for (const ingredient of recipe.ingredients) {
      if (ingredient.group && ingredient.group !== group) {
        group = ingredient.group;
        lines.push('', `### ${group}`, '');
      }
      lines.push(`- ${ingredient.raw}`);
    }
    lines.push('');
  }

  if (recipe.steps.length) {
    lines.push('## Directions', '');
    for (const step of recipe.steps) lines.push(`${step.n}. ${step.text}`, '');
  }

  if (recipe.nutrition) {
    const n = recipe.nutrition;
    const parts = [
      n.calories !== undefined ? `${n.calories} cal` : undefined,
      n.proteinG !== undefined ? `protein ${n.proteinG}g` : undefined,
      n.fatG !== undefined ? `fat ${n.fatG}g` : undefined,
      n.carbohydrateG !== undefined ? `carbs ${n.carbohydrateG}g` : undefined,
      n.sodiumMg !== undefined ? `sodium ${n.sodiumMg}mg` : undefined,
    ].filter(Boolean);
    if (parts.length) {
      lines.push('## Nutrition', '', `Per serving (${n.basis}): ${parts.join(', ')}`, '');
    }
  }

  lines.push('---', '', recipe.attribution, '');
  return lines.join('\n');
}
