/**
 * Pure source-text mutation helpers used by the edit panel.
 *
 * These operate on raw Org text and source line numbers so the UI can
 * test its rewrite behavior without going through DOM event handlers.
 */

import { stepDate } from "./timestamp.ts";

const ACTIVE_TIMESTAMP_RE =
  /<(\d{4}-\d{2}-\d{2})\s+(\S+)\s*(?:(\d{2}:\d{2})(?:-(\d{2}:\d{2}))?)?\s*((?:\.\+|\+\+|\+)\d+[dwmy])?\s*>/g;

const EN_DAY_ABBREVS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const NO_DAY_ABBREVS = ["sø.", "ma.", "ti.", "on.", "to.", "fr.", "lø."] as const;

const DRAWER_OPEN_RE = /^\s*:([A-Z_]+):\s*$/;
const DRAWER_CLOSE_RE = /^\s*:END:\s*$/;
const DESC_BLOCK_OPEN_RE = /^#\+begin_src\s+description\s*$/i;
const DESC_BLOCK_CLOSE_RE = /^#\+end_src\s*$/i;

/**
 * Return the index of the first line that starts the NEXT entry after
 * `startIdx`, skipping drawer and #+begin_*...#+end_* block contents so
 * that heading-like text inside them is not mistaken for a heading.
 */
function findEntryEnd(lines: string[], startIdx: number): number {
  let inDrawer = false;
  let inBlock = false;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (inBlock) {
      if (/^#\+end_\S/i.test(line)) inBlock = false;
      continue;
    }
    if (inDrawer) {
      if (DRAWER_CLOSE_RE.test(line)) inDrawer = false;
      continue;
    }
    if (/^#\+begin_\S/i.test(line)) { inBlock = true; continue; }
    const m = line.match(DRAWER_OPEN_RE);
    if (m) {
      if (m[1] !== "END") inDrawer = true;
      continue;
    }
    if (/^\*+\s/.test(line)) return i;
  }
  return lines.length;
}

/**
 * Replace the block for an entry at `sourceLine` with `newText`. The new
 * block text must include all content (heading, planning, checkboxes, body).
 * Extra bare timestamps beyond the one in newText are preserved from the
 * original. The block extends from the heading line up to (but not including)
 * the next heading or EOF.
 */
export function replaceOrgBlockInSource(source: string, sourceLine: number, newText: string): string {
  const lines = source.split("\n");
  const startIdx = sourceLine - 1;
  if (startIdx < 0 || startIdx >= lines.length) return source;

  const endIdx = findEntryEnd(lines, startIdx);

  const planningRe = /^\s*(?:SCHEDULED|DEADLINE):\s*</;
  const bareRe = /^\s*<\d{4}-\d{2}-\d{2}/;
  const checkboxRe = /^\s*-\s+\[[ X]\]\s+/;
  const drawerOpenRe = /^\s*:([A-Z_]+):\s*$/;
  const drawerCloseRe = /^\s*:END:\s*$/;
  const newBlockLines = newText.split("\n");
  const newHasBareTimestamp = newBlockLines.some((line) => bareRe.test(line));
  const shouldDropAllBare = !newHasBareTimestamp;
  let dropReplacementBare = newHasBareTimestamp;
  const preserved: string[] = [];

  let insideDrawer = false;
  let currentDrawer = "";
  let insideDescBlock = false; // #+begin_description ... #+end_description owned by newText

  for (let i = startIdx + 1; i < endIdx; i++) {
    const line = lines[i];

    if (insideDescBlock) {
      if (DESC_BLOCK_CLOSE_RE.test(line)) insideDescBlock = false;
      continue; // description block is owned by newText — drop
    }

    if (insideDrawer) {
      if (drawerCloseRe.test(line)) {
        preserved.push(line);
        insideDrawer = false;
      } else {
        preserved.push(line);
      }
      continue;
    }

    if (planningRe.test(line)) continue;
    if (bareRe.test(line)) {
      if (shouldDropAllBare) continue;
      if (dropReplacementBare) {
        dropReplacementBare = false;
        continue;
      }
      preserved.push(line);
      continue;
    }
    if (checkboxRe.test(line)) continue;

    if (DESC_BLOCK_OPEN_RE.test(line)) { insideDescBlock = true; continue; }

    const drawerMatch = line.match(drawerOpenRe);
    if (drawerMatch) {
      currentDrawer = drawerMatch[1];
      insideDrawer = true;
      preserved.push(line);
      continue;
    }

    // raw body text lines and blank lines: drop (body is owned by #+begin_description in newText)
  }

  return [
    ...lines.slice(0, startIdx),
    ...newBlockLines,
    ...preserved,
    ...lines.slice(endIdx),
  ].join("\n");
}

/**
 * Flip TODO↔DONE on the heading line of the entry at `sourceLine`. Edits
 * only the heading, leaving planning lines and body untouched.
 */
export function toggleDoneInSource(source: string, sourceLine: number): string {
  const lines = source.split("\n");
  const idx = sourceLine - 1;
  if (idx < 0 || idx >= lines.length) return source;
  const match = lines[idx].match(/^(\*+\s+)(TODO|DONE)(\b.*)?$/);
  if (!match) return source;

  if (match[2] === "DONE") {
    lines[idx] = `${match[1]}TODO${match[3] ?? ""}`;
    return lines.join("\n");
  }

  const endIdx = findEntryEnd(lines, idx);

  const now = new Date();
  let sawRepeater = false;
  for (let i = idx + 1; i < endIdx; i++) {
    const original = lines[i];
    const updated = original.replace(ACTIVE_TIMESTAMP_RE, (...args: string[]) => {
      const full = args[0];
      const repeater = args[5] ?? "";
      if (!repeater) return full;
      sawRepeater = true;
      return shiftRepeatingTimestamp(full, now);
    });
    lines[i] = updated;
  }

  if (!sawRepeater) {
    lines[idx] = `${match[1]}DONE${match[3] ?? ""}`;
  }
  return lines.join("\n");
}

/**
 * Matches a checkbox list item. Captures: 1=indent + `- [`, 2=mark (" " or "X"),
 * 3=`] ` separator, 4=text. Used by checkbox toggling so indexing and
 * progress-cookie counting stay consistent.
 */
const CHECKBOX_LINE_RE = /^(\s*-\s+\[)([ X])(\]\s+)(.+)$/;

interface CheckboxBlock {
  readonly lines: string[];
  readonly startIdx: number;
  readonly endIdx: number;
}

function findEntryBlock(source: string, parentSourceLine: number): CheckboxBlock | null {
  const lines = source.split("\n");
  const startIdx = parentSourceLine - 1;
  if (startIdx < 0 || startIdx >= lines.length) return null;
  if (!/^\*+\s/.test(lines[startIdx])) return null;

  const endIdx = findEntryEnd(lines, startIdx);
  return { lines, startIdx, endIdx };
}

function findCheckboxLineForIndex(
  lines: readonly string[],
  startIdx: number,
  endIdx: number,
  index: number,
): number {
  let count = 0;
  for (let i = startIdx + 1; i < endIdx; i++) {
    if (CHECKBOX_LINE_RE.test(lines[i])) {
      if (count === index) return i;
      count += 1;
    }
  }
  return -1;
}

/**
 * Flip the checked state of the `index`th checkbox within the entry block at
 * `parentSourceLine`. No-op if the entry or checkbox isn't found.
 */
export function toggleCheckboxInSource(source: string, parentSourceLine: number, index: number): string {
  const block = findEntryBlock(source, parentSourceLine);
  if (!block) return source;
  const { lines, startIdx, endIdx } = block;

  const targetIdx = findCheckboxLineForIndex(lines, startIdx, endIdx, index);
  if (targetIdx === -1) return source;

  lines[targetIdx] = lines[targetIdx].replace(
    CHECKBOX_LINE_RE,
    (_match, before: string, mark: string, sep: string, text: string) =>
      `${before}${mark === "X" ? " " : "X"}${sep}${text}`,
  );

  return lines.join("\n");
}

function shiftRepeatingTimestamp(raw: string, now: Date): string {
  const match = raw.match(/^<(\d{4}-\d{2}-\d{2})\s+(\S+)\s*(?:(\d{2}:\d{2})(?:-(\d{2}:\d{2}))?)?\s*((?:\.\+|\+\+|\+)\d+[dwmy])\s*>$/);
  if (!match) return raw;

  const [, date, weekdayToken, startTime, endTime, repeaterRaw] = match;
  const repeater = repeaterRaw.match(/^(\.\+|\+\+|\+)(\d+)([dwmy])$/);
  if (!repeater) return raw;

  const [, mark, rawValue, unit] = repeater;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) return raw;

  const base = parseYMDWithTime(date, startTime ?? null);
  const next = nextRepeaterDate(base, startTime ?? null, mark as ".+" | "++" | "+", value, unit as "d" | "w" | "m" | "y", now);
  const nextDate = formatYMD(next);
  const nextDay = formatWeekdayToken(next, weekdayToken);
  const timePart = startTime
    ? endTime
      ? ` ${formatHHMM(next)}-${shiftEndTime(next, startTime, endTime)}`
      : ` ${formatHHMM(next)}`
    : "";
  return `<${nextDate} ${nextDay}${timePart} ${repeaterRaw}>`;
}

function nextRepeaterDate(
  base: Date,
  startTime: string | null,
  mark: ".+" | "++" | "+",
  value: number,
  unit: "d" | "w" | "m" | "y",
  now: Date,
): Date {
  if (mark === "+") return stepDate(base, value, unit);

  if (mark === ".+") {
    const anchor = startTime === null
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      : new Date(now);
    return stepDate(anchor, value, unit);
  }

  const compare = startTime === null
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    : new Date(now);
  let candidate = stepDate(base, value, unit);
  while (candidate <= compare) {
    candidate = stepDate(candidate, value, unit);
  }
  return candidate;
}

function shiftEndTime(start: Date, baseStartTime: string, baseEndTime: string): string {
  let durationMin = hhmmToMinutes(baseEndTime) - hhmmToMinutes(baseStartTime);
  if (durationMin < 0) durationMin += 1440;
  const shiftedEnd = new Date(start.getTime() + durationMin * 60_000);
  return formatHHMM(shiftedEnd);
}

function formatWeekdayToken(date: Date, sample: string): string {
  if (NO_DAY_ABBREVS.includes(sample as typeof NO_DAY_ABBREVS[number])) return NO_DAY_ABBREVS[date.getDay()];
  return EN_DAY_ABBREVS[date.getDay()];
}

function parseYMDWithTime(ymd: string, time: string | null): Date {
  const [y, mo, d] = ymd.split("-").map(Number);
  if (time === null) return new Date(y, mo - 1, d, 0, 0, 0, 0);
  const [h, mi] = time.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

function formatYMD(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function deleteOrgBlockInSource(source: string, sourceLine: number): string {
  const lines = source.split("\n");
  const startIdx = sourceLine - 1;
  if (startIdx < 0 || startIdx >= lines.length) return source;

  const endIdx = findEntryEnd(lines, startIdx);

  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx);
  if (before.length > 0 && before[before.length - 1] === "" && (after.length === 0 || after[0] === "")) {
    before.pop();
  }

  return [...before, ...after].join("\n");
}

export function appendOrgTextToSource(source: string, orgText: string): string {
  return `${source.trimEnd()}\n${orgText}\n`;
}

export function appendOrgTextUnderHeading(source: string, heading: "Tasks" | "Events", orgText: string): string {
  const normalized = normalizeOrgTextLevel(orgText, 2);
  if (!normalized.trim()) return source;
  return appendChildUnderTopLevelHeading(source, heading, normalized);
}

export function appendAgendaItemToSource(source: string, orgText: string): string {
  const heading = /^\*+\s+(?:TODO|DONE)\b/.test(orgText) ? "Tasks" : "Events";
  return appendOrgTextUnderHeading(source, heading, orgText);
}

export function appendQuickCaptureToTasks(source: string, rawText: string): string {
  const { priority, body, tags } = parseQuickCapture(rawText);
  const headingText = sanitizeQuickCaptureHeading(body);
  if (!headingText && priority === null && tags.length === 0) return source;

  const priorityStr = priority !== null ? `[#${priority}] ` : "";
  const tagsStr = tags.length > 0 ? `  :${tags.join(":")}:` : "";
  const taskLine = `** TODO ${priorityStr}${headingText}${tagsStr}`;
  return appendChildUnderTopLevelHeading(source, "Tasks", taskLine);
}

function parseQuickCapture(rawText: string): { priority: string | null; body: string; tags: string[] } {
  let text = rawText.replace(/\s+/g, " ").trim();

  let priority: string | null = null;
  const priorityMatch = text.match(/^(!{1,3})(?:\s|$)/);
  if (priorityMatch) {
    priority = ["C", "B", "A"][priorityMatch[1].length - 1];
    text = text.slice(priorityMatch[0].length).trim();
  }

  const tags: string[] = [];
  const words = text.split(" ");
  while (words.length > 0 && /^#[\p{L}a-zA-Z0-9_@]+$/u.test(words[words.length - 1])) {
    tags.unshift(words.pop()!.slice(1));
  }
  text = words.join(" ");

  return { priority, body: text, tags };
}

function appendChildUnderTopLevelHeading(source: string, heading: string, childText: string): string {
  const lines = source.split("\n");
  const headingLine = `* ${heading}`;
  const headingIdx = lines.findIndex(line => line === headingLine);

  if (headingIdx < 0) {
    const base = source.trimEnd();
    const prefix = base ? `${base}\n` : "";
    return `${prefix}${headingLine}\n${childText}\n`;
  }

  let insertIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^\*\s/.test(lines[i])) {
      insertIdx = i;
      break;
    }
  }

  const before = lines.slice(0, insertIdx);
  while (before.length > headingIdx + 1 && before[before.length - 1] === "") before.pop();
  const after = lines.slice(insertIdx);
  const updated = [...before, childText, ...after].join("\n");
  return updated.endsWith("\n") ? updated : `${updated}\n`;
}

function normalizeOrgTextLevel(orgText: string, level: number): string {
  const lines = orgText.trimEnd().split("\n");
  if (lines.length === 0) return "";
  const match = lines[0].match(/^(\*+)(\s+.*)$/);
  if (!match) return orgText.trimEnd();
  lines[0] = `${"*".repeat(level)}${match[2]}`;
  return lines.join("\n");
}

function sanitizeQuickCaptureHeading(rawText: string): string {
  return rawText
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(\[#([A-C])\]\s*)/, "#$2 ")
    .replace(/\[(\d+)\/(\d+)\]/g, "($1/$2)")
    .replace(/\[(\d+)%\]/g, "($1%)")
    .replace(/<([^>]*)>/g, "($1)")
    .replace(/\s+(:[\p{L}a-zA-Z0-9_@]+(?::[\p{L}a-zA-Z0-9_@]+)*:)\s*$/u, (_, tags: string) => ` ${tags.replace(/:/g, ";")}`);
}
