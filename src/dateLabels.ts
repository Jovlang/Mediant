import { getLocale } from "./i18n.ts";

const DAY_ABBREVS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_ABBREVS_NB = ["søn", "man", "tir", "ons", "tor", "fre", "lør"] as const;
const DAY_ABBREVS_IT = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"] as const;
const DAY_ABBREVS_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

const DAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const DAY_NAMES_NB = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"] as const;
const DAY_NAMES_IT = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"] as const;
const DAY_NAMES_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"] as const;

const MONTH_ABBREVS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MONTH_ABBREVS_NB = ["jan.", "feb.", "mars", "apr.", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des."] as const;
const MONTH_ABBREVS_IT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"] as const;
const MONTH_ABBREVS_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"] as const;

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
const MONTH_NAMES_NB = [
  "januar", "februar", "mars", "april", "mai", "juni",
  "juli", "august", "september", "oktober", "november", "desember",
] as const;
const MONTH_NAMES_IT = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
] as const;
const MONTH_NAMES_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
] as const;

function pickByLocale(en: readonly string[], nb: readonly string[], it: readonly string[], de: readonly string[]): readonly string[] {
  const locale = getLocale();
  if (locale === "nb") return nb;
  if (locale === "it") return it;
  if (locale === "de") return de;
  return en;
}

export const DAY_ABBREVS = new Proxy([] as readonly string[], {
  get(_, prop) {
    return Reflect.get(pickByLocale(DAY_ABBREVS_EN, DAY_ABBREVS_NB, DAY_ABBREVS_IT, DAY_ABBREVS_DE), prop);
  },
});

export const DAY_NAMES = new Proxy([] as readonly string[], {
  get(_, prop) {
    return Reflect.get(pickByLocale(DAY_NAMES_EN, DAY_NAMES_NB, DAY_NAMES_IT, DAY_NAMES_DE), prop);
  },
});

export const MONTH_ABBREVS = new Proxy([] as readonly string[], {
  get(_, prop) {
    return Reflect.get(pickByLocale(MONTH_ABBREVS_EN, MONTH_ABBREVS_NB, MONTH_ABBREVS_IT, MONTH_ABBREVS_DE), prop);
  },
});

export const MONTH_NAMES = new Proxy([] as readonly string[], {
  get(_, prop) {
    return Reflect.get(pickByLocale(MONTH_NAMES_EN, MONTH_NAMES_NB, MONTH_NAMES_IT, MONTH_NAMES_DE), prop);
  },
});

export function formatDayNumber(day: number): string {
  return getLocale() === "nb" ? `${day}.` : String(day);
}

export function formatDayMonth(date: Date, monthNames: readonly string[] = MONTH_NAMES): string {
  return `${formatDayNumber(date.getDate())} ${monthNames[date.getMonth()]}`;
}
