# Mediant

A calm, focused agenda backed by one plain text file: `Mediant.org`.

> Not every future thing is the same kind of thing.

The agenda has three spaces:

* **Deadlines** — things that exert pressure
* **Calendar** — things that have a place in time
* **Someday** — possible futures that should remain visible without demanding attention

```org
** TODO Pay tax balance :finance:
DEADLINE: <2026-05-31 Sun +1y>

** Public holiday :holiday:
<2026-04-05 Sun>

** TODO Read Shakespeare :books:
```

---

## The shape of the agenda

Mediant has three core sections.

### Deadline / Overdue Overview

Deadlines are things that exert pressure.

Overdue items and approaching deadlines appear together in one combined overview at the top. Overdue rows are always part of this section. Upcoming deadline rows are optional; deadline tasks still appear on their calendar day when those rows are hidden.

This section answers questions like:

* What is becoming urgent?
* What am I at risk of forgetting?
* What is pulling on my attention?
* What needs action even if it is not scheduled for a specific day?

Deadlines have gravity.

They are calendar items with pressure attached: they live on the calendar, and the overview duplicates them when you want to scan urgency directly.

### Calendar

The calendar shows things that already have a place in time.

Scheduled tasks, deadline tasks, timed events, all-day events, and recurring occurrences appear inside the active date range.

This section answers questions like:

* What does today look like?
* What happens tomorrow?
* When do I actually need to be somewhere?
* What have I committed to on specific days?

The calendar is about commitment and structure.

It shows the shape of time, not every possible thing you could be doing.

### Someday

Someday is for things that matter, but not immediately.

Tasks without a date appear here.

This section answers questions like:

* What ideas exist?
* What could become important later?
* What should stay visible without demanding attention?
* What have I captured, but not placed in time?

It's a place for possible futures.

### Three spaces, three logics

These sections intentionally follow different rules because they serve different purposes:

* deadline and overdue pressure at the top
* calendar commitments in the middle
* possibilities below

---

## What Mediant feels like

Mediant is designed for fast visual scanning.

It gives you:

* overdue items at the top
* optional upcoming deadlines grouped by temporal urgency
* scheduled tasks, deadline tasks, and timed events in the calendar
* recurring tasks and events with per-occurrence exceptions
* quick capture with keybindings
* add and edit panels
* autosaving field edits
* tag and priority filtering
* optional browser notifications for timed events
* English, Norwegian, Italian, and German UI strings

The interface tries to stay quiet. Features are available, but they should not make the default view feel like a dashboard, a team workspace, or a database admin panel.

Mediant is for "my stuff".

---

## The basic model

Mediant has three layers:

```text
Mediant.org → parser → agenda → UI
```

The Mediant.org file is the source of truth.

The parser reads the Mediant.org dialect into structured entries.

The agenda generator decides what should appear as a deadline, in the calendar, in someday, or not at all for the current view.

The UI renders that agenda and writes common edits back into the original Mediant.org source.

Parsing is about the source dialect. Agenda classification is about what the interface needs to show.

---

## Two ways to use it

Mediant can run in two modes.

### Static mode

Paste Mediant.org dialect content into the browser.

Everything stays in `localStorage`.

There is no server, no account, no database, and no install step beyond hosting the static files.

This is useful for:

* trying Mediant
* temporary Mediant.org agendas
* simple personal lists
* static hosting
* browser-only use

### Server mode

Run Mediant against one Mediant.org file. With no target, Mediant uses `./Mediant.org`.

```sh
mediant                      # ./Mediant.org
mediant ~/org/Mediant.org    # explicit file
mediant ~/org/               # ~/org/Mediant.org
```

Passing a directory is only a convenience for selecting that directory's `Mediant.org`; Mediant does not load every `.org` file in the directory.

Mediant starts a tiny Node server bound to `127.0.0.1`. The browser hydrates from disk, writes edits back to the same file, and receives live updates when that file changes externally.

That means you can edit the Mediant.org file from Emacs and see the browser UI update automatically.

This is useful for:

* using Mediant.org as the real storage format
* combining Emacs editing with a browser agenda
* local desktop use
* mobile access through Tailscale, SSH tunnels, or a reverse proxy
* syncing Mediant.org with Dropbox, Syncthing, git, Nextcloud, or anything else

Mediant does not include authentication. If you expose it beyond localhost, put it behind something you trust.

## Getting started

Install dependencies and start the development server:

```sh
npm install
npx vite
```

The dev server runs at:

```text
http://localhost:5173
```

In this mode, Mediant uses the textarea/static workflow.

Run tests:

```sh
npm test
```

Build the browser bundle:

```sh
npm run build
```

`npm install` only pulls development tooling:

* TypeScript
* Vite
* Vitest
* happy-dom

The shipped runtime uses no npm packages. The browser bundle is static, and the optional server uses only Node built-ins.

---

## Server mode

Build once:

```sh
npm run build
```

Run Mediant against one Mediant.org file. With no argument, the default source is `./Mediant.org`.

```sh
node server/cli.mjs                       # ./Mediant.org
node server/cli.mjs ~/org/Mediant.org     # explicit file
node server/cli.mjs ~/org/                # ~/org/Mediant.org
```

Passing a directory selects `Mediant.org` inside that directory. It is not an org-directory indexing mode.

By default, the server listens on:

```text
http://localhost:4242
```

Use another port:

```sh
node server/cli.mjs --port 7000
```

Run in the background:

```sh
node server/cli.mjs --daemon
```

After installing globally or linking the package:

```sh
npm install -g .
# or
npm link
```

You can run:

```sh
mediant
mediant --port 7000
mediant --daemon
```

A daemon prints its PID when it starts. Stop it with:

```sh
kill <pid>
```

### Server behavior

In server mode:

* the browser loads the Mediant.org source file from disk
* UI edits are written back to that file
* new captures are appended to that file
* external edits are detected automatically
* updates are pushed to the browser with Server-Sent Events
* the Mediant.org file on disk is the source of truth

Conflict strategy: **disk wins**.

If the file changes underneath the browser, the server rejects the stale write with `409`, and the UI reloads from disk.

### Security

The server binds to `127.0.0.1` and has no built-in authentication.

For remote access, use something like:

* Tailscale
* an SSH tunnel
* a trusted reverse proxy
* another private network layer

Do not expose the server directly to the public internet unless you have added your own protection in front of it.

---

## Daily workflow

Mediant is designed around a few common actions.

### Capture something quickly

Press `q` to open quick capture.

Type a task, press `Enter`, and Mediant appends it as an undated `TODO` under `* Tasks`.

The field stays focused so you can enter several tasks quickly.

You can prefix the text with `!`, `!!`, or `!!!` to set priority C, B, or A. Trailing `#word` tokens become Org tags on the heading.

### Add a task or event

Press `a` to open the add-item panel.

New TODO tasks are appended under:

```org
* Tasks
```

New events are appended under:

```org
* Events
```

### Edit an existing item

Click an item to open the edit panel.

Edits autosave as fields change. There is no separate Save button.

The editor preserves source text it does not own and updates the relevant canonical fields in the Mediant.org source.

### Work with tags

Click a tag to filter the agenda.

Multiple selected tags use AND semantics: an item must contain every selected tag to remain visible.

Active filters can be cleared by clicking a selected tag again.

### Work with priorities

Mediant understands Org priority cookies in the Mediant.org dialect, such as:

```org
** TODO [#A] Pay invoice
```

Priority can be added through quick capture with leading exclamation marks:

| Input prefix | Org priority |
| ------------ | ------------ |
| `!`          | `[#C]`       |
| `!!`         | `[#B]`       |
| `!!!`        | `[#A]`       |

Priorities can also be used as filters in the interface.

### Work with recurring items

Repeating timestamps render as multiple agenda occurrences.

When editing a recurring occurrence, Mediant can apply a one-off change to that occurrence without changing the whole series.

Supported per-occurrence changes include:

* skip this occurrence
* shift this occurrence by minutes, hours, or days
* reschedule this occurrence to another date or time
* attach a one-off note
* stop the series before a given base occurrence

These changes are stored as ordinary Org properties, so the file remains valid Org.

---

## Keyboard shortcuts

| Key | Action                            |
| --- | --------------------------------- |
| `n` | Next range                        |
| `p` | Previous range                    |
| `t` | Jump to today                     |
| `a` | Open add-item panel               |
| `q` | Open quick capture                |
| `h` | Toggle hide empty days            |
| `d` | Toggle hide completed and skipped |
| `u` | Toggle hide upcoming deadlines    |
| `m` | Toggle month-ahead view           |
| `x` | Clear active tag filters          |

Shortcuts are disabled while typing in form fields.

---

## Date input shorthand

Add and edit fields accept a few shorthand forms:

| Input        | Meaning                          |
| ------------ | -------------------------------- |
| `D` / `DD`   | Day of current or next month     |
| `D/M`        | Day and month                    |
| `D/M/YY`     | Day, month, two-digit year       |
| `D/M/YYYY`   | Full date                        |
| `D mon`      | Day and month name, e.g. `8 jun` |
| `D mon YY`   | Day, month name, two-digit year  |
| `+N`         | N days from today                |
| `mon`..`sun` | Next matching weekday, English   |
| `man`..`søn` | Next matching weekday, Norwegian |
| `lun`..`dom` | Next matching weekday, Italian   |
| `mo`..`so`   | Next matching weekday, German    |

Days and numeric months may be one or two digits. Ambiguous date forms without a year resolve to the next future occurrence. Two-digit years are interpreted in the current century.

Month name tokens are recognised in all four languages regardless of the active locale:

| Month     | English | Norwegian | Italian | German |
| --------- | ------- | --------- | ------- | ------ |
| January   | `jan`   | `jan.`    | `gen`   | `jan`  |
| February  | `feb`   | `feb.`    | `feb`   | `feb`  |
| March     | `mar`   | `mars`    | `mar`   | `mär`  |
| April     | `apr`   | `apr.`    | `apr`   | `apr`  |
| May       | `may`   | `mai`     | `mag`   | `mai`  |
| June      | `jun`   | `juni`    | `giu`   | `jun`  |
| July      | `jul`   | `juli`    | `lug`   | `jul`  |
| August    | `aug`   | `aug.`    | `ago`   | `aug`  |
| September | `sep`   | `sep.`    | `set`   | `sep`  |
| October   | `oct`   | `okt.`    | `ott`   | `okt`  |
| November  | `nov`   | `nov.`    | `nov`   | `nov`  |
| December  | `dec`   | `des.`    | `dic`   | `dez`  |

Norwegian trailing dots are optional. German `mär` and `märz` are matched after diacritic stripping.

---

## Mediant.org syntax

Mediant reads and writes a small Org-readable dialect. Its model is intentionally narrow:

- **Events** — plain headings with a standalone active timestamp as the first semantic body line.
- **Tasks** — `TODO` or `DONE` headings with an optional planning line containing `DEADLINE:`, `SCHEDULED:`, or both.
- **Standalone timestamps only** — active timestamps are only recognised when they are the sole content of a line. Timestamps embedded in heading titles or body prose are not extracted into the agenda.
- **No tag inheritance** — tags are only read from the heading they appear on; parent tags do not propagate to children.
- **Two TODO states** — only `TODO` and `DONE` are recognised; any other keyword is treated as part of the title.

Every editable field maps to one obvious location in the source file. Features like tag inheritance, inline timestamps, and org-directory indexing weaken that contract, so Mediant does not support them.

Canonical event:

```org
** Public holiday :holiday:
<2026-04-05 Sun>
```

Canonical task:

```org
** TODO Pay tax balance :finance:
DEADLINE: <2026-05-31 Sun +1y>
```

When a task has both deadline and scheduled planning, `DEADLINE:` must come before `SCHEDULED:`.

Raw prose outside a description block is preserved on write but not parsed as body content. Inline timestamps in prose are preserved as text and do not generate agenda items. Description blocks (`#+begin_src description`) are parsed as body content and shown in the edit panel.

Everything Mediant does not recognise is preserved verbatim where possible. For the full breakdown see [`ORG-SYNTAX.md`](ORG-SYNTAX.md).

| Feature          | Example                                     |
| ---------------- | ------------------------------------------- |
| Headings         | `* Top level` / `** Second level`           |
| TODO / DONE      | `** TODO Some task` / `** DONE Finished`    |
| Priority cookies | `** TODO [#A] Urgent task`                  |
| Tags             | `** Heading :tag1:tag2:`                    |
| Active timestamp | `<2026-04-07 Tue 15:15-16:00>` (standalone line only) |
| Repeater         | `<2026-04-07 Tue 15:15-16:00 +1w>`          |
| SCHEDULED        | `SCHEDULED: <2026-04-14 Tue 12:00>`         |
| DEADLINE         | `DEADLINE: <2026-05-05 Tue>`                |
| Checkbox lists   | `- [ ] Pending` / `- [X] Done`              |
| Progress cookies | `** TODO Task [2/3]` / `** TODO Task [66%]` (treated as text) |
| Body text        | `#+begin_src description` block             |

---

## Mediant-specific syntax extensions

Mediant adds two small extensions on top of ordinary Org property drawers:

* recurrence exceptions
* series truncation

These represent per-occurrence changes to repeating entries. Because they use standard property drawer syntax, the file stays valid Org — Emacs opens, edits, and saves it normally. Emacs agenda ignores these keys unless the optional Elisp integration below is enabled.

### Recurrence exceptions

A repeating Org entry may have one-off changes keyed by the unshifted base occurrence date.

Example:

```org
** TODO Yoga :health:
SCHEDULED: <2026-04-27 Mon 17:00-18:00 +1w>
:PROPERTIES:
:EXCEPTION-2026-05-04: shift +45m
:EXCEPTION-NOTE-2026-05-04: Bring mat and water
:EXCEPTION-2026-05-11: reschedule 2026-05-12 18:00
:EXCEPTION-2026-05-18: cancelled
:SERIES-UNTIL: 2026-06-01
:END:
```

Supported exception values:

| Value                               | Meaning                                             |
| ----------------------------------- | --------------------------------------------------- |
| `cancelled`                         | Hide or de-emphasize this occurrence                |
| `shift +45m`                        | Move this occurrence by a relative offset           |
| `shift -1h`                         | Move this occurrence earlier by one hour            |
| `shift +1d`                         | Move this occurrence forward by one day             |
| `reschedule YYYY-MM-DD`             | Move this occurrence to another date                |
| `reschedule YYYY-MM-DD HH:MM`       | Move this occurrence to another date and time       |
| `reschedule YYYY-MM-DD HH:MM-HH:MM` | Move this occurrence to another date and time range |

A note can be attached with:

```org
:EXCEPTION-NOTE-YYYY-MM-DD: Note text
```

The date in the property key is always the original base date of the occurrence, not the final rendered date after a shift or reschedule.

This keeps the exception stable even if the occurrence moves.

### Series truncation

A repeating series can be cut off with:

```org
:SERIES-UNTIL: YYYY-MM-DD
```

`SERIES-UNTIL` is an exclusive end date.

It is evaluated against the repeater's unshifted base slots, not the final rendered dates after exception handling.

That means:

* a base occurrence dated exactly `2026-06-01` is excluded
* an exception keyed to `2026-06-01` or later is ignored because that base slot no longer exists
* an earlier valid base slot may still be rescheduled past `2026-06-01`

This makes split-series handoff work cleanly: one heading can end on a base date while a successor heading starts on that same date without overlapping base occurrences.

See [`ORG-SYNTAX.md`](ORG-SYNTAX.md#mediant-specific-extensions) for the full grammar, edge cases, and interop notes.

---

## Optional Emacs Org agenda integration

Out of the box, Emacs treats Mediant's exception properties as ordinary properties — they round-trip safely, and Org agenda shows every base occurrence normally.

The bundled Elisp integration teaches Org agenda to honor Mediant recurrence exceptions when displaying the agenda.

It can:

* hide cancelled occurrences
* move shifted and rescheduled occurrences to their target day/time
* show `EXCEPTION-NOTE` text as a sub-line under the occurrence
* apply `SERIES-UNTIL` as an exclusive series cutoff

Enable it with:

```elisp
(add-to-list 'load-path "/path/to/Mediant/elisp")
(require 'mediant-org-agenda)
(mediant-org-agenda-mode 1)
```

The integration is display-only. It does not add Emacs commands for creating or editing exception properties.

To write those properties, use Mediant's edit panel or edit the property drawer by hand.

### Org capture templates

The bundled capture templates let you add entries to Mediant.org from anywhere in Emacs using the standard `org-capture` interface (`C-c c`).

Enable them with:

```elisp
(add-to-list 'load-path "/path/to/Mediant/elisp")
(load "mediant-capture-templates")
```

`org-directory` must be set before loading so the file path to `Mediant.org` can be resolved.

The templates registered are:

| Key | Name                        | Target section | Planning |
| --- | --------------------------- | -------------- | -------- |
| `t` | Todo                        | Tasks          | none |
| `d` | Todo with deadline          | Tasks          | `DEADLINE:` |
| `s` | Scheduled todo              | Tasks          | `SCHEDULED:` |
| `b` | Scheduled todo with deadline | Tasks         | `DEADLINE: … SCHEDULED:` |
| `e` | Event                       | Events         | standalone active timestamp |
| `w` | Weekly event                | Events         | repeating timestamp (`+1w`) |
| `m` | Monthly event               | Events         | repeating timestamp (`+1m`) |
| `y` | Yearly event                | Events         | repeating timestamp (`+1y`) |

Each date-bearing template prompts for a date using `org-read-date` and produces a timestamp in the format Mediant expects.

---

## API

In server mode, Mediant exposes three endpoints on top of the static UI.

| Method | Path          | Purpose                                                                                    |
| ------ | ------------- | ------------------------------------------------------------------------------------------ |
| `GET`  | `/api/source` | Returns JSON: `{ content, version }`. |
| `PUT`  | `/api/source` | Writes the Mediant.org source file. Body JSON: `{ content, version }`. Version mismatch returns `409`. |
| `GET`  | `/api/events` | Server-Sent Events stream. Emits `data: <changeToken>` when the Mediant.org source file changes on disk. |

The version is the Mediant.org source file's modification timestamp (milliseconds). SSE change tokens are monotonic invalidation hints for the current server process; clients re-read `/api/source` and compare the version.

Write conflicts are rejected with `409`. The UI then reloads the Mediant.org source file from disk.

---

## Architecture

Mediant is split into three main stages:

```text
Mediant.org → Parser (src/org/) → Agenda (src/agenda/) → UI (src/ui/)
               OrgEntry[]          Agenda model          HTML/CSS
```

### Parser layer

The parser reads Mediant.org source into structures that reflect the Mediant.org file:

* headings
* TODO state
* priority cookies
* tags
* planning lines
* timestamps
* checkbox items
* progress cookies (treated as text)
* body text (from `#+begin_src description` blocks; raw prose lines are preserved but not parsed as body, and inline timestamps in prose are ignored as agenda semantics)
* selected property drawer values

Parser types should describe Mediant.org source faithfully. They should not decide how an entry appears in the agenda.

### Agenda layer

The agenda generator turns parsed Mediant.org entries into display-oriented structures:

* deadline items
* agenda days
* timed items
* all-day items
* someday items
* recurring occurrences

Classification happens here, not in the parser.

This is where Mediant creates calendar items, the combined deadline/overdue overview, and someday items. These are display classifications with different sorting and filtering rules, not parser concepts.

### UI layer

The UI renders the agenda and wires interaction:

* combined deadline/overdue overview
* calendar
* someday list
* filters
* settings
* quick capture
* add/edit panels
* notifications
* source mutation helpers

The UI writes back to the original Mediant.org source rather than maintaining a separate database.

---

## Project structure

```text
src/
  org/
    model.ts            — Parser output types
    timestamp.ts        — Timestamp parsing, Date conversion, recurrence expansion, exception handling
    parser.ts           — Line-by-line Mediant.org parser
    description.ts      — Description block formatting helpers (indent + escape for #+begin_src description)
    drawer.ts           — Property-drawer mutation helpers
    sourceEdit.ts       — Raw Mediant.org source mutation helpers for UI writes
    __tests__/          — Timestamp, parser, description, drawer, and source-edit tests

  agenda/
    model.ts            — Render-oriented agenda types
    generate.ts         — Range generation, classification, sorting, deadline collection
    __tests__/          — Agenda generation tests

  ui/
    render.ts           — DOM rendering
    notifications.ts    — Browser notification preference and timer scheduling
    style.css           — Styles

  i18n.ts               — English/Norwegian/Italian/German UI strings and locale persistence
  main.ts               — Entry point: hydrate, parse, generate, render

server/
  cli.mjs               — Node CLI and HTTP server using built-in modules only

elisp/
  mediant-org-agenda.el          — Optional Org agenda display integration
  mediant-capture-templates.el   — Optional Org capture templates for Mediant.org entries

index.html              — Minimal browser shell
```

---

## Tech stack

* **TypeScript** — parser, data model, agenda generation, rendering
* **HTML/CSS** — agenda UI
* **Vite** — development server and bundling
* **Vitest** — test runner
* **happy-dom** — DOM environment for tests
* **Node built-ins** — optional local server and CLI

Mediant has no runtime npm dependencies in the shipped browser bundle or server.

---

## Tests

Run the full test suite:

```sh
npm test
```

The test suite covers parser behavior, timestamp handling, recurrence expansion, source editing, agenda generation, UI rendering, notifications, i18n, main entry behavior, and server behavior.

---

## Local storage

Mediant uses browser `localStorage` for UI preferences and, in static mode, the pasted Mediant.org source.

| Key                       | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `mediant-org-source`      | Pasted Mediant.org content in static mode. Ignored in server mode. |
| `mediant-hide-tags`       | Whether agenda tag labels are hidden.                      |
| `mediant-hide-empty-days` | Whether empty days are hidden.                             |
| `mediant-hide-completed`  | Whether DONE entries and skipped occurrences are hidden.   |
| `mediant-hide-deadlines`  | Whether optional deadline overview rows are hidden.        |
| `mediant-month-ahead`     | Whether the agenda shows 30 days instead of 7.             |
| `mediant-notifications`   | Whether browser reminders are enabled.                     |
| `mediant-locale`          | Selected UI locale: `en`, `nb`, `it`, or `de`.             |

In static mode, the Mediant.org source lives in the browser.

In server mode, the Mediant.org source lives in the file passed to the CLI, or `Mediant.org` when the target is omitted or is a directory. UI preferences are still browser-local.

---

## Non-goals

* full or arbitrary Org-mode syntax
* heading hierarchy in the agenda view
* arbitrary property drawer semantics
* habits
* clocking
* timezone handling beyond local time
* custom TODO keyword workflows
* advanced state machines
* export
* collaborative editing
* built-in authentication
* a database backend
* accounts or cloud sync

For unsupported syntax, the preferred behavior is graceful ignoring and preservation where possible rather than failure.

---

## Data ownership

Mediant is designed so the important data remains outside Mediant.

Your Mediant.org file can be edited with other tools, synced with whatever you prefer, backed up normally, and read without this project.

Mediant should make the file nicer to use, not make the file depend on Mediant.

---

## License

[GPLv3](LICENSE)
