/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkdayCompany, SmartRecruitersCompany } from '../src/types';
import { globalState } from './config';
import { 
  communitySlugToName, 
  matchesKeywords, 
  isBlocklistedRole, 
  exceedsExperienceRequirement, 
  matchesLocation, 
  stripHtmlCommunity 
} from './utils';

export interface RawCommunityJob {
  title: string; 
  company: string; 
  location: string; 
  description: string;
  url: string; 
  applyUrl?: string; 
  postedAt: string; 
  type: string;
  salary?: string; 
  isRemote: boolean; 
  source: 'greenhouse' | 'lever' | 'workday' | 'smartrecruiters' | 'ashby' | 'remoteok' | 'websearch' | 'remotive' | 'hackernews';
}

export async function updateCompanyDirectoriesFromRegistry(): Promise<void> {
  const now = Date.now();
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  
  if (now - globalState.lastRegistryFetchTime < ONE_WEEK_MS && globalState.lastRegistryFetchTime !== 0) {
    return; // Use memory cache, last updated within a week
  }
  
  console.log('[Registry] Checking for company directory updates from remote registry...');
  try {
    const response = await fetch('https://raw.githubusercontent.com/Servation/job-search-agent-slugs/main/slugs.json', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data) {
        if (Array.isArray(data.greenhouse)) {
          globalState.cachedGreenhouseSlugs = data.greenhouse;
          console.log(`[Registry] Updated Greenhouse slugs: ${globalState.cachedGreenhouseSlugs.length} entries.`);
        }
        if (Array.isArray(data.lever)) {
          globalState.cachedLeverSlugs = data.lever;
          console.log(`[Registry] Updated Lever slugs: ${globalState.cachedLeverSlugs.length} entries.`);
        }
        if (Array.isArray(data.ashby)) {
          globalState.cachedAshbySlugs = data.ashby;
          console.log(`[Registry] Updated Ashby slugs: ${globalState.cachedAshbySlugs.length} entries.`);
        }
        if (Array.isArray(data.workday)) {
          globalState.cachedWorkdayDirectory = data.workday;
          console.log(`[Registry] Updated Workday directory: ${globalState.cachedWorkdayDirectory.length} entries.`);
        }
        if (Array.isArray(data.smartrecruiters)) {
          globalState.cachedSmartRecruitersDirectory = data.smartrecruiters;
          console.log(`[Registry] Updated SmartRecruiters directory: ${globalState.cachedSmartRecruitersDirectory.length} entries.`);
        }
        if (data.templates) {
          if (data.templates.workdaySearch) globalState.templates.workdaySearch = data.templates.workdaySearch;
          if (data.templates.workdayDetails) globalState.templates.workdayDetails = data.templates.workdayDetails;
          if (data.templates.smartrecruitersPostings) globalState.templates.smartrecruitersPostings = data.templates.smartrecruitersPostings;
          if (data.templates.smartrecruitersDetails) globalState.templates.smartrecruitersDetails = data.templates.smartrecruitersDetails;
          console.log('[Registry] Successfully updated API endpoint templates.');
        }
        globalState.lastRegistryFetchTime = now;
        console.log('[Registry] Successfully updated company directories from remote registry.');
        return;
      }
    }
  } catch (err: any) {
    console.warn('[Registry] Remote registry update failed (falling back to static local lists):', err.message);
  }
  // Even on failure, set the fetch timestamp to prevent slamming the request on every subsequent scan in the same run
  globalState.lastRegistryFetchTime = now;
}

// Helper to execute promises in batches to prevent socket exhaustion and rate-limiting
async function batchPromises<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R[]>,
  batchSize: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchRes = await Promise.allSettled(batch.map(item => fn(item)));
    for (const res of batchRes) {
      if (res.status === 'fulfilled') {
        results.push(...res.value);
      }
    }
  }
  return results;
}

export async function checkSourceHealth(
  searchLocation: string,
  prefersRemote: boolean
): Promise<{
  greenhouse: boolean;
  lever: boolean;
  ashby: boolean;
  workday: boolean;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const status = { greenhouse: true, lever: true, ashby: true, workday: true };

  // Run health checks sequentially with a 6-second timeout to reduce initial burst network noise
  // Greenhouse test
  try {
    const res = await fetch('https://boards-api.greenhouse.io/v1/boards/stripe/jobs', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) throw new Error(`HTTP Status ${res.status}`);
  } catch (err: any) {
    warnings.push(`[Health Check Warning] Greenhouse API is degraded/offline (${err.message}). Sourcing will proceed with caution.`);
  }

  // Lever test
  try {
    const res = await fetch('https://api.lever.co/v0/postings/netflix?mode=json', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) throw new Error(`HTTP Status ${res.status}`);
  } catch (err: any) {
    warnings.push(`[Health Check Warning] Lever API is degraded/offline (${err.message}). Sourcing will proceed with caution.`);
  }

  // Ashby test
  try {
    const res = await fetch('https://api.ashbyhq.com/posting-api/job-board/linear', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) throw new Error(`HTTP Status ${res.status}`);
  } catch (err: any) {
    warnings.push(`[Health Check Warning] Ashby API is degraded/offline (${err.message}). Sourcing will proceed with caution.`);
  }

  // Workday test (Nvidia or Salesforce)
  let workdayHealthy = false;
  let workdayError = '';
  try {
    const urlSalesforce = 'https://salesforce.wd12.myworkdayjobs.com/wday/cxs/salesforce/External_Career_Site/jobs';
    const urlNvidia = 'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs';
    
    // Attempt Salesforce first
    try {
      const resSf = await fetch(urlSalesforce, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://salesforce.wd12.myworkdayjobs.com',
          'Referer': 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/'
        },
        body: JSON.stringify({ searchText: 'health-ping', limit: 1, offset: 0, appliedFacets: {} }),
        signal: AbortSignal.timeout(6000)
      });
      if (resSf.ok) workdayHealthy = true;
      else workdayError = `Salesforce HTTP ${resSf.status}`;
    } catch (e: any) {
      workdayError = `Salesforce: ${e.message}`;
    }

    if (!workdayHealthy) {
      // Fallback/Try Nvidia
      try {
        const resNv = await fetch(urlNvidia, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://nvidia.wd5.myworkdayjobs.com',
            'Referer': 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/'
          },
          body: JSON.stringify({ searchText: 'health-ping', limit: 1, offset: 0, appliedFacets: {} }),
          signal: AbortSignal.timeout(6000)
        });
        if (resNv.ok) workdayHealthy = true;
        else workdayError += `, Nvidia HTTP ${resNv.status}`;
      } catch (e: any) {
        workdayError += `, Nvidia: ${e.message}`;
      }
    }
  } catch (err: any) {
    workdayError = err.message;
  }

  if (!workdayHealthy) {
    warnings.push(`[Health Check Warning] Workday API is degraded or offline (${workdayError}). Sourcing will proceed with caution.`);
  }

  return { ...status, warnings };
}

export async function fetchGreenhouseJobs(
  slugs: readonly string[], 
  keywords: string[],
  targetRoles: string[],
  searchLocation: string,
  prefersRemote: boolean,
  yearsOfExperience: number = 0
): Promise<RawCommunityJob[]> {
  // Batch in groups of 8
  return batchPromises(
    slugs,
    async (slug): Promise<RawCommunityJob[]> => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(
          `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
          { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        clearTimeout(tid);
        if (!res.ok) return [];
        const data = await res.json();
        const name = communitySlugToName(slug);
        return ((data.jobs as any[]) || [])
          .filter(j => {
            const title = j.title || '';
            const locName = j.location?.name || '';
            return matchesKeywords(title, keywords) && 
                   !isBlocklistedRole(title, targetRoles, yearsOfExperience) &&
                   !exceedsExperienceRequirement(j.content || '', yearsOfExperience) &&
                   matchesLocation(locName, searchLocation, prefersRemote);
          })
          .map(j => ({
            title: j.title || 'Unknown Role',
            company: name,
            location: j.location?.name || 'Not specified',
            description: stripHtmlCommunity(j.content || '').slice(0, 15000),
            url: j.absolute_url || '',
            postedAt: j.updated_at || new Date().toISOString(),
            type: 'Full-Time',
            isRemote: (j.location?.name || '').toLowerCase().includes('remote'),
            source: 'greenhouse' as const,
          }));
      } catch { clearTimeout(tid); return []; }
    },
    8
  );
}

export async function fetchLeverJobs(
  slugs: readonly string[], 
  keywords: string[],
  targetRoles: string[],
  searchLocation: string,
  prefersRemote: boolean,
  yearsOfExperience: number = 0
): Promise<RawCommunityJob[]> {
  // Batch in groups of 2 (Lever list is netflix, palantir)
  return batchPromises(
    slugs,
    async (slug): Promise<RawCommunityJob[]> => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(
          `https://api.lever.co/v0/postings/${slug}?mode=json`,
          { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        clearTimeout(tid);
        if (!res.ok) return [];
        const jobs = await res.json();
        if (!Array.isArray(jobs)) return [];
        const name = communitySlugToName(slug);
        return jobs
          .filter(j => {
            const title = j.text || '';
            const loc = j.categories?.location || j.location || '';
            return matchesKeywords(title, keywords) && 
                   !isBlocklistedRole(title, targetRoles, yearsOfExperience) &&
                   !exceedsExperienceRequirement(j.description || '', yearsOfExperience) &&
                   matchesLocation(loc, searchLocation, prefersRemote);
          })
          .map(j => {
            const sr = j.salaryRange;
            const salary = sr?.min && sr?.max
              ? `${sr.currency || 'USD'} ${Math.round(sr.min / 1000)}k–${Math.round(sr.max / 1000)}k`
              : undefined;
            const loc = j.categories?.location || j.location || '';
            return {
              title: j.text || 'Unknown Role',
              company: name,
              location: loc || 'Not specified',
              description: (j.descriptionPlain || stripHtmlCommunity(j.description || '')).slice(0, 15000),
              url: j.hostedUrl || j.applyUrl || '',
              applyUrl: j.applyUrl,
              postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
              type: j.categories?.commitment || 'Full-Time',
              salary,
              isRemote: j.workplaceType === 'remote' || loc.toLowerCase().includes('remote'),
              source: 'lever' as const,
            };
          });
      } catch { clearTimeout(tid); return []; }
    },
    2
  );
}

export async function fetchAshbyJobs(
  slugs: readonly string[],
  keywords: string[],
  targetRoles: string[],
  searchLocation: string,
  prefersRemote: boolean,
  yearsOfExperience: number = 0
): Promise<RawCommunityJob[]> {
  // Batch in groups of 4 and use a 15-second timeout for AshbyHQ
  return batchPromises(
    slugs,
    async (slug): Promise<RawCommunityJob[]> => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(
          `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,
          { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        clearTimeout(tid);
        if (!res.ok) return [];
        const data = await res.json();
        const name = communitySlugToName(slug);
        
        const jobsList = (data.jobs as any[]) || [];
        return jobsList
          .filter(j => {
            if (!j.isListed) return false;
            const title = j.title || '';
            const locName = j.location || '';
            const desc = j.descriptionPlain || j.descriptionHtml || '';
            return matchesKeywords(title, keywords) &&
                   !isBlocklistedRole(title, targetRoles, yearsOfExperience) &&
                   !exceedsExperienceRequirement(desc, yearsOfExperience) &&
                   matchesLocation(locName, searchLocation, prefersRemote);
          })
          .map(j => {
            const isRemote = j.workplaceType === 'Remote' || (j.location || '').toLowerCase().includes('remote');
            const desc = (j.descriptionPlain || (j.descriptionHtml ? stripHtmlCommunity(j.descriptionHtml) : '')).slice(0, 15000);
            
            let salaryStr = 'Not specified';
            if (j.compensation) {
              if (j.compensation.summary) {
                salaryStr = j.compensation.summary;
              } else if (j.compensation.minValue && j.compensation.maxValue) {
                const cur = j.compensation.currencyCode || 'USD';
                salaryStr = `${cur} ${Math.round(j.compensation.minValue / 1000)}k–${Math.round(j.compensation.maxValue / 1000)}k`;
              }
            }

            return {
              title: j.title || 'Unknown Role',
              company: name,
              location: j.location || 'Remote',
              description: desc,
              url: `https://jobs.ashbyhq.com/${slug}/${j.id}`,
              postedAt: new Date().toISOString(),
              type: j.employmentType === 'Contract' ? 'Contract' : (j.employmentType === 'PartTime' ? 'Part-Time' : 'Full-Time'),
              isRemote,
              salary: salaryStr,
              source: 'ashby' as const,
            };
          });
      } catch { clearTimeout(tid); return []; }
    },
    4
  );
}

export async function fetchWorkdayJobs(
  companies: WorkdayCompany[],
  keywords: string[],
  targetRoles: string[],
  searchLocation: string,
  prefersRemote: boolean,
  yearsOfExperience: number = 0
): Promise<RawCommunityJob[]> {
  // Batch Workday fetches in groups of 3 to avoid timeouts and rate-limiting
  return batchPromises(
    companies,
    async (company): Promise<RawCommunityJob[]> => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 12000); // 12s timeout per company
      const host = company.host || `${company.tenant}.myworkdayjobs.com`;
      
      try {
        const queryText = targetRoles.length > 0 ? targetRoles[0] : 'Software Engineer';
        const searchUrl = `https://${host}/wday/cxs/${company.tenant}/${company.site}/jobs`;
        
        const response = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': `https://${host}`,
            'Referer': `https://${host}/en-US/${company.site}/`
          },
          body: JSON.stringify({
            searchText: queryText,
            limit: 20,
            offset: 0,
            appliedFacets: {}
          }),
          signal: ctrl.signal
        });
        
        clearTimeout(tid);
        
        if (!response.ok) {
          console.warn(`[Workday] Fetch failed for ${company.name} (${host}): HTTP ${response.status}`);
          return [];
        }
        
        const data = await response.json();
        const postings = (data.jobPostings || []) as any[];
        
        const matchingPostings = postings.filter(p => {
          const title = p.title || '';
          return matchesKeywords(title, keywords) && !isBlocklistedRole(title, targetRoles, yearsOfExperience);
        });
        
        // Fetch details for matching postings to get descriptions
        const detailedJobs = await Promise.all(
          matchingPostings.map(async (p): Promise<RawCommunityJob | null> => {
            const pathParts = (p.externalPath || '').split('/');
            const jobId = pathParts[pathParts.length - 1];
            if (!jobId) return null;
            
            const detailUrl = `https://${host}/wday/cxs/${company.tenant}/${company.site}/job/${jobId}`;
            
            const dCtrl = new AbortController();
            const dTid = setTimeout(() => dCtrl.abort(), 6000);
            
            try {
              const dRes = await fetch(detailUrl, {
                headers: { 
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Origin': `https://${host}`,
                  'Referer': `https://${host}/en-US/${company.site}/`
                },
                signal: dCtrl.signal
              });
              clearTimeout(dTid);
              
              if (dRes.ok) {
                const dData = await dRes.json();
                const jobDescHtml = dData.jobPosting?.jobDescription || '';
                const desc = stripHtmlCommunity(jobDescHtml).slice(0, 15000);
                
                const loc = p.locationsText || 'Specified on site';
                if (!matchesLocation(loc, searchLocation, prefersRemote) || exceedsExperienceRequirement(jobDescHtml, yearsOfExperience)) {
                  return null;
                }
                
                return {
                  title: p.title,
                  company: company.name,
                  location: loc,
                  description: desc,
                  url: `https://${host}/en-US/${company.site}${p.externalPath}`,
                  postedAt: p.postedOn || new Date().toISOString(),
                  type: 'Full-Time',
                  isRemote: loc.toLowerCase().includes('remote'),
                  source: 'workday' as const
                };
              }
            } catch (err: any) {
              clearTimeout(dTid);
              console.warn(`[Workday] Details failed for ${company.name} job ${jobId}:`, err.message);
            }
            
            // Fallback if details fetch failed (use summary)
            const loc = p.locationsText || 'Specified on site';
            if (!matchesLocation(loc, searchLocation, prefersRemote)) {
              return null;
            }
            return {
              title: p.title,
              company: company.name,
              location: loc,
              description: 'Position details available on application site.',
              url: `https://${host}/en-US/${company.site}${p.externalPath}`,
              postedAt: p.postedOn || new Date().toISOString(),
              type: 'Full-Time',
              isRemote: loc.toLowerCase().includes('remote'),
              source: 'workday' as const
            };
          })
        );
        
        return detailedJobs.filter(Boolean) as RawCommunityJob[];
      } catch (err: any) {
        clearTimeout(tid);
        console.warn(`[Workday] Failed fetching ${company.name} jobs:`, err.message);
        return [];
      }
    },
    3
  );
}

export async function fetchSmartRecruitersJobs(
  companies: SmartRecruitersCompany[],
  keywords: string[],
  targetRoles: string[],
  searchLocation: string,
  prefersRemote: boolean,
  yearsOfExperience: number = 0
): Promise<RawCommunityJob[]> {
  const results = await Promise.allSettled(
    companies.map(async (company): Promise<RawCommunityJob[]> => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      
      try {
        const searchUrl = globalState.templates.smartrecruitersPostings.replace(/{slug}/g, company.slug);
        const response = await fetch(searchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
          signal: ctrl.signal
        });
        
        clearTimeout(tid);
        
        if (!response.ok) {
          console.warn(`[SmartRecruiters] Fetch failed for ${company.name}: HTTP ${response.status}`);
          return [];
        }
        
        const data = await response.json();
        const postings = (data.content || []) as any[];
        
        const matchingPostings = postings.filter(p => {
          const title = p.name || '';
          return matchesKeywords(title, keywords) && !isBlocklistedRole(title, targetRoles, yearsOfExperience);
        });
        
        const detailedJobs = await Promise.all(
          matchingPostings.map(async (p): Promise<RawCommunityJob | null> => {
            const detailUrl = globalState.templates.smartrecruitersDetails.replace(/{slug}/g, company.slug).replace(/{id}/g, p.id);
            const dCtrl = new AbortController();
            const dTid = setTimeout(() => dCtrl.abort(), 5000);
            
            try {
              const dRes = await fetch(detailUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                signal: dCtrl.signal
              });
              clearTimeout(dTid);
              
              if (dRes.ok) {
                const dData = await dRes.json();
                const jobDescHtml = [
                  dData.jobAd?.sections?.jobDescription?.text || '',
                  dData.jobAd?.sections?.qualifications?.text || '',
                  dData.jobAd?.sections?.additionalInformation?.text || ''
                ].filter(Boolean).join('\n\n');
                const desc = stripHtmlCommunity(jobDescHtml).slice(0, 15000);
                
                const city = dData.location?.city || '';
                const region = dData.location?.region || '';
                const country = dData.location?.country || '';
                const loc = [city, region, country].filter(Boolean).join(', ') || 'Remote';
                
                if (!matchesLocation(loc, searchLocation, prefersRemote) || exceedsExperienceRequirement(jobDescHtml, yearsOfExperience)) {
                  return null;
                }
                
                return {
                  title: p.name,
                  company: company.name,
                  location: loc,
                  description: desc,
                  url: `https://careers.smartrecruiters.com/${company.slug}/${p.id}`,
                  postedAt: p.releasedDate || new Date().toISOString(),
                  type: 'Full-Time',
                  isRemote: loc.toLowerCase().includes('remote') || dData.location?.remote === true,
                  source: 'smartrecruiters' as const
                };
              }
            } catch (err: any) {
              clearTimeout(dTid);
              console.warn(`[SmartRecruiters] Details failed for ${company.name} job ${p.id}:`, err.message);
            }
            
            const loc = [p.location?.city, p.location?.region, p.location?.country].filter(Boolean).join(', ') || 'Remote';
            if (!matchesLocation(loc, searchLocation, prefersRemote)) {
              return null;
            }
            return {
              title: p.name,
              company: company.name,
              location: loc,
              description: 'Position details available on application site.',
              url: `https://careers.smartrecruiters.com/${company.slug}/${p.id}`,
              postedAt: p.releasedDate || new Date().toISOString(),
              type: 'Full-Time',
              isRemote: loc.toLowerCase().includes('remote'),
              source: 'smartrecruiters' as const
            };
          })
        );
        
        return detailedJobs.filter(Boolean) as RawCommunityJob[];
      } catch (err: any) {
        clearTimeout(tid);
        console.warn(`[SmartRecruiters] Failed fetching ${company.name} jobs:`, err.message);
        return [];
      }
    })
  );
  
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

export async function fetchRemoteOKJobs(
  keywords: string[], 
  skills: string[],
  targetRoles: string[],
  searchLocation: string,
  prefersRemote: boolean,
  yearsOfExperience: number = 0
): Promise<RawCommunityJob[]> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch('https://remoteok.com/api', {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobSearchAgent/1.0)' },
    });
    clearTimeout(tid);
    if (!res.ok) return [];
    const raw: any[] = await res.json();
    const allKw = [...keywords, ...skills.map(s => s.toLowerCase())];
    return raw.slice(1).filter(Boolean)
      .filter(j => {
        if (!j.position || !j.company) return false;
        const title = j.position;
        const tags = (j.tags || []).map((t: string) => t.toLowerCase());
        const loc = j.location || 'Remote';
        
        const titleMatches = matchesKeywords(title, allKw) || tags.some((t: string) => allKw.some(kw => t.includes(kw)));
        return titleMatches && 
               !isBlocklistedRole(title, targetRoles, yearsOfExperience) && 
               !exceedsExperienceRequirement(j.description || '', yearsOfExperience) &&
               matchesLocation(loc, searchLocation, prefersRemote);
      })
      .map(j => ({
        title: j.position,
        company: j.company,
        location: j.location || 'Remote',
        description: j.description ? stripHtmlCommunity(j.description).slice(0, 15000) : '',
        url: j.apply_url || j.url || '',
        applyUrl: j.apply_url,
        postedAt: j.date || new Date().toISOString(),
        type: 'Full-Time',
        salary: j.salary || (j.salaryMin ? `$${Math.round(j.salaryMin / 1000)}k–$${Math.round(j.salaryMax / 1000)}k` : undefined),
        isRemote: true,
        source: 'remoteok' as const,
      }));
  } catch { clearTimeout(tid); console.warn('[RemoteOK] Fetch failed'); return []; }
}

export async function fetchRemotiveJobs(
  keywords: string[],
  skills: string[],
  targetRoles: string[],
  searchLocation: string,
  prefersRemote: boolean,
  yearsOfExperience: number = 0
): Promise<RawCommunityJob[]> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 10000);
  try {
    const categories: string[] = [];
    const rolesLower = targetRoles.map(r => r.toLowerCase());
    
    if (rolesLower.some(r => r.includes('design') || r.includes('ui') || r.includes('ux') || r.includes('creative'))) {
      categories.push('design');
    }
    if (rolesLower.some(r => r.includes('product') || r.includes('pm') || r.includes('program manager'))) {
      categories.push('product');
    }
    if (rolesLower.some(r => r.includes('data') || r.includes('analyst') || r.includes('analytics') || r.includes('science'))) {
      categories.push('data');
    }
    if (rolesLower.some(r => r.includes('devops') || r.includes('sre') || r.includes('reliability') || r.includes('infrastructure') || r.includes('sysadmin') || r.includes('platform'))) {
      categories.push('devops');
    }
    
    if (categories.length === 0 || rolesLower.some(r => r.includes('software') || r.includes('engineer') || r.includes('developer') || r.includes('frontend') || r.includes('backend') || r.includes('fullstack') || r.includes('web') || r.includes('tech'))) {
      categories.push('software-development');
    }

    const allJobs: RawCommunityJob[] = [];
    const allKw = [...keywords, ...skills.map(s => s.toLowerCase())];

    await Promise.all(categories.map(async (category) => {
      const url = `https://remotive.com/api/remote-jobs?category=${category}`;
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobSearchAgent/1.0)' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const raw = data.jobs || [];
        const mapped = raw
          .filter((j: any) => {
            if (!j.title || !j.company_name) return false;
            const title = j.title;
            const tags = (j.tags || []).map((t: string) => t.toLowerCase());
            const loc = j.candidate_required_location || 'Remote';
            
            const titleMatches = matchesKeywords(title, allKw) || tags.some((t: string) => allKw.some(kw => t.includes(kw)));
            return titleMatches &&
                   !isBlocklistedRole(title, targetRoles, yearsOfExperience) &&
                   !exceedsExperienceRequirement(j.description || '', yearsOfExperience) &&
                   matchesLocation(loc, searchLocation, prefersRemote);
          })
          .map((j: any) => ({
            title: j.title,
            company: j.company_name,
            location: j.candidate_required_location || 'Remote',
            description: j.description ? stripHtmlCommunity(j.description).slice(0, 15000) : '',
            url: j.url || '',
            postedAt: j.publication_date || new Date().toISOString(),
            type: j.job_type === 'contract' ? 'Contract' : 'Full-Time',
            salary: j.salary || undefined,
            isRemote: true,
            source: 'remotive' as const,
          }));
        allJobs.push(...mapped);
      } catch (e: any) {
        console.warn(`[Remotive] Category ${category} fetch failed:`, e.message);
      }
    }));

    clearTimeout(tid);
    
    const seen = new Set<string>();
    return allJobs.filter(job => {
      const key = `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  } catch (err: any) {
    clearTimeout(tid);
    console.warn('[Remotive] Sourcing failed:', err.message);
    return [];
  }
}

export async function fetchHackerNewsJobs(
  keywords: string[],
  skills: string[],
  targetRoles: string[],
  searchLocation: string,
  prefersRemote: boolean,
  yearsOfExperience: number = 0
): Promise<RawCommunityJob[]> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12000);
  try {
    const searchUrl = 'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=Who%20is%2520hiring';
    const searchRes = await fetch(searchUrl, { signal: ctrl.signal });
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    const hits = searchData.hits || [];
    const story = hits.find((h: any) => h.title && h.title.includes("Who is hiring?"));
    if (!story) {
      console.warn('[HackerNews] Latest hiring story not found in hits');
      return [];
    }

    const itemUrl = `https://hn.algolia.com/api/v1/items/${story.objectID}`;
    const itemRes = await fetch(itemUrl, { signal: ctrl.signal });
    if (!itemRes.ok) return [];
    const itemData = await itemRes.json();
    const comments = itemData.children || [];

    const allKw = [...keywords, ...skills.map(s => s.toLowerCase())];
    const results: RawCommunityJob[] = [];

    for (const comment of comments) {
      if (!comment.text) continue;
      
      const rawText = comment.text;
      const strippedText = stripHtmlCommunity(rawText);
      const textLower = strippedText.toLowerCase();

      const hasKeywords = allKw.some(kw => textLower.includes(kw));
      if (!hasKeywords) continue;

      const lines = strippedText.split('\n').map(l => l.trim()).filter(Boolean);
      const firstLine = lines[0] ? lines[0].substring(0, 80) : 'Hacker News Post';

      results.push({
        title: firstLine,
        company: 'Hacker News Community',
        location: 'Remote / On-site',
        description: strippedText.slice(0, 15000),
        url: `https://news.ycombinator.com/item?id=${comment.id}`,
        postedAt: comment.created_at || new Date().toISOString(),
        type: 'Full-Time',
        isRemote: true,
        source: 'hackernews' as const,
      });
    }

    clearTimeout(tid);
    return results;
  } catch (err: any) {
    clearTimeout(tid);
    console.warn('[HackerNews] Sourcing failed:', err.message);
    return [];
  }
}
