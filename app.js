/* Sprint League 3 - phone UI. All data lives in localStorage; no server, no logins. */
(function () {
  "use strict";
  var C = window.SLCore;
  var KEY = "sl3";

  // ---------- state ----------
  // players: [{id, name, times:[{ms, d}]}]   present: {id:true}
  // teams: {blue:[id], white:[id]} | null
  // runs: [{id, round, team, runners:[{pid, ms}]}]  (per round: White runs together, then Blue)
  // running: {runId, startedAt(epoch ms)} | null      log: past practice summaries
  var state = load();
  var ui = { tab: "roster", open: null, last: null, raf: 0, lastStopAt: 0 };

  function blank() {
    return { players: [], present: {}, teams: null, round: 0, runs: [], running: null, log: [] };
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.players)) {
        var b = blank();
        for (var k in b) if (s[k] === undefined) s[k] = b[k];
        if (s.heats) { delete s.heats; s.runs = []; s.round = 0; s.running = null; } // old one-on-one format
        return s;
      }
    } catch (e) {}
    return blank();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { alert("Could not save data: " + e.message); }
  }

  // ---------- helpers ----------
  function P(id) { for (var i = 0; i < state.players.length; i++) if (state.players[i].id === id) return state.players[i]; return null; }
  function nameOf(id) { var p = P(id); return p ? p.name : "(removed)"; }
  function groupMean() {
    var a = state.players.map(C.avgMs).filter(function (v) { return v != null; });
    return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 6000;
  }
  function avgOf(id) { var p = P(id), a = p ? C.avgMs(p) : null; return a != null ? a : groupMean(); }
  function nowT() { return performance.timeOrigin + performance.now(); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  function sum(ids) { return ids.reduce(function (a, id) { return a + avgOf(id); }, 0); }
  function roundRuns(r) { return state.runs.filter(function (x) { return x.round === r; }); }
  function currentRun() {
    var rs = roundRuns(state.round);
    for (var i = 0; i < rs.length; i++) if (!C.runDone(rs[i])) return rs[i];
    return null;
  }
  function runById(id) { for (var i = 0; i < state.runs.length; i++) if (state.runs[i].id === id) return state.runs[i]; return null; }
  function teamLabel(c) { return c === "blue" ? "Blue" : "White"; }
  function presentPlayers() { return state.players.filter(function (p) { return state.present[p.id]; }); }
  function inRace() { return state.runs.length > 0; }
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }

  // ---------- rendering ----------
  function render() {
    cancelAnimationFrame(ui.raf);
    var body = ui.tab === "roster" ? rosterView() : ui.tab === "teams" ? teamsView() : raceView();
    var tabs = '<div class="tabs"><div>' +
      tabBtn("roster", "Roster") + tabBtn("teams", "Teams") + tabBtn("race", "Race", !state.teams) +
      "</div></div>";
    var scroll = window.scrollY;
    document.getElementById("app").innerHTML = body + tabs;
    if (ui.keepScroll) window.scrollTo(0, scroll);
    ui.keepScroll = false;
    if (ui.tab === "race" && state.running) { tick(); wakeLock(); }
  }
  function tabBtn(id, label, disabled) {
    return '<button data-a="tab" data-v="' + id + '" class="' + (ui.tab === id ? "on" : "") + '"' + (disabled ? " disabled" : "") + ">" + label + "</button>";
  }

  // ----- roster tab (also attendance) -----
  function rosterView() {
    var here = presentPlayers().length;
    var h = "<h1>Roster <span class=\"muted small\">" + here + " of " + state.players.length + " here today</span></h1>";
    h += '<div class="card"><div class="row"><input id="newName" type="text" placeholder="Add a player" autocomplete="off" autocapitalize="words">' +
         '<button class="primary" data-a="add-player">Add</button></div></div>';

    if (state.players.length) {
      h += '<div class="btns" style="margin-bottom:10px"><button class="sm" data-a="all">Everyone here</button><button class="sm" data-a="none">Clear</button></div>';
    } else {
      h += '<p class="muted" style="text-align:center">No players yet. Add them above, or paste a list under Bulk import.</p>';
    }

    var sorted = state.players.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    h += '<div class="card" style="padding:4px 10px">';
    sorted.forEach(function (p) {
      var a = C.avgMs(p), on = !!state.present[p.id], open = ui.open === p.id;
      h += '<div class="player"><div class="check ' + (on ? "on" : "") + '" data-a="present" data-id="' + p.id + '" style="padding:14px;margin:-14px">&#10003;</div>' +
           '<div class="grow" data-a="open" data-id="' + p.id + '" style="margin-left:14px"><div class="pname">' + esc(p.name) + '</div>' +
           '<div class="small muted">' + p.times.length + " run" + (p.times.length === 1 ? "" : "s") + "</div></div>" +
           '<div class="avg" data-a="open" data-id="' + p.id + '">' + (a == null ? "new" : C.fmt(a)) + "</div></div>";
      if (open) {
        h += '<div class="detail"><div class="small muted">Times (tap &times; to remove)</div><div class="chips">';
        if (!p.times.length) h += '<span class="small muted">None yet</span>';
        var start = Math.max(0, p.times.length - 40);
        for (var i = start; i < p.times.length; i++) h += '<span class="chip">' + C.fmt(p.times[i].ms) + '<b data-a="del-time" data-id="' + p.id + '" data-i="' + i + '">&times;</b></span>';
        h += '</div><div class="row"><input id="addTime" type="text" inputmode="decimal" placeholder="Add time, e.g. 5.32"><button data-a="add-time" data-id="' + p.id + '">Add</button></div>' +
             '<div class="btns" style="margin-top:8px"><button class="sm" data-a="rename" data-id="' + p.id + '">Rename</button><button class="sm danger" data-a="del-player" data-id="' + p.id + '">Delete</button></div></div>';
      }
    });
    h += "</div>";

    if (state.players.length >= 2) {
      h += '<button class="primary" style="width:100%;padding:16px;font-size:18px" data-a="to-teams"' + (here < 2 ? " disabled" : "") + ">Next: make teams (" + here + ")</button>";
    }

    h += "<h2>Bulk import</h2><div class=\"card\"><div class=\"small muted\">One player per line, optional past times in seconds:<br>" +
         "<code>Alex, 5.32, 5.41</code> &nbsp; <code>Sam 6.1 6.0</code> &nbsp; <code>Jordan</code></div>" +
         '<textarea id="bulk" style="margin-top:8px" placeholder="Name, time, time..."></textarea>' +
         '<button style="width:100%;margin-top:8px" data-a="bulk">Import</button></div>';
    h += "<h2>Backup</h2><div class=\"card\"><div class=\"small muted\">Data is saved in this browser only. Export a backup occasionally.</div>" +
         '<div class="btns" style="margin-top:8px"><button data-a="export">Export</button><button data-a="import">Import</button></div>' +
         '<input id="file" type="file" accept="application/json,.json" hidden></div>';
    if (state.log.length) {
      h += "<h2>Past practices</h2>";
      state.log.slice(-6).reverse().forEach(function (l) {
        h += '<div class="card small">' + new Date(l.date).toLocaleDateString() + " &middot; Blue <b>" + l.blueWins + "</b> - <b>" + l.whiteWins + "</b> White &middot; " + (l.rounds != null ? l.rounds + " round" + (l.rounds === 1 ? "" : "s") : l.heats + " heats") + "</div>";
      });
    }
    return h;
  }

  // ----- teams tab -----
  function teamCol(color, ids) {
    var s = sum(ids);
    var h = '<div class="team ' + color + '"><h3>' + (color === "blue" ? "Blue" : "White") + " (" + ids.length + ")</h3>" +
            '<div class="small muted" style="margin-bottom:8px">avg ' + C.fmt(ids.length ? s / ids.length : null) + " &middot; total " + C.fmt(s) + "</div>";
    ids.slice().sort(function (a, b) { return avgOf(a) - avgOf(b); }).forEach(function (id) {
      h += '<div class="tp" data-a="move" data-id="' + id + '"><span>' + esc(nameOf(id)) + '</span><span class="avg">' + C.fmt(avgOf(id)) + "</span></div>";
    });
    return h + "</div>";
  }
  function teamsView() {
    var h = "<h1>Teams</h1>";
    if (!state.teams) {
      return h + '<p class="muted">Check off who is here on the Roster tab, then build teams.</p>' +
        '<button class="primary" style="width:100%;padding:16px;font-size:18px" data-a="build"' + (presentPlayers().length < 2 ? " disabled" : "") + ">Build teams (" + presentPlayers().length + " here)</button>";
    }
    var t = state.teams, diff = Math.abs(sum(t.blue) - sum(t.white));
    h += '<div class="cols">' + teamCol("blue", t.blue) + teamCol("white", t.white) + "</div>" +
         '<p class="small muted" style="text-align:center">Total-time difference: <b>' + (diff / 1000).toFixed(2) + "s</b>. Tap a player to swap them to the other team.</p>";
    if (inRace()) {
      h += '<div class="card small">A practice is in progress. Rebuilding teams will end it without saving.</div>';
    }
    h += '<div class="btns"><button data-a="build">' + (inRace() ? "Rebuild" : "Re-roll") + '</button>' +
         '<button class="go" style="flex:2;padding:16px;font-size:18px" data-a="start-practice">' + (inRace() ? "Back to race" : "Start racing") + "</button></div>";
    return h;
  }

  // ----- race tab -----
  function raceView() {
    if (!state.teams) return "<h1>Race</h1><p class=\"muted\">Build teams first.</p>";
    var st = C.standings(state.runs), cur = currentRun(), running = state.running;
    var h = '<div class="card"><div class="score"><div class="blue"><div class="small muted">BLUE</div><div class="n">' + st.blue.wins +
            '</div><div class="small muted tabular">' + (st.done ? C.fmt(st.blue.ms) : "&ndash;") + '</div></div>' +
            '<div class="vs">rounds won<br>&amp;<br>total</div>' +
            '<div class="white"><div class="small muted">WHITE</div><div class="n">' + st.white.wins +
            '</div><div class="small muted tabular">' + (st.done ? C.fmt(st.white.ms) : "&ndash;") + "</div></div></div></div>";

    if (ui.last) h += '<div class="card small" style="text-align:center">' + ui.last + "</div>";

    if (cur) {
      var rr = roundRuns(state.round), n = rr.indexOf(cur) + 1, c = cur.team;
      h += '<div class="small muted" style="text-align:center;margin-bottom:6px">Round ' + (state.round + 1) + " &middot; run " + n + " of " + rr.length + "</div>";
      if (!running) {
        h += '<div class="runbox ' + c + '"><div class="runtitle">' + teamLabel(c) + " team (" + cur.runners.length + ')</div><div class="chips">';
        cur.runners.forEach(function (x) { h += '<span class="chip">' + esc(nameOf(x.pid)) + "</span>"; });
        h += "</div></div>" +
             '<button class="go startbtn" data-fast="1" data-a="go">START ' + teamLabel(c).toUpperCase() + "</button>";
        if (state.runs.some(C.runDone)) h += '<div class="btns" style="margin-top:10px"><button class="sm" data-a="redo-last">Redo previous run</button></div>';
      } else {
        h += '<div class="clock" id="clock">0.00</div><div class="stops">';
        var rows = Math.ceil(cur.runners.length / 2), ht = "clamp(84px," + Math.floor(60 / rows) + "vh,230px)";
        cur.runners.forEach(function (x, i) {
          var wide = cur.runners.length % 2 === 1 && i === cur.runners.length - 1;
          h += stopBtn(c, x, ht, wide);
        });
        h += '</div><div class="btns" style="margin-top:10px"><button class="sm" data-a="undo-stop">Undo last stop</button><button class="sm danger" data-a="cancel-run">False start</button></div>';
      }
    } else {
      h += '<div class="card" style="text-align:center"><div class="banner">Round ' + (state.round + 1) + " done</div>" +
           '<button class="primary" style="width:100%;padding:16px;font-size:18px" data-a="next-round">Next round</button>' +
           '<div class="btns" style="margin-top:10px"><button class="sm" data-a="redo-last">Redo previous run</button></div></div>';
    }

    h += "<h2>Runs</h2><div class=\"card\">";
    var timed = state.runs.filter(function (x) { return x.runners.some(function (y) { return y.ms != null; }); });
    if (!timed.length) h += '<div class="small muted">Nothing timed yet.</div>';
    timed.reverse().forEach(function (x) { h += runHistory(x); });
    h += "</div>";
    h += '<div class="btns"><button class="go" data-a="finish">Finish &amp; save times</button><button class="danger" data-a="discard">Discard</button></div>' +
         '<p class="small muted" style="text-align:center">Times are added to player histories when you tap Finish. Tap an underlined time to fix it.</p>';
    return h;
  }
  function stopBtn(color, r, ht, wide) {
    var nm = '<div class="nm">' + esc(nameOf(r.pid)) + "</div>", st = 'style="height:' + ht + (wide ? ";grid-column:1/-1" : "") + '"';
    if (r.ms != null) return '<div class="stop done ' + color + '" ' + st + ">" + nm + '<div class="tm">' + C.fmt(r.ms) + '</div><div class="lbl">stopped</div></div>';
    return '<button class="stop ' + color + '" ' + st + ' data-fast="1" data-a="stop" data-pid="' + r.pid + '">' + nm + "STOP</button>";
  }
  function runHistory(x) {
    var other = null;
    roundRuns(x.round).forEach(function (y) { if (y !== x) other = y; });
    var rowsH = x.runners.slice().sort(function (a, b) {
      return (a.ms == null ? Infinity : a.ms) - (b.ms == null ? Infinity : b.ms);
    }).map(function (r) {
      return '<div class="side"><span class="nm">' + esc(nameOf(r.pid)) + "</span>" +
             '<span class="tm" data-a="edit-time" data-run="' + x.id + '" data-pid="' + r.pid + '">' + (r.ms == null ? "&ndash;" : C.fmt(r.ms)) + "</span></div>";
    }).join("");
    var win = C.runDone(x) && other && C.runDone(other) && C.runTotal(x) < C.runTotal(other);
    return '<div class="run ' + x.team + '"><div class="runhead"><span>Round ' + (x.round + 1) + " &middot; " + teamLabel(x.team) + "</span>" +
           '<span class="tabular ' + (win ? "w" : "") + '">' + (C.runDone(x) ? "total " + C.fmt(C.runTotal(x)) : "in progress") + "</span></div>" + rowsH + "</div>";
  }

  // ---------- clock ----------
  function tick() {
    var el = document.getElementById("clock");
    if (!el || !state.running) return;
    el.textContent = C.fmt(nowT() - state.running.startedAt);
    ui.raf = requestAnimationFrame(tick);
  }
  var lock = null;
  function wakeLock() {
    try {
      if (navigator.wakeLock && !lock) {
        navigator.wakeLock.request("screen").then(function (l) {
          lock = l; l.addEventListener("release", function () { lock = null; });
        }, function () {});
      }
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") { if (ui.tab === "race" && state.running) wakeLock(); render(); }
  });

  // ---------- actions ----------
  function resultText(run) {
    var rr = roundRuns(run.round), other = null;
    rr.forEach(function (y) { if (y !== run) other = y; });
    if (!other || !C.runDone(other)) return teamLabel(run.team) + " finished: total <b>" + C.fmt(C.runTotal(run)) + "</b>";
    var bt = 0, wt = 0;
    rr.forEach(function (y) { if (y.team === "blue") bt = C.runTotal(y); else wt = C.runTotal(y); });
    return "Blue <b>" + C.fmt(bt) + "</b> vs White <b>" + C.fmt(wt) + "</b> &mdash; " + (bt === wt ? "tie" : (bt < wt ? "Blue" : "White") + " wins the round");
  }
  function endPractice() { state.runs = []; state.round = 0; state.running = null; ui.last = null; }

  var A = {
    tab: function (el) { ui.tab = el.getAttribute("data-v"); },
    "add-player": function () {
      var v = document.getElementById("newName").value.trim();
      if (!v) return false;
      state.players.push({ id: C.uid(), name: v, times: [] });
      state.present[state.players[state.players.length - 1].id] = true; // adding at practice = they are here
    },
    present: function (el) { var id = el.getAttribute("data-id"); state.present[id] = !state.present[id]; ui.keepScroll = true; },
    all: function () { state.players.forEach(function (p) { state.present[p.id] = true; }); },
    none: function () { state.present = {}; },
    open: function (el) { var id = el.getAttribute("data-id"); ui.open = ui.open === id ? null : id; ui.keepScroll = true; },
    "add-time": function (el) {
      var ms = C.parseTime(document.getElementById("addTime").value);
      if (ms == null) { alert("Enter a time in seconds, like 5.32"); return false; }
      P(el.getAttribute("data-id")).times.push({ ms: ms, d: new Date().toISOString() });
      ui.keepScroll = true;
    },
    "del-time": function (el) { P(el.getAttribute("data-id")).times.splice(+el.getAttribute("data-i"), 1); ui.keepScroll = true; },
    rename: function (el) {
      var p = P(el.getAttribute("data-id")), n = prompt("New name", p.name);
      if (!n || !n.trim()) return false;
      p.name = n.trim();
    },
    "del-player": function (el) {
      var p = P(el.getAttribute("data-id"));
      if (!confirm("Delete " + p.name + " and all their times?")) return false;
      state.players = state.players.filter(function (x) { return x !== p; });
      delete state.present[p.id];
      if (state.teams) { state.teams.blue = state.teams.blue.filter(function (x) { return x !== p.id; }); state.teams.white = state.teams.white.filter(function (x) { return x !== p.id; }); }
      ui.open = null;
    },
    bulk: function () {
      var added = 0;
      document.getElementById("bulk").value.split("\n").forEach(function (l) {
        var r = C.parseRosterLine(l);
        if (!r) return;
        var ex = state.players.filter(function (p) { return p.name.toLowerCase() === r.name.toLowerCase(); })[0];
        var times = r.times.map(function (ms) { return { ms: ms, d: new Date().toISOString() }; });
        if (ex) ex.times = ex.times.concat(times);
        else state.players.push({ id: C.uid(), name: r.name, times: times });
        added++;
      });
      if (!added) return false;
      toast("Imported " + added);
    },
    "export": function () {
      var blob = new Blob([JSON.stringify(state)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sprintleague-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      return false;
    },
    "import": function () { document.getElementById("file").click(); return false; },

    "to-teams": function () { ui.tab = "teams"; if (!state.teams) buildTeams(); },
    build: function () {
      if (inRace() && !confirm("This ends the current practice without saving. Continue?")) return false;
      endPractice(); buildTeams();
    },
    move: function (el) {
      var t = state.teams, id = el.getAttribute("data-id");
      var from = t.blue.indexOf(id) >= 0 ? "blue" : "white", to = from === "blue" ? "white" : "blue";
      if (inRace() && !confirm("Moving a player ends the current race without saving. Continue?")) return false;
      if (inRace()) endPractice();
      t[from] = t[from].filter(function (x) { return x !== id; });
      t[to].push(id);
    },
    "start-practice": function () {
      if (inRace()) { ui.tab = "race"; return; }
      var t = state.teams;
      if (!t.blue.length || !t.white.length) { alert("Both teams need at least one player."); return false; }
      state.round = 0; state.running = null; ui.last = null;
      state.runs = C.makeRound(t, 0, nameOf);
      ui.tab = "race";
    },
    "next-round": function () {
      state.round++; ui.last = null;
      state.runs = state.runs.concat(C.makeRound(state.teams, state.round, nameOf));
    },

    go: function () {
      var r = currentRun(); if (!r || state.running) return false;
      r.runners.forEach(function (x) { x.ms = null; });
      state.running = { runId: r.id, startedAt: nowT() };
      ui.last = null; ui.lastStopAt = nowT(); buzz(40);
    },
    stop: function (el, at) {
      var r = currentRun();
      if (!state.running || !r || state.running.runId !== r.id) return false;
      var pid = el.getAttribute("data-pid"), x = null;
      r.runners.forEach(function (y) { if (y.pid === pid) x = y; });
      if (!x || x.ms != null) return false;
      x.ms = Math.max(1, Math.round(at - state.running.startedAt));
      buzz(25);
      if (C.runDone(r)) { state.running = null; ui.last = resultText(r); }
    },
    "undo-stop": function () {
      var r = currentRun(); if (!r || !state.running) return false;
      // un-stop whoever stopped most recently (the largest time)
      var last = null;
      r.runners.forEach(function (x) { if (x.ms != null && (!last || x.ms >= last.ms)) last = x; });
      if (!last) return false;
      last.ms = null;
    },
    "cancel-run": function () {
      var r = currentRun(); if (!r) return false;
      r.runners.forEach(function (x) { x.ms = null; }); state.running = null;
    },
    "redo-last": function () {
      var done = state.runs.filter(C.runDone), r = done[done.length - 1];
      if (!r || !confirm("Clear the last completed run so it can be run again?")) return false;
      r.runners.forEach(function (x) { x.ms = null; }); state.round = r.round; state.running = null; ui.last = null;
    },
    "edit-time": function (el) {
      var r = runById(el.getAttribute("data-run")); if (!r) return false;
      if (state.running && state.running.runId === r.id) return false;
      var pid = el.getAttribute("data-pid"), x = null;
      r.runners.forEach(function (y) { if (y.pid === pid) x = y; });
      if (!x) return false;
      var v = prompt("Time for " + nameOf(x.pid) + " in seconds (blank to clear)", x.ms == null ? "" : (x.ms / 1000).toFixed(2));
      if (v === null) return false;
      if (!v.trim()) { x.ms = null; return; }
      var ms = C.parseTime(v);
      if (ms == null) { alert("Couldn't read that time."); return false; }
      x.ms = ms;
      ui.keepScroll = true;
    },
    finish: function () {
      var done = state.runs.filter(function (r) { return r.runners.some(function (x) { return x.ms != null; }); });
      var n = done.reduce(function (a, r) { return a + r.runners.filter(function (x) { return x.ms != null; }).length; }, 0);
      if (!confirm(n ? "Save " + n + " time(s) to player histories and end this practice?" : "End practice? Nothing to save.")) return false;
      var st = C.standings(state.runs), d = new Date().toISOString();
      done.forEach(function (r) {
        r.runners.forEach(function (x) {
          if (x.ms != null && P(x.pid)) P(x.pid).times.push({ ms: x.ms, d: d });
        });
      });
      if (n) state.log.push({ date: d, blueWins: st.blue.wins, whiteWins: st.white.wins, rounds: st.done });
      endPractice(); state.teams = null; ui.tab = "roster";
    },
    discard: function () {
      if (!confirm("Discard this practice and all its times?")) return false;
      endPractice(); state.teams = null; ui.tab = "roster";
    }
  };

  function buildTeams() {
    var here = presentPlayers();
    if (here.length < 2) { toast("Need at least 2 players"); return; }
    var avgs = C.avgsWithImputed(here);
    var r = C.balance(here.map(function (p, i) { return { id: p.id, avg: avgs[i] }; }));
    state.teams = { blue: r.blue, white: r.white };
  }

  // ---------- events ----------
  function fire(el, at) {
    var fn = A[el.getAttribute("data-a")];
    if (!fn) return;
    if (fn(el, at) === false) return;
    save(); render();
  }
  // start / stop react on finger-down for lowest latency
  document.addEventListener("pointerdown", function (e) {
    var el = e.target.closest("[data-fast]");
    if (!el) return;
    var at = nowT();
    e.preventDefault();
    if (el.getAttribute("data-a") === "stop" && at - ui.lastStopAt < 250) return; // ignore a START double-tap landing on a STOP button
    fire(el, at);
  });
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-a]");
    if (!el || el.hasAttribute("data-fast") || el.disabled) return;
    fire(el, nowT());
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.id === "newName") fire(e.target.parentNode.querySelector("[data-a=add-player]"), nowT());
  });
  document.addEventListener("change", function (e) {
    if (e.target.id !== "file" || !e.target.files[0]) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = JSON.parse(fr.result);
        if (!d || !Array.isArray(d.players)) throw new Error("not a Sprint League backup");
        if (!confirm("Replace all current data with this backup (" + d.players.length + " players)?")) return;
        var b = blank(); for (var k in b) if (d[k] === undefined) d[k] = b[k];
        state = d; save(); render();
      } catch (err) { alert("Import failed: " + err.message); }
    };
    fr.readAsText(e.target.files[0]);
  });

  // resume where we left off (e.g. page reloaded mid-practice)
  if (inRace()) ui.tab = "race"; else if (state.teams) ui.tab = "teams";
  render();
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(function () {});
})();
