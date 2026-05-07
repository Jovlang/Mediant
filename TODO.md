# TODO

## General
- [x] Multilingual support
- [x] Browser notifications
- [ ] Mobile notifications
- [ ] ICS import/export
- [ ] Subscribe to ICS URLs
- [ ] Serve ICS endpoint
- [ ] Time-grid view

## This and future operations

Goal: support the Google Calendar-style third option for repeating items: apply a delete or edit from the selected occurrence onward, while keeping earlier occurrences intact.

### Implementation

- [ ] Persistence helper: add `splitSeries(source, entry, baseDate, { mode: "truncate" | "fork"; patch? })`
- [ ] Edit panel: add a "This and future" section with Delete + Change actions
- [ ] Tests: truncation boundary, fork behavior, exception handling after split, parser round-trip

### Edge cases to lock down

- [ ] Decide semantics when splitting at the very first occurrence
- [ ] Decide whether future exceptions are dropped or migrated when a series is split

## Inline subtask editing

Goal: let the user edit subtask text and add/remove subtasks directly from an agenda row, without opening the full edit panel. Today the inline checkbox row only toggles checked state; text changes require opening the edit panel.

### Interaction model

- [x] Decide the activation gesture: tap on icon = toggle checked; tap on label = enter edit. Keyboard Enter on the row stays as toggle to preserve current a11y.
- [x] Commit on Enter (and create a new item below); cancel on Esc; remove on Backspace when text is empty — match `rebuildCheckboxUI` keybindings so muscle memory carries over.
- [x] Decide whether commit-on-empty-text removes the row or persists an empty `- [ ] ` line (edit panel keeps empty rows today). — Removes the row (matches Backspace-on-empty); transient inserts simply discard.

### Persistence helpers (`sourceEdit.ts`)

- [x] `editCheckboxTextInSource(source, parentSourceLine, index, text)` — rewrite the index-th checkbox line, preserving indent and checked marker
- [x] `insertCheckboxInSource(source, parentSourceLine, afterIndex, text, checked)` — insert after the given index; refresh `[N/M]` / `[N%]` progress cookie
- [x] `removeCheckboxInSource(source, parentSourceLine, index)` — drop the line; refresh progress cookie
- [x] Share regex/indexing semantics with `toggleCheckboxInSource` so progress-cookie math stays consistent

### Render (`render.ts`)

- [x] Split `checkbox-item` into an icon (toggle target) and a label (edit target) with separate handlers; row-level Enter still toggles
- [x] On label activate, swap the `<span>` for an `<input>` initialized from `item.text`; commit dispatches a save action, blur/Esc restores
- [x] Show an inline "+ Add subtask" affordance under the list, mirroring the edit panel

### Wiring (`main.ts`)

- [x] Add actions `edit-checkbox` and `add-checkbox` that route through the new source helpers and re-render
- [x] `stopPropagation` on input click/keydown so toggle and edit don't double-fire
- [x] Preserve in-progress inline edits across re-renders: an `activeInlineEdit` state is rebuilt by `restoreInlineEdit()` on every render so the clock-tick repaint doesn't wipe typing

### Edge cases to lock down

- [x] Hide-completed mode: `data-checkbox-index` maps to source index (not visible position) so hidden items don't shift edits — the existing render loop already preserves source indices
- [x] Collapsed checkbox lists: blocked while collapsed — labels and add button are inside the collapsed list, hidden by CSS
- [ ] Concurrent edit panel open on the same entry: decide whether inline edits are gated off or the panel reloads its state on save
- [ ] Long subtask text in narrow mobile/ring layouts — input width must not blow up the row

### Tests

- [x] Source helpers: edit/insert/remove round-trip with indent preserved; progress cookie correct across mixes of toggle/insert/remove
- [x] Render: per-row data-action / data-line / data-checkbox-index wired so inline-edit handlers can route source mutations
- [ ] Integration: an inline edit matches the result of the same change made through the edit panel
- [x] Localization: subtask placeholder/aria strings added to both EN and NO bundles in `i18n.ts`

### Open questions

- [x] Inline edit available in every checkbox surface (deadline lists, someday lists, in-day items) or only the main agenda row? — Available everywhere `renderCheckboxItems` is called.
- [ ] Swipe-left to delete on touch — worth it, or rely on Backspace-on-empty?
- [ ] Inline edits persist immediately; do we need any undo/toast affordance, or rely on Org file history?

## Multi-day timestamps (`--`)

Goal: support Org's `<DATE …>--<DATE …>` spanning timestamps so multi-day events (vacations, conferences, retreats) render across each day they cover instead of being skipped as body text.

### Data model

- [x] Extend `OrgTimestamp` with `endDate: string | null` (parallel to `endTime`); single-day timestamps keep `endDate: null`
- [ ] At parse time, drop the range and fall back to body text if `endDate < date` or if the two endpoints carry different repeaters

### Parser

- [x] Recognize `<DATE …>--<DATE …>` in `TIMESTAMP_RE` (or a sibling regex driven from the same parser entry point) and emit a single `OrgTimestamp` with `endDate` set
- [ ] Carry the repeater from the opening endpoint; require the closing endpoint's repeater (if present) to match

### Agenda generation

- [ ] Treat a multi-day occurrence as one entry that occupies every day in `[date, endDate]` clamped to the visible window
- [ ] Carry `dayIndex` / `dayCount` onto each generated `AgendaItem` so the renderer can tag continuation days

### Render

- [ ] All-day multi-day spans render on each day in the all-day band, title shown on every day
- [ ] Timed multi-day spans show start time on the first day and end time on the last day; middle days show title only
- [ ] Small `n/N` badge on continuation days (e.g. `2/5`)

### Exceptions

- [ ] `cancelled` suppresses the whole span on that base occurrence
- [ ] `shift ±N{m,h,d}` shifts both endpoints by the same delta; duration preserved
- [ ] `reschedule YYYY-MM-DD [HH:MM[-HH:MM]]` moves the start; preserve span length; explicit times apply to the first day only
- [ ] `EXCEPTION-NOTE` renders once on the first day of the span

### Source edit / edit panel

- [ ] Add an "End date" field next to the date picker, shown only when toggled on
- [ ] Round-trip writes through `<…>--<…>`; clearing the end date emits a single timestamp instead of an empty range
- [ ] DONE-toggle advances both endpoints together using the existing repeater semantics

### Tests

- [ ] Parser: with/without times, repeater on both endpoints, mismatched repeater rejected, `endDate < date` rejected
- [ ] Recurrence: weekly multi-day event expands one occurrence per spanned day across the visible window
- [ ] Exceptions: shift / reschedule / cancel applied to a multi-day occurrence preserve span semantics
- [ ] Render: continuation-day badge, time only on first and last days
- [ ] Source edit: round-trip, DONE advances both endpoints

### Open questions

- [ ] Should overdue / upcoming-deadline use the start date, end date, or both?
- [ ] Multi-day SCHEDULED vs DEADLINE: does either need different display treatment?
- [ ] Optional Elisp integration: any extra work beyond what plain Org agenda already does for `--` ranges?
