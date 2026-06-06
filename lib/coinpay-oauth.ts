import crypto from 'node:crypto';

const DEFAULT_BASE_URL = 'https://coinpayportal.com';

export type CoinpayOAuthConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

export type CoinpayTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
};

export type CoinpayUserInfo = {
  sub: string;
  did?: string;
  wallets?: Array<{
    address: string;
    chain: string;
    label?: string;
  }>;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

export function getCoinpayOAuthConfig(): CoinpayOAuthConfig | null {
  const clientId = process.env.COINPAY_OAUTH_CLIENT_ID;
  const clientSecret = process.env.COINPAY_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = (process.env.COINPAY_OAUTH_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'https://recipepdfs.com'
  ).replace(/\/+$/, '');
  const redirectUri =
    process.env.COINPAY_OAUTH_REDIRECT_URI?.replace(/\/+$/, '') ||
    `${appUrl}/api/coinpay/callback`;
  const scopes = (process.env.COINPAY_OAUTH_SCOPES || 'openid did wallet:read')
    .split(/\s+/)
    .filter(Boolean);

  return { baseUrl, clientId, clientSecret, redirectUri, scopes };
}

export function generateOAuthState(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function buildAuthorizeUrl(cfg: CoinpayOAuthConfig, state: string): string {
  const url = new URL('/api/oauth/authorize', cfg.baseUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('scope', cfg.scopes.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCodeForToken(
  cfg: CoinpayOAuthConfig,
  code: string,
): Promise<CoinpayTokenResponse> {
  const res = await fetch(`${cfg.baseUrl}/api/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`token endpoint ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as CoinpayTokenResponse;
}

export async function fetchUserInfo(
  cfg: CoinpayOAuthConfig,
  accessToken: string,
): Promise<CoinpayUserInfo> {
  const res = await fetch(`${cfg.baseUrl}/api/oauth/userinfo`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`userinfo ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as CoinpayUserInfo;
}
