import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { findCookbook, hasCookbookAccess } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function samplePdf(title: string) {
  return Buffer.from(
    `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 92>>stream
BT /F1 18 Tf 72 720 Td (${title.replace(/[()\\]/g, '')}) Tj 0 -32 Td (RecipePDFs.com sample cookbook PDF) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF
`,
    'utf8',
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookbook = await findCookbook(id);
  if (!cookbook || !cookbook.isPublished) {
    return NextResponse.json({ ok: false, error: 'Cookbook not found' }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!(await hasCookbookAccess({ cookbook, userSub: user?.sub }))) {
    return NextResponse.json({ ok: false, error: 'Purchase required' }, { status: 402 });
  }

  let body: Buffer;
  if (cookbook.pdfPath.startsWith('/uploads/')) {
    const absolutePath = path.join(process.cwd(), 'public', cookbook.pdfPath);
    body = await readFile(absolutePath);
  } else {
    body = samplePdf(cookbook.title);
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${cookbook.fileName.replace(/"/g, '')}"`,
    },
  });
}
