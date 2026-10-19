// High-level model of the mouse on top of the raw command set.
import { CHIPS, CHIP_RESET, LED_MODES, DEFAULTS } from './data.js';
import { MODELS } from './hid.js';
import { decodeMacro, encodeMacro, hexToGrb, grbToHex, rateFromDevice, rateToDevice, MACRO_MAX_BYTES } from './codec.js';

// Write commands; reads use the same number with the high bit set.
export const CMD = {
  SETTING: 0x02,   // sub 2 profile, 3 sleep (s), 4 deep sleep (s), 5 sensor flags, 6 LOD, 7 charge count (read)
  RATE: 0x03,      // report interval
  KEY: 0x04,       // 16 button slots x 4 bytes
  WHEEL: 0x05,     // 2 wheel slots x 4 bytes (up, down)
  DPI: 0x06,       // [enable mask, current stage (1-based), 8 x u16 sensor register, u16 extra]
  DPI_COLOR: 0x07, // 8 x [G, R, B]
  MACRO: 0x08,     // sub = slot, up to 512 bytes, 32-byte chunks
  LED: 0x09,       // record 0 = [mode, u16 aux], record n (n * 25) = [speed, direction, dim, colour mask, 7 x GRB]
  INPUT: 0x0a,     // sub 2 debounce (ms), 6 move-to-wake
  INFO: 0x81,      // [status, battery %, sensor chip]
  VERSION: 0xf0,   // sub 1 firmware, sub 2 build id
  RX_VERSION: 0xf1,
};

export const BUTTONS = [
  { slot: 0, label: 'Left button' },
  { slot: 2, label: 'Right button' },
  { slot: 1, label: 'Wheel click' },
  { slot: 4, label: 'Forward (side)' },
  { slot: 3, label: 'Back (side)' },
  { slot: 5, label: 'DPI button' },
];
export const WHEEL = [{ idx: 0, label: 'Scroll up' }, { idx: 1, label: 'Scroll down' }];
// Factory bindings, indexed by hardware slot / wheel index.
export const DEFAULT_KEYS = [[1, 1, 0, 0], [1, 4, 0, 0], [1, 2, 0, 0], [1, 8, 0, 0], [1, 0x10, 0, 0], [8, 3, 0, 0]];
export const DEFAULT_WHEEL = [[5, 0x01, 0, 0], [5, 0x81, 0, 0]];
export const PROFILES = ['Office', 'Game I', 'Game II'];

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const text = (b) => new TextDecoder().decode(b).replace(/\0.*$/s, '').trim();

export class Mouse {
  constructor(transport) {
    this.t = transport;
    this.state = null;
  }

  get chip() { return CHIPS[this.state?.info.chip] || CHIPS[8]; }

  dpiFromReg(reg) {
    const table = this.chip.table;
    let best = table[0];
    for (const e of table) if (Math.abs(e[1] - reg) < Math.abs(best[1] - reg)) best = e;
    return best[0];
  }

  regFromDpi(dpi) {
    const table = this.chip.table;
    let best = table[0];
    for (const e of table) if (Math.abs(e[0] - dpi) < Math.abs(best[0] - dpi)) best = e;
    return best[1];
  }

  async load(progress = () => {}) {
    const t = this.t;
    const info = await t.read(CMD.INFO, 0, 0, 3);
    const s = {
      info: {
        status: info[0], battery: info[1], chip: info[2],
        model: MODELS[t.productId] || { series: '?', link: 'USB' },
        firmware: '', build: '', receiver: '',
      },
    };
    this.state = s;
    progress(0.1);
    try { s.info.firmware = text(await t.read(CMD.VERSION, 1, 0, 8)); } catch { /* older firmware */ }
    try { s.info.build = text(await t.read(CMD.VERSION, 2, 0, 16)); } catch { /* ignore */ }
    if (s.info.model.link !== 'Wired') {
      try { s.info.receiver = text(await t.read(CMD.RX_VERSION, 1, 0, 8)); } catch { /* ignore */ }
    }
    progress(0.2);
    const g = async (sub, len) => t.read(CMD.SETTING | 0x80, sub, 0, len);
    s.profile = Math.min((await g(2, 1))[0], 2);
    const sleep = await g(3, 2), deep = await g(4, 2);
    s.global = {
      sleepMin: Math.max(1, Math.round(u16(sleep, 0) / 60)),
      deepSleepMin: Math.max(1, Math.round(u16(deep, 0) / 60)),
      sensorFlags: (await g(5, 1))[0],
      lod: (await g(6, 1))[0],
      debounce: (await t.read(CMD.INPUT | 0x80, 2, 0, 1))[0],
      moveWake: (await t.read(CMD.INPUT | 0x80, 6, 0, 1))[0],
    };
    try { s.global.chargeCount = (await g(7, 1))[0]; } catch { s.global.chargeCount = null; }
    progress(0.35);
    await this.loadProfile((f) => progress(0.35 + f * 0.65));
    return s;
  }

  async loadProfile(progress = () => {}) {
    const t = this.t;
    const p = {};
    p.rateRaw = (await t.read(CMD.RATE | 0x80, 0, 0, 1))[0];
    p.rate = rateFromDevice(p.rateRaw);
    const dpi = await t.read(CMD.DPI | 0x80, 0, 0, 20);
    const regs = Array.from({ length: 8 }, (_, i) => u16(dpi, 2 + i * 2));
    p.dpi = {
      enabled: Array.from({ length: 8 }, (_, i) => !!(dpi[0] & (1 << i))),
      current: Math.max(0, Math.min(7, dpi[1] - 1)),
      values: regs.map((r) => this.dpiFromReg(r)),
      extra: u16(dpi, 18),
    };
    const col = await t.read(CMD.DPI_COLOR | 0x80, 0, 0, 24);
    p.dpi.colors = Array.from({ length: 8 }, (_, i) => grbToHex(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]));
    progress(0.2);
    p.keys = [];
    for (let slot = 0; slot < 6; slot++) p.keys[slot] = Array.from(await t.read(CMD.KEY | 0x80, 0, slot * 4, 4));
    p.wheel = [];
    for (let i = 0; i < 2; i++) p.wheel[i] = Array.from(await t.read(CMD.WHEEL | 0x80, 0, i * 4, 4));
    progress(0.5);
    const head = await t.read(CMD.LED | 0x80, 0, 0, 25);
    p.led = { mode: head[0] & 0x3f, savePower: !!(head[0] & 0x40), flags: head[0] & 0x80, aux: u16(head, 1), records: {} };
    for (const m of LED_MODES) {
      const n = m.byte & 0x3f;
      if (n >= 9) continue;
      const r = await t.read(CMD.LED | 0x80, 0, n * 25, 25);
      p.led.records[n] = {
        speed: r[0], direction: r[1], brightness: Math.max(1, 6 - r[2]), mask: r[3],
        colors: Array.from({ length: 7 }, (_, i) => grbToHex(r[4 + i * 3], r[5 + i * 3], r[6 + i * 3])),
      };
    }
    progress(0.8);
    p.macros = {};
    for (const keys of p.keys) {
      if (keys[0] === 0x0a && keys[2] < 16 && !p.macros[keys[2]]) p.macros[keys[2]] = await this.readMacro(keys[2]);
    }
    progress(1);
    this.state.p = p;
    return p;
  }

  async readMacro(slot) {
    const first = await this.t.read(CMD.MACRO | 0x80, slot, 0, 32);
    const total = Math.min(MACRO_MAX_BYTES, u16(first, 2) + 4);
    const buf = new Uint8Array(Math.ceil(total / 32) * 32);
    buf.set(first);
    for (let off = 32; off < total; off += 32) buf.set(await this.t.read(CMD.MACRO | 0x80, slot, off, 32), off);
    return decodeMacro(buf.subarray(0, total));
  }

  // ---------- writers ----------
  async setProfile(n) {
    await this.t.write(CMD.SETTING, 2, 0, [n]);
    this.state.profile = n;
    await this.loadProfile();
  }

  async setRate(hz) {
    const v = rateToDevice(hz);
    await this.t.write(CMD.RATE, 0, 0, [v]);
    Object.assign(this.state.p, { rate: hz, rateRaw: v });
  }

  async writeDpi() {
    const d = this.state.p.dpi;
    if (!d.enabled[d.current]) d.current = d.enabled.findIndex(Boolean);
    const pkt = new Uint8Array(20);
    pkt[0] = d.enabled.reduce((m, on, i) => m | (on ? 1 << i : 0), 0);
    pkt[1] = d.current + 1;
    d.values.forEach((v, i) => { const r = this.regFromDpi(v); pkt[2 + i * 2] = r & 0xff; pkt[3 + i * 2] = r >> 8; });
    pkt[18] = d.extra & 0xff; pkt[19] = d.extra >> 8;
    await this.t.write(CMD.DPI, 0, 0, pkt);
  }

  async writeDpiColors() {
    await this.t.write(CMD.DPI_COLOR, 0, 0, this.state.p.dpi.colors.flatMap(hexToGrb));
  }

  async setKey(slot, bytes) {
    await this.t.write(CMD.KEY, 0, slot * 4, bytes);
    this.state.p.keys[slot] = [...bytes];
  }

  async setWheel(idx, bytes) {
    await this.t.write(CMD.WHEEL, 0, idx * 4, bytes);
    this.state.p.wheel[idx] = [...bytes];
  }

  async writeMacro(slot, macro) {
    const bytes = encodeMacro(macro);
    if (bytes.length > MACRO_MAX_BYTES) throw new Error(`Macro is too long (${bytes.length}/${MACRO_MAX_BYTES} bytes)`);
    for (let off = 0; off < bytes.length; off += 32) await this.t.write(CMD.MACRO, slot, off, bytes.slice(off, off + 32));
    this.state.p.macros[slot] = decodeMacro(bytes);
  }

  // Macros live in the slot of the button they are bound to, like the vendor app.
  async assignMacro(slot, macro, mode) {
    await this.writeMacro(slot, macro);
    await this.setKey(slot, [0x0a, mode, slot, 0]);
  }

  async writeLedHeader() {
    const l = this.state.p.led;
    const mode = LED_MODES.find((m) => (m.byte & 0x3f) === l.mode) || LED_MODES[0];
    const head = new Uint8Array(25);
    head[0] = (mode.byte & 0xbf) | (l.savePower ? 0x40 : 0);
    head[1] = l.aux & 0xff; head[2] = l.aux >> 8;
    await this.t.write(CMD.LED, 0, 0, head);
  }

  async writeLedRecord(n) {
    const r = this.state.p.led.records[n];
    if (!r) return;
    const rec = new Uint8Array(25);
    rec.set([r.speed, r.direction, 6 - r.brightness, r.mask]);
    r.colors.forEach((c, i) => rec.set(hexToGrb(c), 4 + i * 3));
    await this.t.write(CMD.LED, 0, n * 25, rec);
  }

  async setSleep(min) { await this.t.write(CMD.SETTING, 3, 0, [(min * 60) & 0xff, (min * 60) >> 8]); this.state.global.sleepMin = min; }
  async setDeepSleep(min) { await this.t.write(CMD.SETTING, 4, 0, [(min * 60) & 0xff, (min * 60) >> 8]); this.state.global.deepSleepMin = min; }
  async setSensorFlags(v) { await this.t.write(CMD.SETTING, 5, 0, [v]); this.state.global.sensorFlags = v; }
  async setLod(v) { await this.t.write(CMD.SETTING, 6, 0, [v]); this.state.global.lod = v; }
  async setDebounce(ms) { await this.t.write(CMD.INPUT, 2, 0, [ms]); this.state.global.debounce = ms; }
  async setMoveWake(on) { await this.t.write(CMD.INPUT, 6, 0, [on ? 1 : 0]); this.state.global.moveWake = on ? 1 : 0; }

  // ---------- defaults / backup ----------
  async resetButtons() {
    for (let s = 0; s < DEFAULT_KEYS.length; s++) await this.setKey(s, DEFAULT_KEYS[s]);
    for (let i = 0; i < DEFAULT_WHEEL.length; i++) await this.setWheel(i, DEFAULT_WHEEL[i]);
  }

  async resetProfile() {
    const p = this.state.p;
    await this.resetButtons();
    const reset = CHIP_RESET[this.state.info.chip] || CHIP_RESET[8];
    Object.assign(p.dpi, { enabled: DEFAULTS.dpiEnabled.map(Boolean), current: 0, values: [...reset], colors: [...DEFAULTS.dpiColors] });
    await this.writeDpi();
    await this.writeDpiColors();
    await this.setRate(500);
    LED_MODES.forEach((m, i) => {
      const n = m.byte & 0x3f, d = DEFAULTS.led[i];
      if (p.led.records[n]) Object.assign(p.led.records[n], { speed: d.speed, direction: d.direction, brightness: d.brightness, mask: 0x7f, colors: [...d.colors] });
    });
    for (const n of Object.keys(p.led.records)) await this.writeLedRecord(+n);
    p.led.mode = LED_MODES[1].byte & 0x3f;
    await this.writeLedHeader();
  }

  exportProfile() {
    const p = this.state.p;
    return { app: 'aula-web', version: 1, chip: this.state.info.chip, profile: PROFILES[this.state.profile],
      rate: p.rate, dpi: p.dpi, keys: p.keys, wheel: p.wheel, led: p.led, macros: p.macros };
  }

  async importProfile(data) {
    if (data?.app !== 'aula-web') throw new Error('Not an AULA web backup file');
    const p = this.state.p;
    for (const [slot, m] of Object.entries(data.macros || {})) await this.writeMacro(+slot, m);
    for (let s = 0; s < 6; s++) if (data.keys?.[s]) await this.setKey(s, data.keys[s]);
    for (let i = 0; i < 2; i++) if (data.wheel?.[i]) await this.setWheel(i, data.wheel[i]);
    if (data.dpi) { p.dpi = { ...p.dpi, ...data.dpi }; await this.writeDpi(); await this.writeDpiColors(); }
    if (data.rate) await this.setRate(data.rate);
    if (data.led) {
      p.led = { ...p.led, ...data.led };
      for (const n of Object.keys(p.led.records)) await this.writeLedRecord(+n);
      await this.writeLedHeader();
    }
  }
}
