/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Check,
  ExternalLink,
  FileCheck,
  AlertTriangle,
  Trash2,
  Copy
} from 'lucide-react';
import { Job } from '../../types';

interface WatchlistPanelProps {
  watchlist: Job[];
  onRemoveFromWatchlist: (id: string) => void;
  onSaveToTracker: (job: Job) => void;
}

function WatchlistCard({
  wJob,
  onRemoveFromWatchlist,
  onSaveToTracker
}: {
  key?: string;
  wJob: Job;
  onRemoveFromWatchlist: (id: string) => void;
  onSaveToTracker: (job: Job) => void;
}) {
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

  return (
    <div className="p-4 rounded-xl bg-slate-900/80 border border-white/5 shadow-md hover:border-indigo-500/10 transition-all flex flex-col justify-between space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-950 text-slate-400 font-mono">
              {wJob.type}
            </span>
            {wJob.isUrlVerified ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 shrink-0">
                <Check className="w-2.5 h-2.5 text-emerald-455" /> Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-950/45 border border-amber-500/20 text-amber-400 shrink-0">
                <AlertTriangle className="w-2.5 h-2.5 text-amber-455" /> Unverified
              </span>
            )}
          </div>
          <button
            onClick={() => onRemoveFromWatchlist(wJob.id)}
            className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-rose-455 transition-colors"
            title="Remove from Watchlist"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <h4 className="text-sm font-bold text-white tracking-tight">{wJob.title}</h4>
        <p className="text-xs text-slate-400 font-semibold">{wJob.company} · <span className="text-slate-500 font-normal">{wJob.location}</span></p>
        {wJob.url && (
          <div className="flex items-center flex-wrap gap-1.5 text-[10px] text-slate-500 mt-0.5 font-mono">
            <div className="relative group flex items-center">
              <a
                href={wJob.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 hover:underline truncate block max-w-[140px] sm:max-w-[200px]"
              >
                {wJob.url}
              </a>
              <div className="absolute left-0 bottom-full mb-2 opacity-0 translate-y-1 scale-95 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-200 w-max max-w-[280px] sm:max-w-[380px] bg-slate-950/95 border border-white/10 text-slate-200 p-2.5 rounded-xl text-[10px] z-50 font-mono shadow-2xl backdrop-blur-sm break-all">
                <div className="font-semibold text-indigo-400 mb-0.5">Full URL:</div>
                {wJob.url}
              </div>
            </div>
            <button
              onClick={() => handleCopyLink(wJob.url)}
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
        {wJob.salary && <p className="text-[11px] text-slate-505 font-mono">{wJob.salary}</p>}
        <p className="text-xs text-slate-355 line-clamp-2 leading-relaxed">{wJob.description}</p>
      </div>

      <div className="flex gap-2 pt-1 border-t border-white/5">
        <a
          href={wJob.url}
          target="_blank"
          referrerPolicy="no-referrer"
          className="flex-1 text-center py-2 rounded-lg bg-slate-950 text-slate-300 font-bold text-xs hover:text-white transition-colors flex items-center justify-center gap-1 border border-white/5"
        >
          <ExternalLink className="w-3 h-3" /> View Posting
        </a>
        <button
          onClick={() => onSaveToTracker(wJob)}
          className="flex-1 py-2 rounded-lg bg-indigo-650 hover:bg-indigo-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-1"
        >
          <FileCheck className="w-3.5 h-3.5" /> Log Applied
        </button>
      </div>
    </div>
  );
}

export default function WatchlistPanel({
  watchlist,
  onRemoveFromWatchlist,
  onSaveToTracker
}: WatchlistPanelProps) {
  return (
    <div className="space-y-4 p-5 rounded-2xl border border-dashed border-indigo-500/20 bg-indigo-950/5" id="personal-watchlist-panel">
      <div className="flex justify-between items-center px-1">
        <span className="text-xs uppercase font-bold tracking-wider text-indigo-400 font-display flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span> My Saved Watchlist ({watchlist.length} Jobs Ready to Decipher)
        </span>
        <span className="text-xs text-indigo-350/80 font-mono">Review & apply at your own pace</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...watchlist]
          .sort((a, b) => {
            const dateA = a.scannedAt ? new Date(a.scannedAt).getTime() : 0;
            const dateB = b.scannedAt ? new Date(b.scannedAt).getTime() : 0;
            if (dateB !== dateA) {
              return dateB - dateA;
            }
            return b.id.localeCompare(a.id);
          })
          .map((wJob) => (
            <WatchlistCard
              key={wJob.id}
              wJob={wJob}
              onRemoveFromWatchlist={onRemoveFromWatchlist}
              onSaveToTracker={onSaveToTracker}
            />
          ))}
      </div>
    </div>
  );
}
