/* =====================================================================
   PRESIADO HOME — Chat de captación de leads (guiado, sin IA)
   =====================================================================
   Por qué guiado y no IA:
     · Costo cero por conversación (postura owner: crecer sin gasto).
     · Riesgo de compliance CERO. Un LLM puede escribir "licensed
       contractor" / "GC" — prohibición dura (Brand Guide §7.1, FL).
       Un árbol guiado no puede decir lo que no está escrito aquí.
   Manda el lead al MISMO webhook del CRM que usa /estimate (mismo payload)
   -> el CRM dispara el email de bienvenida al cliente y el aviso al owner.
   Se instala con una línea:  <script src="/chat-widget.js" defer></script>
   Copy 100% en inglés (client-facing). Solo "Insured", nunca "licensed".
   ===================================================================== */
(function () {
  'use strict';
  if (window.__pxChat) return; window.__pxChat = 1;

  var SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzCFaPtLfmxokcVKlbFXNllIX1AmZo5NR6nl-9ZpR7UjzHBlks-Atz7Wbt6xLdA4LaPLQ/exec';
  var ADS_CONV = 'AW-17985883107/ia0-COWe5qkcEOOXq4BD';
  var PHONE = '(941) 704-3464', TEL = '+19417043464';

  var SERVICES = ['Interior Painting', 'Exterior Painting', 'Drywall Repair', 'Drywall Finishing (Level 4/5)',
                  'Popcorn / Ceiling Removal', 'Water Damage Repair', 'Cabinet Painting', 'Something else'];
  var CITIES = ['Sarasota', 'Longboat Key', 'Siesta Key', 'Lakewood Ranch', 'Palmer Ranch',
                'Bradenton', 'Venice', 'Nokomis / Osprey', 'Other'];
  var TIMELINES = ['As soon as possible', 'Within 2 weeks', 'Within a month', 'Just getting estimates'];

  // Pre-relleno por página: menos preguntas = más leads terminados.
  var PATH = (location.pathname || '').toLowerCase();
  function guess(list, map) {
    for (var k in map) { if (PATH.indexOf(k) !== -1) return map[k]; }
    return '';
  }
  var PRE_SERVICE = guess(SERVICES, {
    'interior-painting': 'Interior Painting', 'exterior-painting': 'Exterior Painting',
    'cabinet-painting': 'Cabinet Painting', 'drywall-finishing': 'Drywall Finishing (Level 4/5)',
    'ceiling-repair': 'Popcorn / Ceiling Removal', 'water-damage': 'Water Damage Repair',
    'hurricane-storm-damage': 'Water Damage Repair', 'drywall-repair': 'Drywall Repair'
  });
  var PRE_CITY = guess(CITIES, {
    'siesta-key': 'Siesta Key', 'longboat-key': 'Longboat Key', 'lakewood-ranch': 'Lakewood Ranch',
    'palmer-ranch': 'Palmer Ranch', 'sarasota': 'Sarasota'
  });

  var A = { service: PRE_SERVICE, city: PRE_CITY, timeline: '', name: '', phone: '', email: '', notes: '', sms: false };
  var step = 0, sent = false;

  function ev(name, params) { if (typeof gtag === 'function') { try { gtag('event', name, params || {}); } catch (e) {} } }
  function utm() {
    var u = new URLSearchParams(location.search), keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
    var o = {}, fresh = false;
    keys.forEach(function (k) { var v = u.get(k); if (v) { o[k] = v; fresh = true; } else { o[k] = sessionStorage.getItem('px_' + k) || ''; } });
    if (fresh) { try { keys.forEach(function (k) { if (o[k]) sessionStorage.setItem('px_' + k, o[k]); }); } catch (e) {} }
    return o;
  }

  /* ---------- estilos (aislados con prefijo pxc-) ---------- */
  var css = '\
.pxc-fab{position:fixed;right:18px;bottom:18px;z-index:9998;display:flex;align-items:center;gap:9px;background:#1C1C1C;color:#C6A768;border:1px solid rgba(198,167,104,.45);border-radius:100px;padding:12px 18px;font-family:"DM Sans",sans-serif;font-size:14px;font-weight:500;cursor:pointer;box-shadow:0 8px 26px rgba(0,0,0,.35)}\
.pxc-fab:hover{background:#252525}.pxc-fab svg{width:17px;height:17px;stroke:#C6A768;fill:none;stroke-width:1.6}\
.pxc-tip{position:fixed;right:18px;bottom:74px;z-index:9997;max-width:230px;background:#FAFAFA;color:#333;border-left:3px solid #C6A768;border-radius:0 8px 8px 0;padding:11px 13px;font-family:"DM Sans",sans-serif;font-size:13.5px;line-height:1.5;box-shadow:0 8px 26px rgba(0,0,0,.22);cursor:pointer}\
.pxc-tip b{display:block;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a8377;font-weight:500;margin-bottom:3px}\
.pxc-x{position:absolute;top:4px;right:7px;color:#bbb;font-size:15px;line-height:1}\
.pxc-panel{position:fixed;right:18px;bottom:18px;z-index:9999;width:340px;max-width:calc(100vw - 24px);max-height:calc(100vh - 36px);display:flex;flex-direction:column;background:#FAFAFA;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4);font-family:"DM Sans",sans-serif}\
.pxc-hd{background:#1C1C1C;padding:13px 15px;display:flex;align-items:center;justify-content:space-between}\
.pxc-hd .n{font-family:"Cormorant Garamond",Georgia,serif;color:#C6A768;font-size:16px;letter-spacing:2px}\
.pxc-hd .s{font-size:10px;color:#8a8377;letter-spacing:1.2px;text-transform:uppercase;margin-top:1px}\
.pxc-hd button{background:none;border:0;color:#8a8377;font-size:20px;line-height:1;cursor:pointer;padding:0 2px}\
.pxc-body{padding:14px 15px;overflow-y:auto;flex:1;background:#F5F0E6}\
.pxc-msg{background:#fff;border-radius:2px 10px 10px 10px;padding:10px 12px;font-size:14px;line-height:1.55;color:#333;margin-bottom:10px;border-left:3px solid #C6A768}\
.pxc-me{background:#1C1C1C;color:#EDEBE6;border-radius:10px 2px 10px 10px;border:0;margin-left:38px;text-align:right}\
.pxc-opts{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:8px}\
.pxc-opt{background:#fff;border:1px solid #ddd6c6;border-radius:100px;padding:8px 13px;font-size:13px;color:#333;cursor:pointer;font-family:inherit}\
.pxc-opt:hover{border-color:#C6A768;background:#fffdf7}\
.pxc-f{margin-bottom:8px}\
.pxc-f input{width:100%;padding:11px 12px;border:1px solid #ddd6c6;border-radius:8px;font-size:15px;font-family:inherit;color:#333;background:#fff}\
.pxc-f input:focus{outline:none;border-color:#C6A768}\
.pxc-go{width:100%;padding:12px;background:#C6A768;color:#1C1C1C;border:0;border-radius:8px;font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;margin-top:2px}\
.pxc-go:disabled{opacity:.55;cursor:default}\
.pxc-sms{display:flex;gap:8px;align-items:flex-start;font-size:11.5px;color:#666;line-height:1.45;margin:8px 0 2px}\
.pxc-sms input{width:auto;margin-top:2px}\
.pxc-ft{padding:8px 15px;background:#fff;border-top:1px solid #eee;font-size:11px;color:#8a8377;text-align:center}\
.pxc-ft a{color:#C6A768;text-decoration:none;font-weight:500}\
.pxc-err{color:#a32d2d;font-size:12.5px;margin-top:6px}\
.pxc-hp{position:absolute;left:-9999px;width:1px;height:1px}\
@media(max-width:420px){.pxc-panel{right:8px;left:8px;bottom:8px;width:auto}.pxc-fab{right:12px;bottom:12px}}';

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- DOM ---------- */
  var fab = document.createElement('button');
  fab.className = 'pxc-fab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Chat with us');
  fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-4.6A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg><span>Chat with us</span>';
  document.body.appendChild(fab);

  var panel = null, tip = null;

  function tipShow() {
    if (panel || tip || sessionStorage.getItem('pxc_tip')) return;
    tip = document.createElement('div');
    tip.className = 'pxc-tip';
    tip.innerHTML = '<span class="pxc-x">&times;</span><b>Presiado Home</b>Have a project in mind? Tell us in 30 seconds and we\'ll get back to you.';
    document.body.appendChild(tip);
    tip.addEventListener('click', function (e) {
      try { sessionStorage.setItem('pxc_tip', '1'); } catch (x) {}
      if (e.target && e.target.className === 'pxc-x') { tip.remove(); tip = null; return; }
      tip.remove(); tip = null; open();
    });
  }
  setTimeout(tipShow, 15000);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function open() {
    if (panel) return;
    if (tip) { tip.remove(); tip = null; }
    fab.style.display = 'none';
    panel = document.createElement('div');
    panel.className = 'pxc-panel';
    panel.innerHTML = '<div class="pxc-hd"><div><div class="n">PRESIADO HOME</div>' +
      '<div class="s">Painting · Drywall · Insured</div></div><button type="button" aria-label="Close">&times;</button></div>' +
      '<div class="pxc-body" id="pxcBody"></div>' +
      '<div class="pxc-ft">Prefer to talk? <a href="tel:' + TEL + '">' + PHONE + '</a></div>';
    document.body.appendChild(panel);
    panel.querySelector('.pxc-hd button').addEventListener('click', close);
    ev('chat_open', { landing_path: location.pathname });
    step = 0; render();
  }
  function close() {
    if (panel) { panel.remove(); panel = null; }
    fab.style.display = '';
  }
  fab.addEventListener('click', open);

  function body() { return document.getElementById('pxcBody'); }
  function say(html, mine) {
    var d = document.createElement('div');
    d.className = 'pxc-msg' + (mine ? ' pxc-me' : '');
    d.innerHTML = html;
    body().appendChild(d);
    body().scrollTop = body().scrollHeight;
  }
  function options(list, cb) {
    var w = document.createElement('div'); w.className = 'pxc-opts';
    list.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pxc-opt'; b.textContent = o;
      b.addEventListener('click', function () { w.remove(); say(esc(o), true); cb(o); });
      w.appendChild(b);
    });
    body().appendChild(w); body().scrollTop = body().scrollHeight;
  }

  /* ---------- flujo ---------- */
  function render() {
    if (step === 0) {
      say('Hi — thanks for stopping by. What can we help you with?');
      if (A.service) { say(esc(A.service), true); step = 1; return render(); }
      return options(SERVICES, function (v) { A.service = v; step = 1; render(); });
    }
    if (step === 1) {
      say('Where is the project located?');
      if (A.city) { say(esc(A.city), true); step = 2; return render(); }
      return options(CITIES, function (v) { A.city = v; step = 2; render(); });
    }
    if (step === 2) {
      say('When would you like the work done?');
      return options(TIMELINES, function (v) { A.timeline = v; step = 3; render(); });
    }
    if (step === 3) {
      ev('chat_start', { service: A.service, city: A.city });
      say('Perfect. Leave your details and Francisco will follow up personally — usually the same day.');
      var f = document.createElement('div');
      f.innerHTML =
        '<div class="pxc-f"><input id="pxcN" type="text" placeholder="Your name" autocomplete="name"></div>' +
        '<div class="pxc-f"><input id="pxcP" type="tel" placeholder="Phone" autocomplete="tel" inputmode="tel"></div>' +
        '<div class="pxc-f"><input id="pxcE" type="email" placeholder="Email (optional)" autocomplete="email"></div>' +
        '<div class="pxc-f"><input id="pxcD" type="text" placeholder="Anything we should know? (optional)"></div>' +
        '<input class="pxc-hp" id="pxcHP" tabindex="-1" autocomplete="off" placeholder="Leave blank">' +
        '<label class="pxc-sms"><input type="checkbox" id="pxcS"><span>It\'s OK to text me about this project.</span></label>' +
        '<button type="button" class="pxc-go" id="pxcGo">Send &rarr;</button><div class="pxc-err" id="pxcErr"></div>';
      body().appendChild(f); body().scrollTop = body().scrollHeight;
      document.getElementById('pxcGo').addEventListener('click', submit);
      return;
    }
  }

  function submit() {
    var err = document.getElementById('pxcErr'), btn = document.getElementById('pxcGo');
    A.name = (document.getElementById('pxcN').value || '').trim();
    A.phone = (document.getElementById('pxcP').value || '').trim();
    A.email = (document.getElementById('pxcE').value || '').trim();
    A.notes = (document.getElementById('pxcD').value || '').trim();
    A.sms = document.getElementById('pxcS').checked;
    if (document.getElementById('pxcHP').value) return;           // honeypot
    if (!A.name) { err.textContent = 'Please add your name.'; return; }
    if (A.phone.replace(/\D/g, '').length < 10 && !A.email) {
      err.textContent = 'Please add a phone number or an email so we can reach you.'; return;
    }
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Sending…';

    var payload = Object.assign({
      name: A.name, phone: A.phone, email: A.email, city: A.city, service: A.service,
      timeline: A.timeline, referral_source: 'Website chat',
      notes: (A.notes ? A.notes + ' — ' : '') + 'Captured by website chat (' + A.service + ', ' + A.city + ', ' + A.timeline + ')',
      sms_consent: A.sms ? 'Yes' : 'No', source: 'chat-widget'
    }, utm(), { landing_path: location.pathname, referrer: document.referrer || 'direct' });

    fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload) })
      .then(done).catch(done);
    setTimeout(function () { if (!sent) done(); }, 6000);          // no-cors no da respuesta útil
  }

  function done() {
    if (sent) return; sent = true;
    ev('chat_lead', { service: A.service, city: A.city, timeline: A.timeline, landing_path: location.pathname });
    ev('conversion', { send_to: ADS_CONV });
    body().innerHTML = '';
    say('Thank you, ' + esc(A.name.split(' ')[0]) + '. Your request is in — Francisco will reach out shortly.' +
        '<br><br>Need it sooner? Call <a href="tel:' + TEL + '" style="color:#C6A768;font-weight:500">' + PHONE + '</a>.');
    setTimeout(function () { if (panel) close(); }, 9000);
  }
})();
