/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import fs from 'fs';
import { Job, ResumeProfile, LLMConfig, WorkdayCompany } from '../src/types';

export const DB_PATH = path.join(process.cwd(), 'discovered_jobs.json');

export interface DatabaseSchema {
  scannedJobs: Job[];
  watchlist: Job[];
  savedJobs: Job[];
  dismissedJobs: Job[];
  profile: ResumeProfile | null;
  llmConfig: LLMConfig | null;
  logs: string[];
  stats?: {
    totalScanned: number;
    duplicatesPrevented: number;
    llmEvaluations: number;
    totalSourced: number;
  };
  workdayDirectory?: WorkdayCompany[];
  pendingWorkdayValidation?: {
    host: string;
    tenant: string;
    site: string;
    consecutiveFailures: number;
    lastAttempt?: string;
  }[];
}

export function cleanDbScannedJobs(db: DatabaseSchema): boolean {
  const originalLength = db.scannedJobs.length;
  const companyCounts = new Map<string, number>();
  const maxPerCompany = db.profile?.maxMatchesPerCompany || 3;
  const limitCompany = db.profile?.limitCompanyMatches !== false;
  const blockedCompanies = db.profile?.blockedCompanies || [];
  
  const cleanStr = (s: string) => s.toLowerCase().trim();
  const blockedSet = new Set(blockedCompanies.map(c => cleanStr(c)));

  db.scannedJobs = db.scannedJobs.filter(job => {
    const titleL = cleanStr(job.title);
    const companyL = cleanStr(job.company);
    
    // 1. Remove if already in saved, watchlist, or dismissed
    const isSaved = db.savedJobs.some(s => cleanStr(s.title) === titleL && cleanStr(s.company) === companyL);
    const isWatchlisted = db.watchlist.some(w => cleanStr(w.title) === titleL && cleanStr(w.company) === companyL);
    const isDismissed = db.dismissedJobs.some(d => cleanStr(d.title) === titleL && cleanStr(d.company) === companyL);
    
    if (isSaved || isWatchlisted || isDismissed) {
      return false;
    }

    // 2. Remove if company is blocked
    if (blockedSet.has(companyL)) {
      return false;
    }

    // 3. Remove if company match limit exceeded
    if (limitCompany) {
      const currentCount = companyCounts.get(companyL) || 0;
      if (currentCount >= maxPerCompany) {
        return false;
      }
      companyCounts.set(companyL, currentCount + 1);
    }

    return true;
  });

  return db.scannedJobs.length !== originalLength;
}

export function readDb(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      const parsedStats = parsed.stats || {};
      const db: DatabaseSchema = {
        scannedJobs: parsed.scannedJobs || [],
        watchlist: parsed.watchlist || [],
        savedJobs: parsed.savedJobs || [],
        dismissedJobs: parsed.dismissedJobs || [],
        profile: parsed.profile || null,
        llmConfig: parsed.llmConfig || null,
        logs: parsed.logs || [],
        stats: {
          totalScanned: typeof parsedStats.totalScanned === 'number' ? parsedStats.totalScanned : 0,
          duplicatesPrevented: typeof parsedStats.duplicatesPrevented === 'number' ? parsedStats.duplicatesPrevented : 0,
          llmEvaluations: typeof parsedStats.llmEvaluations === 'number' ? parsedStats.llmEvaluations : 0,
          totalSourced: typeof parsedStats.totalSourced === 'number' ? parsedStats.totalSourced : 0
        },
        workdayDirectory: parsed.workdayDirectory || [],
        pendingWorkdayValidation: parsed.pendingWorkdayValidation || []
      };

      const modified = cleanDbScannedJobs(db);
      if (modified) {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
      }
      return db;
    }
  } catch (err) {
    console.error('[DB] Error reading database file:', err);
  }
  return {
    scannedJobs: [],
    watchlist: [],
    savedJobs: [],
    dismissedJobs: [],
    profile: null,
    llmConfig: null,
    logs: [],
    stats: {
      totalScanned: 0,
      duplicatesPrevented: 0,
      llmEvaluations: 0,
      totalSourced: 0
    }
  };
}

export function writeDb(db: DatabaseSchema) {
  try {
    cleanDbScannedJobs(db);
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB] Error writing database file:', err);
  }
}
