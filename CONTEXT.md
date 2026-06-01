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

### Sourcing (Auto-Scan)
The automated process of actively scraping public job boards (Greenhouse, Lever, Ashby, Workday) to find *new* job listings that match basic keywords, title constraints, and location. These are placed into the "Unmatched Jobs" queue.

### Unmatched Jobs
Raw job candidates discovered by the Sourcing phase that have not yet had their full descriptions fetched nor been evaluated by the LLM.

### Match Evaluation (Refiner)
The background process that pulls one job at a time from the "Unmatched Jobs" queue, fetches its full description, and uses the LLM (e.g. LM Studio) to score it against the candidate's resume.

### Matched Jobs
Jobs that have successfully passed Match Evaluation with a score meeting or exceeding the candidate's minimum threshold.

### Dynamic Discovery
The background process that passively extracts and validates new job board endpoints (like a new company's Workday URL) that are encountered during operations, automatically adding them to the Sourcing targets for future scans.

### Rate-Limited Evaluation Batching
The practice of throttling LLM evaluation requests using synthetic delays (e.g. 2000ms between calls) and small batch sizes to prevent API timeout and rate-limit pressure when sending expanded context limits.

### Requirement Mismatch Penalty
A mandatory deduction rule during Match Evaluation that enforces strict negative scoring (deducting 30-40 points) when a candidate lacks explicitly requested "Must-have" or "Required" skills from the job description.
