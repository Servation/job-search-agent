/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Briefcase, Sparkles, Info, Play } from 'lucide-react';
import { Job, JobStatusType, ResumeProfile, LLMConfig } from '../types';

// Import subcomponents
import DiscoveredJobCard from './JobScanner/DiscoveredJobCard';
import WatchlistPanel from './JobScanner/WatchlistPanel';
import ManualAddModal from './JobScanner/ManualAddModal';
import EventLogsConsole from './JobScanner/EventLogsConsole';

interface JobScannerProps {
  profile: ResumeProfile;
  onChangeProfile: (profile: ResumeProfile) => void;
  llmConfig: LLMConfig;
  savedJobs: Job[];
  watchlist: Job[];
  scannedJobs: Job[];
  setScannedJobs: React.Dispatch<React.SetStateAction<Job[]>>;
  dismissedJobs?: Job[];
  dismissedJobKeys: string[];
  onDismissJob: (job: Job) => void;
  onUndismissJob: (job: Job) => void;
  onAddJobs: (newJobs: Job[]) => void;
  onAddToWatchlist: (newJobs: Job[]) => void;
  onRemoveFromWatchlist: (id: string) => void;
  onUpdateJobStatus: (id: string, status: JobStatusType, notes?: string) => void;
  aiLogs: string[];
  addAiLog: (msg: string) => void;
  clearAiLogs: () => void;
  lastRunTime: string | null;
  setLastRunTime: (time: string | null) => void;
  isAiRunning: boolean;
  setIsAiRunning: (running: boolean) => void;
  onUpdateStats: (newStats: any) => void;
  shouldTriggerScan: boolean;
  onScanTriggered: () => void;
  onScanStarted: () => void;
  currentlyRefiningJobId?: string | null;
  ralphMode: boolean;
  setRalphMode: (mode: boolean) => void;
}

export default function JobScanner({
  profile,
  onChangeProfile,
  llmConfig,
  savedJobs,
  watchlist,
  scannedJobs,
  setScannedJobs,
  dismissedJobs = [],
  dismissedJobKeys,
  onDismissJob,
  onUndismissJob,
  onAddJobs,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  onUpdateJobStatus,
  aiLogs,
  addAiLog,
  clearAiLogs,
  lastRunTime,
  setLastRunTime,
  isAiRunning,
  setIsAiRunning,
  onUpdateStats,
  shouldTriggerScan,
  onScanTriggered,
  onScanStarted,
  currentlyRefiningJobId = null,
  ralphMode,
  setRalphMode
}: JobScannerProps) {
  const [preventedDuplicates, setPreventedDuplicates] = useState<any[]>([]);
  const [activeScannerTab, setActiveScannerTab] = useState<'matched' | 'unmatched' | 'dismissed'>('matched');
  
  const matchedJobs = scannedJobs.filter(j => j.isFullDescriptionFetched);
  const unmatchedJobs = scannedJobs.filter(j => !j.isFullDescriptionFetched);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'running'>('idle');
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const [timers, setTimers] = useState({ scrape: 0, match: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      const autoScrapeMinutes = profileRef.current.autoScanInterval || 0;
      const refinerMinutes = profileRef.current.refinerIntervalMinutes || 0;
      
      const lastScrapeMs = parseInt(localStorage.getItem('job_agent_last_run_timestamp') || String(Date.now()));
      const nextScrapeMs = lastScrapeMs + (autoScrapeMinutes * 60 * 1000);
      let remainingScrape = Math.floor((nextScrapeMs - Date.now()) / 1000);
      if (remainingScrape < 0) remainingScrape = 0;
      
      const lastRefinerMs = parseInt(localStorage.getItem('job_agent_last_refiner_timestamp') || String(Date.now()));
      const nextRefinerMs = lastRefinerMs + (refinerMinutes * 60 * 1000);
      let remainingRefiner = Math.floor((nextRefinerMs - Date.now()) / 1000);
      if (remainingRefiner < 0) remainingRefiner = 0;
      
      setTimers({
        scrape: remainingScrape,
        match: remainingRefiner
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatScrapeTime = (secs: number) => {
    if (!profile.autoScanInterval || profile.autoScanInterval === 0) return 'Manual';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  };

  const formatMatchTime = (secs: number) => {
    if (!profile.refinerIntervalMinutes || profile.refinerIntervalMinutes === 0) return 'Manual';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
    return `${s.toString().padStart(2, '0')}s`;
  };

  const scannedJobsRef = useRef(scannedJobs);
  scannedJobsRef.current = scannedJobs;

  const profileRef = useRef(profile);
  profileRef.current = profile;

  const scannerLog = useCallback((msg: string) => {
    addAiLog(msg);
  }, [addAiLog]);

  // Dynamic duplicate & dismissed cleanup
  useEffect(() => {
    setScannedJobs(prev => {
      const sortedPrev = [...prev].sort((a, b) => b.matchScore - a.matchScore);
      const companyCounts = new Map<string, number>();
      const maxPerCompany = profile.maxMatchesPerCompany || 3;

      const filtered = sortedPrev.filter(job => {
        const isSaved = savedJobs.some(s => s.title.toLowerCase() === job.title.toLowerCase() && s.company.toLowerCase() === job.company.toLowerCase());
        const isWatchlisted = watchlist.some(w => w.title.toLowerCase() === job.title.toLowerCase() && w.company.toLowerCase() === job.company.toLowerCase());
        const key = `${job.company.toLowerCase().trim()}|${job.title.toLowerCase().trim()}`;
        const isDismissed = dismissedJobKeys.includes(key);
        
        if (isSaved || isWatchlisted || isDismissed) {
          return false;
        }

        if (profile.limitCompanyMatches) {
          const companyKey = job.company.toLowerCase().trim();
          const currentCount = companyCounts.get(companyKey) || 0;
          if (currentCount >= maxPerCompany) {
            return false;
          }
          companyCounts.set(companyKey, currentCount + 1);
        }

        return true;
      });

      if (filtered.length !== prev.length) {
        return filtered;
      }
      return prev;
    });
  }, [savedJobs, watchlist, dismissedJobKeys, profile.limitCompanyMatches, profile.maxMatchesPerCompany]);

  const executeScan = async () => {
    const capacityLimit = profileRef.current.maxDiscoveredJobs || 30;
    if (scannedJobsRef.current.length >= capacityLimit) {
      setScanMessage(`Scan skipped: Discovered job board is at full capacity (${scannedJobsRef.current.length}/${capacityLimit} slots used). Please dismiss or move some jobs to make space.`);
      localStorage.setItem('job_agent_last_run_timestamp', String(Date.now()));
      return;
    }

    if (!profile.rawText) {
      setScanMessage("Please paste or parse a resume first from the profile section!");
      return;
    }

    setIsAiRunning(true);
    setScanStatus('running');
    setScanMessage(null);
    onScanStarted();
    clearAiLogs();

    scannerLog("JobScanner: Initiated instant search trigger on backend...", "fetch");

    try {
      await fetch('/api/profile/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, llmConfig })
      });

      const response = await fetch('/api/jobs/search-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(await response.text() || "Sourcing phase failed.");
      }

      const data = await response.json();
      if (data.success && data.db) {
        if (data.db.scannedJobs) {
          setScannedJobs(data.db.scannedJobs);
        }
        if (data.preventedDuplicates) {
          setPreventedDuplicates(data.preventedDuplicates);
        }
        
        if (data.db.logs && data.db.logs.length > 0) {
          data.db.logs.forEach((l: string) => addAiLog(l));
          await fetch('/api/logs/clear', { method: 'POST' });
        }
        
        scannerLog("JobScanner: Instant search completed successfully.", "complete");
        
        if (data.db.stats) {
          onUpdateStats(data.db.stats);
        }
      } else {
        throw new Error("Invalid response format from search-now endpoint.");
      }

      const finishTime = new Date().toLocaleString();
      setLastRunTime(finishTime);
      localStorage.setItem('job_agent_last_run_time', finishTime);
      localStorage.setItem('job_agent_last_run_timestamp', String(Date.now()));

    } catch (err: any) {
      setScanMessage(`Instant search encountered an error: ${err.message}`);
    } finally {
      setIsAiRunning(false);
      setScanStatus('idle');
    }
  };

  const executeRefinement = async () => {
    if (!profile.rawText) {
      setScanMessage("Please paste or parse a resume first from the profile section!");
      return;
    }

    setIsAiRunning(true);
    setScanStatus('running');
    setScanMessage(null);
    onScanStarted();

    scannerLog("JobScanner: Initiated manual LLM matching loop...", "fetch");

    try {
      await fetch('/api/profile/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, llmConfig })
      });

      const response = await fetch('/api/jobs/trigger-refiner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(await response.text() || "Refinement trigger failed.");
      }
      
      // Note: The loop runs in the background. The polling will pick up the UI changes!
      scannerLog("JobScanner: Matching loop started in background.", "complete");
      
    } catch (err: any) {
      scannerLog(`Manual refinement trigger failed: ${err.message}.`, "filterSkip");
      setScanMessage(`Refinement trigger encountered an error: ${err.message}`);
    } finally {
      // Keep showing as running because the background loop is going, the regular polling will update `isAiRunning`
      setScanStatus('idle');
    }
  };

  const handleSaveToTracker = (job: Job, note?: string) => {
    const addedJob = {
      ...job,
      status: 'applied' as JobStatusType,
      appliedDate: new Date().toISOString(),
      notes: note || job.notes || 'Saved from AI Agent discovery list'
    };
    
    onAddJobs([addedJob]);

    onRemoveFromWatchlist(job.id);
    setScannedJobs(prev => prev.filter(item => item.id !== job.id));
  };

  const handleSaveToWatchlist = (job: Job, note?: string) => {
    const addedJob = {
      ...job,
      status: 'discovered' as JobStatusType,
      notes: note || job.notes || 'Added manually to Watchlist'
    };
    
    onAddToWatchlist([addedJob]);
    setScannedJobs(prev => prev.filter(item => item.id !== job.id));
  };

  const handleDismissJob = (id: string) => {
    const jobToDismiss = scannedJobs.find(j => j.id === id);
    if (jobToDismiss) {
      onDismissJob(jobToDismiss);
      scannerLog(`Dismissed application: "${jobToDismiss.title}" at ${jobToDismiss.company}. Saved to Dismissed Postings.`, "complete");
    }
    setScannedJobs(prev => prev.filter(j => j.id !== id));
  };

  const handleBlockCompany = (companyName: string) => {
    const cleanCompany = companyName.trim();
    if (!cleanCompany) return;

    const currentBlocks = profile.blockedCompanies || [];
    const isAlreadyBlocked = currentBlocks.some(bc => bc.toLowerCase().trim() === cleanCompany.toLowerCase().trim());

    if (!isAlreadyBlocked) {
      const updatedProfile = {
        ...profile,
        blockedCompanies: [...currentBlocks, cleanCompany]
      };
      onChangeProfile(updatedProfile);
      addAiLog(`User: Blocked company "${cleanCompany}". Future searches and background evaluations will ignore postings from this employer.`);
    }
  };

  const handleUndismissJob = (job: Job) => {
    onUndismissJob(job);
    setScannedJobs(prev => {
      if (!prev.some(j => j.id === job.id)) {
        return [job, ...prev];
      }
      return prev;
    });
    scannerLog(`Undismissed job: "${job.title}" at ${job.company} restored to Discovered board.`, "complete");
  };

  useEffect(() => {
    if (shouldTriggerScan && !isAiRunning) {
      onScanTriggered();
      executeScan();
    }
  }, [shouldTriggerScan, isAiRunning]);

  const handleManualAddJob = (job: Job) => {
    onAddJobs([job]);
  };

  const getMatchColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-950/40 border-emerald-500/20';
    if (score >= 60) return 'text-amber-400 bg-amber-950/40 border-amber-500/20';
    return 'text-slate-400 bg-slate-900 border-white/5';
  };

  return (
    <div className="space-y-6" id="job-scanner-container">
      {/* Search Header Config Controls */}
      <div className="sleek-card rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex flex-row items-center justify-between lg:justify-start w-full lg:w-auto gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2 font-display shrink-0">
              <Briefcase className="w-5 h-5 text-indigo-400" />
              Scanner
            </h2>
            <div className="h-6 w-px bg-white/10 hidden sm:block"></div>
          </div>
          
          <div className="flex items-center gap-2.5 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-white/5 shrink-0">
            <span className={`w-2 h-2 rounded-full ${
              scanStatus === 'running' || isAiRunning ? "bg-indigo-500 animate-ping" : "bg-emerald-500"
            }`} />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-tight hidden sm:inline-block">
              {scanStatus === 'running' ? "Sourcing Jobs..." : isAiRunning ? "Evaluating Jobs..." : "System Idle"}
            </span>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tight sm:hidden">
              {scanStatus === 'running' ? "Sourcing..." : isAiRunning ? "Evaluating..." : "Idle"}
            </span>
          </div>
        </div>

        <div className="flex flex-col lg:items-end gap-1.5 w-full lg:w-auto mt-2 lg:mt-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
            {scanStatus === 'idle' ? (
              <>
                <button
                  onClick={executeScan}
                  disabled={!profile.rawText}
                  className="px-5 py-2.5 sm:py-2 rounded-xl bg-indigo-650 hover:bg-indigo-700 text-white font-semibold text-sm transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto group"
                >
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 group-hover:animate-pulse" />
                  <span className="flex items-center gap-1.5">
                    Trigger Sourcing
                    <span className="tabular-nums font-mono text-[11px] opacity-60 bg-indigo-900/50 px-1.5 py-0.5 rounded-md w-[85px] text-center border border-indigo-500/20">{formatScrapeTime(timers.scrape)}</span>
                  </span>
                </button>
                <button
                  onClick={executeRefinement}
                  disabled={!profile.rawText}
                  className="px-5 py-2.5 sm:py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 font-semibold text-sm transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed border border-purple-500/20 w-full sm:w-auto"
                >
                  <Play className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="flex items-center gap-1.5">
                    Trigger Matching
                    <span className="tabular-nums font-mono text-[11px] opacity-60 bg-purple-900/40 px-1.5 py-0.5 rounded-md w-[52px] text-center border border-purple-500/20">{formatMatchTime(timers.match)}</span>
                  </span>
                </button>
              </>
            ) : (
              <button
                disabled
                className="px-5 py-2.5 sm:py-2 rounded-xl bg-indigo-750/50 text-white/70 font-semibold text-sm transition-all flex justify-center items-center gap-2 cursor-not-allowed w-full sm:w-auto"
              >
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </button>
            )}
          </div>
          <div className="flex items-center justify-center lg:justify-end gap-1.5 text-[10px] text-slate-500 font-medium px-1 w-full mt-0.5">
            <svg className="w-3 h-3 text-emerald-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Runs automatically in background
          </div>
        </div>
      </div>

      {scanMessage && (
        <div className="p-4 bg-amber-950/45 text-xs text-amber-300 rounded-xl border border-amber-500/20">
          {scanMessage}
        </div>
      )}


      {/* Unified Live Event Logs Scrolling Terminal */}
      <EventLogsConsole
        scanStatus={scanStatus}
        aiLogs={aiLogs}
        ralphMode={ralphMode}
        setRalphMode={setRalphMode}
        clearAiLogs={clearAiLogs}
      />

      {/* Manual Entry Modal Dialog */}
      {showManualAdd && (
        <ManualAddModal
          onClose={() => setShowManualAdd(false)}
          onAddJob={handleManualAddJob}
          savedJobs={savedJobs}
        />
      )}

      {/* 🧭 Watchlist (Distinct List of Saved Jobs for review at own pace) */}
      {watchlist.length > 0 && (
        <WatchlistPanel
          watchlist={watchlist}
          onRemoveFromWatchlist={onRemoveFromWatchlist}
          onSaveToTracker={(job) => handleSaveToTracker(job)}
        />
      )}

      {/* 🧭 Tabbed Scanner Boards Dashboard */}
      <div className="space-y-4" id="scanned-matches-tabs-container">
        {/* Tab selection header */}
        <div className="flex border-b border-white/5 pb-2 mb-4 gap-4">
          <button
            onClick={() => setActiveScannerTab('matched')}
            className={`pb-2 px-1 text-sm font-semibold tracking-tight transition-all relative cursor-pointer ${
              activeScannerTab === 'matched' 
                ? 'text-white font-bold' 
                : 'text-slate-450 hover:text-slate-300'
            }`}
          >
            Matched Jobs ({matchedJobs.length})
            {activeScannerTab === 'matched' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
            )}
          </button>
          
          <button
            onClick={() => setActiveScannerTab('unmatched')}
            className={`pb-2 px-1 text-sm font-semibold tracking-tight transition-all relative cursor-pointer ${
              activeScannerTab === 'unmatched' 
                ? 'text-white font-bold' 
                : 'text-slate-450 hover:text-slate-300'
            }`}
          >
            Unmatched Jobs ({unmatchedJobs.length})
            {activeScannerTab === 'unmatched' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
            )}
          </button>
          
          <button
            onClick={() => setActiveScannerTab('dismissed')}
            className={`pb-2 px-1 text-sm font-semibold tracking-tight transition-all relative cursor-pointer ${
              activeScannerTab === 'dismissed' 
                ? 'text-white font-bold' 
                : 'text-slate-450 hover:text-slate-300'
            }`}
          >
            Dismissed ({dismissedJobs.length})
            {activeScannerTab === 'dismissed' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
            )}
          </button>
        </div>

        {/* Tab Content 1: Matched Jobs */}
        {activeScannerTab === 'matched' && (
          <div className="space-y-4" id="matched-jobs-list">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs uppercase font-bold tracking-wider text-indigo-400 font-display">Evaluated Matches</span>
              <span className="text-xs text-slate-400 font-mono">
                {matchedJobs.length} / {profile.maxDiscoveredJobs || 30} slots used
              </span>
            </div>

            {matchedJobs.length === 0 ? (
              <div className="text-center py-12 sleek-card rounded-2xl border border-dashed border-white/5 text-slate-500 font-medium">
                No matched jobs yet. Wait for the LLM to finish evaluating discovered postings.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {[...matchedJobs]
                  .sort((a, b) => {
                    const dateA = a.postedAt && !a.postedAt.includes('24h') ? new Date(a.postedAt).getTime() : 0;
                    const dateB = b.postedAt && !b.postedAt.includes('24h') ? new Date(b.postedAt).getTime() : 0;
                    if (dateA !== dateB) return dateA - dateB;
                    return a.id.localeCompare(b.id);
                  })
                  .map((job) => (
                    <DiscoveredJobCard
                      key={job.id}
                      job={job}
                      currentlyRefiningJobId={currentlyRefiningJobId}
                      onSaveToTracker={handleSaveToTracker}
                      onSaveToWatchlist={handleSaveToWatchlist}
                      onDismissJob={handleDismissJob}
                      onBlockCompany={handleBlockCompany}
                    />
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Content 2: Unmatched Jobs */}
        {activeScannerTab === 'unmatched' && (
          <div className="space-y-4" id="unmatched-jobs-list">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-400 font-display">Pending Evaluation</span>
              <span className="text-xs text-slate-500 font-mono">
                {unmatchedJobs.length} / 100 slots used
              </span>
            </div>

            {unmatchedJobs.length === 0 ? (
              <div className="text-center py-12 sleek-card rounded-2xl border border-dashed border-white/5 text-slate-500 font-medium">
                No unevaluated jobs in the queue.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {[...unmatchedJobs]
                  .sort((a, b) => {
                    const dateA = a.scannedAt ? new Date(a.scannedAt).getTime() : 0;
                    const dateB = b.scannedAt ? new Date(b.scannedAt).getTime() : 0;
                    if (dateA !== dateB) {
                      return dateA - dateB;
                    }
                    return a.id.localeCompare(b.id);
                  })
                  .map((job) => (
                    <DiscoveredJobCard
                      key={job.id}
                      job={job}
                      currentlyRefiningJobId={currentlyRefiningJobId}
                      onSaveToTracker={handleSaveToTracker}
                      onSaveToWatchlist={handleSaveToWatchlist}
                      onDismissJob={handleDismissJob}
                      onBlockCompany={handleBlockCompany}
                    />
                  ))}
              </div>
            )}
          </div>
       )}

        {/* Tab Content 3: Dismissed Postings */}
        {activeScannerTab === 'dismissed' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-455 font-display flex items-center gap-1.5">
                🗑️ Dismissed Postings Archive ({dismissedJobs.length} Positions)
              </span>
              <span className="text-xs text-slate-500 font-mono">Restore listings removed in error</span>
            </div>

            {dismissedJobs.length === 0 ? (
              <div className="text-center py-12 sleek-card rounded-2xl border border-dashed border-white/5 text-slate-500 font-medium">
                No dismissed applications found.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {[...dismissedJobs]
                  .sort((a, b) => {
                    const dateA = a.scannedAt ? new Date(a.scannedAt).getTime() : 0;
                    const dateB = b.scannedAt ? new Date(b.scannedAt).getTime() : 0;
                    if (dateB !== dateA) {
                      return dateB - dateA;
                    }
                    return b.id.localeCompare(a.id);
                  })
                  .map((dJob) => (
                  <div key={dJob.id} className="sleek-card rounded-2xl border border-white/5 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="space-y-1 text-left flex-grow">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-200">{dJob.title}</h4>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getMatchColor(dJob.matchScore)} shrink-0`}>
                          {dJob.matchScore}% Match
                        </span>
                        {dJob.sourceTag && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-950 text-[9px] font-mono font-bold text-slate-400 border border-white/5 uppercase">
                            {dJob.sourceTag}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-semibold">
                        {dJob.company} · <span className="text-slate-500 font-normal">{dJob.location}</span>
                      </p>
                      {dJob.refinementReason && (
                        <p className="text-[10px] text-amber-500 bg-amber-950/10 border border-amber-500/10 px-2 py-1 rounded-lg w-max mt-1 font-semibold">
                          Reason: {dJob.refinementReason}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handleUndismissJob(dJob)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-655/10 hover:bg-emerald-655/20 text-emerald-400 font-bold text-xs border border-emerald-500/20 flex items-center gap-1.5 transition-all self-stretch sm:self-auto justify-center cursor-pointer"
                      title="Restore listing back to Discovered postings"
                    >
                      <span>↺</span> Undismiss
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
