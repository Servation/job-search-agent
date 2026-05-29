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
  { value: 'discovered', label: 'Discovered', color: 'bg-slate-900 text-slate-400 border-white/15' },
  { value: 'applied', label: 'Applied', color: 'bg-indigo-950/40 text-indigo-300 border-indigo-500/20 hover:ring-indigo-500/30' },
  { value: 'review', label: 'Under Review', color: 'bg-blue-950/40 text-blue-300 border-blue-500/20' },
  { value: 'interviewing', label: 'Interviewing', color: 'bg-amber-950/40 text-amber-300 border-amber-500/20 hover:ring-amber-500/30' },
  { value: 'offered', label: 'Offered', color: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/20' },
  { value: 'rejected', label: 'Rejected / Archived', color: 'bg-rose-950/40 text-rose-300 border-rose-500/20' },
];

interface TrackedJobCardProps {
  key?: string;
  job: Job;
  onUpdateJobStatus: (id: string, status: JobStatusType, notes?: string) => void;
  onRemoveJob: (id: string) => void;
  onUpdateJobDetails: (id: string, updatedFields: Partial<Job>) => void;
}

const scoreColor = (score: number) => {
  if (score >= 80) return 'text-emerald-400 bg-emerald-950/40 border-emerald-500/25';
  if (score >= 60) return 'text-amber-400 bg-amber-950/30 border-amber-500/20';
  if (score > 0)   return 'text-rose-400 bg-rose-950/30 border-rose-500/20';
  return 'text-slate-500 bg-slate-900/50 border-white/10';
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
      <div className="border border-indigo-500/30 rounded-2xl p-5 bg-indigo-950/15 hover:border-indigo-500/40 transition-all space-y-4 shadow-md">
        {/* Edit Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 font-mono flex items-center gap-1.5">
            <Edit2 className="w-3.5 h-3.5" /> Edit Submission Details
          </span>
          <button
            onClick={handleCancelEdit}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-955 hover:bg-slate-900 border border-white/15 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>

        {/* Form inputs */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                Job Title
              </label>
              <input
                type="text"
                value={editForm.title}
                onChange={e => handleEditFormChange('title', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-955 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                Company Name
              </label>
              <input
                type="text"
                value={editForm.company}
                onChange={e => handleEditFormChange('company', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-955 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                Location
              </label>
              <input
                type="text"
                value={editForm.location}
                onChange={e => handleEditFormChange('location', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-955 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                Position Type
              </label>
              <select
                value={editForm.type}
                onChange={e => handleEditFormChange('type', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-955 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="Full-Time">Full-Time</option>
                <option value="Contract">Contract</option>
                <option value="Part-Time">Part-Time</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 items-end">
            <div className="col-span-2">
              <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                Application URL
              </label>
              <input
                type="url"
                value={editForm.url}
                onChange={e => handleEditFormChange('url', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-955 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                Score (0-100)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={editForm.matchScore}
                onChange={e => handleEditFormChange('matchScore', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-955 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
              Description
            </label>
            <textarea
              value={editForm.description}
              onChange={e => handleEditFormChange('description', e.target.value)}
              rows={3}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-955 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-sans"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
          <button
            onClick={handleSaveEdit}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-indigo-650 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-md shadow-indigo-500/15"
          >
            <Save className="w-3.5 h-3.5" /> Save Changes
          </button>
          <button
            onClick={handleCancelEdit}
            className="text-xs font-semibold px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-955 border border-white/5 text-slate-350 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-white/10 rounded-2xl p-5 hover:border-indigo-500/20 bg-slate-900/30 hover:bg-slate-900/40 transition-all space-y-4 shadow-md">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <h3 className="font-bold text-white text-sm font-display tracking-tight leading-snug">{job.title}</h3>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold flex-wrap">
            <span className="flex items-center gap-1 text-slate-300">
              <Building className="w-3.5 h-3.5 text-indigo-400" /> {job.company}
            </span>
            <span className="text-slate-655">•</span>
            <span className="flex items-center gap-1 font-normal text-slate-400">
              <MapPin className="w-3.5 h-3.5 text-slate-550" /> {job.location}
            </span>
          </div>
          {hasUrl && (
            <div className="flex items-center flex-wrap gap-1.5 text-[10px] text-slate-500 mt-1 font-mono">
              <div className="relative group flex items-center">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 hover:underline truncate block max-w-[160px] sm:max-w-[240px]"
                >
                  {job.url}
                </a>
                <div className="absolute left-0 bottom-full mb-2 opacity-0 translate-y-1 scale-95 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-200 w-max max-w-[280px] sm:max-w-[380px] bg-slate-950/95 border border-white/10 text-slate-200 p-2.5 rounded-xl text-[10px] z-50 font-mono shadow-2xl backdrop-blur-sm break-all">
                  <div className="font-semibold text-indigo-400 mb-0.5">Full URL:</div>
                  {job.url}
                </div>
              </div>
              <button
                onClick={() => handleCopyLink(job.url || '')}
                className="p-0.5 rounded hover:bg-white/5 text-slate-505 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                title="Copy URL to Clipboard"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              {copied && (
                <span className="text-emerald-400 font-semibold text-[9px] animate-fade-in flex items-center gap-0.5">
                  <Check className="w-2.5 h-2.5" /> Copied!
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleStartEdit}
            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-white/5 transition-colors"
            title="Edit Job Details"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemoveJob(job.id)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-455 hover:bg-white/5 transition-colors"
            title="Remove from history"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Meta row: date, type, match score, link */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded-lg border border-white/5">
          <Calendar className="w-3 h-3 text-indigo-400" />
          {job.appliedDate ? new Date(job.appliedDate).toLocaleDateString() : 'Unknown'}
        </span>

        <span className="text-[10px] font-bold uppercase text-indigo-400 bg-indigo-950/30 border border-indigo-500/15 px-2 py-1 rounded-lg font-mono">
          {job.type}
        </span>

        {hasScore && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-1 rounded-lg border ${scoreColor(job.matchScore)}`}>
            <Star className="w-2.5 h-2.5" />
            {job.matchScore}% Match
          </span>
        )}

        {job.sourceTag && (
          <span className={`inline-flex items-center text-[10px] font-bold border uppercase tracking-wider px-2 py-1 rounded-lg ${
            job.sourceTag === 'hackernews' ? 'bg-orange-950/45 border-orange-500/20 text-orange-400' :
            job.sourceTag === 'remotive' ? 'bg-purple-950/45 border-purple-500/20 text-purple-400' :
            job.sourceTag === 'remoteok' ? 'bg-pink-950/45 border-pink-500/20 text-pink-400' :
            job.sourceTag === 'greenhouse' ? 'bg-emerald-950/45 border-emerald-500/20 text-emerald-400' :
            job.sourceTag === 'lever' ? 'bg-teal-950/45 border-teal-500/20 text-teal-400' :
            job.sourceTag === 'ashby' ? 'bg-cyan-950/45 border-cyan-500/20 text-cyan-400' :
            job.sourceTag === 'workday' ? 'bg-blue-950/45 border-blue-500/20 text-blue-455' :
            job.sourceTag === 'smartrecruiters' ? 'bg-violet-950/45 border-violet-500/20 text-violet-400' :
            'bg-slate-950 border-white/5 text-slate-350 font-mono'
          }`}>
            {job.sourceTag === 'hackernews' ? 'Hacker News' : job.sourceTag}
          </span>
        )}

        {job.retryTier !== undefined && job.retryTier >= 1 && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-1 rounded-lg bg-amber-950/40 border border-amber-500/20 text-amber-400 cursor-help"
            title={`This job was evaluated with reduced context (Tier ${job.retryTier}) due to local LLM processing timeout. Match score may be less precise.`}
          >
            ⚠️ Reduced Context
          </span>
        )}

        {hasUrl && (
          <a
            href={job.url}
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
            onClick={() => setIsDescOpen(!isDescOpen)}
            className="flex items-center gap-1 text-[10px] font-semibold text-slate-455 hover:text-slate-300 transition-colors cursor-pointer"
          >
            {isDescOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {isDescOpen ? 'Hide' : 'Show'} Job Description
          </button>
          {isDescOpen && (
            <div className="mt-2 p-3 rounded-xl bg-slate-950/60 border border-white/5 text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {job.description}
            </div>
          )}
        </div>
      )}

      {/* Match reason (if available and score shown) */}
      {hasScore && job.matchReason && (
        <p className="text-[10px] text-slate-400 italic leading-relaxed border-l-2 border-indigo-500/30 pl-2">
          {job.matchReason}
        </p>
      )}

      {/* Custom Notes Section */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase font-semibold text-slate-450 flex items-center gap-1 leading-none">
          <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
          Custom Submission Log Notes
        </label>
        <textarea
          value={job.notes || ''}
          onChange={(e) => onUpdateJobStatus(job.id, job.status, e.target.value)}
          placeholder="Enter personal notes about this application (e.g. interviewer names, emails, timeline)..."
          className="w-full h-16 p-2 rounded-xl border border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-955 text-xs text-slate-200 resize-none placeholder-slate-650"
        />
      </div>

      {/* Status picker */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5">
        <span className="text-[10px] uppercase font-semibold text-slate-450 flex items-center gap-1">
          <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
          Status Tracker
        </span>

        <select
          value={job.status}
          onChange={(e) => onUpdateJobStatus(job.id, e.target.value as JobStatusType, job.notes)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-xl border focus:outline-none bg-slate-955 cursor-pointer ${currentStatusObj?.color || 'bg-slate-955 border-white/10 text-slate-300'}`}
        >
          {statuses.map((stat) => (
            <option key={stat.value} value={stat.value} className="bg-slate-955">{stat.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
