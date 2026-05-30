# ADR 0001: Dynamic Workday Discovery Engine

## Status
PROPOSED

## Context
Workday is a highly distributed ATS where each employer runs their job board under a unique subdomain (e.g., `nvidia.wd5.myworkdayjobs.com`). Currently, the list of target Workday companies is static (`WORKDAY_DIRECTORY` in `config.ts`) and is updated weekly from a central static JSON registry. This limits the agent's ability to discover new opportunities from employers not present in the hardcoded list.

The agent needs a way to automatically discover, validate, and query new Workday job boards on a daily basis.

## Decision
We propose implementing a **Dynamic Workday Discovery Engine** inside the backend with the following architecture:
1. **Passive Harvesting**: During normal search grounding (via DuckDuckGo/Yahoo search results), manual URL submissions in the UI, and LLM evaluation stages, any URL containing `myworkdayjobs.com` will be intercepted and parsed using regex. No LLM calls are used for harvesting or validation.
2. **Parsing**: The engine will parse the host, tenant, and site path from the URL.
3. **Active Incremental Probing**: The engine will validate newly harvested Workday hosts incrementally. During each background refinement cycle (which runs every 5 minutes), the engine will pick up to 2 pending hosts from the validation queue and probe them using a minimal test POST request. The engine will first probe the site name harvested from the URL. If it returns 404, it will try a fallback list of common site names (e.g. `careers`, `Careers`, `External`, `Company_Careers`). A board is only marked valid if it returns an HTTP 200 with valid JSON. Any response of 422, 403, or 429 (indicating Cloudflare Turnstile bot protection or blockages) will cause the board to be skipped. This spreads the network overhead and avoids burst traffic.
4. **Persistence & Scoring Pacing**: Validated Workday sites will be saved inside the main database file `discovered_jobs.json` under a new `workdayDirectory` array. This ensures that the discovered hosts survive restarts and updates, using existing database helper functions (`readDb`, `writeDb`). Only jobs from these boards that pass strict title-keyword pre-filtering will ever be sent to the LLM for evaluation, ensuring zero waste of LLM API calls.
5. **Auto-Replacement**: A self-healing mechanism will track `consecutiveFailures` for dynamically discovered sites in the database. If a dynamic site fails to query 5 times in a row (e.g., due to newly added Cloudflare protection or the board being decommissioned), it will be automatically pruned from the directory. Any successful fetch will reset the counter to 0.

## Consequences
- **Pros**:
  - Dynamically scales the search surface without manual intervention or updates.
  - Automatically filters out Turnstile/Cloudflare-protected sites that Node fetches cannot access.
  - Keeps the Workday list fresh by automatically retiring dead boards.
- **Cons**:
  - Probing new hosts increases initial start-up/network traffic.
  - Parsing errors may occur if a Workday site uses non-standard path configurations.
