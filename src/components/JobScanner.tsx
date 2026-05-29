/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Briefcase, Sparkles, Info } from 'lucide-react';
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
  const [activeScannerTab, setActiveScannerTab] = useState<'discovered' | 'dismissed'>('discovered');
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'running'>('idle');
  const [scanMessage, setScanMessage] = useState<string | null>(null);

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
      scannerLog(`Instant search failed: ${err.message}.`, "filterSkip");
    } finally {
      setIsAiRunning(false);
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
      <div className="sleek-card rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2 font-display">
            <Briefcase className="w-5 h-5 text-indigo-400" />
            Scanner
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Initiate real-time searches looking for matching jobs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {scanStatus === 'idle' ? (
            <button
              onClick={executeScan}
              disabled={!profile.rawText}
              className="px-6 py-2.5 rounded-xl bg-indigo-650 hover:bg-indigo-700 text-white font-semibold text-sm transition-all shadow-md shadow-indigo-500/15 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              Search Now
            </button>
          ) : (
            <button
              disabled
              className="px-6 py-2.5 rounded-xl bg-indigo-750/50 text-white/70 font-semibold text-sm transition-all flex items-center gap-2 cursor-not-allowed shrink-0"
            >
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Searching...
            </button>
          )}
        </div>
      </div>

      {scanMessage && (
        <div className="p-4 bg-amber-950/45 text-xs text-amber-300 rounded-xl border border-amber-500/20">
          {scanMessage}
        </div>
      )}

      {/* AI Live Monitoring Telemetry Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5" id="ai-status-monitoring">
        <div className="sleek-card rounded-2xl p-5 border border-white/5 bg-slate-900/40 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] tracking-wider uppercase text-slate-400 font-bold block">AI Agent Core Engine</span>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${
                scanStatus === 'running' ? "bg-indigo-500 animate-ping" : "bg-emerald-500"
              }`} />
              <span className="text-sm font-bold text-slate-100 uppercase tracking-tight">
                {scanStatus === 'running' ? "Searching..." : "Instance Idle"}
              </span>
            </div>
            {scanStatus === 'running' ? (
              <span className="text-[10px] block text-indigo-400 font-medium leading-none animate-pulse">Running sourcing and match scans...</span>
            ) : (
              <span className="text-[10px] block text-slate-400 font-medium leading-none">Periodic background checks active (every 5 mins)</span>
            )}
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-955 flex items-center justify-center text-slate-400">
            <Sparkles className={`w-5 h-5 ${isAiRunning ? "text-indigo-400 animate-spin" : "text-emerald-450"}`} />
          </div>
        </div>

        <div className="sleek-card rounded-2xl p-5 border border-white/5 bg-slate-900/40 col-span-2 flex flex-col justify-between">
          <div className="space-y-1">
            <span className="text-[10px] tracking-wider uppercase text-slate-400 font-bold block">Last Execution Checkpoint (Bookmark Indicator)</span>
            <span className="text-sm font-bold text-white block">
              {lastRunTime ? lastRunTime : "Never Executed"}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 leading-normal mt-1.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            {lastRunTime ? (
              <span>Active scan bookmark established. Incremental run will resume precisely from where it left off to avoid duplicates.</span>
            ) : (
              <span>Dynamic baseline synchronisation. Checkpoint logs will save automatically to skip redundant positions.</span>
            )}
          </div>
        </div>
      </div>

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
            onClick={() => setActiveScannerTab('discovered')}
            className={`pb-2 px-1 text-sm font-semibold tracking-tight transition-all relative cursor-pointer ${
              activeScannerTab === 'discovered' 
                ? 'text-white font-bold' 
                : 'text-slate-450 hover:text-slate-300'
            }`}
          >
            Discovered Postings ({scannedJobs.length})
            {activeScannerTab === 'discovered' && (
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
            Dismissed Postings ({dismissedJobs.length})
            {activeScannerTab === 'dismissed' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full" />
            )}
          </button>
        </div>

        {/* Tab Content 1: Discovered Postings */}
        {activeScannerTab === 'discovered' && (
          <div className="space-y-4" id="scanned-matches-list">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs uppercase font-bold tracking-wider text-indigo-400 font-display">Discovered Postings</span>
              <span className="text-xs text-slate-400 font-mono">
                {scannedJobs.length} / {profile.maxDiscoveredJobs || 30} slots used
              </span>
            </div>

            {scannedJobs.length === 0 ? (
              <div className="text-center py-12 sleek-card rounded-2xl border border-dashed border-white/5 text-slate-500 font-medium">
                No discovered postings yet. Launch a scan to find opportunities.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {[...scannedJobs]
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
