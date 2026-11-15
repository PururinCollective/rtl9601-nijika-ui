/*
 * Nijika UI: the sign-in, SSH key and reset actions of System > Management
 * and System > Backup & Reset. The functions are odi-ui app.js own, carried
 * here as they are: app.js wires the odi-ui page and runs on import, so the
 * Nijika page cannot import it. Keep them in step with app.js on a merge.
 * The telnet switch and the note on whom the password signs in are Nijika
 * Luna own (renderAccess).
 */

import { $, el, get, createHelpToggle } from './dom.js';
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
  renderAccess();
}

/*
 * Nijika Luna. On an image built with ROOT_PW=ui (S.FW.rootui), the password
 * of this page is root's too, for SSH, telnet and the serial console
 * (root-password.sh in the image, run again by confd on a change). And the
 * telnet switch, /etc/config/telnetd.on, on an image that has telnetd
 * (S.FW.telnetd): confd starts or stops it at once.
 */
const TELNET_SWITCH = 'telnetd.on';

function renderAccess() {
  const fw = S.FW || {};
  const scope = $('#pw-scope');
  if (scope) {
    scope.textContent = fw.rootui
      ? 'Password for this page, and the root password for SSH, Telnet and the serial '
        + 'console. Default: admin.'
      : 'Password for this page only. Not used for SSH.';
  }
  const sec = $('#nj-telnet');
  if (!sec) return;
  sec.hidden = !fw.telnetd;
  if (!fw.telnetd) return;
  const host = $('#telnet-switch');
  host.textContent = '';
  const on = !!(fw.switches && fw.switches[TELNET_SWITCH]);
  const titleText = on ? 'Telnet: Enabled' : 'Telnet: Disabled';
  const helpBox = el('div', 's-helpbox');
  helpBox.id = 'help-telnet-switch';
  helpBox.append(el('p', 's-help', 'Login: root, '
    + (fw.rootui ? 'with the password of this page.' : 'with the root password.')));
  helpBox.append(el('p', 's-help', 'Note: Telnet is not encrypted. Enable it only when SSH '
    + 'is not available, and disable it after use. The setting is kept after a firmware upgrade.'));
  const title = el('div', 's-title');
  title.append(el('strong', 's-name', titleText), createHelpToggle(helpBox, titleText));
  const text = el('div', 'switch-text');
  text.append(title, helpBox);
  const b = el('button', null, on ? 'Disable' : 'Enable');
  b.type = 'button';
  b.onclick = async () => {
    b.disabled = true;
    const out = $('#telnet-out');
    out.textContent = '';
    try {
      const r = await fetch('/api/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ name: TELNET_SWITCH, on: on ? '0' : '1' }).toString(),
      });
      const j = await r.json();
      if (!j.ok) { out.append(el('div', 'bad', j.error || 'refused')); return; }
      S.FW.switches = { ...(S.FW.switches || {}), [TELNET_SWITCH]: j.on };
      renderAccess();
      out.append(el('div', j.on ? 'warn' : 'good', j.on
        ? 'Telnet enabled on port 23 (telnet ' + location.hostname + '). Disable it after use.'
        : 'Telnet disabled.'));
    } catch (e) {
      out.append(el('div', 'bad', String(e.message || e)));
    } finally { b.disabled = false; }
  };
  const acts = el('div', 'switch-acts');
  acts.append(b);
  host.append(text, acts);
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
    out.append(el('div', 'good', 'Change setting successfully!'));
    /* This browser stays signed in; confd has signed out every other one. */
    out.append(el('div', null,
      'Other browsers signed in to this page are signed out. Sign in again as ' + user + '.'));
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
    if (!j.keys.length) { box.append(el('p', 'hint', 'No SSH key. SSH accepts the root password only.')); return; }
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
    out.append(el('div', 'good', 'Key added.'));
    await renderSshKeys();
  } catch (e) { out.append(el('div', 'bad', String(e.message || e))); }
}

export async function delSshKey(i, line) {
  const out = $('#sshkey-out');
  out.textContent = '';
  /* The only way into a keys-only stick, and a removal that cannot be undone
     from here: the key has to be pasted again. */
  if (!confirm('Are you sure you want to delete this key?'
      + (SSH_LINES.length <= 1 ? '\n\nThis is the last key.' : ''))) return;
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
  if (!confirm('Are you sure to reset the service configuration to default?\n\n'
      + 'LOID, DEVICE_TYPE, DUAL_MGMT_MODE and the OMCI_CUSTOM masks are reset. '
      + 'The management IP, VLAN, PLOAM password, serial number and MAC keys are kept.\n\n'
      + 'A backup is downloaded first.')) return;

  btn.disabled = true;
  try {
    /* The same backup as the Backup block: encrypted when a password is given. */
    const pw = $('#reset-pass').value;

    if (pw !== $('#reset-pass2').value) throw new Error('The passwords do not match. Nothing was reset.');
    out.append(el('div', null, 'Downloading backup, please wait ...'));
    const done = await saveBackup(pw);
    out.append(el('div', 'good', `Backup saved (${done.size} bytes, ${done.encrypted ? 'encrypted' : 'not encrypted'}).`));

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
    out.append(el('div', 'warn', 'Reset done. The LOID keys take effect after OMCI '
      + 'is applied or the device is rebooted.'));
  } catch (e) {
    out.append(el('div', 'bad', String(e.message || e)));
    out.append(el('div', null, 'Nothing was reset.'));
  } finally {
    btn.disabled = false;
  }
}

export { checkAuth, showAuth, savePassword, renderSshKeys, addSshKey, resetConfig };
