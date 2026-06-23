import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const LEADS_FILE = path.join(process.cwd(), 'data', 'feed_leads.json');

function readLeads(): any[] {
  if (!fs.existsSync(LEADS_FILE)) return [];
  try {
    const content = fs.readFileSync(LEADS_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const leads = readLeads();
    // Return newest leads first
    return NextResponse.json({ leads: leads.slice().reverse() });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, leads: [] });
  }
}

/**
 * PATCH /api/automation/leads
 * Body: { email: string, subject: string }
 * Marks all leads matching the email as emailed (sets emailedAt + emailedSubject).
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, subject, failed, error } = body;

    if (!email) {
      return NextResponse.json({ success: false, error: 'email is required' }, { status: 400 });
    }

    const leads = readLeads();
    let updated = 0;

    const now = new Date().toISOString();
    const patched = leads.map((lead: any) => {
      if (lead.email.toLowerCase() === email.toLowerCase()) {
        updated++;
        if (failed) {
          return {
            ...lead,
            outreachFailed: true,
            outreachError: error || 'Delivery failed',
            emailedAt: null,
            emailedSubject: null
          };
        } else {
          return {
            ...lead,
            emailedAt: now,
            emailedSubject: subject || '',
            outreachFailed: false,
            outreachError: null
          };
        }
      }
      return lead;
    });

    fs.writeFileSync(LEADS_FILE, JSON.stringify(patched, null, 2), 'utf-8');
    return NextResponse.json({ success: true, updated });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
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
