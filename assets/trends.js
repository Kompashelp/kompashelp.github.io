/* «Динамика»: one interactive chart over every series the projects publish (spec §34, owner 2026-10-07).
   Optional, like search: without JS the page shows the same figures as static charts and tables.
   Data comes only from our own site (integrity-checked); nothing is stored, nothing changes the address. */
(function () {
  "use strict";
  var box = document.getElementById("tchart");
  if (!box || !window.fetch) return;
  var T = JSON.parse(box.dataset.t), lang = box.dataset.lang;
  var NS = "http://www.w3.org/2000/svg", W = 640, H = 260, L = 64, R = 12, TOP = 12, B = 34;
  var DAY = 864e5, RANGES = [["all", 0], ["y", 365], ["q", 91], ["m", 31]];
  var MON = lang === "ru" ? ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
                          : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var data, byId = {}, cur = "cmp", range = "all";

  function d(s) { return new Date(s + "T00:00:00Z").getTime(); }
  function fmt(t) { var x = new Date(t); return x.getUTCDate() + " " + MON[x.getUTCMonth()] + " " + x.getUTCFullYear(); }
  function num(n) { return lang === "en" ? n.toLocaleString("en-GB") : String(n); }
  function el(tag, attrs, parent, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(tag, attrs, parent, text) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function niceStep(span) {
    var raw = Math.max(1, span / 4), mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 5, 10].map(function (m) { return m * mag; }).filter(function (v) { return v >= raw; })[0];
  }
  function sign(v) { return v > 0 ? "+" + v : String(v); }

  /* points of a series inside the period, plus the last point before it (the line enters from the left edge) */
  function window_(pts, end, days) {
    if (!days) return { pts: pts, t0: d(pts[0][0]) };
    var t0 = end - days * DAY, before = null, inside = [];
    pts.forEach(function (p) { if (d(p[0]) < t0) before = p; else inside.push(p); });
    return { pts: before ? [before].concat(inside) : inside, t0: t0 };
  }

  function draw() {
    var host = box.querySelector(".tc-svg"), sum = box.querySelector(".tc-sum"), leg = box.querySelector(".tc-leg"), help = box.querySelector(".tc-help");
    host.textContent = ""; sum.textContent = ""; leg.textContent = "";
    var days = RANGES.filter(function (r) { return r[0] === range; })[0][1];
    var cmp = cur === "cmp";
    help.hidden = !cmp;
    R = cmp ? 112 : 12;  // room for the names at the ends of the lines
    var list = cmp ? data.s.filter(function (s) { return s.g === "main"; }) : [byId[cur]];
    var end = Math.max.apply(null, list.map(function (s) { return d(s.p[s.p.length - 1][0]); }));
    var lines = [], t0 = Infinity, lo = Infinity, hi = -Infinity;
    list.forEach(function (s, k) {
      var w = window_(s.p, end, days);
      if (w.pts.length < 2 || (cmp && !w.pts[0][1])) return;
      var base = w.pts[0][1];
      var pts = w.pts.map(function (p) { return { t: d(p[0]), n: p[1], v: cmp ? Math.round(1000 * (p[1] - base) / base) / 10 : p[1] }; });
      lines.push({ s: s, k: k, pts: pts });
      t0 = Math.min(t0, days ? w.t0 : pts[0].t);
      pts.forEach(function (p) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); });
    });
    if (!lines.length) { h("p", { "class": "tr-few" }, host, T.few); return; }
    if (cmp) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    var step = niceStep(Math.max(1, hi - lo)), y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
    if (y1 === y0) y1 = y0 + step;
    var span = Math.max(DAY, end - t0);
    var X = function (t) { return L + (W - L - R) * (t - t0) / span; };
    var Y = function (v) { return TOP + (H - TOP - B) * (y1 - v) / (y1 - y0); };
    var svg = el("svg", { "class": "chart", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": lines.map(function (l) {
      var a = l.pts[0], z = l.pts[l.pts.length - 1];
      return (lang === "ru" ? l.s.sr : l.s.se) + ": " + fmt(a.t) + " " + num(a.n) + " → " + fmt(z.t) + " " + num(z.n);
    }).join("; ") }, host);
    for (var v = y0; v <= y1 + 1e-9; v += step) {
      el("line", { x1: L, x2: W - R, y1: Y(v), y2: Y(v), "class": "grid" }, svg);
      el("text", { x: L - 6, y: Y(v) + 4, "text-anchor": "end" }, svg, (cmp ? sign(Math.round(v)) + "%" : num(Math.round(v))));
    }
    // x axis: years, months or weeks, like build.py
    var sd = span / DAY, a = new Date(t0), ticks = [];
    if (sd > 540) { for (var y = a.getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= end; y++) ticks.push([Date.UTC(y, 0, 1), String(y)]); }
    else if (sd > 45) {
      var every = sd <= 120 ? 1 : 2;
      for (var m = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1)); m.getTime() <= end; m.setUTCMonth(m.getUTCMonth() + 1))
        if (m.getUTCMonth() % every === 0) ticks.push([m.getTime(), MON[m.getUTCMonth()] + (m.getUTCMonth() === 0 ? " " + m.getUTCFullYear() : "")]);
    } else { for (var w7 = t0 + ((8 - new Date(t0).getUTCDay()) % 7) * DAY; w7 <= end; w7 += 7 * DAY) { var x7 = new Date(w7); ticks.push([w7, x7.getUTCDate() + "." + (x7.getUTCMonth() + 1)]); } }
    ticks.forEach(function (tk) { el("text", { x: X(tk[0]), y: H - B + 18, "text-anchor": "middle" }, svg, tk[1]); });
    el("line", { x1: L, x2: W - R, y1: cmp ? Y(0) : H - B, y2: cmp ? Y(0) : H - B, "class": "axis" }, svg);
    // events that concern what is shown
    var ids = lines.map(function (l) { return l.s.id; });
    if (!cmp) data.e.forEach(function (e) {
      var t = d(e[0]);
      if (t < t0 || t > end) return;
      var f = e[4], fits = f === "all" || ids.indexOf(f) >= 0 || (f === "ru" && ids.some(function (i) { return i !== "viasna" && i !== "crimea"; }));
      if (!fits) return;
      var g = el("g", { tabindex: "0", "class": "ev" }, svg), x = X(t), y = H - B;
      el("path", { d: "M" + x + " " + (y + 1) + "l-5 8h10z" }, g);
      el("title", {}, g, fmt(t) + ": " + (lang === "ru" ? e[1] : e[2]));
    });
    var clip = "tcclip";
    el("rect", { x: L, y: 0, width: W - L - R, height: H }, el("clipPath", { id: clip }, svg));
    lines.forEach(function (l) {
      el("polyline", { points: l.pts.map(function (p) { return X(p.t).toFixed(1) + "," + Y(p.v).toFixed(1); }).join(" "),
        "class": cmp ? "k" + l.k : "ln", "clip-path": "url(#" + clip + ")" }, svg);
      if (!cmp && l.pts.length <= 120) l.pts.forEach(function (p) { if (p.t >= t0) el("circle", { cx: X(p.t), cy: Y(p.v), r: 3 }, svg); });
    });
    // names and totals at the ends of the lines, pushed apart so they never overlap
    if (cmp) {
      var ends = lines.map(function (l) { var z = l.pts[l.pts.length - 1]; return { l: l, x: X(z.t), y: Y(z.v), v: z.v }; })
        .sort(function (a, b) { return a.y - b.y; });
      for (var i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
      ends.forEach(function (e) {
        el("circle", { cx: e.x, cy: Y(e.v), r: 3.5, "class": "k" + e.l.k }, svg);
        el("text", { x: W - R + 8, y: e.y + 4, "class": "lbl k" + e.l.k }, svg, (lang === "ru" ? e.l.s.sr : e.l.s.se) + " " + sign(Math.round(e.v)) + "%");
      });
    }
    // crosshair: the nearest published point to the pointer, its date, value and change since the period start
    var xh = el("line", { y1: TOP, y2: H - B, "class": "xh", visibility: "hidden" }, svg);
    var tip = h("div", { "class": "tc-tip", hidden: "" }, host);
    function show(ev) {
      var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width;
      var t = t0 + (x - L) / (W - L - R) * span, best = null;
      lines.forEach(function (l) { l.pts.forEach(function (p) { if (p.t >= t0 && (!best || Math.abs(p.t - t) < Math.abs(best.p.t - t))) best = { l: l, p: p }; }); });
      if (!best) return;
      var same = lines.map(function (l) {
        var q = null; l.pts.forEach(function (p) { if (p.t <= best.p.t) q = p; }); return q && { l: l, p: q };
      }).filter(Boolean);
      xh.setAttribute("x1", X(best.p.t)); xh.setAttribute("x2", X(best.p.t)); xh.setAttribute("visibility", "visible");
      tip.textContent = "";
      h("b", {}, tip, fmt(best.p.t));
      same.forEach(function (s) {
        var first = s.l.pts[0], txt = (lines.length > 1 ? (lang === "ru" ? s.l.s.sr : s.l.s.se) + ": " : "") + num(s.p.n);
        txt += cmp ? " (" + sign(s.p.v) + "%)" : (s.p !== first ? " (" + sign(s.p.n - first.n) + " " + T.since + " " + fmt(first.t) + ")" : "");
        h("br", {}, tip);
        if (cmp) h("span", { "class": "sw k" + s.l.k }, tip);
        tip.appendChild(document.createTextNode(txt));
      });
      tip.style.left = (X(best.p.t) / W * 100) + "%";
      tip.style.top = (Y(best.p.v) / H * 100) + "%";
      tip.hidden = false;
    }
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", function () { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
    // summary under the chart, and a legend when several lines are shown
    lines.forEach(function (l) {
      var a = l.pts[0], z = l.pts[l.pts.length - 1], diff = z.n - a.n, pct = a.n ? Math.round(100 * diff / a.n) : 0;
      var li = h(lines.length > 1 ? "li" : "p", { "class": lines.length > 1 ? "" : "tr-chg" }, lines.length > 1 ? leg : sum);
      if (lines.length > 1) { h("span", { "class": "sw k" + l.k, "aria-hidden": "true" }, li); h("b", {}, li, (lang === "ru" ? l.s.sr : l.s.se) + ". "); li.appendChild(document.createTextNode((lang === "ru" ? l.s.ru : l.s.en) + ": ")); }
      li.appendChild(document.createTextNode((lang === "ru" ? "было " : "") + num(a.n) + " (" + fmt(a.t) + ") → " + (lang === "ru" ? "стало " : "") + num(z.n) + " (" + fmt(z.t) + "), "));
      h("b", { "class": diff > 0 ? "up" : diff < 0 ? "down" : "" }, li, (diff > 0 ? "▲ " : diff < 0 ? "▼ " : "") + sign(diff) + " (" + sign(pct) + "%)");
    });
    var src = box.querySelector(".tc-src");
    src.textContent = "";
    lines.forEach(function (l, i) { if (i) src.appendChild(document.createTextNode(" · ")); h("a", { href: l.s.u, rel: "noopener noreferrer" }, src, lang === "ru" ? l.s.ru : l.s.en); });
  }

  function build() {
    data.s.forEach(function (s) { byId[s.id] = s; });
    var ui = h("div", { "class": "tc-ui" });
    var sel = h("select", { "aria-label": T.pick || T.cmp }, ui);
    h("option", { value: "cmp" }, sel, T.cmp);
    [["main", T.main], ["register", T.register], ["memorial", T.memorial], ["article", T.article], ["region", T.region]].forEach(function (g) {
      var og = h("optgroup", { label: g[1] }, sel);
      data.s.filter(function (s) { return s.g === g[0] && s.p.length; })
        .sort(function (a, b) { return g[0] === "main" ? 0 : b.p[b.p.length - 1][1] - a.p[a.p.length - 1][1]; })
        .forEach(function (s) { h("option", { value: s.id }, og, (lang === "ru" ? s.ru : s.en) + " — " + num(s.p[s.p.length - 1][1])); });
    });
    sel.addEventListener("change", function () { cur = sel.value; draw(); });
    var rg = h("div", { "class": "tc-r", role: "group", "aria-label": T.period || "" }, ui);
    RANGES.forEach(function (r) {
      var b = h("button", { type: "button", "aria-pressed": r[0] === range ? "true" : "false" }, rg, T[r[0]]);
      b.addEventListener("click", function () {
        range = r[0];
        rg.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        draw();
      });
    });
    h("p", { "class": "tr-note tc-help" }, ui, T.cmp_help);
    h("div", { "class": "tc-svg" }, ui);
    h("div", { "class": "tc-sum" }, ui);
    h("ul", { "class": "legend tc-leg" }, ui);
    h("p", { "class": "tr-note tc-src" }, ui);
    box.appendChild(ui);
    box.classList.add("js");
    draw();
  }

  fetch(box.dataset.src, { integrity: box.dataset.sri, credentials: "omit" })
    .then(function (r) { return r.json(); })
    .then(function (j) { data = j; build(); })
    .catch(function () { /* the static charts stay */ });
})();
