/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  MapPin,
  Building,
  Trash2,
  CheckSquare,
  Paperclip,
  Calendar,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Star,
  Edit2,
  Save,
  Copy,
  Check
} from 'lucide-react';
import { Job, JobStatusType, JobTypeType } from '../../types';

export const statuses: { value: JobStatusType; label: string; color: string }[] = [
  { value: 'discovered', label: 'Discovered', color: 'bg-surface-container text-on-surface-variant border-outline-variant' },
  { value: 'applied', label: 'Applied', color: 'bg-primary-container text-on-primary-container border-primary hover:border-primary-variant' },
  { value: 'review', label: 'Under Review', color: 'bg-blue-500/10 text-blue-500 border-blue-500' },
  { value: 'interviewing', label: 'Interviewing', color: 'bg-warning-container text-on-warning-container border-warning hover:opacity-90' },
  { value: 'offered', label: 'Offered', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500' },
  { value: 'rejected', label: 'Rejected', color: 'bg-error-container text-error border-error' },
];

interface TrackedJobCardProps {
  key?: string;
  job: Job;
  onUpdateJobStatus: (id: string, status: JobStatusType, notes?: string) => void;
  onRemoveJob: (id: string) => void;
  onUpdateJobDetails: (id: string, updatedFields: Partial<Job>) => void;
}

const scoreColor = (score: number) => {
  if (score >= 80) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500';
  if (score >= 60) return 'text-primary bg-primary/10 border-primary';
  if (score > 0)   return 'text-error bg-error-container border-error';
  return 'text-on-surface-variant bg-surface-container-lowest border-outline-variant';
};

const EMPTY_FORM = {
  title: '',
  company: '',
  location: '',
  type: 'Full-Time' as JobTypeType,
  url: '',
  matchScore: '',
  description: '',
};

export default function TrackedJobCard({
  job,
  onUpdateJobStatus,
  onRemoveJob,
  onUpdateJobDetails
}: TrackedJobCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<typeof EMPTY_FORM | null>(null);
  const [isDescOpen, setIsDescOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy text:', err);
    });
  };

  const handleStartEdit = () => {
    setEditForm({
      title: job.title,
      company: job.company,
      location: job.location || '',
      type: job.type,
      url: job.url || '',
      matchScore: job.matchScore > 0 ? String(job.matchScore) : '',
      description: job.description || '',
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm(null);
  };

  const handleSaveEdit = () => {
    if (!editForm) return;
    if (!editForm.title.trim() || !editForm.company.trim()) {
      alert('Job title and company are required.');
      return;
    }
    const scoreNum = editForm.matchScore ? Math.min(100, Math.max(0, parseInt(editForm.matchScore, 10))) : 0;

    onUpdateJobDetails(job.id, {
      title: editForm.title.trim(),
      company: editForm.company.trim(),
      location: editForm.location.trim() || 'Not specified',
      type: editForm.type,
      url: editForm.url.trim(),
      matchScore: scoreNum,
      description: editForm.description.trim(),
    });

    setIsEditing(false);
    setEditForm(null);
  };

  const handleEditFormChange = (field: keyof typeof EMPTY_FORM, value: string) => {
    setEditForm(prev => prev ? { ...prev, [field]: value } : null);
  };

  const currentStatusObj = statuses.find((s) => s.value === job.status);
  const hasDesc = !!job.description?.trim();
  const hasUrl = !!job.url?.trim();
  const hasScore = job.matchScore > 0;

  if (isEditing && editForm) {
    return (
      <div className="border-4 border-primary bg-primary-container p-6 space-y-6 neo-shadow-primary transition-all">
        {/* Edit Header */}
        <div className="flex items-center justify-between border-b-2 border-primary pb-4">
          <span className="text-sm font-headline font-extrabold uppercase tracking-widest text-primary flex items-center gap-2">
            <Edit2 className="w-5 h-5" /> Edit Job
          </span>
          <button
            onClick={handleCancelEdit}
            className="text-xs font-headline font-extrabold uppercase tracking-widest px-4 py-2 border-2 border-primary bg-surface-container-lowest hover:bg-surface-container text-primary transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>

        {/* Form inputs */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2">
                Job Title
              </label>
              <input
                type="text"
                value={editForm.title}
                onChange={e => handleEditFormChange('title', e.target.value)}
                className="w-full px-4 py-2 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2">
                Company
              </label>
              <input
                type="text"
                value={editForm.company}
                onChange={e => handleEditFormChange('company', e.target.value)}
                className="w-full px-4 py-2 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2">
                Location
              </label>
              <input
                type="text"
                value={editForm.location}
                onChange={e => handleEditFormChange('location', e.target.value)}
                className="w-full px-4 py-2 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2">
                Job Type
              </label>
              <select
                value={editForm.type}
                onChange={e => handleEditFormChange('type', e.target.value)}
                className="w-full px-4 py-2 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black font-bold cursor-pointer"
              >
                <option value="Full-Time" className="font-bold">Full-Time</option>
                <option value="Contract" className="font-bold">Contract</option>
                <option value="Part-Time" className="font-bold">Part-Time</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-end">
            <div className="col-span-2">
              <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2">
                Application URL
              </label>
              <input
                type="url"
                value={editForm.url}
                onChange={e => handleEditFormChange('url', e.target.value)}
                className="w-full px-4 py-2 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2">
                Score (0-100)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={editForm.matchScore}
                onChange={e => handleEditFormChange('matchScore', e.target.value)}
                className="w-full px-4 py-2 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black font-mono font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-primary-container mb-2">
              Description
            </label>
            <textarea
              value={editForm.description}
              onChange={e => handleEditFormChange('description', e.target.value)}
              rows={4}
              className="w-full px-4 py-2 text-sm bg-surface-container-lowest border-2 border-primary text-on-surface focus:outline-none focus:border-black resize-none font-body"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 pt-4 border-t-2 border-primary">
          <button
            onClick={handleSaveEdit}
            className="flex items-center gap-2 text-xs font-headline font-extrabold uppercase tracking-widest px-6 py-3 bg-black text-primary transition-colors cursor-pointer neo-shadow hover:opacity-90 active:scale-[0.98]"
          >
            <Save className="w-5 h-5" /> Save Changes
          </button>
          <button
            onClick={handleCancelEdit}
            className="text-xs font-headline font-extrabold uppercase tracking-widest px-6 py-3 bg-surface-container-lowest border-2 border-primary text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-outline-variant bg-surface p-6 hover:border-primary transition-all space-y-6 neo-shadow-sm hover:translate-x-[2px] hover:-translate-y-[2px]">
      {/* Header row */}
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-2 min-w-0">
          <h3 className="font-headline font-bold text-on-surface text-lg uppercase tracking-tight leading-snug">{job.title}</h3>
          <div className="flex items-center gap-3 text-xs text-on-surface-variant font-headline font-bold flex-wrap uppercase tracking-widest">
            <span className="flex items-center gap-1.5 text-primary">
              <Building className="w-4 h-4 text-primary" /> {job.company}
            </span>
            <span className="text-outline-variant">•</span>
            <span className="flex items-center gap-1.5 font-bold text-on-surface-variant">
              <MapPin className="w-4 h-4 text-outline" /> {job.location}
            </span>
          </div>
          {hasUrl && (
            <div className="flex items-center flex-wrap gap-2 text-[10px] text-on-surface-variant mt-2 font-mono">
              <div className="relative group flex items-center bg-surface-container-lowest border-2 border-outline-variant px-2 py-1">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary-variant hover:underline truncate block max-w-[160px] sm:max-w-[240px] font-bold"
                >
                  {job.url}
                </a>
                <div className="absolute left-0 bottom-full mb-2 opacity-0 translate-y-1 scale-95 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-200 w-max max-w-[280px] sm:max-w-[380px] bg-surface border-2 border-primary text-on-surface p-3 text-[10px] z-50 font-mono shadow-2xl break-all">
                  <div className="font-bold text-primary uppercase tracking-widest mb-1 border-b-2 border-primary pb-1">Full URL:</div>
                  {job.url}
                </div>
              </div>
              <button
                onClick={() => handleCopyLink(job.url || '')}
                className="p-1.5 border-2 border-transparent hover:border-outline-variant hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer flex items-center justify-center bg-surface-container-lowest"
                title="Copy link"
              >
                <Copy className="w-4 h-4" />
              </button>
              {copied && (
                <span className="text-primary font-headline font-bold text-[10px] uppercase tracking-widest animate-fade-in flex items-center gap-1">
                  <Check className="w-3 h-3" /> Copied!
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleStartEdit}
            className="p-2 border-2 border-transparent hover:border-outline-variant hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors cursor-pointer bg-surface-container-lowest"
            title="Edit job"
          >
            <Edit2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => onRemoveJob(job.id)}
            className="p-2 border-2 border-transparent hover:border-error hover:bg-error-container text-on-surface-variant hover:text-error transition-colors cursor-pointer bg-surface-container-lowest"
            title="Remove job"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Meta row: date, type, match score, link */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-on-surface-variant bg-surface-container px-3 py-1.5 border-2 border-outline-variant uppercase tracking-widest">
          <Calendar className="w-4 h-4 text-outline" />
          {job.appliedDate ? new Date(job.appliedDate).toLocaleDateString() : 'Unknown'}
        </span>

        <span className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface bg-surface-container-lowest border-2 border-outline-variant px-3 py-1.5">
          {job.type}
        </span>

        {hasScore && (
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-headline font-extrabold uppercase tracking-widest px-3 py-1.5 border-2 ${scoreColor(job.matchScore)}`}>
            <Star className="w-4 h-4" />
            {job.matchScore}% Match
          </span>
        )}

        {job.sourceTag && (
          <span className={`inline-flex items-center text-[10px] font-headline font-extrabold border-2 uppercase tracking-widest px-3 py-1.5 bg-surface-container border-outline-variant text-on-surface`}>
            {job.sourceTag === 'hackernews' ? 'Hacker News' : job.sourceTag}
          </span>
        )}

        {job.retryTier !== undefined && job.retryTier >= 1 && (
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-headline font-extrabold uppercase tracking-widest px-3 py-1.5 bg-warning-container border-2 border-warning text-warning cursor-help"
            title={`The match score for this job may be less accurate (Tier ${job.retryTier}) because scoring ran with limited information.`}
          >
            ⚠️ Less Accurate Score
          </span>
        )}

        {hasUrl && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[10px] font-headline font-extrabold uppercase tracking-widest text-primary hover:text-primary-variant bg-primary-container border-2 border-primary px-3 py-1.5 transition-colors neo-shadow-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Open Job
          </a>
        )}
      </div>

      {/* Collapsible description */}
      {hasDesc && (
        <div className="border-t-2 border-outline-variant pt-4">
          <button
            onClick={() => setIsDescOpen(!isDescOpen)}
            className="flex items-center gap-2 text-xs font-headline font-extrabold uppercase tracking-widest text-on-surface hover:text-primary transition-colors cursor-pointer"
          >
            {isDescOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {isDescOpen ? 'Hide' : 'Show'} Job Description
          </button>
          {isDescOpen && (
            <div className="mt-4 p-5 bg-surface-container-lowest border-2 border-outline-variant text-sm text-on-surface leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto font-body">
              {job.description}
            </div>
          )}
        </div>
      )}

      {/* Match reason (if available and score shown) */}
      {hasScore && job.matchReason && (
        <p className="text-xs text-on-surface-variant italic leading-relaxed border-l-4 border-primary pl-4 font-body font-bold mt-4">
          {job.matchReason}
        </p>
      )}

      {/* Custom Notes Section */}
      <div className="space-y-2 mt-4">
        <label className="text-xs uppercase font-headline font-extrabold text-on-surface flex items-center gap-2 leading-none">
          <Paperclip className="w-4 h-4 text-primary" />
          Notes
        </label>
        <textarea
          value={job.notes || ''}
          onChange={(e) => onUpdateJobStatus(job.id, job.status, e.target.value)}
          placeholder="Add notes about this application (e.g. interviewer names, emails, dates)..."
          className="w-full h-24 p-4 border-2 border-outline-variant focus:outline-none focus:border-primary bg-surface-container-lowest text-sm text-on-surface resize-none placeholder:text-outline font-body"
        />
      </div>

      {/* Status picker */}
      <div className="flex items-center justify-between gap-4 pt-4 border-t-2 border-outline-variant">
        <span className="text-xs uppercase font-headline font-extrabold text-on-surface flex items-center gap-2 tracking-widest">
          <CheckSquare className="w-5 h-5 text-primary" />
          Status
        </span>

        <select
          value={job.status}
          onChange={(e) => onUpdateJobStatus(job.id, e.target.value as JobStatusType, job.notes)}
          className={`text-xs font-headline font-extrabold uppercase tracking-widest px-4 py-2 border-2 focus:outline-none cursor-pointer neo-shadow-sm ${currentStatusObj?.color || 'bg-surface-container-lowest border-outline-variant text-on-surface'}`}
        >
          {statuses.map((stat) => (
            <option key={stat.value} value={stat.value} className="bg-surface-container-lowest text-on-surface">{stat.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
