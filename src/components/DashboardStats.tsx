import React from 'react';
import { Briefcase, History, Sparkles, Globe } from 'lucide-react';
import { AgentStats } from '../types';

interface DashboardStatsProps {
  stats: AgentStats;
}

export default function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <div className="space-y-6" id="dashboard-stats-main">
      {/* Prime Stats Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6" id="essential-metrics-grid">
        <div className="bg-surface border-4 border-outline-variant p-6 flex flex-col justify-between gap-4 neo-shadow-sm hover:border-primary hover:translate-x-[2px] hover:-translate-y-[2px] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-sm font-headline font-extrabold uppercase tracking-widest text-on-surface-variant block">Scanned Positions</span>
            <div className="w-10 h-10 bg-surface-container-lowest border-2 border-outline-variant flex items-center justify-center text-on-surface-variant shrink-0">
              <Briefcase className="w-5 h-5" />
            </div>
          </div>
          <span className="text-4xl font-headline font-bold text-on-surface tracking-tight">{stats.totalScanned}</span>
        </div>

        <div className="bg-surface border-4 border-outline-variant p-6 flex flex-col justify-between gap-4 neo-shadow-sm hover:border-error hover:translate-x-[2px] hover:-translate-y-[2px] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-sm font-headline font-extrabold uppercase tracking-widest text-on-surface-variant block">Duplicates Prevented</span>
            <div className="w-10 h-10 bg-error-container border-2 border-error flex items-center justify-center text-error shrink-0">
              <History className="w-5 h-5 animate-pulse" style={{ animationDuration: '3s' }} />
            </div>
          </div>
          <span className="text-4xl font-headline font-bold text-on-surface tracking-tight">{stats.duplicatesPrevented}</span>
        </div>

        <div className="bg-surface border-4 border-outline-variant p-6 flex flex-col justify-between gap-4 neo-shadow-sm hover:border-primary-variant hover:translate-x-[2px] hover:-translate-y-[2px] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-sm font-headline font-extrabold uppercase tracking-widest text-on-surface-variant block">LLM Evaluations</span>
            <div className="w-10 h-10 bg-primary/20 border-2 border-primary-variant flex items-center justify-center text-primary-variant shrink-0">
              <Sparkles className="w-5 h-5 animate-pulse" style={{ animationDuration: '3s' }} />
            </div>
          </div>
          <span className="text-4xl font-headline font-bold text-primary-variant tracking-tight">{stats.llmEvaluations}</span>
        </div>

        <div className="bg-surface border-4 border-outline-variant p-6 flex flex-col justify-between gap-4 neo-shadow-sm hover:border-emerald-500 hover:translate-x-[2px] hover:-translate-y-[2px] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-sm font-headline font-extrabold uppercase tracking-widest text-on-surface-variant block">Sourced Postings</span>
            <div className="w-10 h-10 bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center text-emerald-500 shrink-0">
              <Globe className="w-5 h-5" />
            </div>
          </div>
          <span className="text-4xl font-headline font-bold text-emerald-500 tracking-tight">{stats.totalSourced}</span>
        </div>
      </div>
    </div>
  );
}
