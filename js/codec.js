// Encoders/decoders for the AULA (YXT firmware) configuration protocol.
// Everything here was recovered from the vendor driver; see PROTOCOL.md.

// ---------- HID keyboard usages ----------
const KEY_NAMES = {
  0x04: 'A', 0x05: 'B', 0x06: 'C', 0x07: 'D', 0x08: 'E', 0x09: 'F', 0x0a: 'G', 0x0b: 'H', 0x0c: 'I',
  0x0d: 'J', 0x0e: 'K', 0x0f: 'L', 0x10: 'M', 0x11: 'N', 0x12: 'O', 0x13: 'P', 0x14: 'Q', 0x15: 'R',
  0x16: 'S', 0x17: 'T', 0x18: 'U', 0x19: 'V', 0x1a: 'W', 0x1b: 'X', 0x1c: 'Y', 0x1d: 'Z',
  0x1e: '1', 0x1f: '2', 0x20: '3', 0x21: '4', 0x22: '5', 0x23: '6', 0x24: '7', 0x25: '8', 0x26: '9', 0x27: '0',
  0x28: 'Enter', 0x29: 'Esc', 0x2a: 'Backspace', 0x2b: 'Tab', 0x2c: 'Space', 0x2d: '-', 0x2e: '=', 0x2f: '[',
  0x30: ']', 0x31: '\\', 0x33: ';', 0x34: "'", 0x35: '`', 0x36: ',', 0x37: '.', 0x38: '/', 0x39: 'Caps Lock',
  0x3a: 'F1', 0x3b: 'F2', 0x3c: 'F3', 0x3d: 'F4', 0x3e: 'F5', 0x3f: 'F6', 0x40: 'F7', 0x41: 'F8', 0x42: 'F9',
  0x43: 'F10', 0x44: 'F11', 0x45: 'F12', 0x46: 'Print Screen', 0x47: 'Scroll Lock', 0x48: 'Pause',
  0x49: 'Insert', 0x4a: 'Home', 0x4b: 'Page Up', 0x4c: 'Delete', 0x4d: 'End', 0x4e: 'Page Down',
  0x4f: '→', 0x50: '←', 0x51: '↓', 0x52: '↑', 0x53: 'Num Lock', 0x54: 'Num /', 0x55: 'Num *', 0x56: 'Num -',
  0x57: 'Num +', 0x58: 'Num Enter', 0x59: 'Num 1', 0x5a: 'Num 2', 0x5b: 'Num 3', 0x5c: 'Num 4', 0x5d: 'Num 5',
  0x5e: 'Num 6', 0x5f: 'Num 7', 0x60: 'Num 8', 0x61: 'Num 9', 0x62: 'Num 0', 0x63: 'Num .', 0x65: 'Menu',
  0x68: 'F13', 0x69: 'F14', 0x6a: 'F15', 0x6b: 'F16', 0x6c: 'F17', 0x6d: 'F18', 0x6e: 'F19', 0x6f: 'F20',
  0x70: 'F21', 0x71: 'F22', 0x72: 'F23', 0x73: 'F24',
  0xe0: 'Ctrl', 0xe1: 'Shift', 0xe2: 'Alt', 0xe3: 'Win', 0xe4: 'Right Ctrl', 0xe5: 'Right Shift',
  0xe6: 'Right Alt', 0xe7: 'Right Win',
};
export const keyName = (code) => KEY_NAMES[code] || `Key 0x${code.toString(16).padStart(2, '0')}`;
export const KEY_OPTIONS = Object.entries(KEY_NAMES).map(([c, n]) => ({ code: +c, name: n }));
export const isModifier = (code) => code >= 0xe0 && code <= 0xe7;

// KeyboardEvent.code -> HID usage (for recording macros and capturing keys)
const CODE_TO_HID = (() => {
  const m = {};
  for (let i = 0; i < 26; i++) m['Key' + String.fromCharCode(65 + i)] = 0x04 + i;
  for (let i = 1; i <= 9; i++) m['Digit' + i] = 0x1d + i;
  m.Digit0 = 0x27;
  for (let i = 1; i <= 12; i++) m['F' + i] = 0x39 + i;
  for (let i = 13; i <= 24; i++) m['F' + i] = 0x68 + (i - 13);
  Object.assign(m, {
    Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, Space: 0x2c, Minus: 0x2d, Equal: 0x2e,
    BracketLeft: 0x2f, BracketRight: 0x30, Backslash: 0x31, Semicolon: 0x33, Quote: 0x34, Backquote: 0x35,
    Comma: 0x36, Period: 0x37, Slash: 0x38, CapsLock: 0x39, PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48,
    Insert: 0x49, Home: 0x4a, PageUp: 0x4b, Delete: 0x4c, End: 0x4d, PageDown: 0x4e, ArrowRight: 0x4f,
    ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52, NumLock: 0x53, NumpadDivide: 0x54, NumpadMultiply: 0x55,
    NumpadSubtract: 0x56, NumpadAdd: 0x57, NumpadEnter: 0x58, Numpad1: 0x59, Numpad2: 0x5a, Numpad3: 0x5b,
    Numpad4: 0x5c, Numpad5: 0x5d, Numpad6: 0x5e, Numpad7: 0x5f, Numpad8: 0x60, Numpad9: 0x61, Numpad0: 0x62,
    NumpadDecimal: 0x63, ContextMenu: 0x65, ControlLeft: 0xe0, ShiftLeft: 0xe1, AltLeft: 0xe2, MetaLeft: 0xe3,
    ControlRight: 0xe4, ShiftRight: 0xe5, AltRight: 0xe6, MetaRight: 0xe7,
  });
  return m;
})();
export const hidFromEvent = (e) => CODE_TO_HID[e.code];

// ---------- mouse buttons ----------
// Bit masks used by button bindings, and pseudo-keycodes used inside macros.
export const MOUSE_BUTTONS = [
  { id: 'left', label: 'Left click', mask: 0x01, macro: 0xe8 },
  { id: 'right', label: 'Right click', mask: 0x02, macro: 0xe9 },
  { id: 'middle', label: 'Middle click', mask: 0x04, macro: 0xea },
  { id: 'back', label: 'Back', mask: 0x08, macro: 0xeb },
  { id: 'forward', label: 'Forward', mask: 0x10, macro: 0xec },
];
const MACRO_MOUSE = Object.fromEntries(MOUSE_BUTTONS.map((b) => [b.macro, b]));

// ---------- button actions (4-byte bindings) ----------
// Fixed actions. Keyboard keys ([2, usage]) and macros ([0x0A, mode, slot]) are built dynamically.
export const ACTION_GROUPS = [
  { group: 'Mouse', items: [
    ...MOUSE_BUTTONS.map((b) => ({ id: b.id, label: b.label, bytes: [1, b.mask, 0, 0] })),
  ] },
  { group: 'Scroll', items: [
    { id: 'wheel-up', label: 'Scroll up', bytes: [5, 0x01, 0, 0] },
    { id: 'wheel-down', label: 'Scroll down', bytes: [5, 0x81, 0, 0] },
    { id: 'wheel-left', label: 'Scroll left', bytes: [0x0b, 0x81, 0, 0] },
    { id: 'wheel-right', label: 'Scroll right', bytes: [0x0b, 0x01, 0, 0] },
  ] },
  { group: 'DPI', items: [
    { id: 'dpi-cycle', label: 'DPI cycle', bytes: [8, 3, 0, 0] },
    { id: 'dpi-up', label: 'DPI +', bytes: [8, 1, 0, 0] },
    { id: 'dpi-down', label: 'DPI −', bytes: [8, 2, 0, 0] },
    { id: 'rate-cycle', label: 'Polling rate cycle', bytes: [6, 3, 0, 0] },
  ] },
  { group: 'Profile', items: [
    { id: 'profile-cycle', label: 'Profile cycle', bytes: [9, 3, 0, 0] },
    { id: 'profile-next', label: 'Next profile', bytes: [9, 1, 0, 0] },
    { id: 'profile-prev', label: 'Previous profile', bytes: [9, 2, 0, 0] },
    { id: 'profile-1', label: 'Switch to Office', bytes: [9, 4, 0, 0] },
    { id: 'profile-2', label: 'Switch to Game I', bytes: [9, 4, 1, 0] },
    { id: 'profile-3', label: 'Switch to Game II', bytes: [9, 4, 2, 0] },
  ] },
  { group: 'Media', items: [
    { id: 'vol-up', label: 'Volume up', bytes: [4, 0xe9, 0x00, 0] },
    { id: 'vol-down', label: 'Volume down', bytes: [4, 0xea, 0x00, 0] },
    { id: 'mute', label: 'Mute', bytes: [4, 0xe2, 0x00, 0] },
    { id: 'play-pause', label: 'Play / pause', bytes: [4, 0xcd, 0x00, 0] },
    { id: 'next-track', label: 'Next track', bytes: [4, 0xb5, 0x00, 0] },
    { id: 'prev-track', label: 'Previous track', bytes: [4, 0xb6, 0x00, 0] },
    { id: 'stop', label: 'Stop', bytes: [4, 0xb7, 0x00, 0] },
    { id: 'player', label: 'Media player', bytes: [4, 0x83, 0x01, 0] },
    { id: 'mail', label: 'Mail', bytes: [4, 0x8a, 0x01, 0] },
    { id: 'calculator', label: 'Calculator', bytes: [4, 0x92, 0x01, 0] },
    { id: 'browser', label: 'Browser home', bytes: [4, 0x23, 0x02, 0] },
    { id: 'bright-up', label: 'Screen brightness +', bytes: [4, 0x6f, 0x00, 0] },
    { id: 'bright-down', label: 'Screen brightness −', bytes: [4, 0x70, 0x00, 0] },
  ] },
  { group: 'Lighting', items: [
    { id: 'led-cycle', label: 'Lighting mode cycle', bytes: [7, 1, 0, 0] },
    { id: 'led-toggle', label: 'Lighting on / off', bytes: [7, 4, 0, 0] },
  ] },
  { group: 'Other', items: [
    { id: 'disabled', label: 'Disabled', bytes: [0, 0, 0, 0] },
  ] },
];
export const FIXED_ACTIONS = ACTION_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })));

// Shortcuts are implemented as macros, exactly like the vendor app does.
const combo = (...codes) => ({
  repeat: 1, mode: 0,
  events: [...codes.map((code) => ({ kind: 'key', code, down: true, delay: 20 })),
    ...codes.slice().reverse().map((code) => ({ kind: 'key', code, down: false, delay: 20 }))],
});
export const SHORTCUTS = [
  { id: 'copy', label: 'Copy', macro: combo(0xe0, 0x06) },
  { id: 'paste', label: 'Paste', macro: combo(0xe0, 0x19) },
  { id: 'cut', label: 'Cut', macro: combo(0xe0, 0x1b) },
  { id: 'undo', label: 'Undo', macro: combo(0xe0, 0x1d) },
  { id: 'redo', label: 'Redo', macro: combo(0xe0, 0x1c) },
  { id: 'select-all', label: 'Select all', macro: combo(0xe0, 0x04) },
  { id: 'find', label: 'Find', macro: combo(0xe0, 0x09) },
  { id: 'close-window', label: 'Close window', macro: combo(0xe2, 0x3d) },
  { id: 'switch-window', label: 'Switch window', macro: combo(0xe2, 0x2b) },
  { id: 'show-desktop', label: 'Show desktop', macro: combo(0xe3, 0x07) },
  { id: 'file-explorer', label: 'File Explorer', macro: combo(0xe3, 0x08) },
  { id: 'lock', label: 'Lock PC', macro: combo(0xe3, 0x0f) },
  { id: 'task-manager', label: 'Task Manager', macro: combo(0xe0, 0xe1, 0x29) },
  { id: 'double-click', label: 'Double click', macro: {
    repeat: 1, mode: 0, events: [true, false, true, false].map((down) => ({ kind: 'mouse', code: 0xe8, down, delay: 10 })),
  } },
];
export const fireMacro = (delay) => ({
  repeat: 1, mode: 1, // mode 1 = repeat while the button is held
  events: [{ kind: 'mouse', code: 0xe8, down: true, delay: 10 + delay }, { kind: 'mouse', code: 0xe8, down: false, delay: 10 + delay }],
});

export const MACRO_MODES = [
  { id: 0, label: 'Play N times' },
  { id: 1, label: 'Repeat while held' },
  { id: 2, label: 'Toggle on / off' },
];

const same = (a, b) => a.length >= 2 && b.every((v, i) => (a[i] ?? 0) === v);

export function describeBinding(bytes, macro) {
  const [t, a, b] = bytes;
  const fixed = FIXED_ACTIONS.find((x) => {
    if (x.bytes[0] !== t) return false;
    if (t === 4) return x.bytes[1] === a && x.bytes[2] === b;
    if (t === 9 && a === 4) return x.bytes[1] === 4 && x.bytes[2] === b;
    return x.bytes[1] === a || t === 0;
  });
  if (fixed) return { kind: 'fixed', id: fixed.id, label: fixed.label, group: fixed.group };
  if (t === 2) return { kind: 'key', code: a, label: keyName(a), group: 'Keyboard' };
  if (t === 0x0a) return { kind: 'macro', mode: a, slot: b, label: macro ? describeMacro(macro, a) : 'Macro', group: 'Macro' };
  return { kind: 'raw', label: 'Custom ' + bytes.map((x) => x.toString(16).padStart(2, '0')).join(' '), group: 'Other' };
}

// Friendly names for macros the app itself writes (shortcuts, double click, fire).
export function describeMacro(macro, mode) {
  const ev = macro.events;
  const keys = ev.filter((e) => e.kind === 'key');
  if (mode === 1 && ev.length === 2 && ev.every((e) => e.kind === 'mouse' && e.code === 0xe8)) {
    return `Rapid fire (${Math.max(ev[0].delay - 10, 0)} ms)`;
  }
  if (ev.length === 4 && ev.every((e) => e.kind === 'mouse' && e.code === 0xe8)) return 'Double click';
  const sc = SHORTCUTS.find((s) => macrosEqual(s.macro, macro));
  if (sc) return sc.label;
  if (keys.length === ev.length && keys.length >= 2) {
    const half = keys.length / 2;
    const downs = keys.slice(0, half), ups = keys.slice(half);
    if (downs.every((e) => e.down) && ups.every((e) => !e.down)) return downs.map((e) => keyName(e.code)).join(' + ');
  }
  return `Macro · ${ev.length} events`;
}
const macrosEqual = (a, b) => a.events.length === b.events.length &&
  a.events.every((e, i) => e.kind === b.events[i].kind && e.code === b.events[i].code && e.down === b.events[i].down);

export function bindingForKey(code) { return [2, code, 0, 0]; }
export function bindingForMacro(slot, mode) { return [0x0a, mode, slot, 0]; }

// ---------- macros ----------
// Layout: [repeat u16 LE][byte length u16 LE] then events:
//  key / mouse  : [code, up<<7 | delay(0..127)]            or [code, up?FF:7F, FF, d24]      d24 = delay-127
//  wheel (0xFD) : [FD, delta, 0, delay(0..255)]             or [FD, delta, 0, FF, FF, d24]   d24 = delay-255
//  move  (0xFE) : [FE, delay(0..255), x16, y16]             or [FE, FF, x16, y16, FF, d24]  d24 = delay-255
export const MACRO_MAX_BYTES = 512;
const d24 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff];
const i16 = (v) => [v & 0xff, (v >> 8) & 0xff];

export function encodeMacro(macro) {
  const body = [];
  for (const e of macro.events) {
    const delay = Math.max(0, Math.min(0xffffff, Math.round(e.delay || 0)));
    if (e.kind === 'key' || e.kind === 'mouse') {
      if (delay < 0x80) body.push(e.code, (e.down ? 0 : 0x80) | delay);
      else body.push(e.code, e.down ? 0x7f : 0xff, 0xff, ...d24(delay - 0x7f));
    } else if (e.kind === 'wheel') {
      const delta = e.delta & 0xff;
      if (delay < 0x100) body.push(0xfd, delta, 0, delay);
      else body.push(0xfd, delta, 0, 0xff, 0xff, ...d24(delay - 0xff));
    } else if (e.kind === 'move') {
      if (delay < 0x100) body.push(0xfe, delay, ...i16(e.x), ...i16(e.y));
      else body.push(0xfe, 0xff, ...i16(e.x), ...i16(e.y), 0xff, ...d24(delay - 0xff));
    }
  }
  const repeat = Math.max(1, Math.min(0xffff, macro.repeat || 1));
  return Uint8Array.from([repeat & 0xff, repeat >> 8, body.length & 0xff, body.length >> 8, ...body]);
}

export function decodeMacro(bytes) {
  const repeat = bytes[0] | (bytes[1] << 8);
  const len = bytes[2] | (bytes[3] << 8);
  const end = Math.min(bytes.length, 4 + len);
  const events = [];
  const u24 = (o) => bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
  const s16 = (o) => { const v = bytes[o] | (bytes[o + 1] << 8); return v & 0x8000 ? v - 0x10000 : v; };
  let o = 4;
  while (o < end) {
    const c = bytes[o];
    if (c >= 0x04 && c <= 0xec) {
      const v = bytes[o + 1];
      let delay = v & 0x7f, size = 2;
      if (delay === 0x7f && bytes[o + 2] === 0xff && o + 6 <= end) { delay = 0x7f + u24(o + 3); size = 6; }
      events.push({ kind: MACRO_MOUSE[c] ? 'mouse' : 'key', code: c, down: !(v & 0x80), delay });
      o += size;
    } else if (c === 0xfd) {
      let delay = bytes[o + 3], size = 4;
      if (delay === 0xff && bytes[o + 4] === 0xff && o + 8 <= end) { delay = 0xff + u24(o + 5); size = 8; }
      const delta = bytes[o + 1] & 0x80 ? bytes[o + 1] - 0x100 : bytes[o + 1];
      events.push({ kind: 'wheel', delta, delay });
      o += size;
    } else if (c === 0xfe) {
      let delay = bytes[o + 1], size = 6;
      if (delay === 0xff && bytes[o + 6] === 0xff && o + 10 <= end) { delay = 0xff + u24(o + 7); size = 10; }
      events.push({ kind: 'move', x: s16(o + 2), y: s16(o + 4), delay });
      o += size;
    } else break;
  }
  return { repeat: repeat || 1, events };
}

export function describeEvent(e) {
  if (e.kind === 'key') return `${keyName(e.code)} ${e.down ? '↓' : '↑'}`;
  if (e.kind === 'mouse') return `${MACRO_MOUSE[e.code]?.label || 'Mouse'} ${e.down ? '↓' : '↑'}`;
  if (e.kind === 'wheel') return `Scroll ${e.delta > 0 ? 'up' : 'down'} ×${Math.abs(e.delta)}`;
  if (e.kind === 'move') return `Move ${e.x >= 0 ? '+' : ''}${e.x}, ${e.y >= 0 ? '+' : ''}${e.y}`;
  return '?';
}

// ---------- colours ----------
// The firmware stores colours as [G, R, B].
export const hexToGrb = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 8) & 0xff, (v >> 16) & 0xff, v & 0xff]; };
export const grbToHex = (g, r, b) => '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');

// ---------- polling rate ----------
// Most models store the report interval in ms; 8 kHz models (M400/M450) use 125 µs units.
export const RATES = [125, 250, 500, 1000];
export const rateToDevice = (hz) => 1000 / hz;
export const rateFromDevice = (v) => ({ 1: 1000, 2: 500, 4: 250, 8: 125 }[v] || null);
