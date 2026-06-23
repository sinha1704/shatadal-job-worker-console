'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getGraphicOutreachTemplate } from './utils/emailTemplates';

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

export default function DashboardPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [activePortal, setActivePortal] = useState<string>('LinkedIn');
  const [loading, setLoading] = useState(false);
  const [selectedPortals, setSelectedPortals] = useState<Record<string, boolean>>({
    LinkedIn: true,
    Indeed: true,
    Naukri: true,
    Instahyre: true,
    Feed: false
  });
  const [completedPortals, setCompletedPortals] = useState<Record<string, boolean>>({});

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const consoleBodyRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionStartRef = useRef<number | null>(null);

  // Dynamic metrics state
  const [sessionRuntime, setSessionRuntime] = useState('00m 00s');
  const [totalApplied, setTotalApplied] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [emailsSent, setEmailsSent] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_ITEMS_PER_PAGE = 10;

  // Persistent History and Scouter leads
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);
  const [dailyStats, setDailyStats] = useState<Record<string, any>>({});
  const [leads, setLeads] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'console' | 'leads' | 'history' | 'outreach'>('console');
  const [copiedLeadIndex, setCopiedLeadIndex] = useState<number | null>(null);
  const [expandedLeads, setExpandedLeads] = useState<Record<number, boolean>>({});
  const [leadsFilter, setLeadsFilter] = useState<'all' | 'emailed' | 'pending' | 'failed'>('all');
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [isClearingLeads, setIsClearingLeads] = useState(false);

  // Outreach and SMTP States
  const [outreachRecipients, setOutreachRecipients] = useState('');
  const [outreachSubject, setOutreachSubject] = useState('Senior Frontend Developer Opportunity - Shatadal Sundar Sinha');
  const [outreachMessage, setOutreachMessage] = useState(
    `Dear Hiring Team,\n\nI hope this email finds you well.\n\nI came across your open requirements and wanted to share my profile for any suitable positions. I am a Senior Frontend Developer & UI Engineer with 5 years of experience specializing in building high-performance web applications using React, Next.js, and TypeScript.\n\nIn my previous roles, I have designed and delivered scalable student CRM systems, AI-powered resume builders, and browser-automation platforms. I specialize in web optimization, clean responsive UI design, and pixel-perfect implementation.\n\nI have attached my professional highlights and key projects in this email for your quick review. I would love to connect and discuss how my expertise in modern frontend technologies can add value to your team.\n\nLooking forward to hearing from you.\n\nBest regards,\nShatadal Sundar Sinha\nKolkata, India`
  );
  const [smtpConfig, setSmtpConfig] = useState({
    preset: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    username: '',
    password: '',
    senderName: 'Shatadal Sundar Sinha',
    senderEmail: ''
  });
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [outreachLogs, setOutreachLogs] = useState<string[]>([]);
  const [showSmtpConfig, setShowSmtpConfig] = useState(false);
  const [outreachError, setOutreachError] = useState('');
  const [smtpStatus, setSmtpStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // Duplicate / already-contacted validation
  const [duplicateWarning, setDuplicateWarning] = useState<{ duplicates: string[]; alreadySent: string[] } | null>(null);

  // Profile configuration states to present in settings panel
  const profileDetails = {
    name: 'Shatadal Sundar Sinha',
    role: 'Principal Full Stack Architect',
    noticePeriod: 'Immediate Joiner',
    expectedSalary: '10 LPA - 14 LPA',
    resume: 'resume.pdf (Active)',
    experience: '5 Years',
    location: 'Kolkata, West Bengal'
  };

  // 1. Route Guard check authentication
  useEffect(() => {
    const auth = localStorage.getItem('isAuthenticated') === 'true';
    if (!auth) {
      router.push('/login');
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  // Fetch SMTP Config on mount
  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchSmtpConfig = async () => {
      try {
        const res = await fetch('/api/automation/email-config');
        if (res.ok) {
          const data = await res.json();
          setSmtpConfig({
            preset: data.preset || 'gmail',
            host: data.host || 'smtp.gmail.com',
            port: data.port || 465,
            secure: data.secure !== undefined ? data.secure : true,
            username: data.username || '',
            password: data.password || '', // Masked or actual password
            senderName: data.senderName || 'Shatadal Sundar Sinha',
            senderEmail: data.senderEmail || ''
          });
        }
      } catch (err) {
        console.error('Failed to fetch SMTP configuration:', err);
      }
    };
    fetchSmtpConfig();
  }, [isAuthenticated]);

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpStatus(null);
    try {
      const res = await fetch('/api/automation/email-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(smtpConfig)
      });
      const data = await res.json();
      if (data.success) {
        setSmtpStatus({ type: 'success', message: 'SMTP configuration saved successfully!' });

        // Update local state username so that the missing SMTP warning hides immediately
        setSmtpConfig(prev => ({
          ...prev,
          username: smtpConfig.username // Ensure it matches what is in form
        }));

        setTimeout(() => {
          setShowSmtpConfig(false);
          setSmtpStatus(null);
        }, 2000);
      } else {
        setSmtpStatus({ type: 'error', message: 'Failed to save SMTP settings: ' + data.error });
      }
    } catch (err: any) {
      setSmtpStatus({ type: 'error', message: 'Error saving SMTP settings: ' + err.message });
    }
  };

  const handlePresetChange = (preset: string) => {
    let host = 'smtp.gmail.com';
    let port = 465;
    let secure = true;

    if (preset === 'brevo') {
      host = 'smtp-relay.brevo.com';
      port = 587;
      secure = false;
    } else if (preset === 'resend') {
      host = 'smtp.resend.com';
      port = 465;
      secure = true;
    } else if (preset === 'custom') {
      host = '';
      port = 587;
      secure = false;
    }

    setSmtpConfig(prev => ({
      ...prev,
      preset,
      host,
      port,
      secure,
    }));
  };

  // ── Helper: parse the recipient textarea into a clean email list ──
  const parsedEmailList = outreachRecipients
    .split(/[\n,;]+/)
    .map(e => e.trim())
    .filter(e => e && e.includes('@'));

  // Set of emails that were already contacted (have emailedAt in leads)
  const alreadyContactedSet = new Set(
    leads
      .filter((l: any) => !!l.emailedAt)
      .map((l: any) => l.email?.toLowerCase())
  );

  // Per-email status: 'new' | 'duplicate' | 'already-sent'
  const getEmailStatus = (email: string, idx: number): 'new' | 'duplicate' | 'already-sent' => {
    const lower = email.toLowerCase();
    if (alreadyContactedSet.has(lower)) return 'already-sent';
    if (parsedEmailList.findIndex(e => e.toLowerCase() === lower) !== idx) return 'duplicate';
    return 'new';
  };

  const handleSendOutreach = async () => {
    setOutreachError('');
    setDuplicateWarning(null);

    if (!outreachRecipients.trim()) {
      setOutreachError('Please enter at least one recipient email address.');
      return;
    }
    if (!outreachSubject.trim()) {
      setOutreachError('Please enter an email subject.');
      return;
    }
    if (!outreachMessage.trim()) {
      setOutreachError('Please compose an email message body.');
      return;
    }

    if (parsedEmailList.length === 0) {
      setOutreachError('Please enter valid email addresses.');
      return;
    }

    // ── Duplicate + Already-Sent Validation ──────────────────────────
    const seen = new Set<string>();
    const inListDuplicates: string[] = [];
    const alreadySentList: string[] = [];

    parsedEmailList.forEach(email => {
      const lower = email.toLowerCase();
      if (alreadyContactedSet.has(lower)) {
        if (!alreadySentList.includes(email)) alreadySentList.push(email);
      }
      if (seen.has(lower)) {
        if (!inListDuplicates.includes(email)) inListDuplicates.push(email);
      }
      seen.add(lower);
    });

    if (inListDuplicates.length > 0 || alreadySentList.length > 0) {
      setDuplicateWarning({ duplicates: inListDuplicates, alreadySent: alreadySentList });
      return; // Block sending — user must resolve
    }
    // ─────────────────────────────────────────────────────────────────

    setIsSendingEmails(true);
    setOutreachLogs([`🚀 Starting outreach to ${parsedEmailList.length} recipient(s)...`]);

    try {
      const res = await fetch('/api/automation/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: parsedEmailList,
          subject: outreachSubject,
          messageBody: outreachMessage,
          smtpConfig: smtpConfig
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server responded with an error');

      const newLogs: string[] = [];
      newLogs.push(`Outreach complete!`);
      newLogs.push(`✅ Successfully sent: ${data.sentCount}`);
      if (data.failedCount > 0) newLogs.push(`❌ Failed: ${data.failedCount}`);

      if (data.results && data.results.length > 0) {
        for (const r of data.results) {
          if (r.success) {
            newLogs.push(`✅ [SUCCESS] ${r.email}`);
            // Mark this lead as contacted in feed_leads.json
            await fetch('/api/automation/leads', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: r.email, subject: outreachSubject })
            });
          } else {
            newLogs.push(`❌ [FAILED] ${r.email}: ${r.error}`);
            // Mark this lead as outreach failed in feed_leads.json
            await fetch('/api/automation/leads', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: r.email, failed: true, error: r.error })
            });
          }
        }
      }
      setOutreachLogs(newLogs);
      // Refresh leads so badges update immediately
      await fetchLeads();
    } catch (err: any) {
      setOutreachLogs(prev => [...prev, `❌ [ERROR] Dispatch failed: ${err.message}`]);
    } finally {
      setIsSendingEmails(false);
    }
  };

  // 2. Fetch active status and persistent statistics periodically
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchData = async () => {
      try {
        // Fetch status
        const statusRes = await fetch('/api/automation/status').catch(() => null);
        if (!statusRes || !statusRes.ok) return;
        const statusData = await statusRes.json().catch(() => null);
        if (!statusData) return;
        setIsRunning(statusData.isRunning);

        // Fetch stats
        const statsRes = await fetch('/api/automation/stats').catch(() => null);
        if (!statsRes || !statsRes.ok) return;
        const statsData = await statsRes.json().catch(() => null);
        if (!statsData) return;

        // Update live stats from persistent server state
        if (statusData.isRunning && statsData.currentSession) {
          setTotalApplied(statsData.currentSession.applied);
          setSuccessCount(statsData.currentSession.successes);
          setTotalAttempts(statsData.currentSession.attempts);
          setSessionRuntime(statsData.currentSession.runtime);
          setEmailsSent(statsData.currentSession.emailsSent || 0);
          if (!sessionStartRef.current) {
            sessionStartRef.current = parseInt(statsData.currentSession.id);
          }
        } else if (statsData.sessions && statsData.sessions.length > 0) {
          // If idle, load stats of the last completed session
          const lastSession = statsData.sessions[0];
          setTotalApplied(lastSession.applied);
          setSuccessCount(lastSession.successes);
          setTotalAttempts(lastSession.attempts);
          setSessionRuntime(lastSession.runtime);
          setEmailsSent(lastSession.emailsSent || 0);
          sessionStartRef.current = null;
        }

        setSessionHistory(statsData.sessions || []);
        setDailyStats(statsData.dailyStats || {});
      } catch (err) {
        console.error('Failed to fetch status and stats:', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // 3. Fetch recruiter leads from Feed Scouter JSON file
  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/automation/leads').catch(() => null);
      if (!res || !res.ok) return;
      const data = await res.json().catch(() => null);
      if (!data) return;
      setLeads(data.leads || []);
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchLeads();

    // Poll leads every 5 seconds while running to capture new ones in real-time
    let leadsInterval: NodeJS.Timeout | null = null;
    if (isRunning) {
      leadsInterval = setInterval(fetchLeads, 5000);
    }
    return () => {
      if (leadsInterval) clearInterval(leadsInterval);
    };
  }, [isAuthenticated, isRunning]);

  // 4. Session runtime local timer (ticks second-by-second for responsive UI feel)
  useEffect(() => {
    if (isRunning) {
      const tick = setInterval(() => {
        if (!sessionStartRef.current) return;
        const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        if (h > 0) {
          setSessionRuntime(`${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`);
        } else {
          setSessionRuntime(`${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
        }
      }, 1000);
      return () => clearInterval(tick);
    }
  }, [isRunning]);

  // 5. Auto-scroll log console
  useEffect(() => {
    if (consoleBodyRef.current && activeTab === 'console') {
      consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
    }
  }, [logs, activeTab]);

  // 6. Setup log streams (SSE EventSource)
  const connectLogStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const source = new EventSource('/api/automation/logs');
    eventSourceRef.current = source;

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          const text = data.message;
          setLogs((prev) => [...prev, text]);

          // --- Dynamic Metrics: Real-time logs updates ---
          const isRealSubmission =
            text.includes('Application submitted successfully') ||
            text.includes('Applied successfully') ||
            text.includes('application submitted') ||
            text.includes('Application Submitted!') ||
            text.includes('Indeed Job application submitted successfully') ||
            text.includes('Applied successfully!') ||
            text.includes('Application submitted/initiated');

          const isAttempt =
            (text.includes('Clicking') && (text.toLowerCase().includes('apply') || text.toLowerCase().includes('easy apply'))) ||
            text.includes('Clicking internal apply') ||
            text.includes('Clicking apply for');

          const isEmailSent = text.includes('✉️ Sending auto-email to:');
          const isEmailFailed = text.includes('Failed to send auto-email to');

          if (isRealSubmission) {
            setTotalApplied(prev => prev + 1);
            setSuccessCount(prev => prev + 1);
            setTotalAttempts(prev => {
              return prev < successCount + 1 ? successCount + 1 : prev;
            });
          } else if (isAttempt) {
            setTotalAttempts(prev => prev + 1);
          } else if (isEmailSent) {
            setEmailsSent(prev => prev + 1);
          } else if (isEmailFailed) {
            setEmailsSent(prev => Math.max(0, prev - 1));
          }

          // Toggle running state immediately when child process exits
          if (text.includes('[Process System] Process exited')) {
            setIsRunning(false);
            setCompletedPortals(prev => {
              const next = { ...prev };
              Object.keys(selectedPortals).forEach(k => {
                if (selectedPortals[k]) {
                  next[k] = true;
                }
              });
              return next;
            });
            // Fetch finalized stats
            setTimeout(fetchLeads, 1000);
          }

          // Dynamically shift focus tab based on script progress logs
          if (text.includes('[LinkedIn]')) {
            setActivePortal('LinkedIn');
          } else if (text.includes('[Indeed]')) {
            setActivePortal('Indeed');
            setCompletedPortals(prev => ({ ...prev, LinkedIn: true, Instahyre: true, Feed: true }));
          } else if (text.includes('[Naukri]')) {
            setActivePortal('Naukri');
            setCompletedPortals(prev => ({ ...prev, LinkedIn: true, Instahyre: true, Indeed: true, Feed: true }));
          } else if (text.includes('[Instahyre]')) {
            setActivePortal('Instahyre');
            setCompletedPortals(prev => ({ ...prev, LinkedIn: true, Feed: true }));
          } else if (text.includes('[LinkedIn Feed Scouter]')) {
            setActivePortal('Feed');
          }
        }
      } catch (e) {
        console.error('Error parsing SSE event:', e);
      }
    };

    source.onerror = () => {
      console.warn('Logs stream connection dropped. Retrying...');
      source.close();
    };
  };

  useEffect(() => {
    if (isAuthenticated) {
      connectLogStream();
    }
    return () => {
      eventSourceRef.current?.close();
    };
  }, [isAuthenticated]);

  const handleStart = async () => {
    setLoading(true);
    setCompletedPortals({});
    setTotalApplied(0);
    setSuccessCount(0);
    setTotalAttempts(0);
    setEmailsSent(0);
    setSessionRuntime('00m 00s');
    sessionStartRef.current = Date.now();
    try {
      const portals = Object.entries(selectedPortals)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name.toLowerCase());

      const res = await fetch('/api/automation/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ portals })
      });
      const data = await res.json();
      if (data.success) {
        setIsRunning(true);
        setLogs([]); // Reset terminal logs
        connectLogStream();
      }
    } catch (err) {
      console.error('Error starting automation:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/automation/stop', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setIsRunning(false);
      }
    } catch (err) {
      console.error('Error stopping automation:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear all automation history?')) return;
    setIsClearingHistory(true);
    try {
      const res = await fetch('/api/automation/stats', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSessionHistory([]);
        setDailyStats({});
        setTotalApplied(0);
        setSuccessCount(0);
        setTotalAttempts(0);
        setEmailsSent(0);
        setSessionRuntime('00m 00s');
      }
    } catch (err) {
      console.error('Failed to clear stats history:', err);
    } finally {
      setIsClearingHistory(false);
    }
  };

  const handleClearLeads = async () => {
    if (!confirm('Are you sure you want to clear all collected leads?')) return;
    setIsClearingLeads(true);
    try {
      const res = await fetch('/api/automation/leads', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLeads([]);
      }
    } catch (err) {
      console.error('Failed to clear leads:', err);
    } finally {
      setIsClearingLeads(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    eventSourceRef.current?.close();
    router.push('/login');
  };

  const clearLogConsole = () => {
    setLogs([]);
  };

  if (!isAuthenticated) return null;

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden relative selection:bg-indigo-500 selection:text-white" style={{ height: '100dvh' }}>
      {/* Background ambient glows */}
      <div className="absolute top-[-10%] left-[-5%] w-[45%] h-[45%] bg-indigo-600/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[45%] h-[45%] bg-purple-600/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Grid background mask */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-25 pointer-events-none" />

      {/* Navigation Header */}
      <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 md:px-5 border-b border-slate-800/80 backdrop-blur-xl bg-slate-950/80 z-10">
        <div className="flex items-center space-x-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg animate-glow-ring">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="overflow-hidden">
            <h1 className="text-xs md:text-sm font-bold text-white tracking-tight truncate max-w-[180px] sm:max-w-none">
              Shatadal's Personal AI Job Apply Agent
            </h1>
            <p className="text-[8px] md:text-[9px] text-indigo-400 font-semibold uppercase tracking-wider">Outbound Control Cockpit</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="flex items-center space-x-2 bg-slate-900/60 border border-slate-850 px-2 py-1 rounded-lg text-[10px] md:text-xs font-semibold">
            <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
            <span className="text-slate-300 hidden sm:inline">{isRunning ? 'Execution Active' : 'System Idle'}</span>
          </div>

          <button
            onClick={handleLogout}
            className="px-2.5 py-1 rounded-lg border border-slate-800 hover:border-rose-500/30 bg-slate-900/60 text-slate-400 hover:text-rose-400 text-[10px] md:text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Dashboard Space */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden p-4 gap-4 relative z-10">

        {/* Left Control and Portal Cards */}
        <div className="w-full lg:w-80 flex flex-col gap-4 flex-shrink-0 overflow-hidden">

          {/* Action Trigger Card */}
          <div className="backdrop-blur-xl bg-slate-900/40 rounded-xl border border-slate-800/80 p-4 shadow-lg relative overflow-hidden flex-shrink-0">
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Agent Controller</h3>

            <div className="flex flex-col gap-3">
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-emerald-600/15 hover:shadow-emerald-600/30 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Start Auto-Apply</span>
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-500 hover:to-pink-400 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-rose-600/15 hover:shadow-rose-600/30 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  <span>Stop Automation</span>
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Container for Portals and Config */}
          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-0.5">
            {/* Job Portals Display */}
            <div className="backdrop-blur-xl bg-slate-900/40 rounded-xl border border-slate-800/80 p-4 shadow-lg flex flex-col flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Job Portals</h3>
              <div className="flex flex-col gap-2.5 flex-1">
                {[
                  { name: 'LinkedIn', displayName: 'LinkedIn Job Apply', icon: '👤', status: isRunning && activePortal === 'LinkedIn' ? 'active' : 'idle', url: 'https://linkedin.com/jobs' },
                  { name: 'Indeed', displayName: 'Indeed Job Apply', icon: '🔍', status: isRunning && activePortal === 'Indeed' ? 'active' : 'idle', url: 'https://indeed.com' },
                  { name: 'Naukri', displayName: 'Naukri Job Apply', icon: '💼', status: isRunning && activePortal === 'Naukri' ? 'active' : 'idle', url: 'https://naukri.com' },
                  { name: 'Instahyre', displayName: 'Instahyre Job Apply', icon: '⚡', status: isRunning && activePortal === 'Instahyre' ? 'active' : 'idle', url: 'https://instahyre.com' },
                  { name: 'Feed', displayName: 'LinkedIn Feed Data Collector', icon: '✉️', status: isRunning && activePortal === 'Feed' ? 'active' : 'idle', url: 'LinkedIn Feed Scouter' }
                ].map((portal) => (
                  <div
                    key={portal.name}
                    className={`border rounded-lg p-2.5 flex items-center justify-between transition-all ${portal.status === 'active'
                        ? 'bg-indigo-650/10 border-indigo-500/30 text-indigo-300 shadow-sm'
                        : !selectedPortals[portal.name]
                          ? 'bg-slate-950/5 border-slate-950/20 text-slate-650 opacity-60'
                          : 'bg-slate-950/20 border-slate-900 text-slate-400'
                      } ${!isRunning ? 'cursor-pointer hover:border-slate-800/85 hover:bg-slate-900/10' : ''}`}
                    onClick={() => {
                      if (!isRunning) {
                        setSelectedPortals((prev): Record<string, boolean> => {
                          const nextVal = !prev[portal.name];
                          if (portal.name === 'Feed') {
                            if (nextVal) {
                              // If enabling Feed scouter only, disable all other job apply portals
                              return {
                                LinkedIn: false,
                                Indeed: false,
                                Naukri: false,
                                Instahyre: false,
                                Feed: true
                              };
                            } else {
                              return {
                                ...prev,
                                Feed: false
                              };
                            }
                          } else {
                            if (nextVal) {
                              // If enabling any job apply portal, disable Feed scouter only mode
                              return {
                                ...prev,
                                [portal.name]: true,
                                Feed: false
                              };
                            } else {
                              return {
                                ...prev,
                                [portal.name]: false
                              };
                            }
                          }
                        });
                      }
                    }}
                  >
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <span className="text-lg select-none">{portal.icon}</span>
                      <div className="overflow-hidden">
                        <h4 className="text-xs font-bold text-slate-200">{portal.displayName || portal.name}</h4>
                        <p className="text-[9px] text-slate-500 truncate mt-0.5">{portal.url}</p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      {!isRunning ? (
                        <div
                          className={`w-8 h-4 rounded-full relative transition-all duration-200 cursor-pointer ${selectedPortals[portal.name]
                              ? 'bg-gradient-to-r from-indigo-500 to-purple-600'
                              : 'bg-slate-850'
                            }`}
                        >
                          <div
                            className={`absolute top-[2px] start-[2px] h-3 w-3 rounded-full transition-all duration-200 ${selectedPortals[portal.name]
                                ? 'translate-x-4 bg-white'
                                : 'translate-x-0 bg-slate-500'
                              }`}
                          />
                        </div>
                      ) : (
                        !selectedPortals[portal.name] ? (
                          <span className="text-[9px] font-bold text-slate-500 bg-slate-900/60 border border-slate-850 px-2 py-0.5 rounded-md uppercase tracking-wider">
                            Skipped
                          </span>
                        ) : activePortal === portal.name ? (
                          <span className="flex items-center gap-1 text-[9px] font-bold text-indigo-400 bg-indigo-950/30 border border-indigo-500/20 px-2 py-0.5 rounded-md uppercase tracking-wider animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                            Scanning
                          </span>
                        ) : completedPortals[portal.name] ? (
                          <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                            Done
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-amber-500 bg-amber-950/10 border border-amber-550/15 px-2 py-0.5 rounded-md uppercase tracking-wider">
                            Queued
                          </span>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Configuration Parameters */}
            <div className="backdrop-blur-xl bg-slate-900/40 rounded-xl border border-slate-800/80 p-4 shadow-lg flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Agent Config</h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800/40 pb-1.5">
                  <span className="text-slate-500 font-semibold">Notice Period</span>
                  <span className="text-slate-300 font-bold">{profileDetails.noticePeriod}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/40 pb-1.5">
                  <span className="text-slate-500 font-semibold">Expected CTC</span>
                  <span className="text-slate-300 font-bold">{profileDetails.expectedSalary}</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/40 pb-1.5">
                  <span className="text-slate-500 font-semibold">Experience</span>
                  <span className="text-slate-300 font-bold">{profileDetails.experience}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">CV Uploaded</span>
                  <span className="text-indigo-400 font-bold truncate max-w-[120px]">{profileDetails.resume}</span>
                </div>
              </div>
            </div>

            {/* User Session & Sign Out */}
            <div className="backdrop-blur-xl bg-slate-900/40 rounded-xl border border-slate-800/80 p-4 shadow-lg flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">User Session</h3>
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs shadow-md ring-2 ring-indigo-500/20">
                  SS
                </div>
                <div className="overflow-hidden">
                  <h4 className="text-xs font-bold text-slate-200 truncate">{profileDetails.name}</h4>
                  <p className="text-[10px] text-slate-500 truncate">shatadal17@gmail.com</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full py-2 rounded-lg border border-rose-500/20 hover:border-rose-500/40 bg-rose-950/10 hover:bg-rose-950/20 text-rose-400 text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:shadow-rose-950/30"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 01-3-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Sign Out of Agent</span>
              </button>
            </div>
          </div>

        </div>

        {/* Right Side: Metrics and Log Console container */}
        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">

          {/* Engine Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 flex-shrink-0">
            {(() => {
              const activePortalCount = Object.values(selectedPortals).filter(Boolean).length;
              const successRate = totalAttempts > 0
                ? ((successCount / totalAttempts) * 100).toFixed(1)
                : '0.0';
              const successDesc = totalAttempts > 0
                ? `${successCount} of ${totalAttempts} attempts`
                : isRunning ? 'Waiting for data...' : 'Start agent to track';
              const appliedDesc = totalApplied > 0
                ? `Across ${activePortalCount} portal${activePortalCount !== 1 ? 's' : ''}`
                : isRunning ? 'Processing...' : 'Not started yet';
              const tunnelDesc = isRunning
                ? `${activePortalCount} active now`
                : `${activePortalCount} portal${activePortalCount !== 1 ? 's' : ''} selected`;
              const metrics = [
                { label: 'Success Rate', value: totalAttempts > 0 ? `${successRate}%` : '—', desc: successDesc, color: 'from-emerald-500/15 to-emerald-600/5', text: 'text-emerald-400', border: 'border-emerald-500/20' },
                { label: 'Total Applied', value: totalApplied.toLocaleString(), desc: appliedDesc, color: 'from-indigo-500/15 to-indigo-600/5', text: 'text-indigo-400', border: 'border-indigo-500/20' },
                { label: 'Emails Fired', value: emailsSent.toLocaleString(), desc: isRunning ? 'Outreach sending...' : 'Outreach emails sent', color: 'from-amber-500/15 to-amber-600/5', text: 'text-amber-400', border: 'border-amber-500/20' },
                { label: 'Session Runtime', value: sessionRuntime !== '00m 00s' ? sessionRuntime : '—', desc: isRunning ? 'Live timer' : (sessionRuntime !== '00m 00s' ? 'Last session' : 'Not running'), color: 'from-purple-500/15 to-purple-600/5', text: 'text-purple-400', border: 'border-purple-500/20' },
                { label: 'Tunnel Status', value: isRunning ? `${activePortalCount}/${activePortalCount} Active` : `${activePortalCount} Ready`, desc: tunnelDesc, color: 'from-cyan-500/15 to-cyan-600/5', text: 'text-cyan-400', border: 'border-cyan-500/20' },
              ];
              return metrics.map((metric, i) => (
                <div key={i} className={`backdrop-blur-xl bg-gradient-to-br ${metric.color} rounded-xl border ${metric.border} p-3 shadow-sm relative overflow-hidden transition-all hover:scale-[1.01] hover:border-slate-700/80`}>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{metric.label}</div>
                  <div className={`text-sm md:text-base font-extrabold ${metric.text} mt-0.5`}>{metric.value}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">{metric.desc}</div>
                </div>
              ));
            })()}
          </div>

          {/* Tabbed Panel container */}
          <div className="flex-1 flex flex-col backdrop-blur-xl bg-slate-900/40 rounded-xl border border-slate-800/80 shadow-lg overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />

            {/* Tabbed Header */}
            <div className="h-12 border-b border-slate-800/80 px-4 flex items-center justify-between bg-slate-950/20 flex-shrink-0 overflow-x-auto">
              <div className="flex items-center space-x-1">
                {[
                  { id: 'console', name: 'Live Console Logs', icon: '💻' },
                  { id: 'leads', name: `LinkedIn Feed Leads (${leads.length})`, icon: '🎯' },
                  { id: 'outreach', name: 'Email Outreach', icon: '✉️' },
                  { id: 'history', name: 'Execution History', icon: '📊' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${activeTab === tab.id
                        ? 'bg-indigo-600/15 border border-indigo-500/30 text-indigo-300 shadow-sm'
                        : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-850/20'
                      }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.name}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {activeTab === 'console' && (
                  <button
                    onClick={clearLogConsole}
                    className="text-[10px] border border-slate-850 hover:border-slate-800 hover:bg-slate-850/40 px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-200 transition-all font-semibold font-mono cursor-pointer"
                  >
                    clear logs
                  </button>
                )}
                {activeTab === 'leads' && leads.length > 0 && (
                  <button
                    onClick={handleClearLeads}
                    disabled={isClearingLeads}
                    className="text-[10px] border border-rose-900/30 hover:border-rose-800 hover:bg-rose-950/25 px-2.5 py-1 rounded-lg text-rose-450 hover:text-rose-400 transition-all font-semibold cursor-pointer"
                  >
                    {isClearingLeads ? 'clearing...' : 'clear leads'}
                  </button>
                )}
                {activeTab === 'history' && sessionHistory.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    disabled={isClearingHistory}
                    className="text-[10px] border border-rose-900/30 hover:border-rose-800 hover:bg-rose-950/25 px-2.5 py-1 rounded-lg text-rose-455 hover:text-rose-400 transition-all font-semibold cursor-pointer"
                  >
                    {isClearingHistory ? 'clearing...' : 'clear history'}
                  </button>
                )}
              </div>
            </div>

            {/* TAB CONTENT 1: Live Console logs */}
            {activeTab === 'console' && (
              <div ref={consoleBodyRef} className="flex-1 overflow-y-auto p-4 bg-slate-950/80 font-mono text-[13px] leading-relaxed select-text space-y-1">
                {logs.length > 0 ? (
                  logs.map((log, index) => {
                    let colorClass = 'text-slate-400';

                    if (log.includes('[LinkedIn]')) colorClass = 'text-blue-400 font-semibold';
                    else if (log.includes('[Indeed]')) colorClass = 'text-indigo-400 font-semibold';
                    else if (log.includes('[Naukri]')) colorClass = 'text-amber-400 font-semibold';
                    else if (log.includes('[Instahyre]')) colorClass = 'text-teal-400 font-semibold';
                    else if (log.includes('✅') || log.includes('Success')) colorClass = 'text-emerald-400 font-bold';
                    else if (log.includes('❌') || log.includes('Error') || log.includes('failed')) colorClass = 'text-rose-400 font-semibold';
                    else if (log.includes('[AI Match Engine]')) colorClass = 'text-purple-400';
                    else if (log.includes('[Process System]')) colorClass = 'text-cyan-400 font-semibold';
                    else if (log.includes('[Form Fill]')) colorClass = 'text-slate-300';
                    else if (log.includes('[LinkedIn Feed Scouter]')) colorClass = 'text-sky-400 font-medium';

                    return (
                      <div key={index} className={`${colorClass} whitespace-pre-wrap`}>
                        {log}
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 select-none animate-pulse py-16">
                    <svg className="w-8 h-8 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs">Live log stream is idle. Click Start Auto-Apply to begin.</span>
                  </div>
                )}
                <div ref={consoleEndRef} />
              </div>
            )}

            {/* TAB CONTENT 2: LinkedIn Feed Leads */}
            {activeTab === 'leads' && (
              <div className="flex-1 overflow-y-auto p-4 bg-slate-950/80 space-y-4">
                {leads.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 select-none py-16">
                    <span className="text-3xl mb-3">📬</span>
                    <span className="text-xs font-semibold">No recruitment leads collected yet. Run the scouter first!</span>
                  </div>
                ) : (
                  (() => {
                    const filteredLeads = leads.filter((lead: any) => {
                      if (leadsFilter === 'emailed') return !!lead.emailedAt;
                      if (leadsFilter === 'pending') return !lead.emailedAt && !lead.outreachFailed;
                      if (leadsFilter === 'failed') return !!lead.outreachFailed;
                      return true;
                    });

                    return (
                      <div className="space-y-4">
                        {/* Stats summary strip */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/15 p-3 rounded-2xl">
                          <div
                            onClick={() => setLeadsFilter('all')}
                            className={`p-2.5 rounded-xl text-center cursor-pointer transition-all duration-200 select-none ${leadsFilter === 'all'
                                ? 'bg-indigo-600/15 ring-1 ring-indigo-500/20 shadow-md'
                                : 'bg-slate-950/30 hover:bg-slate-950/40 text-slate-400 hover:text-slate-200'
                              }`}
                          >
                            <span className="text-[9px] font-extrabold uppercase tracking-wider block">Leads Collected</span>
                            <span className="text-sm font-black text-indigo-400 mt-0.5 block font-mono">{leads.length}</span>
                          </div>
                          <div
                            onClick={() => setLeadsFilter('emailed')}
                            className={`p-2.5 rounded-xl text-center cursor-pointer transition-all duration-200 select-none ${leadsFilter === 'emailed'
                                ? 'bg-emerald-650/15 ring-1 ring-emerald-500/20 shadow-md'
                                : 'bg-slate-950/30 hover:bg-slate-950/40 text-slate-400 hover:text-slate-200'
                              }`}
                          >
                            <span className="text-[9px] font-extrabold uppercase tracking-wider block">Emailed Managers</span>
                            <span className="text-sm font-black text-emerald-450 mt-0.5 block font-mono">{leads.filter((l: any) => !!l.emailedAt).length}</span>
                          </div>
                          <div
                            onClick={() => setLeadsFilter('pending')}
                            className={`p-2.5 rounded-xl text-center cursor-pointer transition-all duration-200 select-none ${leadsFilter === 'pending'
                                ? 'bg-indigo-650/15 ring-1 ring-indigo-450/20 shadow-md'
                                : 'bg-slate-950/30 hover:bg-slate-950/40 text-slate-400 hover:text-slate-200'
                              }`}
                          >
                            <span className="text-[9px] font-extrabold uppercase tracking-wider block">Pending Outreach</span>
                            <span className="text-sm font-black text-indigo-300 mt-0.5 block font-mono">{leads.filter((l: any) => !l.emailedAt && !l.outreachFailed).length}</span>
                          </div>
                          <div
                            onClick={() => setLeadsFilter('failed')}
                            className={`p-2.5 rounded-xl text-center cursor-pointer transition-all duration-200 select-none ${leadsFilter === 'failed'
                                ? 'bg-rose-650/15 ring-1 ring-rose-500/20 shadow-md'
                                : 'bg-slate-950/30 hover:bg-slate-950/40 text-slate-400 hover:text-slate-200'
                              }`}
                          >
                            <span className="text-[9px] font-extrabold uppercase tracking-wider block">Failed Outreach</span>
                            <span className="text-sm font-black text-rose-450 mt-0.5 block font-mono">{leads.filter((l: any) => !!l.outreachFailed).length}</span>
                          </div>
                        </div>

                        {filteredLeads.length === 0 ? (
                          <div className="bg-slate-900/10 border border-dashed border-slate-900 p-12 text-center rounded-2xl text-slate-500">
                            <span className="text-xs font-semibold block">No leads match the active filter.</span>
                            <span className="text-[10px] text-slate-600 mt-1 block">Try selecting another status tab above.</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {filteredLeads.map((lead: any, idx: number) => {
                              const parsed = parseLeadPost(lead);
                              return (
                                <div
                                  key={idx}
                                  className="bg-slate-900/30 border border-slate-850/35 hover:border-indigo-500/15 rounded-2xl p-4 flex flex-col justify-between hover:bg-slate-900/40 transition-all duration-300 shadow-sm relative overflow-hidden group"
                                >
                                  <div>
                                    {/* Card Header info */}
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                      <div className="flex items-center gap-2.5 overflow-hidden">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-650/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0 text-indigo-400 font-extrabold text-sm uppercase tracking-tight select-none">
                                          {parsed.company.slice(0, 2)}
                                        </div>
                                        <div className="overflow-hidden">
                                          <h4 className="text-xs font-black text-slate-200 truncate tracking-tight" title={parsed.company}>
                                            {parsed.company}
                                          </h4>
                                          <p className="text-[9px] text-slate-500 flex items-center gap-1 font-semibold mt-0.5">
                                            <span>📍</span>
                                            <span className="truncate">{lead.location || 'Not Specified'}</span>
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${lead.jobType === 'Remote'
                                            ? 'bg-sky-500/10 border border-sky-500/20 text-sky-400'
                                            : lead.jobType === 'Contract'
                                              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                                              : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400'
                                          }`}>
                                          {lead.jobType || 'Full-time'}
                                        </span>
                                        {lead.emailedAt ? (
                                          <span
                                            className="text-[8px] bg-emerald-500/10 border border-emerald-500/25 text-emerald-455 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-0.5 cursor-help"
                                            title={`Sent: ${lead.emailedSubject || 'No Subject'}`}
                                          >
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-450 animate-pulse" />
                                            <span>Emailed</span>
                                          </span>
                                        ) : lead.outreachFailed ? (
                                          <span
                                            className="text-[8px] bg-rose-500/10 border border-rose-500/25 text-rose-455 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-0.5 cursor-help"
                                            title={`Error: ${lead.outreachError || 'Delivery failed'}`}
                                          >
                                            <span className="w-1.5 h-1.5 rounded-full bg-rose-450 animate-pulse" />
                                            <span>Failed</span>
                                          </span>
                                        ) : (
                                          <span className="text-[8px] bg-indigo-500/15 border border-indigo-500/20 text-indigo-355 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-0.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-450" />
                                            <span>Pending</span>
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Job Position title & Highlights */}
                                    <div className="mb-3">
                                      <h3 className="text-sm font-black text-white leading-snug tracking-tight mb-2.5 bg-gradient-to-r from-slate-100 via-slate-200 to-indigo-250 bg-clip-text text-transparent group-hover:from-white group-hover:to-indigo-300 transition-all duration-300">
                                        {parsed.roleTitle}
                                      </h3>
                                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                                        <div className="bg-slate-950/25 p-2.5 rounded-xl">
                                          <span className="text-slate-500 block uppercase font-bold text-[8px] tracking-wider mb-0.5">Vacancies</span>
                                          <span className="text-slate-355 font-bold">{parsed.vacancies}</span>
                                        </div>
                                        <div className="bg-slate-950/25 p-2.5 rounded-xl">
                                          <span className="text-slate-500 block uppercase font-bold text-[8px] tracking-wider mb-0.5">Experience Req.</span>
                                          <span className="text-slate-355 font-bold">{parsed.experience}</span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Recruiter Email Action section */}
                                    <div className={`flex items-center justify-between bg-slate-950/35 border-l-2 p-2.5 rounded-r-xl rounded-l-sm mb-3 ${lead.outreachFailed ? 'border-rose-500/50' : 'border-emerald-500/50'
                                      }`}>
                                      <div className="overflow-hidden pr-2">
                                        <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider block mb-0.5">
                                          {lead.outreachFailed ? 'Recruiter Email (Delivery Failed)' : 'Recruiter Direct Email'}
                                        </span>
                                        <code className={`text-xs font-extrabold truncate select-all block font-mono tracking-tight ${lead.outreachFailed ? 'text-rose-400 font-bold' : 'text-emerald-400 font-extrabold'
                                          }`}>
                                          {lead.email}
                                        </code>
                                        {lead.outreachFailed && lead.outreachError && (
                                          <span className="text-[9px] text-rose-500/90 truncate block mt-0.5 font-medium leading-none" title={lead.outreachError}>
                                            ⚠️ {lead.outreachError}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                          onClick={() => {
                                            navigator.clipboard.writeText(lead.email);
                                            setCopiedLeadIndex(idx);
                                            setTimeout(() => setCopiedLeadIndex(null), 2000);
                                          }}
                                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 hover:text-white text-slate-400 transition-all cursor-pointer shadow-sm text-[10px] font-extrabold active:scale-[0.97]"
                                        >
                                          {copiedLeadIndex === idx ? 'Copied ✓' : 'Copy'}
                                        </button>
                                        <button
                                          onClick={() => {
                                            setOutreachRecipients(prev => {
                                              const trimmed = prev.trim();
                                              if (!trimmed) return lead.email;
                                              const emails = trimmed.split(',').map(e => e.trim()).filter(Boolean);
                                              if (emails.includes(lead.email)) return prev;
                                              return `${prev}, ${lead.email}`;
                                            });
                                            setActiveTab('outreach');
                                          }}
                                          className="px-2.5 py-1.5 rounded-lg bg-indigo-650/10 hover:bg-indigo-650/20 text-indigo-300 transition-all cursor-pointer shadow-sm text-[10px] font-extrabold border border-indigo-500/10 active:scale-[0.97]"
                                        >
                                          Outreach
                                        </button>
                                      </div>
                                    </div>

                                    {/* Collapsible Post Body Content */}
                                    <div className="relative mb-2">
                                      <div className={`text-[11px] text-slate-400 leading-relaxed bg-slate-950/15 p-3 rounded-xl whitespace-pre-wrap select-text transition-all duration-300 ${expandedLeads[idx] ? '' : 'max-h-[85px] overflow-hidden'
                                        }`}>
                                        {lead.postText}
                                      </div>
                                      {!expandedLeads[idx] && (
                                        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-slate-900/90 to-transparent pointer-events-none" />
                                      )}
                                    </div>
                                    <button
                                      onClick={() => setExpandedLeads(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                      className="text-[10px] font-extrabold text-indigo-400 hover:text-indigo-350 transition-colors flex items-center gap-0.5 cursor-pointer pb-2"
                                    >
                                      {expandedLeads[idx] ? 'Show Less ▲' : 'Read Full Post ▼'}
                                    </button>
                                  </div>

                                  {/* Location, Poster, Extraction Metadata Footer */}
                                  <div className="flex items-center justify-between text-[9px] text-slate-550 mt-2.5 pt-2.5">
                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                      <span className="text-xs">👤</span>
                                      {lead.authorProfile ? (
                                        <a
                                          href={lead.authorProfile}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="font-bold text-slate-400 hover:text-indigo-400 hover:underline truncate flex items-center gap-0.5"
                                        >
                                          <span>{lead.authorName || 'Recruiter'}</span>
                                          <svg className="w-2.5 h-2.5 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                          </svg>
                                        </a>
                                      ) : (
                                        <span className="font-bold text-slate-400 truncate">{lead.authorName || 'Recruiter'}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0 text-slate-550 font-semibold font-mono">
                                      <span>⏳ {lead.postTime || 'Recent'}</span>
                                      <span>•</span>
                                      <span>📅 {new Date(lead.extractedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {/* TAB CONTENT 3: Execution History and Daily stats */}
            {activeTab === 'history' && (
              <div className="flex-1 overflow-y-auto p-4 bg-slate-950/80 space-y-5">
                {/* Daily stats list */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Daily Aggregates</h4>
                  {Object.keys(dailyStats).length === 0 ? (
                    <p className="text-[10px] text-slate-600 italic">No runs tracked yet for today.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                      {Object.entries(dailyStats).map(([date, stat]: [string, any]) => {
                        const h = Math.floor(stat.totalRuntimeSeconds / 3600);
                        const m = Math.floor((stat.totalRuntimeSeconds % 3600) / 60);
                        const durationStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
                        return (
                          <div key={date} className="bg-slate-900/30 border border-slate-900 p-2.5 rounded-lg flex flex-col justify-between">
                            <div>
                              <span className="text-[9px] text-slate-500 font-bold">{date}</span>
                              <div className="text-[11px] font-bold text-slate-350 mt-1">
                                {stat.totalApplied} applied | {stat.totalEmailsSent || 0} emails ({stat.runsCount} runs)
                              </div>
                            </div>
                            <span className="text-[9px] text-indigo-400 mt-2 font-semibold">🕒 {durationStr} active</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Session list table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Session-wise Logs</h4>
                  {(() => {
                    const totalPages = Math.ceil(sessionHistory.length / HISTORY_ITEMS_PER_PAGE);
                    const safeHistoryPage = Math.min(Math.max(1, historyPage), totalPages || 1);
                    const paginatedHistory = sessionHistory.slice((safeHistoryPage - 1) * HISTORY_ITEMS_PER_PAGE, safeHistoryPage * HISTORY_ITEMS_PER_PAGE);
                    
                    return sessionHistory.length === 0 ? (
                      <div className="text-center text-slate-600 select-none py-8 border border-dashed border-slate-900 rounded-lg">
                        <span className="text-xs">No completed sessions history yet.</span>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto border border-slate-900 rounded-lg">
                          <table className="w-full text-[11px] text-left border-collapse min-w-[500px]">
                            <thead>
                              <tr className="bg-slate-950/60 text-slate-500 border-b border-slate-900 select-none">
                                <th className="p-2.5">Date</th>
                                <th className="p-2.5">Start</th>
                                <th className="p-2.5">End</th>
                                <th className="p-2.5">Runtime</th>
                                <th className="p-2.5 text-center">Applied / Attempts</th>
                                <th className="p-2.5 text-center">Emails Sent</th>
                                <th className="p-2.5 text-right">Success Rate</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedHistory.map((sess: any, idx: number) => {
                                const successRate = sess.attempts > 0
                                  ? ((sess.successes / sess.attempts) * 100).toFixed(0)
                                  : '0';
                                return (
                                  <tr key={idx} className="border-b border-slate-900/40 hover:bg-slate-900/10 text-slate-300 font-mono">
                                    <td className="p-2.5 text-slate-450">{sess.date}</td>
                                    <td className="p-2.5">{sess.startTime}</td>
                                    <td className="p-2.5">{sess.endTime || 'Aborted'}</td>
                                    <td className="p-2.5 text-indigo-400">{sess.runtime}</td>
                                    <td className="p-2.5 text-center">{sess.applied} / {sess.attempts}</td>
                                    <td className="p-2.5 text-center text-amber-400">{sess.emailsSent || 0}</td>
                                    <td className={`p-2.5 text-right font-bold ${parseInt(successRate) >= 60 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                      {successRate}%
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {totalPages > 1 && (
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-3 py-2 mt-2 bg-slate-950/20 border border-slate-900 rounded-lg text-[10px] text-slate-400 font-mono">
                            <div className="text-slate-500">
                              Showing <span className="font-bold text-slate-350">{(safeHistoryPage - 1) * HISTORY_ITEMS_PER_PAGE + 1}</span> to <span className="font-bold text-slate-350">{Math.min(safeHistoryPage * HISTORY_ITEMS_PER_PAGE, sessionHistory.length)}</span> of <span className="font-bold text-slate-350">{sessionHistory.length}</span> sessions
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                                disabled={safeHistoryPage === 1}
                                className="px-2.5 py-1 rounded border border-slate-850 bg-slate-900/40 hover:bg-slate-850/60 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:border-transparent transition-all cursor-pointer font-bold select-none"
                              >
                                Prev
                              </button>
                              
                              {Array.from({ length: totalPages }).map((_, pIdx) => {
                                const pNum = pIdx + 1;
                                if (totalPages > 5 && pNum !== 1 && pNum !== totalPages && Math.abs(pNum - safeHistoryPage) > 1) {
                                  if (pNum === 2 && safeHistoryPage > 3) {
                                    return <span key={pNum} className="px-1 text-slate-600 select-none">...</span>;
                                  }
                                  if (pNum === totalPages - 1 && safeHistoryPage < totalPages - 2) {
                                    return <span key={pNum} className="px-1 text-slate-600 select-none">...</span>;
                                  }
                                  return null;
                                }
                                
                                return (
                                  <button
                                    key={pNum}
                                    onClick={() => setHistoryPage(pNum)}
                                    className={`px-2 py-0.5 rounded transition-all cursor-pointer select-none font-bold ${
                                      safeHistoryPage === pNum
                                        ? 'bg-indigo-500/20 border border-indigo-555/40 text-indigo-400'
                                        : 'border border-transparent hover:border-slate-850 hover:bg-slate-900/40 text-slate-400'
                                    }`}
                                  >
                                    {pNum}
                                  </button>
                                );
                              })}

                              <button
                                onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                                disabled={safeHistoryPage === totalPages}
                                className="px-2.5 py-1 rounded border border-slate-850 bg-slate-900/40 hover:bg-slate-850/60 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:border-transparent transition-all cursor-pointer font-bold select-none"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* TAB CONTENT 4: Email Outreach */}
            {activeTab === 'outreach' && (
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-950/80 p-4 gap-4">
                {/* Left side: Composer & SMTP settings */}
                <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">

                  {/* SMTP Credentials Status Header / Toggle */}
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">
                          SMTP Mailer Settings
                        </h4>
                        <p className="text-[10px] text-slate-500">
                          {smtpConfig.username
                            ? `Active: ${smtpConfig.preset.toUpperCase()} (${smtpConfig.username})`
                            : 'No SMTP configuration saved yet'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowSmtpConfig(!showSmtpConfig)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-850/40 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-all cursor-pointer"
                    >
                      {showSmtpConfig ? 'Hide Settings' : 'Configure SMTP'}
                    </button>
                  </div>

                  {/* Collapsible SMTP Configuration panel */}
                  {showSmtpConfig && (
                    <form onSubmit={handleSaveSmtp} className="bg-slate-900/80 border border-slate-800/90 rounded-xl p-4 shadow-lg space-y-3.5">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <span className="text-xs font-bold text-slate-300">SMTP Server Configuration</span>
                        <div className="flex items-center gap-1">
                          {['gmail', 'brevo', 'resend', 'custom'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => handlePresetChange(preset)}
                              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all ${smtpConfig.preset === preset
                                  ? 'bg-indigo-600 text-white border border-indigo-500'
                                  : 'bg-slate-950 text-slate-500 border border-slate-900 hover:text-slate-300'
                                }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-400 font-medium">SMTP Host</label>
                          <input
                            type="text"
                            required
                            disabled={smtpConfig.preset !== 'custom'}
                            value={smtpConfig.host}
                            onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-indigo-500 transition-all"
                            placeholder="e.g. smtp.gmail.com"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-400 font-medium">SMTP Port</label>
                          <input
                            type="number"
                            required
                            disabled={smtpConfig.preset !== 'custom'}
                            value={smtpConfig.port}
                            onChange={(e) => setSmtpConfig({ ...smtpConfig, port: parseInt(e.target.value) || 0 })}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-indigo-500 transition-all"
                            placeholder="e.g. 465"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs py-1">
                        <span className="text-slate-400 font-medium">Secure SSL/TLS Connection</span>
                        <input
                          type="checkbox"
                          disabled={smtpConfig.preset !== 'custom'}
                          checked={smtpConfig.secure}
                          onChange={(e) => setSmtpConfig({ ...smtpConfig, secure: e.target.checked })}
                          className="w-4 h-4 text-indigo-650 bg-slate-950 border-slate-800 rounded focus:ring-indigo-500 focus:ring-2 focus:ring-offset-slate-900 outline-none cursor-pointer"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-400 font-medium">Username / Login Email</label>
                          <input
                            type="text"
                            required
                            value={smtpConfig.username}
                            onChange={(e) => setSmtpConfig({ ...smtpConfig, username: e.target.value })}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-indigo-500 transition-all"
                            placeholder="e.g. yourname@domain.com"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-400 font-medium">Password / App Key</label>
                          <input
                            type="password"
                            required
                            value={smtpConfig.password}
                            onChange={(e) => setSmtpConfig({ ...smtpConfig, password: e.target.value })}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-indigo-500 transition-all"
                            placeholder="SMTP Password or Token"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-400 font-medium">Sender Name</label>
                          <input
                            type="text"
                            required
                            value={smtpConfig.senderName}
                            onChange={(e) => setSmtpConfig({ ...smtpConfig, senderName: e.target.value })}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-indigo-500 transition-all"
                            placeholder="e.g. Shatadal Sundar Sinha"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-400 font-medium">Sender Email (Optional)</label>
                          <input
                            type="text"
                            value={smtpConfig.senderEmail}
                            onChange={(e) => setSmtpConfig({ ...smtpConfig, senderEmail: e.target.value })}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-indigo-500 transition-all"
                            placeholder="Defaults to Username if empty"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowSmtpConfig(false)}
                          className="px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-350 text-xs font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md cursor-pointer transition-all active:scale-[0.98]"
                        >
                          Save SMTP Settings
                        </button>
                      </div>

                      {smtpStatus && (
                        <div className={`text-xs font-semibold p-2.5 rounded-lg text-center mt-2.5 ${smtpStatus.type === 'success'
                            ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400'
                            : 'bg-rose-500/10 border border-rose-500/25 text-rose-450'
                          }`}>
                          {smtpStatus.type === 'success' ? '✅' : '❌'} {smtpStatus.message}
                        </div>
                      )}
                    </form>
                  )}

                  {/* Outreach Mail Composer Form */}
                  <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Outreach Campaign Composer</h3>
                      {parsedEmailList.length > 0 && (
                        <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                          {parsedEmailList.length} recipient{parsedEmailList.length !== 1 ? 's' : ''} queued
                        </span>
                      )}
                    </div>

                    {/* Recipients Textarea */}
                    <div className="flex flex-col gap-1.5 text-xs">
                      <label className="text-slate-400 font-medium">Recipients (comma, semicolon, or newline separated)</label>
                      <textarea
                        rows={2}
                        value={outreachRecipients}
                        onChange={(e) => { setOutreachRecipients(e.target.value); setDuplicateWarning(null); }}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-200 outline-none focus:border-indigo-500 transition-all font-mono placeholder-slate-650"
                        placeholder="recruiter1@company.com, recruiter2@company.com"
                      />
                    </div>

                    {/* ── Live Recipient Chip List ── */}
                    {parsedEmailList.length > 0 && (
                      <div className="bg-slate-950/60 border border-slate-900 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">📋 Email Dispatch Queue</span>
                          <div className="flex items-center gap-2 text-[9px] font-semibold">
                            <span className="text-emerald-400">● New</span>
                            <span className="text-amber-400">● Duplicate</span>
                            <span className="text-rose-400">● Already Sent</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                          {parsedEmailList.map((email: string, idx: number) => {
                            const status = getEmailStatus(email, idx);
                            return (
                              <div
                                key={idx}
                                title={status === 'already-sent' ? `Already emailed on ${leads.find((l: any) => l.email === email)?.emailedAt?.slice(0, 10)}` : status === 'duplicate' ? 'Duplicate in list' : 'Ready to send'}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${status === 'new'
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                    : status === 'duplicate'
                                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                                  }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status === 'new' ? 'bg-emerald-400' : status === 'duplicate' ? 'bg-amber-400' : 'bg-rose-400'
                                  }`} />
                                <span className="font-mono truncate max-w-[180px]">{email}</span>
                                {status === 'already-sent' && <span className="text-[8px] opacity-70 ml-0.5">✓ sent</span>}
                                {status === 'duplicate' && <span className="text-[8px] opacity-70 ml-0.5">×2</span>}
                                <button
                                  onClick={() => {
                                    const updated = parsedEmailList.filter((_: string, i: number) => i !== idx);
                                    setOutreachRecipients(updated.join(', '));
                                    setDuplicateWarning(null);
                                  }}
                                  className="ml-0.5 text-[10px] opacity-50 hover:opacity-100 cursor-pointer transition-opacity leading-none"
                                  title="Remove"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Duplicate / Already-Sent Warning Banner ── */}
                    {duplicateWarning && (duplicateWarning.duplicates.length > 0 || duplicateWarning.alreadySent.length > 0) && (
                      <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🚫</span>
                          <span className="text-xs font-bold text-rose-300">Email dispatch blocked — resolve issues first</span>
                        </div>
                        {duplicateWarning.alreadySent.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-rose-400 mb-1">Already contacted (will cause spam duplicates):</p>
                            <div className="flex flex-wrap gap-1">
                              {duplicateWarning.alreadySent.map((e: string) => (
                                <span key={e} className="font-mono text-[10px] bg-rose-500/15 border border-rose-500/30 text-rose-300 px-2 py-0.5 rounded">{e}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {duplicateWarning.duplicates.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-amber-400 mb-1">Duplicate addresses in list:</p>
                            <div className="flex flex-wrap gap-1">
                              {duplicateWarning.duplicates.map((e: string) => (
                                <span key={e} className="font-mono text-[10px] bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded">{e}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => {
                              // Auto-clean: remove duplicates + already-sent
                              const seen = new Set<string>();
                              const clean = parsedEmailList.filter((e: string) => {
                                const lo = e.toLowerCase();
                                if (alreadyContactedSet.has(lo) || seen.has(lo)) return false;
                                seen.add(lo);
                                return true;
                              });
                              setOutreachRecipients(clean.join(', '));
                              setDuplicateWarning(null);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer transition-all"
                          >
                            Auto-clean List
                          </button>
                          <button
                            onClick={() => setDuplicateWarning(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-300 text-[10px] font-bold cursor-pointer transition-all"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5 text-xs">
                      <label className="text-slate-400 font-medium">Email Subject</label>
                      <input
                        type="text"
                        value={outreachSubject}
                        onChange={(e) => setOutreachSubject(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-200 outline-none focus:border-indigo-500 transition-all placeholder-slate-605"
                        placeholder="Subject Line"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 text-xs">
                      <label className="text-slate-400 font-medium">Custom Cover Letter Message</label>
                      <textarea
                        rows={7}
                        value={outreachMessage}
                        onChange={(e) => setOutreachMessage(e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-200 outline-none focus:border-indigo-500 transition-all leading-relaxed placeholder-slate-605 font-sans"
                        placeholder="Compose your custom cover letter message here..."
                      />
                    </div>

                    {!smtpConfig.username && (
                      <div className="bg-amber-500/10 border border-amber-500/25 text-amber-400 rounded-xl p-3 text-xs font-semibold text-center">
                        ⚠️ SMTP not configured. Click "Configure SMTP" above.
                      </div>
                    )}

                    {outreachError && (
                      <div className="bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl p-3 text-xs font-semibold text-center">
                        ❌ {outreachError}
                      </div>
                    )}

                    <button
                      onClick={handleSendOutreach}
                      disabled={isSendingEmails}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-650 hover:from-indigo-500 hover:to-purple-600 text-white font-bold text-xs tracking-wide transition-all shadow-md shadow-indigo-600/15 hover:shadow-indigo-600/30 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-1"
                    >
                      {isSendingEmails ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Sending Outreach Emails...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          <span>Send Outreach HTML Emails ({parsedEmailList.filter((_: string, i: number) => getEmailStatus(_, i) === 'new').length} new)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Outreach Logs Console */}
                  {outreachLogs.length > 0 && (
                    <div className="bg-slate-950 border border-slate-900 rounded-xl p-3.5 shadow-inner">
                      <div className="flex items-center justify-between border-b border-slate-900 pb-1.5 mb-2 select-none">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Outreach Dispatch logs</span>
                        <button
                          onClick={() => setOutreachLogs([])}
                          className="text-[9px] font-bold text-slate-500 hover:text-slate-350 cursor-pointer"
                        >
                          clear logs
                        </button>
                      </div>
                      <div className="font-mono text-[10px] space-y-1 max-h-48 overflow-y-auto pr-1">
                        {outreachLogs.map((log: string, lidx: number) => {
                          let color = 'text-slate-400';
                          if (log.includes('✅')) color = 'text-emerald-400 font-semibold';
                          else if (log.includes('❌')) color = 'text-rose-400 font-semibold';
                          else if (log.includes('Successfully') || log.includes('complete')) color = 'text-indigo-400 font-bold';
                          return (
                            <div key={lidx} className={`${color} whitespace-pre-wrap`}>
                              {log}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>

                {/* Right side: HTML Preview */}
                <div className="flex-1 flex flex-col min-w-[320px] max-w-[640px] border border-slate-800 rounded-xl bg-slate-900/30 overflow-hidden shadow-md">
                  <div className="bg-slate-950/65 border-b border-slate-800 px-3.5 py-2.5 flex items-center justify-between select-none">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Live Recruiter Inbox Preview
                    </span>
                    <span className="text-[9px] bg-indigo-950/50 border border-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded">
                      HTML Responsive
                    </span>
                  </div>
                  <div className="flex-1 bg-slate-950 p-2 overflow-hidden font-sans">
                    <iframe
                      srcDoc={getGraphicOutreachTemplate(outreachMessage).replace('cid:profile-pic', '/profile-pic.jpg')}
                      className="w-full h-full border-0 bg-transparent rounded-lg"
                      title="Email Outreach Preview"
                    />
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>

      </div>

      {/* Navigation Footer */}
      <footer className="h-9 flex-shrink-0 flex items-center justify-between px-4 border-t border-slate-800/60 backdrop-blur-xl bg-slate-950/80 text-[10px] text-slate-500 z-10 select-none">
        <div className="flex items-center space-x-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Shatadal's Personal AI Job Apply Agent — Active</span>
        </div>
        <div className="flex items-center space-x-3">
          <span className="hidden sm:inline">Outbound Engine v1.1.0</span>
          <span className="text-slate-600">·</span>
          <span>© {new Date().getFullYear()} All Rights Reserved</span>
        </div>
      </footer>

    </div>
  );
}
