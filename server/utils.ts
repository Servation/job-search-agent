/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ROLE_TITLE_BLOCKLIST, ROLE_KEYWORD_EXCLUSIONS, SLUG_DISPLAY_NAMES } from './config';

/**
 * Utility to execute an asynchronous map operation with a concurrency limit.
 * Helps prevent socket exhaustion and rate-limiting when making numerous parallel HTTP requests.
 */
export async function asyncMapConcurrent<T, U>(
  array: T[],
  limit: number,
  mapper: (item: T) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(array.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < array.length) {
      const index = currentIndex++;
      results[index] = await mapper(array[index]);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(limit, array.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

/**
 * Checks if a URL structure corresponds to a specific job application page, rather than a generic root/career page.
 */
export function isSpecificJobPost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    
    // Known applicant tracking systems (ATS)
    const isATS = 
      hostname.includes('lever.co') || 
      hostname.includes('greenhouse.io') || 
      hostname.includes('myworkdayjobs.com') ||
      hostname.includes('ashbyhq.com') ||
      hostname.includes('smartrecruiters.com') ||
      hostname.includes('bamboohr.com') ||
      hostname.includes('recruitee.com') ||
      hostname.includes('workable.com') ||
      hostname.includes('jobvite.com');

    const pathSegments = pathname.split('/').filter(Boolean);

    if (isATS) {
      // If it's just the company name root on the ATS board, it's not a job post
      if (pathSegments.length <= 1) {
        return false;
      }
      // Greenhouse specific: must contain /jobs/
      if (hostname.includes('greenhouse.io') && !pathname.includes('/jobs/')) {
        return false;
      }
      // Workday specific: must contain /job/
      if (hostname.includes('myworkdayjobs.com') && !pathname.includes('/job/')) {
        return false;
      }
      return true;
    }
    
    // Specific LinkedIn job posting check
    if (hostname.includes('linkedin.com') && pathname.includes('/jobs/view/')) {
      return true;
    }
    
    // Specific Indeed job posting check
    if (hostname.includes('indeed.com') && (pathname.includes('/rc/clk') || pathname.includes('/viewjob'))) {
      return true;
    }

    // Generic career portal checks - if path matches these exactly or is too simple, it's NOT a specific job post
    const genericTerms = [
      '/careers', '/careers/', '/career', '/career/', 
      '/jobs', '/jobs/', '/job', '/job/', 
      '/join', '/join/', '/join-us', '/join-us/',
      '/work-at', '/work-at/', '/work-with-us', '/work-with-us/',
      '/about/careers', '/about/jobs', '/hiring', '/hiring/',
      '/about', '/about/', '/our-story', '/our-story/'
    ];
    
    if (genericTerms.some(term => pathname === term)) {
      return false;
    }
    
    // If no path or just one shallow generic segment, it's not a specific job
    if (pathSegments.length === 0) return false;
    if (pathSegments.length === 1) {
      const singleSeg = pathSegments[0];
      const isLikelyGeneric = ['careers', 'jobs', 'career', 'job', 'hiring', 'about', 'join', 'portal', 'search'].includes(singleSeg);
      if (isLikelyGeneric) return false;
    }
    
    // Check if the URL has common job details patterns
    const hasJobIndicators = 
      /\d+/.test(pathname) || // contains numbers (often job IDs)
      pathname.includes('/job/') ||
      pathname.includes('/jobs/') ||
      pathname.includes('/careers/') ||
      pathname.includes('/vacancy/') ||
      pathname.includes('/apply/') ||
      pathname.includes('/details/') ||
      pathname.includes('-eng-') || 
      pathname.includes('-engineer-') ||
      pathname.includes('-manager-') ||
      pathSegments.some(seg => seg.length > 12); // long IDs/hashes

    return hasJobIndicators;
  } catch (_) {
    return false;
  }
}

/**
 * Verifies if a URL is reachable, follows redirects, and checks that it's a real job application page.
 */
export async function verifyJobUrl(url: string): Promise<{ isValid: boolean; resolvedUrl: string }> {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return { isValid: false, resolvedUrl: url };
  }

  // Pre-filter: Check if URL is structured as a specific job post rather than a general root/career page
  const hasSpecificStructure = isSpecificJobPost(url);
  if (!hasSpecificStructure) {
    return { isValid: false, resolvedUrl: url };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const status = response.status;
    const finalUrl = response.url || url;
    
    // Re-check specific job post structure on the resolved final URL
    const isFinalUrlSpecific = isSpecificJobPost(finalUrl);
    if (!isFinalUrlSpecific) {
      return { isValid: false, resolvedUrl: finalUrl };
    }

    // A status of 200/OK or redirects indicates reachable
    const isPageReachable = response.ok || status === 301 || status === 302;
    
    // If the server blocks us (403, 429, etc.), we still consider it valid IF the URL structure is strongly a specific job post.
    const isServerBlocking = status === 403 || status === 429 || status === 401;
    
    const isValid = isPageReachable || isServerBlocking;

    return {
      isValid,
      resolvedUrl: finalUrl
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn(`URL validation failed for ${url}:`, err.message || err);
    // If the network request failed (e.g. timeout, DNS resolution, fetch failed)
    // but the URL structure is very clearly a specific job post (like Lever/Greenhouse with job IDs),
    // we can still mark it as valid to prevent false negatives from bot-protection blocks.
    const isHighlyLikelyJob = 
      url.includes('lever.co') || 
      url.includes('greenhouse.io') || 
      url.includes('myworkdayjobs.com') ||
      url.includes('ashbyhq.com');
      
    return { 
      isValid: isHighlyLikelyJob, 
      resolvedUrl: url 
    };
  }
}

export function detectUSState(locStr: string): string | null {
  const stateNames: { [key: string]: string } = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
    'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
    'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
    'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
    'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH',
    'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
    'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA',
    'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', 'tennessee': 'TN',
    'texas': 'TX', 'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
    'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
  };

  const lowerStr = locStr.toLowerCase();
  for (const [name, abbrev] of Object.entries(stateNames)) {
    const regex = new RegExp(`\\b${name}\\b`, 'i');
    if (regex.test(lowerStr)) {
      return abbrev;
    }
  }

  for (const abbrev of Object.values(stateNames)) {
    const regex = new RegExp(`\\b${abbrev}\\b`);
    if (regex.test(locStr)) {
      return abbrev;
    }
  }

  for (const abbrev of Object.values(stateNames)) {
    const regex = new RegExp(`,\\s*${abbrev.toLowerCase()}\\b`);
    if (regex.test(lowerStr)) {
      return abbrev;
    }
  }

  return null;
}

export function normalizeLocation(locStr: string): string {
  if (!locStr) return '';
  let normalized = locStr.toLowerCase().trim();

  // Replace common country abbreviations
  normalized = normalized.replace(/\b(us|usa)\b/g, 'united states');
  normalized = normalized.replace(/\buk\b/g, 'united kingdom');

  const stateAbbrevToName: { [key: string]: string } = {
    'al': 'alabama', 'ak': 'alaska', 'az': 'arizona', 'ar': 'arkansas', 'ca': 'california',
    'co': 'colorado', 'ct': 'connecticut', 'de': 'delaware', 'fl': 'florida', 'ga': 'georgia',
    'hi': 'hawaii', 'id': 'idaho', 'il': 'illinois', 'in': 'indiana', 'ia': 'iowa',
    'ks': 'kansas', 'ky': 'kentucky', 'la': 'louisiana', 'me': 'maine', 'md': 'maryland',
    'ma': 'massachusetts', 'mi': 'michigan', 'mn': 'minnesota', 'ms': 'mississippi',
    'mo': 'missouri', 'mt': 'montana', 'ne': 'nebraska', 'nv': 'nevada', 'nh': 'new hampshire',
    'nj': 'new jersey', 'nm': 'new mexico', 'ny': 'new york', 'nc': 'north carolina',
    'nd': 'north dakota', 'oh': 'ohio', 'ok': 'oklahoma', 'or': 'oregon', 'pa': 'pennsylvania',
    'ri': 'rhode island', 'sc': 'south carolina', 'sd': 'south dakota', 'tn': 'tennessee',
    'tx': 'texas', 'ut': 'utah', 'vt': 'vermont', 'va': 'virginia', 'wa': 'washington',
    'wv': 'west virginia', 'wi': 'wisconsin', 'wy': 'wyoming'
  };

  for (const [abbrev, name] of Object.entries(stateAbbrevToName)) {
    // 1. Match preceded by comma, e.g. ", ca"
    const commaRegex = new RegExp(`,\\s*\\b${abbrev}\\b`, 'g');
    normalized = normalized.replace(commaRegex, `, ${name}`);

    // 2. Match at the very end of string, e.g. "portland or" -> "portland oregon"
    const endRegex = new RegExp(`\\b${abbrev}\\b$`, 'g');
    normalized = normalized.replace(endRegex, name);
  }

  return normalized;
}

export function matchesLocation(jobLocation: string, searchLocation: string, prefersRemote: boolean): boolean {
  const normJob = normalizeLocation(jobLocation);
  if (!searchLocation) return true;
  const normSearch = normalizeLocation(searchLocation);

  const isUS = (s: string) => {
    return /\b(united states|america)\b/i.test(s);
  };

  const isSearchUS = isUS(normSearch) || !!detectUSState(normSearch);
  const isGenericUSSearch = ['united states', 'us', 'usa', 'america'].includes(normSearch.trim());

  if (isSearchUS) {
    const nonUSCountries = [
      'india', 'germany', 'london', 'uk', 'united kingdom', 'canada', 'brazil', 
      'poland', 'romania', 'france', 'spain', 'australia', 'singapore', 'japan', 
      'netherlands', 'sweden', 'switzerland', 'ireland', 'china', 'berlin', 'munich', 
      'bangalore', 'pune', 'delhi', 'mumbai', 'hyderabad', 'toronto', 'vancouver', 'madrid', 'barcelona'
    ];
    
    const mentionsNonUS = nonUSCountries.some(country => {
      const regex = new RegExp(`\\b${country}\\b`, 'i');
      return regex.test(normJob);
    });

    if (mentionsNonUS) {
      const mentionsUS = isUS(normJob) || !!detectUSState(normJob);
      if (!mentionsUS) {
        return false;
      }
    }
  }

  const searchState = detectUSState(normSearch);
  if (searchState) {
    const jobState = detectUSState(normJob);
    if (jobState && jobState !== searchState) {
      return false;
    }
  }

  if (prefersRemote && normJob.includes('remote')) {
    return true;
  }

  if (isGenericUSSearch && isUS(normJob)) {
    return true;
  }

  if (!normJob.includes(normSearch) && !normJob.includes('remote')) {
    return false;
  }

  return true;
}

export function extractRoleKeywords(targetRoles: string[]): string[] {
  const stop = new Set(ROLE_KEYWORD_EXCLUSIONS);
  return [...new Set(
    targetRoles.flatMap(r =>
      r.toLowerCase().split(/[\s,\/\-\(\)]+/).filter(w => w.length >= 4 && !stop.has(w))
    )
  )];
}

export function matchesKeywords(title: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const text = title.toLowerCase();
  return keywords.some(kw => text.includes(kw));
}

export function communitySlugToName(slug: string): string {
  return SLUG_DISPLAY_NAMES[slug] ??
    slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function stripHtmlCommunity(html: string): string {
  if (!html) return '';
  // 1. Decode entities first so encoded tags like &lt;div&gt; turn into <div>
  let decoded = html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // 2. Strip scripts, styles, and html tags
  decoded = decoded
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  return decoded.replace(/\s+/g, ' ').trim();
}

export function isBlocklistedRole(title: string, targetRoles: string[], yearsOfExperience: number = 0): boolean {
  const lowerTitle = title.toLowerCase();
  const lowerTargets = targetRoles.map(r => r.toLowerCase());

  // Check title experience mismatch based on years of experience
  if (yearsOfExperience > 0) {
    // If candidate has less than 5 years of experience, block Staff, Principal, Director, VP, Manager, Architect roles
    if (yearsOfExperience < 5) {
      const seniorBlocked = ['staff', 'principal', 'director', 'vp', 'vice president', 'manager', 'architect'];
      const isSeniorRole = seniorBlocked.some(term => {
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        return regex.test(lowerTitle);
      });
      if (isSeniorRole) {
        return true; // Strictly block, no exceptions
      }
    }

    // If candidate has less than 4 years of experience, block Lead roles
    if (yearsOfExperience < 4) {
      const regex = /\blead\b/i;
      if (regex.test(lowerTitle)) {
        return true; // Strictly block, no exceptions
      }
    }

    // If candidate has less than 3 years of experience, also block Senior / Sr roles
    if (yearsOfExperience < 3) {
      const regex = /\bsenior\b|\bsr\b/i;
      if (regex.test(lowerTitle)) {
        return true; // Strictly block, no exceptions
      }
    }
  }
  
  return ROLE_TITLE_BLOCKLIST.some(blocked => {
    if (lowerTitle.includes(blocked)) {
      const userWantsIt = lowerTargets.some(target => target.includes(blocked));
      if (!userWantsIt) {
        return true;
      }
    }
    return false;
  });
}

export function exceedsExperienceRequirement(description: string, yearsOfExperience: number): boolean {
  if (!yearsOfExperience || yearsOfExperience <= 0) return false;

  const text = description.toLowerCase();
  const maxAllowed = yearsOfExperience + 2;

  // Regex patterns to capture years of experience requirements
  const regexes = [
    /\b(\d+)\s*\+?\s*yrs?\b/g,
    /\b(\d+)\s*\+?\s*years?\b/g,
    /\b(\d+)\s*-\s*(\d+)\s*years?\b/g,
    /\b(\d+)\s*-\s*(\d+)\s*yrs?\b/g,
    /\b(\d+)\s*to\s*(\d+)\s*years?\b/g,
    /\b(\d+)\s*to\s*(\d+)\s*yrs?\b/g,
  ];

  for (const regex of regexes) {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      const yrs = parseInt(match[1], 10);
      if (!isNaN(yrs)) {
        // Find if this is experience-related context
        const matchIndex = match.index;
        const start = Math.max(0, matchIndex - 60);
        const end = Math.min(text.length, matchIndex + match[0].length + 60);
        const context = text.slice(start, end);
        
        const isExperienceRelated = /experience|require|minimum|at least|work|industry|background|professional|designing|building|developing/i.test(context);
        const isExclusionPhrase = /team has|we have|company has|our developers have|our engineers have|over\s+\d+\s+years\s+of\s+(combined|total)/i.test(context);

        if (isExperienceRelated && !isExclusionPhrase && yrs > maxAllowed) {
          return true;
        }
      }
    }
  }

  return false;
}

export function normalizeJobUrl(urlStr: string): string {
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
}

export function extractJobNumber(urlStr: string): string | null {
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
}

export function extractSalaryWithRegex(text: string): { salary: string; salaryNum: number } | null {
  // 1. Annual ranges with 'k': e.g., $100k - $150k, $120k to $180k
  const kRangeRegex = /\$([0-9]+(?:\.[0-9]+)?)\s*(?:k|K)\s*(?:-|–|to)\s*\$([0-9]+(?:\.[0-9]+)?)\s*(?:k|K)/;
  const kRangeMatch = text.match(kRangeRegex);
  if (kRangeMatch) {
    const min = parseFloat(kRangeMatch[1]) * 1000;
    const max = parseFloat(kRangeMatch[2]) * 1000;
    return {
      salary: `$${Math.round(min/1000)}k–$${Math.round(max/1000)}k`,
      salaryNum: max
    };
  }

  // 2. Annual ranges with full numbers: e.g., $100,000 - $150,000, $120000 to $160000
  const fullRangeRegex = /\$([0-9]{1,3}(?:,[0-9]{3})*)\s*(?:-|–|to)\s*\$([0-9]{1,3}(?:,[0-9]{3})*)/;
  const fullRangeMatch = text.match(fullRangeRegex);
  if (fullRangeMatch) {
    const min = parseInt(fullRangeMatch[1].replace(/,/g, ''), 10);
    const max = parseInt(fullRangeMatch[2].replace(/,/g, ''), 10);
    if (min >= 20000 && max >= 20000) {
      return {
        salary: `$${Math.round(min/1000)}k–$${Math.round(max/1000)}k`,
        salaryNum: max
      };
    }
  }

  // 3. Hourly ranges: e.g., $50 - $75/hr, $60 to $85 per hour
  const hourlyRangeRegex = /\$([0-9]+(?:\.[0-9]+)?)\s*(?:-|–|to)\s*\$([0-9]+(?:\.[0-9]+)?)\s*(?:\/hr|\/hour|per hour|an hour|hourly)/i;
  const hourlyRangeMatch = text.match(hourlyRangeRegex);
  if (hourlyRangeMatch) {
    const minRate = parseFloat(hourlyRangeMatch[1]);
    const maxRate = parseFloat(hourlyRangeMatch[2]);
    if (minRate < 1000 && maxRate < 1000) {
      const annualMin = minRate * 2000;
      const annualMax = maxRate * 2000;
      return {
        salary: `$${minRate}–$${maxRate}/hr`,
        salaryNum: annualMax
      };
    }
  }

  // 4. Single annual salary: e.g., $120,000 or $120k base
  const singleKRegex = /\$([0-9]+(?:\.[0-9]+)?)\s*(?:k|K)\b/;
  const singleKMatch = text.match(singleKRegex);
  if (singleKMatch) {
    const val = parseFloat(singleKMatch[1]) * 1000;
    return {
      salary: `$${Math.round(val/1000)}k`,
      salaryNum: val
    };
  }

  const singleFullRegex = /\$([0-9]{1,3}(?:,[0-9]{3})+)\b/;
  const singleFullMatch = text.match(singleFullRegex);
  if (singleFullMatch) {
    const val = parseInt(singleFullMatch[1].replace(/,/g, ''), 10);
    if (val >= 20000) {
      return {
        salary: `$${Math.round(val/1000)}k`,
        salaryNum: val
      };
    }
  }

  return null;
}

export function getDomain(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export async function fetchJobHtml(urlStr: string): Promise<{ text: string; status: number; finalUrl: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
  
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ];
  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

  try {
    const res = await fetch(urlStr, {
      method: 'GET',
      headers: {
        'User-Agent': randomUserAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
      redirect: 'follow'
    });
    
    clearTimeout(timeoutId);
    
    const finalUrl = res.url || urlStr;
    if (!res.ok) {
      return { text: '', status: res.status, finalUrl };
    }
    
    const html = await res.text();
    let text = html
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
      .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
      
    const isJSBlocked = 
      /enable javascript/i.test(html) || 
      /enable javascript/i.test(text) ||
      /please enable js/i.test(html) ||
      /checking your browser before accessing/i.test(html) ||
      text.length < 400 ||
      urlStr.includes('myworkdayjobs.com');

    if (isJSBlocked) {
      console.log(`[Refiner] Detected JS block or SPA for ${urlStr}, falling back to Jina Reader...`);
      try {
        const jinaController = new AbortController();
        const jinaTimeoutId = setTimeout(() => jinaController.abort(), 15000);
        const jinaRes = await fetch(`https://r.jina.ai/${urlStr}`, {
          signal: jinaController.signal
        });
        clearTimeout(jinaTimeoutId);
        
        if (jinaRes.ok) {
          const jinaText = await jinaRes.text();
          if (jinaText && jinaText.length > 100) {
            text = jinaText;
          }
        }
      } catch (e: any) {
        console.warn(`[Refiner] Jina fallback failed for ${urlStr}:`, e.message);
      }
    }

    return { text, status: res.status, finalUrl };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn(`[Refiner] Fetch failed for ${urlStr}:`, err.message);
    return { text: '', status: err.name === 'AbortError' ? 408 : 500, finalUrl: urlStr };
  }
}

export function appendRemainingDescription(original: string, fetched: string): string {
  if (!original) return fetched;
  if (!fetched) return original;

  const normOriginal = original.replace(/\s+/g, ' ').trim();
  const normFetched = fetched.replace(/\s+/g, ' ').trim();

  let matchIdx = -1;
  let matchedAnchorLength = 0;
  const anchorSizes = [100, 80, 60, 40, 20];
  for (const size of anchorSizes) {
    if (normOriginal.length >= size) {
      const anchor = normOriginal.slice(-size);
      matchIdx = normFetched.indexOf(anchor);
      if (matchIdx !== -1) {
        matchedAnchorLength = size;
        break;
      }
    }
  }

  if (matchIdx !== -1) {
    const remaining = normFetched.slice(matchIdx + matchedAnchorLength);
    if (remaining.trim().length === 0) {
      return original;
    }
    return original + remaining;
  }

  // Fallback: Use the longer of the two texts
  return fetched.length > original.length ? fetched : original;
}

export function checkDescriptionLocationMismatch(descriptionText: string, searchLocation: string, prefersRemote: boolean): string | null {
  if (!searchLocation) return null;
  const normSearch = normalizeLocation(searchLocation);
  const isUS = (s: string) => /\b(united states|america|us|usa)\b/i.test(s);
  const searchState = detectUSState(normSearch);

  const lowerDesc = descriptionText.toLowerCase();

  // 1. Check for explicit residency restrictions in other states if search location is a specific state
  if (searchState) {
    const stateRegex = /\b(must reside in|only open to (residents of|candidates in)|work from|must be located in|based in|reside in|residents of|candidates residing in)\b\s*([a-zA-Z\s,]{2,30})/gi;
    let match;
    while ((match = stateRegex.exec(lowerDesc)) !== null) {
      const locationPart = match[3];
      const detectedState = detectUSState(normalizeLocation(locationPart));
      if (detectedState && detectedState !== searchState) {
        return `Location Mismatch: Requires residency in ${detectedState.toUpperCase()} (preferred is ${searchState.toUpperCase()})`;
      }
    }
  }

  // 2. Check for country-level mismatch if search location is US
  const isSearchUS = isUS(normSearch) || !!searchState;
  if (isSearchUS) {
    const nonUSCountries = [
      'india', 'germany', 'london', 'uk', 'united kingdom', 'canada', 'brazil', 
      'poland', 'romania', 'france', 'spain', 'australia', 'singapore', 'japan', 
      'netherlands', 'sweden', 'switzerland', 'ireland', 'china', 'toronto', 'vancouver'
    ];
    for (const country of nonUSCountries) {
      const countryRegex = new RegExp(`\\b(must reside in|only open to (residents of|candidates in)|work from|based in|reside in|residents of)\\b\\s*([a-zA-Z\\s]{2,30})?\\b${country}\\b`, 'i');
      if (countryRegex.test(lowerDesc)) {
        if (!lowerDesc.includes('united states') && !lowerDesc.includes('us remote') && !lowerDesc.includes('usa')) {
          return `Location Mismatch: Restricted to ${country.toUpperCase()}`;
        }
      }
    }
  }

  return null;
}
