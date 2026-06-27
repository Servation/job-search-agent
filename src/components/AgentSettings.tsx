/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Settings, Cpu, ShieldAlert, Check, Layers, MapPin, CheckSquare, Square, X, Clock } from 'lucide-react';
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
  const [newBlockedCompany, setNewBlockedCompany] = useState('');

  const handleAddBlock = () => {
    const cleanCompany = newBlockedCompany.trim();
    if (!cleanCompany) return;

    const currentBlocks = profile.blockedCompanies || [];
    const isAlreadyBlocked = currentBlocks.some(bc => bc.toLowerCase().trim() === cleanCompany.toLowerCase().trim());

    if (!isAlreadyBlocked) {
      onChangeProfile({
        ...profile,
        blockedCompanies: [...currentBlocks, cleanCompany]
      });
    }
    setNewBlockedCompany('');
  };

  const handleRemoveBlock = (companyToRemove: string) => {
    const currentBlocks = profile.blockedCompanies || [];
    onChangeProfile({
      ...profile,
      blockedCompanies: currentBlocks.filter(bc => bc !== companyToRemove)
    });
  };

  const testConnection = async () => {
    setTestStatus('testing');
    setTestError(null);

    let targetUrl = llmConfig.endpoint.trim();
    if (!targetUrl) {
      setTestStatus('failed');
      setTestError('Please enter an API Endpoint URL first.');
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
        throw new Error('Got an unexpected reply from the model. Check your model name and settings.');
      }
    } catch (err: any) {
      console.error(err);
      setTestStatus('failed');
      if (err.name === 'AbortError') {
        setTestError('Request timed out after 8s. Make sure your model is running.');
      } else {
        setTestError(err.message || 'Could not connect. Check your settings and try again.');
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
      <section className="bg-surface border-2 border-outline-variant p-6 sm:p-8 neo-shadow relative space-y-8" id="agent-sourcing-container">
        <div className="border-b-2 border-outline-variant pb-4">
          <h2 className="text-2xl font-headline font-bold text-primary flex items-center gap-3 uppercase tracking-widest">
            <div className="p-2 bg-primary text-on-primary border-2 border-black neo-shadow-primary">
              <Cpu className="w-6 h-6" />
            </div>
            Model Settings
          </h2>
          <p className="text-sm text-on-surface-variant mt-3 font-body">
            Connect the AI model that scores your jobs (such as LM Studio, Ollama, or OpenAI).
          </p>
        </div>

        <div className="p-6 bg-surface-container border-2 border-outline-variant space-y-6 font-body" id="custom-provider-inputs">
            <div className="flex items-center gap-2 mb-2 text-sm font-headline font-bold uppercase tracking-widest text-primary">
              <Cpu className="w-5 h-5 animate-pulse" />
              Connection Details
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-headline font-bold uppercase tracking-widest text-on-surface mb-2">
                  API Endpoint URL
                </label>
                <input
                  type="text"
                  value={llmConfig.endpoint}
                  onChange={(e) => onChangeLLMConfig({ ...llmConfig, endpoint: e.target.value })}
                  className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary font-mono placeholder:text-outline"
                  placeholder="e.g. http://localhost:1234/v1 or https://api.openai.com/v1"
                />
              </div>
              <div>
                <label className="block text-xs font-headline font-bold uppercase tracking-widest text-on-surface mb-2">
                  Model Name
                </label>
                <input
                  type="text"
                  value={llmConfig.modelName}
                  onChange={(e) => onChangeLLMConfig({ ...llmConfig, modelName: e.target.value })}
                  className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary placeholder:text-outline"
                  placeholder="e.g. gpt-4o-mini or llama3"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-headline font-bold uppercase tracking-widest text-on-surface mb-2">
                API Key (Optional)
              </label>
              <input
                type="password"
                value={llmConfig.apiKey}
                onChange={(e) => onChangeLLMConfig({ ...llmConfig, apiKey: e.target.value })}
                className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary font-mono placeholder:text-outline"
                placeholder="Enter API key if your model needs one"
              />
            </div>

            <div className="p-4 bg-surface border-2 border-outline-variant">
              <div className="flex justify-between items-center mb-4">
                <label className="text-xs font-headline font-bold uppercase tracking-widest text-on-surface">
                  Request Timeout
                </label>
                <span className="text-lg font-headline font-extrabold text-primary border-b-2 border-primary px-2">
                  {llmConfig.timeout || 30}s
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
                  className="w-full h-2 bg-outline-variant appearance-none cursor-pointer accent-primary"
                />
              </div>
              <span className="text-[10px] text-on-surface-variant block mt-3 font-mono">
                How long to wait for the model to reply. Try 30s for models on your own computer, 10s-15s for fast online services.
              </span>
            </div>

            <div className="pt-6 border-t-2 border-outline-variant space-y-4" id="connection-tester-diagnostic-suite">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <span className="text-sm font-headline font-bold uppercase tracking-widest flex items-center">
                  Status: 
                  <span className={`ml-3 px-3 py-1 border-2 font-extrabold ${
                    testStatus === 'success' ? 'bg-primary-container text-primary border-primary' :
                    testStatus === 'failed' ? 'bg-error-container text-error border-error' :
                    testStatus === 'testing' ? 'bg-surface-container text-outline border-outline animate-pulse' : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant'
                  }`}>
                    {testStatus === 'success' && 'CONNECTED'}
                    {testStatus === 'failed' && 'FAILED'}
                    {testStatus === 'testing' && 'TESTING...'}
                    {testStatus === 'idle' && 'IDLE'}
                  </span>
                </span>
                
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testStatus === 'testing'}
                  className="px-6 py-3 text-sm font-headline font-extrabold uppercase tracking-widest border-2 border-black bg-primary text-on-primary hover:opacity-90 active:scale-[0.98] disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-2 neo-shadow-primary"
                >
                  {testStatus === 'testing' ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-on-primary" fill="none" viewBox="0 0 24 24">
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
                <div className="p-4 bg-error-container text-sm text-on-error-container border-2 border-error leading-relaxed font-mono font-bold uppercase tracking-wider overflow-x-auto whitespace-pre-wrap">
                  <span className="font-extrabold text-error block mb-1">Error:</span>
                  {testError}
                </div>
              )}
              
              {testStatus === 'success' && (
                <div className="p-4 bg-primary-container text-sm text-on-primary-container border-2 border-primary font-headline font-bold uppercase tracking-wider">
                  ✓ Connected to the model.
                </div>
              )}
            </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-surface border-2 border-outline-variant p-6 sm:p-8 neo-shadow relative space-y-8" id="agent-targeting-container">
      <div className="space-y-6" id="job-targeting-filters">
        <h3 className="text-2xl font-headline font-bold text-primary flex items-center gap-3 uppercase tracking-widest border-b-2 border-outline-variant pb-4">
          <div className="p-2 bg-primary text-on-primary border-2 border-black neo-shadow-primary">
            <Layers className="w-6 h-6" />
          </div>
          Job & Location Preferences
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="font-body space-y-6 p-6 bg-surface-container border-2 border-outline-variant">
            <div>
              <h4 className="text-sm font-headline font-bold uppercase tracking-widest text-on-surface mb-3 border-b-2 border-outline-variant pb-1">1. Job Types</h4>
              <div className="flex flex-wrap gap-2 mb-3">
                {(['Full-Time', 'Contract', 'Part-Time'] as JobTypeType[]).map((type) => {
                  const isChecked = profile.preferredTypes?.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleTypeToggle(type)}
                      className={`px-4 py-2 text-xs font-headline font-bold uppercase tracking-widest border-2 transition-all cursor-pointer flex items-center gap-2 ${
                        isChecked
                          ? 'bg-primary border-black text-on-primary neo-shadow-primary'
                          : 'bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-outline'
                      }`}
                    >
                      {isChecked && <Check className="w-4 h-4 stroke-[3]" />}
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t-2 border-outline-variant">
              <h4 className="text-sm font-headline font-bold uppercase tracking-widest text-on-surface mb-3 border-b-2 border-outline-variant pb-1">2. Years of Experience</h4>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  id="years-of-experience"
                  min={0}
                  max={40}
                  value={profile.yearsOfExperience || 0}
                  onChange={(e) => onChangeProfile({ ...profile, yearsOfExperience: Number(e.target.value) })}
                  className="w-20 px-3 py-2 text-lg font-headline font-extrabold bg-surface-container-lowest border-2 border-outline-variant text-on-surface text-center focus:outline-none focus:border-primary"
                />
                <span className="text-xs font-headline font-bold uppercase tracking-wider text-on-surface-variant">
                  {(profile.yearsOfExperience || 0) === 0
                    ? 'Not set (experience is ignored)'
                    : `yrs · more experience is fine · a stretch if over ${(profile.yearsOfExperience || 0) + 2} yrs`}
                </span>
              </div>
              <p className="text-[10px] text-outline mt-3 leading-normal font-mono">
                Enter your total years of work experience. Having more than a job asks for is always fine. Jobs that want up to 2 years more than you have are still scored normally.
              </p>
            </div>

            <div className="pt-4 border-t-2 border-outline-variant">
              <h4 className="text-sm font-headline font-bold uppercase tracking-widest text-on-surface mb-3 border-b-2 border-outline-variant pb-1">3. Work Location</h4>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-headline font-bold uppercase tracking-widest text-on-surface">
                  <input
                    type="checkbox"
                    checked={profile.prefersRemote}
                    onChange={(e) => onChangeProfile({ ...profile, prefersRemote: e.target.checked })}
                    className="w-5 h-5 border-2 border-outline-variant bg-surface-container-lowest accent-primary"
                  />
                  <span>Remote</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-headline font-bold uppercase tracking-widest text-on-surface">
                  <input
                    type="checkbox"
                    checked={profile.prefersHybrid}
                    onChange={(e) => onChangeProfile({ ...profile, prefersHybrid: e.target.checked })}
                    className="w-5 h-5 border-2 border-outline-variant bg-surface-container-lowest accent-primary"
                  />
                  <span>Hybrid</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-headline font-bold uppercase tracking-widest text-on-surface">
                  <input
                    type="checkbox"
                    checked={profile.prefersOnSite !== false}
                    onChange={(e) => onChangeProfile({ ...profile, prefersOnSite: e.target.checked })}
                    className="w-5 h-5 border-2 border-outline-variant bg-surface-container-lowest accent-primary"
                  />
                  <span>On-Site</span>
                </label>
              </div>
            </div>
          </div>

          <div className="font-body space-y-4 p-6 bg-primary-container border-2 border-primary neo-shadow-primary relative overflow-hidden">
            <div className="flex items-center gap-2 mb-2 text-sm font-headline font-bold uppercase tracking-widest text-primary relative z-10 border-b-2 border-primary pb-2">
              <MapPin className="w-5 h-5 text-primary" />
              Where to Search
            </div>

            <div className="space-y-6 relative z-10">
              <div>
                <label className="block text-xs font-headline font-bold uppercase tracking-widest text-on-surface mb-2">
                  Location (Required)
                </label>
                <input
                  type="text"
                  value={profile.searchLocation || ''}
                  onChange={(e) => onChangeProfile({ ...profile, searchLocation: e.target.value })}
                  className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary placeholder:text-outline font-headline font-bold tracking-wider"
                  placeholder="e.g. California, United States, Germany, Austin TX"
                />
                <p className="text-[10px] text-on-surface-variant mt-2 leading-normal font-mono">
                  Enter a city, state, or country.
                </p>
              </div>

              <div>
                <label className="block text-xs font-headline font-bold uppercase tracking-widest text-on-surface mb-2">
                  Distance (Optional)
                </label>
                <input
                  type="text"
                  value={profile.searchDistance || ''}
                  onChange={(e) => onChangeProfile({ ...profile, searchDistance: e.target.value })}
                  className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary placeholder:text-outline font-headline font-bold tracking-wider"
                  placeholder="e.g. 25 miles, 50 km"
                />
                <p className="text-[10px] text-on-surface-variant mt-2 leading-normal font-mono">
                  How far from your location to look. Leave empty to search only within the location above.
                </p>
              </div>
            </div>
            <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
              <MapPin className="w-64 h-64 text-primary" />
            </div>
          </div>
        </div>
      </div>

      <div className="pt-8 border-t-2 border-outline-variant space-y-6" id="agent-automation-settings">
        <h3 className="text-xl font-headline font-bold text-primary flex items-center gap-3 uppercase tracking-widest border-b-2 border-outline-variant pb-2">
          <Clock className="w-5 h-5 text-primary" />
          Automatic Scans
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="font-body space-y-4 p-6 bg-surface-container border-2 border-outline-variant">
            <div>
              <label className="block text-xs font-headline font-bold uppercase tracking-widest text-on-surface mb-2">
                Search for New Jobs
              </label>
              <select
                value={profile.autoScanInterval || 0}
                onChange={(e) => onChangeProfile({ ...profile, autoScanInterval: Number(e.target.value) })}
                className="w-full px-4 py-3 text-sm font-headline font-bold tracking-widest bg-surface-container-lowest border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary cursor-pointer appearance-none"
              >
                <option value={0}>Manual (Off)</option>
                <option value={15}>Every 15 Minutes</option>
                <option value={30}>Every 30 Minutes</option>
                <option value={60}>Every 1 Hour</option>
                <option value={120}>Every 2 Hours</option>
                <option value={360}>Every 6 Hours</option>
              </select>
              <p className="text-[10px] text-outline mt-2 leading-normal font-mono">
                How often to check job boards for new postings.
              </p>
            </div>
          </div>

          <div className="font-body space-y-4 p-6 bg-surface-container border-2 border-outline-variant">
            <div>
              <label className="block text-xs font-headline font-bold uppercase tracking-widest text-on-surface mb-2">
                Score Jobs & Find Companies
              </label>
              <select
                value={profile.refinerIntervalMinutes ?? 5}
                onChange={(e) => onChangeProfile({ ...profile, refinerIntervalMinutes: Number(e.target.value) })}
                className="w-full px-4 py-3 text-sm font-headline font-bold tracking-widest bg-surface-container-lowest border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary cursor-pointer appearance-none"
              >
                <option value={0}>Manual (Off)</option>
                <option value={5}>Every 5 Minutes</option>
                <option value={15}>Every 15 Minutes</option>
                <option value={30}>Every 30 Minutes</option>
                <option value={60}>Every 1 Hour</option>
              </select>
              <p className="text-[10px] text-outline mt-2 leading-normal font-mono">
                How often the agent scores found jobs and looks for new company job boards.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-8 border-t-2 border-outline-variant space-y-6" id="agent-scheduler-settings">
        <h3 className="text-xl font-headline font-bold text-primary flex items-center gap-3 uppercase tracking-widest border-b-2 border-outline-variant pb-2">
          <Layers className="w-5 h-5 text-primary" />
          Saved Jobs & Duplicates
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          <div className="font-body space-y-4 p-6 bg-surface-container border-2 border-outline-variant">
            <div>
              <label className="block text-xs font-headline font-bold uppercase tracking-widest text-on-surface mb-2">
                Max Saved Jobs
              </label>
              <input
                type="number"
                min={5}
                max={200}
                value={profile.maxDiscoveredJobs || 30}
                onChange={(e) => onChangeProfile({ ...profile, maxDiscoveredJobs: Number(e.target.value) })}
                className="w-full px-4 py-3 text-lg font-headline font-extrabold bg-surface-container-lowest border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary"
              />
              <p className="text-[10px] text-outline mt-2 leading-normal font-mono">
                The most scored, matching jobs to keep at once.
              </p>
            </div>
          </div>

          <div className="font-body space-y-4 p-6 bg-surface-container border-2 border-outline-variant col-span-1 md:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="limit-company-matches"
                  checked={profile.limitCompanyMatches || false}
                  onChange={(e) => onChangeProfile({ ...profile, limitCompanyMatches: e.target.checked })}
                  className="w-5 h-5 border-2 border-outline-variant bg-surface-container-lowest accent-primary cursor-pointer"
                />
                <label htmlFor="limit-company-matches" className="text-sm font-headline font-bold uppercase tracking-widest text-on-surface cursor-pointer select-none">
                  Limit jobs per company
                </label>
              </div>

              {profile.limitCompanyMatches && (
                <div className="flex items-center gap-3 animate-fade-in bg-surface border-2 border-outline-variant p-2 px-4">
                  <label className="text-xs font-headline font-bold uppercase tracking-widest text-on-surface whitespace-nowrap">
                    Max jobs per company:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={profile.maxMatchesPerCompany || 3}
                    onChange={(e) => onChangeProfile({ ...profile, maxMatchesPerCompany: Number(e.target.value) })}
                    className="w-16 px-2 py-1 text-sm font-headline font-extrabold bg-surface-container-lowest border-2 border-outline-variant text-on-surface text-center focus:outline-none focus:border-primary"
                  />
                </div>
              )}
            </div>
            <p className="text-[10px] text-outline mt-3 leading-normal font-mono">
              Keeps one company from filling up your list. Once a company hits the limit, extra jobs from it are skipped.
            </p>
          </div>
        </div>
      </div>

      <div className="pt-8 border-t-2 border-outline-variant space-y-6" id="agent-blocklist-settings">
        <h3 className="text-xl font-headline font-bold text-error flex items-center gap-3 uppercase tracking-widest border-b-2 border-outline-variant pb-2">
          <ShieldAlert className="w-5 h-5 text-error" />
          Blocked Companies
        </h3>
        
        <div className="font-body space-y-6 p-6 bg-error-container border-2 border-error">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex-grow">
              <input
                type="text"
                value={newBlockedCompany}
                onChange={(e) => setNewBlockedCompany(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddBlock(); } }}
                placeholder="Enter company name to block (e.g. Nvidia, Facebook)..."
                className="w-full px-4 py-3 text-sm font-headline font-bold bg-surface-container-lowest border-2 border-error text-on-error-container focus:outline-none placeholder:text-error/50"
              />
            </div>
            <button
              type="button"
              onClick={handleAddBlock}
              className="px-6 py-3 bg-error text-on-error font-headline font-extrabold uppercase tracking-widest border-2 border-black hover:opacity-90 active:scale-[0.98] transition-all shrink-0 cursor-pointer neo-shadow"
            >
              Block Company
            </button>
          </div>

          {profile.blockedCompanies && profile.blockedCompanies.length > 0 ? (
            <div className="flex flex-wrap gap-3 pt-2 border-t-2 border-error/20">
              {profile.blockedCompanies.map((company, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-2 px-3 py-1.5 border-2 border-error text-xs font-headline font-bold uppercase tracking-wider bg-surface-container-lowest text-on-error-container"
                >
                  {company}
                  <button
                    type="button"
                    onClick={() => handleRemoveBlock(company)}
                    className="p-1 border-2 border-transparent hover:border-error hover:bg-error hover:text-on-error transition-colors cursor-pointer"
                    title={`Unblock ${company}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs font-mono text-error/80 uppercase tracking-widest">No companies blocked yet. Add one above, or block them from the found jobs list.</p>
          )}
        </div>
      </div>
    </section>
  );
}
