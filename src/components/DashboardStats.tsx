import React from 'react';
import { Briefcase, Gift, History, Percent } from 'lucide-react';
import { Job, JobStatusType } from '../types';

interface DashboardStatsProps {
  jobs: Job[];
  stats: {
    totalScanned: number;
    duplicatesPrevented: number;
    activeMatchesCount: number;
  };
}

export default function DashboardStats({ jobs, stats }: DashboardStatsProps) {
  // Aggregate jobs by status
  const getCountByStatus = (status: JobStatusType): number => {
    return jobs.filter((j) => j.status === status).length;
  };

  const statusCounts = {
    discovered: getCountByStatus('discovered'),
    applied: getCountByStatus('applied'),
    review: getCountByStatus('review'),
    interviewing: getCountByStatus('interviewing'),
    offered: getCountByStatus('offered'),
    rejected: getCountByStatus('rejected'),
  };

  const appliedCount = statusCounts.applied + statusCounts.review + statusCounts.interviewing + statusCounts.offered + statusCounts.rejected;
  
  // Calculate Rates
  const interviewRate = appliedCount > 0 
    ? Math.round(((statusCounts.interviewing + statusCounts.offered) / appliedCount) * 100) 
    : 0;

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
          <div className="w-12 h-12 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Percent className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">Interview Rate</span>
            <span className="text-2xl font-bold text-emerald-400 tracking-tight">{interviewRate}%</span>
          </div>
        </div>

        <div className="sleek-card rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-center justify-center text-indigo-405 text-indigo-400 shrink-0">
            <Gift className="w-6 h-6 animate-bounce" style={{ animationDuration: '4s' }} />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">Offered Positions</span>
            <span className="text-2xl font-bold text-indigo-455 text-indigo-400 tracking-tight">{statusCounts.offered}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
