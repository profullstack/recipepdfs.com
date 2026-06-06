import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { CATEGORIES } from '@/lib/categories';
import { imageForIndex } from '@/lib/assets';
import { slugify } from '@/lib/format';
import { getCurrentUser } from '@/lib/session';
import { createCookbook } from '@/lib/store';
import type { CategorySlug } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uploadDir = path.join(process.cwd(), 'public', 'uploads');
const validCategorySlugs = new Set<string>(CATEGORIES.map((category) => category.slug));

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/api/coinpay/connect?next=/upload', req.url), 302);

  const form = await req.formData();
  const file = form.get('pdf');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: 'PDF file is required' }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    return NextResponse.json({ ok: false, error: 'Only PDF uploads are supported' }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'PDF must be 25 MB or smaller' }, { status: 400 });
  }

  const title = text(form, 'title');
  const description = text(form, 'description');
  const priceUsd = Number.parseFloat(text(form, 'priceUsd') || '0');
  const rightsConfirmed = text(form, 'rightsConfirmed') === '1';
  if (!title || !description || !Number.isFinite(priceUsd) || priceUsd < 0 || priceUsd > 100) {
    return NextResponse.json({ ok: false, error: 'Invalid cookbook details' }, { status: 400 });
  }
  if (!rightsConfirmed) {
    return NextResponse.json({ ok: false, error: 'Rights confirmation is required' }, { status: 400 });
  }

  const categories: CategorySlug[] = [];
  for (const value of form.getAll('categories')) {
    if (typeof value === 'string' && validCategorySlugs.has(value)) {
      categories.push(value as CategorySlug);
    }
  }
  if (!categories.length) categories.push('weeknight');

  await mkdir(uploadDir, { recursive: true });
  const id = randomUUID();
  const safeName = `${id}-${slugify(file.name.replace(/\.pdf$/i, '')) || 'cookbook'}.pdf`;
  const absolutePath = path.join(uploadDir, safeName);
  await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));

  const cookbook = await createCookbook({
    title,
    slug: slugify(title) || id,
    description,
    categories,
    priceUsd,
    isPublished: true,
    ownerSub: user.sub,
    ownerName: user.name || user.email || user.sub,
    pdfPath: `/uploads/${safeName}`,
    fileName: file.name,
    coverImage: imageForIndex(Date.now()),
    sourceCreator: text(form, 'sourceCreator') || undefined,
    sourceUrl: text(form, 'sourceUrl') || undefined,
    acknowledgement: text(form, 'acknowledgement') || undefined,
    rightsConfirmed,
    aiRewriteRequested: text(form, 'aiRewriteRequested') === '1',
    rewriteStatus: text(form, 'aiRewriteRequested') === '1' ? 'queued' : 'not_requested',
  });

  return NextResponse.redirect(new URL(`/cookbooks/${cookbook.slug}`, req.url), 302);
}
