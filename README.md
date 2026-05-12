# Mediant

A calm, focused web agenda for Org-mode files.

Mediant turns a plain `.org` file into a clean rolling agenda view: overdue tasks, upcoming deadlines, scheduled items, recurring events, quick capture, lightweight editing, tag filtering, and optional browser notifications.

It is built around a simple idea:

> Your tasks should stay as plain text files,
> but the interface should still feel modern, fast, and pleasant to use.

Mediant is not a full Org-mode implementation. It is not a project-management platform. It is not a cloud service. It is a small agenda UI for people who like plain files, but do not always want to live inside Emacs just to see what their week looks like.

You keep the file. Mediant gives it a focused interface.

---

## Why Mediant exists

Org-mode is powerful because it stores real information in ordinary text files. You can edit them anywhere, version them, sync them, grep them, and keep them for decades.

But a plain text file is not always the best interface for answering simple daily questions:

* What is happening today?
* What is overdue?
* What is coming up this week?
* Which deadlines are getting close?
* What did I schedule but forget?
* What can I quickly capture without opening my whole system?

Mediant exists for that layer.

It keeps Org as the source of truth, then adds a focused browser interface for the agenda-shaped parts of the file.

The goal is not to expose every possible Org feature. The goal is to make the common personal-agenda workflow feel clear, fast, and calm.

---

## What Mediant feels like

Mediant is designed for fast visual scanning.

It gives you:

* a rolling agenda view
* overdue items at the top
* upcoming deadlines below that
* day cards for the active range
* scheduled tasks and timed events
* subtle handling of DONE items
* quick capture with a single key
* lightweight add/edit panels
* tag and priority filtering
* recurring tasks with per-occurrence exceptions
* optional browser notifications for timed events
* English, Norwegian, Italian, and German UI strings

The interface tries to stay quiet. Features are available, but they should not make the default view feel like a dashboard, a team workspace, or a database admin panel.

Mediant is for “my stuff”.

---

## The basic model

Mediant has three layers:

```text
.org file → parser → agenda → UI
```

The `.org` file is the source of truth.

The parser reads a practical subset of Org syntax into structured entries.

The agenda generator decides what should appear today, tomorrow, next week, in overdue, in deadlines, or in someday.

The UI renders that agenda and writes common edits back into the original Org source.

This separation is important: parsing remains about Org syntax, while agenda classification remains about what the interface needs to show.

---

## Two ways to use it

Mediant can run in two modes.

### Static mode

Paste Org content into the browser.

Everything stays in `localStorage`.

There is no server, no account, no database, and no install step beyond hosting the static files.

This is useful for:

* trying Mediant
* temporary agendas
* simple personal lists
* static hosting
* browser-only use

### Server mode

Run Mediant against a real Org file:

```sh
mediant ~/org/todo.org
```

Mediant starts a tiny Node server bound to `127.0.0.1`. The browser hydrates from the file, writes edits back to disk, and receives live updates when the file changes externally.

That means you can edit the same file from Emacs and see the browser UI update automatically.

This is useful for:

* using Org as the real storage format
* combining Emacs editing with a browser agenda
* local desktop use
* mobile access through Tailscale, SSH tunnels, or a reverse proxy
* syncing the file with Dropbox, Syncthing, git, Nextcloud, or anything else

Mediant does not include authentication. If you expose it beyond localhost, put it behind something you trust.

---

## What Mediant is not

Mediant is deliberately not trying to become all of Org-mode in the browser.

It does not aim to replace Emacs Org.

It does not attempt to support every Org syntax feature.

It does not provide collaboration, accounts, teams, ACLs, dashboards, or a database backend.

It does not try to own your workflow.

The intended shape is smaller:

> One plain file.
> One focused agenda.
> Enough editing to support daily use.

---

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

Run Mediant against an Org file:

```sh
node server/cli.mjs ~/org/todo.org
```

By default, the server listens on:

```text
http://localhost:4242
```

Use another port:

```sh
node server/cli.mjs ~/org/todo.org --port 7000
```

Run in the background:

```sh
node server/cli.mjs ~/org/todo.org --daemon
```

After installing globally or linking the package:

```sh
npm install -g .
# or
npm link
```

You can run:

```sh
mediant ~/org/todo.org
mediant ~/org/todo.org --port 7000
mediant ~/org/todo.org --daemon
```

A daemon prints its PID when it starts. Stop it with:

```sh
kill <pid>
```

### Server behavior

In server mode:

* the browser loads the Org source from disk
* UI edits are written back to the file
* external edits are detected automatically
* updates are pushed to the browser with Server-Sent Events
* the file on disk is the source of truth

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

## The agenda view

Mediant renders a rolling agenda from your Org file.

The main view includes:

* **Overdue** — TODO items past their `SCHEDULED` or `DEADLINE` date
* **Upcoming deadlines** — future deadlines sorted by due date
* **Day cards** — scheduled tasks, timed events, all-day items, and recurring occurrences
* **Someday** — undated TODO items with no timestamp, `SCHEDULED`, or `DEADLINE`

The default range is 7 days. A month-ahead toggle expands the range to 30 days.

You can navigate with buttons or keyboard shortcuts.

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

The editor preserves body text and updates the relevant part of the original Org source.

### Work with tags

Click a tag to filter the agenda.

Multiple selected tags use AND semantics: an item must contain every selected tag to remain visible.

Active filters are shown in the header and can be cleared in one click.

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

| Input        | Meaning                         |
| ------------ | ------------------------------- |
| `DD`         | Day of current or next month    |
| `DD/MM`      | Day and month                   |
| `DD/MM/YY`   | Day, month, two-digit year      |
| `DD/MM/YYYY` | Full date                       |
| `+N`         | N days from today               |
| `mon`..`sun` | Next matching weekday (English)  |
| `man`..`søn` | Next matching weekday (Norwegian) |
| `lun`..`dom` | Next matching weekday (Italian)  |
| `mo`..`so`   | Next matching weekday (German)   |

Ambiguous numeric forms resolve to the next future occurrence. Two-digit years are interpreted in the current century.

---

## Supported Org syntax

Mediant supports a practical subset of Org syntax for agenda use.

For the full breakdown of supported, gracefully ignored, and unsupported syntax, see [`ORG-SYNTAX.md`](ORG-SYNTAX.md).

| Feature          | Example                                     |
| ---------------- | ------------------------------------------- |
| Headings         | `* Top level` / `** Second level`           |
| TODO / DONE      | `** TODO Some task` / `** DONE Finished`    |
| Priority cookies | `** TODO [#A] Urgent task`                  |
| Tags             | `** Heading :tag1:tag2:`                    |
| Active timestamp | `<2026-04-07 ti. 15:15-16:00>`              |
| Repeater         | `<2026-04-07 ti. 15:15-16:00 +1w>`          |
| SCHEDULED        | `SCHEDULED: <2026-04-14 ti. 12:00>`         |
| DEADLINE         | `DEADLINE: <2026-05-05 ti.>`                |
| Checkbox lists   | `- [ ] Pending` / `- [X] Done`              |
| Progress cookies | `** TODO Task [2/3]` / `** TODO Task [66%]` |
| Body text        | Free text lines under a heading             |

Anything outside this subset is ignored gracefully. Unsupported syntax should not cause parse errors.

---

## Mediant-specific Org extensions

Mediant adds two small extensions on top of ordinary Org property drawers:

* recurrence exceptions
* series truncation

These are used to represent per-occurrence changes to repeating entries.

Because they are stored as normal property drawer keys, the file remains valid Org. Emacs can open and edit it without knowing anything about Mediant.

### Recurrence exceptions

A repeating Org entry may have one-off changes keyed by the unshifted base occurrence date.

Example:

```org
** TODO Yoga :health:
SCHEDULED: <2026-04-27 ma. 17:00-18:00 +1w>
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

Out of the box, Emacs treats Mediant's exception properties as ordinary properties.

That is safe: they round-trip normally, but Org agenda will still show every base occurrence.

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

---

## API

In server mode, Mediant exposes three endpoints on top of the static UI.

| Method | Path          | Purpose                                                                           |
| ------ | ------------- | --------------------------------------------------------------------------------- |
| `GET`  | `/api/source` | Returns the file contents. Response header: `X-Version: <mtimeMs>`.               |
| `PUT`  | `/api/source` | Writes the file. Accepts `If-Match: <version>`. Version mismatch returns `409`.   |
| `GET`  | `/api/events` | Server-Sent Events stream. Emits `data: <version>` when the file changes on disk. |

The version is based on the file modification timestamp.

Write conflicts are rejected. The UI then reloads from disk.

---

## Architecture

Mediant is split into three main stages:

```text
.org file → Parser (src/org/) → Agenda (src/agenda/) → UI (src/ui/)
            OrgEntry[]          AgendaDay[]            HTML/CSS
```

### Parser layer

The parser reads Org source into structures that reflect the file:

* headings
* TODO state
* priority cookies
* tags
* planning lines
* timestamps
* checkbox items
* progress cookies
* body text
* selected property drawer values

Parser types should describe Org source faithfully. They should not decide how an entry appears in the agenda.

### Agenda layer

The agenda generator turns parsed Org entries into display-oriented structures:

* agenda days
* timed items
* all-day items
* overdue items
* deadline items
* someday items
* recurrence occurrences

Classification happens here, not in the parser.

### UI layer

The UI renders the agenda and wires interaction:

* day cards
* filters
* settings
* quick capture
* add/edit panels
* notifications
* source mutation helpers

The UI writes back to the original Org source rather than maintaining a separate database.

---

## Project structure

```text
src/
  org/
    model.ts           — Parser output types
    timestamp.ts       — Timestamp parsing, Date conversion, recurrence expansion, exception handling
    parser.ts          — Line-by-line Org parser
    drawer.ts          — Property-drawer mutation helpers
    sourceEdit.ts      — Raw Org source mutation helpers for UI writes
    __tests__/         — Timestamp, parser, and drawer tests

  agenda/
    model.ts           — Render-oriented agenda types
    generate.ts        — Range generation, classification, sorting, deadline collection
    __tests__/         — Agenda generation tests

  ui/
    render.ts          — DOM rendering
    notifications.ts   — Browser notification preference and timer scheduling
    style.css          — Styles

  i18n.ts              — English/Norwegian/Italian/German UI strings and locale persistence
  main.ts              — Entry point: hydrate, parse, generate, render

server/
  cli.mjs              — Node CLI and HTTP server using built-in modules only

elisp/
  mediant-org-agenda.el — Optional Org agenda display integration

index.html             — Minimal browser shell
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

Mediant uses browser `localStorage` for UI preferences and, in static mode, the pasted Org source.

| Key                       | Purpose                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `mediant-org-source`      | Pasted Org content in static mode. Ignored in server mode. |
| `mediant-hide-tags`       | Whether agenda tag labels are hidden.                      |
| `mediant-hide-empty-days` | Whether empty days are hidden.                             |
| `mediant-hide-completed`  | Whether DONE entries and skipped occurrences are hidden.   |
| `mediant-month-ahead`     | Whether the agenda shows 30 days instead of 7.             |
| `mediant-notifications`   | Whether browser reminders are enabled.                     |
| `mediant-locale`          | Selected UI locale: `en`, `nb`, `it`, or `de`.             |
| `theme`                   | Light/dark mode preference.                                |

In static mode, the Org source lives in the browser.

In server mode, the Org source lives in the file passed to the CLI. UI preferences are still browser-local.

---

## Non-goals

Mediant intentionally does not support everything Org-mode can do.

Current non-goals include:

* full Org-mode syntax
* heading hierarchy in the agenda view
* arbitrary property drawer semantics
* habits
* clocking
* timezone handling beyond local time
* custom TODO keyword workflows
* advanced state machines
* multi-file agenda
* export
* collaborative editing
* built-in authentication
* a database backend
* accounts or cloud sync

For unsupported Org syntax, the preferred behavior is graceful ignoring rather than failure.

---

## Data ownership

Mediant is designed so the important data remains outside Mediant.

Your Org file can be edited with other tools, synced with whatever you prefer, backed up normally, and read without this project.

Mediant should make the file nicer to use, not make the file depend on Mediant.

---

## License

[GPLv3](LICENSE)

