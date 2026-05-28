/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { generateDynamicFeed } from './src/data/jobFeed.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy initializer for Google Gemini API to prevent app crash if key is missing on startup
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not defined. Please configure it in Settings > Secrets.');
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * Queries an OpenAI-compatible endpoint with a prompt.
 */
async function queryCustomLLM(
  endpoint: string,
  apiKey: string,
  modelName: string,
  prompt: string,
  attemptsLeft = 2,
  timeoutMs = 30000
): Promise<string> {
  let targetUrl = endpoint.trim();
  if (targetUrl.endsWith('/chat/completions')) {
    targetUrl = targetUrl.replace(/\/chat\/completions$/, '');
  }
  const cleanCompletionsUrl = `${targetUrl}/chat/completions`;

  const body: any = {
    model: modelName,
    messages: [
      {
        role: 'system',
        content: 'You are an expert ATS resume analyzer. Extract and return resume details strictly as a valid JSON object. Do not include markdown wraps or anything else other than raw JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.1
  };

  // Enable JSON mode for OpenAI if relevant
  if (targetUrl.includes('api.openai.com')) {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(cleanCompletionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM Sourcing Error (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '{}';
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    const errMsg = isTimeout ? `LLM Request Timeout (${timeoutMs}ms limit exceeded)` : err.message;
    
    if (attemptsLeft > 1) {
      console.warn(`[queryCustomLLM] Attempt failed: ${errMsg}. Retrying in 1.5s... (${attemptsLeft - 1} attempts remaining)`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      return queryCustomLLM(endpoint, apiKey, modelName, prompt, attemptsLeft - 1, timeoutMs);
    }
    
    if (isTimeout) {
      throw new Error(`LLM Request Timeout (${timeoutMs}ms limit exceeded)`);
    }
    throw err;
  }
}

/// 1. Endpoint to Parse Resume Raw Text or Document Files
app.post('/api/resume/parse', async (req, res) => {
  try {
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

/**
 * Checks if a URL structure corresponds to a specific job application page, rather than a generic root/career page.
 */
function isSpecificJobPost(urlStr: string): boolean {
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
async function verifyJobUrl(url: string): Promise<{ isValid: boolean; resolvedUrl: string }> {
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

// ============================================================
// COMMUNITY JOB SOURCES — Zero auth, zero API key required
// Greenhouse: boards-api.greenhouse.io/v1/boards/{slug}/jobs
// Lever:      api.lever.co/v0/postings/{slug}?mode=json
// RemoteOK:   remoteok.com/api
// ============================================================

const GREENHOUSE_SLUGS: readonly string[] = [
  // Fintech & Payments
  'stripe', 'plaid', 'brex', 'chime', 'affirm', 'robinhood', 'coinbase',
  'mercury', 'deel', 'gusto', 'rippling', 'carta', 'moderntreasury', 'ramp',
  // Consumer & Marketplace
  'airbnb', 'doordash', 'lyft', 'pinterest', 'reddit', 'discord', 'shopify',
  'squarespace', 'vimeo', 'dropbox', 'peloton', 'faire', 'flexport',
  // SaaS & Productivity
  'hubspot', 'zendesk', 'intercom', 'okta', 'twilio', 'pagerduty', 'asana',
  'miro', 'loom', 'notion', 'airtable', 'zapier', 'postman', 'retool',
  'webflow', 'lattice', 'superhuman', 'grammarly', 'lucid',
  // Developer Tools & Infrastructure
  'mongodb', 'elastic', 'hashicorp', 'datadoghq', 'amplitude', 'mixpanel',
  'launchdarkly', 'fullstory', 'logrocket', 'contentful', 'algolia', 'heap',
  'segment', 'vanta', 'drata', 'secureframe', 'wistia', 'workos',
  // AI & ML
  'anthropic', 'openai', 'cohere', 'scale',
  // Other Tech & Fortune 500 Tech
  'figma', 'benchling', 'checkr', 'gitlab', 'twitch', 'headspace', 'calm',
  'duolingo', 'coursera', 'descript', 'gem', 'clipboard-health',
  'uber', 'servicenow', 'amd', 'paloaltonetworks', 'splunk', 'qualcomm', 'zoom'
];

const LEVER_SLUGS: readonly string[] = [
  // Big Tech Adjacent
  'netflix', 'atlassian', 'cloudflare', 'fastly',
  // Data & Analytics
  'databricks', 'confluent', 'cockroachdb', 'dbtlabs', 'airbyte', 'fivetran',
  'hightouch', 'prefect', 'dagster', 'hex',
  // AI & ML
  'huggingface', 'scale-ai', 'anduril',
  // Dev Tools & Security
  'snyk', 'temporal', 'replit', 'coda', 'chainguard',
  // Design & Consumer & Fortune 500 tech
  'canva', 'duolingo', 'coursera', 'palantir', 'snowflake', 'purestorage'
];

const ASHBY_SLUGS: readonly string[] = [
  'linear', 'posthog', 'perplexity', 'vercel', 'clerk', 'supabase', 'resend',
  'warp', 'modal', 'replicate', 'fly', 'anysphere', 'pinecone', 'copilot',
  'dust', 'vantage', 'valtown', 'dub', 'railway', 'pydantic', 'langchain',
  'chroma', 'midjourney', 'safebase', 'hume', 'runway', 'sentry'
];

interface WorkdayCompany {
  name: string;
  tenant: string;
  site: string;
  host?: string;
}

const WORKDAY_DIRECTORY: WorkdayCompany[] = [
  { name: 'Nvidia', tenant: 'nvidia', site: 'NVIDIAExternalCareerSite', host: 'nvidia.wd5.myworkdayjobs.com' },
  { name: 'Salesforce', tenant: 'salesforce', site: 'External_Career_Site', host: 'salesforce.wd12.myworkdayjobs.com' },
  { name: 'Capital One', tenant: 'capitalone', site: 'Capital_One', host: 'capitalone.wd12.myworkdayjobs.com' },
  { name: 'Adobe', tenant: 'adobe', site: 'externalcareers', host: 'adobe.wd10.myworkdayjobs.com' },
  { name: 'Workday', tenant: 'workday', site: 'Workday_Careers', host: 'workday.wd1.myworkdayjobs.com' },
  { name: 'Dell', tenant: 'dell', site: 'External', host: 'dell.wd1.myworkdayjobs.com' },
  { name: 'Autodesk', tenant: 'autodesk', site: 'Ext', host: 'autodesk.wd1.myworkdayjobs.com' },
  { name: 'Walmart', tenant: 'walmart', site: 'Walmart_Careers', host: 'walmart.wd1.myworkdayjobs.com' },
  { name: 'Target', tenant: 'target', site: 'targetcareers', host: 'target.wd5.myworkdayjobs.com' },
  { name: 'Intuit', tenant: 'intuit', site: 'External', host: 'intuit.wd5.myworkdayjobs.com' }
];

interface SmartRecruitersCompany {
  name: string;
  slug: string;
}

const SMARTRECRUITERS_DIRECTORY: SmartRecruitersCompany[] = [
  { name: 'Visa', slug: 'visa' },
  { name: 'IKEA', slug: 'ikea' },
  { name: 'Bosch', slug: 'bosch' },
  { name: 'Equinix', slug: 'equinix' }
];

// Endpoint templates (can be updated dynamically via remote registry)
let WORKDAY_SEARCH_TEMPLATE = 'https://{tenant}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs';
let WORKDAY_DETAILS_TEMPLATE = 'https://{tenant}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/job/{jobId}';
let SMARTRECRUITERS_POSTINGS_TEMPLATE = 'https://api.smartrecruiters.com/v1/companies/{slug}/postings';
let SMARTRECRUITERS_DETAILS_TEMPLATE = 'https://api.smartrecruiters.com/v1/companies/{slug}/postings/{id}';

// Weekly Remote Slugs Updates Registry caching variables
let lastRegistryFetchTime = 0;
let cachedGreenhouseSlugs: string[] = [...GREENHOUSE_SLUGS];
let cachedLeverSlugs: string[] = [...LEVER_SLUGS];
let cachedAshbySlugs: string[] = [...ASHBY_SLUGS];
let cachedWorkdayDirectory: WorkdayCompany[] = [...WORKDAY_DIRECTORY];
let cachedSmartRecruitersDirectory: SmartRecruitersCompany[] = [...SMARTRECRUITERS_DIRECTORY];

async function updateCompanyDirectoriesFromRegistry() {
  const now = Date.now();
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  
  if (now - lastRegistryFetchTime < ONE_WEEK_MS && lastRegistryFetchTime !== 0) {
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
          cachedGreenhouseSlugs = data.greenhouse;
          console.log(`[Registry] Updated Greenhouse slugs: ${cachedGreenhouseSlugs.length} entries.`);
        }
        if (Array.isArray(data.lever)) {
          cachedLeverSlugs = data.lever;
          console.log(`[Registry] Updated Lever slugs: ${cachedLeverSlugs.length} entries.`);
        }
        if (Array.isArray(data.ashby)) {
          cachedAshbySlugs = data.ashby;
          console.log(`[Registry] Updated Ashby slugs: ${cachedAshbySlugs.length} entries.`);
        }
        if (Array.isArray(data.workday)) {
          cachedWorkdayDirectory = data.workday;
          console.log(`[Registry] Updated Workday directory: ${cachedWorkdayDirectory.length} entries.`);
        }
        if (Array.isArray(data.smartrecruiters)) {
          cachedSmartRecruitersDirectory = data.smartrecruiters;
          console.log(`[Registry] Updated SmartRecruiters directory: ${cachedSmartRecruitersDirectory.length} entries.`);
        }
        if (data.templates) {
          if (data.templates.workdaySearch) WORKDAY_SEARCH_TEMPLATE = data.templates.workdaySearch;
          if (data.templates.workdayDetails) WORKDAY_DETAILS_TEMPLATE = data.templates.workdayDetails;
          if (data.templates.smartrecruitersPostings) SMARTRECRUITERS_POSTINGS_TEMPLATE = data.templates.smartrecruitersPostings;
          if (data.templates.smartrecruitersDetails) SMARTRECRUITERS_DETAILS_TEMPLATE = data.templates.smartrecruitersDetails;
          console.log('[Registry] Successfully updated API endpoint templates.');
        }
        lastRegistryFetchTime = now;
        console.log('[Registry] Successfully updated company directories from remote registry.');
        return;
      }
    }
  } catch (err: any) {
    console.warn('[Registry] Remote registry update failed (falling back to static local lists):', err.message);
  }
  // Even on failure, set the fetch timestamp to prevent slamming the request on every subsequent scan in the same run
  lastRegistryFetchTime = now;
}

async function checkSourceHealth(
  searchLocation: string,
  prefersRemote: boolean
): Promise<{
  greenhouse: boolean;
  lever: boolean;
  ashby: boolean;
  workday: boolean;
  smartrecruiters: boolean;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const status = { greenhouse: true, lever: true, ashby: true, workday: true, smartrecruiters: true };

  // 1. Test Greenhouse (via stripe)
  try {
    const res = await fetch('https://boards-api.greenhouse.io/v1/boards/stripe/jobs', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) throw new Error(`HTTP Status ${res.status}`);
  } catch (err: any) {
    status.greenhouse = false;
    warnings.push(`[Health Check Warning] Greenhouse API is degraded/offline (${err.message}). Sourcing from Greenhouse skipped.`);
  }

  // 2. Test Lever (via netflix)
  try {
    const res = await fetch('https://api.lever.co/v0/postings/netflix?mode=json', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) throw new Error(`HTTP Status ${res.status}`);
  } catch (err: any) {
    status.lever = false;
    warnings.push(`[Health Check Warning] Lever API is degraded/offline (${err.message}). Sourcing from Lever skipped.`);
  }

  // 3. Test Ashby (via linear)
  try {
    const res = await fetch('https://api.ashbyhq.com/posting-api/job-board/linear', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) throw new Error(`HTTP Status ${res.status}`);
  } catch (err: any) {
    status.ashby = false;
    warnings.push(`[Health Check Warning] Ashby API is degraded/offline (${err.message}). Sourcing from Ashby skipped.`);
  }

  // 3. Test Workday (via Nvidia and Salesforce search)
  let workdayHealthy = false;
  let workdayError = '';
  try {
    const urlSalesforce = 'https://salesforce.wd12.myworkdayjobs.com/wday/cxs/salesforce/External_Career_Site/jobs';
    const urlNvidia = 'https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs';
    
    const [resSf, resNv] = await Promise.allSettled([
      fetch(urlSalesforce, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://salesforce.wd12.myworkdayjobs.com',
          'Referer': 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/'
        },
        body: JSON.stringify({ searchText: 'health-ping', limit: 1, offset: 0, appliedFacets: {} }),
        signal: AbortSignal.timeout(4000)
      }),
      fetch(urlNvidia, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://nvidia.wd5.myworkdayjobs.com',
          'Referer': 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/'
        },
        body: JSON.stringify({ searchText: 'health-ping', limit: 1, offset: 0, appliedFacets: {} }),
        signal: AbortSignal.timeout(4000)
      })
    ]);

    const isSfOk = resSf.status === 'fulfilled' && resSf.value.ok;
    const isNvOk = resNv.status === 'fulfilled' && resNv.value.ok;

    if (isSfOk || isNvOk) {
      workdayHealthy = true;
    } else {
      const sfErr = resSf.status === 'rejected' ? resSf.reason.message : `HTTP ${resSf.value.status}`;
      const nvErr = resNv.status === 'rejected' ? resNv.reason.message : `HTTP ${resNv.value.status}`;
      workdayError = `Nvidia: ${nvErr}, Salesforce: ${sfErr}`;
    }
  } catch (err: any) {
    workdayError = err.message;
  }

  if (!workdayHealthy) {
    status.workday = false;
    warnings.push(`[Health Check Warning] Workday API is degraded or offline (${workdayError}). Sourcing from Workday skipped.`);
  }

  // 4. Test SmartRecruiters (via Visa and Equinix postings)
  let srHealthy = false;
  let srError = '';
  try {
    const urlVisa = SMARTRECRUITERS_POSTINGS_TEMPLATE.replace(/{slug}/g, 'visa');
    const urlEquinix = SMARTRECRUITERS_POSTINGS_TEMPLATE.replace(/{slug}/g, 'equinix');
    
    const [resVisa, resEquinix] = await Promise.allSettled([
      fetch(urlVisa, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3000) }),
      fetch(urlEquinix, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3000) })
    ]);

    const isVisaOk = resVisa.status === 'fulfilled' && resVisa.value.ok;
    const isEquinixOk = resEquinix.status === 'fulfilled' && resEquinix.value.ok;

    if (isVisaOk || isEquinixOk) {
      srHealthy = true;
    } else {
      const visaErr = resVisa.status === 'rejected' ? resVisa.reason.message : `HTTP ${resVisa.value.status}`;
      const eqErr = resEquinix.status === 'rejected' ? resEquinix.reason.message : `HTTP ${resEquinix.value.status}`;
      srError = `Visa: ${visaErr}, Equinix: ${eqErr}`;
    }
  } catch (err: any) {
    srError = err.message;
  }

  if (!srHealthy) {
    status.smartrecruiters = false;
    warnings.push(`[Health Check Warning] SmartRecruiters API is degraded or offline (${srError}). Sourcing from SmartRecruiters skipped.`);
  }

  return { ...status, warnings };
}

const SLUG_DISPLAY_NAMES: Record<string, string> = {
  'datadoghq': 'Datadog', 'scale-ai': 'Scale AI', 'scaleai': 'Scale AI',
  'dbtlabs': 'dbt Labs', 'huggingface': 'Hugging Face',
  'cockroachdb': 'CockroachDB', 'launchdarkly': 'LaunchDarkly',
  'logrocket': 'LogRocket', 'fullstory': 'FullStory',
  'moderntreasury': 'Modern Treasury', 'clipboard-health': 'Clipboard Health',
  'pagerduty': 'PagerDuty', 'workos': 'WorkOS', 'airbyte': 'Airbyte',
  'chainguard': 'Chainguard', 'fivetran': 'Fivetran', 'hightouch': 'Hightouch',
  'posthog': 'PostHog', 'supabase': 'Supabase', 'pinecone': 'Pinecone',
  'safebase': 'SafeBase', 'valtown': 'Val Town', 'langchain': 'LangChain',
  'copilot': 'Copilot', 'perplexity': 'Perplexity', 'replicate': 'Replicate',
  'anysphere': 'Cursor', 'midjourney': 'Midjourney', 'fly': 'Fly.io',
  'clerk': 'Clerk', 'resend': 'Resend', 'warp': 'Warp', 'modal': 'Modal',
};

function communitySlugToName(slug: string): string {
  return SLUG_DISPLAY_NAMES[slug] ??
    slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function stripHtmlCommunity(html: string): string {
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

const ROLE_TITLE_BLOCKLIST = [
  'sales', 'marketing', 'account executive', 'recruiter', 'hr', 'talent acquisition',
  'legal', 'finance', 'operations', 'customer success', 'customer support',
  'account manager', 'sales engineer', 'product manager', 'project manager',
  'business development', 'business analyst', 'office manager', 'receptionist',
  'administrative', 'executive assistant', 'internship', 'intern', 'fellowship',
  'mechanical', 'civil', 'chemical', 'electrical', 'structural', 'construction',
  'nursing', 'medical', 'physician', 'doctor', 'teacher', 'instructor', 'retail'
];

function isBlocklistedRole(title: string, targetRoles: string[], yearsOfExperience: number = 0): boolean {
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

function exceedsExperienceRequirement(description: string, yearsOfExperience: number): boolean {
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

function detectUSState(locStr: string): string | null {
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

function normalizeLocation(locStr: string): string {
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

function matchesLocation(jobLocation: string, searchLocation: string, prefersRemote: boolean): boolean {
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

function extractRoleKeywords(targetRoles: string[]): string[] {
  const stop = new Set(['and', 'the', 'for', 'with', 'our', 'team', 'role', 'you', 'will', 'lead']);
  return [...new Set(
    targetRoles.flatMap(r =>
      r.toLowerCase().split(/[\s,\/\-\(\)]+/).filter(w => w.length >= 4 && !stop.has(w))
    )
  )];
}

function matchesKeywords(title: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const text = title.toLowerCase();
  return keywords.some(kw => text.includes(kw));
}

interface RawCommunityJob {
  title: string; company: string; location: string; description: string;
  url: string; applyUrl?: string; postedAt: string; type: string;
  salary?: string; isRemote: boolean; source: 'greenhouse' | 'lever' | 'workday' | 'smartrecruiters' | 'ashby' | 'remoteok' | 'websearch';
}

async function fetchGreenhouseJobs(
  slugs: readonly string[], 
  keywords: string[],
  targetRoles: string[],
  searchLocation: string,
  prefersRemote: boolean,
  yearsOfExperience: number = 0
): Promise<RawCommunityJob[]> {
  const results = await Promise.allSettled(
    slugs.map(async (slug): Promise<RawCommunityJob[]> => {
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
            description: stripHtmlCommunity(j.content || '').slice(0, 1800),
            url: j.absolute_url || '',
            postedAt: j.updated_at || new Date().toISOString(),
            type: 'Full-Time',
            isRemote: (j.location?.name || '').toLowerCase().includes('remote'),
            source: 'greenhouse' as const,
          }));
      } catch { clearTimeout(tid); return []; }
    })
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

async function fetchLeverJobs(
  slugs: readonly string[], 
  keywords: string[],
  targetRoles: string[],
  searchLocation: string,
  prefersRemote: boolean,
  yearsOfExperience: number = 0
): Promise<RawCommunityJob[]> {
  const results = await Promise.allSettled(
    slugs.map(async (slug): Promise<RawCommunityJob[]> => {
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
              description: (j.descriptionPlain || stripHtmlCommunity(j.description || '')).slice(0, 1800),
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
    })
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

async function fetchAshbyJobs(
  slugs: readonly string[],
  keywords: string[],
  targetRoles: string[],
  searchLocation: string,
  prefersRemote: boolean,
  yearsOfExperience: number = 0
): Promise<RawCommunityJob[]> {
  const results = await Promise.allSettled(
    slugs.map(async (slug): Promise<RawCommunityJob[]> => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000); // 8 seconds timeout
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
            const desc = (j.descriptionPlain || (j.descriptionHtml ? stripHtmlCommunity(j.descriptionHtml) : '')).slice(0, 1800);
            
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
    })
  );
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

async function fetchWorkdayJobs(
  companies: WorkdayCompany[],
  keywords: string[],
  targetRoles: string[],
  searchLocation: string,
  prefersRemote: boolean,
  yearsOfExperience: number = 0
): Promise<RawCommunityJob[]> {
  const results = await Promise.allSettled(
    companies.map(async (company): Promise<RawCommunityJob[]> => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 10000); // 10s timeout per company
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
            const dTid = setTimeout(() => dCtrl.abort(), 5000);
            
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
                const desc = stripHtmlCommunity(jobDescHtml).slice(0, 1800);
                
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
    })
  );
  
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

async function fetchSmartRecruitersJobs(
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
        const searchUrl = SMARTRECRUITERS_POSTINGS_TEMPLATE.replace(/{slug}/g, company.slug);
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
            const detailUrl = SMARTRECRUITERS_DETAILS_TEMPLATE.replace(/{slug}/g, company.slug).replace(/{id}/g, p.id);
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
                const desc = stripHtmlCommunity(jobDescHtml).slice(0, 1800);
                
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

async function fetchRemoteOKJobs(
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
        description: j.description ? stripHtmlCommunity(j.description).slice(0, 1800) : '',
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

async function scoreCommunityJobs(
  jobs: RawCommunityJob[], rawText: string, llmConfig: any,
  experienceContext: string, savedJobs: any[]
): Promise<any[]> {
  const scored = await Promise.allSettled(jobs.map(async (job, i) => {
    const isDuplicate = savedJobs.some((s: any) =>
      s.title.toLowerCase() === job.title.toLowerCase() &&
      s.company.toLowerCase() === job.company.toLowerCase()
    );
    const base: any = {
      id: `community-${job.source}-${Date.now()}-${i}`,
      title: job.title, company: job.company, location: job.location,
      salary: job.salary || 'Not specified', type: job.type || 'Full-Time',
      isW2: true, description: job.description,
      url: job.applyUrl || job.url, postedAt: job.postedAt || 'Posted recently',
      isDuplicate, status: 'discovered', scannedAt: new Date().toISOString(),
      isUrlVerified: true, isRemote: job.isRemote,
      skillsRequired: [], industry: '', experienceLevel: 'Mid',
      salaryNum: 0, matchScore: 50, matchReason: '', sourceTag: job.source,
    };
    if (!llmConfig?.endpoint || !rawText) return base;
    try {
      const evalPrompt = `You are an expert Job Placement Agent. Evaluate the candidate resume against this job.
        Candidate Resume: """${rawText.slice(0, 1500)}"""
        Job: ${job.title} at ${job.company} | Location: ${job.location}
        Description: ${job.description.slice(0, 800)}
        Experience rule: ${experienceContext}
        Return ONLY a raw JSON object (no markdown):
        {"matchScore":85,"matchReason":"One sentence explanation under 15 words.","skillsRequired":["Skill"],"industry":"Technology","experienceLevel":"Senior","salaryNum":120000}`;
      const txt = await queryCustomLLM(
        llmConfig.endpoint,
        llmConfig.apiKey,
        llmConfig.modelName,
        evalPrompt,
        2,
        (llmConfig.timeout || 30) * 1000
      );
      const cleaned = txt.trim().replace(/^```(json)?\n?/, '').replace(/\n?```$/, '');
      const ev = JSON.parse(cleaned);
      return {
        ...base,
        matchScore: typeof ev.matchScore === 'number' ? Math.min(100, Math.max(0, ev.matchScore)) : 50,
        matchReason: ev.matchReason || '', skillsRequired: ev.skillsRequired || [],
        industry: ev.industry || '', experienceLevel: ev.experienceLevel || 'Mid',
        salaryNum: typeof ev.salaryNum === 'number' ? ev.salaryNum : 0,
      };
    } catch (e: any) {
      console.warn(`[Community] LLM score failed for "${job.title}":`, e.message);
      return base;
    }
  }));
  return scored.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<any>).value);
}

// 1.5. Endpoint to Source matching jobs from community boards and web searches (no LLM evaluation)
function normalizeJobUrl(urlStr: string): string {
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

function extractJobNumber(urlStr: string): string | null {
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

// 1.5. Endpoint to Source matching jobs from community boards and web searches (no LLM evaluation)
app.post('/api/jobs/source', async (req, res) => {
  try {
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
    const [ghJobs, lvJobs, ashJobs, wdJobs, srJobs, rokJobs] = await Promise.all([
      health.greenhouse ? fetchGreenhouseJobs(cachedGreenhouseSlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
      health.lever ? fetchLeverJobs(cachedLeverSlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
      health.ashby ? fetchAshbyJobs(cachedAshbySlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
      health.workday ? fetchWorkdayJobs(cachedWorkdayDirectory, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
      health.smartrecruiters ? fetchSmartRecruitersJobs(cachedSmartRecruitersDirectory, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
      (prefersRemote || prefersHybrid) ? fetchRemoteOKJobs(roleKeywords, skills, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
    ]);

    let communityJobs = [...ghJobs, ...lvJobs, ...ashJobs, ...wdJobs, ...srJobs, ...rokJobs];
    console.log(`[Source Endpoint] Sourced counts -> Greenhouse: ${ghJobs.length}, Lever: ${lvJobs.length}, Ashby: ${ashJobs.length}, Workday: ${wdJobs.length}, SmartRecruiters: ${srJobs.length}, RemoteOK: ${rokJobs.length}`);

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
        const description = cleanText.slice(0, 1800);

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
        smartrecruiters: { count: srJobs.length, status: health.smartrecruiters ? 'ok' : 'skipped' },
        remoteok: { count: rokJobs.length, status: (prefersRemote || prefersHybrid) ? 'ok' : 'skipped' },
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
    };

    // Verify URL
    console.log(`[Evaluate Endpoint] Verifying URL for ${job.title} at ${job.company}: ${job.url}`);
    const verification = await verifyJobUrl(job.url);
    base.url = verification.resolvedUrl;
    base.isUrlVerified = verification.isValid;

    if (!llmConfig || !llmConfig.endpoint) {
      res.json(base);
      return;
    }

    try {
      console.log(`[Evaluate Endpoint] Scoring ${job.title} at ${job.company} via custom LLM...`);
      const evalPrompt = `You are an expert Job Placement Agent. Evaluate the candidate resume against this job.
        Candidate Resume: """${rawText.slice(0, 1500)}"""
        Job: ${job.title} at ${job.company} | Location: ${job.location}
        Description: ${job.description.slice(0, 800)}
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
      
      const txt = await queryCustomLLM(
        llmConfig.endpoint,
        llmConfig.apiKey,
        llmConfig.modelName,
        evalPrompt,
        2,
        (llmConfig.timeout || 30) * 1000
      );
      const cleaned = txt.trim().replace(/^```(json)?\n?/, '').replace(/\n?```$/, '');
      const ev = JSON.parse(cleaned);
      
      const finalJob = {
        ...base,
        matchScore: typeof ev.matchScore === 'number' ? Math.min(100, Math.max(0, ev.matchScore)) : 50,
        matchReason: ev.matchReason || '',
        skillsRequired: ev.skillsRequired || [],
        industry: ev.industry || '',
        experienceLevel: ev.experienceLevel || 'Mid',
        salaryNum: typeof ev.salaryNum === 'number' ? ev.salaryNum : 0,
      };
      
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
    const {
      rawText,
      targetRoles = [],
      preferredTypes = ['Full-Time', 'Contract', 'Part-Time'],
      prefersW2Only = false,
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
    console.log('[Community Sources] Starting Greenhouse, Lever, Workday, SmartRecruiters, RemoteOK fetch in parallel...');
    const communitySourcesPromise = (async () => {
      await updateCompanyDirectoriesFromRegistry();
      const [ghRes, lvRes, ashRes, wdRes, srRes, rokRes] = await Promise.allSettled([
        fetchGreenhouseJobs(cachedGreenhouseSlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience),
        fetchLeverJobs(cachedLeverSlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience),
        fetchAshbyJobs(cachedAshbySlugs, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience),
        fetchWorkdayJobs(cachedWorkdayDirectory, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience),
        fetchSmartRecruitersJobs(cachedSmartRecruitersDirectory, roleKeywords, targetRoles, searchLocation, prefersRemote, yearsOfExperience),
        (prefersRemote || prefersHybrid) ? fetchRemoteOKJobs(roleKeywords, skills, targetRoles, searchLocation, prefersRemote, yearsOfExperience) : Promise.resolve([]),
      ]);
      const raw: RawCommunityJob[] = [
        ...(ghRes.status === 'fulfilled' ? ghRes.value : []),
        ...(lvRes.status === 'fulfilled' ? lvRes.value : []),
        ...(ashRes.status === 'fulfilled' ? ashRes.value : []),
        ...(wdRes.status === 'fulfilled' ? wdRes.value : []),
        ...(srRes.status === 'fulfilled' ? srRes.value : []),
        ...(rokRes.status === 'fulfilled' ? rokRes.value : []),
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
      return scoreCommunityJobs(toScore, rawText, llmConfig, experienceContext, savedJobs);
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
        - W2 Preferred Only: ${prefersW2Only ? 'Yes, filter out non-W2 or default status if known' : 'No constraint'}
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
              .trim()
              .slice(0, 1200);
              
            if (pageText.length < 200) continue;
            
            console.log(`[Local Web Sourcing] Asking local model "${llmConfig.modelName}" to parse page text...`);
            const evalPrompt = `
              Analyze the following job posting text and evaluate it against the candidate resume              Candidate Resume:
              """
              ${(rawText || '').slice(0, 1500)}
              """
              
              Job Post Text:
              """
              ${pageText}
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
            
            const modelResText = await queryCustomLLM(
              llmConfig.endpoint,
              llmConfig.apiKey,
              llmConfig.modelName,
              evalPrompt,
              2,
              (llmConfig.timeout || 30) * 1000
            );
            
            let cleanedJSON = modelResText.trim();
            if (cleanedJSON.startsWith('```')) {
              cleanedJSON = cleanedJSON.replace(/^```(json)?\n/, '').replace(/\n```$/, '');
            }
            
            const parsedJob = JSON.parse(cleanedJSON);
            scrapedJobs.push({
              ...parsedJob,
              url: verification.resolvedUrl,
              isUrlVerified: true,
              salaryNum: typeof parsedJob.salary === 'string' ? (parseInt(parsedJob.salary.replace(/[^0-9]/g, '')) || 0) : (parsedJob.salaryNum || 0)
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
      // Exclude unverified links as requested
      if (!job.isUrlVerified) {
        return false;
      }
      if (preferredTypes.length > 0 && job.type) {
        const matchesType = preferredTypes.some((t: string) => t.toLowerCase() === job.type.toLowerCase());
        if (!matchesType) return false;
      }
      if (prefersW2Only && !job.isW2) {
        return false;
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

// Configure Vite or Static server
async function start() {
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
