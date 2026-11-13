import {
  AgentRole,
  ExpertRoleId,
  LocalModelMetadata,
  ModelExecutionMode,
  ModelRamStats,
  SuggestedCodeFix,
} from '../types/ide';

export class MeoOfflineRuntime {
  private worker: Worker | null = null;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./meoWorker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return this.worker;
  }

  public async checkWebGPUAvailable(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown | null> } };
    if (!nav.gpu) return false;
    try {
      const adapter = await nav.gpu.requestAdapter();
      return Boolean(adapter);
    } catch {
      return false;
    }
  }

  public loadModelIntoRam(
    model: LocalModelMetadata,
    ramLimitMb: number,
    executionMode: ModelExecutionMode,
    sampleBytes?: ArrayBuffer
  ): Promise<ModelRamStats> {
    const worker = this.ensureWorker();
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'MODEL_LOADED') {
          worker.removeEventListener('message', handler);
          resolve({
            ...event.data.payload,
            ramLimitMb,
          });
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage(
        {
          type: 'LOAD_MODEL',
          payload: {
            modelId: model.id,
            name: model.name,
            format: model.format,
            quantization: model.quantization,
            ramLimitMb,
            targetMb: model.estimatedRamMb,
            executionMode,
            modelFamily: model.modelFamily || 'qwen4-coder-moe',
            routingPreset: model.routingPreset || 'Qwen Gen-4 Coder SparkMoE',
            sampleBytes,
          },
        },
        sampleBytes ? [sampleBytes] : []
      );
    });
  }

  public loadExpertShardIntoCache(params: {
    expertId: ExpertRoleId;
    expertLabel: string;
    virtualWeightMb: number;
    cacheCapMb: number;
    shardBytes: ArrayBuffer;
  }): Promise<{ tokensPerSecond: number; cachedMb: number; pagesMapped: number }> {
    const worker = this.ensureWorker();
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (
          event.data?.type === 'EXPERT_SHARD_LOADED' &&
          event.data.payload?.expertId === params.expertId
        ) {
          worker.removeEventListener('message', handler);
          resolve(event.data.payload);
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage(
        {
          type: 'LOAD_EXPERT_SHARD',
          payload: params,
        },
        [params.shardBytes]
      );
    });
  }

  public activateCachedExpert(expertId: ExpertRoleId): Promise<{ tokensPerSecond: number }> {
    const worker = this.ensureWorker();
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (
          event.data?.type === 'EXPERT_SHARD_ACTIVATED' &&
          event.data.payload?.expertId === expertId
        ) {
          worker.removeEventListener('message', handler);
          resolve(event.data.payload);
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({
        type: 'ACTIVATE_CACHED_EXPERT',
        payload: { expertId },
      });
    });
  }

  public evictExpertShard(expertId: ExpertRoleId): void {
    if (!this.worker) return;
    this.worker.postMessage({
      type: 'EVICT_EXPERT_SHARD',
      payload: { expertId },
    });
  }

  public unloadModel(): void {
    if (!this.worker) return;
    this.worker.postMessage({ type: 'UNLOAD_MODEL' });
  }

  public runAgentStep(params: {
    stepId: string;
    role: AgentRole;
    goal: string;
    context: string;
  }): Promise<{
    stepId: string;
    tokensPerSec: number;
    allocatedMb: number;
    modelName: string;
  }> {
    const worker = this.ensureWorker();
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (
          event.data?.type === 'AGENT_STEP_DONE' &&
          event.data.payload?.stepId === params.stepId
        ) {
          worker.removeEventListener('message', handler);
          resolve(event.data.payload);
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({
        type: 'RUN_AGENT_STEP',
        payload: params,
      });
    });
  }

  public runInference(
    params: {
      prompt: string;
      activeFileId: string;
      activeFileName: string;
      activeLanguage: string;
      activeCode: string;
      findingsSummary: string;
      executionMode: ModelExecutionMode;
    },
    onToken: (chunk: string) => void
  ): Promise<{
    tokensGenerated: number;
    tokensPerSec: number;
    suggestedFix?: SuggestedCodeFix;
  }> {
    const worker = this.ensureWorker();
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'TOKEN') {
          onToken(event.data.payload.chunk);
        } else if (event.data?.type === 'INFERENCE_DONE') {
          worker.removeEventListener('message', handler);
          resolve(event.data.payload);
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({
        type: 'RUN_INFERENCE',
        payload: params,
      });
    });
  }

  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
