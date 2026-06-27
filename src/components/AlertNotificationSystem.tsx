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
        className={`relative p-3 border-2 transition-all cursor-pointer font-headline font-bold uppercase tracking-widest ${
          isOpen
            ? 'bg-primary border-black text-on-primary neo-shadow'
            : 'bg-surface-container-lowest border-outline-variant text-on-surface hover:bg-surface-container hover:border-primary'
        }`}
        title="Automated Job Alerts Tracker"
      >
        <Bell className={`w-6 h-6 ${unreadCount > 0 ? 'animate-swing' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center bg-error text-[10px] font-headline font-extrabold text-on-error border-2 border-black neo-shadow-sm z-10">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Floating Alerts Slide Over / Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-4 w-[340px] sm:w-[420px] bg-surface border-4 border-primary neo-shadow-primary z-50 p-6 shrink-0 transition-all animate-bounce-in max-h-[500px] overflow-y-auto" id="alerts-dropdown-panel">
            <div className="flex items-center justify-between pb-4 border-b-2 border-primary mb-4 font-body">
              <div className="flex items-center gap-3 font-headline font-extrabold text-primary text-base uppercase tracking-widest">
                <Bell className="w-5 h-5 text-primary" />
                <span>Alerts</span>
                {unreadCount > 0 && (
                  <span className="px-2 py-1 bg-error-container border-2 border-error text-error text-[10px] font-headline font-extrabold uppercase">
                    {unreadCount} New
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                {alerts.length > 0 && (
                  <button
                    onClick={onClearAlerts}
                    className="text-xs text-on-surface-variant hover:text-error flex items-center gap-1.5 font-headline font-extrabold uppercase tracking-widest transition-colors cursor-pointer"
                    title="Clear history"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="text-outline hover:text-on-surface cursor-pointer">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {alerts.length === 0 ? (
              <div className="py-12 text-center text-on-surface-variant font-body">
                <div className="w-16 h-16 bg-surface-container-lowest flex items-center justify-center mx-auto mb-4 border-2 border-outline-variant neo-shadow-sm">
                  <Bell className="w-8 h-8 text-outline" />
                </div>
                <p className="text-sm font-headline font-extrabold text-on-surface uppercase tracking-widest">No alerts received yet.</p>
                <p className="text-xs text-on-surface-variant mt-2 font-headline font-bold uppercase tracking-wider">Initiate an LLM job scan to discover matches.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
                {alerts.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => {
                      onSelectJob(a.jobId);
                      onMarkAsRead(a.id);
                      setIsOpen(false);
                    }}
                    className={`p-4 border-2 text-left cursor-pointer transition-all flex items-start gap-4 neo-shadow-sm hover:translate-x-[2px] hover:-translate-y-[2px] ${
                      a.isRead
                        ? 'bg-surface-container-lowest border-outline-variant text-on-surface-variant hover:border-outline'
                        : 'bg-primary-container border-primary text-on-primary-container hover:bg-surface'
                    }`}
                  >
                    <div className="mt-1 shrink-0">
                      <div className={`w-3 h-3 border-2 border-black ${a.isRead ? 'bg-outline-variant' : 'bg-primary animate-pulse'}`} />
                    </div>
                    
                    <div className="flex-1 space-y-1 min-w-0 font-body">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-headline font-bold uppercase tracking-widest truncate block ${a.isRead ? 'text-on-surface' : 'text-primary'}`}>
                          {a.title}
                        </span>
                        <span className={`text-[10px] font-headline font-extrabold px-2 py-1 uppercase tracking-widest border-2 shrink-0 ${
                          a.matchScore >= 80 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500' :
                          a.matchScore >= 60 ? 'bg-primary/10 text-primary border-primary' :
                          'bg-error-container text-error border-error'
                        }`}>
                          {a.matchScore}%
                        </span>
                      </div>
                      <span className="text-xs font-headline font-bold uppercase tracking-wider text-on-surface-variant truncate block">
                        {a.company}
                      </span>
                      <div className="flex items-center justify-between text-[10px] text-on-surface-variant font-headline font-bold mt-2 pt-2 border-t-2 border-outline-variant uppercase tracking-widest">
                        <span>{new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {!a.isRead && (
                          <span className="text-primary font-extrabold hover:text-primary-variant underline decoration-2 underline-offset-2">
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
