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

log(fails ? fails + " FAILURES" : "ALL TESTS PASSED");
