const DEFAULT_COINPAY_API_URL = 'https://coinpayportal.com/api';

export type CoinpayCurrency = 'usdc_sol' | 'sol' | 'usdc_pol' | 'usdc_eth' | 'usdt' | 'btc' | 'eth';

export type CoinpayCreatePaymentResponse = {
  success?: boolean;
  payment_id?: string;
  checkout_url?: string;
  payment?: {
    id?: string;
    checkout_url?: string;
    payment_address?: string;
    amount_crypto?: number;
    crypto_amount?: number;
    currency?: string;
    expires_at?: string;
    [key: string]: unknown;
  };
};

export type CoinpayWebhookPayload = {
  id?: string;
  type?: string;
  event?: string;
  payment_id?: string;
  status?: string;
  tx_hash?: string;
  merchant_tx_hash?: string;
  data?: {
    payment_id?: string;
    status?: string;
    tx_hash?: string;
    merchant_tx_hash?: string;
    metadata?: Record<string, unknown>;
  };
};

function getCreds() {
  const apiKey = process.env.COINPAY_API_KEY;
  const merchantId = process.env.COINPAY_MERCHANT_ID;
  if (!apiKey || !merchantId) throw new Error('Coinpay payment credentials are not configured');
  return { apiKey, merchantId };
}

function appUrl() {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://recipepdfs.com'
  ).replace(/\/+$/, '');
}

export async function createCoinpayPayment(opts: {
  amountUsd: number;
  currency?: CoinpayCurrency;
  description: string;
  metadata: Record<string, unknown>;
}) {
  const { apiKey, merchantId } = getCreds();
  const baseUrl = appUrl();
  const apiUrl = (process.env.COINPAY_API_URL || DEFAULT_COINPAY_API_URL).replace(/\/+$/, '');
  const res = await fetch(`${apiUrl}/payments/create`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    cache: 'no-store',
    body: JSON.stringify({
      business_id: merchantId,
      amount_usd: opts.amountUsd,
      payment_method: 'crypto',
      currency: opts.currency ?? 'usdc_sol',
      description: opts.description,
      success_url: `${baseUrl}/library?payment=success`,
      cancel_url: `${baseUrl}/browse?payment=cancelled`,
      redirect_url: `${baseUrl}/library?payment=success`,
      webhook_url: `${baseUrl}/api/webhooks/coinpay`,
      metadata: opts.metadata,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Coinpay create failed ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as CoinpayCreatePaymentResponse;
}

export function checkoutUrlFor(response: CoinpayCreatePaymentResponse): string | null {
  return response.checkout_url ?? response.payment?.checkout_url ?? null;
}

export function paymentIdFor(response: CoinpayCreatePaymentResponse): string | null {
  return response.payment_id ?? response.payment?.id ?? null;
}

export function normalizeWebhook(payload: CoinpayWebhookPayload) {
  return {
    eventType: payload.type ?? payload.event ?? '',
    paymentId: payload.data?.payment_id ?? payload.payment_id ?? null,
    status: payload.data?.status ?? payload.status,
    txHash:
      payload.data?.tx_hash ??
      payload.data?.merchant_tx_hash ??
      payload.tx_hash ??
      payload.merchant_tx_hash ??
      null,
  };
}
