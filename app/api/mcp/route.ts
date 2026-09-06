import { NextResponse } from 'next/server';
import { getRecipe, recipeToMarkdown, searchLibrary } from '@/lib/recipe/store';
import { recipeFromHtml } from '@/lib/recipe/from-jsonld';

/**
 * A minimal MCP endpoint over JSON-RPC.
 *
 * Three tools, matching the three HTTP surfaces: list the library, read one
 * recipe, and extract a recipe from any URL. Implemented directly rather than
 * through an SDK because the whole server is three method handlers and the
 * route has to stay edge-friendly.
 */
export const dynamic = 'force-dynamic';

const PROTOCOL_VERSION = '2025-06-18';

const TOOLS = [
  {
    name: 'search_recipes',
    description:
      'Search the recipe library by title or publisher. Returns slugs to read with get_recipe. Cheap: it opens no files.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to match in the title or publisher.' },
        limit: { type: 'number', description: 'Maximum results, 1-100. Default 20.' },
      },
    },
  },
  {
    name: 'get_recipe',
    description:
      'Read one recipe by slug, with ingredients parsed into quantity, unit and item. Converts the source PDF on first request, then caches it.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Recipe slug from search_recipes.' },
        format: {
          type: 'string',
          enum: ['json', 'markdown'],
          description: 'Defaults to markdown.',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'extract_recipe',
    description:
      'Extract a structured recipe from any public URL carrying schema.org Recipe markup. Reads the page live; stores nothing.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The recipe page to read.' },
      },
      required: ['url'],
    },
  },
];

type RpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function result(id: RpcRequest['id'], value: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, result: value });
}

function failure(id: RpcRequest['id'], code: number, message: string) {
  return NextResponse.json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
}

/** Wraps a value as MCP tool content. */
function textContent(text: string, isError = false) {
  return { content: [{ type: 'text', text }], isError };
}

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === 'search_recipes') {
    const { total, results } = await searchLibrary({
      q: typeof args.query === 'string' ? args.query : undefined,
      limit: typeof args.limit === 'number' ? args.limit : 20,
    });
    const lines = results.map(
      (entry) =>
        `- ${entry.slug} — ${entry.title}${entry.publisher ? ` (${entry.publisher})` : ''}`,
    );
    return textContent(
      `${total} recipe${total === 1 ? '' : 's'} matched; showing ${results.length}.\n\n${lines.join('\n')}`,
    );
  }

  if (name === 'get_recipe') {
    const slug = typeof args.slug === 'string' ? args.slug : '';
    if (!slug) return textContent('get_recipe needs a slug.', true);

    const recipe = await getRecipe(slug);
    if (!recipe) return textContent(`No recipe named "${slug}".`, true);

    return args.format === 'json'
      ? textContent(JSON.stringify(recipe, null, 2))
      : textContent(recipeToMarkdown(recipe));
  }

  if (name === 'extract_recipe') {
    const url = typeof args.url === 'string' ? args.url : '';
    if (!url) return textContent('extract_recipe needs a url.', true);

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return textContent('That is not a valid URL.', true);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return textContent('Only http and https URLs can be extracted.', true);
    }

    try {
      const response = await fetch(parsed, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml',
          'sec-fetch-mode': 'navigate',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) return textContent(`Upstream returned ${response.status}.`, true);

      const recipe = recipeFromHtml(await response.text(), { url: parsed.toString() });
      if (!recipe) {
        return textContent(
          'That page carries no schema.org Recipe markup — roundups and news posts usually do not.',
          true,
        );
      }
      const { editorial: _editorial, ...facts } = recipe;
      return textContent(JSON.stringify(facts, null, 2));
    } catch (error) {
      return textContent(`Could not read that page: ${(error as Error).message}`, true);
    }
  }

  return textContent(`Unknown tool "${name}".`, true);
}

export async function POST(request: Request) {
  let body: RpcRequest;
  try {
    body = (await request.json()) as RpcRequest;
  } catch {
    return failure(null, -32700, 'Parse error');
  }

  const { method, id, params } = body;

  if (method === 'initialize') {
    return result(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: 'recipepdfs', version: '1.0.0' },
    });
  }

  if (method === 'notifications/initialized') {
    return new Response(null, { status: 204 });
  }

  if (method === 'tools/list') {
    return result(id, { tools: TOOLS });
  }

  if (method === 'tools/call') {
    const name = (params?.name as string) ?? '';
    const args = (params?.arguments as Record<string, unknown>) ?? {};
    try {
      return result(id, await callTool(name, args));
    } catch (error) {
      return failure(id, -32603, (error as Error).message);
    }
  }

  return failure(id, -32601, `Unknown method "${method}"`);
}

/** A GET describes the endpoint, so a human or an agent can probe it. */
export async function GET() {
  return NextResponse.json({
    name: 'recipepdfs',
    protocolVersion: PROTOCOL_VERSION,
    transport: 'JSON-RPC over HTTP POST',
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}
