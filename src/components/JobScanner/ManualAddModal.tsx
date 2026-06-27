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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-surface border-4 border-outline-variant neo-shadow max-w-lg w-full p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-surface-container border-2 border-outline-variant hover:border-on-surface text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
        >
          <X className="w-6 h-6" />
        </button>
        <h3 className="text-xl font-headline font-bold text-on-surface mb-6 flex items-center gap-3 uppercase tracking-widest border-b-2 border-outline-variant pb-4">
          <FileSpreadsheet className="w-6 h-6 text-primary" /> Add a Job
        </h3>
        <form onSubmit={handleManualAdd} className="space-y-6 text-left font-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-surface mb-2">Company</label>
              <input
                type="text"
                required
                value={manualForm.company}
                onChange={(e) => setManualForm({ ...manualForm, company: e.target.value })}
                className="w-full px-4 py-3 text-sm bg-surface-container border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary placeholder:text-outline font-bold"
                placeholder="Stripe"
              />
            </div>
            <div>
              <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-surface mb-2">Title</label>
              <input
                type="text"
                required
                value={manualForm.title}
                onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                className="w-full px-4 py-3 text-sm bg-surface-container border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary placeholder:text-outline font-bold"
                placeholder="Frontend Engineer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-surface mb-2">Location</label>
              <input
                type="text"
                value={manualForm.location}
                onChange={(e) => setManualForm({ ...manualForm, location: e.target.value })}
                className="w-full px-4 py-3 text-sm bg-surface-container border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary placeholder:text-outline font-bold"
                placeholder="Remote/NYC"
              />
            </div>
            <div>
              <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-surface mb-2">Salary</label>
              <input
                type="text"
                value={manualForm.salary}
                onChange={(e) => setManualForm({ ...manualForm, salary: e.target.value })}
                className="w-full px-4 py-3 text-sm bg-surface-container border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary placeholder:text-outline font-bold"
                placeholder="e.g. $120k or $90/hr"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-surface mb-2">Job Type</label>
              <select
                value={manualForm.type}
                onChange={(e) => setManualForm({ ...manualForm, type: e.target.value as any })}
                className="w-full px-4 py-3 text-sm bg-surface-container border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary font-bold cursor-pointer"
              >
                <option value="Full-Time" className="bg-surface-container-lowest font-bold">Full-Time</option>
                <option value="Contract" className="bg-surface-container-lowest font-bold">Contract</option>
                <option value="Part-Time" className="bg-surface-container-lowest font-bold">Part-Time</option>
              </select>
            </div>
            <div className="flex items-center gap-3 pt-6 sm:pt-8">
              <input
                type="checkbox"
                id="manual-w2"
                checked={manualForm.isW2}
                onChange={(e) => setManualForm({ ...manualForm, isW2: e.target.checked })}
                className="w-5 h-5 accent-primary border-2 border-outline-variant cursor-pointer"
              />
              <label htmlFor="manual-w2" className="text-xs font-headline font-extrabold uppercase tracking-widest text-on-surface cursor-pointer select-none">
                W2 position
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-surface mb-2">Application URL</label>
            <input
              type="url"
              value={manualForm.url}
              onChange={(e) => setManualForm({ ...manualForm, url: e.target.value })}
              className="w-full px-4 py-3 text-sm bg-surface-container border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary placeholder:text-outline font-mono font-bold"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-xs font-headline font-extrabold uppercase tracking-widest text-on-surface mb-2">Description</label>
            <textarea
              value={manualForm.description}
              onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
              className="w-full h-24 px-4 py-3 text-sm bg-surface-container border-2 border-outline-variant text-on-surface focus:outline-none focus:border-primary resize-none placeholder:text-outline font-body"
              placeholder="Key skills or notes..."
            />
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-primary text-on-primary font-headline font-extrabold uppercase tracking-widest text-sm border-2 border-black hover:opacity-90 active:scale-[0.98] transition-all neo-shadow cursor-pointer mt-4"
          >
            Add Job
          </button>
        </form>
      </div>
    </div>
  );
}
