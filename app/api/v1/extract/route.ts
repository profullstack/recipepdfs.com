import { NextResponse } from 'next/server';
import { recipeFromHtml } from '@/lib/recipe/from-jsonld';

/**
 * Extracts a recipe from any public URL carrying schema.org `Recipe` markup.
 *
 * The on-demand counterpart to the PDF library: an agent that already has a
 * recipe URL gets it back structured, without us having crawled anything in
 * advance. Nothing is stored — this reads the publisher's page live and
 * returns the parse.
 */
export const dynamic = 'force-dynamic';

const BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/**
 * Refuses anything that is not a public http(s) URL.
 *
 * Without this the route is an open proxy into whatever the server can reach,
 * including link-local metadata endpoints and private ranges.
 */
function isPubliclyFetchable(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'not a valid URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'only http and https are supported' };
  }

  const host = url.hostname.toLowerCase();
  const blocked =
    host === 'localhost' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    // IPv4 literals in private, loopback, link-local and CGNAT ranges.
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) ||
    /^0\./.test(host);

  if (blocked) return { ok: false, reason: 'host is not publicly routable' };

  return { ok: true, url };
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get('url');
  if (!target) {
    return NextResponse.json(
      { error: 'missing_url', message: 'Pass ?url= the recipe page to extract.' },
      { status: 400 },
    );
  }

  const check = isPubliclyFetchable(target);
  if (!check.ok) {
    return NextResponse.json({ error: 'bad_url', message: check.reason }, { status: 400 });
  }

  let html: string;
  try {
    const response = await fetch(check.url, {
      headers: {
        'user-agent': BROWSER_UA,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-dest': 'document',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: 'upstream_error', status: response.status, url: check.url.toString() },
        { status: 502 },
      );
    }
    html = await response.text();
  } catch (error) {
    return NextResponse.json(
      { error: 'fetch_failed', message: (error as Error).message },
      { status: 502 },
    );
  }

  const recipe = recipeFromHtml(html, { url: check.url.toString() });
  if (!recipe) {
    return NextResponse.json(
      {
        error: 'no_recipe',
        message:
          'That page carries no schema.org Recipe markup. Roundups, meal plans and news posts usually do not.',
        url: check.url.toString(),
      },
      { status: 404 },
    );
  }

  // Editorial prose belongs to the publisher; return the facts and the link.
  const { editorial: _editorial, ...facts } = recipe;

  return NextResponse.json({
    ...facts,
    attribution: `Extracted live from ${check.url.toString()}. Ingredients, quantities and method are reproduced as facts; the original wording and photography remain with the publisher.`,
  });
}
