import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  
  // Sanitize filename to prevent directory traversal
  const safe = path.basename(filename);
  const isVercel = process.env.VERCEL === '1';
  const filePath = isVercel
    ? path.join('/tmp/data/images', safe)
    : path.join(process.cwd(), 'data', 'images', safe);
  
  if (!existsSync(filePath)) {
    return new NextResponse('Not found', { status: 404 });
  }
  
  const buffer = await readFile(filePath);
  const ext = path.extname(safe).toLowerCase();
  const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  
  return new NextResponse(buffer, {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000' },
  });
}
