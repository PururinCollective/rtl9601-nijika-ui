// The Nijika UI functions that turn confd answers into figures (web/nj-data.js),
// run on recorded answers. No browser: nj-data.js has no DOM.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = await import(join(root, 'web', 'nj-data.js'));
const { parseOmci } = await import(join(root, 'web', 'omci.js'));

let failed = 0;
let n = 0;
function ok(cond, what) {
  n++;
  if (!cond) { failed++; console.log('  FAIL ' + what); }
}
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const fixture = (f) => readFileSync(join(root, 'scripts', 'fixtures', 'omci', f), 'utf8');

// One /api/status answer, in the shape the preview stubs give it.
const raw = [
  'RTK.0> pon get transceiver rx-power', '  Rx Power          : -18.42 dBm',
  'RTK.0> pon get transceiver tx-power', '  Tx Power          : 2.15 dBm',
  'RTK.0> pon get transceiver temperature', '  Temperature       : 45.50 C',
  'RTK.0> pon get transceiver voltage', '  Voltage           : 3.28 V',
  'RTK.0> gpon get onu-state', '  Operation State(O5)',
  'RTK.0> gpon get alarm-status', '  LOS Alarm         : clear', '  LOF Alarm         : clear',
  'RTK.0> mib dump counter port all',
  'Port: 0', 'ifInOctets                         : 1000', 'ifOutOctets                        : 2000',
  'Port: 2', 'ifInOctets                         : 5000', 'ifOutOctets                        : 700', '',
].join('\n');
const st = D.parseStatus({
  raw, mem_total: '          27508 kB', mem_avail: '      14792 kB', uptime: '93784.51 90210.33',
  loadavg: '0.08 0.12 0.09 1/43 812', hostname: 'NIJIKA-Luna\n', cpu_model: '\t\t: RLX5281 V0.2',
  system_type: '\t\t: Realtek RTL9602C (ODI DFP-34X-2C2)', host_link: '1', host_mode: 'hisgmii', onu_id: '13',
});
eq([st.state, st.rx, st.tx, st.temp, st.volt], ['O5', -18.42, 2.15, 45.5, 3.28], 'diag figures');
eq([st.los, st.alarms.length], [false, 2], 'alarms read, none asserted');
eq(st.ports['2'], { ifInOctets: 5000, ifOutOctets: 700 }, 'port counters');
eq([st.memTotal, st.memAvail], [27508 * 1024, 14792 * 1024], 'memory');
eq([st.uptime, st.load, st.hostname], [93784.51, [0.08, 0.12, 0.09], 'NIJIKA-Luna'], 'uptime, load, host name');
eq([st.cpuModel, st.systemType], ['RLX5281 V0.2', 'Realtek RTL9602C (ODI DFP-34X-2C2)'], 'cpuinfo lines');
eq([st.hostLink, st.hostMode, st.onuId], [true, 'hisgmii', 13], 'host side and ONU-ID');

const lost = D.parseStatus({ raw: 'RTK.0> gpon get alarm-status\n  LOS Alarm         : occur\n' });
eq([lost.los, lost.state, lost.rx, lost.uptime, lost.load], [true, null, null, null, null], 'LOS, and absent figures stay null');

// Rates: bit/s from the fibre port, nothing over a reset.
const a = { at: 0, ports: { 2: { ifInOctets: 1000, ifOutOctets: 100 } } };
const b = { at: 2000, ports: { 2: { ifInOctets: 3000, ifOutOctets: 50 } } };
eq(D.portRates(a, b), { down: 8000, up: null }, 'rates, a reset counter gives no figure');
eq(D.portRates(null, b), null, 'no rate on the first poll');

// CPU and PON load between two polls, from samples passed in.
eq(D.cpuBusy(' 100 0 100 800 0', ' 200 0 150 850 0'), 75, 'CPU busy: everything but idle and iowait');
eq(D.cpuBusy(null, ' 200 0 150 850 0'), null, 'no CPU figure on the first poll');
const p0 = D.ponSample({ ds_superframe: '1000', ds_gem_idle: '0', ds_fec: '0' }, 0);
const p1 = D.ponSample({ ds_superframe: '9000', ds_gem_idle: String(8000 * 38880 / 5 / 2), ds_fec: '0' }, 1000);
const pl = D.ponLoad(p0, p1);
eq([Math.round(pl.pct), Math.round(pl.mbps * 100) / 100], [50, 1244.16], 'PON load: half the frames idle is half in use');
eq(D.ponLoad(p1, p0), null, 'an idle count going backwards gives no figure');
eq(D.ponSample({ ds_gem_idle: '5' }, 0), null, 'no superframe count, no sample');

// Formatting.
eq(D.uptimeText(93784.51), '1d 2h 3m 4s', 'uptime');
eq(D.uptimeText(59), '0m 59s', 'uptime under a minute');
eq([D.bitrate(800e6), D.bitrate(76400), D.bitrate(512)], ['800 Mbit/s', '76.4 kbit/s', '512 bit/s'], 'bit rates');
eq(D.macText('00e04c867001'), '00-e0-4c-86-70-01', 'MAC from the store');
eq(D.macText('00:E0:4C:86:70:01'), '00-e0-4c-86-70-01', 'MAC with colons');
eq(D.serialText('4857544312345678'), 'HWTC12345678', 'serial in hex');
eq(D.serialText('HWTC12345678'), 'HWTC12345678', 'serial as letters');
eq(D.serialText('4F44490012345678'), '4F44490012345678', 'serial whose vendor is not letters');
eq(D.vendorText('0x414c434c'), 'ALCL', 'OLT vendor');
eq(D.laneText('hisgmii', '4'), '2500Mbps / HiSGMII PHY (4)', 'lane, stored 4');
eq(D.laneText('hisgmii', '5'), '2500Mbps / HiSGMII MAC (5)', 'lane, stored 5');
eq(D.laneText('hisgmii', '1'), '2500Mbps / HiSGMII PHY (4)', 'lane, stored number of another mode');
eq(D.laneText('fiber1g'), '1000Mbps / Fiber 1G (1)', 'lane, Fiber 1G');

// The VLAN map. Stock dumps: an ANI-side filter belongs to both UNIs of its bridge.
const me47 = parseOmci(fixture('47-MacBriPortCfgData-isp1.txt'));
const me84 = parseOmci(fixture('84-VlanTagFilterData.txt'));
eq(D.vlanMap(me47, me84), [{ vid: 75, kinds: ['PPTP', 'VEIP'] }, { vid: 1600, kinds: ['PPTP', 'VEIP'] }],
  'VLANs per bridge, stock dump');
// The odi-oss dump shape: hex numbers, two bridges, a filter on a UNI port.
const odi47 = parseOmci([
  '47 MacBriPortCfgData 1', '    BridgeIdPtr              0001', '    PortNum                  01', '    TPType                   01', '    TPPointer                0101',
  '47 MacBriPortCfgData 2', '    BridgeIdPtr              0001', '    PortNum                  02', '    TPType                   03', '    TPPointer                0001',
  '47 MacBriPortCfgData 3', '    BridgeIdPtr              0002', '    PortNum                  01', '    TPType                   0b', '    TPPointer                0601',
  '47 MacBriPortCfgData 4', '    BridgeIdPtr              0002', '    PortNum                  02', '    TPType                   03', '    TPPointer                0002',
  '4 rows', ''].join('\n'));
const odi84 = parseOmci([
  '=================================', 'EntityID: 0x0002', 'FilterTbl[0]: PRI 0,CFI 0, VID 500', 'FilterTbl[1]: PRI 0,CFI 0, VID 209', 'FwdOp:  0x10', 'NumOfEntries: 2', '=================================',
  '=================================', 'EntityID: 0x0004', 'FilterTbl[0]: PRI 0,CFI 0, VID 209', 'FilterTbl[1]: PRI 0,CFI 0, VID 4096', 'FwdOp:  0x10', 'NumOfEntries: 2', '=================================',
  ''].join('\n'));
eq(D.vlanMap(odi47, odi84), [{ vid: 209, kinds: ['PPTP', 'VEIP'] }, { vid: 500, kinds: ['PPTP'] }],
  'VLANs per bridge, odi-oss dump, VID 4096 is not a VLAN');
eq(D.vlanMap({ instances: [] }, me84), [], 'no bridge ports, no VLANs');

// GPON > ONT Identity: the presets and what picking one writes.
const I = await import(join(root, 'web', 'nj-identity.js'));
const { PRESETS } = await import(join(root, 'web', 'nj-presets.js'));
const labels = PRESETS.map((p) => p.label);
eq(labels, [...labels].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())), 'presets listed by label');
eq(PRESETS.filter((p) => p.default).map((p) => p.name), ['hg8240h'], 'one default preset, the HG8240H');
eq(I.presetOf({ PON_VENDOR_ID: 'HWTC', GPON_ONU_MODEL: 'HG8240H', ONU_HW_VERSION: 'BF9.A' }).name, 'hg8240h',
  'stored values read as their preset');
eq(I.presetOf({ PON_VENDOR_ID: 'HWTC', GPON_ONU_MODEL: 'HG8240H', ONU_HW_VERSION: 'BF9.B' }), null,
  'another hardware version is Custom');
const hg = I.presetValues(PRESETS.find((p) => p.name === 'hg8240h'));
eq([hg.PON_VENDOR_ID, hg.GPON_ONU_MODEL, hg.HW_CWMP_PRODUCTCLASS, hg.ONU_HW_VERSION, hg.HW_HWVER, hg.OMCI_SW_VER1,
  hg.OMCI_SW_VER2, hg.OMCC_VER, hg.OMCI_TM_OPT, hg.OMCI_VENDOR_PRODUCT_CODE, hg.OMCI_UNKNOWN_ME_OK],
['HWTC', 'HG8240H', 'HG8240H', 'BF9.A', 'BF9.A', 'V3R017C10S100', 'V3R017C10S100', '128', '2', '15', '0'],
'the HG8240H preset writes the keys nijika ont writes');
eq('HW_SERIAL_NO' in hg, false, 'a preset leaves the device serial number alone');
eq([hg.OMCI_POTS_PORTS, I.presetValues(PRESETS.find((p) => p.name === 'nijika')).OMCI_POTS_PORTS,
  I.presetValues(PRESETS.find((p) => p.name === 'sk-g7220')).OMCI_POTS_PORTS], ['2', '0', '1'],
'a preset sets the phone ports the device has');
eq('OMCC_VER' in I.presetValues(PRESETS.find((p) => p.name === 'hg8240h5')), false,
  'a preset with no OMCC version keeps the stored one');
eq(I.fieldProblem(I.FIELDS.find((f) => f.id === 'vendor'), 'AB', null), 'exactly 4 characters', 'vendor id is 4 characters');
eq(I.fieldProblem(I.FIELDS.find((f) => f.id === 'vendor'), 'HWTC', null), null, 'a 4-character vendor id passes');

// GPON > ONT Authentication: a PLOAM password typed as its ten characters.
eq(D.ploamHex('1234567890'), '31323334353637383930', 'PLOAM: ten characters become twenty hex digits');
eq(D.ploamHex('31323334353637383930'), null, 'PLOAM: the hex form stays as it is');
eq(D.ploamHex('short'), null, 'PLOAM: anything but ten characters stays as it is');

// GPON > VLAN: the FwdOp override, in the format omcid reads.
const F = await import(join(root, 'web', 'nj-fwdop.js'));
eq(F.parseOverride('0x1102:0x00,4363 0xe104:2'), { ok: true, entries: [{ inst: 0x1102, code: 0 }, { inst: 4363, code: 2 },
  { inst: 0xe104, code: 2 }] }, 'override: hex, decimal, no code (0x02), commas and spaces');
eq(F.parseOverride('0x1102,0x1102:0x00').ok, false, 'override: an entity twice is malformed, as omcid has it');
eq(F.parseOverride('').entries, [], 'override: empty is none');
eq(F.formatOverride([{ inst: 0xe104, code: 0x10 }, { inst: 0x1102, code: 2 }]), '0x1102:0x02,0xe104:0x10',
  'override written by entity id, codes in full');
const rows = F.filterRows(me84, me47);
eq(rows.map((r) => [r.inst, r.olt, r.kind, r.vids.join(',')]), [[4, 0x10, 'PPTP+VEIP', '75'], [5, 0x10, 'PPTP+VEIP', '1600']],
  'VLAN filters as rows: entity, the OLT code, the side, the VIDs');

// Status > Service: class 171 rules as lanes, and the map from the MIB.
const SV = await import(join(root, 'web', 'nj-service.js'));
const rule = (fo, fi, to, ti) => ({ index: 0, fo, fi, to, ti });
const lane = (r) => { const l = SV.ruleLane(r); return [l.from, l.action, l.to]; };
eq(lane(rule({ PRI: 15, VID: 4096 }, { PRI: 15, VID: 4096, EthType: 0 }, { PRI: 15, VID: 0, RemoveTags: 0 }, { PRI: 0, VID: 500 })),
  ['untagged', '+ tag', 'VLAN 500'], 'rule: untagged, add VLAN 500');
eq(lane(rule({ PRI: 15, VID: 4096 }, { PRI: 8, VID: 10 }, { PRI: 15, VID: 0, RemoveTags: 1 }, { PRI: 8, VID: 500 })),
  ['VLAN 10', 'swap', 'VLAN 500'], 'rule: VLAN 10 swapped to 500');
eq(lane(rule({ PRI: 15 }, { PRI: 8, VID: 500 }, { PRI: 15, RemoveTags: 0 }, { PRI: 15 })),
  ['VLAN 500', 'as is', 'VLAN 500'], 'rule: VLAN 500 as it is');
eq(lane(rule({ PRI: 15 }, { PRI: 8, VID: 500 }, { PRI: 15, RemoveTags: 1 }, { PRI: 15 })),
  ['VLAN 500', '\u2212 tag', 'untagged'], 'rule: VLAN 500 untagged to the OLT');
eq(lane(rule({ PRI: 15 }, { PRI: 8, VID: 4096 }, { PRI: 15, RemoveTags: 1 }, { PRI: 8, VID: 4096 })),
  ['any VLAN', 'as is', 'any VLAN'], 'rule: any VLAN re-tagged with its own VID is as it is');
eq(lane(rule({ PRI: 15 }, { PRI: 15 }, { PRI: 15, RemoveTags: 3 }, { PRI: 15 })), ['untagged', 'drop', null], 'rule: untagged dropped');
const dflt = SV.ruleLane(rule({ PRI: 15 }, { PRI: 14 }, { PRI: 15, RemoveTags: 3 }, { PRI: 15 }));
eq([dflt.fallback, dflt.discard], ['single', true], 'rule: the single-tag default that drops');
eq(SV.ruleLane(rule({ PRI: 15 }, { PRI: 15, EthType: 2 }, { PRI: 15, RemoveTags: 0 }, { PRI: 0, VID: 35 })).eth, 'PPPoE',
  'rule: an EtherType filter is said');
const svcMib = { 47: me47, 84: me84, 171: parseOmci(fixture('171-isp1.txt')), 266: parseOmci(fixture('266-GemIwTp-isp1.txt')),
  268: parseOmci(['268 GemPortCtp 2', '    PortID                   0403', '    TcAdapterPtr             8001', '1 rows', ''].join('\n')),
  262: parseOmci(['262 Tcont 32769', '    AllocID                  0400', '1 rows', ''].join('\n')) };
const isp1 = SV.serviceMap(svcMib, { on: false });
eq(isp1.lanes.map((l) => [l.uni, l.router, l.action, l.olt, !!l.blocked]),
  [['PPTP 0x0101', 'untagged', '+ tag', 'VLAN 1', true], ['multicast', 'as sent', 'as is', 'multicast', false]],
  'ISP1: one lane on the UNI, held by the fibre-side filter, and multicast');
eq(isp1.lanes[0].gems.some((g) => g.gem === 1027 && g.alloc === 1024), true, 'ISP1: GEM port and T-CONT through the mapper');
eq(isp1.fallbacks.includes('Any other VLAN is dropped: PPTP 0x0101, VEIP 0x0601.'), true,
  'ISP1: the default rules, once, with the UNIs they are on');
const man = SV.serviceMap(svcMib, { on: true, vid: 110 });
eq(man.lanes.filter((l) => l.kind !== 'MCAST').map((l) => [l.uni, l.router, l.action, l.olt]),
  [['PPTP 0x0101', 'untagged', '+ tag', 'VLAN 110'], ['VEIP 0x0601', 'untagged', '+ tag', 'VLAN 110']],
  'manual VLAN: the stick tags 110 on every UNI');
eq(SV.routerNeeds(man), ['untagged'], 'manual VLAN: the router sends untagged');
const hgu47 = parseOmci(['47 MacBriPortCfgData 9', '    BridgeIdPtr              0002', '    TPType                   01',
  '    TPPointer                0102', '1 rows', ''].join('\n'));
const hgu = SV.serviceMap({ 47: hgu47 }, { on: false });
eq([hgu.lanes.length, hgu.fallbacks.some((f) => /^LAN port 2 of the HGU layout/.test(f))], [0, true],
  'an HGU LAN port the stick does not have is a footnote, not a lane');
// A line with the same VLAN on the PPTP and the VEIP bridge, the GEM port of each VLAN through its mapper port.
const two47 = parseOmci(['47 MacBriPortCfgData 257', '    BridgeIdPtr              0101', '    TPType                   01', '    TPPointer                0101',
  '47 MacBriPortCfgData 4354', '    BridgeIdPtr              0101', '    TPType                   03', '    TPPointer                1102',
  '47 MacBriPortCfgData 3585', '    BridgeIdPtr              0e01', '    TPType                   0b', '    TPPointer                0a01',
  '47 MacBriPortCfgData 57602', '    BridgeIdPtr              0e01', '    TPType                   03', '    TPPointer                e102',
  '4 rows', ''].join('\n'));
const two266 = parseOmci(['266 GemIwTp 263', '    GemCtpPtr                0107', '    IwOpt                    05', '    ServProPtr               1102',
  '266 GemIwTp 264', '    GemCtpPtr                0108', '    IwOpt                    05', '    ServProPtr               e102', '2 rows', ''].join('\n'));
const two268 = parseOmci(['268 GemPortCtp 263', '    PortID                   0107', '    TcAdapterPtr             8000',
  '268 GemPortCtp 264', '    PortID                   0108', '    TcAdapterPtr             8001', '2 rows', ''].join('\n'));
const two84 = parseOmci(['=================================', 'EntityID: 0x1102', 'FilterTbl[0]: PRI 0,CFI 0, VID 500', 'FwdOp:  0x10', 'NumOfEntries: 1',
  '=================================', '=================================', 'EntityID: 0xe102', 'FilterTbl[0]: PRI 0,CFI 0, VID 500', 'FwdOp:  0x10',
  'NumOfEntries: 1', '=================================', ''].join('\n'));
const two = SV.serviceMap({ 47: two47, 266: two266, 268: two268, 84: two84 }, { on: false });
eq(two.lanes.map((l) => [l.uni, l.router, l.gems.map((g) => g.gem).join(',')]),
  [['PPTP 0x0101', 'VLAN 500', '263'], ['VEIP 0x0a01', 'VLAN 500', '264']], 'each bridge its own GEM port for VLAN 500');
eq(two.notes.length, 1, 'a VLAN on both bridges says which one carries it up');

// Status > OMCI Topology: the MIB as columns, the path a box is on, what is not used.
const T = await import(join(root, 'web', 'nj-topology.js'));
const odi = (rows) => parseOmci(rows.concat([`${rows.filter((r) => !r.startsWith(' ')).length} rows`, '']).join('\n'));
const topoMib = {
  262: odi(['262 Tcont 32768', '    AllocID                  0107', '    Policy                   01',
    '262 Tcont 32769', '    AllocID                  0108', '    Policy                   01',
    '262 Tcont 32770', '    AllocID                  00ff', '    Policy                   00']),
  268: odi(['268 GemPortCtp 263', '    PortID                   0107', '    TcAdapterPtr             8000', '    Direction                03',
    '    UsTraffMgmtPtr           8000',
    '268 GemPortCtp 264', '    PortID                   0108', '    TcAdapterPtr             8001', '    Direction                03',
    '    UsTraffMgmtPtr           8008']),
  266: odi(['266 GemIwTp 263', '    GemCtpPtr                0107', '    IwOpt                    05', '    ServProPtr               1102',
    '266 GemIwTp 264', '    GemCtpPtr                0108', '    IwOpt                    05', '    ServProPtr               e102']),
  130: odi(['130 Map8021pServProf 4354', ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `    IwTpPtrPbit${i}             0107`),
    '130 Map8021pServProf 57602', ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `    IwTpPtrPbit${i}             0108`)]),
  45: odi(['45 MacBriServProf 257', '    SpanTreeInd              00', '45 MacBriServProf 3585', '    SpanTreeInd              00',
    '45 MacBriServProf 258', '    SpanTreeInd              00']),
  47: odi(['47 MacBriPortCfgData 257', '    BridgeIdPtr              0101', '    TPType                   01', '    TPPointer                0101',
    '47 MacBriPortCfgData 4354', '    BridgeIdPtr              0101', '    TPType                   03', '    TPPointer                1102',
    '47 MacBriPortCfgData 3585', '    BridgeIdPtr              0e01', '    TPType                   0b', '    TPPointer                0a01',
    '47 MacBriPortCfgData 57602', '    BridgeIdPtr              0e01', '    TPType                   03', '    TPPointer                e102',
    '47 MacBriPortCfgData 258', '    BridgeIdPtr              0102', '    TPType                   01', '    TPPointer                0102',
    '47 MacBriPortCfgData 4610', '    BridgeIdPtr              0102', '    TPType                   03', '    TPPointer                1202']),
  11: odi(['11 EthUni 257', '    AdminState               00', '11 EthUni 258', '    AdminState               00']),
  329: odi(['329 VEIP 2561', '    AdminState               00']),
  84: parseOmci(['=================================', 'EntityID: 0xe102', 'FilterTbl[0]: PRI 0,CFI 0, VID 500', 'FwdOp:  0x10',
    'NumOfEntries: 1', '=================================', ''].join('\n')),
};
const topo = T.topology(topoMib, new Map([[0x8008, { pri: 7 }]]));
const nd = (id) => topo.nodes.get(id);
eq([nd('262/32768').title, nd('262/32769').title, nd('unused').title], ['Alloc-ID 263', 'Alloc-ID 264', '1 unused'],
  'topology: T-CONTs by Alloc-ID, the unset one folded');
eq(nd('262/32769').chips.map((c) => c.text), ['queue 0x8008 · prio 7'], 'topology: the queue a GEM port goes up through');
eq([nd('130/57602').sub, nd('47/57602').chips[0].text], ['p-bits 0\u20137 \u2192 GEM 264', 'VLAN 500'],
  'topology: a mapper names its GEM port, a bridge port its VLANs');
eq([...T.trace(topo, '268/264')].sort(), ['130/57602', '262/32769', '268/264', '329/2561', '45/3585', '47/3585', '47/57602', 'fibre'],
  'topology: the path of GEM 264, fibre to VEIP');
eq([nd('11/257').off, nd('329/2561').off, nd('11/258').off, nd('45/258').off], [false, false, true, true],
  'topology: the PPTP 0x0101 and the VEIP are used, an HGU LAN port is not');
eq(nd('ghost:130/4610').ghost, true, 'topology: a pointer to a mapper the MIB has not is a box of its own');
const lay = T.layout(topo, 1200);
eq(Object.keys(lay.pos).length, topo.nodes.size, 'topology: every box has a place');
eq(lay.pos['47/57602'].y >= lay.pos['45/3585'].y && lay.pos['47/57602'].y <= lay.pos['45/3585'].y + lay.pos['45/3585'].h, true,
  'topology: a bridge port sits in the band of its bridge');

console.log(failed ? `nijika check: ${failed} of ${n} failed` : `nijika check ok: ${n} checks`);
process.exit(failed ? 1 : 0);
