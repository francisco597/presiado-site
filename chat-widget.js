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
  /* El paso de plazo se retiro el 2026-09-01 (carga cero: se cambian campos, no se
     suman). En su lugar el formulario final pide la direccion de la propiedad, que
     es el unico dato sin el cual no se puede agendar ni medir. */

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

  var A = { service: PRE_SERVICE, city: PRE_CITY, address: '', name: '', phone: '', email: '', notes: '', sms: false, ask: '' };
  var step = 0, sent = false, asked = {}, freeAsk = false, started = false;

  /* =====================================================================
     BANCO DE RESPUESTAS  ("Antes de dejar mis datos, quiero saber…")
     ---------------------------------------------------------------------
     Regla: el chat NO improvisa. Cada respuesta sale de doctrina escrita:
       · el FAQ ya publicado en las páginas de servicio (mismo copy que
         Google ya indexó y que el visitante acaba de leer más arriba), y
       · Brand Guide §5.4 para la garantía — WORD-FOR-WORD, nunca parafrasear.
     Compliance: solo "Insured". NUNCA "licensed", "GC", "License #".
     Si la pregunta no está en este banco, no se adivina: se captura como
     lead con la pregunta escrita y la contesta Francisco.
     ===================================================================== */

  var FREE_EST = ' Every estimate is itemized after a free on-site visit, so you see exactly what you are paying for.';

  var COST = {
    'Interior Painting': 'Interior painting in Sarasota typically runs <b>$2.80&ndash;$6.50 per sq ft</b>. A single bedroom usually lands $350&ndash;$650; a full 3&ndash;4 bedroom home $4,500&ndash;$9,000, including premium paint, prep and priming.',
    'Exterior Painting': 'Exterior painting typically runs <b>$1.50&ndash;$4.50 per sq ft</b> of paintable surface. A 2,000 sq ft home usually lands $3,500&ndash;$7,000. Surface condition, number of stories and stucco vs siding move the number.',
    'Cabinet Painting': 'Cabinet painting typically runs <b>$2,500&ndash;$6,500</b>. A standard kitchen of 30&ndash;40 doors usually lands $3,500&ndash;$5,500 with full prep, primer and two finish coats.',
    'Popcorn / Ceiling Removal': 'Popcorn removal with a smooth refinish runs <b>$500&ndash;$1,500 per room</b>. Small ceiling patches run $200&ndash;$450, and larger repairs or water-stain refinishing $450&ndash;$1,200.',
    'Water Damage Repair': 'A contained water-stain refinish typically runs <b>$250&ndash;$600</b>. Cutting out and replacing a failed drywall section with texture match and paint runs $600&ndash;$1,800. Larger areas run higher.',
    'Drywall Repair': 'A single room with light drywall repair plus painting typically runs <b>$1,200&ndash;$2,800</b>. Bigger scopes &mdash; water damage, popcorn removal, a full skim coat plus repaint &mdash; run $3,000&ndash;$8,000+.',
    'Drywall Finishing (Level 4/5)': 'A single room with drywall work plus painting typically runs <b>$1,200&ndash;$2,800</b>. Full-room skim coating to a Level 5 finish plus repaint runs $3,000&ndash;$8,000+, depending on square footage and wall condition.',
    _: 'It depends on the scope. As reference points: a small ceiling or drywall patch starts around $200&ndash;$450, interior painting runs $2.80&ndash;$6.50 per sq ft, and a kitchen cabinet repaint $2,500&ndash;$6,500.'
  };

  var TIME = {
    'Interior Painting': 'A single room takes 1&ndash;2 days. A full 3&ndash;4 bedroom interior usually takes 4&ndash;7 days. Your proposal commits to a specific timeline in writing before work begins.',
    'Cabinet Painting': '3&ndash;5 business days. We remove every door and drawer front, prep and sand, apply primer and finish coats in a controlled environment, then reinstall. Kitchen access is limited while we work.',
    'Popcorn / Ceiling Removal': 'Small patches and stain refinishing take 1&ndash;2 days including drying time. Popcorn removal with a smooth refinish takes 2&ndash;4 days per room. Water damage with replacement runs 3&ndash;5 days.',
    'Water Damage Repair': 'A contained stain refinish takes 1&ndash;2 days including drying time. Cut out, replace, texture-match and paint runs 2&ndash;4 days. Multiple damaged areas run longer.',
    'Drywall Repair': 'A single-room repair with paint is usually 1&ndash;3 days. Bigger scopes &mdash; water damage, popcorn removal, a full skim coat &mdash; run 3&ndash;5 days including drying time.',
    'Drywall Finishing (Level 4/5)': 'A single-room finish with paint is usually 1&ndash;3 days. A full skim coat to Level 5 across a room runs 3&ndash;5 days including drying and sanding time.',
    _: 'It depends on the size and condition of the space &mdash; most single-room projects are days, not weeks. Either way, your proposal commits to a specific timeline in writing before work begins.'
  };

  var WARRANTY =
    'Every project is backed by <b>Presiado Complete Coverage</b>:<br>' +
    '&bull; 3-Year Limited Workmanship Warranty (subject to written project agreement)<br>' +
    '&bull; Manufacturer Paint Warranty (up to 25 yrs)<br>' +
    '&bull; 30-Day Complimentary Touch-Up<br>' +
    '&bull; Lifetime Color Documentation<br>' +
    'If a workmanship defect shows up within those 3 years, we come back and correct it at no cost to you.';

  // Preguntas específicas por servicio (solo aparecen donde aplican).
  var EXTRAS = {
    'Interior Painting': [
      { k: 'protect', q: 'Do you protect my furniture and floors?',
        a: 'Completely. All furniture, fixtures and flooring are covered before any work begins, and we clean up at the end of every day so the house stays livable while we work.' }
    ],
    'Exterior Painting': [
      { k: 'hoa', q: 'Can you match my HOA colors?',
        a: 'Yes. We work directly from HOA-approved palettes and match approved colors precisely &mdash; we do it regularly in Longboat Key, Lakewood Ranch, Palmer Ranch and Siesta Key.' },
      { k: 'stucco', q: 'Do you paint stucco?',
        a: 'Stucco is our specialty in this market. We prepare, prime and paint it with Florida-rated coatings chosen to bridge hairline cracks and resist moisture.' }
    ],
    'Cabinet Painting': [
      { k: 'worth', q: 'Is painting better than replacing?',
        a: 'In most cases yes. Painting delivers the full kitchen transformation at 20&ndash;30% of the cost of replacement &mdash; homeowners here typically save $12,000&ndash;$30,000 &mdash; with a sprayed, factory-quality finish.' }
    ],
    'Popcorn / Ceiling Removal': [
      { k: 'asbestos', q: 'What about asbestos testing?',
        a: 'Florida requires asbestos testing before popcorn removal on homes built before 1980. We arrange the test through a certified lab and only proceed once the results are clear. Homes built 1980 or later typically do not need it.' },
      { k: 'match', q: 'Will the repair match my ceiling?',
        a: 'That is the real test of a ceiling job &mdash; raking light shows every transition. We test the texture on a small area first, dial in the match (Knockdown, Orange Peel or Smooth/Level 5), and confirm it before finishing.' }
    ],
    'Water Damage Repair': [
      { k: 'leak', q: 'Do you fix the leak itself?',
        a: 'No. We are a drywall, texture and paint company &mdash; not a plumber or roofer. We repair and refinish the ceiling once the water source has been stopped. If it has not been found yet, we tell you what we see and point you to the right trade first.' },
      { k: 'claim', q: 'Will my insurance cover this?',
        a: 'It often does when the damage is sudden and accidental, like a burst pipe or a storm-driven leak. We provide itemized documentation and photos for your adjuster. You file the claim, and coverage is decided by your carrier and policy, not by us.' }
    ],
    'Drywall Finishing (Level 4/5)': [
      { k: 'level', q: 'Level 4 or Level 5 &mdash; which do I need?',
        a: 'Level 4 is the standard finish: joints, fasteners and beads taped, coated and sanded. Level 5 adds a full skim coat across the entire surface &mdash; the right call under strong light, with dark colors, or with satin and gloss sheens.' }
    ],
    'Drywall Repair': [
      { k: 'texture', q: 'Can you match my existing texture?',
        a: 'Yes. We match Knockdown, Orange Peel and Smooth/Level 5 by hand on a small test area first, confirm the match with you, then sequence into primer and finish coats so the patch disappears.' }
    ]
  };

  // Núcleo, disponible en todas las páginas. Orden = orden en el menú.
  var CORE = [
    { k: 'cost', q: 'What will this cost?', a: function () { return (COST[A.service] || COST._) + FREE_EST; } },
    { k: 'start', q: 'How soon can you start?',
      a: 'We usually get out to see the project within a few days of your call, and your proposal comes back with a specific start date and timeline in writing. If you are working against a deadline, tell us &mdash; we will say honestly whether we can meet it before you commit to anything.' },
    { k: 'time', q: 'How long does the work take?', a: function () { return TIME[A.service] || TIME._; } },
    { k: 'warranty', q: 'What does your warranty cover?', a: WARRANTY },
    { k: 'insured', q: 'Are you insured?',
      a: 'Yes. Presiado Home Improvement LLC is a registered Florida LLC carrying general liability insurance and workers&rsquo; compensation coverage. Documentation is included with every written proposal.' },
    { k: 'estimate', q: 'What happens at the estimate?',
      a: 'It is free and there is no pressure. We walk the space with you, take measurements and photos, and send back one itemized written proposal &mdash; scope, products, timeline and price &mdash; so you can compare it against anything else you are looking at.' },
    { k: 'paint', q: 'What products do you use?',
      a: 'Sherwin-Williams and Benjamin Moore only &mdash; Emerald, Duration, SuperPaint and Regal Select, plus Emerald Urethane Trim Enamel on cabinets. They carry their own manufacturer warranty on the coating system.' },
    { k: 'both', q: 'Do you do drywall and painting together?',
      a: 'That is our core: drywall and painting done as one system, not two problems. One proposal, one crew, one inspection at the end &mdash; nobody pointing fingers over the seam that shows up after primer.' },
    { k: 'pay', q: 'How does payment work?',
      a: 'Projects are scheduled with a deposit and the balance at completion; longer projects are split into milestones. The exact schedule is written into your proposal and agreement before any work starts &mdash; no surprises, nothing due for the estimate.' },
    { k: 'area', q: 'Do you work in my area?',
      a: 'Sarasota and everything around it &mdash; Longboat Key, Siesta Key, Bird Key, Lakewood Ranch, Palmer Ranch, Bradenton, Venice, Nokomis and Osprey. Distance does not change our pricing or our standards.' }
  ];

  function faqAll() {
    var out = [], ex = EXTRAS[A.service] || [], i;
    for (i = 0; i < CORE.length; i++) {
      out.push(CORE[i]);
      if (i === 2) { for (var j = 0; j < ex.length; j++) out.push(ex[j]); } // extras tras las 3 primeras
    }
    return out;
  }
  function faqPending() {
    return faqAll().filter(function (f) { return !asked[f.k]; });
  }

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
.pxc-ask{display:block;background:none;border:0;padding:2px 0 6px;margin:0;font-family:inherit;font-size:12.5px;color:#8a7a52;text-decoration:underline;text-underline-offset:2px;cursor:pointer;text-align:left}\
.pxc-ask:hover{color:#1C1C1C}\
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
    list.forEach(function (o, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pxc-opt'; b.textContent = o;
      b.addEventListener('click', function () {
        var link = w.parentNode && w.parentNode.querySelector('.pxc-ask');
        if (link) link.remove();
        w.remove(); say(esc(o), true); cb(o, i);
      });
      w.appendChild(b);
    });
    body().appendChild(w); body().scrollTop = body().scrollHeight;
  }

  /* ---------- banco de respuestas: mecánica ---------- */
  function val(id) { var e = document.getElementById(id); return e ? (e.value || '').trim() : ''; }
  function stash() {                       // no perder lo tecleado al ir al banco
    if (!document.getElementById('pxcN')) return;
    A.name = val('pxcN'); A.phone = val('pxcP'); A.email = val('pxcE');
    A.address = val('pxcA') || A.address;
    A.notes = val('pxcD'); A.ask = val('pxcQ') || A.ask;
    var s = document.getElementById('pxcS'); A.sms = !!(s && s.checked);
  }
  function clearPending() {                 // quita opciones/formulario abiertos
    stash();
    var b = body(), n = b.querySelectorAll('.pxc-opts, .pxc-form, .pxc-ask'), i;
    for (i = 0; i < n.length; i++) n[i].remove();
  }
  function askLink(label) {
    if (!faqPending().length) return;
    var a = document.createElement('button');
    a.type = 'button'; a.className = 'pxc-ask';
    a.textContent = label || 'Before I share my info, I have a question →';
    a.addEventListener('click', function () { clearPending(); faqMenu(); });
    body().appendChild(a); body().scrollTop = body().scrollHeight;
  }
  function faqMenu(intro) {
    var list = faqPending().slice(0, 7);
    say(intro || 'Of course — what would you like to know?');
    var labels = list.map(function (f) { return f.q.replace(/&mdash;/g, '—'); });
    labels.push('Something else');
    options(labels, function (sel, idx) {
      if (idx === list.length) {            // "Something else" -> lo contesta Francisco
        freeAsk = true;
        ev('chat_faq', { question: 'other', landing_path: location.pathname });
        say('Ask away. Type your question below with your details and Francisco will answer you personally — usually the same day.');
        step = 3; return render();
      }
      answer(list[idx]);
    });
  }
  function answer(f) {
    asked[f.k] = 1;
    ev('chat_faq', { question: f.k, service: A.service, landing_path: location.pathname });
    say(typeof f.a === 'function' ? f.a() : f.a);
    var more = faqPending().length;
    var opts = ['Got it — let\'s continue'];
    if (more) opts.push('I have another question');
    options(opts, function (sel, idx) {
      if (idx === 1) return faqMenu('Sure — what else?');
      render();                             // retoma el paso donde se quedó
    });
  }

  /* ---------- flujo ---------- */
  function render() {
    if (step === 0) {
      say('Hi — thanks for stopping by. What can we help you with?');
      if (A.service) { say(esc(A.service), true); step = 1; return render(); }
      options(SERVICES, function (v) { A.service = v; step = 1; render(); });
      return askLink();
    }
    if (step === 1) {
      say('Where is the project located?');
      if (A.city) { say(esc(A.city), true); step = 3; return render(); }
      options(CITIES, function (v) { A.city = v; step = 3; render(); });
      return askLink();
    }
    if (step === 3) {
      // una sola vez: volver del banco de respuestas re-renderiza este paso.
      if (!started) { started = true; ev('chat_start', { service: A.service, city: A.city }); }
      say(freeAsk ? 'Leave your question and your details below.'
                  : 'Perfect. Leave your details and Francisco will follow up personally — usually the same day.');
      var f = document.createElement('div');
      f.className = 'pxc-form';
      f.innerHTML =
        (freeAsk ? '<div class="pxc-f"><input id="pxcQ" type="text" placeholder="Your question" value="' + esc(A.ask) + '"></div>' : '') +
        '<div class="pxc-f"><input id="pxcA" type="text" placeholder="Property address" autocomplete="street-address" value="' + esc(A.address) + '"></div>' +
        '<div class="pxc-f"><input id="pxcN" type="text" placeholder="Your name" autocomplete="name" value="' + esc(A.name) + '"></div>' +
        '<div class="pxc-f"><input id="pxcP" type="tel" placeholder="Phone" autocomplete="tel" inputmode="tel" value="' + esc(A.phone) + '"></div>' +
        '<div class="pxc-f"><input id="pxcE" type="email" placeholder="Email (optional)" autocomplete="email" value="' + esc(A.email) + '"></div>' +
        '<div class="pxc-f"><input id="pxcD" type="text" placeholder="Anything we should know? (optional)" value="' + esc(A.notes) + '"></div>' +
        '<input class="pxc-hp" id="pxcHP" tabindex="-1" autocomplete="off" placeholder="Leave blank">' +
        '<label class="pxc-sms"><input type="checkbox" id="pxcS"' + (A.sms ? ' checked' : '') + '><span>It\'s OK to text me about this project.</span></label>' +
        '<button type="button" class="pxc-go" id="pxcGo">Send &rarr;</button><div class="pxc-err" id="pxcErr"></div>';
      body().appendChild(f); body().scrollTop = body().scrollHeight;
      document.getElementById('pxcGo').addEventListener('click', submit);
      return askLink('Actually, I have a question first →');
    }
  }

  function submit() {
    var err = document.getElementById('pxcErr'), btn = document.getElementById('pxcGo');
    stash();
    if (document.getElementById('pxcHP').value) return;           // honeypot
    if (!A.name) { err.textContent = 'Please add your name.'; return; }
    if (A.phone.replace(/\D/g, '').length < 10 && !A.email) {
      err.textContent = 'Please add a phone number or an email so we can reach you.'; return;
    }
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Sending…';

    // Las preguntas que hizo van en las notas: son la señal que decide, a los
    // 30 días, si el banco guiado alcanza o hace falta otra cosa.
    var qs = Object.keys(asked);
    var payload = Object.assign({
      name: A.name, phone: A.phone, email: A.email, city: A.city, service: A.service,
      address: A.address, referral_source: 'Website chat',
      notes: (A.ask ? 'QUESTION: ' + A.ask + ' — ' : '') + (A.notes ? A.notes + ' — ' : '') +
             'Captured by website chat (' + A.service + ', ' + A.city + ')' +
             (qs.length ? ' — asked about: ' + qs.join(', ') : ''),
      sms_consent: A.sms ? 'Yes' : 'No', source: 'chat-widget'
    }, utm(), { landing_path: location.pathname, referrer: document.referrer || 'direct' });

    fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload) })
      .then(done).catch(done);
    setTimeout(function () { if (!sent) done(); }, 6000);          // no-cors no da respuesta útil
  }

  function done() {
    if (sent) return; sent = true;
    ev('chat_lead', { service: A.service, city: A.city, has_address: A.address ? 'yes' : 'no',
                      faq_count: Object.keys(asked).length, landing_path: location.pathname });
    ev('conversion', { send_to: ADS_CONV });
    body().innerHTML = '';
    say('Thank you, ' + esc(A.name.split(' ')[0]) + '. ' +
        (A.ask ? 'Francisco will answer your question personally, usually the same day.'
               : 'Your request is in — Francisco will reach out shortly.') +
        '<br><br>Need it sooner? Call <a href="tel:' + TEL + '" style="color:#C6A768;font-weight:500">' + PHONE + '</a>.');
    setTimeout(function () { if (panel) close(); }, 9000);
  }
})();
