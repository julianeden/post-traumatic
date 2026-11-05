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
// data-tsm-filter, data-tsm-name, data-tsm-cal); the stylesheet keys off those.
"use strict";

(() => {
  const MOBILE_QUERY = "(max-width: 820px)";
  const CALENDAR_WAIT_MS = 30000;
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Views listed in the first dropdown, by label after the prefix is removed.
  const COMMON_VIEWS = ["individual month view", "available open shifts", "als", "bls", "details", "dispatch"];
  const VIEW_PREFIX = /^vehicle\/location month view\s*-\s*/i;
  // Unit views searched, in order, for the crew on each of your shifts.
  const CREW_VIEWS = ["bls", "als", "details"];
  const CREW_CACHE_MS = 10 * 60 * 1000;
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

  // Progress notes go to the console (filter on "Traumasoft Mobile").
  const diag = { log: (line) => console.debug("[Traumasoft Mobile]", line) };
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
    decorateDays(month, days, isLocation);

    if (isLocation) {
      html.dataset.tsmMode = "location";
      const pager = buildPager(month, days);
      // The header that carries the signed-in name is rendered by the site's
      // own script and may land after DOMContentLoaded.
      whenUserNameKnown((name) => {
        diag.log(`signed-in name: ${name}`);
        pager.setUser(name);
      });
    } else {
      html.dataset.tsmMode = "agenda";
      addTodayButton(month);
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
    const listId = burger?.getAttribute("aria-controls");
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
  // the stylesheet stacks them. The checklist odometer loses its upper limit
  // and accepts decimals.
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
  // on load and on every shift change; strip the max and allow decimals
  // each time it does.
  function fixOdometer() {
    const input = document.getElementById("formbuilder_rigcheck_odometer");
    if (!input) return;
    input.setAttribute("inputmode", "decimal");
    const relax = () => {
      const fixed = input.className.replace(/,?\s*max\[[^\]]*\]/, "").replace(/custom\[integer\]/, "custom[number]");
      if (fixed !== input.className) input.className = fixed;
      if (input.hasAttribute("max")) input.removeAttribute("max");
    };
    relax();
    new MutationObserver(relax).observe(input, { attributes: true, attributeFilter: ["class", "max"] });
  }

  function initFleetPage() {
    html.dataset.tsm = "on";
    html.dataset.tsmPage = "fleet";
    html.dataset.tsmReady = "1";
    diag.log("fleet maintenance form");
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
  function buildTabs() {
    const toolbarTable = document.querySelector("table:has(> tbody > tr.tsm-toolbar)");
    const userContent = document.getElementById("user_content");
    if (!toolbarTable || !userContent) return;
    const cell = toolbarTable.parentElement;
    for (const child of cell.children) {
      if (child === toolbarTable) child.classList.add("tsm-sched");
      else if (child.tagName === "TABLE") child.classList.add(/^\s*my\s*schedule\s*$/i.test(child.textContent) ? "tsm-hide" : "tsm-more");
    }
    const row = cell.closest("tr");
    if (row) {
      for (const sibling of row.parentElement.children) {
        if (sibling !== row) sibling.classList.add("tsm-more");
      }
    }

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
    const setTab = (name) => {
      html.dataset.tsmTab = name;
      for (const b of buttons) b.setAttribute("aria-selected", String(b.dataset.tab === name));
    };
    userContent.before(tabs);
    setTab("schedule");
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
    if (monthSelect) monthSelect.closest("td")?.classList.add("tsm-toolbar-nav");

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
      toggle.className = "tsm-viewpick-toggle";
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

  function decorateDays(month, days, isLocation) {
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

      if (isLocation) decorateLocationDay(td);
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

  function decorateLocationDay(td) {
    const content = td.querySelector("table.eventcontent");
    if (!content) {
      td.classList.add("tsm-empty");
      return;
    }
    let openCount = 0;
    const units = content.querySelectorAll(":scope > tbody > tr");
    for (const unit of units) {
      unit.classList.add("tsm-unit");
      const open = unit.querySelectorAll("tr.unassigned").length;
      if (open > 0) unit.classList.add("tsm-has-open");
      openCount += open;
    }
    td.dataset.open = String(openCount);
    if (units.length === 0) td.classList.add("tsm-empty");
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
      td.dataset.mine = String(count);
      return count;
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
        for (const s of unmatched()) s.unit_match = findUnit(view, s, me);
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
      const crew = crewOf(s.unit_match, s.range, me);
      const partners = crew.filter((c) => !c.open);
      const open = crew.filter((c) => c.open);
      for (const c of partners) s.cell.append(crewLine("with", c, s.range));
      for (const c of open) s.cell.append(crewLine("open seat", c, s.range));
      if (crew.length === 0) s.cell.append(el("span", "tsm-crew-note", "No one else on this unit."));
      if (!s.past && (open.length > 0 || partners.length === 0)) {
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

  function crewOf(unit, range, me) {
    const out = [];
    for (const x of unit.slots) {
      const r = parseRange(x.time);
      if (overlap(r, range) <= 0) continue;
      if (!x.open && me && nameKey(x.who) === me) continue;
      out.push({ name: x.who, time: x.time, range: r, open: x.open, requestable: x.requestable });
    }
    return out;
  }

  // Everyone else on that day whose hours overlap these and who has no other
  // employee on their unit for their own hours.
  function sparesFor(views, day, range, me) {
    const seen = new Set();
    const out = [];
    for (const view of views) {
      for (const unit of view.days[day] || []) {
        for (const x of unit.slots) {
          if (x.open || (me && nameKey(x.who) === me)) continue;
          const r = parseRange(x.time);
          const together = overlap(r, range);
          if (together <= 0) continue;
          const partnered = unit.slots.some((y) => y !== x && !y.open && overlap(parseRange(y.time), r) > 0);
          if (partnered) continue;
          const key = `${unit.name}|${x.who}|${x.time}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const unitText = unit.label && unit.label.toLowerCase() !== unit.name.toLowerCase() ? `${unit.name} (${unit.label})` : unit.name;
          out.push({ name: x.who, unit: unitText, time: x.time, range: r, overlap: together });
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
    const title = el("div", "tsm-pager-title", (month.querySelector("td.monthname")?.textContent || "").trim());

    const nav = el("div", "tsm-nav");
    const prev = navButton("‹", "Previous day");
    const next = navButton("›", "Next day");
    const strip = el("div", "tsm-strip");
    nav.append(prev, strip, next);

    const filters = el("div", "tsm-filters");
    filters.append(filterButton("All units", ""), filterButton("Open only", "open"));

    const search = el("div", "tsm-search");
    const field = el("div", "tsm-search-field");
    const input = document.createElement("input");
    input.type = "search";
    input.className = "tsm-search-input";
    input.placeholder = "Find a person, e.g. Bob Smith";
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
    search.append(field, calBtn);

    const status = el("div", "tsm-status");

    pager.append(title, nav, filters, search, status);
    month.parentNode.insertBefore(pager, month);

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
    const slotsByDay = days.map((td) =>
      [...td.querySelectorAll("tr.employee")].map((tr) => {
        const name = tidy(tr.querySelector("td")?.textContent || "");
        const time = timeOf(tr);
        return { tr, unit: tr.closest(".tsm-unit"), name, time, range: parseRange(time), tokens: nameTokens(name) };
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
      prev.disabled = current === 0;
      next.disabled = current === days.length - 1;
      updateStatus();
    }

    function setFilter(name) {
      if (name) html.dataset.tsmFilter = name;
      else delete html.dataset.tsmFilter;
      for (const b of filters.querySelectorAll(".tsm-filter")) {
        b.classList.toggle("tsm-filter-active", b.dataset.filter === name);
      }
      try {
        localStorage.setItem("tsm.filter", name);
      } catch {
        // storage may be unavailable; the filter still applies for this page
      }
      updateStatus();
    }

    function savedFilter() {
      try {
        const v = localStorage.getItem("tsm.filter") || "";
        return v === "open" || v === "mine" ? v : "";
      } catch {
        return "";
      }
    }

    // Every word typed must start a word of the name, so "bob smi" finds
    // "Bob-PB Smith" and "smith" alone finds every Smith.
    function applyNameFilter(text) {
      query = text.trim();
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length > 0) html.dataset.tsmName = "on";
      else delete html.dataset.tsmName;
      search.classList.toggle("tsm-search-active", words.length > 0);

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

    function updateStatus() {
      if (current < 0) return;
      const td = days[current];
      const units = td.querySelectorAll(".tsm-unit");
      const visible = [...units].filter((u) => u.offsetParent !== null).length;
      const open = Number(td.dataset.open || 0);
      const filter = html.dataset.tsmFilter || "";
      const parts = [];
      if (query) {
        const total = matchesByDay.reduce((a, b) => a + b, 0);
        const dayCount = matchesByDay.filter((n) => n > 0).length;
        parts.push(total === 0
          ? `No one matching “${query}” this month.`
          : `“${query}”: ${total} shift${total === 1 ? "" : "s"} on ${dayCount} day${dayCount === 1 ? "" : "s"} this month.`);
      }
      if (units.length === 0) parts.push("Nothing scheduled.");
      else if (visible === 0 && query && matchesByDay[current] === 0) parts.push("Not on this day.");
      else if (visible === 0 && filter === "open") parts.push("No open shifts you can request on this day.");
      else if (visible === 0 && filter === "mine") parts.push("No shifts of yours on this day.");
      else if (query) parts.push(`On ${visible} unit${visible === 1 ? "" : "s"} this day.`);
      else parts.push(`${visible} of ${units.length} units · ${open} open shift${open === 1 ? "" : "s"}`);
      status.textContent = parts.join(" ");
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
      for (const c of crew) {
        const w = el("div", c.open ? "tsm-pop-with tsm-pop-open" : "tsm-pop-with");
        w.append(el("span", "tsm-pop-with-label", c.open ? "open seat" : "with"), el("span", "tsm-pop-with-name", c.name));
        if (c.time !== slot.time) w.append(el("span", "tsm-pop-with-time", c.time));
        if (c.requestable) w.append(el("span", "tsm-pop-tag", "you can request"));
        row.append(w);
      }
      return row;
    }

    // The other seats on the same unit whose hours overlap this slot's.
    function crewFor(slot) {
      const out = [];
      for (const tr of slot.unit.querySelectorAll("table.shifts > tbody > tr")) {
        if (tr === slot.tr) continue;
        const time = timeOf(tr);
        const range = parseRange(time);
        const together = slot.range && range
          ? Math.min(slot.range.end, range.end) > Math.max(slot.range.start, range.start)
          : time === slot.time;
        if (!together) continue;
        if (tr.classList.contains("employee")) {
          const name = tidy(tr.querySelector("td")?.textContent || "");
          if (nameKey(name) === nameKey(slot.name)) continue;
          out.push({ name, time, open: false });
        } else {
          const label = tidy(tr.querySelector("span.hightlight")?.textContent || "").replace(/\s*open$/i, "");
          out.push({ name: label || "Open", time, open: true, requestable: tr.classList.contains("unassigned") });
        }
      }
      return out;
    }

    // Called once the signed-in name is known: flags their slots, dots the
    // day chips, and adds the "Mine" filter.
    function setUser(userName) {
      if (userKnown) return;
      userKnown = true;
      const mineByDay = markMine(days, userName);
      mineByDay.forEach((n, i) => {
        if (n) chips[i].append(el("span", "tsm-chip-mine"));
      });
      const mineBtn = filterButton("Mine", "mine");
      mineBtn.addEventListener("click", () => setFilter("mine"));
      filters.append(mineBtn);
      if (savedFilter() === "mine") setFilter("mine");
    }

    prev.addEventListener("click", () => select(current - 1));
    next.addEventListener("click", () => select(current + 1));
    for (const b of filters.querySelectorAll(".tsm-filter")) {
      b.addEventListener("click", () => setFilter(b.dataset.filter));
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

    const saved = savedFilter();
    setFilter(saved === "mine" ? "" : saved);

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

  function navButton(text, label) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tsm-navbtn";
    b.textContent = text;
    b.setAttribute("aria-label", label);
    return b;
  }

  function filterButton(text, name) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tsm-filter";
    b.dataset.filter = name;
    b.textContent = text;
    return b;
  }
})();
