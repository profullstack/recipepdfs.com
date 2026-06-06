export function formatPrice(priceUsd: number): string {
  if (priceUsd <= 0) return 'Free';
  if (priceUsd < 0.01) return `$${priceUsd.toFixed(4)}`;
  if (priceUsd < 1) return `$${priceUsd.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(priceUsd);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
