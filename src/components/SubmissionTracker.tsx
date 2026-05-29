/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FileCheck, Search, Plus, X, AlertCircle } from 'lucide-react';
import { Job, JobStatusType } from '../types';

// Import subcomponents
import TrackedJobCard, { statuses } from './SubmissionTracker/TrackedJobCard';
import ManualAddForm from './SubmissionTracker/ManualAddForm';

interface SubmissionTrackerProps {
  jobs: Job[];
  onUpdateJobStatus: (id: string, status: JobStatusType, notes?: string) => void;
  onRemoveJob: (id: string) => void;
  onAddJobs: (jobs: Job[]) => void;
  onUpdateJobDetails: (id: string, updatedFields: Partial<Job>) => void;
}

export default function SubmissionTracker({
  jobs,
  onUpdateJobStatus,
  onRemoveJob,
  onAddJobs,
  onUpdateJobDetails,
}: SubmissionTrackerProps) {
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'company' | 'title' | 'score' | 'date' | 'status'>('company');
  const [showAddForm, setShowAddForm] = useState(false);

  const filteredJobs = jobs.filter((j) => {
    const matchesSearch = 
      j.title.toLowerCase().includes(filterSearch.toLowerCase()) || 
      j.company.toLowerCase().includes(filterSearch.toLowerCase());
    const matchesStatus = filterStatus === 'all' || j.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    let result = 0;
    if (sortBy === 'company') {
      result = a.company.localeCompare(b.company);
    } else if (sortBy === 'title') {
      result = a.title.localeCompare(b.title);
    } else if (sortBy === 'score') {
      result = b.matchScore - a.matchScore;
    } else if (sortBy === 'date') {
      const dateA = a.appliedDate ? new Date(a.appliedDate).getTime() : 0;
      const dateB = b.appliedDate ? new Date(b.appliedDate).getTime() : 0;
      result = dateB - dateA;
    } else if (sortBy === 'status') {
      const statusOrder: Record<string, number> = {
        offered: 0,
        interviewing: 1,
        review: 2,
        applied: 3,
        discovered: 4,
        rejected: 5,
      };
      const orderA = statusOrder[a.status] ?? 99;
      const orderB = statusOrder[b.status] ?? 99;
      if (orderA !== orderB) {
        result = orderA - orderB;
      } else {
        result = a.company.localeCompare(b.company);
      }
    }

    if (result === 0) {
      return a.id.localeCompare(b.id);
    }
    return result;
  });

  const handleAddManualJob = (job: Job) => {
    onAddJobs([job]);
  };

  return (
    <div className="sleek-card rounded-2xl border border-white/10 shadow-lg p-6 sm:p-8 space-y-6" id="submission-tracker-board">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2 font-display">
            <FileCheck className="w-5 h-5 text-indigo-400" />
            Submission Tracker
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Track and update submission pipelines. Prevent applying to identical openings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-900 text-indigo-400 rounded-lg border border-white/5 font-mono">
            Pipeline Volume: {jobs.length} Active Positions
          </span>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/25 text-indigo-300 transition-colors cursor-pointer"
          >
            {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showAddForm ? 'Cancel' : 'Add Manually'}
          </button>
        </div>
      </div>

      {/* Manual Add Form */}
      {showAddForm && (
        <ManualAddForm
          onAddJob={handleAddManualJob}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {/* Filter and search control bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-grow">
          <Search className="w-4 h-4 text-slate-455 absolute left-3.5 top-3" />
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Search saved positions by title or company name..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-900/30 text-white placeholder-slate-655"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 text-sm rounded-xl border border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-900 text-slate-200 font-semibold shrink-0 cursor-pointer"
        >
          <option value="all" className="bg-slate-950">Display All Statuses</option>
          {statuses.map((s) => (
            <option key={s.value} value={s.value} className="bg-slate-950">Filter: {s.label}</option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-4 py-2 text-sm rounded-xl border border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-900 text-slate-200 font-semibold shrink-0 cursor-pointer"
        >
          <option value="company" className="bg-slate-950">Sort: Company Name</option>
          <option value="title" className="bg-slate-950">Sort: Job Title</option>
          <option value="score" className="bg-slate-950">Sort: Match Score</option>
          <option value="date" className="bg-slate-950">Sort: Date Applied</option>
          <option value="status" className="bg-slate-950">Sort: Stage Progress</option>
        </select>
      </div>

      {sortedJobs.length === 0 ? (
        <div className="py-16 text-center text-slate-400 border border-dashed border-white/10 rounded-2xl">
          <AlertCircle className="w-10 h-10 text-slate-550 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">No saved submissions tracked with current parameters.</p>
          <p className="text-xs text-slate-500 mt-1">Trigger a Daily Scan and click &quot;Save &amp; Log Submission&quot; to log items here, or use &quot;Add Manually&quot; above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="submission-pipeline-cards">
          {sortedJobs.map((j) => (
            <TrackedJobCard
              key={j.id}
              job={j}
              onUpdateJobStatus={onUpdateJobStatus}
              onRemoveJob={onRemoveJob}
              onUpdateJobDetails={onUpdateJobDetails}
            />
          ))}
        </div>
      )}
    </div>
  );
}
