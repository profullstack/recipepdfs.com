import Link from 'next/link';
import { BookOpen, Download, LockKeyhole } from 'lucide-react';
import { CATEGORIES } from '@/lib/categories';
import { formatPrice } from '@/lib/format';
import type { Cookbook } from '@/lib/types';

export function CookbookCard({ cookbook }: { cookbook: Cookbook }) {
  const categoryNames = cookbook.categories
    .map((slug) => CATEGORIES.find((category) => category.slug === slug)?.name ?? slug)
    .slice(0, 3);

  return (
    <article className="card">
      <Link
        href={`/cookbooks/${cookbook.slug}`}
        className="card-image"
        style={{ backgroundImage: `url(${cookbook.coverImage || '/assets/hero-recipes.png'})` }}
        aria-label={cookbook.title}
      />
      <div className="card-pad">
        <div className="eyebrow">{formatPrice(cookbook.priceUsd)}</div>
        <h3>
          <Link href={`/cookbooks/${cookbook.slug}`}>{cookbook.title}</Link>
        </h3>
        <p className="muted">{cookbook.description}</p>
        <div className="pill-row" aria-label="Categories">
          {categoryNames.map((name) => (
            <span className="pill" key={name}>
              {name}
            </span>
          ))}
        </div>
        <div className="actions">
          <Link className="button small" href={`/cookbooks/${cookbook.slug}`}>
            {cookbook.priceUsd > 0 ? (
              <LockKeyhole size={15} aria-hidden="true" />
            ) : (
              <Download size={15} aria-hidden="true" />
            )}
            {cookbook.priceUsd > 0 ? 'View' : 'Download'}
          </Link>
          <span className="button secondary small" aria-label="PDF cookbook">
            <BookOpen size={15} aria-hidden="true" />
            PDF
          </span>
        </div>
      </div>
    </article>
  );
}
