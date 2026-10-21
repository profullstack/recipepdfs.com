import { NextResponse } from 'next/server';
import { verifyCoinPayWebhook } from '@profullstack/stack/coinpay';
import { isPaid, normalizeWebhook, PROPERTY, type CoinpayWebhookPayload } from '@/lib/coinpay-client';
import { markPurchaseFromWebhook } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * CoinPay webhook. Signature: X-CoinPay-Signature t=<unix>,v1=<hmac of "t.rawBody">
 * over the raw bytes. Settles by checkout session id, then metadata.purchase_id,
 * then payment id. confirmed and forwarded both mean paid; replays are no-ops.
 */
export async function POST(req: Request) {
  const secret = process.env.COINPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Webhook not configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature =
    req.headers.get('x-coinpay-signature') ?? req.headers.get('x-coinpayportal-signature');
  if (!verifyCoinPayWebhook({ signature, rawBody, secret })) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  let payload: CoinpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as CoinpayWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const ev = normalizeWebhook(payload);
  if (ev.eventType === 'test.webhook' || ev.eventType === 'ping') {
    return NextResponse.json({ received: true, test: true });
  }
  if (!ev.paymentId && !ev.sessionId) {
    return NextResponse.json({ ok: false, error: 'Missing payment_id' }, { status: 400 });
  }
  if (!ev.outcome) return NextResponse.json({ received: true, ignored: ev.eventType || ev.status });

  const meta = ev.metadata;
  const cookbookId = typeof meta.cookbook_id === 'string' ? meta.cookbook_id : null;
  const buyerSub = ev.accountId ?? (typeof meta.buyer_sub === 'string' ? meta.buyer_sub : null);
  const d = ((payload as Record<string, unknown>).data ?? payload) as Record<string, unknown>;
  const amountUsd = Number(d.amount_usd ?? d.amount ?? 0) || 0;

  const result = await markPurchaseFromWebhook({
    paymentId: ev.paymentId,
    sessionId: ev.sessionId,
    purchaseId: typeof meta.purchase_id === 'string' ? meta.purchase_id : null,
    status: ev.outcome,
    txHash: ev.txHash,
    recover:
      isPaid(ev.outcome) && cookbookId && buyerSub && (!ev.property || ev.property === PROPERTY)
        ? { cookbookId, buyerSub, amountUsd, email: ev.email }
        : null,
  });
  return NextResponse.json({
    received: true,
    updated: Boolean(result.purchase),
    changed: result.changed,
    created: result.created,
  });
}
