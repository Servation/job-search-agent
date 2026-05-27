/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Bell, Sparkles, X, Check, Trash2 } from 'lucide-react';
import { JobAlert } from '../types';

interface AlertNotificationSystemProps {
  alerts: JobAlert[];
  onMarkAsRead: (id: string) => void;
  onClearAlerts: () => void;
  onSelectJob: (jobId: string) => void;
}

export default function AlertNotificationSystem({
  alerts,
  onMarkAsRead,
  onClearAlerts,
  onSelectJob,
}: AlertNotificationSystemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = alerts.filter((a) => !a.isRead).length;

  return (
    <div className="relative inline-block animate-fade-in" id="alert-system-widget">
      {/* Visual Indicator Bell Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2.5 rounded-xl border transition-all cursor-pointer ${
          isOpen
            ? 'bg-indigo-600 border-indigo-550 text-white shadow-lg shadow-indigo-550/20'
            : 'bg-slate-900/50 border-white/10 text-slate-300 hover:bg-slate-850'
        }`}
        title="Automated Job Alerts Tracker"
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'animate-swing' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-slate-950">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Floating Alerts Slide Over / Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-3 w-80 sm:w-96 sleek-card-darker rounded-2xl border border-white/15 shadow-2xl z-50 p-4 shrink-0 transition-all animate-bounce-in max-h-[480px] overflow-y-auto" id="alerts-dropdown-panel">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 font-sans">
              <div className="flex items-center gap-1.5 font-semibold text-white text-sm font-display">
                <Bell className="w-4 h-4 text-indigo-400" />
                <span>Automated Finding Alerts</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-rose-955/50 border border-rose-500/20 text-rose-300 rounded text-[10px] font-bold font-mono">
                    {unreadCount} New
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {alerts.length > 0 && (
                  <button
                    onClick={onClearAlerts}
                    className="text-xs text-slate-450 hover:text-rose-400 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
                    title="Clear history"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {alerts.length === 0 ? (
              <div className="py-12 text-center text-slate-500 font-sans">
                <div className="w-12 h-12 rounded-full bg-slate-950 flex items-center justify-center mx-auto mb-3 border border-white/5">
                  <Bell className="w-5 h-5 text-slate-600" />
                </div>
                <p className="text-xs font-semibold text-slate-400">No alerts received yet.</p>
                <p className="text-[10px] text-slate-500 mt-1">Initiate an LLM job scan to discover matches.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => {
                      onSelectJob(a.jobId);
                      onMarkAsRead(a.id);
                      setIsOpen(false);
                    }}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-2.5 ${
                      a.isRead
                        ? 'bg-slate-900/40 border-white/5 text-slate-400 hover:bg-slate-900/60'
                        : 'bg-indigo-950/25 border-indigo-500/30 text-white ring-2 ring-indigo-500/5 hover:bg-indigo-950/40'
                    }`}
                  >
                    <div className="mt-1 shrink-0">
                      <div className={`w-2 h-2 rounded-full ${a.isRead ? 'bg-slate-700' : 'bg-indigo-400 animate-pulse'}`} />
                    </div>
                    
                    <div className="flex-1 space-y-0.5 min-w-0 font-sans">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-bold text-white truncate block">
                          {a.title}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-500/15 shrink-0">
                          {a.matchScore}%
                        </span>
                      </div>
                      <span className="text-[11px] font-medium text-slate-400 truncate block">
                        {a.company}
                      </span>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-1 pt-1 border-t border-white/5">
                        <span>{new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {!a.isRead && (
                          <span className="text-indigo-400 font-semibold hover:underline">
                            View Position
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
