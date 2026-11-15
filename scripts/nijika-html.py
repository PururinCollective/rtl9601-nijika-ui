#!/usr/bin/env python3
"""
Build web/nijika.html, the Nijika UI page, from web/index.html.

The Nijika page shows every odi-ui view under its own menu, and the odi-ui
modules draw into it by element id, so it carries the odi-ui markup as it
is: the header bars, the status panel, each config, OMCI and system sub,
the save bar and the dialogs. This script cuts those out of index.html and
puts them into the Nijika frame (the top bar, the page heading, the Device
view, the footer), with the odi-ui hash links turned into Nijika views and
the few Nijika additions (the ONT Authentication tabs, the Route lede).

After a merge that changes index.html, run it again and commit the result:

    scripts/nijika-html.py           write web/nijika.html
    scripts/nijika-html.py --check   fail when web/nijika.html is not what
                                     this script makes (make check runs it)

A cut that no longer finds its marker fails loudly: the markup moved, and
the script needs the new marker, not a guess.
"""
import os
import sys

web = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web')
src=open(os.path.join(web, 'index.html'), encoding='utf-8').read()
def cut(a,b):
    i=src.index(a); j=src.index(b,i)
    return src[i:j]
banners=cut('  <div id="chipbanner"','</header>')
status_inner=cut('    <!-- The stick, part by part','  </section>\n\n  <!-- ============================================================ Config')
config_subs=cut('    <div class="sub" id="c-line"','  </section>\n\n  <!-- ============================================================== OMCI')
omci_subs=cut('    <div class="sub" id="o-services"','  </section>\n\n  <!-- ============================================================ System')
system_subs=cut('    <!-- Firmware -->','  </section>\n</main>')
tail=cut('<div id="savebar"','<script type="module" src="/app.js"></script>')
errs=cut('<p id="err"','<main>')

HASH={'href="#status"':'href="#status/hood"','href="#system/access"':'href="#system/management"',
      'href="#config/network"':'href="#network/lan"','href="#config/services"':'href="#system/advanced"'}
def fix(s):
    for a,b in HASH.items(): s=s.replace(a,b)
    return s

line_old='''      <p class="lede">What the OLT authenticates this ONU by.</p>
'''
assert line_old in config_subs
config_subs=config_subs.replace(line_old, line_old+'''      <!-- Nijika: the two ways an OLT authenticates, one tab each (nijika.js). -->
      <div class="nj-tabs" id="auth-tabs" role="tablist" aria-label="Authentication">
        <button role="tab" type="button" data-authtab="sn" aria-selected="true">ONU SN &amp; PLOAM</button>
        <button role="tab" type="button" data-authtab="loid" aria-selected="false">LOID</button>
      </div>
''')

id_old='''      <div id="identity-out"></div>
      <div class="settings" id="set-identity"></div>
'''
assert id_old in config_subs
config_subs=config_subs.replace(id_old, '''      <div id="identity-out"></div>
      <!-- Nijika: Device Emulation and the identity fields (nj-identity.js), then
           the rest of odi-ui's identity rows as a card of their own. -->
      <div id="nj-identity"></div>
      <section class="cbi-section nj-ext">
        <h3>Extended ONT Identity</h3>
        <div class="settings" id="set-identity"></div>
      </section>
''')

mib_old='''    <div class="sub" id="o-mib" role="tabpanel" aria-labelledby="st-omci-mib" data-sub="mib" hidden>
'''
assert mib_old in omci_subs
omci_subs=omci_subs.replace(mib_old, mib_old+'''      <!-- Nijika: the MIB as a drawing, fibre to ports (nj-topology.js). -->
      <div id="nj-topology"></div>
      <h3 class="nj-subhead">Managed Entities</h3>
''')

svcs_old='''      <div id="services-cards" class="cards"></div>
'''
assert svcs_old in omci_subs
omci_subs=omci_subs.replace(svcs_old, '''      <!-- Nijika: the services as lanes, OLT to router (nj-service.js). -->
      <div id="nj-service"></div>
      <h3 class="nj-subhead">Service Tables</h3>
'''+svcs_old)

fw_old='accept=".tar,application/x-tar"'
assert fw_old in system_subs
# Nijika: the firmware picker offers .image too, the name Nijika Luna gives
# its image tarballs (nijika-luna-<version>-dev.image, -oem.image).
system_subs=system_subs.replace(fw_old, 'accept=".image,.tar,application/x-tar"')

# Nijika: whom the password of this page signs in. On a Nijika Luna image
# whose root has it (ROOT_PW=ui), nj-account.js says so here.
pw_old='<p class="help">Signs you in to this page only: not SSH, and nothing the OLT sees.</p>'
assert pw_old in system_subs
system_subs=system_subs.replace(pw_old, pw_old.replace('<p class="help">', '<p class="help" id="pw-scope">'))

# Nijika: the telnet switch of Nijika Luna, under the SSH keys
# (nj-account.js). Hidden on an image without telnetd.
telnet_old='''        <div id="sshkey-out"></div>
      </section>
'''
assert telnet_old in system_subs
system_subs=system_subs.replace(telnet_old, telnet_old+'''
      <section class="block" id="nj-telnet" hidden>
        <h2>Telnet</h2>
        <p class="help">Telnet server on port 23, for use when SSH is not available. Disabled by default.</p>
        <div id="telnet-switch" class="switchrow"></div>
        <div id="telnet-out"></div>
      </section>
''')

vlan_old='''      <div class="settings" id="set-vlan"></div>
'''
assert vlan_old in config_subs
config_subs=config_subs.replace(vlan_old, vlan_old+'''      <!-- Nijika: the VLAN forward operation override as a table (nj-fwdop.js). -->
      <div id="nj-fwdop"></div>
''')

svc_old='''      <p class="lede">Where this stick sends its logs, gets its time, and how it treats multicast.</p>
'''
assert svc_old in config_subs
config_subs=config_subs.replace(svc_old, '''      <!-- Nijika: how this page shows itself, kept in this browser (nijika.js). -->
      <div class="cbi-section">
        <h3>Web Page</h3>
        <div class="nj-form">
          <div class="nj-field">
            <label for="nj-expert">Show Expert settings</label>
            <div>
              <select id="nj-expert"><option value="off">Off</option><option value="on">On</option></select>
              <p class="nj-note">On: show the expert settings on ONT Identity, the GPON &gt; Advanced page with all stored keys, and the key name of each setting. Saved in this browser.</p>
            </div>
          </div>
        </div>
      </div>
      <h3 class="nj-subhead">Services</h3>
'''+svc_old)

net_old='''      <p class="lede">How you reach this stick from the host side.</p>
'''
assert net_old in config_subs
config_subs=config_subs.replace(net_old, net_old+'''      <p class="lede nj-lede-route">This page is used to configure static routes of the management interface, so that a host on another subnet can reach the SFP without NAT on the router.</p>
''')

subtabs='''    <!-- odi-ui reads these (config.js: the Other subtab, the Stock keys label,
         the pending counts); nijika.js copies the counts onto the menu. -->
    <nav class="subtabs" hidden>
      <button role="tab" id="st-config-line" data-sub="line">Line</button>
      <button role="tab" id="st-config-vlan" data-sub="vlan">VLAN</button>
      <button role="tab" id="st-config-identity" data-sub="identity">ONU identity</button>
      <button role="tab" id="st-config-network" data-sub="network">Network</button>
      <button role="tab" id="st-config-services" data-sub="services">Services</button>
      <button role="tab" id="st-config-other" data-sub="other" hidden>Other</button>
      <button role="tab" id="st-config-stock" data-sub="stock">Stock keys</button>
    </nav>
    <p class="legend" id="legend" hidden></p>
'''

head='''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Nijika Luna</title>
<!-- The theme before first paint, shared with the odi-ui pages (same keys),
     and the Nijika Show Expert settings switch (System > Advanced).
     Storage may be blocked; then the page follows the browser. -->
<script>try{var t=localStorage.getItem("odi-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;if(localStorage.getItem("odi-fullhelp")==="1")document.documentElement.dataset.help="full";if(localStorage.getItem("nijika-expert")==="1")document.documentElement.dataset.expert="on"}catch(e){}</script>
<!-- odi-ui's sheet first, for the parts its modules draw (meters, settings
     rows, the MIB browser, dialogs); nijika.css then sets the palette and
     the page around them. -->
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/nijika.css">
<link rel="icon" href="data:,">
</head>
<body>
<!--
  The Nijika UI: a LuCI-style page over the odi-ui modules. The menu is the
  classic Nijika page tree (nijika.js VIEWS); each view shows one odi-ui
  panel and sub (the element ids are odi-ui's, which its modules render
  into), or a Nijika page of its own (Status > Device).
-->
<header class="nj-header">
  <div class="nj-container nj-bar-row">
    <a class="nj-brand" href="#status/device">
      <svg class="nj-logo" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7 15.5V8.5l10 7V8.5"/></svg>
      <span id="hostname">NIJIKA-Luna</span>
    </a>
    <button id="menutoggle" class="nj-icon nj-menutoggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="menu">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
    <nav class="nj-nav" aria-label="Main menu">
      <ul id="menu" class="nav"></ul>
      <form class="nj-navlogout" method="post" action="/api/logout"><button class="nj-logout" type="submit">Log out</button></form>
    </nav>
    <div class="nj-end">
      <button id="setup-open" class="nj-logout" type="button" hidden>Setup</button>
      <a class="authchip" id="authchip" href="#system/management" hidden>Default password</a>
      <button id="helptoggle" class="nj-icon helptoggle" type="button" aria-pressed="false" hidden title="Show the help for every field" aria-label="Show the help for every field">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
      </button>
      <a id="linepill" class="linepill" href="#status/device" hidden></a>
      <button id="themetoggle" class="nj-icon" type="button" aria-label="Switch to light mode" title="Switch to light mode">
        <svg id="ico-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
        <svg id="ico-moon" viewBox="0 0 24 24" aria-hidden="true" hidden><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      </button>
      <form method="post" action="/api/logout"><button id="logout" class="nj-logout" type="submit">Log out</button></form>
    </div>
  </div>
  <div class="nj-banners">
'''
mid='''  </div>
</header>

<main class="nj-container nj-main">
'''
pagehead='''  <div class="nj-pagehead">
    <span id="crumb" class="nj-crumb"></span>
    <h2 id="title"></h2>
  </div>

  <!-- Status > Device, the Nijika overview (nj-device.js). -->
  <section id="nj-device" class="nj-view" hidden></section>

  <!-- ============================================ Status > Under the hood -->
  <section id="p-status" class="panel" hidden>
'''
out=head+fix(banners)+mid+fix(errs).replace('\n','\n  ').rstrip()+'\n'+pagehead+fix(status_inner)+'''  </section>

  <!-- ===================================== Network, GPON, System > Advanced -->
  <section id="p-config" class="panel" hidden>
'''+subtabs+'\n'+fix(config_subs)+'''  </section>

  <!-- ============================== Status > Service, OMCI Topology, Phone -->
  <section id="p-omci" class="panel" hidden>
'''+fix(omci_subs)+'''  </section>

  <!-- ========= System > Management, Backup & Reset, Firmware Update, Logs -->
  <section id="p-system" class="panel" hidden>
'''+fix(system_subs)+'''  </section>
</main>

'''+fix(tail)+'''<footer class="nj-container nj-footer">
  <p>Open PON Foundation <span class="sep">&middot;</span> NIJIKA Luna &times; ODI OSS &times; Peter-Pon <span class="sep">&middot;</span> <span id="build"></span></p>
</footer>

<script type="module" src="/nijika.js"></script>
</body>
</html>
'''
# Nijika: the page text in the plain style of the classic Realtek web pages
# ("This page is used to configure ...", Apply Changes, short notes), with
# the device called the SFP. Two kinds of entry, applied to the finished
# page: EXACT replaces a snippet that must occur N times (1 by default);
# BLOCK replaces from a start snippet, which must occur once, through the
# first end snippet after it. A snippet that is no longer there fails the
# script: odi-ui changed that text, and the entry needs the new one.
EXACT = [
('>Commit to this image</button>', '>Commit</button>'),
('>Set a password</button>', '>Change Password</button>'),
('>Host port settings</a>', '>Host Port Settings</a>'),
('aria-label="The stick, part by part"', 'aria-label="SFP status"'),
('<h2>Stick</h2>', '<h2>SFP</h2>'),
('<h2>Shared PON, all ONUs</h2>', '<h2>PON Downstream Usage</h2>'),
('<p class="help">Healthy looks like a mirror: what the fibre receives, the host side sends.</p>',
 '<p class="help">In normal operation, the PON receive rate equals the host send rate.</p>'),
('<h2>Learned addresses</h2>', '<h2>MAC Table</h2>'),
('>Read the MAC table</button>', '>Show</button>'),
('<p class="help">Every address the switch has learned, and the side it learned it on.</p>',
 '<p class="help">This table shows the MAC addresses learned by the switch, and the port of each.</p>'),
('<summary>Raw diag output</summary>', '<summary>Diag Output</summary>'),
('<p class="lede">What the OLT authenticates this ONU by.</p>',
 '<p class="lede">This page is used to configure the ONU authentication: ONU SN, PLOAM password and LOID.</p>'),
('<p class="lede">The service VLAN this stick tags, and when the firmware honours it.</p>',
 '<p class="lede">This page is used to configure the service VLAN of the SFP.</p>'),
('<p class="lede">What the OLT is told this ONU is.</p>',
 '<p class="lede">This page is used to configure the ONU identity reported to the OLT.</p>'),
('<p class="lede">How you reach this stick from the host side.</p>',
 '<p class="lede">This page is used to configure the management interface of the SFP.</p>'),
('<div class="block-head"><h2>Host port</h2></div>', '<div class="block-head"><h2>Host Port</h2></div>'),
('<summary>If the stick becomes unreachable</summary>', '<summary>If the SFP cannot be reached</summary>', 2),
('>Keep auto-negotiation on</button>', '>Keep Enabled</button>'),
('>Try this mode</button>', '>Apply</button>'),
('<p class="lede">Where this stick sends its logs, gets its time, and how it treats multicast.</p>',
 '<p class="lede">This page is used to configure remote syslog, NTP and multicast.</p>'),
('<p class="help">Backups and restores carry every one of these, whether or not this page offers it for editing.</p>',
 '<p class="help">All keys are included in backup and restore.</p>'),
('<p class="lede">What the OLT built on this ONU. When it disagrees with Config, the line is right.</p>',
 '<p class="lede">This page shows the services provisioned by the OLT (OMCI). They take priority over the GPON settings.</p>'),
('>Read again</button>', '>Refresh</button>', 3),
('<p class="lede">The phone lines the OLT provisioned. The stick has no phone socket and registers nothing: the router behind it registers the line, with these values.</p>',
 '<p class="lede">This page shows the VoIP lines provisioned by the OLT. The SFP has no phone port; the router registers the line with these values.</p>'),
('<p class="me-state">Phone ports are off</p>', '<p class="me-state">Phone Ports: Disabled</p>'),
('<p class="hint">The stick tells the OLT it has no phone port, so no line is provisioned. To turn them on, go to Config, ONU identity, Expert settings and set the phone ports key to 1 or 2, then apply. That re-registers the ONU and interrupts the internet for a moment. The stick still has no phone socket: your router behind it registers the line.</p>',
 '<p class="hint">The SFP reports no phone port to the OLT, so no line is provisioned. To enable, set POTS Ports to 1 or 2 in GPON &gt; ONT Identity and apply. The ONU registers again and the internet stops for a moment. The router registers the line.</p>'),
('<p class="lede">Every table, the entities in it and their attributes, exactly as <code>omcicli mib get</code> prints them. Read-only.</p>',
 '<p class="lede">This page shows all OMCI managed entities and their attributes, as printed by <code>omcicli mib get</code>. Read-only.</p>'),
('<h2>Load a new image</h2>', '<h2>Firmware Upgrade</h2>'),
('<label>Image tarball <input id="fw-file"', '<label>Firmware File <input id="fw-file"'),
('<p class="help">Uploading only stages it in RAM. Writing it to a partition is a separate step.</p>',
 '<p class="help">Upload stores the image in RAM only. Then write it to a partition above.</p>'),
('<summary>Doing it from a shell instead</summary>', '<summary>Upgrade from a Shell</summary>'),
('<h2>New releases</h2>', '<h2>New Releases</h2>'),
('<h2>Sign-in for this page</h2>', '<h2>Password Configuration</h2>'),
('<label>New password <input id="pw-pass"', '<label>New Password <input id="pw-pass"'),
('<label>Again <input id="pw-pass2"', '<label>Confirmed Password <input id="pw-pass2"'),
('>Save password</button>', '>Apply Changes</button>'),
('<p class="help" id="pw-scope">Signs you in to this page only: not SSH, and nothing the OLT sees.</p>',
 '<p class="help" id="pw-scope">Password for this page only. Not used for SSH.</p>'),
('<h2>Device login</h2>', '<h2>Stock Firmware Login</h2>'),
('<p class="help">The SSH username and password on this stick. They save with the rest of Config.</p>',
 '<p class="help">Login of the stock firmware in the other partition. Saved with the other settings.</p>'),
('<h2>SSH keys</h2>', '<h2>SSH Keys</h2>'),
('<p class="help">Keys that log in as <code>root</code> without a password. They survive a reflash.</p>',
 '<p class="help">Public keys for <code>root</code> login without a password. Kept after a firmware upgrade.</p>'),
('<label class="grow">Add a public key <input id="sshkey-new"', '<label class="grow">Public Key <input id="sshkey-new"'),
('>Add key</button>', '>Add</button>'),
('<label>Again <input id="backup-pass2"', '<label>Confirmed Password <input id="backup-pass2"'),
('>Download encrypted backup</button>', '>Backup (Encrypted)</button>'),
('>Download without encryption</a>', '>Backup (Not Encrypted)</a>'),
('<p class="help">Nothing is written until you have seen what differs.</p>',
 '<p class="help">The differences are shown before anything is written.</p>'),
('>Write the differences</button>', '>Restore</button>'),
('<h2>Reset the service config</h2>', '<h2>Reset Settings to Default</h2>'),
('<h3>Keeps</h3>', '<h3>Kept</h3>'),
('<h3>Resets</h3>', '<h3>Reset</h3>'),
('<li>the management IP and the second address</li>', '<li>Management IP and second address</li>'),
('<li>the VLAN and the PLOAM password</li>', '<li>VLAN and PLOAM password</li>'),
('<li>every key the defaults file does not name</li>', '<li>Keys not in the default file</li>'),
('<li>this page&rsquo;s sign-in and the SSH keys</li>', '<li>Password of this page and SSH keys</li>'),
('<li>the four LOID keys, emptied</li>', '<li>LOID keys (cleared)</li>'),
('<label>Backup password <input id="reset-pass"', '<label>Backup Password <input id="reset-pass"'),
('<label>Again <input id="reset-pass2"', '<label>Confirmed Password <input id="reset-pass2"'),
('>Back up, then reset</button>', '>Reset</button>'),
('<h2>Kernel log</h2>', '<h2>System Log</h2>'),
('<h2>Diagnostics bundle</h2>', '<h2>Diagnostics</h2>'),
('<p class="help">From the stick itself, over the management LAN. Addresses only: a name lookup would hang this page.</p>',
 '<p class="help">Ping from the SFP over the management LAN. IP address only.</p>'),
('<span>Change keys the line authenticates on: <span id="confirmwhat"></span></span>',
 '<span>Confirm the change of authentication keys: <span id="confirmwhat"></span></span>'),
('>Discard</button>', '>Reset</button>'),
('>Save changes</button>', '>Apply Changes</button>'),
(">Skip, I'll use Config</button>", '>Skip</button>'),
('<strong>Rebooting the stick</strong>', '<strong>System restarting, please wait ...</strong>'),
('<p class="help">The fibre service comes back a little after this page.</p>',
 '<p class="help">The PON service is back shortly after this page.</p>'),
('<h2 id="update-dialog-title">Newer odi-oss releases</h2>', '<h2 id="update-dialog-title">New odi-oss Releases</h2>'),
]
BLOCK = [
('<p>This page answers to the built-in <code>admin</code>', '</p>',
 '<p>Warning: The default password <code>admin</code> / <code>admin</code> is in use. Please change it.</p>'),
('<p class="help" id="chip-help" hidden>The chip temperature', '</p>',
 '<p class="help" id="chip-help" hidden>Note: The chip temperature is read from the SoC sensor and is not calibrated. A warning is shown at the limits; no action is taken.</p>'),
('<p class="help">How full the downstream of the whole PON is', '</p>',
 '<p class="help">This shows the downstream usage of the whole PON (all ONUs on this fibre), estimated from the idle frames of the OLT between two refreshes. The traffic of this SFP is shown under Forwarding.</p>'),
('<summary>What the figure leaves out</summary>', '</details>',
 '<summary>Note</summary>\n'
 '        <p>The value is the average over about 15 seconds; a shorter burst is shown at a fraction of its rate. Bar colour: blue below 50 %, yellow from 50 %, red from 80 %. No history is kept.</p>\n'
 '        <p>Frame headers and management traffic are counted, so an idle PON reads slightly above zero. Dummy frames sent in place of idle frames are counted as load. The upstream is not measured.</p>\n'
 '      </details>'),
('<summary>Why rates, not totals</summary>', '</details>',
 '<summary>Note</summary>\n'
 '          <p>Traffic is forwarded in hardware, and these counters are the only measure. The PON counters run continuously; the host counters are cleared every 15 minutes, so only the rates are compared.</p>\n'
 '        </details>'),
('<p class="s-warn">These change how the stick presents itself', '</p>',
 '<p class="s-warn">Warning: These settings change how the SFP is reported to the OLT. A wrong value can stop the OLT from provisioning the ONU, and the line drops while the ONU registers again. Change them only to match a native ONU.</p>'),
('<p class="s-help">With the router on the SFP edge.', '</p>',
 '<p class="s-help">Auto-negotiation with the router port. Keep it enabled unless the router port has auto-negotiation disabled. A change is reverted after 2 minutes unless it is kept; Keep needs this page to answer in the new mode.</p>'),
('<p class="s-help" id="hostlink-an-na" hidden>Not changeable', '</p>',
 '<p class="s-help" id="hostlink-an-na" hidden>Not available in 2.5G or HiSGMII mode (forced). Set the link mode to Fiber 1G to change it.</p>'),
('<p>A boot whose host link does not come up', '</p>',
 '<p>If the host link does not come up with auto-negotiation disabled, the SFP uses auto-negotiation for that boot and shows a banner. If the SFP still cannot be reached, start safe mode: power it on for about 80 seconds and remove it, three times in a row, then leave it in. Safe mode clears this setting (see System &gt; Management).</p>'),
('<p class="s-help">How the host port talks to the router.', '</p>',
 '<p class="s-help">Link mode of the host port. Fiber 1G is the default and the most compatible. Use 2.5G only if the router port runs 2.5G (auto-negotiation disabled). A wrong mode makes the SFP unreachable until the change is reverted after 120 seconds.</p>'),
('<p>A boot in 2.5G that sees no link', '</p>',
 '<p>If there is no link in 2.5G, the SFP uses Fiber 1G for that boot and shows a banner; the setting is kept. If the SFP still cannot be reached, start safe mode: power it on for about 80 seconds and remove it, three times in a row, then leave it in. Safe mode clears this setting (see System &gt; Management). HiSGMII has no link signal.</p>'),
('<p class="help">If this page answers, the link works in the new mode.', '</p>',
 '<p class="help">This page answers in the new mode. Click Keep to save it. Revert, or no answer, restores the previous mode.</p>'),
('<summary>Why nothing here writes, and where the table list comes from</summary>', '</details>',
 '<summary>Note</summary>\n'
 '        <p>The MIB is written by the OLT and rebuilt at each registration, so it cannot be changed here. Use the GPON settings for permanent changes.</p>\n'
 '        <p>The table list is fixed: <code>omcicli get tables</code> is not used, as it stops the stock <code>omci_app</code>.</p>\n'
 '      </details>'),
('<summary>What committing means</summary>', '</details>',
 '<summary>Note: Commit</summary>\n'
 '        <p>U-Boot boots the <strong>committed</strong> partition (<code>sw_commit</code>), marked Committed above.</p>\n'
 '        <p>Try boots a partition once. The next reboot returns to the committed partition.</p>\n'
 '        <p>Commit makes the running partition the boot partition. A committed image that fails keeps booting: check that it registers and passes traffic before Commit.</p>\n'
 '      </details>'),
('<summary>How a trial boot works</summary>', '</details>',
 '<summary>Note: Try and Write</summary>\n'
 '          <p>Try boots a partition <strong>once</strong>, with the hardware watchdog armed. If the image does not come up, the SFP returns to the committed partition by itself. The next reboot after a successful Try also returns to the committed partition.</p>\n'
 '          <p>Writing takes about 80 seconds and continues if this page is closed. Do not power off the SFP until it is done.</p>\n'
 '          <p><code>/tmp</code> is a RAM disk of <span id="memtotal">27&nbsp;MB</span>. The md5 of the kernel and the root file system is checked before anything is erased.</p>\n'
 '        </details>'),
('<summary>What the OLT is told about the version</summary>', '</details>',
 '<summary>Note: Software Version Reported to the OLT</summary>\n'
 '          <p>The OLT reads <code>0.0.0</code> for both software images unless the ONU identity switch is on; then it reads <code>OMCI_SW_VER1</code> for image 0 and <code>OMCI_SW_VER2</code> for image 1. The stock firmware may rewrite both keys when it boots.</p>\n'
 '        </details>'),
('<summary>Where it is kept, and what erases it</summary>', '</details>',
 '<summary>Note</summary>\n'
 '          <p>Saved in <code>/etc/config/confd.auth</code>, kept after a firmware upgrade. A factory reset erases it; the password is then <code>admin</code> / <code>admin</code>.</p>\n'
 '        </details>'),
('<summary>Locked out? The safe mode</summary>', '</details>',
 '<summary>Safe Mode</summary>\n'
 '          <p><strong>Safe mode</strong> is a recovery boot. For that boot the PON is off, the host port uses auto-negotiation, this page accepts <code>admin</code> / <code>admin</code> and root over SSH accepts the password <code>admin</code>. The saved password and SSH keys are not changed.</p>\n'
 '          <p><strong>To enter:</strong> power on the SFP, wait about 80 seconds, remove it, wait a few seconds. Repeat five times (three times if auto-negotiation is disabled), then leave it in. Each power-on must end 60 to 110 seconds after it starts.</p>\n'
 '          <p><strong>To leave:</strong> set a new password or add an SSH key if needed, acknowledge the banner, then reboot.</p>\n'
 '          <p><strong>Note:</strong> anyone who can power-cycle the SFP can enter safe mode.</p>\n'
 '        </details>'),
('<summary>How keys are stored</summary>', '</details>',
 '<summary>Note</summary>\n'
 '          <p>One OpenSSH line per key, as printed by <code>ssh-keygen</code>. Saved in <code>/etc/config/dropbear.d/authorized_keys</code>.</p>\n'
 '        </details>'),
('<p class="help">Both config stores, identity included:', '</p>',
 '<p class="help">This page is used to save the configuration (both stores, including the serial number, LOID and keys) to a file. A password is recommended.</p>'),
('<p class="help">The password is not stored anywhere:', '</p>',
 '<p class="help">Note: The password is not stored; the file cannot be restored without it. A file that is not encrypted shows all secrets.</p>'),
('<summary>What a restore is allowed to write</summary>', '</details>',
 '<summary>Note</summary>\n'
 '            <p>Values are checked as on the settings pages; the SerDes keys are refused. Identity keys are written only with Include identity keys, so a backup of another SFP does not overwrite the serial number and MAC key.</p>\n'
 '          </details>'),
('<li><code>DEVICE_TYPE</code>, <code>DUAL_MGMT_MODE</code> and the three', '</li>',
 '<li><code>DEVICE_TYPE</code>, <code>DUAL_MGMT_MODE</code> and the <code>OMCI_CUSTOM</code> masks (used by the stock firmware; this image uses the VEIP slot bit of <code>OMCI_CUSTOM_ME</code>)</li>'),
('<p class="help">A backup downloads first;', '</p>',
 '<p class="help">A backup is downloaded before the reset (encrypted if a password is given). The settings are shared with the stock firmware in the other partition and are reset there too.</p>'),
('<summary>Why this is not <code>flash_eraseall</code></summary>', '</details>',
 '<summary>Note</summary>\n'
 '          <p>The defaults in <code>/etc/config_default.xml</code> are merged with <code>flash default cs</code>. The partition is not erased, so <code>GPON_SN</code>, <code>MAC_KEY</code>, <code>ELAN_MAC_ADDR</code> and the password of this page are kept. Do not use <code>flash_eraseall /dev/mtd3</code>: it erases all of them.</p>\n'
 '        </details>'),
('<p class="help">The ring buffer the kernel and the boot scripts write to.', '</p>',
 '<p class="help">This page shows the kernel log buffer. To keep daemon logs, set a <a href="#system/advanced">remote syslog server</a>.</p>'),
('<summary>How it is read</summary>', '</details>',
 '<summary>Note</summary>\n'
 '          <p>Read with <code>klogctl</code>, without clearing the buffer. Daemon logs are in <code>/var/log/omcid.log</code> and <code>/var/log/services.log</code> (RAM, over SSH), and on the remote syslog server when set.</p>\n'
 '        </details>'),
('<p class="help">Logs, the previous boot&rsquo;s kernel log,', '</p>',
 '<p class="help">Download the logs, the kernel log of the previous boot, the slot state and the configuration (passwords removed) as one <code>.tar.gz</code> for a bug report. The serial number and MAC are included.</p>'),
('<summary>Why not names</summary>', '</details>',
 '<summary>Note</summary>\n'
 '          <p>Host names are not supported: without a DNS route, a name lookup would block this page.</p>\n'
 '        </details>'),
('<p class="help">Nothing is downloaded or flashed from here.', '</p>',
 '<p class="help">Nothing is downloaded from this page. Download the image from the release page and upload it in <a id="update-fw-link" href="#system/firmware">Firmware Update</a>.</p>'),
]

def reword(page):
    for e in EXACT:
        a, b, n = e[0], e[1], (e[2] if len(e) > 2 else 1)
        if page.count(a) != n:
            sys.exit(f'nijika-html.py: reword: {a!r} found {page.count(a)} times, wanted {n}')
        page = page.replace(a, b)
    for a, end, b in BLOCK:
        if page.count(a) != 1:
            sys.exit(f'nijika-html.py: reword: {a!r} found {page.count(a)} times, wanted 1')
        i = page.index(a)
        j = page.index(end, i) + len(end)
        page = page[:i] + b + page[j:]
    return page

out = reword(out)

dest = os.path.join(web, 'nijika.html')
if '--check' in sys.argv[1:]:
    have = open(dest, encoding='utf-8').read() if os.path.exists(dest) else ''
    if have != out:
        print('web/nijika.html is not what scripts/nijika-html.py makes: run it and commit the result')
        sys.exit(1)
    print(f'nijika.html up to date: {len(out.encode())} bytes')
else:
    open(dest, 'w', encoding='utf-8').write(out)
    print(f'web/nijika.html: {len(out.encode())} bytes')
# confd reads a page into a 64 KiB buffer (src/buffers.c filebuf).
if len(out.encode()) >= 65536:
    print('web/nijika.html is over 64 KiB: confd cannot serve it')
    sys.exit(1)
