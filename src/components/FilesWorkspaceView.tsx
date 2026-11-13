import React, { useMemo, useState } from 'react';
import {
  Archive,
  Code2,
  FileCode2,
  Folder,
  FolderOpen,
  FolderUp,
  Layers,
  Trash2,
} from 'lucide-react';
import { SecurityFinding, UiLocale, WorkspaceFile } from '../types/ide';
import { UI_COPY } from '../i18n';

interface FilesWorkspaceViewProps {
  locale: UiLocale;
  projectName: string;
  folders: string[];
  files: WorkspaceFile[];
  findings: SecurityFinding[];
  activeFileId: string;
  onOpenFileInEditor: (fileId: string) => void;
  onTriggerUploadFolder: () => void;
  onOpenNewProjectModal: () => void;
  onDownloadProjectZip: () => void;
  onDeleteFile: (fileId: string) => void;
}

export const FilesWorkspaceView: React.FC<FilesWorkspaceViewProps> = ({
  locale,
  projectName,
  folders,
  files,
  findings,
  activeFileId,
  onOpenFileInEditor,
  onTriggerUploadFolder,
  onOpenNewProjectModal,
  onDownloadProjectZip,
  onDeleteFile,
}) => {
  const copy = UI_COPY[locale].filesView;
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string>('ALL');

  const sortedFolders = useMemo(
    () => Array.from(new Set(folders)).sort((a, b) => a.localeCompare(b)),
    [folders]
  );

  const findingsByFile = useMemo(() => {
    const map = new Map<string, number>();
    findings.forEach((f) => {
      map.set(f.fileId, (map.get(f.fileId) || 0) + 1);
    });
    return map;
  }, [findings]);

  const visibleFiles = useMemo(() => {
    const list =
      selectedFolderFilter === 'ALL'
        ? files
        : files.filter(
            (f) =>
              f.folderPath === selectedFolderFilter ||
              f.folderPath.startsWith(selectedFolderFilter + '/')
          );
    return [...list].sort((a, b) => a.path.localeCompare(b.path));
  }, [files, selectedFolderFilter]);

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-[#0B0F17] overflow-hidden">
      {/* Header Bar */}
      <div className="px-6 py-4 border-b border-slate-800/90 bg-[#0F1522] flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-100">{copy.title}</h2>
            <span dir="ltr" className="font-mono text-xs text-slate-400">
              / {projectName}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{copy.subtitle}</p>
          <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
            <span className="tabular-nums">
              <strong className="font-semibold text-slate-200">{files.length}</strong>{' '}
              {copy.totalFiles}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              <strong className="font-semibold text-slate-200">{sortedFolders.length}</strong>{' '}
              {copy.totalFolders}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              <strong
                className={
                  findings.length > 0
                    ? 'font-semibold text-amber-300'
                    : 'font-semibold text-emerald-400'
                }
              >
                {findings.length}
              </strong>{' '}
              {copy.securityIssues}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onTriggerUploadFolder}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            <FolderUp className="w-3.5 h-3.5" />
            {copy.uploadFolderBtn}
          </button>

          <button
            type="button"
            onClick={onOpenNewProjectModal}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#161E2E] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            {UI_COPY[locale].sidebar.newProject}
          </button>

          <button
            type="button"
            onClick={onDownloadProjectZip}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#161E2E] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5 text-slate-400" />
            ZIP
          </button>
        </div>
      </div>

      {/* Folder Architecture Split + File Table */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Folder Architecture Filter List */}
        <div className="w-56 shrink-0 border-e border-slate-800/80 bg-[#0D131F] overflow-y-auto p-3 space-y-1">
          <button
            type="button"
            onClick={() => setSelectedFolderFilter('ALL')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors cursor-pointer ${
              selectedFolderFilter === 'ALL'
                ? 'bg-blue-600/20 text-blue-300 font-medium'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              <span dir="ltr" className="font-mono">
                / (root)
              </span>
            </span>
            <span dir="ltr" className="font-mono tabular-nums text-[11px] text-slate-500">
              {files.length}
            </span>
          </button>

          {sortedFolders.map((folder) => {
            const count = files.filter(
              (f) => f.folderPath === folder || f.folderPath.startsWith(folder + '/')
            ).length;
            const isSelected = selectedFolderFilter === folder;
            return (
              <button
                key={folder}
                type="button"
                onClick={() => setSelectedFolderFilter(folder)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600/20 text-blue-300 font-medium'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Folder className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span dir="ltr" className="font-mono truncate">
                    {folder}
                  </span>
                </span>
                <span dir="ltr" className="font-mono tabular-nums text-[11px] text-slate-500">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* File Inventory Table */}
        <div className="flex-1 min-w-0 overflow-auto p-5">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 text-start font-medium">{copy.colName}</th>
                <th className="py-2.5 text-start font-medium">{copy.colPath}</th>
                <th className="py-2.5 text-start font-medium">{copy.colLanguage}</th>
                <th className="py-2.5 text-end font-medium pe-4">{copy.colLines}</th>
                <th className="py-2.5 text-start font-medium">{copy.colSecurity}</th>
                <th className="py-2.5 text-end font-medium">{copy.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {visibleFiles.map((file) => {
                const lineCount = file.content.split('\n').length;
                const issueCount = findingsByFile.get(file.id) || 0;
                const isActive = file.id === activeFileId;

                return (
                  <tr
                    key={file.id}
                    onClick={() => onOpenFileInEditor(file.id)}
                    className={`border-b border-slate-800/60 cursor-pointer transition-colors ${
                      isActive ? 'bg-slate-800/60' : 'hover:bg-slate-800/35'
                    }`}
                  >
                    <td className="py-2.5 pe-3">
                      <div className="flex items-center gap-2">
                        <FileCode2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            file.language === 'rust'
                              ? 'text-amber-400'
                              : file.language === 'react'
                              ? 'text-sky-400'
                              : file.language === 'cpp'
                              ? 'text-indigo-400'
                              : 'text-emerald-400'
                          }`}
                        />
                        <span dir="ltr" className="font-mono font-medium text-slate-100">
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pe-3">
                      <span dir="ltr" className="font-mono text-slate-400">
                        {file.folderPath}
                      </span>
                    </td>
                    <td className="py-2.5 pe-3 font-mono text-slate-300">
                      {file.language.toUpperCase()}
                    </td>
                    <td className="py-2.5 pe-4 text-end font-mono tabular-nums text-slate-400">
                      {lineCount}
                    </td>
                    <td className="py-2.5 pe-3">
                      {issueCount === 0 ? (
                        <span className="text-emerald-400">{copy.clean}</span>
                      ) : (
                        <span className="text-amber-300 font-mono tabular-nums">
                          {issueCount} CWE
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-end">
                      <div
                        className="inline-flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenFileInEditor(file.id)}
                          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#161E2E] px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                        >
                          <Code2 className="w-3 h-3 text-blue-400" />
                          {copy.openInEditor}
                        </button>
                        {files.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onDeleteFile(file.id)}
                            title="Delete File"
                            className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
