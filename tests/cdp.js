// Runs a test page in real-time headless Chrome and prints the #out text once it says DONE.
// usage: node tests/cdp.js "file:///.../tests/live.html?topic=abc" [timeoutSeconds]
const { spawn } = require("child_process");
const url = process.argv[2], limit = (+process.argv[3] || 30) * 1000;
const CH = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9300 + Math.floor(Math.random() * 500);
const dir = require("os").tmpdir() + "/sl3-cdp-" + port;
const p = spawn(CH, ["--headless=new", "--remote-debugging-port=" + port, "--user-data-dir=" + dir, "--allow-file-access-from-files", "--no-first-run", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json(); break; } catch (e) { await sleep(200); } }
  const ws = new WebSocket(targets.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending[d.id]) pending[d.id](d); };
  const send = (method, params) => new Promise((r) => { pending[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  const t0 = Date.now(); let text = "";
  while (Date.now() - t0 < limit) {
    await sleep(500);
    const r = await send("Runtime.evaluate", { expression: "(document.getElementById('out')||{}).textContent||''", returnByValue: true });
    text = (r.result && r.result.result && r.result.result.value) || "";
    if (/DONE/.test(text)) break;
  }
  console.log(text || "(no output)");
  ws.close(); p.kill(); process.exit(/FAIL|ERROR|no output/.test(text) || !/DONE/.test(text) ? 1 : 0);
})();
