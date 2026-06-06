import { NextResponse } from 'next/server';
import {
  checkoutUrlFor,
  createCoinpayPayment,
  paymentIdFor,
  type CoinpayCurrency,
} from '@/lib/coinpay-client';
import { getCurrentUser } from '@/lib/session';
import { createPurchase, findCookbook, hasCookbookAccess } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/api/coinpay/connect?next=/browse', req.url), 302);

  const form = await req.formData();
  const cookbookId = form.get('cookbookId');
  if (typeof cookbookId !== 'string') {
    return NextResponse.json({ ok: false, error: 'Missing cookbook' }, { status: 400 });
  }

  const cookbook = await findCookbook(cookbookId);
  if (!cookbook || !cookbook.isPublished) {
    return NextResponse.json({ ok: false, error: 'Cookbook not found' }, { status: 404 });
  }
  if (await hasCookbookAccess({ cookbook, userSub: user.sub })) {
    return NextResponse.redirect(new URL(`/api/download/${cookbook.id}`, req.url), 302);
  }
  if (cookbook.priceUsd <= 0) {
    return NextResponse.redirect(new URL(`/api/download/${cookbook.id}`, req.url), 302);
  }

  const currency = (typeof form.get('currency') === 'string' ? form.get('currency') : 'usdc_sol') as CoinpayCurrency;
  const response = await createCoinpayPayment({
    amountUsd: cookbook.priceUsd,
    currency,
    description: `RecipePDFs cookbook: ${cookbook.title}`,
    metadata: {
      type: 'cookbook_purchase',
      cookbook_id: cookbook.id,
      buyer_sub: user.sub,
    },
  });
  const paymentId = paymentIdFor(response);
  const checkoutUrl = checkoutUrlFor(response);
  if (!paymentId || !checkoutUrl) {
    return NextResponse.json({ ok: false, error: 'Coinpay did not return checkout details' }, { status: 502 });
  }

  await createPurchase({
    cookbookId: cookbook.id,
    buyerSub: user.sub,
    coinpayPaymentId: paymentId,
    amountUsd: cookbook.priceUsd,
    currency,
    status: 'pending',
    checkoutUrl,
  });

  return NextResponse.redirect(checkoutUrl, 302);
}
