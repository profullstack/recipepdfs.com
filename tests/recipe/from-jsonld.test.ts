import { describe, expect, it } from 'vitest';
import { recipeFromHtml, recipeFromJsonLdNode } from '@/lib/recipe/from-jsonld';

function page(jsonLd: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
}

describe('recipeFromHtml', () => {
  it('finds a Recipe nested inside an @graph', () => {
    const html = page({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'A Food Blog' },
        {
          '@type': 'Recipe',
          name: 'Zucchini Pancakes',
          recipeIngredient: ['2 cups grated zucchini', '1/2 teaspoon salt'],
          recipeInstructions: [{ '@type': 'HowToStep', text: 'Grate the zucchini.' }],
        },
      ],
    });
    const recipe = recipeFromHtml(html, { url: 'https://example.com/zucchini' });
    expect(recipe?.title).toBe('Zucchini Pancakes');
    expect(recipe?.ingredients).toHaveLength(2);
    expect(recipe?.ingredients[0]).toMatchObject({ quantity: 2, item: 'grated zucchini' });
  });

  it('handles a Recipe whose @type is an array', () => {
    const html = page({
      '@type': ['Recipe', 'NewsArticle'],
      name: 'Pumpkin Chili',
      recipeIngredient: ['1 pound ground beef'],
      recipeInstructions: 'Brown the beef.',
    });
    expect(recipeFromHtml(html)?.title).toBe('Pumpkin Chili');
  });

  it('returns undefined for a page with no Recipe markup', () => {
    const html = page({ '@type': 'Article', headline: '18 Easy Tofu Recipes' });
    expect(recipeFromHtml(html)).toBeUndefined();
  });

  it('survives a block of invalid JSON-LD and reads the next one', () => {
    const html = `<html><head>
      <script type="application/ld+json">{ not valid json </script>
      <script type="application/ld+json">${JSON.stringify({
        '@type': 'Recipe',
        name: 'Boat Dip',
        recipeIngredient: ['1 cup sour cream'],
      })}</script>
    </head></html>`;
    expect(recipeFromHtml(html)?.title).toBe('Boat Dip');
  });
});

describe('recipeFromJsonLdNode', () => {
  it('reads steps out of a HowToSection', () => {
    const recipe = recipeFromJsonLdNode({
      '@type': 'Recipe',
      name: 'Layered Bake',
      recipeIngredient: ['1 cup flour'],
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'Base',
          itemListElement: [
            { '@type': 'HowToStep', text: 'Mix the flour.' },
            { '@type': 'HowToStep', text: 'Press into the tin.' },
          ],
        },
      ],
    });
    expect(recipe?.steps.map((s) => s.text)).toEqual(['Mix the flour.', 'Press into the tin.']);
  });

  it('splits a newline-delimited instruction string into steps', () => {
    const recipe = recipeFromJsonLdNode({
      '@type': 'Recipe',
      name: 'Simple Toast',
      recipeIngredient: ['2 slices bread'],
      recipeInstructions: 'Toast the bread.\nButter it.',
    });
    expect(recipe?.steps).toHaveLength(2);
  });

  it('keeps only valid ISO 8601 durations', () => {
    const recipe = recipeFromJsonLdNode({
      '@type': 'Recipe',
      name: 'Timed',
      recipeIngredient: ['1 egg'],
      prepTime: 'PT10M',
      cookTime: '20 minutes',
    });
    expect(recipe?.times?.prep).toBe('PT10M');
    // "20 minutes" is not a duration; better absent than wrong.
    expect(recipe?.times?.cook).toBeUndefined();
  });

  it('reads nutrition values that carry their units', () => {
    const recipe = recipeFromJsonLdNode({
      '@type': 'Recipe',
      name: 'Counted',
      recipeIngredient: ['1 egg'],
      nutrition: { '@type': 'NutritionInformation', calories: '380 kcal', proteinContent: '25 g' },
    });
    expect(recipe?.nutrition?.calories).toBe(380);
    expect(recipe?.nutrition?.proteinG).toBe(25);
  });

  it('rejects a node with neither ingredients nor steps', () => {
    expect(recipeFromJsonLdNode({ '@type': 'Recipe', name: 'Empty' })).toBeUndefined();
  });
});
