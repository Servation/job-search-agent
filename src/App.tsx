/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Briefcase, 
  Settings, 
  FileCheck, 
  LayoutDashboard,
  LogOut,
  Bell,
  Check,
  Zap,
  Info,
  User,
  Sliders
} from 'lucide-react';
import { Job, LLMConfig, ResumeProfile } from './types';
import ResumeParser from './components/ResumeParser';
import AgentSettings from './components/AgentSettings';
import DashboardStats from './components/DashboardStats';
import JobScanner from './components/JobScanner';
import SubmissionTracker from './components/SubmissionTracker';

/**
 * localStorage can throw QuotaExceededError once the saved/dismissed job lists grow
 * (descriptions are large). The server DB is the source of truth, so a failed cache
 * write must never crash the app — swallow it with a warning.
 */
const safeSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    console.warn(`[cache] Skipped saving "${key}" to localStorage (quota exceeded). Server data is unaffected.`);
  }
};

// Job descriptions can be ~15k chars each; drop them from the cached copy to stay under
// the localStorage quota. Full descriptions are restored from the server on load.
const slimForCache = (jobs: Job[]): Job[] => jobs.map(j => ({ ...j, description: '' }));

// Seed initial tracker empty to start without default information
const INITIAL_SAVED_JOBS: Job[] = [];

export default function App() {
  // Navigation Tabs state
  const [activeTab, setActiveTab] = useState<'profile' | 'scanner' | 'tracker' | 'settings'>('scanner');

  // Core Agent Parameters State
  const [profile, setProfile] = useState<ResumeProfile>(() => {
    const cached = localStorage.getItem('job_agent_profile');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Clear old stale default setup or Alex Mercer profile
        if (!parsed || parsed.parsedName === 'Alex Mercer' || !parsed.rawText) {
          return {
            rawText: '',
            parsedName: '',
            parsedSkills: [],
            targetRoles: [],
            preferredLocation: 'United States',
            preferredTypes: ['Full-Time', 'Contract', 'Part-Time'],
            minMatchScore: 70,
            prefersRemote: true,
            prefersHybrid: true,
            prefersOnSite: true,
            searchLocation: 'United States',
            searchDistance: '',
            autoScanInterval: 0,
            maxDiscoveredJobs: 30,
            limitCompanyMatches: false,
            maxMatchesPerCompany: 3,
            yearsOfExperience: 0,
          };
        }
        return {
          ...parsed,
          prefersRemote: parsed.prefersRemote !== undefined ? parsed.prefersRemote : true,
          prefersHybrid: parsed.prefersHybrid !== undefined ? parsed.prefersHybrid : true,
          prefersOnSite: parsed.prefersOnSite !== undefined ? parsed.prefersOnSite : true,
          searchLocation: parsed.searchLocation || parsed.preferredLocation || 'United States',
          searchDistance: parsed.searchDistance || '',
          autoScanInterval: parsed.autoScanInterval !== undefined ? parsed.autoScanInterval : 0,
          maxDiscoveredJobs: parsed.maxDiscoveredJobs !== undefined ? parsed.maxDiscoveredJobs : 30,
          limitCompanyMatches: parsed.limitCompanyMatches !== undefined ? parsed.limitCompanyMatches : false,
          maxMatchesPerCompany: parsed.maxMatchesPerCompany !== undefined ? parsed.maxMatchesPerCompany : 3,
          yearsOfExperience: parsed.yearsOfExperience !== undefined ? parsed.yearsOfExperience : 0,
        };
      } catch (e) { /* ignore */ }
    }
    return {
      rawText: '',
      parsedName: '',
      parsedSkills: [],
      targetRoles: [],
      preferredLocation: 'United States',
      preferredTypes: ['Full-Time', 'Contract', 'Part-Time'],
      minMatchScore: 70,
      prefersRemote: true,
      prefersHybrid: true,
      prefersOnSite: true,
      searchLocation: 'United States',
      searchDistance: '',
      autoScanInterval: 0,
      maxDiscoveredJobs: 30,
      limitCompanyMatches: false,
      maxMatchesPerCompany: 3,
      yearsOfExperience: 0,
    };
  });

  // Sourcing prompt & auto-trigger scanner state
  const [lastScannedProfile, setLastScannedProfile] = useState<string | null>(() => {
    return localStorage.getItem('job_agent_last_scanned_profile');
  });

  const [shouldTriggerScan, setShouldTriggerScan] = useState(false);

  const getProfileScanKey = (p: ResumeProfile) => {
    return JSON.stringify({
      rawText: p.rawText || '',
      targetRoles: p.targetRoles || [],
      preferredTypes: p.preferredTypes || [],
      minMatchScore: p.minMatchScore,
      prefersRemote: p.prefersRemote,
      prefersHybrid: p.prefersHybrid,
      prefersOnSite: p.prefersOnSite,
      searchLocation: p.searchLocation || '',
      searchDistance: p.searchDistance || '',
      parsedSkills: p.parsedSkills || [],
      limitCompanyMatches: p.limitCompanyMatches || false,
      maxMatchesPerCompany: p.maxMatchesPerCompany || 3,
      yearsOfExperience: p.yearsOfExperience || 0,
    });
  };

  const hasChangesSinceLastScan = lastScannedProfile !== getProfileScanKey(profile);

  const handleLaunchScanFromPrompt = () => {
    setShouldTriggerScan(true);
    setActiveTab('scanner');
  };

  const handleScanStarted = () => {
    const key = getProfileScanKey(profile);
    setLastScannedProfile(key);
    safeSetItem('job_agent_last_scanned_profile', key);
  };

  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => {
    const cached = localStorage.getItem('job_agent_llm_config');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.provider === ('gemini' as any)) {
          return {
            provider: 'lmstudio',
            endpoint: 'http://localhost:1234/v1',
            apiKey: '',
            modelName: 'meta-llama-3-8b-instruct',
            timeout: 30,
          };
        }
        if (parsed && typeof parsed.timeout !== 'number') {
          parsed.timeout = 30;
        }
        return parsed;
      } catch (e) { /* ignore */ }
    }
    return {
      provider: 'lmstudio',
      endpoint: 'http://localhost:1234/v1',
      apiKey: '',
      modelName: 'meta-llama-3-8b-instruct',
      timeout: 30,
    };
  });

  const [savedJobs, setSavedJobs] = useState<Job[]>(() => {
    const cached = localStorage.getItem('job_agent_saved_jobs');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) { /* ignore */ }
    }
    return INITIAL_SAVED_JOBS;
  });

  const [watchlist, setWatchlist] = useState<Job[]>(() => {
    const cached = localStorage.getItem('job_agent_watchlist');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) { /* ignore */ }
    }
    return [];
  });

  const [scannedJobs, setScannedJobs] = useState<Job[]>(() => {
    const cached = localStorage.getItem('job_agent_scanned_jobs');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) { /* ignore */ }
    }
    return [];
  });

  const [currentlyRefiningJobId, setCurrentlyRefiningJobId] = useState<string | null>(null);

  useEffect(() => {
    safeSetItem('job_agent_scanned_jobs', JSON.stringify(slimForCache(scannedJobs)));
  }, [scannedJobs]);

  const [dismissedJobs, setDismissedJobs] = useState<Job[]>(() => {
    const cached = localStorage.getItem('job_agent_dismissed_jobs');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) { /* ignore */ }
    }
    return [];
  });

  useEffect(() => {
    safeSetItem('job_agent_dismissed_jobs', JSON.stringify(slimForCache(dismissedJobs)));
  }, [dismissedJobs]);

  const [dismissedJobKeys, setDismissedJobKeys] = useState<string[]>(() => {
    const cached = localStorage.getItem('job_agent_dismissed_job_keys');
    let legacy: string[] = [];
    if (cached) {
      try { legacy = JSON.parse(cached); } catch (e) { /* ignore */ }
    }
    const computed = dismissedJobs.map(j => `${j.company.toLowerCase().trim()}|${j.title.toLowerCase().trim()}`);
    return Array.from(new Set([...legacy, ...computed]));
  });

  useEffect(() => {
    const computed = dismissedJobs.map(j => `${j.company.toLowerCase().trim()}|${j.title.toLowerCase().trim()}`);
    setDismissedJobKeys(computed);
    safeSetItem('job_agent_dismissed_job_keys', JSON.stringify(computed));
  }, [dismissedJobs]);

  const performJobAction = async (action: string, payload: any) => {
    try {
      const response = await fetch('/api/jobs/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.db) {
          if (data.db.scannedJobs && !isAiRunning) setScannedJobs(data.db.scannedJobs);
          if (data.db.watchlist) setWatchlist(data.db.watchlist);
          if (data.db.savedJobs) setSavedJobs(data.db.savedJobs);
          if (data.db.dismissedJobs) setDismissedJobs(data.db.dismissedJobs);
        }
      }
    } catch (err) {
      console.error(`Failed to perform job action ${action}:`, err);
    }
  };

  const handleDismissJob = (job: Job) => {
    performJobAction('dismiss', { job });
  };

  const handleUndismissJob = (job: Job) => {
    performJobAction('undismiss', { job });
  };

  // Client-facing AI Real-time Event System
  const [aiLogs, setAiLogs] = useState<string[]>(() => {
    const cached = localStorage.getItem('job_agent_ai_logs');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) { /* ignore */ }
    }
    return [
      `[${new Date().toLocaleTimeString()}] Started. Add your resume to begin.`
    ];
  });

  const [lastRunTime, setLastRunTime] = useState<string | null>(() => {
    return localStorage.getItem('job_agent_last_run_time');
  });

  const [isAiRunning, setIsAiRunning] = useState(false);

  const addAiLog = (msg: string) => {
    const timeStr = new Date().toLocaleTimeString();
    setAiLogs((prev) => {
      const updated = [`[${timeStr}] ${msg}`, ...prev].slice(0, 150);
      safeSetItem('job_agent_ai_logs', JSON.stringify(updated));
      return updated;
    });
  };

  const clearAiLogs = () => {
    const initialLog = `[${new Date().toLocaleTimeString()}] Logs cleared.`;
    setAiLogs([initialLog]);
    safeSetItem('job_agent_ai_logs', JSON.stringify([initialLog]));
  };

  // Background statistics indicators
  const [stats, setStats] = useState(() => {
    const cached = localStorage.getItem('job_agent_stats');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return {
          totalScanned: parsed.totalScanned || 0,
          duplicatesPrevented: parsed.duplicatesPrevented || 0,
          activeMatchesCount: parsed.activeMatchesCount || 0,
          llmEvaluations: parsed.llmEvaluations || 0,
          totalSourced: parsed.totalSourced || 0
        };
      } catch (e) { /* ignore */ }
    }
    return {
      totalScanned: 0,
      duplicatesPrevented: 0,
      activeMatchesCount: 0,
      llmEvaluations: 0,
      totalSourced: 0
    };
  });

  const handleUpdateStats = (newStats: any) => {
    setStats(newStats);
  };

  // Local storage caching effects
  useEffect(() => {
    safeSetItem('job_agent_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    safeSetItem('job_agent_llm_config', JSON.stringify(llmConfig));
  }, [llmConfig]);

  useEffect(() => {
    safeSetItem('job_agent_saved_jobs', JSON.stringify(savedJobs));
  }, [savedJobs]);

  useEffect(() => {
    safeSetItem('job_agent_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    safeSetItem('job_agent_stats', JSON.stringify(stats));
  }, [stats]);

  // Hydration on mount
  useEffect(() => {
    const hydrateState = async () => {
      try {
        const res = await fetch('/api/jobs/sync');
        if (res.ok) {
          const data = await res.json();
          
          // Check if server database is empty/fresh
          const isServerDbEmpty = 
            (!data.scannedJobs || data.scannedJobs.length === 0) &&
            (!data.watchlist || data.watchlist.length === 0) &&
            (!data.savedJobs || data.savedJobs.length === 0) &&
            (!data.dismissedJobs || data.dismissedJobs.length === 0) &&
            (!data.profile || !data.profile.rawText);
            
          if (isServerDbEmpty) {
            // Server is empty. If client has local storage data, sync/upload client data to server.
            const cachedScanned = localStorage.getItem('job_agent_scanned_jobs');
            const cachedSaved = localStorage.getItem('job_agent_saved_jobs');
            const cachedWatchlist = localStorage.getItem('job_agent_watchlist');
            const cachedDismissed = localStorage.getItem('job_agent_dismissed_jobs');
            const cachedProfile = localStorage.getItem('job_agent_profile');
            const cachedLlmConfig = localStorage.getItem('job_agent_llm_config');
            
            const cachedStats = localStorage.getItem('job_agent_stats');
            
            let localScanned = [];
            let localSaved = [];
            let localWatchlist = [];
            let localDismissed = [];
            let localProfile = null;
            let localLlmConfig = null;
            let localStats = null;
            
            try { if (cachedScanned) localScanned = JSON.parse(cachedScanned); } catch(e){}
            try { if (cachedSaved) localSaved = JSON.parse(cachedSaved); } catch(e){}
            try { if (cachedWatchlist) localWatchlist = JSON.parse(cachedWatchlist); } catch(e){}
            try { if (cachedDismissed) localDismissed = JSON.parse(cachedDismissed); } catch(e){}
            try { if (cachedProfile) localProfile = JSON.parse(cachedProfile); } catch(e){}
            try { if (cachedLlmConfig) localLlmConfig = JSON.parse(cachedLlmConfig); } catch(e){}
            try { if (cachedStats) localStats = JSON.parse(cachedStats); } catch(e){}
            
            const hasLocalData = 
              localScanned.length > 0 || 
              localSaved.length > 0 || 
              localWatchlist.length > 0 || 
              localDismissed.length > 0 || 
              (localProfile && localProfile.rawText);
              
            if (hasLocalData) {
              // Upload local data to server
              await fetch('/api/jobs/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'sync_client_data',
                  scannedJobs: localScanned,
                  savedJobs: localSaved,
                  watchlist: localWatchlist,
                  dismissedJobs: localDismissed,
                  profile: localProfile,
                  llmConfig: localLlmConfig,
                  stats: localStats || stats
                })
              });
              
              // Load the client state from local storage values
              if (localScanned.length) setScannedJobs(localScanned);
              if (localSaved.length) setSavedJobs(localSaved);
              if (localWatchlist.length) setWatchlist(localWatchlist);
              if (localDismissed.length) setDismissedJobs(localDismissed);
              if (localProfile) setProfile(localProfile);
              if (localLlmConfig) setLlmConfig(localLlmConfig);
              if (localStats) setStats(localStats);
              
              return;
            }
          }
          
          if (data.scannedJobs) setScannedJobs(data.scannedJobs);
          if (data.watchlist) setWatchlist(data.watchlist);
          if (data.savedJobs) setSavedJobs(data.savedJobs);
          if (data.dismissedJobs) setDismissedJobs(data.dismissedJobs);
          if (data.profile) setProfile(data.profile);
          if (data.llmConfig) setLlmConfig(data.llmConfig);
          if (data.stats) setStats(data.stats);
        }
      } catch (err) {
        console.error('Failed to hydrate state from server:', err);
      }
    };
    hydrateState();
  }, []);

  // Polling loop to fetch logs and database updates in the background
  useEffect(() => {
    let active = true;

    const runPoll = async (isManual = false) => {
      // Only poll when the document is focused to save network resources, unless manually forced
      if (!document.hasFocus() && !isManual) return;
      
      try {
        const response = await fetch('/api/jobs/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok && active) {
          const data = await response.json();
          if (data.success && data.db) {
            // Update lists if the server values exist
            if (data.db.scannedJobs) setScannedJobs(data.db.scannedJobs);
            if (data.db.watchlist) setWatchlist(data.db.watchlist);
            if (data.db.savedJobs) setSavedJobs(data.db.savedJobs);
            if (data.db.dismissedJobs) setDismissedJobs(data.db.dismissedJobs);
            if (data.db.stats) setStats(data.db.stats);
            
            // Set currently refining ID
            setCurrentlyRefiningJobId(data.currentlyRefiningJobId || null);
            setIsAiRunning(data.currentlyRefiningJobId ? true : false);
            
            // Sync background timers to local storage so Scanner can show them
            if (data.lastBackgroundSourceTime) {
              safeSetItem('job_agent_last_run_timestamp', String(data.lastBackgroundSourceTime));
            }
            if (data.lastBackgroundRefinerTime) {
              safeSetItem('job_agent_last_refiner_timestamp', String(data.lastBackgroundRefinerTime));
            }
            
            // Append new logs from background
            if (data.newLogs && data.newLogs.length > 0) {
              data.newLogs.forEach((msg: string) => {
                addAiLog(msg);
              });
            }
          }
        }
      } catch (err) {
        console.warn('[Polling] Failed to poll background refiner status:', err);
      }
    };

    const pollInterval = setInterval(() => runPoll(false), 10000); // Poll every 10 seconds

    // Instantly poll when the tab/window gains focus
    const handleFocus = () => {
      runPoll(true);
    };
    window.addEventListener('focus', handleFocus);

    // Initial poll
    runPoll(true);

    return () => {
      active = false;
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Sync profile and config on changes
  useEffect(() => {
    const syncProfile = async () => {
      try {
        await fetch('/api/profile/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile, llmConfig })
        });
      } catch (err) {
        console.error('Failed to sync profile/config with server:', err);
      }
    };
    if (profile.rawText) {
      syncProfile();
    }
  }, [profile, llmConfig]);



  const handleAddJobs = (newJobs: Job[]) => {
    const filtered = newJobs.filter(
      (nj) => !savedJobs.some((pj) => pj.title.toLowerCase() === nj.title.toLowerCase() && pj.company.toLowerCase() === nj.company.toLowerCase())
    );
    filtered.forEach((nj) => {
      addAiLog(`Saved "${nj.title}" at ${nj.company}.`);
    });
    performJobAction('save', { jobs: newJobs });
  };

  const handleAddToWatchlist = (newJobs: Job[]) => {
    const filtered = newJobs.filter(
      (nj) => 
        !watchlist.some((pj) => pj.title.toLowerCase() === nj.title.toLowerCase() && pj.company.toLowerCase() === nj.company.toLowerCase()) &&
        !savedJobs.some((sj) => sj.title.toLowerCase() === nj.title.toLowerCase() && sj.company.toLowerCase() === nj.company.toLowerCase())
    );
    filtered.forEach((nj) => {
      addAiLog(`Added "${nj.title}" at ${nj.company} to watchlist.`);
    });
    performJobAction('watchlist', { jobs: newJobs });
  };

  const handleRemoveFromWatchlist = (id: string) => {
    const job = watchlist.find((j) => j.id === id);
    if (job) {
      addAiLog(`Removed "${job.title}" at ${job.company} from watchlist.`);
    }
    performJobAction('remove_watchlist', { id });
  };

  const handleUpdateJobStatus = (id: string, status: 'discovered' | 'applied' | 'review' | 'interviewing' | 'offered' | 'rejected', notes?: string) => {
    const job = savedJobs.find((j) => j.id === id);
    if (job) {
      addAiLog(`Updated "${job.title}" at ${job.company} to "${status}".`);
    }
    performJobAction('update_status', { id, status, notes });
  };

  const handleRemoveJob = (id: string) => {
    const job = savedJobs.find((j) => j.id === id);
    if (job) {
      addAiLog(`Removed "${job.title}" at ${job.company}.`);
    }
    performJobAction('remove_saved', { id });
  };

  const handleUpdateJobDetails = (id: string, updatedFields: Partial<Job>) => {
    const job = savedJobs.find((j) => j.id === id);
    if (job) {
      addAiLog(`Updated "${job.title}" at ${job.company}.`);
    }
    performJobAction('update_details', { id, updatedFields });
  };

  const handleParseComplete = (parsed: { name?: string; skills?: string[]; roles?: string[]; location?: string }) => {
    addAiLog(`Resume parsed. Roles: [${(parsed.roles || []).join(', ')}].`);
    setActiveTab('scanner'); // Navigate to scanner automatically once parsing succeeds!
  };

  return (
    <div className="min-h-screen bg-background text-on-background font-body pb-24">
      {/* TopAppBar - Dark Minimalist Neo-Brutalism */}
      <header className="fixed top-0 w-full z-50 bg-background border-b-2 border-outline-variant flex items-center justify-between px-6 h-16 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary border-2 border-black flex items-center justify-center neo-shadow-primary text-on-primary">
            <Briefcase className="w-5 h-5" />
          </div>
          <h1 className="font-headline uppercase tracking-widest text-xl font-bold text-primary">Job Search Agent</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] font-label uppercase text-on-surface-variant leading-none tracking-widest">Agent active</span>
            <span className="text-[10px] font-label uppercase text-primary font-bold tracking-widest">Model: {llmConfig.modelName}</span>
          </div>
          <Zap className="text-primary w-5 h-5 animate-pulse" />
        </div>
      </header>

      {/* Main Container */}
      <main className="pt-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8" id="primary-applet-grid">
        
        {/* Dynamic Warning Alert for First-time setup */}
        {!profile.rawText && (
          <section className="border-2 border-primary bg-primary-container p-5 relative overflow-hidden neo-shadow-primary">
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <h2 className="font-headline font-bold text-xl uppercase leading-tight text-primary">Add your resume to get started</h2>
                <p className="text-sm mt-2 text-on-surface-variant font-body max-w-2xl">Add your resume so the agent can find jobs that match you.</p>
              </div>
              <button
                onClick={() => setActiveTab('profile')}
                className="w-full sm:w-auto bg-primary text-on-primary py-3 px-8 font-headline font-extrabold uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all border-2 border-black flex-shrink-0"
              >
                Parse Resume
              </button>
            </div>
            <div className="absolute -right-4 -top-4 opacity-10">
              <FileCheck className="w-48 h-48" />
            </div>
          </section>
        )}

        {/* Dashboard statistics aggregation overview */}
        <DashboardStats stats={stats} />

        {/* Dynamic Prompt to run a scan when settings/profile has changed since last scan */}
        {hasChangesSinceLastScan && activeTab !== 'scanner' && profile.rawText && (
          <section className="border-2 border-primary bg-primary-container p-5 relative overflow-hidden neo-shadow-primary">
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                <h2 className="font-headline font-bold text-xl uppercase leading-tight text-primary">Search settings changed</h2>
                <p className="text-sm mt-2 text-on-surface-variant font-body">Your settings or resume changed. Run a new scan?</p>
              </div>
              <button
                onClick={handleLaunchScanFromPrompt}
                className="w-full sm:w-auto bg-primary text-on-primary py-3 px-8 font-headline font-extrabold uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all border-2 border-black flex items-center justify-center gap-2 flex-shrink-0"
              >
                <Sparkles className="w-5 h-5" />
                Run Scan
              </button>
            </div>
          </section>
        )}

        {/* View Navigation controls - Neo Brutalist Tabs */}
        <div className="flex border-b-2 border-outline-variant gap-2 overflow-x-auto scrollbar-none mt-12" id="tabs-navigation-deck">
          <button
            onClick={() => setActiveTab('scanner')}
            className={`px-6 py-4 text-sm font-headline uppercase font-bold tracking-widest transition-all border-t-2 border-l-2 border-r-2 cursor-pointer ${
              activeTab === 'scanner'
                ? 'bg-surface-container border-primary text-primary neo-shadow'
                : 'bg-transparent border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-outline-variant'
            }`}
          >
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Scanner
            </div>
          </button>
          <button
            onClick={() => setActiveTab('tracker')}
            className={`px-6 py-4 text-sm font-headline uppercase font-bold tracking-widest transition-all border-t-2 border-l-2 border-r-2 cursor-pointer ${
              activeTab === 'tracker'
                ? 'bg-surface-container border-primary text-primary neo-shadow'
                : 'bg-transparent border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-outline-variant'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileCheck className="w-5 h-5" />
              Tracker
            </div>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-6 py-4 text-sm font-headline uppercase font-bold tracking-widest transition-all border-t-2 border-l-2 border-r-2 cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-surface-container border-primary text-primary neo-shadow'
                : 'bg-transparent border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-outline-variant'
            }`}
          >
            <div className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Profile
            </div>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-4 text-sm font-headline uppercase font-bold tracking-widest transition-all border-t-2 border-l-2 border-r-2 cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-surface-container border-primary text-primary neo-shadow'
                : 'bg-transparent border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-outline-variant'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5" />
              Settings
            </div>
          </button>
        </div>

        {/* Active tab rendered views */}
        <div className="space-y-6 pt-6" id="active-tab-panel">
          {activeTab === 'profile' && (
            <div className="space-y-8">
              <ResumeParser
                profile={profile}
                onChangeProfile={setProfile}
                onParseComplete={handleParseComplete}
                addAiLog={addAiLog}
                llmConfig={llmConfig}
              />
              <AgentSettings
                mode="targeting"
                llmConfig={llmConfig}
                onChangeLLMConfig={setLlmConfig}
                profile={profile}
                onChangeProfile={setProfile}
              />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-8">
              <AgentSettings
                mode="sourcing"
                llmConfig={llmConfig}
                onChangeLLMConfig={setLlmConfig}
                profile={profile}
                onChangeProfile={setProfile}
              />
            </div>
          )}

          {activeTab === 'scanner' && (
            <JobScanner
              profile={profile}
              onChangeProfile={setProfile}
              llmConfig={llmConfig}
              savedJobs={savedJobs}
              watchlist={watchlist}
              scannedJobs={scannedJobs}
              setScannedJobs={setScannedJobs}
              dismissedJobs={dismissedJobs}
              dismissedJobKeys={dismissedJobKeys}
              onDismissJob={handleDismissJob}
              onUndismissJob={handleUndismissJob}
              onAddJobs={handleAddJobs}
              onAddToWatchlist={handleAddToWatchlist}
              onRemoveFromWatchlist={handleRemoveFromWatchlist}
              onUpdateJobStatus={handleUpdateJobStatus}
              aiLogs={aiLogs}
              addAiLog={addAiLog}
              clearAiLogs={clearAiLogs}
              lastRunTime={lastRunTime}
              setLastRunTime={setLastRunTime}
              isAiRunning={isAiRunning}
              setIsAiRunning={setIsAiRunning}
              onUpdateStats={handleUpdateStats}
              shouldTriggerScan={shouldTriggerScan}
              onScanTriggered={() => setShouldTriggerScan(false)}
              onScanStarted={handleScanStarted}
              currentlyRefiningJobId={currentlyRefiningJobId}
            />
          )}

          {activeTab === 'tracker' && (
            <SubmissionTracker
              jobs={savedJobs}
              onUpdateJobStatus={handleUpdateJobStatus}
              onRemoveJob={handleRemoveJob}
              onAddJobs={handleAddJobs}
              onUpdateJobDetails={handleUpdateJobDetails}
            />
          )}
        </div>
      </main>
    </div>
  );
}
