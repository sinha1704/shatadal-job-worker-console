import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import Groq from 'groq-sdk';

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
Experience: 5 years (specializing in React, Next.js, TypeScript, JavaScript, HTML, CSS, Responsive Web Design)
Notice Period: Immediate Joiner (0 days notice period)
Interview Availability: Available at any time for job interviews during standard business/office hours. A 1-hour advance notice is preferred but not mandatory. If asked to choose, select/input any slot.
Projects: Developed scalable SaaS platforms, prop-tech dashboards, and interactive ed-tech sites. Optimized React bundles by 30%, implemented global state (Redux Toolkit, Context API), and engineered personal AI agents.
Expected Salary: 10 LPA (Lakhs Per Annum) to 14 LPA. If the company budget is above 14 LPA, ask for more than 14 LPA accordingly.
Current Salary: 6 LPA.
Summary: Strong track record of building performant, responsive web applications, optimizing bundle sizes, implementing state management (Redux, Context API), and collaborating with design and product teams.
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
  } catch {}
  return '';
}

// Helper to fill custom input fields based on labels
async function fillSingleInput(pageOrFrame: any, input: any, labelText: string) {
  // Interview Availability / Notice details
  if (labelText.includes('interview') || labelText.includes('availability') || labelText.includes('time slot') || labelText.includes('available to start') || labelText.includes('when can you start')) {
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
  } else if (labelText.includes('city') || labelText.includes('town')) {
    console.log(`[Form Fill] Filling city (Kolkata)...`);
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
  else if (labelText.includes('experience') || labelText.includes('years')) {
    console.log(`[Form Fill] Filling experience (5)...`);
    await humanFill(pageOrFrame, input, '5');
  } else if (labelText.includes('notice') || labelText.includes('days') || labelText.includes('joining') || labelText.includes('start date')) {
    console.log(`[Form Fill] Filling notice period (0)...`);
    await humanFill(pageOrFrame, input, '0');
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
  await randomDelay(1500, 2500);

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
      await page.waitForTimeout(600);
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
      await randomDelay(1000, 1800);

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
        await randomDelay(1000, 1800);

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
    }
  }

  // Scout feed for direct recruiter email leads after completing job search
  try {
    await runLinkedInFeedScouter(page);
  } catch (err: any) {
    console.error(`[LinkedIn Feed Scouter] Execution failed:`, err.message);
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

  console.log('[LinkedIn Feed Scouter] Scrolling home feed to load posts...');
  await updateAgentStatus(page, 'Scrolling Home Feed');
  for (let s = 0; s < 8; s++) {
    // Proactively dismiss any modal popup that might have appeared or loaded during scroll
    await dismissLinkedInPostApplyModal(page);
    await humanScroll(page, 700);
    await page.waitForTimeout(1000);
  }

  console.log('[LinkedIn Feed Scouter] Finding and clicking "see more" buttons...');
  await updateAgentStatus(page, 'Expanding Feed Posts');
  const seeMoreButtons = page.locator('button:has-text("see more"), button:has-text("...see more"), button.feed-shared-inline-show-more-text__see-more-less-toggle');
  const seeMoreCount = await seeMoreButtons.count();
  for (let i = 0; i < seeMoreCount; i++) {
    try {
      const btn = seeMoreButtons.nth(i);
      if (await btn.isVisible()) {
        await btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
    } catch {}
  }

  const postContainers = page.locator('[data-view-name="feed-full-update"], .feed-shared-update-v2');
  const postCount = await postContainers.count();
  console.log(`[LinkedIn Feed Scouter] Found ${postCount} posts on the loaded feed.`);

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const hiringKeywords = ['hiring', 'recruiting', 'looking for', 'job opening', 'career', 'join our team', 'vacancy', 'apply to', 'send resume', 'send cv', 'immediate joiner'];
  const techKeywords = ['react', 'next.js', 'nextjs', 'frontend', 'front-end', 'developer', 'engineer', 'typescript', 'javascript', 'full stack', 'fullstack', 'ui'];

  for (let i = 0; i < postCount; i++) {
    try {
      const container = postContainers.nth(i);
      
      const textLocators = [
        '.feed-shared-update-v2__description',
        '.update-components-text',
        '.feed-shared-inline-show-more-text',
        'span.break-words'
      ];
      
      let postText = '';
      for (const sel of textLocators) {
        const loc = container.locator(sel);
        if (await loc.count() > 0) {
          postText = (await loc.first().textContent() || '').trim();
          if (postText) break;
        }
      }

      if (!postText) continue;

      const postTextLower = postText.toLowerCase();

      const emailsMatched = postText.match(emailRegex);
      if (!emailsMatched || emailsMatched.length === 0) {
        continue;
      }

      const isHiring = hiringKeywords.some(keyword => postTextLower.includes(keyword));
      const matchesTech = techKeywords.some(keyword => postTextLower.includes(keyword));

      if (isHiring && matchesTech) {
        const authorNameLoc = container.locator('.update-components-actor__title, .feed-shared-actor__title, .feed-shared-actor__name');
        const authorName = (await authorNameLoc.count() > 0 ? await authorNameLoc.first().textContent() : '').trim().replace(/\n/g, ' ');

        const authorProfileLoc = container.locator('.update-components-actor__meta-link, .feed-shared-actor__container a, a[href*="/in/"]');
        const authorProfile = (await authorProfileLoc.count() > 0 ? await authorProfileLoc.first().getAttribute('href') : '').trim();

        const authorHeadlineLoc = container.locator('.update-components-actor__description, .feed-shared-actor__description');
        const authorHeadline = (await authorHeadlineLoc.count() > 0 ? await authorHeadlineLoc.first().textContent() : '').trim();

        const postTimeLoc = container.locator('.update-components-actor__sub-text, .feed-shared-actor__sub-text');
        const postTime = (await postTimeLoc.count() > 0 ? await postTimeLoc.first().textContent() : '').trim().replace(/\s+/g, ' ');

        let jobType = 'Full-time';
        if (postTextLower.includes('remote')) jobType = 'Remote';
        else if (postTextLower.includes('hybrid')) jobType = 'Hybrid';
        else if (postTextLower.includes('contract') || postTextLower.includes('freelance')) jobType = 'Contract';

        let location = 'India';
        const locMatch = postText.match(/location:\s*([a-zA-Z\s,]+)/i) || postText.match(/based in\s*([a-zA-Z\s,]+)/i);
        if (locMatch) {
          location = locMatch[1].trim();
        }

        let companyName = '';
        const compMatch = authorHeadline.match(/at\s+([A-Za-z0-9\s]+)/i) || postText.match(/company:\s*([a-zA-Z0-9\s]+)/i);
        if (compMatch) {
          companyName = compMatch[1].trim();
        } else {
          companyName = authorHeadline.split('at')[1]?.trim() || '';
        }

        let profileUrl = authorProfile;
        if (profileUrl && !profileUrl.startsWith('http')) {
          profileUrl = 'https://www.linkedin.com' + profileUrl;
        }

        for (const email of emailsMatched) {
          const lead: FeedLead = {
            email: email.trim().toLowerCase(),
            postText: postText.substring(0, 1000),
            authorName: authorName || 'Recruiter',
            authorProfile: profileUrl || '',
            companyName: companyName || authorHeadline || 'Hiring Manager',
            location: location,
            jobType: jobType,
            extractedAt: new Date().toISOString(),
            postTime: postTime || 'Recent'
          };

          saveFeedLead(lead);
        }
      }
    } catch (e: any) {
      console.warn(`[LinkedIn Feed Scouter] Error parsing post card at index ${i}: ${e.message}`);
    }
  }
}


// Handler for LinkedIn Easy Apply Modal Steps (multi-step form fill)
async function handleLinkedInFormSteps(page: any) {
  let safetyCounter = 0;
  let isFormOpen = true;

  while (isFormOpen && safetyCounter < 15) {
    safetyCounter++;
    
    // 1. Give form elements and transitions a brief moment to load/mount
    await page.waitForTimeout(400);

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
        await randomDelay(600, 1000);
      }
      isFormOpen = false;
      break;
    }

    // 3. Scan for active navigation buttons
    const nextBtnSelector = 'button[aria-label*="Submit application"], button[aria-label*="Next"], button[aria-label*="Review"], button:has-text("Next"), button:has-text("Submit"), button:has-text("Review"), button:has-text("Continue"), button:has-text("Submit application")';
    const nextBtn = page.locator(nextBtnSelector).filter({ visible: true }).first();
    const dismissBtn = page.locator('button[aria-label="Dismiss"]').filter({ visible: true }).first();

    if (await nextBtn.count() > 0) {
      const btnText = (await nextBtn.textContent() || '').toLowerCase();
      
      // Auto-fill typical input fields for this step
      await autoFillStandardInputs(page);

      console.log(`[LinkedIn Form] Clicking navigation button: "${btnText.trim()}"`);
      await nextBtn.click({ force: true });
      await randomDelay(800, 1300);

      if (btnText.includes('submit')) {
        console.log('[LinkedIn Form] ✅ Application submitted successfully!');
        await updateAgentStatus(page, 'Submitting Application');
        isFormOpen = false;
        // Wait for submit animation/confirmation
        await randomDelay(1500, 2500);
        await updateAgentStatus(page, 'Application Submitted!');
      } else {
        await updateAgentStatus(page, 'Filling Application Form');
      }
    } else {
      // If no next button is found, wait 1.5 seconds and retry (handles slow frame/question loading)
      await page.waitForTimeout(1500);
      const nextBtnRetry = page.locator(nextBtnSelector).filter({ visible: true }).first();
      if (await nextBtnRetry.count() > 0) {
        continue;
      }

      console.log('[LinkedIn Form] No active next/submit button after wait. Closing modal...');
      if (await dismissBtn.count() > 0) {
        await dismissBtn.click({ force: true });
        await randomDelay(600, 1000);
        // Confirm discard if prompted
        const discardBtn = page.locator('button[data-control-name="discard_application_confirm_btn"]').filter({ visible: true }).first();
        if (await discardBtn.count() > 0) {
          await discardBtn.click({ force: true });
          await randomDelay(600, 1000);
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

  // Handle Radio buttons (select Yes/No)
  const radioInputs = page.locator('input[type="radio"]');
  const radioCount = await radioInputs.count();
  for (let i = 0; i < radioCount; i += 2) {
    try {
      const id = await radioInputs.nth(i).getAttribute('id') || '';
      const label = id ? await page.locator(`label[for="${id}"]`).textContent().catch(() => '') : '';
      if (label.toLowerCase().includes('yes')) {
        await radioInputs.nth(i).check({ force: true });
      }
    } catch {}
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
  console.log('[Indeed Form] Waiting 3 seconds for form contents to load...');
  await page.waitForTimeout(3000);
  console.log('[Indeed Form] Starting auto-fill wizard on Indeed Apply page...');
  
  let safetyCounter = 0;
  let isFormOpen = true;

  while (isFormOpen && safetyCounter < 15) {
    safetyCounter++;
    await page.waitForTimeout(1000);

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
        await randomDelay(2000, 3000);
        await updateAgentStatus(page, 'Application Submitted!');
      } else {
        await updateAgentStatus(page, 'Filling Application Form');
        await continueBtn.click({ force: true });
        await randomDelay(1000, 1800);
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
  await randomDelay(1500, 2500);

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
    await page.waitForTimeout(500);
  }

  // Indeed job beacons
  const jobCards = page.locator('div.job_seen_beacon');
  const count = await jobCards.count();
  console.log(`[Indeed] Found ${count} job cards.`);

  for (let i = 0; i < Math.min(count, 20); i++) {
    try {
      let card = page.locator('div.job_seen_beacon').nth(i);
      await updateAgentStatus(page, `Opening Job Details (${i + 1}/${count})`);
      await humanClick(page, card);
      await randomDelay(1500, 2500);

      const title = (await page.locator('h2[class*="jobsearch-JobInfoHeader-title"]').textContent({ timeout: 4000 }).catch(() => '')).trim();
      const description = (await page.locator('#jobDescriptionText').textContent({ timeout: 4000 }).catch(() => '')).trim();

      if (!title) continue;

      // Extract dynamic expected salary range
      currentJobSalaryRange = detectSalaryRange(title + " " + description);

      await updateAgentStatus(page, `Evaluating "${title.substring(0, 15)}..."`);
      const { isMatch } = await checkProfileMatch(title, description);
      if (!isMatch) {
        console.log(`[Indeed] Skipping job: "${title}"`);
        continue;
      }

      const easilyApplyBtn = page.locator('#indeedApplyButton');
      if (await easilyApplyBtn.count() > 0) {
        await easilyApplyBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
        if (await easilyApplyBtn.isDisabled()) {
          console.log(`[Indeed] 'Easily apply' button is disabled for "${title}". Skipping...`);
          continue;
        }

        console.log(`[Indeed] Clicking 'Easily apply' for "${title}"...`);
        await updateAgentStatus(page, 'Opening Easily Apply');

        let newPage: any = null;
        try {
          const [openedPage] = await Promise.all([
            page.context().waitForEvent('page', { timeout: 8000 }),
            humanClick(page, easilyApplyBtn)
          ]);
          newPage = openedPage;
        } catch (e: any) {
          console.log(`[Indeed] No new tab opened. Processing form on the main page...`);
        }

        if (newPage) {
          try {
            await handleIndeedApplyForm(newPage, true);
          } catch (err: any) {
            console.error('[Indeed] Error processing form in new tab:', err.message);
          }
        } else {
          try {
            await handleIndeedApplyForm(page, false);
          } catch (err: any) {
            console.error('[Indeed] Error processing form on main page:', err.message);
          } finally {
            console.log('[Indeed] Reloading page to clear any modals and restore job list...');
            await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await randomDelay(1500, 2500);
          }
        }
      } else {
        console.log(`[Indeed] "${title}" requires external site application. Skipping...`);
      }

    } catch (err: any) {
      console.error(`[Indeed] Error processing Indeed card at index ${i}:`, err.message);
    }
  }
}

// Handler for Naukri Easy Apply Questionnaire Forms/Steps
async function handleNaukriFormSteps(page: any) {
  let safetyCounter = 0;
  let isFormOpen = true;

  while (isFormOpen && safetyCounter < 10) {
    safetyCounter++;
    await page.waitForTimeout(1200);

    if (page.isClosed()) {
      break;
    }

    // 1. Scan if there are editable form elements (inputs, textareas, select, etc.)
    const inputSelector = 'input[type="text"], input[type="number"], input[type="tel"], input:not([type]), textarea, select';
    const inputs = page.locator(inputSelector).filter({ visible: true });
    const count = await inputs.count();
    
    // Check if there is any questionnaire form visible on the page
    const hasForm = count > 0 || await page.locator('div[class*="questionnaire"], div[class*="form"], .chatbot-container, [class*="modal"]').count() > 0;
    
    if (count === 0 && !hasForm) {
      console.log('[Naukri Form] No visible form elements or questionnaires. Proceeding...');
      break;
    }

    console.log(`[Naukri Form] Found ${count} visible form input elements on this step.`);

    // 2. Auto-fill fields if any are visible and empty
    if (count > 0) {
      await autoFillStandardInputs(page);
    }

    // 3. Scan for "Submit", "Continue", "Save", "Apply" buttons
    const submitBtnSelectors = [
      'button:has-text("Submit"), button:has-text("Save & Continue"), button:has-text("Continue"), button:has-text("Next"), button:has-text("Apply"), button:has-text("Submit Application")',
      '.submit-btn',
      'button[type="submit"]',
      '#submit-button',
      '.apply-button'
    ];

    let clicked = false;
    for (const selector of submitBtnSelectors) {
      const btn = page.locator(selector).filter({ visible: true }).first();
      if (await btn.count() > 0) {
        const btnText = (await btn.textContent() || '').toLowerCase();
        console.log(`[Naukri Form] Clicking form navigation button: "${btnText.trim()}"`);
        await humanClick(page, btn);
        await randomDelay(1200, 2000);
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
  await randomDelay(1500, 2500);

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
    await page.waitForTimeout(500);
  }

  // Find job elements/cards
  const jobCards = page.locator('.srp-jobtuple-wrapper, div[class*="jobTuple"]');
  const count = await jobCards.count();
  console.log(`[Naukri] Found ${count} opportunities.`);

  for (let i = 0; i < Math.min(count, 20); i++) {
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
        const [newPage] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 8000 }),
          humanClick(page, titleEl)
        ]);
        
        await newPage.waitForLoadState('domcontentloaded');
        await randomDelay(1000, 1800);
        
        const applyBtn = newPage.locator('button:has-text("Apply"), button:has-text("Apply Now"), button:has-text("Apply on Company Site"), .apply-button, #apply-button, .apply-btn').filter({ visible: true }).first();
        if (await applyBtn.count() > 0) {
          const btnText = (await applyBtn.textContent() || '').toLowerCase();
          if (btnText.includes('apply on company site') || btnText.includes('company site')) {
            console.log(`[Naukri] Job "${title}" requires external site application. Clicking to open for you...`);
            await updateAgentStatus(newPage, 'Redirecting to Company Site');
            await humanClick(newPage, applyBtn);
            await randomDelay(2000, 3000);
          } else {
            console.log(`[Naukri] Clicking internal apply for "${title}"...`);
            await updateAgentStatus(newPage, 'Submitting Application');
            await humanClick(newPage, applyBtn);
            await randomDelay(1500, 2500);
            
            // Handle Naukri questionnaire / form steps
            await handleNaukriFormSteps(newPage);
            
            console.log(`[Naukri] ✅ Application submitted/initiated for "${title}"!`);
            await updateAgentStatus(newPage, 'Application Submitted!');
            await newPage.waitForTimeout(1000);
          }
        }
        await newPage.close();
      } catch (e: any) {
        console.log(`[Naukri] Could not apply for "${title}": ${e.message}`);
      }

    } catch (err: any) {
      console.error(`[Naukri] Error processing Naukri card at index ${i}:`, err.message);
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
