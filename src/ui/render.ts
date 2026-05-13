/**
 * DOM rendering: AgendaDay[] + DeadlineItem[] → HTML.
 *
 * Reads from the agenda data model, writes to the DOM.
 * No parsing or date logic here — that belongs to earlier stages.
 */

import type { AgendaDay, AgendaItem, DeadlineItem, OverdueItem, SomedayItem } from "../agenda/model.ts";
import { notificationsEnabled, setNotificationsEnabled, requestPermission, clearScheduled, scheduleNotifications } from "./notifications.ts";
import { DAY_NAMES, MONTH_ABBREVS, formatDayMonth, formatDayNumber } from "../dateLabels.ts";
import { t, type Locale, getLocale, setLocale, SUPPORTED_LOCALES } from "../i18n.ts";

export interface RenderAgendaOptions {
  readonly activeTagFilters?: readonly string[];
  readonly activePriorityFilter?: "A" | "B" | "C" | null;
  readonly hideTags?: boolean;
  readonly hideEmptyDays?: boolean;
  readonly hideCompletedAndSkipped?: boolean;
  readonly monthAhead?: boolean;
  readonly hideDeadlines?: boolean;
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
  if (deadlines.length > 0 && !options.hideDeadlines) {
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

  actions.append(renderSettingsMenu(options));
  header.append(nav, todayBtn, actions);

  if (!document.querySelector(".add-item-fab")) {
    const addBtn = el("button", "add-item-fab add-item-btn");
    addBtn.textContent = t("addLabel");
    addBtn.dataset.action = "add";
    addBtn.setAttribute("aria-label", t("addAria"));
    document.body.appendChild(addBtn);
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

function createHideDeadlinesToggle(options: RenderAgendaOptions): HTMLButtonElement {
  const btn = el("button", "hide-deadlines-toggle");
  const label = options.hideDeadlines ? t("showDeadlines") : t("hideDeadlines");
  btn.textContent = label;
  btn.dataset.action = "toggle-hide-deadlines";
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-pressed", options.hideDeadlines ? "true" : "false");
  if (options.hideDeadlines) btn.classList.add("is-on");
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

function createLanguageButtons(): [HTMLHRElement, HTMLDivElement] {
  const divider = document.createElement("hr");
  divider.className = "settings-divider";

  const group = el("div", "language-btn-group") as HTMLDivElement;
  const current = getLocale();
  const labelKeys = { en: "languageEnglish", nb: "languageNorwegian", it: "languageItalian", de: "languageGerman" } as const;

  for (const locale of SUPPORTED_LOCALES) {
    const btn = el("button", "language-btn");
    if (locale === current) btn.classList.add("language-btn--active");
    const label = t(labelKeys[locale]);
    btn.textContent = label;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-pressed", String(locale === current));
    btn.addEventListener("click", () => {
      setLocale(locale);
      if (typeof location !== "undefined") location.reload();
    });
    group.appendChild(btn);
  }

  return [divider, group];
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
    createHideDeadlinesToggle(options),
    createMonthAheadToggle(options),
    createNotificationToggle({ label: true }),
    ...createLanguageButtons(),
  );
  menu.appendChild(panel);

  panel.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      menu.open = false;
    });
  });

  return menu;
}

// ── Deadlines ────────────────────────────────────────────────────────

function renderDeadlines(deadlines: DeadlineItem[]): HTMLElement {
  const section = el("section", "deadlines-section");

  for (const dl of deadlines) {
    const row = el("div", "deadline-item");
    row.classList.add(getDeadlineUrgencyClass(dl.daysUntil));
    if (dl.entry.todo === "DONE") row.classList.add("item-done");
    const time = el("span", "item-time");
    time.textContent = formatDeadlineDueText(dl.daysUntil);
    if (dl.entry.todo) {
      time.classList.add("is-toggleable");
      time.dataset.action = "toggle-done";
      time.dataset.line = String(dl.entry.sourceLineNumber);
      time.setAttribute("role", "button");
      time.setAttribute("tabindex", "0");
      time.setAttribute("aria-label", dl.entry.todo === "TODO" ? t("markDone") : t("markNotDone"));
    }

    const title = renderTitle(dl.entry);
    if (dl.baseDate) title.dataset.baseDate = dl.baseDate;
    const checklist = dl.entry.checkboxItems.length > 0
      ? renderCheckboxItems(dl.entry.checkboxItems, dl.entry.sourceLineNumber)
      : null;

    row.append(time, renderTitleWithTags(title, dl.entry.tags, dl.instanceNote, checklist));
    section.appendChild(row);
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
    const time = el("span", "item-time");
    time.textContent = `-${item.daysOverdue}d`;
    const kind = el("span", "item-kind");
    kind.textContent = item.kind === "deadline" ? t("deadline") : t("overdueScheduled");
    const state = renderStateBadge(item.entry);

    const title = renderTitle(item.entry);
    if (item.baseDate) title.dataset.baseDate = item.baseDate;

    row.append(time, kind, state, renderTitleWithTags(title, item.entry.tags, item.instanceNote));
    section.appendChild(row);
  }

  return section;
}

// ── Someday ─────────────────────────────────────────────────────────

function renderSomeday(items: SomedayItem[]): HTMLElement {
  const section = el("section", "someday-section");

  const header = el("header", "day-header");
  const label = el("span", "date-label someday-label");
  label.textContent = t("someday");
  header.appendChild(label);
  section.appendChild(header);

  for (const item of items) {
    const row = el("div", "someday-item");
    if (item.entry.todo === "DONE") row.classList.add("item-done");
    const state = renderStateBadge(item.entry, "TODO");
    const title = renderTitle(item.entry);
    const checklist = item.entry.checkboxItems.length > 0
      ? renderCheckboxItems(item.entry.checkboxItems, item.entry.sourceLineNumber)
      : null;

    row.append(state, renderTitleWithTags(title, item.entry.tags, null, checklist));
    section.appendChild(row);
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
  const label = el("span", "date-label");
  const dayText = `${DAY_NAMES[day.date.getDay()]} ${formatDayMonth(day.date)}`;
  label.textContent = dayText;
  label.dataset.action = "add-on-date";
  label.dataset.date = formatDateKey(day.date);
  label.tabIndex = 0;
  label.setAttribute("role", "button");
  label.setAttribute("aria-label", t("addEventOn", { date: dayText }));
  header.appendChild(label);

  card.appendChild(header);

  // Separate items by category
  const allDay = day.items.filter((i) => i.category === "all-day");
  const rest = day.items.filter((i) => i.category !== "all-day");

  // All-day section
  if (allDay.length > 0) {
    const section = el("div", "allday-section");
    for (const item of allDay) {
      section.appendChild(renderItemForCategory(item));
    }
    card.appendChild(section);
  }

  // Timed / scheduled section
  if (rest.length > 0) {
    const section = el("div", "timed-section");

    for (const item of rest) {
      const itemRow = renderItemForCategory(item);
      section.appendChild(itemRow);

      // Body text
      if (item.entry.body) {
        const body = el("div", "item-body");
        body.textContent = item.entry.body;
        section.appendChild(body);
      }
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
): HTMLElement {
  const row = el("div", className);
  if (item.entry.todo === "DONE") row.classList.add("item-done");
  if (item.skipped) row.classList.add("item-skipped");

  const badges = badge ? (Array.isArray(badge) ? badge : [badge]) : [];
  const hasTime = showTime === "always" || (showTime === "optional" && item.startTime);
  const stateBadge = badges.find((el) => el.classList.contains("item-state"))
    ?? (item.entry.todo ? renderStateTextBadge(item.entry) : null);

  if (hasTime) row.classList.add("has-time");
  if (stateBadge) {
    row.classList.add("has-state");
  }

  const title = renderTitle(item.entry);
  if (item.baseDate) title.dataset.baseDate = item.baseDate;
  if (item.override) {
    title.insertBefore(document.createTextNode(" "), title.firstChild);
    title.insertBefore(renderOverrideChip(item.override, moveDirection(item)), title.firstChild);
  }
  const checklist = item.entry.checkboxItems.length > 0
    ? renderCheckboxItems(item.entry.checkboxItems, item.entry.sourceLineNumber)
    : null;
  const metadata = metadataForItem(item, hasTime, stateBadge);
  row.append(renderTitleWithTags(title, item.entry.tags, item.instanceNote, checklist, metadata));
  return row;
}

type MetadataPart = string | HTMLElement;

function metadataForItem(item: AgendaItem, hasTime: boolean, stateBadge: HTMLElement | null): MetadataPart[] {
  const parts: MetadataPart[] = [];
  if (stateBadge) {
    stateBadge.textContent = taskStateMetadataLabel(item);
    if (hasTime) {
      const timeStr = formatTimeRange(item.startTime, item.endTime);
      if (timeStr) stateBadge.appendChild(document.createTextNode(" " + timeStr));
    }
    parts.push(stateBadge);
  }
  if (hasTime && !stateBadge) parts.push(formatTimeRange(item.startTime, item.endTime));
  if (item.category === "all-day") parts.push(t("allDay"));
  return parts;
}

function taskStateMetadataLabel(item: AgendaItem): string {
  if (item.entry.todo === "DONE") return t("taskDoneMeta");
  if (item.category === "deadline") return t("taskDeadlineMeta");
  if (item.category === "scheduled") return t("taskScheduledMeta");
  return t("taskOpenMeta");
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

function renderItemForCategory(item: AgendaItem): HTMLElement {
  if (item.category === "all-day") {
    return renderItem(item, "allday-item", item.entry.todo ? renderStateTextBadge(item.entry) : undefined);
  }
  if (item.category === "timed") return renderItem(item, "timed-item", undefined, "always");
  if (item.category === "scheduled") {
    return renderItem(item, "scheduled-item", renderStateTextBadge(item.entry, "TODO"), "optional");
  }

  return renderItem(item, "day-deadline-item", renderStateTextBadge(item.entry, "TODO"), "optional");
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
    state.dataset.state = state.textContent;
    const mark = el("span", "item-state-mark");
    mark.setAttribute("aria-hidden", "true");
    state.prepend(mark);
  }
  return state;
}

function renderStateTextBadge(
  entry: { todo: "TODO" | "DONE" | null; sourceLineNumber: number },
  fallback?: string,
): HTMLElement {
  const state = renderStateBadge(entry, fallback);
  state.classList.add("item-state-text");
  const mark = state.querySelector(".item-state-mark");
  mark?.remove();
  return state;
}

// ── Now line ─────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────────────

function renderTitle(
  entry: { title: string; priority: "A" | "B" | "C" | null; sourceLineNumber: number },
): HTMLElement {
  const title = el("span", "item-title");
  title.dataset.action = "edit";
  title.dataset.line = String(entry.sourceLineNumber);
  title.setAttribute("role", "button");
  title.setAttribute("tabindex", "0");
  if (entry.priority) {
    title.appendChild(renderPriorityBadge(entry.priority, {
      selected: (currentRenderOptions.activePriorityFilter ?? null) === entry.priority,
    }));
    title.appendChild(document.createTextNode(" "));
  }
  const titleText = el("span", "item-title-text");
  titleText.textContent = entry.title;
  title.appendChild(titleText);
  return title;
}

function priorityMarks(priority: "A" | "B" | "C"): string {
  if (priority === "A") return "!!!";
  if (priority === "B") return "!!";
  return "!";
}

function renderCheckboxItems(
  items: readonly { text: string; checked: boolean }[],
  parentSourceLine: number,
): HTMLElement {
  const list = el("div", "checkbox-list");
  const hideCompleted = currentRenderOptions.hideCompletedAndSkipped === true;
  const rows = el("div", "checkbox-list-items");
  rows.dataset.line = String(parentSourceLine);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (hideCompleted && item.checked) continue;
    const row = el("div", "checkbox-item");
    if (item.checked) row.classList.add("checkbox-checked");
    row.dataset.line = String(parentSourceLine);
    row.dataset.checkboxIndex = String(i);
    row.dataset.action = "toggle-checkbox";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-label", item.checked ? t("markNotDone") : t("markDone"));
    const icon = el("span", "checkbox-icon");
    icon.setAttribute("aria-hidden", "true");
    const label = el("span", "checkbox-label");
    label.textContent = item.text;
    row.append(icon, label);
    rows.appendChild(row);
  }
  list.appendChild(rows);
  return list;
}

let currentRenderOptions: Pick<RenderAgendaOptions, "activeTagFilters" | "activePriorityFilter" | "hideTags" | "hideCompletedAndSkipped"> = {};

function renderTitleWithTags(
  title: HTMLElement,
  tags: readonly string[],
  instanceNote: string | null = null,
  checklist: HTMLElement | null = null,
  metadata: readonly MetadataPart[] = [],
): HTMLElement {
  if (currentRenderOptions.hideTags && !instanceNote && !checklist && metadata.length === 0) return title;
  if (tags.length === 0 && !instanceNote && !checklist && metadata.length === 0) return title;

  const stack = el("span", "item-title-stack");
  stack.appendChild(title);
  if (metadata.length > 0 || (!currentRenderOptions.hideTags && tags.length > 0)) {
    stack.appendChild(renderMetadata(metadata, tags));
  }
  if (instanceNote) {
    const note = el("span", "item-instance-note");
    note.textContent = instanceNote;
    stack.appendChild(note);
  }
  if (checklist) stack.appendChild(checklist);
  return stack;
}

function renderMetadata(metadata: readonly MetadataPart[], tags: readonly string[]): HTMLElement {
  const row = el("span", "item-metadata");
  for (const part of metadata) {
    appendMetadataSeparator(row);
    if (typeof part === "string") {
      const item = el("span", "item-meta-text");
      item.textContent = part;
      row.appendChild(item);
    } else {
      part.classList.add("item-meta-state");
      row.appendChild(part);
    }
  }
  if (!currentRenderOptions.hideTags) {
    if (tags.length > 0) {
      appendMetadataSeparator(row);
      const tagGroup = el("span", "item-meta-tags");
      for (const tag of tags) {
        tagGroup.appendChild(renderTag(tag, {
          selected: (currentRenderOptions.activeTagFilters ?? []).includes(tag),
        }));
      }
      row.appendChild(tagGroup);
    }
  }
  return row;
}

function appendMetadataSeparator(row: HTMLElement): void {
  if (!row.hasChildNodes()) return;
  const separator = el("span", "item-meta-separator");
  separator.textContent = "·";
  separator.setAttribute("aria-hidden", "true");
  row.appendChild(separator);
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

function renderPriorityBadge(
  priority: "A" | "B" | "C",
  options: { selected?: boolean } = {},
): HTMLElement {
  const badge = el("span", `item-priority priority-${priority}`);
  const marks = priorityMarks(priority);
  badge.dataset.priority = priority;
  badge.dataset.action = "toggle-priority-filter";
  badge.textContent = marks;
  badge.setAttribute("role", "button");
  badge.setAttribute("tabindex", "0");
  badge.setAttribute("aria-pressed", options.selected ? "true" : "false");
  badge.setAttribute(
    "aria-label",
    options.selected
      ? t("removePriorityFilter", { priority: marks })
      : t("filterByPriority", { priority: marks }),
  );
  if (options.selected) badge.classList.add("is-selected");
  return badge;
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
    activePriorityFilter: options.activePriorityFilter ?? null,
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

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatDateRange(start: Date, end: Date): string {
  const currentYear = new Date().getFullYear();
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameMonth && sameYear) {
    const year = start.getFullYear() === currentYear ? "" : ` ${start.getFullYear()}`;
    return `${formatDayNumber(start.getDate())}–${formatDayNumber(end.getDate())} ${MONTH_ABBREVS[start.getMonth()]}${year}`;
  }
  if (sameYear) {
    const year = start.getFullYear() === currentYear ? "" : ` ${start.getFullYear()}`;
    return `${formatDayMonth(start, MONTH_ABBREVS)} – ${formatDayMonth(end, MONTH_ABBREVS)}${year}`;
  }
  return `${formatDayMonth(start, MONTH_ABBREVS)} ${start.getFullYear()} – ${formatDayMonth(end, MONTH_ABBREVS)} ${end.getFullYear()}`;
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
