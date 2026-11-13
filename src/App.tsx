import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  AgentLogEntry,
  AgentPipelineStage,
  AgentTask,
  CodeLanguage,
  ConsoleEntry,
  DebugFrame,
  DebugStatus,
  DebugVariable,
  ExpertRoleId,
  LocalModelMetadata,
  ModelChatMessage,
  ModelExecutionMode,
  ModelRamStats,
  PendingAgentChange,
  ProjectTemplateId,
  QwenPresetId,
  SandboxMemoryCell,
  SandboxPolicy,
  SecurityFinding,
  SparkMoETelemetry,
  SuggestedCodeFix,
  UiLocale,
  WorkspaceFile,
  WorkspaceState,
  WorkspaceViewMode,
} from './types/ide';
import { loadUiLocale, saveUiLocale } from './i18n';
import {
  DEFAULT_SANDBOX_POLICY,
  loadSandboxPolicy,
  loadSavedModels,
  loadWorkspaceState,
  removeModelMetadata,
  saveModelMetadata,
  saveSandboxPolicy,
  saveWorkspaceState,
} from './engine/storage';
import { getDefaultWorkspaceState, PROJECT_TEMPLATES } from './engine/projectTemplates';
import { buildProjectZipBlob } from './engine/zipExporter';
import {
  canUseNativeDirectoryPicker,
  importWorkspaceFromDirectoryFileList,
  inferLanguageFromFilename,
  pickAndImportDirectoryNative,
} from './engine/folderImporter';
import {
  applyAllFixableIssues,
  applySecurityAutoFix,
  scanFileSecurity,
  scanWorkspaceSecurity,
} from './engine/securityScanner';
import { DebugSnapshot, SandboxDebugSession } from './engine/sandboxInterpreter';
import {
  buildOfflineReactSandboxHtml,
  buildOfflineReactSandboxHtmlFromIndexedDB,
} from './engine/reactCompiler';
import {
  buildSampleMeoBinary,
  indexModelExpertShards,
  parseLocalModelFile,
} from './engine/modelFormats';
import { MeoOfflineRuntime } from './engine/meoRuntime';
import { SparkMoEEngine } from './engine/sparkMoEEngine';
import { executeAutonomousMission } from './engine/agentOrchestrator';
import { TopBar, WorkspaceSection } from './components/TopBar';
import { WorkspaceViewBar } from './components/WorkspaceViewBar';
import { SidebarExplorer } from './components/SidebarExplorer';
import { CodeEditor } from './components/CodeEditor';
import { PreviewWorkspaceView } from './components/PreviewWorkspaceView';
import { FilesWorkspaceView } from './components/FilesWorkspaceView';
import { BottomPanel, BottomTab } from './components/BottomPanel';
import { AgentPanel } from './components/AgentPanel';
import { NewProjectModal } from './components/NewProjectModal';

function defaultTemplateForLanguage(name: string, lang: CodeLanguage): string {
  if (lang === 'c') {
    return `#include <stdio.h>\n\nint main() {\n    int value = 42;\n    printf("Running %s -> %d\\n", "${name}", value);\n    return 0;\n}\n`;
  }
  if (lang === 'cpp') {
    return `#include <iostream>\n\nint main() {\n    int items = 3;\n    std::cout << "C++ Sandbox Ready: " << items << std::endl;\n    return 0;\n}\n`;
  }
  if (lang === 'rust') {
    return `fn main() {\n    let status = "safe_memory";\n    println!("Rust Sandbox: {}", status);\n}\n`;
  }
  return `import React, { useState } from 'react';\n\nexport default function Component() {\n  const [count, setCount] = useState(1);\n  return (\n    <div style={{ padding: '16px', color: '#F1F5F9' }}>\n      <h3>Offline React Sandbox</h3>\n      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>\n    </div>\n  );\n}\n`;
}

export default function App() {
  const [locale, setLocale] = useState<UiLocale>(() => loadUiLocale());
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => getDefaultWorkspaceState());
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);

  const [activeSection, setActiveSection] = useState<WorkspaceSection>('editor');
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('code');
  const [bottomTab, setBottomTab] = useState<BottomTab>('console');
  const [showAgentPanel, setShowAgentPanel] = useState(true);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Debugger & Sandbox State
  const debugSessionRef = useRef<SandboxDebugSession | null>(null);
  const reactCompileSeqRef = useRef(0);
  const [debugStatus, setDebugStatus] = useState<DebugStatus>('idle');
  const [activeDebugLine, setActiveDebugLine] = useState<number | null>(null);
  const [cyclesExecuted, setCyclesExecuted] = useState(0);
  const [frames, setFrames] = useState<DebugFrame[]>([]);
  const [variables, setVariables] = useState<DebugVariable[]>([]);
  const [memoryCells, setMemoryCells] = useState<SandboxMemoryCell[]>([]);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [reactPreviewHtml, setReactPreviewHtml] = useState('');
  const [sandboxPolicy, setSandboxPolicy] = useState<SandboxPolicy>(DEFAULT_SANDBOX_POLICY);

  // Security Scanner State
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [jumpSeq, setJumpSeq] = useState<{ line: number; seq: number } | null>(null);

  // Autonomous Agent Mission Control State
  const [pipelineStage, setPipelineStage] = useState<AgentPipelineStage>('idle');
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const [pendingChanges, setPendingChanges] = useState<PendingAgentChange[]>([]);
  const [isMissionRunning, setIsMissionRunning] = useState(false);

  // Local Models (SparkMoE / MEO / GGUF) State
  const runtimeRef = useRef<MeoOfflineRuntime | null>(null);
  const sparkMoeRef = useRef<SparkMoEEngine>(new SparkMoEEngine());
  const activeModelRef = useRef<LocalModelMetadata | null>(null);
  const [models, setModels] = useState<LocalModelMetadata[]>([]);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<ModelExecutionMode>('sparkmoe-ssd');
  const [qwenPreset, setQwenPreset] = useState<QwenPresetId>('qwen4-coder');
  const [ramLimitMb, setRamLimitMb] = useState<number>(1024);
  const [sparkCacheCapMb, setSparkCacheCapMb] = useState<number>(256);
  const [sparkTelemetry, setSparkTelemetry] = useState<SparkMoETelemetry | null>(null);
  const [ramStats, setRamStats] = useState<ModelRamStats | null>(null);
  const [webGpuSupported, setWebGpuSupported] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatMessages, setChatMessages] = useState<ModelChatMessage[]>([]);
  const [agentPreferredTab, setAgentPreferredTab] = useState<'mission' | 'models'>('mission');

  useEffect(() => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    saveUiLocale(locale);
  }, [locale]);

  const handleToggleLocale = useCallback(() => {
    setLocale((prev) => (prev === 'en' ? 'he' : 'en'));
  }, []);

  const appendConsole = useCallback((type: ConsoleEntry['type'], text: string) => {
    setConsoleEntries((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        text,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const updateWorkspace = useCallback((updater: (prev: WorkspaceState) => WorkspaceState) => {
    setWorkspace((prev) => {
      const next = updater(prev);
      saveWorkspaceState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    runtimeRef.current = new MeoOfflineRuntime();
    runtimeRef.current.checkWebGPUAvailable().then(setWebGpuSupported);

    Promise.all([loadWorkspaceState(), loadSavedModels(), loadSandboxPolicy()]).then(
      ([loadedWorkspace, loadedModels, loadedPolicy]) => {
        const normalizedModels = loadedModels.map((m) =>
          Array.isArray(m.expertShards) && m.expertShards.length > 0
            ? m
            : {
                ...m,
                isMoE: true,
                expertShards: indexModelExpertShards(m.fileSizeBytes, 64),
              }
        );
        setWorkspace(loadedWorkspace);
        setWorkspaceReady(true);
        setModels(normalizedModels);
        setSandboxPolicy(loadedPolicy);
        setFindings(scanWorkspaceSecurity(loadedWorkspace.files));
      }
    );

    return () => {
      runtimeRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.source !== 'meo-react-sandbox') return;
      if (event.data.type === 'stdout') {
        appendConsole('stdout', event.data.payload);
      } else if (event.data.type === 'stderr') {
        appendConsole('stderr', event.data.payload);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [appendConsole]);

  const activeFile = useMemo(
    () =>
      workspace.files.find((f) => f.id === workspace.activeFileId) ||
      workspace.files[0] ||
      null,
    [workspace.files, workspace.activeFileId]
  );

  const activePendingChange = useMemo(
    () => (activeFile ? pendingChanges.find((p) => p.fileId === activeFile.id) || null : null),
    [pendingChanges, activeFile]
  );

  const openTabs = useMemo(
    () =>
      workspace.openTabIds
        .map((id) => workspace.files.find((f) => f.id === id))
        .filter((f): f is WorkspaceFile => Boolean(f)),
    [workspace.openTabIds, workspace.files]
  );

  const handleSelectSection = (section: WorkspaceSection) => {
    setActiveSection(section);
    if (section === 'security') {
      setViewMode('code');
      setFindings(scanWorkspaceSecurity(workspace.files));
      setBottomTab('security');
    } else if (section === 'sandbox') {
      setViewMode('code');
      setBottomTab('sandbox');
    } else if (section === 'models') {
      setShowAgentPanel(true);
      setAgentPreferredTab('models');
    } else {
      setViewMode('code');
      setBottomTab('console');
    }
  };

  const handleSelectFile = (id: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      activeFileId: id,
      openTabIds: prev.openTabIds.includes(id) ? prev.openTabIds : [...prev.openTabIds, id],
    }));
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    updateWorkspace((prev) => {
      const remainingTabs = prev.openTabIds.filter((id) => id !== tabId);
      const nextActive =
        prev.activeFileId === tabId
          ? remainingTabs[remainingTabs.length - 1] || prev.files[0]?.id || ''
          : prev.activeFileId;
      return {
        ...prev,
        openTabIds: remainingTabs,
        activeFileId: nextActive,
      };
    });
  };

  const handleToggleFolder = (folderPath: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      expandedFolders: prev.expandedFolders.includes(folderPath)
        ? prev.expandedFolders.filter((p) => p !== folderPath)
        : [...prev.expandedFolders, folderPath],
    }));
  };

  const handleCreateProject = (templateId: ProjectTemplateId, projectName: string) => {
    const tpl = PROJECT_TEMPLATES.find((t) => t.id === templateId) || PROJECT_TEMPLATES[0];
    const nextState = tpl.buildState(projectName);
    setWorkspace(nextState);
    saveWorkspaceState(nextState);
    setFindings(scanWorkspaceSecurity(nextState.files));
    setPendingChanges([]);
    setDebugStatus('idle');
    setActiveDebugLine(null);
    setReactPreviewHtml('');
    appendConsole(
      'system',
      `[Project] Created '${nextState.projectName}' from template '${tpl.name}' (${nextState.files.length} files).`
    );
  };

  const handleChangeContent = (newContent: string) => {
    if (!activeFile) return;
    const updated: WorkspaceFile = {
      ...activeFile,
      content: newContent,
      updatedAt: Date.now(),
    };
    updateWorkspace((prev) => ({
      ...prev,
      files: prev.files.map((f) => (f.id === activeFile.id ? updated : f)),
    }));
    setFindings((prev) => [
      ...prev.filter((f) => f.fileId !== activeFile.id),
      ...scanFileSecurity(updated),
    ]);
  };

  const handleToggleBreakpoint = (line: number) => {
    if (!activeFile) return;
    const exists = activeFile.breakpoints.includes(line);
    const nextBreakpoints = exists
      ? activeFile.breakpoints.filter((b) => b !== line)
      : [...activeFile.breakpoints, line].sort((a, b) => a - b);

    const updated: WorkspaceFile = { ...activeFile, breakpoints: nextBreakpoints };
    updateWorkspace((prev) => ({
      ...prev,
      files: prev.files.map((f) => (f.id === activeFile.id ? updated : f)),
    }));
    debugSessionRef.current?.updateBreakpoints(nextBreakpoints);
  };

  const handleCreateFile = (name: string, folderPath: string, language: CodeLanguage) => {
    const cleanFolder = folderPath === '/' ? '' : folderPath.replace(/\/+$/, '');
    const newFile: WorkspaceFile = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name,
      folderPath: cleanFolder || '/',
      path: `${cleanFolder}/${name}`,
      language,
      content: defaultTemplateForLanguage(name, language),
      updatedAt: Date.now(),
      breakpoints: [],
    };
    updateWorkspace((prev) => ({
      ...prev,
      folders:
        cleanFolder && !prev.folders.includes(cleanFolder)
          ? [...prev.folders, cleanFolder]
          : prev.folders,
      expandedFolders:
        cleanFolder && !prev.expandedFolders.includes(cleanFolder)
          ? [...prev.expandedFolders, cleanFolder]
          : prev.expandedFolders,
      files: [...prev.files, newFile],
      openTabIds: [...prev.openTabIds, newFile.id],
      activeFileId: newFile.id,
    }));
  };

  const handleCreateFolder = (folderPath: string) => {
    const clean = folderPath.replace(/\/+$/, '');
    if (!clean) return;
    updateWorkspace((prev) => ({
      ...prev,
      folders: prev.folders.includes(clean) ? prev.folders : [...prev.folders, clean],
      expandedFolders: prev.expandedFolders.includes(clean)
        ? prev.expandedFolders
        : [...prev.expandedFolders, clean],
    }));
  };

  const handleRenameFile = (id: string, newName: string) => {
    const lang = inferLanguageFromFilename(newName);
    updateWorkspace((prev) => ({
      ...prev,
      files: prev.files.map((f) => {
        if (f.id !== id) return f;
        const prefix = f.folderPath === '/' ? '' : f.folderPath;
        return {
          ...f,
          name: newName,
          language: lang,
          path: `${prefix}/${newName}`,
          updatedAt: Date.now(),
        };
      }),
    }));
  };

  const handleRenameFolder = (oldFolderPath: string, newFolderName: string) => {
    const parts = oldFolderPath.split('/');
    parts[parts.length - 1] = newFolderName;
    const newFolderPath = parts.join('/') || `/${newFolderName}`;
    if (newFolderPath === oldFolderPath) return;

    updateWorkspace((prev) => ({
      ...prev,
      folders: prev.folders.map((p) =>
        p === oldFolderPath
          ? newFolderPath
          : p.startsWith(oldFolderPath + '/')
          ? newFolderPath + p.slice(oldFolderPath.length)
          : p
      ),
      expandedFolders: prev.expandedFolders.map((p) =>
        p === oldFolderPath
          ? newFolderPath
          : p.startsWith(oldFolderPath + '/')
          ? newFolderPath + p.slice(oldFolderPath.length)
          : p
      ),
      files: prev.files.map((f) => {
        if (f.folderPath === oldFolderPath || f.folderPath.startsWith(oldFolderPath + '/')) {
          const nextFolder = newFolderPath + f.folderPath.slice(oldFolderPath.length);
          return {
            ...f,
            folderPath: nextFolder,
            path: `${nextFolder}/${f.name}`,
          };
        }
        return f;
      }),
    }));
  };

  const handleDeleteFile = (id: string) => {
    updateWorkspace((prev) => {
      const remainingFiles = prev.files.filter((f) => f.id !== id);
      const remainingTabs = prev.openTabIds.filter((tid) => tid !== id);
      const nextActive =
        prev.activeFileId === id
          ? remainingTabs[remainingTabs.length - 1] || remainingFiles[0]?.id || ''
          : prev.activeFileId;
      return {
        ...prev,
        files: remainingFiles,
        openTabIds: remainingTabs,
        activeFileId: nextActive,
      };
    });
    setPendingChanges((prev) => prev.filter((p) => p.fileId !== id));
    setFindings((prev) => prev.filter((f) => f.fileId !== id));
  };

  const handleDeleteFolder = (folderPath: string) => {
    updateWorkspace((prev) => {
      const removedIds = new Set(
        prev.files
          .filter(
            (f) => f.folderPath === folderPath || f.folderPath.startsWith(folderPath + '/')
          )
          .map((f) => f.id)
      );
      const remainingFiles = prev.files.filter((f) => !removedIds.has(f.id));
      if (remainingFiles.length === 0) return prev;
      const remainingTabs = prev.openTabIds.filter((tid) => !removedIds.has(tid));
      const nextActive = removedIds.has(prev.activeFileId)
        ? remainingTabs[0] || remainingFiles[0].id
        : prev.activeFileId;
      return {
        ...prev,
        folders: prev.folders.filter(
          (p) => p !== folderPath && !p.startsWith(folderPath + '/')
        ),
        expandedFolders: prev.expandedFolders.filter(
          (p) => p !== folderPath && !p.startsWith(folderPath + '/')
        ),
        files: remainingFiles,
        openTabIds: remainingTabs,
        activeFileId: nextActive,
      };
    });
  };

  const handleImportLocalFiles = async (fileList: FileList, targetFolder: string) => {
    const imported: WorkspaceFile[] = [];
    const cleanFolder = targetFolder === '/' ? '' : targetFolder.replace(/\/+$/, '');
    for (const f of Array.from(fileList)) {
      const content = await f.text();
      const lang = inferLanguageFromFilename(f.name);
      const wsFile: WorkspaceFile = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        folderPath: cleanFolder || '/',
        path: `${cleanFolder}/${f.name}`,
        language: lang,
        content,
        updatedAt: Date.now(),
        breakpoints: [],
      };
      imported.push(wsFile);
    }
    if (imported.length > 0) {
      updateWorkspace((prev) => ({
        ...prev,
        files: [...prev.files, ...imported],
        openTabIds: [...prev.openTabIds, imported[0].id],
        activeFileId: imported[0].id,
      }));
      setFindings((prev) => [...prev, ...imported.flatMap(scanFileSecurity)]);
      appendConsole('system', `Imported ${imported.length} local file(s) into ${targetFolder}.`);
    }
  };

  const applyImportedWorkspace = useCallback(
    (imported: WorkspaceState | null) => {
      if (!imported || imported.files.length === 0) {
        appendConsole(
          'stderr',
          '[Workspace Import] No supported source files (.c, .cpp, .rs, .tsx, .js, .ts, .json, .md) found in selected folder.'
        );
        return;
      }
      setWorkspace(imported);
      saveWorkspaceState(imported);
      setPendingChanges([]);
      setDebugStatus('idle');
      setActiveDebugLine(null);
      setFrames([]);
      setVariables([]);
      setMemoryCells([]);
      const nextFindings = scanWorkspaceSecurity(imported.files);
      setFindings(nextFindings);

      const entryFile =
        imported.files.find((f) => f.id === imported.activeFileId) || imported.files[0];
      if (entryFile?.language === 'react') {
        setReactPreviewHtml(
          buildOfflineReactSandboxHtml(entryFile.content, imported.files, entryFile.path)
        );
      } else {
        setReactPreviewHtml('');
      }

      appendConsole(
        'system',
        `[Workspace Import] Loaded local folder '${imported.projectName}' (${imported.files.length} files across ${imported.folders.length} folders) into IndexedDB.`
      );
    },
    [appendConsole]
  );

  const handleTriggerUploadFolder = useCallback(async () => {
    if (canUseNativeDirectoryPicker()) {
      try {
        const imported = await pickAndImportDirectoryNative();
        if (imported) {
          applyImportedWorkspace(imported);
        }
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        // Fallback to webkitdirectory input if File System Access fails
      }
    }
    folderInputRef.current?.click();
  }, [applyImportedWorkspace]);

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const imported = await importWorkspaceFromDirectoryFileList(files);
      applyImportedWorkspace(imported);
      e.target.value = '';
    }
  };

  const handleDownloadProjectZip = () => {
    const blob = buildProjectZipBlob(
      workspace.projectName,
      workspace.folders,
      workspace.files
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workspace.projectName || 'meo-project'}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    appendConsole(
      'system',
      `[Export] Packaged ${workspace.files.length} files into ${workspace.projectName}.zip.`
    );
  };

  const handleExportWorkspace = () => {
    const payload = JSON.stringify(
      { exportedAt: new Date().toISOString(), workspace },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workspace.projectName || 'meo-studio'}-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyDebugSnapshot = useCallback((snap: DebugSnapshot) => {
    setDebugStatus(snap.status);
    setActiveDebugLine(snap.status === 'paused' ? snap.line : null);
    setCyclesExecuted(snap.cyclesExecuted);
    setFrames(snap.frames);
    setVariables(snap.variables);
    setMemoryCells(snap.memoryCells);

    const entries: ConsoleEntry[] = [];
    snap.stdout.forEach((line, idx) =>
      entries.push({
        id: `out-${idx}-${Date.now()}`,
        type: 'stdout',
        text: line,
        timestamp: Date.now(),
      })
    );
    snap.stderr.forEach((line, idx) =>
      entries.push({
        id: `err-${idx}-${Date.now()}`,
        type: 'stderr',
        text: line,
        timestamp: Date.now(),
      })
    );
    if (snap.status === 'paused') {
      entries.push({
        id: `pause-${Date.now()}`,
        type: 'system',
        text: `[Debugger] Paused at line ${snap.line} inside isolated sandbox`,
        timestamp: Date.now(),
      });
    } else if (snap.status === 'completed') {
      entries.push({
        id: `done-${Date.now()}`,
        type: 'system',
        text: `[Sandbox] Execution finished (${snap.cyclesExecuted} CPU cycles, network isolated).`,
        timestamp: Date.now(),
      });
    }
    setConsoleEntries(entries);
  }, []);

  const compileAndMountReactPreview = useCallback(
    (target: WorkspaceFile, liveFiles: WorkspaceFile[]) => {
      const seq = ++reactCompileSeqRef.current;
      const syncHtml = buildOfflineReactSandboxHtml(target.content, liveFiles, target.path);
      setReactPreviewHtml(syncHtml);

      buildOfflineReactSandboxHtmlFromIndexedDB(target.path, liveFiles, target.content)
        .then((dbMergedHtml) => {
          if (seq === reactCompileSeqRef.current && dbMergedHtml !== syncHtml) {
            setReactPreviewHtml(dbMergedHtml);
          }
        })
        .catch(() => {
          // Keep synchronous workspace bundle if IndexedDB read is unavailable
        });
    },
    []
  );

  const handleRunActiveFile = useCallback(
    (targetFileOverride?: WorkspaceFile) => {
      const target = targetFileOverride || activeFile;
      if (!target) return;

      if (target.language === 'react') {
        setConsoleEntries([]);
        appendConsole(
          'system',
          `[Sandbox] Bundling ${target.path} + workspace modules from IndexedDB...`
        );
        compileAndMountReactPreview(target, workspace.files);
        setDebugStatus('completed');
        setBottomTab('preview');
        return;
      }

      const session = new SandboxDebugSession(
        target.language,
        target.name,
        target.content,
        target.breakpoints,
        sandboxPolicy
      );
      debugSessionRef.current = session;
      const snap = session.start(false);
      applyDebugSnapshot(snap);
      setBottomTab(snap.status === 'paused' ? 'debugger' : 'console');
    },
    [
      activeFile,
      workspace.files,
      sandboxPolicy,
      appendConsole,
      applyDebugSnapshot,
      compileAndMountReactPreview,
    ]
  );

  const handleChangeViewMode = useCallback(
    (mode: WorkspaceViewMode) => {
      setViewMode(mode);
      if (mode === 'preview' && activeFile) {
        if (activeFile.language === 'react') {
          compileAndMountReactPreview(activeFile, workspace.files);
        } else if (debugStatus === 'idle') {
          handleRunActiveFile(activeFile);
        }
      }
    },
    [activeFile, workspace.files, debugStatus, handleRunActiveFile, compileAndMountReactPreview]
  );

  const handleSelectFileInPreview = useCallback(
    (fileId: string) => {
      const target = workspace.files.find((f) => f.id === fileId);
      handleSelectFile(fileId);
      if (target) {
        handleRunActiveFile(target);
      }
    },
    [workspace.files, handleRunActiveFile]
  );

  const handleStartDebug = () => {
    if (!activeFile || activeFile.language === 'react') return;
    const session = new SandboxDebugSession(
      activeFile.language,
      activeFile.name,
      activeFile.content,
      activeFile.breakpoints,
      sandboxPolicy
    );
    debugSessionRef.current = session;
    const snap = session.start(true);
    applyDebugSnapshot(snap);
    setBottomTab('debugger');
  };

  const handleStepDebug = useCallback(() => {
    if (!debugSessionRef.current) return;
    const snap = debugSessionRef.current.advance('step');
    applyDebugSnapshot(snap);
  }, [applyDebugSnapshot]);

  const handleContinueDebug = useCallback(() => {
    if (!debugSessionRef.current) return;
    const snap = debugSessionRef.current.advance('continue');
    applyDebugSnapshot(snap);
  }, [applyDebugSnapshot]);

  const handleStopDebug = useCallback(() => {
    debugSessionRef.current = null;
    setDebugStatus('idle');
    setActiveDebugLine(null);
    appendConsole('system', '[Debugger] Session terminated.');
  }, [appendConsole]);

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F5' && e.shiftKey) {
        e.preventDefault();
        handleStopDebug();
      } else if (e.key === 'F5') {
        e.preventDefault();
        if (debugStatus === 'paused') {
          handleContinueDebug();
        } else {
          handleRunActiveFile();
        }
      } else if (e.key === 'F10' && debugStatus === 'paused') {
        e.preventDefault();
        handleStepDebug();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveWorkspaceState(workspace);
        if (activeFile) {
          appendConsole('system', `[Storage] Saved ${activeFile.name} to offline IndexedDB.`);
        }
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [
    workspace,
    activeFile,
    debugStatus,
    handleRunActiveFile,
    handleContinueDebug,
    handleStepDebug,
    handleStopDebug,
    appendConsole,
  ]);

  const handleScanActiveFile = () => {
    if (!activeFile) return;
    const fileFindings = scanFileSecurity(activeFile);
    setFindings((prev) => [
      ...prev.filter((f) => f.fileId !== activeFile.id),
      ...fileFindings,
    ]);
    setBottomTab('security');
  };

  const handleScanWorkspace = () => {
    setFindings(scanWorkspaceSecurity(workspace.files));
    setBottomTab('security');
  };

  const handleJumpToFinding = (finding: SecurityFinding) => {
    handleSelectFile(finding.fileId);
    setJumpSeq((prev) => ({ line: finding.line, seq: (prev?.seq ?? 0) + 1 }));
  };

  const handleAutoFixFinding = (finding: SecurityFinding) => {
    const target = workspace.files.find((f) => f.id === finding.fileId);
    if (!target) return;
    const fixedContent = applySecurityAutoFix(target, finding);
    if (!fixedContent) return;
    const updated: WorkspaceFile = {
      ...target,
      content: fixedContent,
      updatedAt: Date.now(),
    };
    updateWorkspace((prev) => ({
      ...prev,
      files: prev.files.map((f) => (f.id === target.id ? updated : f)),
    }));
    setFindings((prev) => [
      ...prev.filter((f) => f.fileId !== target.id),
      ...scanFileSecurity(updated),
    ]);
    appendConsole(
      'security',
      `[Security Fix] Applied ${finding.cwe} fix to ${target.name} line ${finding.line}`
    );
  };

  const handleFixAllActiveFile = () => {
    if (!activeFile) return;
    const { patchedContent, fixCount } = applyAllFixableIssues(activeFile);
    if (fixCount === 0) return;
    const updated: WorkspaceFile = {
      ...activeFile,
      content: patchedContent,
      updatedAt: Date.now(),
    };
    updateWorkspace((prev) => ({
      ...prev,
      files: prev.files.map((f) => (f.id === activeFile.id ? updated : f)),
    }));
    setFindings((prev) => [
      ...prev.filter((f) => f.fileId !== activeFile.id),
      ...scanFileSecurity(updated),
    ]);
    appendConsole(
      'security',
      `[Security Fix] Applied ${fixCount} auto-fix(es) to ${activeFile.name}.`
    );
  };

  const activeModelObj = useMemo(
    () => models.find((m) => m.id === activeModelId) || null,
    [models, activeModelId]
  );

  useEffect(() => {
    activeModelRef.current = activeModelObj;
  }, [activeModelObj]);

  // Automatically signal SparkMoE to stream/activate the expert matching the active file language
  useEffect(() => {
    if (
      executionMode !== 'sparkmoe-ssd' ||
      !activeFile ||
      !activeModelObj ||
      !runtimeRef.current ||
      isMissionRunning
    ) {
      return;
    }
    const targetExpert = sparkMoeRef.current.mapLanguageToExpert(activeFile.language);
    if (sparkTelemetry?.activeExpertId === targetExpert) return;

    let cancelled = false;
    sparkMoeRef.current
      .activateExpert(activeModelObj, targetExpert, runtimeRef.current)
      .then((telemetry) => {
        if (!cancelled) {
          setSparkTelemetry(telemetry);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    executionMode,
    activeFile?.id,
    activeFile?.language,
    activeModelObj,
    isMissionRunning,
    sparkTelemetry?.activeExpertId,
  ]);

  const activateModelInRam = async (
    model: LocalModelMetadata,
    mode: ModelExecutionMode,
    limitMb: number,
    sampleBytes?: ArrayBuffer,
    cacheCapOverrideMb?: number
  ) => {
    if (!runtimeRef.current) return;
    setIsLoadingModel(true);
    setActiveModelId(model.id);
    activeModelRef.current = model;

    const effectiveCapMb = cacheCapOverrideMb ?? sparkCacheCapMb;
    if (mode === 'sparkmoe-ssd') {
      sparkMoeRef.current.resetCache();
      sparkMoeRef.current.setCacheCapMb(effectiveCapMb);
    }

    const stats = await runtimeRef.current.loadModelIntoRam(model, limitMb, mode, sampleBytes);
    setRamStats(stats);
    setModels((prev) => prev.map((m) => ({ ...m, loadedInRam: m.id === model.id })));

    if (mode === 'sparkmoe-ssd') {
      const initialExpert = sparkMoeRef.current.mapLanguageToExpert(
        activeFile?.language || 'c'
      );
      const telemetry = await sparkMoeRef.current.activateExpert(
        model,
        initialExpert,
        runtimeRef.current
      );
      setSparkTelemetry(telemetry);
      appendConsole(
        'system',
        `[SparkMoE SSD] Indexed ${model.expertShards.length} shards for ${model.name}. Streamed ${telemetry.activeExpertLabel} (${telemetry.diskReadMbps} MB/s, ${telemetry.cacheUsedMb}/${telemetry.cacheCapMb} MB cache).`
      );
    } else {
      setSparkTelemetry(null);
      appendConsole(
        'system',
        `[Model Engine] Mounted ${model.name} (${stats.allocatedMb} MB in ${stats.backendLabel})`
      );
    }
    setIsLoadingModel(false);
  };

  const handleImportModelFile = async (file: File) => {
    try {
      const metadata = await parseLocalModelFile(file);
      sparkMoeRef.current.registerDiskHandle(metadata.id, file);

      const nextMode: ModelExecutionMode =
        executionMode === 'sparkmoe-ssd'
          ? 'sparkmoe-ssd'
          : metadata.format === 'meo'
          ? 'meo-ram'
          : executionMode === 'meo-ram'
          ? 'gguf-cpu'
          : executionMode;
      setExecutionMode(nextMode);
      setModels((prev) => [...prev, metadata]);
      await saveModelMetadata(metadata);

      const sampleSlice = await file.slice(0, Math.min(file.size, 2 * 1024 * 1024)).arrayBuffer();
      await activateModelInRam(metadata, nextMode, ramLimitMb, sampleSlice);
    } catch (err) {
      appendConsole(
        'stderr',
        err instanceof Error ? err.message : 'Failed to parse local model file.'
      );
    }
  };

  const handleCreateSampleMeo = async (
    downloadFile: boolean,
    presetOverride?: QwenPresetId
  ): Promise<LocalModelMetadata> => {
    const chosenPreset = presetOverride ?? qwenPreset;
    const { blob, metadata } = buildSampleMeoBinary(chosenPreset);
    sparkMoeRef.current.registerDiskHandle(metadata.id, blob);

    if (downloadFile) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = metadata.name;
      a.click();
      URL.revokeObjectURL(url);
    }
    const targetMode: ModelExecutionMode =
      executionMode === 'sparkmoe-ssd' ? 'sparkmoe-ssd' : 'meo-ram';
    setExecutionMode(targetMode);
    setModels((prev) => {
      const filtered = prev.filter((m) => !m.isBuiltinSample);
      return [...filtered, metadata];
    });
    await saveModelMetadata(metadata);
    const buf = await blob.arrayBuffer();
    await activateModelInRam(metadata, targetMode, ramLimitMb, buf);
    return metadata;
  };

  const handleChangeQwenPreset = async (preset: QwenPresetId) => {
    setQwenPreset(preset);
    if (!activeModelRef.current || activeModelRef.current.isBuiltinSample) {
      await handleCreateSampleMeo(false, preset);
    }
  };

  const handleSelectModel = async (modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    if (!model) return;
    const mode: ModelExecutionMode =
      executionMode === 'sparkmoe-ssd'
        ? 'sparkmoe-ssd'
        : model.format === 'meo'
        ? 'meo-ram'
        : executionMode;
    setExecutionMode(mode);
    await activateModelInRam(model, mode, ramLimitMb);
  };

  const handleRemoveModel = async (modelId: string) => {
    sparkMoeRef.current.removeDiskHandle(modelId);
    if (activeModelId === modelId) {
      runtimeRef.current?.unloadModel();
      sparkMoeRef.current.resetCache();
      setActiveModelId(null);
      activeModelRef.current = null;
      setRamStats(null);
      setSparkTelemetry(null);
    }
    setModels((prev) => prev.filter((m) => m.id !== modelId));
    await removeModelMetadata(modelId);
  };

  const handleChangeExecutionMode = async (mode: ModelExecutionMode) => {
    setExecutionMode(mode);
    const active = models.find((m) => m.id === activeModelId);
    if (active) {
      await activateModelInRam(active, mode, ramLimitMb);
    } else if (mode === 'sparkmoe-ssd') {
      setSparkTelemetry(sparkMoeRef.current.getTelemetry(true, null));
    } else {
      setSparkTelemetry(null);
    }
  };

  const handleChangeRamLimitMb = async (mb: number) => {
    setRamLimitMb(mb);
    const active = models.find((m) => m.id === activeModelId);
    if (active) {
      await activateModelInRam(active, executionMode, mb);
    }
  };

  const handleChangeSparkCacheCapMb = (mb: number) => {
    setSparkCacheCapMb(mb);
    sparkMoeRef.current.setCacheCapMb(mb);
    setSparkTelemetry(
      sparkMoeRef.current.getTelemetry(executionMode === 'sparkmoe-ssd', activeModelRef.current)
    );
  };

  const handleActivateExpertShard = async (expertId: ExpertRoleId) => {
    if (!runtimeRef.current) return;
    let model = activeModelRef.current;
    if (!model) {
      model = await handleCreateSampleMeo(false);
    }
    if (executionMode !== 'sparkmoe-ssd') {
      setExecutionMode('sparkmoe-ssd');
    }
    const telemetry = await sparkMoeRef.current.activateExpert(
      model,
      expertId,
      runtimeRef.current
    );
    setSparkTelemetry(telemetry);
    appendConsole(
      'system',
      `[SparkMoE SSD] Activated ${telemetry.activeExpertLabel} (${telemetry.diskReadMbps} MB/s SSD · ${telemetry.cacheUsedMb}/${telemetry.cacheCapMb} MB cache)`
    );
  };

  // Autonomous Agent Mission Launcher
  const handleLaunchMission = async (goal: string) => {
    if (!runtimeRef.current || isMissionRunning) return;

    let mountedModel = activeModelRef.current;
    if (!mountedModel) {
      mountedModel = await handleCreateSampleMeo(false);
    }

    setIsMissionRunning(true);
    setAgentLogs([]);
    setAgentTasks([]);
    setPipelineStage('planning');
    appendConsole(
      'system',
      `[Agent Mission] Launching ${
        executionMode === 'sparkmoe-ssd' ? 'SparkMoE SSD-streamed' : 'offline MEO'
      } mission: "${goal}"`
    );

    try {
      await executeAutonomousMission(
        goal,
        workspace,
        sandboxPolicy,
        runtimeRef.current,
        {
          onStageChange: setPipelineStage,
          onTasksUpdate: setAgentTasks,
          onRouteExpert: async (expertId: ExpertRoleId) => {
            if (executionMode !== 'sparkmoe-ssd' || !runtimeRef.current || !mountedModel) {
              return null;
            }
            const telemetry = await sparkMoeRef.current.activateExpert(
              mountedModel,
              expertId,
              runtimeRef.current
            );
            setSparkTelemetry(telemetry);
            return telemetry;
          },
          onLog: (entry) => {
            setAgentLogs((prev) => [...prev, entry]);
            appendConsole(
              entry.stage === 'self-healing' ? 'security' : 'system',
              `[${entry.agent}] ${entry.message}`
            );
          },
          onApplyFiles: (nextWs, changes) => {
            setWorkspace(nextWs);
            saveWorkspaceState(nextWs);
            setPendingChanges(changes);
            setFindings(scanWorkspaceSecurity(nextWs.files));
          },
          onSecurityRefresh: (updatedFiles) => {
            setFindings(scanWorkspaceSecurity(updatedFiles));
          },
        },
        locale
      );
    } finally {
      setIsMissionRunning(false);
    }
  };

  const handleAcceptChange = (fileId: string) => {
    setPendingChanges((prev) => prev.filter((p) => p.fileId !== fileId));
    appendConsole('system', `[Agent Review] Accepted changes for file.`);
  };

  const handleRejectChange = (fileId: string) => {
    const ch = pendingChanges.find((p) => p.fileId === fileId);
    if (!ch) return;

    if (ch.changeType === 'added') {
      handleDeleteFile(fileId);
    } else {
      updateWorkspace((prev) => ({
        ...prev,
        files: prev.files.map((f) =>
          f.id === fileId
            ? { ...f, content: ch.originalContent, updatedAt: Date.now() }
            : f
        ),
      }));
      setFindings((prev) => scanWorkspaceSecurity(workspace.files));
    }
    setPendingChanges((prev) => prev.filter((p) => p.fileId !== fileId));
    appendConsole('system', `[Agent Review] Reverted changes to ${ch.fileName}.`);
  };

  const handleAcceptAllChanges = () => {
    setPendingChanges([]);
    appendConsole('system', '[Agent Review] Accepted all agent-authored changes.');
  };

  const handleRejectAllChanges = () => {
    const addedIds = new Set(
      pendingChanges.filter((p) => p.changeType === 'added').map((p) => p.fileId)
    );
    const modifiedMap = new Map(
      pendingChanges
        .filter((p) => p.changeType === 'modified')
        .map((p) => [p.fileId, p.originalContent])
    );

    updateWorkspace((prev) => {
      const nextFiles = prev.files
        .filter((f) => !addedIds.has(f.id))
        .map((f) =>
          modifiedMap.has(f.id)
            ? { ...f, content: modifiedMap.get(f.id)!, updatedAt: Date.now() }
            : f
        );
      const safeFiles = nextFiles.length > 0 ? nextFiles : prev.files;
      const nextTabs = prev.openTabIds.filter((id) => safeFiles.some((f) => f.id === id));
      return {
        ...prev,
        files: safeFiles,
        openTabIds: nextTabs.length > 0 ? nextTabs : [safeFiles[0].id],
        activeFileId: safeFiles.some((f) => f.id === prev.activeFileId)
          ? prev.activeFileId
          : safeFiles[0].id,
      };
    });
    setPendingChanges([]);
    appendConsole('system', '[Agent Review] Reverted all pending agent changes.');
  };

  const handleSendPrompt = async (prompt: string) => {
    if (!runtimeRef.current) return;

    let mountedModel = activeModelRef.current;
    if (!mountedModel) {
      mountedModel = await handleCreateSampleMeo(false);
    }

    if (executionMode === 'sparkmoe-ssd' && mountedModel) {
      const lower = prompt.toLowerCase();
      const targetExpert: ExpertRoleId =
        lower.includes('security') || lower.includes('cwe') || lower.includes('fix')
          ? 'expert-security'
          : sparkMoeRef.current.mapLanguageToExpert(activeFile?.language || 'c');
      const telemetry = await sparkMoeRef.current.activateExpert(
        mountedModel,
        targetExpert,
        runtimeRef.current
      );
      setSparkTelemetry(telemetry);
    }

    const userMsg: ModelChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: prompt,
      timestamp: Date.now(),
    };

    const assistantId = `ast-${Date.now()}`;
    const assistantMsg: ModelChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
      executionMode,
    };

    setChatMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsGenerating(true);

    const activeFindings = activeFile ? scanFileSecurity(activeFile) : [];
    const findingsSummary = activeFindings
      .map((f) => `- [${f.cwe}] Line ${f.line}: ${f.title}`)
      .join('\n');

    const result = await runtimeRef.current.runInference(
      {
        prompt,
        activeFileId: activeFile?.id || '',
        activeFileName: activeFile?.name || 'untitled',
        activeLanguage: activeFile?.language || 'c',
        activeCode: activeFile?.content || '',
        findingsSummary,
        executionMode,
      },
      (chunk) => {
        setChatMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + chunk } : m))
        );
      }
    );

    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              tokensGenerated: result.tokensGenerated,
              tokensPerSec: result.tokensPerSec,
              suggestedFix: result.suggestedFix,
            }
          : m
      )
    );
    setIsGenerating(false);
  };

  const handleApplySuggestedFix = (messageId: string, fix: SuggestedCodeFix) => {
    const target = workspace.files.find((f) => f.id === fix.fileId);
    if (!target) return;

    const updated: WorkspaceFile = {
      ...target,
      content: fix.patchedContent,
      updatedAt: Date.now(),
    };
    updateWorkspace((prev) => ({
      ...prev,
      files: prev.files.map((f) => (f.id === target.id ? updated : f)),
      openTabIds: prev.openTabIds.includes(target.id)
        ? prev.openTabIds
        : [...prev.openTabIds, target.id],
      activeFileId: target.id,
    }));
    setFindings((prev) => [
      ...prev.filter((f) => f.fileId !== target.id),
      ...scanFileSecurity(updated),
    ]);
    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === messageId && m.suggestedFix
          ? { ...m, suggestedFix: { ...m.suggestedFix, applied: true } }
          : m
      )
    );
    appendConsole('security', `[AI Patch] Applied automated fix directly to ${target.name}.`);
  };

  return (
    <div
      dir={locale === 'he' ? 'rtl' : 'ltr'}
      className="h-screen w-screen overflow-hidden flex flex-col bg-[#0B0F17] text-slate-100"
    >
      <TopBar
        locale={locale}
        onToggleLocale={handleToggleLocale}
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        onRunCode={() => handleRunActiveFile()}
      />

      <WorkspaceViewBar
        locale={locale}
        viewMode={viewMode}
        onChangeViewMode={handleChangeViewMode}
        projectName={workspace.projectName}
        activeFile={activeFile}
        showAgentPanel={showAgentPanel}
        onToggleAgentPanel={() => setShowAgentPanel((v) => !v)}
      />

      {/* Hidden webkitdirectory input fallback for local folder upload */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
        className="hidden"
        onChange={handleFolderInputChange}
      />

      <main className="flex-1 min-h-0 flex overflow-hidden">
        {viewMode === 'code' && (
          <SidebarExplorer
            locale={locale}
            projectName={workspace.projectName}
            folders={workspace.folders}
            files={workspace.files}
            expandedFolders={workspace.expandedFolders}
            activeFileId={activeFile?.id || ''}
            pendingChanges={pendingChanges}
            onOpenNewProjectModal={() => setShowNewProjectModal(true)}
            onSelectFile={handleSelectFile}
            onToggleFolder={handleToggleFolder}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onRenameFile={handleRenameFile}
            onRenameFolder={handleRenameFolder}
            onDeleteFile={handleDeleteFile}
            onDeleteFolder={handleDeleteFolder}
            onImportLocalFiles={handleImportLocalFiles}
            onTriggerUploadFolder={handleTriggerUploadFolder}
            onDownloadProjectZip={handleDownloadProjectZip}
            onExportWorkspace={handleExportWorkspace}
            onAcceptChange={handleAcceptChange}
            onRejectChange={handleRejectChange}
          />
        )}

        {viewMode === 'preview' ? (
          <PreviewWorkspaceView
            locale={locale}
            files={workspace.files}
            activeFile={activeFile}
            onSelectFile={handleSelectFileInPreview}
            onOpenInCode={() => setViewMode('code')}
            onRunPreview={() => handleRunActiveFile()}
            reactPreviewHtml={reactPreviewHtml}
            consoleEntries={consoleEntries}
            debugStatus={debugStatus}
            cyclesExecuted={cyclesExecuted}
            frames={frames}
            variables={variables}
            memoryCells={memoryCells}
          />
        ) : viewMode === 'files' ? (
          <FilesWorkspaceView
            locale={locale}
            projectName={workspace.projectName}
            folders={workspace.folders}
            files={workspace.files}
            findings={findings}
            activeFileId={activeFile?.id || ''}
            onOpenFileInEditor={(fileId) => {
              handleSelectFile(fileId);
              setViewMode('code');
            }}
            onTriggerUploadFolder={handleTriggerUploadFolder}
            onOpenNewProjectModal={() => setShowNewProjectModal(true)}
            onDownloadProjectZip={handleDownloadProjectZip}
            onDeleteFile={handleDeleteFile}
          />
        ) : (
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {openTabs.length > 0 && (
              <div className="h-9 shrink-0 border-b border-slate-800/90 bg-[#0D131F] flex items-center overflow-x-auto">
                {openTabs.map((tab) => {
                  const isTabActive = activeFile?.id === tab.id;
                  const pending = pendingChanges.find((p) => p.fileId === tab.id);
                  return (
                    <div
                      key={tab.id}
                      onClick={() => handleSelectFile(tab.id)}
                      className={`group h-full flex items-center gap-2 px-3.5 border-e border-slate-800/80 text-xs font-mono cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                        isTabActive
                          ? 'bg-[#0B0F17] text-slate-100 border-t-2 border-t-blue-500'
                          : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200 border-t-2 border-t-transparent'
                      }`}
                    >
                      <span
                        dir="ltr"
                        className={
                          pending?.changeType === 'added'
                            ? 'text-emerald-300'
                            : pending?.changeType === 'modified'
                            ? 'text-amber-300'
                            : ''
                        }
                      >
                        {tab.name}
                      </span>
                      {openTabs.length > 1 && (
                        <button
                          onClick={(e) => handleCloseTab(e, tab.id)}
                          title="Close Tab"
                          className="p-0.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-700/60 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {workspaceReady && activeFile ? (
              <CodeEditor
                locale={locale}
                file={activeFile}
                debugStatus={debugStatus}
                activeDebugLine={activeDebugLine}
                findings={findings}
                pendingChange={activePendingChange}
                jumpToLineRequest={jumpSeq}
                onChangeContent={handleChangeContent}
                onToggleBreakpoint={handleToggleBreakpoint}
                onRun={() => handleRunActiveFile()}
                onStartDebug={handleStartDebug}
                onStepDebug={handleStepDebug}
                onContinueDebug={handleContinueDebug}
                onStopDebug={handleStopDebug}
                onScanFile={handleScanActiveFile}
                onAcceptChange={handleAcceptChange}
                onRejectChange={handleRejectChange}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
                Loading offline project workspace...
              </div>
            )}

            <BottomPanel
              locale={locale}
              activeTab={bottomTab}
              onSelectTab={setBottomTab}
              language={activeFile?.language || 'c'}
              consoleEntries={consoleEntries}
              onClearConsole={() => setConsoleEntries([])}
              debugStatus={debugStatus}
              cyclesExecuted={cyclesExecuted}
              frames={frames}
              variables={variables}
              memoryCells={memoryCells}
              reactPreviewHtml={reactPreviewHtml}
              findings={findings}
              onJumpToFinding={handleJumpToFinding}
              onAutoFixFinding={handleAutoFixFinding}
              onFixAllActiveFile={handleFixAllActiveFile}
              onScanWorkspace={handleScanWorkspace}
              sandboxPolicy={sandboxPolicy}
              onUpdateSandboxPolicy={(next) => {
                setSandboxPolicy(next);
                saveSandboxPolicy(next);
              }}
            />
          </div>
        )}

        {showAgentPanel && (
          <AgentPanel
            locale={locale}
            preferredTab={agentPreferredTab}
            pipelineStage={pipelineStage}
            agentTasks={agentTasks}
            agentLogs={agentLogs}
            pendingChanges={pendingChanges}
            isMissionRunning={isMissionRunning}
            onLaunchMission={handleLaunchMission}
            onInspectChange={handleSelectFile}
            onAcceptChange={handleAcceptChange}
            onRejectChange={handleRejectChange}
            onAcceptAllChanges={handleAcceptAllChanges}
            onRejectAllChanges={handleRejectAllChanges}
            models={models}
            activeModelId={activeModelId}
            executionMode={executionMode}
            qwenPreset={qwenPreset}
            ramLimitMb={ramLimitMb}
            ramStats={ramStats}
            sparkCacheCapMb={sparkCacheCapMb}
            sparkTelemetry={sparkTelemetry}
            webGpuSupported={webGpuSupported}
            isLoadingModel={isLoadingModel}
            isGenerating={isGenerating}
            messages={chatMessages}
            onImportModelFile={handleImportModelFile}
            onCreateSampleMeo={handleCreateSampleMeo}
            onChangeQwenPreset={handleChangeQwenPreset}
            onSelectModel={handleSelectModel}
            onRemoveModel={handleRemoveModel}
            onChangeExecutionMode={handleChangeExecutionMode}
            onChangeRamLimitMb={handleChangeRamLimitMb}
            onChangeSparkCacheCapMb={handleChangeSparkCacheCapMb}
            onActivateExpertShard={handleActivateExpertShard}
            onSendPrompt={handleSendPrompt}
            onApplySuggestedFix={handleApplySuggestedFix}
          />
        )}
      </main>

      <NewProjectModal
        locale={locale}
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onCreateProject={handleCreateProject}
      />
    </div>
  );
}
