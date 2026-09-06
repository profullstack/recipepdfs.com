/**
 * Request-rate accounting for the tiered access model.
 *
 * Everyone reads free up to the free tier's ceiling. Past it the answer is 402
 * with an x402 offer rather than 429: the limit is not a punishment, it is the
 * price boundary, and the response says how to buy your way over it.
 *
 * The counter is a fixed window held in process memory. That is deliberate for
 * now — this app has no Redis, and a per-instance window is the honest shape
 * for a single container. It means two things worth knowing: the allowance is
 * per instance rather than global, and it resets on deploy. Both are
 * forgiving in the buyer's favour, which is the right direction to be wrong in.
 */

export type Tier = {
  /** Stable id, also the segment mixed into the tier's pass-signing secret. */
  id: string;
  name: string;
  /** Requests allowed per window. */
  limit: number;
  /** Price in cents per day. Zero for the free tier. */
  priceCents: number;
};

/** How long a window lasts. One minute unless overridden. */
export const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);

/**
 * The tiers on offer.
 *
 * The ceilings are set from measured throughput on this app's own hot path,
 * not from ambition: see README "What the tiers are based on". Overridable per
 * environment because a bigger box should sell bigger tiers.
 */
export const FREE_LIMIT = Number(process.env.FREE_RATE_LIMIT ?? 100);

export const TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free',
    limit: FREE_LIMIT,
    priceCents: 0,
  },
  {
    id: 'standard',
    name: 'Standard',
    limit: Number(process.env.STANDARD_RATE_LIMIT ?? 1_000),
    priceCents: Number(process.env.STANDARD_PRICE_CENTS ?? 100),
  },
  {
    id: 'bulk',
    name: 'Bulk',
    limit: Number(process.env.BULK_RATE_LIMIT ?? 10_000),
    priceCents: Number(process.env.BULK_PRICE_CENTS ?? 500),
  },
];

export const freeTier = (): Tier => TIERS[0];

/** Paid tiers, cheapest first. */
export const paidTiers = (): Tier[] => TIERS.filter((t) => t.priceCents > 0);

export function tierById(id: string): Tier | undefined {
  return TIERS.find((t) => t.id === id);
}

/**
 * The signing secret for a tier's passes.
 *
 * Each tier signs with its own derived secret, so the secret a presented pass
 * verifies against IS its tier. The gateway sets a pass's `ref` to the payment
 * nonce and gives no way to stamp anything else into it, so this is how a tier
 * survives the round trip without a database.
 */
export function secretForTier(baseSecret: string, tier: Tier): string {
  return tier.priceCents === 0 ? baseSecret : `${baseSecret}:tier:${tier.id}`;
}

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/**
 * Drops windows that have expired.
 *
 * Called opportunistically rather than on a timer: a timer would keep a
 * serverless instance alive, and the map only grows while traffic flows.
 */
function sweep(now: number): void {
  if (windows.size < 10_000) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export type RateDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
  tier: Tier;
};

/**
 * Counts one request against `key` and says whether it is within `tier`.
 *
 * @param key - who is being counted: a client IP, or a pass identity
 * @param tier - the tier whose ceiling applies
 * @param now - injectable for tests
 */
export function consume(key: string, tier: Tier, now = Date.now()): RateDecision {
  sweep(now);

  const bucket = `${tier.id}:${key}`;
  let window = windows.get(bucket);

  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + windowMs };
    windows.set(bucket, window);
  }

  window.count += 1;

  const remaining = Math.max(tier.limit - window.count, 0);
  return {
    allowed: window.count <= tier.limit,
    limit: tier.limit,
    remaining,
    resetSeconds: Math.max(Math.ceil((window.resetAt - now) / 1000), 0),
    tier,
  };
}

/** Forgets every window. Tests only. */
export function resetAllWindows(): void {
  windows.clear();
}

/**
 * The client's identity for rate accounting.
 *
 * Matches the gateway's own choice: `X-Real-IP`, else the LAST hop of
 * `X-Forwarded-For`. The last hop is the one the edge appended and is the only
 * one a caller cannot forge by sending the header itself.
 */
export function clientKey(request: Request): string {
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }

  return 'unknown';
}

/** Standard rate headers, so a well-behaved client can pace itself. */
export function rateHeaders(decision: RateDecision): Record<string, string> {
  return {
    'x-ratelimit-limit': String(decision.limit),
    'x-ratelimit-remaining': String(decision.remaining),
    'x-ratelimit-reset': String(decision.resetSeconds),
    'x-ratelimit-tier': decision.tier.id,
  };
}
