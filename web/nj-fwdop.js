/*
 * Nijika UI: the VLAN forward operation override, on GPON > VLAN.
 *
 * Each VLAN filter the OLT provisioned (class 84, VLAN tagging filter data)
 * has a forward operation, FwdOp: what the bridge port does with a tagged
 * frame (forward all, drop, or filter by VID, priority or the whole TCI)
 * and with an untagged one. omcid builds its bridge rules from it
 * (odi-oss apply_bridge.c fwdop_decode), and from an override the owner
 * stores in RTK_DEVINFO_SPECVER, the key and format of the stock firmware's
 * VLAN Forward Operation page, so both slots read the same entries:
 *
 *     0x1102:0x02,0xe104:0x00      an entity id and the code to build it with
 *
 * The OLT is still answered with the code it wrote; only the stick's own
 * rules change. Saving it is live: omcid rebuilds the bridges in place and
 * the ONU stays in O5. Up to FWDOP_MAX entries; anything malformed turns
 * the whole key off in omcid, which is why the page writes it and checks
 * what is stored with odi-ui's own rule (validate.js fwdopProblem).
 *
 * A choice here is a pending change, as every setting is: the save bar
 * writes it.
 */

import { $, el } from './dom.js';
import { S, EDITS } from './state.js';
import { fwdopProblem } from './validate.js';
import { readMib } from './nj-data.js';

const KEY = 'RTK_DEVINFO_SPECVER';
const FWDOP_MAX = 12;          /* odi-oss omcid.h FWDOP_OVR_MAX */
const QUICK = 0x02;

/* The codes a bridge rule can build (fwdop_decode), each once: the table
   repeats them under other letters (0x0f and 0x1c are 0x03 again). */
const CODES = [
  [0x00, 'tagged: all, untagged: forwarded'],
  [0x01, 'tagged: dropped, untagged: forwarded'],
  [0x02, 'tagged: all, untagged: dropped'],
  [0x03, 'tagged: VID filter, untagged: forwarded'],
  [0x04, 'tagged: VID filter, untagged: dropped'],
  [0x07, 'tagged: priority filter, untagged: forwarded'],
  [0x08, 'tagged: priority filter, untagged: dropped'],
  [0x0b, 'tagged: TCI filter, untagged: forwarded'],
  [0x0c, 'tagged: TCI filter, untagged: dropped'],
  [0x10, 'tagged: VID filter, untagged: dropped'],
];
const hex = (n, w) => '0x' + n.toString(16).padStart(w, '0');

/* --- the key, pure, for make check --------------------------------------- */

/* "0x1102" or "4354" -> 4354; null for anything else. */
function num(s) {
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

/* The stored text as entries, in the way omcid reads it: an entry without a
   code is 0x02. `ok` false when the text is malformed, which omcid takes as
   no override at all. */
function parseOverride(text) {
  const t = String(text || '').trim();
  if (!t) return { ok: true, entries: [] };
  if (fwdopProblem(t)) return { ok: false, entries: [] };
  const entries = [];
  for (const part of t.split(/[ ,]+/).filter(Boolean)) {
    const [i, c] = part.split(':');
    entries.push({ inst: num(i), code: c === undefined ? 0x02 : num(c) });
  }
  return { ok: true, entries };
}

/* Entries back as text: by entity id, every code written out. */
function formatOverride(entries) {
  return [...entries].sort((a, b) => a.inst - b.inst)
    .map((e) => hex(e.inst, 4) + ':' + hex(e.code, 2)).join(',');
}

/* The side each bridge port of class 47 serves: the UNI kinds on its bridge
   (1 a PPTP Ethernet UNI, 11 the VEIP), as nj-data.js vlanMap reads them. */
function portKinds(me47) {
  const ports = [];
  for (const inst of (me47 && me47.instances) || []) {
    const a = (k) => (inst.attrs.find(([n]) => n.toLowerCase() === k.toLowerCase()) || [])[1];
    ports.push({ id: Number(inst.id || a('EntityID')), bridge: Number(a('BridgeIdPtr')), tp: Number(a('TPType')) });
  }
  const out = new Map();
  for (const p of ports) {
    const kinds = new Set(ports.filter((q) => q.bridge === p.bridge && (q.tp === 1 || q.tp === 11))
      .map((q) => (q.tp === 1 ? 'PPTP' : 'VEIP')));
    out.set(p.id, ['PPTP', 'VEIP'].filter((k) => kinds.has(k)).join('+') || 'ANI');
  }
  return out;
}

/* The VLAN filters as table rows: entity id, the code the OLT wrote, the
   VIDs it lists (4096 is "any"). */
function filterRows(me84, me47) {
  const kinds = portKinds(me47);
  const rows = [];
  for (const inst of (me84 && me84.instances) || []) {
    const id = Number(inst.id);
    if (!Number.isFinite(id)) continue;
    const fw = (inst.attrs.find(([k]) => /^FwdOp$/i.test(k)) || [])[1];
    const vids = inst.attrs.filter(([k]) => /^FilterTbl/i.test(k))
      .map(([, v]) => (/VID\s*(\d+)/.exec(v) || [])[1]).filter(Boolean)
      .map((v) => (v === '4096' ? 'any' : v));
    rows.push({ inst: id, olt: num(String(fw || '').trim()), kind: kinds.get(id) || '—', vids });
  }
  return rows.sort((a, b) => a.inst - b.inst);
}

/* --- the page ------------------------------------------------------------ */

const stored = () => (S.VALUES[KEY] === undefined ? '' : String(S.VALUES[KEY]));
const current = () => (EDITS.has(KEY) ? EDITS.get(KEY) : stored());

function write(entries) {
  const text = formatOverride(entries);
  /* What is stored may be written another way (decimal ids, no codes):
     the same entries are no change. */
  if (formatOverride(parseOverride(stored()).entries) === text && parseOverride(stored()).ok) EDITS.delete(KEY);
  else EDITS.set(KEY, text);
  document.dispatchEvent(new Event('edits-changed'));
}

function setCode(inst, code, olt) {
  const p = parseOverride(current());
  const rest = p.entries.filter((e) => e.inst !== inst);
  /* Back to what the OLT wrote: no entry. */
  if (code === olt) write(rest);
  else write([...rest, { inst, code }]);
}

let MIB = null;      /* { rows, ok } from the last read */
let HOST = null;

function codeSelect(row, code) {
  const s = el('select');
  const known = CODES.map(([c]) => c);
  const all = [...CODES];
  for (const c of [row.olt, code]) {
    if (c !== null && c !== undefined && !known.includes(c)) { all.push([c, 'built as 0x10 here']); known.push(c); }
  }
  for (const [c, what] of all.sort((a, b) => a[0] - b[0])) {
    const o = el('option', null, `${hex(c, 2)}  ${what}${c === row.olt ? '  (OLT)' : ''}`);
    o.value = String(c);
    s.append(o);
  }
  s.value = String(code);
  s.setAttribute('aria-label', 'FwdOp of ' + hex(row.inst, 4));
  s.addEventListener('change', () => setCode(row.inst, Number(s.value), row.olt));
  return s;
}

function draw() {
  if (!HOST) return;
  const body = HOST.querySelector('.nj-fwdop-body');
  const foot = HOST.querySelector('.nj-fwdop-foot');
  body.textContent = '';
  foot.textContent = '';
  const p = parseOverride(current());
  const over = new Map(p.entries.map((e) => [e.inst, e.code]));

  if (!p.ok) {
    body.append(el('p', 'nj-note bad', `${KEY} value “${current()}” is invalid. No override is `
      + 'used. Select the codes below to set it again, or clear it.'));
  }
  if (!MIB) { body.append(el('p', 'nj-note', 'Reading VLAN filters, please wait ...')); return; }

  const t = el('table', 'nj-table');
  const head = el('tr');
  for (const h of ['EntityID', 'Kind', 'FwdOp', 'VLAN', '']) head.append(el('th', null, h));
  t.append(head);
  const seen = new Set();
  for (const r of MIB.rows) {
    seen.add(r.inst);
    const code = over.has(r.inst) ? over.get(r.inst) : r.olt;
    const tr = el('tr', over.has(r.inst) && code !== r.olt ? 'nj-over' : '');
    const quick = el('button', 'nj-quick', '→ ' + hex(QUICK, 2));
    quick.type = 'button';
    quick.title = `Build ${hex(r.inst, 4)} as ${hex(QUICK, 2)}: tagged frames of any VLAN pass, untagged ones do not`;
    quick.disabled = code === QUICK;
    quick.addEventListener('click', () => setCode(r.inst, QUICK, r.olt));
    const kind = el('td');
    for (const k of r.kind.split('+')) kind.append(el('span', 'tag ' + k.toLowerCase(), k));
    tr.append(el('td', 'mono', hex(r.inst, 4)), kind, el('td'), el('td', 'mono', r.vids.join(', ') || '—'), el('td'));
    tr.children[2].append(r.olt === null ? el('span', 'nj-note', 'no FwdOp read') : codeSelect(r, code));
    tr.children[4].append(quick);
    t.append(tr);
  }
  /* Entries for filters the MIB does not have now: kept, and removable. */
  for (const [inst, code] of over) {
    if (seen.has(inst)) continue;
    const tr = el('tr', 'nj-stale');
    const rm = el('button', 'nj-quick', 'Remove');
    rm.type = 'button';
    rm.addEventListener('click', () => write(p.entries.filter((e) => e.inst !== inst)));
    tr.append(el('td', 'mono', hex(inst, 4)), el('td', null, '—'), el('td', 'mono', hex(code, 2)),
      el('td', 'nj-note', 'not in the MIB now'), el('td'));
    tr.children[4].append(rm);
    t.append(tr);
  }
  if (!MIB.rows.length && !over.size) {
    body.append(el('p', 'nj-note', MIB.ok ? 'No VLAN filter (class 84) provisioned by the OLT.'
      : 'Failed to read MIB.'));
  } else {
    const wrap = el('div', 'nj-table-wrap');
    wrap.append(t);
    body.append(wrap);
  }

  const n = p.entries.length;
  foot.append(el('span', null, EDITS.has(KEY) ? 'To be saved: ' : 'Current: '), el('code', null, `${KEY}=${current() || ''}`),
    el('span', 'sep', '·'), el('span', null, `${n} of ${FWDOP_MAX} entries`));
  if (n > FWDOP_MAX) foot.append(el('span', 'bad', `: more than ${FWDOP_MAX}, refused by omcid`));
}

async function readFilters() {
  MIB = null;
  draw();
  const [me84, me47] = [await readMib('84'), await readMib('47')];
  MIB = { rows: filterRows(me84, me47), ok: me84.ok && me47.ok };
  draw();
}

function renderFwdop() {
  const host = $('#nj-fwdop');
  if (!host) return;
  if (!HOST) {
    HOST = host;
    const card = el('div', 'cbi-section');
    const h = el('h3', 'nj-cardhead');
    const again = el('button', 'nj-quick', 'Refresh');
    again.type = 'button';
    again.addEventListener('click', readFilters);
    const all = el('button', 'nj-quick', 'All → ' + hex(QUICK, 2));
    all.type = 'button';
    all.title = `Set all VLAN filters to ${hex(QUICK, 2)}`;
    all.addEventListener('click', () => {
      if (!MIB) return;
      const p = parseOverride(current());
      const keep = p.entries.filter((e) => !MIB.rows.some((r) => r.inst === e.inst));
      write([...keep, ...MIB.rows.filter((r) => r.olt !== QUICK).map((r) => ({ inst: r.inst, code: QUICK }))]);
    });
    h.append(el('span', null, 'VLAN forward operation'), all, again);
    const lede = el('p', 'nj-note nj-pad', 'This page is used to override the forward operation of the VLAN '
      + 'filters provisioned by the OLT. The OLT still reads its own code; only the bridge rules of the ONU change. '
      + `Changes apply at once without dropping the line. ${hex(QUICK, 2)} forwards tagged frames of any VLAN, `
      + 'needed by some lines for 802.1X on VLAN 0.');
    card.append(h, lede, el('div', 'nj-fwdop-body nj-pad'), el('div', 'cbi-section-foot nj-fwdop-foot'));
    host.append(card);
    document.addEventListener('edits-changed', draw);
    const count = $('#savecount');
    if (count) new MutationObserver(draw).observe(count, { childList: true });
  }
  readFilters();
}

export { renderFwdop, parseOverride, formatOverride, filterRows, portKinds, CODES };
