/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type JobTypeType = 'Full-Time' | 'Contract' | 'Part-Time';
export type JobStatusType = 'discovered' | 'applied' | 'review' | 'interviewing' | 'offered' | 'rejected' | 'dismissed';

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  type: JobTypeType;
  isW2: boolean; // true = W2, false = 1099 or C2C or not specified
  description: string;
  url: string;
  postedAt: string; // ISO String or Relative time (e.g. "4 hours ago")
  matchScore: number; // 0 to 100
  matchReason?: string;
  isDuplicate: boolean;
  status: JobStatusType;
  notes?: string;
  appliedDate?: string;
  scannedAt: string; // ISO String of when the job was found
  skillsRequired?: string[];
  industry?: string;
  experienceLevel?: 'Junior' | 'Mid' | 'Senior' | 'Lead';
  isRemote?: boolean;
  salaryNum?: number;
  isUrlVerified?: boolean;
  sourceTag?: string;
  retryTier?: number;
  isRefined?: boolean;
  refinementReason?: string;
  isFullDescriptionFetched?: boolean;
}

export type LLMProvider = 'lmstudio' | 'openai';

export interface LLMConfig {
  provider?: LLMProvider;
  endpoint: string; // e.g. "http://localhost:1234/v1" for LM Studio
  apiKey: string; // custom key if not using default
  modelName: string; // e.g., "gemini-3.5-flash", "mistral", etc.
  timeout?: number; // request timeout in seconds
}

export interface ResumeProfile {
  rawText: string;
  parsedName?: string;
  parsedSkills?: string[];
  targetRoles?: string[];
  preferredLocation?: string;
  preferredTypes: JobTypeType[];
  minMatchScore: number;
  prefersRemote: boolean;
  prefersHybrid: boolean;
  prefersOnSite?: boolean;
  searchLocation: string;
  searchDistance?: string;
  autoScanInterval?: number; // Sourcing recurring interval in hours (0 = manual)
  maxDiscoveredJobs?: number; // Capacity cap for keeping discovered jobs in memory
  limitCompanyMatches?: boolean; // If true, restrict multiple matches from the same company
  maxMatchesPerCompany?: number; // Maximum matches to keep from a single company
  yearsOfExperience?: number; // Candidate's total professional years of experience (0 = not set)
  blockedCompanies?: string[]; // List of company names to exclude from sourcing/evaluation
}

export interface JobAlert {
  id: string;
  jobId: string;
  title: string;
  company: string;
  matchScore: number;
  timestamp: string;
  isRead: boolean;
}

export interface AgentStats {
  totalScanned: number;
  duplicatesPrevented: number;
  activeMatchesCount: number;
  llmEvaluations: number;
  totalSourced: number;
}

export interface PreventedDuplicate {
  id: string;
  title: string;
  company: string;
  location: string;
  source: string;
  url: string;
  reason: string;
  scannedAt: string;
}

export interface WorkdayCompany {
  name: string;
  tenant: string;
  site: string;
  host?: string;
  consecutiveFailures?: number;
}

export interface SmartRecruitersCompany {
  name: string;
  slug: string;
}

