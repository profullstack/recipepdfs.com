import { describe, expect, it } from 'vitest';
import { durationMinutes, recipeToMarkdown } from '@/lib/recipe/store';
import { buildPublicRecord } from '@/lib/recipe/types';
import type { Recipe } from '@/lib/recipe/types';

describe('durationMinutes', () => {
  it('reads hours and minutes', () => {
    expect(durationMinutes('PT1H30M')).toBe(90);
  });

  it('reads minutes alone', () => {
    expect(durationMinutes('PT20M')).toBe(20);
  });

  it('returns undefined for nothing and for junk', () => {
    expect(durationMinutes(undefined)).toBeUndefined();
    expect(durationMinutes('20 minutes')).toBeUndefined();
  });
});

describe('buildPublicRecord', () => {
  const recipe: Recipe = {
    slug: 'test',
    title: 'Test Bake',
    source: { kind: 'pdf', name: 'Taste of Home', url: 'https://example.com/x' },
    ingredients: [{ raw: '1 cup flour', quantity: 1, unit: 'cup', item: 'flour' }],
    steps: [{ n: 1, text: 'Mix it.' }],
    editorial: { description: 'A lovely headnote.', author: 'Someone', images: ['a.png'] },
    ingestedAt: '2026-01-01T00:00:00.000Z',
  };

  it('strips the publisher prose and photography', () => {
    const record = buildPublicRecord(recipe);
    expect('editorial' in record).toBe(false);
    expect(JSON.stringify(record)).not.toContain('lovely headnote');
  });

  it('keeps the facts', () => {
    const record = buildPublicRecord(recipe);
    expect(record.ingredients).toHaveLength(1);
    expect(record.steps[0].text).toBe('Mix it.');
  });

  it('names the publisher in the attribution', () => {
    expect(buildPublicRecord(recipe).attribution).toContain('Taste of Home');
    expect(buildPublicRecord(recipe).attribution).toContain('https://example.com/x');
  });
});

describe('recipeToMarkdown', () => {
  const record = buildPublicRecord({
    slug: 'grouped',
    title: 'Layered Thing',
    source: { kind: 'pdf', name: 'Allrecipes' },
    times: { total: 'PT45M' },
    recipeYield: { text: '8 servings', servings: 8 },
    ingredients: [
      { raw: '1 cup flour', group: 'Base' },
      { raw: '2 eggs', group: 'Filling' },
    ],
    steps: [{ n: 1, text: 'Do the thing.' }],
    nutrition: { basis: 'publisher', calories: 250, proteinG: 8 },
    ingestedAt: '2026-01-01T00:00:00.000Z',
  });

  const markdown = recipeToMarkdown(record);

  it('titles the document', () => {
    expect(markdown).toMatch(/^# Layered Thing/);
  });

  it('prints each ingredient group as a heading', () => {
    expect(markdown).toContain('### Base');
    expect(markdown).toContain('### Filling');
  });

  it('renders the total time in minutes', () => {
    expect(markdown).toContain('**Total time:** 45 min');
  });

  it('numbers the steps', () => {
    expect(markdown).toContain('1. Do the thing.');
  });

  it('closes with the attribution', () => {
    expect(markdown.trimEnd().endsWith(record.attribution)).toBe(true);
  });
});
