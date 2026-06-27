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
    <div className="p-6 bg-surface-container border-2 border-outline-variant hover:border-primary transition-all flex flex-col justify-between space-y-4 neo-shadow-sm hover:translate-x-[2px] hover:-translate-y-[2px]">
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-1 bg-surface-container-lowest text-on-surface-variant font-mono font-bold uppercase tracking-widest border-2 border-outline-variant">
              {wJob.type}
            </span>
            {wJob.isUrlVerified ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-headline font-extrabold uppercase tracking-widest bg-emerald-500/10 border-2 border-emerald-500 text-emerald-500 shrink-0">
                <Check className="w-3 h-3 text-emerald-500" /> Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-headline font-extrabold uppercase tracking-widest bg-warning-container border-2 border-warning text-warning shrink-0">
                <AlertTriangle className="w-3 h-3 text-warning" /> Unverified
              </span>
            )}
          </div>
          <button
            onClick={() => onRemoveFromWatchlist(wJob.id)}
            className="p-1.5 border-2 border-transparent hover:border-error hover:bg-error-container text-on-surface-variant hover:text-error transition-colors bg-surface-container-lowest cursor-pointer"
            title="Remove from Watchlist"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <h4 className="text-base font-headline font-bold text-on-surface tracking-tight uppercase">{wJob.title}</h4>
        <p className="text-xs font-headline font-bold text-primary uppercase tracking-widest">{wJob.company} <span className="text-on-surface-variant mx-1">·</span> <span className="text-on-surface-variant font-normal">{wJob.location}</span></p>
        {wJob.url && (
          <div className="flex items-center flex-wrap gap-2 text-[10px] text-on-surface-variant mt-1 font-mono">
            <div className="relative group flex items-center bg-surface-container-lowest border-2 border-outline-variant px-2 py-1">
              <a
                href={wJob.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary-variant hover:underline truncate block max-w-[140px] sm:max-w-[200px] font-bold"
              >
                {wJob.url}
              </a>
              <div className="absolute left-0 bottom-full mb-2 opacity-0 translate-y-1 scale-95 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-200 w-max max-w-[280px] sm:max-w-[380px] bg-surface border-2 border-primary text-on-surface p-3 text-[10px] z-50 font-mono shadow-2xl break-all">
                <div className="font-bold text-primary uppercase tracking-widest mb-1 border-b-2 border-primary pb-1">Full URL:</div>
                {wJob.url}
              </div>
            </div>
            <button
              onClick={() => handleCopyLink(wJob.url)}
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
        {wJob.salary && <p className="text-xs text-on-surface font-mono font-bold mt-1">{wJob.salary}</p>}
        <p className="text-sm text-on-surface-variant line-clamp-2 leading-relaxed font-body mt-2">{wJob.description}</p>
      </div>

      <div className="flex gap-3 pt-3 border-t-2 border-outline-variant">
        <a
          href={wJob.url}
          target="_blank"
          referrerPolicy="no-referrer"
          className="flex-1 text-center py-2 bg-surface-container-lowest text-on-surface font-headline font-extrabold uppercase tracking-widest text-[10px] hover:bg-surface-container transition-colors flex items-center justify-center gap-2 border-2 border-outline-variant"
        >
          <ExternalLink className="w-4 h-4" /> View Posting
        </a>
        <button
          onClick={() => onSaveToTracker(wJob)}
          className="flex-1 py-2 bg-primary hover:bg-primary-variant text-on-primary font-headline font-extrabold uppercase tracking-widest text-[10px] border-2 border-black transition-all flex items-center justify-center gap-2 neo-shadow cursor-pointer"
        >
          <FileCheck className="w-4 h-4" /> Log Applied
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
    <div className="space-y-6 p-6 border-4 border-primary bg-primary-container neo-shadow-primary" id="personal-watchlist-panel">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 px-1">
        <span className="text-sm uppercase font-headline font-bold tracking-widest text-on-primary-container flex items-center gap-2">
          <span className="w-3 h-3 border-2 border-black bg-primary animate-pulse"></span> My Saved Watchlist ({watchlist.length} Jobs Ready to Decipher)
        </span>
        <span className="text-xs text-on-primary-container font-mono font-bold">Review & apply at your own pace</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
