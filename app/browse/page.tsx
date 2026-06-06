import { CookbookCard } from '@/components/CookbookCard';
import { listPublishedCookbooks } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function BrowsePage() {
  const cookbooks = await listPublishedCookbooks();

  return (
    <main className="layout">
      <div>
        <div className="eyebrow">Browse</div>
        <h1>Recipe PDFs and cookbooks</h1>
        <p className="lead">Free downloads and paid cookbook files, organized by category.</p>
      </div>
      <div className="recipe-grid">
        {cookbooks.map((cookbook) => (
          <CookbookCard cookbook={cookbook} key={cookbook.id} />
        ))}
      </div>
    </main>
  );
}
