# Sprint League 3

A phone-first page for running team sprint races at basketball practice. You control everything and the players never touch a device.

1. **Roster tab:** check off who is at practice.
2. **Teams tab:** builds two teams with an even total of average sprint times. Tap a player to swap them.
3. **Race tab:** each round has two group runs. White runs first, all together: press **START** once, then tap each runner's **STOP** button as they cross the line (one button per runner). Then Blue does the same.
4. The team with the lower total time wins the round. "Next round" starts another White/Blue pair of runs.
5. **Finish & save** adds every time to the players' histories, so the next practice's teams are balanced on more data.

No server, no logins, no build step. Data is stored in the browser's localStorage. Use Roster -> Backup -> Export now and then.

## Run it

    ruby -run -e httpd . -p 8000        # then open http://localhost:8000
    # or just open index.html in a browser

## On your phone

Host the folder somewhere with HTTPS (GitHub Pages, Netlify drop, Cloudflare Pages), open it on the phone and use
"Add to Home Screen". It then works offline and keeps the screen awake during races.
Data is per browser, so use the same device each practice (or Export/Import to move it).

## Files

- `core.js`: pure logic (time parsing, team balancing, group runs, scoring)
- `app.js`, `style.css`, `index.html`: UI
- `sw.js`, `manifest.webmanifest`, `icon.svg`: offline/home-screen support
- `tests/run.sh`: unit tests (works with macOS's built-in `jsc`, no Node needed)
- `tests/e2e.html`: UI flow test, run with headless Chrome:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --virtual-time-budget=20000 --allow-file-access-from-files --dump-dom file://$PWD/tests/e2e.html`
