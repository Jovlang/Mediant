// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { t, getLocale, setLocale } from "../i18n.ts";
import { formatDayMonth, formatDayNumber } from "../dateLabels.ts";

describe("i18n", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("returns English by default", () => {
    expect(t("save")).toBe("Save");
    expect(t("delete")).toBe("Delete");
    expect(t("typeTodo")).toBe("Task");
  });

  it("returns Norwegian when locale is set to nb", () => {
    setLocale("nb");
    expect(t("save")).toBe("Lagre");
    expect(t("delete")).toBe("Slett");
    expect(t("typeTodo")).toBe("Oppgave");
    expect(getLocale()).toBe("nb");
  });

  it("localizes deadline placement toggle labels", () => {
    expect(t("showDeadlines")).toBe("Show deadlines at top");
    expect(t("hideDeadlines")).toBe("Show deadlines in calendar");

    setLocale("nb");
    expect(t("showDeadlines")).toBe("Vis frister øverst");
    expect(t("hideDeadlines")).toBe("Vis frister i kalenderen");

    setLocale("it");
    expect(t("showDeadlines")).toBe("Mostra scadenze in alto");
    expect(t("hideDeadlines")).toBe("Mostra scadenze nel calendario");

    setLocale("de");
    expect(t("showDeadlines")).toBe("Fristen oben anzeigen");
    expect(t("hideDeadlines")).toBe("Fristen im Kalender anzeigen");
  });

  it("interpolates parameters", () => {
    expect(t("addEventOn", { date: "Mon 6 May" })).toBe("Add event on Mon 6 May");
    setLocale("nb");
    expect(t("addEventOn", { date: "man. 6. mai" })).toBe("Legg til hendelse man. 6. mai");
  });

  it("falls back to English when key missing in target locale", () => {
    setLocale("en");
    expect(t("save")).toBeTruthy();
  });

  it("persists locale to localStorage", () => {
    setLocale("nb");
    expect(localStorage.getItem("mediant-locale")).toBe("nb");
    setLocale("en");
    expect(localStorage.getItem("mediant-locale")).toBe("en");
  });

  it("formats Norwegian day numbers with an ordinal period", () => {
    expect(formatDayNumber(10)).toBe("10");
    expect(formatDayMonth(new Date(2026, 4, 10))).toBe("10 May");

    setLocale("nb");
    expect(formatDayNumber(10)).toBe("10.");
    expect(formatDayMonth(new Date(2026, 4, 10))).toBe("10. mai");
  });
});
