import { SecurityFinding, WorkspaceFile } from '../types/ide';

interface SecurityRule {
  id: string;
  languages: Array<'c' | 'cpp' | 'rust' | 'react'>;
  pattern: RegExp;
  cwe: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  recommendation: string;
  fixLabel?: string;
  autoFix?: (line: string) => string | null;
}

const SECURITY_RULES: SecurityRule[] = [
  {
    id: 'c-gets',
    languages: ['c', 'cpp'],
    pattern: /\bgets\s*\(\s*([a-zA-Z_]\w*)\s*\)/,
    cwe: 'CWE-242',
    severity: 'critical',
    title: 'Unsafe input function gets()',
    description: 'gets() performs no bounds checking and can cause stack buffer overflow and arbitrary code execution.',
    recommendation: 'Replace with fgets(buf, sizeof(buf), stdin) with an explicit buffer limit.',
    fixLabel: 'Replace with fgets()',
    autoFix: (line) =>
      line.replace(/\bgets\s*\(\s*([a-zA-Z_]\w*)\s*\)/, 'fgets($1, sizeof($1), stdin)'),
  },
  {
    id: 'c-strcpy',
    languages: ['c', 'cpp'],
    pattern: /\bstrcpy\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/,
    cwe: 'CWE-120',
    severity: 'high',
    title: 'Unbounded string copy strcpy()',
    description: 'strcpy() does not verify destination buffer capacity, risking stack or heap memory corruption.',
    recommendation: 'Use strncpy() bounded by sizeof(dest) - 1.',
    fixLabel: 'Replace with strncpy()',
    autoFix: (line) =>
      line.replace(
        /\bstrcpy\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/,
        'strncpy($1, $2, sizeof($1) - 1)'
      ),
  },
  {
    id: 'c-strcat',
    languages: ['c', 'cpp'],
    pattern: /\bstrcat\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/,
    cwe: 'CWE-120',
    severity: 'high',
    title: 'Unbounded string concatenation strcat()',
    description: 'strcat() can overflow destination buffers when concatenated input length is unchecked.',
    recommendation: 'Replace with strncat() bounded by remaining capacity.',
    fixLabel: 'Replace with strncat()',
    autoFix: (line) =>
      line.replace(
        /\bstrcat\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/,
        'strncat($1, $2, sizeof($1) - strlen($1) - 1)'
      ),
  },
  {
    id: 'c-sprintf',
    languages: ['c', 'cpp'],
    pattern: /\bsprintf\s*\(\s*([^,]+?)\s*,/,
    cwe: 'CWE-120',
    severity: 'high',
    title: 'Unbounded formatting sprintf()',
    description: 'sprintf() writes without destination length limits, enabling buffer overflow.',
    recommendation: 'Use snprintf(buf, sizeof(buf), ...) instead.',
    fixLabel: 'Replace with snprintf()',
    autoFix: (line) =>
      line.replace(/\bsprintf\s*\(\s*([^,]+?)\s*,/, 'snprintf($1, sizeof($1),'),
  },
  {
    id: 'c-uninit-ptr',
    languages: ['c', 'cpp'],
    pattern: /^\s*(?:int|char|float|double|void|long|short)\s*\*\s*([a-zA-Z_]\w*)\s*;/,
    cwe: 'CWE-457',
    severity: 'high',
    title: 'Uninitialized raw pointer declaration',
    description: 'Declaring a pointer without initialization leaves a wild memory address that causes undefined behavior on dereference.',
    recommendation: 'Initialize pointers to NULL / nullptr on declaration.',
    fixLabel: 'Initialize to NULL',
    autoFix: (line) => line.replace(/;\s*$/, ' = NULL;'),
  },
  {
    id: 'c-format-string',
    languages: ['c', 'cpp'],
    pattern: /\bprintf\s*\(\s*([a-zA-Z_]\w*)\s*\)/,
    cwe: 'CWE-134',
    severity: 'high',
    title: 'Format string vulnerability in printf()',
    description: 'Passing a variable directly as the format argument allows arbitrary stack reads or writes.',
    recommendation: 'Always pass a literal format string: printf("%s", var).',
    fixLabel: 'Add "%s" format literal',
    autoFix: (line) => line.replace(/\bprintf\s*\(\s*([a-zA-Z_]\w*)\s*\)/, 'printf("%s", $1)'),
  },
  {
    id: 'c-system-cmd',
    languages: ['c', 'cpp'],
    pattern: /\b(system|popen)\s*\(/,
    cwe: 'CWE-78',
    severity: 'critical',
    title: 'OS command injection risk via system()/popen()',
    description: 'Invoking a shell sub-process directly exposes the application to command injection.',
    recommendation: 'Use execve() with explicit argument arrays instead of shell wrappers.',
  },
  {
    id: 'c-raw-free',
    languages: ['c', 'cpp'],
    pattern: /\bfree\s*\(\s*([a-zA-Z_]\w*)\s*\)\s*;/,
    cwe: 'CWE-416',
    severity: 'medium',
    title: 'Potential dangling pointer after free()',
    description: 'Freeing heap memory without nullifying the pointer risks Use-After-Free or Double-Free.',
    recommendation: 'Set the pointer to NULL immediately after free().',
    fixLabel: 'Nullify pointer after free',
    autoFix: (line) =>
      line.replace(/\bfree\s*\(\s*([a-zA-Z_]\w*)\s*\)\s*;/, 'free($1); $1 = NULL;'),
  },
  {
    id: 'rust-unsafe',
    languages: ['rust'],
    pattern: /\bunsafe\s*\{/,
    cwe: 'CWE-119',
    severity: 'high',
    title: 'Use of unsafe block in Rust',
    description: 'unsafe blocks bypass Rust borrow checker and memory safety invariants.',
    recommendation: 'Minimize unsafe scope or replace with safe standard abstractions.',
  },
  {
    id: 'rust-transmute',
    languages: ['rust'],
    pattern: /mem::transmute\b/,
    cwe: 'CWE-704',
    severity: 'critical',
    title: 'Unsafe type reinterpretation std::mem::transmute',
    description: 'transmute reinterprets raw bits without alignment or validity checks, risking undefined behavior.',
    recommendation: 'Use explicit safe conversions such as From/Into or try_into().',
  },
  {
    id: 'rust-unwrap',
    languages: ['rust'],
    pattern: /\.unwrap\s*\(\s*\)/,
    cwe: 'CWE-248',
    severity: 'medium',
    title: 'Unchecked .unwrap() call',
    description: '.unwrap() panics and crashes the thread if the Option or Result contains None/Err.',
    recommendation: 'Handle errors explicitly via match, the ? operator, or .unwrap_or_default().',
    fixLabel: 'Use .unwrap_or_default()',
    autoFix: (line) => line.replace(/\.unwrap\s*\(\s*\)/, '.unwrap_or_default()'),
  },
  {
    id: 'rust-command',
    languages: ['rust'],
    pattern: /Command::new\s*\(\s*["'](sh|bash|cmd)["']/,
    cwe: 'CWE-78',
    severity: 'high',
    title: 'Direct shell invocation from Rust',
    description: 'Spawning a shell interpreter with dynamic arguments can lead to command injection.',
    recommendation: 'Invoke the target executable directly without sh/bash.',
  },
  {
    id: 'react-dangerously',
    languages: ['react'],
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\{/,
    cwe: 'CWE-79',
    severity: 'critical',
    title: 'XSS risk via dangerouslySetInnerHTML',
    description: 'Injecting raw HTML bypasses React escaping and exposes users to Cross-Site Scripting.',
    recommendation: 'Render structured JSX text or sanitize HTML with DOMPurify.',
  },
  {
    id: 'react-eval',
    languages: ['react'],
    pattern: /\b(eval|new\s+Function)\s*\(/,
    cwe: 'CWE-95',
    severity: 'critical',
    title: 'Dynamic code execution via eval() / Function()',
    description: 'eval() executes arbitrary strings as JavaScript, creating severe code injection risk.',
    recommendation: 'Replace with JSON.parse() or deterministic AST evaluation.',
  },
  {
    id: 'react-secret',
    languages: ['react', 'c', 'cpp', 'rust'],
    pattern: /(api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{8,}["']/i,
    cwe: 'CWE-798',
    severity: 'high',
    title: 'Hardcoded credential or API secret',
    description: 'Embedding secrets directly in source files exposes credentials in client bundles or binaries.',
    recommendation: 'Move secrets to runtime environment variables or encrypted local storage.',
  },
  {
    id: 'react-innerhtml',
    languages: ['react'],
    pattern: /\.innerHTML\s*=/,
    cwe: 'CWE-79',
    severity: 'high',
    title: 'Direct DOM innerHTML assignment',
    description: 'Mutating innerHTML directly bypasses React DOM sanitization and risks XSS.',
    recommendation: 'Use textContent or declarative JSX rendering.',
    fixLabel: 'Replace with textContent',
    autoFix: (line) => line.replace(/\.innerHTML\s*=/, '.textContent ='),
  },
];

export function scanFileSecurity(file: WorkspaceFile): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const lines = file.content.split('\n');

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return;
    }

    for (const rule of SECURITY_RULES) {
      if (!rule.languages.includes(file.language)) continue;
      const match = rule.pattern.exec(rawLine);
      if (match) {
        if (rule.id === 'c-raw-free' && /=\s*(NULL|nullptr)\s*;/.test(rawLine)) {
          continue;
        }
        findings.push({
          id: `${file.id}-${rule.id}-${index + 1}`,
          fileId: file.id,
          fileName: file.name,
          language: file.language,
          line: index + 1,
          column: (match.index ?? 0) + 1,
          cwe: rule.cwe,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          recommendation: rule.recommendation,
          snippet: trimmed,
          fixable: Boolean(rule.autoFix),
          fixLabel: rule.fixLabel,
        });
      }
    }
  });

  return findings;
}

export function scanWorkspaceSecurity(files: WorkspaceFile[]): SecurityFinding[] {
  return files.flatMap(scanFileSecurity).sort((a, b) => {
    const weight = { critical: 0, high: 1, medium: 2, low: 3 };
    return weight[a.severity] - weight[b.severity] || a.line - b.line;
  });
}

export function applySecurityAutoFix(
  file: WorkspaceFile,
  finding: SecurityFinding
): string | null {
  const lines = file.content.split('\n');
  const lineIndex = finding.line - 1;
  if (lineIndex < 0 || lineIndex >= lines.length) return null;

  const targetLine = lines[lineIndex];
  for (const rule of SECURITY_RULES) {
    if (!rule.languages.includes(file.language)) continue;
    if (finding.id.includes(`-${rule.id}-`) && rule.autoFix) {
      const fixed = rule.autoFix(targetLine);
      if (fixed && fixed !== targetLine) {
        lines[lineIndex] = fixed;
        return lines.join('\n');
      }
    }
  }
  return null;
}

export function applyAllFixableIssues(file: WorkspaceFile): {
  patchedContent: string;
  fixCount: number;
} {
  let current = { ...file };
  let fixCount = 0;
  const findings = scanFileSecurity(current);
  for (const finding of findings) {
    if (!finding.fixable) continue;
    const next = applySecurityAutoFix(current, finding);
    if (next && next !== current.content) {
      current = { ...current, content: next };
      fixCount++;
    }
  }
  return { patchedContent: current.content, fixCount };
}
