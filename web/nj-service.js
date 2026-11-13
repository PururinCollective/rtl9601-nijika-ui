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
 *   281 multicast GEM interworking TP         the same, for a multicast port
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
 *   lanes:   [{ bridge, uni, kind, router, olt, action, vid, gems: [{ gem, alloc }], notes, blocked, source }]
 *   fallbacks: footnotes: what is dropped, by which UNIs, and the HGU ports
 *   the stick has not; notes: a VLAN on two bridges.
 */
function serviceMap(mib, manual) {
  const list = (c) => ((mib[c] && mib[c].instances) || []);
  const ports = list('47').map((i) => ({
    id: idOf(i), bridge: n(attrOf(i, 'BridgeIdPtr')), tp: n(attrOf(i, 'TPType')), ptr: n(attrOf(i, 'TPPointer')),
  })).filter((p) => p.id !== null);
  const iw = (i) => ({
    id: idOf(i), ctp: n(attrOf(i, 'GemCtpPtr')), opt: n(attrOf(i, 'IwOpt')), sp: n(attrOf(i, 'ServProPtr')),
  });
  const iwtps = list('266').map(iw);
  /* A bridge port of TPType 6 names a multicast GEM interworking TP, class
     281, not a 266. */
  const mciwtps = list('281').map(iw);
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

  /* The GEM ports behind a fibre-side bridge port: { gem, alloc }, alloc
     null for a GEM port with no T-CONT, which carries downstream only
     (broadcast, multicast). */
  const gemsOf = (p) => {
    let ws = [];
    if (p.tp === 3) ws = iwtps.filter((w) => w.opt === 5 && w.sp === p.ptr);
    else if (p.tp === 5) ws = iwtps.filter((w) => w.id === p.ptr);
    else if (p.tp === 6) ws = mciwtps.filter((w) => w.id === p.ptr);
    return ws.map((w) => {
      const c = ctps.get(w.ctp) || {};
      return { gem: c.port ?? null, alloc: c.tcont !== undefined ? (tconts.get(c.tcont) ?? null) : null };
    }).filter((g) => g.gem !== null);
  };

  const byBridge = new Map();
  for (const p of ports) {
    if (!byBridge.has(p.bridge)) byBridge.set(p.bridge, []);
    byBridge.get(p.bridge).push(p);
  }

  const bridges = [];
  const lanes = [];
  const said = new Map();      /* a footnote -> the UNIs it is about */
  const say = (text, uni) => { if (!said.has(text)) said.set(text, new Set()); said.get(text).add(uni); };
  const away = [];             /* UNIs of the HGU layout the stick has not */
  for (const [bid, bp] of [...byBridge.entries()].sort((a, b) => a[0] - b[0])) {
    const unis = bp.filter((p) => p.tp === 1 || p.tp === 11).map((p) => {
      const kind = p.tp === 1 ? 'PPTP' : 'VEIP';
      /* The stick has one Ethernet port, 0x0101; the Luna HGU layout adds
         0x0102..0x0104 for an OLT that expects four, with nothing behind. */
      const extra = kind === 'PPTP' && p.ptr >= 0x0102 && p.ptr <= 0x0104;
      return { kind, me: p.ptr, port: p.id, delivered: !extra };
    });
    const ani = bp.filter((p) => p.tp === 3 || p.tp === 5 || p.tp === 6)
      .map((p) => ({ ...p, gems: gemsOf(p), vids: (filters.get(p.id) || {}).vids || null }));
    const mcast = ani.some((p) => p.tp === 6);
    const aniVids = [...new Set(ani.flatMap((a) => a.vids || []))].filter((v) => v < 4095);
    /* The GEM ports a VID travels on: those of the fibre-side ports whose
       filter admits it, every one when none names it. */
    const gemsFor = (vid) => {
      const by = vid === null || vid === undefined ? [] : ani.filter((a) => a.vids && a.vids.includes(vid));
      const seen = new Set();
      return (by.length ? by : ani).flatMap((a) => a.gems).filter((g) => !seen.has(g.gem) && seen.add(g.gem));
    };
    bridges.push({ id: bid, unis, gems: ani.flatMap((a) => a.gems), filters: ani.filter((a) => a.vids), mcast });

    for (const u of unis) {
      const uni = `${u.kind} ${hex4(u.me)}`;
      if (!u.delivered) { away.push(u.me); continue; }
      const base = { bridge: bid, uni, kind: u.kind, delivered: true };
      const tables = ext.filter((e) => (e.type === 2 && u.kind === 'PPTP' && e.point === u.me)
        || (e.type === 10 && u.kind === 'VEIP' && e.point === u.me)
        || (e.type === 0 && e.point === u.port));
      if (manual && manual.on) {
        lanes.push({ ...base, router: 'untagged', olt: vlan(manual.vid), action: '+ tag', source: 'manual VLAN',
          gems: gemsFor(manual.vid), notes: [] });
        continue;
      }
      if (tables.length) {
        for (const t of tables) {
          for (const r of t.rules) {
            const l = ruleLane(r);
            if (l.fallback) { say(l.text, uni); continue; }
            if (l.action === 'drop') {
              say(`${l.from[0].toUpperCase() + l.from.slice(1)}${l.eth ? ' ' + l.eth : ''} frames are dropped.`, uni);
              continue;
            }
            const ln = { ...base, router: l.from, olt: l.to, action: l.action, vid: l.vid ?? null,
              source: `class 171 ${hex4(t.id)} rule ${r.index}`, gems: gemsFor(l.vid), notes: [] };
            if (l.eth) ln.notes.push(l.eth + ' only');
            if (l.pri !== null) ln.notes.push('priority ' + l.pri);
            /* omcid does not install a rule whose VID the fibre-side filter
               would not admit (apply_bridge.c). */
            if (l.vid !== undefined && l.vid !== null && aniVids.length && !aniVids.includes(l.vid)) {
              ln.notes.push(`VLAN ${l.vid} is not in the OLT's VLAN filter (${aniVids.join(', ')})`);
              ln.blocked = true;
            }
            /* The same rule twice in a table is one service. */
            if (!lanes.some((x) => x.bridge === bid && x.uni === uni && x.router === ln.router && x.olt === ln.olt
              && x.action === ln.action)) lanes.push(ln);
          }
        }
      } else if (aniVids.length) {
        for (const v of aniVids) {
          lanes.push({ ...base, router: vlan(v), olt: vlan(v), action: 'as is', vid: v, source: 'class 84 filter',
            gems: gemsFor(v), notes: [] });
        }
      } else {
        lanes.push({ ...base, router: 'any', olt: 'any', action: 'as is', vid: null, source: 'no VLAN rule',
          gems: gemsFor(null), notes: [] });
      }
    }
    if (mcast) {
      lanes.push({ bridge: bid, uni: 'multicast', kind: 'MCAST', delivered: true, router: 'as sent', olt: 'multicast',
        action: 'as is', gems: ani.filter((a) => a.tp === 6).flatMap((a) => a.gems), source: 'multicast GEM port',
        notes: [] });
    }
  }

  const footnotes = [...said.entries()].map(([text, us]) => `${text.replace(/\.$/, '')}: ${[...us].join(', ')}.`);
  if (away.length) {
    const ports = away.map((me) => me - 0x0100).sort((a, b) => a - b);
    footnotes.push(`LAN port${ports.length > 1 ? 's' : ''} ${ports.join(', ')} of the HGU layout `
      + `(PPTP ${away.map(hex4).join(', ')}): the OLT set ${ports.length > 1 ? 'them' : 'it'} up, `
      + 'and the stick has one port, so nothing reaches them.');
  }
  /* A VLAN on the PPTP and the VEIP bridge alike: which one carries it up
     is the Luna service order (nijika order pptp|veip|mib, pptp by default);
     downstream both deliver. */
  const both = [];
  for (const l of lanes.filter((x) => x.kind === 'PPTP' && !x.blocked)) {
    if (lanes.some((x) => x.kind === 'VEIP' && !x.blocked && x.router === l.router) && !both.includes(l.router)) {
      both.push(l.router);
    }
  }
  const notes = both.length ? [`${both.join(' and ')} ${both.length > 1 ? 'are' : 'is'} on the PPTP and the VEIP `
    + 'bridge alike: upstream goes on the PPTP bridge\'s GEM port with the Luna default service order '
    + '(nijika order pptp), on the VEIP\'s with nijika order veip; downstream both deliver.'] : [];
  return { bridges, lanes, fallbacks: footnotes, notes };
}

/* What the router's WAN port has to send: the router side of every lane
   that reaches it, untagged first, then the VLANs in order. */
function routerNeeds(map) {
  const want = [...new Set(map.lanes.filter((l) => l.delivered && !l.blocked && l.action !== 'drop'
    && l.kind !== 'MCAST').map((l) => l.router))];
  const num = (x) => Number((/VLAN (\d+)/.exec(x) || [])[1]);
  return want.sort((a, b) => (Number.isFinite(num(a)) ? num(a) : -1) - (Number.isFinite(num(b)) ? num(b) : -1));
}

/* --- the page ------------------------------------------------------------ */

const CLASSES = ['47', '84', '171', '266', '281', '268', '262', '131'];

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
  /* "VLAN 209, 400, 500", or "untagged, VLAN 500". */
  const vl = needs.filter((x) => /^VLAN \d+$/.test(x)).map((x) => x.slice(5));
  const rest = needs.filter((x) => !/^VLAN \d+$/.test(x));
  const need = [...rest, ...(vl.length ? ['VLAN ' + vl.join(', ')] : [])].join(', ');
  big.append(el('span', 'nj-crumb', 'Your router’s WAN'),
    el('strong', null, need || (m.lanes.length ? 'Nothing reaches it' : 'No service yet')));
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
  m.lanes.forEach((l, i) => {
    const row = el('div', 'nj-lane c' + (l.kind === 'MCAST' ? 'm' : i % 4) + (l.delivered ? '' : ' off')
      + (l.blocked ? ' blocked' : '') + (l.action === 'drop' ? ' drop' : ''));
    const title = el('div', 'nj-lane-title');
    title.append(el('i', 'nj-lane-dot'), el('span', null, l.kind === 'MCAST' ? 'Multicast'
      : l.router === 'untagged' ? 'Untagged' : l.router), el('span', 'nj-lane-uni', l.uni));
    row.append(title);
    /* The GEM ports both ways with their T-CONT, then the ones that only
       come down (broadcast, multicast: no T-CONT). */
    const up = l.gems.filter((g) => g.alloc !== null);
    const down = l.gems.filter((g) => g.alloc === null);
    const gem = up.length ? 'GEM ' + up.map((g) => g.gem).join(', ') : '';
    const tc = [...new Set(up.map((g) => g.alloc))];
    const dn = down.length ? '\u2193 GEM ' + down.map((g) => g.gem).join(', ') : '';
    const sub = [gem, tc.length ? 'T-CONT ' + tc.join(', ') : '', dn].filter(Boolean).join(' · ');
    /* The fibre from the OLT to the stick, the cable from it to the router:
       the lane's line runs behind the three. */
    const track = el('div', 'nj-lane-track');
    track.append(pill('olt', l.olt === null ? '—' : l.olt, sub),
      pill('mid', l.action, l.uni), pill('router', l.router, l.delivered ? 'WAN' : 'not delivered'));
    row.append(track);
    const say = el('p', 'nj-lane-say');
    say.textContent = sentence(l) + (l.notes.length ? ' ' + l.notes.join('; ') + '.' : '');
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

export { renderService, serviceMap, ruleLane, routerNeeds, rulesOf, attrOf, attrDeep, n as num, idOf, hex4, fields };
