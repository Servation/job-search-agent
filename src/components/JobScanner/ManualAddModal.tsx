/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, FileSpreadsheet } from 'lucide-react';
import { Job, JobTypeType } from '../../types';

interface ManualAddModalProps {
  onClose: () => void;
  onAddJob: (job: Job) => void;
  savedJobs: Job[];
}

export default function ManualAddModal({
  onClose,
  onAddJob,
  savedJobs
}: ManualAddModalProps) {
  const [manualForm, setManualForm] = useState({
    title: '',
    company: '',
    location: 'Remote',
    salary: 'Not Specified',
    type: 'Full-Time' as JobTypeType,
    isW2: true,
    description: '',
    url: '',
  });

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const manualJob: Job = {
      id: `manual-add-${Date.now()}`,
      title: manualForm.title,
      company: manualForm.company,
      location: manualForm.location,
      salary: manualForm.salary,
      type: manualForm.type,
      isW2: manualForm.isW2,
      description: manualForm.description,
      url: manualForm.url || '#',
      postedAt: 'Just now',
      matchScore: 95,
      matchReason: 'Manually logged position.',
      isDuplicate: savedJobs.some(s =>
        s.title.toLowerCase() === manualForm.title.toLowerCase() &&
        s.company.toLowerCase() === manualForm.company.toLowerCase()
      ),
      status: 'applied',
      appliedDate: new Date().toISOString(),
      scannedAt: new Date().toISOString(),
      isUrlVerified: true
    };

    onAddJob(manualJob);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="sleek-card-darker rounded-2xl border border-white/10 shadow-2xl max-w-lg w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
        >
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-base font-bold text-white mb-4 flex items-center gap-1.5 font-display">
          <FileSpreadsheet className="w-5 h-5 text-indigo-400" /> Log Position into Tracker
        </h3>
        <form onSubmit={handleManualAdd} className="space-y-4 text-left font-sans">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-450 mb-1">Company</label>
              <input
                type="text"
                required
                value={manualForm.company}
                onChange={(e) => setManualForm({ ...manualForm, company: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                placeholder="Stripe"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-455 mb-1">Title</label>
              <input
                type="text"
                required
                value={manualForm.title}
                onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                placeholder="Frontend Engineer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-450 mb-1">Location</label>
              <input
                type="text"
                value={manualForm.location}
                onChange={(e) => setManualForm({ ...manualForm, location: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                placeholder="Remote/NYC"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-450 mb-1">Compensation</label>
              <input
                type="text"
                value={manualForm.salary}
                onChange={(e) => setManualForm({ ...manualForm, salary: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                placeholder="e.g. $120k or $90/hr"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-450 mb-1">Contract Schema</label>
              <select
                value={manualForm.type}
                onChange={(e) => setManualForm({ ...manualForm, type: e.target.value as any })}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900 border border-white/10 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="Full-Time" className="bg-slate-955">Full-Time</option>
                <option value="Contract" className="bg-slate-955">Contract</option>
                <option value="Part-Time" className="bg-slate-955">Part-Time</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="manual-w2"
                checked={manualForm.isW2}
                onChange={(e) => setManualForm({ ...manualForm, isW2: e.target.checked })}
                className="w-4 h-4 accent-indigo-600 rounded bg-slate-900 border-white/10"
              />
              <label htmlFor="manual-w2" className="text-xs font-semibold text-slate-400 select-none cursor-pointer">
                W2 structure setup
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-450 mb-1">Application URL</label>
            <input
              type="url"
              value={manualForm.url}
              onChange={(e) => setManualForm({ ...manualForm, url: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-450 mb-1">Short Description</label>
            <textarea
              value={manualForm.description}
              onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
              className="w-full h-20 px-3 py-2 text-sm rounded-lg bg-slate-900/60 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none placeholder-slate-650"
              placeholder="Core tech required..."
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-indigo-650 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/10"
          >
            Log to Pipeline
          </button>
        </form>
      </div>
    </div>
  );
}
