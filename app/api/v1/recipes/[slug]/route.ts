import { NextResponse } from 'next/server';
import { getRecipe } from '@/lib/recipe/store';

/**
 * One recipe as structured JSON.
 *
 * The PDF behind it is converted and parsed on this request if that has not
 * happened before, then cached, so the second caller pays nothing.
 */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const recipe = await getRecipe(slug);

  if (!recipe) {
    return NextResponse.json(
      { error: 'not_found', message: `No recipe named "${slug}".` },
      { status: 404 },
    );
  }

  return NextResponse.json(recipe, {
    headers: { 'cache-control': 'public, max-age=3600' },
  });
}
