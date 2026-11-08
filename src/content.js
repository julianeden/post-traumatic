// Restyles the Traumasoft schedule calendar for phones.
//
// The page is left structurally intact: every original element, including the
// open-shift <span onclick="requestPickupShift(...)"> buttons, stays where it
// is so the site's own scripts and dialogs keep working. This script only adds
// classes, wraps bare text nodes so CSS can style them, and inserts a day
// pager for the location (all-units) views. On the individual view it also
// loads the site's own unit views for the month to show who is on each of
// your shifts. On the login page it remembers the username. On the punch
// clock page it shows one big button and asks before an early punch.
//
// State is kept in data attributes on <html> (data-tsm, data-tsm-mode,
// data-tsm-base, data-tsm-name, data-tsm-cal); the stylesheet keys off those.
"use strict";

(() => {
  const MOBILE_QUERY = "(max-width: 820px)";
  const CALENDAR_WAIT_MS = 30000;
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Views listed in the first dropdown, by label after the prefix is removed.
  const COMMON_VIEWS = ["individual month view", "available open shifts", "als", "bls", "details", "dispatch", "management"];
  const VIEW_PREFIX = /^vehicle\/location month view\s*-\s*/i;
  // Unit views searched, in order, for the crew on each of your shifts.
  const CREW_VIEWS = ["bls", "als", "details"];
  const CREW_CACHE_MS = 10 * 60 * 1000;
  const DAY_MIN = 24 * 60;
  const LOGIN_KEY = "tsm.login.username";
  const PUNCH_URL = "/main.php?a=user:punchin";
  const SCHEDULE_URL = "/main.php?a=user:schedule";
  const FORM_URL = "/main.php?a=formbuilder:display_form&form_id=";
  // The header's wrench and checklist menus, as listed on the Company Links page.
  const WORK_ORDERS = [
    ["Work Order: Equipment", FORM_URL + "74"],
    ["Work Order: Fleet", "/main.php?a=user:vehicle_maintenance_request"],
    ["Work Order: IT", "https://app.smartsheet.com/b/form/01a0a59e3d387053b63871c0457efc3d"],
    ["Work Order: Property", FORM_URL + "16"],
    ["PCR Tech Issues", "https://app.smartsheet.com/b/form/01a0a59e3d387053b63871c0457efc3d"],
  ];
  const CHECKLISTS = [
    ["BLS Checklist", FORM_URL + "125"],
    ["ALS Checklist", FORM_URL + "112"],
  ];
  // Close functions of the header menus, so opening one closes the rest.
  const openMenuClosers = [];
  // Company policy: punches up to this long before the shift boundary need
  // no explanation; earlier ones make the site demand a reason.
  const EARLY_LIMIT_MS = 7 * 60 * 1000;
  const html = document.documentElement;

  // Progress notes go to the console (filter on "Post-Traumatic").
  const diag = { log: (line) => console.debug("[Post-Traumatic]", line) };
  diag.log(`script running on ${location.host}${location.pathname}${location.search.slice(0, 70)} (${document.readyState})`);

  try {
    main();
  } catch (e) {
    diag.log(`error: ${e && e.message ? e.message : e}`);
  }

  function main() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onReady, { once: true });
    } else {
      onReady();
    }
  }

  function isSchedulePageDom() {
    return Boolean(document.getElementById("view_select") && document.querySelector("table.month"));
  }

  // Runs once the DOM is parsed: before that the page's viewport meta tag is
  // not in effect and a phone still reports a desktop-sized layout width.
  function isPhoneWidth() {
    const mq = matchMedia(MOBILE_QUERY).matches;
    const touchNarrow = navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) <= 820;
    diag.log(`viewport ${innerWidth}×${innerHeight} · media query ${mq ? "matches" : "no"} · touch+narrow ${touchNarrow ? "yes" : "no"}`);
    return mq || touchNarrow;
  }

  function onReady() {
    if (document.getElementById("loginApp")) {
      rememberLogin();
      return;
    }
    if (!/main\.php$/.test(location.pathname)) return;
    if (!isPhoneWidth()) {
      diag.log("desktop-sized viewport: not activating");
      return;
    }
    html.dataset.tsmChrome = "on";
    buildTopBar();
    // Some pages build their content after load (the Fleet request form is
    // injected once its field config arrives), so keep looking for a while.
    if (startPage()) return;
    const started = Date.now();
    const observer = new MutationObserver(() => {
      if (startPage()) {
        observer.disconnect();
        diag.log(`page content appeared after ${Date.now() - started} ms`);
      } else if (Date.now() - started > CALENDAR_WAIT_MS) {
        observer.disconnect();
        diag.log("nothing to restyle on this page");
      }
    });
    observer.observe(html, { childList: true, subtree: true });
    setTimeout(() => {
      if (!html.dataset.tsmReady) {
        observer.disconnect();
        diag.log("nothing to restyle on this page");
      }
    }, CALENDAR_WAIT_MS);
  }

  // Starts the restyle for whichever page this is; false if none matches yet.
  function startPage() {
    if (html.dataset.tsmReady) return true;
    const pages = [
      [() => document.getElementById("punchin_form"), initPunchPage, "punch page"],
      [() => document.getElementById("formID"), initFormPage, "form page"],
      [() => document.getElementById("vehicle_maintenance_request_dialog_form"), initFleetPage, "fleet form"],
      [isReasonFormDom, initOvertimePage, "overtime form"],
      [isSchedulePageDom, init, "schedule"],
    ];
    for (const [test, start, label] of pages) {
      if (!test()) continue;
      try {
        start();
      } catch (e) {
        diag.log(`error on ${label}: ${e && e.message ? e.message : e}`);
        html.dataset.tsmReady = "1";
      }
      return true;
    }
    return false;
  }

  function init() {
    if (html.dataset.tsmReady) return;
    html.dataset.tsm = "on";
    html.dataset.tsmReady = "1";

    const month = document.querySelector("table.month");
    const days = [...month.querySelectorAll('td[id^="day_"]')];
    const isLocation = Boolean(month.querySelector("div.location"));

    decorateToolbar();
    buildTabs();
    decorateDays(month, days, isLocation, isLocation && isDispatchView());

    if (isLocation) {
      html.dataset.tsmMode = "location";
      if (!isDispatchView()) carryOvernight(days);
      const pager = buildPager(month, days);
      // The header that carries the signed-in name is rendered by the site's
      // own script and may land after DOMContentLoaded.
      whenUserNameKnown((name) => {
        diag.log(`signed-in name: ${name}`);
        pager.setUser(name);
      });
      if (isDispatchView()) markOnNow(days);
    } else {
      html.dataset.tsmMode = "agenda";
      addTodayButton(month);
      buildAgendaBaseFilter(days);
      loadCrew(days).catch((e) => diag.log(`crew: ${e && e.message ? e.message : e}`));
    }
    diag.log(`active · mode ${html.dataset.tsmMode} · ${days.length} days`);
  }

  // ---- header: the top bar --------------------------------------------------

  // The site's Vue header renders after load and may re-render. Beside its
  // hamburger it gets: calendar (schedule), wrench (work orders), checklist
  // (BLS/ALS) and clock (punch). The stylesheet hides the logo, search,
  // settings, chat, portal, name and bell; the bell is reached from an
  // "Alerts" entry added to the hamburger's list.
  function buildTopBar() {
    let nav = null;
    const place = () => {
      const col = document.querySelector("#ts_menus_menu_div > .v-col");
      if (!col) return;
      if (!nav) nav = makeTopNav();
      const burger = col.querySelector('button[title="All Menus"]');
      if (burger) {
        if (burger.nextElementSibling !== nav) burger.after(nav);
      } else if (col.firstElementChild !== nav) {
        col.prepend(nav);
      }
      addAlertsItem(burger);
    };
    place();
    new MutationObserver(place).observe(html, { childList: true, subtree: true });
  }

  // The hamburger's list is rendered into an overlay each time it opens;
  // give it an Alerts entry after Punch Clock that opens the notifications
  // panel the hidden bell button controls.
  function addAlertsItem(burger) {
    const bell = document.getElementById("notifications_button");
    // Older Vuetify builds (the legacy form pages) use aria-owns instead.
    const listId = burger?.getAttribute("aria-controls") || burger?.getAttribute("aria-owns");
    const list = listId && document.getElementById(listId)?.querySelector(".v-list");
    if (!bell || !list || list.querySelector("#tsm-alerts-item")) return;
    const links = [...list.querySelectorAll("a.ts_menu_list_item[href]")].filter((a) => !/logout/i.test(a.href));
    const model = list.querySelector('a.ts_menu_list_item[href*="user:punchin"]')
      || list.querySelector('a.ts_menu_list_item[href*="user:account"]')
      || links[links.length - 1];
    if (!model) return;
    const wrap = model.parentElement.cloneNode(false);
    const item = model.cloneNode(false);
    item.id = "tsm-alerts-item";
    item.href = "#";
    item.removeAttribute("aria-selected");
    item.append(el("span", "v-list-item__overlay"), el("span", "v-list-item__underlay"));
    const content = el("div", "v-list-item__content");
    const title = el("div", "v-list-item-title ts_menu_list_item_title");
    const glyph = model.querySelector("i.v-icon")?.cloneNode(false) || el("i", "mdi v-icon");
    glyph.className = glyph.className.replace(/mdi-[\w-]+/, "mdi-bell");
    title.append(glyph, " Alerts");
    content.append(title);
    item.append(content);
    wrap.append(item);
    model.parentElement.after(wrap);
    item.addEventListener("click", (e) => {
      e.preventDefault();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      setTimeout(() => bell.click(), 60);
    });
  }

  function makeTopNav() {
    const nav = el("nav", "tsm-topnav");
    nav.id = "tsm-topnav";
    nav.setAttribute("aria-label", "Quick links");
    nav.append(
      navLink("Schedule", SCHEDULE_URL, icon("calendar")),
      navMenu("Work orders", icon("wrench"), WORK_ORDERS),
      navMenu("Checklists", icon("checklist"), CHECKLISTS),
      navLink("Punch Clock", PUNCH_URL, icon("clock")),
    );
    return nav;
  }

  function navLink(label, href, svg) {
    const a = document.createElement("a");
    a.className = "tsm-topbtn";
    a.href = href;
    a.title = label;
    a.setAttribute("aria-label", label);
    a.append(svg);
    return a;
  }

  // A button that opens a small list of links under the header.
  function navMenu(label, svg, items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tsm-topbtn tsm-topbtn-menu";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    btn.append(svg, icon("chevron"));
    const panel = el("div", "tsm-menu");
    panel.setAttribute("role", "menu");
    panel.hidden = true;
    for (const [text, href] of items) {
      const a = document.createElement("a");
      a.className = "tsm-menu-item";
      a.setAttribute("role", "menuitem");
      a.href = href;
      a.textContent = text;
      if (/^https?:/.test(href) && !href.includes(location.host)) a.target = "_blank";
      panel.append(a);
    }
    const close = () => {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("tsm-topbtn-open");
    };
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = panel.hidden;
      closeMenus();
      if (!open) return;
      if (!panel.isConnected) document.body.append(panel);
      const r = btn.getBoundingClientRect();
      panel.hidden = false;
      panel.style.top = `${Math.round(r.bottom + 6)}px`;
      panel.style.left = `${Math.max(8, Math.min(Math.round(r.left), innerWidth - panel.offsetWidth - 8))}px`;
      btn.setAttribute("aria-expanded", "true");
      btn.classList.add("tsm-topbtn-open");
    });
    openMenuClosers.push(close);
    return btn;
  }

  function closeMenus() {
    for (const close of openMenuClosers) close();
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest?.(".tsm-menu")) closeMenus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenus();
  });

  // Simple line icons; stroke follows the text colour.
  function icon(name) {
    const paths = {
      calendar: ["M4 6h16v14H4z", "M4 10h16", "M8 3v4", "M16 3v4"],
      wrench: ["M14.5 5.5a4 4 0 0 0-5.3 5.3L4 16v4h4l5.2-5.2a4 4 0 0 0 5.3-5.3l-2.8 2.8-2.3-2.3 2.8-2.8z"],
      checklist: ["M4 4h16v16H4z", "M8 12l3 3 5-6"],
      clock: ["M12 7v5l3.5 2"],
      chevron: ["M7 10l5 5 5-5"],
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("tsm-icon", `tsm-icon-${name}`);
    if (name === "clock") {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", "12");
      c.setAttribute("cy", "12");
      c.setAttribute("r", "9");
      svg.append(c);
    }
    for (const d of paths[name]) {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      svg.append(p);
    }
    for (const node of svg.children) {
      node.setAttribute("fill", "none");
      node.setAttribute("stroke", "currentColor");
      node.setAttribute("stroke-width", "2");
      node.setAttribute("stroke-linecap", "round");
      node.setAttribute("stroke-linejoin", "round");
    }
    return svg;
  }

  // ---- form pages: work orders and checklists ------------------------------

  // Formbuilder pages (work orders, checklists) are floated fixed-width boxes;
  // the stylesheet stacks them. The checklist odometer loses its upper limit.
  function initFormPage() {
    html.dataset.tsm = "on";
    html.dataset.tsmPage = "form";
    html.dataset.tsmReady = "1";
    wrapTickOptions(document.getElementById("formID"));
    softenColourBoxes(document.getElementById("formID"));
    fixOdometer();
    diag.log("form page");
  }

  // Boxes the form author painted a loud colour (red warnings, yellow
  // notices) keep the colour as a tint and an edge instead of a solid fill.
  function softenColourBoxes(form) {
    for (const box of form.querySelectorAll('[id^="outer_item-"]')) {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(box).backgroundColor);
      if (!m) continue;
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const max = Math.max(r, g, b);
      if (max === 0 || (max - Math.min(r, g, b)) / max < 0.3) continue;
      box.classList.add("tsm-tint");
      box.style.setProperty("--tsm-edge", `rgb(${r}, ${g}, ${b})`);
    }
  }

  // Radio and checkbox options are a bare input followed by loose text;
  // put each pair in a <label> so the text is tappable and an option never
  // wraps in the middle.
  function wrapTickOptions(form) {
    for (const input of form.querySelectorAll('[id*="_style_item-"] input[type="radio"], [id*="_style_item-"] input[type="checkbox"]')) {
      if (input.closest("label")) continue;
      const label = document.createElement("label");
      label.className = "tsm-opt";
      input.before(label);
      label.append(input);
      let node = label.nextSibling;
      while (node && node.nodeType === Node.TEXT_NODE) {
        const next = node.nextSibling;
        label.append(node);
        node = next;
      }
    }
  }

  // The site re-applies validate[required,custom[integer],min[..],max[..]]
  // on load and on every shift change; strip the max each time it does. The
  // integer rule stays: the site stores whole miles, so a reading typed with
  // tenths (what the dash shows) is cut to whole miles before it is checked
  // and sent.
  function fixOdometer() {
    const input = document.getElementById("formbuilder_rigcheck_odometer");
    if (!input) return;
    input.setAttribute("inputmode", "decimal");
    const relax = () => {
      const fixed = input.className.replace(/,?\s*max\[[^\]]*\]/, "");
      if (fixed !== input.className) input.className = fixed;
      if (input.hasAttribute("max")) input.removeAttribute("max");
    };
    relax();
    new MutationObserver(relax).observe(input, { attributes: true, attributeFilter: ["class", "max"] });
    const wholeMiles = () => {
      const typed = input.value.trim().replace(/,/g, "");
      const n = Number(typed);
      if (!typed || !Number.isFinite(n) || !/[.]/.test(typed)) return;
      input.value = String(Math.trunc(n));
      diag.log(`odometer ${typed} sent as ${input.value}`);
    };
    input.addEventListener("change", wholeMiles);
    const form = input.form;
    if (form) {
      form.addEventListener("submit", wholeMiles, true);
      form.addEventListener("click", (e) => {
        if (e.target.closest("input[type=submit], button[type=submit], input[type=image]")) wholeMiles();
      }, true);
    }
  }

  function initFleetPage() {
    html.dataset.tsm = "on";
    html.dataset.tsmPage = "fleet";
    html.dataset.tsmReady = "1";
    diag.log("fleet maintenance form");
  }

  // ---- overtime form: the reason the site asks for after a late punch -----

  // The form the site answers a late punch out with ("Overtime/Extra Hours
  // Authorization Form"): a 650px table of label/value rows. The shift facts
  // become a summary card, each field gets its label above it, spacer rows
  // go, and the site's own reason logic (extra rows for some reasons) keeps
  // working on the same rows.
  function isReasonFormDom() {
    const form = document.getElementById("form1");
    return Boolean(form && /uload=forms\//.test(form.getAttribute("action") || "") && form.querySelector("select, textarea"));
  }

  function initOvertimePage() {
    const form = document.getElementById("form1");
    html.dataset.tsm = "on";
    html.dataset.tsmPage = "overtime";
    html.dataset.tsmReady = "1";
    form.classList.add("tsm-ot");
    const facts = [];
    let heading = null;
    for (const tr of form.querySelectorAll("tr")) {
      const cells = [...tr.children].filter((c) => /^T[DH]$/.test(c.tagName));
      if (!cells.length) continue;
      if (cells.some((c) => c.classList.contains("std_header"))) {
        tr.classList.add("tsm-ot-title");
        if (!heading) {
          heading = el("h1", "tsm-ot-heading", tidy(tr.textContent));
          form.prepend(heading);
        }
        continue;
      }
      const field = tr.querySelector("input:not([type=hidden]), select, textarea");
      if (!field) {
        if (cells.length < 2 || !tidy(tr.textContent)) {
          tr.classList.add("tsm-ot-blank");
        } else {
          tr.classList.add("tsm-ot-fact");
          facts.push({ label: tidy(cells[0].textContent).replace(/:$/, ""), value: tidy(cells[1].textContent) });
        }
        continue;
      }
      tr.classList.add(field.type === "submit" ? "tsm-ot-submit" : "tsm-ot-field");
      if (cells.length > 1) {
        cells[0].classList.add("tsm-ot-label");
        unColon(cells[0]);
      }
    }
    const summary = overtimeSummary(facts);
    if (summary) {
      form.classList.add("tsm-ot-summarised");
      if (heading) heading.after(summary);
      else form.prepend(summary);
    }
    diag.log(`overtime form · ${facts.length} facts · summary ${summary ? "built" : "not built"}`);
  }

  // "Run Number:" -> "Run Number"; the label sits on its own line now.
  function unColon(cell) {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let last = null;
    while (walker.nextNode()) if (tidy(walker.currentNode.textContent)) last = walker.currentNode;
    if (last) last.textContent = last.textContent.replace(/:\s*$/, "");
  }

  // The facts come as "2026-11-07 10:00:00" for the scheduled shift and
  // "11/07/2026 19:25" for the punch; one card with the shift and how far
  // from its end the punch was. Any other shape leaves the site's rows alone.
  function overtimeSummary(facts) {
    const iso = [];
    const us = [];
    for (const f of facts) {
      const a = parseIsoStamp(f.value);
      if (a !== null) iso.push(a);
      else {
        const b = parseUsStamp(f.value);
        if (b !== null) us.push(b);
      }
    }
    if (iso.length !== 2 || us.length !== 1) return null;
    const [start, end] = iso.sort((x, y) => x - y);
    const punch = us[0];
    const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
    const card = el("div", "tsm-ot-summary");
    card.append(summaryRow("Shift", `${fmtDayShort(start)} · ${fmtTime(start)} – ${sameDay(start, end) ? "" : fmtDayShort(end) + " "}${fmtTime(end)}`));
    const diff = punch - end;
    const note = Math.abs(diff) < 30000
      ? "right at the end of the shift"
      : `${fmtLead(Math.abs(diff))} ${diff > 0 ? "after" : "before"} the shift ended`;
    card.append(summaryRow("Punched out", `${sameDay(punch, end) ? "" : fmtDayShort(punch) + " · "}${fmtTime(punch)}`, note));
    return card;
  }

  function summaryRow(label, value, note) {
    const row = el("div", "tsm-ot-sum-row");
    row.append(el("div", "tsm-ot-sum-label", label), el("div", "tsm-ot-sum-value", value));
    if (note) row.append(el("div", "tsm-ot-sum-note", note));
    return row;
  }

  // "2026-11-07 10:00:00" -> ms, else null
  function parseIsoStamp(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime() : null;
  }

  // "11/07/2026 19:25" or "11/06/2026 6:53 PM" -> ms, else null
  function parseUsStamp(text) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:([ap])\.?m?\.?)?$/i.exec(text || "");
    if (!m) return null;
    let h = +m[4];
    if (m[7]) h = (h % 12) + (m[7].toLowerCase() === "p" ? 12 : 0);
    return new Date(+m[3], +m[1] - 1, +m[2], h, +m[5], +(m[6] || 0)).getTime();
  }

  // "Sat Nov 7"
  function fmtDayShort(ms) {
    const d = new Date(ms);
    return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  // ---- punch clock page ----------------------------------------------------

  // One big button for whichever punch the site currently allows, a live
  // clock and the shift list kept, the rest hidden. A punch more than
  // EARLY_LIMIT_MS before the shift boundary asks first, because the site
  // has no way back once it asks for a reason.
  function initPunchPage() {
    const form = document.getElementById("punchin_form");
    html.dataset.tsm = "on";
    html.dataset.tsmPage = "punch";
    html.dataset.tsmReady = "1";

    const kind = punchKind();
    const shifts = readShifts();
    const now = serverClock();

    const box = el("div", "tsm-punch");
    const clock = el("div", "tsm-punch-time");
    const tick = () => {
      clock.textContent = fmtClock(now());
    };
    tick();
    setInterval(tick, 1000);
    const dateLine = el("div", "tsm-punch-date", fmtLongDate(now()));

    const shiftBox = el("div", "tsm-punch-shifts");
    const shiftTable = document.querySelector("table.punchclock_shifts");
    if (shiftTable) {
      shortenShiftDates(shiftTable);
      shiftBox.append(shiftTable);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tsm-punch-btn tsm-punch-${kind || "none"}`;
    btn.textContent = kind === "out" ? "Punch Out" : "Punch In";

    box.append(clock, dateLine, shiftBox, kind ? btn : el("div", "tsm-punch-note", "No punch is available right now."));
    // After login the site lands here with no menu in its header, so its
    // Continue button is the only way on; keep it as a small link.
    const cont = document.getElementById("continue");
    if (cont) {
      cont.classList.add("tsm-punch-continue");
      cont.value = "Continue to the site \u203A";
      box.append(cont);
    }
    form.before(box);

    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const t = now();
      const relevant = relevantShift(shifts, t, kind);
      const go = () => punch(kind, btn);
      if (!relevant) {
        confirmBox({
          title: `\u26A0\uFE0F Punch ${kind}?`,
          lines: [`It's ${fmtTime(t)}. No scheduled shift found to check against.`, `Punch ${kind} anyway?`],
        }, go);
        return;
      }
      const check = earlyCheck(kind, relevant, t);
      if (!check.early) {
        go();
        return;
      }
      confirmBox({
        title: `\u26A0\uFE0F Punch ${kind} early?`,
        lines: [`It's ${fmtTime(t)}. Your ${shiftNoun(relevant)} ${kind === "in" ? "starts" : "ends"} in ${fmtLead(check.lead)}.`, `Punch ${kind} anyway?`],
      }, go);
    });
    diag.log(`punch clock page · ${kind ? "punch " + kind : "no punch"} available · ${shifts.length} shifts listed`);
  }

  // "11/04/2026 07:00 to 11/04/2026 19:00" -> "Nov 4 @ 07:00 — Nov 4 @ 19:00"
  // in the shift rows, leaving any line breaks as they are.
  function shortenShiftDates(table) {
    const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      node.textContent = node.textContent
        .replace(/\b(\d{1,2})\/(\d{1,2})\/\d{4}\s+(\d{1,2}:\d{2})/g, (m, mo, d, time) => `${MONTHS[Number(mo) - 1] || mo} ${Number(d)} @ ${time}`)
        .replace(/(\d{2}:\d{2})\s+to\s+/g, "$1 — ");
    }
  }

  // Which punch the site offers: its enabled control is an <img> with an
  // onclick, the disabled one an <input type="image" disabled>.
  function punchKind() {
    const usable = (id) => {
      const node = document.getElementById(id);
      if (!node || node.disabled || node.hasAttribute("disabled")) return false;
      return node.tagName === "IMG" ? Boolean(node.getAttribute("onclick")) : true;
    };
    const inOk = usable("punchin_img");
    const outOk = usable("punchout_img");
    if (inOk !== outOk) return inOk ? "in" : "out";
    const flag = document.getElementById("punch_in")?.value;
    if (flag === "1") return "in";
    if (flag === "0") return "out";
    return inOk ? "in" : null;
  }

  // Hands the punch to the site's own control, which runs its checks and
  // submits the form.
  function punch(kind, btn) {
    const target = document.getElementById(kind === "in" ? "punchin_img" : "punchout_img");
    if (!target) return;
    btn.disabled = true;
    btn.textContent = kind === "in" ? "Punching in…" : "Punching out…";
    target.click();
    // If the site stopped the punch (not qualified, break rule), let them retry.
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = kind === "in" ? "Punch In" : "Punch Out";
    }, 8000);
  }

  // "Last Shift / Current Shifts / Next Shift" rows: "MM/DD/YYYY HH:MM to
  // MM/DD/YYYY HH:MM", possibly several per row.
  function readShifts() {
    const out = [];
    const re = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+to\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/g;
    for (const tr of document.querySelectorAll("table.punchclock_shifts tr")) {
      const cells = tr.querySelectorAll("td");
      if (cells.length < 2) {
        tr.classList.add("tsm-shift-head");
        continue;
      }
      tr.classList.add("tsm-shift-row");
      const label = tidy(cells[0].textContent).replace(/:$/, "");
      let count = 0;
      for (const m of cells[1].textContent.matchAll(re)) {
        out.push({
          label,
          row: tr,
          start: new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5]).getTime(),
          end: new Date(+m[8], +m[6] - 1, +m[7], +m[9], +m[10]).getTime(),
        });
        count += 1;
      }
      if (!count) tr.classList.add("tsm-shift-empty");
    }
    return out;
  }

  // The page embeds the server's clock; count from it rather than the phone.
  function serverClock() {
    for (const script of document.scripts) {
      const m = /moment\.unix\((\d{9,11})\)/.exec(script.textContent || "");
      if (m) {
        const base = Number(m[1]) * 1000;
        return () => base + performance.now();
      }
    }
    return () => Date.now();
  }

  // The shift this punch is for: the one whose hours contain now, else the
  // nearest. A punch in is for a shift that has not ended yet; on a tie a
  // punch out belongs to the earlier shift.
  function relevantShift(shifts, now, kind) {
    let best = null;
    let bestScore = Infinity;
    const pool = kind === "in" && shifts.some((s) => s.end > now) ? shifts.filter((s) => s.end > now) : shifts;
    for (const s of pool) {
      const score = now < s.start ? s.start - now : now > s.end ? now - s.end : 0;
      const better = score < bestScore || (score === bestScore && best && (kind === "out" ? s.start < best.start : s.start > best.start));
      if (better) {
        best = s;
        bestScore = score;
      }
    }
    return best;
  }

  function earlyCheck(kind, shift, now) {
    const target = kind === "in" ? shift.start : shift.end;
    const lead = target - now;
    return { early: lead > EARLY_LIMIT_MS, lead, target, allowedFrom: target - EARLY_LIMIT_MS };
  }

  function shiftNoun(shift) {
    const l = shift.label.toLowerCase();
    if (l.startsWith("next")) return "next shift";
    if (l.startsWith("last")) return "last shift";
    return "current shift";
  }

  function confirmBox({ title, lines }, onYes) {
    const overlay = el("div", "tsm-confirm");
    const card = el("div", "tsm-confirm-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.append(el("div", "tsm-confirm-title", title));
    for (const line of lines) card.append(el("p", "tsm-confirm-line", line));
    const actions = el("div", "tsm-confirm-actions");
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "tsm-confirm-yes";
    ok.textContent = "Yes";
    const no = document.createElement("button");
    no.type = "button";
    no.className = "tsm-confirm-no";
    no.textContent = "No";
    actions.append(no, ok);
    card.append(actions);
    overlay.append(card);
    const close = () => overlay.remove();
    no.addEventListener("click", close);
    ok.addEventListener("click", () => {
      close();
      onYes();
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.body.append(overlay);
    no.focus();
  }

  // ---- login page: remember the username ---------------------------------

  // The login form is rendered by the site's Vue app after load. Fill the
  // username from the last login, keep it updated, and tag the fields so the
  // browser's own password manager recognises them.
  function rememberLogin() {
    const started = Date.now();
    const hook = () => {
      const user = document.querySelector('[data-testid="login-identifier"] input');
      if (user && !user.dataset.tsmHooked) hookUsername(user);
      const pass = document.querySelector('[data-testid="login-password"] input');
      if (pass && !pass.dataset.tsmHooked) {
        pass.dataset.tsmHooked = "1";
        pass.setAttribute("autocomplete", "current-password");
        if (!pass.name) pass.name = "password";
      }
    };
    hook();
    const observer = new MutationObserver(() => {
      hook();
      if (Date.now() - started > 10 * 60 * 1000) observer.disconnect();
    });
    observer.observe(html, { childList: true, subtree: true });
    document.addEventListener("click", (e) => {
      if (e.target.closest?.('[data-testid="login-submit"]')) saveUsername();
    }, true);
    diag.log("login page: watching for the form");
  }

  function hookUsername(input) {
    input.dataset.tsmHooked = "1";
    input.setAttribute("autocomplete", "username");
    if (!input.name) input.name = "username";
    const saved = savedUsername();
    if (saved && !input.value) {
      setInputValue(input, saved);
      diag.log("login: username filled in");
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveUsername();
    });
  }

  function saveUsername() {
    const input = document.querySelector('[data-testid="login-identifier"] input');
    const value = (input?.value || "").trim();
    if (!value) return;
    try {
      localStorage.setItem(LOGIN_KEY, value);
    } catch {
      // storage unavailable; nothing to remember with
    }
  }

  function savedUsername() {
    try {
      return localStorage.getItem(LOGIN_KEY) || "";
    } catch {
      return "";
    }
  }

  // Sets a value so that the page's own framework sees it as typed.
  function setInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---- page chrome -------------------------------------------------------

  // The page stacks its admin sections (status, PTO, availability, shift
  // substitutions, trades, time off, pickups) above the calendar. Split them
  // into a "More Options" tab and keep the schedule as the default tab.
  // Following a section's link serves its management form inline, right
  // under that section; the page then shows only that section and its form
  // under a bar with a back button (content.css hides the rest; nothing
  // moves in the DOM).
  function buildTabs() {
    const toolbarTable = document.querySelector("table:has(> tbody > tr.tsm-toolbar)");
    const userContent = document.getElementById("user_content");
    if (!toolbarTable || !userContent) return;
    const cell = toolbarTable.parentElement;
    const subpage = [];
    for (const child of cell.children) {
      if (child === toolbarTable) {
        child.classList.add("tsm-sched");
      } else if (child.tagName === "TABLE" && /^\s*my\s*schedule\s*$/i.test(child.textContent)) {
        child.classList.add("tsm-hide");
      } else if (child.tagName === "FORM" || (child.tagName === "DIV" && child.textContent.trim())) {
        child.classList.add("tsm-more");
        subpage.push(child);
      } else if (child.tagName === "TABLE") {
        child.classList.add("tsm-more");
      }
    }
    const row = cell.closest("tr");
    if (row) {
      for (const sibling of row.parentElement.children) {
        if (sibling !== row) sibling.classList.add("tsm-more");
      }
    }
    for (const table of userContent.querySelectorAll(".tsm-more table, table.tsm-more")) compactSection(table);
    compactFacts(userContent);

    const tabs = el("div", "tsm-tabs");
    tabs.setAttribute("role", "tablist");
    const buttons = [["Schedule", "schedule"], ["More Options", "more"]].map(([label, name]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tsm-tab";
      b.dataset.tab = name;
      b.textContent = label;
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => setTab(name));
      tabs.append(b);
      return b;
    });
    let section = null;
    // Either tab puts More Options back to its plain list: the form closes,
    // its section returns to its place and gets a link to reopen it.
    const closeSubpage = () => {
      html.dataset.tsmView = "closed";
      if (!section) return;
      section.classList.remove("tsm-active");
      const id = subpage.map((e) => e.id).find(Boolean) || "";
      const label = id.startsWith("shift_substitution") ? "Click Here to Manage your Shift Substitutions"
        : id.startsWith("shift_trade") ? "Click Here to Manage your Shift Trade(s)"
        : id.startsWith("timeoff") ? "Click Here to Manage your Request(s) for Time Off"
        : id.startsWith("open_shift") ? "Click Here to View Open Shifts"
        : "Open";
      const row = section.querySelector("tbody")?.insertRow();
      if (!row) return;
      const cell = row.insertCell();
      cell.className = "indent";
      const link = document.createElement("a");
      link.href = location.href;
      link.textContent = label;
      cell.append(link);
      compactSection(section);
    };
    const setTab = (name) => {
      if (html.dataset.tsmView === "sub") closeSubpage();
      html.dataset.tsmTab = name;
      for (const b of buttons) b.setAttribute("aria-selected", String(b.dataset.tab === name));
    };
    userContent.before(tabs);
    if (!subpage.length) {
      setTab("schedule");
      return;
    }
    decorateSubpage(subpage);
    for (let n = subpage[0].previousElementSibling; n; n = n.previousElementSibling) {
      if (n.tagName === "TABLE") {
        section = n;
        break;
      }
    }
    section?.classList.add("tsm-active");
    const title = section?.querySelector("td.std_header")?.textContent.trim().replace(/\s+/g, " ") || "";
    const bar = el("div", "tsm-subbar");
    const back = document.createElement("button");
    back.type = "button";
    back.className = "tsm-back";
    back.textContent = "\u2039 Back";
    back.addEventListener("click", () => {
      setTab("more");
      window.scrollTo(0, 0);
    });
    bar.append(back, el("span", "tsm-subbar-title", title));
    tabs.after(bar);
    setTab("more");
    html.dataset.tsmView = "sub";
    diag.log(`management form on the page: showing ${title || "its section"} with a back button`);
  }

  // A cell with nothing to show: no text beyond whitespace (the site pads
  // with &nbsp;) and no control, image or link.
  function isBlank(td) {
    return !td.querySelector("img, input, select, textarea, button, a") && !td.textContent.replace(/\u00a0/g, "").trim();
  }

  // The facts table (status, hours, PTO) drops its spacer rows, its centred
  // "PTO" caption row becomes a subheading, and the "View PTO Bank" link
  // moves from the first row into that heading's spare cell.
  function compactFacts(userContent) {
    const table = userContent.querySelector("td.data_field")?.closest("table");
    if (!table) return;
    table.classList.add("tsm-facts");
    let heading = null;
    for (const r of table.querySelectorAll(":scope > tbody > tr")) {
      const cells = [...r.children];
      const filled = cells.filter((td) => !isBlank(td));
      if (!filled.length) r.classList.add("tsm-blank");
      else if (!heading && filled.length === 1 && filled[0].getAttribute("colspan")) {
        heading = r;
        r.classList.add("tsm-facts-heading");
      }
    }
    if (!heading) return;
    // the heading spans the whole row so the link can sit at its right edge
    // without widening any column
    const columns = Math.max(...[...table.querySelectorAll(":scope > tbody > tr")].map((r) => [...r.children].reduce((n, td) => n + (td.colSpan || 1), 0)));
    const cell = heading.firstElementChild;
    cell.colSpan = columns;
    for (const td of [...heading.children]) if (td !== cell) td.classList.add("tsm-blank");
    const link = table.querySelector(':scope > tbody > tr > td[align="right"] > a');
    if (link) {
      link.classList.add("tsm-facts-link");
      cell.append(link);
    }
  }

  // A section that is only a heading over one link becomes one row carrying
  // the heading's name; the link's own wording ("Click Here to…") is dropped.
  function compactSection(table) {
    if (table.classList.contains("tsm-row")) return;
    const header = table.querySelector(":scope > tbody > tr > td.std_header");
    const links = table.querySelectorAll(":scope > tbody > tr > td.indent > a");
    if (!header || links.length !== 1) return;
    const rest = table.textContent.replace(header.textContent, "").replace(links[0].textContent, "").trim();
    if (rest) return;
    const link = links[0];
    const label = el("span", "tsm-row-label");
    label.textContent = header.textContent.trim().replace(/\s+/g, " ");
    const original = el("span", "tsm-row-original");
    while (link.firstChild) original.append(link.firstChild);
    link.append(label, original);
    table.classList.add("tsm-row");
  }

  // A jqGrid box: the header row's labels caption each body row's cells so
  // the rows can be laid out as cards. Safe to call again as rows arrive.
  function decorateGrid(box) {
    const heads = [...(box.querySelector("table.ui-jqgrid-htable tr.ui-jqgrid-labels")?.children || [])];
    const btable = box.querySelector("table.ui-jqgrid-btable");
    if (!btable || !heads.length) return;
    btable.classList.add("tsm-cards");
    for (const r of btable.querySelectorAll(":scope > tbody > tr")) {
      if (r.classList.contains("tsm-cards-head") || r.classList.contains("tsm-card")) continue;
      if (r.classList.contains("jqgfirstrow")) {
        r.classList.add("tsm-cards-head");
        continue;
      }
      r.classList.add("tsm-card");
      let filled = 0;
      [...r.children].forEach((td, i) => {
        if (td.style.display === "none" || heads[i]?.style.display === "none") {
          td.classList.add("tsm-empty");
          return;
        }
        if (td.classList.contains("action_column")) td.classList.add("tsm-cards-action");
        else td.dataset.label = heads[i]?.textContent.trim() || "";
        if (isBlank(td)) td.classList.add("tsm-empty");
        else filled++;
      });
      if (!filled) r.classList.add("tsm-cards-blank");
    }
  }

  // Lays a management form out for a phone: each row of its data tables
  // becomes a card whose cells are captioned with their column headers.
  function decorateSubpage(roots) {
    const blank = isBlank;
    for (const root of roots) {
      root.classList.add("tsm-subpage");
      if (root.querySelector(".ui-jqgrid")) root.classList.add("tsm-grid");
      // spacer cells would each take a line once the rows stack
      for (const td of root.querySelectorAll("td")) if (blank(td)) td.classList.add("tsm-empty");
      for (const box of root.querySelectorAll(".ui-jqgrid")) decorateGrid(box);
      for (const table of root.querySelectorAll("table.data_list")) {
        const rows = [...table.querySelectorAll(":scope > tbody > tr")];
        const header = rows.find((r) => r.children.length && [...r.children].every((c) => c.tagName === "TH"));
        if (!header) continue;
        const labels = [...header.children].map((th) => th.textContent.trim().replace(/:$/, ""));
        table.classList.add("tsm-cards");
        header.classList.add("tsm-cards-head");
        for (const r of rows) {
          if (r === header) continue;
          const cells = [...r.children];
          if (cells.length !== labels.length) {
            r.classList.add(r.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING ? "tsm-cards-caption" : "tsm-cards-span");
            continue;
          }
          let filled = 0;
          cells.forEach((td, i) => {
            if (labels[i]) td.dataset.label = labels[i];
            else td.classList.add("tsm-cards-action");
            if (td.querySelector("select, input, textarea")) td.classList.add("tsm-cards-wide");
            if (!blank(td)) filled++;
          });
          if (!filled) r.classList.add("tsm-cards-blank");
        }
      }
    }
  }

  function decorateToolbar() {
    const viewSelect = document.getElementById("view_select");
    const row = viewSelect.closest("tr");
    if (!row) return;
    row.classList.add("tsm-toolbar");

    const viewCell = viewSelect.closest("td");
    viewCell.classList.add("tsm-toolbar-view");
    // Drop the bare "View:" text; the new dropdowns carry their own labels.
    for (const node of [...viewCell.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) node.remove();
    }
    // The original select stays (hidden) because the form posts its value.
    viewSelect.classList.add("tsm-hidden");
    buildViewPickers(viewSelect, viewCell);

    const monthSelect = document.getElementById("StartMonth");
    const yearSelect = document.getElementById("StartYear");
    const goButton = document.getElementById("submit_form");
    if (monthSelect) buildNavColumns(monthSelect, yearSelect);

    const legend = row.querySelector(".calendar-legend");
    if (legend) collapseLegend(legend);

    // The page's <form> is written inside a table row, so its controls are
    // only tied to it by a parser quirk. Tie them explicitly as well.
    const form = document.getElementById("calendar_select");
    if (form && form.id) {
      for (const control of [viewSelect, monthSelect, yearSelect, goButton]) {
        if (control && control.form !== form) control.setAttribute("form", form.id);
      }
    }

    for (const select of [monthSelect, yearSelect]) {
      select?.addEventListener("change", submitCalendar);
    }
  }

  function buildViewPickers(viewSelect, cell) {
    const options = [...viewSelect.options].map((o) => ({
      value: o.value,
      label: o.textContent.trim().replace(VIEW_PREFIX, ""),
      selected: o.selected,
    }));
    const common = options.filter((o) => COMMON_VIEWS.includes(o.label.toLowerCase()));
    const other = options.filter((o) => !common.includes(o));

    const wrap = el("div", "tsm-viewpick");
    const group = (labelText, opts) => {
      const box = el("div", "tsm-viewpick-group");
      const select = document.createElement("select");
      select.className = "tsm-viewselect";
      const placeholder = new Option("Choose a view…", "");
      placeholder.hidden = true;
      select.append(placeholder);
      for (const o of opts) select.append(new Option(o.label, o.value));
      const current = opts.find((o) => o.selected);
      select.value = current ? current.value : "";
      select.addEventListener("change", () => {
        if (!select.value) return;
        viewSelect.value = select.value;
        // Runs the page's own onchange, which points the form at this view.
        viewSelect.dispatchEvent(new Event("change", { bubbles: true }));
        submitCalendar();
      });
      box.append(el("label", "tsm-label", labelText), select);
      return box;
    };
    if (common.length) wrap.append(group("Common Schedule Views", common));
    if (other.length) {
      // The long list is rarely needed; keep it behind a small button unless
      // the page is already showing one of its views.
      const more = group("Other Schedule Views", other);
      more.classList.add("tsm-viewpick-more");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "tsm-more-toggle tsm-viewpick-toggle";
      toggle.textContent = "See more view options";
      toggle.setAttribute("aria-expanded", "false");
      const show = (on) => {
        more.hidden = !on;
        toggle.hidden = on;
        toggle.setAttribute("aria-expanded", String(on));
      };
      toggle.addEventListener("click", () => show(true));
      wrap.append(toggle, more);
      show(other.some((o) => o.selected));
    }
    cell.append(wrap);
  }

  // The month/year cell becomes two columns: the month picker with a
  // "Change year" link under it (the year picker appears on tap), and a
  // right column for the unit views' base picker with the colour-key link
  // under it.
  function buildNavColumns(monthSelect, yearSelect) {
    const cell = monthSelect.closest("td");
    if (!cell) return;
    cell.classList.add("tsm-toolbar-nav");
    const left = el("div", "tsm-nav-col tsm-nav-left");
    const right = el("div", "tsm-nav-col tsm-nav-right");
    left.append(monthSelect);
    if (yearSelect) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "tsm-more-toggle tsm-year-toggle";
      toggle.textContent = "Change year";
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", () => {
        yearSelect.hidden = false;
        toggle.hidden = true;
        toggle.setAttribute("aria-expanded", "true");
        yearSelect.focus();
      });
      yearSelect.hidden = true;
      left.append(toggle, yearSelect);
    }
    cell.prepend(left, right);
  }

  // The time-off colour key is rarely needed, so it waits behind a link
  // under the base picker and opens below the pickers.
  function collapseLegend(legend) {
    const cell = legend.closest("td") || legend.parentElement;
    cell.classList.add("tsm-toolbar-legend");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tsm-more-toggle tsm-legend-toggle";
    toggle.textContent = "Show color key";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      legend.hidden = false;
      cell.classList.add("tsm-legend-open");
      toggle.hidden = true;
      toggle.setAttribute("aria-expanded", "true");
    });
    legend.hidden = true;
    const right = document.querySelector(".tsm-nav-right");
    if (right) right.append(toggle);
    else legend.before(toggle);
  }

  // Same as pressing the page's Go button.
  function submitCalendar() {
    const go = document.getElementById("submit_form");
    if (go) {
      go.click();
      return;
    }
    const form = document.getElementById("calendar_select");
    if (form) form.requestSubmit();
  }

  function findUserName() {
    const lines = document.querySelectorAll("#ts_menus_user_div .ts_menus_user_div_line");
    for (const line of lines) {
      const m = line.textContent.match(/^\s*(.+?)\s*#\d+\s*$/);
      if (m) return m[1];
    }
    return null;
  }

  function whenUserNameKnown(callback) {
    let tries = 0;
    const attempt = () => {
      const name = findUserName();
      if (name) {
        callback(name);
        return;
      }
      if (++tries < 20) setTimeout(attempt, 500);
      else {
        diag.log("signed-in name not found in header");
        callback(null);
      }
    };
    attempt();
  }

  // ---- day cells ---------------------------------------------------------

  function decorateDays(month, days, isLocation, dispatch) {
    const monthName = (month.querySelector("td.monthname")?.textContent || "").trim().split(/\s+/)[0] || "";
    const todayCell = month.querySelector("td.today");
    let beforeToday = Boolean(todayCell);

    for (const td of days) {
      const dayNum = Number(td.id.slice(4));
      const weekday = WEEKDAYS[td.cellIndex] ?? "";

      if (td === todayCell) beforeToday = false;
      if (beforeToday) td.classList.add("tsm-past");
      if (td === todayCell) td.classList.add("tsm-today");

      // Keep any inline tint the site applied (time-off, holiday) as an accent
      // instead of a full-cell background.
      if (td.style.backgroundColor) td.style.setProperty("--tsm-tint", td.style.backgroundColor);

      const head = el("div", "tsm-dayhead");
      head.append(
        el("span", "tsm-weekday", weekday.slice(0, 3)),
        el("span", "tsm-daynum", String(dayNum)),
        el("span", "tsm-daylong", `${weekday}, ${monthName} ${dayNum}`),
      );

      const numberNode = [...td.childNodes].find(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== "",
      );
      if (numberNode) numberNode.replaceWith(head);
      else td.prepend(head);

      if (isLocation) decorateLocationDay(td, dispatch);
      else decorateAgendaDay(td);
    }
  }

  function decorateAgendaDay(td) {
    const content = td.querySelector("table.eventcontent");
    if (!content) {
      td.classList.add("tsm-empty");
      return;
    }
    const shifts = [...content.querySelectorAll(":scope > tbody > tr > td > table")];
    if (shifts.length === 0 && content.textContent.trim() === "") {
      td.classList.add("tsm-empty");
      return;
    }
    for (const shift of shifts) {
      shift.classList.add("tsm-shift");
      for (const tr of shift.querySelectorAll(":scope > tbody > tr")) {
        if (tr.textContent.trim() === "") tr.classList.add("tsm-spacer");
        else if (tr.querySelector("td[colspan]")) tr.classList.add("tsm-shift-details");
        else tr.classList.add("tsm-shift-main");
      }
    }
  }

  function decorateLocationDay(td, dispatch) {
    const content = td.querySelector("table.eventcontent");
    if (!content) {
      td.classList.add("tsm-empty");
      return;
    }
    let openCount = 0;
    const units = content.querySelectorAll(":scope > tbody > tr");
    for (const unit of units) {
      unit.classList.add("tsm-unit");
      // Each heading (a unit row can carry a second one, "MED A-24 (MED
      // A-24)" under "A24 (MED A-24)") loses a repeated name ("Alpha 1
      // (Alpha 1)" is "Alpha 1") and, on the Dispatch view, its
      // "Communications-" prefix ("Communications-Night" is "Night"); the
      // full text stays on the element.
      for (const heading of unit.querySelectorAll("div.location")) {
        if (heading.dataset.tsmFull || heading.childNodes.length !== 1 || heading.firstChild.nodeType !== Node.TEXT_NODE) continue;
        const full = tidy(heading.textContent);
        let label = full;
        const m = /^(.*?)\s*\((.*)\)$/.exec(full);
        if (m && m[1] === m[2]) label = m[1];
        if (dispatch) label = label.replace(/^comm\w*\s*[-–:]?\s*/i, "").trim() || label;
        if (label !== full) {
          heading.dataset.tsmFull = full;
          heading.textContent = label;
        }
      }
      const open = unit.querySelectorAll("tr.unassigned").length;
      if (open > 0) unit.classList.add("tsm-has-open");
      openCount += open;
    }
    td.dataset.open = String(openCount);
    if (units.length === 0) td.classList.add("tsm-empty");
  }

  // The Dispatch unit view: picked in the view dropdown, or named by the
  // template id in the address the dropdown's option points at.
  function isDispatchView() {
    const select = document.getElementById("view_select");
    const option = select && [...select.options].find((o) => /dispatch/i.test(o.text));
    if (!option) return false;
    const id = new URL(option.value, location.href).searchParams.get("template_id");
    return option.selected || (id !== null && new URLSearchParams(location.search).get("template_id") === id);
  }

  // Marks the dispatchers whose shift contains the current time, and keeps
  // the marks current. A shift that started yesterday and runs past midnight
  // counts too; the site lists it under yesterday, so today gets a note.
  function markOnNow(days) {
    const clock = serverClock();
    const onAt = (td, minutes) => [...td.querySelectorAll("tr.employee")].filter((tr) => {
      const range = parseRange(timeOf(tr));
      return range && range.start <= minutes && minutes < range.end;
    });
    const apply = () => {
      const now = new Date(clock());
      const minutes = now.getHours() * 60 + now.getMinutes();
      for (const tr of document.querySelectorAll("tr.tsm-on-now")) tr.classList.remove("tsm-on-now");
      for (const unit of document.querySelectorAll(".tsm-unit-on-now")) unit.classList.remove("tsm-unit-on-now");
      document.querySelector(".tsm-on-now-note")?.remove();
      const todayIndex = days.findIndex((td) => td.classList.contains("today"));
      if (todayIndex < 0) return;
      const mark = (tr) => {
        tr.classList.add("tsm-on-now");
        tr.closest(".tsm-unit")?.classList.add("tsm-unit-on-now");
      };
      onAt(days[todayIndex], minutes).forEach(mark);
      const sinceYesterday = todayIndex > 0 ? onAt(days[todayIndex - 1], minutes + 24 * 60) : [];
      sinceYesterday.forEach(mark);
      if (sinceYesterday.length) {
        const note = el("div", "tsm-on-now-note");
        note.append(el("span", "tsm-on-now-badge", "On now"), " since yesterday");
        for (const tr of sinceYesterday) {
          note.append(el("div", "tsm-on-now-line", `${tidy(tr.querySelector("td")?.textContent || "")} \u00b7 ${unitName(tr.closest(".tsm-unit"))} \u00b7 ${timeOf(tr)}`));
        }
        const content = days[todayIndex].querySelector("table.eventcontent");
        if (content) content.before(note);
        else days[todayIndex].prepend(note);
      }
      diag.log(`on now: ${document.querySelectorAll("tr.tsm-on-now").length} dispatcher(s) at ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    };
    apply();
    setInterval(apply, 60 * 1000);
  }

  // Flags the signed-in person's own slots. Returns the count per day.
  function markMine(days, userName) {
    const me = nameKey(userName);
    return days.map((td) => {
      let count = 0;
      for (const slot of td.querySelectorAll("tr.employee")) {
        const cell = slot.querySelector("td");
        if (cell && nameKey(cell.textContent) === me) {
          slot.classList.add("tsm-mine-slot");
          slot.closest(".tsm-unit")?.classList.add("tsm-mine");
          count += 1;
        }
      }
      for (const row of td.querySelectorAll(".tsm-carry")) {
        if (nameKey(row.dataset.name || "") === me) row.classList.add("tsm-carry-mine");
      }
      td.dataset.mine = String(count);
      return count;
    });
  }

  // ---- location view: seats that run through midnight -------------------

  // The site files a seat under the day it starts, so the partner who joins
  // an overnight seat at midnight is listed under the next day. Each unit
  // gets the neighbouring days' seats that overlap its own, tagged with the
  // day they are listed under, and a seat that is accompanied for only part
  // of its hours gets a line for the hours with no one beside it.
  function carryOvernight(days) {
    const seatsOf = (unit, shift) => [...unit.querySelectorAll("table.shifts > tbody > tr")]
      .map((tr) => {
        const time = timeOf(tr);
        const r = parseRange(time);
        return { tr, time, range: r && { start: r.start + shift, end: r.end + shift } };
      })
      .filter((s) => s.range);
    days.forEach((td, i) => {
      for (const unit of td.querySelectorAll(".tsm-unit")) {
        const own = seatsOf(unit, 0);
        if (own.length === 0) continue;
        const heading = unitHeading(unit);
        const carried = [];
        for (const [d, shift] of [[i - 1, -DAY_MIN], [i + 1, DAY_MIN]]) {
          if (!days[d]) continue;
          for (const other of days[d].querySelectorAll(".tsm-unit")) {
            if (unitHeading(other) !== heading) continue;
            for (const s of seatsOf(other, shift)) {
              if (own.some((o) => overlap(o.range, s.range) > 0)) carried.push({ ...s, td: days[d] });
            }
          }
        }
        for (const s of own) {
          const covers = [...own.filter((o) => o !== s), ...carried].map((o) => o.range).filter((r) => overlap(r, s.range) > 0);
          if (covers.length === 0) continue;
          let after = s.tr.closest("table.shifts");
          for (const g of uncovered(s.range, covers)) {
            const line = el("div", "tsm-gap");
            line.append(el("span", "tsm-gap-label", "no partner"), el("span", "tsm-gap-time", rangeText(g, s.time)));
            after.after(line);
            after = line;
          }
        }
        const cell = unit.querySelector(":scope > td") || unit;
        for (const s of carried) {
          const name = tidy(s.tr.querySelector("td")?.textContent || "");
          const row = el("div", "tsm-carry");
          row.dataset.name = name;
          const who = el("span", "tsm-carry-name", name);
          who.append(el("span", "tsm-carry-day", `${WEEKDAYS[s.td.cellIndex].slice(0, 3)} ${s.td.id.slice(4)}`));
          row.append(who, el("span", "tsm-carry-time", s.time));
          cell.append(row);
        }
      }
    });
  }

  // Employee cells carry role tags inside the name ("Thomas-PB Cahill",
  // "Katherine- PB/FTO Fields"); compare only the first and last words.
  function nameKey(text) {
    const words = cleanName(text).split(/\s+/);
    if (words.length < 2) return words[0] || "";
    const first = words[0].split("-")[0];
    const last = words[words.length - 1].replace(/[^a-z'’]/g, "");
    return `${first} ${last}`;
  }

  function cleanName(text) {
    return text.replace(/ /g, " ").trim().toLowerCase();
  }

  // Words of a name, with role tags split off: "Katherine- PB/FTO Fields"
  // becomes ["katherine", "pb", "fto", "fields"].
  function nameTokens(text) {
    return cleanName(text).split(/[\s\-\/,.]+/).filter(Boolean);
  }

  // ---- agenda view (your own shifts) ------------------------------------

  function addTodayButton(month) {
    const today = month.querySelector("td.today");
    if (!today) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tsm-fab";
    btn.textContent = "Today";
    btn.addEventListener("click", () => {
      today.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    document.body.append(btn);
  }

  // ---- agenda view: base filter ------------------------------------------

  // The same Base dropdown as the unit views, beside the month picker,
  // keyed off each shift's unit name; a base leaves only your shifts there
  // and days left without one fold up like free days. Every page load
  // starts on all bases.
  function buildAgendaBaseFilter(days) {
    const right = document.querySelector(".tsm-nav-right");
    if (!right) return;
    const counts = new Map();
    const shifts = [];
    for (const td of days) {
      td.dataset.tsmBlank = td.classList.contains("tsm-empty") ? "1" : "";
      for (const table of td.querySelectorAll("table.tsm-shift")) {
        const base = baseOfUnit(tidy(table.querySelector("tr.tsm-shift-main td")?.textContent || ""));
        table.dataset.tsmBase = base.toLowerCase();
        if (base) counts.set(base, (counts.get(base) || 0) + 1);
        shifts.push(table);
      }
    }
    if (shifts.length === 0) return;
    const names = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
    const select = document.createElement("select");
    select.className = "tsm-baseselect";
    select.setAttribute("aria-label", "Show only your shifts at this base");
    select.append(new Option("All bases", ""));
    for (const n of names) select.append(new Option(n, n.toLowerCase()));
    const setBase = (key) => {
      if (key) html.dataset.tsmBase = key;
      else delete html.dataset.tsmBase;
      select.value = key;
      for (const table of shifts) table.classList.toggle("tsm-base-match", !key || table.dataset.tsmBase === key);
      for (const td of days) {
        td.classList.toggle("tsm-empty", td.dataset.tsmBlank === "1" || !td.querySelector(key ? "table.tsm-shift.tsm-base-match" : "table.tsm-shift"));
      }
    };
    select.addEventListener("change", () => setBase(select.value));
    right.prepend(select);
    setBase("");
  }

  // "Alpha 3W (A-58)" is at Alpha and "MWT-W1" at MWT: the first word of
  // the name, before any space or hyphen.
  function baseOfUnit(text) {
    return (text.replace(/\s*\(.*\)$/, "").split(/[\s-]/)[0] || "").trim();
  }

  // ---- agenda view: crew on each of your shifts --------------------------

  // Adds a crew line to every shift card, then fills it in from the unit
  // views: who shares the unit for those hours, or that the seat is open,
  // with a "See spares" list of others working then without a partner.
  async function loadCrew(days) {
    const shifts = [];
    for (const td of days) {
      for (const table of td.querySelectorAll("table.tsm-shift")) {
        const main = table.querySelector("tr.tsm-shift-main");
        const time = tidy(main?.querySelector("td.timerange")?.textContent || "");
        const range = parseRange(time);
        if (!main || !range) continue;
        const row = el("tr", "tsm-shift-crew");
        const cell = document.createElement("td");
        cell.colSpan = 2;
        cell.append(el("span", "tsm-crew-note", "Checking crew…"));
        row.append(cell);
        main.after(row);
        shifts.push({ td, table, cell, day: Number(td.id.slice(4)), unit: tidy(main.querySelector("td")?.textContent || ""), time, range, past: td.classList.contains("tsm-past") });
      }
    }
    if (shifts.length === 0) return;

    const user = await new Promise((resolve) => whenUserNameKnown(resolve));
    const me = user ? nameKey(user) : null;
    const unmatched = () => shifts.filter((s) => !s.unit_match);
    const views = [];
    let failed = 0;
    for (const label of CREW_VIEWS) {
      if (unmatched().length === 0) break;
      try {
        const view = await fetchUnitView(label);
        if (!view) continue;
        views.push(view);
        for (const s of unmatched()) {
          s.unit_match = findUnit(view, s, me);
          if (s.unit_match) s.view = view;
        }
        diag.log(`crew: ${label} view loaded, ${unmatched().length} shifts still unmatched`);
      } catch (e) {
        failed += 1;
        diag.log(`crew: ${label} view failed: ${e && e.message ? e.message : e}`);
      }
    }

    for (const s of shifts) {
      s.cell.replaceChildren();
      if (!s.unit_match) {
        s.cell.append(el("span", "tsm-crew-note", views.length === 0 && failed ? "Couldn't load the unit views." : "Crew not shown in the unit views."));
        continue;
      }
      const crew = crewOf(s.view, s.day, s.unit_match, s.range, me);
      const partners = crew.filter((c) => !c.open);
      const open = crew.filter((c) => c.open);
      const gaps = crew.length ? uncovered(s.range, crew.map((c) => c.range)) : [];
      const lines = [
        ...partners.map((c) => ({ start: c.range.start, node: crewLine("with", c, s.range) })),
        ...open.map((c) => ({ start: c.range.start, node: crewLine("open seat", c, s.range) })),
        ...gaps.map((g) => ({ start: g.start, node: gapLine(g, crew[0].time) })),
      ];
      lines.sort((a, b) => a.start - b.start);
      for (const l of lines) s.cell.append(l.node);
      if (crew.length === 0) s.cell.append(el("span", "tsm-crew-note", "No one else on this unit."));
      if (!s.past && (open.length > 0 || partners.length === 0 || gaps.length > 0)) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tsm-spares-btn";
        btn.textContent = "See spares";
        btn.setAttribute("aria-expanded", "false");
        btn.addEventListener("click", () => toggleSpares(s, btn, views, me));
        s.cell.append(btn);
      }
    }
  }

  function crewLine(label, c, range) {
    const line = el("div", c.open ? "tsm-crew tsm-crew-open" : "tsm-crew");
    line.append(el("span", "tsm-crew-label", label), el("span", "tsm-crew-name", c.name));
    if (c.range && (c.range.start !== range.start || c.range.end !== range.end)) line.append(el("span", "tsm-crew-time", c.time));
    return line;
  }

  // A stretch of the shift with no seat beside yours, not even an open one.
  function gapLine(gap, like) {
    const line = el("div", "tsm-crew tsm-crew-gap");
    line.append(el("span", "tsm-crew-label", "no partner"), el("span", "tsm-crew-time", rangeText(gap, like)));
    return line;
  }

  function toggleSpares(s, btn, views, me) {
    let panel = s.table.querySelector("tr.tsm-shift-spares");
    if (panel) {
      panel.remove();
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "See spares";
      return;
    }
    panel = el("tr", "tsm-shift-spares");
    const cell = document.createElement("td");
    cell.colSpan = 2;
    const spares = sparesFor(views, s.day, s.range, me);
    cell.append(el("div", "tsm-spares-title", spares.length === 0
      ? "No one else is working these hours without a partner."
      : `${spares.length} without a partner during these hours`));
    for (const sp of spares) {
      const row = el("div", "tsm-spare");
      const top = el("div", "tsm-spare-line");
      top.append(el("span", "tsm-spare-name", sp.name), el("span", "tsm-spare-time", sp.time));
      const sub = el("div", "tsm-spare-sub");
      sub.append(el("span", "tsm-spare-unit", sp.unit), el("span", "tsm-spare-overlap", `${hoursText(sp.overlap)} together`));
      row.append(top, sub);
      cell.append(row);
    }
    panel.append(cell);
    s.table.querySelector("tr.tsm-shift-crew").after(panel);
    btn.setAttribute("aria-expanded", "true");
    btn.textContent = "Hide spares";
  }

  function hoursText(minutes) {
    const h = minutes / 60;
    return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
  }

  // Loads a unit view for the month shown, the way the Go button does, and
  // returns { label, days: { [dayNumber]: [unit] } }. Parsed results are kept
  // for a few minutes so flipping between views does not reload them.
  async function fetchUnitView(label) {
    const viewSelect = document.getElementById("view_select");
    const option = viewSelect && [...viewSelect.options].find((o) => o.textContent.trim().replace(VIEW_PREFIX, "").toLowerCase() === label);
    if (!option) return null;
    const form = document.getElementById("calendar_select");
    const month = document.getElementById("StartMonth")?.value || "";
    const year = document.getElementById("StartYear")?.value || "";
    const cacheKey = `tsm.view.${label}.${year}-${month}`;
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (cached && Date.now() - cached.at < CREW_CACHE_MS) return { label, days: cached.days };
    } catch {
      // no cache available; load the view
    }
    const body = form ? new FormData(form) : new FormData();
    body.set("view_select", option.value);
    if (month) body.set("cal_start_month", month);
    if (year) body.set("cal_start_year", year);
    const res = await fetch(new URL(option.value, location.href), { method: "POST", body, credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const days = parseUnitView(doc);
    if (Object.keys(days).length === 0) throw new Error("no calendar in response");
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), days }));
    } catch {
      // storage full or unavailable; fine
    }
    return { label, days };
  }

  function parseUnitView(doc) {
    const days = {};
    for (const td of doc.querySelectorAll('table.month td[id^="day_"]')) {
      const units = [];
      for (const tr of td.querySelectorAll("table.eventcontent > tbody > tr")) {
        const heading = tidy(tr.querySelector("div.location")?.textContent || "");
        if (!heading) continue;
        const m = /^(.*?)\s*\((.*)\)$/.exec(heading);
        const slots = [...tr.querySelectorAll("table.shifts > tbody > tr")].map((row) => {
          const open = !row.classList.contains("employee");
          const text = tidy((open ? row.querySelector("span.hightlight") : row.querySelector("td"))?.textContent || "");
          return { who: open ? text.replace(/\s*open$/i, "") || "Open" : text, time: timeOf(row), open, requestable: row.classList.contains("unassigned") };
        });
        units.push({ name: m ? m[1] : heading, label: m ? m[2] : "", slots });
      }
      days[Number(td.id.slice(4))] = units;
    }
    return days;
  }

  // The unit in a view that carries this shift: same unit name (either half
  // of "Alpha 8 (Alpha 8)" / "MED A-24 (A-28)") with hours that overlap, or
  // failing that any unit listing you for those hours.
  function findUnit(view, shift, me) {
    const units = view.days[shift.day] || [];
    const m = /^(.*?)\s*\((.*)\)$/.exec(shift.unit);
    const wanted = new Set([m ? m[1] : shift.unit, m ? m[2] : ""].filter(Boolean).map((t) => t.toLowerCase()));
    const overlapping = (u) => u.slots.some((x) => overlap(parseRange(x.time), shift.range) > 0);
    return units.find((u) => (wanted.has(u.name.toLowerCase()) || wanted.has(u.label.toLowerCase())) && overlapping(u))
      || (me && units.find((u) => u.slots.some((x) => !x.open && nameKey(x.who) === me && overlap(parseRange(x.time), shift.range) > 0)))
      || null;
  }

  function crewOf(view, day, unit, range, me) {
    const out = [];
    for (const x of unitSeats(view, day, unit)) {
      if (overlap(x.range, range) <= 0) continue;
      if (!x.open && me && nameKey(x.who) === me) continue;
      out.push({ name: x.who, time: x.time, range: x.range, open: x.open, requestable: x.requestable });
    }
    return out;
  }

  // A unit's seats on one day together with its seats on the days either
  // side, timed on this day's clock (yesterday's 10:00pm is -2:00, tomorrow's
  // 12:00am is 24:00), so the pieces of an overnight shift line up. The site
  // files a seat under the day it starts, so a partner who joins after
  // midnight is listed on the next day.
  function unitSeats(view, day, unit) {
    const out = [];
    for (const [d, shift] of [[day - 1, -DAY_MIN], [day, 0], [day + 1, DAY_MIN]]) {
      for (const u of view.days[d] || []) {
        if (!sameUnit(u, unit)) continue;
        for (const x of u.slots) {
          const r = parseRange(x.time);
          out.push({ ...x, range: r && { start: r.start + shift, end: r.end + shift } });
        }
      }
    }
    return out;
  }

  function sameUnit(a, b) {
    return a.name.toLowerCase() === b.name.toLowerCase() && a.label.toLowerCase() === b.label.toLowerCase();
  }

  // Everyone else whose hours overlap these, on this day or on a neighbouring
  // day's overnight piece, who has no other employee on their unit for their
  // own hours.
  function sparesFor(views, day, range, me) {
    const seen = new Set();
    const out = [];
    for (const view of views) {
      const units = [];
      for (const d of [day - 1, day, day + 1]) {
        for (const u of view.days[d] || []) if (!units.some((v) => sameUnit(v, u))) units.push(u);
      }
      for (const unit of units) {
        const seats = unitSeats(view, day, unit);
        for (const x of seats) {
          if (x.open || (me && nameKey(x.who) === me)) continue;
          const together = overlap(x.range, range);
          if (together <= 0) continue;
          const partnered = seats.some((y) => y !== x && !y.open && overlap(y.range, x.range) > 0);
          if (partnered) continue;
          const key = `${unit.name}|${unit.label}|${x.who}|${x.range.start}|${x.range.end}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const unitText = unit.label && unit.label.toLowerCase() !== unit.name.toLowerCase() ? `${unit.name} (${unit.label})` : unit.name;
          out.push({ name: x.who, unit: unitText, time: x.time, range: x.range, overlap: together });
        }
      }
    }
    out.sort((a, b) => b.overlap - a.overlap || a.range.start - b.range.start || a.name.localeCompare(b.name));
    return out;
  }

  function overlap(a, b) {
    if (!a || !b) return 0;
    return Math.min(a.end, b.end) - Math.max(a.start, b.start);
  }

  // ---- location view (every unit, one day at a time) --------------------

  function buildPager(month, days) {
    const pager = el("div", "tsm-pager");
    // The toolbar's month picker already names the month; the title repeats
    // it only on pages without one.
    const title = document.getElementById("StartMonth") ? null : el("div", "tsm-pager-title", (month.querySelector("td.monthname")?.textContent || "").trim());

    // A week of day chips edge to edge; the strip scrolls for the rest.
    const nav = el("div", "tsm-nav");
    const strip = el("div", "tsm-strip");
    nav.append(strip);

    const search = el("div", "tsm-search");
    const field = el("div", "tsm-search-field");
    const input = document.createElement("input");
    input.type = "search";
    input.className = "tsm-search-input";
    input.placeholder = "Find a person";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Show only units with this person");
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "tsm-search-clear";
    clear.textContent = "×";
    clear.setAttribute("aria-label", "Clear person filter");
    field.append(input, clear);
    const calBtn = document.createElement("button");
    calBtn.type = "button";
    calBtn.className = "tsm-calbtn";
    calBtn.textContent = "Calendar";
    calBtn.setAttribute("aria-pressed", "false");
    calBtn.setAttribute("aria-label", "Show this person's month as a calendar");
    // Only useful once a name is typed.
    calBtn.hidden = true;
    search.append(field, calBtn);

    const status = el("div", "tsm-status");

    pager.append(...(title ? [title] : []), nav, search, status);
    month.parentNode.insertBefore(pager, month);

    // Base filter: a dropdown of the units' leading names ("Alpha 3W" and
    // "Alpha 3" are at Alpha, "MWT-W1" at MWT), most units first, in the
    // toolbar row with the month and year pickers. It is left out when the
    // month has only one group.
    const baseCounts = new Map();
    for (const td of days) {
      for (const unit of td.querySelectorAll(".tsm-unit")) {
        const base = baseOfUnit(unitHeading(unit));
        unit.dataset.tsmBase = base.toLowerCase();
        if (base) baseCounts.set(base, (baseCounts.get(base) || 0) + 1);
      }
    }
    const baseNames = [...baseCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
    const baseSelect = document.createElement("select");
    baseSelect.className = "tsm-baseselect";
    baseSelect.setAttribute("aria-label", "Show only units at this base");
    baseSelect.append(new Option("All bases", ""));
    for (const n of baseNames) baseSelect.append(new Option(n, n.toLowerCase()));
    baseSelect.addEventListener("change", () => setBase(baseSelect.value));
    if (baseNames.length > 1) {
      const right = document.querySelector(".tsm-nav-right");
      if (right) right.prepend(baseSelect);
      else pager.insertBefore(baseSelect, nav);
    }

    // Month grid for the person being searched for, shown in place of the
    // day strip and unit list while data-tsm-cal is on.
    const cal = el("div", "tsm-cal");
    const calCaption = el("div", "tsm-cal-caption");
    const grid = el("div", "tsm-cal-grid");
    for (const wd of WEEKDAYS) grid.append(el("div", "tsm-cal-wd", wd.slice(0, 2)));
    for (let i = 0; i < (days[0]?.cellIndex ?? 0); i++) grid.append(el("div", "tsm-cal-blank"));
    const calDays = days.map((td, i) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "tsm-cal-day";
      if (td.classList.contains("tsm-today")) cell.classList.add("tsm-cal-today");
      if (td.classList.contains("tsm-past")) cell.classList.add("tsm-cal-past");
      cell.append(el("span", "tsm-cal-num", td.id.slice(4)), el("span", "tsm-cal-dots"));
      cell.addEventListener("click", () => openPopup(i));
      grid.append(cell);
      return cell;
    });
    const pop = el("div", "tsm-pop");
    pop.hidden = true;
    cal.append(calCaption, grid);
    month.parentNode.insertBefore(cal, month);

    const chips = days.map((td) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tsm-chip";
      if (td.classList.contains("tsm-today")) chip.classList.add("tsm-chip-today");
      if (td.classList.contains("tsm-past")) chip.classList.add("tsm-chip-past");
      const open = Number(td.dataset.open || 0);
      chip.append(
        el("span", "tsm-chip-wd", (WEEKDAYS[td.cellIndex] || "").slice(0, 2)),
        el("span", "tsm-chip-num", td.id.slice(4)),
      );
      if (open) chip.append(el("span", "tsm-chip-open", String(open)));
      const nameBadge = el("span", "tsm-chip-name");
      nameBadge.hidden = true;
      chip.append(nameBadge);
      chip.addEventListener("click", () => select(days.indexOf(td)));
      strip.append(chip);
      return chip;
    });

    // Crew slots per day, tokenised once for the person filter.
    const slotsByDay = days.map((td, i) =>
      [...td.querySelectorAll("tr.employee")].map((tr) => {
        const name = tidy(tr.querySelector("td")?.textContent || "");
        const time = timeOf(tr);
        return { tr, day: i, unit: tr.closest(".tsm-unit"), name, time, range: parseRange(time), tokens: nameTokens(name) };
      }),
    );
    const matchesByDay = days.map(() => 0);
    const hitsByDay = days.map(() => []);
    let query = "";
    let current = -1;
    let popDay = -1;
    let userKnown = false;

    function select(index, { scroll = true } = {}) {
      if (index < 0 || index >= days.length) return;
      if (current >= 0) {
        days[current].classList.remove("tsm-selected");
        chips[current].classList.remove("tsm-chip-selected");
      }
      current = index;
      days[current].classList.add("tsm-selected");
      chips[current].classList.add("tsm-chip-selected");
      chips[current].scrollIntoView({ inline: "center", block: "nearest", behavior: scroll ? "smooth" : "instant" });
      updateStatus();
    }

    // Shows only that base's units; the day chips' open counts follow.
    function setBase(key) {
      if (key) html.dataset.tsmBase = key;
      else delete html.dataset.tsmBase;
      baseSelect.value = key;
      days.forEach((td, i) => {
        let open = 0;
        for (const unit of td.querySelectorAll(".tsm-unit")) {
          const match = !key || unit.dataset.tsmBase === key;
          unit.classList.toggle("tsm-base-match", match);
          if (match) open += unit.querySelectorAll("tr.unassigned").length;
        }
        td.dataset.openShown = String(open);
        let badge = chips[i].querySelector(".tsm-chip-open");
        if (open && !badge) {
          badge = el("span", "tsm-chip-open");
          chips[i].querySelector(".tsm-chip-num").after(badge);
        }
        if (badge) {
          badge.textContent = String(open);
          badge.hidden = open === 0;
        }
      });
      updateStatus();
    }

    // Every word typed must start a word of the name, so "bob smi" finds
    // "Bob-PB Smith" and "smith" alone finds every Smith.
    function applyNameFilter(text) {
      query = text.trim();
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length > 0) html.dataset.tsmName = "on";
      else delete html.dataset.tsmName;
      search.classList.toggle("tsm-search-active", words.length > 0);
      calBtn.hidden = words.length === 0;
      if (words.length === 0 && html.dataset.tsmCal) setCalendarMode(false);

      let total = 0;
      days.forEach((td, i) => {
        let count = 0;
        const matchedUnits = new Set();
        hitsByDay[i] = [];
        for (const slot of slotsByDay[i]) {
          const hit = words.length > 0 && words.every((w) => slot.tokens.some((t) => t.startsWith(w)));
          slot.tr.classList.toggle("tsm-match-slot", hit);
          if (hit) {
            count += 1;
            matchedUnits.add(slot.unit);
            hitsByDay[i].push(slot);
          }
        }
        for (const unit of td.querySelectorAll(".tsm-unit")) {
          unit.classList.toggle("tsm-match", matchedUnits.has(unit));
        }
        matchesByDay[i] = count;
        total += count;
        const badge = chips[i].querySelector(".tsm-chip-name");
        badge.hidden = !(words.length > 0 && count > 0);
        badge.textContent = String(count);
        chips[i].classList.toggle("tsm-chip-has-match", count > 0);
      });

      refreshCalendar();

      // Jump to the first day that has this person if the current one doesn't.
      if (words.length > 0 && total > 0 && matchesByDay[current] === 0) {
        const after = matchesByDay.findIndex((n, i) => n > 0 && i > current);
        select(after >= 0 ? after : matchesByDay.findIndex((n) => n > 0));
        return;
      }
      updateStatus();
    }

    // The status line shows only while a name is being searched or the
    // list is empty.
    function updateStatus() {
      if (current < 0) return;
      const td = days[current];
      const units = td.querySelectorAll(".tsm-unit");
      const visible = [...units].filter((u) => u.offsetParent !== null).length;
      const base = html.dataset.tsmBase || "";
      const baseLabel = base ? baseSelect.selectedOptions[0]?.textContent || base : "";
      const pool = [...units].filter((u) => !base || u.classList.contains("tsm-base-match"));
      const parts = [];
      if (query) {
        const total = matchesByDay.reduce((a, b) => a + b, 0);
        const dayCount = matchesByDay.filter((n) => n > 0).length;
        parts.push(total === 0
          ? `No one matching “${query}” this month.`
          : `“${query}”: ${total} shift${total === 1 ? "" : "s"} on ${dayCount} day${dayCount === 1 ? "" : "s"} this month.`);
      }
      if (units.length === 0) parts.push("Nothing scheduled.");
      else if (pool.length === 0) parts.push(`No ${baseLabel} units on this day.`);
      else if (visible === 0 && query && matchesByDay[current] === 0) parts.push("Not on this day.");
      else if (query) parts.push(`On ${visible} unit${visible === 1 ? "" : "s"} this day.`);
      status.textContent = parts.join(" ");
      status.hidden = parts.length === 0;
    }

    function setCalendarMode(on) {
      if (on) html.dataset.tsmCal = "on";
      else delete html.dataset.tsmCal;
      calBtn.classList.toggle("tsm-calbtn-active", on);
      calBtn.setAttribute("aria-pressed", String(on));
      calBtn.textContent = on ? "List" : "Calendar";
      if (on) {
        refreshCalendar();
        if (!query) input.focus();
      } else {
        closePopup();
        if (current >= 0) select(current, { scroll: false });
      }
    }

    // Redraws the dots from hitsByDay and the caption above the grid.
    function refreshCalendar() {
      closePopup();
      days.forEach((td, i) => {
        const n = hitsByDay[i].length;
        const cell = calDays[i];
        const dots = cell.querySelector(".tsm-cal-dots");
        dots.replaceChildren();
        if (n > 3) dots.append(el("span", "tsm-cal-count", String(n)));
        else for (let k = 0; k < n; k++) dots.append(el("i", "tsm-cal-dot"));
        cell.classList.toggle("tsm-cal-has", n > 0);
        cell.setAttribute("aria-label", `${dayLabel(td)}: ${n} shift${n === 1 ? "" : "s"}`);
      });
      const total = matchesByDay.reduce((a, b) => a + b, 0);
      const dayCount = matchesByDay.filter((n) => n > 0).length;
      if (!query) calCaption.textContent = "Type a name above to see their shifts on the calendar.";
      else if (total === 0) calCaption.textContent = `No one matching “${query}” this month.`;
      else calCaption.textContent = `“${query}”: ${total} shift${total === 1 ? "" : "s"} on ${dayCount} day${dayCount === 1 ? "" : "s"}. Tap a day for details.`;
    }

    // Card with that day's shifts, opened in the grid under the tapped day's
    // row so the rows below move down and stay tappable.
    function openPopup(i) {
      const td = days[i];
      const cell = calDays[i];
      if (popDay >= 0) calDays[popDay].classList.remove("tsm-cal-active");
      popDay = i;
      cell.classList.add("tsm-cal-active");
      select(i, { scroll: false });

      const head = el("div", "tsm-pop-head");
      const close = document.createElement("button");
      close.type = "button";
      close.className = "tsm-pop-close";
      close.textContent = "×";
      close.setAttribute("aria-label", "Close");
      close.addEventListener("click", closePopup);
      head.append(el("div", "tsm-pop-title", dayLabel(td)), close);
      pop.replaceChildren(head);

      const hits = hitsByDay[i];
      if (hits.length === 0) {
        pop.append(el("div", "tsm-pop-empty", query ? `No shifts for “${query}” on this day.` : "Type a name above to see their shifts."));
      }
      for (const slot of hits) pop.append(renderShift(slot));

      const go = document.createElement("button");
      go.type = "button";
      go.className = "tsm-pop-go";
      go.textContent = "See this day ›";
      go.addEventListener("click", () => setCalendarMode(false));
      pop.append(go);

      pop.remove();
      const items = [...grid.children];
      const rowEnd = Math.min(items.length - 1, items.indexOf(cell) + 6 - ((items.indexOf(cell) - WEEKDAYS.length) % 7));
      items[rowEnd].after(pop);
      pop.hidden = false;
      pop.style.setProperty("--tsm-caret", `${cell.offsetLeft - pop.offsetLeft + cell.offsetWidth / 2}px`);
      pop.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function closePopup() {
      if (popDay >= 0) calDays[popDay].classList.remove("tsm-cal-active");
      popDay = -1;
      pop.hidden = true;
    }

    function renderShift(slot) {
      const row = el("div", "tsm-pop-shift");
      const line = el("div", "tsm-pop-line");
      line.append(el("span", "tsm-pop-unit", unitName(slot.unit)), el("span", "tsm-pop-time", slot.time));
      row.append(line);
      const crew = crewFor(slot);
      if (crew.length === 0) row.append(el("div", "tsm-pop-with tsm-pop-solo", "No one else on this unit"));
      const items = crew.map((c) => ({ start: c.range ? c.range.start : slot.range?.start ?? 0, c }));
      if (crew.length && slot.range) {
        for (const g of uncovered(slot.range, crew.map((c) => c.range))) items.push({ start: g.start, gap: g });
      }
      items.sort((a, b) => a.start - b.start);
      for (const { c, gap } of items) {
        if (gap) {
          const w = el("div", "tsm-pop-with tsm-pop-gap");
          w.append(el("span", "tsm-pop-with-label", "no partner"), el("span", "tsm-pop-with-time", rangeText(gap, slot.time)));
          row.append(w);
          continue;
        }
        const w = el("div", c.open ? "tsm-pop-with tsm-pop-open" : "tsm-pop-with");
        w.append(el("span", "tsm-pop-with-label", c.open ? "open seat" : "with"), el("span", "tsm-pop-with-name", c.name));
        if (c.time !== slot.time) w.append(el("span", "tsm-pop-with-time", c.time));
        if (c.requestable) w.append(el("span", "tsm-pop-tag", "you can request"));
        row.append(w);
      }
      return row;
    }

    // The other seats on the same unit whose hours overlap this slot's,
    // including the unit's seats on the days either side that run through
    // midnight into or out of this one.
    function crewFor(slot) {
      const out = [];
      const heading = unitHeading(slot.unit);
      const sources = [[slot.unit, 0]];
      for (const [d, shift] of [[slot.day - 1, -DAY_MIN], [slot.day + 1, DAY_MIN]]) {
        if (!slot.range || !days[d]) continue;
        for (const unit of days[d].querySelectorAll(".tsm-unit")) {
          if (unitHeading(unit) === heading) sources.push([unit, shift]);
        }
      }
      for (const [unit, shift] of sources) {
        for (const tr of unit.querySelectorAll("table.shifts > tbody > tr")) {
          if (tr === slot.tr) continue;
          const time = timeOf(tr);
          const parsed = parseRange(time);
          const range = parsed && { start: parsed.start + shift, end: parsed.end + shift };
          const together = slot.range && range
            ? Math.min(slot.range.end, range.end) > Math.max(slot.range.start, range.start)
            : shift === 0 && time === slot.time;
          if (!together) continue;
          if (tr.classList.contains("employee")) {
            const name = tidy(tr.querySelector("td")?.textContent || "");
            if (nameKey(name) === nameKey(slot.name)) continue;
            out.push({ name, time, range, open: false });
          } else {
            const label = tidy(tr.querySelector("span.hightlight")?.textContent || "").replace(/\s*open$/i, "");
            out.push({ name: label || "Open", time, range, open: true, requestable: tr.classList.contains("unassigned") });
          }
        }
      }
      return out;
    }

    // Called once the signed-in name is known: flags their slots, dots the
    // day chips.
    function setUser(userName) {
      if (userKnown) return;
      userKnown = true;
      const mineByDay = markMine(days, userName);
      mineByDay.forEach((n, i) => {
        if (n) chips[i].append(el("span", "tsm-chip-mine"));
      });
    }

    let debounce = 0;
    input.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => applyNameFilter(input.value), 150);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
    clear.addEventListener("click", () => {
      input.value = "";
      applyNameFilter("");
      input.focus();
    });
    calBtn.addEventListener("click", () => setCalendarMode(!html.dataset.tsmCal));
    document.addEventListener("click", (e) => {
      if (popDay < 0 || pop.contains(e.target) || e.target.closest?.(".tsm-cal-day")) return;
      closePopup();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePopup();
    });

    setBase("");

    const todayIndex = days.findIndex((td) => td.classList.contains("tsm-today"));
    select(todayIndex >= 0 ? todayIndex : 0, { scroll: false });

    return { setUser };
  }

  function tidy(text) {
    return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function fmtTime(ms) {
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function fmtClock(ms) {
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }

  function fmtLongDate(ms) {
    return new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  // "34 h 06 min", "12 min 30 s", "45 s"
  function fmtLead(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    if (h > 0) return `${h} h ${pad2(m)} min`;
    if (m > 0) return sec ? `${m} min ${sec} s` : `${m} min`;
    return `${sec} s`;
  }

  function timeOf(tr) {
    return tidy(tr.querySelector("td.timerange")?.textContent || "");
  }

  // "7:00pm-7:00am" or "19:00-07:00" -> minutes from midnight; an end at or
  // before the start is the next day.
  function parseRange(text) {
    const m = /(\d{1,2}):(\d{2})\s*([ap])?m?\s*[-–]\s*(\d{1,2}):(\d{2})\s*([ap])?m?/i.exec(text || "");
    if (!m) return null;
    const minutes = (h, mi, ap) => {
      const hour = ap ? (Number(h) % 12) + (ap.toLowerCase() === "p" ? 12 : 0) : Number(h);
      return hour * 60 + Number(mi);
    };
    const start = minutes(m[1], m[2], m[3]);
    let end = minutes(m[4], m[5], m[6]);
    if (end <= start) end += 24 * 60;
    return { start, end };
  }

  // Parts of range that none of the covers reach, in time order.
  function uncovered(range, covers) {
    const out = [];
    let at = range.start;
    for (const c of covers.filter(Boolean).sort((a, b) => a.start - b.start)) {
      if (at >= range.end) break;
      if (c.start > at) out.push({ start: at, end: Math.min(c.start, range.end) });
      at = Math.max(at, c.end);
    }
    if (at < range.end) out.push({ start: at, end: range.end });
    return out;
  }

  // Minutes from midnight -> "10:00pm" or "22:00"; values outside the day wrap.
  function fmtMinutes(min, twelveHour) {
    const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
    const h = Math.floor(m / 60);
    if (!twelveHour) return `${pad2(h)}:${pad2(m % 60)}`;
    return `${h % 12 || 12}:${pad2(m % 60)}${h < 12 ? "am" : "pm"}`;
  }

  // A range written the way the time beside it is: "10:00pm-12:00am" next
  // to "12:00am-3:00am", "22:00-00:00" next to "00:00-03:00".
  function rangeText(range, like) {
    const twelve = /[ap]\.?m/i.test(like || "");
    return `${fmtMinutes(range.start, twelve)}-${fmtMinutes(range.end, twelve)}`;
  }

  // The unit's full heading, "Alpha 1 (Alpha 1)", as the site wrote it.
  function unitHeading(unit) {
    const h = unit.querySelector("div.location");
    return h ? h.dataset.tsmFull || tidy(h.textContent) : "";
  }

  // "Alpha 2 (Alpha 2)" -> "Alpha 2"; "A24 (MED A-24)" is kept whole.
  function unitName(unit) {
    const text = tidy(unit.querySelector("div.location")?.textContent || "");
    const m = /^(.*?)\s*\((.*)\)$/.exec(text);
    return m && m[1] === m[2] ? m[1] : text;
  }

  function dayLabel(td) {
    return td.querySelector(".tsm-daylong")?.textContent || td.id.slice(4);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

})();
