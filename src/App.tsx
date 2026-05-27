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
            prefersW2Only: false,
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
      prefersW2Only: false,
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
      prefersW2Only: p.prefersW2Only,
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
    localStorage.setItem('job_agent_last_scanned_profile', key);
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
          };
        }
        return parsed;
      } catch (e) { /* ignore */ }
    }
    return {
      provider: 'lmstudio',
      endpoint: 'http://localhost:1234/v1',
      apiKey: '',
      modelName: 'meta-llama-3-8b-instruct',
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

  const [dismissedJobKeys, setDismissedJobKeys] = useState<string[]>(() => {
    const cached = localStorage.getItem('job_agent_dismissed_job_keys');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) { /* ignore */ }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('job_agent_dismissed_job_keys', JSON.stringify(dismissedJobKeys));
  }, [dismissedJobKeys]);

  const addDismissedJobKey = (company: string, title: string) => {
    const key = `${company.toLowerCase().trim()}|${title.toLowerCase().trim()}`;
    setDismissedJobKeys((prev) => {
      if (!prev.includes(key)) {
        return [...prev, key];
      }
      return prev;
    });
  };

  // Client-facing AI Real-time Event System
  const [aiLogs, setAiLogs] = useState<string[]>(() => {
    const cached = localStorage.getItem('job_agent_ai_logs');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) { /* ignore */ }
    }
    return [
      `[${new Date().toLocaleTimeString()}] System: Search Agent Core Initialized. Awaiting resume input...`
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
      localStorage.setItem('job_agent_ai_logs', JSON.stringify(updated));
      return updated;
    });
  };

  const clearAiLogs = () => {
    const initialLog = `[${new Date().toLocaleTimeString()}] System: Logs cleared by candidate.`;
    setAiLogs([initialLog]);
    localStorage.setItem('job_agent_ai_logs', JSON.stringify([initialLog]));
  };

  // Background statistics indicators
  const [stats, setStats] = useState(() => {
    const cached = localStorage.getItem('job_agent_stats');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) { /* ignore */ }
    }
    return {
      totalScanned: 0,
      duplicatesPrevented: 0,
      activeMatchesCount: 0,
    };
  });

  const handleUpdateStats = (scannedCount: number, duplicatesCount: number) => {
    setStats(prev => ({
      totalScanned: prev.totalScanned + scannedCount,
      duplicatesPrevented: prev.duplicatesPrevented + duplicatesCount,
      activeMatchesCount: prev.activeMatchesCount,
    }));
  };

  // Local storage caching effects
  useEffect(() => {
    localStorage.setItem('job_agent_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('job_agent_llm_config', JSON.stringify(llmConfig));
  }, [llmConfig]);

  useEffect(() => {
    localStorage.setItem('job_agent_saved_jobs', JSON.stringify(savedJobs));
  }, [savedJobs]);

  useEffect(() => {
    localStorage.setItem('job_agent_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem('job_agent_stats', JSON.stringify(stats));
  }, [stats]);

  const handleAddJobs = (newJobs: Job[]) => {
    // Add non-duplicate jobs to tracking board
    setSavedJobs((prev) => {
      const filtered = newJobs.filter(
        (nj) => !prev.some((pj) => pj.title.toLowerCase() === nj.title.toLowerCase() && pj.company.toLowerCase() === nj.company.toLowerCase())
      );
      return [...filtered, ...prev];
    });

    // Also remove from watchlist if saved to tracker
    newJobs.forEach((nj) => {
      setWatchlist((prev) => prev.filter((wj) => !(wj.title.toLowerCase() === nj.title.toLowerCase() && wj.company.toLowerCase() === nj.company.toLowerCase())));
    });
  };

  const handleAddToWatchlist = (newJobs: Job[]) => {
    setWatchlist((prev) => {
      const filtered = newJobs.filter(
        (nj) => 
          !prev.some((pj) => pj.title.toLowerCase() === nj.title.toLowerCase() && pj.company.toLowerCase() === nj.company.toLowerCase()) &&
          !savedJobs.some((sj) => sj.title.toLowerCase() === nj.title.toLowerCase() && sj.company.toLowerCase() === nj.company.toLowerCase())
      );
      return [...filtered, ...prev];
    });
  };

  const handleRemoveFromWatchlist = (id: string) => {
    const job = watchlist.find((j) => j.id === id);
    if (job) {
      addDismissedJobKey(job.company, job.title);
    }
    setWatchlist((prev) => prev.filter((j) => j.id !== id));
  };

  const handleUpdateJobStatus = (id: string, status: 'discovered' | 'applied' | 'review' | 'interviewing' | 'offered' | 'rejected', notes?: string) => {
    setSavedJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, status, notes, appliedDate: status === 'applied' && !job.appliedDate ? new Date().toISOString() : job.appliedDate } : job))
    );
  };

  const handleRemoveJob = (id: string) => {
    const job = savedJobs.find((j) => j.id === id);
    if (job) {
      addDismissedJobKey(job.company, job.title);
    }
    setSavedJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const handleParseComplete = (parsed: { name?: string; skills?: string[]; roles?: string[]; location?: string }) => {
    setActiveTab('scanner'); // Navigate to scanner automatically once parsing succeeds!
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans" id="applet-background">
      {/* Premium Elegant Navigation Header */}
      <header className="border-b border-white/5 bg-slate-950/50 backdrop-blur-lg sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-500/10">
              <Briefcase className="w-5.5 h-5.5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white font-display">Job Search Agent</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Scanning Engine Active
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">

            <span className="bg-white/10 h-6 w-px" />

            <div className="text-right hidden sm:block">
              <span className="text-xs font-semibold text-slate-300 block">
                AI Engine
              </span>
              <span className="text-[10px] text-slate-500 font-medium font-mono">Model: {llmConfig.modelName}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8" id="primary-applet-grid">
        
        {/* Dynamic Warning Alert for First-time setup */}
        {!profile.rawText && (
          <div className="bg-indigo-950/30 border border-indigo-500/20 backdrop-blur-md rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-bounce-in">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-900/40 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-200">Zero-Config AI Matching Required</h4>
                <p className="text-xs text-indigo-300 mt-1 leading-normal">
                  Your raw resume context is empty. Load or paste your resume details in <strong>Profile</strong> to allow the AI agent to run personalized matching.
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setActiveTab('profile')}
              className="text-xs font-semibold px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-500/10 transition-colors shrink-0"
            >
              Parse Resume Now
            </button>
          </div>
        )}

        {/* Dashboard statistics aggregation overview */}
        <DashboardStats jobs={savedJobs} stats={stats} />

        {/* Dynamic Prompt to run a scan when settings/profile has changed since last scan */}
        {hasChangesSinceLastScan && activeTab !== 'scanner' && profile.rawText && (
          <div className="bg-indigo-950/45 border border-indigo-550/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in shadow-lg shadow-indigo-950/20">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-900/40 border border-indigo-500/25 flex items-center justify-center text-indigo-405 text-indigo-400 shrink-0">
                <Sparkles className="w-5 h-5 text-indigo-450 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-200 font-display">Targeting Preferences Modified</h4>
                <p className="text-xs text-indigo-300 mt-1 leading-normal font-sans">
                  Your targeting positions, location boundaries, minimum match score, or resume profile have changed. Would you like to run a matching scan now?
                </p>
              </div>
            </div>
            
            <button
              onClick={handleLaunchScanFromPrompt}
              className="text-xs font-semibold px-4.5 py-2.5 bg-indigo-650 hover:bg-indigo-600 active:bg-indigo-705 text-white rounded-xl shadow-md shadow-indigo-550/15 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer font-sans"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              Launch Scan Now
            </button>
          </div>
        )}

        {/* View Navigation controls */}
        <div className="flex border-b border-white/10 gap-2 overflow-x-auto min-h-12 scrollbar-none" id="tabs-navigation-deck">
          <button
            onClick={() => setActiveTab('scanner')}
            className={`px-5 py-3 text-sm font-semibold tracking-tight transition-all border-b-2 flex items-center gap-2 shrink-0 ${
              activeTab === 'scanner'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Scanner
          </button>
          <button
            onClick={() => setActiveTab('tracker')}
            className={`px-5 py-3 text-sm font-semibold tracking-tight transition-all border-b-2 flex items-center gap-2 shrink-0 ${
              activeTab === 'tracker'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            Submission Tracker
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-5 py-3 text-sm font-semibold tracking-tight transition-all border-b-2 flex items-center gap-2 shrink-0 ${
              activeTab === 'profile'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-4 h-4" />
            Profile
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-5 py-3 text-sm font-semibold tracking-tight transition-all border-b-2 flex items-center gap-2 shrink-0 ${
              activeTab === 'settings'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            LLM Settings
          </button>
        </div>

        {/* Active tab rendered views */}
        <div className="space-y-6" id="active-tab-panel">
          {activeTab === 'profile' && (
            <div className="space-y-6">
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
            <div className="space-y-6">
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
              llmConfig={llmConfig}
              savedJobs={savedJobs}
              watchlist={watchlist}
              dismissedJobKeys={dismissedJobKeys}
              onDismissJob={addDismissedJobKey}
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
            />
          )}

          {activeTab === 'tracker' && (
            <SubmissionTracker
              jobs={savedJobs}
              onUpdateJobStatus={handleUpdateJobStatus}
              onRemoveJob={handleRemoveJob}
              onAddJobs={handleAddJobs}
            />
          )}
        </div>
      </main>

      {/* Humble Human footer */}
      <footer className="border-t border-white/5 bg-slate-950/30 py-8 mt-16" id="applet-footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
          <span className="font-semibold text-slate-400 font-display">Job Search Agent</span>
        </div>
      </footer>
    </div>
  );
}
