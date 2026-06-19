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
}

export interface DailyStats {
  runsCount: number;
  totalRuntimeSeconds: number;
  totalApplied: number;
  totalAttempts: number;
}

export interface PersistentStats {
  currentSession: SessionStats | null;
  sessions: SessionStats[];
  dailyStats: Record<string, DailyStats>;
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
    return JSON.parse(content);
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
      runtime: '00m 00s'
    };

    if (!stats.dailyStats[today]) {
      stats.dailyStats[today] = {
        runsCount: 0,
        totalRuntimeSeconds: 0,
        totalApplied: 0,
        totalAttempts: 0
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

    console.log(`[AutomationManager] Stopping automation process PID: ${this.process.pid}`);
    
    if (process.platform === 'win32') {
      try {
        // Safe tree termination on Windows (kills chrome, and tsx child processes)
        exec(`taskkill /F /T /PID ${this.process.pid}`, (error) => {
          if (error) {
            console.warn(`[AutomationManager] taskkill failed: ${error.message}. Falling back to normal kill.`);
            this.process?.kill('SIGKILL');
          }
        });
      } catch (err: any) {
        console.error(`[AutomationManager] Error during taskkill: ${err.message}`);
        this.process.kill('SIGKILL');
      }
    } else {
      this.process.kill('SIGINT');
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
        stats.dailyStats[today] = { runsCount: 1, totalRuntimeSeconds: 0, totalApplied: 0, totalAttempts: 0 };
      }
      stats.dailyStats[today].totalRuntimeSeconds += elapsedSeconds;
      stats.dailyStats[today].totalApplied += stats.currentSession.applied;
      stats.dailyStats[today].totalAttempts += stats.currentSession.attempts;

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
