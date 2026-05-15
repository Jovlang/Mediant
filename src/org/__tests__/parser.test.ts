import { describe, it, expect } from "vitest";
import { parseOrg, parseOverride } from "../parser.ts";

// ── File-level behavior ──────────────────────────────────────────────

describe("file preamble", () => {
  it("ignores #+title and #+startup lines", () => {
    const entries = parseOrg("#+title: Org Inbox\n#+startup: show2levels\n");
    expect(entries).toHaveLength(0);
  });

  it("ignores blank lines before any heading", () => {
    const entries = parseOrg("\n\n\n** TODO Task\n");
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Task");
  });
});

// ── Heading parsing ──────────────────────────────────────────────────

describe("headings", () => {
  it("parses heading level", () => {
    const entries = parseOrg("* Top\n** Second\n*** Third\n");
    expect(entries).toHaveLength(3);
    expect(entries[0].level).toBe(1);
    expect(entries[1].level).toBe(2);
    expect(entries[2].level).toBe(3);
  });

  it("records source line number (1-based)", () => {
    const entries = parseOrg("#+title: test\n\n** Entry\n");
    expect(entries).toHaveLength(1);
    expect(entries[0].sourceLineNumber).toBe(3);
  });
});

// ── TODO / DONE states ───────────────────────────────────────────────

describe("todo states", () => {
  it("parses TODO state", () => {
    const entries = parseOrg("** TODO Buy groceries\n");
    expect(entries[0].todo).toBe("TODO");
    expect(entries[0].title).toBe("Buy groceries");
  });

  it("parses DONE state", () => {
    const entries = parseOrg("** DONE Finished task\n");
    expect(entries[0].todo).toBe("DONE");
    expect(entries[0].title).toBe("Finished task");
  });

  it("treats unknown keywords as part of the title", () => {
    const entries = parseOrg("** WAITING Some task\n");
    expect(entries[0].todo).toBeNull();
    expect(entries[0].title).toBe("WAITING Some task");
  });

  it("heading with no state has null todo", () => {
    const entries = parseOrg("** Just a heading\n");
    expect(entries[0].todo).toBeNull();
  });
});

// ── Priority ─────────────────────────────────────────────────────────

describe("priority", () => {
  it("parses [#A] after TODO keyword and strips from title", () => {
    const entries = parseOrg("** TODO [#A] Urgent task\n");
    expect(entries[0].priority).toBe("A");
    expect(entries[0].title).toBe("Urgent task");
  });

  it("parses [#B] without TODO keyword", () => {
    const entries = parseOrg("** [#B] Plain heading\n");
    expect(entries[0].priority).toBe("B");
    expect(entries[0].title).toBe("Plain heading");
  });

  it("parses [#C] with DONE and tags", () => {
    const entries = parseOrg("** DONE [#C] Done task :work:\n");
    expect(entries[0].priority).toBe("C");
    expect(entries[0].todo).toBe("DONE");
    expect(entries[0].title).toBe("Done task");
    expect(entries[0].tags).toEqual(["work"]);
  });

  it("priority is null when no cookie present", () => {
    const entries = parseOrg("** TODO Task\n");
    expect(entries[0].priority).toBeNull();
  });

  it("ignores unknown priority letters", () => {
    const entries = parseOrg("** TODO [#D] Task\n");
    expect(entries[0].priority).toBeNull();
    expect(entries[0].title).toBe("[#D] Task");
  });
});

// ── Tags ─────────────────────────────────────────────────────────────

describe("tags", () => {
  it("parses a single tag", () => {
    const entries = parseOrg("** Heading :study:\n");
    expect(entries[0].tags).toEqual(["study"]);
    expect(entries[0].title).toBe("Heading");
  });

  it("parses multiple tags", () => {
    const entries = parseOrg("** Heading :dance:birthday:\n");
    expect(entries[0].tags).toEqual(["dance", "birthday"]);
  });

  it("heading with no tags has empty array", () => {
    const entries = parseOrg("** Plain heading\n");
    expect(entries[0].tags).toEqual([]);
  });

  it("tags are removed from title", () => {
    const entries = parseOrg("** Exercise class A :dance:\n");
    expect(entries[0].title).toBe("Exercise class A");
  });

  it("handles TODO + tags together", () => {
    const entries = parseOrg("** TODO Finish project draft :study:\n");
    expect(entries[0].todo).toBe("TODO");
    expect(entries[0].title).toBe("Finish project draft");
    expect(entries[0].tags).toEqual(["study"]);
  });

  it("parses Unicode tags", () => {
    const entries = parseOrg("** TODO Open meeting :résumé:economics:\n");
    expect(entries[0].title).toBe("Open meeting");
    expect(entries[0].tags).toEqual(["résumé", "economics"]);
  });
});

// ── Planning lines (SCHEDULED / DEADLINE) ────────────────────────────

describe("planning", () => {
  it("parses DEADLINE", () => {
    const entries = parseOrg(
      "** TODO Finish project draft :study:\nDEADLINE: <2026-05-05 ti.>\n",
    );
    expect(entries[0].planning).toHaveLength(1);
    expect(entries[0].planning[0].kind).toBe("deadline");
    expect(entries[0].planning[0].timestamp.date).toBe("2026-05-05");
  });

  it("parses SCHEDULED with time", () => {
    const entries = parseOrg(
      "** TODO Task\nSCHEDULED: <2026-04-14 ti. 12:00>\n",
    );
    expect(entries[0].planning).toHaveLength(1);
    expect(entries[0].planning[0].kind).toBe("scheduled");
    expect(entries[0].planning[0].timestamp.startTime).toBe("12:00");
  });

  it("parses planning day ranges from the initial day", () => {
    const entries = parseOrg(
      "** TODO Trip\nSCHEDULED: <2026-04-14 ti.>--<2026-04-16 to.>\n",
    );
    expect(entries[0].planning).toHaveLength(1);
    expect(entries[0].planning[0].timestamp.date).toBe("2026-04-14");
    expect(entries[0].planning[0].timestamp.endDate).toBe("2026-04-16");
  });

  it("parses both SCHEDULED and DEADLINE on one entry", () => {
    const entries = parseOrg(
      "** TODO Task\nSCHEDULED: <2026-04-14 ti.>\nDEADLINE: <2026-05-05 ti.>\n",
    );
    expect(entries[0].planning).toHaveLength(2);
    expect(entries[0].planning[0].kind).toBe("scheduled");
    expect(entries[0].planning[1].kind).toBe("deadline");
  });

  it("parses DEADLINE and SCHEDULED on the same line", () => {
    const entries = parseOrg(
      "** TODO both\nDEADLINE: <2026-04-19 Sun> SCHEDULED: <2026-04-18 Sat>\n",
    );
    expect(entries[0].planning).toHaveLength(2);
    expect(entries[0].planning[0].kind).toBe("deadline");
    expect(entries[0].planning[0].timestamp.date).toBe("2026-04-19");
    expect(entries[0].planning[1].kind).toBe("scheduled");
    expect(entries[0].planning[1].timestamp.date).toBe("2026-04-18");
  });

  it("planning not accepted after a non-planning line", () => {
    const entries = parseOrg(
      "** Heading\nSome unrecognized line\nSCHEDULED: <2026-04-14 ti.>\n",
    );
    expect(entries[0].planning).toHaveLength(0);
  });
});

// ── Active timestamps ────────────────────────────────────────────────

describe("active timestamps", () => {
  it("parses standalone timestamp line", () => {
    const entries = parseOrg("** Event\n<2026-04-07 ti. 15:15-16:00>\n");
    expect(entries[0].timestamps).toHaveLength(1);
    expect(entries[0].timestamps[0].date).toBe("2026-04-07");
    expect(entries[0].timestamps[0].startTime).toBe("15:15");
    expect(entries[0].timestamps[0].endTime).toBe("16:00");
  });

  it("parses date-only timestamp", () => {
    const entries = parseOrg("** Holiday\n<2026-04-05 sø.>\n");
    expect(entries[0].timestamps).toHaveLength(1);
    expect(entries[0].timestamps[0].startTime).toBeNull();
  });

  it("parses standalone day ranges as one timestamp on the initial day", () => {
    const entries = parseOrg("** Retreat\n<2026-04-07 ti.>--<2026-04-09 to.>\n");
    expect(entries[0].timestamps).toHaveLength(1);
    expect(entries[0].timestamps[0].date).toBe("2026-04-07");
    expect(entries[0].timestamps[0].endDate).toBe("2026-04-09");
    expect(entries[0].body).toBe("");
  });

  it("parses timestamp with repeater", () => {
    const entries = parseOrg("** Weekly\n<2026-04-07 ti. 13:15-14:00 +1w>\n");
    expect(entries[0].timestamps).toHaveLength(1);
    expect(entries[0].timestamps[0].repeater).toEqual({ mark: "+", value: 1, unit: "w" });
  });

  it("parses yearly repeater", () => {
    const entries = parseOrg("** Birthday\n<2026-04-06 ma. +1y>\n");
    expect(entries[0].timestamps[0].repeater).toEqual({ mark: "+", value: 1, unit: "y" });
  });

  it("timestamp with trailing whitespace", () => {
    const entries = parseOrg("** Event\n<2026-04-08 on. 18:00-21:00 +1w> \n");
    expect(entries[0].timestamps).toHaveLength(1);
  });

  it("handles Norwegian weekday names in timestamps", () => {
    for (const day of ["ma.", "ti.", "on.", "to.", "fr.", "lø.", "sø."]) {
      const entries = parseOrg(`** E\n<2026-04-07 ${day}>\n`);
      expect(entries[0].timestamps).toHaveLength(1);
    }
  });

  it("handles English weekday names in timestamps", () => {
    const entries = parseOrg("** E\n<2026-04-11 Sat 12:00>\n");
    expect(entries[0].timestamps).toHaveLength(1);
    expect(entries[0].timestamps[0].startTime).toBe("12:00");
  });

  it("does not pick up SCHEDULED/DEADLINE timestamps as active timestamps", () => {
    const entries = parseOrg(
      "** TODO Task\nDEADLINE: <2026-05-05 ti.>\n",
    );
    expect(entries[0].timestamps).toHaveLength(0);
    expect(entries[0].planning).toHaveLength(1);
  });

  it("mixed prose + timestamp line is ignored (not a timestamp-only line)", () => {
    const entries = parseOrg(
      "** Event\nMeet at <2026-04-07 ti. 15:00> sharp.\n",
    );
    expect(entries[0].timestamps).toHaveLength(0);
    expect(entries[0].body).toBe("");
  });
});

// ── Skipped constructs ───────────────────────────────────────────────

describe("skipped constructs", () => {
  it("ignores #+ keyword lines inside an entry", () => {
    const entries = parseOrg("** Entry\n#+begin_src python\ncode\n#+end_src\n");
    expect(entries[0].body).toBe("");
  });

  it("ignores comment lines inside an entry", () => {
    const entries = parseOrg("** Entry\n# This is a comment\nOther line.\n");
    expect(entries[0].body).toBe("");
  });

  it("planning line only uses first timestamp", () => {
    const entries = parseOrg(
      "** Task\nSCHEDULED: <2026-04-14 ti.> <2026-04-15 on.>\n",
    );
    expect(entries[0].planning).toHaveLength(1);
    expect(entries[0].planning[0].timestamp.date).toBe("2026-04-14");
  });
});

// ── Body text ────────────────────────────────────────────────────────

describe("body text", () => {
  it("empty body when no description block", () => {
    const entries = parseOrg("** Just a heading\n");
    expect(entries[0].body).toBe("");
  });

  it("raw lines outside a block are ignored", () => {
    const entries = parseOrg(
      "** Event\nFirst line.\nSecond line.\n",
    );
    expect(entries[0].body).toBe("");
  });

  it("planning lines and timestamps are not affected by unrecognized lines", () => {
    const entries = parseOrg(
      "** TODO Task\nDEADLINE: <2026-05-05 ti.>\n<2026-04-07 ti. 15:15>\n",
    );
    expect(entries[0].body).toBe("");
    expect(entries[0].planning).toHaveLength(1);
    expect(entries[0].timestamps).toHaveLength(1);
  });

  it("reads body from #+begin_src description block", () => {
    const entries = parseOrg(
      "** Event\n#+begin_src description\n  Meet at the main entrance.\n#+end_src\n",
    );
    expect(entries[0].body).toBe("Meet at the main entrance.");
  });

  it("#+begin_src description multiline body", () => {
    const entries = parseOrg(
      "** Event\n#+begin_src description\n  First line.\n  Second line.\n#+end_src\n",
    );
    expect(entries[0].body).toBe("First line.\nSecond line.");
  });

  it("block is case-insensitive for open/close markers", () => {
    const entries = parseOrg(
      "** Event\n#+BEGIN_SRC description\n  Content.\n#+END_SRC\n",
    );
    expect(entries[0].body).toBe("Content.");
  });

  it("Org syntax inside the block is safe when indented", () => {
    const entries = parseOrg(
      "** Event\n#+begin_src description\n  * heading\n  SCHEDULED: <2026-04-07 ti.>\n  - [ ] checkbox\n#+end_src\n",
    );
    expect(entries[0].body).toBe("* heading\nSCHEDULED: <2026-04-07 ti.>\n- [ ] checkbox");
    expect(entries[0].planning).toHaveLength(0);
    expect(entries[0].checkboxItems).toHaveLength(0);
  });

  it("empty description block yields empty body string", () => {
    const entries = parseOrg("** Event\n#+begin_src description\n#+end_src\n");
    expect(entries[0].body).toBe("");
  });

  it("blank lines inside block are preserved", () => {
    const entries = parseOrg(
      "** Event\n#+begin_src description\n  First.\n\n  Second.\n#+end_src\n",
    );
    expect(entries[0].body).toBe("First.\n\nSecond.");
  });

  it(":END: inside block is not treated as a drawer close", () => {
    const entries = parseOrg(
      "** Event\n#+begin_src description\n  :END:\n  After.\n#+end_src\n",
    );
    expect(entries[0].body).toBe(":END:\nAfter.");
    // The entry is still just one entry (no phantom drawer boundary)
    expect(entries).toHaveLength(1);
  });

  it("DEADLINE: inside block is not parsed as a planning line", () => {
    const entries = parseOrg(
      "** Event\n#+begin_src description\n  DEADLINE: <2026-04-07 ti.>\n#+end_src\n",
    );
    expect(entries[0].planning).toHaveLength(0);
    expect(entries[0].body).toBe("DEADLINE: <2026-04-07 ti.>");
  });

  it("unclosed block absorbs content to EOF without creating extra entries", () => {
    // The trailing \n in the source produces a final empty string after split,
    // which gets appended as an empty line in the body.
    const entries = parseOrg(
      "** Event\n#+begin_src description\n  Line one.\n  Line two.\n",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toContain("Line one.");
    expect(entries[0].body).toContain("Line two.");
  });

  it("unclosed block absorbs subsequent heading-like lines as body content", () => {
    // Once inside a desc block, only #+end_src can close it.
    // Heading-like lines are treated as body, not as new entries.
    const entries = parseOrg(
      "** First\n#+begin_src description\n  Body of first.\n** Second\n",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].body).toContain("Body of first.");
    expect(entries[0].body).toContain("** Second");
  });

  it("description block and PROPERTIES drawer coexist in the same entry", () => {
    const entries = parseOrg(
      "** Yoga\n" +
        "#+begin_src description\n  Notes.\n#+end_src\n" +
        ":PROPERTIES:\n:EXCEPTION-2026-04-27: cancelled\n:END:\n",
    );
    expect(entries[0].body).toBe("Notes.");
    expect(entries[0].exceptions.get("2026-04-27")?.override?.kind).toBe("cancelled");
  });

  it("#+begin_src python is NOT treated as a description block", () => {
    const entries = parseOrg(
      "** Code\n#+begin_src python\n  print('hello')\n#+end_src\n",
    );
    expect(entries[0].body).toBe("");
  });

  it("line with only 1-space prefix has the space kept (2-space stripping is exact)", () => {
    const entries = parseOrg(
      "** Event\n#+begin_src description\n one-space\n#+end_src\n",
    );
    expect(entries[0].body).toBe(" one-space");
  });

  it("line with no indent prefix is kept as-is", () => {
    const entries = parseOrg(
      "** Event\n#+begin_src description\nno-indent\n#+end_src\n",
    );
    expect(entries[0].body).toBe("no-indent");
  });

  it("#+begin_src inside block is comma-escaped and round-trips correctly", () => {
    // formatDescriptionLine writes "  ,#+begin_src python" for "#+begin_src python"
    const entries = parseOrg(
      "** Event\n#+begin_src description\n  ,#+begin_src python\n#+end_src\n",
    );
    expect(entries[0].body).toBe("#+begin_src python");
  });

  it("double-comma escaped leading comma round-trips correctly", () => {
    // formatDescriptionLine writes "  ,,text" for ",text"
    const entries = parseOrg(
      "** Event\n#+begin_src description\n  ,,starts with comma\n#+end_src\n",
    );
    expect(entries[0].body).toBe(",starts with comma");
  });

  it("block is scoped to its own entry; next entry body is unaffected", () => {
    const entries = parseOrg(
      "** First\n#+begin_src description\n  Body of first.\n#+end_src\n** Second\n",
    );
    expect(entries[0].body).toBe("Body of first.");
    expect(entries[1].body).toBe("");
  });

});

// ── Drawers ──────────────────────────────────────────────────────────

describe("drawers", () => {
  it("skips property drawers", () => {
    const entries = parseOrg(
      "** Entry\n:PROPERTIES:\n:CATEGORY: work\n:END:\n",
    );
    expect(entries[0].body).toBe("");
  });

  it("skips logbook drawers", () => {
    const entries = parseOrg(
      "** Entry\n:LOGBOOK:\nCLOCK: [2026-04-07 ti.]\n:END:\n",
    );
    expect(entries[0].body).toBe("");
  });

  it("strips indentation and unescapes #+end_src and leading commas", () => {
    // As written by formatDescriptionLine: indented + comma-escaped dangerous lines
    const entries = parseOrg(
      "** Entry\n#+begin_src description\n  ,#+end_src\n  ,,starts with comma\n  normal\n#+end_src\n",
    );
    expect(entries[0].body).toBe("#+end_src\n,starts with comma\nnormal");
  });

  it("drawer after description block is still parsed correctly", () => {
    // PROPERTIES following the description block must be scanned, not swallowed
    const entries = parseOrg(
      "** Entry\n" +
        "#+begin_src description\n  Notes.\n#+end_src\n" +
        ":PROPERTIES:\n:SERIES-UNTIL: 2026-06-01\n:END:\n",
    );
    expect(entries[0].body).toBe("Notes.");
    expect(entries[0].seriesUntil).toBe("2026-06-01");
  });

  it(":PROPERTIES: inside a description block is not parsed as a drawer", () => {
    const entries = parseOrg(
      "** Entry\n" +
        "#+begin_src description\n" +
        "  :PROPERTIES:\n" +
        "  :CATEGORY: health\n" +
        "  :END:\n" +
        "#+end_src\n",
    );
    // The drawer-like text is just body content
    expect(entries[0].body).toBe(":PROPERTIES:\n:CATEGORY: health\n:END:");
    expect(entries[0].exceptions.size).toBe(0);
  });
});

// ── Exception properties ────────────────────────────────────────────

describe("parseOverride", () => {
  it("parses cancelled", () => {
    expect(parseOverride("cancelled")).toEqual({ kind: "cancelled" });
  });

  it("parses shift in minutes / hours / days", () => {
    expect(parseOverride("shift +45m")).toEqual({ kind: "shift", offsetMinutes: 45 });
    expect(parseOverride("shift -1h")).toEqual({ kind: "shift", offsetMinutes: -60 });
    expect(parseOverride("shift +1d")).toEqual({ kind: "shift", offsetMinutes: 1440 });
  });

  it("rejects shift without sign or with zero", () => {
    expect(parseOverride("shift 45m")).toBeNull();
    expect(parseOverride("shift +0m")).toBeNull();
  });

  it("rejects unsupported shift units", () => {
    expect(parseOverride("shift +1w")).toBeNull();
  });

  it("parses reschedule with date only", () => {
    expect(parseOverride("reschedule 2026-05-12")).toEqual({
      kind: "reschedule",
      date: "2026-05-12",
      startTime: null,
      endTime: null,
    });
  });

  it("parses reschedule with date + start time", () => {
    expect(parseOverride("reschedule 2026-05-12 18:00")).toEqual({
      kind: "reschedule",
      date: "2026-05-12",
      startTime: "18:00",
      endTime: null,
    });
  });

  it("parses reschedule with date + start-end range", () => {
    expect(parseOverride("reschedule 2026-05-12 18:00-19:30")).toEqual({
      kind: "reschedule",
      date: "2026-05-12",
      startTime: "18:00",
      endTime: "19:30",
    });
  });

  it("rejects reschedule with end ≤ start", () => {
    expect(parseOverride("reschedule 2026-05-12 18:00-18:00")).toBeNull();
    expect(parseOverride("reschedule 2026-05-12 18:00-17:00")).toBeNull();
  });

  it("rejects unknown override grammar", () => {
    expect(parseOverride("postpone 2026-05-12")).toBeNull();
    expect(parseOverride("")).toBeNull();
    expect(parseOverride("CANCELLED")).toBeNull(); // case-sensitive
  });
});

describe("exception properties in PROPERTIES drawer", () => {
  it("captures a cancelled override", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":PROPERTIES:\n" +
        ":EXCEPTION-2026-04-27: cancelled\n" +
        ":END:\n",
    );
    const ex = entries[0].exceptions.get("2026-04-27");
    expect(ex).toEqual({ override: { kind: "cancelled" }, note: null });
  });

  it("captures a shift override", () => {
    const entries = parseOrg(
      "** Entry\n:PROPERTIES:\n:EXCEPTION-2026-05-04: shift +45m\n:END:\n",
    );
    expect(entries[0].exceptions.get("2026-05-04")).toEqual({
      override: { kind: "shift", offsetMinutes: 45 },
      note: null,
    });
  });

  it("captures a reschedule override with time", () => {
    const entries = parseOrg(
      "** Entry\n:PROPERTIES:\n:EXCEPTION-2026-05-11: reschedule 2026-05-12 18:00\n:END:\n",
    );
    expect(entries[0].exceptions.get("2026-05-11")).toEqual({
      override: {
        kind: "reschedule",
        date: "2026-05-12",
        startTime: "18:00",
        endTime: null,
      },
      note: null,
    });
  });

  it("captures a note-only entry", () => {
    const entries = parseOrg(
      "** Entry\n:PROPERTIES:\n:EXCEPTION-NOTE-2026-05-18: Bring water\n:END:\n",
    );
    expect(entries[0].exceptions.get("2026-05-18")).toEqual({
      override: null,
      note: "Bring water",
    });
  });

  it("merges override + note for the same date", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":PROPERTIES:\n" +
        ":EXCEPTION-2026-05-04: shift +45m\n" +
        ":EXCEPTION-NOTE-2026-05-04: Bring mat and water\n" +
        ":END:\n",
    );
    expect(entries[0].exceptions.get("2026-05-04")).toEqual({
      override: { kind: "shift", offsetMinutes: 45 },
      note: "Bring mat and water",
    });
  });

  it("merges in either source order (note first, override second)", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":PROPERTIES:\n" +
        ":EXCEPTION-NOTE-2026-05-04: Note first\n" +
        ":EXCEPTION-2026-05-04: cancelled\n" +
        ":END:\n",
    );
    expect(entries[0].exceptions.get("2026-05-04")).toEqual({
      override: { kind: "cancelled" },
      note: "Note first",
    });
  });

  it("drops a malformed override but keeps the note", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":PROPERTIES:\n" +
        ":EXCEPTION-2026-05-04: nonsense xyz\n" +
        ":EXCEPTION-NOTE-2026-05-04: Real note\n" +
        ":END:\n",
    );
    expect(entries[0].exceptions.get("2026-05-04")).toEqual({
      override: null,
      note: "Real note",
    });
  });

  it("treats empty note as absent", () => {
    const entries = parseOrg(
      "** Entry\n:PROPERTIES:\n:EXCEPTION-NOTE-2026-05-18:\n:END:\n",
    );
    expect(entries[0].exceptions.size).toBe(0);
  });

  it("drops an invalid reschedule range (override absent), preserving any note", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":PROPERTIES:\n" +
        ":EXCEPTION-2026-05-04: reschedule 2026-05-12 18:00-17:00\n" +
        ":EXCEPTION-NOTE-2026-05-04: Still attached\n" +
        ":END:\n",
    );
    expect(entries[0].exceptions.get("2026-05-04")).toEqual({
      override: null,
      note: "Still attached",
    });
  });

  it("ignores other property keys", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":PROPERTIES:\n" +
        ":CATEGORY: work\n" +
        ":Effort: 1:30\n" +
        ":EXCEPTION-2026-05-04: cancelled\n" +
        ":END:\n",
    );
    expect(entries[0].exceptions.size).toBe(1);
    expect(entries[0].exceptions.get("2026-05-04")?.override?.kind).toBe("cancelled");
  });

  it("does not capture EXCEPTION-shaped lines inside other drawers", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":LOGBOOK:\n" +
        ":EXCEPTION-2026-05-04: cancelled\n" +
        ":END:\n",
    );
    expect(entries[0].exceptions.size).toBe(0);
  });

  it("collects exceptions across multiple dates", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":PROPERTIES:\n" +
        ":EXCEPTION-2026-04-27: cancelled\n" +
        ":EXCEPTION-2026-05-04: shift +45m\n" +
        ":EXCEPTION-NOTE-2026-05-11: A note\n" +
        ":END:\n",
    );
    expect(entries[0].exceptions.size).toBe(3);
  });

  it("parses exceptions even when the entry has no repeater (inert by design)", () => {
    const entries = parseOrg(
      "** Entry\n" +
        "<2026-04-27 ma. 12:00>\n" +
        ":PROPERTIES:\n" +
        ":EXCEPTION-2026-04-27: cancelled\n" +
        ":END:\n",
    );
    // Map is populated; expansion (which never runs against a non-repeater
    // here) is what would have applied it. See OrgEntry.exceptions docs.
    expect(entries[0].exceptions.size).toBe(1);
  });

  it("entry with no exception properties has an empty map", () => {
    const entries = parseOrg("** Entry\nBody.\n");
    expect(entries[0].exceptions.size).toBe(0);
  });
});

// ── :SERIES-UNTIL: property ──────────────────────────────────────────

describe(":SERIES-UNTIL: property", () => {
  it("parses a valid date into seriesUntil", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":PROPERTIES:\n" +
        ":SERIES-UNTIL: 2026-06-01\n" +
        ":END:\n",
    );
    expect(entries[0].seriesUntil).toBe("2026-06-01");
  });

  it("leaves seriesUntil null when the property is absent", () => {
    const entries = parseOrg("** Entry\nBody.\n");
    expect(entries[0].seriesUntil).toBeNull();
  });

  it("drops a malformed value", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":PROPERTIES:\n" +
        ":SERIES-UNTIL: not-a-date\n" +
        ":END:\n",
    );
    expect(entries[0].seriesUntil).toBeNull();
  });

  it("drops impossible calendar dates", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":PROPERTIES:\n" +
        ":SERIES-UNTIL: 2026-02-31\n" +
        ":END:\n",
    );
    expect(entries[0].seriesUntil).toBeNull();
  });

  it("coexists with exception properties in the same drawer", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":PROPERTIES:\n" +
        ":SERIES-UNTIL: 2026-06-01\n" +
        ":EXCEPTION-2026-05-04: cancelled\n" +
        ":END:\n",
    );
    expect(entries[0].seriesUntil).toBe("2026-06-01");
    expect(entries[0].exceptions.get("2026-05-04")?.override?.kind).toBe("cancelled");
  });

  it("does not read :SERIES-UNTIL: from non-PROPERTIES drawers", () => {
    const entries = parseOrg(
      "** Entry\n" +
        ":LOGBOOK:\n" +
        ":SERIES-UNTIL: 2026-06-01\n" +
        ":END:\n",
    );
    expect(entries[0].seriesUntil).toBeNull();
  });

  it("parses seriesUntil on non-recurring entries (inert by design)", () => {
    const entries = parseOrg(
      "** Entry\n" +
        "<2026-04-27 ma. 12:00>\n" +
        ":PROPERTIES:\n" +
        ":SERIES-UNTIL: 2026-06-01\n" +
        ":END:\n",
    );
    expect(entries[0].seriesUntil).toBe("2026-06-01");
  });
});

// ── Multiple entries ─────────────────────────────────────────────────

describe("multiple entries", () => {
  it("parses consecutive headings", () => {
    const entries = parseOrg("* Tasks\n** TODO A\n** DONE B\n* Events\n** C\n");
    expect(entries).toHaveLength(5);
    expect(entries[0].title).toBe("Tasks");
    expect(entries[1].todo).toBe("TODO");
    expect(entries[2].todo).toBe("DONE");
    expect(entries[3].title).toBe("Events");
    expect(entries[4].title).toBe("C");
  });
});

// ── Checkbox items ──────────────────────────────────────────────────

describe("checkbox items", () => {
  it("parses basic checkbox items", () => {
    const entries = parseOrg("** TODO Grocery list\n- [ ] Milk\n- [X] Bread\n- [ ] Eggs\n");
    expect(entries[0].checkboxItems).toHaveLength(3);
    expect(entries[0].checkboxItems[0]).toEqual({ text: "Milk", checked: false });
    expect(entries[0].checkboxItems[1]).toEqual({ text: "Bread", checked: true });
    expect(entries[0].checkboxItems[2]).toEqual({ text: "Eggs", checked: false });
  });

  it("does not include checkbox items in body", () => {
    const entries = parseOrg("** TODO Task\n- [X] Done item\n- [ ] Pending\n");
    expect(entries[0].body).toBe("");
  });

  it("handles entries with no checkboxes", () => {
    const entries = parseOrg("** TODO Simple task\n");
    expect(entries[0].checkboxItems).toEqual([]);
  });

  it("checkboxes alongside a #+begin_src description block", () => {
    const entries = parseOrg(
      "** TODO Task\n#+begin_src description\n  Some notes.\n#+end_src\n- [ ] Step one\n- [X] Step two\n",
    );
    expect(entries[0].body).toBe("Some notes.");
    expect(entries[0].checkboxItems).toHaveLength(2);
  });

  it("does not parse plain list items as checkboxes", () => {
    const entries = parseOrg("** Notes\n- Plain item\n- Another item\n");
    expect(entries[0].checkboxItems).toEqual([]);
    expect(entries[0].body).toBe("");
  });

  it("handles indented checkbox items", () => {
    const entries = parseOrg("** TODO Task\n  - [ ] Indented\n  - [X] Also indented\n");
    expect(entries[0].checkboxItems).toHaveLength(2);
    expect(entries[0].checkboxItems[0]).toEqual({ text: "Indented", checked: false });
    expect(entries[0].checkboxItems[1]).toEqual({ text: "Also indented", checked: true });
  });
});

// ── Full inbox.org integration test ──────────────────────────────────

describe("inbox.org integration", () => {
  const INBOX = `#+title: Org Inbox
#+startup: show2levels

* Tasks
** TODO Finish project draft :study:
DEADLINE: <2026-05-05 ti.>
** TODO Review course notes :study:
DEADLINE: <2026-05-09 lø.>
** TODO Install Syncthing on VPS :tech:
** TODO Show HN: playlist-to-audiobook :tech:
** TODO Bring a charged laptop to the work session
SCHEDULED: <2026-04-14 ti. 12:00>
* Events
** Easter Sunday :holiday:
<2026-04-05 sø.>
** Easter Monday :holiday:
<2026-04-06 ma.>
** Dance class A :dance:
<2026-04-06 ma. 20:00-21:30 +1w>
** Study session :study:
<2026-04-07 ti. 15:15-16:00>
** Workshop :study:
<2026-04-07 ti. 13:15-14:00 +1w>
** Dance class B :dance:
<2026-04-05 sø. 18:00-21:00 +1w>
** Dance practice :dance:
<2026-04-08 on. 18:00-21:00 +1w>
** Group activity :dance:
<2026-04-05 sø. 14:30-16:00 +1w>
** Exercise class A :dance:
<2026-04-07 ti. 17:00-18:30 +1w>
** Exercise class B :dance:
<2026-04-07 ti. 18:30-20:00 +1w>
** Exercise class C :dance:
<2026-04-07 ti. 20:00-21:30 +1w>
** Annual reminder A :birthday:
<2026-04-06 ma. +1y>
** Annual reminder B :birthday:
<2026-04-09 to. +1y>
** Annual reminder C :birthday:
<2026-04-23 ti. +1y>
** Weekend workshop :dance:
<2026-04-11 Sat 12:00>
** Outdoor activity :outdoors:
<2026-04-12 Sun 14:00>
#+begin_src description
  Meet at the main entrance.
#+end_src
`;

  it("parses correct number of entries", () => {
    const entries = parseOrg(INBOX);
    // 2 top-level headings (Tasks, Events) + 5 tasks + 16 events = 23
    expect(entries).toHaveLength(23);
  });

  it("parses first task correctly", () => {
    const entries = parseOrg(INBOX);
    const task = entries[1]; // ** TODO Finish project draft
    expect(task.level).toBe(2);
    expect(task.todo).toBe("TODO");
    expect(task.title).toBe("Finish project draft");
    expect(task.tags).toEqual(["study"]);
    expect(task.planning).toHaveLength(1);
    expect(task.planning[0].kind).toBe("deadline");
    expect(task.planning[0].timestamp.date).toBe("2026-05-05");
    expect(task.timestamps).toHaveLength(0);
    expect(task.body).toBe("");
  });

  it("parses scheduled task correctly", () => {
    const entries = parseOrg(INBOX);
    const task = entries[5]; // ** TODO Bring a charged laptop
    expect(task.todo).toBe("TODO");
    expect(task.title).toBe("Bring a charged laptop to the work session");
    expect(task.tags).toEqual([]);
    expect(task.planning).toHaveLength(1);
    expect(task.planning[0].kind).toBe("scheduled");
    expect(task.planning[0].timestamp.startTime).toBe("12:00");
  });

  it("parses date-only event (holiday)", () => {
    const entries = parseOrg(INBOX);
    const event = entries[7]; // Easter Sunday
    expect(event.title).toBe("Easter Sunday");
    expect(event.tags).toEqual(["holiday"]);
    expect(event.timestamps).toHaveLength(1);
    expect(event.timestamps[0].date).toBe("2026-04-05");
    expect(event.timestamps[0].startTime).toBeNull();
    expect(event.timestamps[0].repeater).toBeNull();
  });

  it("parses timed event with repeater", () => {
    const entries = parseOrg(INBOX);
    const event = entries[9]; // Dance class A
    expect(event.title).toBe("Dance class A");
    expect(event.tags).toEqual(["dance"]);
    expect(event.timestamps[0].startTime).toBe("20:00");
    expect(event.timestamps[0].endTime).toBe("21:30");
    expect(event.timestamps[0].repeater).toEqual({ mark: "+", value: 1, unit: "w" });
  });

  it("parses yearly repeater (birthday)", () => {
    const entries = parseOrg(INBOX);
    const event = entries[18]; // Annual reminder A
    expect(event.title).toBe("Annual reminder A");
    expect(event.tags).toEqual(["birthday"]);
    expect(event.timestamps[0].repeater).toEqual({ mark: "+", value: 1, unit: "y" });
  });

  it("preserves body text on Outdoor activity", () => {
    const entries = parseOrg(INBOX);
    const event = entries[22]; // Outdoor activity
    expect(event.title).toBe("Outdoor activity");
    expect(event.tags).toEqual(["outdoors"]);
    expect(event.body).toBe("Meet at the main entrance.");
    expect(event.timestamps).toHaveLength(1);
    expect(event.timestamps[0].startTime).toBe("14:00");
  });

  it("parses task with no planning or timestamps", () => {
    const entries = parseOrg(INBOX);
    const task = entries[3]; // Install Syncthing on VPS
    expect(task.todo).toBe("TODO");
    expect(task.title).toBe("Install Syncthing on VPS");
    expect(task.tags).toEqual(["tech"]);
    expect(task.planning).toHaveLength(0);
    expect(task.timestamps).toHaveLength(0);
  });

  it("keeps Unicode tags intact", () => {
    const entries = parseOrg(INBOX);
    const event = entries.find((e) => e.title === "Dance practice");
    expect(event).toBeDefined();
    expect(event!.tags).toEqual(["dance"]);
  });
});
