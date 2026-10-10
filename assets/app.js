// refuse to be framed (GitHub Pages mirror cannot send frame-ancestors)
if (window.top !== window.self) { try { window.top.location = window.self.location; } catch (e) { document.documentElement.hidden = true; } }

// Kompas: the only script on the site. Everything else works without JavaScript.

// remove keys left in browsers by earlier versions of the site
try { ["kompas-lang", "kompas-view", "ko-view", "kd-view", "kd-cat"].forEach(k => localStorage.removeItem(k)); } catch {}

// Quick exit: replace the current history entry with a neutral page (an ordinary weather site, owner 07.10)
function quickExit() { location.replace("https://www.gismeteo.ru/"); }
document.getElementById("exit").addEventListener("click", e => { e.preventDefault(); quickExit(); });
// Shift pressed three times within two seconds (the GOV.UK pattern: works with screen readers too).
// Not Esc: Esc already means "close" or "clear" and threw readers off the site by accident (audit 26.09).
// Not while typing: three capital letters in the search field must not close the site (audit 07.10, row 26)
let shifts = [];
const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
document.addEventListener("keydown", e => {
  if (e.key !== "Shift" || e.repeat) return;
  if (typing(e.target)) { shifts = []; return; }
  const now = Date.now();
  shifts = shifts.filter(t => now - t < 2000).concat(now);
  if (shifts.length >= 3) quickExit();
});

// Search on the home page: filters the list already on the screen. Nothing is sent or stored
// (no requests, no form, autocomplete off); without JavaScript the field stays hidden and the
// CSS filters still work.
const q = document.getElementById("q");
if (q) {
  const norm = s => s.toLowerCase().replace(/ё/g, "е");
  const sits = document.querySelector(".sits");
  const items = [...document.querySelectorAll(".sits li")];
  const none = document.getElementById("nores");
  q.hidden = false;
  q.addEventListener("input", () => {
    const words = norm(q.value).trim().split(/\s+/).filter(Boolean);
    items.forEach(li => {
      const k = norm(li.dataset.k || "");
      li.classList.toggle("qhide", words.length > 0 && !words.every(w => k.includes(w)));
    });
    sits.classList.toggle("searching", words.length > 0);
    empty(words.length > 0);
    site();
  });
  // a filter combination can leave the list empty (audit 26.09): say so instead of showing nothing
  function empty(searching) {
    none.hidden = !items.every(li => li.classList.contains("qhide") || li.offsetParent === null);
    if (!searching && none.hidden === false) { box && (box.hidden = true); }
  }
  document.querySelectorAll('input[name="w"], input[name="tp"]').forEach(r => r.addEventListener("change", () => {
    empty(norm(q.value).trim().length > 0);
    site();
  }));
  // nothing on the list matches: ask the site search (same engine as /search/, loaded only now, runs on this device)
  const box = document.getElementById("qsite"), list = document.getElementById("qsite-list"), head = document.getElementById("qsite-h");
  let index = null, loading = null;
  const L = q.dataset.t ? JSON.parse(q.dataset.t) : null;
  function load() {
    if (!loading) loading = new Promise((ok, fail) => {
      const s = document.createElement("script"); s.src = q.dataset.js; s.onload = ok; s.onerror = fail; document.head.appendChild(s);
    }).then(() => fetch(q.dataset.index, { integrity: q.dataset.sri, credentials: "omit" })).then(r => r.json()).then(j => { index = j; })
      .catch(() => { loading = null; });
    return loading;
  }
  function site() {
    if (!box || !L) return;
    list.textContent = ""; box.hidden = true;
    if (none.hidden || q.value.trim().length < 3) return;
    if (!index) { load().then(() => { if (index) site(); }); return; }
    const r = window.KompasSearch.search(index, q.value, 5);
    if (!r.results.length) return;
    head.textContent = L.site;
    if (r.alert) {
      const li = document.createElement("li"), a = document.createElement("a");
      a.href = r.alert === "crisis" ? L.crisis_url : L.urgent_url; a.textContent = r.alert === "crisis" ? L.crisis : L.urgent;
      a.className = "stitle"; li.appendChild(a); list.appendChild(li);
    }
    for (const { doc, note } of r.results) {
      const li = document.createElement("li"), tag = document.createElement("span"), a = document.createElement("a");
      tag.className = "skind"; tag.textContent = (index.kinds[doc[2]] || "") + (note ? " · " + note : ""); a.className = "stitle"; a.href = doc[0]; a.textContent = doc[1];
      li.append(tag, a); list.appendChild(li);
    }
    box.hidden = false;
  }
  addEventListener("pagehide", () => { q.value = ""; });
}

// printing: folded blocks (memos, warnings, «possibly not current») go on paper opened, then fold back (audit 07.10, row 41)
let printed = [];
addEventListener("beforeprint", () => { printed = [...document.querySelectorAll("details:not([open])")]; printed.forEach(d => { d.open = true; }); });
addEventListener("afterprint", () => { printed.forEach(d => { d.open = false; }); printed = []; });
