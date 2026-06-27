/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

interface EventLogsConsoleProps {
  scanStatus: 'idle' | 'running';
  aiLogs: string[];
  clearAiLogs: () => void;
}

export default function EventLogsConsole({
  scanStatus,
  aiLogs,
  clearAiLogs
}: EventLogsConsoleProps) {
  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [aiLogs]);

  return (
    <div className="bg-surface-container border-2 border-outline-variant p-6 shadow-[inset_0px_0px_10px_rgba(0,0,0,0.5)]" id="ai-telemetering-logs">
      <div className="text-on-surface-variant border-b-2 border-outline-variant pb-3 mb-4 font-headline font-bold flex items-center justify-between text-sm uppercase tracking-widest">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 border-2 border-black ${
            scanStatus === 'running' ? "bg-primary animate-pulse" : "bg-emerald-500"
          }`} />
          <span>EVENT LOGS</span>
        </div>
        <div className="flex items-center gap-3 animate-fade-in font-body">
          <button
            onClick={clearAiLogs}
            className="text-[10px] font-headline font-extrabold uppercase tracking-widest px-4 py-2 border-2 border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:text-error hover:border-error hover:bg-error-container transition-all cursor-pointer neo-shadow-sm"
            title="Clear all event logs from history"
          >
            Clear Logs
          </button>
        </div>
      </div>
      <div
        ref={logsContainerRef}
        className="font-mono text-xs text-on-surface space-y-2 max-h-48 overflow-y-auto leading-relaxed pr-3 flex flex-col"
      >
        {aiLogs.length === 0 ? (
          <div className="text-outline italic py-2 font-headline uppercase tracking-widest">No activity yet. Parse a resume or run a scan.</div>
        ) : (
          [...aiLogs].reverse().map((log, idx) => {
            const hasColor = /error|failed|could ?not|couldn|unable|timed out/i.test(log);
            const hasSuccess = /matched|complete|success|\bsaved\b|parsed|connected|restored|still open|found new/i.test(log);
            return (
              <div key={idx} className="flex gap-3 items-start border-b border-outline-variant/30 pb-2">
                <span className="text-primary font-bold select-none shrink-0">&gt;</span>
                <span className={hasColor ? "text-error font-bold" : hasSuccess ? "text-emerald-500 font-bold" : "text-on-surface"}>
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
