# Traumasoft Mobile Schedule

A Firefox add-on that makes the Traumasoft employee schedule page usable on a
phone. The page serves a fixed-width desktop month grid to every device; on a
phone it runs off the right edge and the text becomes unreadable. The add-on
leaves the page's own scripts and links alone and restyles what is already
there.

## What it does

On `main.php?a=user:schedule` (and the `view=schedule` calendar views) at
phone widths:

- **Page chrome.** The nested layout tables become a single column, the
  "Shift Substitutions / Trades / Time-Off / Pickup" links become tappable
  rows, and the View / month / year controls become full-width selects.
- **Individual Month View** (your shifts) becomes a vertical agenda: one row
  per day, days without shifts collapsed to a single line, today marked, past
  days muted, each shift a card with unit, time and the detail line. A
  floating "Today" button scrolls to the current day.
- **Vehicle/Location Month Views** (every unit, e.g. BLS) show one day at a
  time. A sticky pager has a scrollable strip of day chips (with the number of
  requestable open shifts on each day), previous/next buttons, and filters:
  - **All units / Open only / Mine** (Mine appears once the signed-in name is
    read from the site header; your own slots are also tagged "you").
  - **Find a person**: type a name and only units with that person are shown,
    their name is highlighted, and the day chips show how many shifts they
    have on each day of the month, so you can see their whole month at a
    glance. Matching is word-prefix based, so "bob smi" finds "Bob-PB Smith".
  - Open slots you can request are green "EMT open · Request" buttons. They
    are the site's own `requestPickupShift` elements, just restyled, so
    tapping one opens the site's normal confirmation dialog. Open slots you
    cannot request (a conflicting shift that day, past days) are shown muted.
- **Dialogs.** The site's jQuery UI confirmation dialog is pinned to the
  viewport and sized to the phone.

Nothing is sent anywhere. The add-on has no permissions beyond the Traumasoft
host pattern, no background script, and no storage except the chosen filter
in `localStorage`.

Desktop browsers are untouched: the script only activates when the viewport
is 820px wide or narrower.

## Diagnostics

While `DIAG` is `true` at the top of `content.js`, every page on the site
shows a small dark panel at the bottom for about 15 seconds (tap to dismiss)
with the add-on version, the URL it saw, the viewport size, whether the
calendar was found, the chosen mode, and any error. Set it to `false` once the
add-on is confirmed working on the phone.

## Layout

```
src/
  manifest.json   Manifest V3, Firefox 142+
  content.css     all styling, scoped to html.tsm
  content.js      adds classes, wraps the day numbers, builds the pager
  icons/
test/render.mjs   renders saved pages at phone width and checks the result
```

## Build

```sh
npm install
npm run lint
npm run build      # dist/traumasoft_mobile_schedule-<version>.zip
```

## Test

The test needs saved copies of the real page, which contain names and are not
committed. In desktop Firefox, open the schedule view you want, press Cmd+S,
choose "Web Page, complete", and save into `test/fixtures/` (gitignored), or
anywhere and point `TSM_FIXTURES` at the folder. Save one file per view you
care about, e.g. the Individual Month View and the BLS Vehicle/Location view.

```sh
npm test
TSM_FIXTURES=~/Desktop/Schedule npm test
```

It loads each page in headless Chromium with every non-`file://` request
blocked, injects the add-on's CSS and script, and checks that the page no
longer overflows, that the pickup handlers are untouched, that the location
view shows exactly one day with a chip per day, that the "Open only" and
person filters hide the right units, and that the confirmation dialog fits
the viewport. Screenshots of every state land in `test/out/`.

## Install on Firefox for Android

Firefox for Android only installs Mozilla-signed extensions. Sign it on
addons.mozilla.org as an unlisted add-on, then install the `.xpi` from a file:

```sh
WEB_EXT_API_KEY=... WEB_EXT_API_SECRET=... npm run sign
```

On the phone: Settings, About Firefox, tap the logo five times, then Settings,
"Install extension from file", pick the `.xpi`.

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
