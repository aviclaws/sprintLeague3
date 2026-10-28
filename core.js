/* Sprint League 3 - pure logic (no DOM). Works in browser and in `jsc` for tests. */
(function (root) {
  "use strict";

  // ---------- time formatting / parsing ----------
  function fmt(ms) {
    if (ms == null || isNaN(ms)) return "--";
    var cs = Math.round(ms / 10); // hundredths
    var s = cs / 100;
    if (s < 60) return s.toFixed(2);
    var m = Math.floor(s / 60);
    var rest = (s - m * 60).toFixed(2);
    if (rest.length < 5) rest = "0" + rest;
    return m + ":" + rest;
  }

  // "5.32" -> 5320, "1:05.3" -> 65300, "5320" (>=1000 integer) -> 5320 ms
  function parseTime(str) {
    if (str == null) return null;
    str = String(str).trim();
    var m, ms;
    if ((m = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(str))) {
      ms = (parseInt(m[1], 10) * 60 + parseFloat(m[2])) * 1000;
    } else if (/^\d+$/.test(str) && parseInt(str, 10) >= 1000) {
      ms = parseInt(str, 10);
    } else if (/^\d*\.?\d+$/.test(str)) {
      ms = parseFloat(str) * 1000;
    } else {
      return null;
    }
    ms = Math.round(ms);
    if (!(ms >= 100 && ms <= 10 * 60 * 1000)) return null;
    return ms;
  }

  // "Name, 5.3, 5.4"  /  "Name 5.3 5.4"  /  "Name" -> {name, times:[ms]}
  function parseRosterLine(line) {
    line = line.trim();
    if (!line) return null;
    var name, raw;
    var tokens = line.split(/[,\t;]/).map(function (t) { return t.trim(); });
    if (tokens.length === 1) {
      var words = line.split(/\s+/);
      var i = words.length;
      while (i > 1 && parseTime(words[i - 1]) != null) i--;
      name = words.slice(0, i).join(" ");
      raw = words.slice(i);
    } else {
      name = tokens[0];
      raw = tokens.slice(1).filter(Boolean);
    }
    if (!name) return null;
    var times = [];
    raw.forEach(function (t) { var v = parseTime(t); if (v != null) times.push(v); });
    return { name: name, times: times };
  }

  // ---------- averages ----------
  function avgMs(player) {
    var ts = (player.times || []).map(function (t) { return t.ms; }).filter(function (v) { return v > 0; });
    if (!ts.length) return null;
    return ts.reduce(function (a, b) { return a + b; }, 0) / ts.length;
  }

  // avg for each player, imputing the group mean for players with no history
  function avgsWithImputed(players) {
    var raw = players.map(avgMs);
    var known = raw.filter(function (v) { return v != null; });
    var mean = known.length ? known.reduce(function (a, b) { return a + b; }, 0) / known.length : 6000;
    return raw.map(function (v) { return v == null ? mean : v; });
  }

  // ---------- team balancing ----------
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /**
   * Split players into two teams with sizes floor(n/2) / ceil(n/2) so that the
   * sum of average times is as even as possible (cardinality-constrained
   * subset-sum DP, 10ms buckets). Among splits within `tolerance` (0.1s total
   * difference) of the best one, a random one is picked so re-rolls differ.
   * players: [{id, avg}] -> {blue:[id], white:[id], blueSum, whiteSum}
   */
  function balance(players, rng, tolerance) {
    rng = rng || Math.random;
    if (tolerance == null) tolerance = 10; // buckets of 10ms => 0.1s
    var n = players.length;
    var order = shuffle(players, rng);
    var k = Math.floor(n / 2);
    var SCALE = 10;
    var w = order.map(function (p) { return Math.max(0, Math.round(p.avg / SCALE)); });
    var total = w.reduce(function (a, b) { return a + b; }, 0);

    var dp = [];
    for (var s = 0; s <= k; s++) dp.push(new Map());
    dp[0].set(0, { prev: -1, idx: -1 });
    for (var i = 0; i < n; i++) {
      for (var size = Math.min(i + 1, k); size >= 1; size--) {
        dp[size - 1].forEach(function (_v, sum) {
          var ns = sum + w[i];
          if (!dp[size].has(ns)) dp[size].set(ns, { prev: sum, idx: i });
        });
      }
    }

    var best = Infinity, cands = [];
    dp[k].forEach(function (_v, sum) {
      var d = Math.abs(total - 2 * sum);
      cands.push([sum, d]);
      if (d < best) best = d;
    });
    var pool = cands.filter(function (c) { return c[1] <= best + tolerance; });
    var pickSum = pool[Math.floor(rng() * pool.length)][0];

    var chosen = {};
    var cur = pickSum, sz = k;
    while (sz > 0) {
      var node = dp[sz].get(cur);
      chosen[node.idx] = true;
      cur = node.prev;
      sz--;
    }
    var small = [], large = [], smallSum = 0, largeSum = 0;
    order.forEach(function (p, idx) {
      if (chosen[idx]) { small.push(p.id); smallSum += p.avg; }
      else { large.push(p.id); largeSum += p.avg; }
    });
    var smallIsBlue = rng() < 0.5;
    return smallIsBlue
      ? { blue: small, white: large, blueSum: smallSum, whiteSum: largeSum }
      : { blue: large, white: small, blueSum: largeSum, whiteSum: smallSum };
  }

  // ---------- runs ----------
  var uidCounter = 0;
  function uid() {
    uidCounter++;
    return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36) + uidCounter;
  }

  /**
   * One round = two group runs: the whole White team runs together, then the
   * whole Blue team. Each run has one entry (one STOP button) per runner.
   * Runners are listed alphabetically so they are easy to find on screen.
   * nameOf: function(pid) -> display name
   */
  function makeRound(teams, round, nameOf) {
    var byName = function (a, b) { return nameOf(a).localeCompare(nameOf(b)); };
    return ["white", "blue"].map(function (team) {
      return {
        id: uid(), round: round, team: team,
        runners: teams[team].slice().sort(byName).map(function (pid) { return { pid: pid, ms: null }; })
      };
    });
  }

  function runDone(r) {
    return r.runners.length > 0 && r.runners.every(function (x) { return x.ms != null; });
  }
  function runTotal(r) {
    return r.runners.reduce(function (a, x) { return a + (x.ms || 0); }, 0);
  }

  // Team scoreboard. A round counts once both of its runs are finished; the
  // team with the lower total time wins it. (Teams are balanced on total
  // average time, so totals are the fair comparison even with an odd count.)
  function standings(runs) {
    var s = { blue: { wins: 0, ms: 0 }, white: { wins: 0, ms: 0 }, ties: 0, done: 0 };
    var rounds = {};
    runs.forEach(function (r) { (rounds[r.round] = rounds[r.round] || {})[r.team] = r; });
    Object.keys(rounds).forEach(function (k) {
      var b = rounds[k].blue, w = rounds[k].white;
      if (!b || !w || !runDone(b) || !runDone(w)) return;
      var bt = runTotal(b), wt = runTotal(w);
      s.done++; s.blue.ms += bt; s.white.ms += wt;
      if (bt < wt) s.blue.wins++; else if (wt < bt) s.white.wins++; else s.ties++;
    });
    return s;
  }

  root.SLCore = {
    fmt: fmt, parseTime: parseTime, parseRosterLine: parseRosterLine,
    avgMs: avgMs, avgsWithImputed: avgsWithImputed,
    balance: balance, makeRound: makeRound, runDone: runDone, runTotal: runTotal,
    standings: standings, uid: uid
  };
})(typeof self !== "undefined" ? self : this);
