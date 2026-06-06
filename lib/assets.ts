const fallbackImages = [
  '/assets/category-vegetables.png',
  '/assets/category-dessert.png',
  '/assets/hero-recipes.png',
];

export function imageForIndex(index: number): string {
  return fallbackImages[index % fallbackImages.length];
}
