import { listLibrary } from '@/lib/recipe/store';
import { TIERS, windowMs } from '@/lib/rate-limit';

/**
 * The agent-facing front door.
 *
 * Says what is here, how to read it, and what it costs, in the plain-text
 * shape agents look for. Kept open to every crawler by the gateway's
 * `openPaths` so a bot can discover the offer before deciding to pay.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const library = await listLibrary();

  const publishers = new Map<string, number>();
  for (const entry of library) {
    const name = entry.publisher ?? 'Unknown';
    publishers.set(name, (publishers.get(name) ?? 0) + 1);
  }

  const publisherLines = [...publishers.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `- ${name}: ${count}`)
    .join('\n');

  const sample = library
    .slice(0, 15)
    .map((entry) => `- [${entry.title}](${origin}/api/v1/recipes/${entry.slug})`)
    .join('\n');

  const perMinute = (limit: number) =>
    windowMs === 60_000 ? `${limit}/min` : `${limit} per ${Math.round(windowMs / 1000)}s`;

  const tierLines = TIERS.map((tier) =>
    tier.priceCents === 0
      ? `- **${tier.name}** — ${perMinute(tier.limit)}, no charge, no signup.`
      : `- **${tier.name}** — ${perMinute(tier.limit)}, $${(tier.priceCents / 100).toFixed(2)} per day.`,
  ).join('\n');

  const body = `# recipepdfs.com

> Recipe cookbooks as structured data. Every recipe is served as JSON or
> markdown with ingredients parsed into quantity, unit and item — the part
> that is tedious to do yourself — alongside times, yields and nutrition.

Recipes in the library: ${library.length}

## How to read it

- [Index](${origin}/api/v1/recipes): every recipe, with a link to each.
  Supports \`?q=\`, \`?limit=\` and \`?offset=\`. Free, and it opens no files.
- [One recipe, JSON](${origin}/api/v1/recipes/{slug})
- [One recipe, markdown](${origin}/api/v1/recipes/{slug}/markdown)
- [Extract any URL](${origin}/api/v1/extract?url=...): give us a recipe page
  carrying schema.org Recipe markup and we return it structured, live.
- [MCP](${origin}/api/mcp): the same three operations as tools, for agents
  that speak Model Context Protocol.

Recipes are converted from the source PDF the first time somebody asks for
one, then cached. Nothing is pre-generated, so a slug listed in the index but
never requested has cost nobody anything.

## What you get

Each record carries \`ingredients\` (each with \`raw\` plus parsed
\`quantity\`, \`unit\`, \`item\`, \`note\` and any \`group\` it belongs to),
numbered \`steps\`, ISO 8601 \`times\`, \`recipeYield\`, and \`nutrition\`
when the publisher supplied it.

We serve the structured facts and a link to the original. Headnote prose and
photography stay with the publisher and are not redistributed here.

## Publishers

${publisherLines}

## Access and pricing

Nothing here is gated on who you are. Training crawlers, retrieval crawlers
and people are all welcome and all read the same data. What is sold is
throughput.

${tierLines}

Every response carries \`x-ratelimit-limit\`, \`x-ratelimit-remaining\`,
\`x-ratelimit-reset\` and \`x-ratelimit-tier\`, so you can pace yourself
instead of discovering the ceiling by hitting it.

Go over your allowance and the next response is 402 with an x402 offer for the
tier above. Pay it — USDC, settled by CoinPay, no signup and no human in the
loop — and the 200 body holds a pass. Send it back as \`x-crawl-pass\` or
\`Authorization: Bearer <pass>\` and your ceiling goes up for the day.
Multi-day: \`${origin}/crawl?days=7\`.

Full machine-readable terms: [${origin}/pricing](${origin}/pricing).
/llms.txt, /pricing and /robots.txt stay readable even when you are over your
allowance, so a refused agent can always find out why and what to do.

## Sample

${sample}

Contact: support@recipepdfs.com
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
