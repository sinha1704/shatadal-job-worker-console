import { NextRequest } from 'next/server';
import { automationManager } from '../manager';

export async function GET(req: NextRequest) {
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  // Helper to send a chunk formatted as SSE
  const sendLog = (message: string) => {
    try {
      const data = JSON.stringify({ message });
      writer.write(encoder.encode(`data: ${data}\n\n`));
    } catch (err) {
      console.error('[LogsStream] Error writing message:', err);
    }
  };

  // Register listener to streaming events
  automationManager.addListener(sendLog);

  // Send initial indicator status
  if (automationManager.isRunning()) {
    sendLog(`[System] Attached to active agent log stream...\n`);
  } else {
    sendLog(`[System] Connected to log stream. Agent is currently idle.\n`);
  }

  // Handle client disconnect / tab closure
  req.signal.addEventListener('abort', () => {
    console.log('[LogsStream] Client disconnected from log stream');
    automationManager.removeListener(sendLog);
    try {
      writer.close();
    } catch {}
  });

  return new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
