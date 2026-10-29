/* Sprint League 3 - read-only live view. Listens to the coach's ntfy.sh topic; nothing here can change data. */
(function () {
  "use strict";
  var C = window.SLCore, CFG = window.SL_CONFIG || {};
  var URL_BASE = "https://ntfy.sh/" + encodeURIComponent(CFG.topic || "");
  var snap = null, status = "connecting", lastSeen = 0, tab = "live";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ago(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 10) return "just now";
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    return Math.round(s / 3600) + " h ago";
  }
  function label(t) { return t === "blue" ? "Blue" : "White"; }

  // ---------- views ----------
  function scoreCard(s) {
    var sc = s.score;
    return '<div class="card"><div class="score"><div class="blue"><div class="small muted">BLUE</div><div class="n">' + sc.blue.wins +
      '</div><div class="small muted tabular">' + (sc.done ? C.fmt(sc.blue.ms) : "&ndash;") + '</div></div>' +
      '<div class="vs">rounds won<br>&amp;<br>total</div>' +
      '<div class="white"><div class="small muted">WHITE</div><div class="n">' + sc.white.wins +
      '</div><div class="small muted tabular">' + (sc.done ? C.fmt(sc.white.ms) : "&ndash;") + '</div></div></div>' +
      (sc.ties ? '<div class="small muted" style="text-align:center;margin-top:6px">' + sc.ties + " tied round" + (sc.ties === 1 ? "" : "s") + "</div>" : "") + "</div>";
  }
  function runCard(r, complete) {
    var done = r.x.every(function (x) { return x[1] != null; });
    var total = r.x.reduce(function (a, x) { return a + (x[1] || 0); }, 0);
    var rows = r.x.slice().sort(function (a, b) {
      return (a[1] == null ? Infinity : a[1]) - (b[1] == null ? Infinity : b[1]);
    }).map(function (x) {
      return '<div class="side"><span class="nm">' + esc(x[0]) + '</span><span class="tm2 tabular">' + (x[1] == null ? "&ndash;" : C.fmt(x[1])) + "</span></div>";
    }).join("");
    return '<div class="run ' + r.t + '"><div class="runhead"><span>Round ' + r.r + " &middot; " + label(r.t) + "</span>" +
      '<span class="tabular">' + (done ? "total " + C.fmt(total) : "running") + "</span></div>" + rows + "</div>";
  }
  function liveView(s) {
    var h = scoreCard(s);
    if (s.live) {
      h += '<div class="card banner2 ' + s.live.team + '">' + label(s.live.team) + " team is running now<br><span class=\"small muted\">Round " +
        s.live.round + " &middot; " + s.live.stopped + " of " + s.live.of + " finished</span></div>";
    } else if (!s.round) {
      h += '<div class="card small muted" style="text-align:center">No race in progress.</div>';
    }
    if (s.teams) {
      var col = function (c) {
        var ids = s.teams[c], tot = ids.reduce(function (a, p) { return a + (p[1] || 0); }, 0);
        return '<div class="team ' + c + '"><h3>' + label(c) + " (" + ids.length + ")</h3>" +
          '<div class="small muted" style="margin-bottom:8px">total avg ' + C.fmt(tot) + "</div>" +
          ids.map(function (p) { return '<div class="tp"><span>' + esc(p[0]) + '</span><span class="avg">' + (p[1] == null ? "new" : C.fmt(p[1])) + "</span></div>"; }).join("") + "</div>";
      };
      h += '<h2>Teams</h2><div class="cols">' + col("blue") + col("white") + "</div>";
    }
    if (s.runs.length) {
      h += "<h2>Times</h2><div class=\"card\">" + s.runs.slice().reverse().map(runCard).join("") + "</div>";
    }
    return h;
  }
  function peopleView(s) {
    var h = "<h2>Individual results</h2><div class=\"card\" style=\"padding:4px 10px\">";
    if (!s.roster.length) h += '<div class="small muted" style="padding:10px">No players yet.</div>';
    s.roster.forEach(function (p) {
      h += '<div class="player"><div class="grow"><div class="pname">' + esc(p[0]) + '</div><div class="small muted">' + p[2] + " run" + (p[2] === 1 ? "" : "s") +
        (p[3].length ? " &middot; recent: " + p[3].map(C.fmt).join(", ") : "") + "</div></div>" +
        '<div class="avg">' + (p[1] == null ? "new" : C.fmt(p[1])) + "</div></div>";
    });
    return h + "</div>";
  }

  function render() {
    var top = '<h1>Sprint League <span class="small muted" id="stat"></span></h1>';
    var body;
    if (!CFG.topic) body = '<p class="muted">Not set up: config.js has no topic.</p>';
    else if (!snap) body = '<p class="muted" style="text-align:center;margin-top:30px">' +
      (status === "connecting" ? "Connecting..." : "Waiting for the coach to start. This page updates by itself.") + "</p>";
    else body = tab === "live" ? liveView(snap) : peopleView(snap);
    var tabs = snap ? '<div class="tabs"><div><button data-v="live" class="' + (tab === "live" ? "on" : "") + '">Live</button><button data-v="people" class="' + (tab === "people" ? "on" : "") + '">Averages</button></div></div>' : "";
    document.getElementById("app").innerHTML = top + body + tabs;
    updateStat();
  }
  function updateStat() {
    var el = document.getElementById("stat");
    if (!el) return;
    var t = status === "live" ? (snap ? "updated " + ago(snap.ts) : "") : status === "connecting" ? "connecting..." : "reconnecting...";
    el.textContent = t;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]");
    if (b) { tab = b.getAttribute("data-v"); render(); window.scrollTo(0, 0); }
  });

  // ---------- data ----------
  function take(line) {
    var m;
    try { m = typeof line === "string" ? JSON.parse(line) : line; } catch (e) { return; }
    if (!m || m.event !== "message" || typeof m.message !== "string") return;
    var d;
    try { d = JSON.parse(m.message); } catch (e) { return; }
    if (!d || d.v !== 1 || !d.score || !d.roster) return;
    if (snap && d.ts < snap.ts) return; // ignore an older message arriving late
    snap = d; lastSeen = Date.now(); render();
  }
  function poll() {
    return fetch(URL_BASE + "/json?poll=1&since=latest").then(function (r) { return r.text(); }).then(function (t) {
      t.split("\n").forEach(function (l) { if (l.trim()) take(l); });
      if (status === "connecting") { status = "live"; render(); }
    });
  }
  function stream() {
    var es;
    try { es = new EventSource(URL_BASE + "/sse?since=latest"); } catch (e) { return; }
    es.onopen = function () { status = "live"; updateStat(); };
    es.onmessage = function (e) { take(e.data); };
    es.onerror = function () { status = "retry"; updateStat(); };
  }

  render();
  if (CFG.topic) {
    poll().catch(function () { status = "retry"; render(); });
    if (typeof EventSource === "function") stream();
    // safety net: EventSource can stall on phones that were asleep
    setInterval(function () { poll().catch(function () {}); }, 15000);
    setInterval(updateStat, 10000);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") poll().catch(function () {}); });
  }
})();
