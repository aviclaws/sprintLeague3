# Sprint League 3

A phone-first page for running team sprint races at basketball practice. You control everything and the players never touch a device.

1. **Roster tab:** check off who is at practice.
2. **Teams tab:** builds two teams with an even total of average sprint times. Tap a player to swap them.
3. **Race tab:** each round has two group runs. White runs first, all together: press **START** once, then tap each runner's **STOP** button as they cross the line (one button per runner). Then Blue does the same.
4. The team with the lower total time wins the round. "Next round" starts another White/Blue pair of runs.
5. **Finish & save** adds every time to the players' histories, so the next practice's teams are balanced on more data.

No server, no logins, no build step. Data is stored in the browser's localStorage. Use Roster -> Backup -> Export now and then.

## Two pages

- **`index.html`: live view for everyone.** Read-only: score, who is running, each runner's time, teams, and every player's average and recent times. It updates by itself. There is nothing to tap that changes data.
- **`coach.html`: coach controls.** Everything described above. It asks for a passcode once per device.

The coach page posts a small snapshot to a free [ntfy.sh](https://ntfy.sh) topic after every change; the live view listens to that topic. No account is needed.
Edit `config.js` to change the passcode (default `sprint`) or the topic.

**Honest limits:** the passcode and topic are visible to anyone who views the site's source, so this keeps casual visitors out; it is not real security. Anyone who finds the topic name could read or post to it. To reset, change `topic` in `config.js`.
The feed keeps messages for 12 hours, and the coach page re-posts whenever it opens, so open the coach page before sharing the link. ntfy.sh allows about 250 messages a day, which is plenty for a practice.

## Run it

    ruby -run -e httpd . -p 8000        # then open http://localhost:8000
    # or just open index.html in a browser

## On your phone

Host the folder somewhere with HTTPS (GitHub Pages, Netlify drop, Cloudflare Pages), open it on the phone and use
"Add to Home Screen". It then works offline and keeps the screen awake during races.
Data is per browser, so use the same device each practice (or Export/Import to move it).

## Files

- `core.js`: pure logic (time parsing, team balancing, group runs, scoring)
- `coach.html` + `app.js`: coach UI. `index.html` + `view.js`: live viewer. `style.css`: shared styles. `config.js`: topic and passcode
- `sw.js`, `manifest.webmanifest`, `icon.svg`: offline/home-screen support
- `tests/run.sh`: unit tests (works with macOS's built-in `jsc`, no Node needed)
- `tests/live.html`, `tests/view.html`, `tests/gate.html`: publish, viewer and passcode checks, run with `node tests/cdp.js "file://$PWD/tests/live.html?topic=<throwaway>"` (needs Node and Chrome; run live.html first, then view.html with the same topic)
- `tests/e2e.html`: UI flow test, run with headless Chrome:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --virtual-time-budget=20000 --allow-file-access-from-files --dump-dom file://$PWD/tests/e2e.html`
