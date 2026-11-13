import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Lock,
  Shield,
  ShieldCheck,
  Terminal,
  Wrench,
} from 'lucide-react';
import {
  CodeLanguage,
  ConsoleEntry,
  DebugFrame,
  DebugStatus,
  DebugVariable,
  SandboxMemoryCell,
  SandboxPolicy,
  SecurityFinding,
  UiLocale,
} from '../types/ide';
import { UI_COPY } from '../i18n';

export type BottomTab = 'console' | 'debugger' | 'preview' | 'security' | 'sandbox';

interface BottomPanelProps {
  locale: UiLocale;
  activeTab: BottomTab;
  onSelectTab: (tab: BottomTab) => void;
  language: CodeLanguage;
  consoleEntries: ConsoleEntry[];
  onClearConsole: () => void;
  debugStatus: DebugStatus;
  cyclesExecuted: number;
  frames: DebugFrame[];
  variables: DebugVariable[];
  memoryCells: SandboxMemoryCell[];
  reactPreviewHtml: string;
  findings: SecurityFinding[];
  onJumpToFinding: (finding: SecurityFinding) => void;
  onAutoFixFinding: (finding: SecurityFinding) => void;
  onFixAllActiveFile: () => void;
  onScanWorkspace: () => void;
  sandboxPolicy: SandboxPolicy;
  onUpdateSandboxPolicy: (next: SandboxPolicy) => void;
}

const SEVERITY_LABEL: Record<SecurityFinding['severity'], string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const BottomPanel: React.FC<BottomPanelProps> = ({
  locale,
  activeTab,
  onSelectTab,
  language,
  consoleEntries,
  onClearConsole,
  debugStatus,
  cyclesExecuted,
  frames,
  variables,
  memoryCells,
  reactPreviewHtml,
  findings,
  onJumpToFinding,
  onAutoFixFinding,
  onFixAllActiveFile,
  onScanWorkspace,
  sandboxPolicy,
  onUpdateSandboxPolicy,
}) => {
  const copy = UI_COPY[locale].bottom;

  const tabs: Array<{ id: BottomTab; label: string; count?: number }> = [
    { id: 'console', label: copy.console },
    { id: 'debugger', label: copy.debugger, count: variables.length || undefined },
    { id: 'preview', label: copy.preview },
    { id: 'security', label: copy.security, count: findings.length },
    { id: 'sandbox', label: copy.sandbox },
  ];

  const fixableCount = findings.filter((f) => f.fixable).length;

  return (
    <section className="h-72 shrink-0 border-t border-slate-800/90 bg-[#0E1420] flex flex-col">
      {/* Docked Tabs Bar */}
      <div className="h-10 shrink-0 border-b border-slate-800/80 px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-5 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`h-10 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'border-blue-500 text-slate-100'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="font-mono tabular-nums text-[11px] text-slate-400">
                    ({tab.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs text-slate-400">
          {debugStatus !== 'idle' && (
            <span dir="ltr" className="font-mono tabular-nums text-[11px] text-slate-400">
              {cyclesExecuted} cycles · {debugStatus}
            </span>
          )}
          {activeTab === 'console' && (
            <button
              onClick={onClearConsole}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer whitespace-nowrap"
            >
              {copy.clearConsole}
            </button>
          )}
          {activeTab === 'security' && (
            <div className="flex items-center gap-2">
              {fixableCount > 0 && (
                <button
                  onClick={onFixAllActiveFile}
                  className="rounded border border-emerald-500/40 bg-emerald-600/20 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-600/30 cursor-pointer whitespace-nowrap"
                >
                  {copy.autoFixFile}
                </button>
              )}
              <button
                onClick={onScanWorkspace}
                className="rounded border border-slate-700 bg-[#161E2E] px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer whitespace-nowrap"
              >
                {copy.scanAll}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {activeTab === 'console' && (
          <div dir="ltr" className="code-ltr font-mono text-xs space-y-1.5">
            {consoleEntries.length === 0 ? (
              <div
                dir={locale === 'he' ? 'rtl' : 'ltr'}
                className={`text-slate-500 font-sans text-xs py-6 ${
                  locale === 'he' ? 'text-right' : 'text-left'
                }`}
              >
                {copy.consoleEmpty}
              </div>
            ) : (
              consoleEntries.map((entry) => (
                <div
                  key={entry.id}
                  dir="ltr"
                  className={`code-ltr leading-relaxed whitespace-pre-wrap ${
                    entry.type === 'stderr'
                      ? 'text-red-400'
                      : entry.type === 'security'
                      ? 'text-amber-300'
                      : entry.type === 'system'
                      ? 'text-sky-400'
                      : 'text-slate-200'
                  }`}
                >
                  {entry.text}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'debugger' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full">
            <div className="border border-slate-800 rounded-md bg-[#0B0F17] p-3 overflow-auto">
              <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                {copy.callStack}
              </div>
              {frames.length === 0 ? (
                <div className="text-xs text-slate-500">{copy.noFrames}</div>
              ) : (
                <div dir="ltr" className="code-ltr space-y-1.5">
                  {frames.map((frame) => (
                    <div
                      key={frame.id}
                      className="flex items-center justify-between text-xs font-mono px-2 py-1 rounded bg-[#121927] text-slate-200"
                    >
                      <span>{frame.name}</span>
                      <span className="text-slate-400 tabular-nums">
                        {frame.file}:{frame.line}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-slate-800 rounded-md bg-[#0B0F17] p-3 overflow-auto">
              <div className="text-xs font-semibold text-slate-300 mb-2">
                {copy.variables}
              </div>
              {variables.length === 0 ? (
                <div className="text-xs text-slate-500">{copy.noVariables}</div>
              ) : (
                <table dir="ltr" className="code-ltr w-full text-xs font-mono">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-800">
                      <th className="text-left py-1 font-medium">Name</th>
                      <th className="text-left py-1 font-medium">Type</th>
                      <th className="text-right py-1 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variables.map((v, i) => (
                      <tr key={`${v.scope}-${v.name}-${i}`} className="border-b border-slate-800/50">
                        <td className="py-1 text-sky-300">{v.name}</td>
                        <td className="py-1 text-slate-400">{v.type}</td>
                        <td className="py-1 text-right text-emerald-300 tabular-nums">{v.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="border border-slate-800 rounded-md bg-[#0B0F17] p-3 overflow-auto">
              <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-amber-400" />
                {copy.memoryMap}
              </div>
              {memoryCells.length === 0 ? (
                <div className="text-xs text-slate-500">{copy.noMemory}</div>
              ) : (
                <div dir="ltr" className="code-ltr space-y-1.5 font-mono text-[11px]">
                  {memoryCells.map((cell, i) => (
                    <div
                      key={`${cell.address}-${i}`}
                      className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-[#121927]"
                    >
                      <span className="text-amber-300 tabular-nums">{cell.address}</span>
                      <span className="text-slate-300 truncate">{cell.label}</span>
                      <span className="text-slate-400 tabular-nums">{cell.hex}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="h-full flex flex-col">
            {language !== 'react' && !reactPreviewHtml ? (
              <div className="text-xs text-slate-400 py-6">{copy.reactPreviewEmpty}</div>
            ) : (
              <iframe
                title="React Offline Sandbox Preview"
                sandbox="allow-scripts"
                srcDoc={reactPreviewHtml}
                className="w-full flex-1 rounded-md border border-slate-800 bg-[#0B0F17]"
              />
            )}
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-2">
            {findings.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-400 py-4">
                <ShieldCheck className="w-4 h-4" />
                {copy.zeroSecurity}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="text-start py-1.5 font-medium">{copy.severity}</th>
                    <th className="text-start py-1.5 font-medium">CWE</th>
                    <th className="text-start py-1.5 font-medium">{copy.findingTitle}</th>
                    <th className="text-start py-1.5 font-medium">{copy.location}</th>
                    <th className="text-end py-1.5 font-medium">{copy.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((finding) => (
                    <tr
                      key={finding.id}
                      onClick={() => onJumpToFinding(finding)}
                      className="border-b border-slate-800/60 hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="py-2 pe-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            finding.severity === 'critical'
                              ? 'text-red-400'
                              : finding.severity === 'high'
                              ? 'text-amber-400'
                              : 'text-sky-400'
                          }`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {SEVERITY_LABEL[finding.severity]}
                        </span>
                      </td>
                      <td dir="ltr" className="py-2 pe-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {finding.cwe}
                      </td>
                      <td className="py-2 pe-3">
                        <div className="font-medium text-slate-100">{finding.title}</div>
                        <div className="text-slate-400 mt-0.5">{finding.description}</div>
                      </td>
                      <td dir="ltr" className="py-2 pe-3 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                        {finding.fileName}:{finding.line}
                      </td>
                      <td className="py-2 text-end whitespace-nowrap">
                        {finding.fixable ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAutoFixFinding(finding);
                            }}
                            className="inline-flex items-center gap-1 rounded bg-emerald-600/20 border border-emerald-500/40 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-600/30 cursor-pointer"
                          >
                            <Wrench className="w-3 h-3" />
                            {finding.fixLabel || 'Auto-Fix'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500">{copy.manualReview}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'sandbox' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="border border-slate-800 rounded-md bg-[#0B0F17] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  {copy.sandboxPolicyTitle}
                </div>
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {copy.enforced}
                </span>
              </div>

              <label className="flex items-center justify-between py-1 cursor-pointer">
                <span className="text-slate-300">{copy.blockNetwork}</span>
                <input
                  type="checkbox"
                  checked={sandboxPolicy.networkBlocked}
                  onChange={(e) =>
                    onUpdateSandboxPolicy({ ...sandboxPolicy, networkBlocked: e.target.checked })
                  }
                  className="accent-blue-500"
                />
              </label>

              <label className="flex items-center justify-between py-1 cursor-pointer">
                <span className="text-slate-300">{copy.strictPointers}</span>
                <input
                  type="checkbox"
                  checked={sandboxPolicy.strictPointerBounds}
                  onChange={(e) =>
                    onUpdateSandboxPolicy({
                      ...sandboxPolicy,
                      strictPointerBounds: e.target.checked,
                    })
                  }
                  className="accent-blue-500"
                />
              </label>

              <label className="flex items-center justify-between py-1 cursor-pointer">
                <span className="text-slate-300">{copy.isolatedFs}</span>
                <input
                  type="checkbox"
                  checked={sandboxPolicy.filesystemIsolated}
                  onChange={(e) =>
                    onUpdateSandboxPolicy({
                      ...sandboxPolicy,
                      filesystemIsolated: e.target.checked,
                    })
                  }
                  className="accent-blue-500"
                />
              </label>
            </div>

            <div className="border border-slate-800 rounded-md bg-[#0B0F17] p-4 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <Shield className="w-4 h-4 text-blue-400" />
                {copy.resourceCaps}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>{copy.maxCycles}</span>
                  <span dir="ltr" className="font-mono tabular-nums text-blue-400">
                    {sandboxPolicy.maxInstructionCycles.toLocaleString()}
                  </span>
                </div>
                <input
                  type="range"
                  min={5000}
                  max={100000}
                  step={5000}
                  value={sandboxPolicy.maxInstructionCycles}
                  onChange={(e) =>
                    onUpdateSandboxPolicy({
                      ...sandboxPolicy,
                      maxInstructionCycles: Number(e.target.value),
                    })
                  }
                  className="w-full accent-blue-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-slate-300">
                  <span>{copy.maxMem}</span>
                  <span dir="ltr" className="font-mono tabular-nums text-amber-400">
                    {sandboxPolicy.maxMemoryMb} MB
                  </span>
                </div>
                <input
                  type="range"
                  min={16}
                  max={512}
                  step={16}
                  value={sandboxPolicy.maxMemoryMb}
                  onChange={(e) =>
                    onUpdateSandboxPolicy({
                      ...sandboxPolicy,
                      maxMemoryMb: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
