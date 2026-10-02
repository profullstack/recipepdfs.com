/**
 * The public origin of the site, for every absolute URL we print or redirect to.
 *
 * Never derive it from the request: behind nginx and the standalone server the
 * request URL is the bind address (http://0.0.0.0:8080, https://localhost:8080),
 * not the host the visitor typed. Read through a non-literal key so Next does
 * not inline the value at build time.
 */
const env = (name: string) => process.env[name];

export const DEFAULT_SITE_URL = 'https://recipepdfs.com';

export function siteUrl(): string {
  const raw =
    env('SITE_URL') ||
    env('NEXT_PUBLIC_SITE_URL') ||
    env('APP_URL') ||
    env('NEXT_PUBLIC_APP_URL') ||
    DEFAULT_SITE_URL;
  return raw.replace(/\/+$/, '');
}

/** An absolute URL on the public site for a path such as `/browse`. */
export function siteHref(pathname: string): URL {
  return new URL(pathname, `${siteUrl()}/`);
}
