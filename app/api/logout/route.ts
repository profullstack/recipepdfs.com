import { NextResponse } from 'next/server';
import { siteHref } from '@/lib/site-url';
import { clearSessionCookie } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const res = NextResponse.redirect(siteHref('/'), 302);
  const session = clearSessionCookie();
  res.cookies.set(session.name, session.value, session.options);
  return res;
}
