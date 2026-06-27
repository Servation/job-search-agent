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
  currentlyRefiningJobId = null
}: JobScannerProps) {
  const [preventedDuplicates, setPreventedDuplicates] = useState<any[]>([]);
  const [activeScannerTab, setActiveScannerTab] = useState<'matched' | 'unmatched' | 'dismissed'>('matched');
  
  const matchedJobs = scannedJobs.filter(j => j.isFullDescriptionFetched);
  const unmatchedJobs = scannedJobs.filter(j => !j.isFullDescriptionFetched);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'running'>('idle');
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [isReevaluatingId, setIsReevaluatingId] = useState<string | null>(null);

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
      setScanMessage(`Scan skipped: the job board is full (${scannedJobsRef.current.length}/${capacityLimit}). Dismiss or move some jobs to make space.`);
      localStorage.setItem('job_agent_last_run_timestamp', String(Date.now()));
      return;
    }

    if (!profile.rawText) {
      setScanMessage("Add your resume in the Profile tab first.");
      return;
    }

    setIsAiRunning(true);
    setScanStatus('running');
    setScanMessage(null);
    onScanStarted();
    clearAiLogs();

    scannerLog("Searching job boards for new postings...", "fetch");

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
        
        scannerLog("Search complete.", "complete");
        
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
      setScanMessage(`Search failed: ${err.message}`);
    } finally {
      setIsAiRunning(false);
      setScanStatus('idle');
    }
  };

  const executeRefinement = async () => {
    if (!profile.rawText) {
      setScanMessage("Add your resume in the Profile tab first.");
      return;
    }

    setIsAiRunning(true);
    setScanStatus('running');
    setScanMessage(null);
    onScanStarted();

    scannerLog("Scoring jobs against your resume...", "fetch");

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
      scannerLog("Matching started.", "complete");
      
    } catch (err: any) {
      scannerLog(`Matching failed: ${err.message}`, "filterSkip");
      setScanMessage(`Matching failed: ${err.message}`);
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
      notes: note || job.notes || 'Saved from discovered jobs'
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
      scannerLog(`Dismissed "${jobToDismiss.title}" at ${jobToDismiss.company}.`, "complete");
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
      addAiLog(`Blocked "${cleanCompany}". Future searches will skip this company.`);
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
    scannerLog(`Restored "${job.title}" at ${job.company}.`, "complete");
  };

  const handleReevaluateJob = async (job: Job) => {
    setIsReevaluatingId(job.id);
    scannerLog(`Re-scoring "${job.title}" at ${job.company}...`, "fetch");
    try {
      const response = await fetch('/api/jobs/reevaluate-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id })
      });
      if (!response.ok) {
        throw new Error(await response.text() || "Re-evaluation failed.");
      }
      const data = await response.json();
      if (data.success && data.job) {
        setScannedJobs(prev => prev.map(j => j.id === job.id ? data.job : j));
        scannerLog(`Re-scored "${job.title}" (${data.job.matchScore}%).`, "complete");
      }
    } catch (err: any) {
      scannerLog(`Re-scoring failed: ${err.message}`, "filterSkip");
    } finally {
      setIsReevaluatingId(null);
    }
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
    <section className="space-y-8" id="job-scanner-container">
      {/* Search Header Config Controls */}
      <div className="bg-surface border-2 border-outline-variant p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 neo-shadow">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between lg:justify-start w-full lg:w-auto gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-headline font-bold text-primary flex items-center gap-3 uppercase tracking-widest shrink-0">
              <div className="p-2 bg-primary text-on-primary border-2 border-black neo-shadow-primary">
                <Briefcase className="w-6 h-6" />
              </div>
              Scanner
            </h2>
            <div className="h-8 w-1 bg-outline-variant hidden sm:block"></div>
          </div>
          
          <div className="flex items-center gap-3 bg-surface-container-lowest px-4 py-2 border-2 border-outline-variant shrink-0">
            <span className={`w-3 h-3 border-2 border-black ${
              scanStatus === 'running' || isAiRunning ? "bg-primary animate-pulse" : "bg-emerald-500"
            }`} />
            <span className="text-sm font-headline font-bold text-on-surface uppercase tracking-widest">
              {scanStatus === 'running' ? "Searching..." : isAiRunning ? "Scoring jobs..." : "Idle"}
            </span>
          </div>
        </div>

        <div className="flex flex-col lg:items-end gap-2 w-full lg:w-auto mt-2 lg:mt-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full">
            {scanStatus === 'idle' ? (
              <>
                <button
                  onClick={executeScan}
                  disabled={!profile.rawText}
                  className="px-6 py-3 bg-secondary text-on-secondary font-headline font-extrabold text-sm uppercase tracking-widest border-2 border-black hover:brightness-125 cursor-pointer active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all w-full sm:w-auto flex justify-center items-center gap-2 neo-shadow group"
                >
                  <Play className="w-5 h-5 group-hover:animate-pulse" />
                  <span className="flex items-center gap-2">
                    Find Jobs
                    <span className="tabular-nums font-mono text-[11px] bg-black/20 px-2 py-1 border-2 border-black/10">{formatScrapeTime(timers.scrape)}</span>
                  </span>
                </button>
                <button
                  onClick={executeRefinement}
                  disabled={!profile.rawText}
                  className="px-6 py-3 bg-primary text-on-primary font-headline font-extrabold text-sm uppercase tracking-widest border-2 border-black hover:brightness-125 cursor-pointer active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all w-full sm:w-auto flex justify-center items-center gap-2 neo-shadow group"
                >
                  <Sparkles className="w-5 h-5" />
                  <span className="flex items-center gap-2">
                    Score Jobs
                    <span className="tabular-nums font-mono text-[11px] bg-black/20 px-2 py-1 border-2 border-black/10">{formatMatchTime(timers.match)}</span>
                  </span>
                </button>
              </>
            ) : (
              <button
                disabled
                className="px-6 py-3 bg-surface-container text-outline font-headline font-extrabold text-sm uppercase tracking-widest border-2 border-outline-variant flex justify-center items-center gap-2 cursor-not-allowed w-full sm:w-auto"
              >
                <svg className="animate-spin h-5 w-5 text-outline" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </button>
            )}
          </div>
          <div className="flex items-center justify-center lg:justify-end gap-2 text-xs font-mono font-bold text-on-surface-variant px-1 w-full mt-1 uppercase tracking-widest">
            <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Runs automatically in background
          </div>
        </div>
      </div>

      {scanMessage && (
        <div className="p-4 bg-primary-container text-sm text-on-primary-container border-2 border-primary font-headline font-bold uppercase tracking-wider neo-shadow-primary">
          {scanMessage}
        </div>
      )}


      {/* Unified Live Event Logs Scrolling Terminal */}
      <EventLogsConsole
        scanStatus={scanStatus}
        aiLogs={aiLogs}
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
      <div className="space-y-6" id="scanned-matches-tabs-container">
        {/* Tab selection header */}
        <div className="flex border-b-4 border-outline-variant pb-0 gap-4">
          <button
            onClick={() => setActiveScannerTab('matched')}
            className={`px-4 py-3 text-sm font-headline font-bold uppercase tracking-widest transition-all cursor-pointer border-2 border-b-0 translate-y-[2px] ${
              activeScannerTab === 'matched' 
                ? 'bg-surface border-outline-variant text-primary z-10 shadow-[0_-4px_0_0_var(--color-primary)]' 
                : 'bg-surface-container-lowest border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-outline-variant'
            }`}
          >
            Matched Jobs ({matchedJobs.length})
          </button>
          
          <button
            onClick={() => setActiveScannerTab('unmatched')}
            className={`px-4 py-3 text-sm font-headline font-bold uppercase tracking-widest transition-all cursor-pointer border-2 border-b-0 translate-y-[2px] ${
              activeScannerTab === 'unmatched' 
                ? 'bg-surface border-outline-variant text-primary z-10 shadow-[0_-4px_0_0_var(--color-primary)]' 
                : 'bg-surface-container-lowest border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-outline-variant'
            }`}
          >
            Unmatched Jobs ({unmatchedJobs.length})
          </button>
          
          <button
            onClick={() => setActiveScannerTab('dismissed')}
            className={`px-4 py-3 text-sm font-headline font-bold uppercase tracking-widest transition-all cursor-pointer border-2 border-b-0 translate-y-[2px] ${
              activeScannerTab === 'dismissed' 
                ? 'bg-surface border-outline-variant text-primary z-10 shadow-[0_-4px_0_0_var(--color-primary)]' 
                : 'bg-surface-container-lowest border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-outline-variant'
            }`}
          >
            Dismissed ({dismissedJobs.length})
          </button>
        </div>

        {/* Tab Content 1: Matched Jobs */}
        {activeScannerTab === 'matched' && (
          <div className="space-y-4" id="matched-jobs-list">
            <div className="flex justify-between items-center px-1">
              <span className="text-sm uppercase font-headline font-bold tracking-widest text-primary">Matches</span>
              <span className="text-xs text-on-surface-variant font-mono font-bold border-2 border-outline-variant px-2 py-1">
                {matchedJobs.length} / {profile.maxDiscoveredJobs || 30} slots used
              </span>
            </div>

            {matchedJobs.length === 0 ? (
              <div className="text-center py-16 bg-surface-container-lowest border-2 border-dashed border-outline text-on-surface-variant font-headline font-bold uppercase tracking-widest">
                No matches yet. The agent is still scoring jobs.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
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
                      isReevaluatingId={isReevaluatingId}
                      onReevaluateJob={handleReevaluateJob}
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
              <span className="text-sm uppercase font-headline font-bold tracking-widest text-on-surface">Waiting to be scored</span>
              <span className="text-xs text-on-surface-variant font-mono font-bold border-2 border-outline-variant px-2 py-1">
                {unmatchedJobs.length} / 100 slots used
              </span>
            </div>

            {unmatchedJobs.length === 0 ? (
              <div className="text-center py-16 bg-surface-container-lowest border-2 border-dashed border-outline text-on-surface-variant font-headline font-bold uppercase tracking-widest">
                Nothing waiting to be scored.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
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
                      isReevaluatingId={isReevaluatingId}
                      onReevaluateJob={handleReevaluateJob}
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
              <span className="text-sm uppercase font-headline font-bold tracking-widest text-on-surface flex items-center gap-2">
                🗑️ Dismissed jobs ({dismissedJobs.length})
              </span>
              <span className="text-xs text-on-surface-variant font-mono font-bold hidden sm:inline-block">Restore jobs removed by mistake</span>
            </div>

            {dismissedJobs.length === 0 ? (
              <div className="text-center py-16 bg-surface-container-lowest border-2 border-dashed border-outline text-on-surface-variant font-headline font-bold uppercase tracking-widest">
                No dismissed jobs.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
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
                  <div key={dJob.id} className="bg-surface border-2 border-outline-variant p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 neo-shadow-sm">
                    <div className="space-y-2 text-left flex-grow">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-headline font-bold text-on-surface">{dJob.title}</h4>
                        <span className={`px-2 py-1 text-[10px] font-headline font-extrabold uppercase tracking-widest border-2 ${getMatchColor(dJob.matchScore)} shrink-0`}>
                          {dJob.matchScore}% Match
                        </span>
                        {dJob.sourceTag && (
                          <span className="px-2 py-1 bg-surface-container-lowest text-[10px] font-mono font-bold text-on-surface border-2 border-outline-variant uppercase">
                            {dJob.sourceTag}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-headline font-bold text-on-surface uppercase tracking-wider">
                        {dJob.company} <span className="text-on-surface-variant mx-2">·</span> <span className="text-on-surface-variant font-normal">{dJob.location}</span>
                      </p>
                      {dJob.refinementReason && (
                        <p className="text-xs font-mono font-bold text-primary bg-primary-container/30 border-2 border-primary px-3 py-2 w-max mt-2">
                          Reason: {dJob.refinementReason}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => handleUndismissJob(dJob)}
                      className="px-4 py-2 bg-surface-container text-on-surface font-headline font-bold text-xs uppercase tracking-widest border-2 border-outline-variant hover:border-on-surface hover:text-on-surface transition-all self-stretch sm:self-auto justify-center cursor-pointer flex items-center gap-2 neo-shadow-sm"
                      title="Restore to the board"
                    >
                      <span className="font-extrabold text-lg">↺</span> Undismiss
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
