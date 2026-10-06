import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET: liveness for status.profullstack.com. No database here, so a 200 means the app is serving.
export function GET() {
  return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
