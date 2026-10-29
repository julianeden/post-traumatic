// Restyles the Traumasoft schedule calendar for phones.
//
// The page is left structurally intact: every original element, including the
// open-shift <span onclick="requestPickupShift(...)"> buttons, stays where it
// is so the site's own scripts and dialogs keep working. This script only adds
// classes, wraps bare text nodes so CSS can style them, and inserts a day
// pager for the location (all-units) views.
"use strict";

(() => {
  const MOBILE_QUERY = "(max-width: 820px)";
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const html = document.documentElement;

  function isSchedulePageUrl() {
    if (!location.pathname.endsWith("/main.php")) return false;
    const params = new URLSearchParams(location.search);
    if (params.get("a") !== "user:schedule") return false;
    const view = params.get("view");
    return view === null || view === "schedule";
  }

  function isSchedulePageDom() {
    return Boolean(document.getElementById("view_select") && document.querySelector("table.month"));
  }

  if (!matchMedia(MOBILE_QUERY).matches) return;

  // Mark early so the stylesheet applies before first paint; confirmed or
  // withdrawn once the DOM is available.
  if (isSchedulePageUrl()) html.classList.add("tsm");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  function init() {
    if (html.classList.contains("tsm-ready")) return;
    if (!isSchedulePageDom()) {
      html.classList.remove("tsm");
      return;
    }
    html.classList.add("tsm", "tsm-ready");

    const month = document.querySelector("table.month");
    const days = [...month.querySelectorAll('td[id^="day_"]')];
    const isLocation = Boolean(month.querySelector("div.location"));

    decorateToolbar();
    decorateDays(month, days, isLocation);

    if (isLocation) {
      html.classList.add("tsm-location");
      const pager = buildPager(month, days);
      // The header that carries the signed-in name is rendered by the site's
      // own script and may land after DOMContentLoaded.
      whenUserNameKnown(pager.setUser);
    } else {
      html.classList.add("tsm-agenda");
      addTodayButton(month);
    }
  }

  // ---- page chrome -------------------------------------------------------

  function decorateToolbar() {
    const viewSelect = document.getElementById("view_select");
    const row = viewSelect.closest("tr");
    if (!row) return;
    row.classList.add("tsm-toolbar");

    const viewCell = viewSelect.closest("td");
    viewCell.classList.add("tsm-toolbar-view");
    // "View:" is a bare text node before the select; give it a label so it
    // can be styled and tapped.
    for (const node of [...viewCell.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        const label = document.createElement("label");
        label.htmlFor = "view_select";
        label.className = "tsm-label";
        label.textContent = node.textContent.trim().replace(/:$/, "");
        node.replaceWith(label);
        break;
      }
    }

    const monthSelect = document.getElementById("StartMonth");
    if (monthSelect) monthSelect.closest("td")?.classList.add("tsm-toolbar-nav");
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
    filters.append(filterButton("All units", ""), filterButton("Open only", "tsm-filter-open"));

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

    function setFilter(cls) {
      html.classList.remove("tsm-filter-open", "tsm-filter-mine");
      if (cls) html.classList.add(cls);
      for (const b of filters.querySelectorAll(".tsm-filter")) {
        b.classList.toggle("tsm-filter-active", b.dataset.filter === cls);
      }
      try {
        localStorage.setItem("tsm.filter", cls);
      } catch {
        // storage may be unavailable; the filter still applies for this page
      }
      updateStatus();
    }

    function savedFilter() {
      try {
        return localStorage.getItem("tsm.filter") || "";
      } catch {
        return "";
      }
    }

    // Every word typed must start a word of the name, so "bob smi" finds
    // "Bob-PB Smith" and "smith" alone finds every Smith.
    function applyNameFilter(text) {
      query = text.trim();
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      html.classList.toggle("tsm-filter-name", words.length > 0);
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
      else if (visible === 0 && html.classList.contains("tsm-filter-open")) parts.push("No open shifts you can request on this day.");
      else if (visible === 0 && html.classList.contains("tsm-filter-mine")) parts.push("No shifts of yours on this day.");
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
      const mineBtn = filterButton("Mine", "tsm-filter-mine");
      mineBtn.addEventListener("click", () => setFilter("tsm-filter-mine"));
      filters.append(mineBtn);
      if (savedFilter() === "tsm-filter-mine") setFilter("tsm-filter-mine");
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
    setFilter(saved === "tsm-filter-mine" ? "" : saved);

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

  function filterButton(text, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tsm-filter";
    b.dataset.filter = cls;
    b.textContent = text;
    return b;
  }
})();
