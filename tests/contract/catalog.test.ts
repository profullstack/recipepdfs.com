import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/lib/categories';
import { formatPrice, slugify } from '@/lib/format';

describe('catalog primitives', () => {
  it('supports the category organization surface', () => {
    expect(CATEGORIES.map((category) => category.slug)).toContain('baking');
    expect(CATEGORIES.map((category) => category.slug)).toContain('weeknight');
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(8);
  });

  it('formats free and fractional paid cookbooks', () => {
    expect(formatPrice(0)).toBe('Free');
    expect(formatPrice(0.004)).toBe('$0.0040');
    expect(formatPrice(0.025)).toBe('$0.025');
  });

  it('creates URL-safe cookbook slugs', () => {
    expect(slugify('Tiny Bakery Notebook.pdf')).toBe('tiny-bakery-notebook-pdf');
  });
});
