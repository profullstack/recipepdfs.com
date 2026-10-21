import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'bun:test';

const dir = mkdtempSync(path.join(tmpdir(), 'recipepdfs-store-'));
process.env.RECIPEPDFS_DATA_DIR = dir;
const store = await import('@/lib/store');

afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function pending(sub: string) {
  const cookbook = (await store.listPublishedCookbooks()).find((c) => c.priceUsd > 0)!;
  const p = await store.createPurchase({
    cookbookId: cookbook.id,
    buyerSub: sub,
    buyerEmail: 'buyer@example.com',
    coinpayPaymentId: '',
    amountUsd: 0.01,
    currency: 'USD',
    status: 'pending',
  });
  return { cookbook, p };
}

describe('purchase settlement from a session webhook', () => {
  it('settles by checkout session id; confirmed then forwarded grants once', async () => {
    const { cookbook, p } = await pending('sub_a');
    await store.setPurchaseSession(p.id, { id: 'cs_a', url: 'https://coinpayportal.com/checkout/cs_a' });
    expect(await store.hasCookbookAccess({ cookbook, userSub: 'sub_a' })).toBe(false);

    const r1 = await store.markPurchaseFromWebhook({ paymentId: 'pay_a', sessionId: 'cs_a', status: 'confirmed' });
    expect(r1.purchase?.id).toBe(p.id);
    expect(r1.purchase?.coinpayPaymentId).toBe('pay_a');
    const paidAt = r1.purchase?.paidAt;
    const r2 = await store.markPurchaseFromWebhook({ paymentId: 'pay_a', sessionId: 'cs_a', status: 'forwarded' });
    expect(r2.created).toBe(false);
    expect(r2.purchase?.paidAt).toBe(paidAt);
    const r3 = await store.markPurchaseFromWebhook({ paymentId: 'pay_a', sessionId: 'cs_a', status: 'expired' });
    expect(r3.purchase?.status).toBe('forwarded');
    expect(await store.hasCookbookAccess({ cookbook, userSub: 'sub_a' })).toBe(true);
    const rows = (await store.listPurchasesForBuyer('sub_a')).filter((x) => x.cookbookId === cookbook.id);
    expect(rows.length).toBe(1);
  });

  it('pending and unknown sessions change nothing', async () => {
    const { p } = await pending('sub_b');
    await store.setPurchaseSession(p.id, { id: 'cs_b', url: 'https://coinpayportal.com/checkout/cs_b' });
    const none = await store.markPurchaseFromWebhook({ paymentId: 'x', sessionId: 'cs_none', status: 'confirmed' });
    expect(none.purchase).toBeNull();
    const exp = await store.markPurchaseFromWebhook({ paymentId: 'y', sessionId: 'cs_b', status: 'expired' });
    expect(exp.purchase?.status).toBe('expired');
  });

  it('records a paid session whose row is gone, exactly once', async () => {
    const cookbook = (await store.listPublishedCookbooks()).find((c) => c.priceUsd > 0)!;
    const recover = { cookbookId: cookbook.id, buyerSub: 'sub_c', amountUsd: 0.01, email: 'c@example.com' };
    const r1 = await store.markPurchaseFromWebhook({ paymentId: 'pay_c', sessionId: 'cs_c', status: 'confirmed', recover });
    expect(r1.created).toBe(true);
    const r2 = await store.markPurchaseFromWebhook({ paymentId: 'pay_c', sessionId: 'cs_c', status: 'forwarded', recover });
    expect(r2.created).toBe(false);
    expect((await store.listPurchasesForBuyer('sub_c')).length).toBe(1);
    expect(await store.hasCookbookAccess({ cookbook, userSub: 'sub_c' })).toBe(true);
  });

  it('older purchases still settle by payment id', async () => {
    const { cookbook } = await pending('sub_d');
    const legacy = await store.createPurchase({
      cookbookId: cookbook.id,
      buyerSub: 'sub_e',
      coinpayPaymentId: 'pay_legacy',
      amountUsd: 0.01,
      currency: 'usdc_sol',
      status: 'pending',
    });
    const r = await store.markPurchaseFromWebhook({ paymentId: 'pay_legacy', status: 'confirmed' });
    expect(r.purchase?.id).toBe(legacy.id);
  });
});
