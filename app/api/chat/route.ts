import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const isVercel = process.env.VERCEL === '1';
const REPO_KB_PATH = path.join(process.cwd(), 'data', 'knowledge.json');
const TMP_KB_PATH = '/tmp/data/knowledge.json';

const SHATADAL_PROFILE = `
Candidate Name: Shatadal Sundar Sinha
Title: Senior Front-End Developer / UI Engineer
Email: shatadal17@gmail.com
Phone Numbers: +91 70636 44658, +91 93824 68250
Location: Kolkata, West Bengal, India
Personal Portfolio & AI Agent: shatadalpersonalassistent.vercel.app

PROFESSIONAL SUMMARY:
Senior Front-End Developer with approximately 5 years of experience building high-performance web applications across SaaS, EdTech, and PropTech domains. Specializes in React.js, Next.js, and TypeScript on the front end, with additional experience in Angular for component-driven UI development. Hands-on backend experience in Node.js, Express.js, EJS, and MongoDB, with a growing focus on designing and deploying autonomous AI agents (including browser-automation and chatbot agents). Proven track record of leading product development, integrating payment gateways (Razorpay, Cashfree, Instamojo), designing REST APIs, and optimizing web performance.

WORK EXPERIENCE:
1. Senior Front-End Developer | Webskitters Technology Solutions Pvt. Ltd. (Kolkata, India) | Aug 2024 – Present
   - WebSkitters Academy (Student CRM Portal - In-house Product Front-End Lead): Led frontend development from scratch using Next.js, TypeScript, and Material UI. Integrated Razorpay, Cashfree, and Instamojo. Achieved sub-2s LCP.
   - Qpulse AI-Powered Resume Builder: Built AI-driven builder and admin dashboard using Next.js, TypeScript, Node.js REST APIs. Integrated AI models and real-time career chatbot.
   - AI Job-Application Automation Agent: Designed and built an autonomous browser-automation agent using Playwright/TypeScript to automate job applications.
   - Personal AI Agent (Shatadal Personal Assistant): Designed, built and deployed shatadalpersonalassistent.vercel.app end-to-end.
   - CSA Media Solutions Chatbot: Built and deployed lightweight customer support AI chatbot agent.

2. Front-End Developer | Ebrotech Software Solutions Pvt. Ltd. (Ghaziabad, India) | Jun 2023 – Aug 2024
   - Tenant Management System: Built React.js + Ant Design UI for rental tracker with MongoDB-backed REST APIs.
   - Visitor Management Platform: Built type-safe visitor scheduler using React.js, TypeScript, Node.js, and EJS.
   - Entra Office App: Built office meeting room booking and admin dashboards. Implemented select Angular-based modules.

3. Front-End Developer | Brenolabs Pvt. Ltd. (Bengaluru, India) | Jul 2022 – May 2023
   - Doctor Appointment System: Responsive scheduler using React.js, Bootstrap, and Tailwind CSS.
   - School Management System: HTML5, CSS3, JS, Node.js + MongoDB backend.

4. Front-End Developer Intern | Brenolabs Pvt. Ltd. (Bengaluru, India) | Sep 2021 – Feb 2022
   - E-commerce Platform: Built frontend utilizing React.js, TypeScript, HTML5, CSS3, and Bootstrap. Assisted in Node.js/Express + MongoDB.

TECHNICAL SKILLS:
- Front-End: React.js, Next.js, Angular, TypeScript, JavaScript (ES6+), HTML5, CSS3
- Back-End: Node.js, Express.js, EJS, REST API Design & Integration
- AI Agents & Tooling: Designing & deploying autonomous AI agents (browser-automation job-apply agent, conversational assistant, business chatbot); live demo: shatadalpersonalassistent.vercel.app
- Database: MongoDB, Mongoose
- State Management: Redux, Context API, React Query
- UI Libraries: Material UI (MUI), Ant Design, Tailwind CSS, SASS/SCSS, Bootstrap
- Payment Gateways: Razorpay, Cashfree, Instamojo
- Tools & Workflow: Git/GitHub, VS Code, Figma, Performance Optimisation, Agile / Scrum
- AI Dev Tools: Claude AI, Amazon Q, GLM AI, Antigravity AI
- Soft Skills: Front-End Leadership, Cross-functional Collaboration, Clean Code Practices

EDUCATION:
- B.Tech in Computer Science & Engineering | MAKAUT | 2018 – 2022 | CGPA: 8.57 / 10
`;

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
    return `\n\n---\nADDITIONAL KNOWLEDGE CONTEXT (from uploaded files):\n${combined.substring(0, 8000)}\n---`;
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

Here is Shatadal's detailed professional background (resume profile):
${SHATADAL_PROFILE}

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
    return "Shatadal Sundar Sinha is a Senior Front-End Developer & UI Engineer with approximately 5 years of experience specializing in React.js, Next.js, and TypeScript. He has built high-performance web applications across SaaS, EdTech, and PropTech domains, and has worked with Webskitters, Ebrotech, and Brenolabs. He also specializes in building autonomous AI agents and browser automation.";
  }
  if (msg.includes("experience") || msg.includes("work") || msg.includes("company") || msg.includes("history")) {
    return "Shatadal's work experience includes:\n" +
      "- Senior Front-End Developer at Webskitters Technology Solutions Pvt. Ltd. (Aug 2024 - Present), leading the WebSkitters Academy CRM portal, building Qpulse AI Resume Builder, and developing autonomous AI job-application agents.\n" +
      "- Front-End Developer at Ebrotech Software Solutions Pvt. Ltd. (Jun 2023 - Aug 2024), building Tenant/Visitor Management Systems and Entra Office App dashboards with Angular and React.\n" +
      "- Front-End Developer & Intern at Brenolabs Pvt. Ltd. (Sep 2021 - May 2023), building doctor appointment schedulers, school management platforms, and e-commerce frontends.";
  }
  if (msg.includes("expertise") || msg.includes("skills") || msg.includes("technology") || msg.includes("stack") || msg.includes("what do i do") || msg.includes("what i do") || msg.includes("background")) {
    return "Shatadal's core technical expertise includes:\n" +
      "- Front-End: React.js, Next.js, Angular, TypeScript, JavaScript (ES6+), HTML5, CSS3\n" +
      "- Back-End: Node.js, Express.js, EJS, REST API Design & Integration\n" +
      "- Databases: MongoDB, Mongoose\n" +
      "- State Management: Redux, Context API, React Query\n" +
      "- UI Frameworks: Material UI (MUI), Ant Design, Tailwind CSS, Bootstrap, SASS/SCSS\n" +
      "- Payment Integrations: Razorpay, Cashfree, Instamojo\n" +
      "- AI Agents: Designing & deploying autonomous browser-automation, RAG, and conversational agents (Playwright, Groq, Claude AI, OpenAI)";
  }
  if (msg.includes("education") || msg.includes("b.tech") || msg.includes("college") || msg.includes("university")) {
    return "Shatadal holds a B.Tech in Computer Science & Engineering from Maulana Abul Kalam Azad University of Technology (MAKAUT), West Bengal, graduating in 2022 with a CGPA of 8.57/10.";
  }
  if (msg.includes("salary") || msg.includes("expectation") || msg.includes("ctc")) {
    return "Shatadal's current salary is 6 LPA, and his expected salary range is 10 LPA to 14 LPA (depending on company budget and job requirements).";
  }
  if (msg.includes("notice") || msg.includes("joining")) {
    return "Shatadal is an immediate joiner (0 days notice period) and is available to start immediately.";
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
