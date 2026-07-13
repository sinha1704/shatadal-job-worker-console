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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const status = searchParams.get('status') || 'all'; // 'all' | 'emailed' | 'pending' | 'failed'
    const leads = readLeads();

    // Compute aggregate counts across ALL leads first
    let totalEmailed = 0;
    let totalPending = 0;
    let totalFailed = 0;
    for (const lead of leads) {
      if (lead.outreachFailed) totalFailed++;
      else if (lead.emailedAt) totalEmailed++;
      else totalPending++;
    }

    // Apply status filter BEFORE pagination
    const reversed = leads.slice().reverse();
    const filtered = status === 'all' ? reversed
      : status === 'emailed' ? reversed.filter((l: any) => !!l.emailedAt && !l.outreachFailed)
      : status === 'pending' ? reversed.filter((l: any) => !l.emailedAt && !l.outreachFailed)
      : status === 'failed'  ? reversed.filter((l: any) => !!l.outreachFailed)
      : reversed;

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    return NextResponse.json({
      leads: paginated,
      total,
      page,
      totalPages,
      limit,
      status,
      summary: { totalEmailed, totalPending, totalFailed }
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, leads: [], total: 0, page: 1, totalPages: 1, limit: 50, status: 'all', summary: { totalEmailed: 0, totalPending: 0, totalFailed: 0 } });
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

/**
 * PUT /api/automation/leads
 * Body: { action: 'repair-pending' }
 * 
 * DB Repair: marks ALL stuck "pending" leads (no emailedAt, no outreachFailed) as emailed.
 * Use this when the automation was interrupted mid-send and emails were sent but never persisted.
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action !== 'repair-pending') {
      return NextResponse.json({ success: false, error: 'Unknown action. Use action: "repair-pending"' }, { status: 400 });
    }

    const leads = readLeads();
    const now = new Date().toISOString();
    let repairedCount = 0;

    const repaired = leads.map((lead: any) => {
      // A lead is "stuck pending" if it has no emailedAt and is not marked as failed
      if (!lead.emailedAt && !lead.outreachFailed) {
        repairedCount++;
        return {
          ...lead,
          emailedAt: now,
          emailedSubject: lead.emailedSubject || '(Repaired - sent before crash)',
          outreachFailed: false,
          outreachError: null
        };
      }
      return lead;
    });

    fs.writeFileSync(LEADS_FILE, JSON.stringify(repaired, null, 2), 'utf-8');
    return NextResponse.json({
      success: true,
      repairedCount,
      message: `Repaired ${repairedCount} stuck pending leads — marked as emailed.`
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
