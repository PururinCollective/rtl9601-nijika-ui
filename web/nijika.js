/*
 * Nijika UI: the shell. A LuCI-style page, the menu across the top and one
 * view under it, named by the location hash: #status/device.
 *
 * The menu is the classic Nijika page tree. Where a page is not built yet,
 * its entry opens the odi-ui view that does the same job (served at /odi),
 * so every setting stays reachable while the pages are written one by one.
 */

import { $, el, get, fail, wireTheme } from './dom.js';
import { parseStatus, signed } from './nj-data.js';
import { renderDevice } from './nj-device.js';

const MENU = [
  { id: 'status', title: 'Status', items: [
    { id: 'device', title: 'Device', page: renderDevice },
    { id: 'service', title: 'Service', odi: 'omci/services' },
    { id: 'topology', title: 'OMCI Topology', odi: 'omci/mib' },
    { id: 'phone', title: 'Phone', odi: 'omci/phone' },
    { id: 'hood', title: 'Under the hood', odi: 'status' },
  ] },
  { id: 'network', title: 'Network', items: [
    { id: 'lan', title: 'LAN', odi: 'config/network' },
    { id: 'route', title: 'Route', odi: 'config/network' },
  ] },
  { id: 'gpon', title: 'GPON', items: [
    { id: 'auth', title: 'ONT Authentication', odi: 'config/line' },
    { id: 'identity', title: 'ONT Identity', odi: 'config/identity' },
    { id: 'vlan', title: 'VLAN', odi: 'config/vlan' },
    { id: 'advanced', title: 'Advanced', odi: 'config/other' },
  ] },
  { id: 'system', title: 'System', items: [
    { id: 'management', title: 'Management', odi: 'system/access' },
    { id: 'backup', title: 'Backup & Reset', odi: 'system/backup' },
    { id: 'firmware', title: 'Firmware Update', odi: 'system/firmware' },
    { id: 'advanced', title: 'Advanced', odi: 'config/services' },
    { id: 'logs', title: 'Logs', odi: 'system/logs' },
  ] },
];
const HOME = 'status/device';
/* odi-ui views by their own hash, for a link or a sign-in that kept one. */
const ODI_TABS = ['config', 'omci', 'system'];

const POLL_MS = 5000;

/* What every page reads: /api/init once, /api/status on the poll. */
const ctx = { init: null, status: null, prev: null, clock: null };

/* --- session ------------------------------------------------------------- */

/* A 401 from the stick means the session ended: back to the sign-in page,
   keeping the view. Only the stick's own answers count. */
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

const hrefOf = (sec, it) => (it.odi ? '/odi#' + it.odi : '#' + sec.id + '/' + it.id);

function renderMenu() {
  const nav = $('#menu');
  nav.textContent = '';
  for (const sec of MENU) {
    const li = el('li', 'dropdown');
    li.dataset.sec = sec.id;
    const top = el('a', 'menu', sec.title);
    top.href = hrefOf(sec, sec.items[0]);
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
      const a = el('a', null, it.title);
      a.href = hrefOf(sec, it);
      a.dataset.view = sec.id + '/' + it.id;
      if (it.odi) {
        a.classList.add('odi');
        a.title = 'Not in the Nijika UI yet: opens the odi-ui view';
      }
      const item = el('li');
      item.append(a);
      ul.append(item);
    }
    li.append(top, ul);
    nav.append(li);
  }
}

const isNarrow = () => matchMedia('(max-width: 767px)').matches;

function wireMenu() {
  $('#menutoggle').addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    $('#menutoggle').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#menu')) for (const o of document.querySelectorAll('#menu li.open')) o.classList.remove('open');
  });
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

/* A page not built yet: say so, and where the same job is done. */
function placeholder(host, { sec, it }) {
  const card = el('div', 'cbi-section');
  card.append(el('h3', null, it.title));
  const body = el('div', 'cbi-section-body');
  body.append(el('p', null, 'This page is not in the Nijika UI yet. The odi-ui view does the same job.'));
  const a = el('a', 'btn cbi-button-action', 'Open in odi-ui');
  a.href = '/odi#' + it.odi;
  body.append(a);
  card.append(body);
  host.append(card);
  return {};
}

function route() {
  let h = location.hash.replace(/^#/, '');
  if (ODI_TABS.includes(h.split('/')[0])) { location.replace('/odi#' + h); return; }
  if (!find(h)) {
    /* A bare section lands on its first page, anything else on the home. */
    const sec = MENU.find((m) => m.id === h.split('/')[0]);
    h = sec ? sec.id + '/' + sec.items[0].id : HOME;
  }
  if (h === VIEW) return;
  const f = find(h);
  if (PAGE && PAGE.leave) PAGE.leave();
  VIEW = h;

  for (const a of document.querySelectorAll('#menu a[data-view]')) {
    a.classList.toggle('active', a.dataset.view === h);
  }
  for (const li of document.querySelectorAll('#menu > li')) {
    li.classList.toggle('active', li.dataset.sec === f.sec.id);
    li.classList.remove('open');
  }
  document.body.classList.remove('menu-open');
  $('#menutoggle').setAttribute('aria-expanded', 'false');

  $('#crumb').textContent = f.sec.title;
  $('#title').textContent = f.it.title;
  document.title = f.it.title + ' - ' + (hostname() || 'Nijika Luna');
  const host = $('#view');
  host.textContent = '';
  PAGE = (f.it.page || placeholder)(host, f, ctx) || {};
  if (PAGE.update && ctx.status) PAGE.update(ctx);
}

/* --- header -------------------------------------------------------------- */

const hostname = () => (ctx.status && ctx.status.hostname) || null;

/* The line in two facts, on every page: the ONU state and the light in. */
function linePill() {
  const st = ctx.status;
  const pill = $('#linepill');
  if (!st) { pill.hidden = true; return; }
  pill.hidden = false;
  pill.textContent = '';
  const ok = st.state === 'O5' && st.rx !== null && st.rx >= -27 && st.rx <= -8;
  pill.className = 'linepill ' + (ok ? 'ok' : st.state ? 'bad' : 'none');
  pill.append(el('i', 'dot'), el('span', null, st.state || 'No state'));
  if (st.rx !== null) pill.append(el('span', 'num', signed(st.rx, 1) + ' dBm'));
  pill.title = ok ? 'In service, receive level in window' : 'Not in service: see Status > Device';
}

function brand() {
  const name = hostname();
  if (name) $('#hostname').textContent = name;
}

/* --- poll ---------------------------------------------------------------- */

let TIMER = null;
/* One poll at a time: confd answers one request at a time, and a tab coming
   back to view must not start a second poll beside a running one. */
let BUSY = false;
async function poll() {
  clearTimeout(TIMER);
  if (BUSY) return;
  BUSY = true;
  try {
    const j = await get('/api/status');
    const st = parseStatus(j);
    st.at = Date.now();
    ctx.prev = ctx.status;
    ctx.status = st;
    $('#err').hidden = true;
  } catch (e) {
    fail(e);
  }
  BUSY = false;
  brand();
  linePill();
  if (PAGE && PAGE.update && ctx.status) {
    try { PAGE.update(ctx); } catch (e) { fail(e); }
  }
  if (!document.hidden) TIMER = setTimeout(poll, POLL_MS);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

/* --- start --------------------------------------------------------------- */

(async function start() {
  watchSession();
  renderMenu();
  wireMenu();
  wireTheme();
  window.addEventListener('hashchange', route);
  try {
    const [init, ntp] = await Promise.all([get('/api/init'), get('/api/ntp').catch(() => null)]);
    ctx.init = init;
    if (ntp && Number.isFinite(ntp.now)) ctx.clock = { now: ntp.now, at: Date.now(), ntp: ntp.ntp };
    const fw = init.firmware || {};
    $('#build').textContent = fw.confd || '';
    $('#defaultauth').hidden = !fw.defaultauth;
  } catch (e) { fail(e); }
  route();
  poll();
}());
