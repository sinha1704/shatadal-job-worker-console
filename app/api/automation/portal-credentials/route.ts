import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const configDir = path.join(process.cwd(), 'data');
const configFile = path.join(configDir, 'portal_credentials.json');

// Ensure data folder exists
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

function loadConfig() {
  if (fs.existsSync(configFile)) {
    try {
      const content = fs.readFileSync(configFile, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse portal credentials config:', e);
    }
  }
  return {
    linkedinEmail: '',
    linkedinPassword: '',
    indeedEmail: '',
    indeedPassword: '',
    naukriEmail: '',
    naukriPassword: '',
    instahyreEmail: '',
    instahyrePassword: ''
  };
}

function saveConfig(config: any) {
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const config = loadConfig();
    
    // Mask passwords for safety in UI
    const safeConfig = {
      linkedinEmail: config.linkedinEmail || '',
      linkedinPassword: config.linkedinPassword ? '••••••••' : '',
      indeedEmail: config.indeedEmail || '',
      indeedPassword: config.indeedPassword ? '••••••••' : '',
      naukriEmail: config.naukriEmail || '',
      naukriPassword: config.naukriPassword ? '••••••••' : '',
      instahyreEmail: config.instahyreEmail || '',
      instahyrePassword: config.instahyrePassword ? '••••••••' : ''
    };
    
    return NextResponse.json(safeConfig);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const existing = loadConfig();

    let linkedinPassword = body.linkedinPassword || '';
    if (linkedinPassword === '••••••••' || !linkedinPassword) {
      linkedinPassword = existing.linkedinPassword || '';
    }

    let indeedPassword = body.indeedPassword || '';
    if (indeedPassword === '••••••••' || !indeedPassword) {
      indeedPassword = existing.indeedPassword || '';
    }

    let naukriPassword = body.naukriPassword || '';
    if (naukriPassword === '••••••••' || !naukriPassword) {
      naukriPassword = existing.naukriPassword || '';
    }

    let instahyrePassword = body.instahyrePassword || '';
    if (instahyrePassword === '••••••••' || !instahyrePassword) {
      instahyrePassword = existing.instahyrePassword || '';
    }

    const updatedConfig = {
      linkedinEmail: body.linkedinEmail || '',
      linkedinPassword,
      indeedEmail: body.indeedEmail || '',
      indeedPassword,
      naukriEmail: body.naukriEmail || '',
      naukriPassword,
      instahyreEmail: body.instahyreEmail || '',
      instahyrePassword
    };

    saveConfig(updatedConfig);
    return NextResponse.json({ success: true, message: 'Portal credentials saved successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
