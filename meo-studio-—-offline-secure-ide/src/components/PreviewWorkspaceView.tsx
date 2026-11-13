import React from 'react';
import { Code2, Cpu, Eye, Play, Terminal } from 'lucide-react';
import {
  ConsoleEntry,
  DebugFrame,
  DebugStatus,
  DebugVariable,
  SandboxMemoryCell,
  UiLocale,
  WorkspaceFile,
} from '../types/ide';
import { UI_COPY } from '../i18n';

interface PreviewWorkspaceViewProps {
  locale: UiLocale;
  files: WorkspaceFile[];
  activeFile: WorkspaceFile | null;
  onSelectFile: (id: string) => void;
  onOpenInCode: () => void;
  onRunPreview: () => void;
  reactPreviewHtml: string;
  consoleEntries: ConsoleEntry[];
  debugStatus: DebugStatus;
  cyclesExecuted: number;
  frames: DebugFrame[];
  variables: DebugVariable[];
  memoryCells: SandboxMemoryCell[];
}

export const PreviewWorkspaceView: React.FC<PreviewWorkspaceViewProps> = ({
  locale,
  files,
  activeFile,
  onSelectFile,
  onOpenInCode,
  onRunPreview,
  reactPreviewHtml,
  consoleEntries,
  debugStatus,
  cyclesExecuted,
  frames,
  variables,
  memoryCells,
}) => {
  const copy = UI_COPY[locale].previewView;

  const runnableFiles = files.filter((f) => {
    const lower = f.name.toLowerCase();
    return (
      lower.endsWith('.tsx') ||
      lower.endsWith('.jsx') ||
      lower.endsWith('.c') ||
      lower.endsWith('.cpp') ||
      lower.endsWith('.rs') ||
      lower.endsWith('.js')
    );
  });

  const firstReactFile = runnableFiles.find(
    (f) => f.language === 'react' && /\.(tsx|jsx)$/i.test(f.name)
  );

  const isReactTarget = activeFile?.language === 'react';

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-[#0B0F17]">
      {/* Preview Viewport Toolbar */}
      <div className="h-11 shrink-0 border-b border-slate-800/80 bg-[#0F1522] px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
            {copy.targetLabel}
          </span>
          <select
            dir="ltr"
            value={activeFile?.id || ''}
            onChange={(e) => onSelectFile(e.target.value)}
            className="rounded-md border border-slate-700 bg-[#141C2C] px-2.5 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 max-w-[240px]"
          >
            {(runnableFiles.length > 0 ? runnableFiles : files).map((f) => (
              <option key={f.id} value={f.id}>
                {f.path.replace(/^\/+/, '')} ({f.language.toUpperCase()})
              </option>
            ))}
          </select>

          <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
            <span aria-hidden="true">· </span>
            {isReactTarget ? copy.reactSandboxBadge : copy.nativeSimBadge}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isReactTarget && firstReactFile && (
            <button
              type="button"
              onClick={() => onSelectFile(firstReactFile.id)}
              className="flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-600/15 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-600/25 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              {copy.switchToReact}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenInCode}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#161E2E] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5" />
            {copy.openInCode}
          </button>

          <button
            type="button"
            onClick={onRunPreview}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {copy.refreshRun}
          </button>
        </div>
      </div>

      {/* Main Viewport Canvas */}
      {isReactTarget ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 relative bg-[#0B0F17]">
            {reactPreviewHtml ? (
              <iframe
                title="Offline React Preview Viewport"
                sandbox="allow-scripts"
                srcDoc={reactPreviewHtml}
                className="w-full h-full border-0 bg-[#0B0F17]"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                {copy.emptyReact}
              </div>
            )}
          </div>

          <div className="h-32 shrink-0 border-t border-slate-800/90 bg-[#0D131F] flex flex-col">
            <div className="h-8 shrink-0 px-4 border-b border-slate-800/70 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Terminal className="w-3.5 h-3.5 text-slate-400" />
                {copy.consoleOutput}
              </span>
              <span dir="ltr" className="font-mono tabular-nums text-[11px] text-slate-500">
                {consoleEntries.length} events
              </span>
            </div>
            <div
              dir="ltr"
              className="code-ltr flex-1 overflow-auto px-4 py-2 font-mono text-xs space-y-1"
            >
              {consoleEntries.length === 0 ? (
                <div className="text-slate-500">{copy.noOutputYet}</div>
              ) : (
                consoleEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={
                      entry.type === 'stderr'
                        ? 'text-red-400'
                        : entry.type === 'security'
                        ? 'text-amber-300'
                        : entry.type === 'system'
                        ? 'text-slate-400'
                        : 'text-emerald-300'
                    }
                  >
                    {entry.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Native Sandbox Console Output */}
          <div className="lg:col-span-7 flex flex-col rounded-lg border border-slate-800 bg-[#0F1522] min-h-[260px]">
            <div className="px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Terminal className="w-3.5 h-3.5 text-blue-400" />
                {copy.consoleOutput}
              </div>
              <span dir="ltr" className="font-mono tabular-nums text-[11px] text-slate-400">
                {copy.cycles}: {cyclesExecuted} · {debugStatus}
              </span>
            </div>
            <div
              dir="ltr"
              className="code-ltr flex-1 overflow-auto p-4 font-mono text-xs space-y-1.5"
            >
              {consoleEntries.length === 0 ? (
                <div className="text-slate-500">{copy.noOutputYet}</div>
              ) : (
                consoleEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={
                      entry.type === 'stderr'
                        ? 'text-red-400'
                        : entry.type === 'security'
                        ? 'text-amber-300'
                        : entry.type === 'system'
                        ? 'text-slate-400'
                        : 'text-emerald-300'
                    }
                  >
                    {entry.text}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Variables & Call Stack */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <div className="rounded-lg border border-slate-800 bg-[#0F1522] flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">{copy.variables}</span>
                <span dir="ltr" className="font-mono tabular-nums text-[11px] text-slate-500">
                  {variables.length}
                </span>
              </div>
              <div dir="ltr" className="code-ltr p-3 font-mono text-xs max-h-48 overflow-auto">
                {variables.length === 0 ? (
                  <div className="text-slate-500 py-2">—</div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[11px] text-slate-500 border-b border-slate-800">
                        <th className="py-1 font-medium">Name</th>
                        <th className="py-1 font-medium">Type</th>
                        <th className="py-1 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variables.map((v, i) => (
                        <tr key={`${v.name}-${i}`} className="border-b border-slate-800/50">
                          <td className="py-1 text-sky-300">{v.name}</td>
                          <td className="py-1 text-slate-400">{v.type}</td>
                          <td className="py-1 text-emerald-300 tabular-nums">{v.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#0F1522] flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Cpu className="w-3.5 h-3.5 text-amber-400" />
                  {copy.callStack} & {copy.memoryMap}
                </span>
                <span dir="ltr" className="font-mono tabular-nums text-[11px] text-slate-500">
                  {frames.length} / {memoryCells.length}
                </span>
              </div>
              <div dir="ltr" className="code-ltr p-3 font-mono text-xs space-y-2 max-h-48 overflow-auto">
                {frames.map((f) => (
                  <div key={f.id} className="text-slate-300">
                    {f.name}() <span className="text-slate-500">@ {f.file}:{f.line}</span>
                  </div>
                ))}
                {memoryCells.map((cell) => (
                  <div
                    key={cell.address}
                    className="flex items-center justify-between text-[11px] border-t border-slate-800/60 pt-1.5"
                  >
                    <span className="text-amber-300 tabular-nums">{cell.address}</span>
                    <span className="text-slate-300">{cell.label}</span>
                    <span className="text-slate-500 tabular-nums">{cell.sizeBytes}B</span>
                  </div>
                ))}
                {frames.length === 0 && memoryCells.length === 0 && (
                  <div className="text-slate-500">—</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
