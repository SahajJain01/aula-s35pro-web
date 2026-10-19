// Transport layer: 41-byte feature report 6 on the vendor collection (usage page 0xFF01).
//
// Request  (40 bytes after the report id): [0, 0, cmd, seq, sub, addrLo, addrHi, len, data...]
// Response (read cmds = write cmd | 0x80):  same header echoed, `len` bytes of data after it.

export const VENDOR_ID = 0xb6a4;
export const REPORT_ID = 6;
const PAYLOAD = 40;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// PIDs from the vendor device list. Odd PIDs are the 2.4 GHz receiver.
export const MODELS = {
  0x4000: { series: 'M100', link: 'Wired' }, 0x4001: { series: 'M100', link: '2.4 GHz' },
  0x4090: { series: 'M210', link: 'Wired' }, 0x4091: { series: 'M210', link: '2.4 GHz' },
  0x40a0: { series: 'M300', link: 'Wired' }, 0x40a1: { series: 'M300', link: '2.4 GHz' },
  0x40b0: { series: 'M400', link: 'Wired' }, 0x40b1: { series: 'M400', link: '2.4 GHz' },
};

class Queue {
  constructor() { this.tail = Promise.resolve(); }
  run(fn) { const p = this.tail.then(fn, fn); this.tail = p.catch(() => {}); return p; }
}

export class HidTransport {
  constructor(device) {
    this.device = device;
    this.seq = 0;
    this.queue = new Queue();
    this.name = device.productName || 'AULA mouse';
    this.productId = device.productId;
  }

  static supported() { return typeof navigator !== 'undefined' && 'hid' in navigator; }

  static async request() {
    const filters = [{ vendorId: VENDOR_ID, usagePage: 0xff01 }, { vendorId: VENDOR_ID, usagePage: 0xff00 }];
    const picked = await navigator.hid.requestDevice({ filters });
    return HidTransport.pick(picked);
  }

  static async reconnect() {
    if (!HidTransport.supported()) return null;
    const devices = await navigator.hid.getDevices();
    return HidTransport.pick(devices.filter((d) => d.vendorId === VENDOR_ID));
  }

  static pick(devices) {
    const hasCfg = (d) => d.collections.some((c) => c.featureReports?.some((r) => r.reportId === REPORT_ID));
    const dev = devices.find(hasCfg) || devices[0];
    return dev ? new HidTransport(dev) : null;
  }

  async open() {
    if (!this.device.opened) await this.device.open();
    // Status reports (id 5) come from the 0xFF00 collection. Chrome normally groups it with the
    // config collection; if it shows up as a separate, already-permitted device, listen there too.
    const hasStatus = (d) => d.collections.some((c) => c.inputReports?.some((r) => r.reportId === 5));
    if (!hasStatus(this.device)) {
      const sibling = (await navigator.hid.getDevices()).find((d) => d !== this.device && d.productId === this.device.productId && hasStatus(d));
      if (sibling) { try { if (!sibling.opened) await sibling.open(); this.statusDevice = sibling; } catch { /* optional */ } }
    }
  }

  async close() {
    for (const d of [this.device, this.statusDevice]) {
      try { if (d?.opened) await d.close(); } catch { /* already gone */ }
    }
  }

  onInput(cb) {
    for (const d of [this.device, this.statusDevice].filter(Boolean)) {
      d.addEventListener('inputreport', (e) => cb(e.reportId, new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength)));
    }
  }

  packet(cmd, sub, addr, data) {
    this.seq = (this.seq + 1) & 0xff;
    const p = new Uint8Array(PAYLOAD);
    p.set([0, 0, cmd, this.seq, sub, addr & 0xff, (addr >> 8) & 0xff, data.length]);
    p.set(data.slice(0, PAYLOAD - 8), 8);
    return p;
  }

  async rawRead(cmd, sub, addr, len) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const p = this.packet(cmd, sub, addr, new Uint8Array(0));
      p[7] = len;
      await this.device.sendFeatureReport(REPORT_ID, p);
      await sleep(12 + attempt * 20);
      const dv = await this.device.receiveFeatureReport(REPORT_ID);
      let r = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
      if (r.length > PAYLOAD) r = r.subarray(r.length - PAYLOAD); // strip the report id byte
      if (r[2] === cmd && r[3] === p[3] && r[7] > 0) return r.slice(8, 8 + Math.min(r[7], len));
    }
    throw new Error(`No response to command 0x${cmd.toString(16)}`);
  }

  async rawWrite(cmd, sub, addr, data) {
    await this.device.sendFeatureReport(REPORT_ID, this.packet(cmd, sub, addr, Uint8Array.from(data)));
    await sleep(30);
  }

  read(cmd, sub = 0, addr = 0, len = 1) { return this.queue.run(() => this.rawRead(cmd, sub, addr, len)); }
  write(cmd, sub = 0, addr = 0, data = []) { return this.queue.run(() => this.rawWrite(cmd, sub, addr, data)); }
}

// In-memory device used by demo mode. Seeded from a real S35 PRO dump.
export class MockTransport {
  constructor() {
    this.name = 'AULA S35 PRO (demo)';
    this.productId = 0x4091;
    this.demo = true;
    const hex = (s) => Uint8Array.from(s.trim().split(/\s+/).map((x) => parseInt(x, 16)));
    this.profile = 0;
    this.global = { 3: [0x3c, 0x00], 4: [0x58, 0x02], 5: [0x00], 6: [0x00], 7: [0x00] };
    this.a = { 2: [0x08], 6: [0x00] };
    const led = new Uint8Array(250);
    led.set([0x81, 0xff, 0x01], 0);
    const pink = [0x05, 0xff, 0xb8];
    const recs = {
      1: [5, 0, 0, 0x7f], 2: [5, 0, 2, 0x7f], 3: [4, 0, 0, 0], 4: [5, 0, 2, 0x7f], 5: [4, 0, 0, 0x7f],
      6: [3, 0, 0, 0x7f], 7: [4, 0, 0, 0], 8: [5, 0, 2, 0x7f],
    };
    const rainbow = hex('00 ff 00 ff 00 00 00 ff ff ff 00 00 80 80 ff 00 ff ff ff ff 00');
    for (const [k, r] of Object.entries(recs)) {
      led.set(r, k * 25);
      for (let i = 0; i < 7; i++) led.set(+k === 5 || +k === 6 ? rainbow.slice(i * 3, i * 3 + 3) : pink, k * 25 + 4 + i * 3);
    }
    const keys = new Uint8Array(64);
    keys.set(hex('01 01 00 00 01 04 00 00 01 02 00 00 01 08 00 00 01 10 00 00 08 03 00 00 07 01 00 00'));
    const base = {
      rate: [0x02],
      dpi: hex('3f 01 0d 00 1b 00 26 00 39 00 56 00 8f 00 2f 00 8f 00 00 00'),
      colors: hex('00 fc 00 f9 18 00 4c 01 ee ed ed 00 00 f9 dc ff 07 f6 00 92 ed 7e f4 00'),
      keys, scroll: hex('05 01 00 00 05 81 00 00'), led, macros: Array.from({ length: 16 }, () => new Uint8Array(512)),
    };
    this.profiles = [0, 1, 2].map(() => structuredClone(base));
  }

  static supported() { return true; }
  async open() {}
  async close() {}
  onInput(cb) { this.inputCb = cb; }

  get p() { return this.profiles[this.profile]; }

  async read(cmd, sub = 0, addr = 0, len = 1) {
    await sleep(4);
    const slice = (buf) => Uint8Array.from(buf.slice(addr, addr + len));
    switch (cmd) {
      case 0x81: return Uint8Array.from([1, 100, 8]);
      case 0x82: return sub === 2 ? Uint8Array.from([this.profile]) : Uint8Array.from(this.global[sub] || [0]);
      case 0x83: return Uint8Array.from(this.p.rate);
      case 0x84: return slice(this.p.keys);
      case 0x85: return slice(this.p.scroll);
      case 0x86: return Uint8Array.from(this.p.dpi);
      case 0x87: return Uint8Array.from(this.p.colors);
      case 0x88: return slice(this.p.macros[sub]);
      case 0x89: return slice(this.p.led);
      case 0x8a: return Uint8Array.from(this.a[sub] || [0]);
      case 0xf0: return new TextEncoder().encode(sub === 1 ? '2.3.0007' : 'E1021-250519');
      case 0xf1: return new TextEncoder().encode('2.3.0004');
      default: throw new Error('unsupported');
    }
  }

  async write(cmd, sub = 0, addr = 0, data = []) {
    await sleep(4);
    const put = (buf) => buf.set(data, addr);
    switch (cmd) {
      case 0x02: if (sub === 2) this.profile = data[0]; else this.global[sub] = [...data]; break;
      case 0x03: this.p.rate = [...data]; break;
      case 0x04: put(this.p.keys); break;
      case 0x05: put(this.p.scroll); break;
      case 0x06: this.p.dpi = Uint8Array.from(data); break;
      case 0x07: this.p.colors = Uint8Array.from(data); break;
      case 0x08: put(this.p.macros[sub]); break;
      case 0x09: put(this.p.led); break;
      case 0x0a: this.a[sub] = [...data]; break;
    }
  }
}
