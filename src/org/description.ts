// Formatting helpers for Mediant's `#+begin_src description` body blocks.

const SRC_MARKER_RE = /^\s*#\+(?:begin|end)_src\b/i;

/**
 * Indent description lines by 2 spaces. Escape source-block marker lines
 * and leading commas so the text round-trips as literal src-block content.
 */
export function formatDescriptionLine(line: string): string {
  const escaped = (line.startsWith(",") || SRC_MARKER_RE.test(line))
    ? "," + line
    : line;
  return "  " + escaped;
}
