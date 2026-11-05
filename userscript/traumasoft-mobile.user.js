// ==UserScript==
// @name         Traumasoft Mobile Schedule
// @namespace    https://github.com/julianeden/traumasoft-mobile
// @version      1.4.0
// @description  Makes the Traumasoft schedule usable on a phone: an agenda of your shifts with crew, a one-day pager with open-shift filters and a per-person calendar for the unit views, and a remembered login username.
// @author       Julian Eden
// @match        *://*.traumasoft.com/*
// @run-at       document-start
// @inject-into  content
// @noframes
// @grant        none
// @updateURL    https://gist.githubusercontent.com/julianeden/ded7365e07fe74e89676e93bc5901c66/raw/traumasoft-mobile.user.js
// @downloadURL  https://gist.githubusercontent.com/julianeden/ded7365e07fe74e89676e93bc5901c66/raw/traumasoft-mobile.user.js
// @license      MIT
// ==/UserScript==

// Firefox injects content.css for the add-on; here the script adds it to the
// page as early as possible, before the document has a <head>.
(() => {
  const css = `/* Traumasoft Mobile Schedule.
   Every rule is scoped to html[data-tsm="on"], which content.js adds only on the
   schedule calendar page at phone widths. html[data-tsm-mode="agenda"] is the
   "Individual Month View"; html[data-tsm-mode="location"] is a "Vehicle/Location" view. */

/* ---------- page frame ---------- */

html[data-tsm="on"] #main-wrapper {
  width: auto !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 0 !important;
}

html[data-tsm="on"] #main-content {
  width: auto !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 8px 12px 28px !important;
  border-radius: 0 !important;
  background: #f6f7f9;
}

html[data-tsm="on"] #user_content,
html[data-tsm="on"] #user_content td,
html[data-tsm="on"] #user_content div:not(.v-application * div) {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  color: #1f2937;
}

html[data-tsm="on"] #user_content {
  width: 100% !important;
}

html[data-tsm="on"] #user_content table {
  width: 100% !important;
  max-width: 100%;
  table-layout: auto;
}

html[data-tsm="on"] #user_content td[width] {
  width: auto !important;
}

html[data-tsm="on"] #user_content br {
  display: none;
}

/* The info row is three side-by-side cells (facts, spacer, filler);
   stack the first and drop the rest so the quick links get the full width. */
html[data-tsm="on"] #user_content td[width="550"] {
  display: block;
  width: auto !important;
}

html[data-tsm="on"] #user_content td[width="550"] ~ td {
  display: none;
}

/* section headings */
html[data-tsm="on"] td.std_header {
  background: none !important;
  color: #6b7280 !important;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  height: auto !important;
  padding: 16px 0 4px !important;
}

/* quick links become tappable rows */
html[data-tsm="on"] #user_content td.indent:has(> a) {
  padding: 0 !important;
}

html[data-tsm="on"] #user_content td.indent > a {
  display: block;
  padding: 12px 14px;
  margin: 4px 0;
  background: #fff;
  border: 1px solid #dfe3e8;
  border-radius: 10px;
  color: #003060;
  font-weight: 600;
  text-decoration: none;
}

html[data-tsm="on"] #user_content td.indent > a::after {
  content: "›";
  float: right;
  color: #9ca3af;
  font-size: 20px;
  line-height: 1;
}

/* the "General Schedule" facts */
html[data-tsm="on"] td.data_field {
  border: 0 !important;
  background: none !important;
  color: #003060 !important;
  font-weight: 700;
  white-space: nowrap;
  padding: 0 0 0 6px !important;
}

/* ---------- schedule page tabs: Schedule / More Options ---------- */

html[data-tsm="on"] .tsm-tabs {
  display: flex;
  gap: 2px;
  margin: 4px 0 12px;
  padding: 3px;
  background: #e5e7eb;
  border-radius: 12px;
}

html[data-tsm="on"] .tsm-tab {
  flex: 1 1 0;
  padding: 10px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #374151;
  font: 700 14px system-ui, -apple-system, Roboto, sans-serif;
}

html[data-tsm="on"] .tsm-tab[aria-selected="true"] {
  background: #fff;
  color: #003060;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

html[data-tsm="on"] .tsm-hide,
html[data-tsm-tab="schedule"] .tsm-more,
html[data-tsm-tab="more"] .tsm-sched,
html[data-tsm-tab="more"] .tsm-fab {
  display: none !important;
}

/* ---------- toolbar: view, legend, month/year ---------- */

html[data-tsm="on"] table:has(> tbody > tr.tsm-toolbar),
html[data-tsm="on"] table:has(> tbody > tr.tsm-toolbar) > tbody {
  display: block;
}

html[data-tsm="on"] tr.tsm-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 2px 0 6px;
}

html[data-tsm="on"] tr.tsm-toolbar > td {
  display: block;
  width: auto !important;
  padding: 0 !important;
  text-align: left !important;
}

html[data-tsm="on"] .tsm-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #6b7280;
  margin-bottom: 4px;
}

/* the page's own view select and Go button keep working, unseen */
html[data-tsm="on"] #view_select.tsm-hidden,
html[data-tsm="on"] #submit_form {
  display: none !important;
}

html[data-tsm="on"] .tsm-viewpick {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* sits tight under the Common dropdown, right-aligned, with the legend
   kept at a distance */
html[data-tsm="on"] .tsm-viewpick-toggle {
  align-self: flex-end;
  margin: -8px 0 6px;
  padding: 4px 2px;
  border: 0;
  background: none;
  color: #4b5563;
  font: 500 12px system-ui, -apple-system, Roboto, sans-serif;
  text-decoration: none;
}

html[data-tsm="on"] .tsm-viewpick-toggle::after {
  content: " \\203A";
  font-weight: 700;
}

html[data-tsm="on"] .tsm-viewpick-toggle[hidden],
html[data-tsm="on"] .tsm-viewpick-more[hidden] {
  display: none;
}

html[data-tsm="on"] .tsm-viewselect {
  width: 100%;
  font-size: 16px;
  padding: 10px 12px;
  border: 1px solid #cfd4db;
  border-radius: 10px;
  background: #fff;
  color: #111827;
}

html[data-tsm="on"] td.tsm-toolbar-nav {
  display: flex !important;
  gap: 8px;
  align-items: stretch;
}

html[data-tsm="on"] td.tsm-toolbar-nav select {
  flex: 1 1 0;
  min-width: 0;
  font-size: 16px;
  padding: 10px 8px;
  border: 1px solid #cfd4db;
  border-radius: 10px;
  background: #fff;
  color: #111827;
}

html[data-tsm="on"] #submit_form {
  flex: 0 0 auto;
  padding: 10px 18px;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  background: #003060;
  border: 0;
  border-radius: 10px;
}

html[data-tsm="on"] .calendar-legend {
  width: auto !important;
  flex-wrap: wrap;
  row-gap: 4px;
  background: none !important;
  padding: 0 !important;
  font-size: 12px;
  color: #4b5563;
}

html[data-tsm="on"] .calendar-legend-color {
  border-radius: 3px;
}

/* ---------- month table, shared ---------- */

/* The row holding the calendar sits in a tbody that is already a block, so
   as a table-row it would get an anonymous table sized to its content. */
html[data-tsm="on"] tr:has(> td > table.month),
html[data-tsm="on"] tr:has(> td > table.month) > td {
  display: block;
  width: auto !important;
  padding: 0 !important;
}

html[data-tsm="on"] table.month,
html[data-tsm="on"] table.month > tbody,
html[data-tsm="on"] table.month > tbody > tr {
  display: block;
  width: 100% !important;
  height: auto !important;
  border: 0 !important;
}

html[data-tsm="on"] table.month td {
  font-size: 14px;
}

html[data-tsm="on"] td.monthname {
  display: block;
  border: 0 !important;
  font-size: 20px;
  font-weight: 800;
  color: #111827;
  padding: 10px 0 8px !important;
}

html[data-tsm="on"] td.dayname,
html[data-tsm="on"] td.nomonthday {
  display: none !important;
}

html[data-tsm="on"] table.eventcontent {
  margin: 0 !important;
}

html[data-tsm="on"] td[id^="day_"] {
  display: block;
  width: auto !important;
  height: auto !important;
  min-height: 0 !important;
  border: 0 !important;
  text-align: left !important;
  vertical-align: top;
  padding: 0 !important;
  /* --tsm-tint carries any inline colour the site put on the cell */
  background-color: color-mix(in srgb, var(--tsm-tint, transparent) 22%, transparent) !important;
  box-shadow: inset 4px 0 0 var(--tsm-tint, transparent);
}

html[data-tsm="on"] .tsm-dayhead {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
  padding-top: 2px;
}

html[data-tsm="on"] .tsm-weekday {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #6b7280;
}

html[data-tsm="on"] .tsm-daynum {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-top: 2px;
  border-radius: 50%;
  font-size: 20px;
  font-weight: 800;
  color: #111827;
}

html[data-tsm="on"] .tsm-daylong {
  display: none;
}

/* ---------- agenda view: your own shifts ---------- */

html[data-tsm-mode="agenda"] td[id^="day_"] {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  column-gap: 10px;
  align-items: start;
  padding: 8px 0 8px 4px !important;
  border-top: 1px solid #e5e7eb !important;
}

html[data-tsm-mode="agenda"] .tsm-today .tsm-daynum {
  background: #003060;
  color: #fff;
}

html[data-tsm-mode="agenda"] .tsm-today .tsm-weekday {
  color: #003060;
}

html[data-tsm-mode="agenda"] .tsm-past .tsm-dayhead {
  opacity: 0.6;
}

html[data-tsm-mode="agenda"] .tsm-past .tsm-shift {
  background: #f9fafb;
  color: #6b7280;
}

html[data-tsm-mode="agenda"] .tsm-past .tsm-shift-main > td:first-child,
html[data-tsm-mode="agenda"] .tsm-past .tsm-shift-main > td.timerange {
  color: #6b7280;
}

html[data-tsm-mode="agenda"] td.tsm-empty {
  display: flex;
  align-items: center;
  min-height: 0;
  padding: 5px 0 5px 4px !important;
}

html[data-tsm-mode="agenda"] td.tsm-empty .tsm-dayhead {
  flex-direction: row;
  align-items: baseline;
  gap: 6px;
  padding: 0;
}

html[data-tsm-mode="agenda"] td.tsm-empty .tsm-weekday {
  font-size: 10px;
  width: 30px;
}

html[data-tsm-mode="agenda"] td.tsm-empty .tsm-daynum {
  width: auto;
  height: auto;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
}

html[data-tsm-mode="agenda"] td.tsm-empty.tsm-today .tsm-daynum {
  background: none;
  color: #003060;
  font-weight: 800;
}

html[data-tsm-mode="agenda"] td.tsm-empty table.eventcontent {
  display: none;
}

html[data-tsm-mode="agenda"] table.eventcontent,
html[data-tsm-mode="agenda"] table.eventcontent > tbody,
html[data-tsm-mode="agenda"] table.eventcontent > tbody > tr,
html[data-tsm-mode="agenda"] table.eventcontent > tbody > tr > td {
  display: block;
  width: auto !important;
  min-width: 0;
  padding: 0 !important;
}

html[data-tsm-mode="agenda"] .tsm-shift {
  display: block;
  width: auto !important;
  margin: 0 0 8px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #dfe3e8;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

html[data-tsm-mode="agenda"] .tsm-shift > tbody {
  display: block;
}

html[data-tsm-mode="agenda"] .tsm-shift-main {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

html[data-tsm-mode="agenda"] .tsm-shift-main > td {
  display: block;
  padding: 0 !important;
  white-space: normal;
}

html[data-tsm-mode="agenda"] .tsm-shift-main > td:first-child {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

html[data-tsm-mode="agenda"] .tsm-shift-main > td.timerange {
  flex: 0 0 auto;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: #374151;
}

html[data-tsm-mode="agenda"] .tsm-shift-details {
  display: block;
}

html[data-tsm-mode="agenda"] .tsm-shift-details > td {
  display: block;
  padding: 4px 0 0 !important;
  font-size: 13px;
  line-height: 1.35;
  color: #4b5563;
}

html[data-tsm-mode="agenda"] .tsm-spacer {
  display: none;
}

/* crew line under each shift, and the spares list */
html[data-tsm-mode="agenda"] .tsm-shift-crew,
html[data-tsm-mode="agenda"] .tsm-shift-spares {
  display: block;
}

html[data-tsm-mode="agenda"] .tsm-shift-crew > td,
html[data-tsm-mode="agenda"] .tsm-shift-spares > td {
  display: block;
  padding: 4px 0 0 !important;
}

html[data-tsm-mode="agenda"] .tsm-crew-note {
  font-size: 13px;
  color: #6b7280;
}

html[data-tsm-mode="agenda"] .tsm-crew {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 6px;
  margin-top: 2px;
  font-size: 13px;
  color: #4b5563;
}

html[data-tsm-mode="agenda"] .tsm-crew-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #6b7280;
}

html[data-tsm-mode="agenda"] .tsm-crew-name {
  font-weight: 600;
  color: #1f2937;
}

html[data-tsm-mode="agenda"] .tsm-crew-open .tsm-crew-label,
html[data-tsm-mode="agenda"] .tsm-crew-open .tsm-crew-name {
  color: #3f7d1a;
}

html[data-tsm-mode="agenda"] .tsm-crew-time {
  font-variant-numeric: tabular-nums;
  color: #6b7280;
}

html[data-tsm-mode="agenda"] .tsm-spares-btn {
  display: inline-block;
  margin-top: 8px;
  padding: 7px 14px;
  border: 1px solid #003060;
  border-radius: 999px;
  background: #fff;
  color: #003060;
  font: 700 13px system-ui, -apple-system, Roboto, sans-serif;
}

html[data-tsm-mode="agenda"] .tsm-spares-btn[aria-expanded="true"] {
  background: #003060;
  color: #fff;
}

html[data-tsm-mode="agenda"] .tsm-shift-spares > td {
  margin-top: 8px;
  padding: 8px 10px !important;
  border-radius: 10px;
  background: #f3f5f8;
}

html[data-tsm-mode="agenda"] .tsm-spares-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6b7280;
}

html[data-tsm-mode="agenda"] .tsm-spare {
  padding: 7px 0;
  border-top: 1px solid #e3e6ea;
}

html[data-tsm-mode="agenda"] .tsm-spares-title + .tsm-spare {
  margin-top: 6px;
}

html[data-tsm-mode="agenda"] .tsm-spare-line,
html[data-tsm-mode="agenda"] .tsm-spare-sub {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

html[data-tsm-mode="agenda"] .tsm-spare-name {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

html[data-tsm-mode="agenda"] .tsm-spare-time {
  flex: 0 0 auto;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

html[data-tsm-mode="agenda"] .tsm-spare-sub {
  margin-top: 1px;
  font-size: 12px;
  color: #6b7280;
}

html[data-tsm-mode="agenda"] .tsm-spare-overlap {
  flex: 0 0 auto;
  white-space: nowrap;
}

html[data-tsm="on"] .tsm-fab {
  position: fixed;
  right: 14px;
  bottom: 18px;
  z-index: 30;
  padding: 12px 18px;
  border: 0;
  border-radius: 999px;
  background: #003060;
  color: #fff;
  font: 700 14px system-ui, -apple-system, Roboto, sans-serif;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}

/* ---------- location view: every unit, one day at a time ---------- */

html[data-tsm-mode="location"] td.monthname {
  display: none;
}

html[data-tsm-mode="location"] td[id^="day_"]:not(.tsm-selected) {
  display: none !important;
}

html[data-tsm="on"] .tsm-pager {
  position: sticky;
  top: 48px;
  z-index: 20;
  margin: 0 -12px;
  padding: 8px 12px 8px;
  background: #f6f7f9;
  border-bottom: 1px solid #e5e7eb;
  /* The pager lives inside a table cell; without this the chip strip's
     full width would be used to size the cell. */
  contain: inline-size;
}

html[data-tsm="on"] .tsm-pager-title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 800;
  color: #111827;
}

html[data-tsm="on"] .tsm-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

html[data-tsm="on"] .tsm-navbtn {
  flex: 0 0 34px;
  height: 56px;
  padding: 0;
  border: 1px solid #cfd4db;
  border-radius: 10px;
  background: #fff;
  color: #003060;
  font-size: 24px;
  line-height: 1;
}

html[data-tsm="on"] .tsm-navbtn:disabled {
  opacity: 0.35;
}

html[data-tsm="on"] .tsm-strip {
  flex: 1 1 auto;
  display: flex;
  gap: 6px;
  min-width: 0;
  padding: 2px 0;
  overflow-x: auto;
  scrollbar-width: none;
  scroll-snap-type: x proximity;
}

html[data-tsm="on"] .tsm-strip::-webkit-scrollbar {
  display: none;
}

html[data-tsm="on"] .tsm-chip {
  position: relative;
  flex: 0 0 46px;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 0;
  border: 1px solid #d9dce1;
  border-radius: 10px;
  background: #fff;
  color: #111827;
  font: inherit;
  scroll-snap-align: center;
}

html[data-tsm="on"] .tsm-chip-wd {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6b7280;
}

html[data-tsm="on"] .tsm-chip-num {
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
}

html[data-tsm="on"] .tsm-chip-open {
  min-width: 14px;
  padding: 0 4px;
  border-radius: 7px;
  background: #6eb53f;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  line-height: 14px;
}

html[data-tsm="on"] .tsm-chip-mine {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #003060;
}

html[data-tsm="on"] .tsm-chip-past {
  opacity: 0.5;
}

html[data-tsm="on"] .tsm-chip-today {
  border-color: #003060;
  box-shadow: inset 0 0 0 1px #003060;
}

html[data-tsm="on"] .tsm-chip-selected {
  background: #003060;
  border-color: #003060;
  color: #fff;
  opacity: 1;
}

html[data-tsm="on"] .tsm-chip-selected .tsm-chip-wd {
  color: #c7d2e3;
}

html[data-tsm="on"] .tsm-chip-selected .tsm-chip-mine {
  background: #fff;
}

html[data-tsm="on"] .tsm-filters {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

html[data-tsm="on"] .tsm-filter {
  flex: 1 1 0;
  padding: 8px 6px;
  border: 1px solid #cfd4db;
  border-radius: 999px;
  background: #fff;
  color: #374151;
  font: 600 13px system-ui, -apple-system, Roboto, sans-serif;
}

html[data-tsm="on"] .tsm-filter-active {
  background: #003060;
  border-color: #003060;
  color: #fff;
}

html[data-tsm="on"] .tsm-search {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

html[data-tsm="on"] .tsm-search-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

html[data-tsm="on"] .tsm-calbtn {
  flex: 0 0 auto;
  padding: 0 12px;
  border: 1px solid #cfd4db;
  border-radius: 10px;
  background: #fff;
  color: #003060;
  font: 700 13px system-ui, -apple-system, Roboto, sans-serif;
}

html[data-tsm="on"] .tsm-calbtn-active {
  background: #003060;
  border-color: #003060;
  color: #fff;
}

html[data-tsm="on"] .tsm-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 40px 10px 12px;
  border: 1px solid #cfd4db;
  border-radius: 10px;
  background: #fff;
  color: #111827;
  font: 15px system-ui, -apple-system, Roboto, sans-serif;
  -webkit-appearance: none;
  appearance: none;
}

html[data-tsm="on"] .tsm-search-input::-webkit-search-cancel-button,
html[data-tsm="on"] .tsm-search-input::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}

html[data-tsm="on"] .tsm-search-active .tsm-search-input {
  border-color: #d97706;
  box-shadow: inset 0 0 0 1px #d97706;
}

html[data-tsm="on"] .tsm-search-clear {
  position: absolute;
  top: 50%;
  right: 6px;
  width: 30px;
  height: 30px;
  margin-top: -15px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #e5e7eb;
  color: #374151;
  font-size: 20px;
  line-height: 1;
  display: none;
}

html[data-tsm="on"] .tsm-search-active .tsm-search-clear {
  display: block;
}

html[data-tsm="on"] .tsm-chip-name {
  min-width: 14px;
  padding: 0 4px;
  border-radius: 7px;
  background: #d97706;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  line-height: 14px;
}

html[data-tsm="on"] .tsm-chip-name[hidden] {
  display: none;
}

html[data-tsm-name="on"] .tsm-chip:not(.tsm-chip-has-match):not(.tsm-chip-selected) {
  opacity: 0.3;
}

html[data-tsm-name="on"] .tsm-unit:not(.tsm-match) {
  display: none !important;
}

html[data-tsm-mode="location"] tr.tsm-match-slot > td:first-child {
  font-weight: 800;
  color: #92400e;
  background: #fef3c7;
  border-radius: 4px;
  padding: 1px 6px !important;
  margin-left: -6px;
}

html[data-tsm="on"] .tsm-status {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7280;
}

/* ---------- location view, calendar mode: one person's month ---------- */

html[data-tsm="on"] .tsm-cal {
  display: none;
  margin: 10px 0 0;
  contain: inline-size;
}

html[data-tsm-cal="on"] .tsm-cal {
  display: block;
}

html[data-tsm-cal="on"] .tsm-nav,
html[data-tsm-cal="on"] .tsm-filters,
html[data-tsm-cal="on"] .tsm-status {
  display: none;
}

html[data-tsm-cal="on"] td[id^="day_"] {
  display: none !important;
}

html[data-tsm="on"] .tsm-cal-caption {
  margin: 0 0 8px;
  font-size: 13px;
  color: #4b5563;
}

html[data-tsm="on"] .tsm-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

html[data-tsm="on"] .tsm-cal-wd {
  padding: 2px 0 4px;
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6b7280;
}

html[data-tsm="on"] .tsm-cal-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 54px;
  padding: 7px 0 0;
  border: 1px solid #e3e6ea;
  border-radius: 10px;
  background: #fff;
  color: #111827;
  font: inherit;
}

html[data-tsm="on"] .tsm-cal-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
}

html[data-tsm="on"] .tsm-cal-today .tsm-cal-num {
  background: #003060;
  color: #fff;
}

html[data-tsm="on"] .tsm-cal-past {
  opacity: 0.5;
}

html[data-tsm="on"] .tsm-cal-has {
  border-color: #f1c67a;
  background: #fff8ea;
  opacity: 1;
}

html[data-tsm="on"] .tsm-cal-has.tsm-cal-past {
  opacity: 0.75;
}

html[data-tsm="on"] .tsm-cal-active {
  border-color: #d97706;
  box-shadow: inset 0 0 0 1px #d97706;
}

html[data-tsm="on"] .tsm-cal-dots {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 16px;
}

html[data-tsm="on"] .tsm-cal-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d97706;
}

html[data-tsm="on"] .tsm-cal-count {
  min-width: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #d97706;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  line-height: 16px;
}

/* the shift details card, a full-width grid row under the tapped day's row */
html[data-tsm="on"] .tsm-pop {
  position: relative;
  grid-column: 1 / -1;
  margin: 4px 0 6px;
  padding: 10px 14px 14px;
  background: #fff;
  border: 1px solid #e3e6ea;
  border-radius: 12px;
  filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.2));
}

html[data-tsm="on"] .tsm-pop[hidden] {
  display: none;
}

html[data-tsm="on"] .tsm-pop::before {
  content: "";
  position: absolute;
  top: -8px;
  left: var(--tsm-caret, 50%);
  margin-left: -8px;
  border: 8px solid transparent;
  border-top: 0;
  border-bottom-color: #fff;
}

html[data-tsm="on"] .tsm-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

html[data-tsm="on"] .tsm-pop-title {
  font-size: 15px;
  font-weight: 800;
  color: #111827;
}

html[data-tsm="on"] .tsm-pop-close {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: #eef0f3;
  color: #374151;
  font-size: 20px;
  line-height: 1;
}

html[data-tsm="on"] .tsm-pop-shift {
  padding: 8px 0;
  border-top: 1px solid #f1f3f5;
}

html[data-tsm="on"] .tsm-pop-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

html[data-tsm="on"] .tsm-pop-unit {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

html[data-tsm="on"] .tsm-pop-time {
  flex: 0 0 auto;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

html[data-tsm="on"] .tsm-pop-with {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 6px;
  margin-top: 4px;
  font-size: 13px;
  color: #4b5563;
}

html[data-tsm="on"] .tsm-pop-with-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #6b7280;
}

html[data-tsm="on"] .tsm-pop-open .tsm-pop-with-label {
  color: #3f7d1a;
}

html[data-tsm="on"] .tsm-pop-with-name {
  font-weight: 600;
  color: #1f2937;
}

html[data-tsm="on"] .tsm-pop-open .tsm-pop-with-name {
  color: #3f7d1a;
}

html[data-tsm="on"] .tsm-pop-with-time {
  font-variant-numeric: tabular-nums;
  color: #6b7280;
}

html[data-tsm="on"] .tsm-pop-tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: #6eb53f;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

html[data-tsm="on"] .tsm-pop-solo {
  font-style: italic;
}

html[data-tsm="on"] .tsm-pop-empty {
  padding: 6px 0;
  color: #6b7280;
}

html[data-tsm="on"] .tsm-pop-go {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  border: 0;
  border-radius: 10px;
  background: #003060;
  color: #fff;
  font: 700 14px system-ui, -apple-system, Roboto, sans-serif;
}

html[data-tsm-mode="location"] td.tsm-selected {
  display: block;
  padding-top: 6px !important;
}

html[data-tsm-mode="location"] .tsm-dayhead {
  display: block;
  margin: 6px 0 8px;
  padding: 0;
}

html[data-tsm-mode="location"] .tsm-weekday,
html[data-tsm-mode="location"] .tsm-daynum {
  display: none;
}

html[data-tsm-mode="location"] .tsm-daylong {
  display: block;
  font-size: 17px;
  font-weight: 800;
  color: #111827;
}

html[data-tsm-mode="location"] table.eventcontent,
html[data-tsm-mode="location"] table.eventcontent > tbody {
  display: block;
  width: auto !important;
}

html[data-tsm-mode="location"] .tsm-unit {
  display: block;
  margin: 0 0 8px;
  background: #fff;
  border: 1px solid #dfe3e8;
  border-radius: 12px;
  overflow: hidden;
}

html[data-tsm-mode="location"] .tsm-unit.tsm-has-open {
  border-color: #b7dca0;
}

html[data-tsm-mode="location"] .tsm-unit.tsm-mine {
  border-color: #003060;
  box-shadow: inset 3px 0 0 #003060;
}

html[data-tsm-mode="location"] .tsm-unit > td {
  display: block;
  padding: 0 !important;
}

html[data-tsm-mode="location"] div.location {
  padding: 9px 12px 4px;
  background: none !important;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  text-decoration: none;
}

html[data-tsm-mode="location"] .row1,
html[data-tsm-mode="location"] .row2,
html[data-tsm-mode="location"] .month_calendar_current_day {
  background: none !important;
}

html[data-tsm-mode="location"] table.shifts {
  display: block;
  width: auto !important;
}

html[data-tsm-mode="location"] table.shifts > tbody {
  display: block;
}

html[data-tsm-mode="location"] table.shifts > tbody > tr {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 24px;
  padding: 7px 12px !important;
  border-top: 1px solid #f1f3f5;
  background: none !important;
}

html[data-tsm-mode="location"] table.shifts td {
  display: block;
  min-width: 0;
  padding: 0 !important;
  white-space: normal !important;
}

html[data-tsm-mode="location"] table.shifts td.timerange {
  flex: 0 0 auto;
  white-space: nowrap !important;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

html[data-tsm-mode="location"] tr.employee > td:first-child {
  color: #1f2937;
}

html[data-tsm-mode="location"] tr.tsm-mine-slot > td:first-child {
  color: #003060;
  font-weight: 800;
}

html[data-tsm-mode="location"] tr.tsm-mine-slot > td:first-child::after {
  content: "you";
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #003060;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  vertical-align: 1px;
}

/* an open slot you can request: the span keeps its own onclick */
html[data-tsm-mode="location"] tr.unassigned {
  background: #f1faea !important;
}

html[data-tsm-mode="location"] tr.unassigned span.hightlight {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 7px;
  background: #6eb53f;
  color: #fff !important;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.2;
  cursor: pointer;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
}

html[data-tsm-mode="location"] tr.unassigned span.hightlight::after {
  content: "Request ›";
  font-size: 11px;
  font-weight: 600;
  opacity: 0.9;
}

/* an open slot you cannot request (conflict, past, outside the window) */
html[data-tsm-mode="location"] tr.unassigned-unavailable {
  color: #9ca3af !important;
}

html[data-tsm-mode="location"] tr.unassigned-unavailable span.hightlight {
  padding: 4px 8px;
  border-radius: 6px;
  background: #eef0f3;
  color: #6b7280 !important;
  font-size: 13px;
}

html[data-tsm-mode="location"] tr.unassigned-unavailable span.hightlight::after {
  content: " · unavailable";
  font-weight: 400;
}

html[data-tsm-filter="open"] .tsm-unit:not(.tsm-has-open) {
  display: none !important;
}

html[data-tsm-filter="mine"] .tsm-unit:not(.tsm-mine) {
  display: none !important;
}

/* ---------- the site's jQuery UI dialogs (pickup confirmation) ---------- */

html[data-tsm="on"] .ui-dialog {
  position: fixed !important;
  top: 60px !important;
  left: 8px !important;
  right: 8px !important;
  width: auto !important;
  height: auto !important;
  max-height: calc(100vh - 76px);
  box-sizing: border-box;
  overflow-y: auto;
  border-radius: 12px;
  font-family: system-ui, -apple-system, Roboto, sans-serif;
}

html[data-tsm="on"] .ui-dialog .ui-dialog-content {
  width: auto !important;
  height: auto !important;
  max-height: none !important;
  font-size: 14px;
  line-height: 1.4;
}

html[data-tsm="on"] .ui-dialog .ui-resizable-handle {
  display: none !important;
}

html[data-tsm="on"] .ui-dialog textarea,
html[data-tsm="on"] .ui-dialog select,
html[data-tsm="on"] .ui-dialog input[type="text"] {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  font-size: 16px;
  padding: 8px;
  border: 1px solid #cfd4db;
  border-radius: 8px;
}

html[data-tsm="on"] #confirm_dialog_form > br {
  display: none;
}

html[data-tsm="on"] #show_confirm_details {
  display: block;
  margin-bottom: 12px;
}

html[data-tsm="on"] #confirm_dialog_form > b {
  display: block;
  margin: 10px 0 4px;
}

html[data-tsm="on"] #confirm_dialog_form a.commands {
  display: block;
  margin-top: 14px;
  padding: 12px;
  border-radius: 10px;
  background: #003060;
  color: #fff !important;
  font-weight: 700;
  text-align: center;
  text-decoration: none;
}

html[data-tsm="on"] .ui-widget-overlay {
  position: fixed !important;
  inset: 0;
  width: auto !important;
  height: auto !important;
}

/* ---------- header: the top bar ---------- */

/* gone: logo, search, settings, chat, portal and the name block */
html[data-tsm-chrome="on"] .ts-menus-logo,
html[data-tsm-chrome="on"] #ts_menus_menu_div > .v-col > div:has(> .ts-menus-logo),
html[data-tsm-chrome="on"] #ts_menu_search_text_div,
html[data-tsm-chrome="on"] #sysmgt_button,
html[data-tsm-chrome="on"] #chat_button,
html[data-tsm-chrome="on"] #myportal_button,
html[data-tsm-chrome="on"] #ts_menus_user_div {
  display: none !important;
}

/* The site lays the bar out as a grid of columns. Flatten the columns and
   the nav so the hamburger and the four quick buttons are direct items of
   one row, spread evenly. */
html[data-tsm-chrome="on"] #ts_menus_menu_div {
  display: flex !important;
  align-items: center;
  justify-content: space-evenly;
  flex-wrap: nowrap;
  padding: 4px 2px !important;
}

html[data-tsm-chrome="on"] #ts_menus_menu_div > .v-col:has(#tsm-topnav),
html[data-tsm-chrome="on"] #ts_menus_menu_div > .v-col:has(#ts_menus_right_div),
html[data-tsm-chrome="on"] #ts_menus_right_div,
html[data-tsm-chrome="on"] #ts_menus_right_div > section,
html[data-tsm-chrome="on"] .tsm-topnav {
  display: contents !important;
}

/* the site's hamburger, sized like our buttons */
html[data-tsm-chrome="on"] #ts_menus_menu_div button[title="All Menus"] {
  width: 46px !important;
  height: 40px !important;
  min-width: 0 !important;
  margin: 0 !important;
  border-radius: 10px !important;
  box-shadow: none !important;
  background: transparent !important;
}

html[data-tsm-chrome="on"] #ts_menus_menu_div button[title="All Menus"] .v-icon {
  font-size: 26px !important;
  width: 26px !important;
  height: 26px !important;
}

html[data-tsm-chrome="on"] #ts_menus_right_div > :not(section),
html[data-tsm-chrome="on"] #ts_menus_right_div > section > div:not(:has(#notifications_button)) {
  display: none !important;
}

/* The bell leaves the bar but stays as an invisible activator at the top
   right, so the Alerts entry in the hamburger can open its panel there. */
html[data-tsm-chrome="on"] #ts_menus_right_div > section > div:has(#notifications_button) {
  position: absolute;
  top: 6px;
  right: 10px;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

html[data-tsm-chrome="on"] .tsm-topbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 46px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #fff !important;
  text-decoration: none !important;
  -webkit-tap-highlight-color: rgba(255, 255, 255, 0.2);
}

html[data-tsm-chrome="on"] .tsm-topbtn-menu {
  width: 56px;
}

html[data-tsm-chrome="on"] .tsm-topbtn-open {
  background: rgba(255, 255, 255, 0.18);
}

html[data-tsm-chrome="on"] .tsm-icon {
  width: 26px;
  height: 26px;
  display: block;
}

html[data-tsm-chrome="on"] .tsm-icon-chevron {
  width: 14px;
  height: 14px;
  margin-left: -1px;
  opacity: 0.85;
}

html[data-tsm-chrome="on"] .tsm-menu {
  position: fixed;
  z-index: 10002;
  min-width: 240px;
  max-width: calc(100vw - 16px);
  padding: 6px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  font-family: system-ui, -apple-system, Roboto, sans-serif;
}

html[data-tsm-chrome="on"] .tsm-menu[hidden] {
  display: none;
}

html[data-tsm-chrome="on"] .tsm-menu-item {
  display: block;
  padding: 13px 14px;
  border-radius: 8px;
  color: #111827 !important;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none !important;
}

html[data-tsm-chrome="on"] .tsm-menu-item + .tsm-menu-item {
  border-top: 1px solid #f1f3f5;
}

/* ---------- form pages: work orders and checklists ---------- */

html[data-tsm-page="form"] #main-content {
  padding: 8px 12px 28px !important;
}

html[data-tsm-page="form"] #pdfForm {
  display: none !important;
}

/* the fixed-width, floated page scaffolding */
html[data-tsm-page="form"] #main-content > div,
html[data-tsm-page="form"] #printArea,
html[data-tsm-page="form"] #formID > div,
html[data-tsm-page="form"] #sortable,
html[data-tsm-page="form"] .fblist,
html[data-tsm-page="form"] ul.element {
  width: auto !important;
  max-width: 100%;
  float: none !important;
  box-sizing: border-box;
}

html[data-tsm-page="form"] .fblist {
  margin: 0 0 14px !important;
  padding: 8px !important;
  border: 1px solid #dfe3e8 !important;
  border-radius: 12px;
  background: #fff;
}

html[data-tsm-page="form"] [id^="block-title-"] {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
}

html[data-tsm-page="form"] li.itemBox {
  display: block;
  float: none !important;
  width: auto !important;
  margin: 0 0 8px;
}

html[data-tsm-page="form"] [id^="outer_item-"] {
  display: block;
  float: none !important;
  width: auto !important;
  box-sizing: border-box;
  padding: 10px 12px !important;
  border-radius: 10px;
}

html[data-tsm-page="form"] [id^="label_item-"] {
  display: block;
  float: none !important;
  width: auto !important;
  margin-bottom: 6px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

html[data-tsm-page="form"] [id^="validate_item-"] {
  float: none !important;
  font-size: 13px !important;
}

html[data-tsm-page="form"] [id^="selectbox_item-"],
html[data-tsm-page="form"] [id^="outer_item-"] > div[style*="float"],
html[data-tsm-page="form"] [id*="_style_item-"] {
  display: block;
  float: none !important;
  width: auto !important;
}

html[data-tsm-page="form"] #formID input[type="text"],
html[data-tsm-page="form"] #formID input:not([type]),
html[data-tsm-page="form"] #formID input[type="number"],
html[data-tsm-page="form"] #formID select,
html[data-tsm-page="form"] #formID textarea {
  display: block;
  float: none !important;
  width: 100% !important;
  max-width: 100%;
  box-sizing: border-box;
  height: auto !important;
  margin: 0 !important;
  padding: 10px 12px !important;
  border: 1px solid #cfd4db !important;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  font-size: 16px !important;
  line-height: 1.3;
}

html[data-tsm-page="form"] #formID textarea {
  min-height: 110px;
}

html[data-tsm-page="form"] #formID select[multiple] {
  min-height: 140px;
}

html[data-tsm-page="form"] #formID input[type="radio"],
html[data-tsm-page="form"] #formID input[type="checkbox"] {
  width: 22px !important;
  height: 22px !important;
  margin: 2px 8px 2px 0 !important;
  vertical-align: middle;
}

html[data-tsm-page="form"] .tsm-opt {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 18px 8px 0;
  font-size: 15px;
  line-height: 1.3;
  white-space: nowrap;
}

html[data-tsm-page="form"] .tsm-opt input {
  margin: 0 !important;
}

html[data-tsm-page="form"] [id^="outer_item-"],
html[data-tsm-page="form"] [id*="_style_item-"],
html[data-tsm-page="form"] li.itemBox {
  height: auto !important;
  min-height: 0 !important;
}

html[data-tsm-page="form"] #formID table {
  width: 100% !important;
  max-width: 100%;
  height: auto !important;
  table-layout: auto;
}

html[data-tsm-page="form"] #formID td {
  white-space: normal !important;
  vertical-align: top;
}

html[data-tsm-page="form"] #formID img {
  max-width: 100%;
  height: auto;
}

html[data-tsm-page="form"] #formID .submit,
html[data-tsm-page="form"] #formID input[type="submit"] {
  display: block;
  width: 100%;
  margin: 8px 0 0;
  padding: 14px;
  border: 0;
  border-radius: 12px;
  background: #003060;
  color: #fff;
  font: 700 17px system-ui, -apple-system, Roboto, sans-serif;
}

html[data-tsm-page="form"] #formID input[name="finish_later"] {
  background: #fff;
  border: 1px solid #003060;
  color: #003060;
}

html[data-tsm-page="form"] #formID a.button,
html[data-tsm-page="form"] #formID a[onclick*="addUploadBox"] {
  display: inline-block;
  padding: 8px 0;
  font-weight: 700;
}

/* loud warning/notice boxes become a pale tint with a coloured edge */
html[data-tsm-page="form"] .tsm-tint {
  background-color: color-mix(in srgb, var(--tsm-edge) 9%, #fff) !important;
  color: #1f2937 !important;
  border-left: 4px solid color-mix(in srgb, var(--tsm-edge) 70%, #333);
  padding: 8px 12px !important;
}

html[data-tsm-page="form"] .tsm-tint *:not(input):not(select):not(textarea) {
  color: #1f2937 !important;
  font-size: 13px !important;
  line-height: 1.35 !important;
  text-align: left !important;
}

html[data-tsm-page="form"] .tsm-tint h1,
html[data-tsm-page="form"] .tsm-tint h2,
html[data-tsm-page="form"] .tsm-tint h3,
html[data-tsm-page="form"] .tsm-tint h4 {
  margin: 0 0 4px;
  font-size: 14px !important;
  font-weight: 700;
}

html[data-tsm-page="form"] .tsm-tint p,
html[data-tsm-page="form"] .tsm-tint ul,
html[data-tsm-page="form"] .tsm-tint ol {
  margin: 0 0 4px;
}

html[data-tsm-page="form"] .tsm-tint [id^="label_item-"] {
  font-size: 15px !important;
  font-weight: 600;
}

html[data-tsm-page="form"] .tsm-tint img {
  max-height: 18px;
  width: auto;
  vertical-align: middle;
}

html[data-tsm-page="form"] .tsm-tint table {
  width: auto !important;
  margin: 0 !important;
}

html[data-tsm-page="form"] .tsm-tint td {
  padding: 0 8px 0 0 !important;
}

/* the odometer and shift picker above the checklist */
html[data-tsm-page="form"] label[for="formbuilder_rigcheck_odometer"] {
  display: block !important;
  width: auto !important;
  margin: 10px 0 6px;
  text-align: left !important;
  font-weight: 600;
}

/* ---------- fleet maintenance request ---------- */

html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form table,
html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form tbody,
html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form tr,
html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form td {
  display: block;
  width: auto !important;
  box-sizing: border-box;
}

html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form tr {
  padding: 8px 0;
  border-top: 1px solid #e5e7eb;
}

html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form tr:has(input[type="checkbox"]) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form td.grouping {
  flex: 1 1 auto;
  padding: 0 0 6px !important;
  background: none !important;
  text-align: left !important;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form tr:has(input[type="checkbox"]) td {
  padding: 0 !important;
}

html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form td:not(.grouping) {
  padding: 0 !important;
}

html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form input[type="text"],
html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form select,
html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form textarea {
  display: block;
  width: 100% !important;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #cfd4db;
  border-radius: 8px;
  background: #fff;
  font-size: 16px;
}

html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form textarea {
  min-height: 110px;
}

html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_form input[type="checkbox"] {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  margin: 0;
}

html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_buttons {
  width: auto !important;
  margin-top: 12px;
}

html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_button {
  display: block;
  width: 100%;
  padding: 14px !important;
  border: 0 !important;
  border-radius: 12px !important;
  background: #003060 !important;
  color: #fff !important;
  font: 700 17px system-ui, -apple-system, Roboto, sans-serif !important;
}

html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_button .ui-button-icon,
html[data-tsm-page="fleet"] #vehicle_maintenance_request_dialog_button .ui-button-icon-space {
  display: none;
}

html[data-tsm-page="fleet"] .std_header {
  font-size: 20px;
  font-weight: 800;
  margin: 4px 0 8px;
}

/* ---------- punch clock page ---------- */

html[data-tsm-page="punch"] #punchin_form > table,
html[data-tsm-page="punch"] #main-content > .clear,
html[data-tsm-page="punch"] #footer {
  display: none !important;
}

html[data-tsm-page="punch"] #main-content {
  min-height: calc(100vh - 110px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 12px 16px 20px !important;
}

html[data-tsm-page="punch"] .tsm-punch {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1f2937;
}

html[data-tsm-page="punch"] .tsm-punch-time {
  margin-top: 4px;
  text-align: center;
  font-size: 58px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  color: #111827;
  font-variant-numeric: tabular-nums;
}

html[data-tsm-page="punch"] .tsm-punch-date {
  margin-top: -4px;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  color: #6b7280;
}

html[data-tsm-page="punch"] .tsm-punch-shifts {
  margin-top: 6px;
  padding: 4px 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
}

html[data-tsm-page="punch"] table.punchclock_shifts,
html[data-tsm-page="punch"] table.punchclock_shifts > tbody {
  display: block;
  width: 100% !important;
}

html[data-tsm-page="punch"] .tsm-shift-head {
  display: none !important;
}

html[data-tsm-page="punch"] .tsm-shift-row {
  display: block;
  padding: 10px 0;
  border-top: 1px solid #f1f3f5;
}

html[data-tsm-page="punch"] .tsm-shift-row:first-of-type,
html[data-tsm-page="punch"] .tsm-shift-head + .tsm-shift-row {
  border-top: 0;
}

html[data-tsm-page="punch"] table.punchclock_shifts td {
  display: block;
  padding: 0 !important;
  white-space: normal !important;
}

html[data-tsm-page="punch"] .tsm-shift-row td:first-child {
  margin-bottom: 3px;
  font-size: 12px !important;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6b7280 !important;
}

html[data-tsm-page="punch"] .tsm-shift-row td:last-child {
  font-size: 16px !important;
  font-weight: 600;
  line-height: 1.35;
  color: #111827;
  font-variant-numeric: tabular-nums;
}

html[data-tsm-page="punch"] .tsm-shift-empty td:last-child::before {
  content: "none";
  color: #9ca3af;
  font-weight: 400;
  font-style: italic;
}

html[data-tsm-page="punch"] .tsm-punch-btn {
  width: 100%;
  margin-top: 28px;
  padding: 26px 16px;
  border: 0;
  border-radius: 18px;
  color: #fff;
  font: 800 26px system-ui, -apple-system, Roboto, sans-serif;
  letter-spacing: 0.01em;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
}

html[data-tsm-page="punch"] .tsm-punch-in {
  background: #1f7a32;
}

html[data-tsm-page="punch"] .tsm-punch-out {
  background: #b3261e;
}

html[data-tsm-page="punch"] .tsm-punch-btn:disabled {
  opacity: 0.6;
  box-shadow: none;
}

html[data-tsm-page="punch"] .tsm-punch-continue {
  display: block;
  width: auto;
  margin: 22px auto 0;
  padding: 10px 14px;
  border: 0;
  background: none;
  color: #003060;
  font: 600 15px system-ui, -apple-system, Roboto, sans-serif;
  text-decoration: underline;
  text-underline-offset: 3px;
}

html[data-tsm-page="punch"] .tsm-punch-note {
  margin-top: 28px;
  padding: 18px;
  text-align: center;
  border-radius: 14px;
  background: #eef0f3;
  color: #4b5563;
  font-weight: 600;
}

/* the are-you-sure card for early punches */
html[data-tsm="on"] .tsm-confirm {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(17, 24, 39, 0.55);
}

html[data-tsm="on"] .tsm-confirm-card {
  width: 100%;
  max-width: 420px;
  padding: 18px 18px 16px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.3);
  font-family: system-ui, -apple-system, Roboto, sans-serif;
  color: #1f2937;
}

html[data-tsm="on"] .tsm-confirm-title {
  margin-bottom: 8px;
  font-size: 20px;
  font-weight: 800;
  color: #111827;
}

html[data-tsm="on"] .tsm-confirm-line {
  margin: 0 0 8px;
  font-size: 15px;
  line-height: 1.4;
}

html[data-tsm="on"] .tsm-confirm-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

html[data-tsm="on"] .tsm-confirm-no,
html[data-tsm="on"] .tsm-confirm-yes {
  flex: 1 1 0;
  padding: 13px 10px;
  border-radius: 12px;
  font: 700 15px system-ui, -apple-system, Roboto, sans-serif;
}

html[data-tsm="on"] .tsm-confirm-no,
html[data-tsm="on"] .tsm-confirm-yes {
  border: 1px solid #cfd4db;
  background: #fff;
  color: #111827;
}
`;
  const style = document.createElement("style");
  style.id = "tsm-style";
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
})();

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
