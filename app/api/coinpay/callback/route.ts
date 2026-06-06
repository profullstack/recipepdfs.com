import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { buildSessionCookie } from '@/lib/session';
import { upsertUser } from '@/lib/store';
import {
  exchangeCodeForToken,
  fetchUserInfo,
  getCoinpayOAuthConfig,
} from '@/lib/coinpay-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'coinpay_oauth_state';
const NEXT_COOKIE = 'coinpay_oauth_next';

function publicOrigin(req: Request): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${host}`;
  }
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(req.url).origin).replace(
    /\/+$/,
    '',
  );
}

function sanitizeNext(raw?: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.length > 200) return '/dashboard';
  return raw;
}

async function redirectBack(req: Request, params: Record<string, string>) {
  const cookieStore = await cookies();
  const next = sanitizeNext(cookieStore.get(NEXT_COOKIE)?.value);
  const url = new URL(next, publicOrigin(req));
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const res = NextResponse.redirect(url, 302);
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete(NEXT_COOKIE);
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  if (oauthError) return redirectBack(req, { coinpay: 'error', reason: oauthError });
  if (!code || !state) return redirectBack(req, { coinpay: 'error', reason: 'missing-params' });

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  if (!expectedState || expectedState !== state) {
    return redirectBack(req, { coinpay: 'error', reason: 'state-mismatch' });
  }

  const cfg = getCoinpayOAuthConfig();
  if (!cfg) return redirectBack(req, { coinpay: 'error', reason: 'not-configured' });

  try {
    const token = await exchangeCodeForToken(cfg, code);
    const info = await fetchUserInfo(cfg, token.access_token);
    if (!info.sub) return redirectBack(req, { coinpay: 'error', reason: 'no-sub' });
    const user = await upsertUser({
      sub: info.sub,
      did: info.did,
      name: info.name,
      email: info.email,
      wallets: info.wallets ?? [],
    });
    const res = await redirectBack(req, { coinpay: 'linked' });
    const session = buildSessionCookie(user);
    res.cookies.set(session.name, session.value, session.options);
    return res;
  } catch (error) {
    console.error('[coinpay/callback]', error);
    return redirectBack(req, { coinpay: 'error', reason: 'exchange' });
  }
}
