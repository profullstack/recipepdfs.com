import type { Metadata } from 'next';
import { BookOpen, Upload } from 'lucide-react';
import Link from 'next/link';
import { AdUnit } from '@/components/AdUnit';
import { PitFooter } from '@/components/PitFooter';
import './globals.css';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = {
  title: 'RecipePDFs.com',
  description: 'Publish, browse, and buy free or paid recipe PDF cookbooks with Coinpay.',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <head>
        <script data-site="baa96667-70da-4700-9564-d0bfcec6c7ae" src="https://crawlproof.com/stats.js" async></script>
        <script src="https://crawlproof.com/ad.js" async></script>
      </head>
      <body>
        <div className="shell">
          <nav className="nav">
            <Link href="/" className="brand" aria-label="RecipePDFs.com home">
              <span className="brand-mark">
                <BookOpen size={20} aria-hidden="true" />
              </span>
              <span>RecipePDFs.com</span>
            </Link>
            <div className="nav-links">
              <Link href="/browse">Browse</Link>
              <Link href="/categories">Categories</Link>
              {user ? <Link href="/library">Library</Link> : null}
              {user ? <Link href="/dashboard">Dashboard</Link> : null}
            </div>
            <div className="nav-actions">
              {user ? (
                <>
                  <Link className="button secondary small" href="/upload">
                    <Upload size={16} aria-hidden="true" />
                    Upload
                  </Link>
                  <form action="/api/logout" method="post">
                    <button className="button small" type="submit">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link className="button small" href="/api/coinpay/connect">
                  Sign in with Coinpay
                </Link>
              )}
            </div>
          </nav>
          <AdUnit />
          {children}
          <footer className="site-footer">
            <span>&copy; {new Date().getFullYear()} <a href="https://profullstack.com/">Profullstack, Inc.</a></span>
            <Link href="/pricing">Pricing</Link>
            <a href="https://github.com/profullstack/recipepdfs.com">GitHub</a>
            <a href="mailto:support@profullstack.com">Contact</a>
          </footer>
        </div>
        <PitFooter />
      </body>
    </html>
  );
}
