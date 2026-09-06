import { entryTier, gateAtTier, passTokenFrom, tierOfRequest } from "@/lib/crawl-gateway";
import {
  clientKey,
  consume,
  freeTier,
  paidTiers,
  rateHeaders,
  type Tier,
} from "@/lib/rate-limit";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Access is sold by request rate, not by who is asking.
 *
 * Every caller gets the free tier's allowance. A caller presenting a valid
 * pass gets that tier's, counted against the pass rather than the IP so a
 * distributed crawler cannot buy one pass and multiply it by its address
 * space. Over the allowance, the gateway answers 402 with the offer for the
 * next tier up — and because the gateway checks a presented pass before it
 * refuses anyone, buying one immediately opens the door again.
 */
export async function proxy(request: NextRequest) {
  const paidTier = await tierOfRequest(request);
  const tier = paidTier ?? freeTier();

  // A pass holder is counted per pass; everyone else per client address.
  const key = paidTier ? `pass:${passTokenFrom(request) ?? "unknown"}` : clientKey(request);
  const decision = consume(key, tier);

  if (decision.allowed) {
    const response = NextResponse.next();
    for (const [header, value] of Object.entries(rateHeaders(decision))) {
      response.headers.set(header, value);
    }
    return response;
  }

  // Over the allowance. Offer the next tier up: the one above what they hold,
  // or the cheapest paid tier for a caller still on free.
  const answer = await gateAtTier(nextTierAfter(tier))(request);
  if (answer) {
    for (const [header, value] of Object.entries(rateHeaders(decision))) {
      answer.headers.set(header, value);
    }
    return answer;
  }

  return NextResponse.next();
}

/**
 * The tier to sell someone who has exhausted `current`: the cheapest one that
 * would actually raise their ceiling. Someone already on the top tier is
 * offered it again, since renewing is the only thing left to sell them.
 */
function nextTierAfter(current: Tier): Tier {
  const tiers = paidTiers();
  return tiers.find((t) => t.limit > current.limit) ?? tiers[tiers.length - 1] ?? entryTier();
}

export const config = {
  // Everything but Next's own assets and static files. API routes stay
  // covered on purpose: the rate ceiling is the product.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf|otf|mp3|mp4|webmanifest)$).*)",
  ],
};
