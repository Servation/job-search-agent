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
  timeoutMs: number,
  temperature: number = 0.1
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
    temperature
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
    // Stamp last-success time so the adaptive layer can tell when the model has
    // gone idle long enough to need a warmup before a full-context evaluation.
    globalState.llmHealthState.lastSuccessTime = Date.now();
    return data.choices?.[0]?.message?.content || '{}';
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`LLM Request Timeout (${timeoutMs}ms limit exceeded)`);
    }
    throw err;
  }
}

// How long the model can sit idle before we assume it may have been unloaded
// from VRAM and needs a warmup ping. Kept just above the refiner's ~60s heartbeat
// so back-to-back evaluations don't trigger redundant warmups.
const WARM_WINDOW_MS = 120000;

/**
 * Sends a minimal request to force the local model to load into VRAM before a
 * real (full-context) evaluation. Cold-loading a 12B model can take ~15-20s; if
 * that load happens during the first scoring attempt it can blow the timeout and
 * force an unnecessary context reduction. Paying the load cost in a tiny throwaway
 * request keeps the real request warm (~6s) and at full context. Non-fatal.
 */
export async function warmUpLLM(
  endpoint: string,
  apiKey: string,
  modelName: string
): Promise<void> {
  const health = globalState.llmHealthState;
  // Skip if the model was used recently — it's still warm.
  if (Date.now() - (health.lastSuccessTime || 0) < WARM_WINDOW_MS) return;

  try {
    console.log('[warmUpLLM] Model idle/cold — sending warmup ping before evaluation...');
    // Generous timeout to absorb a full cold load; performLLMRequest stamps
    // lastSuccessTime on success so the subsequent real request skips re-warming.
    await performLLMRequest(endpoint, apiKey, modelName, 'Reply with: OK', 90000);
    console.log('[warmUpLLM] Warmup complete — model is resident.');
  } catch (err: any) {
    // Non-fatal: the real request still runs its own adaptive retry/timeout logic.
    console.warn(`[warmUpLLM] Warmup ping failed (non-fatal): ${err.message || err}`);
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
  isHN = false,
  temperature = 0.1
): Promise<{ content: string; tier: number }> {
  let startTier = 0;
  let baseTimeout = baseTimeoutMs;

  const health = globalState.llmHealthState;

  if (health.degradedMode) {
    startTier = 1;
    baseTimeout = baseTimeoutMs * 1.5;
    console.warn(`[queryCustomLLMAdaptive] LLM Sourcing: Running in DEGRADED mode. Starting at Tier 1 context, base timeout: ${baseTimeout}ms`);
  }

  // Ensure the model is resident before the first full-context attempt. Without
  // this, a cold-load on the initial Tier 0 request can exceed the timeout and
  // needlessly drop the job to reduced context (Tier 1) — the historical cause of
  // ~half of all jobs being flagged "Reduced Context". Skips itself if the model
  // was used recently (still warm).
  await warmUpLLM(endpoint, apiKey, modelName);

  const maxAttempts = 3;
  let lastError: any = null;
  // Track how many times we actually retried *within this request* due to failures.
  // The returned tier reflects actual context reduction, not just the degraded-mode
  // start offset — so jobs that succeed on their first attempt don't get flagged as
  // "Reduced Context" just because the circuit breaker was tripped earlier.
  let retryCount = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentTierIndex = Math.min(startTier + attempt, CONTEXT_TIERS.length - 1);
    const limits = getContextLimits(isHN, currentTierIndex);
    const attemptTimeoutMs = Math.round(baseTimeout * Math.pow(1.5, attempt));
    const prompt = promptBuilder(limits.resumeChars, limits.descriptionChars);

    console.log(`[queryCustomLLMAdaptive] Attempt ${attempt + 1}/${maxAttempts} (Tier ${currentTierIndex}: Resume ${limits.resumeChars} chars, Description ${limits.descriptionChars} chars) with timeout ${attemptTimeoutMs}ms`);

    health.totalAttempts++;

    try {
      const result = await performLLMRequest(endpoint, apiKey, modelName, prompt, attemptTimeoutMs, temperature);

      // Success! Reset circuit breaker
      if (health.degradedMode) {
        console.log(`[queryCustomLLMAdaptive] Success on Attempt ${attempt + 1} at Tier ${currentTierIndex}! Resetting degraded mode.`);
      }
      health.consecutiveFailures = 0;
      health.degradedMode = false;
      health.totalSuccesses++;

      // Report retryCount (number of actual retries within this call) rather than
      // currentTierIndex so that a job evaluated at Tier 1 solely because the
      // circuit breaker was in degraded mode — but which succeeded on its first
      // attempt — is NOT shown as "Reduced Context" in the UI.
      return {
        content: result,
        tier: retryCount
      };
    } catch (err: any) {
      lastError = err;
      const isTimeout = err.name === 'AbortError' || (err.message || '').includes('Timeout');
      console.warn(`[queryCustomLLMAdaptive] Attempt ${attempt + 1} failed (${isTimeout ? 'timeout' : 'error'}): ${err.message || err}`);

      // Only count genuine timeouts/aborts toward the circuit breaker — not HTTP
      // errors (4xx/5xx) or other transient issues unrelated to LLM slowness.
      if (isTimeout) {
        retryCount++;
      }

      if (attempt < maxAttempts - 1) {
        const backoffBase = 1500 * Math.pow(1.5, attempt);
        const jitter = (Math.random() * 600) - 300;
        const delay = Math.max(100, Math.round(backoffBase + jitter));
        console.log(`[queryCustomLLMAdaptive] Backoff delay: Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed! Only trigger degraded mode for timeout-related failures.
  const isTimeoutFailure = lastError?.name === 'AbortError' || (lastError?.message || '').includes('Timeout');
  if (isTimeoutFailure) {
    health.consecutiveFailures++;
    health.totalFailures++;

    if (health.consecutiveFailures >= 3 && !health.degradedMode) {
      health.degradedMode = true;
      console.warn(`[queryCustomLLMAdaptive] ⚠️ LLM Circuit Breaker: 3 consecutive timeouts reached. Entering DEGRADED mode for subsequent requests!`);
    }
  } else {
    // Non-timeout failure — reset consecutive failures so transient errors don't
    // trip the circuit breaker and cause unnecessary context degradation.
    health.consecutiveFailures = 0;
    health.totalFailures++;
  }

  throw lastError || new Error(`LLM Query failed after ${maxAttempts} adaptive attempts.`);
}

import { RawCommunityJob } from './sourcing';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Deterministic match-scoring constants (tunable).
 * Scoring is split in two: the LLM extracts FACTS (matched/missing core skills,
 * required years, credential gaps) and these constants turn those facts into a
 * reproducible 0-100 score. This avoids asking a small local model to perform
 * unstable multi-step score arithmetic in one shot (the cause of non-reproducible
 * and negative/saturated scores in the previous single-prompt approach).
 */
const SCORE_PENALTY_PER_YEAR = 7;   // points off per year of experience short
const SCORE_MAX_EXP_PENALTY = 21;   // cap on the experience penalty
const SCORE_MUSTHAVE_CAP = 55;      // ceiling when an explicit must-have skill is missing
const SCORE_SPECIALIST_CAP = 40;    // ceiling when a required formal credential is missing (PhD, license)
const SCORE_CEIL = 97;              // no posting is a literal 100% match

/** Extract the candidate's years of experience from the experienceContext string. */
export function parseCandidateYoe(experienceContext: string): number {
  const m = (experienceContext || '').match(/has\s+(\d+)\s*\+?\s*years?/i);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Builds a fact-EXTRACTION prompt (not a scoring prompt). The model lists the job's
 * core requirements and which the candidate has/lacks; the score is computed in code
 * by computeMatchScore(). For Hacker News posts it also extracts company/title/location.
 */
export function buildExtractionPrompt(
  rawText: string,
  job: { title?: string; company?: string; location?: string; description?: string },
  yoe: number,
  isHN: boolean,
  resumeLimit: number,
  descLimit: number
): string {
  const hnExtras = isHN ? `
This is a raw Hacker News "Who is hiring?" post — also extract:
- "company": the actual hiring company (never "Hacker News Community")
- "title": a concise job title
- "location": the work location (e.g. "Remote", "San Francisco, CA")` : '';
  const hnFields = isHN ? `,"company":"Extracted Company","title":"Extracted Title","location":"Extracted Location"` : '';

  return `You are an expert technical recruiter. Compare the candidate to the job and EXTRACT FACTS ONLY. Do NOT compute a score.
Candidate resume: """${rawText.slice(0, resumeLimit)}"""
Candidate years of experience: ${yoe}
Job: ${job.title || ''} at ${job.company || ''}${job.location ? ' | ' + job.location : ''}
Job description: """${(job.description || '').slice(0, descLimit)}"""${hnExtras}

Identify the job's CORE technical requirements (concrete languages, frameworks, tools, or degrees that are genuinely required — NOT "nice to have"). Then return ONLY this JSON (no markdown):
{"coreRequirements":["..."],"matched":["...requirements the candidate clearly has..."],"missing":["...core requirements the candidate lacks..."],"mustHaveMissing":false,"requiredYears":0,"specialistGapMissing":false,"experienceLevel":"Mid","industry":"Technology","salaryNum":0${hnFields}}
Rules:
- coreRequirements: concrete technical skills/tools/frameworks/degrees only. Do NOT include years-of-experience, seniority level, or soft skills (leadership/communication) — those are scored separately.
- matched: count a transferable/equivalent skill as matched (e.g. MySQL or MongoDB satisfies generic "SQL"/"database"; any cloud satisfies "cloud").
- requiredYears: the MAX years of experience the job requires (integer, 0 if unstated).
- mustHaveMissing: true only if a skill explicitly marked "required/must-have" is in "missing".
- specialistGapMissing: true ONLY if the role needs a FORMAL CREDENTIAL the candidate lacks (PhD, first-author publications, professional license, security clearance). A missing technical skill is NOT a specialist gap.`;
}

/**
 * Deterministically computes a 0-100 match score from extracted facts.
 * Reproducible (no LLM arithmetic), never negative or saturated, and self-explaining.
 */
export function computeMatchScore(f: any, yoe: number): { score: number; reason: string } {
  const matched = Array.isArray(f?.matched) ? f.matched : [];
  const missing = Array.isArray(f?.missing) ? f.missing : [];
  const core = Array.isArray(f?.coreRequirements) ? f.coreRequirements : [];
  const matchedN = matched.length;
  const totalN = Math.max(core.length, matchedN + missing.length, 1);
  const base = Math.round((100 * matchedN) / totalN);

  const expGap = Math.max(0, (Number(f?.requiredYears) || 0) - yoe);
  const expPenalty = Math.min(expGap * SCORE_PENALTY_PER_YEAR, SCORE_MAX_EXP_PENALTY);

  let score = base - expPenalty;
  if (f?.mustHaveMissing) score = Math.min(score, SCORE_MUSTHAVE_CAP);
  if (f?.specialistGapMissing) score = Math.min(score, SCORE_SPECIALIST_CAP);
  score = Math.max(0, Math.min(SCORE_CEIL, score));

  const reason =
    `Met ${matchedN}/${totalN} core` +
    (missing.length ? ` (missing: ${missing.slice(0, 3).join(', ')})` : '') + '.' +
    (expGap > 0 ? ` Exp: needs ${f.requiredYears}y, has ${yoe}y (-${expPenalty}).` : '') +
    (f?.mustHaveMissing ? ' Must-have gap.' : '') +
    (f?.specialistGapMissing ? ' Specialist gap.' : '');

  return { score, reason };
}

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
      const yoe = parseCandidateYoe(experienceContext);
      const promptBuilder = (resumeLimit: number, descLimit: number) =>
        buildExtractionPrompt(rawText, job, yoe, isHN, resumeLimit, descLimit);

      const result = await queryCustomLLMAdaptive(
        llmConfig.endpoint,
        llmConfig.apiKey,
        llmConfig.modelName,
        promptBuilder,
        (llmConfig.timeout || 120) * 1000,
        isHN,
        0 // temperature 0 -> reproducible fact extraction
      );

      const tier = result.tier;
      const cleaned = result.content.trim().replace(/^```(json)?\n?/, '').replace(/\n?```$/, '');
      const facts = JSON.parse(cleaned);
      const { score, reason } = computeMatchScore(facts, yoe);

      const finalTitle = (isHN && facts.title && facts.title !== 'Extracted Title') ? facts.title : base.title;
      const finalCompany = (isHN && facts.company && facts.company !== 'Extracted Company') ? facts.company : base.company;
      const finalLocation = (isHN && facts.location && facts.location !== 'Extracted Location') ? facts.location : base.location;
      
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
        matchScore: isBlocked ? 0 : score,
        matchReason: isBlocked ? 'Company Blocked' : reason,
        skillsRequired: Array.isArray(facts.coreRequirements) ? facts.coreRequirements : [],
        industry: facts.industry || '', experienceLevel: facts.experienceLevel || 'Mid',
        salaryNum: typeof facts.salaryNum === 'number' ? facts.salaryNum : 0,
        retryTier: tier,
      });
    } catch (e: any) {
      console.warn(`[Community] LLM score failed for "${job.title}":`, e.message);
      scored.push(base);
    }
  }
  return scored;
}
