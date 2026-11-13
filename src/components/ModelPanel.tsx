import React, { useRef, useState } from 'react';
import {
  Cpu,
  Download,
  HardDrive,
  Layers,
  Play,
  Send,
  Trash2,
  Upload,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  ExpertRoleId,
  LocalModelMetadata,
  ModelChatMessage,
  ModelExecutionMode,
  ModelRamStats,
  QwenPresetId,
  SparkMoETelemetry,
  SuggestedCodeFix,
  UiLocale,
} from '../types/ide';
import { UI_COPY } from '../i18n';

export interface ModelPanelProps {
  locale: UiLocale;
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

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export const ModelPanel: React.FC<ModelPanelProps> = ({
  locale,
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
  const copy = UI_COPY[locale].models;
  const [promptInput, setPromptInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeModel = models.find((m) => m.id === activeModelId) || null;
  const isSparkMoE = executionMode === 'sparkmoe-ssd';

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim() || isGenerating) return;
    onSendPrompt(promptInput.trim());
    setPromptInput('');
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Execution Backend, Qwen Preset & SparkMoE SSD Streaming Controls */}
      <div className="p-3.5 border-b border-slate-800/80 space-y-3 bg-[#111929] overflow-y-auto max-h-[60%]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-200">
            {copy.executionEngine}
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-3 h-3" />
            {copy.loadFile}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".meo,.gguf,.bin"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                onImportModelFile(f);
                e.target.value = '';
              }
            }}
          />
        </div>

        {/* Qwen Gen-4 / 2.5-Coder Checkpoint Selector */}
        <div className="rounded-md border border-slate-800 bg-[#0B0F17] p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-300">
              {copy.qwenPresetLabel}
            </span>
            <button
              type="button"
              onClick={() => onCreateSampleMeo(false, qwenPreset)}
              className="rounded bg-blue-600/20 border border-blue-500/40 px-2 py-0.5 text-[10px] font-semibold text-blue-300 hover:bg-blue-600/30 cursor-pointer whitespace-nowrap"
            >
              {copy.mountPreset}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onChangeQwenPreset('qwen4-coder')}
              className={`rounded border px-2 py-1 text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap ${
                qwenPreset === 'qwen4-coder'
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                  : 'border-slate-800 bg-[#111929] text-slate-400 hover:text-slate-200'
              }`}
            >
              Qwen Gen 4 Coder
            </button>
            <button
              type="button"
              onClick={() => onChangeQwenPreset('qwen25-coder')}
              className={`rounded border px-2 py-1 text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap ${
                qwenPreset === 'qwen25-coder'
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                  : 'border-slate-800 bg-[#111929] text-slate-400 hover:text-slate-200'
              }`}
            >
              Qwen 2.5-Coder
            </button>
          </div>
        </div>

        {/* Dedicated SparkMoE SSD Streaming Mode Toggle */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-[#0B0F17] px-2.5 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-100">
              <Zap className={`w-3.5 h-3.5 shrink-0 ${isSparkMoE ? 'text-amber-400' : 'text-slate-500'}`} />
              <span>{copy.sparkToggleTitle}</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {copy.sparkToggleDesc}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isSparkMoE}
            onClick={() =>
              onChangeExecutionMode(isSparkMoE ? 'meo-ram' : 'sparkmoe-ssd')
            }
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isSparkMoE
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isSparkMoE ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* 4-Way Backend Selector */}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-md bg-[#0B0F17] border border-slate-800">
          <button
            onClick={() => onChangeExecutionMode('sparkmoe-ssd')}
            className={`py-1.5 px-1.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
              executionMode === 'sparkmoe-ssd'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            SparkMoE
          </button>
          <button
            onClick={() => onChangeExecutionMode('meo-ram')}
            className={`py-1.5 px-1.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
              executionMode === 'meo-ram'
                ? 'bg-blue-600/25 text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            MEO RAM
          </button>
          <button
            onClick={() => onChangeExecutionMode('gguf-cpu')}
            className={`py-1.5 px-1.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
              executionMode === 'gguf-cpu'
                ? 'bg-sky-600/25 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            GGUF CPU
          </button>
          <button
            onClick={() => onChangeExecutionMode('gguf-webgpu')}
            disabled={!webGpuSupported}
            className={`py-1.5 px-1.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
              !webGpuSupported
                ? 'text-slate-600 cursor-not-allowed'
                : executionMode === 'gguf-webgpu'
                ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/40 cursor-pointer'
                : 'text-slate-400 hover:text-slate-200 cursor-pointer'
            }`}
          >
            WebGPU
          </button>
        </div>

        {/* Ring-Buffer Cache Slider (SparkMoE) vs Full RAM Arena Slider */}
        {isSparkMoE ? (
          <div className="space-y-2.5">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">{copy.ringCapLabel}</span>
                <span dir="ltr" className="font-mono tabular-nums text-amber-300 font-medium">
                  {sparkCacheCapMb} MB
                </span>
              </div>
              <input
                type="range"
                min={256}
                max={1024}
                step={64}
                value={sparkCacheCapMb}
                onChange={(e) => onChangeSparkCacheCapMb(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            {/* Real-Time SparkMoE Telemetry Metrics */}
            <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
              <div>
                <div className="text-slate-500">{copy.activeExpert}</div>
                <div dir="ltr" className="font-mono text-amber-300 font-medium truncate text-start">
                  {sparkTelemetry?.activeExpertLabel || 'None'}
                </div>
              </div>
              <div>
                <div className="text-slate-500">{copy.diskBandwidth}</div>
                <div dir="ltr" className="font-mono tabular-nums text-sky-300 font-medium text-start">
                  {sparkTelemetry?.diskReadMbps ?? 0} MB/s
                </div>
              </div>
              <div>
                <div className="text-slate-500">{copy.ringFootprint}</div>
                <div dir="ltr" className="font-mono tabular-nums text-emerald-400 font-medium text-start">
                  {sparkTelemetry?.cacheUsedMb ?? 0} / {sparkCacheCapMb} MB
                </div>
              </div>
              <div>
                <div className="text-slate-500">{copy.swapsHits}</div>
                <div dir="ltr" className="font-mono tabular-nums text-slate-200 font-medium text-start">
                  {sparkTelemetry?.swapCount ?? 0} / {sparkTelemetry?.cacheHits ?? 0}
                  {ramStats ? ` · ${ramStats.tokensPerSecond} tok/s` : ''}
                </div>
              </div>
            </div>

            {/* Indexed Expert Shards List */}
            {activeModel && activeModel.expertShards.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 font-medium text-slate-300">
                    <Layers className="w-3 h-3 text-amber-400" />
                    {copy.ssdShardsTitle} ({activeModel.expertShards.length})
                  </span>
                  <span className="font-mono tabular-nums text-slate-500">
                    {copy.clickToStream}
                  </span>
                </div>
                <div className="space-y-1">
                  {activeModel.expertShards.map((shard) => {
                    const isActive = sparkTelemetry?.activeExpertId === shard.id;
                    const isCached = sparkTelemetry?.cachedShardIds.includes(shard.id);
                    const stateText = isActive ? 'ACTIVE' : isCached ? 'CACHED' : 'SSD';
                    const stateClass = isActive
                      ? 'text-amber-300'
                      : isCached
                      ? 'text-emerald-400'
                      : 'text-slate-500';

                    return (
                      <button
                        key={shard.id}
                        type="button"
                        onClick={() => onActivateExpertShard(shard.id)}
                        className={`w-full flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-start transition-colors cursor-pointer ${
                          isActive
                            ? 'border-amber-500/50 bg-amber-500/10'
                            : 'border-slate-800 bg-[#0B0F17] hover:border-slate-700'
                        }`}
                      >
                        <div dir="ltr" className="min-w-0 text-left">
                          <div className="text-[11px] font-medium text-slate-200 truncate">
                            {shard.label}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate tabular-nums">
                            {shard.domain} · {shard.virtualWeightMb} MB virtual ·{' '}
                            {formatBytes(shard.sizeBytes)} slice
                          </div>
                        </div>
                        <span className={`text-[10px] font-mono font-semibold shrink-0 ${stateClass}`}>
                          {stateText}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">{copy.ramCapLabel}</span>
                <span dir="ltr" className="font-mono tabular-nums text-amber-300 font-medium">
                  {ramLimitMb} MB
                </span>
              </div>
              <input
                type="range"
                min={128}
                max={4096}
                step={128}
                value={ramLimitMb}
                onChange={(e) => onChangeRamLimitMb(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            {ramStats && (
              <div className="pt-1 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-slate-500">{copy.ramArena}</div>
                  <div dir="ltr" className="font-mono tabular-nums text-slate-200 font-medium text-start">
                    {ramStats.allocatedMb} MB
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">{copy.pages64k}</div>
                  <div dir="ltr" className="font-mono tabular-nums text-slate-200 font-medium text-start">
                    {ramStats.pagesMapped}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">{copy.throughput}</div>
                  <div dir="ltr" className="font-mono tabular-nums text-emerald-400 font-medium text-start">
                    {ramStats.tokensPerSecond} tok/s
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Model Dropzone / Mounted Models List */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onImportModelFile(f);
        }}
        className={`p-3 border-b border-slate-800/80 space-y-2 shrink-0 ${
          dragActive ? 'bg-blue-600/10' : ''
        }`}
      >
        {models.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-700 bg-[#0B0F17] p-3 text-center space-y-2">
            <HardDrive className="w-5 h-5 text-slate-400 mx-auto" />
            <div className="text-xs text-slate-300">{copy.dropHint}</div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={() => onCreateSampleMeo(false, qwenPreset)}
                className="rounded bg-amber-500/15 border border-amber-500/40 px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-500/25 cursor-pointer"
              >
                {copy.mountPreset} ({qwenPreset === 'qwen4-coder' ? 'Qwen 4' : 'Qwen 2.5'})
              </button>
              <button
                onClick={() => onCreateSampleMeo(true, qwenPreset)}
                className="rounded border border-slate-700 bg-slate-800/80 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                .meo
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-24 overflow-y-auto">
            {models.map((m) => {
              const isSelected = m.id === activeModelId;
              return (
                <div
                  key={m.id}
                  onClick={() => onSelectModel(m.id)}
                  className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer ${
                    isSelected
                      ? 'border-blue-500/50 bg-blue-600/10'
                      : 'border-slate-800 bg-[#0B0F17] hover:border-slate-700'
                  }`}
                >
                  <div dir="ltr" className="min-w-0 text-left">
                    <div className="flex items-center gap-1.5">
                      <Cpu
                        className={`w-3.5 h-3.5 shrink-0 ${
                          m.format === 'meo' ? 'text-amber-400' : 'text-sky-400'
                        }`}
                      />
                      <span className="font-mono text-xs text-slate-100 truncate">
                        {m.name}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums truncate">
                      {m.format.toUpperCase()} · {m.quantization} · {formatBytes(m.fileSizeBytes)} ·{' '}
                      {m.routingPreset || `${m.expertShards.length} shards`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isSelected && isLoadingModel ? (
                      <span className="text-[10px] text-amber-300">Loading...</span>
                    ) : isSelected ? (
                      <span className="text-[10px] text-emerald-400 font-medium">Active</span>
                    ) : (
                      <Play className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveModel(m.id);
                      }}
                      className="p-1 text-slate-500 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Offline Model Q&A & Auto-Fix Chat */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
          {messages.length === 0 ? (
            <div className="text-xs text-slate-500 leading-relaxed">{copy.chatEmpty}</div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                dir="auto"
                className={`rounded-md p-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-600/15 border border-blue-500/30 text-slate-100'
                    : 'bg-[#0B0F17] border border-slate-800 text-slate-200'
                }`}
              >
                <div>{msg.text}</div>
                {msg.suggestedFix && (
                  <button
                    onClick={() => onApplySuggestedFix(msg.id, msg.suggestedFix!)}
                    disabled={msg.suggestedFix.applied}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-2.5 py-1.5 text-[11px] font-medium text-white cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    {msg.suggestedFix.applied
                      ? `Applied to ${msg.suggestedFix.fileName}`
                      : `Apply Fix to ${msg.suggestedFix.fileName}`}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        <form onSubmit={handleChatSubmit} className="p-3 border-t border-slate-800/80 flex gap-2">
          <input
            type="text"
            dir="auto"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder={copy.chatPlaceholder}
            className="flex-1 rounded-md border border-slate-700 bg-[#0B0F17] px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={!promptInput.trim() || isGenerating}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
