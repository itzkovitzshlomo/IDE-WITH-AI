export type CodeLanguage = 'c' | 'cpp' | 'rust' | 'react';

export type ProjectTemplateId = 'polyglot' | 'c-cpp' | 'rust' | 'react';

export interface WorkspaceFile {
  id: string;
  name: string;
  path: string;
  folderPath: string;
  language: CodeLanguage;
  content: string;
  updatedAt: number;
  breakpoints: number[];
}

export interface WorkspaceState {
  projectName: string;
  templateId: ProjectTemplateId;
  folders: string[];
  files: WorkspaceFile[];
  openTabIds: string[];
  activeFileId: string;
  expandedFolders: string[];
}

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low';

export interface SecurityFinding {
  id: string;
  fileId: string;
  fileName: string;
  language: CodeLanguage;
  line: number;
  column: number;
  cwe: string;
  severity: SecuritySeverity;
  title: string;
  description: string;
  recommendation: string;
  snippet: string;
  fixable: boolean;
  fixLabel?: string;
}

export interface DebugVariable {
  name: string;
  type: string;
  value: string;
  address: string;
  scope: string;
}

export interface DebugFrame {
  id: string;
  name: string;
  file: string;
  line: number;
}

export interface SandboxMemoryCell {
  address: string;
  label: string;
  sizeBytes: number;
  hex: string;
  state: 'allocated' | 'freed' | 'stack';
}

export interface SandboxPolicy {
  networkBlocked: boolean;
  filesystemIsolated: boolean;
  maxInstructionCycles: number;
  maxMemoryMb: number;
  strictPointerBounds: boolean;
}

export type DebugStatus = 'idle' | 'running' | 'paused' | 'completed' | 'fault';

export interface ConsoleEntry {
  id: string;
  type: 'stdout' | 'stderr' | 'system' | 'security';
  text: string;
  timestamp: number;
}

export type UiLocale = 'en' | 'he';

export type WorkspaceViewMode = 'preview' | 'code' | 'files';

export type ModelFormat = 'meo' | 'gguf';

export type ModelExecutionMode = 'sparkmoe-ssd' | 'meo-ram' | 'gguf-cpu' | 'gguf-webgpu';

export type QwenPresetId = 'qwen4-coder' | 'qwen25-coder';

export type ModelFamily = 'qwen4-coder-moe' | 'qwen25-coder-moe' | 'generic-moe';

export type ExpertRoleId =
  | 'expert-architect'
  | 'expert-c-cpp'
  | 'expert-rust'
  | 'expert-react'
  | 'expert-security';

export interface ExpertShard {
  id: ExpertRoleId;
  label: string;
  domain: string;
  byteStart: number;
  byteEnd: number;
  sizeBytes: number;
  virtualWeightMb: number;
}

export interface SparkMoETelemetry {
  enabled: boolean;
  activeExpertId: ExpertRoleId | null;
  activeExpertLabel: string;
  cachedShardIds: ExpertRoleId[];
  cacheUsedMb: number;
  cacheCapMb: number;
  diskReadMbps: number;
  swapCount: number;
  cacheHits: number;
  lastLoadMs: number;
}

export interface LocalModelMetadata {
  id: string;
  name: string;
  format: ModelFormat;
  fileSizeBytes: number;
  quantization: string;
  architecture: string;
  parameterCount: string;
  contextLength: number;
  tensorCount: number;
  estimatedRamMb: number;
  kvPreview: Record<string, string>;
  loadedInRam: boolean;
  isBuiltinSample?: boolean;
  isMoE?: boolean;
  modelFamily?: ModelFamily;
  routingPreset?: string;
  expertShards: ExpertShard[];
  addedAt: number;
}

export interface ModelRamStats {
  allocatedMb: number;
  ramLimitMb: number;
  pageSizeKb: number;
  pagesMapped: number;
  quantizationMode: string;
  tokensPerSecond: number;
  backendLabel: string;
}

export interface SuggestedCodeFix {
  label: string;
  fileId: string;
  fileName: string;
  patchedContent: string;
  applied?: boolean;
}

export interface ModelChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  tokensGenerated?: number;
  tokensPerSec?: number;
  executionMode?: ModelExecutionMode;
  suggestedFix?: SuggestedCodeFix;
}

export type AgentPipelineStage =
  | 'idle'
  | 'planning'
  | 'scaffolding'
  | 'executing'
  | 'testing'
  | 'self-healing'
  | 'completed'
  | 'failed';

export type AgentRole = 'Architect' | 'Builder' | 'QA & Security';

export interface AgentTask {
  id: string;
  agent: AgentRole;
  title: string;
  detail: string;
  status: 'pending' | 'active' | 'done' | 'healed';
}

export interface AgentLogEntry {
  id: string;
  agent: AgentRole;
  stage: AgentPipelineStage;
  message: string;
  tokensPerSec?: number;
  expertLabel?: string;
  timestamp: number;
}

export interface PendingAgentChange {
  fileId: string;
  fileName: string;
  filePath: string;
  changeType: 'added' | 'modified';
  originalContent: string;
  proposedContent: string;
  summary: string;
  healedCount: number;
}
