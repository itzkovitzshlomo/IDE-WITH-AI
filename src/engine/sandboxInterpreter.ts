import {
  CodeLanguage,
  DebugFrame,
  DebugVariable,
  SandboxMemoryCell,
  SandboxPolicy,
} from '../types/ide';

export interface DebugSnapshot {
  line: number;
  status: 'paused' | 'completed' | 'fault';
  stdout: string[];
  stderr: string[];
  frames: DebugFrame[];
  variables: DebugVariable[];
  memoryCells: SandboxMemoryCell[];
  cyclesExecuted: number;
  faultReason?: string;
}

interface ParsedFunction {
  name: string;
  params: string[];
  startLine: number;
  endLine: number;
  bodyLines: Array<{ lineNum: number; text: string }>;
}

interface RuntimeVar {
  name: string;
  type: string;
  value: number | string | boolean | Array<number | string>;
  address: string;
  sizeBytes: number;
  freed?: boolean;
  uninitialized?: boolean;
}

export class SandboxDebugSession {
  private language: Exclude<CodeLanguage, 'react'>;
  private fileName: string;
  private lines: string[];
  private policy: SandboxPolicy;
  private functions = new Map<string, ParsedFunction>();
  private breakpoints = new Set<number>();

  private stdout: string[] = [];
  private stderr: string[] = [];
  private cycles = 0;
  private nextAddr = 0x7fff0010;
  private callStack: Array<{
    name: string;
    line: number;
    vars: Map<string, RuntimeVar>;
  }> = [];

  private activeGen: Generator<DebugSnapshot, unknown, boolean> | null = null;
  private finished = false;
  private faulted = false;
  private lastLine = 1;
  private stepMode = false;

  constructor(
    language: Exclude<CodeLanguage, 'react'>,
    fileName: string,
    code: string,
    breakpoints: number[],
    policy: SandboxPolicy
  ) {
    this.language = language;
    this.fileName = fileName;
    this.lines = code.split('\n');
    this.policy = policy;
    this.breakpoints = new Set(breakpoints);
    this.parseFunctions();
  }

  public updateBreakpoints(breakpoints: number[]) {
    this.breakpoints = new Set(breakpoints);
  }

  private allocAddress(sizeBytes: number): string {
    const addr = '0x' + this.nextAddr.toString(16);
    this.nextAddr += Math.max(8, sizeBytes);
    return addr;
  }

  private parseFunctions() {
    const fnRegex =
      this.language === 'rust'
        ? /^\s*(?:pub\s+)?fn\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)/
        : /^\s*(?:int|void|float|double|char|bool|std::string|auto|long)\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*\{?/;

    let i = 0;
    while (i < this.lines.length) {
      const line = this.lines[i];
      const match = fnRegex.exec(line);
      if (match) {
        const fnName = match[1];
        const rawParams = match[2].trim();
        const params = rawParams
          ? rawParams.split(',').map((p) => {
              const cleaned = p.trim();
              if (this.language === 'rust') {
                return cleaned.split(':')[0].replace(/^mut\s+/, '').trim();
              }
              const parts = cleaned.split(/\s+/);
              return parts[parts.length - 1].replace(/[*&[\]]/g, '');
            })
          : [];

        let braceDepth = 0;
        let started = false;
        const bodyLines: Array<{ lineNum: number; text: string }> = [];
        const startLine = i + 1;
        let endLine = i + 1;

        for (let j = i; j < this.lines.length; j++) {
          const cur = this.lines[j];
          for (const ch of cur) {
            if (ch === '{') {
              braceDepth++;
              started = true;
            } else if (ch === '}') {
              braceDepth--;
            }
          }
          if (j > i) {
            bodyLines.push({ lineNum: j + 1, text: cur });
          }
          if (started && braceDepth <= 0) {
            endLine = j + 1;
            i = j;
            break;
          }
        }

        this.functions.set(fnName, {
          name: fnName,
          params,
          startLine,
          endLine,
          bodyLines,
        });
      }
      i++;
    }
  }

  private buildSnapshot(
    line: number,
    status: 'paused' | 'completed' | 'fault',
    faultReason?: string
  ): DebugSnapshot {
    const variables: DebugVariable[] = [];
    const memoryCells: SandboxMemoryCell[] = [];

    for (const frame of this.callStack) {
      for (const v of frame.vars.values()) {
        const valStr = v.uninitialized
          ? '<uninitialized>'
          : Array.isArray(v.value)
          ? `[${v.value.join(', ')}]`
          : typeof v.value === 'string'
          ? `"${v.value}"`
          : String(v.value);
        variables.push({
          name: v.name,
          type: v.type,
          value: valStr,
          address: v.address,
          scope: frame.name,
        });

        const hexBytes = Array.from({ length: Math.min(8, v.sizeBytes) }, (_, idx) => {
          const seed =
            typeof v.value === 'number'
              ? Math.abs(Math.floor(v.value))
              : valStr.charCodeAt(idx % valStr.length) || 0;
          return ((seed + idx * 17) & 0xff).toString(16).padStart(2, '0').toUpperCase();
        }).join(' ');

        memoryCells.push({
          address: v.address,
          label: `${frame.name}::${v.name}`,
          sizeBytes: v.sizeBytes,
          hex: hexBytes,
          state: v.freed ? 'freed' : v.type.includes('*') ? 'allocated' : 'stack',
        });
      }
    }

    const frames: DebugFrame[] = this.callStack
      .map((f, idx) => ({
        id: `frame-${idx}-${f.name}`,
        name: `${f.name}()`,
        file: this.fileName,
        line: f.line,
      }))
      .reverse();

    return {
      line,
      status,
      stdout: [...this.stdout],
      stderr: [...this.stderr],
      frames,
      variables,
      memoryCells,
      cyclesExecuted: this.cycles,
      faultReason,
    };
  }

  private resolveVar(name: string): RuntimeVar | undefined {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const found = this.callStack[i].vars.get(name);
      if (found) return found;
    }
    return undefined;
  }

  private evalExpr(raw: string): number | string | boolean {
    const expr = raw.trim().replace(/;$/, '');
    if (!expr) return 0;

    if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
      return expr.slice(1, -1);
    }
    if (expr === 'true') return true;
    if (expr === 'false') return false;

    const arrMatch = /^([a-zA-Z_]\w*)\[([^\]]+)\]$/.exec(expr);
    if (arrMatch) {
      const arrVar = this.resolveVar(arrMatch[1]);
      const idx = Number(this.evalExpr(arrMatch[2]));
      if (arrVar && Array.isArray(arrVar.value)) {
        if (this.policy.strictPointerBounds && (idx < 0 || idx >= arrVar.value.length)) {
          throw new Error(
            `Sandbox Bounds Violation: Out-of-bounds read at ${arrMatch[1]}[${idx}] (size ${arrVar.value.length})`
          );
        }
        return arrVar.value[idx] ?? 0;
      }
    }

    const callMatch = /^([a-zA-Z_]\w*)\((.*)\)$/.exec(expr);
    if (callMatch && this.functions.has(callMatch[1])) {
      const argsRaw = this.splitArgs(callMatch[2]).map((a) => this.evalExpr(a));
      return this.executeFunctionSync(callMatch[1], argsRaw);
    }

    const singleVar = this.resolveVar(expr);
    if (singleVar) {
      if (singleVar.freed) {
        throw new Error(`Sandbox Use-After-Free Trap: Accessed freed variable '${expr}'`);
      }
      if (singleVar.uninitialized && this.policy.strictPointerBounds) {
        throw new Error(`Sandbox Uninitialized Read Trap: '${expr}' read before initialization`);
      }
      return Array.isArray(singleVar.value) ? singleVar.value.length : singleVar.value;
    }

    let evalStr = expr;
    const identifiers = expr.match(/[a-zA-Z_]\w*(?:\[[^\]]+\])?/g) || [];
    for (const ident of identifiers) {
      if (ident === 'true' || ident === 'false') continue;
      if (ident.includes('[')) {
        const val = this.evalExpr(ident);
        evalStr = evalStr.replace(ident, typeof val === 'string' ? JSON.stringify(val) : String(val));
      } else {
        const v = this.resolveVar(ident);
        if (v) {
          if (v.freed) {
            throw new Error(`Sandbox Use-After-Free Trap: Accessed freed pointer '${ident}'`);
          }
          const rep = typeof v.value === 'string' ? JSON.stringify(v.value) : String(v.value);
          evalStr = evalStr.replace(new RegExp(`\\b${ident}\\b`, 'g'), rep);
        }
      }
    }

    if (/\/\s*0(?:\b|$)/.test(evalStr)) {
      throw new Error('Sandbox Arithmetic Trap: Division by Zero');
    }

    try {
      if (!/^[0-9+\-*/%().,<>=!&|\s"'truefals]+$/.test(evalStr)) {
        return expr;
      }
      const fn = new Function(`"use strict"; return (${evalStr});`);
      const res = fn();
      if (res === Infinity || Number.isNaN(res)) {
        throw new Error('Sandbox Arithmetic Trap: Invalid numeric result (NaN / Infinity)');
      }
      return res;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Sandbox')) throw err;
      return expr;
    }
  }

  private splitArgs(raw: string): string[] {
    if (!raw.trim()) return [];
    const args: string[] = [];
    let current = '';
    let depth = 0;
    let inQuotes = false;
    let quoteChar = '';
    for (const ch of raw) {
      if ((ch === '"' || ch === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = ch;
      } else if (ch === quoteChar && inQuotes) {
        inQuotes = false;
      } else if (!inQuotes) {
        if (ch === '(' || ch === '[') depth++;
        if (ch === ')' || ch === ']') depth--;
        if (ch === ',' && depth === 0) {
          args.push(current.trim());
          current = '';
          continue;
        }
      }
      current += ch;
    }
    if (current.trim()) args.push(current.trim());
    return args;
  }

  private executeFunctionSync(
    fnName: string,
    args: Array<number | string | boolean>
  ): number | string | boolean {
    const fn = this.functions.get(fnName);
    if (!fn) return 0;

    const frameVars = new Map<string, RuntimeVar>();
    fn.params.forEach((p, idx) => {
      const val = args[idx] ?? 0;
      frameVars.set(p, {
        name: p,
        type: typeof val === 'string' ? 'string' : 'int',
        value: val,
        address: this.allocAddress(4),
        sizeBytes: 4,
      });
    });

    this.callStack.push({ name: fn.name, line: fn.startLine, vars: frameVars });
    const gen = this.runBlock(fn.bodyLines, 0, fn.bodyLines.length, false);
    let step = gen.next(false);
    while (!step.done) {
      step = gen.next(false);
    }
    const retVal =
      (step.value as { returnValue?: number | string | boolean } | undefined)?.returnValue ?? 0;
    this.callStack.pop();
    return retVal;
  }

  private *runBlock(
    lines: Array<{ lineNum: number; text: string }>,
    startIdx: number,
    endIdx: number,
    allowPause = true
  ): Generator<DebugSnapshot, { returned?: boolean; returnValue?: number | string | boolean }, boolean> {
    let idx = startIdx;

    while (idx < endIdx) {
      const { lineNum, text } = lines[idx];
      const trimmed = text.trim();

      if (
        !trimmed ||
        trimmed === '{' ||
        trimmed === '}' ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('#')
      ) {
        idx++;
        continue;
      }

      this.cycles++;
      if (this.cycles > this.policy.maxInstructionCycles) {
        throw new Error(
          `Sandbox Cycle Limit Exceeded: Halted after ${this.policy.maxInstructionCycles} cycles (infinite loop protection)`
        );
      }

      const topFrame = this.callStack[this.callStack.length - 1];
      if (topFrame) topFrame.line = lineNum;
      this.lastLine = lineNum;

      if (allowPause && (this.stepMode || this.breakpoints.has(lineNum))) {
        const shouldContinue: boolean = yield this.buildSnapshot(lineNum, 'paused');
        if (!shouldContinue) {
          this.stepMode = true;
        }
      }

      const ifMatch = /^if\s*\(?(.+?)\)?\s*\{$/.exec(trimmed);
      if (ifMatch) {
        const cond = Boolean(this.evalExpr(ifMatch[1]));
        const blockEnd = this.findClosingBrace(lines, idx);
        if (cond) {
          const res = yield* this.runBlock(lines, idx + 1, blockEnd, allowPause);
          if (res.returned) return res;
        }
        idx = blockEnd + 1;
        continue;
      }

      const whileMatch = /^while\s*\(?(.+?)\)?\s*\{$/.exec(trimmed);
      if (whileMatch) {
        const blockEnd = this.findClosingBrace(lines, idx);
        while (Boolean(this.evalExpr(whileMatch[1]))) {
          const res = yield* this.runBlock(lines, idx + 1, blockEnd, allowPause);
          if (res.returned) return res;
          this.cycles++;
          if (this.cycles > this.policy.maxInstructionCycles) {
            throw new Error(`Sandbox Cycle Limit Exceeded (${this.policy.maxInstructionCycles})`);
          }
        }
        idx = blockEnd + 1;
        continue;
      }

      const cForMatch = /^for\s*\(([^;]+);([^;]+);([^)]+)\)\s*\{$/.exec(trimmed);
      if (cForMatch) {
        const blockEnd = this.findClosingBrace(lines, idx);
        this.execStatement(cForMatch[1].trim());
        while (Boolean(this.evalExpr(cForMatch[2].trim()))) {
          const res = yield* this.runBlock(lines, idx + 1, blockEnd, allowPause);
          if (res.returned) return res;
          this.execStatement(cForMatch[3].trim());
          this.cycles++;
          if (this.cycles > this.policy.maxInstructionCycles) {
            throw new Error(`Sandbox Cycle Limit Exceeded (${this.policy.maxInstructionCycles})`);
          }
        }
        idx = blockEnd + 1;
        continue;
      }

      const rustForMatch = /^for\s+([a-zA-Z_]\w*)\s+in\s+(\d+)\.\.(=?)(\d+)\s*\{$/.exec(trimmed);
      if (rustForMatch) {
        const varName = rustForMatch[1];
        const start = Number(rustForMatch[2]);
        const inclusive = rustForMatch[3] === '=';
        const end = Number(rustForMatch[4]);
        const blockEnd = this.findClosingBrace(lines, idx);
        const frame = this.callStack[this.callStack.length - 1];
        frame.vars.set(varName, {
          name: varName,
          type: 'i32',
          value: start,
          address: this.allocAddress(4),
          sizeBytes: 4,
        });
        for (let val = start; inclusive ? val <= end : val < end; val++) {
          const v = frame.vars.get(varName)!;
          v.value = val;
          const res = yield* this.runBlock(lines, idx + 1, blockEnd, allowPause);
          if (res.returned) return res;
          this.cycles++;
          if (this.cycles > this.policy.maxInstructionCycles) {
            throw new Error(`Sandbox Cycle Limit Exceeded (${this.policy.maxInstructionCycles})`);
          }
        }
        idx = blockEnd + 1;
        continue;
      }

      const retMatch = /^return(?:\s+(.+?))?;?$/.exec(trimmed);
      if (retMatch) {
        const returnValue = retMatch[1] ? this.evalExpr(retMatch[1]) : 0;
        return { returned: true, returnValue };
      }

      this.execStatement(trimmed);
      idx++;
    }

    return {};
  }

  private findClosingBrace(
    lines: Array<{ lineNum: number; text: string }>,
    openIdx: number
  ): number {
    let depth = 0;
    for (let i = openIdx; i < lines.length; i++) {
      for (const ch of lines[i].text) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      if (depth <= 0) return i;
    }
    return lines.length - 1;
  }

  private execStatement(stmt: string) {
    const clean = stmt.replace(/;$/, '').trim();
    if (!clean) return;

    const incMatch = /^([a-zA-Z_]\w*)\+\+$/.exec(clean);
    if (incMatch) {
      const v = this.resolveVar(incMatch[1]);
      if (v && typeof v.value === 'number') v.value += 1;
      return;
    }
    const decMatch = /^([a-zA-Z_]\w*)\-\-$/.exec(clean);
    if (decMatch) {
      const v = this.resolveVar(decMatch[1]);
      if (v && typeof v.value === 'number') v.value -= 1;
      return;
    }

    const printfMatch = /^printf\s*\((.*)\)$/.exec(clean);
    if (printfMatch) {
      const args = this.splitArgs(printfMatch[1]);
      if (args.length > 0) {
        let fmt = String(this.evalExpr(args[0])).replace(/\\n/g, '');
        let argIdx = 1;
        fmt = fmt.replace(/%[sdif]/g, () => {
          const val = argIdx < args.length ? this.evalExpr(args[argIdx++]) : '';
          return String(val);
        });
        this.stdout.push(fmt);
      }
      return;
    }

    if (clean.startsWith('std::cout') || clean.startsWith('cout')) {
      const parts = clean
        .replace(/^std::cout|^cout/, '')
        .split('<<')
        .map((p) => p.trim())
        .filter((p) => p && p !== 'std::endl' && p !== 'endl');
      const rendered = parts.map((p) => String(this.evalExpr(p))).join('');
      this.stdout.push(rendered);
      return;
    }

    const printlnMatch = /^println!\s*\((.*)\)$/.exec(clean);
    if (printlnMatch) {
      const args = this.splitArgs(printlnMatch[1]);
      if (args.length > 0) {
        let fmt = String(this.evalExpr(args[0]));
        let argIdx = 1;
        fmt = fmt.replace(/\{\}/g, () => {
          const val = argIdx < args.length ? this.evalExpr(args[argIdx++]) : '';
          return String(val);
        });
        this.stdout.push(fmt);
      }
      return;
    }

    const strcpyMatch = /^(?:strcpy|strncpy)\s*\((.*)\)$/.exec(clean);
    if (strcpyMatch) {
      const args = this.splitArgs(strcpyMatch[1]);
      if (args.length >= 2) {
        const destVar = this.resolveVar(args[0].trim());
        const srcVal = String(this.evalExpr(args[1]));
        if (destVar) {
          if (
            this.policy.strictPointerBounds &&
            srcVal.length >= destVar.sizeBytes &&
            clean.startsWith('strcpy')
          ) {
            this.stderr.push(
              `[Sandbox Alert] strcpy() warning: copying ${srcVal.length} chars into ${destVar.sizeBytes}-byte buffer`
            );
          }
          destVar.value = srcVal.slice(0, Math.max(1, destVar.sizeBytes - 1));
          destVar.uninitialized = false;
        }
      }
      return;
    }

    const freeMatch = /^free\s*\(\s*([a-zA-Z_]\w*)\s*\)$/.exec(clean);
    if (freeMatch) {
      const v = this.resolveVar(freeMatch[1]);
      if (v) {
        if (v.freed) {
          throw new Error(`Sandbox Double-Free Trap: Double free detected on '${freeMatch[1]}'`);
        }
        v.freed = true;
      }
      return;
    }

    const charArrMatch = /^char\s+([a-zA-Z_]\w*)\[(\d*)\](?:\s*=\s*(.+))?$/.exec(clean);
    if (charArrMatch) {
      const name = charArrMatch[1];
      const initVal = charArrMatch[3] ? String(this.evalExpr(charArrMatch[3])) : '';
      const size = charArrMatch[2] ? Number(charArrMatch[2]) : initVal.length + 1;
      const frame = this.callStack[this.callStack.length - 1];
      frame.vars.set(name, {
        name,
        type: `char[${size}]`,
        value: initVal,
        address: this.allocAddress(size),
        sizeBytes: size,
      });
      return;
    }

    const intArrMatch = /^(?:int|float|double)\s+([a-zA-Z_]\w*)\[(\d*)\]\s*=\s*\{([^}]+)\}$/.exec(clean);
    if (intArrMatch) {
      const name = intArrMatch[1];
      const elems = intArrMatch[3].split(',').map((e) => Number(this.evalExpr(e)));
      const frame = this.callStack[this.callStack.length - 1];
      frame.vars.set(name, {
        name,
        type: `int[${elems.length}]`,
        value: elems,
        address: this.allocAddress(elems.length * 4),
        sizeBytes: elems.length * 4,
      });
      return;
    }

    const ptrMatch = /^(int|char|float|double|void)\s*\*\s*([a-zA-Z_]\w*)(?:\s*=\s*(.+))?$/.exec(clean);
    if (ptrMatch) {
      const type = `${ptrMatch[1]}*`;
      const name = ptrMatch[2];
      const hasInit = Boolean(ptrMatch[3]);
      const val = hasInit ? this.evalExpr(ptrMatch[3]!) : 'WILD_PTR';
      const frame = this.callStack[this.callStack.length - 1];
      frame.vars.set(name, {
        name,
        type,
        value: val,
        address: this.allocAddress(8),
        sizeBytes: 8,
        uninitialized: !hasInit,
      });
      return;
    }

    const rustLetMatch = /^let\s+(?:mut\s+)?([a-zA-Z_]\w*)(?:\s*:\s*([^=]+))?\s*=\s*(.+)$/.exec(clean);
    if (rustLetMatch) {
      const name = rustLetMatch[1];
      const val = this.evalExpr(rustLetMatch[3]);
      const inferredType =
        rustLetMatch[2]?.trim() ||
        (typeof val === 'string' ? '&str' : typeof val === 'boolean' ? 'bool' : 'i32');
      const frame = this.callStack[this.callStack.length - 1];
      frame.vars.set(name, {
        name,
        type: inferredType,
        value: val,
        address: this.allocAddress(typeof val === 'string' ? val.length + 1 : 4),
        sizeBytes: typeof val === 'string' ? val.length + 1 : 4,
      });
      return;
    }

    const cDeclMatch = /^(int|float|double|bool|std::string|string|long|auto)\s+([a-zA-Z_]\w*)(?:\s*=\s*(.+))?$/.exec(clean);
    if (cDeclMatch) {
      const type = cDeclMatch[1];
      const name = cDeclMatch[2];
      const hasInit = Boolean(cDeclMatch[3]);
      const val = hasInit ? this.evalExpr(cDeclMatch[3]!) : 0;
      const frame = this.callStack[this.callStack.length - 1];
      frame.vars.set(name, {
        name,
        type,
        value: val,
        address: this.allocAddress(typeof val === 'string' ? val.length + 1 : 4),
        sizeBytes: typeof val === 'string' ? val.length + 1 : 4,
        uninitialized: !hasInit,
      });
      return;
    }

    const assignMatch = /^([a-zA-Z_]\w*)\s*=\s*(.+)$/.exec(clean);
    if (assignMatch) {
      const v = this.resolveVar(assignMatch[1]);
      const val = this.evalExpr(assignMatch[2]);
      if (v) {
        v.value = val;
        v.uninitialized = false;
        if (val === 'NULL' || val === 'nullptr') {
          v.freed = false;
        }
      }
    }
  }

  public start(debugMode: boolean): DebugSnapshot {
    this.stdout = [];
    this.stderr = [];
    this.cycles = 0;
    this.callStack = [];
    this.finished = false;
    this.faulted = false;
    this.stepMode = debugMode;

    const mainFn = this.functions.get('main');
    if (!mainFn) {
      this.faulted = true;
      return {
        line: 1,
        status: 'fault',
        stdout: [],
        stderr: ['Entry point main() not found in active file.'],
        frames: [],
        variables: [],
        memoryCells: [],
        cyclesExecuted: 0,
        faultReason: 'Missing main() entry point',
      };
    }

    this.callStack.push({
      name: 'main',
      line: mainFn.startLine,
      vars: new Map(),
    });

    this.activeGen = this.runBlock(mainFn.bodyLines, 0, mainFn.bodyLines.length, true);
    return this.advance(debugMode ? 'step' : 'continue');
  }

  public advance(mode: 'step' | 'continue'): DebugSnapshot {
    if (!this.activeGen || this.finished || this.faulted) {
      return this.buildSnapshot(this.lastLine, this.faulted ? 'fault' : 'completed');
    }

    this.stepMode = mode === 'step';
    try {
      const res = this.activeGen.next(mode === 'continue');
      if (res.done) {
        this.finished = true;
        return this.buildSnapshot(this.lastLine, 'completed');
      }
      return res.value;
    } catch (err) {
      this.faulted = true;
      const msg = err instanceof Error ? err.message : String(err);
      this.stderr.push(msg);
      return this.buildSnapshot(this.lastLine, 'fault', msg);
    }
  }
}
