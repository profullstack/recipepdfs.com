import { afterEach, describe, expect, it } from 'bun:test';
import { GET as robots } from '@/app/robots.txt/route';
import { GET as pricing } from '@/app/pricing/route';
import { siteHref, siteUrl } from '@/lib/site-url';

const KEYS = ['SITE_URL', 'NEXT_PUBLIC_SITE_URL', 'APP_URL', 'NEXT_PUBLIC_APP_URL'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
const clear = () => KEYS.forEach((k) => delete process.env[k]);

describe('public URLs come from configuration, never the request host', () => {
  it('defaults to https://recipepdfs.com', () => {
    clear();
    expect(siteUrl()).toBe('https://recipepdfs.com');
    expect(siteHref('/api/download/abc').href).toBe('https://recipepdfs.com/api/download/abc');
  });

  it('honours APP_URL and trims a trailing slash', () => {
    clear();
    process.env.APP_URL = 'https://example.test/';
    expect(siteUrl()).toBe('https://example.test');
  });

  it('robots.txt and /pricing print the site URL, not the bind address', async () => {
    clear();
    const text = await (await robots()).text();
    expect(text).toContain('Sitemap: https://recipepdfs.com/llms.txt');
    expect(text).not.toMatch(/localhost|0\.0\.0\.0/);
    const json = JSON.stringify(await (await pricing()).json());
    expect(json).toContain('https://recipepdfs.com/crawl');
    expect(json).not.toMatch(/localhost|0\.0\.0\.0/);
  });
});
