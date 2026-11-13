/*
 * Nijika UI: what the pages read, and the plain functions that turn the
 * answers of confd into figures. No DOM here, so scripts/nijika-check.mjs
 * can run every function on a recorded answer.
 *
 * The answers are the ones odi-ui reads too (docs/API.md): /api/init for the
 * stored values and the firmware, /api/status for diag and the /proc lines,
 * /api/ntp for the clock, /api/omci for the MIB.
 */

import { get } from './dom.js';
import { parseOmci, attr } from './omci.js';

/* diag echoes each command after its prompt, so the reply splits back into
   one section per command on that marker. */
function sections(raw) {
  const out = {};
  for (const p of String(raw || '').split('RTK.0> ')) {
    const nl = p.indexOf('\n');
    if (nl > 0) out[p.slice(0, nl).trim()] = p.slice(nl + 1);
  }
  return out;
}

const first = (s, re) => { const m = re.exec(s || ''); return m ? m[1] : null; };
const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/* `mib dump counter port all` as { port: { counter: value } }. */
function parsePorts(text) {
  const ports = {};
  let cur = null;
  for (const line of String(text || '').split('\n')) {
    const p = /^Port:\s*(\d+)/.exec(line);
    if (p) { cur = p[1]; ports[cur] = {}; continue; }
    const kv = /^(\w+)\s*:\s*(\d+)\s*$/.exec(line);
    if (kv && cur !== null) ports[cur][kv[1]] = Number(kv[2]);
  }
  return ports;
}

/* "  14792 kB" -> bytes. */
const kb = (s) => { const v = first(s, /(\d+)\s*kB/); return v === null ? null : Number(v) * 1024; };

/* The value after "name<tabs>: " in a /proc/cpuinfo line, as confd passes it. */
const afterColon = (s) => (typeof s === 'string' ? s.replace(/^[^:]*:\s*/, '').trim() || null : null);

/*
 * One /api/status answer as figures. Everything absent stays null: a stock
 * slot has no /proc/odi_gpon, the preview no cpuinfo, and a dash is the
 * honest reading of either.
 */
function parseStatus(j) {
  const s = sections(j && j.raw);
  const dbm = (k) => numOrNull(first(s['pon get transceiver ' + k], /:\s*(-?\d+(?:\.\d+)?)/));
  const alarms = (s['gpon get alarm-status'] || '').split('\n')
    .map((l) => /^\s*(\S+)\s+Alarm\s*:\s*(\S+)/i.exec(l)).filter(Boolean)
    .map((m) => ({ name: m[1], on: !/clear/i.test(m[2]) }));
  const up = first(j && j.uptime, /^\s*(\d+(?:\.\d+)?)/);
  const load = typeof (j && j.loadavg) === 'string' ? j.loadavg.trim().split(/\s+/).slice(0, 3).map(Number) : null;
  const link = typeof (j && j.host_link) === 'string' ? j.host_link.trim() : '';
  return {
    state: first(s['gpon get onu-state'], /Operation State\((O\d)\)/),
    rx: dbm('rx-power'),
    tx: dbm('tx-power'),
    temp: dbm('temperature'),
    volt: dbm('voltage'),
    alarms,
    los: alarms.some((a) => a.on && /^LO[SF]$/i.test(a.name)),
    ports: parsePorts(s['mib dump counter port all']),
    memTotal: kb(j && j.mem_total),
    memAvail: kb(j && j.mem_avail),
    uptime: up === null ? null : Number(up),
    load: load && load.length === 3 && load.every(Number.isFinite) ? load : null,
    hostname: typeof (j && j.hostname) === 'string' ? j.hostname.trim() || null : null,
    cpuModel: afterColon(j && j.cpu_model),
    systemType: afterColon(j && j.system_type),
    onuId: numOrNull(first(j && j.onu_id, /^\s*(\d+)/)),
    hostLink: link === '1' ? true : link === '0' ? false : null,
    hostMode: typeof (j && j.host_mode) === 'string' ? j.host_mode.trim() || null : null,
    chip: (j && j.chip_temp) || null,
    raw: j || {},
  };
}

/*
 * Rates between two polls of one port's octet counters, in bit/s. Port 2
 * faces the fibre (odi-ui flow.js): what it receives came down the fibre,
 * what it sends goes up. A counter that went backwards was reset, and that
 * sample gives no figure rather than a spike.
 */
function portRates(prev, cur, port = '2') {
  if (!prev || !cur || !prev.ports[port] || !cur.ports[port]) return null;
  const dt = (cur.at - prev.at) / 1000;
  if (dt < 1) return null;
  const r = (k) => {
    const d = (cur.ports[port][k] || 0) - (prev.ports[port][k] || 0);
    return d < 0 ? null : d * 8 / dt;
  };
  return { down: r('ifInOctets'), up: r('ifOutOctets') };
}

/*
 * CPU busy between two polls, from the cpu line of /proc/stat: everything
 * but idle and iowait. The previous line is passed in, not kept here: the
 * odi-ui views poll the same answer and keep their own (overview.js).
 */
function cpuBusy(prevLine, line) {
  const f = (l) => (typeof l === 'string' ? l.trim().split(/\s+/).map(Number) : null);
  const a = f(prevLine);
  const b = f(line);
  if (!a || !b || a.length < 4 || b.length < 4 || [...a, ...b].some((n) => !Number.isFinite(n))) return null;
  const tot = (x) => x.reduce((s, n) => s + n, 0);
  const idle = (x) => x[3] + (x[4] || 0);
  const dt = tot(b) - tot(a);
  return dt > 0 ? 100 * (1 - (idle(b) - idle(a)) / dt) : null;
}

/*
 * How full the downstream of the whole PON is, between two polls: the share
 * of each 125 us frame that was not idle GEM frames (five bytes each), with
 * the FEC parity taken out first. The method is odi-ui status.js ponLoad,
 * with the samples passed in rather than kept, for the same reason as above.
 * Null on the first poll and whenever the interval cannot be trusted: FEC
 * changed, the idle count went backwards, the idle register read full
 * meanwhile, the frame count moved more than the time allows, or the result
 * is outside 0 to 100 %.
 */
const PON_FRAME = 38880;
const PON_FEC_PARITY = 153 * 16;
function ponSample(st, at) {
  const sf = Number(st && st.ds_superframe);
  const sat = st && typeof st.ds_gem_idle_sat === 'string' ? Number(st.ds_gem_idle_sat) : 0;
  let idle = null;
  try { idle = BigInt(String(st && st.ds_gem_idle).trim()); } catch (e) { /* not there */ }
  if (!st || typeof st.ds_superframe !== 'string' || !Number.isFinite(sf) || !Number.isFinite(sat) || idle === null) return null;
  return { at, sf, idle, sat, fec: typeof st.ds_fec === 'string' ? st.ds_fec.trim() : '' };
}
function ponLoad(prev, cur) {
  if (!prev || !cur || cur.idle < prev.idle || cur.fec !== prev.fec || cur.sat !== prev.sat) return null;
  const frames = (cur.sf - prev.sf + 0x40000000) % 0x40000000;
  if (frames <= 0 || frames > (cur.at - prev.at) * 8 * 1.1 + 16) return null;
  const payload = PON_FRAME - (cur.fec === '1' ? PON_FEC_PARITY : 0);
  const used = payload - Number(cur.idle - prev.idle) * 5 / frames;
  const pct = 100 * used / payload;
  if (pct < 0 || pct > 100) return null;
  return { pct, mbps: used * 8 * 8000 / 1e6, of: payload * 8 * 8000 / 1e6 };
}

/* --- formatting ---------------------------------------------------------- */

/* A real minus sign, as odi-ui prints it. */
const signed = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);

function uptimeText(sec) {
  if (sec === null || !Number.isFinite(sec)) return null;
  sec = Math.floor(sec);
  const d = Math.floor(sec / 86400);
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor(sec / 60) % 60;
  const s = sec % 60;
  return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + m + 'm ' + s + 's';
}

/* bit/s as LuCI writes a rate: 800 Mbit/s, 76.4 kbit/s. */
function bitrate(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const u = ['bit/s', 'kbit/s', 'Mbit/s', 'Gbit/s'];
  let i = 0;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return (i && v < 10 ? v.toFixed(2) : i && v < 100 ? v.toFixed(1) : v.toFixed(0)) + ' ' + u[i];
}

const kib = (b) => Math.round(b / 1024) + 'K';

/* "00e04c867001" or "00:e0:4c:86:70:01" -> "00-e0-4c-86-70-01". */
function macText(v) {
  const h = String(v || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  return h.length === 12 ? h.match(/../g).join('-') : (v || null);
}

/*
 * The ONU serial number as an OLT shows it: four letters of vendor and eight
 * hex digits. The store holds either that, or all sixteen hex digits.
 */
function serialText(v) {
  const s = String(v || '').trim();
  if (/^[0-9a-fA-F]{16}$/.test(s)) {
    const vendor = s.slice(0, 8).match(/../g).map((x) => parseInt(x, 16));
    if (vendor.every((c) => c >= 0x20 && c < 0x7f)) {
      return String.fromCharCode(...vendor) + s.slice(8).toUpperCase();
    }
    return s.toUpperCase();
  }
  return s || null;
}

/* "0x414c434c" -> "ALCL"; the hex as it came when it is not four letters. */
function vendorText(v) {
  const h = String(v || '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{8}$/.test(h)) return v || null;
  const c = h.match(/../g).map((x) => parseInt(x, 16));
  return c.every((x) => x > 0x20 && x < 0x7f) ? String.fromCharCode(...c) : '0x' + h;
}

/*
 * The host lane, as the classic Nijika pages put it: the line rate, the mode,
 * and the stock LAN_SDS_MODE number. The number shown is the stored one when
 * it is a number of the running mode (4 and 5 are both HiSGMII here), else
 * the usual number of that mode.
 */
const SDS_NAMES = ['GE/FE PHY', 'Fiber 1G', 'SGMII PHY', 'SGMII MAC',
  'HiSGMII PHY', 'HiSGMII MAC', '2500BaseX', 'SGMII Force'];
const MODE_SDS = { fiber1g: [1], hisgmii: [4, 5], '2500basex': [6] };
const MODE_RATE = { fiber1g: '1000Mbps', hisgmii: '2500Mbps', '2500basex': '2500Mbps' };
function laneText(mode, sdsStored) {
  if (!mode || !MODE_SDS[mode]) return mode || null;
  const stored = Number(sdsStored);
  const n = MODE_SDS[mode].includes(stored) ? stored : MODE_SDS[mode][0];
  return `${MODE_RATE[mode]} / ${SDS_NAMES[n]} (${n})`;
}

/*
 * A PLOAM password typed as its ten characters, as an ISP gives it, turned
 * into the twenty hex digits the store keeps (GPON_PLOAM_PASSWD is hex20:
 * "1234567890" is 31323334353637383930). Null for anything else, the hex
 * form itself included: ten characters can only be the text.
 */
function ploamHex(v) {
  const t = String(v || '');
  if (t.length !== 10 || !/^[\x20-\x7e]{10}$/.test(t)) return null;
  return [...t].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/* --- the MIB ------------------------------------------------------------- */

/*
 * Which VLANs the OLT let through, and to which side of the stick.
 *
 * ME 84 (VLAN tagging filter data) has the entity id of the bridge port
 * (ME 47) it filters, and the port's TPType says what it ends in: 1 a PPTP
 * Ethernet UNI, 11 the VEIP. A VLAN filtered on the ANI side of a bridge
 * (an 802.1p mapper or a GEM interworking point) belongs to every UNI on
 * that bridge, so the VLANs are gathered per bridge and given the UNI kinds
 * of the bridge they are on. VID 4096 is "any", not a VLAN.
 *
 * Both the stock and the odi-oss dump shapes come through parseOmci; numbers
 * are 11 in one and 0x0b in the other, so every id is read with Number().
 */
const UNI_KIND = { 1: 'PPTP', 11: 'VEIP' };
function vlanMap(me47, me84) {
  const ports = new Map();
  for (const inst of (me47 && me47.instances) || []) {
    const id = Number(inst.id || attr(inst, 'EntityID'));
    if (!Number.isFinite(id)) continue;
    ports.set(id, { bridge: Number(attr(inst, 'BridgeIdPtr')), tp: Number(attr(inst, 'TPType')) });
  }
  const bridgeVids = new Map();
  for (const inst of (me84 && me84.instances) || []) {
    const port = ports.get(Number(inst.id || attr(inst, 'EntityID')));
    if (!port) continue;
    for (const [k, v] of inst.attrs) {
      if (!/^FilterTbl/i.test(k)) continue;
      const vid = Number(first(v, /VID\s*(\d+)/));
      if (!Number.isFinite(vid) || vid >= 4095) continue;
      if (!bridgeVids.has(port.bridge)) bridgeVids.set(port.bridge, new Set());
      bridgeVids.get(port.bridge).add(vid);
    }
  }
  const out = new Map();
  for (const [bridge, vids] of bridgeVids) {
    const kinds = new Set();
    for (const p of ports.values()) if (p.bridge === bridge && UNI_KIND[p.tp]) kinds.add(UNI_KIND[p.tp]);
    for (const vid of vids) {
      if (!out.has(vid)) out.set(vid, new Set());
      for (const k of kinds) out.get(vid).add(k);
    }
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0])
    .map(([vid, kinds]) => ({ vid, kinds: ['PPTP', 'VEIP'].filter((k) => kinds.has(k)) }));
}

/* --- fetching ------------------------------------------------------------ */

async function readMib(me) {
  try {
    const r = await get('/api/omci?' + new URLSearchParams({ cmd: 'me', me }).toString());
    return { ok: r.ok !== false, ...parseOmci(r.raw || '') };
  } catch (e) {
    return { ok: false, error: String(e.message || e), name: '', instances: [] };
  }
}

/* The OLT vendor and the VLAN map, read once a page asks: three omcicli
   forks, so never on the poll. */
async function readLine() {
  const olt = await readMib('131');
  const me47 = await readMib('47');
  const me84 = await readMib('84');
  const inst = olt.instances[0];
  return {
    olt: inst ? vendorText(attr(inst, 'OltVendorId')) : null,
    vlans: vlanMap(me47, me84),
    ok: olt.ok && me47.ok && me84.ok,
  };
}

export {
  sections, parsePorts, parseStatus, portRates, signed, uptimeText, bitrate, kib, macText,
  serialText, vendorText, laneText, vlanMap, readLine, readMib, ponSample, ponLoad, cpuBusy, SDS_NAMES, ploamHex,
};
