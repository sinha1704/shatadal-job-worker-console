import { NextResponse } from 'next/server';
import { automationManager } from '../manager';

export async function GET() {
  return NextResponse.json({ isRunning: automationManager.isRunning() });
}
