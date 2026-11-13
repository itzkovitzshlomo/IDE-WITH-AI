import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  FastForward,
  GitCompare,
  Play,
  Replace,
  RotateCcw,
  Search,
  ShieldAlert,
  Square,
  StepForward,
  X,
} from 'lucide-react';
import {
  CodeLanguage,
  DebugStatus,
  PendingAgentChange,
  SecurityFinding,
  UiLocale,
  WorkspaceFile,
} from '../types/ide';
import { UI_COPY } from '../i18n';

interface CodeEditorProps {
  locale: UiLocale;
  file: WorkspaceFile;
  debugStatus: DebugStatus;
  activeDebugLine: number | null;
  findings: SecurityFinding[];
  pendingChange?: PendingAgentChange | null;
  jumpToLineRequest: { line: number; seq: number } | null;
  onChangeContent: (newContent: string) => void;
  onToggleBreakpoint: (line: number) => void;
  onRun: () => void;
  onStartDebug: () => void;
  onStepDebug: () => void;
  onContinueDebug: () => void;
  onStopDebug: () => void;
  onScanFile: () => void;
  onAcceptChange?: (fileId: string) => void;
  onRejectChange?: (fileId: string) => void;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const KEYWORDS_BY_LANG: Record<CodeLanguage, Set<string>> = {
  c: new Set([
    'int', 'char', 'float', 'double', 'void', 'bool', 'long', 'short', 'unsigned',
    'const', 'struct', 'typedef', 'enum', 'return', 'if', 'else', 'for', 'while',
    'do', 'switch', 'case', 'break', 'continue', 'sizeof', 'NULL', 'true', 'false',
    'printf', 'fprintf', 'snprintf', 'fgets', 'strncpy', 'strncat', 'strcpy',
    'strcat', 'sprintf', 'gets', 'free', 'malloc', 'calloc',
  ]),
  cpp: new Set([
    'int', 'char', 'float', 'double', 'void', 'bool', 'long', 'auto', 'const',
    'struct', 'class', 'namespace', 'using', 'template', 'typename', 'public',
    'private', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case',
    'break', 'continue', 'sizeof', 'nullptr', 'NULL', 'true', 'false', 'std',
    'cout', 'endl', 'string', 'vector', 'printf', 'snprintf', 'strncpy', 'free',
  ]),
  rust: new Set([
    'fn', 'let', 'mut', 'const', 'pub', 'if', 'else', 'for', 'in', 'while',
    'loop', 'return', 'match', 'struct', 'enum', 'impl', 'use', 'mod', 'crate',
    'unsafe', 'true', 'false', 'i32', 'i64', 'u32', 'usize', 'bool', 'str',
    'String', 'Vec', 'Option', 'Result', 'Some', 'None', 'Ok', 'Err',
  ]),
  react: new Set([
    'import', 'from', 'export', 'default', 'function', 'const', 'let', 'var',
    'return', 'if', 'else', 'for', 'while', 'interface', 'type', 'true', 'false',
    'null', 'undefined', 'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef',
    'React',
  ]),
};

/**
 * Single-pass syntax tokenizer so inserted HTML <span> tags are NEVER
 * re-scanned by subsequent regexes (prevents class="..." attribute leakage).
 */
function highlightLine(line: string, language: CodeLanguage): string {
  if (!line) return '&nbsp;';

  const trimmedStart = line.trimStart();
  if (trimmedStart.startsWith('#') && (language === 'c' || language === 'cpp')) {
    return `<span class="text-purple-400">${escapeHtml(line)}</span>`;
  }

  const kwSet = KEYWORDS_BY_LANG[language];
  const tokenRegex =
    /(\/\/.*$|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*!?\b)/g;

  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    const safeToken = escapeHtml(token);

    if (token.startsWith('//') || token.startsWith('/*')) {
      result += `<span class="text-slate-500 italic">${safeToken}</span>`;
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('`')) {
      result += `<span class="text-emerald-400">${safeToken}</span>`;
    } else if (/^\d/.test(token)) {
      result += `<span class="text-amber-300">${safeToken}</span>`;
    } else if (token === 'println!' || kwSet.has(token)) {
      result += `<span class="text-sky-400 font-medium">${safeToken}</span>`;
    } else {
      result += safeToken;
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    result += escapeHtml(line.slice(lastIndex));
  }

  return result || '&nbsp;';
}

interface DiffLine {
  type: 'context' | 'add' | 'remove';
  oldLine?: number;
  newLine?: number;
  text: string;
}

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const out: DiffLine[] = [];

  if (!oldText) {
    return newLines.map((text, idx) => ({
      type: 'add',
      newLine: idx + 1,
      text,
    }));
  }

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) {
      if (o !== undefined) {
        out.push({ type: 'context', oldLine: i + 1, newLine: i + 1, text: o });
      }
    } else {
      if (o !== undefined) {
        out.push({ type: 'remove', oldLine: i + 1, text: o });
      }
      if (n !== undefined) {
        out.push({ type: 'add', newLine: i + 1, text: n });
      }
    }
  }
  return out;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  locale,
  file,
  debugStatus,
  activeDebugLine,
  findings,
  pendingChange,
  jumpToLineRequest,
  onChangeContent,
  onToggleBreakpoint,
  onRun,
  onStartDebug,
  onStepDebug,
  onContinueDebug,
  onStopDebug,
  onScanFile,
  onAcceptChange,
  onRejectChange,
}) => {
  const copy = UI_COPY[locale].editor;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1 });
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const [showDiffView, setShowDiffView] = useState(false);

  useEffect(() => {
    if (!pendingChange) {
      setShowDiffView(false);
    }
  }, [pendingChange]);

  const lines = useMemo(() => file.content.split('\n'), [file.content]);

  const findingsByLine = useMemo(() => {
    const map = new Map<number, SecurityFinding[]>();
    for (const f of findings) {
      if (f.fileId !== file.id) continue;
      const list = map.get(f.line) || [];
      list.push(f);
      map.set(f.line, list);
    }
    return map;
  }, [findings, file.id]);

  const highlightedHtml = useMemo(() => {
    return lines
      .map((line, idx) => {
        const lineNum = idx + 1;
        const isDebugLine = activeDebugLine === lineNum;
        const lineFindings = findingsByLine.get(lineNum);
        const bgClass = isDebugLine
          ? 'bg-amber-500/20'
          : lineFindings && lineFindings.length > 0
          ? 'bg-red-500/10'
          : '';
        return `<div class="h-6 leading-6 px-3 ${bgClass}">${highlightLine(line, file.language)}</div>`;
      })
      .join('');
  }, [lines, file.language, activeDebugLine, findingsByLine]);

  const diffLines = useMemo(() => {
    if (!pendingChange || !showDiffView) return [];
    return computeLineDiff(pendingChange.originalContent, pendingChange.proposedContent);
  }, [pendingChange, showDiffView]);

  const scrollToLine = (targetLine: number) => {
    if (!textareaRef.current) return;
    const clamped = Math.max(1, Math.min(lines.length, targetLine));
    const offsetChars = lines
      .slice(0, clamped - 1)
      .reduce((acc, l) => acc + l.length + 1, 0);
    const ta = textareaRef.current;
    ta.focus();
    ta.setSelectionRange(offsetChars, offsetChars);
    const scrollTarget = Math.max(0, (clamped - 5) * 24);
    ta.scrollTop = scrollTarget;
    if (preRef.current) preRef.current.scrollTop = scrollTarget;
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTarget;
    setCursorInfo({ line: clamped, col: 1 });
  };

  useEffect(() => {
    if (!jumpToLineRequest) return;
    scrollToLine(jumpToLineRequest.line);
  }, [jumpToLineRequest]);

  const handleScroll = () => {
    if (!textareaRef.current) return;
    const { scrollTop, scrollLeft } = textareaRef.current;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  };

  const updateCursor = () => {
    if (!textareaRef.current) return;
    const pos = textareaRef.current.selectionStart;
    const before = file.content.slice(0, pos);
    const split = before.split('\n');
    setCursorInfo({
      line: split.length,
      col: split[split.length - 1].length + 1,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = file.content.slice(0, start) + '    ' + file.content.slice(end);
      onChangeContent(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 4;
      });
    } else if (
      (e.ctrlKey || e.metaKey) &&
      (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h')
    ) {
      e.preventDefault();
      setShowSearch(true);
    } else if (e.key === 'F9' && file.language !== 'react') {
      e.preventDefault();
      onToggleBreakpoint(cursorInfo.line);
    }
  };

  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const matches: Array<{ start: number; end: number; line: number }> = [];
    const lowerContent = file.content.toLowerCase();
    let idx = 0;
    while (idx < lowerContent.length) {
      const found = lowerContent.indexOf(q, idx);
      if (found === -1) break;
      const lineNum = file.content.slice(0, found).split('\n').length;
      matches.push({ start: found, end: found + q.length, line: lineNum });
      idx = found + q.length;
    }
    return matches;
  }, [searchQuery, file.content]);

  const jumpToMatch = (matchIndex: number) => {
    if (searchMatches.length === 0 || !textareaRef.current) return;
    const normalized =
      ((matchIndex % searchMatches.length) + searchMatches.length) % searchMatches.length;
    setActiveMatchIdx(normalized);
    const m = searchMatches[normalized];
    const ta = textareaRef.current;
    ta.focus();
    ta.setSelectionRange(m.start, m.end);
    const scrollTarget = Math.max(0, (m.line - 5) * 24);
    ta.scrollTop = scrollTarget;
    if (preRef.current) preRef.current.scrollTop = scrollTarget;
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTarget;
  };

  const handleReplaceCurrent = () => {
    if (searchMatches.length === 0) return;
    const m = searchMatches[activeMatchIdx % searchMatches.length];
    const next = file.content.slice(0, m.start) + replaceQuery + file.content.slice(m.end);
    onChangeContent(next);
  };

  const handleReplaceAll = () => {
    if (!searchQuery.trim()) return;
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const next = file.content.replace(new RegExp(escaped, 'gi'), replaceQuery);
    onChangeContent(next);
  };

  const isDebugging = debugStatus === 'paused' || debugStatus === 'running';

  return (
    <section className="flex flex-col flex-1 min-w-0 min-h-0 bg-[#0B0F17]">
      {/* Editor Command Bar */}
      <div className="h-11 shrink-0 border-b border-slate-800/90 bg-[#101624] px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span dir="ltr" className="code-ltr font-mono text-xs font-medium text-slate-200 truncate">
            {file.path}
          </span>
          <span className="text-xs text-slate-500 whitespace-nowrap">
            {file.language.toUpperCase()}
          </span>
          <span dir="ltr" className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap hidden sm:inline">
            Ln {cursorInfo.line}, Col {cursorInfo.col}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowSearch((v) => !v)}
            title="Find & Replace (Ctrl+F)"
            className="flex items-center gap-1.5 rounded border border-slate-700/80 bg-[#161E2E] px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            {copy.findReplace}
          </button>

          <button
            onClick={onScanFile}
            className="flex items-center gap-1.5 rounded border border-slate-700/80 bg-[#161E2E] px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            {copy.securityScan}
          </button>

          {file.language !== 'react' && (
            <>
              {!isDebugging ? (
                <button
                  onClick={onStartDebug}
                  className="flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Bug className="w-3.5 h-3.5" />
                  {copy.debug}
                </button>
              ) : (
                <>
                  <button
                    onClick={onStepDebug}
                    title="Step Over (F10)"
                    className="flex items-center gap-1 rounded border border-slate-700 bg-[#161E2E] px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                  >
                    <StepForward className="w-3.5 h-3.5 text-sky-400" />
                    {copy.step}
                  </button>
                  <button
                    onClick={onContinueDebug}
                    title="Continue (F5)"
                    className="flex items-center gap-1 rounded border border-slate-700 bg-[#161E2E] px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                  >
                    <FastForward className="w-3.5 h-3.5 text-emerald-400" />
                    {copy.continue}
                  </button>
                  <button
                    onClick={onStopDebug}
                    title="Stop Debugging (Shift+F5)"
                    className="flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/20 whitespace-nowrap cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    {copy.stop}
                  </button>
                </>
              )}
            </>
          )}

          <button
            onClick={onRun}
            title="Run & Simulate (F5)"
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            {debugStatus === 'completed' ? (
              <RotateCcw className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            {copy.run}
          </button>
        </div>
      </div>

      {/* Agent Live Diff Review Bar */}
      {pendingChange && (
        <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-200 min-w-0">
            <GitCompare className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-medium">
              {pendingChange.changeType === 'added' ? copy.agentCreated : copy.agentModified}
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-300 truncate">{pendingChange.summary}</span>
            {pendingChange.healedCount > 0 && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-emerald-300">
                  {pendingChange.healedCount} {copy.autoHealedSuffix}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowDiffView((v) => !v)}
              className="rounded border border-slate-700 bg-[#161E2E] px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              {showDiffView ? copy.codeEditor : copy.viewDiff}
            </button>
            {onRejectChange && (
              <button
                onClick={() => onRejectChange(pendingChange.fileId)}
                className="flex items-center gap-1 rounded border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/25 cursor-pointer whitespace-nowrap"
              >
                <X className="w-3.5 h-3.5" />
                {copy.reject}
              </button>
            )}
            {onAcceptChange && (
              <button
                onClick={() => onAcceptChange(pendingChange.fileId)}
                className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 cursor-pointer whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                {copy.acceptChange}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Inline Find & Replace Bar */}
      {showSearch && (
        <div className="shrink-0 border-b border-slate-800 bg-[#131A29] px-4 py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="flex items-center gap-1.5 bg-[#0B0F17] border border-slate-700 rounded px-2.5 py-1">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                dir="ltr"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setActiveMatchIdx(0);
                }}
                placeholder={copy.findPlaceholder}
                autoFocus
                className="code-ltr w-40 bg-transparent text-xs font-mono text-slate-100 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => jumpToMatch(activeMatchIdx - 1)}
                disabled={searchMatches.length === 0}
                title="Previous match"
                className="p-1 rounded border border-slate-700 bg-[#161E2E] text-slate-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => jumpToMatch(activeMatchIdx + 1)}
                disabled={searchMatches.length === 0}
                title="Next match"
                className="p-1 rounded border border-slate-700 bg-[#161E2E] text-slate-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-slate-400 font-mono tabular-nums px-1 whitespace-nowrap">
                {searchMatches.length > 0
                  ? `${(activeMatchIdx % searchMatches.length) + 1}/${searchMatches.length}`
                  : copy.zeroMatches}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-[#0B0F17] border border-slate-700 rounded px-2.5 py-1">
              <Replace className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                dir="ltr"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder={copy.replacePlaceholder}
                className="code-ltr w-40 bg-transparent text-xs font-mono text-slate-100 focus:outline-none"
              />
            </div>

            <button
              onClick={handleReplaceCurrent}
              disabled={searchMatches.length === 0}
              className="rounded border border-slate-700 bg-[#161E2E] px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40 cursor-pointer whitespace-nowrap"
            >
              {copy.replace}
            </button>
            <button
              onClick={handleReplaceAll}
              disabled={searchMatches.length === 0}
              className="rounded border border-slate-700 bg-[#161E2E] px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40 cursor-pointer whitespace-nowrap"
            >
              {copy.replaceAll}
            </button>
          </div>
          <button
            onClick={() => setShowSearch(false)}
            className="p-1 text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Either Unified Diff Viewer or Interactive Code Editor (Strict Bidi LTR Isolation) */}
      {showDiffView && pendingChange ? (
        <div
          dir="ltr"
          className="code-ltr flex-1 min-h-0 overflow-auto bg-[#0B0F17] font-mono text-[13px] py-2"
        >
          {diffLines.map((dl, idx) => (
            <div
              key={idx}
              dir="ltr"
              className={`code-ltr flex items-start px-3 h-6 leading-6 whitespace-pre ${
                dl.type === 'add'
                  ? 'bg-emerald-500/15 text-emerald-200'
                  : dl.type === 'remove'
                  ? 'bg-red-500/15 text-red-300'
                  : 'text-slate-300'
              }`}
            >
              <span className="w-10 text-right pr-2 text-[11px] text-slate-500 tabular-nums select-none shrink-0">
                {dl.oldLine ?? ''}
              </span>
              <span className="w-10 text-right pr-2 text-[11px] text-slate-500 tabular-nums select-none shrink-0">
                {dl.newLine ?? ''}
              </span>
              <span className="w-5 text-center select-none shrink-0 font-semibold">
                {dl.type === 'add' ? '+' : dl.type === 'remove' ? '-' : ' '}
              </span>
              <span>{dl.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <div
          dir="ltr"
          className="code-ltr relative flex flex-1 min-h-0 overflow-hidden font-mono text-[13px]"
        >
          <div
            ref={gutterRef}
            dir="ltr"
            className="w-16 shrink-0 bg-[#0D121C] border-r border-slate-800/80 overflow-hidden select-none py-3 text-right"
          >
            {lines.map((_, idx) => {
              const lineNum = idx + 1;
              const hasBreakpoint = file.breakpoints.includes(lineNum);
              const isDebugLine = activeDebugLine === lineNum;
              const lineSecurity = findingsByLine.get(lineNum);
              const hasCritical = lineSecurity?.some(
                (f) => f.severity === 'critical' || f.severity === 'high'
              );

              return (
                <div
                  key={lineNum}
                  onClick={() => file.language !== 'react' && onToggleBreakpoint(lineNum)}
                  title={
                    file.language !== 'react'
                      ? `Toggle Breakpoint at line ${lineNum} (F9)`
                      : `Line ${lineNum}`
                  }
                  className={`h-6 leading-6 px-2 flex items-center justify-between text-[11px] tabular-nums ${
                    file.language !== 'react' ? 'cursor-pointer hover:bg-slate-800/50' : ''
                  } ${isDebugLine ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-slate-500'}`}
                >
                  <span className="w-4 flex items-center justify-center">
                    {hasBreakpoint ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                    ) : isDebugLine ? (
                      <span className="text-amber-400 text-[10px]">▶</span>
                    ) : lineSecurity && lineSecurity.length > 0 ? (
                      <span
                        className={`w-2 h-2 rounded-sm inline-block ${
                          hasCritical ? 'bg-red-400' : 'bg-amber-400'
                        }`}
                      />
                    ) : null}
                  </span>
                  <span>{lineNum}</span>
                </div>
              );
            })}
          </div>

          <div dir="ltr" className="code-ltr relative flex-1 min-w-0 overflow-hidden bg-[#0B0F17]">
            <pre
              ref={preRef}
              dir="ltr"
              aria-hidden="true"
              className="code-ltr pointer-events-none absolute inset-0 m-0 py-3 overflow-hidden whitespace-pre font-mono text-[13px] leading-6 text-slate-200"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
            <textarea
              ref={textareaRef}
              dir="ltr"
              value={file.content}
              onChange={(e) => onChangeContent(e.target.value)}
              onScroll={handleScroll}
              onClick={updateCursor}
              onKeyUp={updateCursor}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              wrap="off"
              className="code-input code-ltr absolute inset-0 w-full h-full resize-none bg-transparent py-3 px-3 font-mono text-[13px] leading-6 text-transparent caret-slate-100 focus:outline-none overflow-auto whitespace-pre"
            />
          </div>
        </div>
      )}
    </section>
  );
};
