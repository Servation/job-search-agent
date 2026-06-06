# 🤖 AI-Powered Job Search Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built with Gemini](https://img.shields.io/badge/Built%20with-Gemini%20Flash-violet.svg)](https://ai.google.dev/)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61dafb.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Backend-Express%20%2B%20Node-lightgrey.svg)](https://expressjs.com/)

A premium, agentic job search cockpit designed to automate candidate job matching, description evaluation, and pipeline logging. The agent crawls major enterprise Applicant Tracking Systems (ATS) directly (Greenhouse, Lever, Ashby, and Workday), evaluates listings against your resume, and tracks your submissions with zero database configuration.

---

## 🌟 Key Features

### 1. Multi-Channel ATS Sourcing Pipeline
* **Direct ATS Crawlers**: Scrapes listings directly from public endpoints for **Greenhouse** and **Lever** (such as Palantir).
* **Ashby Sourcing**: Full native integration for **Ashby** (e.g., Linear, PostHog, Vercel, Supabase).
* **Dynamic Workday Discovery Engine**: Instead of relying purely on a static list, the agent passively harvests `myworkdayjobs.com` URLs, automatically extracts tenants, validates their API endpoints via lightweight HTTP probes, and dynamically expands your searchable Workday surface area over time (while pruning dead boards).
* **Paced Batching & Reliability**: Executes requests in small parallel groups alongside sequential health checks. This completely resolves socket exhaustion, DNS lookup hangs, and rate-limiting.
* **Workday Tenant Cluster Routing**: Dynamically routes API requests directly to each tenant's specific Workday cluster subdomain (e.g., `nvidia.wd5.myworkdayjobs.com` or `salesforce.wd12.myworkdayjobs.com`) rather than generic subdomains, ensuring successful connections.
* **Focus on Quality Direct Sources**: Bypasses secondary aggregators (RemoteOK, Remotive) and social boards (Hacker News) to ensure the scanner focuses exclusively on legitimate direct employer postings.
* **Weekly Registry Updates**: Synchronizes company lists weekly from a remote registry, falling back to static lists when offline.
* **Round-Robin Fair Shuffling**: Distributes matching jobs evenly across different companies to avoid results flooding.

### 2. Precise Match Quality Filters
* **State-Level & Country Location Boundaries**: Filters candidates away from geographically incompatible listings (e.g., skips European roles or other US states unless explicitly remote).
* **Years of Experience (YoE) Match Safeguards**:
  * Strict title-based blocking (e.g., Staff/Principal roles blocked for `< 5` YoE, Lead roles blocked for `< 4` YoE, and Senior roles for `< 3` YoE).
  * Regex-based description scanning filters out listings requesting `yearsOfExperience + 2` years of experience *before* calling the LLM.
* **Criteria-Based Evaluation Rubric**: Extracts non-negotiable core requirements from the job description, cross-references them against your resume for explicit evidence, and calculates the match score strictly as the percentage of requirements met (e.g., if 4 out of 5 core requirements are met, score is 80%). It also requires a detailed justification highlighting both matched and missing skills in the match reason.
* **Company Match Quota (Rolling Window Limit)**: Restricts the maximum number of matches kept from a single company (e.g., max 3) within a 4-day rolling window to prevent job board saturation. Dismissing a job immediately refunds the company match quota slot.
* **Expanded Evaluation Context**: Passes up to 4,000 characters of the job description to the LLM to ensure the actual requirements at the bottom are read (bypassing generic "About Us" boilerplates).
* **HTML Tag Sanitization**: Standardizes descriptions and removes escaping/entities safely before rendering.

### 3. Deliberate Verification Loop & Local AI Compatibility
* **Sequential Verification Loop**: Sequentially evaluates jobs with a controlled delay to avoid rate-limiting and local LLM server congestion.
* **Chronological Discovered Postings**: Displays discovered matching postings on the Scanner board sorted by found date (oldest first) for consistent chronological tracking.
* **Local AI Engine Support**: Natively connects to OpenAI-compatible endpoints like **LM Studio** and **Ollama** running locally on your machine for complete data privacy.
* **Built-in CORS Bypass**: Proxies all LLM calls through the Express backend, resolving mixed-content browser restrictions.
* **Ralph Wiggum Telemetry Mode**: Includes a hilarious commentary system featuring context-aware Ralph Wiggum quotes printed in the live AI event log.

### 4. Interactive Submission Tracker Dashboard
* **Logical Sorting Options**: Sort tracked submissions in real-time by **Company Name (Default)**, Job Title, Match Score, Date Applied, and Stage Progress.
* **Inline Submission Editing**: Edit job details in-place (Job Title, Company Name, Location, Position Type, Match Score, URL, and Description) directly from each job card with instant persistence and Event Logs telemetry.
* **Advanced Deduplication & Blacklisting**: Automatically blacklists and filters out duplicates against Saved, Watchlist, Discovered, and Dismissed positions server-side and client-side (using URL normalisation, title checks, and unique Job IDs) to preserve LLM API limits and keep board slots fully occupied.

---

## 🛠️ Architecture

The app is built as a single-repository combined stack:
* **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide icons, and HSL-based modern glassmorphic styling.
* **Backend**: Express server written in TypeScript serving as an API aggregator, scraping engine, and LLM proxy.
* **Development**: Powered by Vite with Hot Module Replacement (HMR) reloading backend restarts.

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18 or higher recommended)
* An API Key for Gemini (optional; local models are fully supported)

### 1. Clone & Install
```bash
git clone https://github.com/yourusername/job-search-agent.git
cd job-search-agent
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` file in the root directory:
```env
# Gemini API Key (Required for Google Search grounding)
GEMINI_API_KEY="your_gemini_api_key_here"

# App hosting URL (used for relative redirects and callbacks)
APP_URL="http://localhost:3000"
```

### 3. Run Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## ⚙️ LLM Integration Setup

### Using Gemini (Recommended for Grounding Search)
* Provide your `GEMINI_API_KEY` in the environment variables.
* The Agent will use Google Search Grounding to scour web posts in the last 24h.

### Using Local Models (LM Studio / Ollama / Llama.cpp)
To run local models for evaluation without sharing resume data externally:
1. Start your local OpenAI-compatible server (e.g., LM Studio on port `1234`).
2. Go to the **LLM Settings** tab in the Job Search Agent UI.
3. Configure the **API Endpoint URL** (e.g. `http://localhost:1234/v1`) and the **Model Name** (e.g. `meta-llama-3-8b-instruct`).
4. Click **Test Connection** to confirm connectivity.

---

## 🔒 Security & Privacy Considerations (Before Publishing to GitHub)

If you plan to publish this repository to a public GitHub repository, keep the following considerations in mind:

1. **Environment Secrets**: 
   * **Never commit your `.env` or `.env.local` files.** The `.gitignore` file is configured to ignore these files by default. Double-check that you haven't committed active API keys.
   * Do not hardcode API keys anywhere in `server.ts` or the frontend.
2. **Workday & SmartRecruiters Web Scraping**:
   * Sourcing uses public JSON endpoints exposing open careers boards. This is normal read-only traffic, but excessive automated requests could result in IP bans or rate limits. The app includes structured timeouts and request pacing to remain a good citizen.
3. **Licensing**:
   * The project is licensed under the **MIT License**. Ensure that any forks or modifications respect the open-source guidelines.
4. **Google Search Tool Usage**:
   * The scan endpoint uses Gemini’s search grounding tool. This operates under Google's service boundaries and requires a valid API key config. Make sure users understand that this can consume Gemini API credits.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
