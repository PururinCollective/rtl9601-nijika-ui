/*
 * Nijika UI: the sign-in, SSH key and reset actions of System > Management
 * and System > Backup & Reset. The functions are odi-ui app.js own, carried
 * here as they are: app.js wires the odi-ui page and runs on import, so the
 * Nijika page cannot import it. Keep them in step with app.js on a merge.
 */

import { $, el, get } from './dom.js';
import { S } from './state.js';
import { renderAll } from './config.js';
import { renderTrial } from './firmware.js';
import { saveBackup } from './restore.js';
import { passwordProblem, sshKeyProblem } from './validate.js';

/* The default-password notice is loud (#defaultauth) on the views it is
   about and a chip in the header on the others; nijika.js says which. */
let LOUD = true;
function showAuth(loud) {
  if (loud !== undefined) LOUD = loud;
  const on = !!(S.FW && S.FW.defaultauth);
  $('#defaultauth').hidden = !on || !LOUD;
  $('#authchip').hidden = !on || LOUD;
}

/*
 * Say so while the built-in credential is in force. The fallback exists so a
 * freshly flashed stick is reachable at all; leaving it in place is a
 * different decision, and one the operator has to be able to see they are
 * making.
 */
async function checkAuth(known) {
  try {
    /* At start the firmware came with /api/init; after a password change it
       is read again. */
    S.FW = known || await get('/api/firmware');
  } catch (e) { /* the banner is advisory; a failed read must not blank the page */ }
  showAuth();
  renderTrial();
}

/*
 * Change the credential this page authenticates with, creating the file if it
 * is not there. That last part is the point: the state this fixes is the state
 * of every factory-reset stick, and a credential that can only be set from a
 * shell is one that stays at its default.
 */
async function savePassword() {
  const out = $('#pw-out');
  const user = $('#pw-user').value.trim();
  const pass = $('#pw-pass').value;
  const again = $('#pw-pass2').value;

  out.textContent = '';
  /* The daemon checks the same rules, but a typo in a password with no repeat
     field is the one mistake it cannot catch: the credential is saved as typed
     and the next request answers 401. */
  const bad = passwordProblem(user, pass, again);
  if (bad) { out.append(el('div', 'bad', bad)); return; }
  try {
    const r = await fetch('/api/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ user, password: pass }).toString(),
    });
    const j = await r.json();
    if (!j.ok) { out.append(el('div', 'bad', j.error || 'refused')); return; }
    out.append(el('div', 'good', 'Saved to /etc/config/confd.auth.'));
    /* This browser stays signed in; confd has signed out every other one. */
    out.append(el('div', null,
      'You stay signed in here. Any other browser signed in to this page is signed out, '
      + 'and signs in again as ' + user + '.'));
    $('#pw-pass').value = '';
    $('#pw-pass2').value = '';
    await checkAuth();
  } catch (e) { out.append(el('div', 'bad', String(e.message || e))); }
}

/*
 * SSH public keys for the device login. The list is the file as it is, so a
 * key added over ssh by hand shows up here too. A delete names the line number
 * the server reported and the line as it was listed, so that a list that is out
 * of date (a second tab, a change over ssh) removes nothing, where the number
 * alone would have removed whatever key holds that line now.
 */
/* The lines on the stick as last listed, for the duplicate check and for the
   warning before the last one is removed. */
let SSH_LINES = [];

async function renderSshKeys() {
  const box = $('#sshkeys');
  box.textContent = '';
  try {
    const j = await get('/api/sshkeys');
    SSH_LINES = j.keys.map((k) => k.line);
    if (!j.keys.length) { box.append(el('p', 'hint', 'No keys yet: SSH accepts the root password only.')); return; }
    const t = el('ul', 'keylist');
    for (const k of j.keys) {
      const li = el('li');
      const parts = k.line.split(/\s+/);
      const blob = parts[1] || '';
      li.append(el('span', 'k-type', parts[0] || ''));
      li.append(el('span', 'k-blob mono', blob.length > 24 ? blob.slice(0, 12) + '\u2026' + blob.slice(-8) : blob));
      li.append(el('span', 'k-comment', parts.slice(2).join(' ')));
      const del = el('button', 'danger-quiet', 'Remove');
      del.type = 'button';
      del.setAttribute('aria-label', 'Remove key ' + (parts.slice(2).join(' ') || blob.slice(-8)));
      del.onclick = () => delSshKey(k.i, k.line);
      li.append(del);
      t.append(li);
    }
    box.append(t);
  } catch (e) { box.append(el('div', 'bad', String(e.message || e))); }
}

async function addSshKey() {
  const out = $('#sshkey-out');
  const key = $('#sshkey-new').value.trim();
  out.textContent = '';
  const bad = sshKeyProblem(key, SSH_LINES);
  if (bad) { out.append(el('div', 'bad', bad)); return; }
  try {
    const r = await fetch('/api/sshkeys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key }).toString(),
    });
    const j = await r.json();
    if (!j.ok) { out.append(el('div', 'bad', j.error || 'refused')); return; }
    $('#sshkey-new').value = '';
    out.append(el('div', 'good', 'Added. dropbear reads the file on every login; nothing to restart.'));
    await renderSshKeys();
  } catch (e) { out.append(el('div', 'bad', String(e.message || e))); }
}

export async function delSshKey(i, line) {
  const out = $('#sshkey-out');
  out.textContent = '';
  /* The only way into a keys-only stick, and a removal that cannot be undone
     from here: the key has to be pasted again. */
  if (!confirm('Remove this key?\n\n'
      + (SSH_LINES.length <= 1
        ? 'It is the last one: on an image whose root password is locked, nothing else lets you log in over ssh. '
        : 'Whoever holds its private half can no longer log in. ')
      + 'To get it back you have to paste it again.\n\nContinue?')) return;
  try {
    const r = await fetch('/api/sshkeys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ delete: String(i), line }).toString(),
    });
    const j = await r.json();
    /* Refused or not, the list is read again: a refusal is most often a list
       that no longer matches the file. */
    if (!j.ok) out.append(el('div', 'bad', j.error || 'refused'));
    await renderSshKeys();
  } catch (e) { out.append(el('div', 'bad', String(e.message || e))); }
}

/*
 * Reset the service config, backup first.
 *
 * The backup is fetched as a blob and handed to the browser BEFORE the
 * destructive call, and the reset does not run if that fails. A link the
 * operator is told to click first is not a precondition -- it is a hope, and
 * the whole reason this device has bricked sticks in the field is resets done
 * without one.
 */
async function resetConfig() {
  const out = $('#reset-out');
  const btn = $('#reset-go');

  out.textContent = '';
  if (!confirm('Reset the service configuration to the image defaults?\n\n'
      + 'The keys in /etc/config_default.xml go back to their defaults: the four '
      + 'LOID keys are emptied, and DEVICE_TYPE, DUAL_MGMT_MODE and the three '
      + 'OMCI_CUSTOM masks (read only by the stock firmware) are reset. The '
      + 'management IP, the VLAN, the PLOAM password, the serial number and the '
      + 'MAC keys are NOT touched.\n\nA backup downloads first.')) return;

  btn.disabled = true;
  try {
    /* The same backup as the Backup block: encrypted when a password is given. */
    const pw = $('#reset-pass').value;

    if (pw !== $('#reset-pass2').value) throw new Error('the two backup passwords differ; nothing was reset');
    out.append(el('div', null, 'Downloading a backup…'));
    const done = await saveBackup(pw);
    out.append(el('div', 'good', `Backup saved (${done.size} bytes${done.encrypted ? ', encrypted' : ', not encrypted'}).`));

    const p = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'store=cs&_confirm=reset',
    });
    const j = await p.json();
    if (j.output) out.append(el('pre', null, j.output.trim()));
    if (!j.ok) { out.append(el('div', 'bad', j.error || 'the reset reported a failure')); return; }
    S.VALUES = await get('/api/values');
    renderAll();
    /* Of the reset keys, only the LOID ones are read here, by omcid, and
       they apply the way every omcid key does. */
    out.append(el('div', 'warn', 'Written. The LOID keys take effect when OMCI is '
      + 'applied (Apply now, on the Config tab save bar) or at the next reboot; the '
      + 'rest are read only by the stock firmware.'));
  } catch (e) {
    out.append(el('div', 'bad', String(e.message || e)));
    out.append(el('div', null, 'Nothing was reset.'));
  } finally {
    btn.disabled = false;
  }
}

export { checkAuth, showAuth, savePassword, renderSshKeys, addSshKey, resetConfig };
