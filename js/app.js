import { HidTransport, MockTransport } from './hid.js';
import { Mouse, BUTTONS, WHEEL, PROFILES } from './mouse.js';
import { LED_MODES } from './data.js';
import * as C from './codec.js';

// ---------- tiny DOM helpers ----------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false || k === 'value') continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (typeof v !== 'string' && k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  if (props && 'value' in props && props.value != null) el.value = props.value;
  return el;
}
const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const ICONS = {
  buttons: '<path d="M12 3a6 6 0 0 0-6 6v6a6 6 0 0 0 12 0V9a6 6 0 0 0-6-6Z"/><path d="M12 3v6M12 7v2"/>',
  dpi: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  lighting: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3Z"/>',
  macros: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  performance: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  device: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
const PAGES = [
  ['buttons', 'Buttons'], ['dpi', 'DPI'], ['lighting', 'Lighting'], ['macros', 'Macros'], ['performance', 'Performance'], ['device', 'Device'],
];

// ---------- app state ----------
const app = { mouse: null, page: store.get('aula.page', 'buttons'), live: { pressed: 0, online: 1 }, dpiSel: null, macroSel: null, recording: null };
const root = $('#app');
const S = () => app.mouse.state;

// ---------- feedback ----------
function toast(msg, err = false) {
  const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), err ? 5000 : 2200);
}
let busy = 0;
function setSaveState() {
  const el = $('#save-state');
  el.className = 'save-state ' + (busy ? 'busy' : 'ok');
  el.textContent = busy ? 'Saving…' : (app.mouse ? 'Saved to mouse' : '');
}
async function save(fn) {
  busy++; setSaveState();
  try { await fn(); } catch (e) { console.error(e); toast(e.message || 'Write failed', true); } finally { busy--; setSaveState(); }
}
const timers = {};
const later = (key, fn, ms = 300) => { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms); };

// ---------- connection ----------
function renderConnect({ error, loading } = {}) {
  $('#profiles').hidden = true;
  $('#btn-disconnect').hidden = true;
  $('#device-sub').textContent = 'Not connected';
  const supported = HidTransport.supported();
  const framed = window.top !== window.self;
  const blocked = supported && document.featurePolicy && !document.featurePolicy.allowsFeature('hid');
  root.replaceChildren(h('section', { class: 'connect' },
    h('div', { class: 'hero', html: heroSvg() }),
    h('h1', null, 'Configure your mouse'),
    h('p', null, 'Plug in your AULA S350 PRO (USB cable or the 2.4 GHz receiver) and connect. Every change is written straight to the mouse, so it works on any computer afterwards.'),
    loading ? h('div', { class: 'progress' }, h('i', { id: 'load-bar' })) : null,
    loading ? h('p', { id: 'load-text' }, 'Reading settings…') : null,
    !loading && h('div', { class: 'actions' },
      h('button', { class: 'btn primary lg', disabled: !supported || blocked, onclick: () => connect() }, 'Connect mouse'),
      h('button', { class: 'btn lg', onclick: () => start(new MockTransport()) }, 'Try the demo')),
    error ? h('div', { class: 'alert err' }, error) : null,
    !supported ? h('div', { class: 'alert' }, 'This browser can’t talk to USB devices. Open this page in Chrome, Edge or Opera on a desktop computer (WebHID).') : null,
    blocked ? h('div', { class: 'alert' }, 'USB access is blocked inside this embedded view. ',
      h('a', { href: location.href, target: '_blank', rel: 'noopener' }, 'Open the app in its own tab'), ' to connect your mouse.') : null,
    !loading && !framed && supported ? h('p', { class: 'note' }, 'In the browser prompt, choose the entry named “2.4G Gaming Mouse” or “USB Gaming Mouse”. Close the AULA desktop driver first so the two don’t fight over the mouse.') : null,
  ));
}

function heroSvg() {
  return `<svg viewBox="0 0 120 160" fill="none"><rect x="14" y="6" width="92" height="148" rx="46" fill="var(--surface)" stroke="var(--border)" stroke-width="2"/>
  <path d="M60 6v52" stroke="var(--border)" stroke-width="2"/><rect x="54" y="22" width="12" height="26" rx="6" fill="var(--accent)"/>
  <path d="M14 70h92" stroke="var(--border)" stroke-width="2"/><circle cx="60" cy="112" r="4" fill="var(--accent)" opacity=".5"/></svg>`;
}

async function connect() {
  try {
    const t = await HidTransport.request();
    if (t) await start(t);
  } catch (e) {
    if (e.name !== 'NotFoundError') renderConnect({ error: e.message });
  }
}

async function start(transport) {
  renderConnect({ loading: true });
  try {
    await transport.open();
    const mouse = new Mouse(transport);
    await mouse.load((f) => { const b = $('#load-bar'); if (b) b.style.width = Math.round(f * 100) + '%'; });
    app.mouse = mouse;
    transport.onInput(onInputReport);
    renderShell();
  } catch (e) {
    console.error(e);
    await transport.close();
    const wireless = transport.productId & 1;
    renderConnect({ error: wireless
      ? 'The receiver is connected but the mouse didn’t answer. Make sure the mouse is switched to 2.4 GHz, click a button to wake it, then connect again.'
      : `Couldn’t read the mouse settings (${e.message}). Unplug and reconnect the mouse, then try again.` });
  }
}

async function disconnect() {
  const t = app.mouse?.t;
  app.mouse = null;
  await t?.close();
  renderConnect();
  setSaveState();
}

if (HidTransport.supported()) {
  navigator.hid.addEventListener('disconnect', (e) => {
    if (app.mouse && e.device === app.mouse.t.device) { toast('Mouse disconnected', true); disconnect(); }
  });
}

// Status report pushed by the mouse (report 5): [online, buttons lo, buttons hi, -, -, profile, rate, dpi stage, led mode]
function onInputReport(id, d) {
  if (id !== 5 || !app.mouse) return;
  const s = S();
  const pressed = d[1] | (d[2] << 8);
  if (pressed !== app.live.pressed) { app.live.pressed = pressed; highlightPressed(); }
  if (d[0] !== app.live.online) { app.live.online = d[0]; renderPage(); }
  if (d[0] && d[5] <= 2 && d[5] !== s.profile) {
    s.profile = d[5];
    save(async () => { await app.mouse.loadProfile(); renderShell(); });
    return;
  }
  const stage = d[7] - 1;
  if (d[0] && stage >= 0 && stage < 8 && s.p && stage !== s.p.dpi.current) {
    s.p.dpi.current = stage;
    updateLive();
    if (app.page === 'dpi') renderPage();
  }
}

// ---------- shell ----------
function renderShell() {
  const s = S();
  const t = app.mouse.t;
  $('#device-sub').textContent = [s.info.model.link, s.info.firmware && 'FW ' + s.info.firmware, t.demo && 'Demo'].filter(Boolean).join(' · ');
  $('#btn-disconnect').hidden = false;
  $('#btn-disconnect').onclick = disconnect;
  const prof = $('#profiles');
  prof.hidden = false;
  prof.replaceChildren(h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Profile' },
    PROFILES.map((name, i) => h('button', {
      class: i === s.profile ? 'on' : '', role: 'tab', 'aria-selected': String(i === s.profile),
      onclick: () => i !== s.profile && save(async () => { await app.mouse.setProfile(i); renderShell(); toast(`Switched to ${name}`); }),
    }, name))));
  root.replaceChildren(h('div', { class: 'shell' },
    h('nav', { class: 'nav', 'aria-label': 'Sections' },
      PAGES.map(([id, label]) => h('button', { class: id === app.page ? 'on' : '', 'data-page': id, onclick: () => go(id), html: icon(id) + `<span>${label}</span>` })),
      h('div', { class: 'live', id: 'live' })),
    h('section', { class: 'page', id: 'page' })));
  updateLive();
  renderPage();
  setSaveState();
}

function go(id) {
  app.page = id; store.set('aula.page', id);
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('on', b.dataset.page === id));
  renderPage();
}

function updateLive() {
  const el = $('#live');
  if (!el) return;
  const s = S(), d = s.p.dpi;
  el.replaceChildren(
    h('div', null, 'DPI ', h('b', null, d.values[d.current]), ` · stage ${d.current + 1}`),
    h('div', null, 'Polling ', h('b', null, (s.p.rate || '?') + ' Hz')),
    s.info.model.link !== 'Wired' && s.info.battery <= 100 ? h('div', null, 'Battery ', h('b', null, s.info.battery + '%')) : null,
  );
}

function renderPage() {
  const page = $('#page');
  if (!page || !app.mouse) return;
  const render = { buttons: pageButtons, dpi: pageDpi, lighting: pageLighting, macros: pageMacros, performance: pagePerformance, device: pageDevice }[app.page] || pageButtons;
  const banner = !app.live.online
    ? h('div', { class: 'alert' }, 'The mouse is asleep or out of range. Move or click it to wake it — changes can’t be saved until it answers.')
    : null;
  page.replaceChildren(...[banner, ...[].concat(render())].filter(Boolean));
}

function head(title, sub, ...extra) {
  return h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), sub && h('p', null, sub)), ...extra);
}

function setting(label, desc, control) {
  return h('div', { class: 'setting' }, h('div', { class: 'label' }, h('b', null, label), desc && h('span', null, desc)), control);
}

function toggle(checked, onchange, label) {
  return h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked, 'aria-label': label, onchange: (e) => onchange(e.target.checked) }), h('span'));
}

function seg(options, value, onpick, label) {
  return h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
    options.map(([v, text]) => h('button', { class: v === value ? 'on' : '', role: 'radio', 'aria-checked': String(v === value), onclick: () => v !== value && onpick(v) }, text)));
}

function slider({ min, max, step = 1, value, unit = '', onInput, onCommit, label }) {
  const out = h('output', null, value + unit);
  const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label,
    oninput: (e) => { out.textContent = e.target.value + unit; onInput?.(+e.target.value); },
    onchange: (e) => onCommit(+e.target.value) });
  return h('div', { class: 'slider-row' }, input, out);
}

// ---------- Buttons ----------
function bindingInfo(bytes) {
  const macro = bytes[0] === 0x0a ? S().p.macros[bytes[2]] : null;
  const info = C.describeBinding(bytes, macro);
  if (macro) {
    const sig = (m) => JSON.stringify(m.events.map((e) => [e.kind, e.code, e.down, e.delta, e.x, e.y, e.delay]));
    const named = macroLib().find((m) => sig(m) === sig(macro));
    if (named) info.label = named.name || info.label;
  }
  return info;
}

function mouseFigure() {
  const wrap = h('div', { class: 'mouse-figure', html: `
  <svg viewBox="0 0 220 330" aria-label="Mouse button map">
    <path class="body" d="M110 8C52 8 22 52 22 122v88c0 66 38 112 88 112s88-46 88-112v-88C198 52 168 8 110 8Z"/>
    <path class="part" data-slot="0" d="M106 12C56 15 28 56 26 120l80 2Z"/>
    <path class="part" data-slot="2" d="M114 12c50 3 78 44 80 108l-80 2Z"/>
    <rect class="part" data-slot="1" x="99" y="34" width="22" height="46" rx="11"/>
    <rect class="part" data-slot="5" x="101" y="92" width="18" height="22" rx="6"/>
    <rect class="part" data-slot="4" x="10" y="132" width="16" height="40" rx="7"/>
    <rect class="part" data-slot="3" x="10" y="178" width="16" height="40" rx="7"/>
    <text class="tag" x="62" y="80">1</text><text class="tag" x="152" y="80">2</text><text class="tag" x="128" y="62">3</text>
    <text class="tag" x="126" y="108">6</text><text class="tag" x="34" y="157">4</text><text class="tag" x="34" y="203">5</text>
  </svg>` });
  wrap.querySelectorAll('[data-slot]').forEach((el) => {
    const slot = +el.dataset.slot;
    el.addEventListener('click', () => pickForButton(slot));
    el.addEventListener('mouseenter', () => document.querySelectorAll(`[data-slot="${slot}"]`).forEach((x) => x.classList.add('hl')));
    el.addEventListener('mouseleave', () => document.querySelectorAll(`[data-slot="${slot}"]`).forEach((x) => x.classList.remove('hl')));
  });
  return wrap;
}

function highlightPressed() {
  document.querySelectorAll('[data-slot]').forEach((el) => el.classList.toggle('pressed', !!(app.live.pressed & (1 << +el.dataset.slot))));
}

function pageButtons() {
  const p = S().p;
  const row = (num, name, bytes, onclick, slot) => {
    const info = bindingInfo(bytes);
    return h('button', { class: 'bind', 'data-slot': slot, onclick,
      onmouseenter: () => slot != null && document.querySelectorAll(`[data-slot="${slot}"]`).forEach((x) => x.classList.add('hl')),
      onmouseleave: () => slot != null && document.querySelectorAll(`[data-slot="${slot}"]`).forEach((x) => x.classList.remove('hl')) },
      h('span', { class: 'num' }, num), h('span', { class: 'bind-name' }, name),
      h('span', { class: 'bind-value' }, info.label, info.kind === 'macro' && info.mode ? h('small', null, C.MACRO_MODES[info.mode]?.label || '') : null),
      h('span', { class: 'chev' }, '›'));
  };
  const list = h('div', { class: 'card bind-list' },
    BUTTONS.map((b, i) => row(i + 1, b.label, p.keys[b.slot], () => pickForButton(b.slot), b.slot)),
    WHEEL.map((w) => row('⇕', w.label, p.wheel[w.idx], () => pickForWheel(w.idx))));
  const page = [
    head('Buttons', 'Click a button to change what it does. Press a physical button to see it light up.'),
    h('div', { class: 'buttons-layout' }, h('div', { class: 'card' }, mouseFigure()), list),
  ];
  queueMicrotask(highlightPressed);
  return page;
}

function leftClickGuard(slot, bytes) {
  const keys = S().p.keys;
  const isLeft = (b) => b[0] === 1 && b[1] === 1;
  if (!isLeft(keys[slot]) || isLeft(bytes)) return true;
  const others = BUTTONS.some((b) => b.slot !== slot && isLeft(keys[b.slot]));
  if (!others) toast('At least one button has to stay “Left click”.', true);
  return others;
}

function pickForButton(slot) {
  const b = BUTTONS.find((x) => x.slot === slot);
  openPicker({
    title: b.label, current: S().p.keys[slot], allowMacros: true,
    apply: async (choice) => {
      if (choice.bytes) {
        if (!leftClickGuard(slot, choice.bytes)) return false;
        await app.mouse.setKey(slot, choice.bytes);
      } else if (choice.macro) {
        if (!leftClickGuard(slot, [0x0a])) return false;
        await app.mouse.assignMacro(slot, choice.macro, choice.mode ?? choice.macro.mode ?? 0);
      }
      return true;
    },
  });
}

function pickForWheel(idx) {
  openPicker({
    title: WHEEL[idx].label, current: S().p.wheel[idx], allowMacros: false,
    apply: async (choice) => { if (!choice.bytes) return false; await app.mouse.setWheel(idx, choice.bytes); return true; },
  });
}

function closeModal() { $('#modal').replaceChildren(); document.removeEventListener('keydown', escClose); }
function escClose(e) { if (e.key === 'Escape' && !e.defaultPrevented) closeModal(); }

function openPicker({ title, current, allowMacros, apply }) {
  const info = bindingInfo(current);
  const cats = ['Mouse', 'Keyboard', ...(allowMacros ? ['Shortcuts', 'Macro'] : []), 'Media', 'DPI', 'Profile', 'Scroll', 'Lighting', 'Other'];
  let cat = cats.includes(info.group) ? info.group : 'Mouse';
  if (info.kind === 'macro') cat = 'Macro';
  let pending = null;
  const body = h('div', { class: 'choices' });
  const catList = h('div', { class: 'cats' });
  const applyBtn = h('button', { class: 'btn primary', disabled: true, onclick: () => commit(pending) }, 'Apply');

  async function commit(choice) {
    if (!choice) return;
    applyBtn.disabled = true;
    let ok = false;
    await save(async () => { ok = await apply(choice); });
    if (ok) { closeModal(); renderPage(); }
    else applyBtn.disabled = false;
  }
  const quick = (choice) => commit(choice);

  function renderCats() {
    catList.replaceChildren(...cats.map((c) => h('button', { class: c === cat ? 'on' : '', onclick: () => { cat = c; pending = null; applyBtn.disabled = true; renderCats(); renderBody(); } }, c)));
  }

  function renderBody() {
    body.replaceChildren();
    if (cat === 'Keyboard') return body.append(...keyboardChooser(allowMacros, (choice) => { pending = choice; applyBtn.disabled = !choice; }));
    if (cat === 'Shortcuts') return body.append(...shortcutChooser(quick));
    if (cat === 'Macro') return body.append(...macroChooser(current, (choice) => { pending = choice; applyBtn.disabled = !choice; }));
    const group = C.ACTION_GROUPS.find((g) => g.group === cat);
    body.append(...group.items.map((a) => h('button', { class: 'choice' + (info.id === a.id ? ' on' : ''), onclick: () => quick({ bytes: a.bytes }) }, a.label)));
  }

  renderCats(); renderBody();
  $('#modal').replaceChildren(h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h3', null, title), h('span', { style: { color: 'var(--muted)' } }, 'Now: ' + info.label),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: closeModal }, '✕')),
    h('div', { class: 'modal-body' }, catList, body),
    h('div', { class: 'modal-foot' }, h('button', { class: 'btn', onclick: closeModal }, 'Cancel'), applyBtn)));
  $('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
  document.addEventListener('keydown', escClose);
}

function keyboardChooser(allowCombos, onChange) {
  let held = [];
  const combo = h('div', { class: 'combo' }, 'Press a key');
  const help = h('div', null, allowCombos ? 'Combinations like Ctrl + C work too.' : 'Single keys only for the scroll wheel.');
  const show = () => { combo.textContent = held.length ? held.map(C.keyName).join(' + ') : 'Press a key'; };
  const choose = (codes) => {
    if (!codes.length) return onChange(null);
    if (codes.length === 1) return onChange({ bytes: C.bindingForKey(codes[0]) });
    onChange({ macro: { repeat: 1, mode: 0, events: [
      ...codes.map((code) => ({ kind: 'key', code, down: true, delay: 20 })),
      ...codes.slice().reverse().map((code) => ({ kind: 'key', code, down: false, delay: 20 })) ] } });
  };
  const box = h('div', { class: 'keycap-capture', tabindex: '0',
    onkeydown: (e) => {
      if (e.key === 'Escape' && !held.length) return; // let Escape close the dialog
      e.preventDefault(); e.stopPropagation();
      const code = C.hidFromEvent(e);
      if (!code || e.repeat) return;
      const mods = [e.ctrlKey && 0xe0, e.shiftKey && 0xe1, e.altKey && 0xe2, e.metaKey && 0xe3].filter(Boolean);
      held = C.isModifier(code) || !allowCombos ? [code] : [...mods, code];
      show(); choose(held);
    },
  }, combo, help);
  const select = h('select', { 'aria-label': 'Pick a key from the list', onchange: (e) => { held = [+e.target.value]; show(); choose(held); } },
    h('option', { value: '' }, 'Or pick a key from the list…'), C.KEY_OPTIONS.map((k) => h('option', { value: k.code }, k.name)));
  queueMicrotask(() => box.focus());
  return [box, h('div', { class: 'full' }, select)];
}

function shortcutChooser(pick) {
  let fire = store.get('aula.fire', 50);
  const fireRow = h('div', { class: 'full card', style: { padding: '12px' } },
    h('div', { class: 'row', style: { justifyContent: 'space-between', flexWrap: 'wrap' } },
      h('div', null, h('b', null, 'Rapid fire'), h('div', { class: 'hint', style: { margin: 0 } }, 'Clicks repeatedly while the button is held.')),
      h('button', { class: 'btn sm primary', onclick: () => { store.set('aula.fire', fire); pick({ macro: C.fireMacro(fire), mode: 1 }); } }, 'Use rapid fire')),
    h('div', { style: { marginTop: '8px' } }, slider({ min: 8, max: 300, value: fire, unit: ' ms', label: 'Click interval', onInput: (v) => { fire = v; }, onCommit: (v) => { fire = v; } })));
  return [...C.SHORTCUTS.map((s) => h('button', { class: 'choice', onclick: () => pick({ macro: s.macro, mode: 0 }) }, s.label)), fireRow];
}

function macroChooser(current, onChange) {
  const lib = store.get('aula.macros', []);
  let sel = null, mode = current[0] === 0x0a ? current[1] : 0;
  if (!lib.length) {
    return [h('div', { class: 'full hint' }, 'You haven’t made any macros yet. ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); closeModal(); go('macros'); } }, 'Open the Macros tab'), ' to record one.')];
  }
  const update = () => onChange(sel ? { macro: sel, mode } : null);
  const items = lib.map((m) => h('button', { class: 'choice', onclick: (e) => {
    sel = m; e.currentTarget.parentElement.querySelectorAll('.choice').forEach((x) => x.classList.remove('on'));
    e.currentTarget.classList.add('on'); update();
  } }, m.name || 'Untitled macro'));
  const modeHost = h('div');
  const drawMode = () => modeHost.replaceChildren(seg(C.MACRO_MODES.map((x) => [x.id, x.label]), mode, (v) => { mode = v; update(); drawMode(); }, 'Playback mode'));
  drawMode();
  return [...items, h('div', { class: 'full', style: { marginTop: '6px' } }, h('div', { class: 'hint' }, 'Playback'), modeHost)];
}

// ---------- DPI ----------
function pageDpi() {
  const s = S(), d = s.p.dpi, chip = app.mouse.chip;
  const minDpi = chip.table[0][0];
  if (app.dpiSel == null || app.dpiSel > 7) app.dpiSel = d.current;
  const i = app.dpiSel;
  const write = () => later('dpi', () => save(async () => { await app.mouse.writeDpi(); updateLive(); }));
  const writeColors = () => later('dpic', () => save(() => app.mouse.writeDpiColors()), 200);

  const stages = h('div', { class: 'stages' }, d.values.map((v, k) => h('button', {
    class: 'stage' + (k === i ? ' sel' : '') + (d.enabled[k] ? '' : ' off'), onclick: () => { app.dpiSel = k; renderPage(); },
    'aria-label': `Stage ${k + 1}: ${v} DPI${d.enabled[k] ? '' : ' (off)'}`,
  }, k === d.current ? h('span', { class: 'active-badge' }, 'Active') : null,
  h('span', { class: 'dot', style: { background: d.colors[k], color: d.colors[k] } }),
  h('span', { class: 'val' }, v), h('span', { class: 'idx' }, `Stage ${k + 1}`))));

  const big = h('span', null, d.values[i]);
  const num = h('input', { type: 'number', min: minDpi, max: chip.max, step: chip.step, value: d.values[i], style: { width: '96px' }, 'aria-label': 'DPI value',
    onchange: (e) => setVal(+e.target.value) });
  const range = h('input', { type: 'range', min: minDpi, max: chip.max, step: chip.step, value: d.values[i], 'aria-label': 'DPI',
    oninput: (e) => { big.textContent = e.target.value; num.value = e.target.value; },
    onchange: (e) => setVal(+e.target.value) });
  function setVal(v) {
    v = clamp(Math.round(v / chip.step) * chip.step, minDpi, chip.max);
    d.values[i] = app.mouse.dpiFromReg(app.mouse.regFromDpi(v));
    write(); renderPage();
  }
  const presets = [400, 800, 1200, 1600, 2400, 3200, 6400, 12000, 16000, 26000].filter((v) => v >= minDpi && v <= chip.max);
  const enabledCount = d.enabled.filter(Boolean).length;

  return [
    head('DPI', `Up to 8 sensitivity stages. The DPI button cycles through the enabled ones.`),
    h('div', { class: 'card' }, stages),
    h('div', { class: 'card' }, h('div', { class: 'dpi-editor' },
      h('div', { class: 'dpi-big' }, big, h('small', null, `DPI · stage ${i + 1}`)),
      h('div', { class: 'controls' },
        h('label', { class: 'swatch', title: 'Stage colour' }, h('input', { type: 'color', value: d.colors[i], 'aria-label': 'Stage colour',
          oninput: (e) => { d.colors[i] = e.target.value; writeColors(); }, onchange: () => renderPage() })),
        num,
        h('label', { class: 'row', style: { gap: '8px', color: 'var(--muted)' } }, 'On',
          toggle(d.enabled[i], (on) => {
            if (!on && enabledCount <= 1) { toast('At least one stage has to stay on.', true); return renderPage(); }
            d.enabled[i] = on; write(); renderPage();
          }, 'Stage enabled')),
        h('button', { class: 'btn primary', disabled: i === d.current || !d.enabled[i], onclick: () => { d.current = i; write(); renderPage(); updateLive(); } },
          i === d.current ? 'Active stage' : 'Make active')),
      h('div', { class: 'range' }, range, h('div', { class: 'ticks' }, h('span', null, minDpi), h('span', null, chip.max))),
      h('div', { class: 'presets', style: { gridColumn: '1 / -1' } }, presets.map((v) => h('button', { class: 'btn sm' + (v === d.values[i] ? ' primary' : ''), onclick: () => setVal(v) }, v))),
    )),
    h('p', { class: 'hint', style: { margin: 0 } }, `Sensor ${chip.sensor} · ${minDpi}–${chip.max} DPI in steps of ${chip.step}.`),
  ];
}

// ---------- Lighting ----------
const PREVIEW = ['constant', 'flow', 'mono', 'dpibreath', 'breath', 'enraptured', 'neon', 'ambi', 'off'];
function pageLighting() {
  const led = S().p.led;
  const current = LED_MODES.find((m) => (m.byte & 0x3f) === led.mode) || LED_MODES[0];
  const n = current.byte & 0x3f;
  const rec = led.records[n];
  const writeRec = () => later('led' + n, () => save(() => app.mouse.writeLedRecord(n)), 200);

  const modes = h('div', { class: 'modes' }, LED_MODES.map((m) => {
    const r = led.records[m.byte & 0x3f];
    return h('button', { class: 'mode' + (m === current ? ' on' : ''), onclick: () => {
      led.mode = m.byte & 0x3f;
      save(async () => { await app.mouse.writeLedHeader(); if (r) await app.mouse.writeLedRecord(m.byte & 0x3f); });
      renderPage();
    } }, h('div', { class: 'pv ' + PREVIEW[m.index], style: { '--c0': r?.colors[0] } }), m.name);
  }));

  const controls = [];
  if (rec && current.brightness) {
    controls.push(setting('Brightness', null, slider({ min: 1, max: 6, value: rec.brightness, label: 'Brightness', onCommit: (v) => { rec.brightness = v; writeRec(); } })));
  }
  if (rec && current.speed) {
    controls.push(setting('Speed', null, slider({ min: 1, max: 7, value: rec.speed, label: 'Speed', onCommit: (v) => { rec.speed = v; writeRec(); } })));
  }
  if (rec && current.directions.length) {
    const names = ['Reverse', 'Forward', 'Both ways', 'Converge'];
    controls.push(setting('Direction', null, seg(current.directions.map((v) => [v, names[v]]), rec.direction, (v) => { rec.direction = v; writeRec(); renderPage(); }, 'Direction')));
  }
  if (rec && current.colors) {
    controls.push(h('div', { class: 'setting' }, h('div', { class: 'label' }, h('b', null, 'Colours'), h('span', null, 'Untick a colour to leave it out of the cycle.')),
      h('div', { class: 'colors' }, rec.colors.map((c, k) => {
        const on = !!(rec.mask & (1 << k));
        return h('div', { class: 'color-item' },
          h('label', { class: 'swatch' + (on ? '' : ' off'), title: `Colour ${k + 1}` }, h('input', { type: 'color', value: c, 'aria-label': `Colour ${k + 1}`,
            oninput: (e) => { rec.colors[k] = e.target.value; writeRec(); } })),
          current.colorToggles ? h('label', null, h('input', { type: 'checkbox', checked: on, onchange: (e) => {
            const mask = e.target.checked ? rec.mask | (1 << k) : rec.mask & ~(1 << k);
            if (!mask) { toast('Keep at least one colour.', true); return renderPage(); }
            rec.mask = mask; writeRec(); renderPage();
          } }), k + 1) : null);
      }))));
  }
  if (!controls.length) controls.push(h('p', { class: 'hint', style: { margin: 0 } }, current.index === 8 ? 'Lights are off.' : 'This effect has no extra options.'));

  return [
    head('Lighting', 'Pick an effect, then fine-tune it. Settings are saved per profile.'),
    h('div', { class: 'card' }, modes),
    h('div', { class: 'card' }, h('h2', null, current.name), ...controls),
    h('div', { class: 'card' }, setting('Power saving', 'Turn the lights off while the mouse is moving and back on when it rests.',
      toggle(led.savePower, (on) => { led.savePower = on; save(() => app.mouse.writeLedHeader()); }, 'Power saving'))),
  ];
}

// ---------- Macros ----------
function macroLib() { return store.get('aula.macros', []); }
function saveLib(lib) { store.set('aula.macros', lib); }

function pageMacros() {
  const lib = macroLib();
  if (app.macroSel && !lib.find((m) => m.id === app.macroSel)) app.macroSel = null;
  if (!app.macroSel && lib.length) app.macroSel = lib[0].id;
  const m = lib.find((x) => x.id === app.macroSel);
  const commit = (rerender = true) => { saveLib(lib); if (rerender) renderPage(); };

  const newMacro = () => {
    const nm = { id: crypto.randomUUID?.() || String(Date.now()), name: `Macro ${lib.length + 1}`, repeat: 1, events: [] };
    lib.push(nm); app.macroSel = nm.id; commit();
  };
  const side = h('div', { class: 'card macro-lib' },
    h('button', { class: 'btn primary', onclick: newMacro }, '+ New macro'),
    lib.length ? lib.map((x) => h('button', { class: 'item' + (x.id === app.macroSel ? ' on' : ''), onclick: () => { app.macroSel = x.id; stopRecording(); renderPage(); } },
      h('span', null, x.name || 'Untitled'), h('small', { style: { color: 'var(--faint)' } }, x.events.length)))
      : h('div', { class: 'empty' }, 'No macros yet. Record keystrokes and clicks, then bind them to any button.'));

  if (!m) return [head('Macros', 'Record keystrokes, clicks and delays, then bind them to a button.'), h('div', { class: 'macro-layout' }, side, h('div', { class: 'card' }, h('p', { class: 'hint' }, 'Create a macro to get started.')))];

  const size = C.encodeMacro(m).length;
  const events = h('div', { class: 'events' }, m.events.length ? m.events.map((e, k) => h('div', { class: 'event' + (e.down ? ' down' : '') },
    h('span', { class: 'ico' }, e.kind === 'key' ? (e.down ? '↓' : '↑') : e.kind === 'mouse' ? '◐' : e.kind === 'wheel' ? '⇕' : '✥'),
    h('span', null, C.describeEvent(e)),
    h('span', { class: 'delay' }, h('input', { type: 'number', min: 0, max: 60000, value: e.delay, 'aria-label': 'Delay after event (ms)',
      onchange: (ev) => { e.delay = clamp(+ev.target.value || 0, 0, 60000); commit(false); } }), 'ms'),
    h('button', { class: 'icon-btn', 'aria-label': 'Remove event', onclick: () => { m.events.splice(k, 1); commit(); } }, '✕')))
    : h('p', { class: 'hint', style: { margin: '8px 0' } }, 'No events yet — press Record, or add keys manually.'));

  const keySel = h('select', { 'aria-label': 'Key to add' }, C.KEY_OPTIONS.map((k) => h('option', { value: k.code }, k.name)));
  const btnSel = h('select', { 'aria-label': 'Mouse button to add' }, C.MOUSE_BUTTONS.map((b) => h('option', { value: b.macro }, b.label)));
  const add = (...evs) => { m.events.push(...evs); commit(); };
  const rec = app.recording?.id === m.id;

  const assignSlot = h('select', { 'aria-label': 'Button', value: 3 }, BUTTONS.map((b) => h('option', { value: b.slot }, b.label)));
  let mode = 0;
  const modeSeg = h('div');
  const drawMode = () => modeSeg.replaceChildren(seg(C.MACRO_MODES.map((x) => [x.id, x.label]), mode, (v) => { mode = v; drawMode(); }, 'Playback mode'));
  drawMode();

  return [
    head('Macros', 'Record keystrokes, clicks and delays, then bind them to a button. Your macro library is stored in this browser.'),
    h('div', { class: 'macro-layout' }, side, h('div', { class: 'page', style: { gap: '16px' } },
      h('div', { class: 'card', style: { display: 'grid', gap: '12px' } },
        h('div', { class: 'row', style: { flexWrap: 'wrap' } },
          h('input', { type: 'text', value: m.name, 'aria-label': 'Macro name', style: { flex: '1', minWidth: '160px', fontWeight: 600 }, oninput: (e) => { m.name = e.target.value; commit(false); }, onchange: () => renderPage() }),
          h('label', { class: 'row', style: { gap: '6px', color: 'var(--muted)' } }, 'Repeat', h('input', { type: 'number', min: 1, max: 999, value: m.repeat, style: { width: '72px' },
            onchange: (e) => { m.repeat = clamp(+e.target.value || 1, 1, 999); commit(false); } }), '×'),
          h('button', { class: 'btn ghost danger', onclick: () => { if (confirm(`Delete “${m.name}”?`)) { lib.splice(lib.indexOf(m), 1); commit(); } } }, 'Delete')),
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn' + (rec ? ' primary recording' : ''), onclick: () => (rec ? stopRecording() : startRecording(m, lib)) }, rec ? '■ Stop recording' : '● Record'),
          keySel, h('button', { class: 'btn sm', onclick: () => add({ kind: 'key', code: +keySel.value, down: true, delay: 20 }, { kind: 'key', code: +keySel.value, down: false, delay: 20 }) }, '+ Key'),
          btnSel, h('button', { class: 'btn sm', onclick: () => add({ kind: 'mouse', code: +btnSel.value, down: true, delay: 20 }, { kind: 'mouse', code: +btnSel.value, down: false, delay: 20 }) }, '+ Click'),
          h('button', { class: 'btn sm', onclick: () => add({ kind: 'wheel', delta: 1, delay: 20 }) }, '+ Scroll up'),
          h('button', { class: 'btn sm', onclick: () => add({ kind: 'wheel', delta: -1, delay: 20 }) }, '+ Scroll down'),
          m.events.length ? h('button', { class: 'btn sm ghost', onclick: () => { m.events = []; commit(); } }, 'Clear') : null),
        rec ? h('div', { class: 'record-pad', id: 'record-pad' }, 'Recording… type keys, or click / scroll inside this box. Delays are captured automatically.') : null,
        events,
        h('div', { class: 'meter' + (size > C.MACRO_MAX_BYTES ? ' over' : '') }, h('div', { class: 'bar' }, h('i', { style: { width: Math.min(100, size / C.MACRO_MAX_BYTES * 100) + '%' } })), `${size} / ${C.MACRO_MAX_BYTES} bytes on the mouse`)),
      h('div', { class: 'card' }, h('h2', null, 'Bind to a button'),
        h('p', { class: 'hint' }, 'The macro is copied into the mouse, so it keeps working without this app.'),
        h('div', { class: 'row', style: { flexWrap: 'wrap' } }, assignSlot, modeSeg,
          h('button', { class: 'btn primary', disabled: !m.events.length || size > C.MACRO_MAX_BYTES, onclick: () => {
            const slot = +assignSlot.value;
            if (!leftClickGuard(slot, [0x0a])) return;
            save(async () => { await app.mouse.assignMacro(slot, { repeat: m.repeat, events: m.events }, mode); toast(`“${m.name}” bound to ${BUTTONS.find((b) => b.slot === slot).label}`); });
          } }, 'Write to mouse'))),
    )),
  ];
}

function startRecording(m, lib) {
  stopRecording();
  let last = performance.now();
  const push = (ev) => {
    const now = performance.now();
    if (m.events.length) m.events[m.events.length - 1].delay = clamp(Math.round(now - last), 1, 60000);
    last = now;
    m.events.push({ ...ev, delay: 20 });
    saveLib(lib);
    const list = document.querySelector('.events');
    if (list) renderPage();
  };
  const onKey = (e) => {
    if (e.repeat || e.target.closest?.('input, select')) return;
    const code = C.hidFromEvent(e);
    if (!code) return;
    e.preventDefault();
    push({ kind: 'key', code, down: e.type === 'keydown' });
  };
  const pad = (e) => e.target.closest?.('#record-pad');
  const onMouse = (e) => {
    if (!pad(e)) return;
    e.preventDefault();
    const btn = [0xe8, 0xea, 0xe9, 0xeb, 0xec][e.button];
    if (btn) push({ kind: 'mouse', code: btn, down: e.type === 'mousedown' });
  };
  const onWheel = (e) => { if (!pad(e)) return; e.preventDefault(); push({ kind: 'wheel', delta: e.deltaY < 0 ? 1 : -1 }); };
  const onCtx = (e) => { if (pad(e)) e.preventDefault(); };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('mousedown', onMouse, true);
  window.addEventListener('mouseup', onMouse, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('contextmenu', onCtx, true);
  app.recording = { id: m.id, stop() {
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
    window.removeEventListener('mousedown', onMouse, true); window.removeEventListener('mouseup', onMouse, true);
    window.removeEventListener('wheel', onWheel, { capture: true }); window.removeEventListener('contextmenu', onCtx, true);
  } };
  renderPage();
}

function stopRecording() {
  if (!app.recording) return;
  app.recording.stop();
  app.recording = null;
  if (app.page === 'macros') renderPage();
}

// ---------- Performance ----------
function pagePerformance() {
  const s = S(), g = s.global, chip = s.info.chip;
  const flag = (bit, on) => { const v = on ? g.sensorFlags | bit : g.sensorFlags & ~bit; save(() => app.mouse.setSensorFlags(v)); };
  const lodMap = chip === 7 ? [2, 3] : chip === 6 || chip === 12 ? [0, 2] : null;
  const wireless = s.info.model.link !== 'Wired';

  return [
    head('Performance', 'Sensor and response settings.'),
    h('div', { class: 'card' },
      setting('Polling rate', 'How often the mouse reports to the computer. Higher is smoother but uses more battery.',
        seg(C.RATES.map((r) => [r, r + ' Hz']), s.p.rate, (v) => save(async () => { await app.mouse.setRate(v); updateLive(); renderPage(); }), 'Polling rate')),
      setting('Debounce time', 'Ignores switch bounce. Raise it if you get unwanted double clicks.',
        slider({ min: 1, max: 20, value: g.debounce || 8, unit: ' ms', label: 'Debounce', onCommit: (v) => save(() => app.mouse.setDebounce(v)) })),
    ),
    h('div', { class: 'card' }, h('h2', null, 'Sensor'),
      setting('Angle snapping', 'Straightens slightly wobbly horizontal and vertical movements.', toggle(!!(g.sensorFlags & 0x01), (on) => flag(0x01, on), 'Angle snapping')),
      chip === 12
        ? setting('Jitter correction', 'Suppresses cursor jitter at high DPI.', toggle(!!(g.sensorFlags & 0x02), (on) => flag(0x02, on), 'Jitter correction'))
        : setting('Ripple control', 'Smooths the ripple pattern that appears at very high DPI.', toggle(!!(g.sensorFlags & 0x02), (on) => flag(0x02, on), 'Ripple control')),
      setting('Motion smoothing', 'Trajectory optimisation for cleaner curves at high DPI.', toggle(!!(g.sensorFlags & 0x80), (on) => flag(0x80, on), 'Motion smoothing')),
      lodMap ? setting('Lift-off distance', 'How high the mouse can be lifted before tracking stops.',
        seg([[lodMap[0], '1 mm'], [lodMap[1], '2 mm']], g.lod === lodMap[1] ? lodMap[1] : lodMap[0], (v) => save(async () => { await app.mouse.setLod(v); renderPage(); }), 'Lift-off distance')) : null,
    ),
    h('div', { class: 'card' }, h('h2', null, 'Power'), wireless ? null : h('p', { class: 'hint' }, 'These apply when the mouse runs on its battery over 2.4 GHz.'),
      setting('Sleep after', 'Idle time before the mouse dims and naps.',
        slider({ min: 1, max: 30, value: g.sleepMin, unit: ' min', label: 'Sleep after', onCommit: (v) => save(() => app.mouse.setSleep(v)) })),
      setting('Deep sleep after', 'Idle time before the mouse powers down fully.',
        slider({ min: 1, max: 30, value: g.deepSleepMin, unit: ' min', label: 'Deep sleep after', onCommit: (v) => save(() => app.mouse.setDeepSleep(v)) })),
      setting('Wake on movement', 'Wake from deep sleep by moving the mouse instead of clicking.',
        toggle(!!g.moveWake, (on) => save(() => app.mouse.setMoveWake(on)), 'Wake on movement')),
    ),
  ];
}

// ---------- Device ----------
function pageDevice() {
  const s = S(), i = s.info, chip = app.mouse.chip;
  const items = [
    ['Model', 'AULA S350 PRO'], ['Connection', i.model.link], ['Firmware', i.firmware || '—'],
    i.receiver ? ['Receiver firmware', i.receiver] : null, ['Build', i.build || '—'], ['Sensor', chip.sensor],
    i.model.link !== 'Wired' && i.battery <= 100 ? ['Battery', i.battery + '%'] : null,
    s.global.chargeCount ? ['Charge cycles', s.global.chargeCount] : null,
  ].filter(Boolean);
  const theme = store.get('aula.theme', 'system');

  const exportCfg = () => {
    const blob = new Blob([JSON.stringify(app.mouse.exportProfile(), null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `aula-s350pro-${PROFILES[s.profile].replace(/\s/g, '').toLowerCase()}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importCfg = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    await save(async () => { await app.mouse.importProfile(JSON.parse(await f.text())); toast(`Imported into ${PROFILES[s.profile]}`); });
    renderShell();
  } });

  return [
    head('Device', null),
    h('div', { class: 'card' }, h('div', { class: 'info-grid' }, items.map(([k, v]) => h('div', { class: 'info' }, h('span', null, k), h('b', null, v))))),
    h('div', { class: 'card' }, h('h2', null, 'Profile backup'),
      h('p', { class: 'hint' }, `Save or restore everything in the ${PROFILES[s.profile]} profile: buttons, macros, DPI, polling rate and lighting.`),
      h('div', { class: 'row', style: { flexWrap: 'wrap' } },
        h('button', { class: 'btn', onclick: exportCfg }, 'Export profile'),
        h('button', { class: 'btn', onclick: () => importCfg.click() }, 'Import profile'), importCfg,
        h('button', { class: 'btn danger', onclick: () => {
          if (!confirm(`Reset the ${PROFILES[s.profile]} profile to factory defaults?`)) return;
          save(async () => { await app.mouse.resetProfile(); renderShell(); toast('Profile reset'); });
        } }, 'Reset profile to defaults'))),
    h('div', { class: 'card' }, setting('Appearance', null, seg([['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], theme, (v) => { store.set('aula.theme', v); applyTheme(); renderPage(); }, 'Theme'))),
    h('div', { class: 'card' }, h('details', null, h('summary', null, 'Advanced: raw commands'), rawConsole())),
  ];
}

function rawConsole() {
  const f = (name, v, w = '72px') => h('input', { type: 'text', value: v, 'aria-label': name, placeholder: name, style: { width: w } });
  const cmd = f('cmd', '86'), sub = f('sub', '0'), addr = f('addr', '0'), len = f('len', '20'), data = f('data (hex)', '', '220px');
  const out = h('pre', null, 'Reads use the write command | 0x80, e.g. 86 = DPI table, 84 = buttons, 89 = lighting. Values are hex.');
  const hx = (s) => parseInt(s || '0', 16) || 0;
  const log = (line) => { out.textContent = line + '\n' + out.textContent; };
  return h('div', { class: 'console' },
    h('div', { class: 'row', style: { flexWrap: 'wrap' } }, cmd, sub, addr, len, data,
      h('button', { class: 'btn sm', onclick: () => save(async () => {
        const r = await app.mouse.t.read(hx(cmd.value) | 0x80, hx(sub.value), hx(addr.value), hx(len.value));
        log(`read  ${cmd.value} → ${[...r].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
      }) }, 'Read'),
      h('button', { class: 'btn sm danger', onclick: () => {
        if (!confirm('Send a raw write to the mouse? Wrong values can misconfigure it.')) return;
        const bytes = (data.value.match(/[0-9a-f]{2}/gi) || []).map((x) => parseInt(x, 16));
        save(async () => { await app.mouse.t.write(hx(cmd.value) & 0x7f, hx(sub.value), hx(addr.value), bytes); log(`write ${cmd.value} ← ${data.value}`); });
      } }, 'Write')),
    out);
}

function applyTheme() {
  const t = store.get('aula.theme', 'system');
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

// ---------- boot ----------
applyTheme();
renderConnect();
HidTransport.reconnect().then((t) => t && start(t)).catch(() => {});
