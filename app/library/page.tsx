import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { formatDate, formatPrice } from '@/lib/format';
import { getCurrentUser } from '@/lib/session';
import { findCookbook, listPurchasesForBuyer } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/api/coinpay/connect?next=/library');
  const purchases = await listPurchasesForBuyer(user.sub);
  const rows = await Promise.all(
    purchases.map(async (purchase) => ({
      purchase,
      cookbook: await findCookbook(purchase.cookbookId),
    })),
  );

  return (
    <main className="layout">
      <div>
        <div className="eyebrow">Library</div>
        <h1>Your paid cookbooks</h1>
        <p className="lead">Purchases unlock after Coinpay confirms or forwards the payment webhook.</p>
      </div>

      <div className="card card-pad">
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Cookbook</th>
                <th>Paid</th>
                <th>Status</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ purchase, cookbook }) => (
                <tr key={purchase.id}>
                  <td>{cookbook ? <Link href={`/cookbooks/${cookbook.slug}`}>{cookbook.title}</Link> : purchase.cookbookId}</td>
                  <td>{formatPrice(purchase.amountUsd)}</td>
                  <td>{purchase.status}</td>
                  <td>{formatDate(purchase.createdAt)}</td>
                  <td>
                    {cookbook && (purchase.status === 'confirmed' || purchase.status === 'forwarded') ? (
                      <Link className="button small" href={`/api/download/${cookbook.id}`}>
                        <Download size={14} aria-hidden="true" />
                        Download
                      </Link>
                    ) : purchase.checkoutUrl ? (
                      <a className="button small secondary" href={purchase.checkoutUrl}>
                        Checkout
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No paid cookbooks yet.</p>
        )}
      </div>
    </main>
  );
}
