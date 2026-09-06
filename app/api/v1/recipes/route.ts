import { NextResponse } from 'next/server';
import { searchLibrary } from '@/lib/recipe/store';

/**
 * The library index.
 *
 * Reads filenames only — no PDF is opened and nothing is converted — so this
 * stays cheap however large the library grows. `converted: true` marks the
 * recipes already in the cache; the rest are converted when first requested.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? undefined;
  const limit = Number(url.searchParams.get('limit') ?? 20);
  const offset = Number(url.searchParams.get('offset') ?? 0);

  const { total, results } = await searchLibrary({
    q,
    limit: Number.isFinite(limit) ? limit : 20,
    offset: Number.isFinite(offset) ? offset : 0,
  });

  const origin = url.origin;

  return NextResponse.json(
    {
      total,
      count: results.length,
      offset: Number.isFinite(offset) ? offset : 0,
      query: q ?? null,
      recipes: results.map((entry) => ({
        slug: entry.slug,
        title: entry.title,
        publisher: entry.publisher ?? null,
        sourceUrl: entry.sourceUrl ?? null,
        converted: entry.converted,
        json: `${origin}/api/v1/recipes/${entry.slug}`,
        markdown: `${origin}/api/v1/recipes/${entry.slug}/markdown`,
      })),
    },
    {
      headers: {
        'cache-control': 'public, max-age=60',
      },
    },
  );
}
