import { parseOrg } from "./org/parser.ts";
import { upsertProperty, removeProperty } from "./org/drawer.ts";
import type { OrgEntry, RecurrenceException, RecurrenceOverride } from "./org/model.ts";
import {
  appendAgendaItemToSource,
  appendQuickCaptureToTasks,
  deleteOrgBlockInSource,
  replaceOrgBlockInSource,
  toggleCheckboxInSource,
  toggleDoneInSource,
} from "./org/sourceEdit.ts";
import { stepDate } from "./org/timestamp.ts";
import { generateAgenda, collectDeadlines, collectOverdueItems, collectSomedayItems } from "./agenda/generate.ts";
import { renderAgenda } from "./ui/render.ts";
import type { AgendaDay } from "./agenda/model.ts";
import { scheduleNotifications } from "./ui/notifications.ts";
import { DAY_ABBREVS, MONTH_ABBREVS, formatDayNumber } from "./dateLabels.ts";
import { t } from "./i18n.ts";

// ── Constants ───────────────────────────────────────────────────────

const MAX_INPUT_BYTES = 4 * 1024 * 1024; // 4 MB
const MONTH_AHEAD_DAYS = 30;

// ── State ────────────────────────────────────────────────────────────

let entries = parseOrg("");
let currentStart = todayMidnight();
let currentSource = localStorage.getItem("mediant-org-source") ?? "";
let serverMode = false;
let serverVersion: string | null = null;
let agendaLoaded = false;
let activeTagFilters = new Set<string>();
let activePriorityFilter: "A" | "B" | "C" | null = null;
let hideTags = localStorage.getItem("mediant-hide-tags") === "true";
let hideEmptyDays = localStorage.getItem("mediant-hide-empty-days") === "true";
let hideCompletedAndSkipped = localStorage.getItem("mediant-hide-completed") === "true";
let monthAhead = localStorage.getItem("mediant-month-ahead") === "true";
let hideDeadlines = localStorage.getItem("mediant-hide-deadlines") === "true";

let quickCaptureOverlayEl: HTMLElement | null = null;
let quickCaptureInputEl: HTMLInputElement | null = null;
let quickCaptureErrorEl: HTMLElement | null = null;
let quickCaptureLastFocusEl: HTMLElement | null = null;

/** Collect every unique tag from the current parsed entries. */
function collectAllTags(): string[] {
  const tags = new Set<string>();
  for (const entry of entries) {
    for (const tag of entry.tags) tags.add(tag);
  }
  return [...tags].sort();
}

// ── Add-item panel ─────────────────────────────────────────────────

let addPanelEl: HTMLDialogElement | null = null;
let addPanelDeleteBtnEl: HTMLButtonElement | null = null;
let deleteArmedTimer: number | null = null;
let editingLine: number | null = null;
let editingBaseDate: string | null = null;
let editingLevel: number = 1;
let editingPriority: "A" | "B" | "C" | null = null;
let editingTodoState: "TODO" | "DONE" = "TODO";
let editingSchedRepeater: string | null = null;
let editingDeadRepeater: string | null = null;
let editingCheckboxItems: { text: string; checked: boolean }[] = [];

interface TagPicker {
  container: HTMLElement;
  getTags: () => string[];
  setTags: (tags: string[]) => void;
  onChange: (callback: (() => void) | null) => void;
  focus: () => void;
}

interface DateTimeInput {
  container: HTMLElement;
  input: HTMLInputElement;
  preview: HTMLElement;
}

interface AddPanelRefs {
  typeGroup: HTMLElement;
  priorityGroup: HTMLElement;
  titleInput: HTMLInputElement;
  when: DateTimeInput;
  sched: DateTimeInput;
  dead: DateTimeInput;
  tagPicker: TagPicker;
  repeatSelect: HTMLSelectElement;
  schedRepeatSelect: HTMLSelectElement;
  deadRepeatSelect: HTMLSelectElement;
  checkboxSection: HTMLElement;
  syncVisibility: () => void;
  occurrenceSection: HTMLElement;
  occurrenceMeta: HTMLElement;
  occurrenceState: HTMLElement;
  skipCheckboxRow: HTMLElement;
  skipCheckbox: HTMLInputElement;
  endSeriesCheckboxRow: HTMLElement;
  endSeriesCheckbox: HTMLInputElement;
  occurrenceInput: HTMLInputElement;
  occurrencePreview: HTMLElement;
  noteTextarea: HTMLInputElement;
  bodyTextarea: HTMLTextAreaElement;
  clearOverrideBtn: HTMLButtonElement;
  datesSummonRow: HTMLElement;
  metadataSummonRow: HTMLElement;
  repeatSummonRow: HTMLElement;
  schedRepeatSummonRow: HTMLElement;
  deadRepeatSummonRow: HTMLElement;
  occCancelSummonBtn: HTMLButtonElement;
  occMoveSummonBtn: HTMLButtonElement;
  occNoteSummonBtn: HTMLButtonElement;
  occMoveFieldsWrapper: HTMLElement;
  occNoteFieldsWrapper: HTMLElement;
  occSummonRow: HTMLElement;
}
let addPanelRefs: AddPanelRefs | null = null;

let revealedSched = false;
let revealedDead = false;
let revealedTags = false;
let revealedPriority = false;
let revealedRepeat = false;
let revealedSchedRepeat = false;
let revealedDeadRepeat = false;
let revealedOccCancel = false;
let revealedOccMove = false;
let revealedOccNote = false;
let revealedDescription = false;
let queuedEditSource: string | null = null;
let queuedEditEpoch: number | null = null;
let inFlightEditSource: string | null = null;
let inFlightEditEpoch: number | null = null;
let editSaveInFlight = false;
let editSavePromise: Promise<boolean> | null = null;
let sourceEpoch = 0;

function buildQuickCaptureOverlay(): void {
  quickCaptureOverlayEl = document.createElement("div");
  quickCaptureOverlayEl.className = "quick-capture-overlay";
  quickCaptureOverlayEl.addEventListener("click", (e) => {
    if (!box.contains(e.target as Node)) closeQuickCapture();
  });

  const box = document.createElement("div");
  box.className = "quick-capture-box";

  quickCaptureInputEl = document.createElement("input");
  quickCaptureInputEl.type = "text";
  quickCaptureInputEl.className = "quick-capture-input";
  quickCaptureInputEl.placeholder = t("quickTaskCapture");
  quickCaptureInputEl.autocomplete = "off";
  quickCaptureInputEl.spellcheck = true;
  quickCaptureInputEl.setAttribute("aria-label", t("quickTaskCapture"));
  quickCaptureInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submitQuickCapture();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeQuickCapture();
    }
  });

  quickCaptureErrorEl = document.createElement("div");
  quickCaptureErrorEl.className = "quick-capture-error";
  quickCaptureErrorEl.setAttribute("role", "status");

  box.append(quickCaptureInputEl, quickCaptureErrorEl);
  quickCaptureOverlayEl.appendChild(box);
  document.body.appendChild(quickCaptureOverlayEl);
}

function openQuickCapture(): void {
  if (!quickCaptureOverlayEl || !quickCaptureInputEl || addPanelEl?.open || !agendaLoaded) return;
  const active = document.activeElement;
  quickCaptureLastFocusEl = active instanceof HTMLElement && !quickCaptureOverlayEl.contains(active) ? active : null;
  if (quickCaptureErrorEl) quickCaptureErrorEl.textContent = "";
  quickCaptureOverlayEl.classList.add("is-open");
  quickCaptureInputEl.focus();
  quickCaptureInputEl.select();
}

function closeQuickCapture(): void {
  if (!quickCaptureOverlayEl || !quickCaptureInputEl) return;
  quickCaptureOverlayEl.classList.remove("is-open");
  quickCaptureInputEl.value = "";
  if (quickCaptureErrorEl) quickCaptureErrorEl.textContent = "";
  const target = quickCaptureLastFocusEl;
  quickCaptureLastFocusEl = null;
  if (target?.isConnected) target.focus();
}

function isQuickCaptureOpen(): boolean {
  return quickCaptureOverlayEl?.classList.contains("is-open") ?? false;
}

async function submitQuickCapture(): Promise<void> {
  if (!quickCaptureInputEl) return;
  const text = quickCaptureInputEl.value.trim();
  if (!text) return;

  const updated = appendQuickCaptureToTasks(currentSource, text);
  if (updated === currentSource) return;

  quickCaptureInputEl.readOnly = true;
  if (quickCaptureErrorEl) quickCaptureErrorEl.textContent = "";
  try {
    const result = await persistSource(updated);
    if (result === "saved") {
      quickCaptureInputEl.value = "";
    } else if (quickCaptureErrorEl) {
      quickCaptureErrorEl.textContent = t("couldNotSaveTask");
    }
  } finally {
    quickCaptureInputEl.readOnly = false;
  }
}

function eventRepeatOptions(): { value: string; label: string }[] {
  return [
    { value: "", label: t("repeatNone") },
    { value: "+1d", label: t("repeatEveryDay") },
    { value: "+1w", label: t("repeatEveryWeek") },
    { value: "+2w", label: t("repeatEvery2Weeks") },
    { value: "+1m", label: t("repeatEveryMonth") },
    { value: "+1y", label: t("repeatEveryYear") },
  ];
}

function todoRepeatOptions(): { value: string; label: string }[] {
  return [
    ...eventRepeatOptions(),
    { value: "++1d", label: t("repeatNextFutureDay") },
    { value: "++1w", label: t("repeatNextFutureWeek") },
    { value: "++1m", label: t("repeatNextFutureMonth") },
    { value: "++1y", label: t("repeatNextFutureYear") },
    { value: ".+1d", label: t("repeatDayFromDone") },
    { value: ".+1w", label: t("repeatWeekFromDone") },
    { value: ".+1m", label: t("repeatMonthFromDone") },
    { value: ".+1y", label: t("repeatYearFromDone") },
  ];
}

function hasParsedDate(input: HTMLInputElement): boolean {
  return Boolean(parseDateTime(input.value.trim())?.date);
}

function makePanelSection(title: string, icon: "occurrence" | "details" | "dates" | "metadata" | "checklist"): HTMLElement {
  const section = document.createElement("section");
  section.className = `add-section add-section-${icon}`;

  const heading = document.createElement("h2");
  heading.className = "add-section-title";

  const mark = document.createElement("span");
  mark.className = "add-section-icon";
  mark.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "add-section-label";
  text.textContent = title;

  heading.append(mark, text);
  section.appendChild(heading);
  return section;
}

function makeRepeatSummonRow(label: string, onClick: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "field-summon-row";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "field-summon-btn";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  row.appendChild(btn);
  return row;
}

function syncDetailsSection(detailsSection: HTMLElement, isTodo: boolean): void {
  detailsSection.dataset.detailKind = isTodo ? "task" : "event";
  const label = detailsSection.querySelector<HTMLElement>(".add-section-label");
  if (label) label.textContent = isTodo ? t("sectionTaskDetails") : t("sectionEventDetails");
}

function buildAddPanel(): void {
  addPanelEl = document.createElement("dialog");
  addPanelEl.className = "add-panel";

  // Absorbs showModal()'s auto-focus so no visible field is focused on open
  const focusSentinel = document.createElement("span");
  focusSentinel.tabIndex = 0;
  focusSentinel.setAttribute("aria-hidden", "true");
  focusSentinel.className = "focus-sentinel";
  addPanelEl.appendChild(focusSentinel);

  // Form
  const form = document.createElement("div");
  form.className = "add-form";

  // Occurrence section (per-occurrence exceptions on a repeating entry)
  const occurrenceSection = makePanelSection(t("sectionOccurrence"), "occurrence");
  occurrenceSection.classList.add("occurrence-section");
  form.appendChild(occurrenceSection);

  const detailsSection = makePanelSection(t("sectionTaskDetails"), "details");
  form.appendChild(detailsSection);

  const datesSection = makePanelSection(t("sectionDates"), "dates");
  form.appendChild(datesSection);

  const metadataSection = makePanelSection(t("sectionMetadata"), "metadata");
  form.appendChild(metadataSection);

  const checklistSection = makePanelSection(t("sectionChecklist"), "checklist");
  form.appendChild(checklistSection);

  // Type toggle
  const typeGroup = makeRadioGroup(null, "add-type", [
    { value: "todo", label: t("typeTodo"), checked: true },
    { value: "event", label: t("typeEvent") },
  ]);
  detailsSection.appendChild(typeGroup.container);

  // Title
  const titleInput = makeTextInput(t("title"), "add-title");
  detailsSection.appendChild(titleInput.container);

  // Event: when
  const whenInput = makeDateTimeInput(t("when"), "add-when", {
    onChange: () => scheduleEditAutosave(),
  });
  datesSection.appendChild(whenInput.container);

  // TODO: scheduled / deadline (combined date+time)
  const schedInput = makeDateTimeInput(t("scheduled"), "add-sched", {
    onChange: () => {
      syncVisibility();
      scheduleEditAutosave();
    },
  });
  datesSection.appendChild(schedInput.container);

  const schedSummonBtn = document.createElement("button");
  schedSummonBtn.type = "button";
  schedSummonBtn.className = "field-summon-btn";
  schedSummonBtn.textContent = t("summonScheduled");
  schedSummonBtn.addEventListener("click", () => {
    revealedSched = true;
    syncVisibility();
    schedInput.input.focus();
  });

  const deadInput = makeDateTimeInput(t("deadlineField"), "add-dead", {
    onChange: () => {
      syncVisibility();
      scheduleEditAutosave();
    },
  });
  datesSection.appendChild(deadInput.container);

  const deadSummonBtn = document.createElement("button");
  deadSummonBtn.type = "button";
  deadSummonBtn.className = "field-summon-btn";
  deadSummonBtn.textContent = t("summonDeadline");
  deadSummonBtn.addEventListener("click", () => {
    revealedDead = true;
    syncVisibility();
    deadInput.input.focus();
  });

  // Repeat (event only)
  const repeatSelect = makeSelect(t("repeat"), "add-repeat", eventRepeatOptions());
  datesSection.appendChild(repeatSelect.container);
  const repeatSummonRow = makeRepeatSummonRow(t("summonRepeat"), () => { revealedRepeat = true; syncVisibility(); repeatSelect.select.focus(); });
  datesSection.appendChild(repeatSummonRow);

  const schedRepeatSelect = makeSelect(t("scheduledRepeat"), "add-sched-repeat", todoRepeatOptions());
  datesSection.appendChild(schedRepeatSelect.container);
  const schedRepeatSummonRow = document.createElement("button");
  schedRepeatSummonRow.type = "button";
  schedRepeatSummonRow.className = "field-summon-btn";
  schedRepeatSummonRow.textContent = t("summonSchedRepeat");
  schedRepeatSummonRow.addEventListener("click", () => { revealedSchedRepeat = true; syncVisibility(); schedRepeatSelect.select.focus(); });

  const deadRepeatSelect = makeSelect(t("deadlineRepeat"), "add-dead-repeat", todoRepeatOptions());
  datesSection.appendChild(deadRepeatSelect.container);
  const deadRepeatSummonRow = document.createElement("button");
  deadRepeatSummonRow.type = "button";
  deadRepeatSummonRow.className = "field-summon-btn";
  deadRepeatSummonRow.textContent = t("summonDeadRepeat");
  deadRepeatSummonRow.addEventListener("click", () => { revealedDeadRepeat = true; syncVisibility(); deadRepeatSelect.select.focus(); });

  const datesSummonRow = document.createElement("div");
  datesSummonRow.className = "field-summon-row";
  datesSummonRow.append(schedSummonBtn, deadSummonBtn, schedRepeatSummonRow, deadRepeatSummonRow);
  datesSection.appendChild(datesSummonRow);

  // Tags (summoned on demand)
  const tagPicker = makeTagPicker(t("tags"), "add-tags");
  metadataSection.appendChild(tagPicker.container);

  // Priority (summoned on demand)
  const priorityGroup = makePriorityStepper();
  metadataSection.appendChild(priorityGroup.container);

  // Description (body text)
  const descriptionWrapper = document.createElement("div");
  descriptionWrapper.className = "add-field";
  const bodyTextarea = document.createElement("textarea");
  bodyTextarea.className = "description-textarea";
  bodyTextarea.rows = 3;
  bodyTextarea.addEventListener("input", scheduleEditAutosave);
  descriptionWrapper.appendChild(bodyTextarea);
  metadataSection.appendChild(descriptionWrapper);

  const descriptionSummonBtn = document.createElement("button");
  descriptionSummonBtn.type = "button";
  descriptionSummonBtn.className = "field-summon-btn";
  descriptionSummonBtn.textContent = t("summonDescription");
  descriptionSummonBtn.addEventListener("click", () => {
    revealedDescription = true;
    syncVisibility();
    bodyTextarea.focus();
  });

  const etiketterSummonBtn = document.createElement("button");
  etiketterSummonBtn.type = "button";
  etiketterSummonBtn.className = "field-summon-btn";
  etiketterSummonBtn.textContent = t("summonTags");
  etiketterSummonBtn.addEventListener("click", () => {
    revealedTags = true;
    syncVisibility();
    tagPicker.focus();
  });

  const prioritySummonBtn = document.createElement("button");
  prioritySummonBtn.type = "button";
  prioritySummonBtn.className = "field-summon-btn";
  prioritySummonBtn.textContent = t("summonPriority");
  prioritySummonBtn.addEventListener("click", () => {
    revealedPriority = true;
    syncVisibility();
  });

  const metadataSummonRow = document.createElement("div");
  metadataSummonRow.className = "field-summon-row";
  metadataSummonRow.append(descriptionSummonBtn, etiketterSummonBtn, prioritySummonBtn);
  metadataSection.appendChild(metadataSummonRow);

  // Show/hide fields based on type
  const typeRadios = typeGroup.container.querySelectorAll<HTMLInputElement>("input[name='add-type']");
  const syncVisibility = (): void => {
    const isTodo = checkedRadioValue(typeGroup.container, "add-type", "event") === "todo";
    const hasSchedDate = hasParsedDate(schedInput.input);
    const hasDeadDate = hasParsedDate(deadInput.input);
    const hasRepeat = repeatSelect.select.value !== "";
    const hasSchedRepeat = schedRepeatSelect.select.value !== "";
    const hasDeadRepeat = deadRepeatSelect.select.value !== "";
    const showSched = isTodo && (hasSchedDate || revealedSched);
    const showDead = isTodo && (hasDeadDate || revealedDead);
    const showRepeat = !isTodo && (hasRepeat || revealedRepeat);
    const showSchedRepeat = isTodo && (hasSchedDate || revealedSched) && (hasSchedRepeat || revealedSchedRepeat);
    const showDeadRepeat = isTodo && (hasDeadDate || revealedDead) && (hasDeadRepeat || revealedDeadRepeat);
    syncDetailsSection(detailsSection, isTodo);
    whenInput.container.style.display = isTodo ? "none" : "";
    repeatSelect.container.style.display = showRepeat ? "" : "none";
    repeatSummonRow.style.display = !isTodo && !showRepeat ? "" : "none";
    schedInput.container.style.display = showSched ? "" : "none";
    schedSummonBtn.style.display = isTodo && !showSched ? "" : "none";
    schedRepeatSelect.container.style.display = showSchedRepeat ? "" : "none";
    schedRepeatSummonRow.style.display = isTodo && (hasSchedDate || revealedSched) && !showSchedRepeat ? "" : "none";
    deadInput.container.style.display = showDead ? "" : "none";
    deadSummonBtn.style.display = isTodo && !showDead ? "" : "none";
    deadRepeatSelect.container.style.display = showDeadRepeat ? "" : "none";
    deadRepeatSummonRow.style.display = isTodo && (hasDeadDate || revealedDead) && !showDeadRepeat ? "" : "none";
    datesSummonRow.style.display = [schedSummonBtn, deadSummonBtn, schedRepeatSummonRow, deadRepeatSummonRow].some(b => b.style.display === "") ? "" : "none";
    const hasTags = tagPicker.getTags().length > 0;
    const showTags = hasTags || revealedTags;
    const showPriority = editingPriority !== null || revealedPriority;
    const showDescription = bodyTextarea.value.length > 0 || revealedDescription;
    tagPicker.container.style.display = showTags ? "" : "none";
    priorityGroup.container.style.display = showPriority ? "" : "none";
    descriptionWrapper.style.display = showDescription ? "" : "none";
    descriptionSummonBtn.style.display = showDescription ? "none" : "";
    etiketterSummonBtn.style.display = showTags ? "none" : "";
    prioritySummonBtn.style.display = showPriority ? "none" : "";
    metadataSummonRow.style.display = showDescription && showTags && showPriority ? "none" : "";
    checkboxSection.style.display = isTodo ? "" : "none";
    checklistSection.style.display = isTodo ? "" : "none";
    updateDateTimePreview(whenInput.input, whenInput.preview);
    updateDateTimePreview(schedInput.input, schedInput.preview);
    updateDateTimePreview(deadInput.input, deadInput.preview);
  };
  typeRadios.forEach(r => r.addEventListener("change", () => {
    if (r.checked && r.value === "todo" && whenInput.input.value && !schedInput.input.value) {
      schedInput.input.value = whenInput.input.value;
    }
    syncVisibility();
    scheduleEditAutosave();
  }));

  titleInput.input.addEventListener("input", scheduleEditAutosave);
  repeatSelect.select.addEventListener("change", () => {
    syncVisibility();
    scheduleEditAutosave();
  });
  schedRepeatSelect.select.addEventListener("change", () => {
    syncVisibility();
    scheduleEditAutosave();
  });
  deadRepeatSelect.select.addEventListener("change", () => {
    syncVisibility();
    scheduleEditAutosave();
  });
  tagPicker.onChange(scheduleEditAutosave);

  // Checkbox section
  const checkboxSection = document.createElement("div");
  checkboxSection.className = "add-field edit-checkboxes";
  checklistSection.appendChild(checkboxSection);
  syncVisibility();

  const occurrenceMeta = document.createElement("div");
  occurrenceMeta.className = "occurrence-meta";
  occurrenceSection.appendChild(occurrenceMeta);

  const occurrenceState = document.createElement("div");
  occurrenceState.className = "occurrence-state";
  occurrenceSection.appendChild(occurrenceState);

  const occActions = document.createElement("div");
  occActions.className = "occurrence-actions";

  const skipCheckboxRow = document.createElement("label");
  skipCheckboxRow.className = "occurrence-toggle-row";
  const skipCheckbox = document.createElement("input");
  skipCheckbox.type = "checkbox";
  skipCheckbox.className = "occurrence-toggle-checkbox";
  const skipCheckboxText = document.createElement("span");
  skipCheckboxText.className = "occurrence-toggle-label";
  skipCheckboxText.textContent = t("skipThisOccurrence");
  skipCheckbox.addEventListener("change", () => void toggleOccurrenceSkipped());
  skipCheckboxRow.append(skipCheckbox, skipCheckboxText);

  const endSeriesCheckboxRow = document.createElement("label");
  endSeriesCheckboxRow.className = "occurrence-toggle-row";
  const endSeriesCheckbox = document.createElement("input");
  endSeriesCheckbox.type = "checkbox";
  endSeriesCheckbox.className = "occurrence-toggle-checkbox";
  const endSeriesCheckboxText = document.createElement("span");
  endSeriesCheckboxText.className = "occurrence-toggle-label";
  endSeriesCheckboxText.textContent = t("stopRepeatingAfter");
  endSeriesCheckbox.addEventListener("change", () => void toggleOccurrenceIsLast());
  endSeriesCheckboxRow.append(endSeriesCheckbox, endSeriesCheckboxText);

  const occMoveFieldsWrapper = document.createElement("div");
  occMoveFieldsWrapper.className = "occ-optional-fields";

  const overrideRow = document.createElement("div");
  overrideRow.className = "occurrence-row";
  const occurrenceInputLabel = document.createElement("label");
  occurrenceInputLabel.className = "add-label";
  occurrenceInputLabel.htmlFor = "occurrence-move-input";
  occurrenceInputLabel.textContent = t("moveToDateTime");
  const occurrenceInput = document.createElement("input");
  occurrenceInput.type = "text";
  occurrenceInput.id = "occurrence-move-input";
  occurrenceInput.className = "add-input occurrence-input";
  const occurrencePreview = document.createElement("div");
  occurrencePreview.className = "datetime-preview occurrence-preview";
  occurrenceInput.addEventListener("input", () => {
    updateDateTimePreview(occurrenceInput, occurrencePreview, editingBaseDate ?? undefined);
    const value = parseOccurrenceOverrideInput(occurrenceInput.value, editingBaseDate);
    if (value) void applyOverride(value, { resetInput: false });
  });
  overrideRow.append(occurrenceInput);

  const clearOverrideBtn = document.createElement("button");
  clearOverrideBtn.type = "button";
  clearOverrideBtn.className = "occurrence-btn occurrence-btn-secondary";
  clearOverrideBtn.textContent = t("clearOverride");
  clearOverrideBtn.addEventListener("click", () => clearException("override"));

  occMoveFieldsWrapper.append(occurrenceInputLabel, overrideRow, occurrencePreview, clearOverrideBtn);
  occActions.append(skipCheckboxRow, endSeriesCheckboxRow);
  occurrenceSection.appendChild(occActions);

  const occNoteFieldsWrapper = document.createElement("div");
  occNoteFieldsWrapper.className = "occ-optional-fields";

  const noteLabel = document.createElement("label");
  noteLabel.className = "add-label";
  noteLabel.textContent = t("noteForOccurrence");

  const noteTextarea = document.createElement("input");
  noteTextarea.type = "text";
  noteTextarea.className = "occurrence-note";
  noteTextarea.addEventListener("input", () => {
    const text = noteTextarea.value.trim();
    if (text) void applyNote(text);
    else void clearException("note");
  });

  occNoteFieldsWrapper.append(noteLabel, noteTextarea);
  occurrenceSection.appendChild(occNoteFieldsWrapper);
  occurrenceSection.appendChild(occMoveFieldsWrapper);

  const occSummonRow = document.createElement("div");
  occSummonRow.className = "field-summon-row";

  const occCancelSummonBtn = document.createElement("button");
  occCancelSummonBtn.type = "button";
  occCancelSummonBtn.className = "field-summon-btn";
  occCancelSummonBtn.textContent = t("summonCancel");
  occCancelSummonBtn.addEventListener("click", () => {
    revealedOccCancel = true;
    refreshOccurrenceSection();
  });

  const occMoveSummonBtn = document.createElement("button");
  occMoveSummonBtn.type = "button";
  occMoveSummonBtn.className = "field-summon-btn";
  occMoveSummonBtn.textContent = t("summonMove");
  occMoveSummonBtn.addEventListener("click", () => {
    revealedOccMove = true;
    refreshOccurrenceSection();
    occurrenceInput.focus();
  });

  const occNoteSummonBtn = document.createElement("button");
  occNoteSummonBtn.type = "button";
  occNoteSummonBtn.className = "field-summon-btn";
  occNoteSummonBtn.textContent = t("summonNote");
  occNoteSummonBtn.addEventListener("click", () => {
    revealedOccNote = true;
    refreshOccurrenceSection();
    noteTextarea.focus();
  });

  occSummonRow.append(occNoteSummonBtn, occMoveSummonBtn, occCancelSummonBtn);
  occurrenceSection.appendChild(occSummonRow);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "add-delete-btn";
  deleteBtn.textContent = t("delete");
  deleteBtn.type = "button";
  deleteBtn.addEventListener("click", () => {
    if (editingLine === null) return;
    if (!deleteBtn.classList.contains("is-armed")) {
      armDeleteBtn();
      return;
    }
    disarmDeleteBtn();
    deleteOrgBlock(editingLine);
    closeAddPanel();
  });
  addPanelDeleteBtnEl = deleteBtn;

  const btnRow = document.createElement("div");
  btnRow.className = "add-btn-row";
  btnRow.append(deleteBtn);
  form.appendChild(btnRow);

  addPanelEl.appendChild(form);
  addPanelEl.addEventListener("cancel", (e) => { e.preventDefault(); closeAddPanel(); });
  addPanelEl.addEventListener("click", (e) => { if (e.target === addPanelEl) closeAddPanel(); });
  document.body.append(addPanelEl);

  addPanelRefs = {
    typeGroup: typeGroup.container,
    priorityGroup: priorityGroup.container,
    titleInput: titleInput.input,
    when: whenInput,
    sched: schedInput,
    dead: deadInput,
    tagPicker,
    repeatSelect: repeatSelect.select,
    schedRepeatSelect: schedRepeatSelect.select,
    deadRepeatSelect: deadRepeatSelect.select,
    checkboxSection,
    syncVisibility,
    occurrenceSection,
    occurrenceMeta,
    occurrenceState,
    skipCheckboxRow,
    skipCheckbox,
    endSeriesCheckboxRow,
    endSeriesCheckbox,
    occurrenceInput,
    occurrencePreview,
    noteTextarea,
    bodyTextarea,
    clearOverrideBtn,
    datesSummonRow,
    metadataSummonRow,
    repeatSummonRow,
    schedRepeatSummonRow,
    deadRepeatSummonRow,
    occCancelSummonBtn,
    occMoveSummonBtn,
    occNoteSummonBtn,
    occMoveFieldsWrapper,
    occNoteFieldsWrapper,
    occSummonRow,
  };
}

/**
 * Rebuild the checkbox editor UI inside the given container from
 * editingCheckboxItems. Each item gets a checkbox, editable text, and
 * a remove button. An "Add subtask" button at the bottom appends new items.
 */
function rebuildCheckboxUI(container: HTMLElement): void {
  container.innerHTML = "";

  const lbl = document.createElement("label");
  lbl.className = "add-label";
  lbl.textContent = t("checklist");
  container.appendChild(lbl);

  for (let ci = 0; ci < editingCheckboxItems.length; ci++) {
    const item = editingCheckboxItems[ci];
    const row = document.createElement("div");
    row.className = "edit-checkbox-row";
    if (item.checked) row.classList.add("checkbox-checked");

    const icon = document.createElement("div");
    icon.className = "checkbox-icon";
    icon.setAttribute("role", "checkbox");
    icon.setAttribute("aria-checked", String(item.checked));
    icon.addEventListener("click", () => {
      editingCheckboxItems[ci].checked = !editingCheckboxItems[ci].checked;
      row.classList.toggle("checkbox-checked", editingCheckboxItems[ci].checked);
      icon.setAttribute("aria-checked", String(editingCheckboxItems[ci].checked));
      text.classList.toggle("edit-checkbox-done", editingCheckboxItems[ci].checked);
      scheduleEditAutosave();
    });

    const text = document.createElement("input");
    text.type = "text";
    text.className = "edit-checkbox-text";
    text.value = item.text;
    if (item.checked) text.classList.add("edit-checkbox-done");
    text.addEventListener("input", () => {
      editingCheckboxItems[ci].text = text.value;
      scheduleEditAutosave();
    });
    text.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        editingCheckboxItems.splice(ci + 1, 0, { text: "", checked: false });
        rebuildCheckboxUI(container);
        const rows = container.querySelectorAll<HTMLElement>(".edit-checkbox-text");
        (rows[ci + 1] as HTMLInputElement | undefined)?.focus();
      } else if (e.key === "Backspace" && text.value === "") {
        e.preventDefault();
        editingCheckboxItems.splice(ci, 1);
        rebuildCheckboxUI(container);
        scheduleEditAutosave();
        const rows = container.querySelectorAll<HTMLElement>(".edit-checkbox-text");
        const target = ci > 0 ? rows[ci - 1] : rows[0];
        (target as HTMLInputElement | undefined)?.focus();
      }
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "edit-checkbox-remove";
    removeBtn.textContent = "\u00d7";
    removeBtn.title = "Remove item";
    removeBtn.setAttribute("aria-label", "Remove item");
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      editingCheckboxItems.splice(ci, 1);
      rebuildCheckboxUI(container);
      scheduleEditAutosave();
    });

    row.append(icon, text, removeBtn);
    container.appendChild(row);
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "edit-checkbox-add";
  addBtn.textContent = t("addSubtask");
  addBtn.addEventListener("click", () => {
    editingCheckboxItems.push({ text: "", checked: false });
    rebuildCheckboxUI(container);
    // Focus the new item's text
    const rows = container.querySelectorAll<HTMLElement>(".edit-checkbox-text");
    rows[rows.length - 1]?.focus();
  });
  container.appendChild(addBtn);

}

function makeSelect(label: string, id: string, options: { value: string; label: string }[]): { container: HTMLElement; select: HTMLSelectElement } {
  const container = document.createElement("div");
  container.className = "add-field";

  const lbl = document.createElement("label");
  lbl.className = "add-label";
  lbl.htmlFor = id;
  lbl.textContent = label;

  const select = document.createElement("select");
  select.id = id;
  select.className = "add-input add-select";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  }

  container.append(lbl, select);
  return { container, select };
}

function makeTagPicker(label: string, id: string): TagPicker {
  const container = document.createElement("div");
  container.className = "add-field";

  const lbl = document.createElement("label");
  lbl.className = "add-label";
  lbl.htmlFor = id;
  lbl.textContent = label;

  const wrapper = document.createElement("div");
  wrapper.className = "tag-picker";

  const pillsEl = document.createElement("div");
  pillsEl.className = "tag-picker-pills";

  const input = document.createElement("input");
  input.type = "text";
  input.id = id;
  input.className = "tag-picker-input";
  input.autocomplete = "off";

  const dropdown = document.createElement("div");
  dropdown.className = "tag-picker-dropdown";

  wrapper.append(pillsEl, input, dropdown);
  wrapper.addEventListener("click", () => input.focus());
  container.append(lbl, wrapper);

  let selected: string[] = [];
  let activeOptionIndex = -1;
  let selectActiveOption: (() => void) | null = null;
  let onChange: (() => void) | null = null;

  const notifyChange = (): void => {
    onChange?.();
  };

  function updateActiveOption(nextIndex: number): void {
    const options = Array.from(dropdown.querySelectorAll<HTMLElement>(".tag-picker-option"));
    if (options.length === 0) {
      activeOptionIndex = -1;
      selectActiveOption = null;
      return;
    }
    activeOptionIndex = ((nextIndex % options.length) + options.length) % options.length;
    options.forEach((opt, idx) => {
      const isActive = idx === activeOptionIndex;
      opt.classList.toggle("is-active", isActive);
      opt.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    selectActiveOption = options[activeOptionIndex].dataset.selectIndex
      ? optionActions[Number(options[activeOptionIndex].dataset.selectIndex)] ?? null
      : null;
  }

  let optionActions: Array<() => void> = [];

  function renderPills(): void {
    pillsEl.innerHTML = "";
    for (const tag of selected) {
      const pill = document.createElement("span");
      pill.className = "tag-picker-pill";

      const text = document.createElement("span");
      text.textContent = `#${tag}`;

      const remove = document.createElement("button");
      remove.className = "tag-picker-pill-x";
      remove.textContent = "×";
      remove.type = "button";
      remove.addEventListener("click", () => {
        selected = selected.filter(t => t !== tag);
        renderPills();
        showDropdown();
        notifyChange();
      });

      pill.append(text, remove);
      pillsEl.appendChild(pill);
    }
  }

  function showDropdown(): void {
    const query = input.value.trim().toLowerCase();
    const allTags = collectAllTags().filter(t => !selected.includes(t));
    let matches: string[];
    if (query) {
      const prefix = allTags.filter(t => t.toLowerCase().startsWith(query));
      const contains = allTags.filter(t => !t.toLowerCase().startsWith(query) && t.toLowerCase().includes(query));
      matches = [...prefix, ...contains];
    } else {
      matches = allTags;
    }

    dropdown.innerHTML = "";
    optionActions = [];
    for (const tag of matches) {
      const opt = document.createElement("div");
      opt.className = "tag-picker-option";
      opt.textContent = `#${tag}`;
      const select = (): void => {
        selected.push(tag);
        input.value = "";
        renderPills();
        showDropdown();
        notifyChange();
      };
      opt.dataset.selectIndex = String(optionActions.push(select) - 1);
      opt.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus on input
        select();
      });
      dropdown.appendChild(opt);
    }

    // Show "add new" option if query doesn't match existing and isn't already selected
    if (query && !collectAllTags().some(t => t.toLowerCase() === query) && !selected.some(t => t.toLowerCase() === query)) {
      const addOpt = document.createElement("div");
      addOpt.className = "tag-picker-option tag-picker-option-new";
      addOpt.textContent = t("addTagOption", { tag: input.value.trim() });
      const select = (): void => {
        selected.push(input.value.trim());
        input.value = "";
        renderPills();
        showDropdown();
        notifyChange();
      };
      addOpt.dataset.selectIndex = String(optionActions.push(select) - 1);
      addOpt.addEventListener("mousedown", (e) => {
        e.preventDefault();
        select();
      });
      dropdown.appendChild(addOpt);
    }

    const hasOptions = dropdown.children.length > 0;
    dropdown.style.display = hasOptions ? "block" : "none";
    if (!hasOptions) {
      activeOptionIndex = -1;
      selectActiveOption = null;
      return;
    }
    updateActiveOption(activeOptionIndex >= 0 ? activeOptionIndex : 0);
  }

  input.addEventListener("focus", showDropdown);
  input.addEventListener("input", showDropdown);
  input.addEventListener("blur", () => {
    dropdown.style.display = "none";
    activeOptionIndex = -1;
    selectActiveOption = null;
  });

  // Backspace on empty input removes last pill
  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !input.value && selected.length > 0) {
      selected.pop();
      renderPills();
      showDropdown();
      notifyChange();
      return;
    }
    if (e.key === "ArrowDown") {
      if (dropdown.children.length > 0) {
        e.preventDefault();
        updateActiveOption(activeOptionIndex + 1);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      if (dropdown.children.length > 0) {
        e.preventDefault();
        updateActiveOption(activeOptionIndex - 1);
      }
      return;
    }
    // Enter commits typed text as new tag
    if (e.key === "Enter") {
      if (selectActiveOption) {
        e.preventDefault();
        selectActiveOption();
        return;
      }
      const val = input.value.trim();
      if (val && !selected.some(t => t.toLowerCase() === val.toLowerCase())) {
        e.preventDefault();
        selected.push(val);
        input.value = "";
        renderPills();
        showDropdown();
        notifyChange();
      }
    }
  });

  return {
    container,
    getTags: () => [...selected],
    setTags: (tags: string[]) => {
      selected = [...tags];
      input.value = "";
      renderPills();
      dropdown.style.display = "none";
    },
    onChange: (callback: (() => void) | null) => {
      onChange = callback;
    },
    focus: () => { input.focus(); },
  };
}

function makeRadioGroup(label: string | null, name: string, options: { value: string; label: string; checked?: boolean }[]): { container: HTMLElement } {
  const container = document.createElement("div");
  container.className = "add-field";

  if (label) {
    const lbl = document.createElement("label");
    lbl.className = "add-label";
    lbl.textContent = label;
    container.appendChild(lbl);
  }

  const group = document.createElement("div");
  group.className = "add-radio-group";

  for (const opt of options) {
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = name;
    radio.value = opt.value;
    radio.id = `${name}-${opt.value}`;
    if (opt.checked) radio.checked = true;

    const radioLabel = document.createElement("label");
    radioLabel.htmlFor = radio.id;
    radioLabel.textContent = opt.label;
    radioLabel.className = "add-radio-label";

    group.append(radio, radioLabel);
  }

  container.appendChild(group);
  return { container };
}

function priorityToLevel(priority: "A" | "B" | "C" | null): number {
  if (priority === "A") return 3;
  if (priority === "B") return 2;
  if (priority === "C") return 1;
  return 0;
}

function levelToPriority(level: number): "A" | "B" | "C" | null {
  if (level >= 3) return "A";
  if (level === 2) return "B";
  if (level === 1) return "C";
  return null;
}

function priorityDisplay(priority: "A" | "B" | "C" | null): string {
  const level = priorityToLevel(priority);
  return level === 0 ? t("priorityNone") : "!".repeat(level);
}

function syncPriorityStepper(container: HTMLElement): void {
  const value = container.querySelector<HTMLElement>(".priority-stepper-value");
  const dec = container.querySelector<HTMLButtonElement>(".priority-stepper-dec");
  const inc = container.querySelector<HTMLButtonElement>(".priority-stepper-inc");
  const level = priorityToLevel(editingPriority);
  if (value) {
    value.textContent = priorityDisplay(editingPriority);
    value.dataset.priority = editingPriority ?? "";
  }
  if (dec) dec.disabled = level === 0;
  if (inc) inc.disabled = level === 3;
  if (dec) dec.setAttribute("aria-disabled", level === 0 ? "true" : "false");
  if (inc) inc.setAttribute("aria-disabled", level === 3 ? "true" : "false");
  container.classList.toggle("is-empty", level === 0);
}

function makePriorityStepper(): { container: HTMLElement } {
  const container = document.createElement("div");
  container.className = "add-field priority-stepper-field";

  const lbl = document.createElement("label");
  lbl.className = "add-label";
  lbl.textContent = t("priority");

  const controls = document.createElement("div");
  controls.className = "priority-stepper";

  const dec = document.createElement("button");
  dec.type = "button";
  dec.className = "priority-stepper-btn priority-stepper-dec";
  dec.textContent = "-";
  dec.setAttribute("aria-label", t("decreasePriority"));

  const value = document.createElement("span");
  value.className = "priority-stepper-value";
  value.setAttribute("aria-live", "polite");

  const inc = document.createElement("button");
  inc.type = "button";
  inc.className = "priority-stepper-btn priority-stepper-inc";
  inc.textContent = "+";
  inc.setAttribute("aria-label", t("increasePriority"));

  const changePriority = (delta: number): void => {
    const next = Math.max(0, Math.min(3, priorityToLevel(editingPriority) + delta));
    editingPriority = levelToPriority(next);
    syncPriorityStepper(container);
    scheduleEditAutosave();
  };
  dec.addEventListener("click", () => changePriority(-1));
  inc.addEventListener("click", () => changePriority(1));

  controls.append(dec, value, inc);
  container.append(lbl, controls);
  syncPriorityStepper(container);
  return { container };
}

function selectRadioValue(container: HTMLElement, value: string): void {
  const radios = container.querySelectorAll<HTMLInputElement>("input[type='radio']");
  radios.forEach(radio => {
    radio.checked = radio.value === value;
  });
}

function checkedRadioValue(container: HTMLElement, name: string, fallback: string): string {
  const radios = Array.from(container.querySelectorAll<HTMLInputElement>(`input[name='${name}']`));
  return radios.find(radio => radio.checked)?.value ?? fallback;
}

function makeTextInput(label: string, id: string): { container: HTMLElement; input: HTMLInputElement } {
  const container = document.createElement("div");
  container.className = "add-field";

  const lbl = document.createElement("label");
  lbl.className = "add-label";
  lbl.htmlFor = id;
  lbl.textContent = label;

  const input = document.createElement("input");
  input.type = "text";
  input.id = id;
  input.className = "add-input";

  container.append(lbl, input);
  return { container, input };
}

/**
 * Expand shorthand date input to YYYY-MM-DD. Accepts:
 *   DD, DD/MM, DD/MM/YYYY — numeric forms (month/year default to today's)
 *   +N                    — N days from today (N >= 0)
 *   mon..sun, man..søn    — next occurrence of that weekday, strictly forward
 */
function expandDate(raw: string): string {
  if (!raw) return "";
  const now = new Date();
  const fmt = (d: Date): string => {
    if (!Number.isFinite(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const validateDateParts = (year: number, month: number, day: number): string => {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
    if (month < 1 || month > 12 || day < 1 || day > 31) return "";
    const candidate = new Date(year, month - 1, day);
    if (!Number.isFinite(candidate.getTime())) return "";
    if (
      candidate.getFullYear() !== year
      || candidate.getMonth() !== month - 1
      || candidate.getDate() !== day
    ) return "";
    return fmt(candidate);
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const full = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (full) {
    const yearRaw = Number(full[3]);
    const year = full[3].length === 2 ? 2000 + yearRaw : yearRaw;
    return validateDateParts(year, Number(full[2]), Number(full[1]));
  }
  const dm = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    const thisYear = validateDateParts(now.getFullYear(), month, day);
    if (thisYear) {
      const [year, candidateMonth, date] = thisYear.split("-").map(Number);
      const candidate = new Date(year, candidateMonth - 1, date);
      if (candidate >= today) return thisYear;
    }
    return validateDateParts(now.getFullYear() + 1, month, day);
  }
  const d = raw.match(/^(\d{1,2})$/);
  if (d) {
    const day = Number(d[1]);
    const thisMonth = validateDateParts(now.getFullYear(), now.getMonth() + 1, day);
    if (thisMonth) {
      const [year, month, date] = thisMonth.split("-").map(Number);
      const candidate = new Date(year, month - 1, date);
      if (candidate >= today) return thisMonth;
    }
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return validateDateParts(nextMonth.getFullYear(), nextMonth.getMonth() + 1, day);
  }

  const plus = raw.match(/^\+(\d+)$/);
  if (plus) {
    const target = new Date(now);
    target.setDate(target.getDate() + Number(plus[1]));
    return fmt(target);
  }

  const weekdayIndexes: Readonly<Record<string, number>> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
    søn: 0, man: 1, tir: 2, ons: 3, tor: 4, fre: 5, lør: 6,
    dom: 0, lun: 1, mar: 2, mer: 3, gio: 4, ven: 5, sab: 6,
    so:  0, mo:  1, di:  2, mi:  3, do:  4, fr:  5, sa:  6,
  };
  const idx = weekdayIndexes[raw.toLowerCase()] ?? -1;
  if (idx >= 0) {
    const delta = ((idx - now.getDay() + 7) % 7) || 7;
    const target = new Date(now);
    target.setDate(target.getDate() + delta);
    return fmt(target);
  }

  return "";
}

function makeDateTimeInput(
  label: string,
  id: string,
  options: { onChange?: () => void } = {},
): DateTimeInput {
  const container = document.createElement("div");
  container.className = "add-field";

  const lbl = document.createElement("label");
  lbl.className = "add-label";
  lbl.htmlFor = id;
  lbl.textContent = label;

  const input = document.createElement("input");
  input.type = "text";
  input.id = id;
  input.className = "add-input datetime-text-input";

  const inputWrap = document.createElement("div");
  inputWrap.className = "datetime-input-wrap";

  const preview = document.createElement("div");
  preview.className = "datetime-preview";

  input.addEventListener("input", () => {
    updateDateTimePreview(input, preview);
    options.onChange?.();
  });

  inputWrap.append(input);
  container.append(lbl, inputWrap, preview);
  return { container, input, preview };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(-([01]\d|2[0-3]):[0-5]\d)?$/;

/**
 * Parse a combined date/time field. Accepts "<date>" or "<date> <time>".
 * Date forms: DD, DD/MM, DD/MM/YYYY. Time forms: HH:MM or HH:MM-HH:MM.
 * Returns null on invalid input.
 */
function parseDateTime(raw: string, fallbackDate?: string): { date: string; time: string } | null {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { date: "", time: "" };

  let time = "";
  let dateRaw: string;
  const last = parts[parts.length - 1];
  if (TIME_RE.test(last)) {
    time = last;
    dateRaw = parts.slice(0, -1).join(" ");
  } else {
    dateRaw = parts.join(" ");
  }

  if (!dateRaw) {
    if (!time) return null;
    if (fallbackDate) return { date: fallbackDate, time };
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return { date: today, time };
  }
  const date = expandDate(dateRaw);
  if (!date) return null;
  return { date, time };
}

function formatPreviewDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const dt = new Date(year, month - 1, day);
  if (!Number.isFinite(dt.getTime())) return "";
  const dayName = DAY_ABBREVS[dt.getDay()];
  const monthName = MONTH_ABBREVS[dt.getMonth()];
  return `${dayName} ${formatDayNumber(day)} ${monthName} ${year}`;
}

function formatDateTimePreview(raw: string, fallbackDate?: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const parsed = parseDateTime(trimmed, fallbackDate);
  if (!parsed?.date) return "";

  const dateText = formatPreviewDate(parsed.date);
  if (!dateText) return "";
  return parsed.time ? `${dateText}, ${parsed.time}` : dateText;
}

function updateDateTimePreview(input: HTMLInputElement, preview: HTMLElement, fallbackDate?: string): void {
  const text = formatDateTimePreview(input.value, fallbackDate);
  preview.textContent = text;
  preview.classList.toggle("is-visible", text !== "");
}

function refreshDateTimeInput(field: DateTimeInput): void {
  updateDateTimePreview(field.input, field.preview);
}

function parseOccurrenceOverrideInput(raw: string, baseDate: string | null): string | null {
  const trimmed = raw.trim();
  const parsed = parseDateTime(trimmed, baseDate ?? undefined);
  if (!parsed || !parsed.date) return null;
  const timePart = parsed.time ? ` ${parsed.time}` : "";
  return `reschedule ${parsed.date}${timePart}`;
}

interface BuildOrgOpts {
  type: "todo" | "event";
  level: number;
  heading: string;
  tags: string;
  todoState?: "TODO" | "DONE";
  priority?: "A" | "B" | "C" | null;
  // event
  date?: string;
  time?: string;
  repeater?: string | null;
  // todo
  schedDate?: string;
  schedTime?: string;
  schedRepeater?: string | null;
  deadDate?: string;
  deadTime?: string;
  deadRepeater?: string | null;
  checkboxItems?: { text: string; checked: boolean }[];
  body?: string;
}

// Org src-block escaping convention: prefix dangerous lines with ","
// so they survive inside a #+begin_description block intact.
function escapeDescriptionLine(line: string): string {
  if (line.startsWith(",")) return "," + line;                   // double-escape leading comma
  if (/^#\+end_description\s*$/i.test(line)) return "," + line;
  return line;
}

function buildOrgText(opts: BuildOrgOpts): string {
  let tagStr = "";
  if (opts.tags) {
    const tagList = opts.tags.split(",").map(t => t.trim()).filter(Boolean);
    if (tagList.length > 0) tagStr = " :" + tagList.join(":") + ":";
  }

  const todoPrefix = opts.type === "todo" ? `${opts.todoState ?? "TODO"} ` : "";
  const priorityPrefix = opts.priority ? `[#${opts.priority}] ` : "";
  const stars = "*".repeat(opts.level);
  const headingLine = `${stars} ${todoPrefix}${priorityPrefix}${opts.heading}${tagStr}`;

  const makeTs = (date: string, time: string | undefined, repeater: string | null | undefined): string => {
    const d = new Date(date + "T00:00:00");
    const dayAbbrev = DAY_ABBREVS[d.getDay()];
    const timeStr = time ? ` ${time}` : "";
    const repStr = repeater ? ` ${repeater}` : "";
    return `<${date} ${dayAbbrev}${timeStr}${repStr}>`;
  };

  const cbLines = (opts.checkboxItems ?? []).map(
    ci => `- [${ci.checked ? "X" : " "}] ${ci.text}`
  );

  const bodyLines = opts.body
    ? ["#+begin_description", ...opts.body.split("\n").map(escapeDescriptionLine), "#+end_description"]
    : [];

  if (opts.type === "event") {
    if (!opts.date) return [headingLine, ...bodyLines, ...cbLines].join("\n");
    return [headingLine, makeTs(opts.date, opts.time, opts.repeater), ...bodyLines, ...cbLines].join("\n");
  }

  // TODO: up to one SCHEDULED and one DEADLINE, emitted together on a single
  // planning line per Org convention (DEADLINE first, then SCHEDULED).
  const lines: string[] = [headingLine];
  const planningParts: string[] = [];
  if (opts.deadDate) planningParts.push(`DEADLINE: ${makeTs(opts.deadDate, opts.deadTime, opts.deadRepeater)}`);
  if (opts.schedDate) planningParts.push(`SCHEDULED: ${makeTs(opts.schedDate, opts.schedTime, opts.schedRepeater)}`);
  if (planningParts.length > 0) lines.push(planningParts.join(" "));
  lines.push(...bodyLines, ...cbLines);
  return lines.join("\n");
}

function buildPanelOrgText(opts: { focusInvalid: boolean }): string | null {
  if (!addPanelRefs) return null;
  const refs = addPanelRefs;
  const type = checkedRadioValue(refs.typeGroup, "add-type", "event");
  const heading = refs.titleInput.value.trim();
  if (!heading) {
    if (opts.focusInvalid) refs.titleInput.focus();
    return null;
  }
  const tagsVal = refs.tagPicker.getTags().join(", ");
  const body = refs.bodyTextarea.value.trim() || undefined;

  const readDateTime = (input: HTMLInputElement): { date: string; time: string } | null => {
    const raw = input.value.trim();
    if (!raw) return { date: "", time: "" };
    const parsed = parseDateTime(raw);
    if (!parsed) {
      if (opts.focusInvalid) input.focus();
      return null;
    }
    return parsed;
  };

  if (type === "event") {
    const dt = readDateTime(refs.when.input);
    if (dt === null) return null;
    if (!dt.date) {
      if (opts.focusInvalid) refs.when.input.focus();
      return null;
    }
    return buildOrgText({
      type: "event",
      level: editingLevel,
      heading,
      tags: tagsVal,
      priority: editingPriority,
      date: dt.date,
      time: dt.time,
      repeater: refs.repeatSelect.value || null,
      body,
    });
  }

  const checkboxItems = editingCheckboxItems.filter(ci => ci.text.trim() !== "");

  const scheduled = readDateTime(refs.sched.input);
  if (scheduled === null) return null;
  const deadline = readDateTime(refs.dead.input);
  if (deadline === null) return null;
  return buildOrgText({
    type: "todo",
    level: editingLevel,
    heading,
    tags: tagsVal,
    todoState: editingTodoState,
    priority: editingPriority,
    schedDate: scheduled.date,
    schedTime: scheduled.time,
    schedRepeater: scheduled.date ? (refs.schedRepeatSelect.value || null) : null,
    deadDate: deadline.date,
    deadTime: deadline.time,
    deadRepeater: deadline.date ? (refs.deadRepeatSelect.value || null) : null,
    checkboxItems,
    body,
  });
}

function editSaveBaseSource(): string {
  if (queuedEditSource !== null && queuedEditEpoch === sourceEpoch) return queuedEditSource;
  if (inFlightEditSource !== null && inFlightEditEpoch === sourceEpoch) return inFlightEditSource;
  return currentSource;
}

function editSaveBaseEpoch(): number {
  return sourceEpoch;
}

function restoreFocusAfterPanelClose(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && addPanelEl?.contains(active)) {
    active.blur();
  }
}

function queueEditSourceSave(updated: string): Promise<boolean> {
  if (updated === editSaveBaseSource()) return editSavePromise ?? Promise.resolve(true);
  queuedEditSource = updated;
  queuedEditEpoch = editSaveBaseEpoch();
  if (editSaveInFlight && editSavePromise) return editSavePromise;
  editSavePromise = drainEditSourceSaves();
  return editSavePromise;
}

async function drainEditSourceSaves(): Promise<boolean> {
  editSaveInFlight = true;
  let ok = true;
  try {
    while (queuedEditSource !== null) {
      const next = queuedEditSource;
      const nextEpoch = queuedEditEpoch ?? sourceEpoch;
      queuedEditSource = null;
      queuedEditEpoch = null;
      if (next === currentSource) continue;
      if (nextEpoch !== sourceEpoch) {
        ok = false;
        continue;
      }
      inFlightEditSource = next;
      inFlightEditEpoch = nextEpoch;
      let result: "saved" | "stale" | "failed";
      try {
        result = await persistSource(next, { expectedEpoch: nextEpoch });
      } finally {
        inFlightEditSource = null;
        inFlightEditEpoch = null;
      }
      if (result === "failed") {
        queuedEditSource = null;
        queuedEditEpoch = null;
        ok = false;
        break;
      }
      if (result !== "saved") ok = false;
    }
    return ok;
  } finally {
    editSaveInFlight = false;
    editSavePromise = null;
  }
}

function scheduleEditAutosave(): void {
  if (editingLine === null) return;
  if (!addPanelEl?.classList.contains("is-editing")) return;
  const orgText = buildPanelOrgText({ focusInvalid: false });
  if (orgText === null) return;
  void queueEditSourceSave(replaceOrgBlockInSource(editSaveBaseSource(), editingLine, orgText));
}

function formatRepeaterValue(
  repeater: { mark: "+" | ".+" | "++"; value: number; unit: "d" | "w" | "m" | "y" } | null | undefined,
): string {
  return repeater ? `${repeater.mark}${repeater.value}${repeater.unit}` : "";
}

function replaceOrgBlock(sourceLine: number, newText: string): void {
  const updated = replaceOrgBlockInSource(currentSource, sourceLine, newText);
  void persistSource(updated);
}

async function toggleDone(sourceLine: number): Promise<void> {
  await persistSource(toggleDoneInSource(currentSource, sourceLine));
}

async function toggleCheckbox(parentSourceLine: number, index: number): Promise<void> {
  await persistSource(toggleCheckboxInSource(currentSource, parentSourceLine, index));
}

function deleteOrgBlock(sourceLine: number): void {
  void persistSource(deleteOrgBlockInSource(currentSource, sourceLine));
}

function appendOrgText(orgText: string): void {
  void persistSource(appendAgendaItemToSource(currentSource, orgText));
}

function openAddPanel(prefillDate: string | null = null, prefillTitle: string | null = null, defaultType: "todo" | "event" = "todo"): void {
  if (!addPanelEl || !addPanelRefs) return;
  disarmDeleteBtn();

  revealedSched = false;
  revealedDead = false;
  revealedTags = false;
  revealedPriority = false;
  revealedRepeat = false;
  revealedSchedRepeat = false;
  revealedDeadRepeat = false;
  revealedOccCancel = false;
  revealedOccMove = false;
  revealedOccNote = false;
  revealedDescription = false;
  editingLine = null;
  editingBaseDate = null;
  editingLevel = 1;
  editingPriority = null;
  editingTodoState = "TODO";
  editingSchedRepeater = null;
  editingDeadRepeater = null;
  editingCheckboxItems = [];
  addPanelEl.classList.remove("is-editing");
  addPanelEl.classList.remove("has-occurrence");

  const refs = addPanelRefs;
  refs.titleInput.value = prefillTitle ?? "";
  refs.bodyTextarea.value = "";
  refs.when.input.value = isoToDisplayDate(prefillDate ?? "");
  refs.sched.input.value = "";
  refs.dead.input.value = "";
  refreshDateTimeInput(refs.when);
  refreshDateTimeInput(refs.sched);
  refreshDateTimeInput(refs.dead);
  refs.tagPicker.setTags([]);
  refs.repeatSelect.value = "";
  refs.schedRepeatSelect.value = "";
  refs.deadRepeatSelect.value = "";
  rebuildCheckboxUI(refs.checkboxSection);
  selectRadioValue(refs.typeGroup, defaultType);
  refs.typeGroup.style.display = "";
  syncPriorityStepper(refs.priorityGroup);
  refs.syncVisibility();

  refs.titleInput.setAttribute("autofocus", "");
  addPanelEl.showModal();
  addPanelEl.classList.add("is-open");
  refs.titleInput.removeAttribute("autofocus");
}

function tsToTimeDisplay(ts: { startTime: string | null; endTime: string | null }): string {
  if (!ts.startTime) return "";
  return ts.endTime ? `${ts.startTime}-${ts.endTime}` : ts.startTime;
}

function tsToDateTimeDisplay(ts: { date: string; startTime: string | null; endTime: string | null }): string {
  const d = isoToDisplayDate(ts.date);
  const t = tsToTimeDisplay(ts);
  return t ? `${d} ${t}` : d;
}

function openEditPanel(sourceLine: number, baseDate: string | null = null): void {
  if (!addPanelEl || !addPanelRefs) return;
  disarmDeleteBtn();

  revealedSched = false;
  revealedDead = false;
  revealedTags = false;
  revealedPriority = false;
  revealedRepeat = false;
  revealedSchedRepeat = false;
  revealedDeadRepeat = false;
  revealedOccCancel = false;
  revealedOccMove = false;
  revealedOccNote = false;
  revealedDescription = false;

  const entry = entries.find(e => e.sourceLineNumber === sourceLine);
  if (!entry) return;

  editingLine = sourceLine;
  editingBaseDate = baseDate;
  editingLevel = entry.level;
  editingPriority = entry.priority;
  editingTodoState = entry.todo === "DONE" ? "DONE" : "TODO";
  addPanelEl.classList.add("is-editing");
  addPanelEl.classList.toggle("has-occurrence", baseDate !== null && entryHasRepeater(entry));
  refreshOccurrenceSection({ resetOccurrenceInput: true });

  const refs = addPanelRefs;

  const type = entry.todo ? "todo" : "event";
  selectRadioValue(refs.typeGroup, type);
  refs.typeGroup.style.display = "none";

  refs.titleInput.value = entry.title;
  refs.tagPicker.setTags([...entry.tags]);

  syncPriorityStepper(refs.priorityGroup);

  refs.when.input.value = "";
  refs.sched.input.value = "";
  refs.dead.input.value = "";
  refs.repeatSelect.value = "";
  refs.schedRepeatSelect.value = "";
  refs.deadRepeatSelect.value = "";
  editingSchedRepeater = null;
  editingDeadRepeater = null;

  if (type === "event") {
    const ts = entry.timestamps[0] ?? null;
    if (ts) {
      refs.when.input.value = tsToDateTimeDisplay(ts);
      refs.repeatSelect.value = formatRepeaterValue(ts.repeater);
    }
  } else {
    const sched = entry.planning.find(p => p.kind === "scheduled");
    const deadline = entry.planning.find(p => p.kind === "deadline");
    if (sched) {
      revealedSched = true;
      refs.sched.input.value = tsToDateTimeDisplay(sched.timestamp);
      refs.schedRepeatSelect.value = formatRepeaterValue(sched.timestamp.repeater);
      editingSchedRepeater = sched.timestamp.repeater
        ? formatRepeaterValue(sched.timestamp.repeater) : null;
    }
    if (deadline) {
      revealedDead = true;
      refs.dead.input.value = tsToDateTimeDisplay(deadline.timestamp);
      refs.deadRepeatSelect.value = formatRepeaterValue(deadline.timestamp.repeater);
      editingDeadRepeater = deadline.timestamp.repeater
        ? formatRepeaterValue(deadline.timestamp.repeater) : null;
    }
  }

  refreshDateTimeInput(refs.when);
  refreshDateTimeInput(refs.sched);
  refreshDateTimeInput(refs.dead);

  // Populate checkbox items
  editingCheckboxItems = entry.checkboxItems.map(ci => ({ text: ci.text, checked: ci.checked }));
  rebuildCheckboxUI(refs.checkboxSection);

  // Populate description (body text)
  refs.bodyTextarea.value = entry.body;
  revealedDescription = entry.body.length > 0;

  refs.syncVisibility();

  addPanelEl.showModal();
  addPanelEl.classList.add("is-open");
}

function isoToDisplayDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

// ── Occurrence exceptions ───────────────────────────────────────────

function entryHasRepeater(entry: OrgEntry): boolean {
  for (const ts of entry.timestamps) if (ts.repeater) return true;
  for (const plan of entry.planning) if (plan.timestamp.repeater) return true;
  return false;
}

/**
 * Pick the repeating base timestamp used to describe the clicked
 * occurrence. SCHEDULED wins over DEADLINE wins over an active
 * timestamp, matching the agenda's typical primary row for an entry.
 */
function pickBaseTimestamp(entry: OrgEntry): OrgEntry["timestamps"][number] | OrgEntry["planning"][number]["timestamp"] | null {
  const sched = entry.planning.find(p => p.kind === "scheduled" && p.timestamp.repeater);
  if (sched) return sched.timestamp;
  const dead = entry.planning.find(p => p.kind === "deadline" && p.timestamp.repeater);
  if (dead) return dead.timestamp;
  const active = entry.timestamps.find(ts => ts.repeater);
  if (active) return active;
  return null;
}

function nextOccurrenceBoundary(
  ts: OrgEntry["timestamps"][number] | OrgEntry["planning"][number]["timestamp"] | null,
  baseDate: string,
): string | null {
  if (!ts?.repeater) return null;
  const [year, month, day] = baseDate.split("-").map(Number);
  const next = stepDate(new Date(year, month - 1, day, 0, 0, 0, 0), ts.repeater.value, ts.repeater.unit);
  return formatDateKey(next);
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatOccurrenceHeader(baseDate: string, base: { startTime: string | null; endTime: string | null } | null): string {
  const [y, m, d] = baseDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dayName = DAY_ABBREVS[dt.getDay()];
  const monthName = MONTH_ABBREVS[dt.getMonth()];
  let out = `${dayName} ${formatDayNumber(dt.getDate())} ${monthName} ${y}`;
  if (base?.startTime) {
    out += base.endTime ? `, ${base.startTime}–${base.endTime}` : `, ${base.startTime}`;
  }
  return out;
}

function describeOverride(override: RecurrenceOverride, baseDate: string | null = null): string {
  if (override.kind === "cancelled") return "Skipped";
  if (override.kind === "shift") {
    const m = override.offsetMinutes;
    const sign = m >= 0 ? "+" : "-";
    const abs = Math.abs(m);
    if (abs % 1440 === 0) return `Moved ${sign}${abs / 1440}d`;
    if (abs % 60 === 0) return `Moved ${sign}${abs / 60}h`;
    return `Moved ${sign}${abs}m`;
  }
  // reschedule
  const sameDate = baseDate !== null && override.date === baseDate;
  let out = "Moved to";
  if (!sameDate) {
  const [y, mo, d] = override.date.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    const dayName = DAY_ABBREVS[dt.getDay()];
    const monthName = MONTH_ABBREVS[dt.getMonth()];
    out += ` ${dayName} ${formatDayNumber(dt.getDate())} ${monthName}`;
  }
  if (override.startTime) {
    out += sameDate
      ? ` ${override.endTime ? `${override.startTime}–${override.endTime}` : override.startTime}`
      : override.endTime
        ? `, ${override.startTime}–${override.endTime}`
        : `, ${override.startTime}`;
  }
  return out;
}

function refreshOccurrenceSection(opts: { resetOccurrenceInput?: boolean } = {}): void {
  if (!addPanelRefs) return;
  const refs = addPanelRefs;
  if (editingLine === null || editingBaseDate === null) return;
  const entry = entries.find(e => e.sourceLineNumber === editingLine);
  if (!entry) return;

  const base = pickBaseTimestamp(entry);
  refs.occurrenceMeta.textContent = formatOccurrenceHeader(editingBaseDate, base);

  const ex: RecurrenceException | undefined = entry.exceptions.get(editingBaseDate);
  const override = ex?.override ?? null;
  const note = ex?.note ?? null;
  const isSkipped = override?.kind === "cancelled";

  refs.occurrenceState.textContent = override
    ? describeOverride(override, editingBaseDate)
    : t("onSchedule");
  refs.occurrenceState.classList.toggle("is-modified", override !== null);

  refs.skipCheckbox.checked = isSkipped;
  const nextBaseKey = nextOccurrenceBoundary(base, editingBaseDate);
  const isSeriesLast = nextBaseKey !== null && entry.seriesUntil === nextBaseKey;
  refs.endSeriesCheckbox.checked = isSeriesLast;
  refs.endSeriesCheckbox.disabled = nextBaseKey === null;
  refs.clearOverrideBtn.style.display = override ? "" : "none";

  const showCancel = revealedOccCancel || isSkipped || isSeriesLast;
  const showMove = revealedOccMove || override !== null;
  const showNote = revealedOccNote || note !== null;
  refs.skipCheckboxRow.style.display = showCancel ? "" : "none";
  refs.endSeriesCheckboxRow.style.display = showCancel && nextBaseKey !== null ? "" : "none";
  refs.occMoveFieldsWrapper.style.display = showMove ? "" : "none";
  refs.occNoteFieldsWrapper.style.display = showNote ? "" : "none";
  refs.occCancelSummonBtn.style.display = showCancel ? "none" : "";
  refs.occMoveSummonBtn.style.display = showMove ? "none" : "";
  refs.occNoteSummonBtn.style.display = showNote ? "none" : "";
  refs.occSummonRow.style.display = showCancel && showMove && showNote ? "none" : "";

  // Autosave stores parsed notes trimmed, so avoid normalizing a focused
  // textarea while the user is typing a space before the next word.
  if (document.activeElement !== refs.noteTextarea && refs.noteTextarea.value !== (note ?? "")) {
    refs.noteTextarea.value = note ?? "";
  }
  if (opts.resetOccurrenceInput) {
    refs.occurrenceInput.value = "";
    refs.occurrencePreview.textContent = "";
    refs.occurrencePreview.classList.remove("is-visible");
  }
}

async function toggleOccurrenceSkipped(): Promise<void> {
  if (editingLine === null || editingBaseDate === null || !addPanelRefs) return;
  const entry = entries.find(e => e.sourceLineNumber === editingLine);
  if (!entry) return;
  const baseSource = editSaveBaseSource();
  const updated = addPanelRefs.skipCheckbox.checked
    ? upsertProperty(baseSource, entry, `EXCEPTION-${editingBaseDate}`, "cancelled")
    : removeProperty(baseSource, entry, `EXCEPTION-${editingBaseDate}`);
  await queueEditSourceSave(updated);
  refreshOccurrenceSection({ resetOccurrenceInput: true });
}

async function toggleOccurrenceIsLast(): Promise<void> {
  if (editingLine === null || editingBaseDate === null || !addPanelRefs) return;
  const entry = entries.find(e => e.sourceLineNumber === editingLine);
  if (!entry) return;
  const nextBaseKey = nextOccurrenceBoundary(pickBaseTimestamp(entry), editingBaseDate);
  if (nextBaseKey === null) return;
  const baseSource = editSaveBaseSource();
  const updated = addPanelRefs.endSeriesCheckbox.checked
    ? upsertProperty(baseSource, entry, "SERIES-UNTIL", nextBaseKey)
    : removeProperty(baseSource, entry, "SERIES-UNTIL");
  await queueEditSourceSave(updated);
  refreshOccurrenceSection({ resetOccurrenceInput: true });
}

async function applyOverride(value: string, opts: { resetInput?: boolean } = {}): Promise<void> {
  if (editingLine === null || editingBaseDate === null) return;
  const entry = entries.find(e => e.sourceLineNumber === editingLine);
  if (!entry) return;
  const updated = upsertProperty(editSaveBaseSource(), entry, `EXCEPTION-${editingBaseDate}`, value);
  await queueEditSourceSave(updated);
  refreshOccurrenceSection({ resetOccurrenceInput: opts.resetInput ?? true });
}

async function applyNote(text: string): Promise<void> {
  if (editingLine === null || editingBaseDate === null) return;
  const entry = entries.find(e => e.sourceLineNumber === editingLine);
  if (!entry) return;
  const updated = upsertProperty(editSaveBaseSource(), entry, `EXCEPTION-NOTE-${editingBaseDate}`, text);
  await queueEditSourceSave(updated);
  refreshOccurrenceSection();
}

async function clearException(which: "override" | "note"): Promise<void> {
  if (editingLine === null || editingBaseDate === null) return;
  const entry = entries.find(e => e.sourceLineNumber === editingLine);
  if (!entry) return;
  const key = which === "override"
    ? `EXCEPTION-${editingBaseDate}`
    : `EXCEPTION-NOTE-${editingBaseDate}`;
  const updated = removeProperty(editSaveBaseSource(), entry, key);
  await queueEditSourceSave(updated);
  refreshOccurrenceSection({ resetOccurrenceInput: which === "override" });
}

function closeAddPanel(): void {
  if (!addPanelEl) return;
  if (editingLine === null) {
    const orgText = buildPanelOrgText({ focusInvalid: false });
    if (orgText !== null) {
      const before = editSaveBaseSource();
      const newSource = appendAgendaItemToSource(before, orgText);
      if (newSource !== before) void queueEditSourceSave(newSource);
    }
  }
  disarmDeleteBtn();
  addPanelEl.classList.remove("is-open");
  addPanelEl.close();

  restoreFocusAfterPanelClose();
}


function armDeleteBtn(): void {
  if (!addPanelDeleteBtnEl) return;
  addPanelDeleteBtnEl.classList.add("is-armed");
  addPanelDeleteBtnEl.textContent = t("tapAgainToDelete");
  if (deleteArmedTimer !== null) clearTimeout(deleteArmedTimer);
  deleteArmedTimer = window.setTimeout(disarmDeleteBtn, 3000);
}

function disarmDeleteBtn(): void {
  if (deleteArmedTimer !== null) {
    clearTimeout(deleteArmedTimer);
    deleteArmedTimer = null;
  }
  if (!addPanelDeleteBtnEl) return;
  addPanelDeleteBtnEl.classList.remove("is-armed");
  addPanelDeleteBtnEl.textContent = t("delete");
}

function navigateWeek(direction: "prev" | "next" | "today"): void {
  const step = monthAhead ? MONTH_AHEAD_DAYS : 7;
  if (direction === "prev") {
    currentStart.setDate(currentStart.getDate() - step);
  } else if (direction === "next") {
    currentStart.setDate(currentStart.getDate() + step);
  } else {
    currentStart = todayMidnight();
  }
  render();
}

function entryMatchesTagFilters(entry: Pick<OrgEntry, "tags">): boolean {
  if (activeTagFilters.size === 0) return true;
  return [...activeTagFilters].every(tag => entry.tags.includes(tag));
}

function entryMatchesPriorityFilter(entry: Pick<OrgEntry, "priority">): boolean {
  return activePriorityFilter === null || entry.priority === activePriorityFilter;
}

function entryMatchesActiveFilters(entry: Pick<OrgEntry, "tags" | "priority">): boolean {
  return entryMatchesTagFilters(entry) && entryMatchesPriorityFilter(entry);
}

function filterWeekByTags(week: readonly AgendaDay[]): readonly AgendaDay[] {
  return week.map(day => ({
    ...day,
    items: day.items.filter(item => entryMatchesActiveFilters(item.entry)),
  }));
}

function filterByTags<T extends { entry: Pick<OrgEntry, "tags" | "priority"> }>(items: T[]): T[] {
  return items.filter(item => entryMatchesActiveFilters(item.entry));
}

function toggleTagFilter(tag: string): void {
  if (activeTagFilters.has(tag)) activeTagFilters.delete(tag);
  else activeTagFilters.add(tag);
  render();
}

function clearTagFilters(): void {
  if (activeTagFilters.size === 0 && activePriorityFilter === null) return;
  activeTagFilters.clear();
  activePriorityFilter = null;
  render();
}

function togglePriorityFilter(priority: "A" | "B" | "C"): void {
  activePriorityFilter = activePriorityFilter === priority ? null : priority;
  render();
}

function toggleHideTags(): void {
  hideTags = !hideTags;
  localStorage.setItem("mediant-hide-tags", hideTags ? "true" : "false");
  render();
}

function toggleHideEmptyDays(): void {
  hideEmptyDays = !hideEmptyDays;
  localStorage.setItem("mediant-hide-empty-days", hideEmptyDays ? "true" : "false");
  render();
}

function toggleHideCompletedAndSkipped(): void {
  hideCompletedAndSkipped = !hideCompletedAndSkipped;
  localStorage.setItem("mediant-hide-completed", hideCompletedAndSkipped ? "true" : "false");
  render();
}

function toggleMonthAhead(): void {
  monthAhead = !monthAhead;
  localStorage.setItem("mediant-month-ahead", monthAhead ? "true" : "false");
  render();
}

function toggleHideDeadlines(): void {
  hideDeadlines = !hideDeadlines;
  localStorage.setItem("mediant-hide-deadlines", hideDeadlines ? "true" : "false");
  render();
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

type ShortcutAction = "next" | "prev" | "today" | "add" | "quick-capture" | "hide-empty-days" | "hide-completed" | "hide-deadlines" | "month-ahead" | "clear-filters";

const SHORTCUT_ACTIONS: Record<string, ShortcutAction> = {
  n: "next",
  p: "prev",
  t: "today",
  a: "add",
  q: "quick-capture",
  h: "hide-empty-days",
  d: "hide-completed",
  u: "hide-deadlines",
  m: "month-ahead",
  x: "clear-filters",
};

function getShortcutAction(e: KeyboardEvent): ShortcutAction | null {
  return SHORTCUT_ACTIONS[e.key.toLowerCase()] ?? null;
}

// ── Bootstrap ────────────────────────────────────────────────────────

async function init(): Promise<void> {
  buildAddPanel();
  buildQuickCaptureOverlay();
  setupNavigation();
  startClockTicker();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (isQuickCaptureOpen()) closeQuickCapture();
      return;
    }
    const actionEl = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>("[data-action]") : null;
    if (actionEl && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      actionEl.click();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
    const action = getShortcutAction(e);
    if (action === "next") {
      e.preventDefault();
      navigateWeek("next");
    } else if (action === "prev") {
      e.preventDefault();
      navigateWeek("prev");
    } else if (action === "today") {
      e.preventDefault();
      navigateWeek("today");
    } else if (action === "add") {
      e.preventDefault();
      openAddPanel();
    } else if (action === "quick-capture") {
      e.preventDefault();
      openQuickCapture();
    } else if (action === "hide-empty-days") {
      e.preventDefault();
      toggleHideEmptyDays();
    } else if (action === "hide-completed") {
      e.preventDefault();
      toggleHideCompletedAndSkipped();
    } else if (action === "hide-deadlines") {
      e.preventDefault();
      toggleHideDeadlines();
    } else if (action === "month-ahead") {
      e.preventDefault();
      toggleMonthAhead();
    } else if (action === "clear-filters") {
      e.preventDefault();
      clearTagFilters();
    }
  });

  document.addEventListener("notification-toggled", () => {
    if (agendaLoaded) render();
  });

  // If a local Mediant server is running, hydrate from the configured
  // Org file and skip the textarea input screen entirely.
  const isServer = await probeServer();
  if (isServer) {
    entries = parseOrg(currentSource);
    currentStart = todayMidnight();
    render();
    subscribeToServerChanges();
  } else {
    showInput();
  }
}

/**
 * Re-render once per minute so the now-line and "today" indication stay
 * current without requiring a page reload. Aligns to the next minute
 * boundary so updates land close to :00 seconds.
 */
function startClockTicker(): void {
  const tick = (): void => {
    if (agendaLoaded && document.visibilityState === "visible") render();
  };
  const msToNextMinute = 60_000 - (Date.now() % 60_000);
  setTimeout(() => {
    tick();
    setInterval(tick, 60_000);
  }, msToNextMinute);
  // Also refresh immediately when the tab becomes visible again.
  document.addEventListener("visibilitychange", () => {
    if (agendaLoaded && document.visibilityState === "visible") render();
  });
}

function showInput(): void {
  const container = document.getElementById("agenda")!;
  container.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "input-screen";

  const title = document.createElement("h1");
  title.textContent = t("appTitle");
  title.className = "input-title";

  const textarea = document.createElement("textarea");
  textarea.className = "input-textarea";
  textarea.spellcheck = false;
  textarea.value = localStorage.getItem("mediant-org-source") ?? "";

  const btn = document.createElement("button");
  btn.className = "input-load-btn";
  btn.textContent = t("loadAgenda");
  btn.addEventListener("click", () => loadFromTextarea(textarea.value));

  const ghLink = document.createElement("a");
  ghLink.className = "github-link";
  ghLink.href = "https://github.com/Jovlang/Mediant";
  ghLink.target = "_blank";
  ghLink.rel = "noopener noreferrer";
  ghLink.setAttribute("aria-label", t("viewOnGitHub"));
  ghLink.innerHTML = `<svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

  const headerRight = document.createElement("div");
  headerRight.className = "input-header-right";
  headerRight.append(ghLink);

  const header = document.createElement("div");
  header.className = "input-header";
  header.append(title, headerRight);

  wrapper.append(header, textarea, btn);
  container.appendChild(wrapper);
  textarea.focus();
}

function exceedsLimit(source: string): boolean {
  return new Blob([source]).size > MAX_INPUT_BYTES;
}

// ── Source persistence ─────────────────────────────────────────────

/**
 * Probe for a running Mediant server. In server mode, the UI reads/writes
 * the configured Org file via /api/source instead of localStorage, and
 * subscribes to /api/events for external file changes.
 */
async function probeServer(): Promise<boolean> {
  try {
    const r = await fetch("/api/source");
    if (!r.ok) return false;
    serverVersion = r.headers.get("X-Version");
    currentSource = await r.text();
    serverMode = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Write `updated` to the active backend (server PUT or localStorage),
 * then refresh entries and re-render. On a server version mismatch
 * (409), reload the file from disk — the on-disk copy wins.
 */
async function persistSource(
  updated: string,
  opts: { expectedEpoch?: number } = {},
): Promise<"saved" | "stale" | "failed"> {
  if (exceedsLimit(updated)) {
    alert("Source exceeds the 4 MB limit.");
    return "failed";
  }

  if (serverMode) {
    const expectedEpoch = opts.expectedEpoch ?? sourceEpoch;
    try {
      const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8" };
      if (serverVersion) headers["If-Match"] = serverVersion;
      const r = await fetch("/api/source", { method: "PUT", headers, body: updated });
      if (r.status === 409) {
        alert("File was modified externally; reloading from disk.");
        await reloadFromServer();
        return "stale";
      }
      if (!r.ok) {
        alert(`Failed to save: ${r.status} ${r.statusText}`);
        return "failed";
      }
      if (sourceEpoch !== expectedEpoch) {
        await reloadFromServer();
        return "stale";
      }
      serverVersion = r.headers.get("X-Version");
      applyParsedSource(updated);
      render();
      return "saved";
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`);
      return "failed";
    }
  }

  localStorage.setItem("mediant-org-source", updated);
  applyParsedSource(updated);
  render();
  return "saved";
}

async function reloadFromServer(): Promise<void> {
  try {
    const r = await fetch("/api/source");
    if (!r.ok) return;
    const nextVersion = r.headers.get("X-Version");
    const nextSource = await r.text();
    if (nextVersion === serverVersion && nextSource === currentSource) return;
    serverVersion = nextVersion;
    queuedEditSource = null;
    queuedEditEpoch = null;
    sourceEpoch++;
    applyParsedSource(nextSource);
    render();
  } catch {
    // swallow — next SSE event or user action will retry
  }
}

function subscribeToServerChanges(): void {
  const es = new EventSource("/api/events");
  es.onmessage = (ev) => {
    if (ev.data && ev.data !== serverVersion) {
      void reloadFromServer();
    }
  };
  // On transient disconnect EventSource auto-reconnects; nothing to do.

  // Re-fetch when the window regains focus — catches edits made while the
  // tab was in the background (e.g. editing the .org file in Emacs).
  window.addEventListener("focus", () => void reloadFromServer());
}

async function loadFromTextarea(source: string): Promise<void> {
  currentStart = todayMidnight();
  await persistSource(source);
}

function applyParsedSource(source: string): void {
  currentSource = source;
  entries = parseOrg(source);
}

// ── Render ───────────────────────────────────────────────────────────

function render(): void {
  const container = document.getElementById("agenda");
  if (!container) return;

  agendaLoaded = true;
  const today = new Date();
  const dayCount = monthAhead ? MONTH_AHEAD_DAYS : 7;
  const week = generateAgenda(entries, currentStart, dayCount);
  const deadlines = collectDeadlines(entries, today);
  const overdue = collectOverdueItems(entries, today);
  const someday = collectSomedayItems(entries);
  const filteredWeek = filterWeekByTags(week);
  const filteredDeadlines = filterByTags(deadlines);
  const filteredOverdue = filterByTags(overdue);
  const filteredSomeday = filterByTags(someday);

  renderAgenda(container, filteredWeek, filteredDeadlines, filteredOverdue, filteredSomeday, today, {
    activeTagFilters: [...activeTagFilters].sort(),
    activePriorityFilter,
    hideTags,
    hideEmptyDays,
    hideCompletedAndSkipped,
    monthAhead,
    hideDeadlines,
  });

  // Schedule notifications for today's timed events
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const notifItems: { title: string; dateStr: string; startTime: string }[] = [];
  for (const day of filteredWeek) {
    for (const item of day.items) {
      if (item.startTime && !item.skipped) {
        const d = item.date;
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (ds === todayStr) {
          notifItems.push({ title: item.entry.title, dateStr: ds, startTime: item.startTime });
        }
      }
    }
  }
  scheduleNotifications(notifItems);

}

// ── Navigation ───────────────────────────────────────────────────────

function closeSettingsMenusForClick(target: EventTarget | null): void {
  const targetEl = target instanceof Element ? target : null;
  document.querySelectorAll<HTMLDetailsElement>(".agenda-settings-menu[open]").forEach((menu) => {
    if (!targetEl || !menu.contains(targetEl)) menu.open = false;
  });
}

function setupNavigation(): void {
  document.addEventListener("click", () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !(active instanceof HTMLInputElement) && !(active instanceof HTMLTextAreaElement) && !(active instanceof HTMLSelectElement)) {
      active.blur();
    }
  });

  document.addEventListener("click", (e) => {
    closeSettingsMenusForClick(e.target);

    const targetEl = e.target instanceof HTMLElement ? e.target : null;
    const btn = targetEl?.closest<HTMLElement>("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (!action) return;

    if (action === "prev" || action === "next" || action === "today") {
      navigateWeek(action);
    } else if (action === "add") {
      openAddPanel(null);
    } else if (action === "add-on-date") {
      openAddPanel(btn.dataset.date ?? null, null, "event");
    } else if (action === "toggle-hide-tags") {
      toggleHideTags();
    } else if (action === "toggle-hide-empty-days") {
      toggleHideEmptyDays();
    } else if (action === "toggle-hide-completed") {
      toggleHideCompletedAndSkipped();
    } else if (action === "toggle-month-ahead") {
      toggleMonthAhead();
    } else if (action === "toggle-hide-deadlines") {
      toggleHideDeadlines();
    } else if (action === "toggle-tag-filter") {
      const tag = btn.dataset.tag;
      if (tag) toggleTagFilter(tag);
    } else if (action === "toggle-priority-filter") {
      const priority = btn.dataset.priority;
      if (priority === "A" || priority === "B" || priority === "C") togglePriorityFilter(priority);
    } else if (action === "clear-tag-filters") {
      clearTagFilters();
    } else if (action === "edit") {
      const line = Number(btn.dataset.line);
      const baseDate = btn.dataset.baseDate ?? null;
      if (line) openEditPanel(line, baseDate);
    } else if (action === "toggle-done") {
      e.stopPropagation();
      const line = Number(btn.dataset.line);
      if (line) void toggleDone(line);
    } else if (action === "toggle-checkbox") {
      e.stopPropagation();
      const line = Number(btn.dataset.line);
      const index = Number(btn.dataset.checkboxIndex);
      if (line && Number.isInteger(index) && index >= 0) void toggleCheckbox(line, index);
    }
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

function todayMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// ── Go ───────────────────────────────────────────────────────────────

void init();
