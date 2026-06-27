/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Briefcase,
  Sparkles,
  Check,
  ExternalLink,
  FileCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MapPin,
  DollarSign,
  Bookmark,
  Trash2,
  Ban,
  Copy,
  Paperclip,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { Job } from '../../types';

interface DiscoveredJobCardProps {
  key?: string;
  job: Job;
  currentlyRefiningJobId: string | null;
  isReevaluatingId?: string | null;
  onReevaluateJob?: (job: Job) => void;
  onSaveToTracker: (job: Job, customNote: string) => void;
  onSaveToWatchlist: (job: Job, customNote: string) => void;
  onDismissJob: (id: string) => void;
  onBlockCompany: (company: string) => void;
}

const getMatchColor = (score: number) => {
  if (score >= 80) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500';
  if (score >= 60) return 'text-primary bg-primary/10 border-primary';
  return 'text-on-surface bg-surface-container-lowest border-outline-variant';
};

const formatTimestamp = (ts: string | undefined) => {
  if (!ts) return 'Recent';
  const parsed = Date.parse(ts);
  if (!isNaN(parsed) && ts.length > 8) {
    try {
      return new Date(ts).toLocaleString([], {
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return ts;
    }
  }
  return ts;
};

export default function DiscoveredJobCard({
  job,
  currentlyRefiningJobId,
  isReevaluatingId,
  onReevaluateJob,
  onSaveToTracker,
  onSaveToWatchlist,
  onDismissJob,
  onBlockCompany
}: DiscoveredJobCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [customNote, setCustomNote] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopyLink = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy text:', err);
    });
  };

  return (
    <div
      onClick={() => setIsExpanded(!isExpanded)}
      className={`bg-surface border-2 border-outline-variant transition-all relative cursor-pointer ${
        job.isDuplicate
          ? 'opacity-65'
          : 'neo-shadow-sm hover:translate-x-[2px] hover:-translate-y-[2px] hover:neo-shadow-primary hover:border-primary'
      }`}
    >
      <div className="p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div className="space-y-4 flex-grow">
          {/* Duplicate banner trigger */}
          {job.isDuplicate && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-warning-container text-on-warning-container border-2 border-warning text-[10px] font-headline font-extrabold uppercase tracking-widest">
              <AlertTriangle className="w-4 h-4" /> Already Applied / Saved (Duplicate Prevented)
            </span>
          )}

          {/* Title Row with high stability */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 flex-grow min-w-0">
              {!job.isDuplicate && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSaveToWatchlist(job, customNote); }}
                  className="p-2 bg-surface-container-lowest border-2 border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary-container transition-all cursor-pointer flex items-center justify-center shrink-0 neo-shadow-sm"
                  title="Save to Watchlist"
                >
                  <Bookmark className="w-4 h-4" />
                </button>
              )}
              <h3 className="text-xl font-headline font-bold text-on-surface tracking-tight leading-snug">
                {job.title}
              </h3>
            </div>
            <span className={`px-3 py-1 text-[12px] font-headline font-extrabold uppercase tracking-widest border-2 ${getMatchColor(job.matchScore)} shrink-0 self-center`}>
              {job.matchScore}% Match
            </span>
          </div>

          {/* Badge Row with stable layout */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {job.isUrlVerified ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border-2 border-emerald-500 text-emerald-500 text-[10px] font-headline font-extrabold uppercase tracking-widest shrink-0" title="This link has been validated as an active direct application page.">
                <Check className="w-4 h-4 text-emerald-500" /> Link Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-warning-container/20 border-2 border-warning text-warning text-[10px] font-headline font-extrabold uppercase tracking-widest shrink-0" title="This link was not automatically validated as a direct application page. Exercise caution.">
                <AlertTriangle className="w-4 h-4 text-warning" /> Link Unverified
              </span>
            )}

            {/* Stable-width container for Background Refiner Status to prevent badge layout shifts */}
            <div className="inline-flex shrink-0 min-w-[145px]">
              {job.id === currentlyRefiningJobId ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 border-2 border-blue-500 text-blue-500 text-[10px] font-headline font-extrabold uppercase tracking-widest w-full justify-center animate-pulse" title="This job is currently being fetched and evaluated by the background Refiner.">
                  <Loader2 className="w-3 h-3 animate-spin text-blue-500" /> Enriching Details...
                </span>
              ) : !job.isFullDescriptionFetched ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-surface-container border-2 border-outline-variant text-on-surface-variant text-[10px] font-headline font-extrabold uppercase tracking-widest w-full justify-center" title="Awaiting full details extraction by the background refiner cycle.">
                  ⏳ Queue: Awaiting Details
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border-2 border-emerald-500 text-emerald-500 text-[10px] font-headline font-extrabold uppercase tracking-widest w-full justify-center" title="Full job description and salary details have been successfully retrieved and evaluated.">
                  ✓ Details Enriched
                </span>
              )}
            </div>
          </div>

          {/* Metadata Row with stable slots */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-headline font-bold text-on-surface pt-1 uppercase tracking-wider">
            <span className="text-primary">{job.company}</span>
            <span className="flex items-center gap-1.5 font-bold text-on-surface-variant shrink-0">
              <MapPin className="w-4 h-4" /> {job.location || 'Remote / Unknown'}
            </span>

            {/* Stable Compensation Field */}
            <span className="flex items-center gap-1.5 font-bold text-on-surface-variant shrink-0">
              <DollarSign className="w-4 h-4" />
              {job.salary && job.salary.toLowerCase() !== 'not specified' ? (
                <span className="text-on-surface font-extrabold">{job.salary}</span>
              ) : (job.id === currentlyRefiningJobId || !job.isFullDescriptionFetched) ? (
                <span className="text-outline italic text-[11px] animate-pulse">Checking compensation...</span>
              ) : (
                <span className="text-outline italic text-[11px]">Not specified</span>
              )}
            </span>

            <span className="px-2 py-1 bg-surface-container border-2 border-outline-variant text-on-surface text-[10px] shrink-0 font-extrabold">
              {job.type} {job.isW2 && '· W2'}
            </span>

            {job.sourceTag && (
              <span className={`px-2 py-1 text-[10px] font-extrabold border-2 uppercase tracking-widest shrink-0 bg-surface-container border-outline-variant text-on-surface`}>
                {job.sourceTag === 'hackernews' ? 'Hacker News' : job.sourceTag}
              </span>
            )}

            {job.retryTier !== undefined && job.retryTier >= 1 && (
              <span
                className="px-2 py-1 bg-warning-container border-2 border-warning text-warning text-[10px] font-extrabold flex items-center gap-1.5 cursor-help shrink-0"
                title={`This job was evaluated with reduced context (Tier ${job.retryTier}) due to local LLM processing timeout. Match score may be less precise.`}
              >
                <span>⚠️</span> Reduced Context
              </span>
            )}
          </div>

          {job.url && (
            <div className="flex items-center flex-wrap gap-2 text-xs text-on-surface-variant mt-2 font-mono">
              <div className="relative group flex items-center bg-surface-container-lowest border-2 border-outline-variant px-3 py-1.5">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-primary hover:text-primary-variant hover:underline truncate block max-w-[160px] sm:max-w-[240px] font-bold"
                >
                  {job.url}
                </a>
                <div className="absolute left-0 bottom-full mb-2 opacity-0 translate-y-1 scale-95 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-200 w-max max-w-[280px] sm:max-w-[380px] bg-surface border-2 border-primary text-on-surface p-3 text-[10px] sm:text-xs z-50 font-mono shadow-2xl break-all">
                  <div className="font-bold text-primary uppercase tracking-widest mb-1 border-b-2 border-primary pb-1">Full URL:</div>
                  {job.url}
                </div>
              </div>
              <button
                onClick={(e) => handleCopyLink(e, job.url)}
                className="p-1.5 border-2 border-transparent hover:border-outline-variant hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer flex items-center justify-center bg-surface-container-lowest"
                title="Copy URL to Clipboard"
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

          {/* Stable Description layout (skeleton fallback when loading) */}
          <div className="h-[44px] overflow-hidden mt-2">
            {job.description ? (
              <p className="text-sm text-on-surface-variant leading-relaxed font-body line-clamp-2">
                {job.description}
              </p>
            ) : (job.id === currentlyRefiningJobId || !job.isFullDescriptionFetched) ? (
              <div className="space-y-2 py-1">
                <div className="h-4 w-[92%] bg-surface-container rounded-none animate-pulse" />
                <div className="h-4 w-[78%] bg-surface-container rounded-none animate-pulse" />
              </div>
            ) : (
              <p className="text-xs text-outline italic font-mono uppercase tracking-widest">No description details available</p>
            )}
          </div>

          {/* Stable Skills layout (skeleton fallback when loading) */}
          <div className="min-h-[28px] flex items-center mt-2">
            {job.skillsRequired && job.skillsRequired.length > 0 ? (
              <div className="flex flex-wrap gap-2 max-h-[28px] overflow-hidden">
                {job.skillsRequired.map((s, i) => (
                  <span key={i} className="text-[10px] px-2 py-1 bg-surface-container text-on-surface-variant border-2 border-outline-variant font-mono font-bold uppercase tracking-wider whitespace-nowrap">
                    {s}
                  </span>
                ))}
              </div>
            ) : (job.id === currentlyRefiningJobId || !job.isFullDescriptionFetched) ? (
              <div className="flex gap-2 animate-pulse">
                <div className="h-7 w-16 bg-surface-container border-2 border-outline-variant" />
                <div className="h-7 w-24 bg-surface-container border-2 border-outline-variant" />
                <div className="h-7 w-14 bg-surface-container border-2 border-outline-variant" />
              </div>
            ) : (
              <span className="text-[10px] text-outline italic font-mono uppercase tracking-widest">No skills specified</span>
            )}
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 shrink-0 text-right">
          <span className="text-[10px] text-on-surface-variant font-bold font-mono uppercase tracking-widest" title="Original posting date">
            Posted: {formatTimestamp(job.postedAt)}
          </span>
          {job.scannedAt && (
            <span className="text-[10px] text-primary font-bold font-mono uppercase tracking-widest" title="Time when this agent discovered the job">
              Found: {new Date(job.scannedAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
            </span>
          )}
          <div className="flex gap-2">
            {job.isFullDescriptionFetched && onReevaluateJob && (
              <button
                onClick={(e) => { e.stopPropagation(); onReevaluateJob(job); }}
                disabled={job.id === isReevaluatingId}
                className="p-2 border-2 border-transparent hover:border-primary hover:bg-primary-container text-on-surface-variant hover:text-primary transition-colors mt-2 cursor-pointer bg-surface-container-lowest disabled:opacity-50 disabled:cursor-not-allowed"
                title="Force LLM Re-evaluation"
              >
                <RefreshCw className={`w-5 h-5 ${job.id === isReevaluatingId ? 'animate-spin text-primary' : ''}`} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onBlockCompany(job.company); }}
              className="p-2 border-2 border-transparent hover:border-error hover:bg-error-container text-on-surface-variant hover:text-error transition-colors mt-2 cursor-pointer bg-surface-container-lowest"
              title={`Block all jobs from ${job.company}`}
            >
              <Ban className="w-5 h-5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDismissJob(job.id); }}
              className="p-2 border-2 border-transparent hover:border-error hover:bg-error-container text-on-surface-variant hover:text-error transition-colors mt-2 cursor-pointer bg-surface-container-lowest"
              title="Dismiss Job Listing"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
          {!job.isDuplicate && (
            <button
              onClick={(e) => { e.stopPropagation(); onSaveToTracker(job, customNote); }}
              className="mt-2 px-4 py-2 bg-primary hover:bg-primary-variant text-on-primary font-headline font-extrabold uppercase tracking-widest text-[10px] border-2 border-black transition-all neo-shadow flex items-center gap-2 cursor-pointer justify-center"
            >
              <FileCheck className="w-4 h-4" /> Log Applied
            </button>
          )}
        </div>
      </div>

      {/* Expanded Matching Details & Actions */}
      {isExpanded && (
        <div className="px-6 pb-6 border-t-2 border-outline-variant pt-5 bg-surface-container space-y-6">
          {job.description && (
            <div className="p-5 bg-surface-container-lowest border-2 border-outline-variant space-y-3">
              <span className="text-xs uppercase font-headline font-extrabold text-primary flex items-center gap-2 tracking-widest border-b-2 border-outline-variant pb-2">
                <Briefcase className="w-4 h-4 text-primary" /> Full Position Description
              </span>
              <p className="text-sm text-on-surface leading-relaxed font-body whitespace-pre-wrap">{job.description}</p>
            </div>
          )}

          {job.matchReason && (
            <div className="p-5 bg-primary-container border-2 border-primary space-y-3 neo-shadow-primary">
              <span className="text-xs uppercase font-headline font-extrabold text-primary flex items-center gap-2 tracking-widest border-b-2 border-primary pb-2">
                <Sparkles className="w-4 h-4 text-primary" /> Grounded Agent Score Matching Reason
              </span>
              <p className="text-sm text-on-primary-container leading-relaxed font-body font-bold">{job.matchReason}</p>
            </div>
          )}

          {!job.isDuplicate && (
            <div className="pt-4 border-t-2 border-outline-variant space-y-2">
              <label className="text-xs uppercase font-headline font-extrabold text-on-surface flex items-center gap-2 tracking-widest leading-none">
                <Paperclip className="w-4 h-4 text-primary" />
                Custom Discovery Notes
              </label>
              <input
                type="text"
                value={customNote}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="Add custom notes (e.g. key requirements, referral contact, referral notes) before saving..."
                className="w-full px-4 py-3 text-sm border-2 border-outline-variant bg-surface-container-lowest focus:outline-none focus:border-primary text-on-surface placeholder:text-outline font-body"
              />
            </div>
          )}
        </div>
      )}

    </div>
  );
}
