import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const LEADS_FILE = path.join(process.cwd(), 'data', 'feed_leads.json');

export async function GET() {
  try {
    if (!fs.existsSync(LEADS_FILE)) {
      return NextResponse.json({ leads: [] });
    }
    const content = fs.readFileSync(LEADS_FILE, 'utf-8');
    const leads = JSON.parse(content);
    // Return newest leads first
    return NextResponse.json({ leads: Array.isArray(leads) ? leads.reverse() : [] });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, leads: [] });
  }
}

export async function DELETE() {
  try {
    if (fs.existsSync(LEADS_FILE)) {
      fs.writeFileSync(LEADS_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
    return NextResponse.json({ success: true, message: 'Leads cleared successfully' });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
