import { NextResponse } from 'next/server';
import { automationManager } from '../manager';

export async function POST(request: Request) {
  try {
    if (process.env.VERCEL) {
      return NextResponse.json(
        {
          success: false,
          message: 'Automation agent cannot run on Vercel. Browser automation requires a local Chrome browser and active user session. Please run this dashboard locally at http://localhost:3000 to start the agent.'
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
