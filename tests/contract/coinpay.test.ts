import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

describe('coinpay client', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.COINPAY_API_KEY = 'cp_test_key';
    process.env.COINPAY_MERCHANT_ID = 'biz_test';
    process.env.APP_URL = 'https://recipepdfs.com';
    fetchSpy = spyOn(globalThis, 'fetch') as never;
  });

  afterEach(() => {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  });

  it('opens a hosted checkout session with email, account, property and purchase metadata', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, id: 'cs_abc', url: 'https://coinpayportal.com/checkout/cs_abc', methods: [] }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );

    const { createCheckoutSession } = await import('@/lib/coinpay-client');
    const session = await createCheckoutSession({
      amountUsd: 0.01,
      description: 'RecipePDFs cookbook: Tiny Bakery Notebook',
      customerEmail: 'buyer@example.com',
      accountId: 'sub_1',
      metadata: { type: 'cookbook_purchase', purchase_id: 'p_1', cookbook_id: 'cb_1', buyer_sub: 'sub_1' },
      successUrl: 'https://recipepdfs.com/library?payment=success&session={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://recipepdfs.com/cookbooks/tiny?payment=cancelled',
    });
    expect(session).toEqual({ id: 'cs_abc', url: 'https://coinpayportal.com/checkout/cs_abc' });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://coinpayportal.com/api/checkout/sessions');
    expect(((init as RequestInit).headers as Record<string, string>).authorization).toBe('Bearer cp_test_key');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.amount).toBe(0.01);
    expect(body.currency).toBe('USD');
    expect(body.customer_email).toBe('buyer@example.com');
    expect(body.account_id).toBe('sub_1');
    expect(body.property).toBe('recipepdfs.com');
    expect(body.metadata.purchase_id).toBe('p_1');
    expect(body.metadata.cookbook_id).toBe('cb_1');
    expect(body.success_url).toContain('{CHECKOUT_SESSION_ID}');
    expect(body.expires_in_minutes).toBe(60);
  });

  it('refuses a session without an email and rejects an off-site url', async () => {
    const { createCheckoutSession } = await import('@/lib/coinpay-client');
    const base = {
      amountUsd: 1,
      description: 'x',
      accountId: 'sub_1',
      metadata: {},
      successUrl: 'https://recipepdfs.com/library',
      cancelUrl: 'https://recipepdfs.com/browse',
    };
    await expect(createCheckoutSession({ ...base, customerEmail: '' })).rejects.toThrow();
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, id: 'cs_x', url: 'https://evil.example/cs_x' }), { status: 201 }),
    );
    await expect(createCheckoutSession({ ...base, customerEmail: 'a@b.co' })).rejects.toThrow(/off-site/);
  });

  it('charges at least one cent, rounded up', async () => {
    const { checkoutAmountUsd } = await import('@/lib/coinpay-client');
    expect(checkoutAmountUsd(0.004)).toBe(0.01);
    expect(checkoutAmountUsd(4.99)).toBe(4.99);
    expect(checkoutAmountUsd(1.234)).toBe(1.24);
  });

  it('reads the nested webhook first (top-level id is the event)', async () => {
    const { normalizeWebhook } = await import('@/lib/coinpay-client');
    const ev = normalizeWebhook({
      id: 'evt_pay_1_1',
      type: 'payment.forwarded',
      data: {
        payment_id: 'pay_1',
        status: 'forwarded',
        checkout_session_id: 'cs_abc',
        account_id: 'sub_1',
        customer_email: 'buyer@example.com',
        property: 'recipepdfs.com',
        metadata: { purchase_id: 'p_1' },
      },
    });
    expect(ev.paymentId).toBe('pay_1');
    expect(ev.sessionId).toBe('cs_abc');
    expect(ev.outcome).toBe('forwarded');
    expect(ev.accountId).toBe('sub_1');
    expect(ev.metadata.purchase_id).toBe('p_1');
    expect(normalizeWebhook({ type: 'payment.pending', data: { payment_id: 'p', status: 'pending' } }).outcome).toBeNull();
    expect(normalizeWebhook({ payment_id: 'flat', status: 'confirmed' }).paymentId).toBe('flat');
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
