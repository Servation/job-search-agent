/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import { globalState, CONTEXT_TIERS } from './config';
import { checkDescriptionLocationMismatch, extractSalaryWithRegex } from './utils';

// Lazy initializer for Google Gemini API to prevent app crash if key is missing on startup
let aiClient: GoogleGenAI | null = null;

export function getAIClient(): GoogleGenAI {
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

export function getContextLimits(isHN: boolean, tierIndex: number) {
  const tier = CONTEXT_TIERS[tierIndex] || CONTEXT_TIERS[0];
  return {
    resumeChars: tier.resumeChars,
    descriptionChars: isHN ? Math.max(tier.descriptionChars * 2, 500) : tier.descriptionChars
  };
}

/**
 * Performs raw LLM completion request.
 */
export async function performLLMRequest(
  endpoint: string,
  apiKey: string,
  modelName: string,
  prompt: string,
  timeoutMs: number
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
    if (err.name === 'AbortError') {
      throw new Error(`LLM Request Timeout (${timeoutMs}ms limit exceeded)`);
    }
    throw err;
  }
}

/**
 * Queries an OpenAI-compatible endpoint with a prompt using legacy signature.
 */
export async function queryCustomLLM(
  endpoint: string,
  apiKey: string,
  modelName: string,
  prompt: string,
  attemptsLeft = 2,
  timeoutMs = 30000
): Promise<string> {
  try {
    return await performLLMRequest(endpoint, apiKey, modelName, prompt, timeoutMs);
  } catch (err: any) {
    if (attemptsLeft > 1) {
      console.warn(`[queryCustomLLM] Attempt failed: ${err.message}. Retrying in 1.5s... (${attemptsLeft - 1} attempts remaining)`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      return queryCustomLLM(endpoint, apiKey, modelName, prompt, attemptsLeft - 1, timeoutMs);
    }
    throw err;
  }
}

/**
 * Adaptive LLM query function with context reduction, escalating timeouts, and circuit breaker.
 */
export async function queryCustomLLMAdaptive(
  endpoint: string,
  apiKey: string,
  modelName: string,
  promptBuilder: (resumeChars: number, descChars: number) => string,
  baseTimeoutMs = 30000,
  isHN = false
): Promise<{ content: string; tier: number }> {
  let startTier = 0;
  let baseTimeout = baseTimeoutMs;

  const health = globalState.llmHealthState;

  if (health.degradedMode) {
    startTier = 1;
    baseTimeout = baseTimeoutMs * 1.5;
    console.warn(`[queryCustomLLMAdaptive] LLM Sourcing: Running in DEGRADED mode. Starting at Tier 1 context, base timeout: ${baseTimeout}ms`);
  }

  const maxAttempts = 3;
  let lastError: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentTierIndex = Math.min(startTier + attempt, CONTEXT_TIERS.length - 1);
    const limits = getContextLimits(isHN, currentTierIndex);
    const attemptTimeoutMs = Math.round(baseTimeout * Math.pow(1.5, attempt));
    const prompt = promptBuilder(limits.resumeChars, limits.descriptionChars);

    console.log(`[queryCustomLLMAdaptive] Attempt ${attempt + 1}/${maxAttempts} (Tier ${currentTierIndex}: Resume ${limits.resumeChars} chars, Description ${limits.descriptionChars} chars) with timeout ${attemptTimeoutMs}ms`);

    health.totalAttempts++;

    try {
      const result = await performLLMRequest(endpoint, apiKey, modelName, prompt, attemptTimeoutMs);

      // Success! Reset circuit breaker
      if (health.degradedMode) {
        console.log(`[queryCustomLLMAdaptive] Success on Attempt ${attempt + 1} at Tier ${currentTierIndex}! Resetting degraded mode.`);
      }
      health.consecutiveFailures = 0;
      health.degradedMode = false;
      health.totalSuccesses++;

      return {
        content: result,
        tier: currentTierIndex
      };
    } catch (err: any) {
      lastError = err;
      console.warn(`[queryCustomLLMAdaptive] Attempt ${attempt + 1} failed: ${err.message || err}`);

      if (attempt < maxAttempts - 1) {
        const backoffBase = 1500 * Math.pow(1.5, attempt);
        const jitter = (Math.random() * 600) - 300;
        const delay = Math.max(100, Math.round(backoffBase + jitter));
        console.log(`[queryCustomLLMAdaptive] Backoff delay: Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed! Trigger degraded mode if threshold reached
  health.consecutiveFailures++;
  health.totalFailures++;

  if (health.consecutiveFailures >= 3 && !health.degradedMode) {
    health.degradedMode = true;
    console.warn(`[queryCustomLLMAdaptive] ⚠️ LLM Circuit Breaker: 3 consecutive failures reached. Entering DEGRADED mode for subsequent requests!`);
  }

  throw lastError || new Error(`LLM Query failed after ${maxAttempts} adaptive attempts.`);
}

import { RawCommunityJob } from './sourcing';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function scoreCommunityJobs(
  jobs: RawCommunityJob[], rawText: string, llmConfig: any,
  experienceContext: string, savedJobs: any[],
  searchLocation: string = 'United States',
  prefersRemote: boolean = true,
  blockedCompanies: string[] = [],
  onProgress?: (job: RawCommunityJob, index: number, total: number) => void
): Promise<any[]> {
  const scored: any[] = [];
  for (let i = 0; i < jobs.length; i++) {
    if (i > 0) {
      // Rate-Limited Evaluation Batching delay (2 seconds)
      await delay(2000);
    }
    const job = jobs[i];
    if (onProgress) {
      onProgress(job, i, jobs.length);
    }
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
      isFullDescriptionFetched: true,
    };

    // Check if the company is on the blocklist
    const companyL = job.company.toLowerCase().trim();
    if (blockedCompanies.some(bc => bc.toLowerCase().trim() === companyL)) {
      scored.push({
        ...base,
        matchScore: 0,
        matchReason: 'Company Blocked',
      });
      continue;
    }

    // Check location mismatch first to optimize and save LLM costs
    const locationMismatch = checkDescriptionLocationMismatch(job.description || '', searchLocation, prefersRemote);
    if (locationMismatch) {
      scored.push({
        ...base,
        matchScore: 0,
        matchReason: locationMismatch,
      });
      continue;
    }

    // Try to extract salary using regex
    const regexSalary = extractSalaryWithRegex(job.description || '');
    if (regexSalary) {
      base.salary = regexSalary.salary;
      base.salaryNum = regexSalary.salaryNum;
    }

    try {
      const isHN = job.source === 'hackernews';
      const promptBuilder = (resumeLimit: number, descLimit: number) => {
        if (isHN) {
          return `You are an expert Job Placement Agent. Evaluate the candidate resume against this Hacker News "Who is hiring?" job posting.
        Candidate Resume: """${rawText.slice(0, resumeLimit)}"""
        Hacker News Post Description:
        """
        ${job.description.slice(0, descLimit)}
        """
        Experience rule: ${experienceContext}
        
        Since this is a raw community forum post, you MUST identify and extract the following:
        1. "company": The actual name of the hiring company (do NOT return "Hacker News Community").
        2. "title": A concise job title (e.g. "Senior Software Engineer" or "Full-Stack Developer").
        3. "location": The work location (e.g. "Remote", "San Francisco, CA", "Hybrid (New York)").
        
        Return ONLY a raw JSON object (no markdown):
        {"matchScore":85,"matchReason":"E.g. Met 3/4 requirements. Missing explicit AWS experience.","skillsRequired":["Skill"],"industry":"Technology","experienceLevel":"Senior","salaryNum":120000,"company":"Extracted Company","title":"Extracted Title","location":"Extracted Location"}`;
        } else {
          return `You are an expert Job Placement Agent. Evaluate the candidate resume against this job.
        Candidate Resume: """${rawText.slice(0, resumeLimit)}"""
        Job: ${job.title} at ${job.company} | Location: ${job.location}
        Description: ${job.description.slice(0, descLimit)}
        Experience rule: ${experienceContext}
        Return ONLY a raw JSON object (no markdown):
        {"matchScore":85,"matchReason":"E.g. Met 3/4 requirements. Missing explicit AWS experience.","skillsRequired":["Skill"],"industry":"Technology","experienceLevel":"Senior","salaryNum":120000}`;
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
      
      const finalTitle = (job.source === 'hackernews' && ev.title && ev.title !== 'Extracted Title') ? ev.title : base.title;
      const finalCompany = (job.source === 'hackernews' && ev.company && ev.company !== 'Extracted Company') ? ev.company : base.company;
      const finalLocation = (job.source === 'hackernews' && ev.location && ev.location !== 'Extracted Location') ? ev.location : base.location;
      
      const existsInSaved = savedJobs.some((s: any) =>
        s.title.toLowerCase().trim() === finalTitle.toLowerCase().trim() &&
        s.company.toLowerCase().trim() === finalCompany.toLowerCase().trim()
      );

      const companyL2 = finalCompany.toLowerCase().trim();
      const isBlocked = blockedCompanies.some(bc => bc.toLowerCase().trim() === companyL2);

      scored.push({
        ...base,
        title: finalTitle,
        company: finalCompany,
        location: finalLocation,
        isDuplicate: base.isDuplicate || existsInSaved,
        matchScore: isBlocked ? 0 : (typeof ev.matchScore === 'number' ? Math.min(100, Math.max(0, ev.matchScore)) : 50),
        matchReason: isBlocked ? 'Company Blocked' : (ev.matchReason || ''),
        skillsRequired: ev.skillsRequired || [],
        industry: ev.industry || '', experienceLevel: ev.experienceLevel || 'Mid',
        salaryNum: typeof ev.salaryNum === 'number' ? ev.salaryNum : 0,
        retryTier: tier,
      });
    } catch (e: any) {
      console.warn(`[Community] LLM score failed for "${job.title}":`, e.message);
      scored.push(base);
    }
  }
  return scored;
}
