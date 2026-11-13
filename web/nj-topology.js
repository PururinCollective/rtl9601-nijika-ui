/*
 * Nijika UI: Status > OMCI Topology. What the OLT set up, from the fibre to
 * the ports of this stick, as a drawing, one column per kind of managed
 * entity:
 *
 *   fibre | T-CONT 262 | GEM port 268 | 802.1p mapper 130 | bridge port 47 |
 *   MAC bridge 45 | bridge port 47 | UNI: PPTP 11, VEIP 329
 *
 * and on a box, as chips, what belongs to it: the queues (277) of a T-CONT,
 * the interworking TPs (266, 281) of a GEM port, the VLAN filter (84) and
 * the multicast subscriber (310, with its profile 309) of a bridge port, the
 * VLAN rules (171) of a UNI. The idea and the look are those of the OMCI
 * Topology page of RemixWrt IIDX, itself after GPON > MIB of Peter-Pon;
 * this is drawn anew, for the omcid of this image.
 *
 * Colour: G.988 says who creates what, the ONU its T-CONTs and UNIs, the OLT
 * the rest. A box with no way to a port that reaches the router is stored
 * and not used: on this stick the PPTP UNI 0x0101 and the VEIP both reach
 * the host port, and the LAN ports 2 to 4 of the HGU layout reach nothing.
 * A pointer to an entity the MIB has not is a box of its own, in red.
 *
 * Each bridge gets a band of rows, so the bridges never overlap, and the
 * columns to their left line up with the ports they feed. Clicking a box
 * traces its whole path. topology(), layout() and trace() use no DOM.
 *
 * confd answers at most 32 KB of omcicli output, and the queue table of a
 * real OLT (one queue per priority per T-CONT) is larger: the queues are
 * read one by one, only those a GEM port points at.
 */

import { $, el } from './dom.js';
import { readMib } from './nj-data.js';
import { attrOf, num, idOf, hex4, fields, rulesOf, ruleLane } from './nj-service.js';

const NONE = 0xffff;
const COLS = ['tcont', 'gem', 'mapper', 'aport', 'bridge', 'uport', 'uni'];
const HEADS = { tcont: 'T-CONTs', gem: 'GEM ports', mapper: '802.1p mappers', aport: 'Bridge ports',
  bridge: 'Bridges', uport: 'Bridge ports', uni: 'This stick’s ports' };
const DIR = { 1: 'upstream', 2: 'downstream', 3: 'both ways' };
const POLICY = { 0: 'no policy', 1: 'strict priority', 2: 'WRR' };
const IWOPT = { 0: 'circuit', 1: 'MAC bridge', 4: 'video', 5: 'mapper', 6: 'broadcast', 7: 'MPLS' };
const ADMIN = { 0: 'unlocked', 1: 'locked' };

const NODE_H = 46, CHIP_H = 21, ROW_GAP = 12, BAND_GAP = 14, BAR = 24, MIN_BAND = 64, TOP = 34, GAP = 18;
const MIN_COL = 146, MAX_COL = 220;

/* 0,1,2,3 as "0–3"; 0,2,5 as they are. */
function spans(list) {
  const out = [];
  for (let i = 0; i < list.length;) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    out.push(j > i ? `${list[i]}–${list[j]}` : String(list[i]));
    i = j + 1;
  }
  return out.join(', ');
}

const isSet = (v) => v !== null && v !== undefined && v !== 0 && v !== NONE;

/* --- the model, pure, for make check --------------------------------------- */

/*
 * mib: parsed dumps by class ('262', '268', ...); queues: Map of 277 entity
 * -> { pri }, for the queues read one by one. Returns { nodes: Map, edges }.
 */
function topology(mib, queues = new Map()) {
  const L = (c) => (mib[c] && mib[c].instances) || [];
  const v = (inst, name) => num(attrOf(inst, name));
  const nodes = new Map();
  const edges = [];
  const linked = new Set();
  const add = (o) => { if (!nodes.has(o.id)) nodes.set(o.id, { chips: [], ...o }); return nodes.get(o.id); };
  const link = (a, b) => {
    const k = a + '>' + b;
    if (a && b && a !== b && !linked.has(k)) { linked.add(k); edges.push({ from: a, to: b }); }
  };
  /* A pointer to an entity the MIB has not. */
  const ghost = (cls, inst, col) => add({ id: `ghost:${cls}/${inst}`, col, ghost: true, origin: 'none',
    title: hex4(inst), sub: `class ${cls}: not in the MIB`, tip: 'Something points here, and the MIB has no such entity.' }).id;
  const has = (cls, inst, col) => (nodes.has(`${cls}/${inst}`) ? `${cls}/${inst}` : ghost(cls, inst, col));

  add({ id: 'fibre', col: 'fibre', bar: true, origin: 'olt', title: 'Fibre', tip: 'The PON, towards the OLT.' });

  /* T-CONTs: the ones with an Alloc-ID or a GEM port each a box, the rest
     folded into one. */
  const pointed = new Set(L('268').map((g) => v(g, 'TcAdapterPtr')));
  let unused = 0;
  for (const t of L('262')) {
    const id = idOf(t);
    const alloc = v(t, 'AllocID');
    const set = alloc !== null && alloc !== 0xff && alloc !== NONE;
    if (!set && !pointed.has(id)) { unused++; continue; }
    add({ id: `262/${id}`, col: 'tcont', origin: 'onu', title: set ? `Alloc-ID ${alloc}` : 'T-CONT',
      sub: `${hex4(id)} · ${set ? (POLICY[v(t, 'Policy')] || '—') : 'no Alloc-ID'}`,
      tip: 'T-CONT: the upstream bandwidth the OLT gives.' });
    link('fibre', `262/${id}`);
  }

  for (const g of L('268')) {
    const id = `268/${idOf(g)}`;
    const port = v(g, 'PortID');
    const tc = v(g, 'TcAdapterPtr');
    add({ id, col: 'gem', origin: 'olt', title: `GEM ${port === null ? '—' : port}`,
      sub: `${hex4(idOf(g))} · ${DIR[v(g, 'Direction')] || '—'}`,
      tip: 'GEM port: one stream of the PON.' + (isSet(tc) ? '' : ' No T-CONT: it only comes down.') });
    if (!isSet(tc)) { link('fibre', id); continue; }
    const host = has(262, tc, 'tcont');
    link(host, id);
    const q = v(g, 'UsTraffMgmtPtr');
    const qq = queues.get(q);
    if (isSet(q)) {
      nodes.get(host).chips.push({ text: `queue ${hex4(q)}` + (qq && qq.pri !== null ? ` · prio ${qq.pri}` : ''),
        tip: `GEM ${port} goes up through this queue.` });
    }
  }

  /* An interworking TP belongs to its GEM port: a chip there; the mappers
     and bridge ports that name it link to that GEM port. */
  const iw = new Map();
  for (const [cls, mc] of [['266', false], ['281', true]]) {
    for (const w of L(cls)) {
      const host = has(268, v(w, 'GemCtpPtr'), 'gem');
      const opt = v(w, 'IwOpt');
      iw.set(`${cls}/${idOf(w)}`, host);
      nodes.get(host).chips.push({ text: mc ? `multicast IW ${hex4(idOf(w))}` : `IW ${hex4(idOf(w))} · ${IWOPT[opt] ?? opt}`,
        tip: mc ? 'Multicast interworking' : `Interworking: ${IWOPT[opt] ?? opt}` });
    }
  }
  const viaIw = (cls, inst) => iw.get(`${cls}/${inst}`) || ghost(cls, inst, 'gem');

  for (const m of L('130')) {
    const id = `130/${idOf(m)}`;
    const by = new Map();
    for (let p = 0; p < 8; p++) {
      const w = v(m, 'IwTpPtrPbit' + p);
      if (!isSet(w)) continue;
      if (!by.has(w)) by.set(w, []);
      by.get(w).push(p);
    }
    const ws = [...by.keys()];
    const one = ws.length === 1 ? nodes.get(viaIw('266', ws[0])) : null;
    add({ id, col: 'mapper', origin: 'olt', title: hex4(idOf(m)),
      sub: one ? `p-bits ${spans(by.get(ws[0]))} → ${one.title}` : ws.length ? `p-bits to ${ws.length} GEM ports` : 'no GEM port',
      tip: '802.1p mapper: picks the GEM port by the priority bits.' });
    for (const w of ws) {
      const host = viaIw('266', w);
      link(host, id);
      if (ws.length > 1) nodes.get(id).chips.push({ text: `p-bits ${spans(by.get(w))} → ${nodes.get(host).title}` });
    }
  }

  for (const b of L('45')) {
    add({ id: `45/${idOf(b)}`, col: 'bridge', bar: true, origin: 'olt', title: hex4(idOf(b)), tip: 'MAC bridge' });
  }
  for (const u of L('11')) {
    const me = idOf(u);
    add({ id: `11/${me}`, col: 'uni', origin: 'onu', title: 'PPTP ' + hex4(me),
      sub: 'Ethernet · ' + (ADMIN[v(u, 'AdminState')] || '—'),
      /* The stick has one Ethernet port; the HGU layout adds 0x0102..0x0104. */
      reaches: me === 0x0101, tip: me === 0x0101 ? 'The Ethernet port: the SFP edge to the router.'
        : 'A LAN port of the HGU layout: the stick has one port, so nothing reaches it.' });
  }
  for (const u of L('329')) {
    add({ id: `329/${idOf(u)}`, col: 'uni', origin: 'onu', title: 'VEIP ' + hex4(idOf(u)),
      sub: 'virtual port · ' + (ADMIN[v(u, 'AdminState')] || '—'), reaches: true,
      tip: 'The virtual port: on this stick it reaches the router through the same SFP edge.' });
  }

  const NAMES = { 1: 'PPTP', 3: 'mapper', 5: 'GEM IW', 6: 'multicast IW', 11: 'VEIP' };
  for (const p of L('47')) {
    const id = `47/${idOf(p)}`;
    const type = v(p, 'TPType');
    const tp = v(p, 'TPPointer');
    const bridge = has(45, v(p, 'BridgeIdPtr'), 'bridge');
    if (nodes.get(bridge).ghost) nodes.get(bridge).bar = true;
    const ani = type === 3 || type === 5 || type === 6;
    add({ id, col: ani ? 'aport' : 'uport', origin: 'olt', bridge, title: hex4(idOf(p)),
      sub: `→ ${NAMES[type] || 'type ' + type} ${hex4(tp)}`, tip: `Bridge port ${v(p, 'PortNum')} of bridge ${nodes.get(bridge).title}` });
    if (ani) {
      link(id, bridge);
      link(type === 3 ? has(130, tp, 'mapper') : viaIw(type === 5 ? '266' : '281', tp), id);
    } else {
      link(bridge, id);
      if (type === 1) link(id, has(11, tp, 'uni'));
      else if (type === 11) link(id, has(329, tp, 'uni'));
    }
  }

  for (const f of L('84')) {
    const node = nodes.get(`47/${idOf(f)}`);
    if (!node) continue;
    const vids = f.attrs.filter(([k]) => /^FilterTbl/i.test(k)).map(([, x]) => fields(x).VID)
      .filter((x) => x !== null && x !== undefined).map((x) => (x === 4096 ? 'any' : x));
    node.chips.push({ text: !vids.length ? 'no VLAN' : vids.length === 1 ? `VLAN ${vids[0]}` : `VLANs ${vids.join(', ')}`,
      tip: `VLAN filter, FwdOp ${attrOf(f, 'FwdOp') ?? '?'}`, cls: 'vlan' });
  }

  const profiles = new Map(L('309').map((p) => [idOf(p), v(p, 'IGMPVersion')]));
  for (const s of L('310')) {
    const node = nodes.get(`${v(s, 'MeType') === 1 ? 130 : 47}/${idOf(s)}`);
    if (!node) continue;
    const ver = profiles.get(v(s, 'McastOperProfPtr'));
    node.chips.push({ text: 'multicast' + (ver ? ` · IGMP v${ver}` : ''), tip: 'Multicast subscriber', cls: 'mcast' });
  }

  for (const e of L('171')) {
    const cls = { 0: 47, 1: 130, 2: 11, 10: 329 }[num(attrOf(e, 'AssociationType'))];
    const point = num(attrOf(e, 'AssociatedMePoint') ?? (e.groups || []).flatMap((g) => g.attrs)
      .find(([k]) => /^AssociatedMePoint$/i.test(k))?.[1]);
    const node = cls ? nodes.get(`${cls}/${point}`) : null;
    if (!node) continue;
    const rules = rulesOf(e).map(ruleLane);
    const words = rules.map((r) => (r.fallback ? r.text
      : `${r.from}${r.eth ? ' ' + r.eth : ''}: ${r.action}${r.to && r.to !== r.from ? ' → ' + r.to : ''}`));
    node.chips.push({ text: `VLAN rules: ${rules.length}`, tip: words.join('\n'), cls: 'rules' });
  }

  if (unused) {
    add({ id: 'unused', col: 'tcont', origin: 'onu', unused: true, title: `${unused} unused`, sub: 'no GEM port here',
      tip: 'T-CONTs of the stick that no GEM port points at.' });
  }

  const model = { nodes, edges };
  /* What reaches no port to the router is stored and not used. */
  const live = new Set();
  for (const [id, nd] of nodes) if (nd.reaches) for (const k of trace(model, id)) live.add(k);
  if (live.size) {
    for (const [id, nd] of nodes) nd.off = !live.has(id) && !nd.unused && !nd.ghost && id !== 'fibre';
  }
  return model;
}

/* A box and all that is on its way to the fibre and to the ports. */
function trace(m, id) {
  const out = new Set([id]);
  for (const [a, b] of [['from', 'to'], ['to', 'from']]) {
    const todo = [id];
    while (todo.length) {
      const x = todo.pop();
      for (const e of m.edges) {
        if (e[a] === x && !out.has(e[b])) { out.add(e[b]); todo.push(e[b]); }
      }
    }
  }
  return out;
}

const nodeH = (nd) => (nd.bar ? 0 : NODE_H + (nd.chips.length ? nd.chips.length * CHIP_H + 4 : 0));

/*
 * Where every box goes. The bridges first, live ones first: each a band of
 * rows, its fibre-side ports on the left of it, its UNI-side ports and their
 * UNIs on the right. Then the mappers, GEM ports and T-CONTs, each lined up
 * with the first box it feeds and pushed down past the one above.
 */
function layout(m, width) {
  const cols = Object.fromEntries(COLS.map((c) => [c, []]));
  for (const [id, nd] of m.nodes) if (cols[nd.col]) cols[nd.col].push(id);
  const N = m.nodes;
  const byId = (a, b) => (Number(a.split('/')[1]) || 0) - (Number(b.split('/')[1]) || 0);
  const y = {};
  const heightOf = (ids, hOf = (id) => nodeH(N.get(id))) => ids.reduce((s, id) => s + hOf(id) + ROW_GAP, -ROW_GAP);
  const uniOf = (id) => (m.edges.find((e) => e.from === id && N.get(e.to).col === 'uni') || {}).to;

  const unplaced = new Set(cols.uni);
  let top = 0;
  const bands = {};
  const bridges = cols.bridge.slice().sort((a, b) => ((N.get(a).off ? 1 : 0) - (N.get(b).off ? 1 : 0)) || byId(a, b));
  for (const b of bridges) {
    const a = cols.aport.filter((id) => N.get(id).bridge === b).sort(byId);
    const u = cols.uport.filter((id) => N.get(id).bridge === b).sort(byId);
    const rowH = (id) => Math.max(nodeH(N.get(id)), uniOf(id) ? nodeH(N.get(uniOf(id))) : 0);
    const hA = a.length ? heightOf(a) : 0;
    const hU = u.length ? heightOf(u, rowH) : 0;
    const h = Math.max(hA, hU, MIN_BAND);
    let t = top + (h - hA) / 2;
    for (const id of a) { y[id] = t; t += nodeH(N.get(id)) + ROW_GAP; }
    t = top + (h - hU) / 2;
    for (const id of u) {
      y[id] = t;
      const uni = uniOf(id);
      if (uni && unplaced.has(uni)) { y[uni] = t; unplaced.delete(uni); }
      t += rowH(id) + ROW_GAP;
    }
    bands[b] = { y: top, h };
    top += h + BAND_GAP;
  }
  let bottom = top - BAND_GAP;
  for (const id of unplaced) { y[id] = top; top += nodeH(N.get(id)) + ROW_GAP; bottom = top - ROW_GAP; }
  for (const id of cols.aport.concat(cols.uport)) {
    if (y[id] === undefined) { y[id] = Math.max(bottom, 0) + ROW_GAP; bottom = y[id] + nodeH(N.get(id)); }
  }

  for (const col of ['mapper', 'gem', 'tcont']) {
    const want = {};
    for (const id of cols[col]) {
      const to = m.edges.filter((e) => e.from === id && y[e.to] !== undefined).map((e) => y[e.to]);
      want[id] = to.length ? Math.min(...to) : Infinity;
    }
    let free = 0;
    for (const id of cols[col].slice().sort((a, b) => (want[a] - want[b]) || byId(a, b))) {
      y[id] = Math.max(want[id] === Infinity ? free : want[id], free);
      free = y[id] + nodeH(N.get(id)) + ROW_GAP;
    }
    bottom = Math.max(bottom, free - ROW_GAP);
  }

  const used = COLS.filter((c) => cols[c].length);
  const boxes = used.filter((c) => c !== 'bridge').length;
  const bars = 1 + (cols.bridge.length ? 1 : 0);
  const colW = Math.max(MIN_COL, Math.min(MAX_COL, Math.floor((width - 16 - bars * BAR - used.length * GAP) / Math.max(1, boxes))));
  const total = 16 + bars * BAR + used.length * GAP + boxes * colW;
  const W = Math.max(width, total);
  let x = Math.max(8, Math.floor((W - total) / 2) + 8);
  const pos = { fibre: { x, y: TOP, w: BAR, h: Math.max(bottom, MIN_BAND) } };
  const heads = [];
  x += BAR + GAP;
  const xs = {};
  for (const c of used) {
    xs[c] = x;
    const w = c === 'bridge' ? BAR : colW;
    /* The bar of the bridges is narrower than its name: the name is set
       over its middle, and the column after it starts a little in. */
    heads.push(c === 'bridge' ? { x: x + w / 2, w: 0, text: HEADS[c], mid: true }
      : { x: x + (used[used.indexOf(c) - 1] === 'bridge' ? 14 : 0), w, text: HEADS[c] });
    x += w + GAP;
  }
  for (const [id, nd] of N) {
    if (id === 'fibre' || !xs[nd.col]) continue;
    if (nd.col === 'bridge') {
      const b = bands[id] || { y: y[id] || 0, h: MIN_BAND };
      pos[id] = { x: xs.bridge, y: TOP + b.y, w: BAR, h: b.h };
    } else if (y[id] !== undefined) {
      pos[id] = { x: xs[nd.col], y: TOP + y[id], w: colW, h: nodeH(nd) };
    }
  }
  return { pos, heads, width: W, height: TOP + Math.max(bottom, MIN_BAND) + 12 };
}

/* A line between two boxes: from the right edge of one to the left edge of
   the other, a bar meeting the line at the height of the box. */
function edgeLine(a, b) {
  const ya = a.h && a.w === BAR ? Math.min(a.y + a.h - 8, Math.max(a.y + 8, b.y + Math.min(b.h, NODE_H) / 2)) : a.y + Math.min(a.h, NODE_H) / 2;
  const yb = b.w === BAR ? Math.min(b.y + b.h - 8, Math.max(b.y + 8, ya)) : b.y + Math.min(b.h, NODE_H) / 2;
  const x1 = a.x + a.w;
  const x2 = b.x;
  const dx = Math.max(16, (x2 - x1) / 2);
  return `M${x1},${ya} C${x1 + dx},${ya} ${x2 - dx},${yb} ${x2},${yb}`;
}

/* --- the page ------------------------------------------------------------ */

const CLASSES = ['262', '268', '266', '281', '130', '45', '47', '11', '329', '84', '310', '309', '171'];
let HOST = null;
let M = null;          /* the model */
let LAY = null;        /* its layout */
let SCALE = 1;
let PICK = null;       /* the traced box */
let READ_AT = null;

const SVGNS = 'http://www.w3.org/2000/svg';

function paint() {
  const view = HOST.querySelector('.nj-topo-view');
  const sizer = HOST.querySelector('.nj-topo-sizer');
  const canvas = HOST.querySelector('.nj-topo-canvas');
  canvas.textContent = '';
  if (!M) { sizer.style.width = sizer.style.height = '0'; return; }
  LAY = layout(M, Math.max(720, view.clientWidth - 2));
  canvas.style.width = LAY.width + 'px';
  canvas.style.height = LAY.height + 'px';
  canvas.style.transform = `scale(${SCALE})`;
  /* A transform does not change the size the view scrolls over: the sizer
     around the canvas does. */
  sizer.style.width = Math.ceil(LAY.width * SCALE) + 'px';
  sizer.style.height = Math.ceil(LAY.height * SCALE) + 'px';
  view.style.height = Math.min(Math.round(LAY.height * SCALE) + 24, Math.round(window.innerHeight * 0.8)) + 'px';

  for (const h of LAY.heads) {
    const t = el('div', 'nj-topo-head' + (h.mid ? ' mid' : ''), h.text);
    Object.assign(t.style, { left: h.x + 'px', width: h.mid ? 'auto' : h.w + 'px' });
    canvas.append(t);
  }
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'nj-topo-lines');
  svg.setAttribute('width', LAY.width);
  svg.setAttribute('height', LAY.height);
  for (const e of M.edges) {
    const a = LAY.pos[e.from];
    const b = LAY.pos[e.to];
    if (!a || !b) continue;
    const p = document.createElementNS(SVGNS, 'path');
    const na = M.nodes.get(e.from);
    const nb = M.nodes.get(e.to);
    p.setAttribute('d', edgeLine(a, b));
    p.setAttribute('class', 'nj-topo-line' + (na.off || nb.off ? ' off' : '') + (na.ghost || nb.ghost ? ' ghost' : ''));
    p.dataset.from = e.from;
    p.dataset.to = e.to;
    svg.append(p);
  }
  canvas.append(svg);

  for (const [id, nd] of M.nodes) {
    const p = LAY.pos[id];
    if (!p) continue;
    const box = el('button', 'nj-tb ' + nd.origin + (nd.bar ? ' bar' : '') + (nd.off ? ' off' : '')
      + (nd.ghost ? ' ghost' : '') + (nd.unused ? ' unused' : ''));
    box.type = 'button';
    box.dataset.id = id;
    Object.assign(box.style, { left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px' });
    if (nd.bar) {
      box.append(el('span', 'nj-tb-bar', nd.title));
    } else {
      box.append(el('strong', null, nd.title));
      if (nd.sub) box.append(el('span', 'nj-tb-sub', nd.sub));
      for (const c of nd.chips) {
        const chip = el('span', 'nj-tb-chip' + (c.cls ? ' ' + c.cls : ''), c.text);
        if (c.tip) chip.title = c.tip;
        box.append(chip);
      }
    }
    box.title = [nd.title, nd.sub, nd.tip, nd.off ? 'Stored, not used: nothing of it reaches the router.' : '']
      .filter(Boolean).join('\n');
    box.addEventListener('click', (ev) => { ev.stopPropagation(); pick(PICK === id ? null : id); });
    box.addEventListener('keydown', (ev) => move(ev, id));
    canvas.append(box);
  }
  pick(PICK && M.nodes.has(PICK) ? PICK : null);
}

/* Light the path of one box and dim the rest; null clears it. */
function pick(id) {
  PICK = id;
  const lit = id ? trace(M, id) : null;
  for (const b of HOST.querySelectorAll('.nj-tb')) {
    b.classList.toggle('nj-lit', !!lit && lit.has(b.dataset.id));
    b.classList.toggle('nj-dim', !!lit && !lit.has(b.dataset.id));
    b.setAttribute('aria-pressed', String(b.dataset.id === id));
  }
  for (const p of HOST.querySelectorAll('.nj-topo-line')) {
    const on = !!lit && lit.has(p.dataset.from) && lit.has(p.dataset.to);
    p.classList.toggle('nj-lit', on);
    p.classList.toggle('nj-dim', !!lit && !on);
  }
}

/* The arrow keys: up and down in a column, left and right along the lines
   (or to the nearest box of the next column). */
function move(ev, id) {
  const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  const d = dirs[ev.key];
  if (!d) return;
  ev.preventDefault();
  const here = LAY.pos[id];
  const col = M.nodes.get(id).col;
  const at = (x) => LAY.pos[x];
  let next = null;
  if (d === 'up' || d === 'down') {
    const same = [...M.nodes.keys()].filter((x) => M.nodes.get(x).col === col && at(x) && x !== id)
      .filter((x) => (d === 'up' ? at(x).y < here.y : at(x).y > here.y))
      .sort((a, b) => (d === 'up' ? at(b).y - at(a).y : at(a).y - at(b).y));
    next = same[0];
  } else {
    const linked = M.edges.filter((e) => (d === 'right' ? e.from === id : e.to === id)).map((e) => (d === 'right' ? e.to : e.from))
      .filter((x) => at(x));
    const pool = linked.length ? linked : [...M.nodes.keys()].filter((x) => at(x) && (d === 'right' ? at(x).x > here.x : at(x).x < here.x));
    pool.sort((a, b) => Math.abs(at(a).x - here.x) - Math.abs(at(b).x - here.x) || Math.abs(at(a).y - here.y) - Math.abs(at(b).y - here.y));
    next = pool[0];
  }
  const b = next && HOST.querySelector(`.nj-tb[data-id="${CSS.escape(next)}"]`);
  if (b) { b.focus(); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
}

function zoom(to) {
  SCALE = Math.max(0.35, Math.min(1.6, to));
  paint();
}

function wireView(view) {
  /* Drag the empty canvas to move; Ctrl + wheel to zoom. */
  let drag = null;
  view.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.nj-tb') || e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, l: view.scrollLeft, t: view.scrollTop, moved: false };
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    view.scrollLeft = drag.l - dx;
    view.scrollTop = drag.t - dy;
  });
  view.addEventListener('pointerup', () => {
    if (drag && !drag.moved && PICK) pick(null);
    drag = null;
  });
  view.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoom(SCALE * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
  }, { passive: false });
}

async function readTopology() {
  const status = HOST.querySelector('.nj-topo-status');
  M = null;
  status.textContent = 'Reading the MIB…';
  paint();
  const mib = {};
  let ok = true;
  for (const c of CLASSES) {
    status.textContent = `Reading class ${c}…`;
    mib[c] = await readMib(c);
    if (c === '47' || c === '268') ok = ok && mib[c].ok;
  }
  /* The queues, one by one: only those a GEM port points at. */
  const queues = new Map();
  const want = [...new Set(((mib['268'] && mib['268'].instances) || []).map((g) => num(attrOf(g, 'UsTraffMgmtPtr'))))]
    .filter(isSet);
  for (const q of want) {
    status.textContent = `Reading queue ${hex4(q)}…`;
    const d = await readMib('277', q.toString(16));
    const inst = d.instances[0];
    const rel = inst ? num(attrOf(inst, 'RelatedPort')) : null;
    queues.set(q, { pri: rel === null ? null : rel & 0xffff });
  }
  M = topology(mib, queues);
  READ_AT = new Date();
  status.textContent = ok ? `Read at ${READ_AT.toLocaleTimeString()}.` : 'The MIB could not be read whole: what was read is drawn.';
  if (![...M.nodes.values()].some((nd) => nd.col !== 'fibre')) status.textContent = 'The OLT has set up nothing yet.';
  paint();
}

function renderTopology() {
  const host = $('#nj-topology');
  if (!host) return;
  if (!HOST) {
    HOST = host;
    const card = el('div', 'cbi-section nj-topo');
    card.append(el('h3', null, 'From the fibre to the ports'));
    const bar = el('div', 'nj-topo-bar');
    const again = el('button', 'nj-quick', 'Read now');
    again.type = 'button';
    again.addEventListener('click', readTopology);
    bar.append(el('span', 'nj-topo-status nj-note'), again);
    const view = el('div', 'nj-topo-view');
    const sizer = el('div', 'nj-topo-sizer');
    sizer.append(el('div', 'nj-topo-canvas'));
    view.append(sizer);
    const tools = el('div', 'nj-topo-tools');
    for (const [t, label, f] of [['+', 'Zoom in', () => zoom(SCALE * 1.2)], ['−', 'Zoom out', () => zoom(SCALE / 1.2)],
      ['⤢', 'Fit the width', () => zoom(LAY ? (view.clientWidth - 8) / LAY.width : 1)]]) {
      const b = el('button', 'nj-quick', t);
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', f);
      tools.append(b);
    }
    const legend = el('p', 'nj-topo-legend');
    for (const [cls, text] of [['olt', 'created by the OLT'], ['onu', 'created by this stick'], ['off', 'stored, not used'],
      ['ghost', 'a pointer to nothing']]) {
      const k = el('span', 'nj-key');
      k.append(el('i', 'nj-key-box ' + cls), document.createTextNode(text));
      legend.append(k);
    }
    legend.append(el('span', 'nj-topo-hint', 'Click a box to trace its path. Drag to move, Ctrl + wheel or the buttons '
      + 'to zoom; the arrow keys move between boxes.'));
    card.append(bar, view, tools, legend);
    host.append(card);
    wireView(view);
    let w = 0;
    new ResizeObserver(() => { if (M && Math.abs(view.clientWidth - w) > 40) { w = view.clientWidth; paint(); } }).observe(view);
  }
  readTopology();
}

export { renderTopology, topology, layout, trace };
