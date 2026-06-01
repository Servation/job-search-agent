# Title: Search Grounding for Workday Sourcing
Status: Accepted

## Context
Our Sourcing phase automatically scrapes public job boards (Greenhouse, Lever, Ashby, Workday). However, the Workday integration relies on headless API calls to tenant-specific Candidate Experience System (`cxs`) endpoints. Recent logs indicate widespread `HTTP 422 Unprocessable Entity` errors because modern Workday tenants increasingly require session cookies, dynamic CSRF tokens, and precisely structured telemetry payloads that vary by company. 

Attempting to reverse-engineer and maintain these headless API tokens across hundreds of tenants is brittle and counter to our design goal of a fast, lightweight Node backend.

## Decision
We will introduce **Search Grounding** as the primary Sourcing strategy for Workday jobs, falling back to heavy browser automation (Playwright/Puppeteer) in the future only if necessary.

Instead of calling the `cxs` APIs directly, we will programmatically execute web search queries (via DuckDuckGo HTML) targeting `site:myworkdayjobs.com`. By parsing the search engine results, we can instantly harvest direct links to open job postings that match the candidate's keywords, completely bypassing Workday's API gateway protections.

## Consequences
- **Positive:** Bypasses `422` payload errors, CSRF blocks, and cookie requirements since we rely on the web's natural indexing.
- **Positive:** Free Dynamic Discovery. We will naturally discover active Workday tenants simply by seeing what URLs appear in the search engine results.
- **Positive:** Avoids bloating the application with heavy dependencies like Playwright or Puppeteer.
- **Negative:** We lose structured JSON metadata (like exact `postedAt` or `location` strings) during the Sourcing phase for Workday jobs, forcing the Match Evaluation phase (or an intermediate fetching step) to parse this information from the raw HTML.
- **Negative:** Search engines may rate-limit our backend if queries are too aggressive, requiring careful throttling.
