// Restyles the Traumasoft schedule calendar for phones.
//
// The page is left structurally intact: every original element, including the
// open-shift <span onclick="requestPickupShift(...)"> buttons, stays where it
// is so the site's own scripts and dialogs keep working. This script only adds
// classes, wraps bare text nodes so CSS can style them, and inserts a day
// pager for the location (all-units) views.
//
// State is kept in data attributes on <html> (data-tsm, data-tsm-mode,
// data-tsm-filter, data-tsm-name); the stylesheet keys off those.
"use strict";

(() => {
  const MOBILE_QUERY = "(max-width: 820px)";
  const CALENDAR_WAIT_MS = 30000;
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  // Views listed in the first dropdown, by label after the prefix is removed.
  const COMMON_VIEWS = ["individual month view", "available open shifts", "als", "bls", "details", "dispatch"];
  const VIEW_PREFIX = /^vehicle\/location month view\s*-\s*/i;
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
    if (!isPhoneWidth()) {
      diag.log("desktop-sized viewport: not activating");
      return;
    }
    diag.log(`DOM ready · #view_select ${document.getElementById("view_select") ? "yes" : "no"} · table.month ${document.querySelector("table.month") ? "yes" : "no"}`);
    if (isSchedulePageDom()) {
      safeInit();
      return;
    }
    // Some pages fill their content after load; keep looking for a while.
    const started = Date.now();
    const observer = new MutationObserver(() => {
      if (isSchedulePageDom()) {
        observer.disconnect();
        diag.log(`calendar appeared after ${Date.now() - started} ms`);
        safeInit();
      } else if (Date.now() - started > CALENDAR_WAIT_MS) {
        observer.disconnect();
        diag.log("no schedule calendar on this page");
      }
    });
    observer.observe(html, { childList: true, subtree: true });
    setTimeout(() => {
      if (!html.dataset.tsmReady) {
        observer.disconnect();
        diag.log("no schedule calendar on this page");
      }
    }, CALENDAR_WAIT_MS);
  }

  function safeInit() {
    try {
      init();
    } catch (e) {
      diag.log(`error in init: ${e && e.message ? e.message : e}`);
    }
  }

  function init() {
    if (html.dataset.tsmReady) return;
    html.dataset.tsm = "on";
    html.dataset.tsmReady = "1";

    const month = document.querySelector("table.month");
    const days = [...month.querySelectorAll('td[id^="day_"]')];
    const isLocation = Boolean(month.querySelector("div.location"));

    decorateToolbar();
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
    }
    diag.log(`active · mode ${html.dataset.tsmMode} · ${days.length} days`);
  }

  // ---- page chrome -------------------------------------------------------

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
    if (other.length) wrap.append(group("Other Schedule Views", other));
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
      else diag.log("signed-in name not found in header");
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
    search.append(input, clear);

    const status = el("div", "tsm-status");

    pager.append(title, nav, filters, search, status);
    month.parentNode.insertBefore(pager, month);

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
      [...td.querySelectorAll("tr.employee")].map((tr) => ({
        tr,
        unit: tr.closest(".tsm-unit"),
        tokens: nameTokens(tr.querySelector("td")?.textContent || ""),
      })),
    );
    const matchesByDay = days.map(() => 0);
    let query = "";
    let current = -1;
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
        for (const slot of slotsByDay[i]) {
          const hit = words.length > 0 && words.every((w) => slot.tokens.some((t) => t.startsWith(w)));
          slot.tr.classList.toggle("tsm-match-slot", hit);
          if (hit) {
            count += 1;
            matchedUnits.add(slot.unit);
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

    const saved = savedFilter();
    setFilter(saved === "mine" ? "" : saved);

    const todayIndex = days.findIndex((td) => td.classList.contains("tsm-today"));
    select(todayIndex >= 0 ? todayIndex : 0, { scroll: false });

    return { setUser };
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
