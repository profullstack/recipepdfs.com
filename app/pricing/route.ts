import { NextResponse } from 'next/server';
import { TIERS, windowMs } from '@/lib/rate-limit';

/**
 * The tiers, as machine-readable JSON.
 *
 * Open to everyone even when they are over their allowance: an agent that has
 * just been refused has to be able to read what it would cost to not be.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const seconds = Math.round(windowMs / 1000);

  return NextResponse.json(
    {
      model:
        'Access is limited by request rate, not by identity. Every caller reads free up to the free allowance; a paid pass raises the ceiling for a day.',
      window: `${seconds}s`,
      tiers: TIERS.map((tier) => ({
        id: tier.id,
        name: tier.name,
        requestsPerMinute: tier.limit,
        priceUsdPerDay: tier.priceCents / 100,
        buy: tier.priceCents === 0 ? null : `${origin}/crawl`,
      })),
      howToPay: {
        protocol: 'x402 v2, settled by CoinPay in USDC',
        flow: 'Exceed the free allowance and the 402 carries the offer. Pay it and the 200 response body holds a pass.',
        present: 'Send the pass as the x-crawl-pass header, or as Authorization: Bearer <pass>.',
        multiDay: `${origin}/crawl?days=7`,
      },
      note: 'Rate headers (x-ratelimit-limit, -remaining, -reset, -tier) are on every response, so you can pace yourself rather than discovering the ceiling by hitting it.',
      contact: 'support@recipepdfs.com',
    },
    { headers: { 'cache-control': 'public, max-age=300' } },
  );
}
