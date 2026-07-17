import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('coinpay client', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.COINPAY_API_KEY = 'cp_test_key';
    process.env.COINPAY_MERCHANT_ID = 'biz_test';
    process.env.APP_URL = 'https://recipepdfs.com';
    vi.resetModules();
    fetchSpy = vi.spyOn(globalThis, 'fetch') as never;
  });

  afterEach(() => {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  });

  it('creates fractional USDC Solana payments with the unified webhook URL', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        payment: {
          id: 'pay_123',
          checkout_url: 'https://coinpayportal.com/pay/pay_123',
        },
      }),
      text: async () => '',
    } as unknown as Response);

    const { createCoinpayPayment } = await import('@/lib/coinpay-client');
    await createCoinpayPayment({
      amountUsd: 0.004,
      currency: 'usdc_sol',
      description: 'RecipePDFs cookbook: Tiny Bakery Notebook',
      metadata: { type: 'cookbook_purchase', cookbook_id: 'cb_1' },
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://coinpayportal.com/api/payments/create');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.amount_usd).toBe(0.004);
    expect(body.payment_method).toBe('crypto');
    expect(body.currency).toBe('usdc_sol');
    expect(body.webhook_url).toBe('https://recipepdfs.com/api/webhooks/coinpay');
    expect(body.metadata.type).toBe('cookbook_purchase');
  });

  it('verifies valid webhook HMAC signatures', async () => {
    const { verifyCoinPayWebhook } = await import('@profullstack/stack/coinpay');
    const body = JSON.stringify({ type: 'payment.confirmed', data: { payment_id: 'pay_123' } });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = crypto.createHmac('sha256', 'secret').update(`${ts}.${body}`).digest('hex');
    expect(verifyCoinPayWebhook({ signature: `t=${ts},v1=${sig}`, rawBody: body, secret: 'secret' })).toBe(true);
  });

  it('rejects stale webhook HMAC signatures', async () => {
    const { verifyCoinPayWebhook } = await import('@profullstack/stack/coinpay');
    const body = '{}';
    const ts = (Math.floor(Date.now() / 1000) - 700).toString();
    const sig = crypto.createHmac('sha256', 'secret').update(`${ts}.${body}`).digest('hex');
    expect(verifyCoinPayWebhook({ signature: `t=${ts},v1=${sig}`, rawBody: body, secret: 'secret' })).toBe(false);
  });
});
