/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Settings, Cpu, ShieldAlert, Check, Layers, MapPin, CheckSquare, Square } from 'lucide-react';
import { LLMConfig, ResumeProfile, JobTypeType } from '../types';

interface AgentSettingsProps {
  llmConfig: LLMConfig;
  onChangeLLMConfig: (config: LLMConfig) => void;
  profile: ResumeProfile;
  onChangeProfile: (profile: ResumeProfile) => void;
  mode?: 'sourcing' | 'targeting';
}

export default function AgentSettings({
  llmConfig,
  onChangeLLMConfig,
  profile,
  onChangeProfile,
  mode = 'sourcing',
}: AgentSettingsProps) {
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testError, setTestError] = useState<string | null>(null);

  const testConnection = async () => {
    setTestStatus('testing');
    setTestError(null);

    let targetUrl = llmConfig.endpoint.trim();
    if (!targetUrl) {
      setTestStatus('failed');
      setTestError('Please configure an API Endpoint URL first.');
      return;
    }
    
    if (targetUrl.endsWith('/chat/completions')) {
      targetUrl = targetUrl.replace(/\/chat\/completions$/, '');
    }

    try {
      const clientTimeoutMs = Math.max(8000, (llmConfig.timeout || 30) * 1000);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), clientTimeoutMs);

      // Route request safely through backend server proxy to bypass CORS
      const response = await fetch('/api/llm/proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: targetUrl,
          apiKey: llmConfig.apiKey,
          timeout: llmConfig.timeout || 30,
          body: {
            model: llmConfig.modelName || 'test',
            messages: [
              { role: 'user', content: 'Ping' }
            ],
            max_tokens: 5,
          }
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch (_) {}
        throw new Error(`HTTP Error ${response.status}: ${errorBody || response.statusText}`);
      }

      const responseJson = await response.json();
      if (responseJson && (responseJson.choices || responseJson.id)) {
        setTestStatus('success');
      } else {
        throw new Error('Received warning response: Missing standard OpenAI fields (choices/id). Check model configuration.');
      }
    } catch (err: any) {
      console.error(err);
      setTestStatus('failed');
      if (err.name === 'AbortError') {
        setTestError('Request timed out after 8s. Verify your LLM server is online.');
      } else {
        setTestError(err.message || 'Unknown network connection failure.');
      }
    }
  };

  const handleTypeToggle = (type: JobTypeType) => {
    const activeTypes = profile.preferredTypes || [];
    if (activeTypes.includes(type)) {
      if (activeTypes.length > 1) {
        onChangeProfile({
          ...profile,
          preferredTypes: activeTypes.filter((t) => t !== type),
        });
      }
    } else {
      onChangeProfile({
        ...profile,
        preferredTypes: [...activeTypes, type],
      });
    }
  };

  if (mode === 'sourcing') {
    return (
      <div className="sleek-card rounded-2xl border border-white/10 shadow-lg p-6 sm:p-8 space-y-6" id="agent-sourcing-container">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2 font-display">
            <Cpu className="w-5 h-5 text-indigo-400" />
            LLM Settings
          </h2>
          <p className="text-sm text-slate-400 mt-1 font-sans">
            Configure the API connection details for your chosen OpenAI-compatible model endpoint (such as LM Studio, Ollama, or OpenAI).
          </p>
        </div>

        <div className="p-5 bg-slate-950/50 rounded-2xl border border-white/10 space-y-5 font-sans" id="custom-provider-inputs">
            <div className="flex items-center gap-2 mb-1 text-xs font-semibold text-indigo-400 uppercase tracking-wider font-display">
              <Cpu className="w-4 h-4 text-indigo-400 animate-pulse" />
              API Connection Details
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  API Endpoint URL
                </label>
                <input
                  type="text"
                  value={llmConfig.endpoint}
                  onChange={(e) => onChangeLLMConfig({ ...llmConfig, endpoint: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono placeholder-slate-600"
                  placeholder="e.g. http://localhost:1234/v1 or https://api.openai.com/v1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Model Name String
                </label>
                <input
                  type="text"
                  value={llmConfig.modelName}
                  onChange={(e) => onChangeLLMConfig({ ...llmConfig, modelName: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-650"
                  placeholder="e.g. gpt-4o-mini or llama3"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                API Key Secret (Optional)
              </label>
              <input
                type="password"
                value={llmConfig.apiKey}
                onChange={(e) => onChangeLLMConfig({ ...llmConfig, apiKey: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono placeholder-slate-650"
                placeholder="Enter API Key if required by endpoint"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-400">
                  LLM Request Timeout
                </label>
                <span className="text-xs font-semibold text-indigo-400 font-mono">
                  {llmConfig.timeout || 30} seconds
                </span>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="5"
                  value={llmConfig.timeout || 30}
                  onChange={(e) => onChangeLLMConfig({ ...llmConfig, timeout: parseInt(e.target.value) })}
                  className="w-full h-1.5 bg-slate-900 border-none rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
              <span className="text-[10px] text-slate-500">
                Recommended: 30s for local models running on CPU/consumer-grade GPUs, 10s-15s for high-speed APIs.
              </span>
            </div>

            <div className="pt-3.5 border-t border-white/5 space-y-3" id="connection-tester-diagnostic-suite">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <span className="text-xs text-slate-400">
                  Connection Status: 
                  <span className={`ml-1.5 font-bold uppercase font-mono tracking-tight text-[11px] ${
                    testStatus === 'success' ? 'text-emerald-400' :
                    testStatus === 'failed' ? 'text-rose-400' :
                    testStatus === 'testing' ? 'text-indigo-400 animate-pulse' : 'text-slate-500'
                  }`}>
                    {testStatus === 'success' && '● Connected Successfully'}
                    {testStatus === 'failed' && '● Connection Failed'}
                    {testStatus === 'testing' && '● Testing Connection...'}
                    {testStatus === 'idle' && '● Not Tested'}
                  </span>
                </span>
                
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testStatus === 'testing'}
                  className="px-4 py-1.5 text-xs font-bold rounded-xl bg-indigo-650 hover:bg-indigo-600 active:bg-indigo-700 text-white disabled:opacity-40 transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-indigo-550/10"
                >
                  {testStatus === 'testing' ? (
                    <>
                      <svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </button>
              </div>

              {testError && (
                <div className="p-3 bg-rose-950/30 border border-rose-500/15 rounded-xl font-mono text-[10px] text-rose-300 leading-normal max-w-full overflow-x-auto whitespace-pre-wrap">
                  <span className="font-bold text-rose-400 uppercase block mb-0.5">Connection Error Details</span>
                  {testError}
                </div>
              )}
              
              {testStatus === 'success' && (
                <div className="p-3 bg-emerald-950/35 border border-emerald-500/15 rounded-xl text-xs text-emerald-300 leading-normal font-sans">
                  <span className="font-bold text-emerald-400 block mb-0.5">✓ Connection Success!</span>
                  Successfully connected to the API endpoint and received a valid response.
                </div>
              )}
            </div>
          </div>
      </div>
    );
  }

  return (
    <div className="sleek-card rounded-2xl border border-white/10 shadow-lg p-6 sm:p-8 space-y-6" id="agent-targeting-container">
      <div className="space-y-6" id="job-targeting-filters">
        <h3 className="text-base font-semibold text-white flex items-center gap-2 font-display">
          <Layers className="w-5 h-5 text-indigo-400" />
          Position & Location Sourcing Preferences
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="font-sans space-y-5 p-5 rounded-2xl bg-slate-950/45 border border-white/5">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 font-mono">1. Position Types</h4>
              <div className="flex flex-wrap gap-2 mb-3">
                {(['Full-Time', 'Contract', 'Part-Time'] as JobTypeType[]).map((type) => {
                  const isChecked = profile.preferredTypes?.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeToggle(type)}
                      className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
                        isChecked
                          ? 'bg-indigo-650 border-indigo-505 text-white shadow-lg shadow-indigo-500/15'
                          : 'bg-slate-900 border-white/10 text-slate-350 hover:bg-slate-850'
                      }`}
                    >
                      {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      {type}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="w2-only"
                  checked={profile.prefersW2Only}
                  onChange={(e) => onChangeProfile({ ...profile, prefersW2Only: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-650 bg-slate-900 border-white/10 focus:ring-indigo-650 cursor-pointer accent-indigo-500"
                />
                <label htmlFor="w2-only" className="text-xs text-slate-355 cursor-pointer select-none">
                  W2 agreement only (C2C or direct 1099 contracts disallowed)
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 font-mono">3. Years of Experience</h4>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  id="years-of-experience"
                  min={0}
                  max={40}
                  value={profile.yearsOfExperience || 0}
                  onChange={(e) => onChangeProfile({ ...profile, yearsOfExperience: Number(e.target.value) })}
                  className="w-20 px-3 py-2 text-sm rounded-lg bg-slate-900 border border-white/10 text-white text-center focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
                <span className="text-xs text-slate-400">
                  {(profile.yearsOfExperience || 0) === 0
                    ? 'Not set — experience level not considered'
                    : `yrs · overqualified always ok · stretch if req. > ${(profile.yearsOfExperience || 0) + 2} yrs`}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-2 leading-normal">
                Set your total professional experience. Being <strong className="text-slate-400">overqualified is always acceptable</strong> — applying to a job that requires fewer years than you have is a full match. Jobs requiring up to <strong className="text-slate-400">+2 years</strong> more than yours are also scored normally. Only jobs requiring significantly more experience are flagged as a stretch. Set to 0 to disable experience filtering.
              </p>
            </div>

            <div className="pt-4 border-t border-white/5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 font-mono">2. Work Location</h4>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={profile.prefersRemote}
                    onChange={(e) => onChangeProfile({ ...profile, prefersRemote: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-white/10 focus:ring-indigo-650 cursor-pointer accent-indigo-500"
                  />
                  <span>Remote</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={profile.prefersHybrid}
                    onChange={(e) => onChangeProfile({ ...profile, prefersHybrid: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-white/10 focus:ring-indigo-650 cursor-pointer accent-indigo-500"
                  />
                  <span>Hybrid</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={profile.prefersOnSite !== false}
                    onChange={(e) => onChangeProfile({ ...profile, prefersOnSite: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-white/10 focus:ring-indigo-650 cursor-pointer accent-indigo-500"
                  />
                  <span>On-Site</span>
                </label>
              </div>
            </div>
          </div>

          <div className="font-sans space-y-4 p-5 rounded-2xl bg-indigo-950/20 border border-indigo-500/15">
            <div className="flex items-center gap-1.5 mb-1 text-xs font-semibold text-indigo-400 uppercase tracking-wider font-mono">
              <MapPin className="w-4 h-4 text-indigo-400" />
              Sourcing Search Location
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 leading-normal">
                  Geographic Sourcing Boundary (Required)
                </label>
                <input
                  type="text"
                  value={profile.searchLocation || ''}
                  onChange={(e) => onChangeProfile({ ...profile, searchLocation: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-650 leading-relaxed font-sans"
                  placeholder="e.g. California, United States, Germany, Austin TX"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-normal font-sans">
                  Enter any valid location scope such as an entire state, country, or city.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 leading-normal">
                  Commute / Distance Radius (Optional)
                </label>
                <input
                  type="text"
                  value={profile.searchDistance || ''}
                  onChange={(e) => onChangeProfile({ ...profile, searchDistance: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-650 font-sans"
                  placeholder="e.g. 25 miles, 50 km (leave empty to restrict within location boundary)"
                />
                <p className="text-[10px] text-slate-400 mt-1 leading-normal font-sans">
                  Specify a maximum radius to search, or leave empty to restrict results strictly within the geographic boundary of your specified location.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-white/5 space-y-4" id="agent-scheduler-settings">
        <h3 className="text-base font-semibold text-white flex items-center gap-2 font-display">
          <Layers className="w-5 h-5 text-indigo-400" />
          Auto-Scan & Discovered Memory Capacity
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="font-sans space-y-4 p-5 rounded-2xl bg-slate-950/45 border border-white/5">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 leading-normal">
                Auto-Scan Sourcing Interval
              </label>
              <select
                value={profile.autoScanInterval || 0}
                onChange={(e) => onChangeProfile({ ...profile, autoScanInterval: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-white/10 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans cursor-pointer"
              >
                <option value={0} className="bg-slate-950">Manual (Off)</option>
                <option value={1} className="bg-slate-950">Every 1 Hour</option>
                <option value={3} className="bg-slate-950">Every 3 Hours</option>
                <option value={6} className="bg-slate-950">Every 6 Hours</option>
                <option value={12} className="bg-slate-950">Every 12 Hours</option>
                <option value={24} className="bg-slate-950">Every 24 Hours</option>
              </select>
              <p className="text-[10px] text-slate-400 mt-1.5 leading-normal font-sans">
                Automatically triggers a live scan in the background at the specified interval. **Keep this browser tab open to run automated scans.**
              </p>
            </div>
          </div>

          <div className="font-sans space-y-4 p-5 rounded-2xl bg-slate-950/45 border border-white/5">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 leading-normal">
                Discovered Postings Memory Capacity
              </label>
              <input
                type="number"
                min={5}
                max={200}
                value={profile.maxDiscoveredJobs || 30}
                onChange={(e) => onChangeProfile({ ...profile, maxDiscoveredJobs: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1.5 leading-normal">
                The maximum number of discovered job listings to keep in memory. Once reached, no new jobs will be appended until you review, delete, or apply to existing ones.
              </p>
            </div>
          </div>

          <div className="font-sans space-y-4 p-5 rounded-2xl bg-slate-950/45 border border-white/5 col-span-1 md:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="limit-company-matches"
                  checked={profile.limitCompanyMatches || false}
                  onChange={(e) => onChangeProfile({ ...profile, limitCompanyMatches: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-650 bg-slate-900 border-white/10 focus:ring-indigo-650 cursor-pointer accent-indigo-500"
                />
                <label htmlFor="limit-company-matches" className="text-xs font-semibold text-slate-300 cursor-pointer select-none">
                  Limit maximum matches per company
                </label>
              </div>

              {profile.limitCompanyMatches && (
                <div className="flex items-center gap-2 animate-fade-in">
                  <label className="text-xs text-slate-400 font-semibold whitespace-nowrap">
                    Max positions per company:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={profile.maxMatchesPerCompany || 3}
                    onChange={(e) => onChangeProfile({ ...profile, maxMatchesPerCompany: Number(e.target.value) })}
                    className="w-16 px-2 py-1 text-xs rounded-lg bg-slate-900 border border-white/10 text-white text-center focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 leading-normal">
              When checked, prevents any single company from flooding your discovered list. If a company already has the set number of matching jobs, additional jobs from that company are ignored.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
