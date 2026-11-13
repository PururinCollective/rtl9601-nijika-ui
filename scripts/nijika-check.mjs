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

console.log(failed ? `nijika check: ${failed} of ${n} failed` : `nijika check ok: ${n} checks`);
process.exit(failed ? 1 : 0);
