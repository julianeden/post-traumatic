# Traumasoft Mobile Schedule

A Firefox add-on that makes the Traumasoft employee schedule page usable on a
phone. The page serves a fixed-width desktop month grid to every device; on a
phone it runs off the right edge and the text becomes unreadable. The add-on
leaves the page's own scripts and links alone and restyles what is already
there.

## What it does

On the login page, at any width:

- **Remembered username.** The site's login form is a Vue app with no
  `name` or `autocomplete` on its fields and the password on a later step,
  so Firefox never offers to remember it. The add-on stores the username
  you submit in the site's `localStorage` and fills it in next time, and
  tags the username and password fields (`autocomplete="username"` /
  `"current-password"`) so Firefox's own password manager can recognise the
  form. The password is never stored.

On every `main.php` page at phone widths:

- **Punch button in the header.** A "Punch" link to the punch clock page
  (`main.php?a=user:punchin`) sits beside the signed-in name in the site's
  header, and the Traumasoft Chat button is hidden. The header is rendered
  by the site's Vue app after load and can re-render, so the link is
  re-inserted whenever it goes missing.

On the punch clock page (`main.php?a=user:punchin`) at phone widths:

- **One button.** The site renders the available punch as an image with a
  click handler and the other as a disabled image input; the page shows a
  single large Punch In or Punch Out button for whichever applies, keeps the
  clock (the site's own `#current_time`, still refreshed by its script), the
  Last / Current / Next shift rows with the relevant one marked, and the
  Continue and Logout buttons. The welcome text, the Call Status notice and
  the table chrome are hidden, so nothing scrolls.
- **Early-punch check.** The site asks for a reason after an early punch
  and offers no way back, so the add-on asks first. It picks the shift the
  punch is for (the one whose hours contain now, otherwise the nearest; a
  punch in only considers shifts that have not ended) and compares the
  server's clock, which the page embeds, with the shift start (punch in) or
  end (punch out). More than 7 minutes early, the policy limit, brings up a
  card with the time, the shift boundary, the earliest no-questions time
  and "Punch in/out anyway" or "Not now". Within the limit the punch goes
  straight to the site's own handler (`checkEmpQualified()` / `punchout()`),
  which runs its checks and submits. If no shift is listed at all it asks
  once rather than punching blind.

On `main.php?a=user:schedule` (and the `view=schedule` calendar views) at
phone widths:

- **Page chrome.** The nested layout tables become a single column, the
  "Shift Substitutions / Trades / Time-Off / Pickup" links become tappable
  rows, and the View / month / year controls become full-width selects.
- **Individual Month View** (your shifts) becomes a vertical agenda: one row
  per day, days without shifts collapsed to a single line, today marked, past
  days muted, each shift a card with unit, time and the detail line. A
  floating "Today" button scrolls to the current day.
  - **Crew.** Each card also says who is on that unit for your hours ("with
    Jane Doe") or that the other seat is open ("open seat EMT"). To know
    that, the add-on loads the site's own BLS view for the month in the
    background, the same request the View dropdown makes, and the ALS and
    Details views only for shifts the BLS page does not list (a detail or a
    paramedic truck). Parsed pages are kept in `sessionStorage` for ten
    minutes so flipping between views does not reload them.
  - **See spares.** On an upcoming shift with an open seat, this lists
    everyone else working overlapping hours that day who has no partner on
    their own unit: name, unit, hours and how long the two shifts overlap.
- **Vehicle/Location Month Views** (every unit, e.g. BLS) show one day at a
  time. A sticky pager has a scrollable strip of day chips (with the number of
  requestable open shifts on each day), previous/next buttons, and filters:
  - **All units / Open only / Mine** (Mine appears once the signed-in name is
    read from the site header; your own slots are also tagged "you").
  - **Find a person**: type a name and only units with that person are shown,
    their name is highlighted, and the day chips show how many shifts they
    have on each day of the month, so you can see their whole month at a
    glance. Matching is word-prefix based, so "bob smi" finds "Bob-PB Smith".
  - **Calendar**: the button beside the person box swaps the day strip and
    unit list for a month grid with a dot for each of that person's shifts.
    Tapping a day opens a card under its row listing each shift: unit, hours,
    and who else is on that unit for those hours ("with Jane Doe") or that
    the other seat is open ("open seat EMT", tagged "you can request" when
    you could take it). "See this day" returns to the list on that day.
  - Open slots you can request are green "EMT open · Request" buttons. They
    are the site's own `requestPickupShift` elements, just restyled, so
    tapping one opens the site's normal confirmation dialog. Open slots you
    cannot request (a conflicting shift that day, past days) are shown muted.
- **Dialogs.** The site's jQuery UI confirmation dialog is pinned to the
  viewport and sized to the phone.

Nothing is sent anywhere but the site itself. The add-on has no permissions
beyond the Traumasoft host pattern and no background script. Its only
requests are the unit-view page loads described above, sent with the page's
own form fields to the same site. Storage is the chosen filter and the login
username in `localStorage` and the ten-minute unit-view cache in
`sessionStorage`.

Desktop browsers are untouched by the restyling: it only activates when the
viewport is 820px wide or narrower. The username memory works at any width.

## Diagnostics

The script logs what it decided (URL seen, viewport check, whether the
calendar was found, chosen mode, errors) with `console.debug` under the
prefix "Traumasoft Mobile". On a phone, read them with remote debugging from
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
npm run build      # dist/traumasoft_mobile_schedule-<version>.zip
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

```sh
npm test
TSM_FIXTURES=~/Desktop/Schedule npm test
```

It serves each page in headless Chromium at a made-up origin under the
site's real paths, with the saved asset folders answered from disk and every
other request blocked, injects the add-on's CSS and script, and checks that
the page no longer overflows, that the individual view's crew lines come from a correctly
formed request for the BLS view (answered with the saved BLS page) and its
spares list matches an independent reading of that page, that the pickup handlers are untouched, that the location
view shows exactly one day with a chip per day, that the "Open only" and
person filters hide the right units, that the person calendar's dots agree
with the day chips and its shift card matches the day's own unit list, that
the confirmation dialog fits the viewport, and that the punch clock page
shows one button, does not scroll, asks before early punches (the fixture's
server clock is moved and a punched-in state synthesised for the variants)
and hands non-early punches to the site's handler. Screenshots of every state
land in `test/out/`.

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
