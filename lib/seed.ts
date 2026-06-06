import { imageForIndex } from '@/lib/assets';
import type { Cookbook, StoreData } from '@/lib/types';

const now = new Date('2026-06-06T00:00:00.000Z').toISOString();

const cookbooks: Cookbook[] = [
  {
    id: 'seed-weeknight-pantry',
    title: 'Weeknight Pantry PDFs',
    slug: 'weeknight-pantry-pdfs',
    description:
      'A compact set of flexible dinner recipes built around pantry staples, vegetables, rice, pasta, and quick sauces.',
    categories: ['weeknight', 'meal-prep'],
    priceUsd: 0,
    isPublished: true,
    ownerSub: 'seed',
    ownerName: 'RecipePDFs Editorial',
    pdfPath: '/sample/weeknight-pantry.pdf',
    fileName: 'weeknight-pantry.pdf',
    coverImage: imageForIndex(0),
    sourceCreator: 'Original editorial sample',
    acknowledgement: 'Sample listing for marketplace layout and category browsing.',
    rightsConfirmed: true,
    aiRewriteRequested: false,
    rewriteStatus: 'not_requested',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'seed-bakery-notebook',
    title: 'Tiny Bakery Notebook',
    slug: 'tiny-bakery-notebook',
    description:
      'Small-batch dessert formulas, buttercream ratios, crust notes, and prep timelines for home bakers.',
    categories: ['baking', 'desserts'],
    priceUsd: 0.004,
    isPublished: true,
    ownerSub: 'seed',
    ownerName: 'RecipePDFs Editorial',
    pdfPath: '/sample/tiny-bakery-notebook.pdf',
    fileName: 'tiny-bakery-notebook.pdf',
    coverImage: imageForIndex(1),
    sourceCreator: 'Original editorial sample',
    acknowledgement: 'Sample paid listing using fractional-dollar Coinpay checkout.',
    rightsConfirmed: true,
    aiRewriteRequested: true,
    rewriteStatus: 'rewritten',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'seed-plant-bowls',
    title: 'Plant Bowl Builder',
    slug: 'plant-bowl-builder',
    description:
      'Build-your-own vegetable bowl templates with grains, crunch, herbs, dressings, and leftover strategies.',
    categories: ['plant-forward', 'healthy', 'weeknight'],
    priceUsd: 0,
    isPublished: true,
    ownerSub: 'seed',
    ownerName: 'RecipePDFs Editorial',
    pdfPath: '/sample/plant-bowl-builder.pdf',
    fileName: 'plant-bowl-builder.pdf',
    coverImage: imageForIndex(2),
    sourceCreator: 'Original editorial sample',
    acknowledgement: 'Sample free cookbook for category browsing.',
    rightsConfirmed: true,
    aiRewriteRequested: false,
    rewriteStatus: 'not_requested',
    createdAt: now,
    updatedAt: now,
  },
];

export const initialStoreData: StoreData = {
  users: [],
  cookbooks,
  purchases: [],
};
