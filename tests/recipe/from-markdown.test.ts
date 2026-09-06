import { describe, expect, it } from 'vitest';
import { recipeFromMarkdown, sourceFromFileName } from '@/lib/recipe/from-markdown';

/** The Allrecipes print layout: groups at `###`, steps at `####`. */
const ALLRECIPES = `# **Copycat Olive Garden Salad**

Here's my copycat version of the famous Olive Garden Salad.

By **Nicole McLaughlin** |

**Prep Time:** 15 mins **Stand Time:** 5 mins **Total Time:** 20 mins **Servings:** 8

## **Ingredients**

### **Dressing:**

- 1/4 cup extra-virgin olive oil

- 3 tablespoons mayonnaise

### **Salad:**

- 2 plum tomatoes, sliced

## **Directions**

#### **Step 1**

Combine olive oil and mayonnaise in a food processor.

#### **Step 2**

Toss the salad with the dressing.

## **Nutrition Facts**

Per serving: 156 calories; total carbohydrate 8g ; dietary fiber 2g ; total sugars 4g ; protein 2g ; total fat 13g ; saturated fat 2g ; cholesterol 5mg ; sodium 568mg
`;

/** The Taste of Home layout: inline numbered steps, no step headings. */
const TASTE_OF_HOME = `# Bacon Pasta

Source: https://www.tasteofhome.com/recipes/spaghetti-with-bacon

**Total Time** Prep: 20 Min. Bake: 40 Min. **Yield** 4 Servings

### **Test Kitchen Approved**

This bacon pasta recipe is a simple, crowdpleasing dish perfect for weeknight meals and family dinners.

## Ingredients

- 8 ounces uncooked spaghetti

- 1/2 pound bacon strips, chopped

## Directions

- **1** Preheat oven to 350°.

- **2** Cook the bacon until crisp.
`;

describe('recipeFromMarkdown — Allrecipes layout', () => {
  const recipe = recipeFromMarkdown(ALLRECIPES, {
    fileName: 'allrecipes.com_copycat-olive-garden-salad-recipe-7550384_print=.pdf',
    now: '2026-01-01T00:00:00.000Z',
  });

  it('parses the document', () => {
    expect(recipe).toBeDefined();
  });

  it('collects ingredients from every sub-group', () => {
    // The groups are `###` headings, which are sections in their own right —
    // if they are not folded back in, the ingredient list comes out empty.
    expect(recipe?.ingredients).toHaveLength(3);
  });

  it('labels each ingredient with its group', () => {
    expect(recipe?.ingredients[0].group).toBe('Dressing');
    expect(recipe?.ingredients[2].group).toBe('Salad');
  });

  it('collects steps printed at heading level four', () => {
    expect(recipe?.steps).toHaveLength(2);
    expect(recipe?.steps[0].text).toContain('Combine olive oil');
  });

  it('reads prep and total times as ISO durations', () => {
    expect(recipe?.times?.prep).toBe('PT15M');
    expect(recipe?.times?.total).toBe('PT20M');
  });

  it('reads the yield', () => {
    expect(recipe?.recipeYield?.servings).toBe(8);
  });

  it('reads publisher nutrition', () => {
    expect(recipe?.nutrition?.calories).toBe(156);
    expect(recipe?.nutrition?.sodiumMg).toBe(568);
    expect(recipe?.nutrition?.basis).toBe('publisher');
  });

  it('recovers the publisher and canonical URL from the filename', () => {
    expect(recipe?.source.name).toBe('Allrecipes');
    expect(recipe?.source.url).toContain('allrecipes.com/copycat-olive-garden-salad');
  });
});

describe('recipeFromMarkdown — Taste of Home layout', () => {
  const recipe = recipeFromMarkdown(TASTE_OF_HOME, {
    fileName: 'Bacon Pasta Recipe.pdf',
    now: '2026-01-01T00:00:00.000Z',
  });

  it('parses inline numbered steps', () => {
    expect(recipe?.steps).toHaveLength(2);
    expect(recipe?.steps[1].text).toBe('Cook the bacon until crisp.');
  });

  it('sums prep and bake into a total when none is printed', () => {
    expect(recipe?.times?.total).toBe('PT1H');
  });

  it('takes the canonical URL from the converter Source line', () => {
    expect(recipe?.source.url).toBe('https://www.tasteofhome.com/recipes/spaghetti-with-bacon');
  });

  it('identifies the publisher from its test-kitchen badge', () => {
    expect(recipe?.source.name).toBe('Tasteofhome');
  });

  it('keeps the headnote out of the facts', () => {
    expect(recipe?.editorial?.description).toContain('crowdpleasing');
  });
});

describe('recipeFromMarkdown — rejection', () => {
  it('returns undefined for a document with no recipe in it', () => {
    const roundup = `# 18 Easy Tofu Recipes\n\nHere are our favourites for weeknights.\n`;
    expect(recipeFromMarkdown(roundup)).toBeUndefined();
  });

  it('returns undefined when there is no title', () => {
    expect(recipeFromMarkdown('## Ingredients\n\n- 1 cup sugar\n')).toBeUndefined();
  });
});

describe('sourceFromFileName', () => {
  it('rebuilds a URL from a saved print page', () => {
    const source = sourceFromFileName('allrecipes.com_easy-spaghetti-carbonara-recipe-11998102_print=.pdf');
    expect(source.name).toBe('Allrecipes');
    expect(source.url).toBe('https://www.allrecipes.com/easy-spaghetti-carbonara-recipe-11998102');
  });

  it('names Taste of Home from its export title', () => {
    expect(sourceFromFileName('Million-Dollar Soup Recipe_ How to Make It.pdf').name).toBe(
      'Taste of Home',
    );
  });
});
