/**
 * DOM rendering: AgendaDay[] + DeadlineItem[] → HTML.
 *
 * Reads from the agenda data model, writes to the DOM.
 * No parsing or date logic here — that belongs to earlier stages.
 */

import type { AgendaDay, AgendaItem, DeadlineItem, OverdueItem, SomedayItem } from "../agenda/model.ts";
import { notificationsEnabled, setNotificationsEnabled, requestPermission, clearScheduled, scheduleNotifications } from "./notifications.ts";
import { DAY_NAMES, MONTH_NAMES, formatDayMonth, formatDayNumber } from "../dateLabels.ts";
import { t, type Locale, getLocale, setLocale, SUPPORTED_LOCALES } from "../i18n.ts";

export interface RenderAgendaOptions {
  readonly activeTagFilters?: readonly string[];
  readonly hideTags?: boolean;
  readonly hideEmptyDays?: boolean;
  readonly hideCompletedAndSkipped?: boolean;
  readonly monthAhead?: boolean;
}

interface ToggleButtonOptions {
  readonly label?: boolean;
}

export function createNotificationToggle(options: ToggleButtonOptions = {}): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = options.label ? "notification-toggle is-labeled" : "notification-toggle";
  const bellOutline = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  const bellFilled = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
  const update = () => {
    const on = notificationsEnabled();
    const nextNotificationLabel = on ? t("disableNotifications") : t("enableNotifications");
    if (options.label) {
      btn.textContent = nextNotificationLabel;
    } else {
      btn.innerHTML = on ? bellFilled : bellOutline;
    }
    btn.setAttribute("aria-label", options.label ? nextNotificationLabel : t("toggleNotifications"));
    btn.classList.toggle("is-on", on);
  };
  update();
  btn.addEventListener("click", async () => {
    if (notificationsEnabled()) {
      setNotificationsEnabled(false);
      clearScheduled();
    } else {
      const granted = await requestPermission();
      if (!granted) return;
      setNotificationsEnabled(true);
    }
    update();
    // Re-render to pick up scheduling
    btn.dispatchEvent(new CustomEvent("notification-toggled", { bubbles: true }));
  });
  return btn;
}

// ── Public API ───────────────────────────────────────────────────────

function renderAgendaBase(
  container: HTMLElement,
  week: readonly AgendaDay[],
  deadlines: DeadlineItem[],
  overdue: OverdueItem[],
  someday: SomedayItem[],
  today: Date,
  options: RenderAgendaOptions = {},
): void {
  checkboxListIdCounter = 0;
  checkboxListsById.clear();
  renderedCheckboxListKeys = new Set();
  container.innerHTML = "";

  if (week.length === 0) return;

  // Header
  const startDate = week[0].date;
  const endDate = week[week.length - 1].date;
  container.appendChild(renderHeader(startDate, endDate, options));

  const hideCompleted = options.hideCompletedAndSkipped ?? false;

  // Overdue section (before deadlines — most urgent)
  if (overdue.length > 0) {
    container.appendChild(renderOverdue(overdue));
  }

  // Deadlines section
  if (deadlines.length > 0) {
    container.appendChild(renderDeadlines(deadlines));
  }

  // Days card (the visible date range in one container, divided by thin rules)
  const daysCard = el("section", "days-card");
  const filteredWeek: AgendaDay[] = hideCompleted
    ? week.map(day => ({
        date: day.date,
        items: day.items.filter(item => item.entry.todo !== "DONE" && !item.skipped),
      }))
    : [...week];
  const visibleDays = options.hideEmptyDays
    ? filteredWeek.filter(day => day.items.length > 0)
    : filteredWeek;
  if (visibleDays.length > 0) {
    for (const day of visibleDays) {
      daysCard.appendChild(renderDay(day, today));
    }
    container.appendChild(daysCard);
  }

  // Someday section
  const visibleSomeday = hideCompleted
    ? someday.filter(item => item.entry.todo !== "DONE")
    : someday;
  if (visibleSomeday.length > 0) {
    container.appendChild(renderSomeday(visibleSomeday));
  }

  for (const key of checkboxListCollapseState.keys()) {
    if (!renderedCheckboxListKeys.has(key)) checkboxListCollapseState.delete(key);
  }
}

// ── Header ───────────────────────────────────────────────────────────

function renderHeader(startDate: Date, endDate: Date, options: RenderAgendaOptions): HTMLElement {
  const header = el("header", "agenda-header");

  const nav = el("nav", "agenda-nav");

  const prevBtn = el("button", "nav-arrow");
  prevBtn.innerHTML = "&larr;";
  prevBtn.setAttribute("aria-label", options.monthAhead ? t("prev30Days") : t("prev7Days"));
  prevBtn.dataset.action = "prev";

  const title = el("span", "nav-title");
  const weekDate = el("span", "nav-week-date");
  weekDate.textContent = formatDateRange(startDate, endDate);
  title.append(weekDate);

  const nextBtn = el("button", "nav-arrow");
  nextBtn.innerHTML = "&rarr;";
  nextBtn.setAttribute("aria-label", options.monthAhead ? t("next30Days") : t("next7Days"));
  nextBtn.dataset.action = "next";

  const todayBtn = el("button", "agenda-nav-today");
  todayBtn.textContent = t("today");
  todayBtn.dataset.action = "today";
  todayBtn.setAttribute("aria-label", t("todayAria"));

  nav.append(prevBtn, title, nextBtn);

  const actions = el("div", "agenda-actions");
  const primaryActions = el("div", "agenda-primary-actions");

  const addBtn = el("button", "add-item-btn");
  addBtn.textContent = t("addLabel");
  addBtn.dataset.action = "add";
  addBtn.setAttribute("aria-label", t("addAria"));

  primaryActions.append(addBtn);
  actions.append(primaryActions, renderSettingsMenu(options));
  header.append(nav, todayBtn, actions);

  if ((options.activeTagFilters?.length ?? 0) > 0) {
    header.appendChild(renderActiveTagFilters(options.activeTagFilters ?? []));
  }
  return header;
}

function createHideEmptyDaysToggle(options: RenderAgendaOptions): HTMLButtonElement {
  const hideEmptyDaysBtn = el("button", "hide-empty-days-toggle");
  const label = options.hideEmptyDays ? t("showEmptyDays") : t("hideEmptyDays");
  hideEmptyDaysBtn.textContent = label;
  hideEmptyDaysBtn.dataset.action = "toggle-hide-empty-days";
  hideEmptyDaysBtn.setAttribute("aria-label", label);
  hideEmptyDaysBtn.setAttribute("aria-pressed", options.hideEmptyDays ? "true" : "false");
  if (options.hideEmptyDays) hideEmptyDaysBtn.classList.add("is-on");
  return hideEmptyDaysBtn;
}

function createHideTagsToggle(options: RenderAgendaOptions): HTMLButtonElement {
  const btn = el("button", "hide-tags-toggle");
  const label = options.hideTags ? t("showTags") : t("hideTags");
  btn.textContent = label;
  btn.dataset.action = "toggle-hide-tags";
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-pressed", options.hideTags ? "true" : "false");
  if (options.hideTags) btn.classList.add("is-on");
  return btn;
}

function createHideCompletedToggle(options: RenderAgendaOptions): HTMLButtonElement {
  const btn = el("button", "hide-completed-toggle");
  const label = options.hideCompletedAndSkipped ? t("showCompletedAndSkipped") : t("hideCompletedAndSkipped");
  btn.textContent = label;
  btn.dataset.action = "toggle-hide-completed";
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-pressed", options.hideCompletedAndSkipped ? "true" : "false");
  if (options.hideCompletedAndSkipped) btn.classList.add("is-on");
  return btn;
}

function createMonthAheadToggle(options: RenderAgendaOptions): HTMLButtonElement {
  const btn = el("button", "month-ahead-toggle");
  const label = options.monthAhead ? t("showFewerDays") : t("showMoreDays");
  btn.textContent = label;
  btn.dataset.action = "toggle-month-ahead";
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-pressed", options.monthAhead ? "true" : "false");
  if (options.monthAhead) btn.classList.add("is-on");
  return btn;
}

function createLanguageToggle(): HTMLButtonElement {
  const btn = el("button", "language-toggle");
  const current = getLocale();
  const next = SUPPORTED_LOCALES[(SUPPORTED_LOCALES.indexOf(current) + 1) % SUPPORTED_LOCALES.length] as Locale;
  const label = next === "nb" ? t("switchToNorwegian") : t("switchToEnglish");
  btn.textContent = label;
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", () => {
    setLocale(next);
    if (typeof location !== "undefined") location.reload();
  });
  return btn;
}

function renderSettingsMenu(options: RenderAgendaOptions): HTMLElement {
  const menu = document.createElement("details");
  menu.className = "agenda-settings-menu";

  const summary = el("summary", "agenda-settings-summary");
  summary.textContent = t("settings");
  summary.setAttribute("aria-label", t("settings"));
  menu.appendChild(summary);

  const panel = el("div", "agenda-settings-panel");
  panel.append(
    createHideTagsToggle(options),
    createHideEmptyDaysToggle(options),
    createHideCompletedToggle(options),
    createMonthAheadToggle(options),
    createNotificationToggle({ label: true }),
    createLanguageToggle(),
  );
  menu.appendChild(panel);

  panel.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      menu.open = false;
    });
  });

  return menu;
}

function renderActiveTagFilters(tags: readonly string[]): HTMLElement {
  const row = el("div", "active-tag-filters");

  const label = el("span", "active-tag-filters-label");
  label.textContent = t("filtering");
  row.appendChild(label);

  for (const tag of tags) {
    row.appendChild(renderTag(tag, { selected: true }));
  }

  const clearBtn = el("button", "clear-tag-filters");
  clearBtn.textContent = t("clear");
  clearBtn.dataset.action = "clear-tag-filters";
  row.appendChild(clearBtn);
  return row;
}

// ── Deadlines ────────────────────────────────────────────────────────

function renderDeadlines(deadlines: DeadlineItem[]): HTMLElement {
  const section = el("section", "deadlines-section");

  for (const dl of deadlines) {
    const row = el("div", "deadline-item");
    if (dl.instanceNote) row.classList.add("has-instance-note");
    row.classList.add(getDeadlineUrgencyClass(dl.daysUntil));
    if (dl.entry.todo === "DONE") row.classList.add("item-done");
    if (dl.entry.checkboxItems.length > 0) row.classList.add("has-checkbox-list");
    if (usesRingState(dl.entry)) row.classList.add("has-ring-state");
    const meta = el("span", "deadline-meta");
    const time = el("span", "item-time");
    time.textContent = formatDeadlineDueText(dl.daysUntil);
    meta.append(time);

    const checkboxListId = dl.entry.checkboxItems.length > 0 ? nextCheckboxListId() : null;
    const checkboxListKey = checkboxListId
      ? `deadline:${dl.entry.sourceLineNumber}:${dl.baseDate ?? formatDateKey(dl.dueDate)}`
      : null;
    const title = renderTitle(dl.entry);
    if (dl.baseDate) title.dataset.baseDate = dl.baseDate;
    const collapsible = checkboxListId && checkboxListKey
      ? wireProgressBadgeAsToggle(title, checkboxListId, checkboxListKey)
      : false;

    const main = el("span", "deadline-main");
    main.append(renderStateBadge(dl.entry), renderTitleWithTags(title, dl.entry.tags));

    row.append(meta, main);
    section.appendChild(row);
    if (dl.instanceNote) {
      section.appendChild(renderGlobalInstanceNote(dl.instanceNote, "deadline-note"));
    }
    if (dl.entry.checkboxItems.length > 0) {
      section.appendChild(renderCheckboxItems(
        dl.entry.checkboxItems,
        dl.entry.sourceLineNumber,
        "checkbox-list-deadline",
        dl.entry.priority !== null,
        checkboxListId ?? undefined,
        checkboxListKey ?? undefined,
        usesRingState(dl.entry),
        collapsible,
      ));
    }
  }

  return section;
}

// ── Overdue ─────────────────────────────────────────────────────────

function renderOverdue(items: OverdueItem[]): HTMLElement {
  const section = el("section", "overdue-section");

  const header = el("header", "overdue-header");
  header.textContent = t("overdue");
  section.appendChild(header);

  for (const item of items) {
    const row = el("div", "overdue-item");
    if (item.instanceNote) row.classList.add("has-instance-note");
    const meta = el("span", "overdue-meta");
    const time = el("span", "item-time");
    time.textContent = `-${item.daysOverdue}d`;
    const kind = el("span", "item-kind");
    kind.textContent = item.kind === "deadline" ? t("deadline") : t("overdueScheduled");
    const state = renderStateBadge(item.entry);
    meta.append(time, kind, state);

    const title = renderTitle(item.entry);
    if (item.baseDate) title.dataset.baseDate = item.baseDate;

    row.append(meta, renderTitleWithTags(title, item.entry.tags));
    section.appendChild(row);
    if (item.instanceNote) {
      section.appendChild(renderGlobalInstanceNote(item.instanceNote, "overdue-note"));
    }
  }

  return section;
}

// ── Someday ─────────────────────────────────────────────────────────

function renderSomeday(items: SomedayItem[]): HTMLElement {
  const section = el("section", "someday-section");

  for (const item of items) {
    const row = el("div", "someday-item");
    if (item.entry.todo === "DONE") row.classList.add("item-done");
    const state = renderStateBadge(item.entry, "TODO");
    if (state.classList.contains("is-ring-style")) row.classList.add("has-ring-state");
    const checkboxListId = item.entry.checkboxItems.length > 0 ? nextCheckboxListId() : null;
    const checkboxListKey = checkboxListId ? `someday:${item.entry.sourceLineNumber}` : null;
    const title = renderTitle(item.entry);
    const collapsible = checkboxListId && checkboxListKey
      ? wireProgressBadgeAsToggle(title, checkboxListId, checkboxListKey)
      : false;

    row.append(state, renderTitleWithTags(title, item.entry.tags));
    section.appendChild(row);
    if (item.entry.checkboxItems.length > 0) {
      section.appendChild(renderCheckboxItems(
        item.entry.checkboxItems,
        item.entry.sourceLineNumber,
        "checkbox-list-badge",
        item.entry.priority !== null,
        checkboxListId ?? undefined,
        checkboxListKey ?? undefined,
        row.classList.contains("has-ring-state"),
        collapsible,
      ));
    }
  }

  return section;
}

// ── Day card ─────────────────────────────────────────────────────────

function renderDay(day: AgendaDay, today: Date): HTMLElement {
  const card = el("article", "day-block");

  const isToday = isSameDate(day.date, today);
  if (isToday) card.classList.add("is-today");

  // Header
  const header = el("header", "day-header");
  header.dataset.action = "add-on-date";
  header.dataset.date = formatDateKey(day.date);
  header.tabIndex = 0;
  header.setAttribute("role", "button");
  const label = el("span", "date-label");
  let dayText = `${DAY_NAMES[day.date.getDay()]} ${formatDayMonth(day.date)}`;
  if (day.date.getDay() === 1) {
    dayText += ` (${t("weekAbbrev")}${getISOWeek(day.date)})`;
  }
  label.textContent = dayText;
  header.setAttribute("aria-label", t("addEventOn", { date: dayText }));
  header.appendChild(label);

  if (isToday) {
    header.appendChild(el("span", "today-marker"));
  }

  card.appendChild(header);

  // Separate items by category
  const allDay = day.items.filter((i) => i.category === "all-day");
  const rest = day.items.filter((i) => i.category !== "all-day");

  // All-day section
  if (allDay.length > 0) {
    const section = el("div", "allday-section");
    for (const item of allDay) {
      section.appendChild(renderItemForCategory(item));
      if (item.instanceNote) {
        section.appendChild(renderInstanceNote(item));
      }
    }
    card.appendChild(section);
  }

  // Timed / scheduled section
  if (rest.length > 0) {
    const section = el("div", "timed-section");

    const nowMinutes = isToday
      ? today.getHours() * 60 + today.getMinutes()
      : -1;
    let nowLineInserted = !isToday;

    for (const item of rest) {
      // Insert now line before the first item that starts at or after current time
      if (!nowLineInserted) {
        const itemMinutes = item.startTime ? timeToMinutes(item.startTime) : -1;
        if (itemMinutes >= nowMinutes) {
          section.appendChild(renderNowLine(today));
          nowLineInserted = true;
        }
      }

      const checkboxListId = item.entry.checkboxItems.length > 0 ? nextCheckboxListId() : null;
      const checkboxListKey = checkboxListId ? checkboxKeyForAgendaItem(item) : null;

      const itemRow = renderItemForCategory(item, checkboxListId, checkboxListKey);
      section.appendChild(itemRow);

      // Instance note (per-occurrence)
      if (item.instanceNote) {
        section.appendChild(renderInstanceNote(item));
      }

      // Body text
      if (item.entry.body) {
        const body = el("div", "item-body");
        body.textContent = item.entry.body;
        section.appendChild(body);
      }

      // Checkbox items
      if (item.entry.checkboxItems.length > 0) {
        section.appendChild(renderCheckboxItems(
          item.entry.checkboxItems,
          item.entry.sourceLineNumber,
          getCheckboxLayoutClass(item),
          item.entry.priority !== null,
          checkboxListId ?? undefined,
          checkboxListKey ?? undefined,
          itemRow.classList.contains("has-ring-state"),
          item.entry.progress !== null,
        ));
      }
    }

    // If all items are before now, append the line at the end
    if (!nowLineInserted) {
      section.appendChild(renderNowLine(today));
    }

    card.appendChild(section);
  }

  // Empty day
  if (allDay.length === 0 && rest.length === 0) {
    const empty = el("div", "day-empty");
    empty.textContent = "—";
    card.appendChild(empty);
  }

  return card;
}

// ── Item renderers ───────────────────────────────────────────────────

function renderItem(
  item: AgendaItem,
  className: string,
  badge?: HTMLElement | HTMLElement[],
  showTime?: "always" | "optional",
  showPriority: boolean = true,
  checkboxListId: string | null = null,
  checkboxListKey: string | null = null,
): HTMLElement {
  const row = el("div", className);
  if (item.entry.todo === "DONE") row.classList.add("item-done");
  if (item.skipped) row.classList.add("item-skipped");

  const children: HTMLElement[] = [];
  const badges = badge ? (Array.isArray(badge) ? badge : [badge]) : [];

  const hasTime = showTime === "always" || (showTime === "optional" && item.startTime);
  if (hasTime) {
    if (showTime === "optional") row.classList.add("has-time");
    const time = el("span", "item-time");
    time.textContent = formatTimeRange(item.startTime, item.endTime);
    children.push(time);
  }

  if (badges.some((el) => el.classList.contains("item-state"))) {
    row.classList.add("has-state");
    if (badges.some((el) => el.classList.contains("is-ring-style"))) row.classList.add("has-ring-state");
  }
  if (badges.some((el) => el.classList.contains("item-all-day-marker"))) {
    row.classList.add("has-all-day-marker");
  }

  if (badge) {
    children.push(...badges);
  } else if (item.entry.todo) {
    row.classList.add("has-state");
    const stateBadge = renderStateBadge(item.entry);
    if (stateBadge.classList.contains("is-ring-style")) row.classList.add("has-ring-state");
    children.push(stateBadge);
  }

  if (!showPriority && item.entry.priority) {
    row.classList.add("has-priority");
    const pri = el("span", `item-priority priority-${item.entry.priority}`);
    pri.textContent = item.entry.priority;
    children.push(pri);
  }

  const title = renderTitle(item.entry, { showPriority });
  if (item.baseDate) title.dataset.baseDate = item.baseDate;
  if (item.override) {
    title.insertBefore(document.createTextNode(" "), title.firstChild);
    title.insertBefore(renderOverrideChip(item.override, moveDirection(item)), title.firstChild);
  }
  if (checkboxListId && checkboxListKey) wireProgressBadgeAsToggle(title, checkboxListId, checkboxListKey);
  children.push(renderTitleWithTags(title, item.entry.tags));
  row.append(...children);
  return row;
}

function renderOverrideChip(
  override: { kind: "cancelled" | "shift" | "reschedule"; detail: string },
  direction: "earlier" | "later",
): HTMLElement {
  if (override.kind === "cancelled") {
    const mark = el("span", "item-skipped-mark");
    mark.textContent = "•";
    mark.title = override.detail;
    mark.setAttribute("aria-label", t("skippedDetail", { detail: override.detail }));
    return mark;
  }
  const chip = el("span", "item-override-chip");
  chip.textContent = direction === "earlier" ? t("movedEarlier") : t("movedLater");
  chip.title = override.detail;
  chip.setAttribute("aria-label", `${chip.textContent} (${override.detail})`);
  return chip;
}

function moveDirection(item: AgendaItem): "earlier" | "later" {
  if (!item.baseDate) return "later";
  const parts = item.baseDate.split("-").map(Number);
  const baseInstantMs =
    new Date(parts[0], parts[1] - 1, parts[2]).getTime() +
    (item.baseStartMinutes ?? 0) * 60_000;
  return item.date.getTime() < baseInstantMs ? "earlier" : "later";
}

function renderInstanceNote(item: AgendaItem): HTMLElement {
  const row = el("div", buildInstanceNoteClassName(item));
  const text = el("div", "item-instance-note-text");
  text.textContent = item.instanceNote ?? "";
  row.appendChild(text);
  return row;
}

function renderGlobalInstanceNote(note: string, layoutClass: string): HTMLElement {
  const row = el("div", `item-instance-note ${layoutClass}`);
  const text = el("div", "item-instance-note-text");
  text.textContent = note;
  row.appendChild(text);
  return row;
}

function buildInstanceNoteClassName(item: AgendaItem): string {
  const byCategory = {
    "all-day": item.entry.todo
      ? ["note-layout-allday-with-state", "note-title-col-3"]
      : ["note-layout-allday", "note-title-col-2"],
    timed: ["note-layout-timed", item.entry.todo ? "note-title-col-3" : "note-title-col-2"],
    scheduled: item.startTime
      ? ["note-layout-with-time", "note-title-col-3"]
      : ["note-layout-compact", "note-title-col-2"],
    deadline: item.startTime
      ? ["note-layout-with-time", "note-title-col-3"]
      : ["note-layout-compact", "note-title-col-2"],
  } satisfies Record<AgendaItem["category"], string[]>;
  return ["item-instance-note", ...byCategory[item.category]].join(" ");
}

function renderItemForCategory(
  item: AgendaItem,
  checkboxListId: string | null = null,
  checkboxListKey: string | null = null,
): HTMLElement {
  if (item.category === "all-day") {
    const badges = [renderAllDayMarker()];
    if (item.entry.todo) badges.push(renderStateBadge(item.entry));
    return renderItem(item, "allday-item", badges);
  }
  if (item.category === "timed") return renderItem(item, "timed-item", undefined, "always", true, checkboxListId, checkboxListKey);
  if (item.category === "scheduled") {
    return renderItem(item, "scheduled-item", renderStateBadge(item.entry, "TODO"), "optional", true, checkboxListId, checkboxListKey);
  }

  const row = renderItem(item, "day-deadline-item", renderStateBadge(item.entry, "TODO"), "optional", true, checkboxListId, checkboxListKey);
  if (item.entry.checkboxItems.length > 0) row.classList.add("has-checkbox-list");
  return row;
}

function renderAllDayMarker(): HTMLElement {
  const marker = el("span", "item-all-day-marker");
  marker.title = t("allDay");
  marker.setAttribute("aria-label", t("allDay"));
  marker.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>`;
  return marker;
}

// ── State badge ─────────────────────────────────────────────────────

function renderStateBadge(
  entry: { todo: "TODO" | "DONE" | null; sourceLineNumber: number },
  fallback?: string,
): HTMLElement {
  const state = el("span", "item-state");
  state.textContent = entry.todo ?? fallback ?? "";
  if (entry.todo) {
    state.classList.add("is-toggleable");
    state.dataset.action = "toggle-done";
    state.dataset.line = String(entry.sourceLineNumber);
    state.setAttribute("role", "button");
    state.setAttribute("tabindex", "0");
    state.setAttribute("aria-label", entry.todo === "TODO" ? t("markDone") : t("markNotDone"));
  }
  if (state.textContent) {
    state.classList.add("is-ring-style");
    state.dataset.state = state.textContent;
    const ring = el("span", "item-state-ring");
    ring.setAttribute("aria-hidden", "true");
    state.prepend(ring);
  }
  return state;
}

// ── Now line ─────────────────────────────────────────────────────────

function renderNowLine(today: Date): HTMLElement {
  const row = el("div", "now-line");

  const time = el("span", "now-time");
  const hh = String(today.getHours()).padStart(2, "0");
  const mm = String(today.getMinutes()).padStart(2, "0");
  time.textContent = hh + ":" + mm;

  const label = el("span", "now-label");
  label.textContent = t("nowMarker");

  const rule = el("span", "now-rule");

  row.append(time, label, rule);
  return row;
}

// ── Helpers ──────────────────────────────────────────────────────────

function renderTitle(
  entry: { title: string; priority: "A" | "B" | "C" | null; progress?: { done: number; total: number } | null; sourceLineNumber: number },
  options: { showPriority?: boolean } = {},
): HTMLElement {
  const title = el("span", "item-title");
  title.dataset.action = "edit";
  title.dataset.line = String(entry.sourceLineNumber);
  title.setAttribute("role", "button");
  title.setAttribute("tabindex", "0");
  if (entry.priority && options.showPriority !== false) {
    const badge = el("span", `item-priority priority-${entry.priority}`);
    badge.textContent = entry.priority;
    title.appendChild(badge);
    title.appendChild(document.createTextNode(" "));
  }
  title.appendChild(document.createTextNode(entry.title));
  if (entry.progress) {
    title.appendChild(document.createTextNode(" "));
    const badge = el("span", "item-progress");
    badge.textContent = `${entry.progress.done}/${entry.progress.total}`;
    if (entry.progress.done === entry.progress.total && entry.progress.total > 0) {
      badge.classList.add("progress-complete");
    }
    title.appendChild(badge);
  }
  return title;
}

function renderCheckboxItems(
  items: readonly { text: string; checked: boolean }[],
  parentSourceLine: number,
  layoutClass?: string,
  hasPriority: boolean = false,
  listId?: string,
  listKey?: string,
  ringState: boolean = false,
  collapsible: boolean = true,
): HTMLElement {
  const list = el("div", "checkbox-list");
  if (listId) {
    list.id = listId;
    checkboxListsById.set(listId, list);
  }
  if (listKey) {
    renderedCheckboxListKeys.add(listKey);
    if (collapsible && isCheckboxListCollapsed(listKey)) list.classList.add("is-collapsed");
  }
  if (layoutClass) list.classList.add(layoutClass);
  if (hasPriority) list.classList.add("checkbox-list-has-priority");
  if (ringState) list.classList.add("checkbox-list-ring-state");

  const hideCompleted = currentRenderOptions.hideCompletedAndSkipped === true;
  const rows = el("div", "checkbox-list-items");
  if (listKey) rows.dataset.listKey = listKey;
  rows.dataset.line = String(parentSourceLine);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (hideCompleted && item.checked) continue;
    const row = el("div", "checkbox-item");
    if (item.checked) row.classList.add("checkbox-checked");
    row.dataset.line = String(parentSourceLine);
    row.dataset.checkboxIndex = String(i);
    if (listKey) row.dataset.listKey = listKey;
    // Row-level toggle stays as a fallback for keyboard activation and clicks
    // on the gap between icon and label. The label's own data-action takes
    // precedence on label clicks (closest() finds the label first), so tapping
    // the text enters edit mode instead of toggling.
    row.dataset.action = "toggle-checkbox";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-label", item.checked ? t("markNotDone") : t("markDone"));
    const icon = el("span", "checkbox-icon");
    icon.setAttribute("aria-hidden", "true");
    const label = el("span", "checkbox-label");
    label.textContent = item.text;
    label.dataset.action = "edit-checkbox";
    label.dataset.line = String(parentSourceLine);
    label.dataset.checkboxIndex = String(i);
    if (listKey) label.dataset.listKey = listKey;
    row.append(icon, label);
    rows.appendChild(row);
  }
  list.appendChild(rows);
  return list;
}

let checkboxListIdCounter = 0;
const checkboxListsById = new Map<string, HTMLElement>();
const checkboxListCollapseState = new Map<string, boolean>();
let renderedCheckboxListKeys = new Set<string>();

function nextCheckboxListId(): string {
  checkboxListIdCounter += 1;
  return `checklist-${checkboxListIdCounter}`;
}

function usesRingState(entry: { todo: string | null }): boolean {
  return entry.todo !== null;
}

function checkboxKeyForAgendaItem(item: AgendaItem): string {
  return [
    "day",
    formatDateKey(item.date),
    item.category,
    item.entry.sourceLineNumber,
    item.baseDate ?? formatDateKey(item.date),
    item.startTime ?? "",
  ].join(":");
}

function isCheckboxListCollapsed(listKey: string): boolean {
  return checkboxListCollapseState.get(listKey) ?? true;
}

function wireProgressBadgeAsToggle(title: HTMLElement, listId: string, listKey: string): boolean {
  const badge = title.querySelector<HTMLElement>(".item-progress");
  if (!badge) return false;
  const initiallyCollapsed = isCheckboxListCollapsed(listKey);
  badge.classList.add("item-progress-toggle");
  badge.setAttribute("role", "button");
  badge.setAttribute("tabindex", "0");
  badge.setAttribute("aria-controls", listId);
  badge.setAttribute("aria-expanded", initiallyCollapsed ? "false" : "true");
  badge.setAttribute("aria-label", initiallyCollapsed ? t("showChecklist") : t("hideChecklist"));
  const toggle = (event: Event) => {
    event.stopPropagation();
    const list = checkboxListsById.get(listId) ?? document.getElementById(listId);
    if (!list) return;
    const collapsed = list.classList.toggle("is-collapsed");
    checkboxListCollapseState.set(listKey, collapsed);
    badge.setAttribute("aria-expanded", collapsed ? "false" : "true");
    badge.setAttribute("aria-label", collapsed ? t("showChecklist") : t("hideChecklist"));
  };
  badge.addEventListener("click", toggle);
  badge.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle(event);
    }
  });
  return true;
}

function getCheckboxLayoutClass(item: AgendaItem): string {
  if (item.category === "timed") {
    return item.entry.todo ? "checkbox-list-time-badge" : "checkbox-list-time";
  }
  return item.startTime ? "checkbox-list-time-badge" : "checkbox-list-badge";
}

function optionsForTags(): Pick<RenderAgendaOptions, "activeTagFilters" | "hideTags"> {
  return currentRenderOptions;
}

let currentRenderOptions: Pick<RenderAgendaOptions, "activeTagFilters" | "hideTags" | "hideCompletedAndSkipped"> = {};

function renderTags(tags: readonly string[], options: Pick<RenderAgendaOptions, "activeTagFilters" | "hideTags">): HTMLElement {
  const badges = el("span", "tag-badges");
  if (options.hideTags) {
    badges.hidden = true;
    return badges;
  }
  for (const tag of tags) {
    badges.appendChild(renderTag(tag, {
      selected: (options.activeTagFilters ?? []).includes(tag),
    }));
  }
  return badges;
}

function renderTitleWithTags(title: HTMLElement, tags: readonly string[]): HTMLElement {
  if (currentRenderOptions.hideTags || tags.length === 0) return title;

  const stack = el("span", "item-title-stack");
  stack.append(title, renderTags(tags, optionsForTags()));
  return stack;
}

function renderTag(
  tag: string,
  options: { selected?: boolean } = {},
): HTMLElement {
  const span = el("span", "tag");
  span.dataset.tag = tag;
  span.dataset.action = "toggle-tag-filter";
  span.textContent = `#${tag}`;
  span.setAttribute("role", "button");
  span.setAttribute("tabindex", "0");
  span.setAttribute("aria-pressed", options.selected ? "true" : "false");
  span.setAttribute(
    "aria-label",
    options.selected
      ? t("removeTagFilter", { tag })
      : t("filterByTag", { tag }),
  );
  if (options.selected) span.classList.add("is-selected");
  return span;
}

export function renderAgenda(
  container: HTMLElement,
  week: readonly AgendaDay[],
  deadlines: DeadlineItem[],
  overdue: OverdueItem[],
  someday: SomedayItem[],
  today: Date,
  options: RenderAgendaOptions = {},
): void {
  currentRenderOptions = {
    activeTagFilters: options.activeTagFilters ?? [],
    hideTags: options.hideTags ?? false,
    hideCompletedAndSkipped: options.hideCompletedAndSkipped ?? false,
  };
  renderAgendaBase(container, week, deadlines, overdue, someday, today, options);
  currentRenderOptions = {};
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return "";
  if (!end) return start;
  return `${start}–${end}`;
}

function formatDeadlineDueText(daysUntil: number): string {
  if (daysUntil === 0) return "Today";
  return `${daysUntil}d`;
}

function getDeadlineUrgencyClass(daysUntil: number): string {
  if (daysUntil <= 3) return "deadline-urgency-critical";
  if (daysUntil <= 7) return "deadline-urgency-warning";
  if (daysUntil <= 14) return "deadline-urgency-caution";
  return "deadline-urgency-calm";
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getISOWeek(d: Date): number {
  const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const jan4 = new Date(tmp.getFullYear(), 0, 4);
  return 1 + Math.round(((tmp.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatDateRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameMonth && sameYear) {
    return `${formatDayNumber(start.getDate())}–${formatDayNumber(end.getDate())} ${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
  }
  if (sameYear) {
    return `${formatDayMonth(start)} – ${formatDayMonth(end)} ${start.getFullYear()}`;
  }
  return `${formatDayMonth(start)} ${start.getFullYear()} – ${formatDayMonth(end)} ${end.getFullYear()}`;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K];
function el(tag: string, className?: string): HTMLElement;
function el(tag: string, className?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
