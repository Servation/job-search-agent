/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FileCheck, 
  Search, 
  MapPin, 
  Building, 
  Trash2, 
  CheckSquare, 
  Paperclip, 
  Calendar,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Star,
  Link,
  FileText,
} from 'lucide-react';
import { Job, JobStatusType, JobTypeType } from '../types';

interface SubmissionTrackerProps {
  jobs: Job[];
  onUpdateJobStatus: (id: string, status: JobStatusType, notes?: string) => void;
  onRemoveJob: (id: string) => void;
  onAddJobs: (jobs: Job[]) => void;
}

const EMPTY_FORM = {
  title: '',
  company: '',
  location: '',
  type: 'Full-Time' as JobTypeType,
  url: '',
  matchScore: '',
  description: '',
};

export default function SubmissionTracker({
  jobs,
  onUpdateJobStatus,
  onRemoveJob,
  onAddJobs,
}: SubmissionTrackerProps) {
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedDesc, setExpandedDesc] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const statuses: { value: JobStatusType; label: string; color: string }[] = [
    { value: 'discovered', label: 'Discovered', color: 'bg-slate-900 text-slate-400 border-white/15' },
    { value: 'applied', label: 'Applied', color: 'bg-indigo-950/40 text-indigo-300 border-indigo-500/20 hover:ring-indigo-500/30' },
    { value: 'review', label: 'Under Review', color: 'bg-blue-950/40 text-blue-300 border-blue-500/20' },
    { value: 'interviewing', label: 'Interviewing', color: 'bg-amber-950/40 text-amber-300 border-amber-500/20 hover:ring-amber-500/30' },
    { value: 'offered', label: 'Offered', color: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/20' },
    { value: 'rejected', label: 'Rejected / Archived', color: 'bg-rose-950/40 text-rose-300 border-rose-500/20' },
  ];

  const filteredJobs = jobs.filter((j) => {
    const matchesSearch = 
      j.title.toLowerCase().includes(filterSearch.toLowerCase()) || 
      j.company.toLowerCase().includes(filterSearch.toLowerCase());
    const matchesStatus = filterStatus === 'all' || j.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const toggleDesc = (id: string) => {
    setExpandedDesc(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleFormChange = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setFormError('');
  };

  const handleAddManual = () => {
    if (!form.title.trim() || !form.company.trim()) {
      setFormError('Job title and company are required.');
      return;
    }
    const scoreNum = form.matchScore ? Math.min(100, Math.max(0, parseInt(form.matchScore, 10))) : 0;
    const job: Job = {
      id: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: form.title.trim(),
      company: form.company.trim(),
      location: form.location.trim() || 'Not specified',
      type: form.type,
      isW2: true,
      description: form.description.trim(),
      url: form.url.trim(),
      postedAt: new Date().toISOString(),
      matchScore: scoreNum,
      matchReason: '',
      isDuplicate: false,
      status: 'applied',
      scannedAt: new Date().toISOString(),
      appliedDate: new Date().toISOString(),
    };
    onAddJobs([job]);
    setForm(EMPTY_FORM);
    setShowAddForm(false);
    setFormError('');
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 bg-emerald-950/40 border-emerald-500/25';
    if (score >= 60) return 'text-amber-400 bg-amber-950/30 border-amber-500/20';
    if (score > 0)   return 'text-rose-400 bg-rose-950/30 border-rose-500/20';
    return 'text-slate-500 bg-slate-900/50 border-white/10';
  };

  return (
    <div className="sleek-card rounded-2xl border border-white/10 shadow-lg p-6 sm:p-8 space-y-6" id="submission-tracker-board">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2 font-display">
            <FileCheck className="w-5 h-5 text-indigo-400" />
            Submission Tracker Dashboard
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Track and update submission pipelines. Prevent applying to identical openings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-900 text-indigo-400 rounded-lg border border-white/5 font-mono">
            Pipeline Volume: {jobs.length} Active Positions
          </span>
          <button
            onClick={() => { setShowAddForm(v => !v); setFormError(''); }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/25 text-indigo-300 transition-colors cursor-pointer"
          >
            {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showAddForm ? 'Cancel' : 'Add Manually'}
          </button>
        </div>
      </div>

      {/* Manual Add Form */}
      {showAddForm && (
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/15 p-5 space-y-4 animate-fade-in">
          <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 font-mono flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Manual Job Entry
          </h3>

          {/* Row 1: Title + Company */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Job Title <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={e => handleFormChange('title', e.target.value)}
                placeholder="e.g. Senior Software Engineer"
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Company <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={form.company}
                onChange={e => handleFormChange('company', e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
              />
            </div>
          </div>

          {/* Row 2: Location + Type + Match Score */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Location <span className="text-slate-600">(optional)</span>
              </label>
              <input
                type="text"
                value={form.location}
                onChange={e => handleFormChange('location', e.target.value)}
                placeholder="e.g. Remote, San Francisco CA"
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Position Type
              </label>
              <select
                value={form.type}
                onChange={e => handleFormChange('type', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="Full-Time">Full-Time</option>
                <option value="Contract">Contract</option>
                <option value="Part-Time">Part-Time</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Match Rating 0–100 <span className="text-slate-600">(optional)</span>
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.matchScore}
                onChange={e => handleFormChange('matchScore', e.target.value)}
                placeholder="e.g. 85"
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600 font-mono"
              />
            </div>
          </div>

          {/* Row 3: Application URL */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
              <Link className="w-3 h-3" /> Application URL <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="url"
              value={form.url}
              onChange={e => handleFormChange('url', e.target.value)}
              placeholder="https://jobs.example.com/apply/12345"
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600 font-mono"
            />
          </div>

          {/* Row 4: Description */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Job Description <span className="text-slate-600">(optional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => handleFormChange('description', e.target.value)}
              placeholder="Paste or summarise the job description..."
              rows={3}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600 resize-none"
            />
          </div>

          {formError && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {formError}
            </p>
          )}

          <button
            onClick={handleAddManual}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-md shadow-indigo-500/15"
          >
            <Plus className="w-3.5 h-3.5" /> Add to Tracker
          </button>
        </div>
      )}

      {/* Filter and search control bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-grow">
          <Search className="w-4 h-4 text-slate-450 absolute left-3.5 top-3" />
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Search saved positions by title or company name..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-900/30 text-white placeholder-slate-600"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 text-sm rounded-xl border border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-900 text-slate-200 font-semibold shrink-0"
        >
          <option value="all" className="bg-slate-950">Display All Statuses</option>
          {statuses.map((s) => (
            <option key={s.value} value={s.value} className="bg-slate-950">Filter: {s.label}</option>
          ))}
        </select>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="py-16 text-center text-slate-400 border border-dashed border-white/10 rounded-2xl">
          <AlertCircle className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">No saved submissions tracked with current parameters.</p>
          <p className="text-xs text-slate-500 mt-1">Trigger a Daily Scan and click &quot;Save &amp; Log Submission&quot; to log items here, or use &quot;Add Manually&quot; above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="submission-pipeline-cards">
          {filteredJobs.map((j) => {
            const currentStatusObj = statuses.find((s) => s.value === j.status);
            const isDescOpen = expandedDesc.has(j.id);
            const hasDesc = !!j.description?.trim();
            const hasUrl = !!j.url?.trim();
            const hasScore = j.matchScore > 0;

            return (
              <div key={j.id} className="border border-white/10 rounded-2xl p-5 hover:border-indigo-500/20 bg-slate-900/30 hover:bg-slate-900/40 transition-all space-y-4 shadow-md">
                {/* Header row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <h3 className="font-bold text-white text-sm font-display tracking-tight leading-snug">{j.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold flex-wrap">
                      <span className="flex items-center gap-1 text-slate-300">
                        <Building className="w-3.5 h-3.5 text-indigo-400" /> {j.company}
                      </span>
                      <span className="text-slate-655">•</span>
                      <span className="flex items-center gap-1 font-normal text-slate-400">
                        <MapPin className="w-3.5 h-3.5 text-slate-550" /> {j.location}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => onRemoveJob(j.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/5 transition-colors shrink-0"
                    title="Remove from history"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Meta row: date, type, match score, link */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded-lg border border-white/5">
                    <Calendar className="w-3 h-3 text-indigo-400" />
                    {j.appliedDate ? new Date(j.appliedDate).toLocaleDateString() : 'Unknown'}
                  </span>

                  <span className="text-[10px] font-bold uppercase text-indigo-400 bg-indigo-950/30 border border-indigo-500/15 px-2 py-1 rounded-lg font-mono">
                    {j.type}
                  </span>

                  {hasScore && (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-1 rounded-lg border ${scoreColor(j.matchScore)}`}>
                      <Star className="w-2.5 h-2.5" />
                      {j.matchScore}% Match
                    </span>
                  )}

                  {hasUrl && (
                    <a
                      href={j.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-300 hover:text-indigo-200 bg-indigo-950/25 hover:bg-indigo-950/40 border border-indigo-500/20 px-2 py-1 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open Posting
                    </a>
                  )}
                </div>

                {/* Collapsible description */}
                {hasDesc && (
                  <div>
                    <button
                      onClick={() => toggleDesc(j.id)}
                      className="flex items-center gap-1 text-[10px] font-semibold text-slate-450 hover:text-slate-300 transition-colors cursor-pointer"
                    >
                      {isDescOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isDescOpen ? 'Hide' : 'Show'} Job Description
                    </button>
                    {isDescOpen && (
                      <div className="mt-2 p-3 rounded-xl bg-slate-950/60 border border-white/5 text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {j.description}
                      </div>
                    )}
                  </div>
                )}

                {/* Match reason (if available and score shown) */}
                {hasScore && j.matchReason && (
                  <p className="text-[10px] text-slate-400 italic leading-relaxed border-l-2 border-indigo-500/30 pl-2">
                    {j.matchReason}
                  </p>
                )}

                {/* Custom Notes Section */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-semibold text-slate-450 flex items-center gap-1 leading-none">
                    <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
                    Custom Submission Log Notes
                  </label>
                  <textarea
                    value={j.notes || ''}
                    onChange={(e) => onUpdateJobStatus(j.id, j.status, e.target.value)}
                    placeholder="Enter personal notes about this application (e.g. interviewer names, emails, timeline)..."
                    className="w-full h-16 p-2 rounded-xl border border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-950 text-xs text-slate-200 resize-none placeholder-slate-650"
                  />
                </div>

                {/* Status picker */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5">
                  <span className="text-[10px] uppercase font-semibold text-slate-450 flex items-center gap-1">
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
                    Status Tracker
                  </span>

                  <select
                    value={j.status}
                    onChange={(e) => onUpdateJobStatus(j.id, e.target.value as JobStatusType, j.notes)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-xl border focus:outline-none bg-slate-950 cursor-pointer ${currentStatusObj?.color || 'bg-slate-950 border-white/10 text-slate-300'}`}
                  >
                    {statuses.map((stat) => (
                      <option key={stat.value} value={stat.value} className="bg-slate-950">{stat.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
