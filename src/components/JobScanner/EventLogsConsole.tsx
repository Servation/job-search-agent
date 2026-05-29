/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

interface EventLogsConsoleProps {
  scanStatus: 'idle' | 'running';
  aiLogs: string[];
  ralphMode: boolean;
  setRalphMode: (mode: boolean) => void;
  clearAiLogs: () => void;
}

export default function EventLogsConsole({
  scanStatus,
  aiLogs,
  ralphMode,
  setRalphMode,
  clearAiLogs
}: EventLogsConsoleProps) {
  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [aiLogs]);

  return (
    <div className="bg-slate-950/80 p-5 rounded-2xl border border-white/5 shadow-inner" id="ai-telemetering-logs">
      <div className="text-slate-400 border-b border-white/5 pb-2 mb-3.5 font-bold flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${
            scanStatus === 'running' ? "bg-indigo-500 animate-ping" : "bg-emerald-500"
          }`} />
          <span className="tracking-wider uppercase font-display">EVENT LOGS</span>
        </div>
        <div className="flex items-center gap-2 animate-fade-in font-sans">
          <button
            onClick={() => setRalphMode(!ralphMode)}
            className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 shadow-sm ${
              ralphMode
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                : 'bg-slate-900 text-slate-400 border-white/10 hover:text-slate-200 hover:bg-slate-850'
            }`}
            title="Toggle Ralph Wiggum funny quote commentary event logs"
          >
            🍌 Ralph Mode: {ralphMode ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={clearAiLogs}
            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border border-white/10 bg-slate-900 text-slate-400 hover:text-rose-455 hover:border-rose-500/25 hover:bg-slate-850 transition-all cursor-pointer shadow-sm"
            title="Clear all event logs from history"
          >
            Clear Logs
          </button>
        </div>
      </div>
      <div
        ref={logsContainerRef}
        className="font-mono text-[11px] text-slate-300 space-y-1.5 max-h-44 overflow-y-auto leading-relaxed pr-2 flex flex-col"
      >
        {aiLogs.length === 0 ? (
          <div className="text-slate-600 italic py-2">No events logged yet. Try parsing or scanning to generate log streams.</div>
        ) : (
          [...aiLogs].reverse().map((log, idx) => {
            const hasColor = log.includes("Error") || log.includes("failed");
            const hasSuccess = log.includes("successful") || log.includes("analyzed") || log.includes("Success") || log.includes("completed");
            return (
              <div key={idx} className="flex gap-2.5 items-start">
                <span className="text-slate-650 opacity-40 select-none shrink-0">&gt;</span>
                <span className={hasColor ? "text-rose-400 font-medium" : hasSuccess ? "text-emerald-400 font-medium" : "text-slate-300"}>
                  {log}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
