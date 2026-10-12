// Kompas site search (spec §35). Runs only on the search page and only in this browser:
// the query is not sent anywhere, not put in the address, history or storage, and the field is
// cleared when the page is left. The index is built at build time by search_index.py.
"use strict";
(function () {
  const LAT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
  const CYR = "йцукенгшщзхъфывапролджэячсмитьбюё";
  const TOKEN = /\d+(?:\.\d+)+|[\p{L}\p{N}]+/gu;
  const norm = s => (s || "").toLowerCase().replace(/ё/g, "е");
  const toks = s => norm(s).match(TOKEN) || [];
  const swap = (w, from, to) => [...w].map(c => { const i = from.indexOf(c); return i < 0 ? c : to[i]; }).join("");

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  function prepare(I) {
    if (I._ready) return I;
    I.vocab = new Set([...Object.keys(I.idx), ...Object.keys(I.syn)]);
    I.vlist = [...I.vocab].filter(s => s.length >= 4 && !/^\d/.test(s));
    I.stopset = new Set(I.stop);
    I.maxlen = Math.max(...[...I.vocab].map(s => s.length));
    I._ready = true;
    return I;
  }

  // stems for one query word: the longest stem the word starts with (обыском -> обыск), close
  // longer forms of it (задержа -> задержан), and the synonyms of those stems
  function direct(I, w) {
    const out = new Map();
    if (/^\d/.test(w)) { if (I.vocab.has(w)) out.set(w, 1); return out; }
    const tail = /[а-я]/.test(w) ? 4 : 3;
    let longest = 0;
    for (let L = Math.min(w.length, I.maxlen); L >= (w.length <= 4 ? 2 : 3); L--) {
      const s = w.slice(0, L);
      if (!I.vocab.has(s) || w.length - L > tail) continue;
      if (!longest) longest = L;
      if (L >= longest - 1) out.set(s, 1);
    }
    if (longest >= 5) {
      const base = w.slice(0, longest);
      for (const s of I.vlist) if (s.length > longest && s.length - longest <= 3 && s.startsWith(base)) out.set(s, 0.85);
    }
    if (!out.size && w.length >= 4) {  // the reader is still typing: "задерж" -> задержа, задержан
      for (const s of I.vlist) if (s.startsWith(w) && s.length - w.length <= 4) out.set(s, 0.8);
    }
    return out;
  }

  function typo(I, w) {
    const out = new Map();
    if (w.length < 5 || /^\d/.test(w)) return out;
    const max = w.length >= 8 ? 2 : 1;
    let best = max + 1;
    const hits = [];
    for (const s of I.vlist) {
      if (Math.abs(s.length - w.length) > 5) continue;
      let d = max + 1;
      for (let j = s.length - 1; j <= s.length + 1 && j <= w.length; j++) {
        if (w.length - j > 4) continue;
        d = Math.min(d, lev(w.slice(0, j), s, max));
      }
      if (d <= max) { hits.push([s, d]); if (d < best) best = d; }
    }
    for (const [s, d] of hits) if (d === best) out.set(s, 0.7);
    return out;
  }

  function expand(I, m) {
    for (const [s, q] of [...m]) for (const t of I.syn[s] || []) if (!m.has(t)) m.set(t, q * 0.9);
    return m;
  }

  // query -> terms (each a Map stem -> quality). Words that match nothing are dropped:
  // "опасно ли ехать" still finds the page about travelling even if "опасно" is not on it
  function parse(I, query) {
    prepare(I);
    let q = " " + toks(query).join(" ") + " ";
    const terms = [];
    for (const [p, to] of I.phr) {
      if (q.includes(" " + p + " ")) {
        terms.push({ w: p, own: to, q: 1, alts: new Map(to.map(s => [s, 0.95])) });
        q = q.replace(" " + p + " ", " ");
      }
    }
    let words = 0;
    for (const w of q.trim().split(/\s+/).filter(Boolean)) {
      if (I.stopset.has(w) || (w.length < 2 && !/^\d/.test(w))) continue;
      words++;
      let alts = direct(I, w);
      if (!alts.size) alts = typo(I, w);
      if (alts.size) terms.push({ w, own: [...alts.keys()], q: Math.max(...alts.values()), alts: expand(I, alts) });
    }
    return { terms, words };
  }

  // typed with the wrong keyboard layout: "j,scr" -> "обыск", "ghbdtn" -> "привет"
  function understood(I, query) {
    const a = parse(I, query);
    const wrong = I.lang === "ru" ? /[a-z]/.test(query) && !/[а-яё]/i.test(query) : /[а-яё]/i.test(query) && !/[a-z]/i.test(query);
    if (!wrong) return { ...a, fixed: false, shown: query };
    const alt = I.lang === "ru" ? swap(query.toLowerCase(), LAT, CYR) : swap(query.toLowerCase(), CYR, LAT);
    const b = parse(I, alt);
    const quality = r => r.terms.reduce((n, t) => n + t.q, 0);
    return quality(b) > quality(a) ? { ...b, fixed: true, shown: alt } : { ...a, fixed: false, shown: query };
  }

  function search(I, query, limit) {
    const { terms, fixed, shown, words } = understood(I, query);
    const res = { results: [], alert: null, fixed, shown, partial: terms.length < words, terms };
    if (!terms.length) {
      // only stop words («помогите», «что делать»): the pin made for exactly that, instead of «nothing found»
      const raw = toks(shown);
      const pin = I.pins.find(p => p.w && raw.some(w => p.w.includes(w)));
      if (pin) {
        res.alert = pin.a || null;
        res.results = pin.p.slice(0, limit || 30).map(d => ({ d, doc: I.docs[d], pinned: true, note: (pin.n || {})[d] }));
      }
      return res;
    }
    const N = I.docs.length;
    const score = new Map(), cover = new Map();
    for (const t of terms) {
      const best = new Map();
      for (const [s, q] of t.alts) {
        const p = I.idx[s];
        if (!p) continue;
        const idf = Math.log(1 + N / (p.length / 2));
        for (let i = 0; i < p.length; i += 2) {
          const v = q * p[i + 1] * idf;
          if (v > (best.get(p[i]) || 0)) best.set(p[i], v);
        }
      }
      for (const [d, v] of best) {
        score.set(d, (score.get(d) || 0) + v);
        cover.set(d, (cover.get(d) || 0) + 1);
      }
    }
    const n = terms.length;
    let need = n <= 2 ? n : n - 1;
    let ids = [...score.keys()].filter(d => cover.get(d) >= need);
    if (!ids.length && n > 1) { need = 1; ids = [...score.keys()]; res.partial = true; }
    const rank = d => cover.get(d) * 1e6 + score.get(d) * I.docs[d][4];
    ids.sort((a, b) => rank(b) - rank(a));

    // pinned answers: the page people most likely need, above everything else
    const stemsOf = t => t.own;  // the reader's own words, not their synonyms: «забрали телефон» is not a detention
    const hit = (keys, t) => stemsOf(t).some(s => keys.some(k => s === k || (k.length >= 4 && s.length >= 4 && (s.startsWith(k) || k.startsWith(s)))));
    const pinned = [], notes = new Map();
    for (const pin of I.pins) {
      if (!pin.k) continue;
      const first = terms.find(t => hit(pin.k, t));
      if (!first) continue;
      if (pin.and && !terms.some(t => t !== first && hit(pin.and, t))) continue;
      if (pin.a && !res.alert) res.alert = pin.a;
      for (const d of pin.p) if (!pinned.includes(d)) pinned.push(d);
      for (const d in pin.n || {}) if (!notes.has(+d)) notes.set(+d, pin.n[d]);
    }
    const order = pinned.concat(ids.filter(d => !pinned.includes(d))).slice(0, limit || 30);
    res.results = order.map(d => ({ d, doc: I.docs[d], pinned: pinned.includes(d), note: notes.get(d) }));
    return res;
  }

  const api = { search, parse: understood, toks, norm };
  if (typeof module === "object" && module.exports) { module.exports = api; return; }
  window.KompasSearch = api;

  // ---- page ---------------------------------------------------------------------------------
  const box = document.getElementById("sbox");
  if (!box) return;
  const input = document.getElementById("sq");
  const list = document.getElementById("slist");
  const status = document.getElementById("sstatus");
  const note = document.getElementById("snote");
  const alertBox = { urgent: document.getElementById("alert-urgent"), crisis: document.getElementById("alert-crisis") };
  const az = document.getElementById("az");
  const L = JSON.parse(box.dataset.t);
  let index = null, loading = null;

  function load() {
    if (!loading) {
      loading = fetch(box.dataset.index, { integrity: box.dataset.sri, credentials: "omit", cache: "force-cache" })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(j => { index = j; return j; })
        .catch(() => { status.textContent = L.error; loading = null; });
    }
    return loading;
  }

  // highlight the words of the page that start with a matched stem
  function marked(el, text, stems) {
    const parts = text.split(/([\p{L}\p{N}]+)/u);
    for (const part of parts) {
      const w = norm(part);
      if (w.length >= 3 && stems.some(s => s.length >= 3 && w.startsWith(s))) {
        const m = document.createElement("mark"); m.textContent = part; el.appendChild(m);
      } else if (part) el.appendChild(document.createTextNode(part));
    }
  }

  function render() {
    const q = input.value;
    list.textContent = "";
    note.hidden = true;
    for (const k in alertBox) if (alertBox[k]) alertBox[k].hidden = true;
    document.getElementById("sprivate").hidden = !!q.trim();
    if (!q.trim()) { az.hidden = false; status.textContent = ""; document.getElementById("sempty").hidden = true; return; }
    az.hidden = true;
    if (!index) { load().then(() => { if (index) render(); }); status.textContent = L.loading; return; }
    const r = search(index, q, 30);
    const stems = [...new Set(r.terms.flatMap(t => [...t.alts.keys()]))];
    if (r.alert && alertBox[r.alert]) alertBox[r.alert].hidden = false;
    if (r.fixed) {
      note.hidden = false; note.textContent = L.fixed.replace("%s", r.shown);
    } else if (r.partial && r.results.length) {
      note.hidden = false; note.textContent = L.partial;
    }
    for (const { doc, note: label } of r.results) {
      const [url, title, kind, snip, , heads] = doc;
      const li = document.createElement("li");
      const tag = document.createElement("span"); tag.className = "skind"; tag.textContent = (index.kinds[kind] || "") + (label ? " · " + label : ""); li.appendChild(tag);
      const a = document.createElement("a"); a.href = url; a.className = "stitle"; marked(a, title, stems); li.appendChild(a);
      const p = document.createElement("p"); p.className = "ssnip"; marked(p, snip, stems); li.appendChild(p);
      const h = heads.find(([, text]) => norm(text) !== norm(title) && toks(text).some(w => w.length >= 3 && stems.some(s => s.length >= 4 && w.startsWith(s))));
      if (h) {
        const s = document.createElement("a"); s.className = "ssec"; s.href = url + "#" + h[0];
        s.textContent = L.section + " "; marked(s, h[1], stems); li.appendChild(s);
      }
      list.appendChild(li);
    }
    status.textContent = r.results.length ? L.found.replace("%d", r.results.length) : L.none;
    if (!r.results.length && (index.lang === "en" ? /[а-яё]/i : /[a-z]/i).test(q)) { note.hidden = false; note.textContent = L.other; }
    document.getElementById("sempty").hidden = r.results.length > 0;
  }

  box.hidden = false;
  document.getElementById("sprivate").hidden = false;
  document.getElementById("snojs").hidden = true;
  let timer = 0;
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(render, 80); });
  input.addEventListener("focus", load, { once: true });
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { const a = list.querySelector("a"); if (a) a.click(); }
    if (e.key === "Escape") { input.value = ""; render(); }
    if (e.key === "ArrowDown") { const a = list.querySelector("a"); if (a) { e.preventDefault(); a.focus(); } }
  });
  // nothing of the query survives leaving the page (back button, bfcache, form restore)
  addEventListener("pagehide", () => { input.value = ""; list.textContent = ""; });
  addEventListener("pageshow", () => { input.value = ""; render(); });
  input.value = "";
  // no autofocus (audit 07.10, row 25): on a phone it pops the keyboard over half the screen, and the 133 KB index
  // is fetched only when the reader taps the field or starts typing
})();
