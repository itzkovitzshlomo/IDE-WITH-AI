import { CodeLanguage, WorkspaceFile, WorkspaceState } from '../types/ide';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'target',
  '.next',
  '.nuxt',
  '.cache',
  '.vite',
  '__pycache__',
  'coverage',
  '.idea',
  '.vscode',
]);

const SUPPORTED_TEXT_EXTS = new Set([
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cc',
  '.cxx',
  '.hh',
  '.rs',
  '.tsx',
  '.jsx',
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.json',
  '.toml',
  '.md',
  '.txt',
  '.yaml',
  '.yml',
]);

const MAX_FILE_BYTES = 512 * 1024;
const MAX_IMPORTED_FILES = 250;

export function inferLanguageFromFilename(name: string): CodeLanguage {
  const lower = name.toLowerCase();
  if (lower.endsWith('.rs')) return 'rust';
  if (
    lower.endsWith('.cpp') ||
    lower.endsWith('.hpp') ||
    lower.endsWith('.cc') ||
    lower.endsWith('.cxx') ||
    lower.endsWith('.hh')
  ) {
    return 'cpp';
  }
  if (lower.endsWith('.c') || lower.endsWith('.h')) return 'c';
  return 'react';
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

function isSupportedSourceFile(filename: string, sizeBytes: number): boolean {
  if (sizeBytes > MAX_FILE_BYTES) return false;
  if (filename === '.DS_Store' || filename === 'Thumbs.db') return false;
  const ext = getExtension(filename);
  if (SUPPORTED_TEXT_EXTS.has(ext)) return true;
  const lower = filename.toLowerCase();
  return lower === 'makefile' || lower === 'cmakelists.txt' || lower === 'cargo.lock';
}

interface RawImportedEntry {
  relativePath: string;
  content: string;
}

export function buildWorkspaceFromImportedEntries(
  rootFolderName: string,
  entries: RawImportedEntry[]
): WorkspaceState | null {
  if (entries.length === 0) return null;

  const folderSet = new Set<string>();
  const files: WorkspaceFile[] = [];
  const now = Date.now();

  for (let i = 0; i < entries.length && files.length < MAX_IMPORTED_FILES; i++) {
    const entry = entries[i];
    const cleanRel = entry.relativePath.replace(/^\/+|\/+$/g, '');
    if (!cleanRel) continue;

    const segments = cleanRel.split('/').filter(Boolean);
    if (segments.length === 0) continue;

    const fileName = segments[segments.length - 1];
    const dirSegments = segments.slice(0, -1);

    let currentFolder = '';
    for (const seg of dirSegments) {
      currentFolder = `${currentFolder}/${seg}`;
      folderSet.add(currentFolder);
    }

    const folderPath = currentFolder || '/';
    const fullPath = folderPath === '/' ? `/${fileName}` : `${folderPath}/${fileName}`;

    files.push({
      id: `imp-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      name: fileName,
      folderPath,
      path: fullPath,
      language: inferLanguageFromFilename(fileName),
      content: entry.content,
      updatedAt: now,
      breakpoints: [],
    });
  }

  if (files.length === 0) return null;

  const sortedFolders = Array.from(folderSet).sort((a, b) => a.localeCompare(b));
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

  // Prefer opening a realistic entry point first
  const entryPriority = [
    'main.c',
    'main.cpp',
    'main.rs',
    'app.tsx',
    'index.tsx',
    'app.jsx',
    'index.js',
  ];
  const preferredFile =
    sortedFiles.find((f) => entryPriority.includes(f.name.toLowerCase())) ||
    sortedFiles.find((f) =>
      ['.c', '.cpp', '.rs', '.tsx', '.jsx'].includes(getExtension(f.name))
    ) ||
    sortedFiles[0];

  const hasReact = sortedFiles.some((f) => f.language === 'react');
  const hasRust = sortedFiles.some((f) => f.language === 'rust');
  const hasC = sortedFiles.some((f) => f.language === 'c' || f.language === 'cpp');
  const templateId =
    hasReact && !hasRust && !hasC
      ? 'react'
      : hasRust && !hasReact && !hasC
      ? 'rust'
      : hasC && !hasReact && !hasRust
      ? 'c-cpp'
      : 'polyglot';

  const topLevelFolders = sortedFolders.filter((f) => !f.slice(1).includes('/'));
  const expandedFolders = Array.from(
    new Set([...topLevelFolders, preferredFile.folderPath].filter((f) => f !== '/'))
  );

  const openTabIds = sortedFiles
    .slice(0, 4)
    .map((f) => f.id)
    .includes(preferredFile.id)
    ? sortedFiles.slice(0, 4).map((f) => f.id)
    : [preferredFile.id, ...sortedFiles.slice(0, 3).map((f) => f.id)];

  return {
    projectName: rootFolderName || 'imported-workspace',
    templateId,
    folders: sortedFolders,
    files: sortedFiles,
    openTabIds,
    activeFileId: preferredFile.id,
    expandedFolders,
  };
}

interface DirectoryHandleLike {
  name: string;
  values: () => AsyncIterable<FileSystemHandleLike>;
}

type FileSystemHandleLike =
  | {
      kind: 'file';
      name: string;
      getFile: () => Promise<File>;
    }
  | {
      kind: 'directory';
      name: string;
      values: () => AsyncIterable<FileSystemHandleLike>;
    };

export function canUseNativeDirectoryPicker(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.self === window.top &&
      typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
        'function'
    );
  } catch {
    return false;
  }
}

export async function pickAndImportDirectoryNative(): Promise<WorkspaceState | null> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike>;
    }
  ).showDirectoryPicker;
  if (!picker) return null;

  const dirHandle = await picker({ mode: 'read' });
  const entries: RawImportedEntry[] = [];

  async function walk(handle: DirectoryHandleLike, prefix: string) {
    for await (const child of handle.values()) {
      if (entries.length >= MAX_IMPORTED_FILES) break;
      if (child.kind === 'directory') {
        if (IGNORED_DIRS.has(child.name)) continue;
        const nextPrefix = prefix ? `${prefix}/${child.name}` : child.name;
        await walk(child, nextPrefix);
      } else if (child.kind === 'file') {
        const file = await child.getFile();
        if (!isSupportedSourceFile(file.name, file.size)) continue;
        const content = await file.text();
        const relativePath = prefix ? `${prefix}/${file.name}` : file.name;
        entries.push({ relativePath, content });
      }
    }
  }

  await walk(dirHandle, '');
  return buildWorkspaceFromImportedEntries(dirHandle.name, entries);
}

export async function importWorkspaceFromDirectoryFileList(
  fileList: FileList
): Promise<WorkspaceState | null> {
  const rawFiles = Array.from(fileList);
  if (rawFiles.length === 0) return null;

  let rootFolderName = 'local-project';
  const firstRel = rawFiles[0].webkitRelativePath || '';
  if (firstRel.includes('/')) {
    rootFolderName = firstRel.split('/')[0] || rootFolderName;
  }

  const entries: RawImportedEntry[] = [];
  for (const file of rawFiles) {
    if (entries.length >= MAX_IMPORTED_FILES) break;
    const relFull = file.webkitRelativePath || file.name;
    const parts = relFull.split('/').filter(Boolean);

    // Strip the selected root directory prefix if present so /src stays /src
    const strippedParts =
      parts.length > 1 && parts[0] === rootFolderName ? parts.slice(1) : parts;

    if (strippedParts.some((seg) => IGNORED_DIRS.has(seg))) {
      continue;
    }
    if (!isSupportedSourceFile(file.name, file.size)) {
      continue;
    }

    const content = await file.text();
    entries.push({
      relativePath: strippedParts.join('/'),
      content,
    });
  }

  return buildWorkspaceFromImportedEntries(rootFolderName, entries);
}
