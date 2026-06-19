import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const configDir = path.join(process.cwd(), 'data');
const configFile = path.join(configDir, 'email_config.json');

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
      console.error('Failed to parse email config:', e);
    }
  }
  return {
    preset: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    username: '',
    password: '',
    senderName: 'Shatadal Sundar Sinha',
    senderEmail: ''
  };
}

function saveConfig(config: any) {
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const config = loadConfig();
    
    // Hide password for security, return a boolean flag indicating if password exists
    const safeConfig = {
      ...config,
      hasPassword: !!config.password,
      password: config.password ? '••••••••' : ''
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

    const preset = body.preset || 'gmail';
    const host = body.host || 'smtp.gmail.com';
    const port = parseInt(body.port) || 465;
    const secure = body.secure === undefined ? true : !!body.secure;
    const username = body.username || '';
    const senderName = body.senderName || 'Shatadal Sundar Sinha';
    const senderEmail = body.senderEmail || '';
    
    let password = body.password || '';
    
    // If password is the masked placeholder, preserve existing password
    if (password === '••••••••' || !password) {
      password = existing.password || '';
    }

    const updatedConfig = {
      preset,
      host,
      port,
      secure,
      username,
      password,
      senderName,
      senderEmail
    };

    saveConfig(updatedConfig);
    return NextResponse.json({ success: true, message: 'SMTP Configuration saved successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
