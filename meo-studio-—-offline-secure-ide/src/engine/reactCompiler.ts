import { transform } from 'sucrase';
import { WorkspaceFile, WorkspaceState } from '../types/ide';
import { loadWorkspaceState } from './storage';

export interface BundledModuleRecord {
  id: string;
  code: string;
  css?: string;
}

export interface ReactBundleResult {
  entryId: string;
  modules: Record<string, BundledModuleRecord>;
  styles: string[];
  compileErrors: Array<{ filePath: string; message: string }>;
  missingLocalImports: Array<{ fromFile: string; specifier: string }>;
}

const DB_NAME = 'meo_studio_offline_db';
const DB_VERSION = 2;
const STORE_FILES = 'files';

const SCRIPT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];
const ALL_RESOLVE_EXTENSIONS = [...SCRIPT_EXTENSIONS, '.css', '.json'];

const VIRTUAL_PACKAGE_NAMES = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'lucide-react',
  'motion',
  'motion/react',
  'framer-motion',
  'clsx',
  'classnames',
  'tailwind-merge',
]);

export function normalizePosixPath(rawPath: string): string {
  const unified = rawPath.replace(/\\/g, '/').trim();
  const segments = unified.split('/');
  const resolved: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (resolved.length > 0) resolved.pop();
    } else {
      resolved.push(segment);
    }
  }

  return '/' + resolved.join('/');
}

function dirnamePosix(filePath: string): string {
  const norm = normalizePosixPath(filePath);
  const idx = norm.lastIndexOf('/');
  return idx <= 0 ? '/' : norm.slice(0, idx);
}

export function resolveRelativeModulePath(fromFilePath: string, specifier: string): string {
  const baseDir = dirnamePosix(fromFilePath);
  const combined = baseDir === '/' ? `/${specifier}` : `${baseDir}/${specifier}`;
  return normalizePosixPath(combined);
}

function getCanonicalFilePath(file: WorkspaceFile): string {
  if (file.path && file.path.trim()) {
    return normalizePosixPath(file.path);
  }
  const folder = file.folderPath || '/';
  return normalizePosixPath(folder === '/' ? `/${file.name}` : `${folder}/${file.name}`);
}

interface WorkspaceFileLookup {
  exactMap: Map<string, WorkspaceFile>;
  lowerMap: Map<string, { path: string; file: WorkspaceFile }>;
  entries: Array<{ path: string; lowerPath: string; file: WorkspaceFile }>;
}

function buildWorkspaceFileLookup(workspaceFiles: WorkspaceFile[]): WorkspaceFileLookup {
  const exactMap = new Map<string, WorkspaceFile>();
  const lowerMap = new Map<string, { path: string; file: WorkspaceFile }>();
  const entries: Array<{ path: string; lowerPath: string; file: WorkspaceFile }> = [];

  for (const file of workspaceFiles) {
    const normalized = getCanonicalFilePath(file);
    const lowerPath = normalized.toLowerCase();
    const entry = { path: normalized, lowerPath, file };
    exactMap.set(normalized, file);
    lowerMap.set(lowerPath, { path: normalized, file });
    entries.push(entry);
  }

  return { exactMap, lowerMap, entries };
}

function tryCandidatePaths(
  candidateBase: string,
  lookup: WorkspaceFileLookup
): { resolvedPath: string; file: WorkspaceFile } | null {
  const normBase = normalizePosixPath(candidateBase);
  const candidatePool: string[] = [normBase];

  for (const ext of ALL_RESOLVE_EXTENSIONS) {
    candidatePool.push(`${normBase}${ext}`);
  }
  for (const ext of SCRIPT_EXTENSIONS) {
    candidatePool.push(normalizePosixPath(`${normBase}/index${ext}`));
  }

  // Exact case pass
  for (const candidate of candidatePool) {
    const found = lookup.exactMap.get(candidate);
    if (found) {
      return { resolvedPath: candidate, file: found };
    }
  }

  // Case-insensitive pass
  for (const candidate of candidatePool) {
    const foundLower = lookup.lowerMap.get(candidate.toLowerCase());
    if (foundLower) {
      return { resolvedPath: foundLower.path, file: foundLower.file };
    }
  }

  return null;
}

function stripLeadingRelativeOrAlias(specifier: string): string {
  let cleaned = specifier.replace(/\\/g, '/').trim();
  if (cleaned.startsWith('@/') || cleaned.startsWith('~/')) {
    cleaned = cleaned.slice(2);
  }
  while (cleaned.startsWith('./') || cleaned.startsWith('../') || cleaned.startsWith('/')) {
    if (cleaned.startsWith('./')) cleaned = cleaned.slice(2);
    else if (cleaned.startsWith('../')) cleaned = cleaned.slice(3);
    else if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);
  }
  return cleaned;
}

function findWorkspaceFileForSpecifier(
  fromFilePath: string,
  specifier: string,
  lookup: WorkspaceFileLookup
): { resolvedPath: string; file: WorkspaceFile } | null {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  const isAlias = specifier.startsWith('@/') || specifier.startsWith('~/');
  const isAbsolute = specifier.startsWith('/');

  // 1. Direct relative resolution from current file directory
  if (isRelative) {
    const baseCandidate = resolveRelativeModulePath(fromFilePath, specifier);
    const direct = tryCandidatePaths(baseCandidate, lookup);
    if (direct) return direct;
  }

  // 2. Alias (@/, ~/), root (/), or baseUrl (src/..., components/...) resolution
  if (isAlias || isAbsolute || !VIRTUAL_PACKAGE_NAMES.has(specifier)) {
    const stripped = stripLeadingRelativeOrAlias(specifier);
    if (stripped) {
      const rootCandidates = [
        `/${stripped}`,
        stripped.startsWith('src/') ? `/${stripped}` : `/src/${stripped}`,
      ];
      for (const candidate of rootCandidates) {
        const matched = tryCandidatePaths(candidate, lookup);
        if (matched) return matched;
      }
    }
  }

  // 3. Cross-tree recursive fallback: locate matching relative suffix or filename
  // anywhere in the workspace tree regardless of folder depth
  if (isRelative || isAlias || isAbsolute || specifier.includes('/')) {
    const tail = stripLeadingRelativeOrAlias(specifier).toLowerCase();
    if (tail) {
      const suffixTargets = [
        `/${tail}`,
        ...ALL_RESOLVE_EXTENSIONS.map((ext) => `/${tail}${ext}`),
        ...SCRIPT_EXTENSIONS.map((ext) => `/${tail}/index${ext}`),
      ];

      // Prefer paths sharing the longest directory prefix with `fromFilePath`
      const fromDir = dirnamePosix(fromFilePath).toLowerCase();
      const suffixMatches = lookup.entries
        .filter((entry) => suffixTargets.some((suffix) => entry.lowerPath.endsWith(suffix)))
        .sort((a, b) => {
          const aSameDir = a.lowerPath.startsWith(fromDir + '/') ? 1 : 0;
          const bSameDir = b.lowerPath.startsWith(fromDir + '/') ? 1 : 0;
          if (aSameDir !== bSameDir) return bSameDir - aSameDir;
          return a.path.length - b.path.length;
        });

      if (suffixMatches.length > 0) {
        return { resolvedPath: suffixMatches[0].path, file: suffixMatches[0].file };
      }

      // Basename fallback when only the leaf module name matches across folders
      const leafName = tail.split('/').pop() || '';
      if (leafName) {
        const leafMatches = lookup.entries.filter((entry) => {
          const base = (entry.lowerPath.split('/').pop() || '').replace(/\.[^.]+$/, '');
          const fullName = entry.lowerPath.split('/').pop() || '';
          return fullName === leafName || base === leafName;
        });
        if (leafMatches.length > 0) {
          return { resolvedPath: leafMatches[0].path, file: leafMatches[0].file };
        }
      }
    }
  }

  return null;
}

function extractRequireSpecifiers(transpiledCode: string): string[] {
  const specifiers: string[] = [];
  const seen = new Set<string>();
  const requireRegex = /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = requireRegex.exec(transpiledCode)) !== null) {
    if (!seen.has(match[2])) {
      seen.add(match[2]);
      specifiers.push(match[2]);
    }
  }
  return specifiers;
}

function transpileModuleWithSucrase(source: string, filePath: string): string {
  const lower = filePath.toLowerCase();

  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(source);
    return `module.exports = ${JSON.stringify(parsed)};`;
  }

  if (lower.endsWith('.css')) {
    return 'module.exports = {};';
  }

  const result = transform(source, {
    transforms: ['typescript', 'jsx', 'imports'],
    jsxRuntime: 'classic',
    jsxPragma: 'React.createElement',
    jsxFragmentPragma: 'React.Fragment',
    filePath,
  });

  return result.code;
}

/**
 * Loads all workspace files persisted in IndexedDB (`workspaceState` and `files` store).
 */
export async function loadAllIndexedDBWorkspaceFiles(): Promise<WorkspaceFile[]> {
  const state: WorkspaceState = await loadWorkspaceState();
  const merged = new Map<string, WorkspaceFile>();

  for (const file of state.files || []) {
    merged.set(getCanonicalFilePath(file), file);
  }

  try {
    if (typeof indexedDB !== 'undefined') {
      const storeFiles = await new Promise<WorkspaceFile[]>((resolve) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_FILES)) {
            resolve([]);
            return;
          }
          const tx = db.transaction(STORE_FILES, 'readonly');
          const allReq = tx.objectStore(STORE_FILES).getAll();
          allReq.onsuccess = () => resolve((allReq.result as WorkspaceFile[]) || []);
          allReq.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      });

      for (const file of storeFiles) {
        const key = getCanonicalFilePath(file);
        const existing = merged.get(key);
        if (!existing || (file.updatedAt || 0) > (existing.updatedAt || 0)) {
          merged.set(key, file);
        }
      }
    }
  } catch {
    // Ignore IndexedDB secondary store failures when workspaceState already resolved
  }

  return Array.from(merged.values());
}

/**
 * Merges live in-memory IDE workspace files with IndexedDB workspace files so
 * active editor buffers take precedence while all persisted workspace files remain available.
 */
export function mergeWorkspaceFiles(
  liveFiles: WorkspaceFile[],
  dbFiles: WorkspaceFile[]
): WorkspaceFile[] {
  const map = new Map<string, WorkspaceFile>();

  for (const file of dbFiles) {
    map.set(getCanonicalFilePath(file), file);
  }
  for (const file of liveFiles) {
    map.set(getCanonicalFilePath(file), file);
  }

  return Array.from(map.values());
}

/**
 * Resolves and bundles a multi-file React/TypeScript project graph starting from
 * `entrySource` / `entryPath` across all files in `workspaceFiles`.
 */
export function bundleWorkspaceModules(
  entrySource: string,
  workspaceFiles: WorkspaceFile[] = [],
  entryPath = '/src/App.tsx'
): ReactBundleResult {
  const normalizedEntryId = normalizePosixPath(entryPath || '/src/App.tsx');

  // Clone into lookup with active entry buffer always authoritative
  const allFiles = [...workspaceFiles];
  const existingEntryIdx = allFiles.findIndex(
    (f) => getCanonicalFilePath(f).toLowerCase() === normalizedEntryId.toLowerCase()
  );
  const activeEntryRecord: WorkspaceFile = {
    id: existingEntryIdx >= 0 ? allFiles[existingEntryIdx].id : 'entry-virtual',
    name:
      existingEntryIdx >= 0
        ? allFiles[existingEntryIdx].name
        : normalizedEntryId.split('/').pop() || 'App.tsx',
    folderPath: dirnamePosix(normalizedEntryId),
    path: normalizedEntryId,
    language: 'react',
    content: entrySource,
    updatedAt: Date.now(),
    breakpoints: existingEntryIdx >= 0 ? allFiles[existingEntryIdx].breakpoints : [],
  };

  if (existingEntryIdx >= 0) {
    allFiles[existingEntryIdx] = activeEntryRecord;
  } else {
    allFiles.push(activeEntryRecord);
  }

  const lookup = buildWorkspaceFileLookup(allFiles);
  const modules: Record<string, BundledModuleRecord> = {};
  const styles: string[] = [];
  const compileErrors: Array<{ filePath: string; message: string }> = [];
  const missingLocalImports: Array<{ fromFile: string; specifier: string }> = [];
  const visited = new Set<string>();
  const queue: Array<{ id: string; content: string }> = [
    { id: normalizedEntryId, content: entrySource },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    if (current.id.toLowerCase().endsWith('.css')) {
      styles.push(current.content);
      modules[current.id] = {
        id: current.id,
        code: 'module.exports = {};',
        css: current.content,
      };
      continue;
    }

    let compiledCode = '';
    try {
      compiledCode = transpileModuleWithSucrase(current.content, current.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      compileErrors.push({ filePath: current.id, message: msg });
      modules[current.id] = {
        id: current.id,
        code: `throw new Error(${JSON.stringify(`Transpile error in ${current.id}: ${msg}`)});`,
      };
      continue;
    }

    // Traverse every require(...) specifier (relative, alias, or workspace-tree paths)
    const specifiers = extractRequireSpecifiers(compiledCode);
    let rewrittenCode = compiledCode;

    for (const spec of specifiers) {
      if (VIRTUAL_PACKAGE_NAMES.has(spec)) {
        continue;
      }

      const resolved = findWorkspaceFileForSpecifier(current.id, spec, lookup);
      if (resolved) {
        const escapedSpec = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const specReplaceRegex = new RegExp(
          `(\\brequire\\s*\\(\\s*)(['"])${escapedSpec}\\2(\\s*\\))`,
          'g'
        );
        rewrittenCode = rewrittenCode.replace(
          specReplaceRegex,
          `$1${JSON.stringify(resolved.resolvedPath)}$3`
        );

        if (!visited.has(resolved.resolvedPath)) {
          queue.push({
            id: resolved.resolvedPath,
            content: resolved.file.content,
          });
        }
      } else if (
        spec.startsWith('./') ||
        spec.startsWith('../') ||
        spec.startsWith('@/') ||
        spec.startsWith('~/')
      ) {
        missingLocalImports.push({ fromFile: current.id, specifier: spec });
      }
    }

    modules[current.id] = {
      id: current.id,
      code: rewrittenCode,
    };
  }

  // Sweep and aggregate ALL .css files across the entire workspace (even if imported by main.tsx
  // or another entry file rather than the currently selected Active Target component)
  const collectedCssByPath = new Map<string, string>();
  const priorityCssOrder = (path: string) => {
    const lower = path.toLowerCase();
    if (lower.endsWith('/index.css') || lower.endsWith('/globals.css')) return 0;
    if (lower.endsWith('/app.css') || lower.endsWith('/main.css')) return 1;
    return 2;
  };

  const allCssFiles = allFiles
    .filter((f) => getCanonicalFilePath(f).toLowerCase().endsWith('.css'))
    .sort((a, b) => {
      const pa = priorityCssOrder(getCanonicalFilePath(a));
      const pb = priorityCssOrder(getCanonicalFilePath(b));
      if (pa !== pb) return pa - pb;
      return getCanonicalFilePath(a).localeCompare(getCanonicalFilePath(b));
    });

  for (const cssFile of allCssFiles) {
    const cssPath = getCanonicalFilePath(cssFile);
    if (!collectedCssByPath.has(cssPath)) {
      collectedCssByPath.set(cssPath, cssFile.content);
    }
    if (!modules[cssPath]) {
      modules[cssPath] = {
        id: cssPath,
        code: 'module.exports = {};',
        css: cssFile.content,
      };
    }
  }

  for (const mod of Object.values(modules)) {
    if (mod.css && !collectedCssByPath.has(mod.id)) {
      collectedCssByPath.set(mod.id, mod.css);
    }
  }

  styles.length = 0;
  collectedCssByPath.forEach((cssContent, cssPath) => {
    const cleanedCss = cssContent
      .replace(/@import\s+['"]tailwindcss(?:\/[^'"]*)?['"]\s*;/g, '')
      .replace(/@custom-variant\s+[^;]+;/g, '')
      .replace(/@source\s+[^;]+;/g, '')
      .replace(/@theme\s*\{/g, ':root {');
    styles.push(`/* ${cssPath} */\n${cleanedCss}`);
  });

  return {
    entryId: normalizedEntryId,
    modules,
    styles,
    compileErrors,
    missingLocalImports,
  };
}

/**
 * Generates an offline CSP-locked HTML runtime containing:
 * - Tailwind CSS CDN + aggregated workspace CSS stylesheets in <head>
 * - Multi-file CommonJS module loader
 * - Offline React 19-compatible Hooks/Fragment/Context/DOM engine
 * - Built-in virtual packages & Proxy stubs (lucide-react, motion/react, clsx, etc.)
 */
export function buildOfflineReactSandboxHtml(
  sourceCode: string,
  workspaceFiles: WorkspaceFile[] = [],
  entryPath = '/src/App.tsx'
): string {
  const bundle = bundleWorkspaceModules(sourceCode, workspaceFiles, entryPath);
  const inlineCss = bundle.styles.join('\n\n');

  const serializedBundle = JSON.stringify({
    entryId: bundle.entryId,
    modules: bundle.modules,
    compileErrors: bundle.compileErrors,
    missingLocalImports: bundle.missingLocalImports,
  }).replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; connect-src https://cdn.tailwindcss.com; img-src data: blob: https:;">
<script src="https://cdn.tailwindcss.com"></script>
<style id="workspace-aggregated-styles">
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 14px;
    background: #0B0F17;
    color: #F1F5F9;
    font-family: "Rubik", "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  button, input, select, textarea { font: inherit; }
  ${inlineCss.replace(/<\/style/gi, '<\\/style')}
</style>
</head>
<body>
<div id="sandbox-root"></div>
<script>
(function() {
  function postToHost(type, payload) {
    try { parent.postMessage({ source: 'meo-react-sandbox', type: type, payload: payload }, '*'); } catch (e) {}
  }

  function formatArg(val) {
    if (typeof val === 'string') return val;
    try { return JSON.stringify(val); } catch (e) { return String(val); }
  }

  console.log = function() {
    postToHost('stdout', Array.prototype.slice.call(arguments).map(formatArg).join(' '));
  };
  console.warn = function() {
    postToHost('stdout', '[WARN] ' + Array.prototype.slice.call(arguments).map(formatArg).join(' '));
  };
  console.error = function() {
    postToHost('stderr', Array.prototype.slice.call(arguments).map(formatArg).join(' '));
  };

  window.onerror = function(msg, url, line) {
    postToHost('stderr', 'Runtime Error (Line ' + line + '): ' + msg);
  };

  // =========================================================================
  // 1. Offline React + Hooks + Context + DOM Renderer (Zero External CDN)
  // =========================================================================
  var hooksByComponentPath = {};
  var pendingEffects = [];
  var activeCleanupMap = {};
  var currentHookOwnerKey = 'root';
  var currentHookSlot = 0;
  var rootComponent = null;
  var customMountedRender = null;
  var renderScheduled = false;

  function flattenChildren(items, out) {
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (Array.isArray(item)) {
        flattenChildren(item, out);
      } else if (item !== null && item !== undefined && typeof item !== 'boolean') {
        out.push(item);
      }
    }
    return out;
  }

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    setTimeout(function() {
      renderScheduled = false;
      renderRoot();
    }, 0);
  }

  function getHookStore() {
    if (!hooksByComponentPath[currentHookOwnerKey]) {
      hooksByComponentPath[currentHookOwnerKey] = [];
    }
    var store = hooksByComponentPath[currentHookOwnerKey];
    var idx = currentHookSlot++;
    return { store: store, idx: idx };
  }

  function depsChanged(prevDeps, nextDeps) {
    if (!prevDeps || !nextDeps) return true;
    if (prevDeps.length !== nextDeps.length) return true;
    for (var i = 0; i < nextDeps.length; i++) {
      if (!Object.is(prevDeps[i], nextDeps[i])) return true;
    }
    return false;
  }

  var FragmentSymbol = function Fragment(props) {
    return props && props.children ? props.children : null;
  };

  var React = {
    Fragment: FragmentSymbol,
    StrictMode: FragmentSymbol,
    Suspense: function Suspense(props) {
      return props && props.children ? props.children : null;
    },
    lazy: function(loader) {
      var Loaded = null;
      var started = false;
      return function LazyComponent(props) {
        if (!started) {
          started = true;
          Promise.resolve(loader()).then(function(mod) {
            Loaded = mod && mod.default ? mod.default : mod;
            scheduleRender();
          });
        }
        return Loaded ? React.createElement(Loaded, props) : null;
      };
    },
    createElement: function(type, props) {
      var rawChildren = Array.prototype.slice.call(arguments, 2);
      var children = flattenChildren(rawChildren, []);
      var normalizedProps = Object.assign({}, props || {});
      if (children.length === 1) {
        normalizedProps.children = children[0];
      } else if (children.length > 1) {
        normalizedProps.children = children;
      }
      return {
        $$typeof: 'meo.vnode',
        type: type,
        props: normalizedProps,
        children: children
      };
    },
    cloneElement: function(element, extraProps) {
      if (!element || typeof element !== 'object') return element;
      var extraChildren = Array.prototype.slice.call(arguments, 2);
      var nextProps = Object.assign({}, element.props, extraProps || {});
      var nextChildren = extraChildren.length > 0 ? flattenChildren(extraChildren, []) : element.children;
      return Object.assign({}, element, { props: nextProps, children: nextChildren });
    },
    isValidElement: function(obj) {
      return Boolean(obj && typeof obj === 'object' && obj.$$typeof === 'meo.vnode');
    },
    memo: function(comp) { return comp; },
    forwardRef: function(renderFn) {
      return function ForwardRefWrapper(props) {
        return renderFn(props || {}, (props && props.ref) || null);
      };
    },
    createContext: function(defaultValue) {
      var ctx = { _currentValue: defaultValue };
      ctx.Provider = function Provider(props) {
        ctx._currentValue = props && 'value' in props ? props.value : defaultValue;
        return props ? props.children : null;
      };
      ctx.Consumer = function Consumer(props) {
        return typeof props.children === 'function' ? props.children(ctx._currentValue) : null;
      };
      return ctx;
    },
    useContext: function(ctx) {
      return ctx ? ctx._currentValue : undefined;
    },
    useState: function(initial) {
      var slot = getHookStore();
      if (slot.store[slot.idx] === undefined) {
        slot.store[slot.idx] = typeof initial === 'function' ? initial() : initial;
      }
      var setState = function(next) {
        var prev = slot.store[slot.idx];
        var computed = typeof next === 'function' ? next(prev) : next;
        if (!Object.is(prev, computed)) {
          slot.store[slot.idx] = computed;
          scheduleRender();
        }
      };
      return [slot.store[slot.idx], setState];
    },
    useReducer: function(reducer, initialArg, initFn) {
      var slot = getHookStore();
      if (slot.store[slot.idx] === undefined) {
        slot.store[slot.idx] = typeof initFn === 'function' ? initFn(initialArg) : initialArg;
      }
      var dispatch = function(action) {
        var next = reducer(slot.store[slot.idx], action);
        if (!Object.is(slot.store[slot.idx], next)) {
          slot.store[slot.idx] = next;
          scheduleRender();
        }
      };
      return [slot.store[slot.idx], dispatch];
    },
    useRef: function(initial) {
      var slot = getHookStore();
      if (slot.store[slot.idx] === undefined) {
        slot.store[slot.idx] = { current: initial };
      }
      return slot.store[slot.idx];
    },
    useMemo: function(factory, deps) {
      var slot = getHookStore();
      var cached = slot.store[slot.idx];
      if (!cached || depsChanged(cached.deps, deps)) {
        slot.store[slot.idx] = { value: factory(), deps: deps };
      }
      return slot.store[slot.idx].value;
    },
    useCallback: function(fn, deps) {
      return React.useMemo(function() { return fn; }, deps);
    },
    useEffect: function(effectFn, deps) {
      var slot = getHookStore();
      var prev = slot.store[slot.idx];
      var shouldRun = !prev || depsChanged(prev.deps, deps);
      var effectKey = currentHookOwnerKey + '#' + slot.idx;
      slot.store[slot.idx] = { deps: deps };
      if (shouldRun) {
        pendingEffects.push({ key: effectKey, fn: effectFn });
      }
    },
    useLayoutEffect: function(effectFn, deps) {
      React.useEffect(effectFn, deps);
    }
  };

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SVG_TAGS = {
    svg: true, path: true, circle: true, rect: true, line: true,
    polyline: true, polygon: true, g: true, defs: true, linearGradient: true, stop: true
  };

  function applyDomStyle(el, styleObj) {
    if (!styleObj || typeof styleObj !== 'object') return;
    Object.keys(styleObj).forEach(function(prop) {
      var val = styleObj[prop];
      if (val === undefined || val === null) return;
      if (typeof val === 'number' && !/^(opacity|zIndex|fontWeight|lineHeight|flex|flexGrow|flexShrink|order|zoom|scale)$/i.test(prop)) {
        el.style[prop] = val + 'px';
      } else {
        el.style[prop] = String(val);
      }
    });
  }

  function renderNode(vnode, pathKey, isSvgContext) {
    if (vnode === null || vnode === undefined || typeof vnode === 'boolean') {
      return document.createTextNode('');
    }
    if (typeof vnode === 'string' || typeof vnode === 'number') {
      return document.createTextNode(String(vnode));
    }
    if (Array.isArray(vnode)) {
      var frag = document.createDocumentFragment();
      for (var i = 0; i < vnode.length; i++) {
        frag.appendChild(renderNode(vnode[i], pathKey + '.' + i, isSvgContext));
      }
      return frag;
    }
    if (typeof vnode !== 'object' || !vnode.type) {
      return document.createTextNode(String(vnode));
    }

    if (typeof vnode.type === 'function') {
      var compKey = pathKey + ':' + (vnode.type.name || 'Anon');
      var prevOwner = currentHookOwnerKey;
      var prevSlot = currentHookSlot;
      currentHookOwnerKey = compKey;
      currentHookSlot = 0;
      var rendered;
      try {
        rendered = vnode.type(vnode.props || {});
      } finally {
        currentHookOwnerKey = prevOwner;
        currentHookSlot = prevSlot;
      }
      return renderNode(rendered, compKey, isSvgContext);
    }

    var tag = String(vnode.type);
    var nextSvg = isSvgContext || tag === 'svg';
    var el = (nextSvg && SVG_TAGS[tag])
      ? document.createElementNS(SVG_NS, tag)
      : document.createElement(tag);

    var props = vnode.props || {};
    Object.keys(props).forEach(function(key) {
      var val = props[key];
      if (key === 'children' || key === 'key' || val === undefined || val === null) return;

      if (key === 'ref' && typeof val === 'object') {
        val.current = el;
      } else if (key === 'ref' && typeof val === 'function') {
        val(el);
      } else if (key === 'style' && typeof val === 'object') {
        applyDomStyle(el, val);
      } else if (key === 'className') {
        if (nextSvg) el.setAttribute('class', String(val));
        else el.className = String(val);
      } else if (key === 'htmlFor') {
        el.setAttribute('for', String(val));
      } else if (key === 'dangerouslySetInnerHTML' && val && typeof val.__html === 'string') {
        el.innerHTML = val.__html;
      } else if (key.indexOf('on') === 0 && typeof val === 'function') {
        var evtName = key.slice(2).toLowerCase();
        if (evtName === 'change' && (tag === 'input' || tag === 'textarea')) {
          el.addEventListener('input', val);
        } else if (evtName === 'doubleclick') {
          el.addEventListener('dblclick', val);
        } else {
          el.addEventListener(evtName, val);
        }
      } else if (typeof val === 'boolean') {
        if (val) el.setAttribute(key, '');
        if (key in el) el[key] = val;
      } else {
        if (key === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
          el.value = String(val);
        } else {
          el.setAttribute(key, String(val));
        }
      }
    });

    var children = vnode.children || [];
    for (var c = 0; c < children.length; c++) {
      el.appendChild(renderNode(children[c], pathKey + '.' + c, nextSvg));
    }
    return el;
  }

  function flushEffects() {
    var queue = pendingEffects.slice();
    pendingEffects = [];
    for (var i = 0; i < queue.length; i++) {
      var item = queue[i];
      if (typeof activeCleanupMap[item.key] === 'function') {
        try { activeCleanupMap[item.key](); } catch (e) {}
      }
      try {
        var cleanup = item.fn();
        activeCleanupMap[item.key] = typeof cleanup === 'function' ? cleanup : null;
      } catch (err) {
        postToHost('stderr', 'useEffect error: ' + (err && err.message ? err.message : String(err)));
      }
    }
  }

  function renderRoot() {
    var rootEl = document.getElementById('sandbox-root');
    if (!rootEl) return;
    pendingEffects = [];

    if (typeof customMountedRender === 'function') {
      rootEl.innerHTML = '';
      rootEl.appendChild(renderNode(customMountedRender(), 'root', false));
      flushEffects();
      return;
    }

    if (!rootComponent) return;
    rootEl.innerHTML = '';
    rootEl.appendChild(renderNode(React.createElement(rootComponent, null), 'root', false));
    flushEffects();
  }

  // =========================================================================
  // 2. External Package Virtual Registry & Proxy Stubs (Zero-Crash Offline)
  // =========================================================================
  function createLucideIconComponent(iconName) {
    var ICON_PATHS = {
      Activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
      AlertTriangle: ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
      Check: ['M20 6 9 17l-5-5'],
      CheckCircle2: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'm9 12 2 2 4-4'],
      ChevronRight: ['m9 18 6-6-6-6'],
      ChevronDown: ['m6 9 6 6 6-6'],
      Code2: ['m18 16 4-4-4-4', 'm6 8-4 4 4 4', 'm14.5 4-5 16'],
      Cpu: ['M4 4h16v16H4z', 'M9 9h6v6H9z', 'M9 1v3', 'M15 1v3', 'M9 20v3', 'M15 20v3', 'M20 9h3', 'M20 14h3', 'M1 9h3', 'M1 14h3'],
      Folder: ['M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z'],
      Lock: ['M7 11V7a5 5 0 0 1 10 0v4', 'M5 11h14v10H5z'],
      Play: ['M6 3l14 9-14 9V3z'],
      Plus: ['M12 5v14', 'M5 12h14'],
      RefreshCw: ['M3 12a9 9 0 0 1 15-6.7L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-15 6.7L3 16', 'M3 21v-5h5'],
      Search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'm21 21-4.3-4.3'],
      Server: ['M2 4h20v6H2z', 'M2 14h20v6H2z', 'M6 7h.01', 'M6 17h.01'],
      Settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
      Shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
      ShieldCheck: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'm9 12 2 2 4-4'],
      Terminal: ['m4 17 6-6-6-6', 'M12 19h8'],
      Trash2: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
      Wifi: ['M5 12.55a11 11 0 0 1 14.08 0', 'M1.42 9a16 16 0 0 1 21.16 0', 'M8.53 16.11a6 6 0 0 1 6.95 0', 'M12 20h.01'],
      X: ['M18 6 6 18', 'M6 6l12 12'],
      Zap: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z']
    };

    return function LucideIconStub(props) {
      var p = props || {};
      var size = p.size || 16;
      var stroke = p.color || 'currentColor';
      var strokeWidth = p.strokeWidth || 2;
      var paths = ICON_PATHS[iconName] || ['M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z', 'M12 12l8-4.5', 'M12 12v9', 'M12 12L4 7.5'];

      var svgChildren = paths.map(function(d, idx) {
        return React.createElement('path', { key: idx, d: d });
      });

      return React.createElement('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: stroke,
        'stroke-width': strokeWidth,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        className: p.className || '',
        style: Object.assign({ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }, p.style || {}),
        'aria-label': iconName
      }, svgChildren);
    };
  }

  var lucideStubModule = new Proxy({ __esModule: true }, {
    get: function(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol') return undefined;
      return createLucideIconComponent(String(prop));
    }
  });

  var motionProxy = new Proxy({}, {
    get: function(_target, tagProp) {
      var tagName = typeof tagProp === 'string' ? tagProp : 'div';
      return function MotionStub(props) {
        var cleaned = Object.assign({}, props || {});
        delete cleaned.initial;
        delete cleaned.animate;
        delete cleaned.exit;
        delete cleaned.transition;
        delete cleaned.whileHover;
        delete cleaned.whileTap;
        delete cleaned.variants;
        return React.createElement(tagName, cleaned, cleaned.children);
      };
    }
  });

  var motionStubModule = {
    __esModule: true,
    motion: motionProxy,
    AnimatePresence: function AnimatePresence(props) {
      return props ? props.children : null;
    }
  };

  function joinClasses() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var arg = arguments[i];
      if (!arg) continue;
      if (typeof arg === 'string') out.push(arg);
      else if (Array.isArray(arg)) out.push(joinClasses.apply(null, arg));
      else if (typeof arg === 'object') {
        Object.keys(arg).forEach(function(k) {
          if (arg[k]) out.push(k);
        });
      }
    }
    return out.join(' ');
  }

  var reactExports = Object.assign({ __esModule: true, default: React }, React);
  var reactDomExports = {
    __esModule: true,
    default: {
      createRoot: function() {
        return {
          render: function(element) {
            customMountedRender = function() { return element; };
            renderRoot();
          }
        };
      },
      render: function(element) {
        customMountedRender = function() { return element; };
        renderRoot();
      }
    },
    createRoot: function() {
      return {
        render: function(element) {
          customMountedRender = function() { return element; };
          renderRoot();
        }
      };
    },
    render: function(element) {
      customMountedRender = function() { return element; };
      renderRoot();
    }
  };

  var VIRTUAL_PACKAGES = {
    'react': reactExports,
    'react-dom': reactDomExports,
    'react-dom/client': reactDomExports,
    'react/jsx-runtime': {
      __esModule: true,
      Fragment: React.Fragment,
      jsx: React.createElement,
      jsxs: React.createElement
    },
    'react/jsx-dev-runtime': {
      __esModule: true,
      Fragment: React.Fragment,
      jsxDEV: React.createElement
    },
    'lucide-react': lucideStubModule,
    'motion': motionStubModule,
    'motion/react': motionStubModule,
    'framer-motion': motionStubModule,
    'clsx': { __esModule: true, default: joinClasses, clsx: joinClasses },
    'classnames': { __esModule: true, default: joinClasses },
    'tailwind-merge': { __esModule: true, twMerge: joinClasses }
  };

  var unknownPackageCache = {};
  function createUnknownPackageStub(pkgName) {
    if (unknownPackageCache[pkgName]) return unknownPackageCache[pkgName];
    postToHost('stdout', '[Sandbox Stub] External package "' + pkgName + '" stubbed for offline execution.');

    var fallbackFn = function StubComponentOrFn(props) {
      if (props && typeof props === 'object' && ('children' in props || 'className' in props)) {
        return React.createElement('div', { 'data-stub': pkgName, style: props.style }, props.children || null);
      }
      return null;
    };

    var stub = new Proxy(fallbackFn, {
      get: function(target, prop) {
        if (prop === '__esModule') return true;
        if (prop === 'default') return stub;
        if (prop in target) return target[prop];
        if (typeof prop === 'symbol') return undefined;
        return fallbackFn;
      }
    });

    unknownPackageCache[pkgName] = stub;
    return stub;
  }

  // =========================================================================
  // 3. CommonJS Multi-File Module Loader & Bootstrapper
  // =========================================================================
  var bundlePayload = ${serializedBundle};
  var moduleCache = {};

  function resolveRuntimePath(fromId, specifier) {
    if (specifier.indexOf('./') !== 0 && specifier.indexOf('../') !== 0) {
      return specifier;
    }
    var baseParts = fromId.split('/').slice(0, -1);
    var relParts = specifier.split('/');
    var stack = baseParts.filter(Boolean);
    for (var i = 0; i < relParts.length; i++) {
      var part = relParts[i];
      if (!part || part === '.') continue;
      if (part === '..') stack.pop();
      else stack.push(part);
    }
    return '/' + stack.join('/');
  }

  function loadModule(moduleId, requesterId) {
    if (VIRTUAL_PACKAGES[moduleId]) {
      return VIRTUAL_PACKAGES[moduleId];
    }

    var resolvedId = requesterId ? resolveRuntimePath(requesterId, moduleId) : moduleId;
    if (moduleCache[resolvedId]) {
      return moduleCache[resolvedId].exports;
    }

    var modRecord = bundlePayload.modules[resolvedId];
    if (!modRecord) {
      if (moduleId.indexOf('./') === 0 || moduleId.indexOf('../') === 0) {
        postToHost('stdout', '[Bundler Stub] Missing local module "' + moduleId + '" referenced from ' + (requesterId || 'entry'));
      }
      return createUnknownPackageStub(moduleId);
    }

    var moduleObj = { exports: {} };
    moduleCache[resolvedId] = moduleObj;

    var localRequire = function(spec) {
      return loadModule(spec, resolvedId);
    };

    var factory = new Function(
      'require',
      'module',
      'exports',
      'React',
      'useState',
      'useEffect',
      'useMemo',
      'useCallback',
      'useRef',
      'useReducer',
      'useContext',
      'createContext',
      'Fragment',
      modRecord.code
    );

    factory(
      localRequire,
      moduleObj,
      moduleObj.exports,
      React,
      React.useState,
      React.useEffect,
      React.useMemo,
      React.useCallback,
      React.useRef,
      React.useReducer,
      React.useContext,
      React.createContext,
      React.Fragment
    );

    return moduleObj.exports;
  }

  function renderCompileErrorBanner(errors) {
    var rootEl = document.getElementById('sandbox-root');
    if (!rootEl) return;
    var container = document.createElement('div');
    container.style.cssText = 'border:1px solid #ef4444;background:#1f1215;color:#fecaca;padding:12px;border-radius:8px;font-family:monospace;font-size:12px;white-space:pre-wrap;';
    container.textContent = errors.map(function(e) {
      return e.filePath + ': ' + e.message;
    }).join('\\n\\n');
    rootEl.innerHTML = '';
    rootEl.appendChild(container);
  }

  try {
    if (bundlePayload.compileErrors && bundlePayload.compileErrors.length > 0) {
      bundlePayload.compileErrors.forEach(function(err) {
        postToHost('stderr', 'Transpile Error (' + err.filePath + '): ' + err.message);
      });
      renderCompileErrorBanner(bundlePayload.compileErrors);
      return;
    }

    if (bundlePayload.missingLocalImports && bundlePayload.missingLocalImports.length > 0) {
      bundlePayload.missingLocalImports.forEach(function(item) {
        postToHost('stdout', '[Bundler Warn] Unresolved local import "' + item.specifier + '" in ' + item.fromFile + ' (stubbed)');
      });
    }

    var entryExports = loadModule(bundlePayload.entryId, null);
    var candidate = entryExports && entryExports.default ? entryExports.default : null;

    if (!candidate && entryExports && typeof entryExports === 'object') {
      var exportKeys = Object.keys(entryExports);
      for (var k = 0; k < exportKeys.length; k++) {
        var val = entryExports[exportKeys[k]];
        if (typeof val === 'function' && /^[A-Z]/.test(exportKeys[k])) {
          candidate = val;
          break;
        }
      }
    }

    if (typeof candidate === 'function') {
      rootComponent = candidate;
      renderRoot();
      postToHost(
        'stdout',
        'Bundled ' + Object.keys(bundlePayload.modules).length + ' module(s) with Sucrase AST transpiler inside offline CSP sandbox.'
      );
    } else if (typeof customMountedRender === 'function') {
      postToHost('stdout', 'Mounted React root via ReactDOM.createRoot inside offline CSP sandbox.');
    } else {
      postToHost('stderr', 'No default or uppercase React component exported from ' + bundlePayload.entryId);
    }
  } catch (err) {
    var errMsg = err && err.message ? err.message : String(err);
    postToHost('stderr', 'Sandbox Runtime Error: ' + errMsg);
    renderCompileErrorBanner([{ filePath: bundlePayload.entryId, message: errMsg }]);
  }
})();
</script>
</body>
</html>`;
}

/**
 * Convenience async helper that pulls all workspace files from IndexedDB
 * (`meo_studio_offline_db`), merges optional live editor buffers, and builds the
 * multi-file sandbox HTML starting from the requested entry file.
 */
export async function buildOfflineReactSandboxHtmlFromIndexedDB(
  entryFileIdOrPath?: string,
  liveWorkspaceFiles: WorkspaceFile[] = [],
  liveEntrySourceOverride?: string
): Promise<string> {
  const dbFiles = await loadAllIndexedDBWorkspaceFiles();
  const allFiles = mergeWorkspaceFiles(liveWorkspaceFiles, dbFiles);

  const normalizedQuery = entryFileIdOrPath ? normalizePosixPath(entryFileIdOrPath) : '';
  const target =
    allFiles.find(
      (f) => f.id === entryFileIdOrPath || getCanonicalFilePath(f) === normalizedQuery
    ) ||
    allFiles.find((f) => f.language === 'react') ||
    allFiles[0];

  if (!target) {
    return buildOfflineReactSandboxHtml(
      liveEntrySourceOverride ||
        'export default function Empty() { return <div>No files in workspace.</div>; }'
    );
  }

  return buildOfflineReactSandboxHtml(
    liveEntrySourceOverride ?? target.content,
    allFiles,
    getCanonicalFilePath(target)
  );
}
