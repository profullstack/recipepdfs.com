import Link from 'next/link';
import { Coins, FolderOpen, Upload } from 'lucide-react';
import { CookbookCard } from '@/components/CookbookCard';
import { CATEGORIES } from '@/lib/categories';
import { listPublishedCookbooks, publicStats } from '@/lib/store';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [cookbooks, stats, user] = await Promise.all([
    listPublishedCookbooks(),
    publicStats(),
    getCurrentUser(),
  ]);
  const featured = cookbooks.slice(0, 6);

  return (
    <main>
      <section className="hero">
        <div
          className="hero-media"
          style={{ '--hero-image': "url('/assets/hero-recipes.png')" } as React.CSSProperties}
        >
          <div className="hero-copy">
            <div className="eyebrow">Free and paid recipe PDFs</div>
            <h1>RecipePDFs.com</h1>
            <p>
              Upload cookbooks, organize recipes by category, publish them for free, or set a
              fractional Coinpay price for Solana-friendly checkout.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/browse">
                <FolderOpen size={18} aria-hidden="true" />
                Browse cookbooks
              </Link>
              <Link className="button secondary" href={user ? '/upload' : '/api/coinpay/connect'}>
                <Upload size={18} aria-hidden="true" />
                Publish a PDF
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="band alt">
        <div className="stat-grid">
          <div>
            <div className="eyebrow">Cookbooks</div>
            <h2>{stats.cookbooks}</h2>
          </div>
          <div>
            <div className="eyebrow">Free</div>
            <h2>{stats.free}</h2>
          </div>
          <div>
            <div className="eyebrow">Paid</div>
            <h2>{stats.paid}</h2>
          </div>
          <div>
            <div className="eyebrow">Categories</div>
            <h2>{stats.categories}</h2>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="section-head">
          <div>
            <div className="eyebrow">Categories</div>
            <h2>Find the kind of recipe file you actually need.</h2>
          </div>
          <Link className="button secondary" href="/categories">
            All categories
          </Link>
        </div>
        <div className="category-grid">
          {CATEGORIES.slice(0, 8).map((category) => (
            <Link className="category-card" href={`/categories/${category.slug}`} key={category.slug}>
              <strong>{category.name}</strong>
              <span>{category.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="band alt">
        <div className="section-head">
          <div>
            <div className="eyebrow">Marketplace</div>
            <h2>Fresh PDFs and cookbook uploads.</h2>
          </div>
          <Link className="button secondary" href="/browse">
            Browse all
          </Link>
        </div>
        <div className="recipe-grid">
          {featured.map((cookbook) => (
            <CookbookCard cookbook={cookbook} key={cookbook.id} />
          ))}
        </div>
      </section>

      <section className="band">
        <div className="two-col">
          <div>
            <div className="eyebrow">Responsible rewriting</div>
            <h2>AI rewrite workflow with acknowledgement fields.</h2>
            <p className="lead">
              Uploaders can request an AI rewrite pass for structure, clarity, and formatting while
              still recording the original creator, source URL, and acknowledgement notes. Publishing
              requires confirming that the uploader has rights or permission to share the material.
            </p>
          </div>
          <div className="card card-pad">
            <Coins size={28} color="#2f6f4e" aria-hidden="true" />
            <h3>Fractional pricing</h3>
            <p className="muted">
              Prices can be free or as low as fractions of a cent, with checkout currently defaulting
              to USDC on Solana through Coinpay.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
