/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { createRequire } from 'module';

// Import Types
import { Job, ResumeProfile, LLMConfig, PreventedDuplicate } from './src/types';

// Import Backend Submodules
import { PORT, globalState, addRefinerLog } from './server/config';
import { readDb, writeDb } from './server/db';
import { 
  verifyJobUrl, 
  isSpecificJobPost, 
  extractRoleKeywords, 
  matchesKeywords, 
  isBlocklistedRole, 
  exceedsExperienceRequirement, 
  normalizeJobUrl, 
  extractJobNumber, 
  stripHtmlCommunity,
  getDomain
} from './server/utils';
import { 
  getAIClient, 
  queryCustomLLM, 
  queryCustomLLMAdaptive, 
  scoreCommunityJobs 
} from './server/llm';
import { 
  fetchGreenhouseJobs, 
  fetchLeverJobs, 
  fetchAshbyJobs, 
  fetchWorkdayJobs, 
  checkSourceHealth, 
  updateCompanyDirectoriesFromRegistry,
  RawCommunityJob,
  harvestWorkdayUrl
} from './server/sourcing';
import { 
  runBackgroundSourcing, 
  runRefinementCycle, 
  startBackgroundRefiner 
} from './server/scheduler';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

dotenv.config();

const app = express();

app.use(express.json({ limit: '10mb' }));

function updateScannerActive() {
  globalState.lastScannerActiveTime = Date.now();
}

/// 1. Endpoint to Parse Resume Raw Text or Document Files
app.post('/api/resume/parse', async (req, res) => {
  try {
    updateScannerActive();
    const { rawText, fileBase64, mimeType, llmConfig } = req.body;
    if ((!rawText || typeof rawText !== 'string' || rawText.trim() === '') && !fileBase64) {
      res.status(400).json({ error: 'Resume rawText or uploaded file is required.' });
      return;
    }

    if (!llmConfig || !llmConfig.endpoint) {
      res.status(400).json({ error: 'Selected LLM Configuration is required for parsing. Configure it in Candidate Credentials Profile settings.' });
      return;
    }

    // Extract raw text from base64 document if needed
    let resumeTextContent = "";
    if (fileBase64 && mimeType) {
      if (mimeType === 'application/pdf') {
        try {
          const buffer = new Uint8Array(Buffer.from(fileBase64, 'base64'));
          const pdfParser = new PDFParse({ data: buffer });
          const textResult = await pdfParser.getText();
          resumeTextContent = textResult.text || "";
        } catch (pdfErr: any) {
          console.error("Error extracting text from PDF:", pdfErr);
          res.status(400).json({ error: "Failed to extract text from PDF: " + pdfErr.message });
          return;
        }
      } else {
        const buffer = Buffer.from(fileBase64, 'base64');
        resumeTextContent = buffer.toString('utf-8');
      }
    } else {
      resumeTextContent = rawText || "";
    }

    if (!resumeTextContent || resumeTextContent.trim() === "") {
      res.status(400).json({ error: 'Resume text content is empty.' });
      return;
    }

    const prompt = `
      You are an expert ATS (Applicant Tracking System) resume analyzer. Analyze the following resume raw text and extract structured criteria:
      1. Candidate Name (parsedName)
      2. List of core technical skills / keyword skills (parsedSkills)
      3. Suggested target roles matching their background (targetRoles)
      4. General location constraints or preferences (preferredLocation)
      5. Reconstructed clean plain text from the document (extractedRawText)

      Resume Text:
      """
      ${resumeTextContent}
      """

      Your response MUST be a valid JSON object matching this schema:
      {
        "parsedName": "Candidate Name",
        "parsedSkills": ["Skill 1", "Skill 2", ...],
        "targetRoles": ["Role 1", "Role 2", ...],
        "preferredLocation": "Location or Remote",
        "extractedRawText": "Cleaned plain text of the resume"
      }

      Do not include markdown code block syntax (like \`\`\`json) or any explanations, comments, or extra text. Return ONLY the raw JSON string.
    `;

    console.log(`[Resume Parse] Querying custom LLM model "${llmConfig.modelName}" at "${llmConfig.endpoint}"`);
    const responseText = await queryCustomLLM(
      llmConfig.endpoint,
      llmConfig.apiKey,
      llmConfig.modelName,
      prompt,
      2,
      (llmConfig.timeout || 30) * 1000
    );

    // Clean any markdown code blocks if the LLM outputted them anyway
    let cleanedText = responseText.trim();
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```(json)?\n/, '').replace(/\n```$/, '');
    }

    const parsedData = JSON.parse(cleanedText);
    res.json(parsedData);
  } catch (err: any) {
    console.error('Error parsing resume:', err);
    res.status(500).json({ error: err.message || 'Internal server error while parsing resume.' });
  }
});

// 1.5. Endpoint to Source matching jobs from community boards and web searches (no LLM evaluation)
app.post('/api/jobs/source', async (req, res) => {
  try {
    updateScannerActive();
    const {
      targetRoles = [],
      skills = [],
      searchLocation = 'United States',
      prefersRemote = true,
      prefersHybrid = true,
      prefersOnSite = true,
      savedJobs = [],
      yearsOfExperience = 0,
    } = req.body;

    const roleKeywords = extractRoleKeywords(targetRoles);
    
    // Update company directory mappings weekly from remote registry
    await updateCompanyDirectoriesFromRegistry();

    // Run dynamic source health checks
    const health = await checkSourceHealth(searchLocation, prefersRemote);

    console.log('[Source Endpoint] Sourcing community and F500 jobs...');
    // 1. Fetch community and F500 jobs in parallel, bypassing degraded/offline channels
    const [ghJobs, lvJobs, ashJobs, wdJobs] = await Promise.all([
      health.greenhouse ? fetchGreenhouseJobs(globalState.cachedGreenhouseSlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
      health.lever ? fetchLeverJobs(globalState.cachedLeverSlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
      health.ashby ? fetchAshbyJobs(globalState.cachedAshbySlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
      health.workday ? fetchWorkdayJobs(globalState.cachedWorkdayDirectory, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
    ]);

    let communityJobs = [...ghJobs, ...lvJobs, ...ashJobs, ...wdJobs];
    console.log(`[Source Endpoint] Sourced counts -> Greenhouse: ${ghJobs.length}, Lever: ${lvJobs.length}, Ashby: ${ashJobs.length}, Workday: ${wdJobs.length}`);

    // 2. Fetch search engine grounding links (DuckDuckGo/Yahoo) to expand findings
    console.log('[Source Endpoint] Sourcing web search links...');
    const rolesQuery = targetRoles.length > 0 ? targetRoles.join(' OR ') : 'Software Engineer';
    
    let remoteQualifier = '';
    const locPrefList = [];
    if (prefersRemote) locPrefList.push('remote');
    if (prefersHybrid) locPrefList.push('hybrid');
    if (prefersOnSite) locPrefList.push('"on-site"');
    if (locPrefList.length > 0 && locPrefList.length < 3) {
      remoteQualifier = locPrefList.length === 1 ? locPrefList[0] : `(${locPrefList.join(' OR ')})`;
    }

    const simpleQuery = `"${rolesQuery}" jobs ${remoteQualifier} site:lever.co OR site:greenhouse.io OR site:myworkdayjobs.com OR site:jobs.ashbyhq.com`;
    
    let links: string[] = [];
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(simpleQuery)}`;
      const ddgRes = await fetch(ddgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (ddgRes.status === 200) {
        const html = await ddgRes.text();
        const regex = /uddg=([^"&'\s>]+)/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
          const decoded = decodeURIComponent(match[1]);
          if (decoded.startsWith('http') && !links.includes(decoded)) {
            links.push(decoded);
          }
        }
      }
    } catch (e: any) {
      console.warn('[Source Endpoint] DDG search failed:', e.message);
    }

    if (links.length === 0) {
      try {
        const yahooUrl = `https://search.yahoo.com/search?q=${encodeURIComponent(simpleQuery)}`;
        const yahooRes = await fetch(yahooUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (yahooRes.status === 200) {
          const html = await yahooRes.text();
          const regex = /\/RU=([^/&]+)/g;
          let match;
          while ((match = regex.exec(html)) !== null) {
            const decoded = decodeURIComponent(match[1]);
            if (decoded.startsWith('http') && !links.includes(decoded)) {
              links.push(decoded);
            }
          }
        }
      } catch (e: any) {
        console.warn('[Source Endpoint] Yahoo search failed:', e.message);
      }
    }

    const jobLinks = links.filter(link => isSpecificJobPost(link));
    
    // Passively harvest potential Workday boards from grounding search results
    for (const link of links) {
      harvestWorkdayUrl(link);
    }

    const targetLinks = jobLinks.slice(0, 5);

    const webScrapedJobs: RawCommunityJob[] = [];
    for (const url of targetLinks) {
      try {
        const verification = await verifyJobUrl(url);
        if (!verification.isValid) continue;

        const pageRes = await fetch(verification.resolvedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!pageRes.ok) continue;

        const pageHtml = await pageRes.text();
        
        // Extract Title from HTML
        const titleMatch = pageHtml.match(/<title>([\s\S]*?)<\/title>/i);
        let title = titleMatch ? titleMatch[1].trim() : 'Unknown Role';
        // Clean title
        title = title.split('|')[0].split(' - ')[0].trim();

        // Guess company name from URL
        let company = 'Unknown Company';
        try {
          const parsedUrl = new URL(verification.resolvedUrl);
          const parts = parsedUrl.hostname.split('.');
          if (parts.length >= 2) {
            company = parts[parts.length - 2];
            company = company.charAt(0).toUpperCase() + company.slice(1);
          }
        } catch {}

        const cleanText = stripHtmlCommunity(pageHtml);
        const description = cleanText.slice(0, 15000);

        // Apply filters
        if (matchesKeywords(title, roleKeywords) && 
            !isBlocklistedRole(title, targetRoles, yearsOfExperience) &&
            !exceedsExperienceRequirement(cleanText, yearsOfExperience)) {
          webScrapedJobs.push({
            title,
            company,
            location: 'Remote/Specified on Link',
            description,
            url: verification.resolvedUrl,
            postedAt: new Date().toISOString(),
            type: 'Full-Time',
            isRemote: true,
            source: 'websearch' as const,
          });
        }
      } catch (err: any) {
        console.warn(`[Source Endpoint] Failed scraping ${url}:`, err.message);
      }
    }

    const allJobs = [...communityJobs, ...webScrapedJobs];

    // 1. Group jobs by company and deduplicate/filter out saved jobs
    const seenTitles = new Set<string>();
    const seenUrls = new Set<string>();
    const seenJobIds = new Set<string>();
    const jobsByCompany: Record<string, RawCommunityJob[]> = {};

    for (const job of allJobs) {
      const titleKey = `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`;
      const urlKey = job.url ? normalizeJobUrl(job.url) : '';
      const jobIdKey = job.url ? extractJobNumber(job.url) : null;

      if (seenTitles.has(titleKey) || (urlKey && seenUrls.has(urlKey)) || (jobIdKey && seenJobIds.has(jobIdKey))) {
        continue;
      }

      // Check duplicates against savedJobs
      const isSaved = savedJobs.some((s: any) => {
        if (s.title.toLowerCase().trim() === job.title.toLowerCase().trim() &&
            s.company.toLowerCase().trim() === job.company.toLowerCase().trim()) {
          return true;
        }
        
        if (urlKey && s.url) {
          const sUrl = normalizeJobUrl(s.url);
          if (sUrl === urlKey) return true;
        }

        if (jobIdKey) {
          const sJobId = s.url ? extractJobNumber(s.url) : null;
          if (sJobId && sJobId === jobIdKey) return true;
        }

        return false;
      });

      if (isSaved) continue;

      seenTitles.add(titleKey);
      if (urlKey) seenUrls.add(urlKey);
      if (jobIdKey) seenJobIds.add(jobIdKey);

      const comp = job.company.toLowerCase().trim();
      if (!jobsByCompany[comp]) {
        jobsByCompany[comp] = [];
      }
      jobsByCompany[comp].push(job);
    }

    // 2. Sort each company's jobs by keyword relevance
    for (const comp of Object.keys(jobsByCompany)) {
      jobsByCompany[comp].sort((a, b) => {
        const kA = roleKeywords.filter(kw => a.title.toLowerCase().includes(kw)).length;
        const kB = roleKeywords.filter(kw => b.title.toLowerCase().includes(kw)).length;
        return kB - kA;
      });
    }

    // 3. Round-robin select: take index 0 of all companies (shuffled), then index 1 (max 5 jobs per company)
    const roundRobinJobs: RawCommunityJob[] = [];
    const companies = Object.keys(jobsByCompany);
    
    // Shuffle companies to mix sources fairly
    for (let i = companies.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [companies[i], companies[j]] = [companies[j], companies[i]];
    }

    let hasMore = true;
    let round = 0;
    const maxRounds = 5;

    while (hasMore && round < maxRounds) {
      hasMore = false;
      for (const comp of companies) {
        const list = jobsByCompany[comp];
        if (round < list.length) {
          roundRobinJobs.push(list[round]);
          hasMore = true;
        }
      }
      round++;
    }
    // 4. Source-level Round-Robin Selection to interleave listings from different platforms fairly
    const jobsBySource: Record<string, any[]> = {};
    for (const j of roundRobinJobs) {
      const s = j.source || 'websearch';
      if (!jobsBySource[s]) jobsBySource[s] = [];
      jobsBySource[s].push(j);
    }

    const interleavedJobs: any[] = [];
    let sourceRoundHasMore = true;
    let sourceRound = 0;
    const activeSources = Object.keys(jobsBySource).sort((a, b) => {
      const countA = jobsBySource[a].length;
      const countB = jobsBySource[b].length;
      return countA - countB;
    });

    while (sourceRoundHasMore) {
      sourceRoundHasMore = false;
      for (const src of activeSources) {
        const list = jobsBySource[src];
        if (sourceRound < list.length) {
          interleavedJobs.push(list[sourceRound]);
          sourceRoundHasMore = true;
        }
      }
      sourceRound++;
    }

    res.json({
      jobs: interleavedJobs.slice(0, 40),
      warnings: health.warnings,
      sourcingStats: {
        greenhouse: { count: ghJobs.length, status: health.greenhouse ? 'ok' : 'skipped' },
        lever: { count: lvJobs.length, status: health.lever ? 'ok' : 'skipped' },
        ashby: { count: ashJobs.length, status: health.ashby ? 'ok' : 'skipped' },
        workday: { count: wdJobs.length, status: health.workday ? 'ok' : 'skipped' },
        websearch: { count: webScrapedJobs.length, status: 'ok' }
      }
    });
  } catch (err: any) {
    console.error('[Source Endpoint] Error:', err);
    res.status(500).json({ error: err.message || 'Error sourcing jobs' });
  }
});

// 1.6. Endpoint to score a single job posting against candidate resume
app.post('/api/jobs/evaluate', async (req, res) => {
  try {
    updateScannerActive();
    const {
      job,
      rawText,
      experienceContext,
      llmConfig,
      searchLocation = 'United States',
      prefersRemote = true,
      prefersHybrid = true,
      prefersOnSite = true
    } = req.body;
    
    if (!job || !rawText) {
      res.status(400).json({ error: 'Job details and resume text are required.' });
      return;
    }

    const base: any = {
      id: `discovered-${job.source || 'community'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: job.title,
      company: job.company,
      location: job.location,
      salary: job.salary || 'Not specified',
      type: job.type || 'Full-Time',
      isW2: job.isW2 !== undefined ? job.isW2 : true,
      description: job.description,
      url: job.url,
      postedAt: job.postedAt || 'Posted recently',
      isDuplicate: false,
      status: 'discovered',
      scannedAt: new Date().toISOString(),
      isUrlVerified: true,
      isRemote: job.isRemote !== undefined ? job.isRemote : false,
      skillsRequired: [],
      industry: '',
      experienceLevel: 'Mid',
      salaryNum: 0,
      matchScore: 50,
      matchReason: 'Evaluated with default scoring.',
      sourceTag: job.sourceTag || job.source || 'community',
    };

    // Verify URL
    console.log(`[Evaluate Endpoint] Verifying URL for ${job.title} at ${job.company}: ${job.url}`);
    if (job.url) {
      harvestWorkdayUrl(job.url);
    }
    const verification = await verifyJobUrl(job.url);
    base.url = verification.resolvedUrl;
    base.isUrlVerified = verification.isValid;

    if (!llmConfig || !llmConfig.endpoint) {
      res.json(base);
      return;
    }

    try {
      console.log(`[Evaluate Endpoint] Scoring ${job.title} at ${job.company} via custom LLM...`);
      const isHN = job.source === 'hackernews' || job.sourceTag === 'hackernews';
      
      const promptBuilder = (resumeLimit: number, descLimit: number) => {
        if (isHN) {
          return `You are an expert Job Placement Agent. Evaluate the candidate resume against this Hacker News "Who is hiring?" job posting.
        Candidate Resume: """${rawText.slice(0, resumeLimit)}"""
        Hacker News Post Description:
        """
        ${job.description.slice(0, descLimit)}
        """
        Experience rule: ${experienceContext}
        
        Candidate Preferred Location: ${searchLocation}
        Work Location Settings: Remote Preferred: ${prefersRemote ? 'Yes' : 'No'}, Hybrid Allowed: ${prefersHybrid ? 'Yes' : 'No'}, Onsite Allowed: ${prefersOnSite ? 'Yes' : 'No'}
        
        Location/Geographic Constraint Rule:
        - Check the job description for geographic constraints (e.g. "must reside in Texas", "reside in Canada", "work from Spain").
        - If the job explicitly restricts candidates to a different state or country than the candidate's preferred location (${searchLocation}), you MUST score it 0 and state the reason as "Location Mismatch: [details]" (e.g. "Location Mismatch: Requires residency in Texas").
        
        Experience Match Rule:
        - Check the job description for required years of experience.
        - If the job explicitly requires more than 2 years above the candidate's years of experience (from the Experience rule), you MUST score it 0 and state the reason as "Experience Mismatch: Requires X years, candidate has Y years".
        
        Since this is a raw community forum post, you MUST identify and extract the following:
        1. "company": The actual name of the hiring company (do NOT return "Hacker News Community").
        2. "title": A concise job title (e.g. "Senior Software Engineer" or "Full-Stack Developer").
        3. "location": The work location (e.g. "Remote", "San Francisco, CA", "Hybrid (New York)").
        
        Return ONLY a raw JSON object (no markdown):
        {"matchScore":85,"matchReason":"One sentence explanation under 15 words.","skillsRequired":["Skill"],"industry":"Technology","experienceLevel":"Senior","salaryNum":120000,"company":"Extracted Company","title":"Extracted Title","location":"Extracted Location"}`;
        } else {
          return `You are an expert Job Placement Agent. Evaluate the candidate resume against this job.
        Candidate Resume: """${rawText.slice(0, resumeLimit)}"""
        Job: ${job.title} at ${job.company} | Location: ${job.location}
        Description: ${job.description.slice(0, descLimit)}
        Experience rule: ${experienceContext}
        
        Candidate Preferred Location: ${searchLocation}
        Work Location Settings: Remote Preferred: ${prefersRemote ? 'Yes' : 'No'}, Hybrid Allowed: ${prefersHybrid ? 'Yes' : 'No'}, Onsite Allowed: ${prefersOnSite ? 'Yes' : 'No'}
        
        Location/Geographic Constraint Rule:
        - Check the job description and location field for geographic constraints (e.g. "must reside in Texas", "reside in Canada", "work from Spain").
        - If the job explicitly restricts candidates to a different state or country than the candidate's preferred location (${searchLocation}), you MUST score it 0 and state the reason as "Location Mismatch: [details]" (e.g. "Location Mismatch: Requires residency in Texas").
        
        Experience Match Rule:
        - Check the job description for required years of experience.
        - If the job explicitly requires more than 2 years above the candidate's years of experience (from the Experience rule), you MUST score it 0 and state the reason as "Experience Mismatch: Requires X years, candidate has Y years".
        
        Return ONLY a raw JSON object (no markdown):
        {"matchScore":85,"matchReason":"One sentence explanation under 15 words.","skillsRequired":["Skill"],"industry":"Technology","experienceLevel":"Senior","salaryNum":120000}`;
        }
      };
      
      const result = await queryCustomLLMAdaptive(
        llmConfig.endpoint,
        llmConfig.apiKey,
        llmConfig.modelName,
        promptBuilder,
        (llmConfig.timeout || 30) * 1000,
        isHN
      );
      
      const txt = result.content;
      const tier = result.tier;
      
      const cleaned = txt.trim().replace(/^```(json)?\n?/, '').replace(/\n?```$/, '');
      const ev = JSON.parse(cleaned);
      
      const finalJob = {
        ...base,
        title: (isHN && ev.title && ev.title !== 'Extracted Title') ? ev.title : base.title,
        company: (isHN && ev.company && ev.company !== 'Extracted Company') ? ev.company : base.company,
        location: (isHN && ev.location && ev.location !== 'Extracted Location') ? ev.location : base.location,
        matchScore: typeof ev.matchScore === 'number' ? Math.min(100, Math.max(0, ev.matchScore)) : 50,
        matchReason: ev.matchReason || '',
        skillsRequired: ev.skillsRequired || [],
        industry: ev.industry || '',
        experienceLevel: ev.experienceLevel || 'Mid',
        salaryNum: typeof ev.salaryNum === 'number' ? ev.salaryNum : 0,
        retryTier: tier,
      };
      
      const evalDb = readDb();
      if (!evalDb.stats) {
        evalDb.stats = { totalScanned: 0, duplicatesPrevented: 0, llmEvaluations: 0, totalSourced: 0 };
      }
      evalDb.stats.llmEvaluations += 1;
      writeDb(evalDb);
      
      res.json(finalJob);
    } catch (llmErr: any) {
      console.warn(`[Evaluate Endpoint] LLM score failed for "${job.title}":`, llmErr.message);
      base.matchReason = `LLM evaluation error: ${llmErr.message}`;
      res.json(base);
    }
  } catch (err: any) {
    console.error('[Evaluate Endpoint] Error:', err);
    res.status(500).json({ error: err.message || 'Error evaluating job' });
  }
});

// 2. Endpoint to Scan for matching jobs using Real-time Google Search Grounding
app.post('/api/jobs/scan', async (req, res) => {
  try {
    updateScannerActive();
    const {
      rawText,
      targetRoles = [],
      preferredTypes = ['Full-Time', 'Contract', 'Part-Time'],
      savedJobs = [], // list of job titles/companies for duplicate prevention
      prefersRemote = true,
      prefersHybrid = true,
      prefersOnSite = true,
      searchLocation = 'United States',
      searchDistance = '',
      skills = [],
      yearsOfExperience = 0,
      llmConfig,
    } = req.body;

    const scanDb = readDb();
    const blockedCompanies = scanDb.profile?.blockedCompanies || [];

    // Build the experience qualifier string for prompts
    const experienceContext = yearsOfExperience > 0
      ? `Candidate has ${yearsOfExperience} years of experience. Apply these rules when scoring:
         1. OVERQUALIFIED (job requires LESS than candidate's years): Always acceptable — do NOT reduce matchScore for being overqualified. A candidate with ${yearsOfExperience} yrs applying to a job requiring 2 yrs is a perfectly valid match.
         2. CLOSE MATCH (job requires up to ${yearsOfExperience + 2} yrs): Fully acceptable — score normally with no penalty.
         3. EXCEEDING EXPERIENCE (job requires MORE than ${yearsOfExperience + 2} yrs, e.g. 6+ years): You MUST assign a matchScore of 0 and note "Experience Mismatch: Requires X years, candidate has ${yearsOfExperience} years" in the matchReason.`
      : 'Candidate has not specified their years of experience — do not penalise based on experience requirements in either direction.';

    // Extract role keywords for community source filtering
    const roleKeywords = extractRoleKeywords(targetRoles);

    const rolesQuery = targetRoles.length > 0 ? targetRoles.join(' OR ') : 'Software Engineer';
    const locationQuery = searchLocation ? searchLocation : 'United States';
    const distanceQuery = searchDistance ? `within ${searchDistance}` : '';
    
    let remoteQualifier = '';
    const locPrefList = [];
    if (prefersRemote) locPrefList.push('remote');
    if (prefersHybrid) locPrefList.push('hybrid');
    if (prefersOnSite) locPrefList.push('"on-site"');
    
    if (locPrefList.length > 0 && locPrefList.length < 3) {
      if (locPrefList.length === 1) {
        remoteQualifier = locPrefList[0];
      } else {
        remoteQualifier = `(${locPrefList.join(' OR ')})`;
      }
    }

    // Dynamic search query incorporating state, country, and optional radius boundaries
    const searchQuery = `"${rolesQuery}" jobs in ${locationQuery} ${distanceQuery} ${remoteQualifier} posted in the last 24 hours on linkedin.com greenhouse.co lever.co indeed.com apply`;

    let enrichedJobs: any[] = [];
    let isOfflineFallback = false;

    // Launch community sources in parallel immediately — no API key required
    console.log('[Community Sources] Starting Greenhouse, Lever, Workday, Ashby fetch in parallel...');
    const communitySourcesPromise = (async () => {
      await updateCompanyDirectoriesFromRegistry();
      const [ghRes, lvRes, ashRes, wdRes] = await Promise.allSettled([
        fetchGreenhouseJobs(globalState.cachedGreenhouseSlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience),
        fetchLeverJobs(globalState.cachedLeverSlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience),
        fetchAshbyJobs(globalState.cachedAshbySlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience),
        fetchWorkdayJobs(globalState.cachedWorkdayDirectory, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience),
      ]);
      const raw: RawCommunityJob[] = [
        ...(ghRes.status === 'fulfilled' ? ghRes.value : []),
        ...(lvRes.status === 'fulfilled' ? lvRes.value : []),
        ...(ashRes.status === 'fulfilled' ? ashRes.value : []),
        ...(wdRes.status === 'fulfilled' ? wdRes.value : []),
      ];
      // Deduplicate across sources
      const seen = new Set<string>();
      const unique = raw.filter(j => {
        const k = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`;
        return seen.has(k) ? false : (seen.add(k), true);
      });
      // Group and interleave jobs from different platforms round-robin
      const jobsBySource: Record<string, any[]> = {};
      for (const j of unique) {
        const s = j.source || 'websearch';
        if (!jobsBySource[s]) jobsBySource[s] = [];
        jobsBySource[s].push(j);
      }

      for (const s of Object.keys(jobsBySource)) {
        jobsBySource[s].sort((a, b) => {
          const kA = roleKeywords.filter(kw => (a.title + a.description).toLowerCase().includes(kw)).length;
          const kB = roleKeywords.filter(kw => (b.title + b.description).toLowerCase().includes(kw)).length;
          return kB - kA;
        });
      }

      const interleavedJobs: any[] = [];
      let sourceRoundHasMore = true;
      let sourceRound = 0;
      const activeSources = Object.keys(jobsBySource).sort((a, b) => {
        const countA = jobsBySource[a].length;
        const countB = jobsBySource[b].length;
        return countA - countB;
      });

      while (sourceRoundHasMore) {
        sourceRoundHasMore = false;
        for (const src of activeSources) {
          const list = jobsBySource[src];
          if (sourceRound < list.length) {
            interleavedJobs.push(list[sourceRound]);
            sourceRoundHasMore = true;
          }
        }
        sourceRound++;
      }

      const toScore = interleavedJobs.slice(0, 25);
      console.log(`[Community Sources] ${unique.length} unique matched jobs found. Scoring top ${toScore.length}...`);
      return scoreCommunityJobs(toScore, rawText, llmConfig, experienceContext, savedJobs, locationQuery, prefersRemote, blockedCompanies);
    })();

    try {
      const ai = getAIClient();
      
      // Provide a detailed prompt requesting structured JSON results
      const prompt = `
        You are an elite, proactive Job Search Agent. Query Google Search using the query to find open job postings posted *within the last 24 hours* that match the candidate's professional profile.
        
        Search query context: ${searchQuery}
        
        Resume of candidate:
        """
        ${rawText || ''}
        """
        
        Job category preferences:
        - Preferred Roles: ${JSON.stringify(targetRoles)}
        - Search Location: ${locationQuery} ${distanceQuery}
        - Position Types: ${JSON.stringify(preferredTypes)} (strictly classify each as 'Full-Time' | 'Contract' | 'Part-Time')
        - Wants Remote Option: ${prefersRemote ? 'Yes' : 'No'}
        - Wants Hybrid Option: ${prefersHybrid ? 'Yes' : 'No'}
        - Wants On-Site Option: ${prefersOnSite ? 'Yes' : 'No'}
        - Experience Level: ${experienceContext}
  
        Duplicate prevention check: Avoid returning jobs that are identical to any of these existing postings already in the history:
        ${JSON.stringify(savedJobs.map((j: any) => ({ title: j.title, company: j.company })))}
        
        Evaluate each vacancy found in the search results against the resume:
        - Assign a "matchScore" from 0 to 100 on how well their skills match the job description.
        - Calculate "matchReason" detailing how the job fits their experience.
        - Identify if the job is "Full-Time", "Contract", or "Part-Time".
        - Identify whether it offers a W2 relationship.
        - Explicitly classify "industry", "experienceLevel" (Junior, Mid, Senior, Lead), "isRemote" (true/false), and "salaryNum" (numeric value like 120000).
        - For each job found, you MUST extract the actual, direct application URL or specific job listing page (e.g., from greenhouse.co, lever.co, workday, or the company's careers site). Avoid generic homepage URLs (like "https://google.com") or search result list URLs.
        
        Your response MUST be a clean JSON array representing the matching jobs found. Do not include markdown wraps except returning valid JSON matching the schema.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: 'Job Title' },
                company: { type: Type.STRING, description: 'Company Name' },
                location: { type: Type.STRING, description: 'Job Location or Remote' },
                salary: { type: Type.STRING, description: 'Estimated compensation details or Not Specified' },
                type: { type: Type.STRING, description: 'Must be Full-Time, Contract, or Part-Time' },
                isW2: { type: Type.BOOLEAN, description: 'True if explicitly W2 or typical full-time/contract direct, False if 1099/C2C' },
                description: { type: Type.STRING, description: 'Short, clean 2-3 sentence overview of responsibilities' },
                url: { type: Type.STRING, description: 'Direct apply URL, job listing page, or company careers page for this specific job posting (do NOT return generic job search engine URLs, search results, or homepages)' },
                matchScore: { type: Type.INTEGER, description: 'Match rate against resume from 0 to 100' },
                matchReason: { type: Type.STRING, description: 'Brief custom analysis on why it fits' },
                skillsRequired: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Key skills mentioned in the job description',
                },
                industry: { type: Type.STRING, description: 'Job industry e.g., technology, healthcare, finance, design' },
                experienceLevel: { type: Type.STRING, description: 'Junior, Mid, Senior, or Lead' },
                isRemote: { type: Type.BOOLEAN, description: 'True if job can be done remotely' },
                salaryNum: { type: Type.INTEGER, description: 'Numeric representation of salary, e.g. 150000' }
              },
              required: ['title', 'company', 'location', 'type', 'isW2', 'description', 'url', 'matchScore', 'matchReason', 'industry', 'experienceLevel', 'isRemote', 'salaryNum'],
            },
          },
        },
      });

      const jobsArray = JSON.parse(response.text || '[]');
      
      // Verify job URLs in parallel
      const verifiedJobs = await Promise.all(
        jobsArray.map(async (job: any) => {
          console.log(`[URL Verification] Verifying URL for "${job.title}" at "${job.company}": ${job.url}`);
          const verification = await verifyJobUrl(job.url);
          console.log(`[URL Verification] Result for "${job.title}":`, verification);
          return {
            ...job,
            url: verification.resolvedUrl,
            isUrlVerified: verification.isValid,
          };
        })
      );
      
      // If a custom LLM is configured, use it to evaluate match scores and match reasons
      let evaluatedJobs = verifiedJobs;
      if (llmConfig && llmConfig.endpoint) {
        console.log(`[URL Matching] Evaluating matches using custom LLM model "${llmConfig.modelName}" at "${llmConfig.endpoint}"`);
        evaluatedJobs = await Promise.all(
          verifiedJobs.map(async (job: any) => {
            try {
              const companyL = job.company.toLowerCase().trim();
              if (blockedCompanies.some(bc => bc.toLowerCase().trim() === companyL)) {
                return {
                  ...job,
                  matchScore: 0,
                  matchReason: 'Company Blocked',
                };
              }

              const evalPrompt = `
                You are an expert Job Placement Search Agent. Evaluate how well the candidate's resume matches the following job description.
                 Candidate Resume:
                """
                ${(rawText || '').slice(0, 1500)}
                """
                
                Job Title: ${job.title}
                Company: ${job.company}
                Job Description: ${(job.description || '').slice(0, 800)}
 
                Experience matching rule: ${experienceContext}
                When computing matchScore, factor in whether the job's required years of experience falls within the candidate's acceptable range (their years ± 2). If the job explicitly requires significantly more experience than the candidate has (more than +2 years above their experience), you MUST assign a matchScore of 0 and note "Experience Mismatch: Requires X years, candidate has Y years" in matchReason.
                
                Your response MUST be a valid JSON object matching this schema:
                {
                  "matchScore": 85, // Integer from 0 to 100 representing how well the candidate's skills match the job description
                  "matchReason": "One sentence matching explanation under 15 words."
                }
                
                Return ONLY the raw JSON object. Do not include markdown code blocks (such as \`\`\`json) or any extra conversational text.
              `;
              
              const responseText = await queryCustomLLM(
                llmConfig.endpoint,
                llmConfig.apiKey,
                llmConfig.modelName,
                evalPrompt,
                2,
                (llmConfig.timeout || 30) * 1000
              );
              
              let cleanedText = responseText.trim();
              if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.replace(/^```(json)?\n/, '').replace(/\n```$/, '');
              }
              
              const evalResult = JSON.parse(cleanedText);
              return {
                ...job,
                matchScore: typeof evalResult.matchScore === 'number' ? evalResult.matchScore : 50,
                matchReason: evalResult.matchReason || 'Match evaluated by chosen model.'
              };
            } catch (err: any) {
              console.warn(`Chosen model evaluation failed for "${job.title}":`, err.message || err);
              return {
                ...job,
                matchReason: `Failed to evaluate match score with chosen model. Error: ${err.message || err}`
              };
            }
          })
        );
      }

      // We will append server-side metadata details: unique ids, scanned timings, etc.
      enrichedJobs = evaluatedJobs.map((job: any, index: number) => {
        // Direct duplicate check just to be absolutely sure
        const existsInSaved = savedJobs.some((saved: any) => 
          saved.title.toLowerCase() === job.title.toLowerCase() &&
          saved.company.toLowerCase() === job.company.toLowerCase()
        );

        return {
          ...job,
          id: `web-search-${Date.now()}-${index}`,
          postedAt: 'Posted in the last 24h',
          scannedAt: new Date().toISOString(),
          isDuplicate: existsInSaved,
          status: 'discovered'
        };
      });
    } catch (aiErr: any) {
      console.warn('Gemini API search query failed or key is missing, attempting keyless DuckDuckGo live web sourcing:', aiErr.message || aiErr);
      
      let localSourcingSuccess = false;
      let sourcingErrorMsg = '';
      try {
        const simpleQuery = `"${rolesQuery}" jobs ${remoteQualifier} site:lever.co OR site:greenhouse.io OR site:myworkdayjobs.com`;
        
        // 1. Try DuckDuckGo first
        let links: string[] = [];
        try {
          console.log(`[Local Web Sourcing] Sourcing via DuckDuckGo for: "${simpleQuery}"`);
          const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(simpleQuery)}`;
          const ddgRes = await fetch(ddgUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          
          if (ddgRes.status === 200) {
            const html = await ddgRes.text();
            const regex = /uddg=([^"&'\s>]+)/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
              const decoded = decodeURIComponent(match[1]);
              if (decoded.startsWith('http') && !links.includes(decoded)) {
                links.push(decoded);
              }
            }
          } else {
            console.warn(`[Local Web Sourcing] DuckDuckGo returned status: ${ddgRes.status}`);
          }
        } catch (ddgErr: any) {
          console.warn(`[Local Web Sourcing] DuckDuckGo failed: ${ddgErr.message || ddgErr}`);
        }

        // 2. Try Yahoo if DuckDuckGo failed or returned no results
        if (links.length === 0) {
          try {
            console.log(`[Local Web Sourcing] Sourcing via Yahoo Search for: "${simpleQuery}"`);
            const yahooUrl = `https://search.yahoo.com/search?q=${encodeURIComponent(simpleQuery)}`;
            const yahooRes = await fetch(yahooUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            
            if (yahooRes.status === 200) {
              const html = await yahooRes.text();
              const regex = /\/RU=([^/&]+)/g;
              let match;
              while ((match = regex.exec(html)) !== null) {
                const decoded = decodeURIComponent(match[1]);
                if (decoded.startsWith('http') && !links.includes(decoded)) {
                  links.push(decoded);
                }
              }
            } else {
              console.warn(`[Local Web Sourcing] Yahoo returned status: ${yahooRes.status}`);
            }
          } catch (yahooErr: any) {
            console.warn(`[Local Web Sourcing] Yahoo failed: ${yahooErr.message || yahooErr}`);
          }
        }
        
        const jobLinks = links.filter(link => isSpecificJobPost(link));
        console.log(`[Local Web Sourcing] Found ${jobLinks.length} candidate job postings.`);
        
        if (jobLinks.length === 0) {
          throw new Error("No specific job application links found in search results.");
        }
        
        // Process up to 5 verified application links to prevent local model overloading
        const targetLinks = jobLinks.slice(0, 5);
        const scrapedJobs: any[] = [];
        
        for (const url of targetLinks) {
          try {
            console.log(`[Local Web Sourcing] Verifying and scraping: ${url}`);
            const verification = await verifyJobUrl(url);
            if (!verification.isValid) {
              console.log(`[Local Web Sourcing] Link is generic or unreachable, skipping: ${url}`);
              continue;
            }
            
            const pageRes = await fetch(verification.resolvedUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            
            if (!pageRes.ok) continue;
            
            const pageHtml = await pageRes.text();
            const pageText = pageHtml
              .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '')
              .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
              
            if (pageText.length < 200) continue;
            
            console.log(`[Local Web Sourcing] Asking local model "${llmConfig.modelName}" to parse page text...`);
            const promptBuilder = (resumeLimit: number, descLimit: number) => {
              return `
              Analyze the following job posting text and evaluate it against the candidate resume              Candidate Resume:
              """
              ${(rawText || '').slice(0, resumeLimit)}
              """
              
              Job Post Text:
              """
              ${pageText.slice(0, descLimit)}
              """
 
              Experience matching rule: ${experienceContext}
              When scoring, factor in the job's required years of experience. If the job's requirement falls within the candidate's range (their years ± 2 yrs), score normally. If it requires more than +2 years above the candidate's experience, reduce matchScore proportionally and explain in matchReason.
              
              Extract and return a JSON object with this exact structure:
              {
                "title": "Job Title",
                "company": "Company Name",
                "location": "Location",
                "salary": "Compensation range or Not Specified",
                "type": "Full-Time, Contract, or Part-Time",
                "isW2": true, // true if standard W2/direct job, false if C2C/1099
                "description": "Short 2-3 sentence overview of responsibilities.",
                "matchScore": 85, // Integer from 0 to 100 on how well their skills match the job description
                "matchReason": "One sentence matching explanation under 15 words.",
                "skillsRequired": ["Skill 1", "Skill 2"],
                "industry": "Industry category (e.g. Technology)",
                "experienceLevel": "Junior, Mid, Senior, or Lead",
                "isRemote": true // true if remote, false otherwise
              }
              
              Return ONLY the raw JSON object. Do not include markdown code block wraps.
            `;
            };
            
            const result = await queryCustomLLMAdaptive(
              llmConfig.endpoint,
              llmConfig.apiKey,
              llmConfig.modelName,
              promptBuilder,
              (llmConfig.timeout || 30) * 1000,
              false
            );
            
            const modelResText = result.content;
            const tier = result.tier;
            
            let cleanedJSON = modelResText.trim();
            if (cleanedJSON.startsWith('```')) {
              cleanedJSON = cleanedJSON.replace(/^```(json)?\n/, '').replace(/\n```$/, '');
            }
            
            const parsedJob = JSON.parse(cleanedJSON);
            scrapedJobs.push({
              ...parsedJob,
              url: verification.resolvedUrl,
              isUrlVerified: true,
              salaryNum: typeof parsedJob.salary === 'string' ? (parseInt(parsedJob.salary.replace(/[^0-9]/g, '')) || 0) : (parsedJob.salaryNum || 0),
              retryTier: tier
            });
            
          } catch (itemErr: any) {
            console.warn(`[Local Web Sourcing] Failed parsing job at ${url}:`, itemErr.message || itemErr);
          }
        }
        
        if (scrapedJobs.length > 0) {
          console.log(`[Local Web Sourcing] Completed live scan with ${scrapedJobs.length} matches!`);
          enrichedJobs = scrapedJobs.map((job: any, index: number) => {
            const existsInSaved = savedJobs.some((saved: any) => 
              saved.title.toLowerCase() === job.title.toLowerCase() &&
              saved.company.toLowerCase() === job.company.toLowerCase()
            );
            return {
              ...job,
              id: `local-live-scan-${Date.now()}-${index}`,
              postedAt: 'Posted in the last 24h',
              scannedAt: new Date().toISOString(),
              isDuplicate: existsInSaved,
              status: 'discovered'
            };
          });
          localSourcingSuccess = true;
        } else {
          throw new Error("No live search listings successfully scraped.");
        }
        
      } catch (localSourcingErr: any) {
        console.warn('[Local Web Sourcing] Sourcing failed:', localSourcingErr.message || localSourcingErr);
        sourcingErrorMsg = localSourcingErr.message || String(localSourcingErr);
      }
      
      if (!localSourcingSuccess) {
        console.warn(`[Fallback] DuckDuckGo/Yahoo sourcing failed (${sourcingErrorMsg}). Relying on community sources.`);
      }
    }

    // Merge community sources (always run alongside Gemini/DuckDuckGo)
    try {
      const communityJobs = await communitySourcesPromise;
      console.log(`[Community Sources] Received ${communityJobs.length} scored jobs.`);
      if (communityJobs.length > 0) {
        const existingKeys = new Set(
          enrichedJobs.map((j: any) => `${(j.title || '').toLowerCase()}|${(j.company || '').toLowerCase()}`)
        );
        const newJobs = communityJobs.filter(
          (j: any) => !existingKeys.has(`${j.title.toLowerCase()}|${j.company.toLowerCase()}`)
        );
        enrichedJobs = [...enrichedJobs, ...newJobs];
        console.log(`[Community Sources] Added ${newJobs.length} new jobs (${communityJobs.length - newJobs.length} dupes skipped).`);
      }
    } catch (communityErr: any) {
      console.warn('[Community Sources] Merge failed:', communityErr.message);
    }

    // Run active filters server side to guarantee precision
    const filteredJobs = enrichedJobs.filter((job: any) => {
      // Check blocklist
      const companyL = job.company.toLowerCase().trim();
      if (blockedCompanies.some(bc => bc.toLowerCase().trim() === companyL)) {
        return false;
      }

      // Exclude unverified links as requested
      if (!job.isUrlVerified) {
        return false;
      }
      if (preferredTypes.length > 0 && job.type) {
        const matchesType = preferredTypes.some((t: string) => t.toLowerCase() === job.type.toLowerCase());
        if (!matchesType) return false;
      }
      if (prefersRemote || prefersHybrid) {
        const matchRemote = prefersRemote && job.isRemote;
        const matchHybrid = prefersHybrid && (job.location?.toLowerCase().includes('hybrid') || job.description?.toLowerCase().includes('hybrid') || !job.isRemote);
        if (!matchRemote && !matchHybrid) return false;
      }
      return true;
    });

    res.json(filteredJobs);
  } catch (err: any) {
    console.error('Error scanning jobs:', err);
    res.status(500).json({ error: err.message || 'Internal server error while searching jobs.' });
  }
});

// 3. Proxy Endpoint to Route Custom LLM requests (Bypasses Browser CORS/Mixed-Content Rules)
app.post('/api/llm/proxy', async (req, res) => {
  try {
    const { endpoint, body, apiKey, timeout = 30 } = req.body;
    if (!endpoint) {
      res.status(400).json({ error: 'Endpoint parameter is required' });
      return;
    }

    let targetUrl = endpoint.trim();
    if (targetUrl.endsWith('/chat/completions')) {
      targetUrl = targetUrl.replace(/\/chat\/completions$/, '');
    }
    const cleanCompletionsUrl = `${targetUrl}/chat/completions`;
    const timeoutMs = timeout * 1000;

    const executeFetch = async (attemptsLeft = 2): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const resObj = await fetch(cleanCompletionsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return resObj;
      } catch (err: any) {
        clearTimeout(timeoutId);
        const isTimeout = err.name === 'AbortError';
        const errMsg = isTimeout ? `LLM Request Timeout (${timeoutMs}ms limit exceeded)` : err.message;

        if (attemptsLeft > 1) {
          console.warn(`[Proxy Custom LLM] Attempt failed: ${errMsg}. Retrying in 1.5s... (${attemptsLeft - 1} attempts remaining)`);
          await new Promise(resolve => setTimeout(resolve, 1500));
          return executeFetch(attemptsLeft - 1);
        }
        throw err;
      }
    };

    const response = await executeFetch();

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).json({
        error: `Custom LLM Server Error (HTTP ${response.status})`,
        details: errText
      });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error('Error in Custom LLM Proxy:', err);
    const isTimeout = err.name === 'AbortError' || err.message?.includes('Timeout');
    const proxyTimeoutMs = (req.body?.timeout || 30) * 1000;
    res.status(isTimeout ? 408 : 500).json({ 
      error: isTimeout ? `LLM Proxy Request Timeout (${proxyTimeoutMs}ms limit exceeded)` : (err.message || 'Failed to connect to the custom LLM endpoint.')
    });
  }
});

// ============================================================
// CORE SYNC & ACTION ENDPOINTS
// ============================================================
app.get('/api/jobs/sync', (req, res) => {
  const db = readDb();
  res.json(db);
});

app.post('/api/jobs/poll', (req, res) => {
  const db = readDb();
  const logs = db.logs || [];
  const hasLogs = logs.length > 0;
  if (hasLogs) {
    db.logs = [];
    writeDb(db);
  }
  res.json({
    success: true,
    db: { ...db, logs: [] },
    newLogs: logs,
    currentlyRefiningJobId: globalState.currentlyRefiningJobId,
    lastBackgroundSourceTime: globalState.lastBackgroundSourceTime,
    lastBackgroundRefinerTime: globalState.lastBackgroundRefinerTime
  });
});

app.post('/api/profile/sync', (req, res) => {
  const { profile, llmConfig } = req.body;
  const db = readDb();
  if (profile) db.profile = profile;
  if (llmConfig) db.llmConfig = llmConfig;
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/logs/clear', (req, res) => {
  const db = readDb();
  db.logs = [];
  writeDb(db);
  res.json({ success: true });
});

app.post('/api/jobs/action', (req, res) => {
  const { action, job, id, status, notes, updatedFields, jobs } = req.body;
  const db = readDb();
  let modified = false;

  const removeJobFromList = (list: Job[], jobId: string) => {
    const index = list.findIndex(j => j.id === jobId);
    if (index !== -1) {
      list.splice(index, 1);
      return true;
    }
    return false;
  };

  switch (action) {
    case 'save': {
      const jobsToSave = Array.isArray(jobs) ? jobs : (job ? [job] : []);
      for (const j of jobsToSave) {
        removeJobFromList(db.scannedJobs, j.id);
        removeJobFromList(db.watchlist, j.id);
        if (!db.savedJobs.some(x => x.id === j.id)) {
          db.savedJobs.unshift({ ...j, status: 'applied', appliedDate: new Date().toISOString() });
        }
      }
      modified = true;
      break;
    }
    case 'watchlist': {
      const jobsToWatch = Array.isArray(jobs) ? jobs : (job ? [job] : []);
      for (const j of jobsToWatch) {
        removeJobFromList(db.scannedJobs, j.id);
        if (!db.watchlist.some(x => x.id === j.id)) {
          db.watchlist.unshift({ ...j, status: 'discovered' });
        }
      }
      modified = true;
      break;
    }
    case 'dismiss': {
      if (job) {
        removeJobFromList(db.scannedJobs, job.id);
        removeJobFromList(db.watchlist, job.id);
        removeJobFromList(db.savedJobs, job.id);
        if (!db.dismissedJobs.some(j => j.id === job.id)) {
          db.dismissedJobs.unshift(job);
        }
        modified = true;
      }
      break;
    }
    case 'undismiss': {
      if (job) {
        removeJobFromList(db.dismissedJobs, job.id);
        if (!db.scannedJobs.some(j => j.id === job.id)) {
          db.scannedJobs.unshift({ ...job, status: 'discovered' });
        }
        modified = true;
      }
      break;
    }
    case 'update_status': {
      const savedJob = db.savedJobs.find(j => j.id === id);
      if (savedJob) {
        savedJob.status = status;
        if (notes !== undefined) savedJob.notes = notes;
        if (status === 'applied' && !savedJob.appliedDate) {
          savedJob.appliedDate = new Date().toISOString();
        }
        modified = true;
      }
      break;
    }
    case 'update_details': {
      const savedJob = db.savedJobs.find(j => j.id === id);
      if (savedJob) {
        Object.assign(savedJob, updatedFields);
        modified = true;
      }
      break;
    }
    case 'remove_watchlist': {
      const wJob = db.watchlist.find(j => j.id === id);
      if (wJob) {
        removeJobFromList(db.watchlist, id);
        if (!db.dismissedJobs.some(j => j.id === id)) {
          db.dismissedJobs.unshift(wJob);
        }
        modified = true;
      }
      break;
    }
    case 'remove_saved': {
      const sJob = db.savedJobs.find(j => j.id === id);
      if (sJob) {
        removeJobFromList(db.savedJobs, id);
        if (!db.dismissedJobs.some(j => j.id === id)) {
          db.dismissedJobs.unshift(sJob);
        }
        modified = true;
      }
      break;
    }
    case 'add_discovered_batch': {
      if (Array.isArray(jobs)) {
        for (const newJob of jobs) {
          const exists = db.scannedJobs.some(j => j.id === newJob.id) ||
                         db.watchlist.some(j => j.id === newJob.id) ||
                         db.savedJobs.some(j => j.id === newJob.id) ||
                         db.dismissedJobs.some(j => j.id === newJob.id);
          if (!exists) {
            db.scannedJobs.unshift(newJob);
            modified = true;
          }
        }
      }
      break;
    }
    case 'sync_client_data': {
      const { scannedJobs, watchlist, savedJobs, dismissedJobs, profile: clientProfile, llmConfig: clientConfig, stats: clientStats } = req.body;
      if (Array.isArray(scannedJobs)) db.scannedJobs = scannedJobs;
      if (Array.isArray(watchlist)) db.watchlist = watchlist;
      if (Array.isArray(savedJobs)) db.savedJobs = savedJobs;
      if (Array.isArray(dismissedJobs)) db.dismissedJobs = dismissedJobs;
      if (clientProfile) db.profile = clientProfile;
      if (clientConfig) db.llmConfig = clientConfig;
      if (clientStats) {
        db.stats = {
          totalScanned: typeof clientStats.totalScanned === 'number' ? clientStats.totalScanned : 0,
          duplicatesPrevented: typeof clientStats.duplicatesPrevented === 'number' ? clientStats.duplicatesPrevented : 0,
          llmEvaluations: typeof clientStats.llmEvaluations === 'number' ? clientStats.llmEvaluations : 0,
          totalSourced: typeof clientStats.totalSourced === 'number' ? clientStats.totalSourced : 0
        };
      }
      modified = true;
      break;
    }
    default:
      res.status(400).json({ error: `Unknown action: ${action}` });
      return;
  }

  if (modified) {
    writeDb(db);
  }
  res.json({ success: true, db });
});

// Endpoint to force run sourcing immediately
app.post('/api/jobs/search-now', async (req, res) => {
  if (globalState.isSourcingActive) {
    res.status(429).send('A search scan is already actively running. Please wait for it to complete.');
    return;
  }
  try {
    console.log('[API] Instant search-now trigger received.');
    addRefinerLog('Search Agent: Manual "Search Now" search triggered by candidate.');
    
    // Reset pacing variables to allow immediate search and bypass cooldowns
    globalState.lastScannerActiveTime = 0; // force refiner idle check to pass
    globalState.lastBackgroundSourceTime = 0; // force sourcing to run
    
    // Clear domain fetch cooldowns to allow immediate scanning/sourcing of all domains
    for (const key of Object.keys(globalState.domainFetchCooldowns)) {
      delete globalState.domainFetchCooldowns[key];
    }
    
    // Execute sourcing synchronously for this request with isManual = true
    const preventedDuplicates = await runBackgroundSourcing(true);
    
    // Set the background source time to now so it resets the timer and prevents double-triggering
    globalState.lastBackgroundSourceTime = Date.now();
    
    const freshDb = readDb();
    res.json({ success: true, db: freshDb, preventedDuplicates });
  } catch (err: any) {
    console.error('[API] Search-now trigger failed:', err);
    res.status(500).json({ error: err.message || 'Failed to execute immediate search.' });
  }
});

// Endpoint to force run the LLM Refiner in a loop until 3 matches or empty
app.post('/api/jobs/trigger-refiner', async (req, res) => {
  if (globalState.currentlyRefiningJobId) {
    res.status(429).send('A refinement process is already running. Please wait for it to complete.');
    return;
  }
  
  // We send the immediate response so the UI doesn't hang, while processing continues in background.
  res.json({ success: true, message: 'LLM Matching loop started in background.' });

  try {
    console.log('[API] Instant trigger-refiner received. Starting loop...');
    addRefinerLog('Refiner: Manual "Trigger LLM Matching" initiated by candidate.');
    
    // Clear domain fetch cooldowns to allow immediate processing
    for (const key of Object.keys(globalState.domainFetchCooldowns)) {
      delete globalState.domainFetchCooldowns[key];
    }

    let matchesFound = 0;
    while (matchesFound < 3) {
      // Pass isManual = true to bypass idle checks
      const result = await runRefinementCycle(true);
      
      if (result === 'empty') {
        console.log('[Refiner] Loop finished: Unmatched queue is empty.');
        addRefinerLog('Refiner: Matching loop finished (Queue empty).');
        break;
      }
      
      if (result === 'error' || result === 'skipped') {
        console.log(`[Refiner] Loop encountered ${result}. Breaking to prevent infinite loop.`);
        addRefinerLog(`Refiner Warning: Matching loop stopped due to ${result} state.`);
        break;
      }

      if (result === 'match') {
        matchesFound++;
        console.log(`[Refiner] Loop matched job. Total matches found: ${matchesFound}/3`);
      }
      
      // Delay to respect LLM / Rate limits
      if (matchesFound < 3) {
        console.log(`[Refiner] Loop sleeping for 8000ms before next iteration...`);
        await new Promise(r => setTimeout(r, 8000));
      }
    }
    
    if (matchesFound >= 3) {
      console.log('[Refiner] Loop finished: Reached 3 successful matches.');
      addRefinerLog('Refiner: Matching loop finished (Found 3 matches).');
    }
  } catch (err: any) {
    console.error('[API] trigger-refiner loop failed:', err);
    addRefinerLog(`Refiner Error: Matching loop encountered an error: ${err.message}`);
  }
});

app.get('/api/test/mock-page', (req, res) => {
  res.send(req.query.text || '');
});

app.get('/api/test/refiner', async (req, res) => {
  try {
    console.log('[Test Route] Triggering manual refinement cycle...', req.query);
    globalState.lastScannerActiveTime = 0; // Force idle
    
    if (req.query.clearCooldowns === 'true') {
      console.log('[Test Route] Clearing domain cooldowns...');
      for (const key in globalState.domainFetchCooldowns) {
        delete globalState.domainFetchCooldowns[key];
      }
    }

    if (req.query.runSourcing === 'true') {
      console.log('[Test Route] Forcing background sourcing execution...');
      globalState.lastBackgroundSourceTime = 0;
    }
    
    const beforeDb = readDb();
    await runRefinementCycle();
    const afterDb = readDb();
    
    res.json({
      success: true,
      message: 'Refinement cycle executed.',
      before: {
        scannedCount: beforeDb.scannedJobs.length,
        dismissedCount: beforeDb.dismissedJobs.length
      },
      after: {
        scannedCount: afterDb.scannedJobs.length,
        dismissedCount: afterDb.dismissedJobs.length,
        scannedJobs: afterDb.scannedJobs,
        dismissedJobs: afterDb.dismissedJobs,
        logs: afterDb.logs
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to retrieve LLM health and circuit breaker metrics
app.get('/api/llm/health', (req, res) => {
  const health = globalState.llmHealthState;
  const successRate = health.totalAttempts > 0 
    ? (health.totalSuccesses / health.totalAttempts) 
    : 1.0;
  res.json({
    ...health,
    successRate
  });
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Configure Vite or Static server
async function start() {


  // Start the background refiner
  startBackgroundRefiner();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
}

start();
