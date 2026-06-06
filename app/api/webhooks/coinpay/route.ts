import { NextResponse } from 'next/server';
import {
  normalizeWebhook,
  verifyCoinpayWebhook,
  type CoinpayWebhookPayload,
} from '@/lib/coinpay-client';
import { markPurchaseFromWebhook } from '@/lib/store';
import type { Purchase } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function statusForEvent(eventType: string): Purchase['status'] | null {
  switch (eventType) {
    case 'payment.confirmed':
    case 'payment.completed':
      return 'confirmed';
    case 'payment.forwarded':
      return 'forwarded';
    case 'payment.expired':
      return 'expired';
    case 'payment.failed':
      return 'failed';
    default:
      return null;
  }
}

export async function POST(req: Request) {
  const secret = process.env.COINPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Webhook not configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature =
    req.headers.get('x-coinpay-signature') ?? req.headers.get('x-coinpayportal-signature');
  if (!verifyCoinpayWebhook(rawBody, signature, secret)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  let payload: CoinpayWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as CoinpayWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const normalized = normalizeWebhook(payload);
  if (!normalized.paymentId) {
    return NextResponse.json({ ok: false, error: 'Missing payment_id' }, { status: 400 });
  }
  const status = statusForEvent(normalized.eventType);
  if (!status) return NextResponse.json({ received: true, ignored: normalized.eventType });

  const purchase = await markPurchaseFromWebhook({
    paymentId: normalized.paymentId,
    status,
    txHash: normalized.txHash,
  });
  return NextResponse.json({ received: true, updated: Boolean(purchase) });
}
