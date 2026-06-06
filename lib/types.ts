export type CategorySlug =
  | 'weeknight'
  | 'baking'
  | 'plant-forward'
  | 'comfort'
  | 'meal-prep'
  | 'global'
  | 'holiday'
  | 'healthy'
  | 'desserts'
  | 'drinks';

export type Category = {
  slug: CategorySlug;
  name: string;
  description: string;
};

export type RewriteStatus = 'not_requested' | 'queued' | 'rewritten' | 'review_needed';

export type Cookbook = {
  id: string;
  title: string;
  slug: string;
  description: string;
  categories: CategorySlug[];
  priceUsd: number;
  isPublished: boolean;
  ownerSub: string;
  ownerName?: string;
  pdfPath: string;
  fileName: string;
  coverImage?: string;
  sourceCreator?: string;
  sourceUrl?: string;
  acknowledgement?: string;
  rightsConfirmed: boolean;
  aiRewriteRequested: boolean;
  rewriteStatus: RewriteStatus;
  createdAt: string;
  updatedAt: string;
};

export type User = {
  sub: string;
  did?: string;
  name?: string;
  email?: string;
  wallets?: Array<{
    address: string;
    chain: string;
    label?: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type Purchase = {
  id: string;
  cookbookId: string;
  buyerSub: string;
  coinpayPaymentId: string;
  amountUsd: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'forwarded' | 'expired' | 'failed';
  checkoutUrl?: string;
  txHash?: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
};

export type StoreData = {
  users: User[];
  cookbooks: Cookbook[];
  purchases: Purchase[];
};
