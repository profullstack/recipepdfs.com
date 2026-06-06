import Link from 'next/link';
import { CATEGORIES } from '@/lib/categories';
import { listPublishedCookbooks } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const cookbooks = await listPublishedCookbooks();

  return (
    <main className="layout">
      <div>
        <div className="eyebrow">Categories</div>
        <h1>Organized recipe PDFs</h1>
      </div>
      <div className="category-grid">
        {CATEGORIES.map((category) => {
          const count = cookbooks.filter((cookbook) =>
            cookbook.categories.includes(category.slug),
          ).length;
          return (
            <Link className="category-card" href={`/categories/${category.slug}`} key={category.slug}>
              <strong>{category.name}</strong>
              <span>
                {category.description} {count} {count === 1 ? 'cookbook' : 'cookbooks'}.
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
