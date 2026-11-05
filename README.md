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

- **Top bar.** Beside the site's hamburger: a calendar (the schedule,
  `main.php?a=user:schedule`), a wrench menu with the five Maintenance Forms
  from the Company Links page (Equipment, Fleet, IT, Property, PCR Tech
  Issues; the two Smartsheet ones open in a new tab), a checklist menu with
  the BLS and ALS checklists, and a clock (the punch clock), spread evenly
  across the bar. The logo, search box, settings, chat, portal, name block
  and bell are hidden; the hamburger's own list gets an "Alerts" entry
  after Punch Clock that opens the notifications panel the bell controlled
  (the bell stays in the page as an invisible activator for it). The header is rendered by the
  site's Vue app after load and can re-render, so the bar is re-inserted
  whenever it goes missing.

On the formbuilder pages (work orders, checklists, any
`formbuilder:display_form`) and the Fleet maintenance request at phone
widths:

- **Stacked forms.** The floated, fixed-width item boxes become a single
  column with labels above full-width, finger-sized controls; each radio or
  checkbox and its text are wrapped in a `<label>` so the text is tappable
  and an option never wraps mid-word. The coloured emphasis boxes keep their
  colours. The print copy of the form is hidden.
- **Odometer.** The checklists' odometer field is validated by class rules
  the site re-applies on load and on every shift change
  (`validate[required,custom[integer],min[..],max[..]]`). The add-on drops
  the `max[..]` rule and the `max` attribute and changes `custom[integer]`
  to `custom[number]`, each time the site sets them, so any reading at or
  above the last one is accepted, with or without decimals, and the phone
  shows a decimal keyboard.

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

- **Two tabs.** A Schedule / More Options switch at the top. Schedule, the
  default, holds the view pickers, legend, month and year and the calendar.
  More Options holds everything the page used to stack above them: the
  status and PTO figures, Availability, Shift Substitutions, Trades,
  Time-Off and Pickup Shifts, as tappable rows. Nothing moves in the DOM;
  the sections are tagged and one group is hidden at a time.
- **Page chrome.** The nested layout tables become a single column and the
  View / month / year controls become full-width selects.
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
npm run build      # dist/traumasoft_mobile_schedule-<version>.zip and userscript/traumasoft-mobile.user.js
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
and hands non-early punches to the site's handler, that the top bar has its
four buttons with working menus and the rest of the header hidden, and that
the form pages fit the phone with full-width controls and an odometer field
that keeps no upper limit even after a shift change. Screenshots of every state
land in `test/out/`.

## iPhone: the userscript build

Firefox on iOS cannot run add-ons, so the same code also ships as a single
userscript, `userscript/traumasoft-mobile.user.js`, built by
`npm run build:userscript` from `src/content.css` and `src/content.js`
(the script injects the stylesheet itself). It is committed, and published as a public gist (updated with `gh gist edit` on each release) so the raw
GitHub URL in its `@updateURL` stays stable.

To install on an iPhone:

1. Install the free **Userscripts** app from the App Store.
2. Settings → Safari → Extensions → Userscripts: turn it on and allow it on
   `traumasoft.com` (or all websites).
3. In Safari, open the script's raw URL
   (`https://gist.githubusercontent.com/julianeden/ded7365e07fe74e89676e93bc5901c66/raw/traumasoft-mobile.user.js`),
   tap the Userscripts icon in the address bar, and tap Install.
4. Open the Traumasoft site; the restyle is on.

Updates are not automatic: tapping the Userscripts icon on the site and
choosing update, or re-opening the raw URL, picks up a newer version.

The test harness runs the bundle the same way it runs the add-on
(`npm run test:userscript`), and in Safari's engine with
`TSM_BROWSER=webkit` after `npx playwright-core install webkit`.

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
