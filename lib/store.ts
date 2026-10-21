import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialStoreData } from '@/lib/seed';
import type { Cookbook, Purchase, StoreData, User } from '@/lib/types';

const dataDir = process.env.RECIPEPDFS_DATA_DIR || path.join(process.cwd(), '.data');
const dataFile = path.join(dataDir, 'recipepdfs.json');

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(dataFile, 'utf8');
  } catch {
    await writeJson(initialStoreData);
  }
}

async function readJson(): Promise<StoreData> {
  await ensureDataFile();
  const raw = await readFile(dataFile, 'utf8');
  return JSON.parse(raw) as StoreData;
}

async function writeJson(data: StoreData) {
  await mkdir(dataDir, { recursive: true });
  const tmp = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tmp, dataFile);
}

async function updateStore<T>(fn: (data: StoreData) => T): Promise<T> {
  const data = await readJson();
  const result = fn(data);
  await writeJson(data);
  return result;
}

export async function listPublishedCookbooks(): Promise<Cookbook[]> {
  const data = await readJson();
  return data.cookbooks
    .filter((cookbook) => cookbook.isPublished)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listCookbooksByOwner(ownerSub: string): Promise<Cookbook[]> {
  const data = await readJson();
  return data.cookbooks
    .filter((cookbook) => cookbook.ownerSub === ownerSub)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findCookbook(idOrSlug: string): Promise<Cookbook | null> {
  const data = await readJson();
  return (
    data.cookbooks.find(
      (cookbook) => cookbook.id === idOrSlug || cookbook.slug === idOrSlug,
    ) ?? null
  );
}

export async function createCookbook(input: Omit<Cookbook, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  return updateStore((data) => {
    const baseSlug = input.slug || randomUUID();
    let slug = baseSlug;
    let suffix = 2;
    while (data.cookbooks.some((cookbook) => cookbook.slug === slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const cookbook: Cookbook = {
      ...input,
      id: randomUUID(),
      slug,
      createdAt: now,
      updatedAt: now,
    };
    data.cookbooks.unshift(cookbook);
    return cookbook;
  });
}

export async function upsertUser(input: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
  const now = new Date().toISOString();
  return updateStore((data) => {
    const existing = data.users.find((user) => user.sub === input.sub);
    if (existing) {
      Object.assign(existing, input, { updatedAt: now });
      return existing;
    }
    const user: User = { ...input, createdAt: now, updatedAt: now };
    data.users.push(user);
    return user;
  });
}

export async function findUser(sub: string): Promise<User | null> {
  const data = await readJson();
  return data.users.find((user) => user.sub === sub) ?? null;
}

export async function createPurchase(input: Omit<Purchase, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  return updateStore((data) => {
    const purchase: Purchase = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    data.purchases.unshift(purchase);
    return purchase;
  });
}

export async function findPurchaseByPaymentId(paymentId: string): Promise<Purchase | null> {
  const data = await readJson();
  return data.purchases.find((purchase) => purchase.coinpayPaymentId === paymentId) ?? null;
}

export async function listPurchasesForBuyer(buyerSub: string): Promise<Purchase[]> {
  const data = await readJson();
  return data.purchases
    .filter((purchase) => purchase.buyerSub === buyerSub)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findPurchaseBySessionId(sessionId: string): Promise<Purchase | null> {
  const data = await readJson();
  return data.purchases.find((purchase) => purchase.coinpaySessionId === sessionId) ?? null;
}

export async function setPurchaseSession(
  purchaseId: string,
  session: { id: string; url: string },
): Promise<Purchase | null> {
  const now = new Date().toISOString();
  return updateStore((data) => {
    const purchase = data.purchases.find((item) => item.id === purchaseId);
    if (!purchase) return null;
    purchase.coinpaySessionId = session.id;
    purchase.checkoutUrl = session.url;
    purchase.updatedAt = now;
    return purchase;
  });
}

const PAID: ReadonlyArray<Purchase['status']> = ['confirmed', 'forwarded'];

/**
 * Apply a CoinPay webhook to the matching purchase. Lookup: checkout session
 * id, then our purchase id from metadata, then the CoinPay payment id (older
 * purchases). Idempotent: a paid purchase is never downgraded, paidAt is set
 * once. When no row matches but the session metadata names the cookbook and
 * buyer (a paid session whose row is gone), a paid purchase is recorded from
 * the session fields so access is still granted, exactly once.
 */
export async function markPurchaseFromWebhook(params: {
  paymentId: string | null;
  sessionId?: string | null;
  purchaseId?: string | null;
  status: Purchase['status'];
  txHash?: string | null;
  recover?: { cookbookId: string; buyerSub: string; amountUsd: number; email?: string | null } | null;
}): Promise<{ purchase: Purchase | null; changed: boolean; created: boolean }> {
  const now = new Date().toISOString();
  return updateStore((data) => {
    const purchase =
      (params.sessionId && data.purchases.find((item) => item.coinpaySessionId === params.sessionId)) ||
      (params.purchaseId && data.purchases.find((item) => item.id === params.purchaseId)) ||
      (params.paymentId && data.purchases.find((item) => item.coinpayPaymentId === params.paymentId)) ||
      null;

    if (!purchase) {
      if (!PAID.includes(params.status) || !params.recover || !params.sessionId) {
        return { purchase: null, changed: false, created: false };
      }
      const created: Purchase = {
        id: params.purchaseId || randomUUID(),
        cookbookId: params.recover.cookbookId,
        buyerSub: params.recover.buyerSub,
        buyerEmail: params.recover.email ?? undefined,
        coinpayPaymentId: params.paymentId ?? '',
        coinpaySessionId: params.sessionId,
        amountUsd: params.recover.amountUsd,
        currency: 'USD',
        status: params.status,
        txHash: params.txHash ?? null,
        createdAt: now,
        updatedAt: now,
        paidAt: now,
      };
      data.purchases.unshift(created);
      return { purchase: created, changed: true, created: true };
    }

    const wasPaid = PAID.includes(purchase.status);
    if (params.paymentId && !purchase.coinpayPaymentId) purchase.coinpayPaymentId = params.paymentId;
    if (wasPaid && !PAID.includes(params.status)) {
      // A late expired/failed never takes back a paid purchase.
      return { purchase, changed: false, created: false };
    }
    const changed = purchase.status !== params.status;
    purchase.status = params.status;
    purchase.txHash = params.txHash ?? purchase.txHash ?? null;
    purchase.updatedAt = now;
    if (PAID.includes(params.status)) {
      purchase.paidAt = purchase.paidAt ?? now;
    }
    return { purchase, changed, created: false };
  });
}

export async function hasCookbookAccess(params: {
  cookbook: Cookbook;
  userSub?: string | null;
}): Promise<boolean> {
  if (params.cookbook.priceUsd <= 0) return true;
  if (!params.userSub) return false;
  if (params.cookbook.ownerSub === params.userSub) return true;
  const data = await readJson();
  return data.purchases.some(
    (purchase) =>
      purchase.cookbookId === params.cookbook.id &&
      purchase.buyerSub === params.userSub &&
      (purchase.status === 'confirmed' || purchase.status === 'forwarded'),
  );
}

export async function publicStats() {
  const data = await readJson();
  const published = data.cookbooks.filter((cookbook) => cookbook.isPublished);
  return {
    cookbooks: published.length,
    free: published.filter((cookbook) => cookbook.priceUsd <= 0).length,
    paid: published.filter((cookbook) => cookbook.priceUsd > 0).length,
    categories: new Set(published.flatMap((cookbook) => cookbook.categories)).size,
  };
}
