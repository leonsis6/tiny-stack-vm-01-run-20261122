// tiny-stack-vm: faithful interpreter, tiny stack ISA v1 (all traps/limits).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const SL = 1e6, SM = 256, CM = 64, MW = 256, OM = 65536, PM = 65535;
const IMM = new Uint8Array(256).fill(255); // immediate length, 255 = no such opcode
for (let o = 0; o < 8; o++) IMM[o] = 0;
for (let o = 0x10; o <= 0x22; o++) if (o !== 0x1f) IMM[o] = 0;
for (let o = 0x30; o <= 0x34; o++) IMM[o] = 0;
IMM[0x40] = IMM[0x41] = 0;
for (let o = 0x50; o <= 0x53; o++) IMM[o] = 0;
IMM[1] = 1; IMM[2] = 4; IMM[0x30] = IMM[0x31] = IMM[0x32] = IMM[0x33] = 2;
const PO = new Uint8Array(256), PU = new Uint8Array(256); // values popped / pushed
for (let o = 0x10; o <= 0x22; o++) if (o !== 0x17 && o !== 0x1b) { PO[o] = 2; PU[o] = 1; }
PO[3] = 1; PO[4] = 1; PU[4] = 2; PO[5] = 2; PU[5] = 2; PO[6] = 2; PU[6] = 3;
PO[7] = 3; PU[7] = 3; PO[0x17] = PU[0x17] = 1; PO[0x1b] = PU[0x1b] = 1;
PO[0x31] = PO[0x32] = 1; PO[0x40] = PU[0x40] = 1; PO[0x41] = 2;
PO[0x50] = PO[0x51] = PO[0x53] = 1; PU[1] = PU[2] = PU[0x52] = 1;

function run(p: Uint8Array, inp: Uint8Array): { out: Uint8Array; code: number } {
  const st = new Int32Array(SM), cs = new Int32Array(CM), mem = new Int32Array(MW);
  const out = new Uint8Array(OM);
  let sp = 0, csp = 0, pc = 0, ip = 0, steps = 0, olen = 0;
  const trap = (code: number) => ({ out: out.slice(0, olen), code });
  for (;;) {
    if (steps === SL) return trap(10);
    if (pc < 0 || pc >= p.length) return trap(9);
    const op = p[pc], imm = IMM[op];
    if (imm === 255) return trap(5);
    if (pc + imm >= p.length) return trap(9);
    steps++;
    const nx = pc + 1 + imm;
    if (sp < PO[op]) return trap(2);
    if (sp - PO[op] + PU[op] > SM) return trap(3);
    pc = nx;
    switch (op) {
      case 0x00: return { out: out.slice(0, olen), code: 0 };
      case 0x01: st[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 0x02: st[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: st[sp] = st[sp - 1]; sp++; break;
      case 0x05: { const t = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = t; break; }
      case 0x06: st[sp] = st[sp - 2]; sp++; break;
      case 0x07: { const a = st[sp - 3]; st[sp - 3] = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = a; break; }
      case 0x17: st[sp - 1] = -st[sp - 1] | 0; break;
      case 0x1b: st[sp - 1] = ~st[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = st[sp - 1], a = st[sp - 2];
        let r: number;
        switch (op) {
          case 0x10: r = (a + b) | 0; break;
          case 0x11: r = (a - b) | 0; break;
          case 0x12: r = Math.imul(a, b); break;
          case 0x13:
            if (b === 0) return trap(4);
            r = a === -2147483648 && b === -1 ? a : (a / b) | 0; break;
          case 0x14:
            if (b === 0) return trap(4);
            r = b === -1 ? 0 : (a % b) | 0; break;
          case 0x15:
            if (b === 0) return trap(4);
            r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
          case 0x16:
            if (b === 0) return trap(4);
            r = ((a >>> 0) % (b >>> 0)) | 0; break;
          case 0x18: r = a & b; break;
          case 0x19: r = a | b; break;
          case 0x1a: r = a ^ b; break;
          case 0x1c: r = a << (b & 31); break;
          case 0x1d: r = a >> (b & 31); break;
          case 0x1e: r = (a >>> (b & 31)) | 0; break;
          case 0x20: r = a === b ? 1 : 0; break;
          case 0x21: r = a < b ? 1 : 0; break;
          default: r = (a >>> 0) < (b >>> 0) ? 1 : 0; // 0x22 LTU
        }
        sp -= 2; st[sp++] = r; break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        if (op === 0x30) { pc = nx + rel; break; }
        if ((op === 0x31) === (st[--sp] === 0)) pc = nx + rel;
        break;
      }
      case 0x33:
        if (csp === CM) return trap(7);
        cs[csp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 0x34:
        if (csp === 0) return trap(8);
        pc = cs[--csp];
        break;
      case 0x40: {
        const addr = st[sp - 1];
        if (addr < 0 || addr >= MW) return trap(6);
        st[sp - 1] = mem[addr];
        break;
      }
      case 0x41: {
        const addr = st[sp - 1], v = st[sp - 2];
        if (addr < 0 || addr >= MW) return trap(6);
        sp -= 2; mem[addr] = v;
        break;
      }
      case 0x50: {
        const s = String(st[sp - 1]);
        if (olen + s.length > OM) return trap(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (olen + 1 > OM) return trap(11);
        out[olen++] = st[--sp] & 255;
        break;
      case 0x52: st[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: return { out: out.slice(0, olen), code: st[--sp] & 255 };
    }
  }
}

// validateInputs: refuse a malformed set up front.
function validateInputs(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`input dir ${dir} missing`);
  const ids = readdirSync(dir).sort();
  if (!ids.length) throw new Error('input dir is empty');
  for (const id of ids) {
    const a = join(dir, id, 'program.bin'), b = join(dir, id, 'input.bin');
    if (!existsSync(a) || !existsSync(b)) throw new Error(`instance ${id} missing files`);
    const n = statSync(a).size;
    if (n < 1 || n > PM) throw new Error(`instance ${id} program is ${n} bytes`);
  }
  return ids;
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of validateInputs(I)) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  // checkAnswer: never write an answer the checker would call invalid.
  if (r.out.length > OM || r.code < 0 || r.code > 255) throw new Error(`bad answer ${id}`);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
