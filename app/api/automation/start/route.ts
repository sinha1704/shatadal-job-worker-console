import { NextResponse } from 'next/server';
import { automationManager } from '../manager';

export async function POST(request: Request) {
  try {
    if (process.env.VERCEL) {
      return NextResponse.json(
        {
          success: false,
          message: 'Automation execution cannot be run directly on the cloud server. The execution core requires local browser synchronization. Please launch the execution node locally on your host device to initiate automation.'
        },
        { status: 400 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const portals = body.portals || [];
    const success = automationManager.start(portals);
    return NextResponse.json({ success, message: success ? 'Automation started' : 'Automation already running' });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 400 });
  }
}
