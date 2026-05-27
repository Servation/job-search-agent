/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
  Sparkles, 
  Check, 
  ExternalLink, 
  FileCheck, 
  AlertTriangle, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  MapPin, 
  DollarSign, 
  UserCheck, 
  X,
  FileSpreadsheet,
  Bookmark,
  Trash2,
  Info
} from 'lucide-react';
import { Job, JobTypeType, JobStatusType, ResumeProfile, LLMConfig } from '../types';
import { generateDynamicFeed } from '../data/jobFeed';

const normalizeJobUrl = (urlStr: string): string => {
  try {
    const url = new URL(urlStr);
    url.search = '';
    url.hash = '';
    let href = url.href.toLowerCase();
    if (href.endsWith('/')) {
      href = href.slice(0, -1);
    }
    return href;
  } catch {
    return urlStr.toLowerCase();
  }
};

const extractJobNumber = (urlStr: string): string | null => {
  try {
    const url = new URL(urlStr);
    const pathname = url.pathname;
    
    const workdayMatch = pathname.match(/(?:_|^-|job\/)(JR|R|JR-)[0-9]+/i);
    if (workdayMatch) {
      return workdayMatch[0].replace(/^_/, '').replace(/^job\//, '');
    }
    
    const uuidMatch = pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
      return uuidMatch[0];
    }
    
    const pathParts = pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      if (/^\d+$/.test(lastPart)) {
        return lastPart;
      }
      if (lastPart.length >= 8 && /^[0-9a-f\-]+$/i.test(lastPart)) {
        return lastPart;
      }
    }
  } catch {}
  return null;
};

interface JobScannerProps {
  profile: ResumeProfile;
  llmConfig: LLMConfig;
  savedJobs: Job[];
  watchlist: Job[];
  dismissedJobKeys: string[];
  onDismissJob: (company: string, title: string) => void;
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
  onUpdateStats: (scannedCount: number, duplicatesCount: number) => void;
  shouldTriggerScan: boolean;
  onScanTriggered: () => void;
  onScanStarted: () => void;
}

export default function JobScanner({
  profile,
  llmConfig,
  savedJobs,
  watchlist,
  dismissedJobKeys,
  onDismissJob,
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
}: JobScannerProps) {
  const [scannedJobs, setScannedJobs] = useState<Job[]>(() => {
    const cached = localStorage.getItem('job_agent_scanned_jobs');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) { /* ignore */ }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('job_agent_scanned_jobs', JSON.stringify(scannedJobs));
  }, [scannedJobs]);

  // Dynamic duplicate & dismissed cleanup: remove jobs from scanned memory if they are saved/applied, dismissed, or exceed company match limits
  useEffect(() => {
    setScannedJobs(prev => {
      // Sort by score descending first to prioritize higher matches for company limiting
      const sortedPrev = [...prev].sort((a, b) => b.matchScore - a.matchScore);
      const companyCounts = new Map<string, number>();
      const maxPerCompany = profile.maxMatchesPerCompany || 3;

      const filtered = sortedPrev.filter(job => {
        const isSaved = savedJobs.some(s => s.title.toLowerCase() === job.title.toLowerCase() && s.company.toLowerCase() === job.company.toLowerCase());
        const isWatchlisted = watchlist.some(w => w.title.toLowerCase() === job.title.toLowerCase() && w.company.toLowerCase() === job.company.toLowerCase());
        const key = `${job.company.toLowerCase()}|${job.title.toLowerCase()}`;
        const isDismissed = dismissedJobKeys.includes(key);
        
        if (isSaved || isWatchlisted || isDismissed) {
          return false;
        }

        // Apply company match limit if enabled
        if (profile.limitCompanyMatches) {
          const companyKey = job.company.toLowerCase().trim();
          const currentCount = companyCounts.get(companyKey) || 0;
          if (currentCount >= maxPerCompany) {
            return false; // Skip, exceeded company matches
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

  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [customNote, setCustomNote] = useState('');
  const [simulatedProviderLogs, setSimulatedProviderLogs] = useState<string[]>([]);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  const [ralphMode, setRalphMode] = useState<boolean>(() => {
    return localStorage.getItem('job_agent_ralph_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('job_agent_ralph_mode', String(ralphMode));
  }, [ralphMode]);

  const RALPH_QUOTES = {
    fetch: [
      "I'm helping!",
      "I'm a computer!",
      "Look Daddy, I'm a programmer!",
      "My cat's breath smells like cat food.",
      "I runned around the block!"
    ],
    filterMatch: [
      "I found a spoon!",
      "Hi, principal Skinner! I'm scanning!",
      "Super Nintendo Chalmers, it fits!",
      "I'm candy on the inside!"
    ],
    filterSkip: [
      "I'm in danger!",
      "This job is too far, like the moon!",
      "Me fail English? That's unpossible!",
      "That's where I saw the leprechaun. He tells me to burn things.",
      "Oh boy, a skip! I'm helping by doing nothing!"
    ],
    scoreLow: [
      "I bent my wookie.",
      "And I'm a gold star!",
      "Oh boy, sleep! That's where I'm a viking!",
      "My nose is bleeding from the thinking."
    ],
    scoreHigh: [
      "Yay! I'm winning!",
      "The doctor said I wouldn't have so many nosebleeds if I kept my finger out of there.",
      "It tastes like burning!",
      "I'm a unitard!"
    ],
    complete: [
      "Super Nintendo Chalmers!",
      "I did it! I'm a helper!",
      "And the doctor said my sugar level is too high!",
      "Everyone is hugging!"
    ]
  };

  const getRandomRalphQuote = (category: keyof typeof RALPH_QUOTES): string => {
    const list = RALPH_QUOTES[category];
    return list[Math.floor(Math.random() * list.length)];
  };

  // Manual fast add of custom job listing structure (user input testing)
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualForm, setManualForm] = useState({
    title: '',
    company: '',
    location: 'Remote',
    salary: 'Not Specified',
    type: 'Full-Time' as JobTypeType,
    isW2: true,
    description: '',
    url: '',
  });

  const getMatchColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-950/40 border-emerald-500/20';
    if (score >= 60) return 'text-amber-400 bg-amber-950/40 border-amber-500/20';
    return 'text-slate-400 bg-slate-900 border-white/5';
  };

  const formatTimestamp = (ts: string | undefined) => {
    if (!ts) return 'Recent';
    const parsed = Date.parse(ts);
    if (!isNaN(parsed) && ts.length > 8) {
      try {
        return new Date(ts).toLocaleString([], { 
          hour: '2-digit', 
          minute: '2-digit', 
          month: 'short', 
          day: 'numeric' 
        });
      } catch (e) {
        return ts;
      }
    }
    return ts;
  };

  const executeScan = async () => {
    if (!profile.rawText) {
      setScanMessage("Please paste or parse a resume first from the profile section!");
      return;
    }

    setIsAiRunning(true);
    setScanMessage(null);
    setExpandedJobId(null);
    onScanStarted();
    clearAiLogs();

    const log = (msg: string, quoteCategory?: keyof typeof RALPH_QUOTES) => {
      let finalMsg = msg;
      if (ralphMode && quoteCategory) {
        finalMsg = `[Ralph: "${getRandomRalphQuote(quoteCategory)}"] ${msg}`;
      }
      addAiLog(finalMsg);
    };

    log("JobScanner: Initiated sequential verification loop.", "fetch");
    if (lastRunTime) {
      log(`Previous scan checkpoint detected (${lastRunTime}). Filtering matching incremental roles.`, "fetch");
    }

    log(`Contacting backend to source matching listings for roles: ${(profile.targetRoles || []).join(', ') || 'General Software Engineering'}...`, "fetch");

    try {
      const mappedDismissed = dismissedJobKeys.map(key => {
        const [company, title] = key.split('|');
        return { company: company || '', title: title || '' };
      });

      // 1. Phase 1: Source
      log("Phase 1: Sourcing listings from Greenhouse, Lever, Workday, SmartRecruiters, RemoteOK, and search feeds...", "fetch");
      const sourceResponse = await fetch('/api/jobs/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRoles: profile.targetRoles,
          skills: profile.parsedSkills,
          searchLocation: profile.searchLocation,
          prefersRemote: profile.prefersRemote,
          prefersHybrid: profile.prefersHybrid,
          prefersOnSite: profile.prefersOnSite,
          yearsOfExperience: profile.yearsOfExperience,
          savedJobs: [
            ...savedJobs,
            ...watchlist,
            ...mappedDismissed
          ],
        }),
      });

      if (!sourceResponse.ok) {
        throw new Error(await sourceResponse.text() || "Sourcing phase failed.");
      }

      const sourceData = await sourceResponse.json();
      const rawJobs = Array.isArray(sourceData) ? sourceData : (sourceData.jobs || []);
      const warnings = (!Array.isArray(sourceData) && sourceData.warnings) ? sourceData.warnings : [];
      const stats = (!Array.isArray(sourceData) && sourceData.sourcingStats) ? sourceData.sourcingStats : null;
      
      // Log health check warnings
      if (warnings.length > 0) {
        warnings.forEach((warn: string) => log(warn, "filterSkip"));
      }

      // Log detailed sourcing stats
      if (stats) {
        log(`[Event Logs] Sourcing sites summary:`, "fetch");
        if (stats.greenhouse) log(`  - Greenhouse API: ${stats.greenhouse.count} jobs found (${stats.greenhouse.status})`, "fetch");
        if (stats.lever) log(`  - Lever API: ${stats.lever.count} jobs found (${stats.lever.status})`, "fetch");
        if (stats.workday) log(`  - Workday API (F500): ${stats.workday.count} jobs found (${stats.workday.status})`, "fetch");
        if (stats.smartrecruiters) log(`  - SmartRecruiters API: ${stats.smartrecruiters.count} jobs found (${stats.smartrecruiters.status})`, "fetch");
        if (stats.remoteok) log(`  - RemoteOK API: ${stats.remoteok.count} jobs found (${stats.remoteok.status})`, "fetch");
        if (stats.websearch) log(`  - Web Search Grounding: ${stats.websearch.count} jobs found`, "fetch");
      }

      log(`Sourcing complete. Found ${rawJobs.length} potential matching jobs. Starting sequential evaluation.`, "filterMatch");

      if (rawJobs.length === 0) {
        log("No new jobs matching filters found in this window.", "filterSkip");
        setIsAiRunning(false);
        return;
      }

      const experienceContext = (profile.yearsOfExperience || 0) > 0
        ? `Candidate has ${profile.yearsOfExperience} years of experience. Apply rules for scoring:
           1. OVERQUALIFIED (job requires LESS than candidate's years): Always acceptable — do NOT reduce matchScore for being overqualified. A candidate with ${profile.yearsOfExperience} yrs applying to a job requiring 2 yrs is a perfectly valid match.
           2. CLOSE MATCH (job requires up to ${profile.yearsOfExperience + 2} yrs): Fully acceptable — score normally with no penalty.
           3. EXCEEDING EXPERIENCE (job requires MORE than ${profile.yearsOfExperience + 2} yrs, e.g. 6+ years): You MUST assign a matchScore of 0 and note "Experience Mismatch: Requires X years, candidate has ${profile.yearsOfExperience} years" in the matchReason.`
        : 'Candidate has not specified their years of experience — do not penalise based on experience requirements in either direction.';

      const fullyScoredJobs: Job[] = [];
      let duplicatesSkipped = 0;

      // Pre-evaluation filtering duplicate helper
      const getDuplicateStatus = (job: any) => {
        const titleL = job.title.toLowerCase().trim();
        const companyL = job.company.toLowerCase().trim();
        
        // 1. Check title + company
        const inSaved = savedJobs.some(s => s.title.toLowerCase().trim() === titleL && s.company.toLowerCase().trim() === companyL);
        if (inSaved) return { isDup: true, reason: "Already saved in Board" };
        
        const inWatchlist = watchlist.some(w => w.title.toLowerCase().trim() === titleL && w.company.toLowerCase().trim() === companyL);
        if (inWatchlist) return { isDup: true, reason: "Already in Watchlist" };
        
        const key = `${companyL}|${titleL}`;
        if (dismissedJobKeys.includes(key)) return { isDup: true, reason: "Dismissed / Blocked" };
        
        const inAlreadyScored = fullyScoredJobs.some(j => j.title.toLowerCase().trim() === titleL && j.company.toLowerCase().trim() === companyL);
        if (inAlreadyScored) return { isDup: true, reason: "Already evaluated in this scan batch" };

        // 2. Check URL (normalized)
        const normUrl = normalizeJobUrl(job.url || '');
        const urlMatch = (item: any) => normalizeJobUrl(item.url || '') === normUrl;
        
        if (savedJobs.some(urlMatch)) return { isDup: true, reason: "URL already saved in Board" };
        if (watchlist.some(urlMatch)) return { isDup: true, reason: "URL already saved in Watchlist" };
        if (fullyScoredJobs.some(urlMatch)) return { isDup: true, reason: "URL already evaluated in this scan batch" };

        // 3. Check Job Number/ID (if extracted)
        const jobNo = extractJobNumber(job.url || '');
        if (jobNo) {
          const idMatch = (item: any) => {
            const itemNo = extractJobNumber(item.url || '');
            return itemNo && itemNo === jobNo;
          };
          if (savedJobs.some(idMatch)) return { isDup: true, reason: `Job ID #${jobNo} already saved in Board` };
          if (watchlist.some(idMatch)) return { isDup: true, reason: `Job ID #${jobNo} already in Watchlist` };
          if (fullyScoredJobs.some(idMatch)) return { isDup: true, reason: `Job ID #${jobNo} already evaluated in this scan batch` };
        }

        return { isDup: false, reason: "" };
      };

      for (let i = 0; i < rawJobs.length; i++) {
        const rawJob = rawJobs[i];
        const jobNo = extractJobNumber(rawJob.url || '');
        const jobNoStr = jobNo ? ` (ID: ${jobNo})` : '';

        // 1. Check duplicate BEFORE calling LLM
        const dupCheck = getDuplicateStatus(rawJob);
        if (dupCheck.isDup) {
          log(
            `[Job ${i + 1}/${rawJobs.length}] Skipped: "${rawJob.title}" at ${rawJob.company}${jobNoStr} is a duplicate. Reason: ${dupCheck.reason}.`,
            "filterSkip"
          );
          duplicatesSkipped++;
          continue;
        }

        // 2. Check company limit BEFORE calling LLM
        const companyKey = rawJob.company.toLowerCase().trim();
        const currentCompanyCount = [...scannedJobs, ...fullyScoredJobs].filter(j => j.company.toLowerCase().trim() === companyKey).length;
        const maxPerCompany = profile.maxMatchesPerCompany || 3;
        
        if (profile.limitCompanyMatches && currentCompanyCount >= maxPerCompany) {
          log(
            `[Job ${i + 1}/${rawJobs.length}] Skipped: Limit of ${maxPerCompany} positions reached for "${rawJob.company}". Excluded before LLM query.`,
            "filterSkip"
          );
          continue;
        }

        // 3. Check board capacity BEFORE calling LLM
        const currentTotalCount = [...scannedJobs, ...fullyScoredJobs].length;
        const capacityLimit = profile.maxDiscoveredJobs || 30;
        
        if (currentTotalCount >= capacityLimit) {
          log(
            `[Job ${i + 1}/${rawJobs.length}] Skipped: Discover board capacity reached (${capacityLimit} slots). Halting scan before LLM query.`,
            "filterSkip"
          );
          setIsAiRunning(false);
          return;
        }

        // 4. All pre-evaluation filters passed, run LLM Evaluation
        log(`[Job ${i + 1}/${rawJobs.length}] Evaluating "${rawJob.title}" at ${rawJob.company}${jobNoStr} (Source: ${rawJob.source})...`, "fetch");

        try {
          const evalRes = await fetch('/api/jobs/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              job: rawJob,
              rawText: profile.rawText,
              experienceContext,
              llmConfig,
              searchLocation: profile.searchLocation || '',
              prefersRemote: profile.prefersRemote,
              prefersHybrid: profile.prefersHybrid,
              prefersOnSite: profile.prefersOnSite !== false
            }),
          });

          if (!evalRes.ok) {
            throw new Error(`HTTP ${evalRes.status}`);
          }

          const scoredJob: Job = await evalRes.json();
          
          const minScore = profile.minMatchScore || 70;
          const isBelowThreshold = scoredJob.matchScore < minScore;
          
          if (isBelowThreshold) {
            log(
              `[Job ${i + 1}/${rawJobs.length}] Skipped: Match Score ${scoredJob.matchScore}% is below minimum threshold ${minScore}%. Reason: ${scoredJob.matchReason || 'Low match score.'}`,
              "scoreLow"
            );
          } else {
            // Live safety check (just in case count changed in async gap)
            const liveCompanyCount = [...scannedJobs, ...fullyScoredJobs].filter(j => j.company.toLowerCase().trim() === companyKey).length;
            const liveTotalCount = [...scannedJobs, ...fullyScoredJobs].length;
            
            if (profile.limitCompanyMatches && liveCompanyCount >= maxPerCompany) {
              log(
                `[Job ${i + 1}/${rawJobs.length}] Excluded: Match Score was ${scoredJob.matchScore}%, but company limit of ${maxPerCompany} reached for "${scoredJob.company}".`,
                "filterSkip"
              );
            } else if (liveTotalCount >= capacityLimit) {
              log(
                `[Job ${i + 1}/${rawJobs.length}] Excluded: Match Score was ${scoredJob.matchScore}%, but discovered board is full (${capacityLimit} slots).`,
                "filterSkip"
              );
            } else {
              log(
                `[Job ${i + 1}/${rawJobs.length}] Added: "${scoredJob.title}" (${scoredJob.company}) matched! Score: ${scoredJob.matchScore}% (Threshold: ${minScore}%). Reason: ${scoredJob.matchReason}`,
                "scoreHigh"
              );
              fullyScoredJobs.push(scoredJob);
              
              // Update state in real-time
              setScannedJobs(prev => {
                const combined = [scoredJob, ...prev];
                const unique: Job[] = [];
                const seen = new Set<string>();
                const companyCounts = new Map<string, number>();
                const maxPerCompany = profile.maxMatchesPerCompany || 3;
                combined.sort((a, b) => b.matchScore - a.matchScore);
                for (const job of combined) {
                  const k = `${job.title.toLowerCase()}|${job.company.toLowerCase()}`;
                  const companyKey = job.company.toLowerCase().trim();
                  if (!seen.has(k)) {
                    if (profile.limitCompanyMatches) {
                      const currentCount = companyCounts.get(companyKey) || 0;
                      if (currentCount >= maxPerCompany) continue;
                      companyCounts.set(companyKey, currentCount + 1);
                    }
                    seen.add(k);
                    unique.push(job);
                  }
                }
                const limit = profile.maxDiscoveredJobs || 30;
                return unique.slice(0, limit);
              });
            }
          }

        } catch (itemErr: any) {
          log(`[Job ${i + 1}/${rawJobs.length}] Evaluation failed: ${itemErr.message || itemErr}. Skipping.`, "filterSkip");
        }

        // Delay between iterations (e.g. 1.2 seconds) to slow it down and create the deliberate verification effect
        if (i < rawJobs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
      }

      log(`Deliberate verification loop completed. Processed ${fullyScoredJobs.length} successfully!`, "complete");
      
      const finishTime = new Date().toLocaleString();
      setLastRunTime(finishTime);
      localStorage.setItem('job_agent_last_run_time', finishTime);
      localStorage.setItem('job_agent_last_run_timestamp', String(Date.now()));
      
      // Update stats
      onUpdateStats(fullyScoredJobs.length, duplicatesSkipped);

    } catch (err: any) {
      log(`Sequential scan failed: ${err.message}.`, "filterSkip");
    } finally {
      setIsAiRunning(false);
    }
  };

  // Toggle saving to tracking board
  const handleSaveToTracker = (job: Job) => {
    const addedJob = {
      ...job,
      status: 'applied' as JobStatusType,
      appliedDate: new Date().toISOString(),
      notes: customNote || 'Saved from AI Agent discovery list'
    };
    
    onAddJobs([addedJob]);
    setCustomNote('');

    // If it was in the watchlist, remove it
    onRemoveFromWatchlist(job.id);

    // Remove from scannedJobs memory since it is applied
    setScannedJobs(prev => prev.filter(item => item.id !== job.id));
  };

  const handleSaveToWatchlist = (job: Job) => {
    const addedJob = {
      ...job,
      status: 'discovered' as JobStatusType,
      notes: customNote || 'Added manually to Watchlist'
    };
    
    onAddToWatchlist([addedJob]);
    setCustomNote('');

    // Remove from scannedJobs memory since it is in watchlist
    setScannedJobs(prev => prev.filter(item => item.id !== job.id));
  };

  const handleDismissJob = (id: string) => {
    const jobToDismiss = scannedJobs.find(j => j.id === id);
    if (jobToDismiss) {
      onDismissJob(jobToDismiss.company, jobToDismiss.title);
    }
    setScannedJobs(prev => prev.filter(j => j.id !== id));
  };

  // Background timer for Auto-Scanning
  useEffect(() => {
    if (!profile.autoScanInterval || profile.autoScanInterval <= 0) {
      setSecondsRemaining(null);
      return;
    }

    const intervalMs = profile.autoScanInterval * 60 * 60 * 1000;

    const checkTimer = () => {
      const lastRunTs = Number(localStorage.getItem('job_agent_last_run_timestamp')) || 0;
      const now = Date.now();
      
      // Check if never run or has exceeded the interval since the last scan checkpoint
      const hasExceededInterval = lastRunTs === 0 || (now - lastRunTs >= intervalMs);

      if (hasExceededInterval) {
        // Run the scan immediately
        localStorage.setItem('job_agent_last_run_timestamp', String(now));
        setSecondsRemaining(Math.ceil(intervalMs / 1000));
        
        if (!isAiRunning) {
          if (profile.rawText) {
            executeScan();
          } else {
            addAiLog("JobScanner: Auto-scan skipped because resume profile is empty.");
          }
        }
      } else {
        const target = lastRunTs + intervalMs;
        const remainingSecs = Math.ceil((target - now) / 1000);
        setSecondsRemaining(Math.max(0, remainingSecs));
      }
    };

    // Run check immediately
    checkTimer();

    const intervalId = setInterval(checkTimer, 1000);
    return () => clearInterval(intervalId);
  }, [profile.autoScanInterval, profile.rawText, lastRunTime, isAiRunning]);

  // Trigger scan when shouldTriggerScan is true (e.g. from prompt banner)
  useEffect(() => {
    if (shouldTriggerScan && !isAiRunning) {
      onScanTriggered();
      executeScan();
    }
  }, [shouldTriggerScan, isAiRunning]);

  const formatCountdown = (seconds: number | null) => {
    if (seconds === null) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const manualJob: Job = {
      id: `manual-add-${Date.now()}`,
      title: manualForm.title,
      company: manualForm.company,
      location: manualForm.location,
      salary: manualForm.salary,
      type: manualForm.type,
      isW2: manualForm.isW2,
      description: manualForm.description,
      url: manualForm.url || '#',
      postedAt: 'Just now',
      matchScore: 95,
      matchReason: 'Manually logged position.',
      isDuplicate: savedJobs.some(s => 
        s.title.toLowerCase() === manualForm.title.toLowerCase() && 
        s.company.toLowerCase() === manualForm.company.toLowerCase()
      ),
      status: 'applied',
      appliedDate: new Date().toISOString(),
      scannedAt: new Date().toISOString(),
      isUrlVerified: true
    };

    onAddJobs([manualJob]);
    setShowManualAdd(false);
    setManualForm({
      title: '',
      company: '',
      location: 'Remote',
      salary: 'Not Specified',
      type: 'Full-Time',
      isW2: true,
      description: '',
      url: '',
    });
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
          <button
            onClick={executeScan}
            disabled={isAiRunning || !profile.rawText}
            className="px-6 py-2.5 rounded-xl bg-indigo-650 hover:bg-indigo-700 text-white font-semibold text-sm transition-all shadow-md shadow-indigo-500/15 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {isAiRunning ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Scanning Jobs...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                Launch Match Scan
              </>
            )}
          </button>
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
              <span className={`w-3 h-3 rounded-full ${isAiRunning ? "bg-indigo-500 animate-ping" : secondsRemaining !== null ? "bg-indigo-400 animate-pulse" : "bg-emerald-500"}`} />
              <span className="text-sm font-bold text-slate-100 uppercase tracking-tight">
                {isAiRunning ? "Executing Task..." : secondsRemaining !== null ? "Auto-Scan Active" : "Instance Idle"}
              </span>
            </div>
            {isAiRunning ? (
              <span className="text-[10px] block text-indigo-400 font-medium leading-none animate-pulse">Running match iterations...</span>
            ) : secondsRemaining !== null ? (
              <span className="text-[10px] block text-indigo-400 font-medium font-mono leading-none">
                Next scan in: {formatCountdown(secondsRemaining)}
              </span>
            ) : null}
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center text-slate-400">
            <Sparkles className={`w-5 h-5 ${isAiRunning ? "text-indigo-400 animate-spin" : secondsRemaining !== null ? "text-indigo-400 animate-pulse" : "text-emerald-450"}`} />
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
      <div className="bg-slate-950/80 p-5 rounded-2xl border border-white/5 shadow-inner" id="ai-telemetering-logs">
        <div className="text-slate-400 border-b border-white/5 pb-2 mb-3.5 font-bold flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isAiRunning ? "bg-indigo-500 animate-ping" : "bg-emerald-500"}`} />
            <span className="tracking-wider uppercase font-display">EVENT LOGS</span>
          </div>
          <div className="flex items-center gap-2 animate-fade-in font-sans">
            <button
              onClick={() => setRalphMode(!ralphMode)}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 shadow-sm ${
                ralphMode 
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20' 
                  : 'bg-slate-900 text-slate-400 border-white/10 hover:text-slate-200 hover:bg-slate-850'
              }`}
              title="Toggle Ralph Wiggum funny quote commentary event logs"
            >
              🍌 Ralph Mode: {ralphMode ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={clearAiLogs}
              className="text-[10px] font-bold px-3 py-1.5 rounded-lg border border-white/10 bg-slate-900 text-slate-400 hover:text-rose-450 hover:border-rose-500/25 hover:bg-slate-850 transition-all cursor-pointer shadow-sm"
              title="Clear all event logs from history"
            >
              Clear Logs
            </button>
          </div>
        </div>
        <div className="font-mono text-[11px] text-slate-300 space-y-1.5 max-h-44 overflow-y-auto leading-relaxed pr-2 flex flex-col-reverse">
          {aiLogs.length === 0 ? (
            <div className="text-slate-600 italic py-2">No events logged yet. Try parsing or scanning to generate log streams.</div>
          ) : (
            aiLogs.map((log, idx) => {
              const hasColor = log.includes("Error") || log.includes("failed");
              const hasSuccess = log.includes("successful") || log.includes("analyzed") || log.includes("Success") || log.includes("completed");
              return (
                <div key={idx} className="flex gap-2.5 items-start">
                  <span className="text-slate-650 opacity-40 select-none shrink-0">&gt;</span>
                  <span className={hasColor ? "text-rose-400 font-medium" : hasSuccess ? "text-emerald-400 font-medium" : "text-slate-300"}>
                    {log}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Manual Entry Modal Dialog */}
      {showManualAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="sleek-card-darker rounded-2xl border border-white/10 shadow-2xl max-w-lg w-full p-6 relative">
            <button 
              onClick={() => setShowManualAdd(false)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-1.5 font-display">
              <FileSpreadsheet className="w-5 h-5 text-indigo-400" /> Log Position into Tracker
            </h3>
            <form onSubmit={handleManualAdd} className="space-y-4 text-left font-sans">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-450 mb-1">Company</label>
                  <input
                    type="text"
                    required
                    value={manualForm.company}
                    onChange={(e) => setManualForm({ ...manualForm, company: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                    placeholder="Stripe"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-450 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={manualForm.title}
                    onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                    placeholder="Frontend Engineer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-450 mb-1">Location</label>
                  <input
                    type="text"
                    value={manualForm.location}
                    onChange={(e) => setManualForm({ ...manualForm, location: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                    placeholder="Remote/NYC"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-450 mb-1">Compensation</label>
                  <input
                    type="text"
                    value={manualForm.salary}
                    onChange={(e) => setManualForm({ ...manualForm, salary: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                    placeholder="e.g. $120k or $90/hr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-450 mb-1">Contract Schema</label>
                  <select
                    value={manualForm.type}
                    onChange={(e) => setManualForm({ ...manualForm, type: e.target.value as any })}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900 border border-white/10 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="Full-Time" className="bg-slate-950">Full-Time</option>
                    <option value="Contract" className="bg-slate-950">Contract</option>
                    <option value="Part-Time" className="bg-slate-950">Part-Time</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="manual-w2"
                    checked={manualForm.isW2}
                    onChange={(e) => setManualForm({ ...manualForm, isW2: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600 rounded bg-slate-900 border-white/10"
                  />
                  <label htmlFor="manual-w2" className="text-xs font-semibold text-slate-400 select-none cursor-pointer">
                    W2 structure setup
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-450 mb-1">Application URL</label>
                <input
                  type="url"
                  value={manualForm.url}
                  onChange={(e) => setManualForm({ ...manualForm, url: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-450 mb-1">Short Description</label>
                <textarea
                  value={manualForm.description}
                  onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                  className="w-full h-20 px-3 py-2 text-sm rounded-lg bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none placeholder-slate-650"
                  placeholder="Core tech required..."
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-indigo-650 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/10"
              >
                Log to Pipeline
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 🧭 Watchlist (Distinct List of Saved Jobs for review at own pace) */}
      {watchlist.length > 0 && (
        <div className="space-y-4 p-5 rounded-2xl border border-dashed border-indigo-500/20 bg-indigo-950/5" id="personal-watchlist-panel">
          <div className="flex justify-between items-center px-1">
            <span className="text-xs uppercase font-bold tracking-wider text-indigo-400 font-display flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span> My Saved Watchlist ({watchlist.length} Jobs Ready to Decipher)
            </span>
            <span className="text-xs text-indigo-350/80 font-mono">Review & apply at your own pace</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {watchlist.map((wJob) => (
              <div key={wJob.id} className="p-4 rounded-xl bg-slate-900/80 border border-white/5 shadow-md hover:border-indigo-500/10 transition-all flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-950 text-slate-400 font-mono">
                        {wJob.type}
                      </span>
                      {wJob.isUrlVerified ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 shrink-0">
                          <Check className="w-2.5 h-2.5 text-emerald-450" /> Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-950/45 border border-amber-500/20 text-amber-400 shrink-0">
                          <AlertTriangle className="w-2.5 h-2.5 text-amber-450" /> Unverified
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => onRemoveFromWatchlist(wJob.id)}
                      className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-rose-450 transition-colors"
                      title="Remove from Watchlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <h4 className="text-sm font-bold text-white tracking-tight">{wJob.title}</h4>
                  <p className="text-xs text-slate-400 font-semibold">{wJob.company} · <span className="text-slate-500 font-normal">{wJob.location}</span></p>
                  {wJob.salary && <p className="text-[11px] text-slate-500 font-mono">{wJob.salary}</p>}
                  <p className="text-xs text-slate-350 line-clamp-2 leading-relaxed">{wJob.description}</p>
                </div>

                <div className="flex gap-2 pt-1 border-t border-white/5">
                  <a
                    href={wJob.url}
                    target="_blank"
                    referrerPolicy="no-referrer"
                    className="flex-1 text-center py-2 rounded-lg bg-slate-950 text-slate-300 font-bold text-xs hover:text-white transition-colors flex items-center justify-center gap-1 border border-white/5"
                  >
                    <ExternalLink className="w-3 h-3" /> View Posting
                  </a>
                  <button
                    onClick={() => handleSaveToTracker(wJob)}
                    className="flex-1 py-2 rounded-lg bg-indigo-650 hover:bg-indigo-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-1"
                  >
                    <FileCheck className="w-3.5 h-3.5" /> Log Applied
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scanning Match Results display cards */}
      {scannedJobs.length > 0 && (
        <div className="space-y-4" id="scanned-matches-list">
          <div className="flex justify-between items-center px-1">
            <span className="text-xs uppercase font-bold tracking-wider text-indigo-400 font-display">Discovered Postings</span>
            <span className="text-xs text-slate-400 font-mono">
              {scannedJobs.length} / {profile.maxDiscoveredJobs || 30} slots used
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {scannedJobs.map((job) => {
              const isExpanded = expandedJobId === job.id;
              
              return (
                <div
                  key={job.id}
                  className={`sleek-card rounded-2xl transition-all overflow-hidden border border-white/10 ${
                    job.isDuplicate 
                      ? 'opacity-65' 
                      : 'shadow-md hover:border-indigo-500/25 shadow-black/10'
                  }`}
                >
                  <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2 flex-grow">
                      {/* Duplicate banner trigger */}
                      {job.isDuplicate && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-950/45 border border-amber-500/15">
                          <AlertTriangle className="w-3.5 h-3.5" /> Already Applied / Saved (Duplicate Prevented)
                        </span>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-white font-display tracking-tight">
                          {job.title}
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getMatchColor(job.matchScore)} shrink-0`}>
                          {job.matchScore}% Match
                        </span>
                        {job.isUrlVerified ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 shrink-0" title="This link has been validated as an active direct application page.">
                            <Check className="w-3.5 h-3.5 text-emerald-450" /> Link Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/45 border border-amber-500/20 text-amber-400 shrink-0" title="This link was not automatically validated as a direct application page. Exercise caution.">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-450" /> Link Unverified
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-400">
                        <span className="text-slate-200">{job.company}</span>
                        <span className="flex items-center gap-1 font-normal text-slate-500">
                          <MapPin className="w-3.5 h-3.5 stroke-[1.5]" /> {job.location}
                        </span>
                        {job.salary && (
                          <span className="flex items-center gap-1 font-normal text-slate-500">
                            <DollarSign className="w-3.5 h-3.5 stroke-[1.5]" /> {job.salary}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-white/5 text-slate-300 text-[10px]">
                          {job.type} {job.isW2 && '· W2'}
                        </span>
                      </div>

                      <p className="text-sm text-slate-350 leading-relaxed font-sans line-clamp-2">
                        {job.description}
                      </p>

                      {job.skillsRequired && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {job.skillsRequired.map((s, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 bg-slate-900/60 text-slate-400 rounded border border-white/5 font-mono">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 text-right">
                      <span className="text-[10px] text-slate-500 font-medium font-mono" title="Original posting date">
                        Posted: {formatTimestamp(job.postedAt)}
                      </span>
                      {job.scannedAt && (
                        <span className="text-[10px] text-indigo-400 font-semibold font-mono" title="Time when this agent discovered the job">
                          Found: {new Date(job.scannedAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      
                      <button
                        onClick={() => handleDismissJob(job.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-950/30 text-slate-550 hover:text-rose-450 transition-colors mt-1"
                        title="Dismiss Job Listing"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Matching Details & Actions */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-white/5 pt-4 bg-slate-900/30 space-y-4">
                      {job.description && (
                        <div className="p-3.5 bg-slate-900/80 border border-white/10 rounded-xl space-y-1.5">
                          <span className="text-[10px] uppercase font-bold text-indigo-400 flex items-center gap-1.5 font-display">
                            <Briefcase className="w-3.5 h-3.5 text-indigo-400" /> Full Position Description
                          </span>
                          <p className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">{job.description}</p>
                        </div>
                      )}

                      {job.matchReason && (
                        <div className="p-3.5 bg-slate-900/80 border border-white/10 rounded-xl space-y-1">
                          <span className="text-[10px] uppercase font-bold text-slate-450 flex items-center gap-1.5 font-display">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Grounded Agent Score Matching Reason
                          </span>
                          <p className="text-xs text-slate-300 leading-normal font-sans">{job.matchReason}</p>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <a
                          href={job.url}
                          target="_blank"
                          referrerPolicy="no-referrer"
                          className="text-xs font-semibold text-slate-200 border border-white/10 bg-slate-900/80 hover:bg-slate-850 px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all w-full sm:w-auto justify-center"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Read Posting Link
                        </a>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          {job.isDuplicate ? (
                            <button
                              disabled
                              className="px-5 py-2.5 rounded-xl border border-white/5 bg-slate-800/40 text-slate-550 font-medium text-xs w-full sm:w-auto flex items-center justify-center gap-1.5 cursor-not-allowed"
                            >
                              <UserCheck className="w-4 h-4" /> Locked Duplicate (Already Saved)
                            </button>
                          ) : (
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                              <input
                                type="text"
                                value={customNote}
                                onChange={(e) => setCustomNote(e.target.value)}
                                placeholder="Add custom notes..."
                                className="px-3 py-2 text-xs rounded-xl border border-white/10 bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white placeholder-slate-650 flex-grow"
                              />
                              <button
                                onClick={() => handleSaveToWatchlist(job)}
                                className="px-4 py-2.5 rounded-xl border border-indigo-500/20 text-indigo-400 font-semibold text-xs hover:bg-indigo-950/20 transition-all shrink-0 flex items-center justify-center gap-1.5"
                              >
                                <Bookmark className="w-3.5 h-3.5" /> Save to Watchlist
                              </button>
                              <button
                                onClick={() => handleSaveToTracker(job)}
                                className="px-5 py-2.5 rounded-xl bg-indigo-650 hover:bg-indigo-700 text-white font-semibold text-xs transition-all shadow-md shadow-indigo-500/10 shrink-0 flex items-center justify-center gap-1.5"
                              >
                                <FileCheck className="w-4 h-4" /> Log Applied Submission
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bottom Expand Toggle Bar */}
                  <button
                    onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                    className="w-full py-2.5 bg-slate-900/20 hover:bg-slate-900/60 text-slate-400 hover:text-slate-200 text-[11px] font-bold border-t border-white/5 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4" /> Collapse Match Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" /> Expand Details & Match Reasoning
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
