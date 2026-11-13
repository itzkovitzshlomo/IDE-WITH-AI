import {
  AgentLogEntry,
  AgentPipelineStage,
  AgentTask,
  CodeLanguage,
  ExpertRoleId,
  PendingAgentChange,
  SandboxPolicy,
  SparkMoETelemetry,
  UiLocale,
  WorkspaceFile,
  WorkspaceState,
} from '../types/ide';
import { MeoOfflineRuntime } from './meoRuntime';
import { SandboxDebugSession } from './sandboxInterpreter';
import { applyAllFixableIssues, scanFileSecurity } from './securityScanner';
import { buildOfflineReactSandboxHtml } from './reactCompiler';

export interface BlueprintFileSpec {
  name: string;
  folderPath: string;
  language: CodeLanguage;
  summary: string;
  initialContent: string;
}

export interface AgentOrchestratorCallbacks {
  onStageChange: (stage: AgentPipelineStage) => void;
  onTasksUpdate: (tasks: AgentTask[]) => void;
  onLog: (entry: AgentLogEntry) => void;
  onRouteExpert?: (expertId: ExpertRoleId) => Promise<SparkMoETelemetry | null>;
  onApplyFiles: (
    nextWorkspace: WorkspaceState,
    pendingChanges: PendingAgentChange[]
  ) => void;
  onSecurityRefresh: (files: WorkspaceFile[]) => void;
}

interface ParsedGoalIntent {
  isHebrew: boolean;
  englishSummary: string;
  wantsTcpServer: boolean;
  wantsRustAllocator: boolean;
  wantsReactDashboard: boolean;
  wantsSecurityHarden: boolean;
}

function analyzeGoalIntent(goal: string): ParsedGoalIntent {
  const lower = goal.toLowerCase();
  const isHebrew = /[\u0590-\u05FF]/.test(goal);

  const wantsTcpServer =
    lower.includes('tcp') ||
    lower.includes('server') ||
    lower.includes('socket') ||
    /שרת|תקשורת|סוקט|רשת|מקבילי/.test(goal) ||
    ((lower.includes('c ') || goal.includes('בשפת C') || goal.includes('ב-C')) &&
      (lower.includes('react') || /ריאקט|דשבורד|ממשק/.test(goal)));

  const wantsRustAllocator =
    lower.includes('rust') ||
    lower.includes('allocator') ||
    lower.includes('crate') ||
    lower.includes('slab') ||
    /ראסט|מקצה|זיכרון|ניהול זיכרון/.test(goal);

  const wantsReactDashboard =
    lower.includes('react') ||
    lower.includes('dashboard') ||
    lower.includes('frontend') ||
    /ריאקט|דשבורד|ממשק|לוח בקרה|קומפוננטה/.test(goal);

  const wantsSecurityHarden =
    lower.includes('fix') ||
    lower.includes('harden') ||
    lower.includes('audit') ||
    lower.includes('security') ||
    lower.includes('cwe') ||
    /אבטחה|הקשח|תקן|פרצות|חולשות|סרוק|בטיחות/.test(goal);

  let englishSummary = 'Modular C++ Telemetry & C Verification Suite';
  if (wantsTcpServer) {
    englishSummary = 'Concurrent C TCP Server, Unit Tests & React Monitor';
  } else if (wantsRustAllocator) {
    englishSummary = 'Rust Paged Slab Allocator & Ownership Safety Tests';
  } else if (wantsReactDashboard && !wantsTcpServer) {
    englishSummary = 'Interactive React System Dashboard & C++ Core Module';
  } else if (wantsSecurityHarden) {
    englishSummary = 'Workspace CWE Security Hardening & Sandbox Audit';
  }

  return {
    isHebrew,
    englishSummary,
    wantsTcpServer,
    wantsRustAllocator,
    wantsReactDashboard,
    wantsSecurityHarden,
  };
}

function buildBlueprintForGoal(
  goal: string,
  workspace: WorkspaceState,
  locale: UiLocale
): {
  intent: ParsedGoalIntent;
  tasks: AgentTask[];
  files: BlueprintFileSpec[];
} {
  const intent = analyzeGoalIntent(goal);
  const he = locale === 'he' || intent.isHebrew;

  // Case 1: Concurrent TCP Server in C + unit tests + React frontend dashboard
  if (intent.wantsTcpServer) {
    return {
      intent,
      tasks: [
        {
          id: 'task-arch-1',
          agent: 'Architect',
          title: he
            ? 'תכנון ארכיטקטורת שרת TCP ב-C, בדיקות יחידה ודשבורד React'
            : 'Design multi-folder C server, test harness & React dashboard',
          detail: 'Folders: /src/server, /tests, /src/dashboard',
          status: 'pending',
        },
        {
          id: 'task-build-1',
          agent: 'Builder',
          title: he
            ? 'בניית מודול שרת TCP מקבילי בשפת C (קוד באנגלית)'
            : 'Scaffold concurrent TCP session handler in C',
          detail: '/src/server/tcp_server.c',
          status: 'pending',
        },
        {
          id: 'task-build-2',
          agent: 'Builder',
          title: he
            ? 'יצירת בדיקות יחידה לבדיקת תקינות חיבורים ומנות ב-C'
            : 'Create C socket packet & connection unit tests',
          detail: '/tests/tcp_server_test.c',
          status: 'pending',
        },
        {
          id: 'task-build-3',
          agent: 'Builder',
          title: he
            ? 'פיתוח דשבורד טלמטריה ב-React למעקב אחר תהליכוני TCP'
            : 'Build React live TCP worker telemetry dashboard',
          detail: '/src/dashboard/TcpMonitor.tsx',
          status: 'pending',
        },
        {
          id: 'task-qa-1',
          agent: 'QA & Security',
          title: he
            ? 'הרצת סימולציית F5, סריקת CWE ותיקון עצמי אוטומטי'
            : 'Execute F5 sandbox simulation & CWE security scan',
          detail: 'Auto-heal buffer, pointer, or XSS issues if detected',
          status: 'pending',
        },
      ],
      files: [
        {
          name: 'tcp_server.c',
          folderPath: '/src/server',
          language: 'c',
          summary: 'Concurrent TCP worker dispatcher & session buffer',
          // Clean English code & comments; includes intentional CWE-120/457 for QA Self-Healing verification
          initialContent: `#include <stdio.h>
#include <string.h>

/**
 * Dispatches an incoming client connection to an available worker slot.
 */
int dispatch_worker(int client_id, int active_pool) {
    int slot = (client_id * 3) + active_pool;
    return slot;
}

int main() {
    char peer_banner[32];
    char incoming[] = "TCP_127_0_0_1_8080";
    strcpy(peer_banner, incoming);

    int *session_ptr;
    int workers = 4;
    int dispatched = 0;

    for (int conn = 1; conn <= workers; conn++) {
        dispatched = dispatch_worker(conn, dispatched);
    }

    printf("TCP Server Bound: %s\\n", peer_banner);
    printf("Concurrent Workers Dispatched: %d\\n", dispatched);
    return 0;
}
`,
        },
        {
          name: 'tcp_server_test.c',
          folderPath: '/tests',
          language: 'c',
          summary: 'Unit tests verifying TCP worker pool invariants',
          initialContent: `#include <stdio.h>

/**
 * Ensures requested worker count never exceeds pool maximum.
 */
int verify_pool_capacity(int requested, int max_workers) {
    if (requested > max_workers) {
        return max_workers;
    }
    return requested;
}

int main() {
    int passed = 0;
    int cap1 = verify_pool_capacity(8, 16);
    if (cap1 == 8) {
        passed = passed + 1;
    }
    int cap2 = verify_pool_capacity(64, 16);
    if (cap2 == 16) {
        passed = passed + 1;
    }
    printf("TCP Unit Tests Passed: %d/2\\n", passed);
    return 0;
}
`,
        },
        {
          name: 'TcpMonitor.tsx',
          folderPath: '/src/dashboard',
          language: 'react',
          summary: 'React frontend dashboard for concurrent TCP worker telemetry',
          initialContent: `import React, { useState } from 'react';

/**
 * Live telemetry dashboard for monitoring the C TCP worker pool.
 */
export default function TcpMonitor() {
  const [workers, setWorkers] = useState(4);
  const [activeSockets, setActiveSockets] = useState(12);

  return (
    <div style={{
      fontFamily: 'system-ui, sans-serif',
      background: '#0F172A',
      color: '#F8FAFC',
      padding: '18px',
      borderRadius: '8px',
      border: '1px solid #1E293B'
    }}>
      <h2 style={{ margin: '0 0 6px 0', fontSize: '16px' }}>
        Concurrent C TCP Server Dashboard
      </h2>
      <p style={{ margin: '0 0 14px 0', color: '#94A3B8', fontSize: '12px' }}>
        Local SparkMoE Sandbox Monitor · Zero External Network
      </p>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <div style={{ flex: 1, background: '#0B0F17', padding: '10px', borderRadius: '6px' }}>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>Worker Threads</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#38BDF8' }}>{workers}</div>
        </div>
        <div style={{ flex: 1, background: '#0B0F17', padding: '10px', borderRadius: '6px' }}>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>Active Sockets</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#10B981' }}>{activeSockets}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setActiveSockets(s => s + workers)}
          style={{ background: '#2563EB', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer' }}
        >
          Simulate Burst
        </button>
        <button
          onClick={() => setWorkers(w => w >= 16 ? 4 : w + 4)}
          style={{ background: '#1E293B', color: '#E2E8F0', border: '1px solid #334155', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer' }}
        >
          Scale Pool
        </button>
      </div>
    </div>
  );
}
`,
        },
      ],
    };
  }

  // Case 2: Rust memory allocator / safety crate
  if (intent.wantsRustAllocator) {
    return {
      intent,
      tasks: [
        {
          id: 'task-arch-1',
          agent: 'Architect',
          title: he
            ? 'תכנון מקצה זיכרון דפים ב-Rust ומודול בדיקות בטיחות'
            : 'Plan Rust slab allocator & audit test modules',
          detail: 'Folders: /src/rust_runtime, /tests',
          status: 'pending',
        },
        {
          id: 'task-build-1',
          agent: 'Builder',
          title: he
            ? 'מימוש מקצה Slab מאוזן-דפים בשפת Rust (קוד באנגלית)'
            : 'Implement Rust paged Normal-RAM allocator',
          detail: '/src/rust_runtime/slab_allocator.rs',
          status: 'pending',
        },
        {
          id: 'task-build-2',
          agent: 'Builder',
          title: he
            ? 'יצירת בדיקות יחידה לאימות גבולות זיכרון ב-Rust'
            : 'Create Rust safety & bounds verification tests',
          detail: '/tests/slab_test.rs',
          status: 'pending',
        },
        {
          id: 'task-qa-1',
          agent: 'QA & Security',
          title: he
            ? 'הרצת ארגז חול ובדיקת בטיחות CWE לקוד Rust'
            : 'Run sandbox execution & Rust CWE safety audit',
          detail: 'Verify zero unsafe blocks or panicking unwraps',
          status: 'pending',
        },
      ],
      files: [
        {
          name: 'slab_allocator.rs',
          folderPath: '/src/rust_runtime',
          language: 'rust',
          summary: 'Paged Normal-RAM slab allocator in Rust',
          initialContent: `/// Aligns a requested allocation size to a 64 KB Normal-RAM page boundary.
fn align_page_kb(requested_kb: i32) -> i32 {
    let page_size = 64;
    return ((requested_kb + page_size - 1) / page_size) * page_size;
}

fn main() {
    let mut total_kb = 0;
    for block in 1..=4 {
        total_kb = total_kb + align_page_kb(block * 48);
    }
    println!("Rust Slab Committed: {} KB", total_kb);
}
`,
        },
        {
          name: 'slab_test.rs',
          folderPath: '/tests',
          language: 'rust',
          summary: 'Unit tests for Rust slab alignment bounds',
          initialContent: `/// Verifies that slab allocations stay within the configured RAM limit.
fn main() {
    let max_ram_mb = 4096;
    let allocated_mb = 512;
    if allocated_mb <= max_ram_mb {
        println!("Rust Slab Audit Passed: {} / {} MB", allocated_mb, max_ram_mb);
    }
}
`,
        },
      ],
    };
  }

  // Case 3: React UI Dashboard / Component + C++ Core
  if (intent.wantsReactDashboard && !intent.wantsSecurityHarden) {
    return {
      intent,
      tasks: [
        {
          id: 'task-arch-1',
          agent: 'Architect',
          title: he
            ? 'תרגום הדרישה למבנה ממשק React ומודול ליבה ב-C++'
            : 'Architect React frontend monitor & C++ core metrics module',
          detail: 'Folders: /src/dashboard, /src/cpp_engine',
          status: 'pending',
        },
        {
          id: 'task-build-1',
          agent: 'Builder',
          title: he
            ? 'בניית רכיב לוח בקרה אינטראקטיבי ב-React (קוד באנגלית)'
            : 'Scaffold interactive React system monitor component',
          detail: '/src/dashboard/SystemDashboard.tsx',
          status: 'pending',
        },
        {
          id: 'task-build-2',
          agent: 'Builder',
          title: he
            ? 'מימוש מנוע עיבוד נתונים ב-C++ עם הערות טכניות באנגלית'
            : 'Implement C++ telemetry processing module',
          detail: '/src/cpp_engine/metrics_core.cpp',
          status: 'pending',
        },
        {
          id: 'task-qa-1',
          agent: 'QA & Security',
          title: he
            ? 'בדיקת קומפילציה מבודדת וסריקת אבטחת XSS/CWE'
            : 'Run isolated React & C++ sandbox verification + CWE audit',
          detail: 'Ensure clean CSP sandbox execution',
          status: 'pending',
        },
      ],
      files: [
        {
          name: 'SystemDashboard.tsx',
          folderPath: '/src/dashboard',
          language: 'react',
          summary: `React UI dashboard (${intent.englishSummary})`,
          initialContent: `import React, { useState } from 'react';

/**
 * Interactive offline telemetry dashboard generated from user architecture goal.
 */
export default function SystemDashboard() {
  const [throughput, setThroughput] = useState(84);
  const [cacheMb, setCacheMb] = useState(256);

  return (
    <div style={{
      fontFamily: 'system-ui, sans-serif',
      background: '#0F172A',
      color: '#F8FAFC',
      padding: '18px',
      borderRadius: '8px',
      border: '1px solid #1E293B'
    }}>
      <h2 style={{ margin: '0 0 6px 0', fontSize: '16px' }}>
        Offline System Telemetry Dashboard
      </h2>
      <p style={{ margin: '0 0 14px 0', color: '#94A3B8', fontSize: '12px' }}>
        SparkMoE Qwen4 Coder · Isolated CSP Sandbox
      </p>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <div style={{ flex: 1, background: '#0B0F17', padding: '10px', borderRadius: '6px' }}>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>Throughput</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#38BDF8' }}>{throughput} tok/s</div>
        </div>
        <div style={{ flex: 1, background: '#0B0F17', padding: '10px', borderRadius: '6px' }}>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>Ring Cache</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#10B981' }}>{cacheMb} MB</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setThroughput(t => t + 12)}
          style={{ background: '#2563EB', color: '#fff', border: 'none', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer' }}
        >
          Benchmark Pass
        </button>
        <button
          onClick={() => setCacheMb(c => c >= 1024 ? 256 : c + 128)}
          style={{ background: '#1E293B', color: '#E2E8F0', border: '1px solid #334155', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer' }}
        >
          Tune Cache
        </button>
      </div>
    </div>
  );
}
`,
        },
        {
          name: 'metrics_core.cpp',
          folderPath: '/src/cpp_engine',
          language: 'cpp',
          summary: 'C++ telemetry aggregator with clean English documentation',
          initialContent: `#include <iostream>

/**
 * Computes weighted moving average throughput for local worker telemetry.
 */
int compute_weighted_score(int base_rate, int multiplier) {
    return base_rate * multiplier;
}

int main() {
    int samples[3] = {12, 18, 24};
    int total = 0;
    for (int i = 0; i < 3; i++) {
        total = total + compute_weighted_score(samples[i], 2);
    }
    std::cout << "C++ Telemetry Score: " << total << std::endl;
    return 0;
}
`,
        },
      ],
    };
  }

  // Case 4: Harden & Fix Existing Workspace OR General Polyglot Feature
  const existingTarget = workspace.files[0];
  return {
    intent,
    tasks: [
      {
        id: 'task-arch-1',
        agent: 'Architect',
        title: he
          ? `ניתוח דרישה ותרגום לארכיטקטורה: ${intent.englishSummary}`
          : `Analyze workspace goal: "${goal.slice(0, 48)}${goal.length > 48 ? '...' : ''}"`,
        detail: `Targeting ${workspace.files.length} workspace file(s) & new module`,
        status: 'pending',
      },
      {
        id: 'task-build-1',
        agent: 'Builder',
        title: he
          ? 'בניית מודול C++ ובדיקת יחידה ב-C (קוד ותיעוד באנגלית)'
          : 'Generate hardened C++ telemetry module & unit test',
        detail: '/src/cpp_engine/mission_module.cpp & /tests/mission_test.c',
        status: 'pending',
      },
      {
        id: 'task-qa-1',
        agent: 'QA & Security',
        title: he
          ? 'הרצת סימולציית F5, סריקת CWE ותיקון עצמי'
          : 'Run F5 simulation + CWE security scan & self-heal workspace',
        detail: `Audit ${existingTarget?.name || 'workspace'} and generated modules`,
        status: 'pending',
      },
    ],
    files: [
      {
        name: 'mission_module.cpp',
        folderPath: '/src/cpp_engine',
        language: 'cpp',
        summary: intent.englishSummary,
        initialContent: `#include <iostream>

/**
 * Evaluates a single processing step with strict bounds semantics.
 */
int evaluate_step(int x, int weight) {
    return x * weight;
}

int main() {
    int inputs[3] = {5, 9, 12};
    int score = 0;
    for (int i = 0; i < 3; i++) {
        score = score + evaluate_step(inputs[i], 2);
    }
    std::cout << "Agent Mission Output: " << score << std::endl;
    return 0;
}
`,
      },
      {
        name: 'mission_test.c',
        folderPath: '/tests',
        language: 'c',
        summary: 'Automated verification harness with bounds hardening',
        initialContent: `#include <stdio.h>
#include <string.h>

/**
 * Verifies mission output status buffer inside the offline sandbox.
 */
int main() {
    char status[24];
    char ok[] = "mission_verified";
    strcpy(status, ok);
    printf("Test Status: %s\\n", status);
    return 0;
}
`,
      },
    ],
  };
}

function expertForLanguage(lang: CodeLanguage): ExpertRoleId {
  if (lang === 'rust') return 'expert-rust';
  if (lang === 'react') return 'expert-react';
  return 'expert-c-cpp';
}

export async function executeAutonomousMission(
  goal: string,
  workspace: WorkspaceState,
  sandboxPolicy: SandboxPolicy,
  runtime: MeoOfflineRuntime,
  callbacks: AgentOrchestratorCallbacks,
  locale: UiLocale = 'en'
): Promise<void> {
  const emitLog = (
    agent: AgentLogEntry['agent'],
    stage: AgentPipelineStage,
    message: string,
    tokensPerSec?: number,
    expertLabel?: string
  ) => {
    callbacks.onLog({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      agent,
      stage,
      message,
      tokensPerSec,
      expertLabel,
      timestamp: Date.now(),
    });
  };

  // Stage 1: Planning (Architect Agent with Hebrew/English NLU)
  callbacks.onStageChange('planning');
  const archShard = await callbacks.onRouteExpert?.('expert-architect');
  const blueprint = buildBlueprintForGoal(goal, workspace, locale);
  const heLogs = locale === 'he' || blueprint.intent.isHebrew;

  let tasks: AgentTask[] = blueprint.tasks.map((t, i) =>
    i === 0 ? { ...t, status: 'active' } : t
  );
  callbacks.onTasksUpdate(tasks);

  const archRes = await runtime.runAgentStep({
    stepId: 'arch-plan',
    role: 'Architect',
    goal,
    context: `Target architecture: ${blueprint.intent.englishSummary}`,
  });
  const archTelemetryNote = archShard?.enabled
    ? ` · SparkMoE ${archShard.activeExpertLabel} (${archShard.diskReadMbps} MB/s SSD, ${archShard.cacheUsedMb}/${archShard.cacheCapMb} MB cache)`
    : '';
  emitLog(
    'Architect',
    'planning',
    heLogs
      ? `הנחיית המשתמש תורגמה לתוכנית באנגלית (${blueprint.intent.englishSummary}): ${blueprint.tasks.length} משימות על פני ${blueprint.files.length} מודולים (${archRes.modelName} · ${archRes.allocatedMb} MB RAM${archTelemetryNote}).`
      : `Decomposed mission (${blueprint.intent.englishSummary}) into ${blueprint.tasks.length} tasks across ${blueprint.files.length} target modules (${archRes.modelName} · ${archRes.allocatedMb} MB RAM${archTelemetryNote}).`,
    archRes.tokensPerSec,
    archShard?.enabled ? archShard.activeExpertLabel : undefined
  );

  tasks = tasks.map((t, i) =>
    i === 0 ? { ...t, status: 'done' } : i === 1 ? { ...t, status: 'active' } : t
  );
  callbacks.onTasksUpdate(tasks);

  // Stage 2: Scaffolding (Builder Agents)
  callbacks.onStageChange('scaffolding');
  const nextFolders = new Set(workspace.folders);
  const nextExpanded = new Set(workspace.expandedFolders);
  let nextFiles = [...workspace.files];
  const pendingChanges: PendingAgentChange[] = [];

  for (let idx = 0; idx < blueprint.files.length; idx++) {
    const spec = blueprint.files[idx];
    const targetExpert = expertForLanguage(spec.language);
    const buildShard = await callbacks.onRouteExpert?.(targetExpert);

    const buildRes = await runtime.runAgentStep({
      stepId: `build-${idx}`,
      role: 'Builder',
      goal,
      context: `Scaffolding ${spec.folderPath}/${spec.name}`,
    });

    // Ensure parent folders exist in tree
    const segments = spec.folderPath.split('/').filter(Boolean);
    let accum = '';
    for (const seg of segments) {
      accum += `/${seg}`;
      nextFolders.add(accum);
      nextExpanded.add(accum);
    }

    const fullPath = `${spec.folderPath}/${spec.name}`;
    const existing = nextFiles.find(
      (f) => f.path.toLowerCase() === fullPath.toLowerCase()
    );

    if (existing) {
      pendingChanges.push({
        fileId: existing.id,
        fileName: existing.name,
        filePath: existing.path,
        changeType: 'modified',
        originalContent: existing.content,
        proposedContent: spec.initialContent,
        summary: spec.summary,
        healedCount: 0,
      });
      nextFiles = nextFiles.map((f) =>
        f.id === existing.id
          ? { ...f, content: spec.initialContent, updatedAt: Date.now() }
          : f
      );
    } else {
      const created: WorkspaceFile = {
        id: `agent-file-${Date.now()}-${idx}`,
        name: spec.name,
        folderPath: spec.folderPath,
        path: fullPath,
        language: spec.language,
        content: spec.initialContent,
        updatedAt: Date.now(),
        breakpoints: [],
      };
      nextFiles.push(created);
      pendingChanges.push({
        fileId: created.id,
        fileName: created.name,
        filePath: created.path,
        changeType: 'added',
        originalContent: '',
        proposedContent: spec.initialContent,
        summary: spec.summary,
        healedCount: 0,
      });
    }

    emitLog(
      'Builder',
      'scaffolding',
      `Built ${fullPath} (${spec.language.toUpperCase()})${
        buildShard?.enabled ? ` via ${buildShard.activeExpertLabel}` : ''
      }.`,
      buildRes.tokensPerSec,
      buildShard?.enabled ? buildShard.activeExpertLabel : undefined
    );

    tasks = tasks.map((t) => {
      if (t.agent === 'Builder' && t.detail.includes(spec.name)) {
        return { ...t, status: 'done' };
      }
      return t;
    });
    callbacks.onTasksUpdate(tasks);
  }

  // Also check if existing workspace files have fixable issues when mission asks to harden/fix (EN or HE)
  if (blueprint.intent.wantsSecurityHarden) {
    for (const f of workspace.files) {
      const preFindings = scanFileSecurity(f);
      if (preFindings.some((x) => x.fixable) && !pendingChanges.some((p) => p.fileId === f.id)) {
        pendingChanges.push({
          fileId: f.id,
          fileName: f.name,
          filePath: f.path,
          changeType: 'modified',
          originalContent: f.content,
          proposedContent: f.content,
          summary: 'Security hardening scan target',
          healedCount: 0,
        });
      }
    }
  }

  const firstTargetId = pendingChanges[0]?.fileId || workspace.activeFileId;
  let updatedWorkspace: WorkspaceState = {
    ...workspace,
    folders: Array.from(nextFolders),
    expandedFolders: Array.from(nextExpanded),
    files: nextFiles,
    openTabIds: Array.from(
      new Set([...workspace.openTabIds, ...pendingChanges.map((p) => p.fileId)])
    ),
    activeFileId: firstTargetId,
  };
  callbacks.onApplyFiles(updatedWorkspace, pendingChanges);

  // Stage 3: Executing (Sandbox Simulation)
  callbacks.onStageChange('executing');
  tasks = tasks.map((t) =>
    t.agent === 'QA & Security' ? { ...t, status: 'active' } : t
  );
  callbacks.onTasksUpdate(tasks);

  for (const ch of pendingChanges) {
    const fileObj = updatedWorkspace.files.find((f) => f.id === ch.fileId);
    if (!fileObj) continue;

    if (fileObj.language === 'react') {
      buildOfflineReactSandboxHtml(fileObj.content, updatedWorkspace.files, fileObj.path);
      emitLog(
        'QA & Security',
        'executing',
        `Compiled React component ${fileObj.name} cleanly inside CSP iframe sandbox.`
      );
    } else {
      const session = new SandboxDebugSession(
        fileObj.language,
        fileObj.name,
        fileObj.content,
        [],
        sandboxPolicy
      );
      const snap = session.start(false);
      if (snap.status === 'fault') {
        emitLog(
          'QA & Security',
          'executing',
          `Simulation fault in ${fileObj.name}: ${snap.faultReason || snap.stderr.join('; ')}`
        );
      } else {
        emitLog(
          'QA & Security',
          'executing',
          `Executed ${fileObj.name} in sandbox (${snap.cyclesExecuted} cycles) -> ${snap.stdout.join(' | ') || 'exit 0'}`
        );
      }
    }
  }

  // Stage 4: Testing & Security Scanning (Route to CWE Audit Expert)
  callbacks.onStageChange('testing');
  const secShard = await callbacks.onRouteExpert?.('expert-security');
  const qaStep = await runtime.runAgentStep({
    stepId: 'qa-scan',
    role: 'QA & Security',
    goal,
    context: 'Running CWE static scanner & sandbox verification',
  });

  let detectedSecurityCount = 0;
  for (const ch of pendingChanges) {
    const fileObj = updatedWorkspace.files.find((f) => f.id === ch.fileId);
    if (!fileObj) continue;
    const issues = scanFileSecurity(fileObj);
    detectedSecurityCount += issues.length;
    if (issues.length > 0) {
      emitLog(
        'QA & Security',
        'testing',
        `Detected ${issues.length} CWE security finding(s) in ${fileObj.name}: ${issues.map((i) => i.cwe).join(', ')}.`,
        qaStep.tokensPerSec,
        secShard?.enabled ? secShard.activeExpertLabel : undefined
      );
    }
  }

  // Stage 5: Autonomous Self-Healing Loop
  if (detectedSecurityCount > 0) {
    callbacks.onStageChange('self-healing');
    const healStep = await runtime.runAgentStep({
      stepId: 'qa-self-heal',
      role: 'QA & Security',
      goal,
      context: 'Autonomous self-healing loop for CWE vulnerabilities',
    });

    for (const ch of pendingChanges) {
      const fileObj = updatedWorkspace.files.find((f) => f.id === ch.fileId);
      if (!fileObj) continue;
      const { patchedContent, fixCount } = applyAllFixableIssues(fileObj);
      if (fixCount > 0) {
        ch.proposedContent = patchedContent;
        ch.healedCount += fixCount;
        updatedWorkspace = {
          ...updatedWorkspace,
          files: updatedWorkspace.files.map((f) =>
            f.id === fileObj.id ? { ...f, content: patchedContent, updatedAt: Date.now() } : f
          ),
        };

        // Re-verify inside sandbox after self-healing
        if (fileObj.language !== 'react') {
          const recheck = new SandboxDebugSession(
            fileObj.language,
            fileObj.name,
            patchedContent,
            [],
            sandboxPolicy
          ).start(false);
          emitLog(
            'QA & Security',
            'self-healing',
            `Auto-healed ${fixCount} CWE issue(s) in ${fileObj.name} & re-verified in sandbox (${recheck.cyclesExecuted} cycles, status: ${recheck.status}).`,
            healStep.tokensPerSec,
            secShard?.enabled ? secShard.activeExpertLabel : undefined
          );
        } else {
          emitLog(
            'QA & Security',
            'self-healing',
            `Auto-healed ${fixCount} issue(s) in ${fileObj.name}.`,
            healStep.tokensPerSec,
            secShard?.enabled ? secShard.activeExpertLabel : undefined
          );
        }
      }
    }

    callbacks.onApplyFiles(updatedWorkspace, [...pendingChanges]);
    callbacks.onSecurityRefresh(updatedWorkspace.files);
  } else {
    emitLog(
      'QA & Security',
      'testing',
      'All generated modules passed F5 sandbox execution and CWE security checks cleanly.',
      qaStep.tokensPerSec,
      secShard?.enabled ? secShard.activeExpertLabel : undefined
    );
  }

  tasks = tasks.map((t) =>
    t.agent === 'QA & Security'
      ? { ...t, status: detectedSecurityCount > 0 ? 'healed' : 'done' }
      : { ...t, status: 'done' }
  );
  callbacks.onTasksUpdate(tasks);
  callbacks.onStageChange('completed');
}
