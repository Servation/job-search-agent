/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Job, PreventedDuplicate } from '../src/types';
import { globalState, addRefinerLog, REFINER_INTERVAL_MS } from './config';
import { readDb, writeDb } from './db';
import { 
  extractRoleKeywords, 
  checkDescriptionLocationMismatch, 
  appendRemainingDescription, 
  getDomain, 
  fetchJobHtml 
} from './utils';
import { scoreCommunityJobs, queryCustomLLMAdaptive } from './llm';
import { 
  fetchGreenhouseJobs, 
  fetchLeverJobs, 
  fetchAshbyJobs,
  fetchSmartRecruitersJobs,
  fetchWorkdayViaSearchGrounding, 
  checkSourceHealth,
  updateCompanyDirectoriesFromRegistry,
  RawCommunityJob,
  harvestWorkdayUrl,
  validateWorkdayHost
} from './sourcing';

let refinerTimer: NodeJS.Timeout | null = null;

export async function runBackgroundSourcing(isManual = false): Promise<PreventedDuplicate[]> {
  if (globalState.isSourcingActive) {
    console.log(isManual ? '[Search Agent] Manual search skipped: Another scan is already active.' : '[Refiner] Background sourcing check skipped: Another scan is already active.');
    return [];
  }
  globalState.isSourcingActive = true;
  try {
    const db = readDb();
  if (!db.profile || !db.profile.rawText) {
    const skipMsg = isManual 
      ? 'Search Agent skipped: Profile not configured.'
      : '[Refiner] Background sourcing skipped: Profile not configured.';
    console.log(skipMsg);
    return [];
  }

  const matchedCapacity = db.profile.maxDiscoveredJobs || 30;
  const unmatchedCapacity = 100;
  
  const matchedCount = db.scannedJobs.filter(j => j.isFullDescriptionFetched).length;
  const unmatchedCount = db.scannedJobs.length - matchedCount;

  if (matchedCount >= matchedCapacity) {
    const skipMsg = isManual
      ? `Search Agent skipped: Matched jobs board is already at capacity (${matchedCount}/${matchedCapacity} jobs).`
      : `[Refiner] Background sourcing skipped: Matched jobs board is already at capacity (${matchedCount}/${matchedCapacity} jobs).`;
    console.log(skipMsg);
    return [];
  }
  
  if (unmatchedCount >= unmatchedCapacity) {
    const skipMsg = isManual
      ? `Search Agent skipped: Unmatched pending queue is full (${unmatchedCount}/${unmatchedCapacity} jobs).`
      : `[Refiner] Background sourcing skipped: Unmatched pending queue is full (${unmatchedCount}/${unmatchedCapacity} jobs).`;
    console.log(skipMsg);
    return [];
  }

  const preventedDuplicates: PreventedDuplicate[] = [];

  const startLog = isManual
    ? 'Search Agent: Starting manual scan for new postings...'
    : 'Refiner: Starting background job check for new postings...';
  console.log(isManual ? '[Search Agent] Running manual job sourcing check...' : '[Refiner] Running periodic background job sourcing check...');
  addRefinerLog(startLog);

  const roleKeywords = extractRoleKeywords(db.profile.targetRoles);
  const targetRoles = db.profile.targetRoles || [];
  const searchLocation = db.profile.searchLocation || 'United States';
  const prefersRemote = db.profile.prefersRemote !== false;
  const yearsOfExperience = db.profile.yearsOfExperience || 0;

  const health = await checkSourceHealth(searchLocation, prefersRemote);
  const [ghJobs, lvJobs, ashJobs, wdJobs] = await Promise.all([
    health.greenhouse ? fetchGreenhouseJobs(globalState.cachedGreenhouseSlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
    health.lever ? fetchLeverJobs(globalState.cachedLeverSlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
    health.ashby ? fetchAshbyJobs(globalState.cachedAshbySlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
    health.workday ? fetchWorkdayViaSearchGrounding(targetRoles, searchLocation) : Promise.resolve([]),
  ]);

  const raw: RawCommunityJob[] = [...ghJobs, ...lvJobs, ...ashJobs, ...wdJobs];
  addRefinerLog(`Refiner Sourced counts -> Greenhouse: ${ghJobs.length}, Lever: ${lvJobs.length}, Ashby: ${ashJobs.length}, Workday: ${wdJobs.length}`);
    
    if (!db.stats) {
      db.stats = { totalScanned: 0, duplicatesPrevented: 0, llmEvaluations: 0, totalSourced: 0 };
    }
    db.stats.totalSourced += raw.length;
    writeDb(db);
    
    if (!db.llmConfig) {
      console.log('[Refiner] Background sourcing: Missing LLM configuration. Skipping evaluation.');
      addRefinerLog('Refiner Warning: Skipping background job evaluations because LLM config is missing.');
      return [];
    }

    const experienceContext = yearsOfExperience > 0
      ? `Candidate has ${yearsOfExperience} years of experience. Filter rules:
         1. NO EXPERIENCE LIMITS: If the job description does NOT mention years of experience, or mentions requirements up to ${yearsOfExperience + 2} yrs: match score is based solely on skills.
         2. ACCEPTABLE RANGE (up to ${yearsOfExperience + 2} yrs): If the job requires up to ${yearsOfExperience + 2} years of experience (e.g. asking for 4 years when candidate has 3), it is acceptable. Assign matchScore normally.
         3. EXCEEDING EXPERIENCE (job requires MORE than ${yearsOfExperience + 2} yrs, e.g. 6+ years): You MUST assign a matchScore of 0 and note "Experience Mismatch: Requires X years, candidate has ${yearsOfExperience} years" in the matchReason.
         4. REQUIREMENT MISMATCH PENALTY: If the job description lists specific "Required", "Must-have", or "Basic Qualifications" skills (e.g. specific languages, frameworks, degrees) and the candidate's resume does NOT contain them, you must penalize the matchScore by deducting exactly 3 to 4 points.`
      : "Candidate is entry-level (0 years of experience). Avoid senior/lead/staff positions.";

    // Deduplicate against database and track company counts
    const seenKeys = new Set<string>();
    const candidates: RawCommunityJob[] = [];

    const companyCounts = new Map<string, number>();
    const maxPerCompany = db.profile.maxMatchesPerCompany || 3;
    const limitCompany = db.profile.limitCompanyMatches !== false;

    // Helper to normalize strings for comparison
    const cleanStr = (s: string) => s.toLowerCase().trim();

    // Populate initial company counts from database
    if (limitCompany) {
      const allActiveJobs = [...db.scannedJobs, ...db.watchlist, ...db.savedJobs];
      for (const j of allActiveJobs) {
        const comp = cleanStr(j.company);
        companyCounts.set(comp, (companyCounts.get(comp) || 0) + 1);
      }
    }

    // Group raw jobs by source for round-robin interleaving
    const jobsBySource: Record<string, RawCommunityJob[]> = {};
    for (const job of raw) {
      const source = job.source || 'unknown';
      if (!jobsBySource[source]) jobsBySource[source] = [];
      jobsBySource[source].push(job);
    }

    // Interleave circular-style to ensure source diversity
    const interleavedCandidates: RawCommunityJob[] = [];
    let hasMore = true;
    let round = 0;
    const activeSources = Object.keys(jobsBySource).sort((a, b) => jobsBySource[a].length - jobsBySource[b].length);

    while (hasMore) {
      hasMore = false;
      for (const src of activeSources) {
        const list = jobsBySource[src];
        if (round < list.length) {
          interleavedCandidates.push(list[round]);
          hasMore = true;
        }
      }
      round++;
    }

    // Filter interleaved candidates for duplicate checking and company limits before scoring
    for (const rJob of interleavedCandidates) {
      if (rJob.url) {
        harvestWorkdayUrl(rJob.url);
      }
      const titleL = cleanStr(rJob.title);
      const companyL = cleanStr(rJob.company);
      const uniqueKey = `${companyL}|${titleL}`;

      // 1. Check for duplicates in DB
      let reason = "";
      if (db.scannedJobs.some(j => cleanStr(j.title) === titleL && cleanStr(j.company) === companyL)) {
        reason = "Already Discovered";
      } else if (db.watchlist.some(j => cleanStr(j.title) === titleL && cleanStr(j.company) === companyL)) {
        reason = "Already in watchlist";
      } else if (db.savedJobs.some(j => cleanStr(j.title) === titleL && cleanStr(j.company) === companyL)) {
        reason = "Already in tracker";
      } else if (db.dismissedJobs.some(j => cleanStr(j.title) === titleL && cleanStr(j.company) === companyL)) {
        reason = "Already in dismissed list";
      } else if (seenKeys.has(uniqueKey)) {
        reason = "Duplicate in scan";
      }

      if (reason) {
        preventedDuplicates.push({
          id: `prevented-${rJob.source || 'unknown'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          title: rJob.title,
          company: rJob.company,
          location: rJob.location || 'Remote/Specified on Link',
          source: rJob.source || 'unknown',
          url: rJob.url,
          reason,
          scannedAt: new Date().toISOString()
        });
        continue;
      }

      // 2. Check blocked companies list
      const blockedCompanies = db.profile?.blockedCompanies || [];
      if (blockedCompanies.some(bc => cleanStr(bc) === companyL)) {
        preventedDuplicates.push({
          id: `prevented-${rJob.source || 'unknown'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          title: rJob.title,
          company: rJob.company,
          location: rJob.location || 'Remote/Specified on Link',
          source: rJob.source || 'unknown',
          url: rJob.url,
          reason: "Blocked Company",
          scannedAt: new Date().toISOString()
        });
        continue;
      }

      // 3. Check company match limits
      if (limitCompany) {
        const currentCount = companyCounts.get(companyL) || 0;
        if (currentCount >= maxPerCompany) {
          preventedDuplicates.push({
            id: `prevented-${rJob.source || 'unknown'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            title: rJob.title,
            company: rJob.company,
            location: rJob.location || 'Remote/Specified on Link',
            source: rJob.source || 'unknown',
            url: rJob.url,
            reason: "Company Limit Exceeded",
            scannedAt: new Date().toISOString()
          });
          continue;
        }
      }

      seenKeys.add(uniqueKey);
      candidates.push(rJob);
      if (limitCompany) {
        companyCounts.set(companyL, (companyCounts.get(companyL) || 0) + 1);
      }
    }

    if (candidates.length === 0) {
      const doneLog = isManual
        ? 'Search Agent: Sourcing check finished. No new unique jobs discovered.'
        : 'Refiner: Background job sourcing check finished. No new unique jobs discovered.';
      addRefinerLog(doneLog);
      console.log(isManual ? '[Search Agent] Sourcing ran: No new candidate jobs found.' : '[Refiner] Background sourcing ran: No new candidate jobs found.');
      const finalDb = readDb();
      if (!finalDb.stats) {
        finalDb.stats = { totalScanned: 0, duplicatesPrevented: 0, llmEvaluations: 0, totalSourced: 0 };
      }
      finalDb.stats.duplicatesPrevented += preventedDuplicates.length;
      writeDb(finalDb);
      return preventedDuplicates;
    }

    // Add all candidates directly to the Unmatched queue without LLM scoring
    const toAdd: Job[] = [];
    const freshDb = readDb();
    if (!freshDb.stats) {
      freshDb.stats = { totalScanned: 0, duplicatesPrevented: 0, llmEvaluations: 0, totalSourced: 0 };
    }
    freshDb.stats.duplicatesPrevented += preventedDuplicates.length;
    
    for (const rJob of candidates) {
      toAdd.push({
        id: `discovered-${rJob.source || 'unknown'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: rJob.title,
        company: rJob.company,
        location: rJob.location || 'Not specified',
        salary: 'Not specified',
        type: 'Unknown',
        isW2: true,
        description: '', // pending full fetch
        url: rJob.url,
        postedAt: rJob.postedAt || new Date().toISOString(),
        isDuplicate: false,
        status: 'discovered',
        scannedAt: new Date().toISOString(),
        isUrlVerified: true,
        isRemote: rJob.location?.toLowerCase().includes('remote') || false,
        skillsRequired: [],
        industry: 'Tech',
        experienceLevel: 'Not specified',
        salaryNum: 0,
        matchScore: 0,
        matchReason: 'Pending LLM Evaluation',
        sourceTag: rJob.source || 'unknown',
        retryTier: '1',
        isFullDescriptionFetched: false // Marks it as Unmatched
      });
    }

    if (toAdd.length > 0) {
      const unmatchedCapacity = 100;
      const unmatchedCount = freshDb.scannedJobs.filter(j => !j.isFullDescriptionFetched).length;
      const spaceLeft = unmatchedCapacity - unmatchedCount;
      const finalToAdd = toAdd.slice(0, Math.max(0, spaceLeft));
      
      if (toAdd.length > finalToAdd.length) {
        const skippedDueToCapacity = toAdd.slice(finalToAdd.length);
        for (const job of skippedDueToCapacity) {
          const capMsg = isManual
            ? `Search Agent: Skipped adding "${job.title}" at ${job.company} (Reason: Unmatched queue is full)`
            : `Refiner: Skipped candidate "${job.title}" at ${job.company} (Reason: Unmatched queue is full)`;
          addRefinerLog(capMsg);
        }
      }

      if (finalToAdd.length > 0) {
        // Unshift to put newest sourced jobs at the top of the unmatched queue
        freshDb.scannedJobs.unshift(...finalToAdd);
        freshDb.stats.totalScanned += finalToAdd.length;
        for (const job of finalToAdd) {
          const addLog = isManual
            ? `Search Agent: Sourced new raw job "${job.title}" at ${job.company}. Added to Unmatched Queue.`
            : `Refiner: Sourced new background job "${job.title}" at ${job.company}. Added to Unmatched Queue.`;
          addRefinerLog(addLog);
        }
        console.log(isManual
          ? `[Search Agent] Added ${finalToAdd.length} raw jobs to Unmatched queue.`
          : `[Refiner] Added ${finalToAdd.length} raw jobs to Unmatched queue.`
        );
      }
    } else {
      const doneLog = isManual
        ? 'Search Agent: Sourcing check finished. No new unique jobs found.'
        : 'Refiner: Background job sourcing check finished. No new unique jobs found.';
      addRefinerLog(doneLog);
      console.log(isManual
        ? '[Search Agent] Sourcing ran: No new jobs added.'
        : '[Refiner] Background sourcing ran: No new jobs added.'
      );
    }
    
    writeDb(freshDb);
    return preventedDuplicates;
  } catch (err: any) {
    const errorLog = isManual
      ? `Search Agent Warning: Sourcing failed: ${err.message}`
      : `Refiner Warning: Background sourcing failed: ${err.message}`;
    addRefinerLog(errorLog);
    console.warn(isManual ? '[Search Agent] Sourcing failed:' : '[Refiner] Background sourcing failed:', err.message);
    return [];
  } finally {
    globalState.isSourcingActive = false;
  }
}

export async function runLinkAuditCycle() {
  const db = readDb();
  const allAuditable = db.scannedJobs.map(j => ({ ...j, originList: 'scannedJobs' as const }));

  if (allAuditable.length === 0) {
    console.log('[Refiner] Discovered postings is empty. Looking for new job posts...');
    addRefinerLog('Refiner Audit: Discovered postings is empty. Initiating background sourcing search for new jobs...');
    globalState.lastBackgroundSourceTime = Date.now();
    try {
      await runBackgroundSourcing();
    } catch (e: any) {
      console.error('[Refiner] Background sourcing from audit cycle failed:', e.message);
    }
    return;
  }

  // Enforce index bounds
  if (globalState.lastAuditJobIndex >= allAuditable.length) {
    globalState.lastAuditJobIndex = 0;
  }

  const target = allAuditable[globalState.lastAuditJobIndex];
  globalState.lastAuditJobIndex++;

  if (!target.url || target.url.includes('myworkdayjobs.com')) {
    // Skip Workday or URL-less jobs to avoid Cloudflare blocks or invalid pings
    return;
  }

  const domain = getDomain(target.url);
  const now = Date.now();
  const COOLDOWN_MS = 5 * 60 * 1000;
  if (domain) {
    const lastFetch = globalState.domainFetchCooldowns[domain] || 0;
    if (now - lastFetch < COOLDOWN_MS) {
      // Domain is on cooldown, skip this audit to respect pacing
      return;
    }
    globalState.domainFetchCooldowns[domain] = now;
  }

  console.log(`[Refiner] Auditing discovered job link: "${target.title}" at "${target.company}" (${target.url})`);
  addRefinerLog(`Refiner Audit: Auditing link for "${target.title}" at ${target.company}...`);
  const fetchResult = await fetchJobHtml(target.url);

  // Re-read db to avoid overwrite races
  const refDb = readDb();
  
  if (fetchResult.status === 404 || fetchResult.status === 410) {
    const idx = refDb.scannedJobs.findIndex(j => j.id === target.id);
    if (idx !== -1) {
      const removed = refDb.scannedJobs.splice(idx, 1)[0];
      removed.status = 'dismissed';
      removed.isRefined = true;
      removed.refinementReason = `Refinement: Discovered Link Dead (${fetchResult.status})`;
      if (!refDb.dismissedJobs.some(j => j.id === removed.id)) {
        refDb.dismissedJobs.unshift(removed);
      }
      writeDb(refDb);
      addRefinerLog(`Auto-archived discovered "${removed.title}" at ${removed.company} (Reason: Link Dead (${fetchResult.status}))`);
      console.log(`[Refiner] Audit: Discovered job closed -> dismissed: "${removed.title}"`);
    }
    return;
  }

  if (fetchResult.status === 200) {
    const lowerText = fetchResult.text.toLowerCase();
    const isClosed = 
      lowerText.includes('no longer accepting applications') ||
      lowerText.includes('this job posting has expired') ||
      lowerText.includes('this job is closed') ||
      lowerText.includes('position is no longer available') ||
      lowerText.includes('vacancy has been filled');

    if (isClosed) {
      const idx = refDb.scannedJobs.findIndex(j => j.id === target.id);
      if (idx !== -1) {
        const removed = refDb.scannedJobs.splice(idx, 1)[0];
        removed.status = 'dismissed';
        removed.isRefined = true;
        removed.refinementReason = 'Refinement: Discovered Position Closed';
        if (!refDb.dismissedJobs.some(j => j.id === removed.id)) {
          refDb.dismissedJobs.unshift(removed);
        }
        writeDb(refDb);
        addRefinerLog(`Auto-archived discovered "${removed.title}" at ${removed.company} (Reason: Position Closed)`);
        console.log(`[Refiner] Audit: Discovered job closed -> dismissed: "${removed.title}"`);
      }
    } else {
      addRefinerLog(`Refiner Audit: Verified "${target.title}" at ${target.company} is still open (HTTP 200).`);
      console.log(`[Refiner] Audit: Verified "${target.title}" at ${target.company} is still open`);
    }
    return;
  }

  // If it is not 200 and not 404/410 (e.g. 403, 500, etc.)
  addRefinerLog(`Refiner Warning: Link check for "${target.title}" at ${target.company} returned HTTP ${fetchResult.status}. Skipped.`);
  console.log(`[Refiner] Audit: Skipped check for "${target.title}" (HTTP ${fetchResult.status})`);
}

export async function runRefinementCycle(isManual: boolean = false): Promise<'match' | 'dismiss' | 'empty' | 'error' | 'skipped'> {
  const idleTime = Date.now() - globalState.lastScannerActiveTime;
  const isIdle = idleTime > 60000;
  if (!isIdle && !isManual) {
    console.log(`[Refiner] Scanner is active (${Math.round(idleTime / 1000)}s ago), skipping background refinement cycle.`);
    return 'skipped';
  }

  const freshDb = readDb();
  const now = Date.now();

  // 1. Check if we should run background sourcing
  const autoScanMinutes = freshDb.profile?.autoScanInterval || 0;
  if (autoScanMinutes > 0 && now - globalState.lastBackgroundSourceTime >= autoScanMinutes * 60 * 1000) {
    globalState.lastBackgroundSourceTime = now;
    try {
      await runBackgroundSourcing();
    } catch (e: any) {
      console.error('[Refiner] Background sourcing failed:', e.message);
    }
  }

  // 1.2 Check if we should run Refiner & Discovery
  const refinerMinutes = freshDb.profile?.refinerIntervalMinutes ?? 5;
  if (!isManual && (refinerMinutes === 0 || now - globalState.lastBackgroundRefinerTime < refinerMinutes * 60 * 1000)) {
    return 'skipped'; // User disabled or interval has not elapsed yet
  }
  if (!isManual) globalState.lastBackgroundRefinerTime = now;


  // 1.5. Validate up to 2 pending Workday validation hosts incrementally
  const pendingQueue = freshDb.pendingWorkdayValidation || [];
  if (pendingQueue.length > 0) {
    const toValidate = pendingQueue.slice(0, 2);
    const remaining = pendingQueue.slice(2);
    freshDb.pendingWorkdayValidation = remaining;
    writeDb(freshDb);
    
    for (const item of toValidate) {
      console.log(`[Discovery] Probing candidate Workday host: ${item.tenant} (${item.host}) using site: ${item.site}...`);
      try {
        const validation = await validateWorkdayHost(item.host, item.tenant, item.site);
        const postDb = readDb();
        if (validation.success && validation.resolvedSite) {
          if (!postDb.workdayDirectory) postDb.workdayDirectory = [];
          const exists = postDb.workdayDirectory.some(
            c => c.tenant.toLowerCase() === item.tenant.toLowerCase()
          );
          if (!exists) {
            const formattedName = item.tenant.charAt(0).toUpperCase() + item.tenant.slice(1);
            postDb.workdayDirectory.push({
              name: formattedName,
              tenant: item.tenant,
              site: validation.resolvedSite,
              host: item.host,
              consecutiveFailures: 0
            });
            console.log(`[Discovery] Validation SUCCESS: Added dynamic Workday company "${formattedName}" (${item.host}) with site path "${validation.resolvedSite}"`);
            addRefinerLog(`System Discovery: Successfully validated and added dynamic Workday site for "${formattedName}" (${item.host})`);
          }
        } else {
          console.log(`[Discovery] Validation FAILED: Rejected Workday candidate "${item.tenant}" (${item.host})`);
          addRefinerLog(`System Discovery: Rejected invalid or blocked Workday host candidate "${item.tenant}" (${item.host})`);
        }
        writeDb(postDb);
      } catch (err: any) {
        console.error(`[Discovery] Unexpected validation error for ${item.tenant}:`, err.message);
      }
    }
  }

  const db = readDb();
  const unrefinedJobs = db.scannedJobs.filter(j => !j.isFullDescriptionFetched);
  
  // 2. If no unrefined jobs exist, run watchlist/saved link audit check
  if (unrefinedJobs.length === 0) {
    try {
      if (!isManual) await runLinkAuditCycle();
    } catch (e: any) {
      console.error('[Refiner] Saved link audit failed:', e.message);
    }
    return 'empty';
  }

  // 3. Process unrefined jobs
  const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  
  const targetJob = unrefinedJobs.find(job => {
    const domain = getDomain(job.url);
    if (!domain) return true;
    const lastFetch = globalState.domainFetchCooldowns[domain] || 0;
    return isManual || (now - lastFetch) >= COOLDOWN_MS;
  });

  if (!targetJob) {
    console.log('[Refiner] All unrefined jobs are on domain cooldown. Skipping cycle.');
    return 'skipped';
  }

  const domain = getDomain(targetJob.url);
  if (domain) {
    globalState.domainFetchCooldowns[domain] = now;
  }

  console.log(`[Refiner] Refining job: "${targetJob.title}" at "${targetJob.company}" (${targetJob.url})`);
  globalState.currentlyRefiningJobId = targetJob.id;

  try {
    // Workday Bypass (Free dead check, bypass Cloudflare blocks)
    if (targetJob.url && targetJob.url.includes('myworkdayjobs.com')) {
      console.log(`[Refiner] Bypassing Workday job to avoid Cloudflare blocks: "${targetJob.title}"`);
      const dbIndex = db.scannedJobs.findIndex(j => j.id === targetJob.id);
      if (dbIndex !== -1) {
        db.scannedJobs[dbIndex].isRefined = true;
        db.scannedJobs[dbIndex].isFullDescriptionFetched = true;
        db.scannedJobs[dbIndex].refinementReason = 'Refinement: Skipped Workday (Cloudflare bypass)';
        writeDb(db);
      }
      return 'dismiss';
    }

    addRefinerLog(`Refiner: Fetching details for "${targetJob.title}" at ${targetJob.company}...`);
    const fetchResult = await fetchJobHtml(targetJob.url);
    
    const refreshDb = readDb();
    const jobIdx = refreshDb.scannedJobs.findIndex(j => j.id === targetJob.id);
    
    if (jobIdx === -1) {
      console.log(`[Refiner] Job "${targetJob.title}" was removed or changed state while fetching. Skipping.`);
      return 'skipped';
    }

    const job = refreshDb.scannedJobs[jobIdx];

    // If HTTP status is 404 or 410, it's a dead link. Move to dismissed/archived.
    if (fetchResult.status === 404 || fetchResult.status === 410) {
      const freshDb = readDb();
      const targetIdx = freshDb.scannedJobs.findIndex(j => j.id === targetJob.id);
      if (targetIdx !== -1) {
        const removed = freshDb.scannedJobs.splice(targetIdx, 1)[0];
        removed.status = 'dismissed';
        removed.isRefined = true;
        removed.isFullDescriptionFetched = true;
        removed.refinementReason = `Refinement: Link Dead (${fetchResult.status})`;
        if (!freshDb.dismissedJobs.some(j => j.id === removed.id)) {
          freshDb.dismissedJobs.unshift(removed);
        }
        writeDb(freshDb);
        addRefinerLog(`Refiner: Auto-archived discovered "${removed.title}" at ${removed.company} (Reason: Link Dead HTTP ${fetchResult.status})`);
        console.log(`[Refiner] Auto-dismissed dead job link: "${removed.title}" (${fetchResult.status})`);
      }
      return 'dismiss';
    }

    if (fetchResult.status !== 200) {
      job.isFullDescriptionFetched = true;
      job.isRefined = true;
      job.refinementReason = `Refinement: Skipped (HTTP ${fetchResult.status})`;
      writeDb(refreshDb);
      addRefinerLog(`Refiner Warning: Fetch details for "${job.title}" at ${job.company} failed (HTTP ${fetchResult.status}). Marked processed.`);
      return;
    }

    const text = fetchResult.text;
    const lowerText = text.toLowerCase();
    
    // 1. Check if position is closed
    const isClosed = 
      lowerText.includes('no longer accepting applications') ||
      lowerText.includes('this job posting has expired') ||
      lowerText.includes('this job is closed') ||
      lowerText.includes('position is no longer available') ||
      lowerText.includes('vacancy has been filled');

    if (isClosed) {
      const freshDb = readDb();
      const targetIdx = freshDb.scannedJobs.findIndex(j => j.id === targetJob.id);
      if (targetIdx !== -1) {
        const removed = freshDb.scannedJobs.splice(targetIdx, 1)[0];
        removed.status = 'dismissed';
        removed.isRefined = true;
        removed.isFullDescriptionFetched = true;
        removed.refinementReason = 'Refinement: Position Closed';
        if (!freshDb.dismissedJobs.some(j => j.id === removed.id)) {
          freshDb.dismissedJobs.unshift(removed);
        }
        writeDb(freshDb);
        addRefinerLog(`Refiner: Auto-archived discovered "${removed.title}" at ${removed.company} (Reason: Position Closed)`);
        console.log(`[Refiner] Auto-dismissed closed job posting: "${removed.title}"`);
      }
      return;
    }

    const cleanDescription = text.slice(0, 15000).trim();

    // 2. Check for location mismatch in full text
    const searchLocation = refreshDb.profile?.searchLocation || 'United States';
    const prefersRemote = refreshDb.profile?.prefersRemote !== false;
    const locationMismatch = checkDescriptionLocationMismatch(cleanDescription, searchLocation, prefersRemote);
    
    if (locationMismatch) {
      const freshDb = readDb();
      const targetIdx = freshDb.scannedJobs.findIndex(j => j.id === targetJob.id);
      if (targetIdx !== -1) {
        const removed = freshDb.scannedJobs.splice(targetIdx, 1)[0];
        removed.status = 'dismissed';
        removed.isRefined = true;
        removed.isFullDescriptionFetched = true;
        removed.refinementReason = locationMismatch;
        if (!freshDb.dismissedJobs.some(j => j.id === removed.id)) {
          freshDb.dismissedJobs.unshift(removed);
        }
        writeDb(freshDb);
        addRefinerLog(`Refiner: Auto-archived discovered "${removed.title}" at ${removed.company} (Reason: ${locationMismatch})`);
        console.log(`[Refiner] Auto-dismissed job with location mismatch: "${removed.title}" (${locationMismatch})`);
      }
      return;
    }

    // 3. Append remaining description instead of overwriting completely
    const appendedDesc = appendRemainingDescription(job.description || '', cleanDescription);
    job.description = appendedDesc;
    job.isFullDescriptionFetched = true;
    job.isRefined = true;
    job.refinementReason = 'Refinement: Details & Salary Enriched';
    writeDb(refreshDb);

    // 4. Evaluate job using the LLM Pipeline
    const minScore = refreshDb.profile?.minMatchScore || 70;
    const yearsOfExperience = refreshDb.profile?.yearsOfExperience || 0;
    const experienceContext = yearsOfExperience > 0
      ? `Candidate has ${yearsOfExperience} years of experience. Filter rules:
         1. NO EXPERIENCE LIMITS: If the job description does NOT mention years of experience, or mentions requirements up to ${yearsOfExperience + 2} yrs: match score is based solely on skills.
         2. ACCEPTABLE RANGE (up to ${yearsOfExperience + 2} yrs): If the job requires up to ${yearsOfExperience + 2} years of experience (e.g. asking for 4 years when candidate has 3), it is acceptable. Assign matchScore normally.
         3. EXCEEDING EXPERIENCE (job requires MORE than ${yearsOfExperience + 2} yrs, e.g. 6+ years): You MUST assign a matchScore of 0 and note "Experience Mismatch: Requires X years, candidate has ${yearsOfExperience} years" in the matchReason.
         4. REQUIREMENT MISMATCH PENALTY: If the job description lists specific "Required", "Must-have", or "Basic Qualifications" skills (e.g. specific languages, frameworks, degrees) and the candidate's resume does NOT contain them, you must penalize the matchScore by deducting exactly 3 to 4 points.`
      : "Candidate is entry-level (0 years of experience). Avoid senior/lead/staff positions.";

    const rawJob = {
      title: job.title,
      company: job.company,
      url: job.url,
      source: job.sourceTag,
      postedAt: job.postedAt,
      location: job.location,
      description: cleanDescription
    };

    console.log(`[Refiner] Evaluating job "${targetJob.title}" via LLM...`);
    addRefinerLog(`Refiner: Evaluating candidate "${targetJob.title}" at ${targetJob.company} via LLM...`);
    globalState.lastBackgroundLlmEvalTime = Date.now();
    
    if (!refreshDb.llmConfig) {
      console.log(`[Refiner] Skipped LLM evaluation for "${job.title}" (Missing LLM settings)`);
      addRefinerLog(`Refiner Warning: Skipped LLM evaluation for "${job.title}" because LLM config is missing.`);
      return 'skipped';
    }

    const [scoredJob] = await scoreCommunityJobs(
      [rawJob],
      refreshDb.profile.rawText,
      refreshDb.llmConfig,
      experienceContext,
      refreshDb.savedJobs,
      searchLocation,
      prefersRemote,
      refreshDb.profile?.blockedCompanies || [],
      () => {}
    );

    const finalDb = readDb();
    if (!finalDb.stats) {
      finalDb.stats = { totalScanned: 0, duplicatesPrevented: 0, llmEvaluations: 0, totalSourced: 0 };
    }
    finalDb.stats.llmEvaluations += 1;
    
    const finalJobIdx = finalDb.scannedJobs.findIndex(j => j.id === targetJob.id);
    if (finalJobIdx !== -1) {
      const finalJob = finalDb.scannedJobs[finalJobIdx];
      
      // Inherit the evaluated fields
      finalJob.salary = scoredJob.salary;
      finalJob.salaryNum = scoredJob.salaryNum;
      finalJob.matchScore = scoredJob.matchScore;
      finalJob.matchReason = scoredJob.matchReason;
      finalJob.skillsRequired = scoredJob.skillsRequired || [];
      finalJob.isRemote = scoredJob.isRemote;
      finalJob.experienceLevel = scoredJob.experienceLevel;
      finalJob.industry = scoredJob.industry;
      finalJob.isFullDescriptionFetched = true; // IT IS NOW EVALUATED (Matched Job)
      
      if (finalJob.matchScore < minScore) {
        // Move to dismissed
        const removed = finalDb.scannedJobs.splice(finalJobIdx, 1)[0];
        removed.status = 'dismissed';
        removed.isRefined = true;
        if (!finalDb.dismissedJobs.some(j => j.id === removed.id)) {
          finalDb.dismissedJobs.unshift(removed);
        }
        addRefinerLog(`Refiner: Skipped "${removed.title}" (Score ${removed.matchScore}% < ${minScore}%: ${removed.matchReason})`);
        console.log(`[Refiner] Dismissed job due to low score: ${removed.matchScore}%`);
        writeDb(finalDb);
        return 'dismiss';
      } else {
        // Keep in scannedJobs (Matched)
        finalJob.isRefined = true;
        addRefinerLog(`Refiner: Successfully evaluated "${finalJob.title}" (Score: ${finalJob.matchScore}%)`);
        console.log(`[Refiner] Evaluated job matches criteria: ${finalJob.matchScore}%`);
        writeDb(finalDb);
        return 'match';
      }
    }
    writeDb(finalDb);
    return 'skipped';
  } catch (err: any) {
    console.error('[Refiner] Error in job refinement details processing:', err);
    return 'error';
  } finally {
    globalState.currentlyRefiningJobId = null;
  }
}

export function startBackgroundRefiner() {
  if (refinerTimer) return;
  refinerTimer = setInterval(async () => {
    try {
      await runRefinementCycle();
    } catch (err) {
      console.error('[Refiner] Error in refinement cycle:', err);
    }
  }, 60000);
  console.log('[Refiner] Background 1-minute heartbeat started.');
}
