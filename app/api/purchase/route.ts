import { NextResponse } from 'next/server';
import { siteHref, siteUrl } from '@/lib/site-url';
import {
  checkoutAmountUsd,
  createCheckoutSession,
  normalizeEmail,
} from '@/lib/coinpay-client';
import { getCurrentUser } from '@/lib/session';
import { createPurchase, findCookbook, hasCookbookAccess, setPurchaseSession } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Buy a cookbook: record a pending purchase, open a CoinPay hosted checkout
 * session for it (any coin the business holds a wallet for, or PayPal) and
 * send the buyer there. The webhook marks the purchase paid.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(siteHref('/api/coinpay/connect?next=/browse'), 302);

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
    return NextResponse.redirect(siteHref(`/api/download/${cookbook.id}`), 302);
  }
  if (cookbook.priceUsd <= 0) {
    return NextResponse.redirect(siteHref(`/api/download/${cookbook.id}`), 302);
  }

  // CoinPay needs the buyer's email for the receipt; CoinPay sign-in does not
  // always share one, so the form asks when the session has none.
  const email = normalizeEmail(form.get('email')) ?? normalizeEmail(user.email);
  if (!email) {
    return NextResponse.redirect(siteHref(`/cookbooks/${cookbook.slug}?payment=email`), 303);
  }

  const amountUsd = checkoutAmountUsd(cookbook.priceUsd);
  const purchase = await createPurchase({
    cookbookId: cookbook.id,
    buyerSub: user.sub,
    buyerEmail: email,
    coinpayPaymentId: '',
    amountUsd,
    currency: 'USD',
    status: 'pending',
  });

  let session;
  try {
    session = await createCheckoutSession({
      amountUsd,
      description: `RecipePDFs cookbook: ${cookbook.title}`,
      customerEmail: email,
      accountId: user.sub,
      metadata: {
        type: 'cookbook_purchase',
        purchase_id: purchase.id,
        cookbook_id: cookbook.id,
        buyer_sub: user.sub,
      },
      successUrl: `${siteUrl()}/library?payment=success&session={CHECKOUT_SESSION_ID}`,
      cancelUrl: siteHref(`/cookbooks/${cookbook.slug}?payment=cancelled`).toString(),
    });
  } catch (err) {
    console.error('[purchase] CoinPay checkout session failed', err);
    return NextResponse.json({ ok: false, error: 'Checkout is unavailable right now. Please try again.' }, { status: 502 });
  }

  await setPurchaseSession(purchase.id, session);
  return NextResponse.redirect(session.url, 303);
}
