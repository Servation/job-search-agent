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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="essential-metrics-grid">
        <div className="sleek-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-800/40 border border-white/5 flex items-center justify-center text-slate-300 shrink-0">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">Scanned Positions</span>
            <span className="text-2xl font-bold text-white tracking-tight">{stats.totalScanned}</span>
          </div>
        </div>

        <div className="sleek-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-950/20 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
            <History className="w-6 h-6 animate-pulse" style={{ animationDuration: '3s' }} />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">Duplicates Prevented</span>
            <span className="text-2xl font-bold text-white tracking-tight">{stats.duplicatesPrevented}</span>
          </div>
        </div>

        <div className="sleek-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-950/20 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
            <Sparkles className="w-6 h-6 animate-pulse" style={{ animationDuration: '3s' }} />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">LLM Evaluations</span>
            <span className="text-2xl font-bold text-violet-400 tracking-tight">{stats.llmEvaluations}</span>
          </div>
        </div>

        <div className="sleek-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">Sourced Postings</span>
            <span className="text-2xl font-bold text-emerald-400 tracking-tight">{stats.totalSourced}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
