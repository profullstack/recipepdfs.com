import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL('/', req.url), 302);
  const session = clearSessionCookie();
  res.cookies.set(session.name, session.value, session.options);
  return res;
}
