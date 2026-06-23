import { spawn, ChildProcess, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Extend the global namespace to avoid TypeScript compilation errors
declare global {
  var automationManager: AutomationManager | undefined;
}

const STATS_FILE = path.join(process.cwd(), 'data', 'automation_stats.json');

export interface SessionStats {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  attempts: number;
  successes: number;
  applied: number;
  runtime: string;
  emailsSent?: number;
}

export interface DailyStats {
  runsCount: number;
  totalRuntimeSeconds: number;
  totalApplied: number;
  totalAttempts: number;
  totalEmailsSent?: number;
}

export interface PersistentStats {
  currentSession: SessionStats | null;
  sessions: SessionStats[];
  dailyStats: Record<string, DailyStats>;
}

function migrateStatsWithEmails(stats: PersistentStats) {
  console.log('[AutomationManager] Running stats email migration...');
  const leadsFilePath = path.join(process.cwd(), 'data', 'feed_leads.json');
  if (!fs.existsSync(leadsFilePath)) {
    for (const s of stats.sessions) {
      if (s.emailsSent === undefined) s.emailsSent = 0;
    }
    return;
  }
  
  try {
    const leadsContent = fs.readFileSync(leadsFilePath, 'utf-8');
    const leads = JSON.parse(leadsContent);
    
    // Get all emailed leads with valid timestamp
    const emailedLeads = leads.filter((l: any) => l.emailedAt).map((l: any) => {
      return {
        email: l.email,
        timestamp: new Date(l.emailedAt).getTime()
      };
    });
    
    // Initialize emailsSent to 0 for all sessions
    for (const s of stats.sessions) {
      s.emailsSent = 0;
    }
    if (stats.currentSession) {
      stats.currentSession.emailsSent = 0;
    }
    
    // Attribute each emailed lead to a session
    for (const lead of emailedLeads) {
      let matched = false;
      
      // Try to find a matching session
      for (const session of stats.sessions) {
        const startMs = parseInt(session.id);
        let durationSeconds = 0;
        const runtimeStr = session.runtime || '';
        const hourMatch = runtimeStr.match(/(\d+)h/);
        const minMatch = runtimeStr.match(/(\d+)m/);
        const secMatch = runtimeStr.match(/(\d+)s/);

        if (hourMatch) durationSeconds += parseInt(hourMatch[1]) * 3600;
        if (minMatch) durationSeconds += parseInt(minMatch[1]) * 60;
        if (secMatch) durationSeconds += parseInt(secMatch[1]);
        
        // If aborted or 0, give it a default 15 min window
        if (durationSeconds === 0) {
          durationSeconds = 900; 
        }
        
        const endMs = startMs + (durationSeconds * 1000) + 10000; // 10s buffer
        
        if (lead.timestamp >= startMs && lead.timestamp <= endMs) {
          session.emailsSent = (session.emailsSent || 0) + 1;
          matched = true;
          break;
        }
      }
      
      // If not matched, check if it fits in active current session
      if (!matched && stats.currentSession) {
        const startMs = parseInt(stats.currentSession.id);
        if (lead.timestamp >= startMs && lead.timestamp <= Date.now()) {
          stats.currentSession.emailsSent = (stats.currentSession.emailsSent || 0) + 1;
          matched = true;
        }
      }
    }
    
    // Reset/rebuild totalEmailsSent in dailyStats
    for (const date in stats.dailyStats) {
      stats.dailyStats[date].totalEmailsSent = 0;
    }
    
    // Sum from history sessions
    for (const session of stats.sessions) {
      const date = session.date;
      if (date && stats.dailyStats[date]) {
        if (stats.dailyStats[date].totalEmailsSent === undefined) {
          stats.dailyStats[date].totalEmailsSent = 0;
        }
        stats.dailyStats[date].totalEmailsSent += (session.emailsSent || 0);
      }
    }
    
    console.log('[AutomationManager] Stats email migration complete!');
  } catch (err) {
    console.error('[AutomationManager] Error migrating stats:', err);
    // fallback default to 0
    for (const s of stats.sessions) {
      if (s.emailsSent === undefined) s.emailsSent = 0;
    }
  }
}

export function loadStats(): PersistentStats {
  try {
    if (!fs.existsSync(STATS_FILE)) {
      fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
      const defaultStats: PersistentStats = {
        currentSession: null,
        sessions: [],
        dailyStats: {}
      };
      fs.writeFileSync(STATS_FILE, JSON.stringify(defaultStats, null, 2), 'utf-8');
      return defaultStats;
    }
    const content = fs.readFileSync(STATS_FILE, 'utf-8');
    const stats = JSON.parse(content);

    // Check if we need to migrate/update email counts for past sessions
    let needsMigration = false;
    for (const session of stats.sessions) {
      if (session.emailsSent === undefined) {
        needsMigration = true;
        break;
      }
    }
    if (stats.currentSession && stats.currentSession.emailsSent === undefined) {
      stats.currentSession.emailsSent = 0;
      needsMigration = true;
    }
    
    if (needsMigration) {
      migrateStatsWithEmails(stats);
      saveStats(stats);
    }

    return stats;
  } catch (e) {
    console.error('[AutomationManager] Error loading stats, using defaults:', e);
    return {
      currentSession: null,
      sessions: [],
      dailyStats: {}
    };
  }
}

export function saveStats(stats: PersistentStats) {
  try {
    fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
  } catch (e) {
    console.error('[AutomationManager] Error saving stats:', e);
  }
}

class AutomationManager {
  private get process(): ChildProcess | null {
    return (global as any)._automationProcess || null;
  }
  private set process(val: ChildProcess | null) {
    (global as any)._automationProcess = val;
  }

  private get logListeners(): ((data: string) => void)[] {
    if (!(global as any)._automationListeners) {
      (global as any)._automationListeners = [];
    }
    return (global as any)._automationListeners;
  }
  private set logListeners(val: ((data: string) => void)[]) {
    (global as any)._automationListeners = val;
  }

  private get runtimeInterval(): NodeJS.Timeout | null {
    return (global as any)._runtimeInterval || null;
  }
  private set runtimeInterval(val: NodeJS.Timeout | null) {
    (global as any)._runtimeInterval = val;
  }

  public start(portals?: string[]): boolean {
    if (this.process) {
      console.log('[AutomationManager] Process already running.');
      return false;
    }

    console.log('[AutomationManager] Spawning job worker script with portals:', portals);
    
    // Clear any dangling interval
    if (this.runtimeInterval) {
      clearInterval(this.runtimeInterval);
      this.runtimeInterval = null;
    }

    // 1. Initialize session in persistent stats JSON
    const stats = loadStats();
    const sessionId = Date.now().toString();
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    stats.currentSession = {
      id: sessionId,
      date: today,
      startTime: nowTime,
      endTime: null,
      attempts: 0,
      successes: 0,
      applied: 0,
      emailsSent: 0,
      runtime: '00m 00s'
    };

    if (!stats.dailyStats[today]) {
      stats.dailyStats[today] = {
        runsCount: 0,
        totalRuntimeSeconds: 0,
        totalApplied: 0,
        totalAttempts: 0,
        totalEmailsSent: 0
      };
    }
    stats.dailyStats[today].runsCount += 1;
    saveStats(stats);

    // 2. Start dynamic runtime tick update
    this.runtimeInterval = setInterval(() => {
      const liveStats = loadStats();
      if (liveStats.currentSession) {
        const elapsed = Math.floor((Date.now() - parseInt(liveStats.currentSession.id)) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        liveStats.currentSession.runtime = h > 0 
          ? `${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m`
          : `${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
        saveStats(liveStats);
      }
    }, 2000);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      FORCE_COLOR: 'true'
    };

    if (portals && portals.length > 0) {
      env.PORTALS = portals.join(',');
    }

    // Spawn tsx on Windows. Using shell: true handles command pathing correctly
    const child = spawn('npx', ['tsx', 'c:\\MyPerosnalAgent\\my-personal-agent\\job-worker.ts'], {
      shell: true,
      cwd: 'c:\\MyPerosnalAgent\\my-personal-agent',
      env
    });

    this.process = child;

    child.stdout?.on('data', (chunk) => {
      const data = chunk.toString();
      this.parseLogForMetrics(data);
      this.broadcast(data);
    });

    child.stderr?.on('data', (chunk) => {
      const data = chunk.toString();
      this.parseLogForMetrics(data);
      this.broadcast(data);
    });

    child.on('error', (err) => {
      this.broadcast(`\n[Process Error] Failed to start job-worker: ${err.message}\n`);
    });

    child.on('close', (code) => {
      this.broadcast(`\n[Process System] Process exited with code ${code}\n`);
      this.handleProcessClose();
    });

    return true;
  }

  public stop(): boolean {
    if (!this.process) {
      console.log('[AutomationManager] No running process to stop.');
      return false;
    }

    const procToKill = this.process;
    console.log(`[AutomationManager] Stopping automation process PID: ${procToKill.pid}`);
    
    if (process.platform === 'win32') {
      try {
        // Safe tree termination on Windows (kills chrome, and tsx child processes)
        exec(`taskkill /F /T /PID ${procToKill.pid}`, (error) => {
          if (error) {
            console.warn(`[AutomationManager] taskkill failed: ${error.message}. Falling back to normal kill.`);
            procToKill.kill('SIGKILL');
          }
        });
      } catch (err: any) {
        console.error(`[AutomationManager] Error during taskkill: ${err.message}`);
        procToKill.kill('SIGKILL');
      }
    } else {
      procToKill.kill('SIGINT');
    }

    this.process = null;
    this.broadcast('\n[Process System] Process manually terminated by user request.\n');
    this.handleProcessClose();
    return true;
  }

  private handleProcessClose() {
    if (this.runtimeInterval) {
      clearInterval(this.runtimeInterval);
      this.runtimeInterval = null;
    }

    const stats = loadStats();
    if (stats.currentSession) {
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      stats.currentSession.endTime = nowTime;
      
      const today = stats.currentSession.date;
      const elapsedSeconds = Math.floor((Date.now() - parseInt(stats.currentSession.id)) / 1000);
      
      if (!stats.dailyStats[today]) {
        stats.dailyStats[today] = { runsCount: 1, totalRuntimeSeconds: 0, totalApplied: 0, totalAttempts: 0, totalEmailsSent: 0 };
      }
      stats.dailyStats[today].totalRuntimeSeconds += elapsedSeconds;
      stats.dailyStats[today].totalApplied += stats.currentSession.applied;
      stats.dailyStats[today].totalAttempts += stats.currentSession.attempts;
      
      if (stats.dailyStats[today].totalEmailsSent === undefined) {
        stats.dailyStats[today].totalEmailsSent = 0;
      }
      stats.dailyStats[today].totalEmailsSent += (stats.currentSession.emailsSent || 0);

      // Unshift session to history
      stats.sessions.unshift(stats.currentSession);
      if (stats.sessions.length > 50) {
        stats.sessions = stats.sessions.slice(0, 50);
      }
      stats.currentSession = null;
      saveStats(stats);
    }
    this.process = null;
  }

  private parseLogForMetrics(text: string) {
    const stats = loadStats();
    if (!stats.currentSession) return;

    // Split incoming logs into lines to check each separately
    const lines = text.split('\n');
    let changed = false;

    for (const line of lines) {
      const isRealSubmission =
        line.includes('Application submitted successfully') ||
        line.includes('Applied successfully') ||
        line.includes('application submitted') ||
        line.includes('Application Submitted!') ||
        line.includes('Indeed Job application submitted successfully') ||
        line.includes('Applied successfully!') ||
        line.includes('Application submitted/initiated');

      const isAttempt =
        (line.includes('Clicking') && (line.toLowerCase().includes('apply') || line.toLowerCase().includes('easy apply'))) ||
        line.includes('Clicking internal apply') ||
        line.includes('Clicking apply for');

      const isEmailSent = line.includes('✉️ Sending auto-email to:');
      const isEmailFailed = line.includes('Failed to send auto-email to');

      if (isRealSubmission) {
        stats.currentSession.applied += 1;
        stats.currentSession.successes += 1;
        if (stats.currentSession.attempts < stats.currentSession.successes) {
          stats.currentSession.attempts = stats.currentSession.successes;
        }
        changed = true;
      } else if (isAttempt) {
        stats.currentSession.attempts += 1;
        changed = true;
      } else if (isEmailSent) {
        stats.currentSession.emailsSent = (stats.currentSession.emailsSent || 0) + 1;
        changed = true;
      } else if (isEmailFailed) {
        stats.currentSession.emailsSent = Math.max(0, (stats.currentSession.emailsSent || 0) - 1);
        changed = true;
      }
    }

    if (changed) {
      saveStats(stats);
    }
  }

  public isRunning(): boolean {
    return this.process !== null;
  }

  public addListener(listener: (data: string) => void) {
    this.logListeners.push(listener);
  }

  public removeListener(listener: (data: string) => void) {
    this.logListeners = this.logListeners.filter(l => l !== listener);
  }

  private broadcast(data: string) {
    this.logListeners.forEach(listener => {
      try {
        listener(data);
      } catch (e) {
        console.error('[AutomationManager] Error calling listener:', e);
      }
    });
  }
}

// Re-export a singleton instance
export const automationManager = new AutomationManager();
