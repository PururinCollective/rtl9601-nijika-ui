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

console.log(failed ? `nijika check: ${failed} of ${n} failed` : `nijika check ok: ${n} checks`);
process.exit(failed ? 1 : 0);
