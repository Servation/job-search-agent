/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkdayCompany, SmartRecruitersCompany } from '../src/types';
import { readDb, writeDb } from './db';

export const PORT = 3000;

export const CONTEXT_TIERS = [
  { resumeChars: 8000, descriptionChars: 25000, label: 'full' },      // Tier 0: Normal
  { resumeChars: 4000, descriptionChars: 12000, label: 'reduced' },   // Tier 1: Reduced
  { resumeChars: 1500, descriptionChars: 5000,  label: 'minimal' },   // Tier 2: Minimal
];

export const ROLE_TITLE_BLOCKLIST = [
  'sales', 'marketing', 'account executive', 'recruiter', 'hr', 'talent acquisition',
  'legal', 'finance', 'operations', 'customer success', 'customer support',
  'account manager', 'sales engineer', 'product manager', 'project manager',
  'business development', 'business analyst', 'office manager', 'receptionist',
  'administrative', 'executive assistant', 'internship', 'intern', 'fellowship',
  'mechanical', 'civil', 'chemical', 'electrical', 'structural', 'construction',
  'nursing', 'medical', 'physician', 'doctor', 'teacher', 'instructor', 'retail'
];

export const ROLE_KEYWORD_EXCLUSIONS = [
  'and', 'the', 'for', 'with', 'our', 'team', 'role', 'you', 'will', 'lead'
];

export const GREENHOUSE_SLUGS: readonly string[] = [
  // Fintech & Payments
  'stripe', 'plaid', 'brex', 'chime', 'affirm', 'robinhood', 'coinbase',
  'mercury', 'deel', 'gusto', 'rippling', 'carta', 'moderntreasury', 'ramp',
  // Consumer & Marketplace
  'airbnb', 'doordash', 'lyft', 'pinterest', 'reddit', 'discord', 'shopify',
  'squarespace', 'vimeo', 'dropbox', 'peloton', 'faire', 'flexport', 'canva',
  // SaaS & Productivity
  'hubspot', 'zendesk', 'intercom', 'okta', 'twilio', 'pagerduty', 'asana',
  'miro', 'loom', 'notion', 'airtable', 'zapier', 'postman', 'retool',
  'webflow', 'lattice', 'superhuman', 'grammarly', 'lucid',
  // Developer Tools & Infrastructure
  'mongodb', 'elastic', 'hashicorp', 'datadoghq', 'amplitude', 'mixpanel',
  'launchdarkly', 'fullstory', 'logrocket', 'contentful', 'algolia', 'heap',
  'segment', 'vanta', 'drata', 'secureframe', 'wistia', 'workos',
  'cloudflare', 'fastly', 'databricks', 'cockroachlabs', 'dbtlabs', 'airbyte',
  'fivetran', 'hightouch', 'prefect', 'dagster', 'hex', 'snyk', 'temporal',
  'snowflake', 'purestorage',
  // AI & ML
  'anthropic', 'openai', 'cohere', 'scale', 'anduril',
  // Other Tech & Fortune 500 Tech
  'figma', 'benchling', 'checkr', 'gitlab', 'twitch', 'headspace', 'calm',
  'duolingo', 'coursera', 'descript', 'gem', 'clipboard-health',
  'uber', 'servicenow', 'amd', 'paloaltonetworks', 'splunk', 'qualcomm', 'zoom'
];

export const LEVER_SLUGS: readonly string[] = [
  'netflix', 'palantir'
];

export const ASHBY_SLUGS: readonly string[] = [
  'linear', 'posthog', 'perplexity', 'vercel', 'clerk', 'supabase', 'resend',
  'warp', 'modal', 'replicate', 'fly', 'anysphere', 'pinecone', 'copilot',
  'dust', 'vantage', 'valtown', 'dub', 'railway', 'pydantic', 'langchain',
  'chroma', 'midjourney', 'safebase', 'hume', 'runway', 'sentry',
  'confluent', 'replit', 'coda'
];


export const WORKDAY_DIRECTORY: WorkdayCompany[] = [
  { name: 'Nvidia', tenant: 'nvidia', site: 'NVIDIAExternalCareerSite', host: 'nvidia.wd5.myworkdayjobs.com' },
  { name: 'Salesforce', tenant: 'salesforce', site: 'External_Career_Site', host: 'salesforce.wd12.myworkdayjobs.com' },
  { name: 'Capital One', tenant: 'capitalone', site: 'Capital_One', host: 'capitalone.wd12.myworkdayjobs.com' },
  { name: 'Adobe', tenant: 'adobe', site: 'externalcareers', host: 'adobe.wd10.myworkdayjobs.com' },
  { name: 'Workday', tenant: 'workday', site: 'Workday_Careers', host: 'workday.wd1.myworkdayjobs.com' },
  { name: 'Dell', tenant: 'dell', site: 'External', host: 'dell.wd1.myworkdayjobs.com' },
  { name: 'Autodesk', tenant: 'autodesk', site: 'Ext', host: 'autodesk.wd1.myworkdayjobs.com' },
  { name: 'Walmart', tenant: 'walmart', site: 'Walmart_Careers', host: 'walmart.wd1.myworkdayjobs.com' },
  { name: 'Target', tenant: 'target', site: 'targetcareers', host: 'target.wd5.myworkdayjobs.com' },
  { name: 'Intuit', tenant: 'intuit', site: 'External', host: 'intuit.wd5.myworkdayjobs.com' },
  { name: 'Intel', tenant: 'intel', site: 'External', host: 'intel.wd1.myworkdayjobs.com' },
  { name: 'CrowdStrike', tenant: 'crowdstrike', site: 'crowdstrike', host: 'crowdstrike.wd5.myworkdayjobs.com' },
  { name: 'Okta', tenant: 'okta', site: 'External', host: 'okta.wd1.myworkdayjobs.com' },
  { name: 'PayPal', tenant: 'paypal', site: 'jobs', host: 'paypal.wd1.myworkdayjobs.com' },
  { name: 'Block', tenant: 'block', site: 'Careers', host: 'block.wd5.myworkdayjobs.com' },
  { name: 'Broadcom', tenant: 'broadcom', site: 'External', host: 'broadcom.wd1.myworkdayjobs.com' },
  { name: 'ServiceNow', tenant: 'servicenow', site: 'ServiceNow_Careers', host: 'servicenow.wd1.myworkdayjobs.com' },
  { name: 'HP', tenant: 'hp', site: 'ExternalCareerSite', host: 'hp.wd5.myworkdayjobs.com' },
  { name: 'Splunk', tenant: 'splunk', site: 'Splunk_External_Careers', host: 'splunk.wd4.myworkdayjobs.com' },
  { name: 'Palo Alto Networks', tenant: 'paloaltonetworks', site: 'Palo_Alto_Networks_External_Careers', host: 'paloaltonetworks.wd1.myworkdayjobs.com' },
  { name: 'AMD', tenant: 'amd', site: 'AMD_External_Careers', host: 'amd.myworkdayjobs.com' },
  { name: 'Qualcomm', tenant: 'qualcomm', site: 'Qualcomm', host: 'qualcomm.myworkdayjobs.com' },
  { name: 'Cisco', tenant: 'cisco', site: 'CiscoCareers', host: 'cisco.myworkdayjobs.com' },
  { name: 'Sony', tenant: 'sony', site: 'Sony_Careers', host: 'sony.myworkdayjobs.com' },
  { name: 'Zoom', tenant: 'zoom', site: 'Zoom', host: 'zoom.myworkdayjobs.com' },
  { name: 'LinkedIn', tenant: 'linkedin', site: 'LinkedIn', host: 'linkedin.myworkdayjobs.com' },
  { name: 'Uber', tenant: 'uber', site: 'Uber', host: 'uber.myworkdayjobs.com' },
  { name: 'Tesla', tenant: 'tesla', site: 'Tesla_External_Careers', host: 'tesla.myworkdayjobs.com' },
  { name: 'Airbnb', tenant: 'airbnb', site: 'Airbnb', host: 'airbnb.myworkdayjobs.com' },
  { name: 'Stripe', tenant: 'stripe', site: 'Stripe_Careers', host: 'stripe.myworkdayjobs.com' },
  { name: 'EA', tenant: 'ea', site: 'EA_External_Careers', host: 'ea.myworkdayjobs.com' },
  { name: 'Slack', tenant: 'slack', site: 'Slack', host: 'slack.myworkdayjobs.com' },
  { name: 'HubSpot', tenant: 'hubspot', site: 'HubSpot_Careers', host: 'hubspot.myworkdayjobs.com' },
  { name: 'Atlassian', tenant: 'atlassian', site: 'External', host: 'atlassian.wd1.myworkdayjobs.com' },
  { name: 'Dropbox', tenant: 'dropbox', site: 'dropbox', host: 'dropbox.wd5.myworkdayjobs.com' },
  { name: 'Expedia', tenant: 'expedia', site: 'Expedia_Careers', host: 'expedia.wd5.myworkdayjobs.com' },
  { name: 'DocuSign', tenant: 'docusign', site: 'DocuSign', host: 'docusign.wd1.myworkdayjobs.com' },
  { name: 'Yahoo', tenant: 'yahoo', site: 'Yahoo_Careers', host: 'yahoo.wd5.myworkdayjobs.com' },
  { name: 'F5 Networks', tenant: 'f5', site: 'F5_Careers', host: 'f5.wd5.myworkdayjobs.com' },
  { name: 'NXP', tenant: 'nxp', site: 'careers', host: 'nxp.wd3.myworkdayjobs.com' },
  { name: 'Micron', tenant: 'micron', site: 'Micron_External_Careers', host: 'micron.wd1.myworkdayjobs.com' },
  { name: 'Applied Materials', tenant: 'appliedmaterials', site: 'AppliedExternalCareerSite', host: 'appliedmaterials.wd5.myworkdayjobs.com' }
];

export const SMARTRECRUITERS_DIRECTORY: SmartRecruitersCompany[] = [
  { name: 'Visa', slug: 'visa' },
  { name: 'IKEA', slug: 'ikea' },
  { name: 'Bosch', slug: 'bosch' },
  { name: 'Equinix', slug: 'equinix' }
];

export const SLUG_DISPLAY_NAMES: Record<string, string> = {
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

// Global shared mutable state object to maintain tracking across schedules/sourcing/express
export const globalState = {
  lastScannerActiveTime: 0,
  lastBackgroundSourceTime: Date.now() - 10 * 60 * 1000,
  lastBackgroundLlmEvalTime: 0,
  lastAuditJobIndex: 0,
  currentlyRefiningJobId: null as string | null,
  isSourcingActive: false,
  domainFetchCooldowns: {} as Record<string, number>,
  
  lastBackgroundRefinerTime: 0,
  
  // Weekly Slugs/Endpoints Registry caching variables
  lastRegistryFetchTime: 0,
  cachedGreenhouseSlugs: [...GREENHOUSE_SLUGS] as string[],
  cachedLeverSlugs: [...LEVER_SLUGS] as string[],
  cachedAshbySlugs: [...ASHBY_SLUGS] as string[],
  cachedWorkdayDirectory: [...WORKDAY_DIRECTORY] as WorkdayCompany[],
  cachedSmartRecruitersDirectory: [...SMARTRECRUITERS_DIRECTORY] as SmartRecruitersCompany[],
  
  // Dynamic API templates
  templates: {
    workdaySearch: 'https://{tenant}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs',
    workdayDetails: 'https://{tenant}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/job/{jobId}',
    smartrecruitersPostings: 'https://api.smartrecruiters.com/v1/companies/{slug}/postings',
    smartrecruitersDetails: 'https://api.smartrecruiters.com/v1/companies/{slug}/postings/{id}',
  },
  
  // LLM Health / degradation state
  llmHealthState: {
    consecutiveFailures: 0,
    degradedMode: false,
    totalAttempts: 0,
    totalSuccesses: 0,
    totalFailures: 0,
  }
};

// Telemetry log array accessor helpers
export function addRefinerLog(msg: string): void {
  const db = readDb();
  if (!db.logs) db.logs = [];
  db.logs.push(msg);
  writeDb(db);
}

export function getRefinerLogs(): string[] {
  const db = readDb();
  return db.logs || [];
}

export function clearRefinerLogs(): void {
  const db = readDb();
  db.logs = [];
  writeDb(db);
}
