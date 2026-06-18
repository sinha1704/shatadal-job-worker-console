import "pdf-parse/worker";
import { NextResponse } from 'next/server';
import { writeFile, readFile, mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const isVercel = process.env.VERCEL === '1';
const REPO_DATA_DIR = path.join(process.cwd(), 'data');
const REPO_KB_PATH = path.join(REPO_DATA_DIR, 'knowledge.json');

const RUNTIME_DATA_DIR = isVercel ? '/tmp/data' : REPO_DATA_DIR;
const RUNTIME_KB_PATH = path.join(RUNTIME_DATA_DIR, 'knowledge.json');
const RUNTIME_IMAGES_DIR = path.join(RUNTIME_DATA_DIR, 'images');

// Lock runtime database directories & copy repository seed file if on Vercel
async function ensureRuntimeFiles() {
  if (!existsSync(RUNTIME_DATA_DIR)) {
    await mkdir(RUNTIME_DATA_DIR, { recursive: true });
  }
  if (!existsSync(RUNTIME_IMAGES_DIR)) {
    await mkdir(RUNTIME_IMAGES_DIR, { recursive: true });
  }
  if (isVercel && !existsSync(RUNTIME_KB_PATH) && existsSync(REPO_KB_PATH)) {
    try {
      await copyFile(REPO_KB_PATH, RUNTIME_KB_PATH);
    } catch (err) {
      console.error('Failed to copy seed knowledge database:', err);
    }
  }
}

const ALLOWED_TYPES: Record<string, string> = {
  '.txt': 'text',
  '.md': 'text',
  '.json': 'text',
  '.csv': 'text',
  '.pdf': 'pdf',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
};

// GET - list all knowledge entries (metadata only)
export async function GET() {
  try {
    await ensureRuntimeFiles();
    if (!existsSync(RUNTIME_KB_PATH)) return NextResponse.json({ entries: [] });
    const raw = await readFile(RUNTIME_KB_PATH, 'utf-8');
    const kb = JSON.parse(raw);
    const entries = (kb.entries || []).map(({ id, filename, uploadedAt, size, charCount, type, imageUrl }: any) => ({
      id, filename, uploadedAt, size, charCount, type, imageUrl
    }));
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}

// POST - upload and process file
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const ext = path.extname(file.name).toLowerCase();
    const fileType = ALLOWED_TYPES[ext];
    if (!fileType) {
      return NextResponse.json(
        { error: `Unsupported type "${ext}". Allowed: ${Object.keys(ALLOWED_TYPES).join(', ')}` },
        { status: 400 }
      );
    }

    const MAX_SIZE = fileType === 'image' ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `File too large (max ${MAX_SIZE / 1024 / 1024}MB for ${fileType})` }, { status: 400 });
    }

    await ensureRuntimeFiles();

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let content = '';
    let imageUrl: string | undefined;

    // ---- TEXT FILES ----
    if (fileType === 'text') {
      content = buffer.toString('utf-8').substring(0, 25000);
    }

    // ---- PDF FILES ----
    if (fileType === 'pdf') {
      try {
        const pdfModule = await import('pdf-parse') as any;
        const PDFParseClass = pdfModule.PDFParse;
        
        if (typeof PDFParseClass !== 'function') {
          throw new Error('PDFParse export is not a function');
        }
        
        const parser = new PDFParseClass({ data: buffer });
        const parsed = await parser.getText();
        await parser.destroy();
        
        content = parsed.text.substring(0, 25000);
        if (!content.trim()) content = '[PDF had no extractable text content]';
      } catch (err: any) {
        console.error('PDF parse error:', err);
        content = `[PDF upload failed to parse: ${err.message}]`;
      }
    }

    // ---- IMAGE FILES ----
    if (fileType === 'image') {
      const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const imagePath = path.join(RUNTIME_IMAGES_DIR, safeName);
      await writeFile(imagePath, buffer);
      imageUrl = `/api/image/${safeName}`;

      const apiKey = process.env.GROQ_API_KEY;
      if (apiKey) {
        try {
          const base64 = buffer.toString('base64');
          const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'meta-llama/llama-4-scout-17b-16e-instruct',
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: 'Describe this image in detail. Include all visible text, objects, diagrams, charts, data, and any other relevant information. Be comprehensive.' },
                  { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
                ]
              }],
              max_tokens: 1024,
            }),
          });
          if (groqRes.ok) {
            const groqData = await groqRes.json();
            content = `[Image: ${file.name}]\nVisual Description:\n${groqData.choices?.[0]?.message?.content || 'Could not analyze image.'}`;
          } else {
            content = `[Image uploaded: ${file.name}. Could not auto-analyze — Groq vision returned ${groqRes.status}]`;
          }
        } catch (e: any) {
          content = `[Image uploaded: ${file.name}. Vision analysis failed: ${e.message}]`;
        }
      } else {
        content = `[Image uploaded: ${file.name}. Add GROQ_API_KEY to enable vision analysis.]`;
      }
    }

    // Load or init knowledge base
    let kb: { entries: any[] } = { entries: [] };
    if (existsSync(RUNTIME_KB_PATH)) {
      const raw = await readFile(RUNTIME_KB_PATH, 'utf-8');
      kb = JSON.parse(raw);
    }

    // Replace duplicate filenames
    kb.entries = kb.entries.filter((e: any) => e.filename !== file.name);

    const entry = {
      id: Date.now().toString(),
      filename: file.name,
      type: fileType,
      content,
      imageUrl,
      uploadedAt: new Date().toISOString(),
      size: file.size,
      charCount: content.length,
    };

    kb.entries.push(entry);
    await writeFile(RUNTIME_KB_PATH, JSON.stringify(kb, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      entry: { id: entry.id, filename: entry.filename, type: entry.type, uploadedAt: entry.uploadedAt, size: entry.size, charCount: entry.charCount, imageUrl: entry.imageUrl },
    });

  } catch (err: any) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE - remove entry by id
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    await ensureRuntimeFiles();
    if (!existsSync(RUNTIME_KB_PATH)) return NextResponse.json({ error: 'No KB' }, { status: 404 });
    const raw = await readFile(RUNTIME_KB_PATH, 'utf-8');
    const kb = JSON.parse(raw);
    kb.entries = kb.entries.filter((e: any) => e.id !== id);
    await writeFile(RUNTIME_KB_PATH, JSON.stringify(kb, null, 2), 'utf-8');
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
