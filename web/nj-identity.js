/*
 * Nijika UI: GPON > ONT Identity, with device emulation presets.
 *
 * What the OLT is told this ONU is, as the classic Nijika page set it: pick
 * a device to emulate and every field takes its value, read-only; pick
 * Custom and every field can be edited. The presets are the Luna list
 * (nj-presets.js, generated from presets/ont.tsv, the one `nijika ont`
 * applies), and a preset writes the same keys the CLI does.
 *
 * Nothing is written from here directly: a choice becomes pending edits
 * (state.js EDITS), so the save bar says what it costs, asks for the
 * identity confirmation, writes, reads back and offers Apply, as for any
 * other setting. The odi-ui rows of the same keys are hidden on this view
 * (nijika.css); its other ONU identity rows stay under this card.
 */

import { $, el } from './dom.js';
import { S, EDITS, costBadge, imageAware, settingOf } from './state.js';
import { valueProblem } from './validate.js';
import { PRESETS } from './nj-presets.js';

/* OMCC versions a classic Nijika offered; 0x80 is what this image and the
   stock firmware report. */
const OMCC = [128, 129, 130, 131, 132, 133, 134, 150, 160, 161, 162, 163, 176, 177, 178, 179]
  .map((n) => [String(n), '0x' + n.toString(16).toUpperCase() + ' (' + n + ')']);
const TM = [['0', '0, priority controlled'], ['1', '1, rate controlled'], ['2', '2, priority and rate controlled']];
const UNKNOWN = [['0', '0, the standard unknown-entity error'], ['1', '1, answer with success']];

/*
 * The fields, in the order of the classic page, and the keys each writes:
 * `key`, and `also` with the same value. `preset` is the column of the
 * preset table; a field without one keeps its stored value when a preset
 * is picked. `stock`: a key this image does not read (the stock firmware
 * in the other slot does).
 */
const FIELDS = [
  { id: 'vendor', label: 'Vendor Id', key: 'PON_VENDOR_ID', preset: 'vendor', max: 4,
    note: 'The vendor the OLT reads in ONU-G. Four characters.' },
  { id: 'swver1', label: 'Software Version 1', key: 'OMCI_SW_VER1', preset: 'swver1',
    note: 'Image 0 in ONU software image (ME 7).' },
  { id: 'swver2', label: 'Software Version 2', key: 'OMCI_SW_VER2', preset: 'swver2',
    note: 'Image 1 in ONU software image (ME 7).' },
  { id: 'hwver', label: 'HW Version', key: 'ONU_HW_VERSION', also: 'HW_HWVER', preset: 'hwver',
    note: 'The hardware version in ONU-G.' },
  { id: 'omcc', label: 'OMCC Version', key: 'OMCC_VER', preset: 'omcc', options: OMCC,
    note: 'ONU2-G OMCC version. A preset without one keeps the stored version.' },
  { id: 'tmopt', label: 'Traffic Management', key: 'OMCI_TM_OPT', preset: 'tm_opt', options: TM, stock: true,
    note: 'For the stock firmware: this image always reports 2 in ONU-G, priority and rate controlled.' },
  { id: 'model', label: 'Product Class', key: 'GPON_ONU_MODEL', also: 'HW_CWMP_PRODUCTCLASS', preset: 'model',
    note: 'The equipment id the OLT reads in ONU2-G, and the TR-069 product class.' },
  { id: 'product', label: 'Vendor Product Code', key: 'OMCI_VENDOR_PRODUCT_CODE', preset: 'product',
    note: 'ONU2-G vendor product code, decimal.' },
  { id: 'serial', label: 'Device Serial Number', key: 'HW_SERIAL_NO', stock: true,
    note: 'The serial number of the unit, distinct from the ONU serial number (ONT Authentication). '
      + 'For the stock firmware: this image does not report it.' },
  { id: 'unknown', label: 'OMCI_UNKNOWN_ME_OK', key: 'OMCI_UNKNOWN_ME_OK', preset: 'unknown_me', options: UNKNOWN,
    note: 'How omcid answers a managed entity it has no model for.' },
];
/* Written by a preset and not shown: the stock firmware's copies, as
   `nijika ont` writes them. */
const HIDDEN = [['OMCI_OLT_MODE', 'olt_mode'], ['OUI', 'oui'], ['HW_CWMP_MANUFACTURER', 'maker']];
const CUSTOM = 'custom';

/* Every key the page may write. */
const KEYS = [...new Set([...FIELDS.flatMap((f) => (f.also ? [f.key, f.also] : [f.key])), ...HIDDEN.map(([k]) => k)])];

/* --- the rules, pure, for make check ------------------------------------- */

/* The preset the values are: the one whose vendor, model and hardware
   version they hold, as `nijika ont` marks it. Null for anything else. */
function presetOf(values, presets = PRESETS) {
  return presets.find((p) => values.PON_VENDOR_ID === p.vendor && values.GPON_ONU_MODEL === p.model
    && values.ONU_HW_VERSION === p.hwver) || null;
}

/* What a preset writes, key by key; a column left empty writes nothing. */
function presetValues(p) {
  const out = {};
  for (const f of FIELDS) {
    if (!f.preset || p[f.preset] === '' || p[f.preset] === undefined) continue;
    out[f.key] = p[f.preset];
    if (f.also) out[f.also] = p[f.preset];
  }
  for (const [k, col] of HIDDEN) if (p[col]) out[k] = p[col];
  return out;
}

/* A field's own rule on top of the schema's: the vendor id is exactly four
   characters, as `nijika ont set vendor` has it. */
function fieldProblem(f, v, row) {
  if (f.id === 'vendor' && v.length !== 4) return 'exactly 4 characters';
  return row ? valueProblem(row, v) : null;
}

/* --- the page ------------------------------------------------------------ */

const effective = (k) => (EDITS.has(k) ? EDITS.get(k) : (S.VALUES[k] === undefined ? '' : String(S.VALUES[k])));
const values = () => Object.fromEntries(KEYS.map((k) => [k, effective(k)]));
const rowOf = (k) => S.SCHEMA.find((r) => r.name === k) || null;

/* Set one key as an edit, or drop the edit when it is the stored value. */
function edit(k, v) {
  const stored = S.VALUES[k] === undefined ? '' : String(S.VALUES[k]);
  if (v === stored) EDITS.delete(k); else EDITS.set(k, v);
}
const changed = () => document.dispatchEvent(new Event('edits-changed'));

let MODE = null;      /* a preset name, or CUSTOM */
let CHOSEN = false;   /* the mode was picked on this page, not read off the values */
let UI = null;

function detect() {
  const p = presetOf(values());
  MODE = p ? p.name : CUSTOM;
  CHOSEN = false;
}

function pick(name) {
  MODE = name;
  CHOSEN = true;
  if (name !== CUSTOM) {
    const p = PRESETS.find((x) => x.name === name);
    for (const [k, v] of Object.entries(presetValues(p))) edit(k, v);
    changed();
  }
  sync();
}

function control(f) {
  let c;
  if (f.options) {
    c = el('select');
    const vals = f.options.map(([v]) => v);
    for (const [v, t] of f.options) {
      const o = el('option', null, t);
      o.value = v;
      c.append(o);
    }
    /* A stored value the list does not have still shows as itself. */
    c.dataset.known = vals.join(',');
  } else {
    c = el('input');
    c.type = 'text';
    c.autocomplete = 'off';
    c.spellcheck = false;
    if (f.max) c.maxLength = f.max;
  }
  c.id = 'nj-id-' + f.id;
  c.addEventListener(f.options ? 'change' : 'input', () => {
    if (MODE !== CUSTOM) return;
    const v = c.value;
    const bad = fieldProblem(f, v, rowOf(f.key));
    UI.err[f.id].textContent = bad ? bad + ': not saved until it is' : '';
    c.classList.toggle('invalid', !!bad);
    /* A value that breaks a rule of this page is not queued at all: the
       save bar checks the schema's rules only, and would write it. */
    if (bad && f.id === 'vendor') {
      EDITS.delete(f.key);
    } else {
      edit(f.key, v);
      if (f.also) edit(f.also, v);
    }
    changed();
  });
  return c;
}

function setValue(c, v) {
  if (c === document.activeElement) return;
  if (c.tagName === 'SELECT') {
    const known = c.dataset.known.split(',');
    for (const o of [...c.options]) if (o.dataset.extra) o.remove();
    if (v !== '' && !known.includes(v)) {
      const o = el('option', null, v + ' (stored)');
      o.value = v;
      o.dataset.extra = '1';
      c.append(o);
    }
    if (v === '') {
      const o = el('option', null, 'not set');
      o.value = '';
      o.dataset.extra = '1';
      c.prepend(o);
    }
  }
  c.value = v;
}

/* Draw the values, the mode and the notes; never the field being typed in. */
function sync() {
  if (!UI) return;
  const idKeys = KEYS.filter((k) => EDITS.has(k));
  if (!CHOSEN && !idKeys.length) detect();
  const v = values();
  UI.sel.value = MODE;
  const custom = MODE === CUSTOM;
  for (const f of FIELDS) {
    const c = UI.ctl[f.id];
    const before = c.value;
    setValue(c, v[f.key]);
    if (c.tagName === 'SELECT') c.disabled = !custom; else c.readOnly = !custom;
    /* A field redrawn with another value no longer holds what was refused. */
    if (!custom || c.value !== before) { UI.err[f.id].textContent = ''; c.classList.remove('invalid'); }
    UI.rows[f.id].classList.toggle('nj-pending', EDITS.has(f.key));
  }
  const p = PRESETS.find((x) => x.name === MODE);
  UI.status.textContent = custom
    ? (idKeys.length ? 'Custom values, not saved yet.' : 'Custom: every field can be edited.')
    : idKeys.length ? `${p.label}: the save bar below writes it.`
      : `The stored identity is ${p.label}.`;
  /* The serial number's vendor and the vendor id may differ on this image:
     the OLT authenticates the serial number, and reads the vendor id. */
  const sn = String(S.VALUES.GPON_SN || '');
  const snVendor = /^[0-9a-fA-F]{16}$/.test(sn)
    ? sn.slice(0, 8).match(/../g).map((x) => String.fromCharCode(parseInt(x, 16))).join('') : sn.slice(0, 4);
  UI.vendorNote.hidden = !(v.PON_VENDOR_ID && snVendor && /^[\x20-\x7e]{4}$/.test(snVendor) && snVendor !== v.PON_VENDOR_ID);
  UI.vendorNote.textContent = `Differs from the vendor of the ONU serial number (${snVendor}): `
    + 'the OLT authenticates the serial number and reads this as the vendor.';
}

function renderIdentity() {
  const host = $('#nj-identity');
  if (!host) return;
  host.textContent = '';
  const card = el('div', 'cbi-section');
  card.append(el('h3', null, 'ONT Identity'));
  const form = el('div', 'nj-form');

  const top = el('div', 'nj-field nj-field-main');
  const lab = el('label', null, 'Device Emulation');
  lab.htmlFor = 'nj-id-emulation';
  const sel = el('select');
  sel.id = 'nj-id-emulation';
  for (const p of PRESETS) {
    const o = el('option', null, p.label + (p.default ? ' (default)' : ''));
    o.value = p.name;
    sel.append(o);
  }
  const oc = el('option', null, 'Custom');
  oc.value = CUSTOM;
  sel.append(oc);
  sel.addEventListener('change', () => pick(sel.value));
  const status = el('p', 'nj-note');
  const right = el('div');
  right.append(sel, status);
  top.append(lab, right);
  form.append(top);

  const ctl = {};
  const err = {};
  const rows = {};
  let vendorNote = null;
  for (const f of FIELDS) {
    const r = el('div', 'nj-field');
    const l = el('label', null, f.label);
    l.htmlFor = 'nj-id-' + f.id;
    const box = el('div');
    const line = el('div', 'nj-fieldline');
    ctl[f.id] = control(f);
    line.append(ctl[f.id]);
    /* What saving it costs, as on the other settings pages. */
    const set = imageAware() ? settingOf(f.key) : null;
    if (set && set.apply && set.apply !== 'live') {
      const b = costBadge(set.apply);
      b.classList.add('icon-only');
      line.append(b);
    }
    if (f.stock) line.append(el('span', 'tag stock', 'stock'));
    err[f.id] = el('p', 'nj-note bad');
    box.append(line, err[f.id], el('p', 'nj-note', f.note));
    if (f.id === 'vendor') {
      vendorNote = el('p', 'nj-note warn');
      box.append(vendorNote);
    }
    r.append(l, box);
    rows[f.id] = r;
    form.append(r);
  }
  card.append(form);
  host.append(card);
  UI = { sel, status, ctl, err, rows, vendorNote };
  MODE = null;
  CHOSEN = false;
  sync();
}

/* A save or a discard ends a choice made here: the page reads the mode off
   the values again. A save shows as new stored values (the save bar is
   redrawn after every save); a discard is said by nijika.js. */
let STORED = '';
const storedNow = () => JSON.stringify(KEYS.map((k) => S.VALUES[k]));
function resetIdentity() {
  CHOSEN = false;
  STORED = storedNow();
  sync();
}
function wireIdentity() {
  STORED = storedNow();
  document.addEventListener('edits-changed', () => sync());
  const count = $('#savecount');
  if (count) {
    new MutationObserver(() => {
      if (storedNow() !== STORED) resetIdentity(); else sync();
    }).observe(count, { childList: true });
  }
}

export { renderIdentity, wireIdentity, resetIdentity, presetOf, presetValues, fieldProblem, FIELDS, KEYS };
