# Org Syntax Reference

Mediant reads and writes Mediant.org: a deliberate Org-readable dialect designed for Mediant's agenda model. It is not merely a reduced subset of Org-mode.

The dialect is intentionally narrow where broad Org compatibility would create ambiguous editing rules, overloaded source locations, or a DevTools-like UI. Features are not added just because Org-mode supports them. Mediant-specific syntax is acceptable when it models real calendar or task behavior that the agenda needs, while preserving one clear source location and one clear UI meaning.

Every feature Mediant does support should parse correctly and round-trip without loss. Everything it does not support is either preserved verbatim or silently skipped — it never corrupts content it doesn't understand.

In short: Mediant.org is an Org-readable agenda language. It borrows Org syntax where useful, preserves Org text where possible, and adds small Mediant-specific semantics only when they make real-world agenda editing better.

## Dialect rules

- Mediant may extend Org where the extension strengthens Mediant's agenda model.
- Mediant should not chase Org features for compatibility alone.
- One item should have one canonical temporal source.
- Every editable UI field must map to one obvious source location.
- Unknown Org should be preserved where possible, not interpreted.
- Mediant may preserve more Org than it understands.
- Mediant may understand more Org than it edits.
- Mediant should only edit canonical, simple fields.

## Deliberate simplifications

These are conscious design decisions, not gaps to be filled later:

- **Two canonical entry types.** Mediant's first-class entries are events and TODO tasks. An event is a plain heading followed by an active timestamp on its own line. A task is a `TODO` or `DONE` heading, optionally followed immediately by one planning line containing `DEADLINE:`, `SCHEDULED:`, or both; when both are present, `DEADLINE:` comes first.
- **No tag inheritance.** Tags are only recognised on the heading line they appear on. A parent heading's tags do not propagate to its children.
- **Standalone timestamps only.** An active timestamp generates an agenda item only when it is the sole content of a line (possibly with surrounding whitespace). Timestamps embedded in a heading title are preserved as plain text in the title and are not interpreted by the agenda. Timestamps embedded in body prose are preserved verbatim in the source but do not generate agenda items.
- **Two TODO states.** Only `TODO` and `DONE` are treated as state keywords. Any other keyword (NEXT, WAITING, CANCELLED, etc.) is treated as part of the heading title.
- **Single-file recurrence.** Repeating timestamps are expanded from the base date in the same heading. There is no cross-file dependency or "ARCHIVE" awareness.

Everything else — drawers, inactive timestamps, plain prose lines, inline markup, links, tables, comments, source blocks — is preserved verbatim on write and silently ignored by the agenda.

---

## Canonical entry shapes

Mediant creates and edits two canonical kinds of entry. Other Org content may be preserved or partially parsed, but these are the shapes the UI treats as first-class.

### Event

An event is a heading without a TODO state followed by an active timestamp on a line by itself:

```org
** Team check-in :work:
<2026-04-07 Tue 15:15-16:00>
```

The standalone timestamp may be all-day, timed, ranged, or repeating. It is what places the event in the agenda.

### TODO task

A task is a `TODO` or `DONE` heading. It may be undated, or it may be followed immediately by a planning line containing `DEADLINE:`, `SCHEDULED:`, or both. When both are present, `DEADLINE:` must come before `SCHEDULED:`.

```org
** TODO Pay invoice
DEADLINE: <2026-04-10 Fri> SCHEDULED: <2026-04-07 Tue>
```

`DEADLINE:` places the task on its calendar day and feeds the combined deadline/overdue overview. Overdue rows are always shown when present; upcoming deadline rows can be hidden. `SCHEDULED:` places the task on the calendar. With both present, the same task can appear as both a deadline item and a scheduled task.

---

## Categories

1. **Supported** — standard Org syntax parsed and used in the agenda
2. **Mediant-specific extensions** — syntax Mediant *adds on top of* Org. Emacs does not interpret these as anything special; files remain valid Org.
3. **Gracefully ignored** — silently skipped; content is preserved in the source file on write
4. **Unsupported** — not recognised; may cause unexpected behaviour if present

---

## Supported

### Headings

```org
* Top-level heading
** Second-level heading
*** Third-level (any depth)
```

- Stars at line start followed by a space.
- Heading level is preserved as `level` on the entry.
- Content after the stars is the title (minus tags and TODO state).

### TODO state

```org
** TODO Buy groceries
** DONE Finished task
```

- `TODO` and `DONE` are recognized as state keywords. They must appear immediately after the stars+space.
- Other keywords (WAITING, NEXT, CANCELLED, etc.) are treated as part of the heading title.
- DONE items are parsed fully. When enabled, they are rendered as dimmed grey in the agenda view.

### Priority cookies

```org
** TODO [#A] Important task
** [#B] Plain heading without TODO
```

- `[#A]`, `[#B]`, `[#C]` immediately after the TODO state (or at the start of the heading remainder if no TODO keyword).
- Parsed into `priority` on the entry (`"A" | "B" | "C" | null`) and stripped from the title.
- Rendered in the agenda as a colored badge (A = red !!!, B = amber !!, C = blue !) prefixed to the item title.
- Only the letters `A`, `B`, and `C` are recognized. Other letters (e.g. `[#D]`) are treated as part of the title.

### Tags

```org
** Heading text :tag1:
** Heading text :tag1:tag2:tag3:
```

- Colon-delimited at end of heading line.
- Parsed into a string array: `["tag1", "tag2", "tag3"]`.
- Tag inheritance (parent heading tags propagating to children) is **not** supported.

### Active timestamps

```org
<2026-04-07 Tue>
<2026-04-07 Tue 15:15>
<2026-04-07 Tue 15:15-16:00>
<2026-04-07 Sat 12:00>
```

- Angle-bracket delimited.
- Date in `YYYY-MM-DD` format (required).
- Day name after date (any language, with or without trailing dot) — **consumed but ignored**. The date string is authoritative.
- Optional start time in `HH:MM` format.
- Optional end time as `-HH:MM` (time range on the same day).
- Must appear as a **standalone line** (the only content on the line) to generate an agenda item. Timestamps embedded in a heading title are preserved as plain text. Timestamps embedded in body prose are preserved verbatim in the source. Neither generates an agenda item.

### Repeaters

```org
<2026-04-07 Tue 15:15-16:00 +1w>
<2026-04-06 Mon .+1d>
<2026-04-08 Wed ++1w>
```

- Appended inside the timestamp before the closing `>`.
- Format: `<mark>Nunit` where the mark is `+`, `.+`, or `++`, N is a positive integer, and unit is one of:
  - `d` — daily
  - `w` — weekly
  - `m` — monthly
  - `y` — yearly
- All three marks generate the same forward-from-base series for agenda display. They differ only when toggling a TODO to DONE in the edit panel:
  - `+` (cumulate) — advance by exactly one interval.
  - `.+` (catch-up) — anchor to today and step forward by one interval.
  - `++` (restart) — step forward by interval until the next occurrence is past today.

### SCHEDULED

```org
SCHEDULED: <2026-04-14 Tue 12:00>
```

- In the canonical task shape, appears on the planning line immediately following a `TODO` or `DONE` heading.
- For compatibility, the parser also accepts consecutive planning lines immediately after the heading.
- The keyword `SCHEDULED:` followed by a space and an active timestamp.
- Produces a planning entry with `kind: "scheduled"`.

### DEADLINE

```org
DEADLINE: <2026-05-05 Tue>
```

- Same rules as SCHEDULED.
- In the canonical task shape, `DEADLINE:` comes before `SCHEDULED:` when they share the same planning line.
- Produces a planning entry with `kind: "deadline"`.

### Checkbox lists

```org
** TODO Grocery list [2/3]
- [X] Milk
- [X] Bread
- [ ] Eggs
```

- Lines matching `- [ ] text` or `- [X] text` inside an entry are parsed as checkbox items.
- Parsed into `checkboxItems` on the entry (array of `{ text, checked }`), not included in body text.
- Indented checkbox items are supported.
- Rendered in the agenda as a mini checklist under the item.
- In agenda rows, clicking a checkbox row toggles completion and updates the Org source immediately. Text, add, and remove edits are handled by the edit-panel checklist editor for TODO tasks.
- In the edit panel, checkboxes are interactive toggles with editable labels and add/remove controls that update the Org source immediately.

### Description block

```org
** TODO Task
#+begin_src description
  Free-form description text here.
  * this line is NOT an Org heading
  SCHEDULED: <2026-05-18> this is plain text
#+end_src
```

- Content of a `#+begin_src description` block is read as the entry's body text.
- Written by the edit panel when an item has a description. The block is chosen over a plain `:DESCRIPTION:` drawer because Emacs treats `#+begin_src` content as fully opaque — no Org syntax (headings, planning keywords, timestamps, drawer markers) is parsed inside it.
- Content lines are indented two spaces by the edit panel. The parser strips exactly two leading spaces when reading back. This means `* foo` (which would be an Org heading at column 0) is stored as `  * foo` and round-trips safely.
- Lines starting with `#+end_src` or `#+begin_src` inside the block are comma-escaped (prefixed with `,`) before the two-space indent, following Org's own src-block literal convention. The parser strips the leading comma on read-back.
- Block markers are case-insensitive (`#+BEGIN_SRC description` is equivalent).
- A `#+begin_src description` block without a matching `#+end_src` absorbs content until end of file; Mediant can still parse the body, but the file is malformed Org.

### Progress cookies

```org
** TODO Task [2/3]
** TODO Task [66%]
```

- `[N/M]` (fractional) or `[N%]` (percentage) after the priority cookie (or heading start).
- Not parsed — treated as plain text and included in the title as-is.

### Body text

```org
** Outdoor activity :outdoors:
<2026-04-12 Sun 14:00>
#+begin_src description
  Meet at the main entrance.
#+end_src
```

- An entry's description must be placed in a `#+begin_src description` block (see *Description block* above). The parser reads the block content as the entry's `body` string.
- Raw prose lines outside a description block (e.g. `Meet at the main entrance.` with no block wrapper) are **not parsed into the model** — they do not appear in `entry.body`. However, they are **preserved verbatim in the source file** when Mediant writes back an entry.
- In particular, a line like `Meet at <2026-05-18 Mon> sharp.` is not parsed as a timestamp (the timestamp is embedded in prose, not standalone) and does not appear in the agenda. The line is still preserved in the source. Place such text inside a `#+begin_src description` block to have it shown in the edit panel.

---

## Mediant-specific extensions

Syntax that Mediant layers on top of standard Org. These use ordinary Org constructs (property drawers) as a transport, so the file stays valid Org: Emacs opens, edits, and saves it without complaint. Emacs just won't *interpret* the extensions — it treats them as arbitrary properties.

Currently there are two extensions: **recurrence exceptions** and **series end dates**.

This is a deliberate compatibility boundary. Mediant's source file remains valid Org text, but recurrence exceptions are Mediant semantics, not Emacs Org semantics. Plain Emacs Org agenda will continue to show the base repeater occurrences unless the optional `elisp/mediant-org-agenda.el` integration is enabled.

When Mediant creates a new `:PROPERTIES:` drawer, it writes it in the Org-compatible property position: immediately after the heading and any planning lines, before body text or standalone active timestamp lines. The parser still reads Mediant extension keys from any `:PROPERTIES:` drawer inside an entry so older files continue to work, but new writes should preserve compatibility with Org's property APIs.

### Recurrence exceptions

Standard Org repeaters (`+1w`, `+1m`, etc.) produce an unbroken series — every occurrence is identical except for the date. Mediant adds two property-drawer key families that let an entry with a repeating timestamp deviate from the base series on a single occurrence (skip it, shift it, move it, or pin a one-off note to it) without giving up the repeater.

This is the model for Mediant.org dialect design: the feature is not present because Org-mode has a broad property system; it is present because real calendar series need local changes, and those changes have one clear source location (the repeating heading's property drawer) and one clear UI meaning (this occurrence is different from the base series).

Both key families are keyed by the *unshifted* base occurrence date (`YYYY-MM-DD`) so the mapping stays stable even after a reschedule moves the occurrence to a different day.

```org
** TODO Yoga :health:
SCHEDULED: <2026-04-27 Mon 17:00-18:00 +1w>
:PROPERTIES:
:EXCEPTION-2026-04-27: cancelled
:EXCEPTION-2026-05-04: shift +45m
:EXCEPTION-NOTE-2026-05-04: Bring mat and water
:EXCEPTION-2026-05-11: reschedule 2026-05-12 18:00
:EXCEPTION-NOTE-2026-05-18: Long session today
:END:
```

A note-only exception is also valid when the occurrence still happens at its base time but needs one-off context:

```org
** Weekly dance class :music:social:fitness:
<2026-04-08 Wed 18:00-21:00 +1w>
:PROPERTIES:
:SERIES-UNTIL: 2026-04-29
:EXCEPTION-NOTE-2026-04-22: Last class of the semester
:END:
```

Semantics:

- the heading is one recurring event series
- the standalone timestamp is the canonical event timestamp
- `+1w` expands weekly occurrences
- `:SERIES-UNTIL:` limits the recurrence series
- `:EXCEPTION-NOTE-YYYY-MM-DD:` attaches a note to one occurrence
- the exception key is the base occurrence date, not the shifted or rendered date
- the syntax is Mediant-specific but remains valid Org because it uses a normal property drawer

Why this is allowed:

- it models real life: recurring events have endings and per-occurrence notes
- it keeps one canonical event source
- it avoids arbitrary inline timestamp interpretation
- it round-trips cleanly through Emacs
- it is easier to show in Mediant's UI than generic Org agenda edge cases
- it supports Mediant's core purpose: a calm agenda for real human schedules

**`:EXCEPTION-YYYY-MM-DD: <override>`** — the behaviour override for a single occurrence. At most one per date. Override grammar (exact match; anything else is dropped silently):

- `cancelled` — occurrence is skipped entirely.
- `shift <[+-]N><m|h|d>` — shift the whole interval by a signed duration (`shift +45m`, `shift -1h`, `shift +1d`). If the shift crosses midnight, the occurrence's final calendar day moves with it; `:EXCEPTION-<date>:` still keys off the unshifted slot.
- `reschedule YYYY-MM-DD` — move to a new date, preserving base start/end.
- `reschedule YYYY-MM-DD HH:MM` — new date + new start; base duration preserved when base has an end time; otherwise no end time.
- `reschedule YYYY-MM-DD HH:MM-HH:MM` — new date + explicit range.

**`:EXCEPTION-NOTE-YYYY-MM-DD: <text>`** — a one-off note attached to the occurrence with the matching base date. Empty text is treated as no note. Independent of any override on the same date, so you can combine e.g. a shift with a note, or cancel an occurrence while still leaving a note explaining why.

**Rules and edge cases:**

- All other property keys inside the drawer are still gracefully ignored — only `EXCEPTION-…`, `EXCEPTION-NOTE-…`, and `SERIES-UNTIL` keys are read. Exception properties inside other drawers (e.g. `:LOGBOOK:`) are not parsed.
- Exceptions on a non-repeating timestamp are parsed but **inert**: expansion never runs, so they never apply. Don't rely on this as a way to rewrite a one-off; edit the timestamp instead.
- Each `:EXCEPTION-<date>:` value is validated against the grammar above on parse. An unrecognized value is silently dropped (the occurrence renders as normal); a matching `:EXCEPTION-NOTE-<date>:` on the same date is still honoured.
- The edit panel's "This occurrence" controls are the UI surface for these properties and always write the unshifted base date, so property values round-trip cleanly. The skip and stop-repeat toggles, move date/time field, note field, and Clear override action persist immediately; there is no separate Move or Save note step.

**Interop with Emacs:** the file remains valid Org. Plain Emacs treats `:EXCEPTION-2026-05-04:` as just another property and gives the entry its normal repeating-timestamp agenda behaviour. That means Mediant can skip, shift, or reschedule an occurrence that plain Emacs Org agenda still shows at its base slot. To make Org agenda interpret these properties, load `elisp/mediant-org-agenda.el` and enable `mediant-org-agenda-mode`. The integration is display-only: it hides cancelled occurrences, moves shifted/rescheduled occurrences, and renders notes (and applies `SERIES-UNTIL` - see below), but does not provide Emacs commands for editing exception properties.

### Series end date

A repeating timestamp in standard Org runs forever. Mediant adds a `:SERIES-UNTIL:` property that lets a heading declare an explicit, exclusive end date for the series.

```org
** Yoga :health:
SCHEDULED: <2026-04-27 Mon 17:00-18:00 +1w>
:PROPERTIES:
:SERIES-UNTIL: 2026-07-01
:END:
```

**`:SERIES-UNTIL: YYYY-MM-DD`** — exclusive end of the series. Occurrences whose base date is at or after this date are not generated; upcoming-deadline and overdue searches likewise stop there.

**Rules and edge cases:**

- Exclusive by design. An occurrence keyed exactly to `:SERIES-UNTIL:` is *not* rendered. This matches the "split into two headings" model (see TODO.md): a successor heading may start *on* the same date without overlap.
- A reschedule keyed to a base date at or after `:SERIES-UNTIL:` is filtered out — the base slot doesn't exist, so there is nothing to move. Reschedules keyed *before* the end still apply, even if they push the occurrence to a date after `:SERIES-UNTIL:`.
- On a heading with no repeater, `:SERIES-UNTIL:` is **parsed but inert**, mirroring the exceptions invariant.
- A malformed value (anything other than `YYYY-MM-DD`) is silently dropped.
- Only one `:SERIES-UNTIL:` per heading. Multiple active timestamps on the same heading share the single end date — one heading is one series.

**Interop with Emacs:** plain Emacs ignores `:SERIES-UNTIL:` and will keep generating occurrences past the date in its own agenda. The optional `elisp/mediant-org-agenda.el` integration applies the same exclusive, base-slot cutoff during Org agenda finalization.

---

## Gracefully ignored

These constructs are silently skipped by the parser — they do not produce agenda entries or populate the data model. All such lines are preserved verbatim in the source file on write.

### File-level keywords

```org
#+title: Org Inbox
#+startup: show2levels
#+author: Name
#+options: toc:nil
```

- Any line starting with `#+` before or between headings.

### Inactive timestamps

```org
[2026-04-07 Tue 15:15-16:00]
```

- Square-bracket timestamps. Not parsed into the agenda model — they do not generate agenda items or populate `entry.timestamps`.
- Preserved verbatim in the source file when Mediant writes back an entry, whether they appear on their own line or embedded in prose. All unrecognized lines round-trip safely through the edit panel.

### Timestamp ranges (spanning days)

```org
<2026-04-07 Tue>--<2026-04-09 Thu>
```

- Two timestamps connected by `--`. Mediant currently parses this as a single active timestamp on the opening date and stores the closing date as parser metadata. It does **not** yet render the event across every spanned day.

### Property drawers

```org
:PROPERTIES:
:CATEGORY: work
:END:
```

- Everything between `:PROPERTIES:` and `:END:` is skipped **except** `:EXCEPTION-…:`, `:EXCEPTION-NOTE-…:`, and `:SERIES-UNTIL:` keys. See *Mediant-specific extensions* above.
- Newly-created drawers are written immediately after the heading and planning lines, before body text or standalone active timestamp lines, so Org's property APIs recognize them.

### Logbook drawers

```org
:LOGBOOK:
CLOCK: [2026-04-07 Tue 10:00]--[2026-04-07 Tue 11:30] =>  1:30
:END:
```

- Everything between `:LOGBOOK:` and `:END:` is skipped.

### Generic drawers

```org
:DRAWERNAME:
...
:END:
```

- Any `:NAME:` ... `:END:` block is skipped.

### CLOSED planning

```org
CLOSED: [2026-04-07 Tue 14:00]
```

- Recognized as a planning keyword but not stored.

### Org links

```org
[[https://example.com][Example]]
[[file:other.org]]
```

- If they appear in body text, the raw text is preserved. No special link handling.

### Inline markup

```org
*bold* /italic/ ~code~ =verbatim= +strikethrough+
```

- Preserved as-is in body text. No rendering of markup. 

### Lists (plain)

```org
- Item one
- Item two
  - Nested item
1. Ordered item
```

- Plain list items (without checkbox syntax) are treated as body text. No special list handling.
- Checkbox list items (`- [ ]` / `- [X]`) are **supported** — see the Checkbox lists section above.

### Tables

```org
| Col1 | Col2 |
|------+------|
| a    | b    |
```

- Treated as body text.

### Comments

```org
# This is a comment
#+begin_comment
Block comment
#+end_comment
```

- Lines starting with `# ` are ignored.
- Comment blocks are ignored.

### Source/example blocks

```org
#+begin_src python
print("hello")
#+end_src
```

- Non-description source blocks are silently skipped. Only `#+begin_src description` is treated specially (see *Description block* above).

---

## Unsupported (may cause unexpected behavior)

These constructs are **not recognized** by the parser. If present, they may be misinterpreted (e.g., treated as body text when they shouldn't be, or partially parsed incorrectly).

### Inline timestamps in prose or heading titles

```org
** Meeting <2026-05-18 Mon 14:00>
Meet at <2026-05-18 Mon 14:00> sharp.
```

- Timestamps embedded in a heading title are preserved as plain text in `entry.title` and do not generate agenda items.
- Timestamps embedded in a body prose line are preserved verbatim in the source and do not generate agenda items.
- This is a deliberate simplification — see *Deliberate simplifications* above.
- Only standalone timestamp lines (the line contains nothing else) are parsed as active timestamps.
- To include description text that contains a date, use a `#+begin_src description` block.

### Diary sexp timestamps

```org
<%%(diary-float t 1 2)>
```

- Not recognized. Will be treated as body text.

### Custom TODO keyword sequences

```org
#+TODO: TODO NEXT WAITING | DONE CANCELLED
** NEXT Some task
** WAITING Blocked task
```

- `#+TODO:` keyword definitions are ignored.
- Keywords other than `TODO` and `DONE` (e.g., NEXT, WAITING, CANCELLED) are treated as part of the heading title.
- State transition logging, timestamps on state changes, and workflow logic are not supported.

### Tag inheritance

```org
* Project :work:
** Task one
```

- `Task one` does **not** inherit the `:work:` tag from its parent. Only tags explicitly on the heading line are parsed. This is a deliberate simplification — see *Deliberate simplifications* above.

### Column view / custom agenda commands

- Not applicable — this is a standalone viewer, not an Emacs extension.

### Babel / tangling

- Not applicable.

### Archiving (`ARCHIVE` tag, archive files)

- The `ARCHIVE` tag is parsed like any other tag but has no special behavior.
- Archive files (`.org_archive`) are not loaded.

### Effort estimates

```org
:Effort: 1:30
```

- Part of property drawers, which are ignored.

### Habits

```org
:STYLE: habit
```

- Not supported. The property drawer is ignored.
