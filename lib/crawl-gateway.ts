import { createGateway } from "@profullstack/x402-gateway";
import { x402Proxy } from "@profullstack/x402-gateway/next";

/**
 * Sells crawl access to AI training crawlers (GPTBot, ClaudeBot, CCBot,
 * meta-externalagent, Bytespider, Applebot-Extended, ...) by the day over
 * x402, settled by CoinPay in USDC. People, Googlebot and the retrieval
 * crawlers behind AI search pass through untouched.
 *
 * Runs inside the middleware, so nothing here may import Node-only modules.
 * The env is read through a non-literal key on purpose: Next inlines
 * `process.env.NAME` at build time, and these are runtime secrets. Without
 * COINPAY_X402_KEY and CRAWL_PAY_TO the gateway still answers training
 * crawlers with 402, just with an empty offer.
 */
const env = (name: string) => process.env[name];

export const gateway = createGateway({
  siteUrl: env("SITE_URL") || env("NEXT_PUBLIC_SITE_URL") || "https://recipepdfs.com",
  siteName: "recipepdfs",
  coinpay: { apiKey: env("COINPAY_X402_KEY") },
  payTo: env("CRAWL_PAY_TO"),
  contact: "mailto:support@recipepdfs.com",
  // The discovery surfaces stay free for everyone, training crawlers included:
  // an agent has to be able to see what is on offer, and what it costs, before
  // it can decide to pay. The recipes themselves are what is being sold, so
  // /api/v1/recipes/<slug> is deliberately NOT open.
  openPaths: ["/llms.txt", "/api/v1/recipes", "/api/mcp"],
});

/** Resolves to a Response for a refused crawler, or undefined to carry on. */
export const gate = x402Proxy(gateway);
