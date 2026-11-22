import type { MetadataRoute } from 'next';
import { CATEGORIES } from '@/lib/categories';
import { siteUrl } from '@/lib/site-url';
import { listPublishedCookbooks } from '@/lib/store';

/**
 * Every public page on the live origin (siteUrl(), recipepdfs.pwa.pit.world):
 * the browse pages, each category and each published cookbook, newest first.
 * Account pages (/library, /upload, /dashboard) redirect to sign-in and are
 * left out.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteUrl();
  const cookbooks = await listPublishedCookbooks();
  const newest = cookbooks[0]?.updatedAt;

  return [
    { url: `${origin}/`, ...(newest && { lastModified: new Date(newest) }) },
    { url: `${origin}/browse`, ...(newest && { lastModified: new Date(newest) }) },
    { url: `${origin}/categories` },
    ...CATEGORIES.map((category) => ({ url: `${origin}/categories/${category.slug}` })),
    ...cookbooks.map((cookbook) => ({
      url: `${origin}/cookbooks/${cookbook.slug}`,
      lastModified: new Date(cookbook.updatedAt),
    })),
  ];
}
