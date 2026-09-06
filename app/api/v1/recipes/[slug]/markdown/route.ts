import { getRecipe, recipeToMarkdown } from '@/lib/recipe/store';

/**
 * One recipe as markdown — the shape most agents would rather read than JSON.
 * Converted on demand and cached, exactly as the JSON route is.
 */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const recipe = await getRecipe(slug);

  if (!recipe) {
    return new Response(`# Not found\n\nNo recipe named "${slug}".\n`, {
      status: 404,
      headers: { 'content-type': 'text/markdown; charset=utf-8' },
    });
  }

  return new Response(recipeToMarkdown(recipe), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
