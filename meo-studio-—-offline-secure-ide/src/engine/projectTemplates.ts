import { ProjectTemplateId, WorkspaceFile, WorkspaceState } from '../types/ide';

export interface ProjectTemplateDefinition {
  id: ProjectTemplateId;
  name: string;
  subtitle: string;
  defaultProjectName: string;
  buildState: (customName?: string) => WorkspaceState;
}

function makeFile(
  id: string,
  name: string,
  folderPath: string,
  language: WorkspaceFile['language'],
  content: string,
  breakpoints: number[] = []
): WorkspaceFile {
  const cleanFolder = folderPath === '/' ? '' : folderPath.replace(/\/+$/, '');
  return {
    id,
    name,
    folderPath: cleanFolder || '/',
    path: `${cleanFolder}/${name}`,
    language,
    content,
    updatedAt: Date.now(),
    breakpoints,
  };
}

export const PROJECT_TEMPLATES: ProjectTemplateDefinition[] = [
  {
    id: 'polyglot',
    name: 'Polyglot Systems + React Suite',
    subtitle: 'Multi-folder workspace with C, C++, Rust, and React components',
    defaultProjectName: 'meo-polyglot-suite',
    buildState: (customName) => {
      const files: WorkspaceFile[] = [
        makeFile(
          'file-c-buffer',
          'buffer_lab.c',
          '/src/c_core',
          'c',
          `#include <stdio.h>
#include <string.h>

int compute_checksum(int count, int seed) {
    int total = seed;
    for (int i = 1; i <= count; i++) {
        total = total + (i * 7);
    }
    return total;
}

int main() {
    char username[16];
    char input[] = "secure_dev";
    strcpy(username, input);

    int rounds = 4;
    int checksum = compute_checksum(rounds, 100);

    printf("User: %s\\n", username);
    printf("Checksum after %d rounds = %d\\n", rounds, checksum);
    return 0;
}
`,
          [10, 17]
        ),
        makeFile(
          'file-cpp-engine',
          'vector_engine.cpp',
          '/src/cpp_engine',
          'cpp',
          `#include <iostream>
#include <string>

int dot_step(int a, int b, int acc) {
    int prod = a * b;
    return acc + prod;
}

int main() {
    int weights[3] = {4, 7, 2};
    int signal[3] = {3, 5, 6};
    int accum = 0;

    for (int idx = 0; idx < 3; idx++) {
        accum = dot_step(weights[idx], signal[idx], accum);
    }

    std::cout << "MEO Dot Result: " << accum << std::endl;
    return 0;
}
`,
          [11]
        ),
        makeFile(
          'file-rust-safe',
          'memory_safe.rs',
          '/src/rust_runtime',
          'rust',
          `fn clamp_ram_budget(requested_mb: i32, max_mb: i32) -> i32 {
    if requested_mb > max_mb {
        return max_mb;
    }
    return requested_mb;
}

fn main() {
    let model_pages = 16;
    let page_mb = 32;
    let requested = model_pages * page_mb;
    let budget = clamp_ram_budget(requested, 1024);

    let label = "meo_q8_arena";
    println!("Arena: {} | Budget: {} MB", label, budget);

    let mut active_blocks = 0;
    for step in 1..=4 {
        active_blocks = active_blocks + step;
    }
    println!("Committed RAM blocks: {}", active_blocks);
}
`,
          [7]
        ),
        makeFile(
          'file-react-app',
          'TelemetryCard.tsx',
          '/src/components',
          'react',
          `import React, { useState } from 'react';

export default function TelemetryCard() {
  const [ramLimit, setRamLimit] = useState(512);
  const [activeThreads, setActiveThreads] = useState(4);

  const estimatedPages = Math.floor((ramLimit * 1024) / 64);

  return (
    <div style={{
      fontFamily: 'system-ui, sans-serif',
      background: '#111827',
      color: '#F1F5F9',
      padding: '20px',
      borderRadius: '10px',
      border: '1px solid #1F2937'
    }}>
      <h2 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>
        MEO Offline Runtime Preview
      </h2>
      <p style={{ margin: '0 0 16px 0', color: '#94A3B8', fontSize: '13px' }}>
        Sandboxed React Component executing completely offline
      </p>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div style={{ flex: 1, background: '#0B0F17', padding: '12px', borderRadius: '6px' }}>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>Normal RAM Cap</div>
          <div style={{ fontSize: '20px', fontWeight: 600, color: '#F59E0B' }}>{ramLimit} MB</div>
        </div>
        <div style={{ flex: 1, background: '#0B0F17', padding: '12px', borderRadius: '6px' }}>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>Mapped 64KB Pages</div>
          <div style={{ fontSize: '20px', fontWeight: 600, color: '#3B82F6' }}>{estimatedPages}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setRamLimit(prev => Math.min(4096, prev + 256))}
          style={{
            background: '#2563EB',
            color: '#fff',
            border: 'none',
            padding: '8px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          +256 MB RAM
        </button>
        <button
          onClick={() => setActiveThreads(t => (t >= 8 ? 2 : t + 2))}
          style={{
            background: '#1E293B',
            color: '#E2E8F0',
            border: '1px solid #334155',
            padding: '8px 14px',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Threads: {activeThreads}
        </button>
      </div>
    </div>
  );
}
`
        ),
      ];
      return {
        projectName: customName?.trim() || 'meo-polyglot-suite',
        templateId: 'polyglot',
        folders: ['/src', '/src/c_core', '/src/cpp_engine', '/src/rust_runtime', '/src/components'],
        files,
        openTabIds: [files[0].id, files[1].id, files[3].id],
        activeFileId: files[0].id,
        expandedFolders: ['/src', '/src/c_core', '/src/cpp_engine', '/src/rust_runtime', '/src/components'],
      };
    },
  },
  {
    id: 'c-cpp',
    name: 'C / C++ Systems Kernel',
    subtitle: 'Modular C/C++ project with src, include, and tests folders',
    defaultProjectName: 'systems-kernel-cpp',
    buildState: (customName) => {
      const files: WorkspaceFile[] = [
        makeFile(
          'cpp-main',
          'main.cpp',
          '/src',
          'cpp',
          `#include <iostream>
#include "../include/ring_buffer.c"

int accumulate_signal(int a, int b) {
    return (a * 2) + b;
}

int main() {
    int samples[4] = {10, 20, 30, 40};
    int sum = 0;

    for (int i = 0; i < 4; i++) {
        sum = accumulate_signal(samples[i], sum);
    }

    std::cout << "Kernel Signal Total: " << sum << std::endl;
    return 0;
}
`,
          [11]
        ),
        makeFile(
          'c-allocator',
          'page_guard.c',
          '/src/memory',
          'c',
          `#include <stdio.h>
#include <string.h>

int main() {
    char tag[24];
    char src[] = "ram_page_0";
    strcpy(tag, src);

    int *uninit_ptr;
    int pages = 32;
    printf("Tag: %s | Pages: %d\\n", tag, pages);
    return 0;
}
`,
          [7]
        ),
        makeFile(
          'c-header',
          'arena_config.c',
          '/include',
          'c',
          `#include <stdio.h>

int default_page_kb() {
    return 64;
}

int main() {
    int kb = default_page_kb();
    printf("Arena Page Size: %d KB\\n", kb);
    return 0;
}
`
        ),
        makeFile(
          'cpp-test',
          'bounds_test.cpp',
          '/tests',
          'cpp',
          `#include <iostream>

int main() {
    int limits[3] = {128, 512, 1024};
    int selected = limits[1];
    std::cout << "Bounds Test Passed: " << selected << " MB" << std::endl;
    return 0;
}
`
        ),
      ];
      return {
        projectName: customName?.trim() || 'systems-kernel-cpp',
        templateId: 'c-cpp',
        folders: ['/src', '/src/memory', '/include', '/tests'],
        files,
        openTabIds: [files[0].id, files[1].id],
        activeFileId: files[0].id,
        expandedFolders: ['/src', '/src/memory', '/include', '/tests'],
      };
    },
  },
  {
    id: 'rust',
    name: 'Rust Memory-Safe Workspace',
    subtitle: 'Crate layout with src, crates, and safety test modules',
    defaultProjectName: 'rust-meo-crate',
    buildState: (customName) => {
      const files: WorkspaceFile[] = [
        makeFile(
          'rs-main',
          'main.rs',
          '/src',
          'rust',
          `fn compute_tensor_stride(rows: i32, cols: i32) -> i32 {
    return rows * cols;
}

fn main() {
    let rows = 8;
    let cols = 64;
    let stride = compute_tensor_stride(rows, cols);

    let mut pages = 0;
    for i in 1..=5 {
        pages = pages + i;
    }

    println!("Rust Tensor Stride: {} | Pages: {}", stride, pages);
}
`,
          [8]
        ),
        makeFile(
          'rs-arena',
          'ram_arena.rs',
          '/src/allocator',
          'rust',
          `fn align_to_page(bytes: i32) -> i32 {
    let page = 64;
    return ((bytes + page - 1) / page) * page;
}

fn main() {
    let aligned = align_to_page(190);
    println!("Aligned Normal-RAM block: {} KB", aligned);
}
`
        ),
        makeFile(
          'rs-tests',
          'safety_audit.rs',
          '/tests',
          'rust',
          `fn main() {
    let limit = 4096;
    let requested = 1024;
    if requested <= limit {
        println!("Audit OK: {} MB within {} MB cap", requested, limit);
    }
}
`
        ),
      ];
      return {
        projectName: customName?.trim() || 'rust-meo-crate',
        templateId: 'rust',
        folders: ['/src', '/src/allocator', '/tests'],
        files,
        openTabIds: [files[0].id, files[1].id],
        activeFileId: files[0].id,
        expandedFolders: ['/src', '/src/allocator', '/tests'],
      };
    },
  },
  {
    id: 'react',
    name: 'React Multi-Component App',
    subtitle: 'Full React TSX workspace with components, hooks, and utils folders',
    defaultProjectName: 'react-offline-app',
    buildState: (customName) => {
      const files: WorkspaceFile[] = [
        makeFile(
          'react-app',
          'App.tsx',
          '/src',
          'react',
          `import React, { useState } from 'react';

export default function App() {
  const [ramMb, setRamMb] = useState(1024);
  const [activeProfile, setActiveProfile] = useState('Normal RAM (MEO)');

  const pages = Math.floor((ramMb * 1024) / 64);

  return (
    <div style={{
      fontFamily: 'system-ui, sans-serif',
      background: '#0F172A',
      color: '#F8FAFC',
      padding: '20px',
      borderRadius: '10px',
      border: '1px solid #1E293B'
    }}>
      <h2 style={{ margin: '0 0 6px 0', fontSize: '18px' }}>
        React Offline Control Panel
      </h2>
      <p style={{ margin: '0 0 16px 0', color: '#94A3B8', fontSize: '13px' }}>
        Active Profile: {activeProfile}
      </p>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div style={{ flex: 1, background: '#0B0F17', padding: '12px', borderRadius: '6px' }}>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>Allocated RAM Cap</div>
          <div style={{ fontSize: '20px', fontWeight: 600, color: '#F59E0B' }}>{ramMb} MB</div>
        </div>
        <div style={{ flex: 1, background: '#0B0F17', padding: '12px', borderRadius: '6px' }}>
          <div style={{ fontSize: '11px', color: '#94A3B8' }}>64KB Tensor Pages</div>
          <div style={{ fontSize: '20px', fontWeight: 600, color: '#38BDF8' }}>{pages}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setRamMb(m => Math.min(4096, m + 512))}
          style={{
            background: '#2563EB',
            color: '#fff',
            border: 'none',
            padding: '8px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          +512 MB Budget
        </button>
        <button
          onClick={() => setActiveProfile(p => p === 'Normal RAM (MEO)' ? 'GGUF CPU Worker' : 'Normal RAM (MEO)')}
          style={{
            background: '#1E293B',
            color: '#E2E8F0',
            border: '1px solid #334155',
            padding: '8px 14px',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Switch Profile
        </button>
      </div>
    </div>
  );
}
`
        ),
        makeFile(
          'react-badge',
          'StatusWidget.tsx',
          '/src/components',
          'react',
          `import React, { useState } from 'react';

export default function StatusWidget() {
  const [checks, setChecks] = useState(3);
  return (
    <div style={{ padding: '16px', background: '#111827', color: '#E2E8F0', borderRadius: '8px' }}>
      <h3 style={{ margin: '0 0 8px 0' }}>Offline Security Widget</h3>
      <p style={{ margin: '0 0 12px 0', color: '#94A3B8', fontSize: '13px' }}>
        Passed Integrity Checks: {checks}
      </p>
      <button
        onClick={() => setChecks(c => c + 1)}
        style={{ background: '#16A34A', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}
      >
        Run Verification
      </button>
    </div>
  );
}
`
        ),
        makeFile(
          'react-utils',
          'ramFormat.js',
          '/src/utils',
          'react',
          `export default function FormatDemo() {
  const mb = 2048;
  return (
    <div style={{ padding: '16px', color: '#F1F5F9', fontFamily: 'monospace' }}>
      RAM Format Helper: {(mb / 1024).toFixed(1)} GB
    </div>
  );
}
`
        ),
      ];
      return {
        projectName: customName?.trim() || 'react-offline-app',
        templateId: 'react',
        folders: ['/src', '/src/components', '/src/utils'],
        files,
        openTabIds: [files[0].id, files[1].id],
        activeFileId: files[0].id,
        expandedFolders: ['/src', '/src/components', '/src/utils'],
      };
    },
  },
];

export function getDefaultWorkspaceState(): WorkspaceState {
  return PROJECT_TEMPLATES[0].buildState();
}
