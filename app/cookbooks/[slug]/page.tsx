import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, LockKeyhole, ShieldCheck } from 'lucide-react';
import { CATEGORIES } from '@/lib/categories';
import { formatDate, formatPrice } from '@/lib/format';
import { getCurrentUser } from '@/lib/session';
import { findCookbook, hasCookbookAccess } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function CookbookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [cookbook, user] = await Promise.all([findCookbook(slug), getCurrentUser()]);
  if (!cookbook || !cookbook.isPublished) notFound();
  const hasAccess = await hasCookbookAccess({ cookbook, userSub: user?.sub });
  const categories = cookbook.categories.map(
    (categorySlug) => CATEGORIES.find((category) => category.slug === categorySlug)?.name ?? categorySlug,
  );

  return (
    <main className="layout">
      <div className="two-col">
        <div>
          <div className="eyebrow">{formatPrice(cookbook.priceUsd)}</div>
          <h1>{cookbook.title}</h1>
          <p className="lead">{cookbook.description}</p>
          <div className="pill-row">
            {categories.map((category) => (
              <span className="pill" key={category}>
                {category}
              </span>
            ))}
          </div>
          <div className="actions">
            {hasAccess ? (
              <Link className="button" href={`/api/download/${cookbook.id}`}>
                <Download size={18} aria-hidden="true" />
                Download PDF
              </Link>
            ) : user ? (
              <form action="/api/purchase" method="post">
                <input type="hidden" name="cookbookId" value={cookbook.id} />
                <button className="button" type="submit">
                  <LockKeyhole size={18} aria-hidden="true" />
                  Pay {formatPrice(cookbook.priceUsd)}
                </button>
              </form>
            ) : (
              <Link className="button" href={`/api/coinpay/connect?next=/cookbooks/${cookbook.slug}`}>
                <LockKeyhole size={18} aria-hidden="true" />
                Sign in to buy
              </Link>
            )}
            <Link className="button secondary" href="/browse">
              Browse more
            </Link>
          </div>
        </div>
        <aside className="card">
          <div
            className="card-image"
            style={{ backgroundImage: `url(${cookbook.coverImage || '/assets/hero-recipes.png'})` }}
          />
          <div className="card-pad">
            <h3>Publishing notes</h3>
            <p className="muted">Published {formatDate(cookbook.createdAt)}</p>
            <p className="muted">By {cookbook.ownerName || 'Coinpay creator'}</p>
            <div className="pill-row">
              <span className="pill">{cookbook.rewriteStatus.replace('_', ' ')}</span>
              {cookbook.rightsConfirmed ? <span className="pill">rights confirmed</span> : null}
            </div>
            {cookbook.sourceCreator || cookbook.sourceUrl || cookbook.acknowledgement ? (
              <>
                <h3>Acknowledgement</h3>
                {cookbook.sourceCreator ? <p className="muted">{cookbook.sourceCreator}</p> : null}
                {cookbook.sourceUrl ? (
                  <p>
                    <a className="price" href={cookbook.sourceUrl}>
                      Source
                    </a>
                  </p>
                ) : null}
                {cookbook.acknowledgement ? <p className="muted">{cookbook.acknowledgement}</p> : null}
              </>
            ) : null}
            <p className="status">
              <ShieldCheck size={16} aria-hidden="true" /> AI rewrites help clarify and format recipes;
              source acknowledgement still stays visible.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
