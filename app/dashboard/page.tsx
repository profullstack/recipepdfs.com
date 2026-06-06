import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatDate, formatPrice } from '@/lib/format';
import { getCurrentUser } from '@/lib/session';
import { listCookbooksByOwner } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/api/coinpay/connect?next=/dashboard');
  const cookbooks = await listCookbooksByOwner(user.sub);

  return (
    <main className="layout">
      <div className="section-head">
        <div>
          <div className="eyebrow">Dashboard</div>
          <h1>Your uploads</h1>
          <p className="lead">Signed in as {user.name || user.email || user.sub} via Coinpay.</p>
        </div>
        <Link className="button" href="/upload">
          Upload PDF
        </Link>
      </div>

      <div className="card card-pad">
        {cookbooks.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Cookbook</th>
                <th>Price</th>
                <th>Rewrite</th>
                <th>Published</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cookbooks.map((cookbook) => (
                <tr key={cookbook.id}>
                  <td>
                    <strong>{cookbook.title}</strong>
                    <br />
                    <span className="muted">{cookbook.fileName}</span>
                  </td>
                  <td>{formatPrice(cookbook.priceUsd)}</td>
                  <td>{cookbook.rewriteStatus.replace('_', ' ')}</td>
                  <td>{formatDate(cookbook.createdAt)}</td>
                  <td>
                    <Link className="button small secondary" href={`/cookbooks/${cookbook.slug}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No uploads yet.</p>
        )}
      </div>
    </main>
  );
}
