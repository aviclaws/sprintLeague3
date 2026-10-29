// Run with:  ./tests/run.sh   (uses macOS built-in `jsc`, no Node needed)
// or with Node: node tests/core.test.js
var C = (typeof SLCore !== "undefined") ? SLCore : require("../core.js") && globalThis.SLCore;
var log = typeof print !== "undefined" ? print : console.log;
var fails = 0;
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) { fails++; log("FAIL " + msg + ": got " + JSON.stringify(a) + " expected " + JSON.stringify(b)); }
}
function ok(c, msg) { if (!c) { fails++; log("FAIL " + msg); } }

// fmt / parse
eq(C.fmt(5320), "5.32", "fmt 5320");
eq(C.fmt(65300), "1:05.30", "fmt 65300");
eq(C.fmt(null), "--", "fmt null");
eq(C.parseTime("5.32"), 5320, "parse 5.32");
eq(C.parseTime("1:05.3"), 65300, "parse 1:05.3");
eq(C.parseTime("5320"), 5320, "parse ms");
eq(C.parseTime("abc"), null, "parse junk");
eq(C.parseTime("0"), null, "parse zero");
eq(C.parseTime("9999999"), null, "parse too long");

// roster lines
eq(C.parseRosterLine("Alex, 5.3, 5.4"), { name: "Alex", times: [5300, 5400] }, "line csv");
eq(C.parseRosterLine("Mary Jane 5.3 5.4"), { name: "Mary Jane", times: [5300, 5400] }, "line spaces");
eq(C.parseRosterLine("Sam"), { name: "Sam", times: [] }, "line name only");
eq(C.parseRosterLine("   "), null, "blank");

// balance vs brute force
function brute(avgs) {
  var n = avgs.length, k = Math.floor(n / 2), total = avgs.reduce(function (a, b) { return a + b; }, 0), best = Infinity;
  for (var mask = 0; mask < (1 << n); mask++) {
    var c = 0, s = 0;
    for (var i = 0; i < n; i++) if (mask & (1 << i)) { c++; s += avgs[i]; }
    if (c === k) best = Math.min(best, Math.abs(total - 2 * s));
  }
  return best;
}
for (var trial = 0; trial < 200; trial++) {
  var n = 2 + Math.floor(Math.random() * 11);
  var players = [];
  for (var i = 0; i < n; i++) players.push({ id: "p" + i, avg: Math.round(4000 + Math.random() * 4000) });
  var r = C.balance(players);
  ok(r.blue.length + r.white.length === n, "all assigned");
  var seen = {}; r.blue.concat(r.white).forEach(function (id) { seen[id] = 1; });
  ok(Object.keys(seen).length === n, "no duplicates");
  ok(Math.abs(r.blue.length - r.white.length) <= 1, "sizes differ by <=1");
  var diff = Math.abs(r.blueSum - r.whiteSum);
  var opt = brute(players.map(function (p) { return Math.round(p.avg / 10) * 10; }));
  // tolerance 0.1s plus bucket rounding slack (n * 5ms)
  ok(diff <= opt + 100 + n * 10, "balance near optimal: diff " + diff + " opt " + opt);
}
var tiny = C.balance([{ id: "a", avg: 5000 }]);
eq(tiny.blue.length + tiny.white.length, 1, "single player");

// runs: white runs together, then blue; one entry per runner
var names = { a: "Alex", b: "Ben", c: "Cal", d: "Dan", e: "Eli" };
var nameOf = function (id) { return names[id]; };
var runs = C.makeRound({ blue: ["c", "a", "b"], white: ["e", "d"] }, 0, nameOf);
eq(runs.length, 2, "two runs per round");
eq(runs[0].team, "white", "white runs first");
eq(runs[1].team, "blue", "blue runs second");
eq(runs[0].runners.length, 2, "white has N runners");
eq(runs[1].runners.length, 3, "blue has N runners");
eq(runs[1].runners.map(function (x) { return x.pid; }), ["a", "b", "c"], "runners sorted by name");
ok(!C.runDone(runs[0]), "not done at start");
runs[0].runners[0].ms = 5000;
ok(!C.runDone(runs[0]), "not done until everyone stops");
runs[0].runners[1].ms = 6000;
ok(C.runDone(runs[0]), "done when all stopped");
eq(C.runTotal(runs[0]), 11000, "run total");
eq(C.standings(runs).done, 0, "round not counted until both runs done");
runs[1].runners.forEach(function (x) { x.ms = 3000; });
var st = C.standings(runs);
eq(st.done, 1, "round counted");
eq(st.blue.wins, 1, "blue lower total wins");
eq(st.blue.ms, 9000, "blue total");
eq(st.white.ms, 11000, "white total");
var runs2 = runs.concat(C.makeRound({ blue: ["a"], white: ["d"] }, 1, nameOf));
eq(C.standings(runs2).done, 1, "unfinished round 2 not counted");

// live-view snapshot
var sp = [], sid = 0;
function mkp(name, ts) { return { id: "p" + (sid++), name: name, times: ts.map(function (ms) { return { ms: ms, d: "x" }; }) }; }
["Alex", "Ben", "Cal", "Dan"].forEach(function (n, i) { sp.push(mkp(n, [5000 + i * 500, 5100 + i * 500])); });
sp.push(mkp("Eli", []));
var sstate = { players: sp, teams: { blue: [sp[0].id, sp[2].id], white: [sp[1].id, sp[3].id] }, round: 0, running: null, runs: [] };
sstate.runs = C.makeRound(sstate.teams, 0, function (id) { return sp.filter(function (p) { return p.id === id; })[0].name; });
sstate.runs[0].runners[0].ms = 4000;
sstate.running = { runId: sstate.runs[0].id, startedAt: 1 };
var sn = C.buildSnapshot(sstate, 123);
eq(sn.v, 1, "snapshot version");
eq(sn.live, { team: "white", round: 1, stopped: 1, of: 2 }, "snapshot live run");
eq(sn.runs.length, 1, "only timed/live runs included");
eq(sn.runs[0].x[0], ["Ben", 4000], "snapshot run time");
eq(sn.teams.blue[0], ["Alex", 5050], "snapshot team average");
eq(sn.roster[sn.roster.length - 1], ["Eli", null, 0, []], "new player last, no avg");
eq(C.buildSnapshot({ players: sp, teams: null, round: 0, running: null, runs: [] }, 1).round, 0, "no race yet");

// big snapshot stays under the 4096-byte message limit
var bigP = [], bigRuns = [];
for (var q = 0; q < 30; q++) bigP.push(mkp("Player Number " + q, [5000, 5100, 5200, 5300, 5400, 5500, 5600]));
var bigTeams = { blue: bigP.slice(0, 15).map(function (p) { return p.id; }), white: bigP.slice(15).map(function (p) { return p.id; }) };
var bigName = function (id) { return bigP.filter(function (p) { return p.id === id; })[0].name; };
for (var rr = 0; rr < 12; rr++) {
  C.makeRound(bigTeams, rr, bigName).forEach(function (run) { run.runners.forEach(function (x, i) { x.ms = 4000 + i * 10; }); bigRuns.push(run); });
}
var bigSn = C.buildSnapshot({ players: bigP, teams: bigTeams, round: 11, running: null, runs: bigRuns }, 1);
var bigLen = C.utf8len(JSON.stringify(bigSn));
ok(bigLen <= 3600, "big snapshot fits: " + bigLen);
eq(bigSn.score.done, 12, "score still covers every round");
eq(bigSn.runs[bigSn.runs.length - 1].r, 12, "newest round kept");
eq(C.utf8len("a\u00e9\u20ac"), 6, "utf8len");

log(fails ? fails + " FAILURES" : "ALL TESTS PASSED");
