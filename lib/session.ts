import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import type { User } from '@/lib/types';

const SESSION_COOKIE = 'recipepdfs_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  sub: string;
  did?: string;
  name?: string;
  email?: string;
  wallets?: User['wallets'];
  iat: number;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV !== 'production') {
    return 'dev-only-recipepdfs-session-secret-please-replace';
  }
  throw new Error('SESSION_SECRET must be at least 32 characters');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function encode(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function decode(value?: string): SessionPayload | null {
  if (!value) return null;
  const [body, mac] = value.split('.');
  if (!body || !mac) return null;
  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const session = decode(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session?.sub) return null;
  const now = new Date().toISOString();
  return {
    sub: session.sub,
    did: session.did,
    name: session.name,
    email: session.email,
    wallets: session.wallets,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildSessionCookie(user: Omit<User, 'createdAt' | 'updatedAt'>) {
  return {
    name: SESSION_COOKIE,
    value: encode({ ...user, iat: Math.floor(Date.now() / 1000) }),
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: SESSION_TTL_SECONDS,
      path: '/',
    },
  };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: '',
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 0,
      path: '/',
    },
  };
}
