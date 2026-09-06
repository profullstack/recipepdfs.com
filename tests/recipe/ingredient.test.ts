import { describe, expect, it } from 'vitest';
import { isIngredientGroupHeading, parseIngredient } from '@/lib/recipe/ingredient';

describe('parseIngredient', () => {
  it('reads a simple quantity, unit and item', () => {
    expect(parseIngredient('3 tablespoons mayonnaise')).toMatchObject({
      quantity: 3,
      unit: 'tablespoon',
      item: 'mayonnaise',
    });
  });

  it('reads a vulgar fraction', () => {
    expect(parseIngredient('½ cup sugar')).toMatchObject({ quantity: 0.5, unit: 'cup' });
  });

  it('reads a written fraction', () => {
    expect(parseIngredient('3/4 teaspoon freshly ground black pepper')).toMatchObject({
      quantity: 0.75,
      unit: 'teaspoon',
      item: 'freshly ground black pepper',
    });
  });

  it('reads a mixed number written with a hyphen', () => {
    // "1-1/2" is one and a half, not the range one-to-one.
    expect(parseIngredient('1-1/2 cups flour')).toMatchObject({ quantity: 1.5, unit: 'cup' });
  });

  it('reads a mixed number written with a space', () => {
    expect(parseIngredient('1 1/2 teaspoons white sugar')).toMatchObject({
      quantity: 1.5,
      unit: 'teaspoon',
    });
  });

  it('reads a range', () => {
    const parsed = parseIngredient('1 to 2 cups broth');
    expect(parsed.quantity).toBe(1);
    expect(parsed.quantityMax).toBe(2);
    expect(parsed.unit).toBe('cup');
  });

  it('separates a preparation note from the item', () => {
    expect(parseIngredient('1/2 pound bacon strips, chopped')).toMatchObject({
      quantity: 0.5,
      unit: 'pound',
      item: 'bacon strips',
      note: 'chopped',
    });
  });

  it('keeps a parenthetical pack size off the item name', () => {
    const parsed = parseIngredient('1 can (14-1/2 ounces) diced tomatoes, undrained');
    expect(parsed.quantity).toBe(1);
    expect(parsed.unit).toBe('can');
    expect(parsed.packSize).toBe('14-1/2 ounces');
    expect(parsed.item).toBe('diced tomatoes');
    expect(parsed.note).toBe('undrained');
  });

  it('marks an optional ingredient and keeps its name', () => {
    const parsed = parseIngredient('Minced fresh parsley, optional');
    expect(parsed.optional).toBe(true);
    expect(parsed.item).toBe('Minced fresh parsley');
  });

  it('always preserves the raw line', () => {
    const raw = '2 (5 ounce) packages American salad mix';
    expect(parseIngredient(raw).raw).toBe(raw);
  });

  it('does not invent a unit for an unknown word', () => {
    expect(parseIngredient('2 eggs').unit).toBeUndefined();
    expect(parseIngredient('2 eggs').item).toBe('eggs');
  });

  it('records the group it was given', () => {
    expect(parseIngredient('1 cup sugar', 'FILLING').group).toBe('FILLING');
  });
});

describe('isIngredientGroupHeading', () => {
  it('accepts a shouted heading', () => {
    expect(isIngredientGroupHeading('**FILLING:**')).toBe(true);
  });

  it('rejects an ordinary ingredient line', () => {
    expect(isIngredientGroupHeading('1 cup sugar')).toBe(false);
  });

  it('rejects a sentence that merely ends in a colon', () => {
    expect(isIngredientGroupHeading('Combine the following in a bowl:')).toBe(false);
  });
});
