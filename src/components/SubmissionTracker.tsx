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
    <section className="space-y-8" id="submission-tracker-board">
      <div className="bg-surface border-2 border-outline-variant p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 neo-shadow">
        <div>
          <h2 className="text-2xl font-headline font-bold text-primary flex items-center gap-3 uppercase tracking-widest">
            <div className="p-2 bg-primary text-on-primary border-2 border-black neo-shadow-primary">
              <FileCheck className="w-6 h-6" />
            </div>
            Submission Tracker
          </h2>
          <p className="text-sm font-headline font-bold text-on-surface-variant mt-2 uppercase tracking-widest">
            Track and update submission pipelines. Prevent applying to identical openings.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <span className="text-sm font-headline font-extrabold uppercase tracking-widest px-4 py-2 bg-surface-container border-2 border-outline-variant text-on-surface text-center">
            Pipeline Volume: {jobs.length} Active
          </span>
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="flex items-center justify-center gap-2 text-sm font-headline font-extrabold uppercase tracking-widest px-6 py-3 bg-primary text-on-primary border-2 border-black hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer neo-shadow"
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
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
      <div className="bg-surface-container-lowest border-2 border-outline-variant p-4 flex flex-col sm:flex-row gap-4 neo-shadow-sm">
        <div className="relative flex-grow">
          <Search className="w-5 h-5 text-outline absolute left-4 top-3.5" />
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Search saved positions by title or company name..."
            className="w-full pl-12 pr-4 py-3 text-sm border-2 border-outline-variant focus:outline-none focus:border-primary bg-surface text-on-surface placeholder:text-outline font-headline font-bold uppercase tracking-wider"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-3 text-sm border-2 border-outline-variant focus:outline-none focus:border-primary bg-surface text-on-surface font-headline font-extrabold uppercase tracking-widest shrink-0 cursor-pointer"
        >
          <option value="all" className="font-bold">Display All Statuses</option>
          {statuses.map((s) => (
            <option key={s.value} value={s.value} className="font-bold">Filter: {s.label}</option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="px-4 py-3 text-sm border-2 border-outline-variant focus:outline-none focus:border-primary bg-surface text-on-surface font-headline font-extrabold uppercase tracking-widest shrink-0 cursor-pointer"
        >
          <option value="company" className="font-bold">Sort: Company Name</option>
          <option value="title" className="font-bold">Sort: Job Title</option>
          <option value="score" className="font-bold">Sort: Match Score</option>
          <option value="date" className="font-bold">Sort: Date Applied</option>
          <option value="status" className="font-bold">Sort: Stage Progress</option>
        </select>
      </div>

      {sortedJobs.length === 0 ? (
        <div className="py-16 text-center bg-surface-container-lowest border-2 border-dashed border-outline-variant">
          <AlertCircle className="w-12 h-12 text-outline mx-auto mb-4" />
          <p className="text-base font-headline font-extrabold text-on-surface uppercase tracking-widest mb-2">No saved submissions tracked with current parameters.</p>
          <p className="text-sm font-headline font-bold text-on-surface-variant uppercase tracking-wider">Trigger a Daily Scan and click "Save &amp; Log Submission" to log items here, or use "Add Manually" above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="submission-pipeline-cards">
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
    </section>
  );
}
