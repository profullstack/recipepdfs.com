import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  buildAuthorizeUrl,
  generateOAuthState,
  getCoinpayOAuthConfig,
} from '@/lib/coinpay-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'coinpay_oauth_state';
const NEXT_COOKIE = 'coinpay_oauth_next';
const STATE_TTL_SECONDS = 10 * 60;

function sanitizeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.length > 200) return '/dashboard';
  return raw;
}

export async function GET(req: Request) {
  const cfg = getCoinpayOAuthConfig();
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: 'Coinpay OAuth is not configured' },
      { status: 503 },
    );
  }

  const state = generateOAuthState();
  const url = new URL(req.url);
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_TTL_SECONDS,
    path: '/api/coinpay',
  });
  cookieStore.set(NEXT_COOKIE, sanitizeNext(url.searchParams.get('next')), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_TTL_SECONDS,
    path: '/api/coinpay',
  });

  return NextResponse.redirect(buildAuthorizeUrl(cfg, state), 302);
}
