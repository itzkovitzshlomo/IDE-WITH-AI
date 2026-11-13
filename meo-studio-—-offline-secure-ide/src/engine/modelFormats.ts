import {
  ExpertRoleId,
  ExpertShard,
  LocalModelMetadata,
  ModelFamily,
  QwenPresetId,
} from '../types/ide';

const GGUF_MAGIC = 0x46554747; // "GGUF" little-endian
const MEO_MAGIC = 0x314f454d; // "MEO1" little-endian

const GGUF_VAL_TYPE = {
  UINT8: 0,
  INT8: 1,
  UINT16: 2,
  INT16: 3,
  UINT32: 4,
  INT32: 5,
  FLOAT32: 6,
  BOOL: 7,
  STRING: 8,
  ARRAY: 9,
  UINT64: 10,
  INT64: 11,
  FLOAT64: 12,
};

const EXPERT_DEFINITIONS: Record<
  ModelFamily,
  Array<{ id: ExpertRoleId; label: string; domain: string }>
> = {
  'qwen4-coder-moe': [
    { id: 'expert-architect', label: 'Qwen4 Architect & HE/EN Router', domain: 'NLU Planning & Topology' },
    { id: 'expert-c-cpp', label: 'Qwen4 C / C++ Kernel Expert', domain: 'Systems & Memory' },
    { id: 'expert-rust', label: 'Qwen4 Rust Safety Expert', domain: 'Ownership & Traits' },
    { id: 'expert-react', label: 'Qwen4 React TSX Expert', domain: 'UI & State Graphs' },
    { id: 'expert-security', label: 'Qwen4 CWE Audit Expert', domain: 'Static Audit & Self-Heal' },
  ],
  'qwen25-coder-moe': [
    { id: 'expert-architect', label: 'Qwen2.5 Architect Router', domain: 'Planning & Spec' },
    { id: 'expert-c-cpp', label: 'Qwen2.5 C / C++ Expert', domain: 'Systems & Buffers' },
    { id: 'expert-rust', label: 'Qwen2.5 Rust Expert', domain: 'Borrow Checker' },
    { id: 'expert-react', label: 'Qwen2.5 React Expert', domain: 'TSX & Components' },
    { id: 'expert-security', label: 'Qwen2.5 CWE Security Expert', domain: 'Audit & Patching' },
  ],
  'generic-moe': [
    { id: 'expert-architect', label: 'Architect Router', domain: 'Planning & Topology' },
    { id: 'expert-c-cpp', label: 'C / C++ Expert', domain: 'Systems & Memory' },
    { id: 'expert-rust', label: 'Rust Safety Expert', domain: 'Ownership & Traits' },
    { id: 'expert-react', label: 'React UI Expert', domain: 'TSX & Components' },
    { id: 'expert-security', label: 'CWE Audit Expert', domain: 'Security & Self-Heal' },
  ],
};

export function detectModelFamily(hintText: string): ModelFamily {
  const lower = hintText.toLowerCase();
  if (
    lower.includes('qwen4') ||
    lower.includes('qwen-4') ||
    lower.includes('qwen_4') ||
    lower.includes('qwen3') ||
    lower.includes('gen4')
  ) {
    return 'qwen4-coder-moe';
  }
  if (
    lower.includes('qwen2.5') ||
    lower.includes('qwen25') ||
    lower.includes('qwen2') ||
    lower.includes('qwen')
  ) {
    return 'qwen25-coder-moe';
  }
  return 'generic-moe';
}

export function indexModelExpertShards(
  totalSizeBytes: number,
  headerOffsetBytes: number,
  family: ModelFamily = 'qwen4-coder-moe'
): ExpertShard[] {
  const defs = EXPERT_DEFINITIONS[family] || EXPERT_DEFINITIONS['qwen4-coder-moe'];
  const payloadStart = Math.min(headerOffsetBytes, Math.max(0, totalSizeBytes - defs.length));
  const payloadSpan = Math.max(defs.length, totalSizeBytes - payloadStart);
  const shardSpan = Math.floor(payloadSpan / defs.length);

  // Proportional virtual MoE shard footprint (e.g. if a multi-GB Qwen GGUF/MEO is indexed)
  const totalEstMb = Math.max(120, Math.round(totalSizeBytes / (1024 * 1024)));
  const virtualPerShardMb = Math.max(24, Math.round(totalEstMb / defs.length));

  return defs.map((def, idx) => {
    const byteStart = payloadStart + idx * shardSpan;
    const byteEnd =
      idx === defs.length - 1 ? totalSizeBytes : payloadStart + (idx + 1) * shardSpan;

    return {
      id: def.id,
      label: def.label,
      domain: def.domain,
      byteStart,
      byteEnd,
      sizeBytes: Math.max(0, byteEnd - byteStart),
      virtualWeightMb: virtualPerShardMb,
    };
  });
}

function readGGUFString(view: DataView, offset: { pos: number }): string {
  if (offset.pos + 8 > view.byteLength) return '';
  const len = Number(view.getBigUint64(offset.pos, true));
  offset.pos += 8;
  const safeLen = Math.min(len, Math.max(0, view.byteLength - offset.pos), 256);
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset.pos, safeLen);
  offset.pos += len;
  return new TextDecoder().decode(bytes);
}

function skipOrReadGGUFValue(
  view: DataView,
  offset: { pos: number },
  valType: number
): string | null {
  if (offset.pos >= view.byteLength) return null;
  switch (valType) {
    case GGUF_VAL_TYPE.UINT8: {
      const v = view.getUint8(offset.pos);
      offset.pos += 1;
      return String(v);
    }
    case GGUF_VAL_TYPE.INT8: {
      const v = view.getInt8(offset.pos);
      offset.pos += 1;
      return String(v);
    }
    case GGUF_VAL_TYPE.UINT16: {
      const v = view.getUint16(offset.pos, true);
      offset.pos += 2;
      return String(v);
    }
    case GGUF_VAL_TYPE.INT16: {
      const v = view.getInt16(offset.pos, true);
      offset.pos += 2;
      return String(v);
    }
    case GGUF_VAL_TYPE.UINT32: {
      const v = view.getUint32(offset.pos, true);
      offset.pos += 4;
      return String(v);
    }
    case GGUF_VAL_TYPE.INT32: {
      const v = view.getInt32(offset.pos, true);
      offset.pos += 4;
      return String(v);
    }
    case GGUF_VAL_TYPE.FLOAT32: {
      const v = view.getFloat32(offset.pos, true);
      offset.pos += 4;
      return v.toFixed(4);
    }
    case GGUF_VAL_TYPE.BOOL: {
      const v = view.getUint8(offset.pos) !== 0;
      offset.pos += 1;
      return String(v);
    }
    case GGUF_VAL_TYPE.STRING:
      return readGGUFString(view, offset);
    case GGUF_VAL_TYPE.UINT64: {
      const v = view.getBigUint64(offset.pos, true);
      offset.pos += 8;
      return v.toString();
    }
    case GGUF_VAL_TYPE.INT64: {
      const v = view.getBigInt64(offset.pos, true);
      offset.pos += 8;
      return v.toString();
    }
    case GGUF_VAL_TYPE.FLOAT64: {
      const v = view.getFloat64(offset.pos, true);
      offset.pos += 8;
      return v.toFixed(4);
    }
    case GGUF_VAL_TYPE.ARRAY: {
      const elemType = view.getUint32(offset.pos, true);
      offset.pos += 4;
      const count = Number(view.getBigUint64(offset.pos, true));
      offset.pos += 8;
      if (count > 32) return `[Array(${count})]`;
      for (let i = 0; i < count && offset.pos < view.byteLength; i++) {
        skipOrReadGGUFValue(view, offset, elemType);
      }
      return `[Array(${count})]`;
    }
    default:
      return null;
  }
}

export async function parseLocalModelFile(file: File): Promise<LocalModelMetadata> {
  const headerSlice = file.slice(0, Math.min(file.size, 256 * 1024));
  const buffer = await headerSlice.arrayBuffer();
  const view = new DataView(buffer);
  const magic = view.byteLength >= 4 ? view.getUint32(0, true) : 0;
  const lowerName = file.name.toLowerCase();

  if (magic === GGUF_MAGIC || lowerName.endsWith('.gguf')) {
    const kvPreview: Record<string, string> = {};
    let tensorCount = 0;
    let version = 3;
    let headerEndByte = 64;

    if (magic === GGUF_MAGIC && view.byteLength >= 24) {
      version = view.getUint32(4, true);
      tensorCount = Number(view.getBigUint64(8, true));
      const kvCount = Number(view.getBigUint64(16, true));
      const offset = { pos: 24 };

      for (let i = 0; i < Math.min(kvCount, 48) && offset.pos < view.byteLength - 16; i++) {
        const key = readGGUFString(view, offset);
        if (!key || offset.pos + 4 > view.byteLength) break;
        const valType = view.getUint32(offset.pos, true);
        offset.pos += 4;
        const val = skipOrReadGGUFValue(view, offset, valType);
        if (val !== null && Object.keys(kvPreview).length < 12 && !val.startsWith('[Array')) {
          kvPreview[key] = val;
        }
      }
      headerEndByte = offset.pos;
    }

    const archRaw = kvPreview['general.architecture'] || '';
    const modelNameHint = kvPreview['general.name'] || '';
    const family = detectModelFamily(`${file.name} ${archRaw} ${modelNameHint}`);
    const arch =
      archRaw ||
      (family === 'qwen4-coder-moe'
        ? 'qwen4moe-coder'
        : family === 'qwen25-coder-moe'
        ? 'qwen2moe-coder'
        : 'llama-moe-gguf');
    const ctxLen = Number(
      kvPreview[`${archRaw}.context_length`] || kvPreview['qwen2.context_length'] || 32768
    );
    const quantMatch = /Q\d_[A-Z0-9_]+|F16|F32|IQ\d_[A-Z]+/i.exec(file.name);
    const quant = quantMatch ? quantMatch[0].toUpperCase() : 'Q4_K_M';
    const estRamMb = Math.max(24, Math.round((file.size / (1024 * 1024)) * 1.18));
    const expertShards = indexModelExpertShards(file.size, headerEndByte, family);

    return {
      id: `model-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      format: 'gguf',
      fileSizeBytes: file.size,
      quantization: quant,
      architecture: `${arch} (GGUF v${version})`,
      parameterCount: kvPreview['general.size_label'] || inferParamsFromSize(file.size),
      contextLength: Number.isFinite(ctxLen) ? ctxLen : 32768,
      tensorCount: tensorCount || 160,
      estimatedRamMb: estRamMb,
      kvPreview,
      loadedInRam: false,
      isMoE: true,
      modelFamily: family,
      routingPreset:
        family === 'qwen4-coder-moe'
          ? 'Qwen Gen-4 Coder SparkMoE'
          : family === 'qwen25-coder-moe'
          ? 'Qwen 2.5-Coder SparkMoE'
          : 'Standard MoE Sharding',
      expertShards,
      addedAt: Date.now(),
    };
  }

  if (magic === MEO_MAGIC || lowerName.endsWith('.meo')) {
    let meta: Record<string, unknown> = {};
    let headerEndByte = 12;
    if (magic === MEO_MAGIC && view.byteLength >= 12) {
      const jsonLen = view.getUint32(8, true);
      if (12 + jsonLen <= view.byteLength) {
        headerEndByte = 12 + jsonLen;
        const jsonBytes = new Uint8Array(buffer, 12, jsonLen);
        try {
          meta = JSON.parse(new TextDecoder().decode(jsonBytes));
        } catch {
          meta = {};
        }
      }
    }

    const quant = String(meta.quantization || 'MEO-Q8_MoE');
    const arch = String(meta.architecture || 'Qwen4-Coder SparkMoE SSD Transformer');
    const family =
      (meta.modelFamily as ModelFamily | undefined) ||
      detectModelFamily(`${file.name} ${arch}`);
    const tensorCount = Number(meta.tensorCount || 160);
    const contextLength = Number(meta.contextLength || 32768);
    const estRamMb = Math.max(16, Math.round((file.size / (1024 * 1024)) * 1.05));
    const expertShards = Array.isArray(meta.expertShards)
      ? (meta.expertShards as ExpertShard[])
      : indexModelExpertShards(file.size, headerEndByte, family);

    return {
      id: `model-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      format: 'meo',
      fileSizeBytes: file.size,
      quantization: quant,
      architecture: arch,
      parameterCount: String(meta.parameterCount || inferParamsFromSize(file.size)),
      contextLength,
      tensorCount,
      estimatedRamMb: estRamMb,
      kvPreview: {
        'meo.execution_target': 'sparkmoe_ssd_streaming',
        'meo.model_family': family,
        'meo.page_alignment': '64KB',
        'meo.quant_scheme': quant,
      },
      loadedInRam: false,
      isMoE: true,
      modelFamily: family,
      routingPreset: String(
        meta.routingPreset ||
          (family === 'qwen4-coder-moe'
            ? 'Qwen Gen-4 Coder SparkMoE'
            : 'Qwen 2.5-Coder SparkMoE')
      ),
      expertShards,
      addedAt: Date.now(),
    };
  }

  throw new Error('Unsupported model file. Please select a valid .meo or .gguf file.');
}

function inferParamsFromSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 8) return '30B-A3B MoE';
  if (gb >= 4) return '14B-Coder MoE';
  if (gb >= 1.5) return '7B-Coder MoE';
  if (gb >= 0.4) return '3B-Coder MoE';
  return 'SparkMoE-Coder';
}

export function buildSampleMeoBinary(preset: QwenPresetId = 'qwen4-coder'): {
  blob: Blob;
  metadata: LocalModelMetadata;
} {
  const isGen4 = preset === 'qwen4-coder';
  const name = isGen4
    ? 'qwen4-coder-30b-a3b-sparkmoe.meo'
    : 'qwen2.5-coder-14b-sparkmoe.meo';
  const family: ModelFamily = isGen4 ? 'qwen4-coder-moe' : 'qwen25-coder-moe';
  const defs = EXPERT_DEFINITIONS[family];
  const shardSize = 256 * 1024; // 256KB per expert shard on disk (1.28MB total)
  const payloadBytes = shardSize * defs.length;

  const preDescriptor = {
    format: 'MEO1',
    name,
    modelFamily: family,
    routingPreset: isGen4 ? 'Qwen Gen-4 Coder SparkMoE' : 'Qwen 2.5-Coder SparkMoE',
    architecture: isGen4
      ? 'Qwen Gen-4 Coder MoE (SparkMoE SSD)'
      : 'Qwen 2.5-Coder MoE (SparkMoE SSD)',
    quantization: isGen4 ? 'Q4_K_M / Q8_0 Hybrid' : 'Q8_0 (SSD Sharded)',
    parameterCount: isGen4 ? '30B-A3B (5 Experts)' : '14B-MoE (5 Experts)',
    contextLength: isGen4 ? 32768 : 16384,
    tensorCount: isGen4 ? 240 : 160,
    ramPageKb: 64,
    expertShards: [] as ExpertShard[],
  };

  const approxHeaderLen = 12 + new TextEncoder().encode(JSON.stringify(preDescriptor)).length + 820;
  const expertShards: ExpertShard[] = defs.map((def, idx) => ({
    id: def.id,
    label: def.label,
    domain: def.domain,
    byteStart: approxHeaderLen + idx * shardSize,
    byteEnd: approxHeaderLen + (idx + 1) * shardSize,
    sizeBytes: shardSize,
    virtualWeightMb: isGen4 ? 64 : 48,
  }));

  const descriptor = { ...preDescriptor, expertShards };
  const jsonRaw = new TextEncoder().encode(JSON.stringify(descriptor));
  const paddedJsonLen = Math.max(jsonRaw.length, approxHeaderLen - 12);
  const totalBytes = 12 + paddedJsonLen + payloadBytes;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  view.setUint32(0, MEO_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, jsonRaw.length, true);

  const out = new Uint8Array(buffer);
  out.set(jsonRaw, 12);

  // Fill deterministic quantized tensor weights per expert shard
  const weightsStart = 12 + paddedJsonLen;
  for (let s = 0; s < defs.length; s++) {
    const start = weightsStart + s * shardSize;
    for (let i = 0; i < shardSize; i++) {
      out[start + i] = ((i * (37 + s * 11)) + (isGen4 ? 23 : 19)) & 0xff;
    }
  }

  return {
    blob: new Blob([buffer], { type: 'application/octet-stream' }),
    metadata: {
      id: `meo-${preset}-${Date.now()}`,
      name,
      format: 'meo',
      fileSizeBytes: totalBytes,
      quantization: descriptor.quantization,
      architecture: descriptor.architecture,
      parameterCount: descriptor.parameterCount,
      contextLength: descriptor.contextLength,
      tensorCount: descriptor.tensorCount,
      estimatedRamMb: isGen4 ? 320 : 240,
      kvPreview: {
        'meo.execution_target': 'sparkmoe_ssd_streaming',
        'meo.model_family': family,
        'meo.experts_indexed': String(expertShards.length),
        'meo.hebrew_nlu': 'enabled',
      },
      loadedInRam: true,
      isBuiltinSample: true,
      isMoE: true,
      modelFamily: family,
      routingPreset: descriptor.routingPreset,
      expertShards,
      addedAt: Date.now(),
    },
  };
}
