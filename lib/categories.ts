import type { Category } from '@/lib/types';

export const CATEGORIES: Category[] = [
  {
    slug: 'weeknight',
    name: 'Weeknight',
    description: 'Fast dinners and practical everyday cooking.',
  },
  {
    slug: 'baking',
    name: 'Baking',
    description: 'Bread, pastry, cakes, cookies, and dough notes.',
  },
  {
    slug: 'plant-forward',
    name: 'Plant Forward',
    description: 'Vegetable-heavy cookbooks and meatless staples.',
  },
  {
    slug: 'comfort',
    name: 'Comfort',
    description: 'Cozy mains, soups, casseroles, and family favorites.',
  },
  {
    slug: 'meal-prep',
    name: 'Meal Prep',
    description: 'Batch cooking, freezer meals, and weekly plans.',
  },
  {
    slug: 'global',
    name: 'Global',
    description: 'Regional recipes and cross-cultural cooking notes.',
  },
  {
    slug: 'holiday',
    name: 'Holiday',
    description: 'Menus, traditions, and seasonal party food.',
  },
  {
    slug: 'healthy',
    name: 'Healthy',
    description: 'High-protein, low-lift, and nutrition-aware recipes.',
  },
  {
    slug: 'desserts',
    name: 'Desserts',
    description: 'Sweet recipes, plated desserts, and baking extras.',
  },
  {
    slug: 'drinks',
    name: 'Drinks',
    description: 'Mocktails, cocktails, coffee, and fermentation guides.',
  },
];

export function getCategory(slug: string) {
  return CATEGORIES.find((category) => category.slug === slug);
}
