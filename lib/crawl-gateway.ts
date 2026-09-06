import { createGateway, readPass } from "@profullstack/x402-gateway";
import { x402Proxy } from "@profullstack/x402-gateway/next";
import { paidTiers, secretForTier, tierById, type Tier } from "@/lib/rate-limit";

/**
 * Sells access by request rate, settled by CoinPay in USDC over x402.
 *
 * Everyone — people, search crawlers and AI training crawlers alike — reads
 * free up to the free tier's ceiling. Past it the answer is 402 carrying the
 * offer for the next tier up. Data is never gated on who is asking, only on
 * how hard they are asking, which is the model Anthony set: do not gate the
 * data, sell the throughput.
 *
 * Runs inside the middleware, so nothing here may import Node-only modules.
 * The env is read through a non-literal key on purpose: Next inlines
 * `process.env.NAME` at build time, and these are runtime secrets. Without
 * COINPAY_X402_KEY and CRAWL_PAY_TO the gateway still answers with 402, just
 * with an empty offer.
 */
const env = (name: string) => process.env[name];

const baseSecret = () => env("COINPAY_X402_KEY") ?? "";

const siteUrl = () =>
  env("SITE_URL") || env("NEXT_PUBLIC_SITE_URL") || "https://recipepdfs.com";

/**
 * One gateway per paid tier, each priced and signed for that tier.
 *
 * `createGateway` is cheap, but building one per request would still be waste,
 * so they are memoised by tier id.
 */
const gateways = new Map<string, ReturnType<typeof createGateway>>();

export function gatewayForTier(tier: Tier) {
  const existing = gateways.get(tier.id);
  if (existing) return existing;

  const gateway = createGateway({
    siteUrl: siteUrl(),
    siteName: `recipepdfs (${tier.name})`,
    coinpay: { apiKey: env("COINPAY_X402_KEY") },
    payTo: env("CRAWL_PAY_TO"),
    contact: "mailto:support@recipepdfs.com",
    priceCents: tier.priceCents,
    // Each tier signs its passes with its own derived secret, so the secret a
    // pass verifies against is what identifies its tier on the way back in.
    secret: secretForTier(baseSecret(), tier),
    // Over the limit, everyone pays: the ceiling is the price boundary, not
    // the user agent. `isPaidAgent` is what the gateway consults to decide
    // whether a caller must pay, so saying yes to all of them is how a
    // rate-triggered 402 is expressed.
    isPaidAgent: () => true,
    // Discovery stays readable even to a caller who is over the limit,
    // otherwise an agent that has just been refused cannot read why.
    openPaths: ["/llms.txt", "/pricing"],
  });

  gateways.set(tier.id, gateway);
  return gateway;
}

/** The cheapest paid tier: what a free caller is offered when they run out. */
export const entryTier = (): Tier => paidTiers()[0];

/**
 * The tier a request has already paid for, or undefined.
 *
 * Tries each paid tier's secret against the presented pass, richest first, so
 * a Bulk pass is recognised as Bulk rather than matching Standard on the way
 * past. Returns undefined for no pass, an expired pass or a forged one.
 */
export async function tierOfRequest(request: Request): Promise<Tier | undefined> {
  const token = passTokenFrom(request);
  if (!token) return undefined;

  const secret = baseSecret();
  if (!secret) return undefined;

  for (const tier of [...paidTiers()].reverse()) {
    const claims = await readPass(token, { secret: secretForTier(secret, tier) });
    if (claims) return tierById(tier.id);
  }

  return undefined;
}

/** The pass on a request, from the default header or a bearer token. */
export function passTokenFrom(request: Request): string | null {
  const direct = request.headers.get("x-crawl-pass");
  if (direct) return direct.trim();

  const bearer = /^Bearer\s+(cp_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  return bearer ? bearer[1] : null;
}

/**
 * The 402 answer for a caller who is over their allowance, produced by the
 * gateway for `tier` so the offer, the sales page and the pass minting are the
 * same code that handles a payment.
 */
export const gateAtTier = (tier: Tier) => x402Proxy(gatewayForTier(tier));
