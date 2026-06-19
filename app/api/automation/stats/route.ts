import { NextResponse } from 'next/server';
import { loadStats, saveStats } from '../manager';

export async function GET() {
  const stats = loadStats();
  return NextResponse.json(stats);
}

export async function DELETE() {
  const emptyStats = {
    currentSession: null,
    sessions: [],
    dailyStats: {}
  };
  saveStats(emptyStats);
  return NextResponse.json({ success: true, message: 'Stats history cleared successfully' });
}
