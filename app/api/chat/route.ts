import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const isVercel = process.env.VERCEL === '1';
const REPO_KB_PATH = path.join(process.cwd(), 'data', 'knowledge.json');
const TMP_KB_PATH = '/tmp/data/knowledge.json';

async function loadKnowledgeContext(): Promise<string> {
  try {
    let activePath = REPO_KB_PATH;
    if (isVercel && existsSync(TMP_KB_PATH)) {
      activePath = TMP_KB_PATH;
    }
    if (!existsSync(activePath)) return '';
    const raw = await readFile(activePath, 'utf-8');
    const kb = JSON.parse(raw);
    if (!kb.entries || kb.entries.length === 0) return '';
    // Combine all entries, cap at 8000 chars total to save tokens
    const combined = kb.entries
      .map((e: any) => `=== Uploaded File: ${e.filename} ===\n${e.content}`)
      .join('\n\n');
    return `\n\n---\nKNOWLEDGE BASE (from user-uploaded files):\n${combined.substring(0, 8000)}\n---`;
  } catch {
    return '';
  }
}

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { message, history = [] } = body;
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Map frontend history ('ai' role) to Groq format ('assistant' role)
    type GroqRole = 'user' | 'assistant' | 'system';
    const historyMessages: { role: GroqRole; content: string }[] = history
      .filter((m: { role: string; content: string }) => m.role === 'user' || m.role === 'ai')
      .map((m: { role: string; content: string }) => ({
        role: (m.role === 'ai' ? 'assistant' : 'user') as GroqRole,
        content: m.content,
      }));

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn("GROQ_API_KEY is missing from .env");
      return NextResponse.json({
        reply: getLocalFallbackResponse(message),
        isFallback: true,
        errorDetails: "GROQ_API_KEY not set in .env file"
      });
    }

    try {
      const groq = new Groq({ apiKey });
      const knowledgeContext = await loadKnowledgeContext();

      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are Shatadal Personal Assistant, a highly professional, intelligent, and refined personal AI assistant. You remember the conversation history, refer back to previous user queries when appropriate, and keep your responses clear, structured, and insightful.

CRITICAL INSTRUCTION: Do NOT ever mention the names of source files, database entries, or file paths (such as "profile_metadata.json" or "Shatadal_Sundar_Sinha_Resume_SeniorFrontEnd_Updated.pdf") in your responses. Present the information naturally as if you simply know it about Shatadal. Never say "according to the uploaded file", "in the pdf", or refer to files by name.

If the user asks about documents or files they have uploaded, look for them in the knowledge base context below. If any file shows a processing error (e.g., "[PDF upload failed to parse..."), explain to the user professionally that the file had a technical issue during upload and ask them to re-upload it.

${knowledgeContext}`
          },
          // Inject prior conversation history (max last 20 turns to stay within token limits)
          ...historyMessages.slice(-20),
          {
            role: 'user',
            content: message,
          }
        ],
        model: 'llama-3.1-8b-instant',
        max_tokens: 512,
        temperature: 0.7,
      });

      const reply = completion.choices[0]?.message?.content?.trim() || "I'm not sure how to respond to that.";
      return NextResponse.json({ reply });

    } catch (aiError: any) {
      console.error("Groq API Error:", aiError);
      return NextResponse.json({
        reply: getLocalFallbackResponse(message),
        isFallback: true,
        errorDetails: aiError.message || "Groq API request failed"
      });
    }

  } catch (error: any) {
    console.error("General API Route Error:", error);
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error.message 
    }, { status: 500 });
  }
}

function getLocalFallbackResponse(message: string): string {
  const msg = message.toLowerCase();
  const isVercelEnv = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const configLocation = isVercelEnv ? "Vercel Environment Variables Dashboard" : ".env file";
  
  if (msg.includes("shatadal")) {
    return "Shatadal Sundar Sinha is a professional Full-Stack Developer with 4+ years of experience building high-performance web applications across SaaS, EdTech, and PropTech domains. He specializes in React.js, Next.js, TypeScript, Angular, and Node.js. He is currently working as a Lead Front-End Developer, building CRM portals, AI-Powered resume builders, and payment integrations.";
  }
  if (msg.includes("expertise") || msg.includes("what do i do") || msg.includes("what i do") || msg.includes("background")) {
    return "You are a Full-Stack Developer specializing in: \n- Front-End: React.js, Next.js, Angular, TypeScript, Material UI, Ant Design, Bootstrap, Tailwind CSS.\n- Back-End: Node.js, Express.js, EJS, REST API Design & Integration.\n- Database: MongoDB & Mongoose.\n- Payment Gateways: Razorpay, Cashfree, Instamojo.\n- AI Workflow: Experience leveraging AI tools and integrating AI model backends.";
  }
  if (msg.includes("antigravity")) {
    return "The secret behind antigravity lies in manipulating the space-time metric or utilizing exotic matter with negative mass. Currently, it remains a concept of theoretical physics and science fiction!";
  }
  if (msg.includes("poem") || msg.includes("poetry") || msg.includes("universe")) {
    return "A cosmic dancer in the night,\nFloating free from gravity's might.\nStars align and spirits soar,\nBound to earthly ground no more.";
  }
  if (msg.includes("next.js") || msg.includes("nextjs") || msg.includes("router")) {
    return "Next.js App Router uses folders to define routes. An API route is placed in a route.ts file within an app/api/ subdirectory.";
  }
  if (msg.includes("startup") || msg.includes("pitch") || msg.includes("business") || msg.includes("idea")) {
    return "Here is a quick startup idea: A glassmorphic personal assistant platform that integrates multiple local models to work completely offline, guaranteeing data privacy!";
  }
  if (msg.includes("hello") || msg.includes("hi") || msg.includes("hey")) {
    return `Hello! I am Shatadal's Personal Assistant. Please configure your GROQ_API_KEY in the ${configLocation} to unlock my full AI capability!`;
  }
  
  return `I'm in offline fallback mode. Please configure your GROQ_API_KEY in the ${configLocation} to enable full AI responses!`;
}
