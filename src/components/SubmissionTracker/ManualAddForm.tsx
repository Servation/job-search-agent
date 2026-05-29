/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus, Link, FileText, AlertCircle } from 'lucide-react';
import { Job, JobTypeType } from '../../types';

interface ManualAddFormProps {
  onAddJob: (job: Job) => void;
  onClose: () => void;
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

export default function ManualAddForm({
  onAddJob,
  onClose
}: ManualAddFormProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const handleFormChange = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setFormError('');
  };

  const handleAddManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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

    onAddJob(job);
    setForm(EMPTY_FORM);
    setFormError('');
    onClose();
  };

  return (
    <form onSubmit={handleAddManualSubmit} className="rounded-2xl border border-indigo-500/20 bg-indigo-955/15 p-5 space-y-4 animate-fade-in text-left">
      <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 font-mono flex items-center gap-1.5">
        <Plus className="w-3.5 h-3.5" /> Manual Job Entry
      </h3>

      {/* Row 1: Title + Company */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-450 mb-1">
            Job Title <span className="text-rose-455">*</span>
          </label>
          <input
            type="text"
            required
            value={form.title}
            onChange={e => handleFormChange('title', e.target.value)}
            placeholder="e.g. Senior Software Engineer"
            className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-450 mb-1">
            Company <span className="text-rose-455">*</span>
          </label>
          <input
            type="text"
            required
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
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-450 mb-1">
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
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-450 mb-1">
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
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-450 mb-1">
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
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-455 mb-1 flex items-center gap-1">
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
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-455 mb-1 flex items-center gap-1">
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
        <p className="text-xs text-rose-455 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> {formError}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-indigo-650 hover:bg-indigo-600 text-white transition-colors cursor-pointer shadow-md shadow-indigo-500/15"
        >
          <Plus className="w-3.5 h-3.5" /> Add to Tracker
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-955 border border-white/5 text-slate-350 transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
