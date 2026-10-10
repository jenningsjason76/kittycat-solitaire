# KittyCat Solitaire (web app)

A quiet Klondike solitaire that tells you when you make a lazy move. It is a local-first
progressive web app: all games, settings and stats stay on the device, and it works offline.

No build step. It is plain HTML, CSS and JavaScript, so it can be hosted on any static host.

## Publishing with git

This folder is the whole site. GitHub Pages serves it as it is (no build step) from the `main` branch.

    ./tools/publish.sh "what you changed"

That runs the rules tests (if Node.js is installed), raises the version in `sw.js`, commits and pushes.
The site updates about a minute later.

## Put it on GitHub Pages (free)

1. Sign in at github.com and create a new **public** repository, for example `kittycat-solitaire`.
2. Upload everything in this folder to the repository (Add file > Upload files, drag the contents in).
   Keep the folder structure (js, css, cards, icons, sounds).
3. Repository **Settings > Pages**. Under "Build and deployment" choose **Deploy from a branch**,
   branch **main**, folder **/ (root)**, then Save.
4. After a minute the site is at `https://YOUR-NAME.github.io/kittycat-solitaire/`.

All paths in the app are relative, so it works from that sub-folder (tested).

## Install it on iPhone or iPad

Open the address in **Safari**, tap **Share**, then **Add to Home Screen**. Open the app from the
Home Screen icon. Safari data and Home Screen app data are stored separately, so play in one place.
Installed apps are less likely to have their data cleared. Use Settings > Your data > Export backup now and then.

## One-file version (no hosting)

    python3 tools/build_single.py        writes  dist/KittyCat-Solitaire.html

That one file has every script, picture and sound inside it. Double-click it on a Mac or PC and it
opens in the browser and plays, with saved games and settings kept in that browser.
It has no service worker, so it is not an installable offline web app, and a phone is unlikely to
run it well when it arrives as an email attachment. For a phone, host the folder (above) and send the link.

## Publishing an update

Change `VERSION` at the top of `sw.js` (for example `v2`) every time you change any file.
People then see "A new version is ready" and tap Reload.

## Run it on your own computer

    python3 -m http.server 8000      then open  http://localhost:8000

(Service workers need https or localhost.)

## Tests

    node --test tests/engine.test.mjs        rules, solver, move critic (Node 18+)

The `tests/e2e_*.py` files drive the app in a headless browser with Playwright for Python.

## Data and sync

Data is stored in the browser's IndexedDB and localStorage. Records carry ids and timestamps so
automatic sync between devices can be added later; that needs a server or cloud account and is not
part of this version.

## Credits

Card artwork: English pattern playing cards deck, Wikimedia Commons, public domain (CC0). See cards/CREDITS.txt.
Sounds and music: Kenney (CC0), Yoiyami (CC0) and The Cynic Project (CC0). See sounds/SoundCredits.txt.
