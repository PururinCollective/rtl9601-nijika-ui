/*
 * Nijika UI: Status > Service. What the OLT built on this ONU, as services:
 * one lane per service, the operator's side (the OLT: its VLAN, the GEM
 * ports and T-CONT) to this stick (what it does with the tag) to the router
 * (the VLAN its WAN port uses), and first the one line the router needs.
 *
 * The idea of drawing it so (lanes from the OLT through the module to the
 * router, named by the router's VLAN) is the Peter-Pon Connection page's;
 * this is drawn anew, from the MIB the OLT wrote, read the way odi-oss omcid
 * reads it to build its bridges (apply_bridge.c, extvlan.c):
 *
 *   47  MAC bridge port configuration data   the bridges and what each port
 *                                             ends in (TPType: 1 a PPTP
 *                                             Ethernet UNI, 11 the VEIP,
 *                                             3 an 802.1p mapper, 5 a GEM
 *                                             interworking TP, 6 multicast)
 *   266 GEM interworking TP                   its GEM port CTP, and the
 *                                             mapper it hangs off (IwOpt 5)
 *   268 GEM port network CTP                  the GEM port id and T-CONT
 *   262 T-CONT                                the allocation id
 *   84  VLAN tagging filter data              the VIDs a bridge port admits
 *   171 extended VLAN tagging operation       what the stick does to a tag:
 *                                             one lane per rule
 *
 * The manual VLAN of the config store (VLAN_CFG_TYPE 1 and VLAN_MANU_MODE 1)
 * takes the place of class 171 in omcid, and the page says so.
 *
 * Read on demand: eight omcicli reads, about half a second.
 */

import { $, el } from './dom.js';
import { S } from './state.js';
import { readMib } from './nj-data.js';

/* --- the MIB, pure, for make check --------------------------------------- */

const attrOf = (inst, key) => {
  const k = key.toLowerCase();
  const hit = inst.attrs.find(([n]) => n.toLowerCase() === k);
  return hit ? hit[1] : undefined;
};
const n = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  if (/^-?\d+$/.test(s)) return Number(s);
  return null;
};
/* An attribute that may sit after a sub-table: parseOmci keeps it in the
   last group (class 171's AssociatedMePoint follows its rule table). */
const attrDeep = (inst, key) => {
  const top = attrOf(inst, key);
  if (top !== undefined) return top;
  const k = key.toLowerCase();
  for (const g of inst.groups || []) {
    const hit = g.attrs.find(([a]) => a.toLowerCase() === k);
    if (hit) return hit[1];
  }
  return undefined;
};
const idOf = (inst) => n(inst.id !== undefined && inst.id !== '' ? inst.id : attrOf(inst, 'EntityID'));
const hex4 = (v) => '0x' + Number(v).toString(16).padStart(4, '0');

/* "PRI 15,VID 4096, TPID 0, EthType 0x00" -> { PRI: 15, VID: 4096, TPID: 0, EthType: 0 } */
function fields(text) {
  const out = {};
  for (const part of String(text || '').split(',')) {
    const m = /^\s*(\S+)\s+(\S+)\s*$/.exec(part);
    if (m) out[m[1]] = n(m[2]);
  }
  return out;
}

/* The rules of one class 171 instance, in table order. */
function rulesOf(inst) {
  const rules = [];
  for (const g of inst.groups || []) {
    if (!/^INDEX\b/i.test(g.label)) continue;
    const r = {};
    for (const [k, v] of g.attrs) r[k.toLowerCase().replace(/\s+/g, ' ').trim()] = fields(v);
    rules.push({
      index: n(g.label.replace(/^INDEX\s*/i, '')),
      fo: r['filter outer'] || {}, fi: r['filter inner'] || {},
      to: r['treatment outer'] || {}, ti: r['treatment inner'] || {},
    });
  }
  return rules;
}

const ETH = { 1: 'IPoE', 2: 'PPPoE', 3: 'ARP', 4: 'IPv6', 5: 'EAPOL' };
const vlan = (v) => (v === null || v === undefined ? '?' : 'VLAN ' + v);

/*
 * One class 171 rule as a lane, in G.988 9.3.13 terms. `rx` is the side its
 * frames arrive from: the router when the table sits on the UNI, the OLT
 * when it sits on the fibre side (the lane is then read the other way).
 * Returns { what, router, olt, action, eth, pri } or a default: { fallback }.
 *   untagged rule      outer and inner filter PRI 15
 *   single-tag rule    outer PRI 15, inner PRI 0-8
 *   single default     outer PRI 15, inner PRI 14
 *   double-tag rule    outer PRI 0-8
 *   double default     outer and inner PRI 14
 * Treatment: RemoveTags 3 discards; a treatment PRI of 15 adds no tag; a
 * treatment VID of 4096 copies the inner VID, 4097 the outer.
 */
function ruleLane(r) {
  const { fo, fi, to, ti } = r;
  const discard = to.RemoveTags === 3;
  const remove = discard ? 0 : (to.RemoveTags || 0);
  const addOuter = to.PRI !== undefined && to.PRI !== 15;
  const addInner = ti.PRI !== undefined && ti.PRI !== 15;
  const eth = ETH[fi.EthType] || null;
  const pri = fi.PRI !== undefined && fi.PRI <= 7 ? fi.PRI : null;
  const tvid = (t, inner, outer) => (t === 4096 ? inner : t === 4097 ? outer : t);

  if (fo.PRI === 15 && fi.PRI === 14) {
    return { fallback: 'single', discard, text: discard ? 'Any other VLAN is dropped.' : 'Any other VLAN passes as it is.' };
  }
  if (fo.PRI === 14 && fi.PRI === 14) {
    return { fallback: 'double', discard, text: discard ? 'Any other double-tagged frame is dropped.'
      : 'Any other double-tagged frame passes as it is.' };
  }
  if (fo.PRI === 15 && fi.PRI === 15) {
    const from = 'untagged';
    if (discard) return { what: 'untagged', from, to: null, action: 'drop', eth, pri };
    if (addOuter && addInner) {
      return { what: 'untagged', from, to: `${vlan(tvid(to.VID))} / ${vlan(tvid(ti.VID))}`, action: '+ 2 tags', eth, pri };
    }
    if (addInner || addOuter) {
      const v = addInner ? ti.VID : to.VID;
      return { what: 'untagged', from, to: v >= 4096 ? 'tagged' : vlan(v), action: '+ tag', eth, pri, vid: v < 4096 ? v : null };
    }
    return { what: 'untagged', from, to: 'untagged', action: 'as is', eth, pri };
  }
  if (fo.PRI === 15) {
    const any = fi.VID === 4096 || fi.VID === undefined;
    const from = any ? 'any VLAN' : vlan(fi.VID);
    if (discard) return { what: 'single', from, to: null, action: 'drop', eth, pri };
    const left = 1 - Math.min(1, remove);
    if (remove >= 1 && !addInner && !addOuter) return { what: 'single', from, to: 'untagged', action: '− tag', eth, pri };
    if (remove === 0 && !addInner && !addOuter) {
      return { what: 'single', from, to: from, action: 'as is', eth, pri, vid: any ? null : fi.VID };
    }
    if (left === 0 && (addInner || addOuter) && !(addInner && addOuter)) {
      const t = addInner ? ti : to;
      const v = tvid(t.VID, fi.VID, fi.VID);
      const same = t.VID === 4096 || (!any && v === fi.VID);
      return { what: 'single', from, to: same ? from : vlan(v), action: same ? 'as is' : 'swap', eth, pri,
        vid: same ? (any ? null : fi.VID) : v };
    }
    if (left === 1 && (addInner || addOuter)) {
      const t = addOuter ? to : ti;
      return { what: 'single', from, to: `${vlan(tvid(t.VID, fi.VID, fi.VID))} / ${any ? 'its VLAN' : vlan(fi.VID)}`,
        action: '+ outer tag', eth, pri };
    }
    return { what: 'single', from, to: 'rewritten', action: 'rewrite', eth, pri };
  }
  const from = `${fo.VID === 4096 ? 'any' : vlan(fo.VID)} / ${fi.VID === 4096 ? 'any' : vlan(fi.VID)}`;
  if (discard) return { what: 'double', from, to: null, action: 'drop', eth, pri };
  return { what: 'double', from, to: 'rewritten', action: remove ? '− ' + remove + ' tag' : 'rewrite', eth, pri };
}

/*
 * The service map. `mib` holds the parsed dumps by class ('47', '84', ...);
 * `manual` the config store's manual VLAN { on, vid }. Returns
 *   bridges: [{ id, unis: [{ kind, me, port, delivered, why }], gems, filters }]
 *   lanes:   [{ bridge, uni, router, olt, action, gems, tconts, notes, delivered, source }]
 *   fallbacks: the default rules, in words; notes: about the whole map.
 */
function serviceMap(mib, manual) {
  const list = (c) => ((mib[c] && mib[c].instances) || []);
  const ports = list('47').map((i) => ({
    id: idOf(i), bridge: n(attrOf(i, 'BridgeIdPtr')), tp: n(attrOf(i, 'TPType')), ptr: n(attrOf(i, 'TPPointer')),
  })).filter((p) => p.id !== null);
  const iwtps = list('266').map((i) => ({
    id: idOf(i), ctp: n(attrOf(i, 'GemCtpPtr')), opt: n(attrOf(i, 'IwOpt')), sp: n(attrOf(i, 'ServProPtr')),
  }));
  const ctps = new Map(list('268').map((i) => [idOf(i), {
    /* omcid names the T-CONT pointer TcAdapterPtr (generated/omci_mib.c). */
    port: n(attrOf(i, 'PortID')), tcont: n(attrOf(i, 'TcAdapterPtr') ?? attrOf(i, 'TContPtr')),
  }]));
  const tconts = new Map(list('262').map((i) => [idOf(i), n(attrOf(i, 'AllocID') ?? attrOf(i, 'AllocId'))]));
  const filters = new Map(list('84').map((i) => [idOf(i), {
    vids: i.attrs.filter(([k]) => /^FilterTbl/i.test(k)).map(([, v]) => fields(v).VID).filter((v) => v !== null),
    fwdop: n(attrOf(i, 'FwdOp')),
  }]));
  const ext = list('171').map((i) => ({
    id: idOf(i), type: n(attrDeep(i, 'AssociationType')), point: n(attrDeep(i, 'AssociatedMePoint')), rules: rulesOf(i),
  }));

  /* The GEM ports behind an ANI-side bridge port, and their T-CONTs. */
  const gemsOf = (p) => {
    let ws = [];
    if (p.tp === 3) ws = iwtps.filter((w) => w.opt === 5 && w.sp === p.ptr);
    else if (p.tp === 5) ws = iwtps.filter((w) => w.id === p.ptr);
    return ws.map((w) => {
      const c = ctps.get(w.ctp) || {};
      return { gem: c.port ?? null, alloc: c.tcont !== undefined ? (tconts.get(c.tcont) ?? null) : null };
    });
  };

  const byBridge = new Map();
  for (const p of ports) {
    if (!byBridge.has(p.bridge)) byBridge.set(p.bridge, []);
    byBridge.get(p.bridge).push(p);
  }

  const bridges = [];
  const lanes = [];
  const fallbacks = [];
  const notes = [];
  for (const [bid, bp] of [...byBridge.entries()].sort((a, b) => a[0] - b[0])) {
    const unis = bp.filter((p) => p.tp === 1 || p.tp === 11).map((p) => {
      const kind = p.tp === 1 ? 'PPTP' : 'VEIP';
      /* The stick has one Ethernet port, 0x0101; the Luna HGU layout adds
         0x0102..0x0104 for an OLT that expects four, with nothing behind. */
      const extra = kind === 'PPTP' && p.ptr >= 0x0102 && p.ptr <= 0x0104;
      return { kind, me: p.ptr, port: p.id, delivered: !extra,
        why: extra ? 'LAN port ' + (p.ptr - 0x0100) + ' of the HGU layout: the stick has one port' : null };
    });
    const ani = bp.filter((p) => p.tp === 3 || p.tp === 5 || p.tp === 6);
    const gems = ani.flatMap(gemsOf);
    const mcast = ani.some((p) => p.tp === 6);
    const fl = bp.map((p) => ({ port: p.id, side: p.tp === 1 || p.tp === 11 ? 'uni' : 'ani', ...(filters.get(p.id) || {}) }))
      .filter((f) => f.vids !== undefined);
    const aniVids = [...new Set(fl.filter((f) => f.side === 'ani').flatMap((f) => f.vids))].filter((v) => v < 4095);
    bridges.push({ id: bid, unis, gems, filters: fl, mcast });
    if (!unis.length) continue;

    for (const u of unis) {
      const base = { bridge: bid, uni: `${u.kind} ${hex4(u.me)}`, kind: u.kind, delivered: u.delivered, why: u.why,
        gems: gems.map((g) => g.gem).filter((g) => g !== null),
        tconts: [...new Set(gems.map((g) => g.alloc).filter((a) => a !== null))] };
      const tables = ext.filter((e) => (e.type === 2 && u.kind === 'PPTP' && e.point === u.me)
        || (e.type === 10 && u.kind === 'VEIP' && e.point === u.me)
        || (e.type === 0 && e.point === u.port));
      if (manual && manual.on) {
        lanes.push({ ...base, router: 'untagged', olt: vlan(manual.vid), action: '+ tag', source: 'manual VLAN',
          notes: [] });
        continue;
      }
      if (tables.length) {
        for (const t of tables) {
          for (const r of t.rules) {
            const l = ruleLane(r);
            if (l.fallback) { fallbacks.push(`${base.uni}: ${l.text}`); continue; }
            const ln = { ...base, router: l.from, olt: l.to, action: l.action, source: `class 171 ${hex4(t.id)} rule ${r.index}`,
              notes: [] };
            if (l.eth) ln.notes.push(l.eth + ' only');
            if (l.pri !== null) ln.notes.push('priority ' + l.pri);
            /* omcid does not install a rule whose VID the fibre-side filter
               would not admit (apply_bridge.c). */
            if (l.vid !== undefined && l.vid !== null && aniVids.length && !aniVids.includes(l.vid)) {
              ln.notes.push(`VLAN ${l.vid} is not in the OLT's VLAN filter (${aniVids.join(', ')})`);
              ln.blocked = true;
            }
            lanes.push(ln);
          }
        }
      } else if (aniVids.length) {
        for (const v of aniVids) {
          lanes.push({ ...base, router: vlan(v), olt: vlan(v), action: 'as is', source: 'class 84 filter', notes: [] });
        }
      } else {
        lanes.push({ ...base, router: 'any', olt: 'any', action: 'as is', source: 'no VLAN rule', notes: [] });
      }
    }
    if (mcast) {
      lanes.push({ bridge: bid, uni: 'multicast', kind: 'MCAST', delivered: true, router: 'as sent', olt: 'multicast',
        action: 'as is', gems: [], tconts: [], source: 'multicast GEM port', notes: [] });
    }
  }
  /* The same router VLAN on two bridges: which one carries it up is the
     Luna service order (nijika order pptp|veip|mib). */
  const seen = new Map();
  for (const l of lanes.filter((x) => x.delivered && x.action !== 'drop')) {
    const k = l.router;
    if (seen.has(k) && seen.get(k) !== l.bridge) {
      notes.push(`${k} is on two bridges: which one carries it upstream is the service order (nijika order).`);
    }
    seen.set(k, l.bridge);
  }
  return { bridges, lanes, fallbacks: [...new Set(fallbacks)], notes: [...new Set(notes)] };
}

/* What the router's WAN port has to send: the router side of every lane
   that reaches it. */
function routerNeeds(map) {
  const want = map.lanes.filter((l) => l.delivered && !l.blocked && l.action !== 'drop' && l.kind !== 'MCAST')
    .map((l) => l.router);
  return [...new Set(want)];
}

/* --- the page ------------------------------------------------------------ */

const CLASSES = ['47', '84', '171', '266', '268', '262', '131'];

/* The OLT's maker, from the vendor id of its OLT-G (ME 131). */
const MAKERS = { ALCL: 'Nokia', HWTC: 'Huawei', ZTEG: 'ZTE', FHTT: 'FiberHome', CDKT: 'Calix', DLNK: 'D-Link',
  ADTN: 'Adtran', CIEN: 'Ciena', ISKT: 'Iskratel', ZNTS: 'Zhone', TPLG: 'TP-Link', UBNT: 'Ubiquiti' };
function oltName(dump) {
  const inst = dump && dump.instances && dump.instances[0];
  const h = String((inst && attrOf(inst, 'OltVendorId')) || '').replace(/^0x/i, '');
  if (!/^[0-9a-f]{8}$/i.test(h)) return null;
  const id = h.match(/../g).map((x) => String.fromCharCode(parseInt(x, 16))).join('');
  return /^[A-Z0-9]{4}$/.test(id) ? (MAKERS[id] || id) : null;
}

/* The three ends, drawn small: a building, the stick, a router. */
const ICONS = {
  olt: 'M5 21V5l7-3 7 3v16M9 21v-4h6v4M8 8h2M14 8h2M8 12h2M14 12h2',
  stick: 'M3 9h14l4 3-4 3H3zM7 9v6M17 12h2',
  router: 'M3 14h18v5H3zM7 17h.01M11 17h.01M8 14l-3-6M16 14l3-6',
};
function end(kind, name, sub) {
  const box = el('div', 'nj-end-node');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[kind]);
  svg.append(path);
  const ring = el('span', 'nj-end-icon');
  ring.append(svg);
  box.append(ring, el('strong', null, name), el('span', null, sub));
  return box;
}
let HOST = null;
let MAP = null;

function manualVlan() {
  const v = S.VALUES || {};
  const on = String(v.VLAN_CFG_TYPE) === '1' && String(v.VLAN_MANU_MODE) === '1';
  return { on, vid: on ? n(v.VLAN_MANU_TAG_VID) : null };
}

function pill(cls, main, sub) {
  const p = el('div', 'nj-pill ' + cls);
  p.append(el('span', 'nj-pill-main', main || '—'));
  if (sub) p.append(el('span', 'nj-pill-sub', sub));
  return p;
}

const ACTION_WORDS = {
  'as is': 'passes as it is', '+ tag': 'adds the tag', '− tag': 'takes the tag off', swap: 'swaps the VLAN',
  '+ outer tag': 'adds an outer tag', '+ 2 tags': 'adds two tags', drop: 'drops it', rewrite: 'rewrites the tags',
};

function sentence(l) {
  if (l.kind === 'MCAST') return 'Multicast from the OLT reaches the router as it is sent.';
  if (l.action === 'drop') return `${l.router} from the router is dropped here.`;
  const r = l.router === 'untagged' ? 'The router sends untagged frames' : `The router sends ${l.router}`;
  const o = l.olt === 'untagged' ? 'untagged' : l.olt;
  if (l.action === 'as is') return `${r}; the stick passes them as they are, ${o} to the OLT, and back.`;
  return `${r}; the stick ${ACTION_WORDS[l.action] || l.action}: ${o} to the OLT, and the reverse on the way back.`;
}

function draw() {
  if (!HOST) return;
  const head = HOST.querySelector('.nj-svc-head');
  const body = HOST.querySelector('.nj-svc-body');
  const foot = HOST.querySelector('.nj-svc-foot');
  head.textContent = '';
  body.textContent = '';
  foot.textContent = '';
  if (!MAP) { body.append(el('p', 'nj-note nj-pad', 'Reading the MIB…')); return; }

  const m = MAP.map;
  const needs = routerNeeds(m);
  const big = el('div', 'nj-router-need');
  big.append(el('span', 'nj-crumb', 'Your router’s WAN'),
    el('strong', null, needs.length ? needs.join(', ') : m.lanes.length ? 'Nothing reaches it' : 'No service yet'));
  const why = el('p', 'nj-note');
  why.textContent = MAP.manual.on
    ? `Untagged: this stick tags VLAN ${MAP.manual.vid} itself (VLAN mode manual, GPON > VLAN), in place of the OLT's VLAN translation.`
    : needs.length ? 'What the router’s WAN port sends and receives; the stick does the rest, as the lanes below show.'
      : m.lanes.length ? 'Every service the OLT built stops on the way: the lanes below say where.'
        : MAP.ok ? 'The OLT has provisioned no service on this ONU yet.' : 'The MIB could not be read.';
  head.append(big, why);

  if (!m.lanes.length) return;
  /* The three ends, the fibre and the cable between them, and what each
     third of a lane says. */
  const ends = el('div', 'nj-lane-track nj-ends');
  ends.append(end('olt', MAP.olt || 'The OLT', 'the operator'), end('stick', 'This stick', 'GPON SFP'),
    end('router', 'Your router', 'its WAN port'));
  const wires = el('div', 'nj-wires');
  wires.append(el('span', null, 'fibre'), el('span', null, 'cable'));
  ends.append(wires);
  const cols = el('div', 'nj-lane-track nj-lane-head');
  cols.append(el('span', null, 'What the OLT set up'), el('span', null, 'What the stick does'),
    el('span', null, 'What the router gets'));
  body.append(ends, cols);
  let k = 0;
  m.lanes.forEach((l, i) => {
    const row = el('div', 'nj-lane c' + (l.kind === 'MCAST' ? 'm' : i % 4) + (l.delivered ? '' : ' off')
      + (l.blocked ? ' blocked' : '') + (l.action === 'drop' ? ' drop' : ''));
    const title = el('div', 'nj-lane-title');
    title.append(el('i', 'nj-lane-dot'), el('span', null, l.kind === 'MCAST' ? 'Multicast' : 'Service ' + (++k)));
    row.append(title);
    const gem = l.gems.length ? 'GEM ' + l.gems.join(', ') : '';
    const tc = l.tconts.length ? 'T-CONT ' + l.tconts.join(', ') : '';
    /* The fibre from the OLT to the stick, the cable from it to the router:
       the lane's line runs behind the three. */
    const track = el('div', 'nj-lane-track');
    track.append(pill('olt', l.olt === null ? '—' : l.olt, [gem, tc].filter(Boolean).join(' · ')),
      pill('mid', l.action, l.uni), pill('router', l.router, l.delivered ? 'WAN' : 'not delivered'));
    row.append(track);
    const say = el('p', 'nj-lane-say');
    say.textContent = sentence(l) + (l.why ? ` Not delivered: ${l.why}.` : '')
      + (l.notes.length ? ' ' + l.notes.join('; ') + '.' : '');
    say.title = 'From ' + l.source + ', bridge ' + hex4(l.bridge);
    row.append(say);
    body.append(row);
  });
  for (const t of [...m.fallbacks, ...m.notes]) foot.append(el('p', null, t));
  if (!foot.childNodes.length) foot.hidden = true; else foot.hidden = false;
}

async function readService() {
  MAP = null;
  draw();
  const mib = {};
  let ok = true;
  for (const c of CLASSES) {
    mib[c] = await readMib(c);
    if (c === '47' || c === '171') ok = ok && mib[c].ok;
  }
  const manual = manualVlan();
  MAP = { map: serviceMap(mib, manual), manual, ok, olt: oltName(mib['131']) };
  draw();
}

function renderService() {
  const host = $('#nj-service');
  if (!host) return;
  if (!HOST) {
    HOST = host;
    const card = el('div', 'cbi-section nj-svc');
    /* Read again is the page's own button above it (nijika.js), for this
       card and the tables under it alike. */
    const h = el('h3', null, 'Services');
    card.append(h, el('div', 'nj-svc-head nj-pad'), el('div', 'nj-svc-body'), el('div', 'cbi-section-foot nj-svc-foot'));
    host.append(card);
  }
  readService();
}

export { renderService, serviceMap, ruleLane, routerNeeds, rulesOf };
