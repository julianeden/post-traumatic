# Development

Building, testing and releasing Post-Traumatic. For what it does, see [CHANGES.md](CHANGES.md).

## Diagnostics

The script logs what it decided (URL seen, viewport check, whether the
calendar was found, chosen mode, errors) with `console.debug` under the
prefix "Post-Traumatic". On a phone, read them with remote debugging from
desktop Firefox (`about:debugging`, USB).

## Layout

```
src/
  manifest.json   Manifest V3, Firefox 142+
  content.css     all styling, scoped to html[data-tsm="on"]
  content.js      adds classes, wraps the day numbers, builds the pager and calendar,
                  remembers the login username
  icons/
test/render.mjs   renders saved pages at phone width and checks the result
```

## Build

```sh
npm install
npm run lint
npm run build      # dist/post-traumatic-<version>.zip and userscript/post-traumatic.user.js
```

## Test

The test needs saved copies of the real page, which contain names and are not
committed. In desktop Firefox, open the schedule view you want, press Cmd+S,
choose "Web Page, complete", and save into `test/fixtures/` (gitignored), or
anywhere and point `TSM_FIXTURES` at the folder. Save one file per view you
care about, e.g. the Individual Month View and the BLS Vehicle/Location view.
Save the login page too, as a file called `login` (no extension), to exercise
the username memory, and the punch clock page as `punchClockPage.html`.
Save pages with the add-on disabled: a page saved while it was running
already contains its markup and is skipped.

The More Options sub-pages (follow Shift Substitutions, Shift Trades, Time
Off and Pickup Shifts from the schedule) are the schedule page with that
section's form served inline; save them as `shiftSubstitution.html`,
`shiftTrade.html`, `timeOff.html` and `pickupShifts.html`. If they were saved
with the add-on running, `node test/splice.mjs ~/Desktop/Schedule test/fixtures`
rebuilds clean copies from the clean `Schedule.html` save (link the `*_files`
folders into `test/fixtures` too).

```sh
npm test
TSM_FIXTURES=~/Desktop/Schedule npm test
```

It serves each page in headless Chromium at a made-up origin under the
site's real paths, with the saved asset folders answered from disk and every
other request blocked, injects the add-on's CSS and script, and checks that
the page no longer overflows, that the individual view's crew lines come from a correctly
formed request for the BLS view (answered with the saved BLS page for the
same month) and that each card's partners, open seats and hours without a
partner, and its spares list, match an independent reading of that page, that the pickup handlers are untouched, that the location
view shows exactly one day with a chip per day, that the colour key waits
behind its button, that the Base dropdown lists the units' leading names and
one base leaves only its units with the day chips recounted, that the
person filter hides the right units, that the person calendar's dots agree
with the day chips and its shift card matches the day's own unit list, that
the confirmation dialog fits the viewport, that a unit view (run once as itself and once standing in for the Dispatch view) carries seats across midnight and marks the hours alone, and that the punch clock page
shows one button, does not scroll, asks before early punches (the fixture's
server clock is moved and a punched-in state synthesised for the variants)
and hands non-early punches to the site's handler, that the top bar has its
four buttons with working menus and the rest of the header hidden, and that
the form pages fit the phone with full-width controls and an odometer field
that keeps no upper limit even after a shift change, and that the overtime
form (served after a late punch out) shows its summary card, stacks its
fields full width and still reveals the reason-specific rows. Screenshots of
every state land in `test/out/`.

## iPhone: the userscript build

Firefox on iOS cannot run add-ons, so the same code also ships as a single
userscript, `userscript/post-traumatic.user.js`, built by
`npm run build:userscript` from `src/content.css` and `src/content.js`
(the script injects the stylesheet itself). It is committed, and published as a public gist (`npm run gist` on each release) so the raw
GitHub URL in its `@updateURL` stays stable. In the gist the file is still called
`traumasoft-mobile.user.js`, because the short link https://tinyurl.com/post-traumatic points at that
name and cannot be changed.

To install on an iPhone:

1. Install the free **Userscripts** app from the App Store.
2. Settings → Safari → Extensions → Userscripts: turn it on and allow it on
   `traumasoft.com` (or all websites).
3. In Safari, open the script's raw URL
   (https://tinyurl.com/post-traumatic, which redirects to
   `https://gist.githubusercontent.com/julianeden/ded7365e07fe74e89676e93bc5901c66/raw/traumasoft-mobile.user.js`),
   tap the Userscripts icon in the address bar, and tap Install.
4. Open the Traumasoft site; the restyle is on.

Updates are not automatic: tapping the Userscripts icon on the site and
choosing update, or re-opening the raw URL, picks up a newer version.

The test harness runs the bundle the same way it runs the add-on
(`npm run test:userscript`), and in Safari's engine with
`TSM_BROWSER=webkit` after `npx playwright-core install webkit`.
`TSM_ONLY=name.html` runs one fixture; the others still answer as unit views.

## Distribution

### Public listing on addons.mozilla.org

The add-on is published as a listed add-on so anyone can install it from its
AMO page in Firefox for Android. Listing metadata (summary, description,
category, license) lives in `amo-metadata.json`. To publish a new version:

1. Bump `version` in `src/manifest.json` and `package.json`.
2. Run, with your AMO API credentials from
   https://addons.mozilla.org/developers/addon/api/key/:

   ```sh
   WEB_EXT_API_KEY=... WEB_EXT_API_SECRET=... npm run sign:listed
   ```

AMO validates the package automatically and usually publishes within minutes;
a human review can follow. If the API refuses the first listed version of an
add-on that already has unlisted versions, upload `dist/*.zip` on the website
instead: Developer Hub, the add-on, Upload New Version, "On this site".

### Self-distributed (unlisted)

`npm run sign` signs it as unlisted and downloads the `.xpi` to `dist/`. On
the phone: Settings, About Firefox, tap the logo five times, then Settings,
"Install extension from file".

## Develop

```sh
npm run run:desktop   # desktop Firefox with a phone user agent; log in, open the schedule
npm run run:android   # phone over USB with adb
```

## Notes on the page

- Both calendar views are a `table.month` of `td#day_N` cells, each holding a
  `table.eventcontent`. The individual view puts one small table per shift
  inside; the location views put a `div.location` unit header followed by one
  `table.shifts` per crew slot (`tr.employee`, `tr.unassigned` for a
  requestable open slot with an `onclick`, `tr.unassigned-unavailable` for an
  open slot you cannot take).
- The signed-in name is read from `#ts_menus_user_div` in the site header,
  which the site renders after load, so the add-on polls briefly for it.
