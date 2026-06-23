import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import Groq from 'groq-sdk';
import nodemailer from 'nodemailer';
import { getGraphicOutreachTemplate } from './app/utils/emailTemplates';

// Apply the stealth plugin to hide automation indicators
chromium.use(stealthPlugin());

// Config parameters (update these values as needed)
const CHROME_USER_DATA_DIR = 'C:\\Users\\shata\\automation-profile';
const CHROME_PROFILE_NAME = 'Default';
const CHROME_EXECUTABLE_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// Search keyword pool (selected randomly on each execution run)
const SEARCH_KEYWORDS = [
  'Frontend Developer',
  'Senior Frontend Developer',
  'React Developer',
  'Next.js Developer',
  'Full Stack Developer'
];

function getRandomSearchKeyword(): string {
  const idx = Math.floor(Math.random() * SEARCH_KEYWORDS.length);
  return SEARCH_KEYWORDS[idx];
}

// Standard human-like delay helper
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const randomDelay = async (min = 400, max = 1000) => {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  console.log(`[Human Delay] Waiting for ${(ms / 1000).toFixed(1)} seconds...`);
  await delay(ms);
};


// Global state to track main pages that should never be closed by scavenger
const globalMainPages = new Set<any>();

// Helper to prune zombied or leaked extra tabs/pages in browser context
async function closeExtraTabs(context: any, allowedActivePages: any[] = []) {
  try {
    const pages = context.pages();
    for (const p of pages) {
      if (!globalMainPages.has(p) && !allowedActivePages.includes(p) && !p.isClosed()) {
        console.log(`[Safety Guard] Closing leaked/extra tab: ${p.url()}`);
        await p.close().catch(() => {});
      }
    }
  } catch (err: any) {
    console.warn(`[Safety Guard] Error closing extra tabs: ${err.message}`);
  }
}

// Global state to track salary range of current job
let currentJobSalaryRange: { min: number; max: number } | null = null;


// Parse salary range from job title/description
function detectSalaryRange(text: string): { min: number; max: number } | null {
  if (!text) return null;
  
  // Clean string (remove commas, soft hyphens, zero-width chars)
  const cleanText = text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/,/g, '');

  // 1. Matches formats like: 12-18 LPA, 15 to 25 Lakhs, 10 - 15 Lacs
  const lpaRegex = /(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(lpa|lakh|lac|l\.?p\.?a\.?)/i;
  const lpaMatch = cleanText.match(lpaRegex);
  if (lpaMatch) {
    const min = parseFloat(lpaMatch[1]);
    const max = parseFloat(lpaMatch[2]);
    if (min > 0 && max > min && max < 150) {
      return { min, max };
    }
  }

  // 2. Matches absolute values: 1200000 - 1800000, 1500000 to 2500000
  const absoluteRegex = /(\d{6,7})\s*(?:-|to)\s*(\d{6,7})/i;
  const absMatch = cleanText.match(absoluteRegex);
  if (absMatch) {
    const min = parseFloat(absMatch[1]) / 100000;
    const max = parseFloat(absMatch[2]) / 100000;
    if (min > 0 && max > min && max < 150) {
      return { min, max };
    }
  }

  // 3. Matches currency values: ₹1,200,000 - ₹1,800,000
  const currencyRegex = /(?:₹|rs\.?)\s*(\d+(?:\.\d+)?)\s*(?:-|to)\s*(?:₹|rs\.?)\s*(\d+(?:\.\d+)?)/i;
  const currMatch = cleanText.match(currencyRegex);
  if (currMatch) {
    let minVal = parseFloat(currMatch[1]);
    let maxVal = parseFloat(currMatch[2]);
    if (minVal >= 100000) {
      minVal /= 100000;
      maxVal /= 100000;
    }
    if (minVal > 0 && maxVal > minVal && maxVal < 150) {
      return { min: minVal, max: maxVal };
    }
  }

  return null;
}

// Calculate dynamic expected salary and format it as Lakhs/LPA vs full numeric
function getExpectedSalaryValue(labelText: string): string {
  let expectedLPA = 10; // default 10 LPA (minimum expected)
  if (currentJobSalaryRange) {
    const { min, max } = currentJobSalaryRange;
    if (max > 14) {
      // Company budget exceeds our ceiling (14 LPA) — ask for more than 14
      // Use midpoint of their range but cap at reasonable ask (max - 10%)
      expectedLPA = Math.max(14, Math.round(min + (max - min) * 0.6));
      console.log(`[AI Match Engine] Detected company salary range: ${min}L - ${max}L (> 14L ceiling). Adjusting expected salary to ${expectedLPA} LPA.`);
    } else if (max >= 10) {
      // Company budget fits our range — ask for 10-14
      expectedLPA = Math.min(14, Math.max(10, Math.round(max * 0.9)));
      console.log(`[AI Match Engine] Detected company salary range: ${min}L - ${max}L. Setting expected salary to ${expectedLPA} LPA.`);
    }
  }

  const isLPA = labelText.includes('lpa') || labelText.includes('lakh') || labelText.includes('in lakhs') || labelText.includes('in lacs') || labelText.includes('per annum') || labelText.includes('yearly (in l)');
  if (isLPA) {
    return expectedLPA.toString();
  } else {
    return (expectedLPA * 100000).toString();
  }
}

// Format current salary (default 6 LPA)
function getCurrentSalaryValue(labelText: string): string {
  const currentLPA = 6; // default 6 LPA
  const isLPA = labelText.includes('lpa') || labelText.includes('lakh') || labelText.includes('in lakhs') || labelText.includes('in lacs') || labelText.includes('per annum') || labelText.includes('yearly (in l)');
  if (isLPA) {
    return currentLPA.toString();
  } else {
    return (currentLPA * 100000).toString();
  }
}

// Helper to parse the local .env file
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach((line) => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      }
    });
  }
}

let groqInstance: Groq | null = null;

function getGroqClient() {
  if (groqInstance) return groqInstance;
  loadEnv();
  const apiKey = process.env.GROQ_API_KEY;
  if (apiKey) {
    groqInstance = new Groq({ apiKey });
  }
  return groqInstance;
}

// Dynamically answer application questions or choose dropdown options using Llama 3 via Groq
async function askAI(labelText: string, fieldType: 'input' | 'select' | 'textarea', optionsList: string[] = []): Promise<string> {
  const client = getGroqClient();
  if (!client) {
    console.warn('[AI Solver] Groq client not initialized (missing API key). Using fallback.');
    return '';
  }

  const profileSummary = `
Candidate Name: Shatadal Sundar Sinha
Email: shatadal17@gmail.com
Phone Number: +91 70636 44658, +91 93824 68250 (from West Bengal/Kolkata area)
Address: Kolkata, West Bengal, 700017, India
LinkedIn: https://www.linkedin.com/in/shatadal-sundar-sinha-96b27b239/
Portfolio: https://shatadalpersonalassistent.vercel.app/
Role: Senior Frontend Developer / Senior UI Developer / UI Engineer
Current Company: Webskitters Technology Solutions Pvt. Ltd.
Current Job Title: Senior Frontend Developer
Experience: 5 years (specializing in React, Next.js, TypeScript, JavaScript, HTML, CSS, Responsive Web Design, and Angular)
Notice Period: Immediate Joiner (0 days notice period)
Interview Availability: Available at any time for job interviews during standard business/office hours. A 1-hour advance notice is preferred but not mandatory. If asked to choose, select/input any slot.
Projects: 
1. WebSkitters Academy: Led Next.js + TypeScript CRM portal frontend from scratch, integrated Razorpay, Cashfree, and Instamojo.
2. Qpulse AI-Powered Resume Builder: Next.js + TypeScript AI builder and dashboard, integrated AI chatbot and roadmap APIs.
3. AI Job-Apply Agent: Built autonomous browser automation using Playwright and Groq/Claude APIs.
4. Tenant Management System & Visitor Scheduling: Ebrotech systems built on React, TypeScript, and MongoDB.
5. Entra Office App: Angular dashboard for room bookings.
6. Doctor Appointment System: React + Tailwind CSS doctor scheduler.
Expected Salary: 10 LPA (Lakhs Per Annum) to 14 LPA. If the company budget is above 14 LPA, ask for more than 14 LPA accordingly.
Current Salary: 6 LPA.
Summary: Strong track record of building performant, responsive web applications, optimizing bundle sizes, implementing state management (Redux, Context API, React Query), and collaborating with design and product teams.
`;

  let prompt = '';
  if (fieldType === 'select') {
    prompt = `You are a job application assistant helping Shatadal Sundar Sinha apply for a Senior Frontend Developer job.
Based on the candidate's profile, pick the single best option from the list below that answers the question: "${labelText}".
Available options:
${optionsList.map((opt, idx) => `${idx}: ${opt}`).join('\n')}

Profile:
${profileSummary}

Respond with ONLY the index number of the chosen option (e.g., "0" or "2"). Do not include any explanation or extra text.`;
  } else {
    const isNumericQuestion = labelText.toLowerCase().includes('how many') || 
                              labelText.toLowerCase().includes('number of') || 
                              labelText.toLowerCase().includes('experience') || 
                              labelText.toLowerCase().includes('years') ||
                              labelText.toLowerCase().includes('salary') ||
                              labelText.toLowerCase().includes('ctc') ||
                              labelText.toLowerCase().includes('compensation') ||
                              labelText.toLowerCase().includes('expected') ||
                              labelText.toLowerCase().includes('expectation') ||
                              labelText.toLowerCase().includes('current') ||
                              labelText.toLowerCase().includes('notice') ||
                              labelText.toLowerCase().includes('days') ||
                              labelText.toLowerCase().includes('inr') ||
                              labelText.toLowerCase().includes('lpa') ||
                              labelText.toLowerCase().includes('lakh') ||
                              labelText.toLowerCase().includes('lac') ||
                              labelText.toLowerCase().includes('rupee') ||
                              labelText.toLowerCase().includes('pay');
    
    prompt = `You are a job application assistant helping Shatadal Sundar Sinha apply for a Senior Frontend Developer job.
Based on the candidate's profile, provide a concise, natural, and professional answer to the question: "${labelText}".
${isNumericQuestion ? 'Since this question asks for a number, quantity, salary, notice period, or years of experience, you MUST respond with ONLY a single number, digits, or decimal (e.g., "5", "15", "1200000" or "12"). Do NOT write any sentences, currency symbols, letters, words, or explanations. Just return the digits/number.' : ''}
If the question asks for years of experience with a specific tech stack (e.g. React, NextJS, TypeScript, CSS), Shatadal has 5 years of experience.
If the question is a Yes/No question, respond with "Yes" or "No".
If it is a numeric question, respond with ONLY the number.

Profile:
${profileSummary}

Do NOT repeat the question or include the question label in your response. Output ONLY the raw, plain answer itself (e.g., "Senior Frontend Developer", "Webskitter Technology Private Limited", "5", etc.).
Answer directly and concisely (maximum 1-2 sentences). Do not include any conversational filler.`;
  }

  try {
    const chatCompletion = await client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      max_tokens: fieldType === 'select' ? 5 : 100,
    });

    const response = (chatCompletion.choices[0]?.message?.content || '').trim();
    console.log(`[AI Solver] Question: "${labelText}" -> Answer: "${response}"`);
    return response;
  } catch (err: any) {
    console.error(`[AI Solver] Error calling Groq: ${err.message}`);
    return '';
  }
}

// Helper to inject a visual custom floating cursor tracking Playwright mouse movements
async function injectVirtualCursor(page: any) {
  try {
    await page.addInitScript(() => {
      const initVisualOverlays = () => {
        if (!document.body) return;
        if (document.getElementById('ai-virtual-cursor-container')) return;

        const container = document.createElement('div');
        container.id = 'ai-virtual-cursor-container';
        container.style.pointerEvents = 'none';
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.zIndex = '2147483647';
        
        const style = document.createElement('style');
        style.innerHTML = `
          @keyframes ai-pulse {
            0% { transform: scale(1); filter: hue-rotate(0deg); box-shadow: 0 0 15px rgba(139, 92, 246, 0.7), 0 0 30px rgba(6, 182, 212, 0.4); }
            50% { transform: scale(1.15); filter: hue-rotate(180deg); box-shadow: 0 0 25px rgba(236, 72, 153, 0.9), 0 0 45px rgba(139, 92, 246, 0.6); }
            100% { transform: scale(1); filter: hue-rotate(360deg); box-shadow: 0 0 15px rgba(139, 92, 246, 0.7), 0 0 30px rgba(6, 182, 212, 0.4); }
          }
          @keyframes ai-rotate {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes status-pulse {
            0% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.3); opacity: 1; box-shadow: 0 0 10px #22c55e; }
            100% { transform: scale(1); opacity: 0.8; }
          }
        `;
        container.appendChild(style);

        const cursor = document.createElement('div');
        cursor.id = 'ai-virtual-cursor';
        cursor.style.position = 'fixed';
        cursor.style.width = '24px';
        cursor.style.height = '24px';
        cursor.style.background = 'linear-gradient(135deg, #d946ef, #8b5cf6, #06b6d4)';
        cursor.style.borderRadius = '50%';
        cursor.style.border = '2.5px solid #ffffff';
        cursor.style.pointerEvents = 'none';
        cursor.style.left = '-100px';
        cursor.style.top = '-100px';
        cursor.style.transition = 'transform 0.1s ease-out';
        cursor.style.animation = 'ai-pulse 3s infinite linear';
        cursor.style.boxShadow = '0 0 15px rgba(139, 92, 246, 0.7), 0 0 30px rgba(6, 182, 212, 0.4), inset 0 0 6px rgba(255, 255, 255, 0.6)';

        const halo = document.createElement('div');
        halo.style.position = 'absolute';
        halo.style.width = '44px';
        halo.style.height = '44px';
        halo.style.border = '1.5px dashed rgba(6, 182, 212, 0.7)';
        halo.style.borderRadius = '50%';
        halo.style.left = '-12px';
        halo.style.top = '-12px';
        halo.style.animation = 'ai-rotate 6s linear infinite';
        cursor.appendChild(halo);

        const currentStatus = (window as any).__ai_agent_status || "Working";
        const label = document.createElement('div');
        label.id = 'ai-virtual-label';
        label.innerText = `⚡ Shatadal's AI Agent: ${currentStatus}...`;
        label.style.position = 'absolute';
        label.style.left = '34px';
        label.style.top = '-2px';
        label.style.background = 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 27, 75, 0.95))';
        label.style.color = '#f8fafc';
        label.style.padding = '6px 14px';
        label.style.borderRadius = '12px';
        label.style.fontSize = '12px';
        label.style.fontWeight = 'bold';
        label.style.fontFamily = "'Outfit', 'Inter', system-ui, -apple-system, sans-serif";
        label.style.whiteSpace = 'nowrap';
        label.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.4)';
        label.style.border = '1px solid rgba(168, 85, 247, 0.5)';
        cursor.appendChild(label);
        container.appendChild(cursor);

        const banner = document.createElement('div');
        banner.id = 'ai-status-banner';
        banner.style.position = 'fixed';
        banner.style.top = '0';
        banner.style.left = '0';
        banner.style.width = '100%';
        banner.style.height = '36px';
        banner.style.background = 'linear-gradient(90deg, #1e1b4b 0%, #311042 50%, #1e1b4b 100%)';
        banner.style.borderBottom = '2px solid rgba(168, 85, 247, 0.6)';
        banner.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.4)';
        banner.style.display = 'flex';
        banner.style.alignItems = 'center';
        banner.style.justifyContent = 'center';
        banner.style.gap = '8px';
        banner.style.color = '#ffffff';
        banner.style.fontFamily = "'Outfit', 'Inter', system-ui, -apple-system, sans-serif";
        banner.style.fontSize = '13px';
        banner.style.fontWeight = '600';
        banner.style.textShadow = '0 0 8px rgba(168, 85, 247, 0.8)';
        banner.style.pointerEvents = 'none';

        const pulseDot = document.createElement('div');
        pulseDot.style.width = '8px';
        pulseDot.style.height = '8px';
        pulseDot.style.background = '#22c55e';
        pulseDot.style.borderRadius = '50%';
        pulseDot.style.animation = 'status-pulse 1.8s infinite ease-in-out';
        banner.appendChild(pulseDot);

        const bannerText = document.createElement('span');
        bannerText.innerText = `🤖 Shatadal's Personal AI Agent is active | Status: ${currentStatus}...`;
        banner.appendChild(bannerText);
        container.appendChild(banner);

        document.body.appendChild(container);

        document.addEventListener('mousemove', (e) => {
          cursor.style.left = `${e.clientX}px`;
          cursor.style.top = `${e.clientY}px`;
        });

        document.addEventListener('mousedown', (e) => {
          cursor.style.transform = 'scale(0.8)';
          
          const ripple = document.createElement('div');
          ripple.style.position = 'fixed';
          ripple.style.left = `${e.clientX - 15}px`;
          ripple.style.top = `${e.clientY - 15}px`;
          ripple.style.width = '30px';
          ripple.style.height = '30px';
          ripple.style.border = '3px solid rgba(236, 72, 153, 0.9)';
          ripple.style.borderRadius = '50%';
          ripple.style.pointerEvents = 'none';
          ripple.style.transition = 'all 0.4s ease-out';
          container.appendChild(ripple);
          
          setTimeout(() => {
            ripple.style.transform = 'scale(2.2)';
            ripple.style.opacity = '0';
          }, 10);
          
          setTimeout(() => ripple.remove(), 450);
        });

        document.addEventListener('mouseup', () => {
          cursor.style.transform = 'scale(1)';
        });
      };

      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', () => {
          initVisualOverlays();
          setInterval(initVisualOverlays, 2000);
        });
      } else {
        initVisualOverlays();
        setInterval(initVisualOverlays, 2000);
      }
    });
  } catch (err: any) {
    console.warn(`[Cursor Inject] Failed to register virtual cursor: ${err.message}`);
  }
}

// Helper to update visual agent status text on both cursor label and top banner
async function updateAgentStatus(pageOrFrame: any, statusText: string) {
  try {
    const mainPage = typeof pageOrFrame.page === 'function' ? pageOrFrame.page() : pageOrFrame;
    if (mainPage.isClosed()) return;
    await mainPage.evaluate((txt: string) => {
      (window as any).__ai_agent_status = txt;
      const label = document.getElementById('ai-virtual-label');
      if (label) {
        label.textContent = `⚡ Shatadal's AI Agent: ${txt}...`;
      }
      const bannerSpan = document.querySelector('#ai-status-banner span');
      if (bannerSpan) {
        bannerSpan.textContent = `🤖 Shatadal's Personal AI Agent is active | Status: ${txt}...`;
      }

      // Dynamic glow for the currently active/focused form field (if any)
      document.querySelectorAll('.ai-active-glow').forEach((el) => {
        el.classList.remove('ai-active-glow');
        const htmlEl = el as HTMLElement;
        htmlEl.style.boxShadow = '';
        htmlEl.style.borderColor = '';
      });

      const activeEl = document.activeElement as HTMLElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        activeEl.classList.add('ai-active-glow');
        activeEl.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
        activeEl.style.boxShadow = '0 0 12px rgba(139, 92, 246, 0.8)';
        activeEl.style.borderColor = '#8b5cf6';
      }
    }, statusText).catch(() => {});
  } catch {}
}

// Smooth mouse click helper
async function humanClick(pageOrFrame: any, locator: any) {
  try {
    await updateAgentStatus(pageOrFrame, 'Clicking');
    await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    const box = await locator.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const mainPage = typeof pageOrFrame.page === 'function' ? pageOrFrame.page() : pageOrFrame;
      await mainPage.mouse.move(x, y, { steps: 4 });
      await mainPage.waitForTimeout(40);
      await locator.click({ force: true });
    } else {
      await locator.click({ force: true });
    }
    await updateAgentStatus(pageOrFrame, 'Working');
  } catch {
    await locator.click({ force: true }).catch(() => {});
    await updateAgentStatus(pageOrFrame, 'Working');
  }
}

// Smooth mouse focus and input fill helper
async function humanFill(pageOrFrame: any, locator: any, text: string) {
  try {
    const shortText = text.length > 15 ? text.substring(0, 15) + '...' : text;
    await updateAgentStatus(pageOrFrame, `Typing "${shortText}"`);
    await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    const box = await locator.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const mainPage = typeof pageOrFrame.page === 'function' ? pageOrFrame.page() : pageOrFrame;
      await mainPage.mouse.move(x, y, { steps: 4 });
      await mainPage.waitForTimeout(40);
      await locator.click();
    }
    await locator.fill(text);
    await updateAgentStatus(pageOrFrame, 'Working');
  } catch {
    await locator.fill(text).catch(() => {});
    await updateAgentStatus(pageOrFrame, 'Working');
  }
}

// Helper to extract the descriptive label text of an input field
async function getLabelTextForInput(pageOrFrame: any, input: any): Promise<string> {
  try {
    const id = await input.getAttribute('id') || '';
    if (id) {
      const labelSelector = `label[for="${id}"]`;
      if (await pageOrFrame.locator(labelSelector).count() > 0) {
        return (await pageOrFrame.locator(labelSelector).first().textContent() || '').toLowerCase();
      }
    }
    
    const placeholder = await input.getAttribute('placeholder') || '';
    if (placeholder) return placeholder.toLowerCase();
    
    const ariaLabel = await input.getAttribute('aria-label') || '';
    if (ariaLabel) return ariaLabel.toLowerCase();

    // Check if nested inside a label element
    const parentLabel = await input.locator('xpath=./ancestor::label').first().textContent().catch(() => '') || '';
    if (parentLabel) return parentLabel.toLowerCase();
    
    const nameAttr = await input.getAttribute('name') || '';
    if (nameAttr) return nameAttr.toLowerCase();

    // Custom fallback: search for preceding text label or header elements in parent container
    let current = input;
    for (let depth = 0; depth < 3; depth++) {
      current = current.locator('xpath=..');
      if (await current.count() === 0) break;
      
      const labels = current.locator('label, span, div, p');
      const count = await labels.count();
      for (let j = 0; j < count; j++) {
        const el = labels.nth(j);
        const className = await el.getAttribute('class') || '';
        const tagName = await el.evaluate((node: any) => node.tagName.toLowerCase());
        
        if (tagName === 'label' || className.toLowerCase().includes('label') || className.toLowerCase().includes('title') || className.toLowerCase().includes('text') || className.toLowerCase().includes('name') || className.toLowerCase().includes('question')) {
          const text = (await el.textContent() || '').trim();
          if (text && text.length > 2 && text.length < 150) {
            return text.toLowerCase();
          }
        }
      }
    }
  } catch {}
  return '';
}

// Helper to fill custom input fields based on labels
async function fillSingleInput(pageOrFrame: any, input: any, labelText: string) {
  // Job Title / Designation
  if (labelText.includes('job title') || labelText.includes('current role') || labelText.includes('current position') || labelText.includes('designation')) {
    console.log(`[Form Fill] Filling job title (Senior Frontend Developer)...`);
    await humanFill(pageOrFrame, input, 'Senior Frontend Developer');
  }
  // Company / Employer
  else if (labelText.includes('company') || labelText.includes('employer') || labelText.includes('current organization') || labelText.includes('organization') || labelText.includes('current firm')) {
    console.log(`[Form Fill] Filling current company (Webskitters Technology Solutions Pvt. Ltd.)...`);
    await humanFill(pageOrFrame, input, 'Webskitters Technology Solutions Pvt. Ltd.');
  }
  // Interview Availability / Notice details
  else if (labelText.includes('interview') || labelText.includes('availability') || labelText.includes('time slot') || labelText.includes('available to start') || labelText.includes('when can you start')) {
    console.log(`[Form Fill] Filling interview / availability query...`);
    if (labelText.includes('time') || labelText.includes('slot')) {
      await humanFill(pageOrFrame, input, 'Available anytime during office hours, with 1-hour notice.');
    } else {
      await humanFill(pageOrFrame, input, 'Immediate joiner (can join immediately). Available for interviews anytime.');
    }
  }
  // Address / Location fields
  else if (labelText.includes('phone') || labelText.includes('cell') || labelText.includes('mobile') || labelText.includes('contact') || labelText.includes('tel') || labelText.includes('telephone')) {
    console.log(`[Form Fill] Filling phone number (9382468250)...`);
    await humanFill(pageOrFrame, input, '9382468250');
  } else if (labelText.includes('address') || labelText.includes('street') || labelText.includes('line 1') || labelText.includes('line 2')) {
    console.log(`[Form Fill] Filling address (Kolkata, West Bengal)...`);
    await humanFill(pageOrFrame, input, 'Kolkata, West Bengal');
  } else if (labelText.includes('city') || labelText.includes('town') || labelText.includes('location') || labelText.includes('residence') || labelText.includes('place') || labelText.includes('hometown') || labelText.includes('suburb')) {
    console.log(`[Form Fill] Filling location/city (Kolkata)...`);
    await humanFill(pageOrFrame, input, 'Kolkata');
  } else if (labelText.includes('state') || labelText.includes('province') || labelText.includes('region')) {
    console.log(`[Form Fill] Filling state (West Bengal)...`);
    await humanFill(pageOrFrame, input, 'West Bengal');
  } else if (labelText.includes('postal') || labelText.includes('zip') || labelText.includes('pin') || labelText.includes('pincode') || labelText.includes('postcode')) {
    console.log(`[Form Fill] Filling pincode (700017)...`);
    await humanFill(pageOrFrame, input, '700017');
  } else if (labelText.includes('country') || labelText.includes('nation')) {
    console.log(`[Form Fill] Filling country (India)...`);
    await humanFill(pageOrFrame, input, 'India');
  }
  // Experience & Notice Period
  else if (labelText.includes('experience') || labelText.includes('years') || labelText.includes('total exp')) {
    console.log(`[Form Fill] Filling experience (5)...`);
    await humanFill(pageOrFrame, input, '5');
  } else if (labelText.includes('notice') || labelText.includes('days') || labelText.includes('joining') || labelText.includes('start date')) {
    console.log(`[Form Fill] Filling notice period (0)...`);
    await humanFill(pageOrFrame, input, '0');
  } 
  // Education Background
  else if (labelText.includes('university') || labelText.includes('college') || labelText.includes('institute') || labelText.includes('school') || labelText.includes('education')) {
    console.log(`[Form Fill] Filling university / college (Maulana Abul Kalam Azad University of Technology)...`);
    await humanFill(pageOrFrame, input, 'Maulana Abul Kalam Azad University of Technology');
  } else if (labelText.includes('degree') || labelText.includes('major') || labelText.includes('course') || labelText.includes('specialization') || labelText.includes('stream') || labelText.includes('field of study')) {
    console.log(`[Form Fill] Filling degree / major (Computer Science & Engineering)...`);
    await humanFill(pageOrFrame, input, 'Computer Science & Engineering');
  } else if (labelText.includes('graduation') || labelText.includes('completion') || labelText.includes('passing year') || labelText.includes('passout') || labelText.includes('completed in')) {
    console.log(`[Form Fill] Filling graduation year (2022)...`);
    await humanFill(pageOrFrame, input, '2022');
  }
  // Key Skills / Technologies
  else if (labelText.includes('skills') || labelText.includes('key skills') || labelText.includes('expertise') || labelText.includes('technologies') || labelText.includes('tech stack') || labelText.includes('tools')) {
    console.log(`[Form Fill] Filling key skills...`);
    await humanFill(pageOrFrame, input, 'React, Next.js, TypeScript, JavaScript, HTML, CSS, Tailwind CSS, Angular, Node.js, Redux');
  }
  // Salary / Compensation
  else if ((labelText.includes('expected') || labelText.includes('expect')) && (labelText.includes('salary') || labelText.includes('ctc') || labelText.includes('pay') || labelText.includes('compensation'))) {
    const val = getExpectedSalaryValue(labelText);
    console.log(`[Form Fill] Filling expected salary (${val})...`);
    await humanFill(pageOrFrame, input, val);
  } else if (labelText.includes('current') && (labelText.includes('salary') || labelText.includes('ctc') || labelText.includes('pay') || labelText.includes('compensation'))) {
    const val = getCurrentSalaryValue(labelText);
    console.log(`[Form Fill] Filling current salary (${val})...`);
    await humanFill(pageOrFrame, input, val);
  } 
  // Profiles & links
  else if (labelText.includes('linkedin') || labelText.includes('profile link') || labelText.includes('social profile')) {
    console.log(`[Form Fill] Filling LinkedIn profile URL...`);
    await humanFill(pageOrFrame, input, 'https://www.linkedin.com/in/shatadal-sundar-sinha-96b27b239/');
  } else if (labelText.includes('portfolio') || labelText.includes('personal website') || labelText.includes('website link') || labelText.includes('blog') || labelText.includes('github') || labelText.includes('link')) {
    console.log(`[Form Fill] Filling portfolio URL...`);
    await humanFill(pageOrFrame, input, 'https://shatadalpersonalassistent.vercel.app/');
  } 
  else if (labelText.includes('cover letter') || labelText.includes('additional') || labelText.includes('message') || labelText.includes('why should we hire you') || labelText.includes('why should we hire')) {
    console.log(`[Form Fill] Filling cover letter...`);
    await humanFill(pageOrFrame, input, 'I am a Senior Frontend Developer with approximately 5 years of experience specializing in React, Next.js, and TypeScript. I have a strong track record of building performant, responsive web applications and would love to contribute to your team.');
  }
  // Personal details fallback
  else if (labelText.includes('first name') || labelText.includes('given name')) {
    console.log(`[Form Fill] Filling first name (Shatadal Sundar)...`);
    await humanFill(pageOrFrame, input, 'Shatadal Sundar');
  } else if (labelText.includes('last name') || labelText.includes('family name') || labelText.includes('surname')) {
    console.log(`[Form Fill] Filling last name (Sinha)...`);
    await humanFill(pageOrFrame, input, 'Sinha');
  } else if ((labelText.includes('name') || labelText.includes('full name')) && !labelText.includes('company') && !labelText.includes('job') && !labelText.includes('employer') && !labelText.includes('school')) {
    console.log(`[Form Fill] Filling full name (Shatadal Sundar Sinha)...`);
    await humanFill(pageOrFrame, input, 'Shatadal Sundar Sinha');
  } else if (labelText.includes('email') || labelText.includes('e-mail')) {
    console.log(`[Form Fill] Filling email (shatadal17@gmail.com)...`);
    await humanFill(pageOrFrame, input, 'shatadal17@gmail.com');
  }
  // Fallback to dynamic AI answer for uncommon fields!
  else {
    console.log(`[Form Fill] Uncommon field detected: "${labelText}". Querying Groq AI...`);
    try {
      await input.focus().catch(() => {});
    } catch {}
    await updateAgentStatus(pageOrFrame, 'Thinking with AI');
    const aiAnswer = await askAI(labelText, 'input');
    if (aiAnswer) {
      await humanFill(pageOrFrame, input, aiAnswer);
    } else {
      await humanFill(pageOrFrame, input, '5'); // standard default fallback
    }
  }
}

// Self-correcting validation repair engine to check and fix errors (e.g. numeric validations)
async function checkAndFixValidationErrors(pageOrFrame: any) {
  try {
    const errorLocators = [
      '.artdeco-inline-feedback--error',
      '.artdeco-inline-feedback__message',
      '.fb-form-element__feedback',
      '[class*="feedback--error"]',
      '[class*="inline-feedback"]',
      '[class*="error"]',
      '[class*="Error"]',
      '[class*="invalid"]',
      '[role="alert"]',
      '[id*="error"]',
      '#error-message',
      '.css-1n7hldy'
    ];

    for (const sel of errorLocators) {
      const errors = pageOrFrame.locator(sel).filter({ visible: true });
      const errorCount = await errors.count();
      for (let i = 0; i < errorCount; i++) {
        const errorEl = errors.nth(i);
        const errorText = (await errorEl.textContent() || '').toLowerCase();
        console.warn(`[Validation Failsafe] Found active validation error: "${errorText.trim()}"`);
        
        // Locate parent container to find the specific input field
        let parentContainer = errorEl.locator('xpath=./ancestor::div[contains(@class, "fb-form-element") or contains(@class, "jobs-easy-apply-form-section__group") or contains(@class, "jobs-easy-apply-form-section__group-child") or contains(@class, "icl-TextInput") or contains(@class, "icl-FormRow") or contains(@class, "form-group") or contains(@class, "form-field") or contains(@class, "css-") or contains(@class, "ia-")]').first();
        if (await parentContainer.count() === 0) {
          parentContainer = errorEl.locator('xpath=./..').first(); // Fall back to immediate parent
        }
        if (await parentContainer.count() > 0) {
          const input = parentContainer.locator('input[type="text"], input[type="number"], input[type="tel"], input[type="email"], input:not([type]), textarea').first();
          if (await input.count() > 0 && await input.isEditable()) {
            const currentVal = await input.inputValue();
            console.log(`[Validation Failsafe] Current field value: "${currentVal}"`);
            
            // Fix: If validation requires a decimal or numeric value and text is found, strip all non-numbers!
            if (errorText.includes('number') || errorText.includes('decimal') || errorText.includes('digit') || errorText.includes('numeric') || errorText.includes('larger than') || errorText.includes('larger than 0.0') || errorText.includes('greater than')) {
              let numericOnly = currentVal.replace(/[^0-9.]/g, '');
              const needsPositive = errorText.includes('larger than 0') || errorText.includes('greater than 0') || errorText.includes('larger than 0.0') || errorText.includes('greater than 0.0');
              
              // If it's not a valid number or empty, let's query the AI for a clean number
              if (!numericOnly || (needsPositive && parseFloat(numericOnly) <= 0)) {
                const labelText = await getLabelTextForInput(pageOrFrame, input);
                console.log(`[Validation Failsafe] Querying AI to correct numeric field: "${labelText}"`);
                const aiNum = await askAI(labelText + " (Respond with ONLY a number/digits, e.g. 4 or 5)", 'input');
                numericOnly = aiNum.replace(/[^0-9.]/g, '');
              }

              if (numericOnly) {
                console.log(`[Validation Failsafe] Rewriting field with corrected digits: "${numericOnly}"`);
                await input.fill(numericOnly);
                await randomDelay(400, 800);
              } else {
                const labelText = await getLabelTextForInput(pageOrFrame, input);
                if (labelText.includes('notice') || labelText.includes('days')) {
                  await input.fill('0');
                } else if (labelText.includes('experience') || labelText.includes('years')) {
                  await input.fill('5');
                } else {
                  await input.fill(needsPositive ? '1' : '0');
                }
              }
            }
            // Fix: Email error
            else if (errorText.includes('email') || errorText.includes('e-mail')) {
              await input.fill('shatadal17@gmail.com');
            }
            // Fix: Phone error
            else if (errorText.includes('phone') || errorText.includes('mobile')) {
              await input.fill('9382468250');
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Validation Failsafe] Error during validation repair: ${err.message}`);
  }
}

// Element-specific smooth scrolling
async function elementScroll(page: any, selector: string, scrollDistance = 400) {
  try {
    await updateAgentStatus(page, 'Scrolling container');
    await page.evaluate(({ sel, dist }: { sel: string, dist: number }) => {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollBy({ top: dist, behavior: 'smooth' });
      }
    }, { sel: selector, dist: scrollDistance });
    await delay(500 + Math.random() * 200);
    await updateAgentStatus(page, 'Working');
  } catch {}
}

async function isLinkedInLoggedIn(page: any): Promise<boolean> {
  try {
    const navIndicators = [
      '#global-nav',
      '.global-nav',
      '.global-nav__me',
      '.global-nav__me-photo',
      'a[href*="/feed/"]',
      'a[href*="/jobs/"]',
      'a[href*="/messaging/"]',
      'input.search-global-typeahead__input'
    ];
    for (const sel of navIndicators) {
      if (await page.locator(sel).count() > 0) {
        return true;
      }
    }
  } catch {}
  return false;
}

async function isInstahyreLoggedIn(page: any): Promise<boolean> {
  try {
    const navIndicators = [
      '.navbar-right',
      'a[href*="/logout"]',
      'a[href*="/logout/"]',
      'a[href*="/candidate/"]',
      'a[href*="/opportunities/"]',
      'button:has-text("Apply")'
    ];
    for (const sel of navIndicators) {
      if (await page.locator(sel).count() > 0) {
        return true;
      }
    }
  } catch {}
  return false;
}

async function isIndeedLoggedIn(page: any): Promise<boolean> {
  try {
    const signInIndicators = [
      'a[href*="signin"]',
      'a[href*="sign-in"]',
      'a[href*="/account/login"]',
      'button:has-text("Sign in")'
    ];
    let hasSignIn = false;
    for (const sel of signInIndicators) {
      if (await page.locator(sel).count() > 0) {
        hasSignIn = true;
        break;
      }
    }
    return !hasSignIn;
  } catch {}
  return true;
}

async function isNaukriLoggedIn(page: any): Promise<boolean> {
  try {
    const loggedInIndicators = [
      'a[href*="/nprofile/"]',
      'a:has-text("My Naukri")',
      '.nProfile',
      '.nui-profile-photo',
      'a:has-text("Logout")',
      'a:has-text("Log out")'
    ];
    for (const sel of loggedInIndicators) {
      if (await page.locator(sel).count() > 0) {
        return true;
      }
    }
    
    // Fallback: check if there's no login layer/button
    const hasLoginButton = await page.locator('#login_Layer, a:has-text("Login")').count() > 0;
    return !hasLoginButton;
  } catch {}
  return false;
}

// Human-like smooth scrolling with robust scroll-lock bypasses
const humanScroll = async (page: any, scrollDistance = 400) => {
  try {
    await updateAgentStatus(page, 'Scrolling');
    
    // 1. Force unlock body and html overflow styles (overrides scroll locks from popups)
    await page.evaluate(() => {
      const unlock = (el: HTMLElement | null) => {
        if (!el) return;
        el.style.setProperty('overflow', 'auto', 'important');
        el.style.setProperty('overflow-y', 'auto', 'important');
        el.style.setProperty('position', 'static', 'important');
        el.style.setProperty('height', 'auto', 'important');
      };
      unlock(document.body);
      unlock(document.documentElement);
      
      // Also unlock common LinkedIn layout containers
      unlock(document.querySelector('.scaffold-layout'));
      unlock(document.querySelector('.scaffold-layout__inner'));
      unlock(document.querySelector('.authentication-outlet'));

      // Unlock all large layout divs that might have overflow hidden or scroll locks
      const allDivs = document.querySelectorAll('div');
      allDivs.forEach(div => {
        const style = window.getComputedStyle(div);
        if (style.overflow === 'hidden' || style.overflowY === 'hidden') {
          if (div.offsetHeight > 300) {
            div.style.setProperty('overflow', 'auto', 'important');
            div.style.setProperty('overflow-y', 'auto', 'important');
          }
        }
      });
    }).catch(() => {});

    // Focus main container area to ensure keyboard PageDown / ArrowDown scrolls the actual feed
    try {
      const mainEl = page.locator('#main, main, .scaffold-layout__main, .feed-shared-update-v2').first();
      if (await mainEl.count() > 0 && await mainEl.isVisible()) {
        await mainEl.focus().catch(() => {});
      }
    } catch {}

    // 2. Try JavaScript scrolling (window + scrollingElement)
    await page.evaluate((dist: number) => {
      window.scrollBy({ top: dist, behavior: 'smooth' });
      if (document.scrollingElement) {
        document.scrollingElement.scrollBy({ top: dist, behavior: 'smooth' });
      }
    }, scrollDistance).catch(() => {});

    // 3. Native Playwright Mouse Wheel Scrolling (simulates physical hardware scrolling)
    await page.mouse.wheel(0, scrollDistance).catch(() => {});

    // 4. Keyboard PageDown Bypass (fallback if layout/mouse scrolling are intercepted)
    await page.keyboard.press('PageDown').catch(() => {});

    await delay(500 + Math.random() * 200);
    await updateAgentStatus(page, 'Working');
  } catch {}
};

// Simulated AI/LLM Profile Match Check (replace with real API call as needed)
async function checkProfileMatch(title: string, description: string): Promise<{ isMatch: boolean; confidence: number }> {
  console.log(`[AI Match Engine] Evaluating: "${title}"`);
  
  const keywords = ['react', 'next.js', 'nextjs', 'typescript', 'frontend', 'front-end', 'developer', 'engineer', 'javascript', 'js', 'html', 'css', 'web', 'ui', 'frontend lead', 'reactjs', 'full stack', 'fullstack'];
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();
  const content = (titleLower + ' ' + descLower);
  
  // Direct title-based override for perfect matches
  const isFrontendRole = titleLower.includes('frontend') || 
                          titleLower.includes('front-end') || 
                          titleLower.includes('react') || 
                          titleLower.includes('next.js') || 
                          titleLower.includes('nextjs') || 
                          titleLower.includes('full stack') || 
                          titleLower.includes('fullstack') || 
                          titleLower.includes('ui developer') || 
                          titleLower.includes('ui engineer') || 
                          titleLower.includes('web developer');
                          
  const isDevOrEng = titleLower.includes('developer') || 
                      titleLower.includes('engineer') || 
                      titleLower.includes('sr') || 
                      titleLower.includes('senior') || 
                      titleLower.includes('lead') || 
                      titleLower.includes('architect');
  
  if (isFrontendRole && isDevOrEng) {
    console.log(`[AI Match Engine] Decision: ✅ MATCH (Title-based auto-match)`);
    return { isMatch: true, confidence: 1.0 };
  }

  // Broad/Lenient fallback check for general Software Developer roles that use our tech stack
  const isGenericSoftwareRole = titleLower.includes('software') || 
                                 titleLower.includes('systems') || 
                                 titleLower.includes('associate') || 
                                 titleLower.includes('application') ||
                                 titleLower.includes('web') ||
                                 titleLower.includes('ui') ||
                                 titleLower.includes('ux');
                                 
  const usesFrontendStack = descLower.includes('react') || 
                             descLower.includes('next.js') || 
                             descLower.includes('nextjs') || 
                             descLower.includes('typescript') || 
                             descLower.includes('angular') || 
                             descLower.includes('javascript') || 
                             descLower.includes('front-end') || 
                             descLower.includes('frontend');

  if (isGenericSoftwareRole && isDevOrEng && usesFrontendStack) {
    console.log(`[AI Match Engine] Decision: ✅ MATCH (Broad Software role matching frontend stack)`);
    return { isMatch: true, confidence: 0.9 };
  }

  let matches = 0;
  keywords.forEach((keyword) => {
    if (content.includes(keyword)) matches++;
  });

  const confidence = matches / keywords.length;
  // Lenient threshold to maximize mass-applying for close matches
  const threshold = descLower.length < 100 ? 0.10 : 0.12;
  const isMatch = confidence >= threshold; 
  
  console.log(`[AI Match Engine] Decision: ${isMatch ? '✅ MATCH' : '❌ NO MATCH'} (Confidence: ${(confidence * 100).toFixed(0)}%)`);
  return { isMatch, confidence };
}

// -------------------------------------------------------------
// PIPELINE 1: LINKEDIN AUTOMATION
// -------------------------------------------------------------
async function runLinkedInPipeline(page: any) {
  console.log('\n[LinkedIn] Starting job application pipeline...');
  await updateAgentStatus(page, 'Searching for Jobs');
  
  const keyword = getRandomSearchKeyword();
  console.log(`[LinkedIn] Selected search keyword: "${keyword}"`);
  
  // Navigate to LinkedIn Job Search with f_AL=true (Easy Apply) and the selected keyword
  const searchUrl = `https://www.linkedin.com/jobs/search/?f_AL=true&keywords=${encodeURIComponent(keyword)}&location=India&sortBy=DD&f_TPR=r604800`;
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  } catch (err: any) {
    console.warn(`[LinkedIn] Warning during initial navigation: ${err.message}`);
  }
  await randomDelay(800, 1500);

  // Check if we are logged in by searching for the nav bar
  let loggedIn = await isLinkedInLoggedIn(page);

  if (!loggedIn) {
    console.log('[LinkedIn] User is not logged in! Waiting for you to log in manually in the open Chrome window (auto-detecting login)...');
    
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes timeout
    
    while (!loggedIn && Date.now() - startTime < timeout) {
      if (page.isClosed()) {
        console.error('[LinkedIn] Browser page was closed. Skipping LinkedIn...');
        return;
      }
      await page.waitForTimeout(2000);
      loggedIn = await isLinkedInLoggedIn(page);
    }

    if (!loggedIn) {
      console.error('[LinkedIn] Timeout waiting for login. Skipping LinkedIn...');
      return;
    }
    console.log('[LinkedIn] Logged in successfully!');
  }

  // Scroll through the job list multiple times to load all 25 job cards on the page
  console.log('[LinkedIn] Scrolling through job list container to load all cards...');
  await updateAgentStatus(page, 'Scrolling Job List');
  const jobListSelector = '.jobs-search-results-list';
  if (await page.locator(jobListSelector).count() > 0) {
    await page.locator(jobListSelector).hover();
    for (let s = 0; s < 4; s++) {
      await elementScroll(page, jobListSelector, 800);
      await page.waitForTimeout(200);
    }
  }

  // Get job card elements
  const jobCards = page.locator('.job-card-container');
  const count = await jobCards.count();
  console.log(`[LinkedIn] Found ${count} job cards in this page.`);

  for (let i = 0; i < Math.min(count, 25); i++) {
    try {
      let card = page.locator('.job-card-container').nth(i);
      await updateAgentStatus(page, `Opening Job Details (${i + 1}/${count})`);
      await humanClick(page, card);
      await randomDelay(500, 1000);

      // Extract details with fast locator timeouts to prevent 30s stall
      const title = (await page.locator('.job-details-jobs-unified-top-card__job-title, h1.t-24, h2.jobs-description-__title').first().textContent({ timeout: 4000 }).catch(() => '')).trim();
      const description = (await page.locator('#job-details, .jobs-description-content__text, .jobs-description__content').first().textContent({ timeout: 4000 }).catch(() => '')).trim();

      // Detect company salary range for dynamic expected salary bidding
      currentJobSalaryRange = detectSalaryRange(title + " " + description);

      // Check match
      await updateAgentStatus(page, `Evaluating "${title.substring(0, 15)}..."`);
      const { isMatch } = await checkProfileMatch(title, description);
      if (!isMatch) {
        console.log(`[LinkedIn] Skipping job: "${title}" due to low profile alignment.`);
        continue;
      }

      // Check for Easy Apply button
      const easyApplyButton = page.locator('button.jobs-apply-button');
      if (await easyApplyButton.count() > 0) {
        console.log(`[LinkedIn] Clicking 'Easy Apply' for "${title}"...`);
        await updateAgentStatus(page, 'Opening Easy Apply');
        await humanClick(page, easyApplyButton.first());
        await randomDelay(500, 1000);

        // Fill out modal forms if they appear
        await updateAgentStatus(page, 'Filling Application Form');
        await handleLinkedInFormSteps(page);

        // Proactively dismiss any post-apply success modals (Cimpress confirmation, etc.)
        await updateAgentStatus(page, 'Checking Submission Status');
        await dismissLinkedInPostApplyModal(page);
      } else {
        console.log(`[LinkedIn] Easy Apply button not found or already applied for "${title}".`);
      }

    } catch (err: any) {
      console.error(`[LinkedIn] Error processing job card at index ${i}:`, err.message);
    } finally {
      await closeExtraTabs(page.context());
    }
  }

  // Scout feed for direct recruiter email leads after completing job search only if feed portal is enabled
  const portalsEnv = process.env.PORTALS;
  const enabledPortals = portalsEnv 
    ? portalsEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : ['linkedin', 'instahyre', 'indeed', 'naukri', 'feed'];
  if (enabledPortals.includes('feed')) {
    try {
      await runLinkedInFeedScouter(page);
    } catch (err: any) {
      console.error(`[LinkedIn Feed Scouter] Execution failed:`, err.message);
    }
  } else {
    console.log('[LinkedIn] Feed Scouter is disabled in settings. Skipping feed scouting.');
  }
}

interface FeedLead {
  email: string;
  postText: string;
  authorName: string;
  authorProfile: string;
  companyName: string;
  location: string;
  jobType: string;
  extractedAt: string;
  postTime: string;
  emailedAt?: string;
  emailedSubject?: string;
  outreachFailed?: boolean;
  outreachError?: string;
}

function saveFeedLead(lead: FeedLead) {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const filePath = path.join(dataDir, 'feed_leads.json');
  let leads: FeedLead[] = [];
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      leads = JSON.parse(content);
    } catch (e) {
      console.error(`[LinkedIn Feed Scouter] Error parsing existing leads file:`, e);
    }
  }
  
  const duplicate = leads.find(l => l.email.toLowerCase() === lead.email.toLowerCase());
  if (!duplicate) {
    leads.push(lead);
    fs.writeFileSync(filePath, JSON.stringify(leads, null, 2), 'utf-8');
    console.log(`[LinkedIn Feed Scouter] Saved new lead: ${lead.email} (${lead.authorName})`);
  } else {
    console.log(`[LinkedIn Feed Scouter] Duplicate lead ignored: ${lead.email}`);
  }
}

// Helper to extract detailed information from raw LinkedIn post text
function parseLeadPost(lead: any) {
  const text = lead.postText || '';
  const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
  
  // 1. Extract Role Title
  let roleTitle = '';
  
  // Try common headings for roles
  let openPositionsIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('open position') || lower.includes('hiring position') || lower.includes('open role') || lower.includes('we are hiring') || lower.includes('we\'re hiring') || lower.includes('hiring:')) {
      openPositionsIndex = i;
      break;
    }
  }
  
  // Look for lines after "Open Positions" or similar heading that look like roles
  if (openPositionsIndex !== -1 && openPositionsIndex < lines.length - 1) {
    for (let j = openPositionsIndex + 1; j < Math.min(lines.length, openPositionsIndex + 4); j++) {
      const line = lines[j];
      if (line.match(/^[•🔹✔✅🎨📈💻💼➡️-]\s*(.+)/) || line.includes('Developer') || line.includes('Engineer') || line.includes('Specialist') || line.includes('Manager') || line.includes('Tester')) {
        roleTitle = line.replace(/^[•🔹✔✅🎨📈💻💼➡️-]\s*/, '').split('(')[0].split('|')[0].split(/[\n,;]+/)[0].trim();
        break;
      }
    }
  }
  
  // If not found, look for "Hiring:" or "We're Hiring" patterns directly
  if (!roleTitle) {
    for (const line of lines) {
      if (line.startsWith('Hiring:') || line.startsWith('Hiring :')) {
        roleTitle = line.replace(/^Hiring\s*:\s*/i, '').split('|')[0].split('📍')[0].trim();
        break;
      }
      if (line.startsWith('Hiring ') && line.includes(':')) {
        roleTitle = line.split(':')[1]?.trim().split('|')[0].split('📍')[0].trim();
        break;
      }
      if (line.includes('We\'re Hiring |') || line.includes('We are Hiring |')) {
        roleTitle = line.split('|')[1]?.trim();
        break;
      }
    }
  }
  
  // Look for any line containing common job titles in the first 5 lines
  if (!roleTitle) {
    const commonTitles = [
      'Frontend Developer', 'React Developer', 'Full Stack Developer', 'Software Engineer', 
      'QA Tester', 'Manual Testing', 'QA Engineer', 'Business Consultant', 'VBCS Developer', 
      'Brand Designer', 'Business Development', 'Customer Support', 'Growth Manager', 
      'Service Engineer', 'Mobile Developer', 'React Native', 'Physical Design', 'Python Developer', 
      'Laravel Developer', 'PHP Developer'
    ];
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i];
      for (const title of commonTitles) {
        if (line.toLowerCase().includes(title.toLowerCase())) {
          roleTitle = title;
          break;
        }
      }
      if (roleTitle) break;
    }
  }
  
  // If still not found, check if there's "Open to Work | <role>"
  if (!roleTitle) {
    const openToWorkLine = lines.find((l: string) => l.includes('Open to Work'));
    if (openToWorkLine) {
      const parts = openToWorkLine.split('|');
      if (parts.length > 1) {
        roleTitle = parts[1].trim();
      }
    }
  }

  // Fallback: use first line truncated, or default
  if (!roleTitle) {
    if (lines[0] && lines[0].length < 60 && !lines[0].toLowerCase().includes('hiring') && !lines[0].toLowerCase().includes('join')) {
      roleTitle = lines[0];
    } else {
      roleTitle = 'Software Engineer / Developer';
    }
  }
  
  // Cleanup role title
  roleTitle = roleTitle.replace(/^[^a-zA-Z0-9]+/, '').replace(/[^a-zA-Z0-9)]+$/, '').trim();

  // 2. Extract Company Name
  let company = lead.companyName || 'Hiring Manager';
  
  if (company === 'Hiring Manager' && lead.authorProfile && lead.authorProfile.includes('/company/')) {
    const match = lead.authorProfile.match(/\/company\/([^/]+)/);
    if (match && match[1]) {
      company = match[1]
        .split('-')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }
  
  if (company === 'Hiring Manager') {
    for (let i = 0; i < Math.min(lines.length, 4); i++) {
      const line = lines[i];
      if (line.includes('is Hiring') || line.includes('is hiring') || line.includes('Technologies is expanding') || line.includes('Technologies Pvt Ltd') || line.includes('is looking for')) {
        const parts = line.split(/is hiring|is Hiring|Technologies is|is looking for/i);
        if (parts[0] && parts[0].trim().length < 55) {
          company = parts[0].replace(/^[^a-zA-Z0-9]+/, '').trim();
          break;
        }
      }
    }
  }

  if (company === 'Hiring Manager' && lead.email) {
    const emailDomain = lead.email.split('@')[1];
    if (emailDomain) {
      const domainParts = emailDomain.split('.');
      if (domainParts.length >= 2) {
        const domainCompany = domainParts[domainParts.length - 2];
        if (domainCompany && !['gmail', 'yahoo', 'outlook', 'hotmail', 'protonmail', 'com', 'co', 'in', 'net', 'org'].includes(domainCompany.toLowerCase())) {
          company = domainCompany.charAt(0).toUpperCase() + domainCompany.slice(1);
        }
      }
    }
  }
  
  if (company === 'Hiring Manager' && lead.authorName && !lead.authorName.toLowerCase().includes('recruiter')) {
    company = lead.authorName.split(',')[0].trim();
  }

  // 3. Extract Vacancies
  let vacancies = 'Not Specified';
  const vacancyMatch = text.match(/\b(\d+)\s*(?:openings|vacancies|positions|posts|open roles)\b/i);
  if (vacancyMatch) {
    vacancies = `${vacancyMatch[1]} Position${parseInt(vacancyMatch[1]) > 1 ? 's' : ''}`;
  } else {
    if (openPositionsIndex !== -1) {
      let count = 0;
      for (let j = openPositionsIndex + 1; j < lines.length; j++) {
        const line = lines[j];
        if (line.match(/^[•🔹✔✅🎨📈💻💼➡️-]/)) {
          count++;
        } else if (line.toLowerCase().includes('location') || line.toLowerCase().includes('send') || line.trim() === '') {
          break;
        }
      }
      if (count > 0) {
        vacancies = `${count} Role${count > 1 ? 's' : ''} Open`;
      }
    }
  }

  // 4. Extract Experience
  let experience = 'Not Specified';
  const expMatch = text.match(/\b(\d+(?:–|-|\+)?\d*)\s*(?:years?|yrs?)\b/i);
  if (expMatch) {
    experience = `${expMatch[1]} Years`;
  }

  return {
    roleTitle,
    company,
    vacancies,
    experience
  };
}

// Generate a 1-2 sentence customized alignment statement matching Shatadal's background to specific JD requirements
async function generateJDTailoredParagraph(postText: string): Promise<string> {
  const client = getGroqClient();
  const lowerText = postText.toLowerCase();

  // 1. If Groq client is initialized, use Llama 3 to write a dynamic alignment hook
  if (client) {
    console.log(`[AI Match Engine] Groq client active. Generating AI-powered cover letter tailoring hook...`);
    const prompt = `You are an AI assistant helping Shatadal Sundar Sinha (Senior Frontend Developer) write a highly tailored outreach email to a recruiter/hiring manager.
Based on the following Job Description (JD) text, write exactly 1 to 2 sentences summarizing how Shatadal's background (5 years experience, React, Next.js, TypeScript, payment integrations, building autonomous AI agents) directly aligns with their requirements.
Make it sound natural, professional, direct, and conversational. Speak in first person ("I have...", "I am...").
Do NOT write more than 2 sentences. Do NOT include any intro or outro text. Respond with ONLY the 1-2 matching sentences.

Job Description:
"""
${postText}
"""`;

    try {
      const chatCompletion = await client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.1-8b-instant',
        temperature: 0.3,
        max_tokens: 150,
      });

      const response = (chatCompletion.choices[0]?.message?.content || '').trim();
      if (response) {
        console.log(`[AI Match Engine] Generated tailored hook: "${response}"`);
        return response;
      }
    } catch (err: any) {
      console.warn(`[AI Match Engine] Groq error during dynamic tailoring: ${err.message}. Falling back to rule-based engine.`);
    }
  }

  // 2. Rule-Based Fallback Engine
  console.log(`[AI Match Engine] Using rule-based regex keyword matching to tailor cover letter...`);
  const dynamicHooks: string[] = [];

  // Match AI/LLM/Agents
  if (lowerText.includes('ai') || lowerText.includes('agent') || lowerText.includes('chatbot') || lowerText.includes('llm') || lowerText.includes('gpt') || lowerText.includes('claude')) {
    dynamicHooks.push("I notice your focus on AI/Agent capabilities. I have recently designed and deployed multiple autonomous AI agents, including conversational chatbots and stealth browser-automation platforms, utilizing Claude AI, Llama 3, and Groq APIs.");
  }
  // Match Payment Gateway
  if (lowerText.includes('payment') || lowerText.includes('gateway') || lowerText.includes('billing') || lowerText.includes('razorpay') || lowerText.includes('cashfree') || lowerText.includes('checkout') || lowerText.includes('stripe')) {
    dynamicHooks.push("I notice you require payment processing integrations. In my previous roles, I have integrated Razorpay, Cashfree, and Instamojo for real-time payment collection with automated confirmation and refund webhooks.");
  }
  // Match Performance/Speed
  if (lowerText.includes('performance') || lowerText.includes('optimization') || lowerText.includes('speed') || lowerText.includes('seo') || lowerText.includes('lcp') || lowerText.includes('lighthouse')) {
    dynamicHooks.push("I see performance is a key priority for you. I specialize in web optimization and bundle size reduction, having successfully achieved sub-2s LCP on high-traffic student CRM and portal pages.");
  }
  // Match Angular
  if (lowerText.includes('angular')) {
    dynamicHooks.push("I notice your stack includes Angular. In addition to my extensive React/Next.js experience, I have hands-on experience building internal staff dashboard views and component libraries using Angular.");
  }
  // Match Material UI / UI libraries
  if (lowerText.includes('material ui') || lowerText.includes('mui') || lowerText.includes('ant design') || lowerText.includes('antd')) {
    dynamicHooks.push("I see you value experience with structured design systems. I am highly proficient in component-driven development using Material UI and Ant Design to build pixel-perfect UI layouts.");
  }

  // If we found specific keyword matches, join them (up to 2 hooks), otherwise return a general matching statement
  if (dynamicHooks.length > 0) {
    const combined = dynamicHooks.slice(0, 2).join(' ');
    console.log(`[AI Match Engine] Matched regex keywords. Selected hook: "${combined}"`);
    return combined;
  }

  // General fallback hook
  const defaultHook = "Given my background in React, Next.js, and TypeScript, I am confident in my ability to build clean, performant user interfaces and contribute to your team immediately.";
  console.log(`[AI Match Engine] No specific keywords matched. Using default hook: "${defaultHook}"`);
  return defaultHook;
}

// Evaluates if a job post matches Shatadal's background (allowing a relaxed 30-45% overlap) using Groq/Llama 3
async function checkJobMatchWithAI(postText: string, parsedInfo: any): Promise<boolean> {
  const client = getGroqClient();
  const postTextLower = postText.toLowerCase();

  // Shatadal's core stack checking (Relaxed: matches React/Next, general frontend, or React Native)
  const coreSkills = ['react', 'next.js', 'nextjs', 'angular', 'typescript', 'frontend', 'front-end', 'ui developer', 'ui engineer', 'web developer', 'react native', 'react-native'];
  const matchesCore = coreSkills.some(skill => postTextLower.includes(skill));

  // Exclude only strictly unrelated positions (DevOps, QA, pure backend with no JS frontend involvement, sales, HR)
  const backendOnlyKeywords = [
    'python developer', 'django developer', 'java developer', 'springboot', 'golang developer', 
    'devops engineer', 'qa tester', 'manual tester', 'automation tester', 'sales executive', 
    'hr manager', 'php developer', 'laravel developer', 'wordpress developer', 'flutter developer', 
    'android developer', 'ios developer', 'swift developer', 
    'business analyst', 'product manager', 'scrum master', 'data scientist', 'system administrator'
  ];
  
  // If post contains backend/mobile keywords but also mentions react/frontend, it is allowed (partial overlap)
  const isExcluded = backendOnlyKeywords.some(keyword => postTextLower.includes(keyword)) && 
                     !postTextLower.includes('react') && 
                     !postTextLower.includes('frontend') && 
                     !postTextLower.includes('front-end') && 
                     !postTextLower.includes('next.js') && 
                     !postTextLower.includes('nextjs');

  // Pre-filter: If it doesn't match our stack locally, skip immediately to save AI tokens and time
  if (!matchesCore || isExcluded) {
    console.log(`[AI Match Guard] Skipping role "${parsedInfo.roleTitle}" - Local stack check mismatch.`);
    return false;
  }

  // If Groq client is not available, return true since it passed our local stack validation
  if (!client) {
    console.log(`[AI Match Guard] Groq offline. Local match passed for "${parsedInfo.roleTitle}".`);
    return true;
  }

  console.log(`[AI Match Guard] Evaluating job alignment with Groq (30-45% Match Target, Max 8 Years Exp)...`);
  const prompt = `You are a recruitment assistant verifying if a job description matches the profile of Shatadal Sundar Sinha. We want to be inclusive and match if there is at least a 30-45% overlap with his skillset.
  
Candidate Profile:
- Core Role: Senior Frontend Developer / UI Engineer
- Core Skills: React.js, Next.js, TypeScript, JavaScript (ES6+), Angular, HTML5, CSS3, Material UI (MUI), Ant Design, Tailwind CSS
- Experience: ~5 years. Target matching jobs requiring 1 to 8 years of experience.
- Target Areas: Frontend Development, React/Next.js UI, Angular UI modules, React Native mobile apps, or Full-Stack developer positions (using React/Next on frontend and Node.js on backend).

Match Criteria:
- YES: The job description requires React, Next.js, TypeScript, general Frontend, Angular, UI development, React Native, or Full-Stack React development.
- YES: The required experience is in the range of 1 to 8 years (e.g. 2 years, 3 years, 5 years, or up to 7-8 years).
- YES: If the post is very short, or does not specify the required years of experience, assume it is acceptable and return YES (unless it is for a Principal/Lead/Architect role demanding 9+ years).
- NO: The job requires MORE than 8 years of experience (e.g., 9+, 10+, 12+ years of experience, or Principal/Lead/Architect roles demanding 9+ years).
- NO: The job is exclusively backend (e.g. Java Spring Boot, Django, Python with no frontend mention), DevOps, QA/testing, sales, recruitment, or non-technical.

Job Description/Post Text:
"""
${postText}
"""

Instructions:
Evaluate the job post and respond with "YES" if it meets the 30-45% matching threshold AND (requires 8 years of experience or less OR does not specify experience).
Otherwise, respond with "NO".
Output ONLY "YES" or "NO". Do not include any explanation or extra text.`;

  try {
    const chatCompletion = await client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      max_tokens: 15,
    });

    const rawResponse = (chatCompletion.choices[0]?.message?.content || '').trim().toUpperCase();
    const words = rawResponse.replace(/[^A-Z]/g, ' ').split(/\s+/);
    const isYes = words.includes('YES');

    console.log(`[AI Match Guard] Match Decision: "${isYes ? 'YES' : 'NO'}" (raw response: "${rawResponse}") for post of role: "${parsedInfo.roleTitle}"`);
    return isYes;
  } catch (err: any) {
    console.warn(`[AI Match Guard] Groq error during job matching: ${err.message}. Defaulting to local validation.`);
    return true; // Default to true since local pre-filter passed
  }
}

// Generates a fully dynamic cover letter using Llama 3 via Groq, tailored to the specific JD/post text
async function generateTailoredCoverLetter(postText: string, parsedInfo: any): Promise<string> {
  const client = getGroqClient();
  const recipient = parsedInfo.authorName && parsedInfo.authorName !== 'Recruiter' ? parsedInfo.authorName : 'Hiring Team';

  if (client) {
    console.log(`[AI Outreach Engine] Groq client active. Generating fully tailored cover letter...`);
    const prompt = `You are an AI assistant helping Shatadal Sundar Sinha (Senior Frontend Developer) write a highly tailored, professional outreach email to a recruiter or hiring manager.

Candidate Background:
- Name: Shatadal Sundar Sinha
- Core Role: Senior Frontend Developer / Senior UI Developer / UI Engineer
- Experience: ~5 years (specializing in React, Next.js, TypeScript, JavaScript, HTML, CSS, and Angular)
- Key Projects:
  1. WebSkitters Academy (Student CRM Portal - Frontend Lead): Built frontend from scratch using Next.js, TypeScript, and Material UI. Integrated Razorpay, Cashfree, and Instamojo. Achieved sub-2s LCP for improved user retention.
  2. Qpulse AI-Powered Resume Builder: Next.js + TypeScript AI builder and dashboard, integrated AI chatbot and roadmap APIs. Assisted in Node.js REST APIs.
  3. AI Job-Application Automation Agent: Built autonomous browser automation using Playwright/Puppeteer and Groq/Claude APIs.
  4. Personal AI Agent: Conversational AI representing his profile, hosted at shatadalpersonalassistent.vercel.app
- Notice Period: Immediate Joiner (0 days notice)
- Expected Salary: 10-14 LPA

Job Description / Post Details:
Role: ${parsedInfo.roleTitle || 'Senior Frontend Developer'}
Company: ${parsedInfo.company || 'Hiring Company'}
Recipient Name: ${recipient}
Post Text:
"""
${postText}
"""

Instructions:
1. Write a professional, concise cover letter (maximum 3 paragraphs).
2. Speak in first person ("I have...", "I am...", "My experience..."). Make it sound natural, direct, and conversational.
3. Read the Job Description carefully. Highlight the candidate's skills, technologies, and projects that directly align with the JD's requirements.
4. Mention the candidate's personal AI Agent (shatadalpersonalassistent.vercel.app) as an example of their work.
5. The cover letter MUST start with "Dear ${recipient}," and end exactly with the signature block:

Best regards,
Shatadal Sundar Sinha
Email: shatadal17@gmail.com
Phone: +91 70636 44658 / +91 93824 68250
Kolkata, West Bengal, India
Personal AI Agent: shatadalpersonalassistent.vercel.app

Do NOT output any subject line, notes, intro, or wrap the cover letter in extra conversational text. Return ONLY the letter content.`;

    try {
      const chatCompletion = await client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.1-8b-instant',
        temperature: 0.4,
        max_tokens: 450,
      });

      const response = (chatCompletion.choices[0]?.message?.content || '').trim();
      if (response && response.includes('Shatadal')) {
        console.log(`[AI Outreach Engine] Successfully generated tailored cover letter.`);
        return response;
      }
    } catch (err: any) {
      console.warn(`[AI Outreach Engine] Groq error during cover letter generation: ${err.message}. Falling back to template.`);
    }
  }

  // Fallback to template if AI generation fails or is offline
  console.log(`[AI Outreach Engine] Falling back to standard template-based cover letter...`);
  const tailoredParagraph = await generateJDTailoredParagraph(postText);
  return `Dear ${recipient},\n\nI hope this email finds you well.\n\nI came across your open requirements for a ${parsedInfo.roleTitle || 'Frontend Developer'} and wanted to share my profile for this position. I am a Senior Frontend Developer & UI Engineer with 5 years of experience specializing in building high-performance web applications using React, Next.js, and TypeScript.\n\n${tailoredParagraph}\n\nIn my previous roles, I have designed and delivered scalable student CRM systems, AI-powered resume builders, and browser-automation platforms. I specialize in web optimization, clean responsive UI design, and pixel-perfect implementation.\n\nI would love to connect and discuss how my expertise in modern frontend technologies can add value to your team. You can also interact with my personal AI agent at shatadalpersonalassistent.vercel.app to query my background directly.\n\nLooking forward to hearing from you.\n\nBest regards,\nShatadal Sundar Sinha\nEmail: shatadal17@gmail.com\nPhone: +91 70636 44658 / +91 93824 68250\nKolkata, West Bengal, India\nPersonal AI Agent: shatadalpersonalassistent.vercel.app`;
}

// Automatically triggers outreach emails for newly collected leads
async function autoSendFeedOutreach() {
  console.log(`\n[LinkedIn Feed Scouter] 📬 Starting automatic outreach for newly collected leads...`);
  
  const dataDir = path.join(__dirname, 'data');
  const leadsFilePath = path.join(dataDir, 'feed_leads.json');
  const configFilePath = path.join(dataDir, 'email_config.json');

  if (!fs.existsSync(leadsFilePath)) {
    console.log(`[LinkedIn Feed Scouter] No leads file found at ${leadsFilePath}. Auto-outreach aborted.`);
    return;
  }

  if (!fs.existsSync(configFilePath)) {
    console.log(`[LinkedIn Feed Scouter] SMTP config missing at ${configFilePath}. Auto-outreach aborted.`);
    return;
  }

  // 1. Load SMTP Config
  let config: any = null;
  try {
    const configContent = fs.readFileSync(configFilePath, 'utf-8');
    config = JSON.parse(configContent);
  } catch (e) {
    console.error(`[LinkedIn Feed Scouter] Error parsing email config:`, e);
    return;
  }

  if (!config || !config.username || !config.password) {
    console.log(`[LinkedIn Feed Scouter] SMTP login credentials missing in config. Auto-outreach aborted.`);
    return;
  }

  // 2. Load collected leads
  let leads: FeedLead[] = [];
  try {
    const leadsContent = fs.readFileSync(leadsFilePath, 'utf-8');
    leads = JSON.parse(leadsContent);
  } catch (e) {
    console.error(`[LinkedIn Feed Scouter] Error parsing leads file:`, e);
    return;
  }

  // 3. Find pending leads (not emailed yet)
  const pendingLeads = leads.filter(l => !l.emailedAt);
  if (pendingLeads.length === 0) {
    console.log(`[LinkedIn Feed Scouter] No new pending leads found to email.`);
    return;
  }

  console.log(`[LinkedIn Feed Scouter] Found ${pendingLeads.length} new lead(s) for automatic outreach.`);

  // 4. Create SMTP Transporter
  let transporter;
  try {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: parseInt(config.port) || 465,
      secure: !!config.secure,
      auth: {
        user: config.username,
        pass: config.password
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  } catch (err: any) {
    console.error(`[LinkedIn Feed Scouter] Failed to create nodemailer transporter:`, err.message);
    return;
  }

  const fromAddress = config.senderEmail 
    ? `"${config.senderName}" <${config.senderEmail}>`
    : `"${config.senderName}" <${config.username}>`;

  // Attach profile picture if available locally
  const attachments: any[] = [];
  const picPath = path.join(process.cwd(), 'public', 'profile-pic.jpg');
  if (fs.existsSync(picPath)) {
    attachments.push({
      filename: 'profile-pic.jpg',
      path: picPath,
      cid: 'profile-pic'
    });
  }

  // 5. Send dynamic cover letter outreach to each pending lead
  let processedCount = 0;
  let sentCount = 0;
  for (const lead of pendingLeads) {
    try {
      const parsed = parseLeadPost(lead);
      
      // Dynamic Subject Line
      const subject = parsed.roleTitle && parsed.company && parsed.company !== 'Hiring Manager'
        ? `Application for ${parsed.roleTitle} at ${parsed.company} - Shatadal Sundar Sinha`
        : parsed.roleTitle
        ? `Senior Frontend Developer Opportunity - ${parsed.roleTitle} - Shatadal Sundar Sinha`
        : `Senior Frontend Developer Opportunity - Shatadal Sundar Sinha`;

      // Generate customized cover letter dynamically tailored by AI
      const coverLetter = await generateTailoredCoverLetter(lead.postText, parsed);

      const htmlContent = getGraphicOutreachTemplate(coverLetter);

      console.log(`[LinkedIn Feed Scouter] ✉️ Sending auto-email to: ${lead.email} | Subject: "${subject}"...`);
      
      await transporter.sendMail({
        from: fromAddress,
        to: lead.email,
        subject: subject,
        html: htmlContent,
        attachments: attachments
      });

      // Update lead to reflect emailed status
      lead.emailedAt = new Date().toISOString();
      lead.emailedSubject = subject;
      lead.outreachFailed = false;
      lead.outreachError = undefined;
      sentCount++;
      processedCount++;
      
      // Safety delay to prevent spam flags
      await delay(2500);
    } catch (sendErr: any) {
      console.error(`[LinkedIn Feed Scouter] ❌ Failed to send auto-email to ${lead.email}:`, sendErr.message);
      lead.outreachFailed = true;
      lead.outreachError = sendErr.message || 'Unknown delivery failure';
      lead.emailedAt = undefined;
      lead.emailedSubject = undefined;
      processedCount++;
    }
  }

  // Save progress back to feed_leads.json
  if (processedCount > 0) {
    try {
      fs.writeFileSync(leadsFilePath, JSON.stringify(leads, null, 2), 'utf-8');
      console.log(`[LinkedIn Feed Scouter] ✅ Auto-outreach pass complete. Sent: ${sentCount}, Failed: ${processedCount - sentCount}. Saved progress.`);
    } catch (saveErr: any) {
      console.error(`[LinkedIn Feed Scouter] Failed to write updated leads file:`, saveErr.message);
    }
  }
}

function extractEmails(text: string): string[] {
  if (!text) return [];
  
  const emails: string[] = [];
  const standardRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  
  // Normalize obfuscation and spacing:
  // e.g. name [at] domain.com, name(at)domain.com, name at domain dot com, name @ domain . com
  let cleanText = text
    .replace(/\s*\[\s*at\s*\]\s*/gi, '@')
    .replace(/\s*\(\s*at\s*\)\s*/gi, '@')
    .replace(/\s*\{\s*at\s*\}\s*/gi, '@')
    .replace(/\s*@\s*/g, '@')
    .replace(/\s*\[\s*dot\s*\]\s*/gi, '.')
    .replace(/\s*\(\s*dot\s*\)\s*/gi, '.')
    .replace(/\s*\{\s*dot\s*\}\s*/gi, '.')
    .replace(/\s*\.\s*/g, '.');
  
  cleanText = cleanText.replace(/\s+at\s+/gi, '@');
  cleanText = cleanText.replace(/\s+dot\s+/gi, '.');

  const matches = cleanText.match(standardRegex);
  if (matches) {
    matches.forEach(email => {
      const normalized = email.trim().toLowerCase();
      if (!emails.includes(normalized)) {
        emails.push(normalized);
      }
    });
  }
  
  return emails;
}

async function runLinkedInFeedScouter(page: any) {
  console.log('\n[LinkedIn Feed Scouter] Starting Home Feed scouting...');
  await updateAgentStatus(page, 'Navigating to LinkedIn Feed');
  
  try {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
  } catch (err: any) {
    console.warn(`[LinkedIn Feed Scouter] Warning during feed navigation: ${err.message}`);
  }
  await randomDelay(2000, 3500);

  const loggedIn = await isLinkedInLoggedIn(page);
  if (!loggedIn) {
    console.warn('[LinkedIn Feed Scouter] Not logged in to LinkedIn. Skipping feed scouter.');
    return;
  }

  // Inject CSS to completely hide and disable all modals, overlays, and dialogs on the Feed page
  try {
    await page.addStyleTag({
      content: `
        .artdeco-modal, 
        .artdeco-modal-overlay, 
        div[role="dialog"], 
        .artdeco-modal-overlay--inset-0,
        div[class*="modal-overlay"],
        div[class*="modal-backdrop"],
        div[class*="dialog-overlay"],
        div[class*="upsell-modal"],
        div[class*="premium-modal"],
        div[class*="promo-modal"],
        [class*="upsell"],
        [class*="premium-prompt"] {
          display: none !important;
          pointer-events: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          width: 0 !important;
          height: 0 !important;
        }
        body, html {
          overflow: auto !important;
          overflow-y: auto !important;
          position: static !important;
        }
      `
    });
    console.log('[LinkedIn Feed Scouter] Injected CSS modal overlay blocker successfully.');
  } catch (cssErr: any) {
    console.warn(`[LinkedIn Feed Scouter] CSS injection failed: ${cssErr.message}`);
  }

  // Dismiss any blocking modals/popups right away (e.g. premium overlays)
  await dismissLinkedInPostApplyModal(page);

  // Search queries to loop through dynamically
  const searchQueries = [
    'hiring React js',
    'hiring Next js',
    'hiring Frontend developer',
    'hiring Senior Frontend developer',
    'hiring Full Stack Developer',
    'hiring UI developer'
  ];

  let currentQueryIndex = 0;
  let lastQuerySwitchTime = 0;
  // Change search terms every 90 seconds (1.5 minutes) to cover all of them within 10 minutes run
  const QUERY_DURATION = 90 * 1000;

  // Track emails processed in this run to prevent duplicates
  const processedEmailsThisRun = new Set<string>();

  const duration = 10 * 60 * 1000; // 10 minutes in ms
  const startTime = Date.now();
  let loopCount = 0;

  console.log(`[LinkedIn Feed Scouter] Will run continuous search-based scouting for 10 minutes.`);

  while (Date.now() - startTime < duration) {
    loopCount++;
    const minutesLeft = Math.ceil((duration - (Date.now() - startTime)) / 60000);
    console.log(`[LinkedIn Feed Scouter] Loop #${loopCount} | Time remaining: ~${minutesLeft} minute(s)`);

    // URL & Search Query Switch Check
    const currentUrl = page.url();
    const isSearchPage = currentUrl.includes('/search/results/content');
    const timeSinceSwitch = Date.now() - lastQuerySwitchTime;

    if (!isSearchPage || timeSinceSwitch >= QUERY_DURATION) {
      const query = searchQueries[currentQueryIndex];
      console.log(`[LinkedIn Feed Scouter] Navigating to search query: "${query}" (Loop #${loopCount}, Index: ${currentQueryIndex})...`);
      await updateAgentStatus(page, `Searching: ${query}`);
      
      try {
        const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
        lastQuerySwitchTime = Date.now();
        currentQueryIndex = (currentQueryIndex + 1) % searchQueries.length;
      } catch (err: any) {
        console.warn(`[LinkedIn Feed Scouter] Warning during search navigation: ${err.message}`);
      }
      // Give page some extra time to load search results
      await randomDelay(3000, 5000);
      continue;
    }

    await updateAgentStatus(page, `Scouting posts (~${minutesLeft}m left)`);

    // 1. Scroll down a bit to trigger loading more posts
    console.log('[LinkedIn Feed Scouter] Scrolling search results to load more posts...');
    for (let s = 0; s < 2; s++) {
      await dismissLinkedInPostApplyModal(page);
      await humanScroll(page, 1200);
      await page.waitForTimeout(200);
    }

    // 2. Dismiss popup modals
    await dismissLinkedInPostApplyModal(page);

    // 3. Find and click all visible "...see more" buttons in parallel ONLY inside feed post containers to prevent widget redirects
    console.log('[LinkedIn Feed Scouter] Finding and expanding all "see more" buttons in parallel inside feed updates...');
    const expandedCount = await page.evaluate(() => {
      // Query only post elements
      const posts = Array.from(document.querySelectorAll('article, .feed-shared-update-v2, [data-activity-urn], [data-urn*="activity:"], [data-urn*="fs_updateV2:"], .reusable-search__result-container, [data-testid="search-activity-card"], [class*="feed-shared-update"]'));
      let count = 0;
      
      posts.forEach((post) => {
        const elements = Array.from(post.querySelectorAll('button, span, [class*="see-more" i], [class*="show-more" i]'));
        elements.forEach((el: any) => {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden';
          if (!isVisible) return;

          // Prevent clicking links that navigate the tab away
          if (el.tagName === 'A' || el.getAttribute('href')) return;

          const txt = (el.textContent || '').trim().toLowerCase();
          const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
          
          const isSeeMore = txt === '... more' || 
                            txt === 'see more' || 
                            txt === '...see more' || 
                            className.includes('see-more') || 
                            className.includes('show-more');
                            
          if (isSeeMore) {
            try {
              el.click();
              count++;
            } catch (e) {}
          }
        });
      });
      return count;
    }).catch(() => 0);
    console.log(`[LinkedIn Feed Scouter] Expanded ${expandedCount} see-more buttons in parallel.`);
    await page.waitForTimeout(300); // single shorter wait for parallel layout update

    const postsData = await page.evaluate(() => {
      const data: any[] = [];
      const articles = document.querySelectorAll('article, .feed-shared-update-v2, [data-activity-urn], [data-urn*="activity:"], [data-urn*="fs_updateV2:"], .reusable-search__result-container, [data-testid="search-activity-card"], [class*="feed-shared-update"]');
      
      articles.forEach((card, index) => {
        // Find text container inside the post card
        const textContainer = card.querySelector('.feed-shared-update-v2__description, .update-components-text, div[class*="feed-shared-inline-show-more-text"], [data-testid="expandable-text-box"], .feed-shared-text-view');
        const postText = textContainer ? (textContainer as any).innerText || '' : (card as any).innerText || '';
        if (!postText.trim()) return;
        
        const authorLink = card.querySelector('a[href*="/in/"], a[href*="/company/"]');
        let authorProfile = '';
        let authorName = '';
        
        if (authorLink) {
          authorProfile = authorLink.getAttribute('href') || '';
          const img = authorLink.querySelector('img');
          const imgAlt = img ? img.getAttribute('alt') : '';
          if (imgAlt && imgAlt.includes('profile')) {
            authorName = imgAlt.replace(/View\s+/i, '').replace(/’s\s+profile/i, '').replace(/'s\s+profile/i, '').trim();
          }
          
          if (!authorName) {
            authorName = (authorLink as any).innerText.split('\n')[0].trim();
          }
        }
        
        let authorHeadline = '';
        const headerTexts = Array.from(card.querySelectorAll('p, span'))
          .map(e => ((e as any).innerText || '').trim())
          .filter(t => t.length > 0);
        
        const nameIndex = headerTexts.indexOf(authorName);
        if (nameIndex !== -1 && headerTexts[nameIndex + 1]) {
          const candidateHeadline = headerTexts[nameIndex + 1];
          if (candidateHeadline.length > 5 && !postText.includes(candidateHeadline)) {
            authorHeadline = candidateHeadline;
          }
        }
        
        data.push({
          authorName: authorName || `Recruiter #${index + 1}`,
          authorProfile: authorProfile,
          authorHeadline: authorHeadline,
          postText: postText
        });
      });
      
      return data;
    }).catch((err: any) => {
      console.error(`[LinkedIn Feed Scouter] Evaluate failed:`, err.message);
      return [];
    });

    const postCount = postsData.length;
    console.log(`[LinkedIn Feed Scouter] Found and parsed ${postCount} post containers in current view.`);

    const hiringKeywords = [
      'hiring', 'recruiting', 'looking for', 'job opening', 'career', 'join our team', 'vacancy', 
      'apply to', 'send resume', 'send cv', 'immediate joiner', 'share resume', 'share cv', 
      'send your cv', 'send your resume', 'dm your cv', 'dm resume', 'dm me', 'hiring managers',
      'hr team', 'hr manager', 'talent acquisition', 'job opportunity', 'open position',
      'email me', 'reach out', 'write to', 'jobs', 'grow our team', 'team is growing', 'career opportunity',
      'opportunity', 'opportunities', 'join us', 'work with us', 'roles', 'openings', 'recruiter', 'hr',
      'urgent hiring', 'immediate requirement', 'urgent requirement', 'walk-in', 'walk in',
      'drop your cv', 'share your profile', 'connect with us', 'apply now', 'we are looking'
    ];
    
    const techKeywords = [
      // Core Front-End frameworks (Shatadal's primary stack)
      'react', 'react.js', 'reactjs', 'next.js', 'nextjs', 'angular', 'angularjs', 'typescript',
      'javascript', 'js', 'es6', 'es2015',
      // Role titles
      'frontend', 'front-end', 'front end', 'ui developer', 'ui engineer', 'web developer',
      'software developer', 'software engineer', 'developer', 'engineer',
      'senior developer', 'senior engineer', 'senior frontend', 'senior front-end',
      // Back-end & APIs (Shatadal has hands-on experience)
      'node', 'node.js', 'nodejs', 'express', 'express.js', 'ejs', 'rest api', 'restful',
      // Databases & state
      'mongodb', 'mongoose', 'redux', 'context api', 'react query', 'zustand',
      // Markup & styling
      'html', 'html5', 'css', 'css3', 'sass', 'scss', 'tailwind', 'tailwindcss',
      'bootstrap', 'material ui', 'mui', 'ant design', 'antd', 'styled components',
      // Full stack & SaaS domains
      'full stack', 'fullstack', 'saas', 'edtech', 'proptech', 'crm', 'dashboard', 'admin panel',
      // Payment gateways (Shatadal integrated all three)
      'razorpay', 'cashfree', 'instamojo', 'payment gateway', 'payment integration',
      // AI Agents & automation (Shatadal's growing specialisation)
      'ai agent', 'chatbot', 'browser-automation', 'browser automation', 'playwright',
      'autonomous agent', 'llm', 'generative ai', 'openai', 'groq', 'ai tools',
      // General web
      'web', 'responsive', 'figma', 'pixel perfect', 'performance optimisation'
    ];

    // Evaluate each post
    for (let i = 0; i < postCount; i++) {
      try {
        const post = postsData[i];
        const postText = post.postText;
        if (!postText) {
          continue;
        }

        const authorName = post.authorName;
        console.log(`[LinkedIn Feed Scouter] Evaluating post #${i + 1}/${postCount} by "${authorName}"...`);

        const postTextLower = postText.toLowerCase();
        
        // Check if it is a job seeker's post instead of a recruiter's post
        const jobSeekerKeywords = [
          'open to work', 'opentowork', 'seeking a new role', 'looking for a job',
          'looking for my next', 'my next opportunity', 'my next role', 'exploring my next',
          'open to new opportunities', 'looking for a frontend role', 'looking for a developer role',
          'looking for a software developer role', 'looking for a software engineer role',
          'looking for a UI developer role', 'looking for a front-end role',
          'seeking new opportunities', 'looking for new opportunities', 'looking for work',
          'looking for a new challenge', 'seeking role', 'seeking opportunity', 'looking for opportunities',
          'my next challenge', 'my next career move', 'my next adventure'
        ];

        const hasJobSeekerPhrase = jobSeekerKeywords.some(keyword => postTextLower.includes(keyword));
        const authorHeadlineLower = (post.authorHeadline || '').toLowerCase();
        const isJobSeeker = hasJobSeekerPhrase || 
                            authorHeadlineLower.includes('open to work') || 
                            authorHeadlineLower.includes('opentowork') ||
                            authorHeadlineLower.includes('seeking new opportunities') ||
                            (postTextLower.includes('actively looking') && (postTextLower.includes('my next') || postTextLower.includes('new role') || postTextLower.includes('opportunity') || postTextLower.includes('opportunities') || postTextLower.includes('join') || postTextLower.includes('position'))) ||
                            (postTextLower.includes('immediate joiner') && (postTextLower.includes('my profile') || postTextLower.includes('my cv') || postTextLower.includes('my resume') || postTextLower.includes('looking for a job') || postTextLower.includes('seeking')));

        if (isJobSeeker) {
          console.log(`[LinkedIn Feed Scouter] Post #${i + 1} by "${authorName}" matches job-seeker signature. Skipping.`);
          continue;
        }

        // Extract emails (including standard and obfuscated ones)
        const emailsMatched = extractEmails(postText);
        if (!emailsMatched || emailsMatched.length === 0) {
          console.log(`[LinkedIn Feed Scouter] Post #${i + 1} by "${authorName}" has no email addresses. Skipping.`);
          continue;
        }

        console.log(`[LinkedIn Feed Scouter] Post #${i + 1} by "${authorName}" contains email(s): ${emailsMatched.join(', ')}. Checking keywords...`);

        const matchedHiring = hiringKeywords.filter(keyword => postTextLower.includes(keyword));
        const matchedTech = techKeywords.filter(keyword => postTextLower.includes(keyword));

        const isHiring = matchedHiring.length > 0 || emailsMatched.some(e => e.includes('hr') || e.includes('career') || e.includes('job') || e.includes('hire') || e.includes('recruit') || e.includes('talent'));
        const matchesTech = matchedTech.length > 0;

        if (isHiring && matchesTech) {
          console.log(`[LinkedIn Feed Scouter] ✅ Post #${i + 1} matched! (Hiring: ${matchedHiring.join(', ')} | Tech: ${matchedTech.join(', ')})`);
          
          let companyName = '';
          const compMatch = post.authorHeadline.match(/at\s+([A-Za-z0-9\s]+)/i) || postText.match(/company:\s*([a-zA-Z0-9\s]+)/i);
          if (compMatch) {
            companyName = compMatch[1].trim();
          } else {
            companyName = post.authorHeadline.split('at')[1]?.trim() || '';
          }

          let jobType = 'Full-time';
          if (postTextLower.includes('remote')) jobType = 'Remote';
          else if (postTextLower.includes('hybrid')) jobType = 'Hybrid';
          else if (postTextLower.includes('contract') || postTextLower.includes('freelance')) jobType = 'Contract';

          let location = 'India';
          const locMatch = postText.match(/location:\s*([a-zA-Z\s,]+)/i) || postText.match(/based in\s*([a-zA-Z\s,]+)/i);
          if (locMatch) {
            location = locMatch[1].trim();
          }

          let profileUrl = post.authorProfile;
          if (profileUrl && !profileUrl.startsWith('http')) {
            profileUrl = 'https://www.linkedin.com' + profileUrl;
          }

          // Parse lead information for AI background verification
          const tempLeadForMatch = {
            postText: postText,
            companyName: companyName,
            email: emailsMatched[0] || '',
            authorName: authorName
          };
          const parsedInfo = parseLeadPost(tempLeadForMatch);

          // Verify role alignment with Shatadal's background
          const isBackgroundMatch = await checkJobMatchWithAI(postText, parsedInfo);
          if (!isBackgroundMatch) {
            console.log(`[LinkedIn Feed Scouter] Post #${i + 1} by "${authorName}" skipped (does NOT align with Senior Frontend Developer background).`);
            continue;
          }

          for (const email of emailsMatched) {
            const emailClean = email.trim().toLowerCase();
            if (processedEmailsThisRun.has(emailClean)) {
              console.log(`[LinkedIn Feed Scouter] Memory check: Duplicate lead ignored in this run: ${emailClean}`);
              continue;
            }
            processedEmailsThisRun.add(emailClean);

            const lead: FeedLead = {
              email: emailClean,
              postText: postText.substring(0, 1000),
              authorName: authorName || 'Recruiter',
              authorProfile: profileUrl || '',
              companyName: companyName || post.authorHeadline || 'Hiring Manager',
              location: location,
              jobType: jobType,
              extractedAt: new Date().toISOString(),
              postTime: 'Recent'
            };

            saveFeedLead(lead);
          }
        } else {
          console.log(`[LinkedIn Feed Scouter] Post #${i + 1} by "${authorName}" does not match criteria. (Hiring: ${isHiring ? 'Yes' : 'No'} | Tech: ${matchesTech ? 'Yes' : 'No'}). Skipping.`);
        }
      } catch (e: any) {
        // Suppress individual card errors
      }
    }

    // Brief delay between scroll loops
    await randomDelay(1000, 2000);
    await closeExtraTabs(page.context());
  }

  console.log(`[LinkedIn Feed Scouter] Continuous scouting completed successfully after 10 minutes!`);
  await updateAgentStatus(page, 'Feed Scouting Done');

  try {
    await autoSendFeedOutreach();
  } catch (outreachErr: any) {
    console.error(`[LinkedIn Feed Scouter] Auto outreach failed:`, outreachErr.message);
  }
}

// Scrape recruiter emails from other web resources (Twitter, Reddit, Facebook) using Google Search snippets
async function runGoogleSearchScouter(page: any) {
  console.log('\n[Google Search Scouter] Starting Google Search job scouter to scrape other sites...');
  await updateAgentStatus(page, 'Searching Google for other job sites');

  // Search queries targeting recruiter posts with emails on Twitter/X, Reddit, Facebook, or general blogs
  const queries = [
    'site:twitter.com "hiring" ("react" OR "nextjs" OR "typescript" OR "frontend") "email" OR "gmail" OR "outlook"',
    'site:reddit.com "hiring" ("react" OR "nextjs" OR "typescript" OR "frontend") "email" OR "gmail" OR "outlook"',
    'hiring ("react" OR "next.js" OR "typescript" OR "frontend") "email" ("gmail.com" OR "outlook.com" OR "company.com" OR "careers") -candidate -seeking -opentowork'
  ];

  for (const q of queries) {
    try {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&tbs=qdr:w`;
      console.log(`[Google Search Scouter] Running query: ${q}`);
      
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await randomDelay(4000, 7000);

      // Simple captcha check
      const html = await page.content();
      if (html.includes('detected unusual traffic') || html.includes('recaptcha') || html.includes('captcha')) {
        console.warn('[Google Search Scouter] Captcha block detected. Skipping search query.');
        continue;
      }

      // Parse search results
      const results = await page.evaluate(() => {
        const data: any[] = [];
        // Google search results are in div.g
        const cards = document.querySelectorAll('div.g');
        cards.forEach((card, index) => {
          const titleEl = card.querySelector('h3');
          const linkEl = card.querySelector('a');
          const snippetEl = card.querySelector('div.VwiC3b, div[style*="-webkit-line-clamp"], div.MU5Ud, div.yDsk6d');
          
          if (titleEl && linkEl) {
            data.push({
              title: titleEl.textContent || '',
              link: linkEl.getAttribute('href') || '',
              snippet: snippetEl ? (snippetEl as any).innerText : ''
            });
          }
        });
        return data;
      });

      console.log(`[Google Search Scouter] Found ${results.length} search results on Google.`);

      for (const res of results) {
        const text = `${res.title}\n${res.snippet}`;
        const emailsMatched = extractEmails(text);
        
        if (emailsMatched && emailsMatched.length > 0) {
          const postTextLower = text.toLowerCase();

          // Apply Job-Seeker Filter
          const jobSeekerKeywords = [
            'open to work', 'opentowork', 'seeking a new role', 'looking for a job',
            'looking for my next', 'my next opportunity', 'my next role', 'exploring my next',
            'open to new opportunities', 'seeking new opportunities', 'looking for work',
            'looking for a new challenge', 'seeking role', 'seeking opportunity', 'looking for opportunities'
          ];
          const isJobSeeker = jobSeekerKeywords.some(keyword => postTextLower.includes(keyword));
          if (isJobSeeker) {
            console.log(`[Google Search Scouter] Skipping candidate post containing job-seeker phrase.`);
            continue;
          }

          // Exclude if it looks like a recruiter's name / company is the candidate
          let companyName = 'Recruiter';
          const domainMatch = res.link.match(/https?:\/\/(?:www\.)?([^/]+)/);
          if (domainMatch && domainMatch[1]) {
            companyName = domainMatch[1]
              .replace('twitter.com', 'Twitter')
              .replace('reddit.com', 'Reddit')
              .replace('facebook.com', 'Facebook')
              .replace('instagram.com', 'Instagram');
          }

          const tempParsed = {
            roleTitle: res.title,
            company: companyName
          };

          // Apply Relaxed AI Background Guard
          const isBackgroundMatch = await checkJobMatchWithAI(text, tempParsed);
          if (!isBackgroundMatch) {
            console.log(`[Google Search Scouter] Skipping result (does NOT meet 30-45% match requirement with candidate background).`);
            continue;
          }

          // Extract job type
          let jobType = 'Full-time';
          if (postTextLower.includes('remote')) jobType = 'Remote';
          else if (postTextLower.includes('hybrid')) jobType = 'Hybrid';
          else if (postTextLower.includes('contract') || postTextLower.includes('freelance')) jobType = 'Contract';

          for (const email of emailsMatched) {
            const lead: FeedLead = {
              email: email.trim().toLowerCase(),
              postText: res.snippet || res.title,
              authorName: 'Hiring Manager',
              authorProfile: res.link,
              companyName: companyName,
              location: 'India',
              jobType: jobType,
              extractedAt: new Date().toISOString(),
              postTime: 'Recent'
            };

            saveFeedLead(lead);
          }
        }
      }
    } catch (queryErr: any) {
      console.error(`[Google Search Scouter] Query failed:`, queryErr.message);
    }
  }

  console.log('[Google Search Scouter] Finished Google Search job scouting.');
}


// Handler for LinkedIn Easy Apply Modal Steps (multi-step form fill)
async function handleLinkedInFormSteps(page: any) {
  let safetyCounter = 0;
  let isFormOpen = true;

  while (isFormOpen && safetyCounter < 15) {
    safetyCounter++;
    
    // 1. Give form elements and transitions a brief moment to load/mount
    await page.waitForTimeout(150);

    // 2. Proactively check if the application has already succeeded (Done/Success pebble)
    const successIndicators = [
      'button:has-text("Done")',
      'button:has-text("Not now")',
      'li-icon[type="success-pebble"]',
      'h3:has-text("Application submitted")',
      'h3:has-text("was sent to")'
    ];
    
    let isSuccess = false;
    for (const sel of successIndicators) {
      if (await page.locator(sel).filter({ visible: true }).count() > 0) {
        console.log(`[LinkedIn Form] ✅ Success indicator detected: "${sel}". Application submitted successfully!`);
        isSuccess = true;
        break;
      }
    }

    if (isSuccess) {
      // Click Done/Not now if visible to clean up
      const doneBtn = page.locator('button:has-text("Done"), button:has-text("Not now")').filter({ visible: true }).first();
      if (await doneBtn.count() > 0) {
        await doneBtn.click({ force: true });
        await randomDelay(300, 600);
      }
      isFormOpen = false;
      break;
    }

    // 3. Scan for active navigation buttons
    const nextBtnSelector = [
      '.artdeco-modal__actionbar button[aria-label*="Submit application"]',
      '.artdeco-modal__actionbar button[aria-label*="Next"]',
      '.artdeco-modal__actionbar button[aria-label*="Review"]',
      '.artdeco-modal__actionbar button:has-text("Next")',
      '.artdeco-modal__actionbar button:has-text("Submit")',
      '.artdeco-modal__actionbar button:has-text("Review")',
      '.artdeco-modal__actionbar button:has-text("Continue")',
      '.artdeco-modal__actionbar button:has-text("Submit application")',
      'footer button[aria-label*="Submit application"]',
      'footer button[aria-label*="Next"]',
      'footer button[aria-label*="Review"]',
      'footer button:has-text("Next")',
      'footer button:has-text("Submit")',
      'footer button:has-text("Review")',
      'footer button:has-text("Continue")',
      'footer button:has-text("Submit application")',
      // Fallbacks if not inside modal footer (excluding resume review/preview buttons)
      'button[aria-label*="Submit application"]',
      'button[aria-label*="Next"]',
      'button[aria-label*="Review"]:not([aria-label*="resume" i]):not([aria-label*="file" i]):not([aria-label*="pdf" i])',
      'button:has-text("Next")',
      'button:has-text("Submit")',
      'button:has-text("Review"):not(:has-text("resume")):not(:has-text("file")):not(:has-text("pdf"))',
      'button:has-text("Continue")',
      'button:has-text("Submit application")'
    ].join(', ');
    const nextBtn = page.locator(nextBtnSelector).filter({ visible: true }).first();
    const dismissBtn = page.locator('button[aria-label="Dismiss"]').filter({ visible: true }).first();

    if (await nextBtn.count() > 0) {
      const btnText = (await nextBtn.textContent() || '').toLowerCase();
      
      // Auto-fill typical input fields for this step
      await autoFillStandardInputs(page);

      console.log(`[LinkedIn Form] Clicking navigation button: "${btnText.trim()}"`);
      await nextBtn.click({ force: true });
      await randomDelay(400, 700);

      if (btnText.includes('submit')) {
        console.log('[LinkedIn Form] ✅ Application submitted successfully!');
        await updateAgentStatus(page, 'Submitting Application');
        isFormOpen = false;
        // Wait for submit animation/confirmation
        await randomDelay(800, 1500);
        await updateAgentStatus(page, 'Application Submitted!');
      } else {
        await updateAgentStatus(page, 'Filling Application Form');
      }
    } else {
      // If no next button is found, wait 600ms and retry (handles slow frame/question loading)
      await page.waitForTimeout(600);
      const nextBtnRetry = page.locator(nextBtnSelector).filter({ visible: true }).first();
      if (await nextBtnRetry.count() > 0) {
        continue;
      }

      console.log('[LinkedIn Form] No active next/submit button after wait. Closing modal...');
      if (await dismissBtn.count() > 0) {
        await dismissBtn.click({ force: true });
        await randomDelay(300, 600);
        // Confirm discard if prompted
        const discardBtn = page.locator('button[data-control-name="discard_application_confirm_btn"]').filter({ visible: true }).first();
        if (await discardBtn.count() > 0) {
          await discardBtn.click({ force: true });
          await randomDelay(300, 600);
        }
      }
      isFormOpen = false;
    }
  }
}

// Helper to dismiss LinkedIn post-apply success modals or profile upgrade prompts
async function dismissLinkedInPostApplyModal(page: any) {
  try {
    const dismissSelectors = [
      // Safe, un-prefixed selectors (specific to dismiss modal overlays)
      'button[aria-label="Dismiss"]',
      'button[aria-label*="dismiss" i]',
      'button.artdeco-modal__dismiss',
      '.artdeco-modal__dismiss',
      'button[data-test-modal-close-btn]',
      'button:has-text("Not now")',
      'button:has-text("No thanks")',
      'button:has-text("Maybe later")',
      'button:has-text("Done")',
      
      // Modal-prefixed generic close selectors (scoped so they don't match chat carets)
      '.artdeco-modal button[aria-label*="close" i]',
      'div[role="dialog"] button[aria-label*="close" i]',
      'div[role="dialog"] button:has-text("Dismiss")',
      'div.artdeco-modal-overlay button[aria-label*="close" i]',
      '#artdeco-modal-outlet button[aria-label="Dismiss"]'
    ];
    
    for (const selector of dismissSelectors) {
      const btn = page.locator(selector).filter({ visible: true }).first();
      if (await btn.count() > 0) {
        console.log(`[LinkedIn] Success modal/overlay detected. Dismissing with button selector: "${selector}"`);
        await btn.click({ force: true }).catch(() => {});
        await randomDelay(600, 1000);
        break; // Successfully clicked a dismiss button on the modal, exit loop
      }
    }

    // Proactively close the "Discard application confirmation" dialog if it got opened by accident
    const discardConfirmBtn = page.locator('button:has-text("Discard"), button[data-test-dialog-primary-btn]').filter({ visible: true }).first();
    if (await discardConfirmBtn.count() > 0) {
      console.log('[LinkedIn] Discard confirmation dialog detected. Clicking Discard to restore state...');
      await discardConfirmBtn.click({ force: true });
      await randomDelay(600, 1000);
    }
  } catch (err: any) {
    console.warn(`[LinkedIn] Success modal dismissal skipped: ${err.message}`);
  }
}

// Auto-fills standard inputs inside form containers
async function autoFillStandardInputs(page: any) {
  // Proactively upload resume or files if file inputs are present
  try {
    const fileInputs = page.locator('input[type="file"]');
    const fileCount = await fileInputs.count();
    for (let i = 0; i < fileCount; i++) {
      const fileInput = fileInputs.nth(i);
      if (await fileInput.isVisible()) {
        const resumePath = path.join(process.cwd(), 'public', 'resume.pdf');
        if (fs.existsSync(resumePath)) {
          console.log(`[LinkedIn Form] Uploading resume from: ${resumePath}`);
          await fileInput.setInputFiles(resumePath);
          await randomDelay(1000, 1800);
        }
      }
    }
  } catch (err: any) {
    console.warn(`[LinkedIn Form] File upload skipped or failed: ${err.message}`);
  }

  // Fill text fields & textareas
  const inputSelector = 'input[type="text"], input[type="number"], input[type="tel"], input[type="email"], input:not([type]), textarea';
  const textInputs = page.locator(inputSelector);
  const textCount = await textInputs.count();
  for (let i = 0; i < textCount; i++) {
    const input = textInputs.nth(i);
    try {
      // Exclude hidden, disabled, and readonly inputs
      if (await input.isDisabled() || !(await input.isVisible()) || !(await input.isEditable())) {
        continue;
      }
      
      const val = await input.inputValue();
      if (!val) {
        const labelText = await getLabelTextForInput(page, input);
        await fillSingleInput(page, input, labelText);
      }
    } catch (e: any) {
      console.warn(`[LinkedIn Form] Failed to fill field: ${e.message}`);
    }
  }

  // Handle dropdowns (select elements)
  try {
    const selects = page.locator('select');
    const selectCount = await selects.count();
    for (let i = 0; i < selectCount; i++) {
      const sel = selects.nth(i);
      try {
        if (await sel.isDisabled() || !(await sel.isVisible())) {
          continue;
        }

        const labelText = await getLabelTextForInput(page, sel);
        const options = await sel.locator('option').all();
        const optionTexts = await Promise.all(options.map((o: any) => o.textContent()));
        
        let matchSelected = false;

        if (labelText.includes('notice') || labelText.includes('joining') || labelText.includes('join')) {
          const priorityKeywords = ['immediate', '0 days', 'serving notice', '15 days', '30 days', '1 month'];
          let targetIndex = -1;
          for (const kw of priorityKeywords) {
            for (let j = 0; j < optionTexts.length; j++) {
              const optText = (optionTexts[j] || '').toLowerCase();
              if (optText.includes(kw)) {
                targetIndex = j;
                break;
              }
            }
            if (targetIndex !== -1) break;
          }
          if (targetIndex !== -1) {
            await sel.selectOption({ index: targetIndex }).catch(() => {});
            matchSelected = true;
          }
        } else if (labelText.includes('experience') || labelText.includes('year')) {
          let targetIndex = -1;
          for (let j = 0; j < optionTexts.length; j++) {
            const optText = (optionTexts[j] || '').toLowerCase();
            if (optText.includes('5') || optText.includes('4') || optText.includes('3-5') || optText.includes('3 to 5') || optText.includes('5-7') || optText.includes('5 to 7')) {
              targetIndex = j;
              break;
            }
          }
          if (targetIndex !== -1) {
            await sel.selectOption({ index: targetIndex }).catch(() => {});
            matchSelected = true;
          }
        } else if (labelText.includes('currency') || labelText.includes('salary') || labelText.includes('ctc') || labelText.includes('inr') || labelText.includes('rupee')) {
          let targetIndex = -1;
          for (let j = 0; j < optionTexts.length; j++) {
            const optText = (optionTexts[j] || '').toLowerCase();
            if (optText.includes('inr') || optText.includes('rupee') || optText.includes('₹')) {
              targetIndex = j;
              break;
            }
          }
          if (targetIndex !== -1) {
            await sel.selectOption({ index: targetIndex }).catch(() => {});
            matchSelected = true;
          }
        } else if (labelText.includes('country') || labelText.includes('nation')) {
          let targetIndex = -1;
          for (let j = 0; j < optionTexts.length; j++) {
            const optText = (optionTexts[j] || '').toLowerCase();
            if (optText.includes('india') || optText.trim() === 'in') {
              targetIndex = j;
              break;
            }
          }
          if (targetIndex !== -1) {
            await sel.selectOption({ index: targetIndex }).catch(() => {});
            matchSelected = true;
          }
        } else if (labelText.includes('interview') || labelText.includes('availability') || labelText.includes('time slot') || labelText.includes('schedule') || labelText.includes('date')) {
          const targetIndex = optionTexts.length > 1 ? 1 : 0;
          await sel.selectOption({ index: targetIndex }).catch(() => {});
          matchSelected = true;
        }

        // Dropdown fallback to AI solver if heuristics didn't match
        if (!matchSelected && optionTexts.length > 1) {
          console.log(`[LinkedIn Form] Uncommon select dropdown: "${labelText}". Querying Groq AI...`);
          try {
            await sel.focus().catch(() => {});
          } catch {}
          await updateAgentStatus(page, 'Thinking with AI');
          const aiOptionIndexStr = await askAI(labelText, 'select', optionTexts);
          const aiOptionIndex = parseInt(aiOptionIndexStr);
          if (!isNaN(aiOptionIndex) && aiOptionIndex >= 0 && aiOptionIndex < optionTexts.length) {
            console.log(`[LinkedIn Form] Selecting AI option: "${optionTexts[aiOptionIndex]}"`);
            await updateAgentStatus(page, `Selecting "${optionTexts[aiOptionIndex]}"`);
            await sel.selectOption({ index: aiOptionIndex }).catch(() => {});
          } else {
            await sel.selectOption({ index: 1 }).catch(() => {});
          }
          await updateAgentStatus(page, 'Working');
        }
      } catch {}
    }
  } catch {}

  // Handle Radio buttons group solver
  try {
    const radioInputs = page.locator('input[type="radio"], [role="radio"]');
    const radioCount = await radioInputs.count();
    
    if (radioCount > 0) {
      // 1. Group inputs by name attribute or parent container
      const groups: { [name: string]: any[] } = {};
      for (let i = 0; i < radioCount; i++) {
        const rb = radioInputs.nth(i);
        if (await rb.isVisible() && !(await rb.isDisabled())) {
          const name = (await rb.getAttribute('name')) || `unnamed-${i}`;
          if (!groups[name]) groups[name] = [];
          groups[name].push(rb);
        }
      }
      
      // 2. Process each group
      for (const name of Object.keys(groups)) {
        const groupInputs = groups[name];
        if (groupInputs.length === 0) continue;
        
        // Check if any radio in the group is already checked
        let alreadyChecked = false;
        for (const rb of groupInputs) {
          if (await rb.isChecked()) {
            alreadyChecked = true;
            break;
          }
        }
        if (alreadyChecked) {
          console.log(`[Form Solver] Radio group "${name}" already has a selected option. Skipping.`);
          continue;
        }
        
        // Find labels/options text for each radio
        const optionTexts: string[] = [];
        const validRadios: any[] = [];
        
        for (const rb of groupInputs) {
          const id = await rb.getAttribute('id') || '';
          const valueAttr = await rb.getAttribute('value') || '';
          
          let optionText = '';
          if (id) {
            // Find label for this id
            const labelEl = page.locator(`label[for="${id}"]`).first();
            if (await labelEl.count() > 0) {
              optionText = (await labelEl.textContent() || '').trim();
            }
          }
          
          if (!optionText) {
            // Check if nested in a label
            const parentLabel = rb.locator('xpath=./ancestor::label').first();
            if (await parentLabel.count() > 0) {
              optionText = (await parentLabel.textContent() || '').trim();
            }
          }
          
          if (!optionText) {
            optionText = valueAttr.trim();
          }
          
          if (optionText) {
            // Clean up any extra newlines or spacing
            optionText = optionText.replace(/\s+/g, ' ').trim();
            optionTexts.push(optionText);
            validRadios.push(rb);
          }
        }
        
        if (validRadios.length === 0) continue;
        
        // Find the question text
        let questionText = '';
        
        // Method A: Check for legend or preceding headings in parent containers
        try {
          const firstRadio = validRadios[0];
          // Travel up to a container div
          const container = firstRadio.locator('xpath=./ancestor::div[contains(@class, "group") or contains(@class, "question") or contains(@class, "container") or contains(@class, "section") or contains(@class, "card") or contains(@class, "row") or contains(@class, "wrapper") or @role="group"][1]');
          
          if (await container.count() > 0) {
            // Find headers or labels inside container
            const headerLocators = [
              'legend',
              '.question-text',
              'h3',
              'h4',
              'span[class*="question"]',
              'div[class*="question"]',
              'label:not([for])',
              'span[class*="title"]',
              'p[class*="title"]',
              'p[class*="text"]'
            ];
            for (const hSel of headerLocators) {
              const hEl = container.locator(hSel).first();
              if (await hEl.count() > 0 && await hEl.isVisible()) {
                const text = (await hEl.textContent() || '').trim();
                if (text && text.length > 5 && !optionTexts.includes(text)) {
                  questionText = text;
                  break;
                }
              }
            }
          }
        } catch {}
        
        // Method B: Preceding sibling text if Method A failed
        if (!questionText) {
          try {
            const firstRadio = validRadios[0];
            const precedingLabel = firstRadio.locator('xpath=./preceding::label[1]');
            if (await precedingLabel.count() > 0) {
              questionText = (await precedingLabel.textContent() || '').trim();
            }
          } catch {}
        }
        
        // Fallback or generic name cleaning
        if (!questionText) {
          questionText = name.replace(/[-_]/g, ' ');
        }
        
        questionText = questionText.replace(/\s+/g, ' ').trim();
        console.log(`[Form Solver] Radio group "${name}" Question: "${questionText}" | Options: ${JSON.stringify(optionTexts)}`);
        
        // Determine option using AI solver
        await updateAgentStatus(page, 'Thinking with AI');
        const aiSelectionStr = await askAI(questionText, 'select', optionTexts);
        const aiSelectionIndex = parseInt(aiSelectionStr);
        
        if (!isNaN(aiSelectionIndex) && aiSelectionIndex >= 0 && aiSelectionIndex < validRadios.length) {
          const selectedRadio = validRadios[aiSelectionIndex];
          const selectedText = optionTexts[aiSelectionIndex];
          console.log(`[Form Solver] Selecting AI chosen radio option: "${selectedText}" (Index ${aiSelectionIndex})`);
          await updateAgentStatus(page, `Selecting "${selectedText}"`);
          await selectedRadio.check({ force: true }).catch(() => {});
        } else {
          // Default heuristic fallback: check "Yes", "More than 4 years", or first item
          let fallbackIndex = 0;
          for (let idx = 0; idx < optionTexts.length; idx++) {
            const opt = optionTexts[idx].toLowerCase();
            if (opt.includes('yes') || opt.includes('more than 4') || opt.includes('5 years') || opt.includes('immediate')) {
              fallbackIndex = idx;
              break;
            }
          }
          console.log(`[Form Solver] Fallback selecting radio index: ${fallbackIndex}`);
          await validRadios[fallbackIndex].check({ force: true }).catch(() => {});
        }
        await updateAgentStatus(page, 'Working');
      }
    }
  } catch (err: any) {
    console.warn(`[Form Solver] Error during radio buttons resolution: ${err.message}`);
  }

  // Handle Checkboxes solver
  try {
    const checkboxes = page.locator('input[type="checkbox"], [role="checkbox"]');
    const checkboxCount = await checkboxes.count();
    
    if (checkboxCount > 0) {
      console.log(`[Form Solver] Found ${checkboxCount} checkbox fields. Resolving...`);
      for (let i = 0; i < checkboxCount; i++) {
        const cb = checkboxes.nth(i);
        if (await cb.isVisible() && !(await cb.isDisabled()) && !(await cb.isChecked())) {
          // Extract label text
          const id = await cb.getAttribute('id') || '';
          let labelText = '';
          if (id) {
            const labelEl = page.locator(`label[for="${id}"]`).first();
            if (await labelEl.count() > 0) {
              labelText = (await labelEl.textContent() || '').trim();
            }
          }
          if (!labelText) {
            const parentLabel = cb.locator('xpath=./ancestor::label').first();
            if (await parentLabel.count() > 0) {
              labelText = (await parentLabel.textContent() || '').trim();
            }
          }
          if (!labelText) {
            // Check preceding sibling or name
            labelText = (await cb.getAttribute('name') || '').replace(/[-_]/g, ' ');
          }
          
          labelText = labelText.replace(/\s+/g, ' ').trim().toLowerCase();
          
          // Heuristics for automatic checkbox checking
          const shouldCheck = 
            // 1. Consent, terms, declarations, authorize, certify, truth, confirmation
            labelText.includes('agree') ||
            labelText.includes('accept') ||
            labelText.includes('terms') ||
            labelText.includes('condition') ||
            labelText.includes('consent') ||
            labelText.includes('policy') ||
            labelText.includes('privacy') ||
            labelText.includes('declare') ||
            labelText.includes('declaration') ||
            labelText.includes('certify') ||
            labelText.includes('authorize') ||
            labelText.includes('truth') ||
            labelText.includes('correct') ||
            labelText.includes('confirm') ||
            labelText.includes('understanding') ||
            labelText.includes('verification') ||
            labelText.includes('acknowledg') ||
            labelText.includes('submit') ||
            labelText.includes('send') ||
            // 2. Core skills alignment (if they ask checkbox list of technologies)
            labelText.includes('react') ||
            labelText.includes('next.js') ||
            labelText.includes('nextjs') ||
            labelText.includes('typescript') ||
            labelText.includes('javascript') ||
            labelText.includes('frontend') ||
            labelText.includes('front-end') ||
            labelText.includes('html') ||
            labelText.includes('css') ||
            labelText.includes('angular') ||
            labelText.includes('node') ||
            labelText.includes('redux') ||
            labelText.includes('git');
            
          if (shouldCheck) {
            console.log(`[Form Solver] Checking checkbox option: "${labelText}"`);
            await cb.check({ force: true }).catch(() => {});
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Form Solver] Error during checkbox resolution: ${err.message}`);
  }

  // Run self-correcting validation repair to fix numeric/format errors before submitting
  await checkAndFixValidationErrors(page);
}


// -------------------------------------------------------------
// PIPELINE 2: INSTAHYRE AUTOMATION
// -------------------------------------------------------------
async function runInstahyrePipeline(page: any) {
  console.log('\n[Instahyre] Starting job application pipeline...');
  
  // Navigate to Instahyre dashboard/jobs page
  try {
    await page.goto('https://www.instahyre.com/candidate/opportunities/', { waitUntil: 'domcontentloaded' });
  } catch (err: any) {
    console.warn(`[Instahyre] Warning during navigation: ${err.message}`);
  }
  await randomDelay(1500, 2500);

  // Check login
  let loggedIn = await isInstahyreLoggedIn(page);

  if (!loggedIn) {
    console.log('[Instahyre] User is not logged in! Waiting for you to log in manually in the open Chrome window (auto-detecting login)...');
    
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes timeout
    
    while (!loggedIn && Date.now() - startTime < timeout) {
      if (page.isClosed()) {
        console.error('[Instahyre] Browser page was closed. Skipping Instahyre...');
        return;
      }
      await page.waitForTimeout(2000);
      loggedIn = await isInstahyreLoggedIn(page);
    }

    if (!loggedIn) {
      console.error('[Instahyre] Timeout waiting for login. Skipping Instahyre...');
      return;
    }
    console.log('[Instahyre] Logged in successfully!');
  }

  // Scroll to trigger lazy loading of jobs
  await updateAgentStatus(page, 'Scrolling opportunities');
  await humanScroll(page, 500);

  // Find job elements/cards
  const jobCards = page.locator('.job-card');
  const count = await jobCards.count();
  console.log(`[Instahyre] Found ${count} opportunities.`);

  for (let i = 0; i < Math.min(count, 10); i++) {
    try {
      const card = jobCards.nth(i);
      await card.scrollIntoViewIfNeeded();

      // Extract title and description
      const title = (await card.locator('.job-title').textContent() || '').trim();
      const description = (await card.locator('.job-description').textContent() || '').trim();

      await updateAgentStatus(page, `Evaluating "${title.substring(0, 15)}..."`);
      const { isMatch } = await checkProfileMatch(title, description);
      if (!isMatch) {
        console.log(`[Instahyre] Skipping job: "${title}"`);
        continue;
      }

      // Look for "1-Click Apply" or "Apply" button inside card
      const applyBtn = card.locator('button:has-text("Apply")');
      if (await applyBtn.count() > 0) {
        const btnText = await applyBtn.textContent() || '';
        if (btnText.toLowerCase().includes('applied')) {
          console.log(`[Instahyre] Already applied for: "${title}"`);
          continue;
        }

        console.log(`[Instahyre] Clicking apply for "${title}"...`);
        await updateAgentStatus(page, 'Submitting Application');
        await humanClick(page, applyBtn);
        await randomDelay(1500, 2500);
        console.log('[Instahyre] ✅ Applied successfully!');
        await updateAgentStatus(page, 'Application Submitted!');
        await page.waitForTimeout(1000);
      }

    } catch (err: any) {
      console.error(`[Instahyre] Error processing Instahyre card at index ${i}:`, err.message);
    }
  }
}

// -------------------------------------------------------------
// PIPELINE 3: INDEED AUTOMATION
// -------------------------------------------------------------
async function fillIndeedStepFields(page: any) {
  // A. Resume Upload
  const fileInput = page.locator('input[type="file"]');
  if (await fileInput.count() > 0) {
    const resumePath = path.join(process.cwd(), 'public', 'resume.pdf');
    if (fs.existsSync(resumePath)) {
      console.log(`[Indeed Form] Uploading resume from: ${resumePath}`);
      await fileInput.setInputFiles(resumePath);
      await randomDelay(1000, 1800);
    }
  }

  // B. Text / Numeric Inputs (Salary, Notice Period, Custom Questions, Address Details)
  const inputSelector = 'input[type="text"], input[type="number"], input[type="tel"], input[type="email"], input:not([type]), textarea';
  const inputs = page.locator(inputSelector);
  const count = await inputs.count();

  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i);
    try {
      // Exclude hidden, disabled, and readonly inputs
      if (await input.isDisabled() || !(await input.isVisible()) || !(await input.isEditable())) {
        continue;
      }
      
      const value = await input.inputValue();
      if (!value) {
        const labelText = await getLabelTextForInput(page, input);
        await fillSingleInput(page, input, labelText);
      }
    } catch (e: any) {
      console.warn(`[Indeed Form] Failed to fill field: ${e.message}`);
    }
  }

  // C. Select drop-downs (INR currency, notice, experience, country)
  const selects = page.locator('select');
  const selectCount = await selects.count();
  for (let i = 0; i < selectCount; i++) {
    const sel = selects.nth(i);
    try {
      if (await sel.isDisabled() || !(await sel.isVisible())) {
        continue;
      }

      const labelText = await getLabelTextForInput(page, sel);
      const options = await sel.locator('option').all();
      const optionTexts = await Promise.all(options.map((o: any) => o.textContent()));
      
      let matchSelected = false;

      if (labelText.includes('notice') || labelText.includes('joining') || labelText.includes('join')) {
        const priorityKeywords = ['immediate', '0 days', 'serving notice', '15 days', '30 days', '1 month'];
        let targetIndex = -1;
        for (const kw of priorityKeywords) {
          for (let j = 0; j < optionTexts.length; j++) {
            const optText = (optionTexts[j] || '').toLowerCase();
            if (optText.includes(kw)) {
              targetIndex = j;
              break;
            }
          }
          if (targetIndex !== -1) break;
        }
        if (targetIndex !== -1) {
          await sel.selectOption({ index: targetIndex }).catch(() => {});
          matchSelected = true;
        }
      } else if (labelText.includes('experience') || labelText.includes('year')) {
        let targetIndex = -1;
        for (let j = 0; j < optionTexts.length; j++) {
          const optText = (optionTexts[j] || '').toLowerCase();
          if (optText.includes('5') || optText.includes('4') || optText.includes('3-5') || optText.includes('3 to 5') || optText.includes('5-7') || optText.includes('5 to 7')) {
            targetIndex = j;
            break;
          }
        }
        if (targetIndex !== -1) {
          await sel.selectOption({ index: targetIndex }).catch(() => {});
          matchSelected = true;
        }
      } else if (labelText.includes('currency') || labelText.includes('salary') || labelText.includes('ctc') || labelText.includes('inr') || labelText.includes('rupee')) {
        let targetIndex = -1;
        for (let j = 0; j < optionTexts.length; j++) {
          const optText = (optionTexts[j] || '').toLowerCase();
          if (optText.includes('inr') || optText.includes('rupee') || optText.includes('₹')) {
            targetIndex = j;
            break;
          }
        }
        if (targetIndex !== -1) {
          await sel.selectOption({ index: targetIndex }).catch(() => {});
          matchSelected = true;
        }
      } else if (labelText.includes('country') || labelText.includes('nation')) {
        let targetIndex = -1;
        for (let j = 0; j < optionTexts.length; j++) {
          const optText = (optionTexts[j] || '').toLowerCase();
          if (optText.includes('india') || optText.trim() === 'in') {
            targetIndex = j;
            break;
          }
        }
        if (targetIndex !== -1) {
          await sel.selectOption({ index: targetIndex }).catch(() => {});
          matchSelected = true;
        }
      }

      // Dropdown fallback to AI solver if heuristics didn't match
      if (!matchSelected && optionTexts.length > 1) {
        console.log(`[Indeed Form] Uncommon select dropdown: "${labelText}". Querying Groq AI...`);
        try {
          await sel.focus().catch(() => {});
        } catch {}
        await updateAgentStatus(page, 'Thinking with AI');
        const aiOptionIndexStr = await askAI(labelText, 'select', optionTexts);
        const aiOptionIndex = parseInt(aiOptionIndexStr);
        if (!isNaN(aiOptionIndex) && aiOptionIndex >= 0 && aiOptionIndex < optionTexts.length) {
          console.log(`[Indeed Form] Selecting AI option: "${optionTexts[aiOptionIndex]}"`);
          await updateAgentStatus(page, `Selecting "${optionTexts[aiOptionIndex]}"`);
          await sel.selectOption({ index: aiOptionIndex }).catch(() => {});
        } else {
          await sel.selectOption({ index: 1 }).catch(() => {});
        }
        await updateAgentStatus(page, 'Working');
      }
    } catch {}
  }

  // D. Checkboxes
  const checkboxes = page.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  for (let i = 0; i < checkboxCount; i++) {
    const cb = checkboxes.nth(i);
    if (!(await cb.isChecked())) {
      await cb.check({ force: true }).catch(() => {});
    }
  }

  // E. Radio buttons (select the first option for each group if none is checked, e.g. for resume selection)
  try {
    const radioButtons = page.locator('input[type="radio"]');
    const radioCount = await radioButtons.count();
    const groups: { [name: string]: any[] } = {};
    
    for (let i = 0; i < radioCount; i++) {
      const rb = radioButtons.nth(i);
      const name = await rb.getAttribute('name') || `group-${i}`;
      if (!groups[name]) groups[name] = [];
      groups[name].push(rb);
    }
    
    for (const name of Object.keys(groups)) {
      const list = groups[name];
      let anyChecked = false;
      for (const rb of list) {
        if (await rb.isChecked()) {
          anyChecked = true;
          break;
        }
      }
      if (!anyChecked && list.length > 0) {
        let targetRb = list[0];
        for (const rb of list) {
          const id = await rb.getAttribute('id') || '';
          const label = id ? await page.locator(`label[for="${id}"]`).textContent().catch(() => '') : '';
          if (label.toLowerCase().includes('yes') || label.toLowerCase().includes('ha')) {
            targetRb = rb;
            break;
          }
        }
        console.log(`[Indeed Form] Selecting radio option for group "${name}"`);
        await targetRb.check({ force: true }).catch(() => {});
      }
    }
  } catch {}

  // Run self-correcting validation repair to fix numeric/format errors before submitting
  await checkAndFixValidationErrors(page);
}

async function getIndeedFrame(page: any) {
  try {
    // Check if the main page itself has the button
    if (await page.locator('button.ia-continueButton, button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit")').count() > 0) {
      return page;
    }
    
    // Look at all frames
    const frames = page.frames();
    for (const f of frames) {
      try {
        if (f.url().includes('indeed') || f.name().includes('indeed') || await f.locator('button.ia-continueButton, button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit")').count() > 0) {
          return f;
        }
      } catch {}
    }
  } catch {}
  return page;
}

async function handleIndeedApplyForm(page: any, isNewTab = true) {
  // Wait for Indeed apply form fields to load fully
  console.log('[Indeed Form] Waiting 1.2 seconds for form contents to load...');
  await page.waitForTimeout(1200);
  console.log('[Indeed Form] Starting auto-fill wizard on Indeed Apply page...');
  
  let safetyCounter = 0;
  let isFormOpen = true;

  while (isFormOpen && safetyCounter < 15) {
    safetyCounter++;
    await page.waitForTimeout(400);

    const frame = await getIndeedFrame(page);

    // Look for continue / submit button (ignoring preview and matching only visible buttons)
    const continueBtn = frame.locator('button.ia-continueButton, button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit"), button:has-text("Review"):not(:has-text("preview")):not(:has-text("Preview")), button:has-text("Submit application"), button[class*="continue"], button[class*="Submit"]').filter({ visible: true }).first();
    
    try {
      await continueBtn.waitFor({ state: 'visible', timeout: 5000 });
    } catch {}

    if (await continueBtn.count() > 0) {
      const btnText = (await continueBtn.textContent() || '').toLowerCase();
      console.log(`[Indeed Form] Found form button: "${btnText.trim()}"`);

      // Fill current step fields inside the active frame
      await fillIndeedStepFields(frame);

      // Click continue (force to avoid modal backdrop intercepts)
      if (btnText.includes('submit')) {
        console.log('[Indeed Form] ✅ Indeed Job application submitted successfully!');
        await updateAgentStatus(page, 'Submitting Application');
        isFormOpen = false;
        await randomDelay(1000, 1500);
        await updateAgentStatus(page, 'Application Submitted!');
      } else {
        await updateAgentStatus(page, 'Filling Application Form');
        await continueBtn.click({ force: true });
        await randomDelay(500, 900);
      }
    } else {
      console.log('[Indeed Form] No continue or submit button found. Closing page...');
      isFormOpen = false;
    }
  }

  try {
    if (isNewTab) {
      await page.close();
    }
  } catch {}
}

async function runIndeedPipeline(page: any) {
  console.log('\n[Indeed] Starting job application pipeline...');
  await updateAgentStatus(page, 'Searching for Jobs');
  
  const keyword = getRandomSearchKeyword();
  console.log(`[Indeed] Selected search keyword: "${keyword}"`);
  
  const searchUrl = `https://in.indeed.com/jobs?q=${encodeURIComponent(keyword)}&l=India&sort=date&fromage=7`;
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  } catch (err: any) {
    console.warn(`[Indeed] Warning during navigation: ${err.message}`);
  }
  await randomDelay(800, 1500);

  let loggedIn = await isIndeedLoggedIn(page);

  if (!loggedIn) {
    console.log('[Indeed] User is not logged in! Waiting for you to log in manually in the open Chrome window if you want to sign in (auto-detecting)...');
    
    const startTime = Date.now();
    const timeout = 3 * 60 * 1000; // 3 minutes timeout
    
    while (!loggedIn && Date.now() - startTime < timeout) {
      if (page.isClosed()) {
        break;
      }
      await page.waitForTimeout(2000);
      loggedIn = await isIndeedLoggedIn(page);
    }
    console.log('[Indeed] Logged in or continuing...');
  }

  // Scroll to load all cards
  console.log('[Indeed] Scrolling to load more jobs...');
  await updateAgentStatus(page, 'Scrolling Job List');
  for (let s = 0; s < 3; s++) {
    await humanScroll(page, 450);
    await page.waitForTimeout(200);
  }

  // Indeed job beacons
  const jobCards = page.locator('div.job_seen_beacon');
  const count = await jobCards.count();
  console.log(`[Indeed] Found ${count} job cards.`);

  for (let i = 0; i < Math.min(count, 20); i++) {
    let newPage: any = null;
    try {
      let card = page.locator('div.job_seen_beacon').nth(i);
      await updateAgentStatus(page, `Opening Job Details (${i + 1}/${count})`);
      
      try {
        const [openedPage] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 3000 }),
          humanClick(page, card)
        ]);
        newPage = openedPage;
      } catch (e: any) {
        // No new page opened
      }

      const targetPage = newPage || page;
      await randomDelay(800, 1500);

      const title = (await targetPage.locator('h2[class*="jobsearch-JobInfoHeader-title"]').first().textContent({ timeout: 4000 }).catch(() => '')).trim();
      const description = (await targetPage.locator('#jobDescriptionText').first().textContent({ timeout: 4000 }).catch(() => '')).trim();

      if (!title) continue;

      // Extract dynamic expected salary range
      currentJobSalaryRange = detectSalaryRange(title + " " + description);

      await updateAgentStatus(page, `Evaluating "${title.substring(0, 15)}..."`);
      const { isMatch } = await checkProfileMatch(title, description);
      if (!isMatch) {
        console.log(`[Indeed] Skipping job: "${title}"`);
        continue;
      }

      const easilyApplyBtn = targetPage.locator('#indeedApplyButton');
      if (await easilyApplyBtn.count() > 0) {
        await easilyApplyBtn.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        if (await easilyApplyBtn.first().isDisabled()) {
          console.log(`[Indeed] 'Easily apply' button is disabled for "${title}". Skipping...`);
          continue;
        }

        console.log(`[Indeed] Clicking 'Easily apply' for "${title}"...`);
        await updateAgentStatus(targetPage, 'Opening Easily Apply');

        let applyPage: any = null;
        try {
          const [openedApplyPage] = await Promise.all([
            targetPage.context().waitForEvent('page', { timeout: 8000 }),
            humanClick(targetPage, easilyApplyBtn.first())
          ]);
          applyPage = openedApplyPage;
        } catch (e: any) {
          console.log(`[Indeed] No new tab opened. Processing form on target page...`);
        }

        if (applyPage) {
          try {
            await handleIndeedApplyForm(applyPage, true);
          } catch (err: any) {
            console.error('[Indeed] Error processing form in new tab:', err.message);
          } finally {
            await applyPage.close().catch(() => {});
          }
        } else {
          try {
            await handleIndeedApplyForm(targetPage, false);
          } catch (err: any) {
            console.error('[Indeed] Error processing form on target page:', err.message);
          } finally {
            if (!newPage) {
              console.log('[Indeed] Reloading main page to clear any modals and restore job list...');
              await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
              await randomDelay(800, 1500);
            }
          }
        }
      } else {
        console.log(`[Indeed] "${title}" requires external site application. Skipping...`);
      }

    } catch (err: any) {
      console.error(`[Indeed] Error processing Indeed card at index ${i}:`, err.message);
    } finally {
      if (newPage) {
        await newPage.close().catch(() => {});
      }
      await closeExtraTabs(page.context());
    }
  }

}

// Handler for Naukri Easy Apply Questionnaire Forms/Steps
async function handleNaukriFormSteps(page: any) {
  let safetyCounter = 0;
  let isFormOpen = true;

  while (isFormOpen && safetyCounter < 15) {
    safetyCounter++;
    await page.waitForTimeout(600);

    if (page.isClosed()) {
      break;
    }

    // 1. Scan if there are editable or clickable form elements
    const inputSelector = [
      'input[type="text"]',
      'input[type="number"]',
      'input[type="tel"]',
      'input[type="email"]',
      'input:not([type])',
      'textarea',
      'select',
      'input[type="radio"]',
      'input[type="checkbox"]',
      '[role="radio"]',
      '[role="checkbox"]'
    ].join(', ');
    
    const inputs = page.locator(inputSelector).filter({ visible: true });
    const count = await inputs.count();
    
    // Check if there is any questionnaire form overlay or drawer visible on the page
    const hasForm = count > 0 || await page.locator([
      'div[class*="drawer"]',
      'div[class*="popup"]',
      'div[class*="modal"]',
      'div[class*="overlay"]',
      'div[class*="dialog"]',
      'div[class*="questionnaire"]',
      'div[class*="form"]',
      '.chatbot-container',
      '[class*="side-panel"]',
      '[class*="sidePanel"]',
      '[class*="bot"]'
    ].join(', ')).filter({ visible: true }).count() > 0;
    
    if (count === 0 && !hasForm) {
      console.log('[Naukri Form] No visible form elements, checkboxes, or questionnaire overlays found. Proceeding...');
      break;
    }

    console.log(`[Naukri Form] Found ${count} visible form input/option elements on this step.`);

    // 2. Auto-fill fields if any are visible
    if (count > 0) {
      await autoFillStandardInputs(page);
    }

    // 3. Scan for "Submit", "Continue", "Save", "Apply" buttons
    const submitBtnSelectors = [
      'button:has-text("Submit")',
      'button:has-text("Save & Continue")',
      'button:has-text("Save and Continue")',
      'button:has-text("Save & Apply")',
      'button:has-text("Save")',
      'button:has-text("Continue")',
      'button:has-text("Next")',
      'button:has-text("Apply")',
      'button:has-text("Submit Application")',
      'input[type="submit"]',
      'input[type="button"][value*="Submit" i]',
      'input[type="button"][value*="Save" i]',
      'input[type="button"][value*="Apply" i]',
      'input[type="button"][value*="Continue" i]',
      '.submit-btn',
      'button[type="submit"]',
      '#submit-button',
      '.apply-button',
      '[class*="submit-btn" i]',
      '[class*="apply-btn" i]',
      'button[class*="submit" i]',
      'button[class*="apply" i]'
    ];

    let clicked = false;
    for (const selector of submitBtnSelectors) {
      const btn = page.locator(selector).filter({ visible: true }).first();
      if (await btn.count() > 0) {
        const btnText = (await btn.textContent() || '').toLowerCase();
        console.log(`[Naukri Form] Clicking form navigation button: "${btnText.trim()}"`);
        await humanClick(page, btn);
        await randomDelay(800, 1500);
        clicked = true;
        
        if (btnText.includes('submit') || btnText.includes('apply')) {
          console.log('[Naukri Form] Form submitted!');
          isFormOpen = false;
        }
        break;
      }
    }

    if (!clicked) {
      console.log('[Naukri Form] No next/submit button found on this form page. Closing step...');
      break;
    }
  }
}

// -------------------------------------------------------------
// PIPELINE 4: NAUKRI AUTOMATION
// -------------------------------------------------------------
async function runNaukriPipeline(page: any) {
  console.log('\n[Naukri] Starting job application pipeline...');
  await updateAgentStatus(page, 'Searching for Jobs');
  
  const keyword = getRandomSearchKeyword();
  console.log(`[Naukri] Selected search keyword: "${keyword}"`);
  
  const searchUrl = `https://www.naukri.com/jobs-in-india?k=${encodeURIComponent(keyword.toLowerCase())}&l=india&sort=freshness`;
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  } catch (err: any) {
    console.warn(`[Naukri] Warning during navigation: ${err.message}`);
  }
  await randomDelay(800, 1500);

  // Check login
  let loggedIn = await isNaukriLoggedIn(page);
  if (!loggedIn) {
    console.log('[Naukri] User is not logged in! Waiting for you to log in manually in the open Chrome window (auto-detecting login)...');
    await updateAgentStatus(page, 'Waiting for Login');
    
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes timeout
    
    while (!loggedIn && Date.now() - startTime < timeout) {
      if (page.isClosed()) {
        console.error('[Naukri] Browser page was closed. Skipping Naukri...');
        return;
      }
      await page.waitForTimeout(2000);
      loggedIn = await isNaukriLoggedIn(page);
    }

    if (!loggedIn) {
      console.error('[Naukri] Timeout waiting for login. Skipping Naukri...');
      return;
    }
    console.log('[Naukri] Logged in successfully!');
  }

  // Scroll to trigger lazy loading of jobs
  console.log('[Naukri] Scrolling to load more opportunities...');
  await updateAgentStatus(page, 'Scrolling Job List');
  for (let s = 0; s < 3; s++) {
    await humanScroll(page, 500);
    await page.waitForTimeout(200);
  }

  // Find job elements/cards
  const jobCards = page.locator('.srp-jobtuple-wrapper, div[class*="jobTuple"]');
  const count = await jobCards.count();
  console.log(`[Naukri] Found ${count} opportunities.`);

  for (let i = 0; i < Math.min(count, 20); i++) {
    let newPage: any = null;
    try {
      let card = page.locator('.srp-jobtuple-wrapper, div[class*="jobTuple"]').nth(i);
      try {
        await card.scrollIntoViewIfNeeded({ timeout: 3000 });
      } catch {}

      // Extract details
      const titleEl = card.locator('a.title, a[class*="title"]');
      const title = (await titleEl.textContent({ timeout: 2000 }).catch(() => '')).trim();
      
      const compEl = card.locator('.comp-name, a[class*="comp-name"]');
      const company = (await compEl.textContent({ timeout: 2000 }).catch(() => '')).trim();

      // Retrieve full card text context for keyword match checks
      const cardText = (await card.textContent({ timeout: 2000 }).catch(() => '')) + ' ' + company;

      if (!title) continue;

      const { isMatch } = await checkProfileMatch(title, cardText);
      if (!isMatch) {
        console.log(`[Naukri] Skipping job: "${title}" at "${company}"`);
        continue;
      }
 
      console.log(`[Naukri] Processing matching job: "${title}" at "${company}"`);
      await updateAgentStatus(page, `Opening Job Details (${i + 1}/${count})`);
      
      try {
        // Naukri links open in a new tab
        const [openedPage] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 8000 }),
          humanClick(page, titleEl)
        ]);
        newPage = openedPage;
        
        await newPage.waitForLoadState('domcontentloaded');
        await randomDelay(500, 1000);
        
        const applyBtn = newPage.locator('button:has-text("Apply"), button:has-text("Apply Now"), button:has-text("Apply on Company Site"), .apply-button, #apply-button, .apply-btn').filter({ visible: true }).first();
        if (await applyBtn.count() > 0) {
          const btnText = (await applyBtn.textContent() || '').toLowerCase();
          if (btnText.includes('apply on company site') || btnText.includes('company site')) {
            console.log(`[Naukri] Job "${title}" requires external site application. Clicking to open for you...`);
            await updateAgentStatus(newPage, 'Redirecting to Company Site');
            await humanClick(newPage, applyBtn);
            await randomDelay(1000, 1500);
          } else {
            console.log(`[Naukri] Clicking internal apply for "${title}"...`);
            await updateAgentStatus(newPage, 'Submitting Application');
            await humanClick(newPage, applyBtn);
            await randomDelay(800, 1500);
            
            // Handle Naukri questionnaire / form steps
            await handleNaukriFormSteps(newPage);
            
            console.log(`[Naukri] ✅ Application submitted/initiated for "${title}"!`);
            await updateAgentStatus(newPage, 'Application Submitted!');
            await newPage.waitForTimeout(400);
          }
        }
      } catch (e: any) {
        console.log(`[Naukri] Could not apply for "${title}": ${e.message}`);
      }

    } catch (err: any) {
      console.error(`[Naukri] Error processing Naukri card at index ${i}:`, err.message);
    } finally {
      if (newPage) {
        await newPage.close().catch(() => {});
      }
      await closeExtraTabs(page.context());
    }
  }

}

// -------------------------------------------------------------
// MAIN WORKER INITIALIZER
// -------------------------------------------------------------
async function main() {
  console.log('=== Starting Personal AI Agent Outbound Worker ===');

  // Automatically close existing Chrome automation instances to release profile lock
  try {
    if (process.platform === 'win32') {
      console.log('[Init] Closing open Chrome instances to release profile lock...');
      execSync('taskkill /F /IM chrome.exe', { stdio: 'ignore' });
      await delay(1500);
    }
  } catch {}

  if (!fs.existsSync(CHROME_USER_DATA_DIR)) {
    console.warn(`[Warning] Chrome User Data Directory not found at: ${CHROME_USER_DATA_DIR}`);
    console.warn('Please make sure you have set the correct path in the configuration header.');
  }

  console.log(`[Init] Using Chrome profile path: ${CHROME_USER_DATA_DIR}`);
  console.log(`[Init] Profile: ${CHROME_PROFILE_NAME}`);

  try {
    const context = await chromium.launchPersistentContext(CHROME_USER_DATA_DIR, {
      headless: false, // Must run in headful mode to use actual Chrome credentials
      executablePath: CHROME_EXECUTABLE_PATH,
      viewport: null,
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled' // Bypass standard bot checks
      ],
      ignoreDefaultArgs: ['--enable-automation', '--no-sandbox']
    });

    const portalsEnv = process.env.PORTALS;
    const enabledPortals = portalsEnv 
      ? portalsEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : ['linkedin', 'instahyre', 'indeed', 'naukri', 'feed'];

    console.log('[Init] Selected portals for execution:', enabledPortals);

    const primaryPage = context.pages()[0] || await context.newPage();
    let linkedinPage: any = null;
    let instahyrePage: any = null;
    let indeedPage: any = null;
    let naukriPage: any = null;

    let pageAssigned = false;
    if (enabledPortals.includes('linkedin') || enabledPortals.includes('feed')) {
      linkedinPage = primaryPage;
      pageAssigned = true;
    }
    if (enabledPortals.includes('instahyre')) {
      if (!pageAssigned) {
        instahyrePage = primaryPage;
        pageAssigned = true;
      } else {
        instahyrePage = await context.newPage();
      }
    }
    if (enabledPortals.includes('indeed')) {
      if (!pageAssigned) {
        indeedPage = primaryPage;
        pageAssigned = true;
      } else {
        indeedPage = await context.newPage();
      }
    }
    if (enabledPortals.includes('naukri')) {
      if (!pageAssigned) {
        naukriPage = primaryPage;
        pageAssigned = true;
      } else {
        naukriPage = await context.newPage();
      }
    }

    if (!pageAssigned) {
      linkedinPage = primaryPage;
    }

    if (linkedinPage) globalMainPages.add(linkedinPage);
    if (instahyrePage) globalMainPages.add(instahyrePage);
    if (indeedPage) globalMainPages.add(indeedPage);
    if (naukriPage) globalMainPages.add(naukriPage);


    // Helper to register stealth scripts and visual cursor on a page
    const registerStealthAndCursor = async (p: any) => {
      try {
        await p.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        await injectVirtualCursor(p);
      } catch (err: any) {
        console.warn(`[Init] Failed to register overlays on page: ${err.message}`);
      }
    };

    // Auto-inject stealth and visual overlays on any new tabs/pages created dynamically
    context.on('page', async (p) => {
      await registerStealthAndCursor(p);
    });

    // Manually register for existing tabs/pages that are already open
    for (const p of context.pages()) {
      await registerStealthAndCursor(p);
    }

    console.log('[Init] Opening pipelines in separate tabs...');
    
    // Navigate in parallel to prepare the tabs immediately
    const navPromises: Promise<any>[] = [];
    if (linkedinPage) {
      if (enabledPortals.includes('linkedin')) {
        navPromises.push(linkedinPage.goto('https://www.linkedin.com/jobs/search/?f_AL=true&keywords=Senior%20Front-End%20Developer&location=India&sortBy=DD&f_TPR=r604800', { waitUntil: 'domcontentloaded' }).catch(() => {}));
      } else if (enabledPortals.includes('feed')) {
        navPromises.push(linkedinPage.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' }).catch(() => {}));
      }
    }
    if (instahyrePage) {
      navPromises.push(instahyrePage.goto('https://www.instahyre.com/candidate/opportunities/', { waitUntil: 'domcontentloaded' }).catch(() => {}));
    }
    if (indeedPage) {
      navPromises.push(indeedPage.goto('https://in.indeed.com/jobs?q=Senior+Front-End+Developer&l=India&sort=date&fromage=7', { waitUntil: 'domcontentloaded' }).catch(() => {}));
    }
    if (naukriPage) {
      navPromises.push(naukriPage.goto('https://www.naukri.com/senior-frontend-developer-jobs-in-india?k=senior%20frontend%20developer&l=india&sort=freshness', { waitUntil: 'domcontentloaded' }).catch(() => {}));
    }
    
    if (navPromises.length > 0) {
      await Promise.all(navPromises);
    }

    // 1. Execute LinkedIn Pipeline or Feed Scouter Only
    if (linkedinPage && !linkedinPage.isClosed()) {
      try {
        await linkedinPage.bringToFront();
        if (enabledPortals.includes('linkedin')) {
          await runLinkedInPipeline(linkedinPage);
        } else if (enabledPortals.includes('feed')) {
          await runLinkedInFeedScouter(linkedinPage);
        }
      } catch (e: any) {
        console.error('[LinkedIn] Pipeline failed with error:', e.message);
      }
    }

    // 2. Execute Instahyre Pipeline
    if (instahyrePage && !instahyrePage.isClosed()) {
      try {
        await instahyrePage.bringToFront();
        await runInstahyrePipeline(instahyrePage);
      } catch (e: any) {
        console.error('[Instahyre] Pipeline failed with error:', e.message);
      }
    }

    // 3. Execute Indeed Pipeline
    if (indeedPage && !indeedPage.isClosed()) {
      try {
        await indeedPage.bringToFront();
        await runIndeedPipeline(indeedPage);
      } catch (e: any) {
        console.error('[Indeed] Pipeline failed with error:', e.message);
      }
    }

    // 4. Execute Naukri Pipeline
    if (naukriPage && !naukriPage.isClosed()) {
      try {
        await naukriPage.bringToFront();
        await runNaukriPipeline(naukriPage);
      } catch (e: any) {
        console.error('[Naukri] Pipeline failed with error:', e.message);
      }
    }

    console.log('\n=== All pipelines completed successfully! ===');
    await context.close().catch(() => {});
    process.exit(0);

  } catch (error: any) {
    console.error('[Fatal Error] Script crashed during initialization:', error.message);
  }
}

// Run the script
main();
