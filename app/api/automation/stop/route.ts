import { NextResponse } from 'next/server';
import { automationManager } from '../manager';

export async function POST() {
  const success = automationManager.stop();
  return NextResponse.json({ success, message: success ? 'Automation stopped' : 'Automation not running' });
}
