import React, { useEffect, useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  GitCompare,
  Loader2,
  MemoryStick,
  Rocket,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  AgentLogEntry,
  AgentPipelineStage,
  AgentTask,
  ExpertRoleId,
  LocalModelMetadata,
  ModelChatMessage,
  ModelExecutionMode,
  ModelRamStats,
  PendingAgentChange,
  QwenPresetId,
  SparkMoETelemetry,
  SuggestedCodeFix,
  UiLocale,
} from '../types/ide';
import { UI_COPY } from '../i18n';
import { ModelPanel } from './ModelPanel';

interface AgentPanelProps {
  locale: UiLocale;
  preferredTab?: 'mission' | 'models';
  // Mission Control props
  pipelineStage: AgentPipelineStage;
  agentTasks: AgentTask[];
  agentLogs: AgentLogEntry[];
  pendingChanges: PendingAgentChange[];
  isMissionRunning: boolean;
  onLaunchMission: (goal: string) => void;
  onInspectChange: (fileId: string) => void;
  onAcceptChange: (fileId: string) => void;
  onRejectChange: (fileId: string) => void;
  onAcceptAllChanges: () => void;
  onRejectAllChanges: () => void;

  // Local Model, Qwen, SparkMoE & Normal RAM props
  models: LocalModelMetadata[];
  activeModelId: string | null;
  executionMode: ModelExecutionMode;
  qwenPreset: QwenPresetId;
  ramLimitMb: number;
  ramStats: ModelRamStats | null;
  sparkCacheCapMb: number;
  sparkTelemetry: SparkMoETelemetry | null;
  webGpuSupported: boolean;
  isLoadingModel: boolean;
  isGenerating: boolean;
  messages: ModelChatMessage[];
  onImportModelFile: (file: File) => void;
  onCreateSampleMeo: (downloadFile: boolean, preset?: QwenPresetId) => void;
  onChangeQwenPreset: (preset: QwenPresetId) => void;
  onSelectModel: (modelId: string) => void;
  onRemoveModel: (modelId: string) => void;
  onChangeExecutionMode: (mode: ModelExecutionMode) => void;
  onChangeRamLimitMb: (mb: number) => void;
  onChangeSparkCacheCapMb: (mb: number) => void;
  onActivateExpertShard: (expertId: ExpertRoleId) => void;
  onSendPrompt: (prompt: string) => void;
  onApplySuggestedFix: (messageId: string, fix: SuggestedCodeFix) => void;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  locale,
  preferredTab,
  pipelineStage,
  agentTasks,
  agentLogs,
  pendingChanges,
  isMissionRunning,
  onLaunchMission,
  onInspectChange,
  onAcceptChange,
  onRejectChange,
  onAcceptAllChanges,
  onRejectAllChanges,
  models,
  activeModelId,
  executionMode,
  qwenPreset,
  ramLimitMb,
  ramStats,
  sparkCacheCapMb,
  sparkTelemetry,
  webGpuSupported,
  isLoadingModel,
  isGenerating,
  messages,
  onImportModelFile,
  onCreateSampleMeo,
  onChangeQwenPreset,
  onSelectModel,
  onRemoveModel,
  onChangeExecutionMode,
  onChangeRamLimitMb,
  onChangeSparkCacheCapMb,
  onActivateExpertShard,
  onSendPrompt,
  onApplySuggestedFix,
}) => {
  const copy = UI_COPY[locale].agent;
  const [activeTab, setActiveTab] = useState<'mission' | 'models'>(preferredTab || 'mission');
  const [goalInput, setGoalInput] = useState(UI_COPY[locale].agent.presets.tcpGoal);

  useEffect(() => {
    if (preferredTab) {
      setActiveTab(preferredTab);
    }
  }, [preferredTab]);

  // Update default preset text only if user hasn't typed a custom prompt
  useEffect(() => {
    const otherLocale = locale === 'he' ? 'en' : 'he';
    if (goalInput === UI_COPY[otherLocale].agent.presets.tcpGoal) {
      setGoalInput(UI_COPY[locale].agent.presets.tcpGoal);
    }
  }, [locale, goalInput]);

  const pipelineSteps: Array<{ id: AgentPipelineStage; label: string }> = [
    { id: 'planning', label: copy.stages.planning },
    { id: 'scaffolding', label: copy.stages.scaffolding },
    { id: 'executing', label: copy.stages.executing },
    { id: 'testing', label: copy.stages.testing },
    { id: 'self-healing', label: copy.stages.selfHealing },
  ];

  const activeModel = models.find((m) => m.id === activeModelId) || null;
  const activeStageIndex = pipelineSteps.findIndex((s) => s.id === pipelineStage);

  const handleMissionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalInput.trim() || isMissionRunning) return;
    onLaunchMission(goalInput.trim());
  };

  return (
    <aside className="w-[410px] shrink-0 border-s border-slate-800/90 bg-[#0F1522] flex flex-col min-h-0">
      {/* Top Panel Mode Switch & SparkMoE / Normal RAM Telemetry Strip */}
      <div className="px-3.5 py-2.5 border-b border-slate-800/80 bg-[#121928] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-[#0B0F17] border border-slate-800 flex-1">
            <button
              onClick={() => setActiveTab('mission')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'mission'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              {copy.missionTab}
            </button>
            <button
              onClick={() => setActiveTab('models')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'models'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MemoryStick className="w-3.5 h-3.5" />
              {copy.modelsTab}
            </button>
          </div>
        </div>

        {/* Compact Unboxed Telemetry Line */}
        <div dir="ltr" className="flex items-center justify-between gap-2 text-[11px] text-slate-400 font-mono tabular-nums px-0.5">
          <span className="truncate">
            {executionMode === 'sparkmoe-ssd' && sparkTelemetry?.activeExpertId
              ? `${sparkTelemetry.activeExpertLabel}`
              : activeModel
              ? activeModel.name
              : 'Qwen4 SparkMoE Ready'}
          </span>
          <span className="shrink-0">
            {executionMode === 'sparkmoe-ssd' && sparkTelemetry
              ? `${sparkTelemetry.cacheUsedMb}/${sparkCacheCapMb} MB · ${sparkTelemetry.diskReadMbps} MB/s`
              : ramStats
              ? `${ramStats.allocatedMb}/${ramLimitMb} MB · ${ramStats.tokensPerSecond} tok/s`
              : `Cap ${ramLimitMb} MB`}
          </span>
        </div>
      </div>

      {activeTab === 'mission' ? (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Mission Input (Supports Hebrew & English Natural Language Goals) */}
          <form
            onSubmit={handleMissionSubmit}
            className="p-3.5 border-b border-slate-800/80 space-y-2.5 bg-[#101725]"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                {copy.goalTitle}
              </span>
              <span className="text-[11px] text-slate-500">
                {executionMode === 'sparkmoe-ssd' ? copy.sparkRouting : copy.offlineOrch}
              </span>
            </div>
            <textarea
              dir="auto"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              rows={2}
              placeholder={copy.goalPlaceholder}
              className="w-full resize-none rounded-md border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setGoalInput(copy.presets.tcpGoal)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 border border-slate-800 rounded px-2 py-1 whitespace-nowrap cursor-pointer"
                >
                  {copy.presets.tcpLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setGoalInput(copy.presets.rustGoal)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 border border-slate-800 rounded px-2 py-1 whitespace-nowrap cursor-pointer"
                >
                  {copy.presets.rustLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setGoalInput(copy.presets.hardenGoal)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 border border-slate-800 rounded px-2 py-1 whitespace-nowrap cursor-pointer"
                >
                  {copy.presets.hardenLabel}
                </button>
              </div>
              <button
                type="submit"
                disabled={!goalInput.trim() || isMissionRunning}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isMissionRunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Rocket className="w-3.5 h-3.5" />
                )}
                {isMissionRunning ? copy.executing : copy.launchMission}
              </button>
            </div>
          </form>

          {/* Visual 5-Stage Agent Pipeline */}
          <div className="px-3.5 py-2.5 border-b border-slate-800/80 bg-[#0D131F]">
            <div className="grid grid-cols-5 gap-1">
              {pipelineSteps.map((step, idx) => {
                const isDone =
                  pipelineStage === 'completed' ||
                  (activeStageIndex !== -1 && idx < activeStageIndex);
                const isActive = pipelineStage === step.id;
                return (
                  <div
                    key={step.id}
                    className={`rounded px-1.5 py-1 text-center text-[10px] font-medium border transition-colors ${
                      isActive
                        ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                        : isDone
                        ? 'border-emerald-500/40 bg-emerald-600/15 text-emerald-300'
                        : 'border-slate-800 bg-[#0B0F17] text-slate-500'
                    }`}
                  >
                    {step.label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scrollable Mission Details: Tasks, Pending Diffs & Agent Feed */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-4">
            {/* Pending Diff Review Queue */}
            {pendingChanges.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                    <GitCompare className="w-3.5 h-3.5" />
                    {copy.agentChanges} ({pendingChanges.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onRejectAllChanges}
                      className="text-[11px] text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      {copy.rejectAll}
                    </button>
                    <button
                      onClick={onAcceptAllChanges}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
                    >
                      {copy.acceptAll}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {pendingChanges.map((ch) => (
                    <div
                      key={ch.fileId}
                      onClick={() => onInspectChange(ch.fileId)}
                      className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-[#0B0F17] px-2.5 py-2 hover:border-slate-700 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div dir="ltr" className="flex items-center gap-2 text-xs font-mono">
                          <span
                            className={
                              ch.changeType === 'added'
                                ? 'text-emerald-400 font-semibold'
                                : 'text-amber-400 font-semibold'
                            }
                          >
                            {ch.changeType === 'added' ? 'A' : 'M'}
                          </span>
                          <span className="text-slate-100 truncate">{ch.filePath}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {ch.summary}
                          {ch.healedCount > 0 ? ` · ${ch.healedCount} auto-healed` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAcceptChange(ch.fileId);
                          }}
                          title="Accept Change"
                          className="p-1 rounded bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/35 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRejectChange(ch.fileId);
                          }}
                          title="Reject Change"
                          className="p-1 rounded bg-red-600/20 text-red-300 hover:bg-red-600/35 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Architect Task Checklist */}
            {agentTasks.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-300">
                  {copy.architectChecklist}
                </div>
                <div className="space-y-1.5">
                  {agentTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-2.5 rounded border border-slate-800/80 bg-[#0B0F17] px-2.5 py-2 text-xs"
                    >
                      <div className="mt-0.5 shrink-0">
                        {task.status === 'active' ? (
                          <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                        ) : task.status === 'healed' ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        ) : task.status === 'done' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-full border border-slate-600 inline-block" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div dir="auto" className="text-slate-100 font-medium">{task.title}</div>
                        <div dir="ltr" className="text-[11px] text-slate-400 mt-0.5 font-mono truncate text-start">
                          {task.agent} · {task.detail}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agent Live Execution Log */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300">
                {copy.telemetryFeed}
              </div>
              {agentLogs.length === 0 ? (
                <div className="text-xs text-slate-500 leading-relaxed">
                  {copy.feedEmpty}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {agentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded border border-slate-800/70 bg-[#0B0F17] px-2.5 py-2 text-[11px] space-y-1"
                    >
                      <div dir="ltr" className="flex items-center justify-between gap-2 text-slate-400 font-mono">
                        <span
                          className={`truncate ${
                            log.agent === 'Architect'
                              ? 'text-sky-400'
                              : log.agent === 'Builder'
                              ? 'text-amber-300'
                              : 'text-emerald-400'
                          }`}
                        >
                          {log.agent} · {log.stage}
                          {log.expertLabel ? ` · ${log.expertLabel}` : ''}
                        </span>
                        {log.tokensPerSec && (
                          <span className="tabular-nums shrink-0">{log.tokensPerSec} tok/s</span>
                        )}
                      </div>
                      <div dir="auto" className="text-slate-200 leading-relaxed">{log.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <ModelPanel
          locale={locale}
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
          messages={messages}
          onImportModelFile={onImportModelFile}
          onCreateSampleMeo={onCreateSampleMeo}
          onChangeQwenPreset={onChangeQwenPreset}
          onSelectModel={onSelectModel}
          onRemoveModel={onRemoveModel}
          onChangeExecutionMode={onChangeExecutionMode}
          onChangeRamLimitMb={onChangeRamLimitMb}
          onChangeSparkCacheCapMb={onChangeSparkCacheCapMb}
          onActivateExpertShard={onActivateExpertShard}
          onSendPrompt={onSendPrompt}
          onApplySuggestedFix={onApplySuggestedFix}
        />
      )}
    </aside>
  );
};
