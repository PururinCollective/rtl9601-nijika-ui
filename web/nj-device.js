/*
 * Nijika UI: Status > Device. The overview the classic Nijika firmware
 * opened on, in four boxes: the stick (SFP), what it presents (ONT), the
 * line (PON), and how full the shared fibre is (every ONU on it).
 *
 * The figures come from the shell's poll (/api/status, every few seconds)
 * and /api/init; the OLT vendor and the VLANs from the MIB, read once when
 * the page is shown with the line in service.
 */

import { el } from './dom.js';
import {
  signed, uptimeText, bitrate, kib, macText, serialText, laneText, readLine, portRates, ponLoad, cpuBusy,
} from './nj-data.js';

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
  const t = el('table', 'table kv');
  const cells = {};
  for (const [key, label] of rows) {
    const tr = el('tr', 'tr');
    const td = el('td', 'td', DASH);
    tr.append(el('td', 'td left', label), td);
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

/* One figure of the PON box: a label, a dot for its verdict, the value. */
function stat(label) {
  const box = el('div', 'stat');
  const dot = el('i', 'dot none');
  const v = el('span', 'stat-value', DASH);
  const head = el('span', 'stat-label', label);
  const line = el('div', 'stat-line');
  line.append(dot, v);
  box.append(head, line);
  return { box, set(text, ver) { v.textContent = text === null ? DASH : text; dot.className = 'dot ' + (ver || 'none'); }, v };
}

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  return n;
};

/* The fibre going into the stick, and the stick's edge connector to the
   host: the light in is drawn moving while the line is in service. */
function diagram() {
  const s = svg('svg', { viewBox: '0 0 240 72', class: 'pon-diagram', 'aria-hidden': 'true' });
  const fibre = svg('path', { d: 'M4 36 H86', class: 'fibre' });
  const head = svg('path', { d: 'M84 29 L96 36 L84 43 Z', class: 'fibre-head' });
  const body = svg('rect', { x: 98, y: 16, width: 104, height: 40, rx: 5, class: 'stick' });
  const port = svg('rect', { x: 98, y: 26, width: 12, height: 20, rx: 2, class: 'stick-port' });
  const label = svg('text', { x: 152, y: 41, class: 'stick-label', 'text-anchor': 'middle' });
  label.textContent = 'ONU';
  const pins = svg('g', { class: 'pins' });
  for (let i = 0; i < 6; i++) pins.append(svg('rect', { x: 204, y: 22 + i * 5, width: 14, height: 3, rx: 1 }));
  s.append(fibre, head, body, port, label, pins);
  return { s, set(cls) { s.setAttribute('class', 'pon-diagram ' + cls); } };
}

function renderDevice(host, f, ctx) {
  const top = el('div', 'nj-row2');

  const sfp = card('SFP');
  const S = kvTable([
    ['host', 'Hostname'], ['model', 'Model'], ['arch', 'Architecture'], ['platform', 'Target Platform'],
    ['fw', 'Firmware Version'], ['kernel', 'Kernel Version'], ['time', 'Local Time'], ['uptime', 'Uptime'],
    ['load', 'Load Average'], ['mem', 'Memory Usage'],
  ]);
  sfp.append(S.t);

  const ont = card('ONT');
  const O = kvTable([
    ['ip', 'IP Address'], ['mask', 'Subnet Mask'], ['mac', 'MAC Address'], ['lane', 'Interface Speed'],
    ['sn', 'SN'], ['olt', 'OLT'], ['vlans', 'VLANs'],
  ]);
  ont.append(O.t);
  top.append(sfp, ont);

  const pon = card('PON', 'nj-pon');
  const body = el('div', 'pon-body');
  const dia = diagram();
  const grid = el('div', 'pon-stats');
  const P = { state: stat('State'), rx: stat('Laser in'), tx: stat('Laser out'),
    temp: stat('Temperature'), traffic: stat('Traffic') };
  for (const k of ['state', 'rx', 'tx', 'temp', 'traffic']) grid.append(P[k].box);
  body.append(dia.s, grid);
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

  const vals = (ctx.init && ctx.init.values) || {};
  const fw = (ctx.init && ctx.init.firmware) || {};
  const build = fw.build || {};
  const env = fw.env || {};
  const active = env.sw_active;
  const slot = (fw.slots || {})[active] || {};
  const firmware = build.image || fw.running || env['sw_version' + active] || null;

  S.cells.model.textContent = vals.GPON_ONU_MODEL || vals.HW_CWMP_PRODUCTCLASS || DASH;
  S.cells.fw.textContent = firmware || DASH;
  S.cells.kernel.textContent = build.kernel ? 'Linux ' + build.kernel : slot.kernel || DASH;
  O.cells.ip.textContent = vals.LAN_IP_ADDR || DASH;
  O.cells.mask.textContent = vals.LAN_SUBNET || DASH;
  O.cells.mac.textContent = macText(vals.ELAN_MAC_ADDR) || DASH;
  O.cells.sn.textContent = serialText(vals.GPON_SN) || DASH;

  foot.textContent = '';
  const hood = el('a', null, 'Under the hood');
  hood.href = '#status/hood';
  foot.append(el('span', null, firmware || 'Nijika Luna'), el('span', 'sep', '·'), hood,
    el('span', 'sep', '·'), el('span', null, 'Active image: ' + (active === undefined ? DASH : active)));

  /* The memory row: the figure and a bar under it, as LuCI draws it. */
  const memText = el('span');
  const memBar = el('div', 'nj-bar small');
  const memFill = el('div', 'nj-bar-fill');
  memBar.append(memFill);
  S.cells.mem.textContent = '';
  S.cells.mem.append(memText, memBar);

  /* --- the clock and the uptime, ticking between polls ------------------ */

  let upAt = null;
  function tick() {
    if (ctx.clock) {
      const now = ctx.clock.now + (Date.now() - ctx.clock.at) / 1000;
      S.cells.time.textContent = new Date(now * 1000).toLocaleString()
        + (ctx.clock.ntp && ctx.clock.ntp.last_sync ? ' (NTP)' : '');
    }
    if (upAt) S.cells.uptime.textContent = uptimeText(upAt.v + (Date.now() - upAt.at) / 1000) || DASH;
  }
  const ticker = setInterval(tick, 1000);
  tick();

  /* --- the MIB, once the line is in service ----------------------------- */

  let line = null;
  async function loadLine() {
    line = 'reading';
    O.cells.olt.textContent = 'reading…';
    O.cells.vlans.textContent = 'reading…';
    const r = await readLine();
    line = r;
    O.cells.olt.textContent = r.olt || DASH;
    O.cells.vlans.textContent = '';
    if (!r.vlans.length) {
      O.cells.vlans.textContent = r.ok ? 'None provisioned' : 'MIB not readable';
      return;
    }
    const ul = el('ul', 'vlans');
    for (const v of r.vlans) {
      const li = el('li', null, String(v.vid));
      for (const k of v.kinds) li.append(el('span', 'tag ' + k.toLowerCase(), k));
      ul.append(li);
    }
    O.cells.vlans.append(ul);
  }

  /* --- every poll ------------------------------------------------------- */

  function update(c) {
    const st = c.status;
    S.cells.host.textContent = st.hostname || DASH;
    S.cells.arch.textContent = st.cpuModel || DASH;
    S.cells.platform.textContent = st.systemType || DASH;
    if (st.uptime !== null) upAt = { v: st.uptime, at: st.at };

    const busy = cpuBusy(st.raw.cpu);
    S.cells.load.textContent = st.load
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

    const lane = laneText(st.hostMode, (c.init && c.init.values || {}).LAN_SDS_MODE);
    O.cells.lane.textContent = st.hostLink === false ? 'No link' + (lane ? ' (' + lane + ')' : '') : lane || DASH;

    const inService = st.state === 'O5';
    P.state.set(st.state ? `${st.state} (${STATE_NAMES[st.state] || '?'})` : null,
      !st.state ? 'none' : inService ? 'good' : 'bad');
    P.rx.set(st.rx === null ? null : signed(st.rx, 1) + ' dBm', st.los ? 'bad' : verdict(st.rx, WINDOW.rx));
    P.tx.set(st.tx === null ? null : signed(st.tx, 1) + ' dBm', verdict(st.tx, WINDOW.tx));
    const chip = st.chip && typeof st.chip.celsius === 'number' ? `, SoC ${signed(st.chip.celsius, 0)}°C` : '';
    P.temp.set(st.temp === null ? null : signed(st.temp, 1) + '°C' + chip,
      st.chip && st.chip.crit_alarm ? 'bad' : st.chip && st.chip.max_alarm ? 'warn' : st.temp === null ? 'none' : 'good');
    const r = portRates(c.prev, st);
    P.traffic.set(r && r.down !== null && r.up !== null
      ? `▼ ${bitrate(r.down)}   ▲ ${bitrate(r.up)}` : inService ? 'measuring' : null,
    r ? 'good' : 'none');
    P.traffic.v.classList.add('pre');
    dia.set(st.los ? 'los' : inService ? 'flowing' : 'idle');

    const have = typeof st.raw.ds_superframe === 'string' && typeof st.raw.ds_gem_idle === 'string';
    shared.hidden = !have;
    if (have) {
      const load = inService ? ponLoad(st.raw) : (ponLoad(null), null);
      fill.style.width = load ? Math.max(0.5, load.pct).toFixed(1) + '%' : '0';
      fill.className = 'nj-bar-fill ' + (!load ? '' : load.pct >= 80 ? 'bad' : load.pct >= 50 ? 'warn' : 'good');
      sharedNote.textContent = !inService ? 'No downstream outside O5.'
        : !load ? 'Measuring…'
        : `≈ ${load.pct < 10 ? load.pct.toFixed(1) : load.pct.toFixed(0)}% of the downstream in use: `
          + `≈ ${load.mbps < 100 ? load.mbps.toFixed(1) : load.mbps.toFixed(0)} of ${load.of.toFixed(0)} Mbit/s `
          + 'sent to all ONUs on this fibre.';
    }

    if (inService && line === null) loadLine();
    if (!inService && line === null) {
      O.cells.olt.textContent = DASH;
      O.cells.vlans.textContent = 'Not in service';
    }
  }

  return { update, leave() { clearInterval(ticker); } };
}

export { renderDevice };
