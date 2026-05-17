# AGENTS.md

## Project overview

Mediant is a minimal Org-mode parser and agenda viewer. It parses a focused subset of Org syntax and renders a rolling agenda in HTML/CSS, with a 7-day default and optional 30-day month-ahead view. It runs in two modes: a **static mode** where users paste Org content into a textarea (localStorage-backed), and a **server mode** where a local Node CLI (`mediant [file.org | dir]`) serves the UI against one source file (`Mediant.org` by default) and streams changes over `/api/source` + SSE. No framework dependencies.

## Architecture

Three clearly separated stages — do not collapse them:

```
  .org file → Parser (org/) → Agenda (agenda/)    → UI (ui/)
             OrgEntry[]       AgendaWeek            HTML/CSS
                               AgendaDay[]
                               DeadlineItem[]
                               OverdueItem[]
                               SomedayItem[]
```

- **Parser output types** (`src/org/`) reflect Org source faithfully
- **Agenda types** (`src/agenda/`) reflect UI needs (render categories, day-range structure)
- Classification into display categories happens at the agenda stage, never during parsing

## Key source files

| File | Responsibility |
|---|---|
| `src/org/timestamp.ts` | Timestamp parsing, Date conversion, recurrence expansion, per-occurrence exception application. **Only** module that does date arithmetic. Exports both `expandRecurrences()` (pure base series) and `expandOccurrences()` (base series with exceptions applied). |
| `src/org/parser.ts` | Line-by-line Org parser → `OrgEntry[]`. Delegates all timestamp work to `timestamp.ts`. Reads `:EXCEPTION-<date>:`, `:EXCEPTION-NOTE-<date>:`, and `:SERIES-UNTIL:` keys inside `:PROPERTIES:` drawers; every other drawer and every other property key is skipped. |
| `src/org/model.ts` | Parser output types: `OrgEntry` (including `seriesUntil`), `OrgPlanning`, `TodoState`, `Priority`, `CheckboxItem`, `RecurrenceOverride`, `RecurrenceException`. |
| `src/org/description.ts` | Description block formatting helpers: `formatDescriptionLine()` indents lines by two spaces and comma-escapes `#+begin_src`/`#+end_src` markers and leading commas so body text round-trips safely as literal src-block content. |
| `src/org/drawer.ts` | Property-drawer text mutation helpers (`upsertProperty`, `removeProperty`). Operate on raw source strings; preserve key order and other drawer content; used by the edit panel to write exception properties. |
| `src/org/sourceEdit.ts` | Pure raw-source mutation helpers used by UI actions: replace an entry block while preserving body text, toggle TODO/DONE, advance repeating timestamps when marking done, toggle checkbox completion, and update progress cookies. |
| `src/agenda/model.ts` | Agenda/render types: `AgendaItem`, `AgendaDay`, `AgendaWeek`, `DeadlineItem`, `OverdueItem`, `SomedayItem`, `RenderCategory`, `AgendaItemOverride`. |
| `src/agenda/generate.ts` | Range generation from a start date, recurrence expansion with exceptions (bounded to requested range), classification, sorting, overdue/someday collection. |
| `src/dateLabels.ts` | Locale-aware day/month labels for agenda headers and date formatting. Picks the correct array for the active locale (`en`/`nb`/`it`/`de`). Keep display labels centralized here instead of duplicating arrays. |
| `src/ui/render.ts` | DOM rendering from `AgendaDay[]` + `DeadlineItem[]` + `OverdueItem[]`. Renders the per-occurrence override chip, instance note, active tag-filter state, and plain tag labels. |
| `src/ui/notifications.ts` | Browser notification preference, permission request, and timer scheduling for timed events happening today. Notifications fire 1 hour before the start time and are rescheduled on render. |
| `src/i18n.ts` | English, Norwegian, Italian, and German UI strings, locale detection, and locale persistence (`mediant-locale`). |
| `src/ui/style.css` | All styles. CSS grid layout with content-width time column. |
| `src/main.ts` | Entry point. Probes `/api/source` on boot; if present, enters server mode (hydrates from the served source file, tracks its version, subscribes to `/api/events` for external file changes). Otherwise shows the textarea input screen backed by localStorage. Owns global keyboard shortcuts, tag-filter state, quick-capture overlay, checkbox completion toggles, add-item & edit-item panels, and the "This occurrence" section that writes exception properties via the drawer helpers. |
| `server/cli.mjs` | Node CLI + HTTP server. `mediant [file.org \| dir] [--port N] [--daemon]`. With no target it uses `./Mediant.org`; with a directory target it uses `Mediant.org` inside that directory. `GET /api/source` returns `{ content, version }`. `PUT /api/source` takes JSON `{ content, version }`; version mismatch → 409. `GET /api/events` SSE backed by `fs.watch` (debounced). Node built-ins only, no deps. |
| `elisp/mediant-org-agenda.el` | Optional Emacs Org agenda integration. Global minor mode that runs on `org-agenda-finalize-hook`, reads Mediant exception properties from source headings, filters cancelled/cutoff occurrences, inserts moved synthetic agenda lines, and renders exception notes. |
| `elisp/mediant-org-agenda-test.el` | ERT tests for the optional Org agenda integration. Uses temporary Org files and real `org-agenda-list` generation to verify exception display behavior. |
| `elisp/mediant-capture-templates.el` | Optional Org capture templates for Mediant.org. Defines `org-better-agenda--read-timestamp` (wraps `org-read-date`, formats an active timestamp string with optional repeater) and registers eight `org-capture` templates under `with-eval-after-load 'org-capture`: `t` (todo), `d` (deadline todo), `s` (scheduled todo), `b` (deadline+scheduled todo), `e` (event), `w`/`m`/`y` (weekly/monthly/yearly recurring event). Templates append under `* Tasks` or `* Events` in `(expand-file-name "Mediant.org" org-directory)`. `org-directory` must be set before the file is loaded. |

## Commands

```sh
npm test              # run all tests (vitest)
npm run test:watch    # vitest in watch mode
npx vite              # dev server (serves index.html)
npm run build         # build dist/ for the server to serve
npm start [file.org | dir]  # build + start the local server against one source file
emacs --batch -L elisp -f batch-byte-compile elisp/mediant-org-agenda.el
                      # byte-compile the optional Org agenda integration
emacs --batch -L elisp -l elisp/mediant-org-agenda-test.el -f ert-run-tests-batch-and-exit
                      # run ERT tests for the optional Org agenda integration
```

## Change workflow

- Update docs only for meaningful behavior, workflow, architecture, persistence, or data-model changes.
- Keep small spacing/styling polish out of high-level docs unless it changes an explicit documented UI contract.
- Mention minor visual polish in the commit message instead of README/AGENTS.
- Commit completed changes with a verbose commit message that explains the behavior change, persistence or data-model impact, and test coverage.

## Server mode

- `server/cli.mjs` is a self-contained Node script — no dependencies beyond Node built-ins (`http`, `fs`, `child_process`, etc.). Do not add npm deps to it casually.
- Version token is `mtimeMs` as a string for the single source file. `PUT /api/source` takes JSON `{ content, version }`; version mismatch → 409, client reloads from disk (disk wins).
- With no CLI target, the source is `./Mediant.org`. With a directory target, the source is `Mediant.org` inside that directory. Missing source files are created empty on startup.
- `fs.watch` fires multiple times per write on some platforms — the watcher is debounced 100 ms and only broadcasts on real source-file `mtimeMs` changes.
- SSE clients receive `data: <changeToken>\n\n`, a monotonic invalidation hint for the current server process. The client re-reads `/api/source` and ignores events that produce no source version change.
- Server binds to `127.0.0.1` only. Auth is intentionally absent — the assumption is Tailscale or equivalent for remote access.
- `--daemon` re-execs the same node script detached with `MEDIANT_CHILD=1` and the flag stripped, then the parent prints the PID and exits. Stop with `kill <pid>`.

## Design principles

- **Mediant.org is an Org-readable dialect, not just a subset.** The source should remain readable and editable as Org text, but Mediant's syntax choices serve Mediant's agenda model first.
- **Do not chase broad Org compatibility.** Reject Org features when they would create ambiguous editing, multiple plausible source locations, or DevTools-like UI. Do not add a feature merely because Org-mode supports it.
- **Add Mediant syntax only for agenda behavior.** A Mediant-specific extension is appropriate when it models real calendar/task behavior the app needs while preserving one clear source location and one clear UI meaning. Recurrence exceptions are the model: one repeating heading owns its per-occurrence changes in its property drawer.
- **Keep one canonical temporal source per item.** Every editable UI field must map to one obvious source location. Unknown Org should be preserved where possible, not interpreted.
- **Preservation and editing are different.** Mediant may preserve more Org than it understands, and may understand more Org than it edits. It should only edit canonical, simple fields.
- **Unsupported Org features are product choices.** Tag inheritance creates unclear derived state; multiple timestamps create ambiguous source mappings; inline timestamps in prose make agenda output depend on arbitrary body text; full org-directory support turns Mediant into a database/indexer; Org-roam, backlinks, and custom agenda commands are outside the product model.
- **Parser types stay close to Org semantics.** `OrgEntry` mirrors the source. No display logic leaks in.
- **Timestamps store strings, not Dates.** `date` is `"2026-04-07"`, times are `"15:15"`. Conversion happens via helpers in `timestamp.ts`.
- **Recurrence expansion is always bounded.** `expandRecurrences()` and `expandOccurrences()` only generate occurrences within a given date range. Never expand globally.
- **Exceptions are keyed by base date, not final date.** A rescheduled occurrence on Tue 12 May still lives under `:EXCEPTION-2026-05-11:` if the base series hit Mon 11 May. UI labels reflect final date/time; property writes round-trip through the unshifted base slot.
- **Exceptions on non-repeating entries are parsed but inert.** `entry.exceptions` is populated regardless of whether the entry has a repeater; expansion simply never runs. Do not "fix" this by applying the map to the single timestamp.
- **`:SERIES-UNTIL:` is exclusive and base-slot-based.** An occurrence whose base date equals `seriesUntil` is not generated; the successor heading (if any) may start *on* that date without overlap. Reschedules keyed at/after the end are ignored because the base slot no longer exists, but a valid base slot before `seriesUntil` may still be moved past the cutoff. Like exceptions, it is parsed-but-inert on non-repeating entries.
- **New property drawers must stay Org-compatible.** When creating a drawer, place it immediately after the heading and any planning lines, before body text or standalone active timestamp lines. The parser and optional Elisp integration still read legacy drawers later in an entry, but new writes should work with Org's property APIs.
- **Override is behaviour, note is metadata.** A single occurrence can carry both (e.g. `shift +45m` + a note, or `cancelled` + a note). A cancelled+note pair is intentionally allowed.
- **All dates use local time.** No timezone handling — Org files don't encode timezones.
- **Only `TODO` and `DONE` states are recognized.** Other keywords (WAITING, NEXT, etc.) are treated as part of the heading title.
- **Readonly data structures.** Types use `readonly` throughout — data flows between stages, never mutated in place.

## Org syntax scope

See `ORG-SYNTAX.md` for the full breakdown of supported, gracefully ignored, and unsupported syntax.

**Canonical entries:** Mediant has two first-class entry shapes. Events are plain headings followed by an active timestamp on its own line. TODO tasks are `TODO`/`DONE` headings, optionally followed immediately by one planning line containing `DEADLINE:`, `SCHEDULED:`, or both; when both are present, `DEADLINE:` comes before `SCHEDULED:`.

**Supported (standard Org):** headings, TODO/DONE, priority cookies (`[#A]`/`[#B]`/`[#C]`), tags, active timestamps (standalone-line only — inline timestamps embedded in prose are silently ignored), time ranges, repeaters (`+`/`.+`/`++`, units `d`/`w`/`m`/`y`), SCHEDULED, DEADLINE, body text via `#+begin_src description` blocks, checkbox lists (`- [ ]`/`- [X]`), progress cookies (`[2/3]`/`[66%]`).

**Mediant-specific extensions:** per-occurrence recurrence exceptions via `:EXCEPTION-<date>:` / `:EXCEPTION-NOTE-<date>:` (keyed on the *unshifted* base date), plus `:SERIES-UNTIL:` for an exclusive end date on a repeating series. `SERIES-UNTIL` is evaluated on the repeater's base slots, not the final moved-to date, which is what makes split-series handoff work cleanly. Both ride on ordinary Org property-drawer syntax, so files remain valid Org, but this is a deliberate divergence from plain Emacs Org agenda semantics: Emacs preserves the keys as arbitrary properties and does not apply them unless the optional Mediant Elisp integration is enabled.

**Gracefully ignored:** file keywords (#+), inactive timestamps, drawers (including property drawers — only the `:EXCEPTION-…:`, `:EXCEPTION-NOTE-…:`, and `:SERIES-UNTIL:` extension keys are read), comments, links, inline markup, plain lists, tables.

**Not supported:** diary sexp, custom TODO keywords, tag inheritance, habits, clocking.

## UI structure

- **Combined deadline/overdue overview** at the very top — one global overview containing overdue TODO items and, when enabled, upcoming deadlines. Overdue rows are sorted most overdue first and show days overdue + kind badge (DEADLINE/SCHEDULED) + clickable TODO badge before the title. Upcoming deadline rows duplicate deadline tasks that also appear in the calendar; due text is rendered as `Today` or compact day counts like `12d`, with urgency colors that progress from red to orange to yellow to a calmer tone as the due date gets farther away.
- **Day cards** (7 consecutive days by default, or 30 days with the month-ahead toggle), each containing:
  - All-day section: title + metadata row showing `all day` · #tags
  - Deadline items: title + metadata row showing `deadline` · time (if present) · #tags
  - Timed events: title + metadata row showing time · #tags
  - Scheduled tasks: title + metadata row showing state label (`scheduled` / `task` / `done`) · time (if present) · #tags
- **DONE items** rendered at `opacity: 0.7` in muted text (`var(--text-done)`)
- **Today** indicated by blue border + small blue dot (not a text badge)
- **Day headings** are clickable/focusable controls. Activating a day heading opens the add-item panel in Event mode with that day prefilled in the When field.
- **Hide empty days** — toolbar toggle removes day blocks with no visible agenda items. If no day blocks remain, the day-card container is not rendered. Preference persists in localStorage (`mediant-hide-empty-days`).
- **Hide completed & skipped** — toolbar toggle filters out DONE entries and `skipped` (cancelled-occurrence) items from the day cards, and drops DONE entries from the someday section. Filtering happens in `renderAgendaBase` after tag filtering, so it composes with `Hide empty days` (filtered days that fall to zero items collapse). Overdue and upcoming-deadline collectors already restrict to TODO/non-cancelled items, so they need no extra filter. Preference persists in localStorage (`mediant-hide-completed`).
- **Hide upcoming deadlines** — settings toggle hides the optional upcoming-deadline rows in the combined overview. Deadline tasks still appear in the day cards, and overdue rows remain visible when present. Preference persists in localStorage (`mediant-hide-deadlines`).
- **Month-ahead view** — settings toggle expands the day-card range from 7 days to 30 days. Prev/next navigation moves by the active range length. Preference persists in localStorage (`mediant-month-ahead`).
- **Tags** rendered as plain `#tag` text below the item title.
- **Hide tags** — settings toggle hides agenda tag labels without clearing active tag filters. Active filters remain visible in the header so they can be removed. Preference persists in localStorage (`mediant-hide-tags`).
- **Tag filtering** — clicking a tag toggles it in the active filter set. Filtering applies to the visible agenda range, the combined deadline/overdue overview, and the someday section. Multiple selected tags use AND semantics: an item must contain every selected tag to remain visible.
- **Tag picker keyboard support** — in the add/edit panel, `ArrowUp`/`ArrowDown` move through tag suggestions, `Enter` selects the highlighted suggestion, and `Backspace` on an empty tag field removes the last selected pill.
- **TODO badges** — state badges display semantic text labels (`scheduled`, `task`, `done`, `deadline`) rather than the raw `TODO`/`DONE` keyword; `data-state` always holds the actual TODO/DONE value for CSS targeting and toggle behavior. Click/keyboard toggle and accessible labels are unchanged.
- **Priority badges** — `[#A]`/`[#B]`/`[#C]` rendered as small colored badges (red/amber/blue) nested inside the item title so the row grid templates stay fixed. Do not duplicate priority in metadata rows; it should appear before the title everywhere.
- **Progress badges** — `[2/3]` rendered as a small badge next to the title (green when complete, gray otherwise)
- **Checkbox lists** — `- [ ]`/`- [X]` items rendered as a mini checklist under the agenda item; checked items dimmed. Clicking a checkbox row toggles completion. The edit-panel checklist editor is available for TODO tasks, including repeating tasks, and hidden for events. Events never write checklist state. Lists are collapsed by default; a small disclosure control inside the item title (`>` collapsed, `<` expanded) toggles visibility per list. Collapse state is keyed by a stable per-list identity so it survives full agenda rerenders, and duplicate renderings of the same entry (e.g. an upcoming-deadlines row and the matching day-card row) keep independent state.
- **Recurrence-exception chip** — shifted or rescheduled occurrences show a small muted chip nested before the title: `← Moved` / `→ Moved` (arrow direction reflects whether the occurrence moved earlier or later than the base slot). Skipped occurrences are de-emphasised instead of badged: a `•` glyph prefixes the title, the row drops to opacity 0.55, and the title shifts to muted text; the word "Skipped" lives only in the tooltip / aria-label. Tooltip carries the detail (`+45m`, `from 2026-05-11 17:00-18:00`, `Skipped occurrence`).
- **Instance note** — `:EXCEPTION-NOTE-<date>:` renders as an italic one-liner directly under the occurrence, aligned with the row's title column.
- **Now line** on today's card — orange line positioned proportionally within the timed section
- **Navigation** — prev/next by the active range length, "Today" button returns to today as start date
- **Notifications** — toolbar toggle requests browser notification permission and persists `mediant-notifications`. When enabled, the client schedules notifications for timed events that occur today, 1 hour before their start time; timers are cleared and rebuilt on render.
- **Language** — settings menu shows a 2×2 grid of per-locale buttons (English, Norsk, Italiano, Deutsch); clicking any button switches directly to that language, and the active locale is highlighted. Preference persists in localStorage (`mediant-locale`); initial locale follows stored preference, then browser language when supported, then English.
- **Keyboard shortcuts** — `n` next range, `p` previous range, `t` jump to today, `a` open add-item panel, `q` open quick capture, `h` toggle hide empty days, `d` toggle hide completed & skipped, `u` toggle hide upcoming deadlines, `m` toggle month-ahead view, `x` clear active tag filters. Disabled while focus is inside text inputs, textareas, selects, or other editable controls.
- **Someday section** at the bottom — undated TODO items (no timestamps, no SCHEDULED/DEADLINE), shown in source order so quick captures stay in capture order. Section heading is localized (Tasks / Oppgaver / Attività / Aufgaben).
- **Quick capture** — fixed one-line overlay opened with `q`. `Enter` appends the text as an undated `TODO` child under top-level `* Tasks`, clears the field, and keeps focus ready for repeated capture. Leading `!`/`!!`/`!!!` maps to `[#C]`/`[#B]`/`[#A]` priority; trailing `#word` tokens become Org tags on the heading. Body text is otherwise sanitized so priority cookies, progress cookies, and timestamps in the middle of the title remain plain text. `Escape` or clicking outside the input exits.
- **Add-item panel** — slide-in panel for creating TODO tasks and events. Defaults to Task; quick capture covers low-friction TODO entry. Date-header clicks open the panel pre-selected as Event with that day prefilled. New TODOs append under top-level `* Tasks`; new events append under top-level `* Events`. Generates Org text and appends to the active source (server file or localStorage).
- **Edit-item panel** — same slide-in panel, opened from a per-item edit button. TODO/event type is locked after creation; the type selector is hidden in edit mode and the panel heading reads `Edit task` or `Edit event` accordingly. Rewrites the existing Org block in place, preserving body lines, and autosaves valid field changes immediately rather than requiring a Save button. Shows interactive checkbox toggles for TODO entries. When the clicked item is an occurrence of a repeating series, a **"This occurrence"** block appears alongside the **"Series"** fields, exposing skip/stop-repeat toggles, a move date/time field, a note field, and Clear override; these write `:EXCEPTION-<base>:` / `:EXCEPTION-NOTE-<base>:` via `upsertProperty` and `removeProperty` immediately. The base date passed through from the click (`data-base-date` on the clicked title) is always the **unshifted** slot, so writes stay stable even after a reschedule moves the occurrence to a different day.
- **Shorthand date input** — add/edit date fields accept `D`/`DD`, `D/M`, `D/M/YY`, `D/M/YYYY`, `D mon`, `D mon YY`, `+N`, weekday abbreviations (`mon`..`sun` EN, `man`..`søn` NB, `lun`..`dom` IT, `mo`..`so` DE), and month name abbreviations in all four locales (`jan`/`feb`/`mar`/`apr`/`may`/`jun`/`jul`/`aug`/`sep`/`oct`/`nov`/`dec` EN; `jan.`/`feb.`/`mars`/`apr.`/`mai`/`juni`/`juli`/`aug.`/`sep.`/`okt.`/`nov.`/`des.` NB; `gen`/`feb`/`mar`/`apr`/`mag`/`giu`/`lug`/`ago`/`set`/`ott`/`nov`/`dic` IT; `jan`/`feb`/`mär`/`apr`/`mai`/`jun`/`jul`/`aug`/`sep`/`okt`/`nov`/`dez` DE). All locale tokens are recognized regardless of the active locale. Norwegian trailing dots are optional; German diacritics are stripped before matching. Days and numeric months may be one or two digits. Ambiguous forms without a year resolve to the next future occurrence, and 2-digit years are interpreted in the current century.
- **Org source persistence** — in static mode, the textarea content is saved to `localStorage` (`mediant-org-source`). In server mode, the source is the single file selected by the CLI (`Mediant.org` by default) and localStorage is not used for it. Edits and new captures write back to that source file. All writes flow through `persistSource()` in `main.ts`, which dispatches to the active backend.

## Testing

Vitest currently covers twelve suites (369 tests), plus optional ERT coverage for the Emacs integration:

- `src/org/__tests__/timestamp.test.ts` — parsing, helpers, recurrence expansion edge cases (month boundaries, leap years), per-occurrence exception application (cancelled / shift / reschedule, including midnight rollover in both directions)
- `src/org/__tests__/parser.test.ts` — headings, states, tags, planning, timestamps, body text, drawers, checkbox items, progress cookies, `parseOverride` grammar, exception-key scanning inside PROPERTIES drawers, full integration
- `src/org/__tests__/description.test.ts` — `formatDescriptionLine` formatting: ordinary lines, src-block marker escaping, and leading-comma escaping
- `src/org/__tests__/drawer.test.ts` — `upsertProperty` / `removeProperty` round-trips (create drawer in correct position, append/update/remove keys, drop empty drawer, idempotent writes)
- `src/org/__tests__/sourceEdit.test.ts` — raw Org source rewrites for edit-panel saves, TODO/DONE toggles including repeater advancement, checkbox completion toggles, and progress-cookie updates
- `src/agenda/__tests__/generate.test.ts` — classification, recurrence, sorting, day-range structure, exception threading onto `AgendaItem`, full integration
- `src/ui/__tests__/render.test.ts` — DOM structure, global sections, badges, tags, checklist collapse behavior, recurrence chips/notes, tag filtering state, and toolbar controls
- `src/ui/__tests__/notifications.test.ts` — notification preference, permission handling, and scheduling behavior
- `src/__tests__/i18n.test.ts` — locale detection (en/nb/it/de), stored locale preference, string lookup, and fallback behavior
- `src/__tests__/main.test.ts` — browser-level integration for static mode, TODO toggles, series editing, occurrence exceptions, and persistence
- `src/__tests__/main-server.test.ts` — browser-level integration for server mode single-source writes, captures, duplicate SSE reloads, and edit-queue preservation
- `server/cli.test.ts` — CLI/server behavior for static serving, default `Mediant.org` selection, source API versioning (JSON format, 409 conflicts), SSE behavior, and directory targets resolving to one `Mediant.org` file
- `elisp/mediant-org-agenda-test.el` — ERT coverage for the optional Org agenda integration using real temporary Org agenda generation

Always run tests after changes to parser, timestamp, drawer, source-edit, agenda, rendering, notification, i18n, main integration, server logic, or the optional Elisp integration.

## Conventions

- Agenda ranges run **startDate 00:00 through final visible day 23:59:59** (local time)
- Source line numbers are **1-based**
- Body text is a **single string** read from a `#+begin_src description` block; lines joined by `\n`, two leading spaces stripped per line, leading commas unescaped. Raw prose lines outside the block are ignored.
- Planning lines only accepted **immediately after a heading** (or another planning line)
- Timestamp-only lines (the line contains nothing else) are captured as `entry.timestamps`; timestamps embedded in heading titles are preserved as plain text in `entry.title` and not captured; timestamps in prose body lines are preserved verbatim in source — none of the non-standalone forms generate agenda items
- Any line in an entry body that Mediant does not explicitly own (raw prose, blank lines, inactive timestamps, etc.) is **preserved verbatim** in the source on write; the write path only replaces the heading, planning, description block content, and checkboxes
- Checkbox list items (`- [ ]`/`- [X]`) are captured into `checkboxItems`, not body text
- `#+` keyword lines and `# ` comment lines inside entries are **skipped, not preserved as body**
- Any `:UPPERCASENAME:...:END:` block is skipped **except** `:PROPERTIES:` drawers, where `:EXCEPTION-<date>:`, `:EXCEPTION-NOTE-<date>:`, and `:SERIES-UNTIL:` keys are read; every other property key is still ignored
- Source rewrites are line-number based and operate on raw Org text. Keep reusable rewrite behavior in `src/org/sourceEdit.ts` or `src/org/drawer.ts` so it can be tested without DOM setup.

## Non-goals (v1)

- Full Org-mode syntax
- Heading hierarchy in the agenda
- Arbitrary property drawers beyond `:EXCEPTION-…:` / `:EXCEPTION-NOTE-…:` / `:SERIES-UNTIL:`; habits, clocking, `:STYLE:`, `:CATEGORY:`, effort estimates
- "This and future" split operations (tracked in TODO.md)
- Timezone handling
- Advanced state workflows / custom TODO sequences
- Export to other formats
