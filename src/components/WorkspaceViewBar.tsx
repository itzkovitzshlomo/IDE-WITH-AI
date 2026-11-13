import React from 'react';
import { Code2, Eye, Folder, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { UiLocale, WorkspaceFile, WorkspaceViewMode } from '../types/ide';
import { UI_COPY } from '../i18n';

interface WorkspaceViewBarProps {
  locale: UiLocale;
  viewMode: WorkspaceViewMode;
  onChangeViewMode: (mode: WorkspaceViewMode) => void;
  projectName: string;
  activeFile: WorkspaceFile | null;
  showAgentPanel: boolean;
  onToggleAgentPanel: () => void;
}

export const WorkspaceViewBar: React.FC<WorkspaceViewBarProps> = ({
  locale,
  viewMode,
  onChangeViewMode,
  projectName,
  activeFile,
  showAgentPanel,
  onToggleAgentPanel,
}) => {
  const copy = UI_COPY[locale].viewSwitcher;

  const modes: Array<{
    id: WorkspaceViewMode;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'preview', label: copy.preview, icon: <Eye className="w-3.5 h-3.5" /> },
    { id: 'code', label: copy.code, icon: <Code2 className="w-3.5 h-3.5" /> },
    { id: 'files', label: copy.files, icon: <Folder className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="h-11 shrink-0 border-b border-slate-800/90 bg-[#0D131F] px-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      {/* Start: Project / Active File Breadcrumb */}
      <div className="min-w-0 flex items-center gap-2 text-xs text-slate-400">
        <span dir="ltr" className="font-mono text-slate-300 truncate max-w-[160px]">
          {projectName}
        </span>
        {activeFile && (
          <>
            <span className="text-slate-600" aria-hidden="true">
              /
            </span>
            <span dir="ltr" className="font-mono text-slate-400 truncate max-w-[200px]">
              {activeFile.path.replace(/^\/+/, '')}
            </span>
          </>
        )}
      </div>

      {/* Center: Google AI Studio 3-Mode Segmented View Switcher */}
      <div
        role="tablist"
        aria-label="Workspace view mode"
        className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#121928] border border-slate-800"
      >
        {modes.map((m) => {
          const isActive = viewMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChangeViewMode(m.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {m.icon}
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* End: Agent Panel Toggle */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onToggleAgentPanel}
          className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-[#121928] px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {showAgentPanel ? (
            <PanelRightClose className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <PanelRightOpen className="w-3.5 h-3.5 text-blue-400" />
          )}
          <span>{showAgentPanel ? copy.hideAgent : copy.showAgent}</span>
        </button>
      </div>
    </div>
  );
};
