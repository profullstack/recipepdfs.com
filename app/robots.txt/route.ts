import { FREE_LIMIT, TIERS, windowMs } from "@/lib/rate-limit";

/**
 * Everyone is welcome, including AI training crawlers.
 *
 * Access is sold by request rate rather than by identity, so there is no
 * user-agent to disallow — a crawler that stays under the free allowance is
 * exactly as welcome as a person, and one that wants to go faster buys a tier.
 * The gateway's own robots generator is deliberately not used here: it names
 * training crawlers as refused, which this site no longer does.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const perWindow = `${FREE_LIMIT} requests per ${Math.round(windowMs / 1000)}s`;

  const tierLines = TIERS.map((tier) =>
    tier.priceCents === 0
      ? `# ${tier.name}: ${tier.limit} req/min, free`
      : `# ${tier.name}: ${tier.limit} req/min, $${(tier.priceCents / 100).toFixed(2)}/day`,
  ).join("\n");

  const body = `# recipepdfs.com
#
# Crawl freely. Access here is limited by rate, not by who you are, so there
# is no list of refused agents: the free allowance is ${perWindow} and the
# response tells you what you have left. Past it you get 402 with an offer to
# buy a faster tier, payable over x402 in USDC without talking to anybody.
#
${tierLines}
#
# What is here and how to read it: ${origin}/llms.txt
# Tiers and prices:                 ${origin}/pricing

User-agent: *
Allow: /

Sitemap: ${origin}/llms.txt
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
