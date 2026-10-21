/**
 * CoinPay checkout for RecipePDFs' own CoinPay business.
 *
 * Every purchase opens a hosted checkout session (POST /api/checkout/sessions,
 * Bearer COINPAY_API_KEY). The buyer is redirected to the session url and picks
 * any coin the business holds a wallet for, or PayPal. No card rail.
 *
 * The webhook (app/api/webhooks/coinpay) settles by data.checkout_session_id,
 * then metadata.purchase_id, then the CoinPay payment id (older purchases).
 */

const DEFAULT_COINPAY_API_URL = 'https://coinpayportal.com/api';

export const PROPERTY = 'recipepdfs.com';
export const SESSION_WINDOW_MINUTES = 60;
/** CoinPay's smallest session amount. */
export const MIN_CHECKOUT_USD = 0.01;

const env = (name: string) => process.env[name];

/** What a buyer is charged for a cookbook: its price, rounded up to a cent, at least $0.01. */
export function checkoutAmountUsd(priceUsd: number): number {
  const cents = Math.ceil(Math.round(priceUsd * 1e6) / 1e4);
  return Math.max(MIN_CHECKOUT_USD, cents / 100);
}

function apiUrl(): string {
  let url = (env('COINPAY_API_URL') || DEFAULT_COINPAY_API_URL).replace(/\/+$/, '');
  if (!url.endsWith('/api')) url += '/api';
  return url;
}

function apiKey(): string {
  const key = env('COINPAY_API_KEY');
  if (!key) throw new Error('Coinpay payment credentials are not configured');
  return key;
}

export type SessionInput = {
  amountUsd: number;
  description: string;
  customerEmail: string;
  accountId: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = { id: string; url: string };

export class CoinpayCheckoutError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** The JSON body POSTed to /api/checkout/sessions. */
export function sessionBody(input: SessionInput): Record<string, unknown> {
  const email = input.customerEmail.trim();
  const accountId = input.accountId.trim();
  if (!email) throw new CoinpayCheckoutError('customer email is required', 400, 'MISSING_CUSTOMER_EMAIL');
  if (!accountId) throw new CoinpayCheckoutError('account id is required', 400, 'MISSING_ACCOUNT_ID');
  return {
    amount: Number(input.amountUsd.toFixed(2)),
    currency: 'USD',
    description: input.description,
    customer_email: email,
    account_id: accountId,
    property: PROPERTY,
    metadata: { ...input.metadata, property: PROPERTY, account_id: accountId, email },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    expires_in_minutes: SESSION_WINDOW_MINUTES,
  };
}

export async function createCheckoutSession(
  input: SessionInput,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutSession> {
  const body = sessionBody(input);
  const api = apiUrl();
  const res = await fetchImpl(`${api}/checkout/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey()}` },
    cache: 'no-store',
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.success === false) {
    const msg = typeof json.error === 'string' ? json.error : `HTTP ${res.status}`;
    throw new CoinpayCheckoutError(
      `Coinpay checkout session failed: ${msg}`,
      res.status,
      typeof json.code === 'string' ? json.code : null,
    );
  }
  const id = typeof json.id === 'string' ? json.id : '';
  const rawUrl = typeof json.url === 'string' ? json.url : '';
  if (!id || !rawUrl) throw new CoinpayCheckoutError('Coinpay did not return checkout details', 502);
  // Only ever send buyers to CoinPay's own origin.
  const origin = new URL(api).origin;
  const url = new URL(rawUrl, origin);
  if (url.origin !== origin) throw new CoinpayCheckoutError('Coinpay returned an off-site checkout url', 502);
  return { id, url: url.toString() };
}

export type CoinpayWebhookPayload = Record<string, unknown>;

export type WebhookOutcome = 'confirmed' | 'forwarded' | 'expired' | 'failed' | null;

export type NormalizedWebhook = {
  eventType: string;
  paymentId: string | null;
  sessionId: string | null;
  status: string;
  outcome: WebhookOutcome;
  txHash: string | null;
  accountId: string | null;
  email: string | null;
  property: string | null;
  metadata: Record<string, unknown>;
};

function str(v: unknown): string | null {
  return v === null || v === undefined || v === '' ? null : String(v);
}

/**
 * CoinPay nests the payment under `data`; the top-level `id` is the EVENT id.
 * Read `data` first and fall back to the flat shape (older test sender).
 */
export function normalizeWebhook(payload: CoinpayWebhookPayload): NormalizedWebhook {
  const p = (payload ?? {}) as Record<string, unknown>;
  const nested = !!p.data && typeof p.data === 'object';
  const d = (nested ? p.data : p) as Record<string, unknown>;
  const metadata = ((d.metadata ?? p.metadata) as Record<string, unknown> | undefined) ?? {};
  const eventType = String(p.type ?? p.event ?? '').toLowerCase();
  const status = String(d.status ?? '').toLowerCase();

  let outcome: WebhookOutcome = null;
  switch (eventType) {
    case 'payment.confirmed':
    case 'payment.completed':
    case 'checkout.session.completed':
      outcome = 'confirmed';
      break;
    case 'payment.forwarded':
      outcome = 'forwarded';
      break;
    case 'payment.expired':
    case 'checkout.session.expired':
      outcome = 'expired';
      break;
    case 'payment.failed':
      outcome = 'failed';
      break;
    default:
      if (status === 'forwarded') outcome = 'forwarded';
      else if (['confirmed', 'completed', 'paid', 'succeeded', 'settled'].includes(status)) outcome = 'confirmed';
      else if (status === 'expired') outcome = 'expired';
      else if (status === 'failed') outcome = 'failed';
  }

  return {
    eventType,
    paymentId: str(d.payment_id ?? (nested ? d.id : p.payment_id)),
    sessionId: str(d.checkout_session_id ?? p.checkout_session_id ?? metadata.checkout_session_id),
    status,
    outcome,
    txHash: str(d.tx_hash ?? d.merchant_tx_hash ?? p.tx_hash ?? p.merchant_tx_hash),
    accountId: str(d.account_id ?? p.account_id ?? metadata.account_id),
    email: str(d.customer_email ?? p.customer_email ?? metadata.email),
    property: str(d.property ?? p.property ?? metadata.property),
    metadata,
  };
}

export function isPaid(outcome: WebhookOutcome): boolean {
  return outcome === 'confirmed' || outcome === 'forwarded';
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeEmail(value: unknown): string | null {
  const e = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return e && e.length <= 254 && EMAIL.test(e) ? e : null;
}
