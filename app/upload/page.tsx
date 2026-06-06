import { redirect } from 'next/navigation';
import { CATEGORIES } from '@/lib/categories';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/api/coinpay/connect?next=/upload');

  return (
    <main className="layout">
      <div>
        <div className="eyebrow">Publish</div>
        <h1>Upload a cookbook PDF</h1>
        <p className="lead">
          Publish a free cookbook or set a fractional price. Coinpay identity is used for authorship,
          purchases, and downloads.
        </p>
      </div>

      <form className="form card card-pad" action="/api/upload" method="post" encType="multipart/form-data">
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" required maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" required maxLength={800} />
        </div>
        <div className="field">
          <label htmlFor="priceUsd">Price in USD</label>
          <input id="priceUsd" name="priceUsd" type="number" min="0" max="100" step="0.0001" defaultValue="0" />
          <span className="muted">Use 0 for free. Fractional prices like 0.004 are allowed.</span>
        </div>
        <div className="field">
          <label htmlFor="pdf">PDF file</label>
          <input id="pdf" name="pdf" type="file" accept="application/pdf,.pdf" required />
        </div>
        <div className="field">
          <label htmlFor="sourceCreator">Original creator or source name</label>
          <input id="sourceCreator" name="sourceCreator" maxLength={160} />
        </div>
        <div className="field">
          <label htmlFor="sourceUrl">Source URL</label>
          <input id="sourceUrl" name="sourceUrl" type="url" maxLength={300} />
        </div>
        <div className="field">
          <label htmlFor="acknowledgement">Acknowledgement notes</label>
          <textarea
            id="acknowledgement"
            name="acknowledgement"
            maxLength={800}
            placeholder="Credit, permission notes, family source, inspiration, or public-domain context."
          />
        </div>
        <div className="field">
          <label>Categories</label>
          <div className="category-grid">
            {CATEGORIES.map((category) => (
              <label className="check" key={category.slug}>
                <input type="checkbox" name="categories" value={category.slug} />
                <span>
                  <strong>{category.name}</strong>
                  <br />
                  <span className="muted">{category.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" name="aiRewriteRequested" value="1" />
          <span>
            <strong>Request AI rewrite and formatting review</strong>
            <br />
            <span className="muted">
              The first version records this as queued; the actual rewrite worker can be connected next.
            </span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" name="rightsConfirmed" value="1" required />
          <span>
            <strong>I have rights or permission to publish this cookbook.</strong>
            <br />
            <span className="muted">
              AI rewriting does not remove the need to acknowledge creators or respect copyright.
            </span>
          </span>
        </label>
        <button className="button" type="submit">
          Publish cookbook
        </button>
      </form>
    </main>
  );
}
