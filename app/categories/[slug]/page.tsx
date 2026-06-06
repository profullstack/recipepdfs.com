import { notFound } from 'next/navigation';
import { CookbookCard } from '@/components/CookbookCard';
import { getCategory } from '@/lib/categories';
import { listPublishedCookbooks } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();
  const cookbooks = (await listPublishedCookbooks()).filter((cookbook) =>
    cookbook.categories.includes(category.slug),
  );

  return (
    <main className="layout">
      <div>
        <div className="eyebrow">Category</div>
        <h1>{category.name}</h1>
        <p className="lead">{category.description}</p>
      </div>
      <div className="recipe-grid">
        {cookbooks.map((cookbook) => (
          <CookbookCard cookbook={cookbook} key={cookbook.id} />
        ))}
      </div>
    </main>
  );
}
