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
  Loader2
} from 'lucide-react';
import { Job } from '../../types';

interface DiscoveredJobCardProps {
  key?: string;
  job: Job;
  currentlyRefiningJobId: string | null;
  onSaveToTracker: (job: Job, customNote: string) => void;
  onSaveToWatchlist: (job: Job, customNote: string) => void;
  onDismissJob: (id: string) => void;
  onBlockCompany: (company: string) => void;
}

const getMatchColor = (score: number) => {
  if (score >= 80) return 'text-emerald-400 bg-emerald-950/40 border-emerald-500/20';
  if (score >= 60) return 'text-amber-400 bg-amber-950/40 border-amber-500/20';
  return 'text-slate-400 bg-slate-900 border-white/5';
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
      className={`sleek-card rounded-2xl transition-all border border-white/10 relative ${
        job.isDuplicate
          ? 'opacity-65'
          : 'shadow-md hover:border-indigo-500/25 shadow-black/10'
      }`}
    >
      <div className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2 flex-grow">
          {/* Duplicate banner trigger */}
          {job.isDuplicate && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-950/45 border border-amber-500/15">
              <AlertTriangle className="w-3.5 h-3.5" /> Already Applied / Saved (Duplicate Prevented)
            </span>
          )}

          {/* Title Row with high stability */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-grow min-w-0">
              {!job.isDuplicate && (
                <button
                  onClick={() => onSaveToWatchlist(job, customNote)}
                  className="p-1.5 rounded-lg border border-indigo-500/20 text-indigo-400 hover:bg-indigo-950/20 transition-all cursor-pointer flex items-center justify-center shrink-0"
                  title="Save to Watchlist"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                </button>
              )}
              <h3 className="text-base font-bold text-white font-display tracking-tight leading-snug">
                {job.title}
              </h3>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getMatchColor(job.matchScore)} shrink-0 self-center`}>
              {job.matchScore}% Match
            </span>
          </div>

          {/* Badge Row with stable layout */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {job.isUrlVerified ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 shrink-0" title="This link has been validated as an active direct application page.">
                <Check className="w-3.5 h-3.5 text-emerald-455" /> Link Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/45 border border-amber-500/20 text-amber-400 shrink-0" title="This link was not automatically validated as a direct application page. Exercise caution.">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-455" /> Link Unverified
              </span>
            )}

            {/* Stable-width container for Background Refiner Status to prevent badge layout shifts */}
            <div className="inline-flex shrink-0 min-w-[145px]">
              {job.id === currentlyRefiningJobId ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950/40 border border-blue-500/30 text-blue-400 w-full justify-center animate-pulse" title="This job is currently being fetched and evaluated by the background Refiner.">
                  <Loader2 className="w-3 h-3 animate-spin text-blue-400" /> Enriching Details...
                </span>
              ) : !job.isFullDescriptionFetched ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800/40 border border-slate-700/30 text-slate-400 w-full justify-center" title="Awaiting full details extraction by the background refiner cycle.">
                  ⏳ Queue: Awaiting Details
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/20 border border-emerald-500/10 text-emerald-400 w-full justify-center" title="Full job description and salary details have been successfully retrieved and evaluated.">
                  ✓ Details Enriched
                </span>
              )}
            </div>
          </div>

          {/* Metadata Row with stable slots */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-slate-400 pt-0.5">
            <span className="text-slate-200">{job.company}</span>
            <span className="flex items-center gap-1 font-normal text-slate-500 shrink-0">
              <MapPin className="w-3.5 h-3.5 stroke-[1.5]" /> {job.location || 'Remote / Unknown'}
            </span>

            {/* Stable Compensation Field */}
            <span className="flex items-center gap-1 font-normal text-slate-500 shrink-0">
              <DollarSign className="w-3.5 h-3.5 stroke-[1.5]" />
              {job.salary && job.salary.toLowerCase() !== 'not specified' ? (
                <span className="text-slate-200 font-semibold">{job.salary}</span>
              ) : (job.id === currentlyRefiningJobId || !job.isFullDescriptionFetched) ? (
                <span className="text-slate-600 italic text-[11px] animate-pulse">Checking compensation...</span>
              ) : (
                <span className="text-slate-600 italic text-[11px]">Not specified</span>
              )}
            </span>

            <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-white/5 text-slate-300 text-[10px] shrink-0">
              {job.type} {job.isW2 && '· W2'}
            </span>

            {job.sourceTag && (
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider shrink-0 ${
                job.sourceTag === 'hackernews' ? 'bg-orange-950/45 border-orange-500/20 text-orange-400' :
                job.sourceTag === 'remotive' ? 'bg-purple-950/45 border-purple-500/20 text-purple-400' :
                job.sourceTag === 'remoteok' ? 'bg-pink-950/45 border-pink-500/20 text-pink-400' :
                job.sourceTag === 'greenhouse' ? 'bg-emerald-950/45 border-emerald-500/20 text-emerald-400' :
                job.sourceTag === 'lever' ? 'bg-teal-950/45 border-teal-500/20 text-teal-400' :
                job.sourceTag === 'ashby' ? 'bg-cyan-950/45 border-cyan-500/20 text-cyan-400' :
                job.sourceTag === 'workday' ? 'bg-blue-950/45 border-blue-500/20 text-blue-455' :
                job.sourceTag === 'smartrecruiters' ? 'bg-violet-950/45 border-violet-500/20 text-violet-400' :
                'bg-slate-900 border-white/5 text-slate-300'
              }`}>
                {job.sourceTag === 'hackernews' ? 'Hacker News' : job.sourceTag}
              </span>
            )}

            {job.retryTier !== undefined && job.retryTier >= 1 && (
              <span
                className="px-2 py-0.5 rounded-md bg-amber-950/40 border border-amber-500/20 text-amber-400 text-[10px] font-semibold flex items-center gap-1 cursor-help shrink-0"
                title={`This job was evaluated with reduced context (Tier ${job.retryTier}) due to local LLM processing timeout. Match score may be less precise.`}
              >
                <span>⚠️</span> Reduced Context
              </span>
            )}
          </div>

          {job.url && (
            <div className="flex items-center flex-wrap gap-1.5 text-xs text-slate-455 mt-1 font-mono">
              <div className="relative group flex items-center">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 hover:underline truncate block max-w-[160px] sm:max-w-[240px]"
                >
                  {job.url}
                </a>
                <div className="absolute left-0 bottom-full mb-2 opacity-0 translate-y-1 scale-95 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-200 w-max max-w-[280px] sm:max-w-[380px] bg-slate-950/95 border border-white/10 text-slate-200 p-2.5 rounded-xl text-[10px] sm:text-xs z-50 font-mono shadow-2xl backdrop-blur-sm break-all">
                  <div className="font-semibold text-indigo-400 mb-0.5">Full URL:</div>
                  {job.url}
                </div>
              </div>
              <button
                onClick={(e) => handleCopyLink(e, job.url)}
                className="p-0.5 rounded hover:bg-white/5 text-slate-555 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
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

          {/* Stable Description layout (skeleton fallback when loading) */}
          <div className="h-[40px] overflow-hidden mt-1">
            {job.description ? (
              <p className="text-sm text-slate-350 leading-snug font-sans line-clamp-2">
                {job.description}
              </p>
            ) : (job.id === currentlyRefiningJobId || !job.isFullDescriptionFetched) ? (
              <div className="space-y-1.5 py-1">
                <div className="h-3 w-[92%] bg-white/5 rounded-md animate-pulse" />
                <div className="h-3 w-[78%] bg-white/5 rounded-md animate-pulse" />
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No description details available</p>
            )}
          </div>

          {/* Stable Skills layout (skeleton fallback when loading) */}
          <div className="min-h-[24px] flex items-center mt-1">
            {job.skillsRequired && job.skillsRequired.length > 0 ? (
              <div className="flex flex-wrap gap-1 max-h-[24px] overflow-hidden">
                {job.skillsRequired.map((s, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 bg-slate-900/60 text-slate-400 rounded border border-white/5 font-mono whitespace-nowrap">
                    {s}
                  </span>
                ))}
              </div>
            ) : (job.id === currentlyRefiningJobId || !job.isFullDescriptionFetched) ? (
              <div className="flex gap-1.5 animate-pulse">
                <div className="h-5 w-14 bg-white/5 rounded-md" />
                <div className="h-5 w-20 bg-white/5 rounded-md" />
                <div className="h-5 w-12 bg-white/5 rounded-md" />
              </div>
            ) : (
              <span className="text-[10px] text-slate-500/80 italic font-medium">No skills specified</span>
            )}
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 text-right">
          <span className="text-[10px] text-slate-500 font-medium font-mono" title="Original posting date">
            Posted: {formatTimestamp(job.postedAt)}
          </span>
          {job.scannedAt && (
            <span className="text-[10px] text-indigo-400 font-semibold font-mono" title="Time when this agent discovered the job">
              Found: {new Date(job.scannedAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
            </span>
          )}
          <div className="flex gap-1">
            <button
              onClick={() => onBlockCompany(job.company)}
              className="p-1.5 rounded-lg hover:bg-red-950/30 text-slate-555 hover:text-red-455 transition-colors mt-1 cursor-pointer"
              title={`Block all jobs from ${job.company}`}
            >
              <Ban className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={() => onDismissJob(job.id)}
              className="p-1.5 rounded-lg hover:bg-rose-950/30 text-slate-555 hover:text-rose-455 transition-colors mt-1 cursor-pointer"
              title="Dismiss Job Listing"
            >
              <Trash2 className="w-4.5 h-4.5" />
            </button>
          </div>
          {!job.isDuplicate && (
            <button
              onClick={() => onSaveToTracker(job, customNote)}
              className="mt-1.5 px-3 py-1.5 rounded-xl bg-indigo-650 hover:bg-indigo-700 text-white font-semibold text-[10px] transition-all shadow-md shadow-indigo-500/10 flex items-center gap-1 cursor-pointer justify-center"
            >
              <FileCheck className="w-3.5 h-3.5" /> Log Applied
            </button>
          )}
        </div>
      </div>

      {/* Expanded Matching Details & Actions */}
      {isExpanded && (
        <div className="px-5 pb-5 border-t border-white/5 pt-4 bg-slate-900/30 space-y-4">
          {job.description && (
            <div className="p-3.5 bg-slate-900/80 border border-white/10 rounded-xl space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-indigo-400 flex items-center gap-1.5 font-display">
                <Briefcase className="w-3.5 h-3.5 text-indigo-400" /> Full Position Description
              </span>
              <p className="text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap">{job.description}</p>
            </div>
          )}

          {job.matchReason && (
            <div className="p-3.5 bg-slate-900/80 border border-white/10 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-455 flex items-center gap-1.5 font-display">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Grounded Agent Score Matching Reason
              </span>
              <p className="text-xs text-slate-300 leading-normal font-sans">{job.matchReason}</p>
            </div>
          )}

          {!job.isDuplicate && (
            <div className="pt-2 border-t border-white/5 space-y-1.5">
              <label className="text-[10px] uppercase font-semibold text-slate-455 flex items-center gap-1 leading-none">
                <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
                Custom Discovery Notes
              </label>
              <input
                type="text"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="Add custom notes (e.g. key requirements, referral contact, referral notes) before saving..."
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-white/10 bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white placeholder-slate-650"
              />
            </div>
          )}
        </div>
      )}

      {/* Bottom Expand Toggle Bar */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-2.5 bg-slate-900/20 hover:bg-slate-900/60 text-slate-400 hover:text-slate-200 text-[11px] font-bold border-t border-white/5 flex items-center justify-center gap-1.5 transition-colors cursor-pointer rounded-b-2xl"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="w-4 h-4" /> Collapse Match Details
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" /> Expand Details & Match Reasoning
          </>
        )}
      </button>
    </div>
  );
}
