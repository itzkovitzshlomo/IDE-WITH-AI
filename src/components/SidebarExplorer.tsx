import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Layers,
  Pencil,
  Trash2,
  Upload,
  WifiOff,
  X,
} from 'lucide-react';
import { CodeLanguage, PendingAgentChange, UiLocale, WorkspaceFile } from '../types/ide';
import { UI_COPY } from '../i18n';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { PWAInstallButton } from './PWAInstallButton';

interface SidebarExplorerProps {
  locale: UiLocale;
  projectName: string;
  folders: string[];
  files: WorkspaceFile[];
  expandedFolders: string[];
  activeFileId: string;
  pendingChanges: PendingAgentChange[];
  onOpenNewProjectModal: () => void;
  onSelectFile: (id: string) => void;
  onToggleFolder: (folderPath: string) => void;
  onCreateFile: (name: string, folderPath: string, language: CodeLanguage) => void;
  onCreateFolder: (folderPath: string) => void;
  onRenameFile: (id: string, newName: string) => void;
  onRenameFolder: (oldFolderPath: string, newFolderName: string) => void;
  onDeleteFile: (id: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  onImportLocalFiles: (fileList: FileList, targetFolder: string) => void;
  onTriggerUploadFolder: () => void;
  onDownloadProjectZip: () => void;
  onExportWorkspace: () => void;
  onAcceptChange: (fileId: string) => void;
  onRejectChange: (fileId: string) => void;
}

const VALID_EXTENSIONS = ['.c', '.cpp', '.rs', '.tsx', '.js'] as const;

function validateFilename(rawName: string): {
  valid: boolean;
  error?: string;
  language?: CodeLanguage;
} {
  const trimmed = rawName.trim();
  if (!trimmed) {
    return { valid: false, error: 'File name is required.' };
  }
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    return { valid: false, error: 'Invalid characters in file name.' };
  }
  const lower = trimmed.toLowerCase();
  const matchedExt = VALID_EXTENSIONS.find((ext) => lower.endsWith(ext));
  if (!matchedExt) {
    return {
      valid: false,
      error: 'Extension must be .c, .cpp, .rs, .tsx, or .js',
    };
  }
  const language: CodeLanguage =
    matchedExt === '.c'
      ? 'c'
      : matchedExt === '.cpp'
      ? 'cpp'
      : matchedExt === '.rs'
      ? 'rust'
      : 'react';
  return { valid: true, language };
}

export const SidebarExplorer: React.FC<SidebarExplorerProps> = ({
  locale,
  projectName,
  folders,
  files,
  expandedFolders,
  activeFileId,
  pendingChanges,
  onOpenNewProjectModal,
  onSelectFile,
  onToggleFolder,
  onCreateFile,
  onCreateFolder,
  onRenameFile,
  onRenameFolder,
  onDeleteFile,
  onDeleteFolder,
  onImportLocalFiles,
  onTriggerUploadFolder,
  onDownloadProjectZip,
  onExportWorkspace,
  onAcceptChange,
  onRejectChange,
}) => {
  const copy = UI_COPY[locale].sidebar;
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [createMode, setCreateMode] = useState<'none' | 'file' | 'folder'>('none');
  const [targetFolder, setTargetFolder] = useState<string>('/src');
  const [draftName, setDraftName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const [renamingTarget, setRenamingTarget] = useState<{
    kind: 'file' | 'folder';
    idOrPath: string;
    value: string;
  } | null>(null);

  const pendingByFileId = useMemo(() => {
    const map = new Map<string, PendingAgentChange>();
    pendingChanges.forEach((p) => map.set(p.fileId, p));
    return map;
  }, [pendingChanges]);

  const sortedFolders = useMemo(
    () => Array.from(new Set(folders)).sort((a, b) => a.localeCompare(b)),
    [folders]
  );

  const childFoldersOf = (parent: string) =>
    sortedFolders.filter((f) => {
      if (f === parent) return false;
      if (parent === '/') {
        return f.startsWith('/') && !f.slice(1).includes('/');
      }
      if (!f.startsWith(parent + '/')) return false;
      const rest = f.slice(parent.length + 1);
      return rest.length > 0 && !rest.includes('/');
    });

  const filesInFolder = (folderPath: string) =>
    files
      .filter((f) => (f.folderPath || '/') === folderPath)
      .sort((a, b) => a.name.localeCompare(b.name));

  const openCreateFileIn = (folderPath: string) => {
    setTargetFolder(folderPath);
    setCreateMode('file');
    setDraftName('');
    setValidationError(null);
  };

  const openCreateFolderIn = (folderPath: string) => {
    setTargetFolder(folderPath);
    setCreateMode('folder');
    setDraftName('');
    setValidationError(null);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createMode === 'file') {
      const check = validateFilename(draftName);
      if (!check.valid || !check.language) {
        setValidationError(check.error || 'Invalid file name');
        return;
      }
      const exists = files.some(
        (f) =>
          f.folderPath === targetFolder &&
          f.name.toLowerCase() === draftName.trim().toLowerCase()
      );
      if (exists) {
        setValidationError('A file with this name already exists in this folder.');
        return;
      }
      onCreateFile(draftName.trim(), targetFolder, check.language);
      setCreateMode('none');
      setDraftName('');
      setValidationError(null);
    } else if (createMode === 'folder') {
      const cleanFolder = draftName.trim().replace(/^\/+|\/+$/g, '');
      if (!cleanFolder || /[\\/:*?"<>|]/.test(cleanFolder)) {
        setValidationError('Enter a valid folder name (no slashes).');
        return;
      }
      const nextPath =
        targetFolder === '/' ? `/${cleanFolder}` : `${targetFolder}/${cleanFolder}`;
      if (folders.includes(nextPath)) {
        setValidationError('Folder already exists.');
        return;
      }
      onCreateFolder(nextPath);
      setCreateMode('none');
      setDraftName('');
      setValidationError(null);
    }
  };

  const commitRename = () => {
    if (!renamingTarget) return;
    const trimmed = renamingTarget.value.trim();
    if (!trimmed) {
      setRenamingTarget(null);
      return;
    }
    if (renamingTarget.kind === 'file') {
      const check = validateFilename(trimmed);
      if (!check.valid) {
        setValidationError(check.error || 'Invalid extension');
        return;
      }
      onRenameFile(renamingTarget.idOrPath, trimmed);
    } else {
      if (!/[\\/:*?"<>|]/.test(trimmed)) {
        onRenameFolder(renamingTarget.idOrPath, trimmed);
      }
    }
    setValidationError(null);
    setRenamingTarget(null);
  };

  const renderFileRow = (file: WorkspaceFile, depth: number) => {
    const isActive = file.id === activeFileId;
    const isRenaming =
      renamingTarget?.kind === 'file' && renamingTarget.idOrPath === file.id;
    const pending = pendingByFileId.get(file.id);

    return (
      <div
        key={file.id}
        onClick={() => !isRenaming && onSelectFile(file.id)}
        style={{ paddingInlineStart: `${depth * 14 + 12}px` }}
        className={`group flex items-center justify-between pe-2 py-1.5 text-xs cursor-pointer transition-colors ${
          isActive
            ? 'bg-slate-800/85 text-slate-100 font-medium'
            : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
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
          {isRenaming ? (
            <input
              type="text"
              value={renamingTarget.value}
              autoFocus
              onChange={(e) =>
                setRenamingTarget({ ...renamingTarget, value: e.target.value })
              }
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setValidationError(null);
                  setRenamingTarget(null);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#0B0F17] border border-blue-500 rounded px-1.5 py-0.5 text-xs font-mono text-slate-100 focus:outline-none"
            />
          ) : (
            <span
              dir="ltr"
              className={`font-mono truncate ${
                pending?.changeType === 'added'
                  ? 'text-emerald-300'
                  : pending?.changeType === 'modified'
                  ? 'text-amber-300'
                  : ''
              }`}
            >
              {file.name}
            </span>
          )}
        </div>

        {!isRenaming && (
          <div className="flex items-center gap-0.5 shrink-0">
            {pending && (
              <div className="flex items-center gap-0.5 mr-1">
                <span
                  className={`font-mono text-[10px] font-bold px-1 ${
                    pending.changeType === 'added' ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {pending.changeType === 'added' ? 'A' : 'M'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAcceptChange(file.id);
                  }}
                  title="Accept Agent Change"
                  className="p-0.5 rounded hover:bg-emerald-600/30 text-emerald-400 cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRejectChange(file.id);
                  }}
                  title="Reject Agent Change"
                  className="p-0.5 rounded hover:bg-red-600/30 text-red-400 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setValidationError(null);
                  setRenamingTarget({ kind: 'file', idOrPath: file.id, value: file.name });
                }}
                title="Rename File"
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
              </button>
              {files.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFile(file.id);
                  }}
                  title="Delete File"
                  className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFolderNode = (folderPath: string, depth: number): React.ReactNode => {
    const isExpanded = expandedFolders.includes(folderPath);
    const folderName = folderPath.split('/').pop() || folderPath;
    const isRenaming =
      renamingTarget?.kind === 'folder' && renamingTarget.idOrPath === folderPath;
    const subFolders = childFoldersOf(folderPath);
    const nestedFiles = filesInFolder(folderPath);

    return (
      <div key={folderPath}>
        <div
          onClick={() => !isRenaming && onToggleFolder(folderPath)}
          style={{ paddingInlineStart: `${depth * 14 + 8}px` }}
          className="group flex items-center justify-between pe-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800/40 cursor-pointer"
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
            {isRenaming ? (
              <input
                type="text"
                dir="ltr"
                value={renamingTarget.value}
                autoFocus
                onChange={(e) =>
                  setRenamingTarget({ ...renamingTarget, value: e.target.value })
                }
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenamingTarget(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-[#0B0F17] border border-blue-500 rounded px-1.5 py-0.5 text-xs font-mono text-slate-100 focus:outline-none"
              />
            ) : (
              <span dir="ltr" className="font-mono truncate">{folderName}</span>
            )}
          </div>

          {!isRenaming && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateFileIn(folderPath);
                }}
                title="New File Here"
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <FilePlus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateFolderIn(folderPath);
                }}
                title="New Subfolder"
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <FolderPlus className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingTarget({
                    kind: 'folder',
                    idOrPath: folderPath,
                    value: folderName,
                  });
                }}
                title="Rename Folder"
                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
              </button>
              {folderPath !== '/src' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFolder(folderPath);
                  }}
                  title="Delete Folder"
                  className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {isExpanded && (
          <div>
            {subFolders.map((sub) => renderFolderNode(sub, depth + 1))}
            {nestedFiles.map((file) => renderFileRow(file, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-64 shrink-0 border-e border-slate-800/90 bg-[#0F1522] flex flex-col justify-between h-full">
      <div className="flex flex-col min-h-0 flex-1">
        <div className="px-3.5 py-2.5 border-b border-slate-800/80 bg-[#121928] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] text-slate-500">{copy.activeProject}</div>
            <div dir="ltr" className="text-xs font-semibold font-mono text-slate-100 truncate">
              {projectName}
            </div>
          </div>
          <button
            onClick={onOpenNewProjectModal}
            className="flex items-center gap-1 rounded border border-slate-700 bg-[#182133] px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Layers className="w-3 h-3 text-blue-400" />
            {copy.newProject}
          </button>
        </div>

        <div className="px-3.5 py-2 border-b border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">{copy.explorer}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => openCreateFileIn('/src')}
                title="New File (.c, .cpp, .rs, .tsx, .js)"
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => openCreateFolderIn('/')}
                title="New Folder"
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                title={copy.uploadFilesTitle}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".c,.h,.cpp,.hpp,.rs,.tsx,.jsx,.ts,.js,.json,.css,.html,.md"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onImportLocalFiles(e.target.files, '/src');
                    e.target.value = '';
                  }
                }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onTriggerUploadFolder}
            title={copy.uploadFolderTitle}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-blue-500/40 bg-blue-600/15 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-600/25 transition-colors whitespace-nowrap cursor-pointer"
          >
            <FolderUp className="w-3.5 h-3.5 shrink-0" />
            <span>{copy.uploadFolder}</span>
          </button>
        </div>

        {createMode !== 'none' && (
          <form
            onSubmit={handleCreateSubmit}
            className="p-3 border-b border-slate-800 bg-[#131B2C] space-y-2"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                {createMode === 'file' ? copy.newFileIn : copy.newFolderIn}
                <span dir="ltr" className="font-mono text-slate-200">{targetFolder}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setCreateMode('none');
                  setValidationError(null);
                }}
                className="text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                {copy.cancel}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                dir="ltr"
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  setValidationError(null);
                }}
                placeholder={
                  createMode === 'file' ? 'main.c / app.tsx' : 'folder_name'
                }
                autoFocus
                className="flex-1 min-w-0 rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer whitespace-nowrap"
              >
                {copy.add}
              </button>
            </div>
            {validationError && (
              <div className="text-[11px] text-red-400">{validationError}</div>
            )}
          </form>
        )}

        {validationError && createMode === 'none' && (
          <div className="px-3 py-1.5 bg-red-500/10 border-b border-red-500/30 text-[11px] text-red-300">
            {validationError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1.5">
          {childFoldersOf('/').map((folderPath) => renderFolderNode(folderPath, 0))}
          {filesInFolder('/').map((file) => renderFileRow(file, 0))}
        </div>
      </div>

      <div className="p-3 border-t border-slate-800/80 space-y-2 bg-[#0D131F]">
        <button
          onClick={onDownloadProjectZip}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-blue-600/15 border border-blue-500/40 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-600/25 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Archive className="w-3.5 h-3.5" />
          {copy.downloadZip}
        </button>

        <button
          onClick={onExportWorkspace}
          className="w-full flex items-center justify-center gap-2 rounded-md border border-slate-800 bg-[#141C2B] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
        >
          <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
          {copy.exportJson}
        </button>

        <PWAInstallButton />

        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-0.5">
          <span className="flex items-center gap-1.5">
            {isOnline ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            )}
            {isOnline ? copy.offlineReady : copy.offlineActive}
          </span>
          <span className="font-mono tabular-nums text-slate-500">IndexedDB</span>
        </div>
      </div>
    </aside>
  );
};
