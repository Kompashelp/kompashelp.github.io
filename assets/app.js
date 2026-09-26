// refuse to be framed (GitHub Pages mirror cannot send frame-ancestors)
if (window.top !== window.self) { try { window.top.location = window.self.location; } catch (e) { document.documentElement.hidden = true; } }

// Kompas: the only script on the site. Everything else works without JavaScript.

// remove keys left in browsers by earlier versions of the site
try { ["kompas-lang", "kompas-view", "ko-view", "kd-view", "kd-cat"].forEach(k => localStorage.removeItem(k)); } catch {}

// Quick exit: replace the current history entry with a neutral page
function quickExit() { location.replace("https://www.google.com/search?q=%D0%BF%D0%BE%D0%B3%D0%BE%D0%B4%D0%B0"); }
document.getElementById("exit").addEventListener("click", e => { e.preventDefault(); quickExit(); });
// Esc, or Shift pressed three times within a second (the GOV.UK pattern: works with screen readers too)
let shifts = [];
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !e.target.closest("input, textarea")) quickExit();
  if (e.key === "Shift" && !e.repeat) {
    const now = Date.now();
    shifts = shifts.filter(t => now - t < 1000).concat(now);
    if (shifts.length >= 3) quickExit();
  }
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
    none.hidden = !(words.length > 0 && items.every(li => li.classList.contains("qhide") || li.offsetParent === null));
  });
}
