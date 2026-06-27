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
    <form onSubmit={handleAddManualSubmit} className="border-4 border-primary bg-primary-container p-6 space-y-6 animate-fade-in text-left neo-shadow-primary mb-8">
      <h3 className="text-sm font-headline font-extrabold uppercase tracking-widest text-primary flex items-center gap-2 border-b-2 border-primary pb-4">
        <Plus className="w-5 h-5" /> Manual Job Entry
      </h3>

      {/* Row 1: Title + Company */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2">
            Job Title <span className="text-error">*</span>
          </label>
          <input
            type="text"
            required
            value={form.title}
            onChange={e => handleFormChange('title', e.target.value)}
            placeholder="e.g. Senior Software Engineer"
            className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black placeholder:text-outline font-bold"
          />
        </div>
        <div>
          <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2">
            Company <span className="text-error">*</span>
          </label>
          <input
            type="text"
            required
            value={form.company}
            onChange={e => handleFormChange('company', e.target.value)}
            placeholder="e.g. Acme Corp"
            className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black placeholder:text-outline font-bold"
          />
        </div>
      </div>

      {/* Row 2: Location + Type + Match Score */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div>
          <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2">
            Location <span className="text-outline-variant ml-1">(optional)</span>
          </label>
          <input
            type="text"
            value={form.location}
            onChange={e => handleFormChange('location', e.target.value)}
            placeholder="e.g. Remote, San Francisco CA"
            className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black placeholder:text-outline font-bold"
          />
        </div>
        <div>
          <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2">
            Position Type
          </label>
          <select
            value={form.type}
            onChange={e => handleFormChange('type', e.target.value)}
            className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black cursor-pointer font-bold"
          >
            <option value="Full-Time" className="font-bold">Full-Time</option>
            <option value="Contract" className="font-bold">Contract</option>
            <option value="Part-Time" className="font-bold">Part-Time</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2">
            Match Rating 0–100 <span className="text-outline-variant ml-1">(optional)</span>
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={form.matchScore}
            onChange={e => handleFormChange('matchScore', e.target.value)}
            placeholder="e.g. 85"
            className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black placeholder:text-outline font-mono font-bold"
          />
        </div>
      </div>

      {/* Row 3: Application URL */}
      <div>
        <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2 flex items-center gap-2">
          <Link className="w-4 h-4" /> Application URL <span className="text-outline-variant">(optional)</span>
        </label>
        <input
          type="url"
          value={form.url}
          onChange={e => handleFormChange('url', e.target.value)}
          placeholder="https://jobs.example.com/apply/12345"
          className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black placeholder:text-outline font-mono font-bold"
        />
      </div>

      {/* Row 4: Description */}
      <div>
        <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Job Description <span className="text-outline-variant">(optional)</span>
        </label>
        <textarea
          value={form.description}
          onChange={e => handleFormChange('description', e.target.value)}
          placeholder="Paste or summarise the job description..."
          rows={4}
          className="w-full px-4 py-3 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black placeholder:text-outline resize-none font-body"
        />
      </div>

      {formError && (
        <p className="text-sm font-headline font-extrabold text-error flex items-center gap-2 uppercase tracking-widest">
          <AlertCircle className="w-5 h-5" /> {formError}
        </p>
      )}

      <div className="flex gap-4 pt-4 border-t-2 border-primary">
        <button
          type="submit"
          className="flex items-center gap-2 text-xs font-headline font-extrabold uppercase tracking-widest px-6 py-3 bg-black text-primary transition-all cursor-pointer neo-shadow hover:opacity-90 active:scale-[0.98]"
        >
          <Plus className="w-5 h-5" /> Add to Tracker
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-headline font-extrabold uppercase tracking-widest px-6 py-3 bg-surface-container-lowest border-2 border-primary text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
