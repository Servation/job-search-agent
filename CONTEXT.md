# Domain Context - Job Search Agent

This document defines the domain terminology and conceptual model for the Job Search Agent system.

## Domain Glossary

### Candidate Profile
The set of criteria defining the job seeker's target roles, experience level, location preferences, remote work preference, and skills.

### Sourcing Channels
Platforms and job boards scanned to find open positions.
- **Greenhouse / Lever / Ashby**: Structured Applicant Tracking Systems (ATS) with public job board endpoints.
- **Workday**: Distributed Enterprise Resource Planning (ERP) platform with company-specific job portals (tenants).
- **Search Grounding**: Web search engine queries (DuckDuckGo, Yahoo) executed to find matching job links directly.

### Workday Directory
A directory of known, verified Workday company career sites (hosts and tenants) that the agent is capable of scanning.

### Discovered Postings
Job postings that have been sourced and pass initial filtering (e.g. location, basic keyword match) but have not been evaluated for profile fit.

### Match Evaluation
The process of evaluating a job posting's full description against the candidate's resume/profile using AI (Large Language Models) to assign a match score and reasons.

### Link Auditing
The automated process of checking whether job links in the active queues (e.g., scanned, watchlist) are still live or have been closed/filled.

### Dynamic Discovery
The automated process of finding and validating new sourcing hosts and tenants (e.g., new Workday career sites) to automatically expand the system's scanning surface.
