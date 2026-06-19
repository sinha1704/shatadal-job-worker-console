import { NextResponse } from 'next/server';
import { automationManager } from '../manager';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const portals = body.portals || [];
    const success = automationManager.start(portals);
    return NextResponse.json({ success, message: success ? 'Automation started' : 'Automation already running' });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 400 });
  }
}
