/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { Briefcase, FileCheck, PhoneCall, Gift, Ban, History, Percent } from 'lucide-react';
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

  const totalSaved = jobs.length;
  const appliedCount = statusCounts.applied + statusCounts.review + statusCounts.interviewing + statusCounts.offered + statusCounts.rejected;
  
  // Calculate Rates
  const interviewRate = appliedCount > 0 
    ? Math.round(((statusCounts.interviewing + statusCounts.offered) / appliedCount) * 100) 
    : 0;
    
  const successRate = appliedCount > 0
    ? Math.round((statusCounts.offered / appliedCount) * 100)
    : 0;

  // Aggregate job types (FT vs Contract vs Part-Time)
  const ftCount = jobs.filter(j => j.type === 'Full-Time').length;
  const contractCount = jobs.filter(j => j.type === 'Contract').length;
  const partTimeCount = jobs.filter(j => j.type === 'Part-Time').length;

  const w2Count = jobs.filter(j => j.isW2).length;
  const nonW2Count = jobs.filter(j => !j.isW2 && j.type === 'Contract').length;

  // Setup Recharts Data
  const chartData = [
    { name: 'Applied', count: statusCounts.applied, color: '#6366f1' },
    { name: 'In Review', count: statusCounts.review, color: '#3b82f6' },
    { name: 'Interviewing', count: statusCounts.interviewing, color: '#f59e0b' },
    { name: 'Offered', count: statusCounts.offered, color: '#10b981' },
    { name: 'Rejected', count: statusCounts.rejected, color: '#f43f5e' },
  ];

  const typesData = [
    { label: 'Full-Time', value: ftCount, color: 'bg-indigo-600' },
    { label: 'Contract', value: contractCount, color: 'bg-amber-600' },
    { label: 'Part-Time', value: partTimeCount, color: 'bg-teal-600' },
  ];

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
          <div className="w-12 h-12 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Gift className="w-6 h-6 animate-bounce" style={{ animationDuration: '4s' }} />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">Offered Positions</span>
            <span className="text-2xl font-bold text-indigo-400 tracking-tight">{statusCounts.offered}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recharts - Submission Pipeline */}
        <div className="lg:col-span-2 sleek-card rounded-2xl p-6 flex flex-col justify-between" id="submission-funnel-panel">
          <div>
            <h3 className="font-semibold text-white text-sm mb-1 font-display">Application Submission Status</h3>
            <p className="text-xs text-slate-400 mb-4">Real-time status tracking of save list submissions.</p>
          </div>
          
          <div className="h-56" id="status-bar-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                  contentStyle={{ background: '#0f172a', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  labelStyle={{ color: '#F9FAFB', fontWeight: 'bold', fontSize: '11px' }}
                  itemStyle={{ color: '#94A3B8', fontSize: '11px' }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Position Breakdown Metrics (FT vs Contract) */}
        <div className="sleek-card rounded-2xl p-6 flex flex-col justify-between" id="position-type-stats-panel">
          <div>
            <h3 className="font-semibold text-white text-sm mb-1 font-display">Position Structure Metrics</h3>
            <p className="text-xs text-slate-400 mb-6">Aggregate distribution of position scope in your pipeline.</p>
          </div>

          <div className="space-y-4">
            {typesData.map((t, idx) => {
              const percentage = totalSaved > 0 ? Math.round((t.value / totalSaved) * 100) : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-300">{t.label} ({t.value})</span>
                    <span className="text-slate-500">{percentage}%</span>
                  </div>
                  <div className="w-full bg-slate-900/60 h-2 rounded-full overflow-hidden border border-white/5">
                    <div className={`${t.color} h-full transition-all duration-500`} style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-5 border-t border-white/15 mt-6 grid grid-cols-2 gap-4 text-center">
            <div className="bg-slate-900/45 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block">W2 Positions</span>
              <span className="text-base font-bold text-white mt-1 block">{w2Count}</span>
            </div>
            <div className="bg-slate-900/45 p-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block">C2C/1099 Rates</span>
              <span className="text-base font-bold text-white mt-1 block">{nonW2Count}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
