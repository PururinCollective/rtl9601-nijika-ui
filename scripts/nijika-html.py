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
      <h3 class="nj-subhead">Every managed entity</h3>
''')

svcs_old='''      <div id="services-cards" class="cards"></div>
'''
assert svcs_old in omci_subs
omci_subs=omci_subs.replace(svcs_old, '''      <!-- Nijika: the services as lanes, OLT to router (nj-service.js). -->
      <div id="nj-service"></div>
      <h3 class="nj-subhead">Table by table</h3>
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
        <p class="help">A fallback way in beside SSH, on port 23. Off unless you turn it on.</p>
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
        <h3>This page</h3>
        <div class="nj-form">
          <div class="nj-field">
            <label for="nj-expert">Show Expert settings</label>
            <div>
              <select id="nj-expert"><option value="off">Off</option><option value="on">On</option></select>
              <p class="nj-note">On: ONT Identity shows the expert settings, open, GPON &gt; Advanced is in the menu with every key the stick stores, and each setting shows the name of its key. Off keeps all three out of sight. Kept in this browser.</p>
            </div>
          </div>
        </div>
      </div>
      <h3 class="nj-subhead">Services</h3>
'''+svc_old)

net_old='''      <p class="lede">How you reach this stick from the host side.</p>
'''
assert net_old in config_subs
config_subs=config_subs.replace(net_old, net_old+'''      <p class="lede nj-lede-route">Routes for the management address, so the stick answers a host on another subnet without NAT on the router: a destination network and the gateway on this LAN that leads to it.</p>
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
