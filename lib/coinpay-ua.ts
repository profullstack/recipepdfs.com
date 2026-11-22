import pkg from '../package.json';

/**
 * User-Agent for server-side calls to CoinPay. Every fleet app shares one
 * public IP on dev2, so CoinPay's logs and throttle tell the apps apart by
 * this header instead of a bare `node` agent.
 */
export const COINPAY_UA = `recipepdfs.com/${pkg.version} (+https://recipepdfs.com)`;
