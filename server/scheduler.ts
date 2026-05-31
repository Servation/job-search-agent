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
  extractSalaryWithRegex, 
  getDomain, 
  fetchJobHtml 
} from './utils';
import { scoreCommunityJobs, queryCustomLLMAdaptive } from './llm';
import { 
  fetchGreenhouseJobs, 
  fetchLeverJobs, 
  fetchAshbyJobs, 
  fetchWorkdayJobs, 
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

  const capacity = db.profile.maxDiscoveredJobs || 30;
  const currentCount = db.scannedJobs.length;
  if (currentCount >= capacity) {
    const skipMsg = isManual
      ? `Search Agent skipped: Board is already at capacity (${currentCount}/${capacity} jobs).`
      : `[Refiner] Background sourcing skipped: Board is already at or above capacity (${currentCount}/${capacity} jobs).`;
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
    health.workday ? fetchWorkdayJobs(globalState.cachedWorkdayDirectory, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
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

    // Score only a small batch in the background, or a larger batch if manual search
    const batchLimit = isManual ? 3 : 1;
    const batchToScore = candidates.slice(0, batchLimit);
    
    const evalLog = isManual
      ? `Search Agent: Evaluating ${batchToScore.length} new candidates via LLM...`
      : `Refiner: Evaluating ${batchToScore.length} new candidates via background LLM...`;
    
    console.log(isManual 
      ? `[Search Agent] Sourced ${candidates.length} unique candidates. Evaluating batch of ${batchToScore.length}...`
      : `[Refiner] Sourced ${candidates.length} unique candidates. Background evaluating batch of ${batchToScore.length}...`
    );
    addRefinerLog(evalLog);

    const scoredJobs = await scoreCommunityJobs(
      batchToScore,
      db.profile.rawText,
      db.llmConfig,
      experienceContext,
      db.savedJobs,
      searchLocation,
      prefersRemote,
      db.profile?.blockedCompanies || [],
      (job, idx, total) => {
        const jobMsg = isManual
          ? `Search Agent: [Candidate ${idx + 1}/${total}] Evaluating "${job.title}" at ${job.company}...`
          : `Refiner: [Candidate ${idx + 1}/${total}] Background evaluating "${job.title}" at ${job.company}...`;
        addRefinerLog(jobMsg);
      }
    );

    // Filter scored jobs by score threshold and company limits
    const minScore = db.profile.minMatchScore || 70;
    const toAdd: Job[] = [];

    // Re-read db to get fresh state before writing updates
    const freshDb = readDb();
    if (!freshDb.stats) {
      freshDb.stats = { totalScanned: 0, duplicatesPrevented: 0, llmEvaluations: 0, totalSourced: 0 };
    }
    freshDb.stats.duplicatesPrevented += preventedDuplicates.length;
    freshDb.stats.llmEvaluations += batchToScore.length;
    
    // Refresh company counts on freshDb
    if (limitCompany) {
      companyCounts.clear();
      const allActiveJobs = [...freshDb.scannedJobs, ...freshDb.watchlist, ...freshDb.savedJobs];
      for (const j of allActiveJobs) {
        const comp = cleanStr(j.company);
        companyCounts.set(comp, (companyCounts.get(comp) || 0) + 1);
      }
    }

    const blockedCompanies = db.profile?.blockedCompanies || [];

    for (const sJob of scoredJobs) {
      const companyL = cleanStr(sJob.company);
      
      // Check if company is blocked (important post-LLM extraction check e.g. for Hacker News jobs)
      if (blockedCompanies.some(bc => cleanStr(bc) === companyL)) {
        const logMsg = isManual
          ? `Search Agent: Excluded candidate "${sJob.title}" at ${sJob.company} (Reason: Company Blocked)`
          : `Refiner: Excluded background candidate "${sJob.title}" at ${sJob.company} (Reason: Company Blocked)`;
        addRefinerLog(logMsg);
        console.log(`[Refiner] Background evaluate: Excluded "${sJob.title}" at ${sJob.company} (Company Blocked)`);
        continue;
      }

      // Check score threshold
      if (sJob.matchScore < minScore) {
        const skipReason = sJob.matchReason || `Match Score ${sJob.matchScore}% < threshold ${minScore}%`;
        const logMsg = isManual
          ? `Search Agent: Skipped candidate "${sJob.title}" at ${sJob.company} (Reason: ${skipReason})`
          : `Refiner: Skipped background candidate "${sJob.title}" at ${sJob.company} (Reason: ${skipReason})`;
        addRefinerLog(logMsg);
        console.log(`[Refiner] Background evaluate: Skipped "${sJob.title}" at ${sJob.company} (Reason: ${skipReason})`);
        continue;
      }

      // Check company limits again (since multiple in batch could be same company)
      if (limitCompany) {
        const currentCount = companyCounts.get(companyL) || 0;
        if (currentCount >= maxPerCompany) {
          const logMsg = isManual
            ? `Search Agent: Excluded candidate "${sJob.title}" at ${sJob.company} (Reason: Company limit of ${maxPerCompany} reached)`
            : `Refiner: Excluded background candidate "${sJob.title}" at ${sJob.company} (Reason: Company limit of ${maxPerCompany} reached)`;
          addRefinerLog(logMsg);
          console.log(`[Refiner] Background evaluate: Excluded "${sJob.title}" at ${sJob.company} (Company limit of ${maxPerCompany} reached)`);
          continue;
        }
        companyCounts.set(companyL, currentCount + 1);
      }

      // Format clean Job object to add
      toAdd.push({
        id: `discovered-${sJob.sourceTag}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: sJob.title,
        company: sJob.company,
        location: sJob.location,
        salary: sJob.salary,
        type: sJob.type,
        isW2: sJob.isW2,
        description: sJob.description,
        url: sJob.url,
        postedAt: sJob.postedAt,
        isDuplicate: sJob.isDuplicate,
        status: 'discovered',
        scannedAt: sJob.scannedAt,
        isUrlVerified: sJob.isUrlVerified,
        isRemote: sJob.isRemote,
        skillsRequired: sJob.skillsRequired,
        industry: sJob.industry,
        experienceLevel: sJob.experienceLevel,
        salaryNum: sJob.salaryNum,
        matchScore: sJob.matchScore,
        matchReason: sJob.matchReason,
        sourceTag: sJob.sourceTag,
        retryTier: sJob.retryTier,
        isFullDescriptionFetched: sJob.isFullDescriptionFetched
      });
    }

    if (toAdd.length > 0) {
      const spaceLeft = capacity - freshDb.scannedJobs.length;
      const finalToAdd = toAdd.slice(0, Math.max(0, spaceLeft));
      
      // Log jobs that were skipped because capacity was full
      if (toAdd.length > finalToAdd.length) {
        const skippedDueToCapacity = toAdd.slice(finalToAdd.length);
        for (const job of skippedDueToCapacity) {
          const capMsg = isManual
            ? `Search Agent: Skipped adding "${job.title}" at ${job.company} (Reason: Discovered postings list is at full capacity)`
            : `Refiner: Skipped background candidate "${job.title}" at ${job.company} (Reason: Discovered postings list is at full capacity)`;
          addRefinerLog(capMsg);
        }
      }

      if (finalToAdd.length > 0) {
        freshDb.scannedJobs.unshift(...finalToAdd);
        freshDb.stats.totalScanned += finalToAdd.length;
        for (const job of finalToAdd) {
          const addLog = isManual
            ? `Search Agent: Added matched job "${job.title}" at ${job.company} (Score: ${job.matchScore}%)`
            : `Refiner: Added background matched job "${job.title}" at ${job.company} (Score: ${job.matchScore}%)`;
          addRefinerLog(addLog);
        }
        console.log(isManual
          ? `[Search Agent] Added ${finalToAdd.length} evaluated jobs to scannedJobs queue.`
          : `[Refiner] Added ${finalToAdd.length} background-evaluated jobs to scannedJobs queue.`
        );
      }
    } else {
      const doneLog = isManual
        ? 'Search Agent: Sourcing check finished. No new matching postings met threshold requirements.'
        : 'Refiner: Background job sourcing check finished. No new matching postings met threshold requirements.';
      addRefinerLog(doneLog);
      console.log(isManual
        ? '[Search Agent] Sourcing ran: No matching jobs passed score threshold.'
        : '[Refiner] Background sourcing ran: No matching jobs passed score threshold.'
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

export async function runRefinementCycle() {
  const idleTime = Date.now() - globalState.lastScannerActiveTime;
  const isIdle = idleTime > 60000;
  if (!isIdle) {
    console.log(`[Refiner] Scanner is active (${Math.round(idleTime / 1000)}s ago), skipping background refinement cycle.`);
    return;
  }

  // 1. Check if we should run background sourcing
  const now = Date.now();
  if (now - globalState.lastBackgroundSourceTime >= 15 * 60 * 1000) {
    globalState.lastBackgroundSourceTime = now;
    try {
      await runBackgroundSourcing();
    } catch (e: any) {
      console.error('[Refiner] Background sourcing failed:', e.message);
    }
  }

  // 1.5. Validate up to 2 pending Workday validation hosts incrementally
  const freshDb = readDb();
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
      await runLinkAuditCycle();
    } catch (e: any) {
      console.error('[Refiner] Saved link audit failed:', e.message);
    }
    return;
  }

  // 3. Process unrefined jobs
  const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  
  const targetJob = unrefinedJobs.find(job => {
    const domain = getDomain(job.url);
    if (!domain) return true;
    const lastFetch = globalState.domainFetchCooldowns[domain] || 0;
    return (now - lastFetch) >= COOLDOWN_MS;
  });

  if (!targetJob) {
    console.log('[Refiner] All unrefined jobs are on domain cooldown. Skipping cycle.');
    return;
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
      return;
    }

    addRefinerLog(`Refiner: Fetching details for "${targetJob.title}" at ${targetJob.company}...`);
    const fetchResult = await fetchJobHtml(targetJob.url);
    
    const refreshDb = readDb();
    const jobIdx = refreshDb.scannedJobs.findIndex(j => j.id === targetJob.id);
    
    if (jobIdx === -1) {
      console.log(`[Refiner] Job "${targetJob.title}" was removed or changed state while fetching. Skipping.`);
      return;
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
      return;
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

    // 4. Extract Salary (Tier 1: Regex)
    const regexSalary = extractSalaryWithRegex(cleanDescription);
    if (regexSalary) {
      const finalDb = readDb();
      const finalJobIdx = finalDb.scannedJobs.findIndex(j => j.id === targetJob.id);
      if (finalJobIdx !== -1) {
        const finalJob = finalDb.scannedJobs[finalJobIdx];
        finalJob.salary = regexSalary.salary;
        finalJob.salaryNum = regexSalary.salaryNum;
        writeDb(finalDb);
        console.log(`[Refiner] Regex extracted salary for "${targetJob.title}": ${regexSalary.salary} (${regexSalary.salaryNum})`);
        addRefinerLog(`Refiner: Extracted salary for "${targetJob.title}" via regex: ${regexSalary.salary}`);
      }
      return;
    }

    // 5. Fallback to LLM salary extraction (Tier 2) if regex fails
    const LLM_COOLDOWN_MS = 3 * 60 * 1000;
    if (now - globalState.lastBackgroundLlmEvalTime < LLM_COOLDOWN_MS) {
      console.log(`[Refiner] LLM salary check for "${targetJob.title}" skipped: Cooldown active.`);
      return;
    }

    if (!refreshDb.llmConfig) {
      console.log(`[Refiner] Skipped LLM salary check for "${job.title}" (Missing LLM settings)`);
      return;
    }

    const dbConfig = refreshDb.llmConfig;
    
    const promptBuilder = (resumeLimit: number, descLimit: number) => {
      return `You are an expert recruitment assistant. Extract the base salary or hourly compensation rate from this job description.
      
      Job Description:
      """
      ${cleanDescription.slice(0, descLimit)}
      """
      
      Return a JSON object:
      {
        "salary": "Extract salary range text if found (e.g. '$120k–$150k'), otherwise 'Not specified'",
        "salaryNum": 150000 // numeric representation of upper bound (integer), or 0 if not found
      }`;
    };

    console.log(`[Refiner] Querying LLM to extract salary for "${targetJob.title}"...`);
    globalState.lastBackgroundLlmEvalTime = Date.now();

    const llmResult = await queryCustomLLMAdaptive(
      dbConfig.endpoint,
      dbConfig.apiKey,
      dbConfig.modelName,
      promptBuilder,
      (dbConfig.timeout || 35) * 1000,
      false
    );

    const txt = llmResult.content.trim().replace(/^```(json)?\n?/, '').replace(/\n?```$/, '');
    const ev = JSON.parse(txt);
    
    const finalDb = readDb();
    if (!finalDb.stats) {
      finalDb.stats = { totalScanned: 0, duplicatesPrevented: 0, llmEvaluations: 0, totalSourced: 0 };
    }
    finalDb.stats.llmEvaluations += 1;
    
    const finalJobIdx = finalDb.scannedJobs.findIndex(j => j.id === targetJob.id);
    if (finalJobIdx !== -1) {
      const finalJob = finalDb.scannedJobs[finalJobIdx];
      if (ev.salary && ev.salary !== 'Not specified') {
        finalJob.salary = ev.salary;
        finalJob.salaryNum = typeof ev.salaryNum === 'number' ? ev.salaryNum : 0;
        console.log(`[Refiner] LLM extracted salary for "${finalJob.title}": ${ev.salary} (${finalJob.salaryNum})`);
        addRefinerLog(`Refiner: Extracted salary for "${finalJob.title}" via LLM: ${ev.salary}`);
      } else {
        console.log(`[Refiner] LLM found no salary information for "${finalJob.title}"`);
      }
    }
    writeDb(finalDb);
  } catch (err: any) {
    console.error('[Refiner] Error in job refinement details processing:', err);
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
  }, REFINER_INTERVAL_MS);
  console.log('[Refiner] Background refiner started, running every 5 minutes.');
}
