import { describe, expect, it } from "vitest";
import { formatDescriptionLine } from "../description.ts";

describe("formatDescriptionLine", () => {
  it("indents ordinary description lines", () => {
    expect(formatDescriptionLine("Bring mat.")).toBe("  Bring mat.");
  });

  it("escapes source block markers even when the user line is indented", () => {
    expect(formatDescriptionLine("#+end_src")).toBe("  ,#+end_src");
    expect(formatDescriptionLine("  #+end_src")).toBe("  ,  #+end_src");
    expect(formatDescriptionLine("\t#+begin_src python")).toBe("  ,\t#+begin_src python");
  });

  it("escapes leading commas", () => {
    expect(formatDescriptionLine(",literal comma")).toBe("  ,,literal comma");
  });
});
