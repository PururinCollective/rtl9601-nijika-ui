/*
 * Nijika UI: Status > Device. The overview the classic Nijika firmware
 * opened on, in four boxes: the stick (SFP), what it presents (ONT), the
 * line (PON), and how full the shared fibre is (every ONU on it).
 *
 * The figures come from the shell's poll (/api/status, every few seconds)
 * and the stored values; the OLT vendor and the VLANs from the MIB, read
 * once when the page is shown with the line in service.
 *
 * The drawing of the stick in the PON box follows the one on the Peter-Pon
 * status page (the light arriving, turned down into the photodiode at the
 * WDM filter, and the laser answering up the same fibre), drawn here anew.
 */

import { el } from './dom.js';
import { S } from './state.js';
import {
  signed, uptimeText, bitrate, kib, macText, serialText, laneText, readLine, portRates, ponSample, ponLoad, cpuBusy,
} from './nj-data.js';

/* What the stick calls itself: the part number in the ODI V08 EEPROM, and
   the label the BPI-R4 SFP quirk for this stick carries. */
const MODEL = 'GPON-ONU-SFP2GFX';

const STATE_NAMES = { O1: 'Initial', O2: 'Standby', O3: 'Serial number', O4: 'Ranging',
  O5: 'In Service', O6: 'Intermittent', O7: 'Emergency stop' };

/* Class B+ ONU windows (ITU-T G.984.2 Amd 1), as odi-ui draws its meters:
   in the window, near its edge (the outer 16 %), or out of it. */
const WINDOW = { rx: [-27, -8], tx: [0.5, 5] };
function verdict(v, [lo, hi]) {
  if (v === null) return 'none';
  if (v < lo || v > hi) return 'bad';
  const edge = (hi - lo) * 0.16;
  return v - lo < edge || hi - v < edge ? 'warn' : 'good';
}

const DASH = '—';

/* A LuCI key/value table: label left, value right, a row per fact. */
function kvTable(rows) {
  const t = el('table', 'nj-kv');
  const cells = {};
  for (const [key, label] of rows) {
    const tr = el('tr');
    const td = el('td', null, DASH);
    tr.append(el('td', 'left', label), td);
    t.append(tr);
    cells[key] = td;
  }
  return { t, cells };
}

function card(title, cls) {
  const c = el('div', 'cbi-section' + (cls ? ' ' + cls : ''));
  c.append(el('h3', null, title));
  return c;
}

/* One figure of the PON box: a label, a dot for its verdict, the value,
   and a short line under it saying what it is. */
function stat(label, sub) {
  const box = el('div', 'stat');
  const dot = el('i', 'dot none');
  const v = el('span', 'stat-value', DASH);
  const line = el('div', 'stat-line');
  const note = el('span', 'stat-sub', sub || '');
  line.append(dot, v);
  box.append(el('span', 'stat-label', label), line, note);
  return {
    box, v,
    set(value, ver, text) {
      v.textContent = '';
      if (value instanceof Node) v.append(value); else v.textContent = value === null ? DASH : value;
      dot.className = 'dot ' + (ver || 'none');
      if (text !== undefined) note.textContent = text;
    },
  };
}

/*
 * The light in on a scale, with the class B+ window on it: green in its
 * middle, yellow in the outer 16 % at each end, red out of it, as odi-ui's
 * receive meter draws it. The needle is the reading; the marks under the
 * bar are the edges, the window's in red, the near-edge ones in yellow.
 */
const LIGHT_SCALE = [-30, -4];
function lightBar([lo, hi]) {
  const [a, b] = LIGHT_SCALE;
  const pct = (v) => ((Math.max(a, Math.min(b, v)) - a) / (b - a)) * 100;
  const edge = (hi - lo) * 0.16;
  const box = el('div', 'nj-light');
  const track = el('div', 'nj-light-track');
  [lo, lo + edge, hi - edge, hi].forEach((v, i) => track.style.setProperty('--e' + i, pct(v).toFixed(2) + '%'));
  const needle = el('i', 'nj-light-needle none');
  needle.hidden = true;
  track.append(needle);
  const marks = el('div', 'nj-light-marks');
  for (const [v, cls, text] of [[lo, 'bad', signed(lo, 0)], [lo + edge, 'warn', ''], [hi - edge, 'warn', ''],
    [hi, 'bad', signed(hi, 0) + ' dBm']]) {
    const m = el('span', 'nj-light-mark ' + cls);
    m.style.left = pct(v).toFixed(2) + '%';
    if (text) m.append(el('span', null, text));
    marks.append(m);
  }
  box.title = `Class B+ receive window: ${signed(lo, 0)} dBm (sensitivity) to ${signed(hi, 0)} dBm (overload). `
    + 'Yellow: the outer 16 % at each end, near the edge.';
  box.append(track, marks);
  return {
    el: box,
    set(v, ver) {
      needle.hidden = v === null || v === undefined;
      if (!needle.hidden) needle.style.left = pct(v).toFixed(2) + '%';
      needle.className = 'nj-light-needle ' + (ver || 'none');
    },
  };
}

/* --- the stick ----------------------------------------------------------- */

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs, text) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
};

const FY = 64;        /* the fibre's axis */
const N_DS = 6;       /* light particles on the way in */
const N_US = 4;       /* laser pulses on the way out */
const DUR = { ds: 3200, us: 2600 };

/* The way each one travels, as keyframes of a translation: down the fibre
   to the filter, then down into the photodiode; and from the laser out. */
const DS_PATH = [
  { transform: `translate(-4px, ${FY - 2.5}px)`, opacity: 0 },
  { opacity: 1, offset: 0.07 },
  { transform: `translate(108px, ${FY - 2.5}px)`, offset: 0.78 },
  { opacity: 1, offset: 0.9 },
  { transform: `translate(108px, ${FY + 16}px)`, opacity: 0 },
];
const US_PATH = [
  { transform: `translate(162px, ${FY + 2.5}px)`, opacity: 0 },
  { opacity: 1, offset: 0.08 },
  { opacity: 1, offset: 0.88 },
  { transform: `translate(-8px, ${FY + 2.5}px)`, opacity: 0 },
];

/* Where in its run a dot reaches the photodiode, and a dash leaves the laser. */
const DS_ARRIVE = 0.96;
const US_LEAVE = 0.03;

/*
 * A diode as a flash: its body, and a burst on the side the light comes in
 * or goes out by. toward is in degrees, 0 to the left (the laser sends down
 * the fibre), 90 up (the photodiode takes the light from the filter above).
 */
const BURST = [[-58, 5], [-42, 12], [-27, 6.5], [-9, 13.5], [8, 6.5], [26, 12], [44, 6], [58, 4.6]];
function diode(cx, cy, toward, size, cls) {
  const g = svg('g', { class: 'flash ' + cls, transform: `translate(${cx} ${cy}) rotate(${toward})` });
  const pts = BURST.map(([a, r]) => {
    const t = (180 + a) * Math.PI / 180;
    return `${(r * size * Math.cos(t)).toFixed(2)},${(r * size * Math.sin(t)).toFixed(2)}`;
  });
  const burst = svg('polygon', { class: 'burst', points: pts.join(' ') });
  const body = svg('circle', { class: 'body', r: 4.5 });
  g.append(burst, body);
  return { g, burst, body };
}

/* One flash per period, lit at the moment `at` (ms on the particles' clock). */
const BURST_KF = [
  { opacity: 0.16, transform: 'scale(0.8)' },
  { opacity: 1, transform: 'scale(1.12)', offset: 0.08 },
  { opacity: 0.16, transform: 'scale(0.86)', offset: 0.45 },
  { opacity: 0.16, transform: 'scale(0.8)' },
];
const BODY_KF = [{ fillOpacity: 0.15 }, { fillOpacity: 0.95, offset: 0.08 }, { fillOpacity: 0.15, offset: 0.45 }, { fillOpacity: 0.15 }];
function flashes(d, period, at) {
  const x = (((at - 0.08 * period) % period) + period) % period;
  const o = { duration: period, iterations: Infinity, delay: x - period };
  return [d.burst.animate(BURST_KF, o), d.body.animate(BODY_KF, o)];
}

/* A rate as a speed: an idle line still moves, slowly; a gigabit runs. */
const speed = (bps) => (bps === null || bps === undefined ? 0.5
  : Math.max(0.5, Math.min(3.2, 0.5 + Math.log10(1 + bps / 1000) / 2.2)));

function drawStick(model) {
  const s = svg('svg', { viewBox: '0 0 320 128', class: 'nj-stick', role: 'img' });
  s.append(svg('title', {}, 'The light arriving (1490 nm, down) and the laser answering (1310 nm, up). '
    + 'The colours and the speed are symbolic: both are infrared, and the speed follows the traffic.'));
  s.append(svg('line', { class: 'jacket', x1: -6, y1: FY, x2: 40, y2: FY }));
  s.append(svg('line', { class: 'core', x1: -6, y1: FY, x2: 66, y2: FY }));
  s.append(svg('rect', { class: 'conn', x: 32, y: FY - 14, width: 34, height: 28, rx: 4 }));
  s.append(svg('rect', { class: 'shell', x: 64, y: 22, width: 236, height: 84, rx: 12 }));
  s.append(svg('line', { class: 'shell-hi', x1: 78, y1: 25.5, x2: 286, y2: 25.5 }));
  s.append(svg('rect', { class: 'pcb', x: 72, y: 30, width: 132, height: 68, rx: 7 }));
  s.append(svg('line', { class: 'core', x1: 64, y1: FY, x2: 168, y2: FY }));
  s.append(svg('line', { class: 'filter', x1: 100, y1: FY - 11, x2: 116, y2: FY + 11 }));
  s.append(svg('rect', { class: 'can', x: 168, y: FY - 12, width: 32, height: 24, rx: 5 }));
  const ld = diode(168, FY, 0, 1, 'ld');
  s.append(svg('rect', { class: 'can', x: 96, y: FY + 18, width: 24, height: 15, rx: 4 }));
  const pd = diode(108, FY + 18, 90, 0.7, 'pd');
  s.append(ld.g, pd.g);
  s.append(svg('text', { class: 'lbl ds', x: 124, y: FY + 31 }, '1490 nm ↓'));
  s.append(svg('text', { class: 'lbl us', x: 200, y: FY - 17, 'text-anchor': 'end' }, '1310 nm ↑'));
  const cut = model.lastIndexOf('-');
  s.append(svg('text', { class: 'eng', x: 252, y: FY - 3, 'text-anchor': 'middle' }, cut > 0 ? model.slice(0, cut) : 'GPON SFP'));
  s.append(svg('text', { class: 'eng', x: 252, y: FY + 10, 'text-anchor': 'middle' }, cut > 0 ? model.slice(cut + 1) : model));
  for (let i = 0; i < 4; i++) s.append(svg('rect', { class: 'gold', x: 300, y: 40 + i * 13, width: 16, height: 8, rx: 1.5 }));
  s.append(svg('path', { class: 'arrow ds', d: `M6 ${FY - 15}h16m-4 -4l4 4l-4 4` }));
  s.append(svg('path', { class: 'arrow us', d: `M22 ${FY + 15}h-16m4 -4l-4 4l4 4` }));

  const ds = svg('g', { class: 'p-ds' });
  const us = svg('g', { class: 'p-us' });
  for (let i = 0; i < N_DS; i++) ds.append(svg('circle', { r: 2.8 }));
  for (let i = 0; i < N_US; i++) us.append(svg('ellipse', { rx: 4.5, ry: 1.9 }));
  s.append(ds, us);

  /* The motion, with the Web Animations API: a rate change sets each
     animation's playback rate, which keeps every particle where it is. */
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anims = { ds: [], us: [] };
  if (!still && typeof Element.prototype.animate === 'function') {
    [...ds.children].forEach((c, k) => anims.ds.push(c.animate(DS_PATH,
      { duration: DUR.ds, iterations: Infinity, delay: -k * DUR.ds / N_DS })));
    [...us.children].forEach((c, k) => anims.us.push(c.animate(US_PATH,
      { duration: DUR.us, iterations: Infinity, delay: -k * DUR.us / N_US })));
    /* The flashes: the photodiode as each dot comes down into it, the laser
       as each dash leaves it. They share the clock and the rate changes of
       the particles, so they stay in step at any speed. */
    anims.ds.push(...flashes(pd, DUR.ds / N_DS, DS_ARRIVE * DUR.ds));
    anims.us.push(...flashes(ld, DUR.us / N_US, US_LEAVE * DUR.us));
  } else {
    ds.style.display = 'none';
    us.style.display = 'none';
  }
  const all = () => [...anims.ds, ...anims.us];
  const rate = (list, r) => { for (const a of list) if (a.playbackRate !== r) a.updatePlaybackRate(r); };
  const onVis = () => { for (const a of all()) { if (document.hidden) a.pause(); else a.play(); } };
  document.addEventListener('visibilitychange', onVis);

  return {
    s,
    /* light: dBm or null; los; laser on; rates in bit/s. */
    set({ rx, los, laser, down, up }) {
      const nolight = los || rx === null;
      s.setAttribute('class', 'nj-stick' + (nolight ? ' nolight' : '') + (los ? ' los' : '') + (laser ? '' : ' laseroff'));
      /* Brighter light, brighter particles: -28 to -8 dBm. */
      if (rx !== null) ds.style.opacity = String(Math.max(0.35, Math.min(1, 0.35 + (rx + 28) / 20 * 0.65)));
      rate(anims.ds, speed(down));
      rate(anims.us, speed(up));
    },
    stop() {
      document.removeEventListener('visibilitychange', onVis);
      for (const a of all()) a.cancel();
    },
  };
}

/* --- the page ------------------------------------------------------------ */

function renderDevice(host) {
  const top = el('div', 'nj-row2');

  const sfp = card('SFP');
  const SF = kvTable([
    ['host', 'Hostname'], ['model', 'Model'], ['arch', 'Architecture'], ['platform', 'Target Platform'],
    ['fw', 'Firmware Version'], ['kernel', 'Kernel Version'], ['time', 'Local Time'], ['uptime', 'Uptime'],
    ['load', 'Load Average'], ['mem', 'Memory Usage'],
  ]);
  sfp.append(SF.t);

  const ont = card('ONT');
  const O = kvTable([
    ['ip', 'IP Address'], ['mask', 'Subnet Mask'], ['mac', 'MAC Address'], ['lane', 'Interface Speed'],
    ['sn', 'SN'], ['olt', 'OLT'],
  ]);
  /* The VLANs get the rest of the box, as tall as the SFP one beside it. */
  const vl = el('div', 'nj-vlans');
  const vlHead = el('div', 'nj-vlans-head');
  vlHead.append(el('span', null, 'VLANs'), el('small', null, 'what the OLT lets through, and to which side'));
  const vlBody = el('div', 'nj-vlans-body');
  vlBody.append(el('p', 'hint', DASH));
  vl.append(vlHead, vlBody);
  ont.append(O.t, vl);
  top.append(sfp, ont);

  const pon = card('PON', 'nj-pon');
  const body = el('div', 'pon-body');
  const stick = drawStick(MODEL);
  const grid = el('div', 'pon-stats');
  const P = { state: stat('State', 'Operation state'), rx: stat('Light in', '1490 nm, downstream'),
    tx: stat('Laser out', '1310 nm, upstream'), temp: stat('Temperature', 'module'),
    traffic: stat('Traffic', 'live, from the port counters') };
  const light = lightBar(WINDOW.rx);
  P.rx.box.classList.add('stat-light');
  P.rx.box.insertBefore(light.el, P.rx.box.lastChild);
  for (const k of ['state', 'rx', 'tx', 'temp', 'traffic']) grid.append(P[k].box);
  body.append(stick.s, grid);
  const foot = el('div', 'cbi-section-foot');
  pon.append(body, foot);

  const shared = card('Shared PON, all ONUs', 'nj-shared');
  const bar = el('div', 'nj-bar');
  const fill = el('div', 'nj-bar-fill');
  bar.append(fill);
  const ticks = el('div', 'nj-ticks');
  for (const v of [0, 25, 50, 75, 100]) {
    const t = el('span', null, v + '%');
    t.style.left = v + '%';
    ticks.append(t);
  }
  const sharedNote = el('p', 'nj-note');
  shared.append(bar, ticks, sharedNote);
  shared.hidden = true;

  host.append(top, pon, shared);

  /* --- what changes only with the page ---------------------------------- */

  const vals = S.VALUES || {};
  const fw = S.FW || {};
  const build = fw.build || {};
  const env = fw.env || {};
  const active = env.sw_active;
  const slot = (fw.slots || {})[active] || {};
  const firmware = build.image || fw.running || env['sw_version' + active] || null;

  SF.cells.model.textContent = MODEL;
  SF.cells.fw.textContent = firmware || DASH;
  SF.cells.kernel.textContent = build.kernel ? 'Linux ' + build.kernel : slot.kernel || DASH;
  O.cells.ip.textContent = vals.LAN_IP_ADDR || DASH;
  O.cells.mask.textContent = vals.LAN_SUBNET || DASH;
  O.cells.mac.textContent = macText(vals.ELAN_MAC_ADDR) || DASH;
  O.cells.sn.textContent = serialText(vals.GPON_SN) || DASH;

  const hood = el('a', null, 'Under the hood');
  hood.href = '#status/hood';
  foot.append(el('span', null, firmware || 'Nijika Luna'), el('span', 'sep', '·'), hood,
    el('span', 'sep', '·'), el('span', null, 'Active image: ' + (active === undefined ? DASH : active)));

  /* The memory row: the figure and a bar under it, as LuCI draws it. */
  const memText = el('span');
  const memBar = el('div', 'nj-bar small');
  const memFill = el('div', 'nj-bar-fill');
  memBar.append(memFill);
  SF.cells.mem.textContent = '';
  SF.cells.mem.append(memText, memBar);

  /* --- the clock and the uptime, ticking between polls ------------------ */

  let upAt = null;
  const clock = () => {
    if (!upAt || !upAt.clock) return null;
    return upAt.clock.now + (Date.now() - upAt.clock.at) / 1000;
  };
  function tick() {
    const now = clock();
    if (now !== null) {
      SF.cells.time.textContent = new Date(now * 1000).toLocaleString()
        + (upAt.clock.ntp && upAt.clock.ntp.last_sync ? ' (NTP)' : '');
    }
    if (upAt && upAt.v !== null) SF.cells.uptime.textContent = uptimeText(upAt.v + (Date.now() - upAt.at) / 1000) || DASH;
  }
  const ticker = setInterval(tick, 1000);

  /* --- the MIB, once the line is in service ----------------------------- */

  let line = null;
  async function loadLine() {
    line = 'reading';
    O.cells.olt.textContent = 'reading…';
    vlBody.textContent = '';
    vlBody.append(el('p', 'hint', 'Reading the MIB…'));
    const r = await readLine();
    line = r;
    O.cells.olt.textContent = r.olt || DASH;
    vlBody.textContent = '';
    if (!r.vlans.length) {
      vlBody.append(el('p', 'hint', r.ok ? 'None provisioned: the OLT set no VLAN filter.' : 'The MIB could not be read.'));
      return;
    }
    const ul = el('ul', 'vlans');
    for (const v of r.vlans) {
      const li = el('li');
      li.append(el('span', 'vid', String(v.vid)));
      for (const k of v.kinds) li.append(el('span', 'tag ' + k.toLowerCase(), k));
      if (!v.kinds.length) li.append(el('span', 'tag', 'ANI only'));
      ul.append(li);
    }
    vlBody.append(ul);
  }

  /* --- every poll ------------------------------------------------------- */

  let prevCpu = null;
  let prevPon = null;
  function update(c) {
    const st = c.status;
    upAt = { v: st.uptime, at: st.at, clock: c.clock };
    SF.cells.host.textContent = st.hostname || DASH;
    SF.cells.arch.textContent = st.cpuModel || DASH;
    SF.cells.platform.textContent = st.systemType || DASH;

    const busy = cpuBusy(prevCpu, st.raw.cpu);
    prevCpu = st.raw.cpu;
    SF.cells.load.textContent = st.load
      ? st.load.map((x) => x.toFixed(2)).join(', ') + (busy === null ? '' : ` (${busy.toFixed(0)}%)`)
      : busy === null ? DASH : `CPU ${busy.toFixed(0)}%`;

    if (st.memTotal && st.memAvail !== null) {
      const used = st.memTotal - st.memAvail;
      const pct = 100 * used / st.memTotal;
      memText.textContent = `${kib(used)} / ${kib(st.memTotal)} (${pct.toFixed(0)}%)`;
      memFill.style.width = pct.toFixed(1) + '%';
      memFill.className = 'nj-bar-fill ' + (pct > 85 ? 'bad' : pct > 70 ? 'warn' : 'good');
      memBar.hidden = false;
    } else {
      memText.textContent = DASH;
      memBar.hidden = true;
    }
    tick();

    const lane = laneText(st.hostMode, (S.VALUES || {}).LAN_SDS_MODE);
    O.cells.lane.textContent = st.hostLink === false ? 'No link' + (lane ? ' (' + lane + ')' : '') : lane || DASH;

    const inService = st.state === 'O5';
    P.state.set(st.state ? `${st.state} (${STATE_NAMES[st.state] || '?'})` : null,
      !st.state ? 'none' : inService ? 'good' : 'bad',
      !st.state ? 'No state reported' : inService ? 'Registered and carrying traffic' : 'Not yet operational');
    const vr = st.los ? 'bad' : verdict(st.rx, WINDOW.rx);
    P.rx.set(st.rx === null ? null : signed(st.rx, 1) + ' dBm', vr,
      '1490 nm, downstream' + (st.los ? ', loss of signal' : vr === 'good' ? ', in the B+ window'
        : vr === 'warn' ? ', near the edge' : vr === 'bad' ? ', out of the window' : ''));
    light.set(st.los ? null : st.rx, vr);
    P.tx.set(st.tx === null ? null : signed(st.tx, 1) + ' dBm', verdict(st.tx, WINDOW.tx));
    const hasChip = st.chip && typeof st.chip.celsius === 'number';
    P.temp.set(st.temp === null ? null : signed(st.temp, 1) + '°C' + (hasChip ? ` / ${signed(st.chip.celsius, 1)}°C` : ''),
      st.chip && st.chip.crit_alarm ? 'bad' : st.chip && st.chip.max_alarm ? 'warn' : st.temp === null ? 'none' : 'good',
      hasChip ? 'module / chip' : 'module');
    const r = portRates(c.prev, st);
    if (r && r.down !== null && r.up !== null) {
      const t = document.createDocumentFragment();
      t.append(el('span', 'ds', '▼ ' + bitrate(r.down)), document.createTextNode('   '),
        el('span', 'us', '▲ ' + bitrate(r.up)));
      P.traffic.set(t, 'good');
    } else {
      P.traffic.set(inService ? 'measuring' : null, 'none');
    }
    P.traffic.v.classList.add('pre');
    stick.set({
      rx: st.rx, los: st.los,
      laser: !!st.state && st.state !== 'O1' && st.state !== 'O7' && st.tx !== null,
      down: r && r.down, up: r && r.up,
    });

    const sample = ponSample(st.raw, st.at);
    shared.hidden = !sample;
    if (sample) {
      const load = inService ? ponLoad(prevPon, sample) : null;
      fill.style.width = load ? Math.max(0.5, load.pct).toFixed(1) + '%' : '0';
      fill.className = 'nj-bar-fill ' + (!load ? '' : load.pct >= 80 ? 'bad' : load.pct >= 50 ? 'warn' : 'good');
      sharedNote.textContent = !inService ? 'No downstream outside O5.'
        : !load ? 'Measuring…'
        : `≈ ${load.pct < 10 ? load.pct.toFixed(1) : load.pct.toFixed(0)}% of the downstream in use: `
          + `≈ ${load.mbps < 100 ? load.mbps.toFixed(1) : load.mbps.toFixed(0)} of ${load.of.toFixed(0)} Mbit/s `
          + 'sent to all ONUs on this fibre.';
    }
    prevPon = sample;

    if (inService && line === null) loadLine();
    if (!inService && line === null) {
      O.cells.olt.textContent = DASH;
      vlBody.textContent = '';
      vlBody.append(el('p', 'hint', 'Not in service: the OLT has provisioned nothing yet.'));
    }
  }

  return { update, leave() { clearInterval(ticker); stick.stop(); } };
}

export { renderDevice };
