/*
 * Nijika UI: the shell. A LuCI-style page, the menu across the top and one
 * view under it, named by the location hash: #status/device.
 *
 * The menu is the classic Nijika page tree. A view is either a Nijika page
 * of its own (Status > Device, nj-device.js) or one odi-ui panel and sub,
 * which nijika.html carries with odi-ui's element ids, so the odi-ui modules
 * render into it as they do on their own page (/odi). This file does what
 * odi-ui app.js does there: load the data, wire the controls, poll the
 * status, and show what a view needs when it is opened.
 */

import { $, el, get, fail, wireTheme, wireHelp } from './dom.js';
import { S, EDITS } from './state.js';
import { renderStatus, lineFacts } from './status.js';
import { renderAll } from './config.js';
import { save, refreshSaveBar, renderIdentitySwitch } from './save.js';
import { renderFirmware, wireFirmware } from './firmware.js';
import { renderServices } from './services.js';
import { renderMeBrowser } from './mebrowser.js';
import { renderPhone, wirePhone, hideSecrets } from './phone.js';
import { wireRestore } from './restore.js';
import { renderL2 } from './l2.js';
import { renderTools } from './tools.js';
import { renderHostlink, wireHostlink } from './hostlink.js';
import { renderNetaddr, wireNetaddr } from './netaddr.js';
import { checkForUpdate, wireUpdates, renderUpdateSwitch } from './updates.js';
import { wireWizard, wizardSeen, renderSetupEntry } from './wizard.js';
import { checkAuth, showAuth, savePassword, renderSshKeys, addSshKey, resetConfig } from './nj-account.js';
import { parseStatus, ploamHex } from './nj-data.js';
import { renderFwdop } from './nj-fwdop.js';
import { renderService } from './nj-service.js';
import { renderTopology } from './nj-topology.js';
import { renderDevice } from './nj-device.js';
import { renderIdentity, wireIdentity, resetIdentity } from './nj-identity.js';

/*
 * The page tree. A view names the odi-ui panel and subs it shows (`subs`),
 * the config subtabs whose unsaved edits it counts (`config`, which also
 * offers Full help), and what to read when it is opened (`show`).
 */
const MENU = [
  { id: 'status', title: 'Status', items: [
    { id: 'device', title: 'Device', page: renderDevice },
    { id: 'service', title: 'Service', panel: 'p-omci', subs: ['o-services'], show: () => { renderService(); renderServices(); } },
    { id: 'topology', title: 'OMCI Topology', panel: 'p-omci', subs: ['o-mib'], show: () => { renderTopology(); renderMeBrowser(); } },
    { id: 'phone', title: 'Phone', panel: 'p-omci', subs: ['o-phone'], show: () => renderPhone() },
    { id: 'hood', title: 'Under the hood', panel: 'p-status' },
  ] },
  { id: 'network', title: 'Network', items: [
    { id: 'lan', title: 'LAN', panel: 'p-config', subs: ['c-network'], config: ['network'] },
    { id: 'route', title: 'Route', panel: 'p-config', subs: ['c-network'], config: [] },
  ] },
  { id: 'gpon', title: 'GPON', items: [
    { id: 'auth', title: 'ONT Authentication', panel: 'p-config', subs: ['c-line'], config: ['line'] },
    { id: 'identity', title: 'ONT Identity', panel: 'p-config', subs: ['c-identity'], config: ['identity'] },
    { id: 'vlan', title: 'VLAN', panel: 'p-config', subs: ['c-vlan'], config: ['vlan'], show: () => renderFwdop() },
    { id: 'advanced', title: 'Advanced', panel: 'p-config', subs: ['c-other', 'c-stock'], config: ['other', 'stock'] },
  ] },
  { id: 'system', title: 'System', items: [
    { id: 'management', title: 'Management', panel: 'p-system', subs: ['s-access'], show: () => renderSshKeys() },
    { id: 'backup', title: 'Backup & Reset', panel: 'p-system', subs: ['s-backup'] },
    { id: 'firmware', title: 'Firmware Update', panel: 'p-system', subs: ['s-firmware'],
      show: () => { renderFirmware(); renderUpdateSwitch(); } },
    { id: 'advanced', title: 'Advanced', panel: 'p-config', subs: ['c-services'], config: ['services'] },
    { id: 'logs', title: 'Logs', panel: 'p-system', subs: ['s-logs'], show: () => renderTools() },
  ] },
];
const HOME = 'status/device';

/* odi-ui views by their own hash, from its links and modules (Show on
   Status, Host port settings), a bookmark, or a sign-in that kept one; and
   the names odi-ui itself still maps (app.js OLD). */
const ODI = {
  config: 'gpon/auth', omci: 'status/service',
  'config/line': 'gpon/auth', 'config/vlan': 'gpon/vlan', 'config/identity': 'gpon/identity',
  'config/network': 'network/lan', 'config/services': 'system/advanced', 'config/other': 'gpon/advanced',
  'config/stock': 'gpon/advanced', 'omci/services': 'status/service', 'omci/mib': 'status/topology',
  'omci/phone': 'status/phone', 'system/firmware': 'system/firmware', 'system/access': 'system/management',
  'system/backup': 'system/backup', 'system/logs': 'system/logs',
  advanced: 'gpon/advanced', services: 'status/service', mib: 'status/topology', tools: 'system/logs',
  admin: 'system/management', firmware: 'system/firmware',
};

/* Where the default-password notice is loud rather than a header chip. */
const LOUD = ['status/device', 'system/management'];

const POLL_MS = 5000;

/* What the Nijika pages read: /api/init once, /api/status on the poll. */
const ctx = { init: null, status: null, prev: null, clock: null };

/* --- session ------------------------------------------------------------- */

/* A 401 from the stick means the session ended: back to the sign-in page,
   keeping the view. Only the stick's own answers count (odi-ui app.js
   watchSession; a 401 from GitHub, the release check, is not ours). */
function watchSession() {
  const inner = window.fetch;
  window.fetch = async (...args) => {
    const r = await inner.apply(window, args);
    if (r && r.status === 401 && typeof r.url === 'string' && r.url.startsWith(location.origin + '/')) {
      location.href = '/login' + location.hash;
    }
    return r;
  };
}

/* --- menu ---------------------------------------------------------------- */

const isNarrow = () => matchMedia('(max-width: 767px)').matches;

function renderMenu() {
  const nav = $('#menu');
  nav.textContent = '';
  for (const sec of MENU) {
    const li = el('li', 'dropdown');
    li.dataset.sec = sec.id;
    const top = el('a', 'menu');
    top.append(el('span', null, sec.title));
    top.href = '#' + sec.id + '/' + sec.items[0].id;
    top.setAttribute('aria-haspopup', 'true');
    /* A touch screen has no hover: the first tap opens the list. */
    top.addEventListener('click', (e) => {
      if (matchMedia('(hover: hover)').matches && !isNarrow()) return;
      e.preventDefault();
      const open = !li.classList.contains('open');
      for (const o of nav.querySelectorAll('li.open')) o.classList.remove('open');
      li.classList.toggle('open', open);
    });
    const ul = el('ul', 'dropdown-menu');
    for (const it of sec.items) {
      const a = el('a');
      a.append(el('span', null, it.title));
      a.href = '#' + sec.id + '/' + it.id;
      a.dataset.view = sec.id + '/' + it.id;
      const item = el('li');
      item.append(a);
      ul.append(item);
    }
    li.append(top, ul);
    nav.append(li);
  }
}

function wireMenu() {
  $('#menutoggle').addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    $('#menutoggle').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#menu')) for (const o of document.querySelectorAll('#menu li.open')) o.classList.remove('open');
  });
}

/*
 * Unsaved edits, on the menu: odi-ui counts them on its (hidden) config
 * subtabs, and each view that shows one of those adds them up, as does its
 * section. Read again whenever odi-ui changes a count.
 */
function markPending() {
  const per = {};
  for (const b of document.querySelectorAll('#p-config .subtabs [data-sub]')) {
    const n = b.querySelector('.pending');
    per[b.dataset.sub] = n ? Number(n.textContent) || 0 : 0;
  }
  for (const sec of MENU) {
    let total = 0;
    for (const it of sec.items) {
      const c = (it.config || []).reduce((s, g) => s + (per[g] || 0), 0);
      total += c;
      badge($(`#menu a[data-view="${sec.id}/${it.id}"]`), c);
    }
    badge($(`#menu li[data-sec="${sec.id}"] > a.menu`), total);
  }
}
function badge(a, n) {
  if (!a) return;
  let b = a.querySelector('.nj-count');
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = el('span', 'nj-count'); a.append(b); }
  b.textContent = String(n);
  b.title = n + ' unsaved';
}

/* --- views --------------------------------------------------------------- */

let VIEW = null;
let PAGE = null;

function find(view) {
  const [s, i] = view.split('/');
  const sec = MENU.find((m) => m.id === s);
  const it = sec && sec.items.find((x) => x.id === i);
  return sec && it ? { sec, it } : null;
}

function route() {
  let h = location.hash.replace(/^#/, '');
  if (ODI[h]) { h = ODI[h]; history.replaceState(null, '', '#' + h); }
  if (!find(h)) {
    /* A bare section lands on its first page, anything else on the home. */
    const sec = MENU.find((m) => m.id === h.split('/')[0]);
    h = sec ? sec.id + '/' + sec.items[0].id : HOME;
  }
  if (h === VIEW) return;
  const { sec, it } = find(h);
  if (PAGE && PAGE.leave) PAGE.leave();
  PAGE = null;
  VIEW = h;
  document.body.dataset.view = h;

  for (const a of document.querySelectorAll('#menu a[data-view]')) a.classList.toggle('active', a.dataset.view === h);
  for (const li of document.querySelectorAll('#menu > li')) {
    li.classList.toggle('active', li.dataset.sec === sec.id);
    li.classList.remove('open');
  }
  document.body.classList.remove('menu-open');
  $('#menutoggle').setAttribute('aria-expanded', 'false');

  $('#crumb').textContent = sec.title;
  $('#title').textContent = it.title;
  document.title = it.title + ' - ' + (hostname() || 'Nijika Luna');

  /* One odi-ui panel, and in it only this view's subs. */
  for (const p of document.querySelectorAll('main > .panel, #nj-device')) p.hidden = true;
  for (const s of document.querySelectorAll('main > .panel > .sub')) s.hidden = true;
  if (it.page) {
    const host = $('#nj-device');
    host.textContent = '';
    host.hidden = false;
    PAGE = it.page(host, { sec, it }, ctx) || null;
    if (PAGE && PAGE.update && ctx.status) PAGE.update(ctx);
  } else {
    $('#' + it.panel).hidden = false;
    for (const id of it.subs || []) {
      /* odi-ui hides its Other subtab when no key lands there. */
      if (id === 'c-other' && $('#st-config-other').hidden) continue;
      $('#' + id).hidden = false;
    }
  }
  $('#helptoggle').hidden = !(it.config && it.config.length);
  if (h !== 'status/phone') hideSecrets();
  showAuth(LOUD.includes(h));
  if (it.show) it.show();
  window.scrollTo(0, 0);
}

function go(view) {
  if (location.hash === '#' + view) route(); else location.hash = view;
}

/* GPON > ONT Authentication: the serial number and PLOAM password, or the
   LOID, one tab each over the same odi-ui rows (nijika.css hides the rest). */
function wireAuthTabs() {
  const tabs = [...document.querySelectorAll('#auth-tabs [role=tab]')];
  const pick = (b) => {
    for (const t of tabs) {
      const on = t === b;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    document.body.dataset.authtab = b.dataset.authtab;
  };
  for (const t of tabs) t.addEventListener('click', () => pick(t));
  pick(tabs[0]);
}

/*
 * GPON > ONT Authentication: the serial number and the PLOAM password take
 * the form the store keeps when the field is left, not while it is typed
 * in. odi-ui turns a serial typed as 16 hex digits into its letters at every
 * keystroke: its input handler is held back for these two fields, and its
 * change handler, which runs when the field is left, does that and records
 * the edit. A PLOAM password typed as its ten characters is turned into the
 * twenty hex digits first.
 */
const ON_LEAVE = ['f-GPON_SN', 'f-GPON_PLOAM_PASSWD'];
function wireLineFields() {
  document.addEventListener('input', (e) => { if (ON_LEAVE.includes(e.target.id)) e.stopPropagation(); }, true);
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id !== 'f-GPON_PLOAM_PASSWD') return;
    const text = t.value;
    const h = ploamHex(text);
    if (!h) return;
    t.value = h;
    const aside = t.parentElement && t.parentElement.querySelector('.s-aside');
    if (aside) aside.textContent = 'Reads as \u201c' + text + '\u201d';
  }, true);
}

/* System > Advanced > Show Expert settings: kept in this browser, on <html>
   as data-expert (read before first paint, in nijika.html). On, the expert
   settings are shown, open, GPON > Advanced is in the menu and each row
   shows its key name; off, nijika.css hides all three. */
const EXPERT_KEY = 'nijika-expert';
const expertOn = () => document.documentElement.dataset.expert === 'on';
function setExpert(on) {
  if (on) document.documentElement.dataset.expert = 'on'; else delete document.documentElement.dataset.expert;
  try { localStorage.setItem(EXPERT_KEY, on ? '1' : '0'); } catch (e) { /* not kept */ }
  $('#nj-expert').value = on ? 'on' : 'off';
  $('#expert').open = on;
}
function wireExpert() {
  const s = $('#nj-expert');
  s.value = expertOn() ? 'on' : 'off';
  s.addEventListener('change', () => setExpert(s.value === 'on'));
}

/* --- header -------------------------------------------------------------- */

const hostname = () => (ctx.status && ctx.status.hostname) || null;

function brand() {
  const name = hostname();
  if (name) $('#hostname').textContent = name;
}

/* --- poll ---------------------------------------------------------------- */

/*
 * One /api/status a poll, for every view: odi-ui draws its status panel,
 * the header pill and the chip bar from it (renderStatus), the setup wizard
 * decides from it, and the Nijika page reads the same answer.
 */
let TIMER = null;
/* One poll at a time: confd answers one request at a time, and a tab coming
   back to view must not start a second poll beside a running one. */
let BUSY = false;
async function poll() {
  clearTimeout(TIMER);
  if (BUSY || S.REBOOTING) return;
  BUSY = true;
  try {
    const j = await get('/api/status');
    if (j.error) throw new Error(j.error);
    const st = parseStatus(j);
    st.at = Date.now();
    ctx.prev = ctx.status;
    ctx.status = st;
    renderStatus(j.raw, j.chip_temp, j);
    brand();
    if (PAGE && PAGE.update) PAGE.update(ctx);
    $('#err').hidden = true;
    await wizardSeen(lineFacts(j.raw));
  } catch (e) {
    fail(e);
  }
  BUSY = false;
  if (!document.hidden && !S.REBOOTING) TIMER = setTimeout(poll, POLL_MS);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

/* --- start --------------------------------------------------------------- */

function wire() {
  $('#filter').oninput = () => renderAll();
  $('#save').onclick = save;
  $('#services-reload').onclick = () => { renderService(); renderServices(true); };
  $('#pw-save').onclick = savePassword;
  $('#sshkey-add').onclick = addSshKey;
  $('#reset-go').onclick = resetConfig;
  $('#l2-load').onclick = renderL2;
  $('#gopassword').onclick = () => { go('system/management'); $('#pw-pass').focus(); };
  $('#discard').onclick = () => {
    EDITS.clear(); renderAll(); refreshSaveBar(); $('#saveout').textContent = ''; resetIdentity();
  };
  wireRestore();
  wirePhone();
  wireTheme();
  wireHelp();
  wireFirmware();
  wireHostlink();
  wireNetaddr();
  wireWizard();
  wireUpdates();
  wireAuthTabs();
  wireIdentity();
  wireLineFields();
  wireExpert();
  new MutationObserver(markPending).observe($('#p-config .subtabs'), { subtree: true, childList: true, characterData: true });
}

(async function start() {
  watchSession();
  renderMenu();
  wireMenu();
  wire();
  window.addEventListener('hashchange', route);
  let hostlink = null;
  try {
    /* As odi-ui app.js: two requests, /api/static (the image files, usually
       a 304) and /api/init (what the device holds). */
    const [st, init, ntp] = await Promise.all([get('/api/static'), get('/api/init'), get('/api/ntp').catch(() => null)]);
    S.SCHEMA = st.schema;
    S.DEFAULTS = st.defaults;
    S.VALUES = init.values;
    S.FW = init.firmware || {};
    hostlink = init.hostlink || null;
    for (const m of st.meta) S.META[m.name] = m;
    for (const r of st.settings) S.SETTINGS[r.name] = r;
    for (const c of st.consumers) S.CONS[c.name] = c;
    for (const b of st.baseline) S.BASELINE[b.name] = b.value;
    for (const f of st.features) (S.FEATURES[f.mask] ||= []).push(f);
    ctx.init = init;
    if (ntp && Number.isFinite(ntp.now)) ctx.clock = { now: ntp.now, at: Date.now(), ntp: ntp.ntp };
    $('#build').textContent = S.FW.confd || '';
    renderAll();
    renderIdentitySwitch();
    renderIdentity();
    if (expertOn()) $('#expert').open = true;
  } catch (e) { fail(e); }
  route();
  await checkAuth(S.FW);
  renderSetupEntry();
  await renderHostlink(hostlink);
  await renderNetaddr();
  /* Not awaited: a browser that cannot reach GitHub must not delay the page. */
  checkForUpdate();
  markPending();
  poll();
}());
