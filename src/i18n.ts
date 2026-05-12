export type Locale = "en" | "nb" | "it" | "de";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "nb", "it", "de"] as const;

const LOCALE_STORAGE_KEY = "mediant-locale";

const messages = {
  en: {
    // Header / navigation
    today: "Today",
    todayAria: "Today",
    prev7Days: "Previous 7 days",
    next7Days: "Next 7 days",
    prev30Days: "Previous 30 days",
    next30Days: "Next 30 days",
    addLabel: "+Add",
    addAria: "Add item",
    settings: "Settings",
    viewOnGitHub: "View on GitHub",

    // Settings toggles
    toggleNotifications: "Toggle notifications",
    enableNotifications: "Enable notifications",
    disableNotifications: "Disable notifications",
    hideEmptyDays: "Hide empty days",
    showEmptyDays: "Show empty days",
    hideTags: "Hide tags",
    showTags: "Show tags",
    hideCompletedAndSkipped: "Hide completed & skipped",
    showCompletedAndSkipped: "Show completed & skipped",
    hideDeadlines: "Hide upcoming deadlines",
    showDeadlines: "Show upcoming deadlines",
    showFewerDays: "Show fewer days",
    showMoreDays: "Show more days",
    language: "Language",
    languageEnglish: "English",
    languageNorwegian: "Norsk",
    languageItalian: "Italiano",
    languageGerman: "Deutsch",
    switchToEnglish: "Switch to English",
    switchToNorwegian: "Switch to Norsk",
    switchToItalian: "Switch to Italiano",
    switchToGerman: "Switch to Deutsch",

    // Tag filters
    filtering: "Filtering:",
    clear: "Clear",
    filterByTag: "Filter by tag {tag}",
    removeTagFilter: "Remove tag filter {tag}",
    filterByPriority: "Filter by priority {priority}",
    removePriorityFilter: "Remove priority filter {priority}",

    // Day rows
    addEventOn: "Add event on {date}",
    overdue: "Overdue",
    deadline: "DEADLINE",
    overdueScheduled: "SCHEDULED",
    nowMarker: "◄ now",
    allDay: "All-day",
    markDone: "Mark done",
    markNotDone: "Mark not done",
    skippedDetail: "Skipped ({detail})",
    movedEarlier: "← Moved",
    movedLater: "→ Moved",
    // Add/edit panel — header and shared
    close: "Close",
    addItem: "Add item",
    editTask: "Edit task",
    editEvent: "Edit event",
    save: "Save",
    delete: "Delete",
    tapAgainToDelete: "Tap again to delete",

    // Add/edit panel — fields
    sectionOccurrence: "Occurrence controls",
    sectionTaskDetails: "Task",
    sectionEventDetails: "Event",
    sectionDates: "Dates",
    sectionMetadata: "Metadata",
    sectionChecklist: "Checklist",
    type: "Type",
    typeEvent: "Event",
    typeTodo: "Task",
    priority: "Priority",
    priorityNone: "None",
    increasePriority: "Increase priority",
    decreasePriority: "Decrease priority",
    title: "What",
    when: "When",
    scheduled: "Scheduled",
    deadlineField: "Deadline",
    repeat: "Repeat",
    scheduledRepeat: "Scheduled repeat",
    deadlineRepeat: "Deadline repeat",
    tags: "Tags",
    checklist: "Checklist",
    addSubtask: "+ Add subtask",

    // Repeat options
    repeatNone: "None",
    repeatEveryDay: "Every day (+1d)",
    repeatEveryWeek: "Every week (+1w)",
    repeatEvery2Weeks: "Every 2 weeks (+2w)",
    repeatEveryMonth: "Every month (+1m)",
    repeatEveryYear: "Every year (+1y)",
    repeatNextFutureDay: "Next future day (++1d)",
    repeatNextFutureWeek: "Next future week (++1w)",
    repeatNextFutureMonth: "Next future month (++1m)",
    repeatNextFutureYear: "Next future year (++1y)",
    repeatDayFromDone: "1 day from done (.+1d)",
    repeatWeekFromDone: "1 week from done (.+1w)",
    repeatMonthFromDone: "1 month from done (.+1m)",
    repeatYearFromDone: "1 year from done (.+1y)",

    // Tag picker
    addTagOption: "Add \"{tag}\"",

    // Occurrence section
    onSchedule: "On schedule",
    skipThisOccurrence: "Skip this occurrence",
    stopRepeatingAfter: "Stop repeating after this occurrence",
    moveToDateTime: "Move to date/time",
    clearOverride: "Clear override",
    noteForOccurrence: "Note for this occurrence",
    summonScheduled: "+ Scheduled",
    summonDeadline: "+ Deadline",
    summonRepeat: "+ Repeat",
    summonMove: "+ Move",
    summonNote: "+ Note",

    // Quick capture
    quickTaskCapture: "Quick task capture",
    couldNotSaveTask: "Could not save task.",

    // Input screen
    someday: "Tasks",

    appTitle: "Mediant",
    loadAgenda: "Load agenda",

    // Notifications
    notificationStartsIn1Hour: "Starts in 1 hour · {time}",
  },
  nb: {
    today: "I dag",
    todayAria: "I dag",
    prev7Days: "Forrige 7 dager",
    next7Days: "Neste 7 dager",
    prev30Days: "Forrige 30 dager",
    next30Days: "Neste 30 dager",
    addLabel: "+Legg til",
    addAria: "Legg til oppføring",
    settings: "Innstillinger",
    viewOnGitHub: "Se på GitHub",

    toggleNotifications: "Slå av/på varsler",
    enableNotifications: "Slå på varsler",
    disableNotifications: "Slå av varsler",
    hideEmptyDays: "Skjul tomme dager",
    showEmptyDays: "Vis tomme dager",
    hideTags: "Skjul etiketter",
    showTags: "Vis etiketter",
    hideCompletedAndSkipped: "Skjul fullførte og hoppet over",
    showCompletedAndSkipped: "Vis fullførte og hoppet over",
    hideDeadlines: "Skjul kommende frister",
    showDeadlines: "Vis kommende frister",
    showFewerDays: "Vis færre dager",
    showMoreDays: "Vis flere dager",
    language: "Språk",
    languageEnglish: "English",
    languageNorwegian: "Norsk",
    languageItalian: "Italiano",
    languageGerman: "Deutsch",
    switchToEnglish: "Bytt til English",
    switchToNorwegian: "Bytt til Norsk",
    switchToItalian: "Bytt til Italiano",
    switchToGerman: "Bytt til Deutsch",

    filtering: "Filter:",
    clear: "Tøm",
    filterByTag: "Filtrer på etikett {tag}",
    removeTagFilter: "Fjern etikettfilter {tag}",
    filterByPriority: "Filtrer på prioritet {priority}",
    removePriorityFilter: "Fjern prioritetsfilter {priority}",

    addEventOn: "Legg til hendelse {date}",
    overdue: "Forfalt",
    deadline: "FRIST",
    overdueScheduled: "PLANLAGT",
    nowMarker: "◄ nå",
    allDay: "Hele dagen",
    markDone: "Marker som ferdig",
    markNotDone: "Marker som ikke ferdig",
    skippedDetail: "Hoppet over ({detail})",
    movedEarlier: "← Flyttet",
    movedLater: "→ Flyttet",
    close: "Lukk",
    addItem: "Legg til oppføring",
    editTask: "Rediger oppgave",
    editEvent: "Rediger hendelse",
    save: "Lagre",
    delete: "Slett",
    tapAgainToDelete: "Trykk igjen for å slette",

    type: "Type",
    sectionOccurrence: "Forekomst",
    sectionTaskDetails: "Oppgave",
    sectionEventDetails: "Hendelse",
    sectionDates: "Datoer",
    sectionMetadata: "Metadata",
    sectionChecklist: "Sjekkliste",
    typeEvent: "Hendelse",
    typeTodo: "Oppgave",
    priority: "Prioritet",
    priorityNone: "Ingen",
    increasePriority: "Øk prioritet",
    decreasePriority: "Senk prioritet",
    title: "Hva",
    when: "Når",
    scheduled: "Planlagt",
    deadlineField: "Frist",
    repeat: "Gjenta",
    scheduledRepeat: "Gjenta planlagt",
    deadlineRepeat: "Gjenta frist",
    tags: "Etiketter",
    checklist: "Sjekkliste",
    addSubtask: "+ Legg til deloppgave",

    repeatNone: "Ingen",
    repeatEveryDay: "Hver dag (+1d)",
    repeatEveryWeek: "Hver uke (+1w)",
    repeatEvery2Weeks: "Annenhver uke (+2w)",
    repeatEveryMonth: "Hver måned (+1m)",
    repeatEveryYear: "Hvert år (+1y)",
    repeatNextFutureDay: "Neste fremtidige dag (++1d)",
    repeatNextFutureWeek: "Neste fremtidige uke (++1w)",
    repeatNextFutureMonth: "Neste fremtidige måned (++1m)",
    repeatNextFutureYear: "Neste fremtidige år (++1y)",
    repeatDayFromDone: "1 dag etter fullført (.+1d)",
    repeatWeekFromDone: "1 uke etter fullført (.+1w)",
    repeatMonthFromDone: "1 måned etter fullført (.+1m)",
    repeatYearFromDone: "1 år etter fullført (.+1y)",

    addTagOption: "Legg til «{tag}»",

    onSchedule: "I rute",
    skipThisOccurrence: "Hopp over denne forekomsten",
    stopRepeatingAfter: "Slutt å gjenta etter denne forekomsten",
    moveToDateTime: "Flytt til dato/klokkeslett",
    clearOverride: "Fjern overstyring",
    noteForOccurrence: "Notat for denne forekomsten",
    summonScheduled: "+ Planlagt",
    summonDeadline: "+ Frist",
    summonRepeat: "+ Gjenta",
    summonMove: "+ Flytt",
    summonNote: "+ Notat",

    quickTaskCapture: "Legg til oppgave",
    couldNotSaveTask: "Kunne ikke lagre oppgaven.",

    someday: "Oppgaver",

    appTitle: "Mediant",
    loadAgenda: "Last inn agenda",

    notificationStartsIn1Hour: "Starter om 1 time · {time}",
  },
  it: {
    today: "Oggi",
    todayAria: "Oggi",
    prev7Days: "7 giorni precedenti",
    next7Days: "Prossimi 7 giorni",
    prev30Days: "30 giorni precedenti",
    next30Days: "Prossimi 30 giorni",
    addLabel: "+Aggiungi",
    addAria: "Aggiungi elemento",
    settings: "Impostazioni",
    viewOnGitHub: "Vedi su GitHub",

    toggleNotifications: "Attiva/disattiva notifiche",
    enableNotifications: "Attiva notifiche",
    disableNotifications: "Disattiva notifiche",
    hideEmptyDays: "Nascondi giorni vuoti",
    showEmptyDays: "Mostra giorni vuoti",
    hideTags: "Nascondi etichette",
    showTags: "Mostra etichette",
    hideCompletedAndSkipped: "Nascondi completati e saltati",
    showCompletedAndSkipped: "Mostra completati e saltati",
    hideDeadlines: "Nascondi scadenze imminenti",
    showDeadlines: "Mostra scadenze imminenti",
    showFewerDays: "Mostra meno giorni",
    showMoreDays: "Mostra più giorni",
    language: "Lingua",
    languageEnglish: "English",
    languageNorwegian: "Norsk",
    languageItalian: "Italiano",
    languageGerman: "Deutsch",
    switchToEnglish: "Passa a English",
    switchToNorwegian: "Passa a Norsk",
    switchToItalian: "Passa a Italiano",
    switchToGerman: "Passa a Deutsch",

    filtering: "Filtrando:",
    clear: "Cancella",
    filterByTag: "Filtra per etichetta {tag}",
    removeTagFilter: "Rimuovi filtro etichetta {tag}",
    filterByPriority: "Filtra per priorità {priority}",
    removePriorityFilter: "Rimuovi filtro priorità {priority}",

    addEventOn: "Aggiungi evento il {date}",
    overdue: "Scaduto",
    deadline: "SCADENZA",
    overdueScheduled: "PIANIFICATO",
    nowMarker: "◄ ora",
    allDay: "Tutto il giorno",
    markDone: "Segna come fatto",
    markNotDone: "Segna come non fatto",
    skippedDetail: "Saltato ({detail})",
    movedEarlier: "← Spostato",
    movedLater: "→ Spostato",
    close: "Chiudi",
    addItem: "Aggiungi elemento",
    editTask: "Modifica attività",
    editEvent: "Modifica evento",
    save: "Salva",
    delete: "Elimina",
    tapAgainToDelete: "Tocca di nuovo per eliminare",

    type: "Tipo",
    sectionOccurrence: "Controlli ricorrenza",
    sectionTaskDetails: "Attività",
    sectionEventDetails: "Evento",
    sectionDates: "Date",
    sectionMetadata: "Metadati",
    sectionChecklist: "Lista di controllo",
    typeEvent: "Evento",
    typeTodo: "Attività",
    priority: "Priorità",
    priorityNone: "Nessuna",
    increasePriority: "Aumenta priorità",
    decreasePriority: "Diminuisci priorità",
    title: "Cosa",
    when: "Quando",
    scheduled: "Pianificato",
    deadlineField: "Scadenza",
    repeat: "Ripeti",
    scheduledRepeat: "Ripeti pianificato",
    deadlineRepeat: "Ripeti scadenza",
    tags: "Etichette",
    checklist: "Lista di controllo",
    addSubtask: "+ Aggiungi sottoattività",

    repeatNone: "Nessuno",
    repeatEveryDay: "Ogni giorno (+1d)",
    repeatEveryWeek: "Ogni settimana (+1w)",
    repeatEvery2Weeks: "Ogni 2 settimane (+2w)",
    repeatEveryMonth: "Ogni mese (+1m)",
    repeatEveryYear: "Ogni anno (+1y)",
    repeatNextFutureDay: "Prossimo giorno futuro (++1d)",
    repeatNextFutureWeek: "Prossima settimana futura (++1w)",
    repeatNextFutureMonth: "Prossimo mese futuro (++1m)",
    repeatNextFutureYear: "Prossimo anno futuro (++1y)",
    repeatDayFromDone: "1 giorno dal completamento (.+1d)",
    repeatWeekFromDone: "1 settimana dal completamento (.+1w)",
    repeatMonthFromDone: "1 mese dal completamento (.+1m)",
    repeatYearFromDone: "1 anno dal completamento (.+1y)",

    addTagOption: "Aggiungi \"{tag}\"",

    onSchedule: "In programma",
    skipThisOccurrence: "Salta questa ricorrenza",
    stopRepeatingAfter: "Smetti di ripetere dopo questa ricorrenza",
    moveToDateTime: "Sposta a data/ora",
    clearOverride: "Cancella sostituzione",
    noteForOccurrence: "Nota per questa ricorrenza",
    summonScheduled: "+ Pianificato",
    summonDeadline: "+ Scadenza",
    summonRepeat: "+ Ripeti",
    summonMove: "+ Sposta",
    summonNote: "+ Nota",

    quickTaskCapture: "Acquisizione rapida attività",
    couldNotSaveTask: "Impossibile salvare l'attività.",

    someday: "Attività",

    appTitle: "Mediant",
    loadAgenda: "Carica agenda",

    notificationStartsIn1Hour: "Inizia tra 1 ora · {time}",
  },
  de: {
    today: "Heute",
    todayAria: "Heute",
    prev7Days: "Vorherige 7 Tage",
    next7Days: "Nächste 7 Tage",
    prev30Days: "Vorherige 30 Tage",
    next30Days: "Nächste 30 Tage",
    addLabel: "+Hinzufügen",
    addAria: "Element hinzufügen",
    settings: "Einstellungen",
    viewOnGitHub: "Auf GitHub ansehen",

    toggleNotifications: "Benachrichtigungen umschalten",
    enableNotifications: "Benachrichtigungen aktivieren",
    disableNotifications: "Benachrichtigungen deaktivieren",
    hideEmptyDays: "Leere Tage ausblenden",
    showEmptyDays: "Leere Tage anzeigen",
    hideTags: "Tags ausblenden",
    showTags: "Tags anzeigen",
    hideCompletedAndSkipped: "Erledigte und übersprungene ausblenden",
    showCompletedAndSkipped: "Erledigte und übersprungene anzeigen",
    hideDeadlines: "Bevorstehende Fristen ausblenden",
    showDeadlines: "Bevorstehende Fristen anzeigen",
    showFewerDays: "Weniger Tage anzeigen",
    showMoreDays: "Mehr Tage anzeigen",
    language: "Sprache",
    languageEnglish: "English",
    languageNorwegian: "Norsk",
    languageItalian: "Italiano",
    languageGerman: "Deutsch",
    switchToEnglish: "Zu English wechseln",
    switchToNorwegian: "Zu Norsk wechseln",
    switchToItalian: "Zu Italiano wechseln",
    switchToGerman: "Zu Deutsch wechseln",

    filtering: "Filter:",
    clear: "Löschen",
    filterByTag: "Nach Tag filtern {tag}",
    removeTagFilter: "Tag-Filter entfernen {tag}",
    filterByPriority: "Nach Priorität filtern {priority}",
    removePriorityFilter: "Prioritätsfilter entfernen {priority}",

    addEventOn: "Ereignis hinzufügen am {date}",
    overdue: "Überfällig",
    deadline: "FRIST",
    overdueScheduled: "GEPLANT",
    nowMarker: "◄ jetzt",
    allDay: "Ganztägig",
    markDone: "Als erledigt markieren",
    markNotDone: "Als nicht erledigt markieren",
    skippedDetail: "Übersprungen ({detail})",
    movedEarlier: "← Verschoben",
    movedLater: "→ Verschoben",
    close: "Schließen",
    addItem: "Element hinzufügen",
    editTask: "Aufgabe bearbeiten",
    editEvent: "Ereignis bearbeiten",
    save: "Speichern",
    delete: "Löschen",
    tapAgainToDelete: "Erneut tippen zum Löschen",

    type: "Typ",
    sectionOccurrence: "Wiederholungsoptionen",
    sectionTaskDetails: "Aufgabe",
    sectionEventDetails: "Ereignis",
    sectionDates: "Daten",
    sectionMetadata: "Metadaten",
    sectionChecklist: "Checkliste",
    typeEvent: "Ereignis",
    typeTodo: "Aufgabe",
    priority: "Priorität",
    priorityNone: "Keine",
    increasePriority: "Priorität erhöhen",
    decreasePriority: "Priorität verringern",
    title: "Was",
    when: "Wann",
    scheduled: "Geplant",
    deadlineField: "Frist",
    repeat: "Wiederholen",
    scheduledRepeat: "Geplante Wiederholung",
    deadlineRepeat: "Frist-Wiederholung",
    tags: "Tags",
    checklist: "Checkliste",
    addSubtask: "+ Unteraufgabe hinzufügen",

    repeatNone: "Keine",
    repeatEveryDay: "Jeden Tag (+1d)",
    repeatEveryWeek: "Jede Woche (+1w)",
    repeatEvery2Weeks: "Alle 2 Wochen (+2w)",
    repeatEveryMonth: "Jeden Monat (+1m)",
    repeatEveryYear: "Jedes Jahr (+1y)",
    repeatNextFutureDay: "Nächster zukünftiger Tag (++1d)",
    repeatNextFutureWeek: "Nächste zukünftige Woche (++1w)",
    repeatNextFutureMonth: "Nächster zukünftiger Monat (++1m)",
    repeatNextFutureYear: "Nächstes zukünftiges Jahr (++1y)",
    repeatDayFromDone: "1 Tag nach Erledigung (.+1d)",
    repeatWeekFromDone: "1 Woche nach Erledigung (.+1w)",
    repeatMonthFromDone: "1 Monat nach Erledigung (.+1m)",
    repeatYearFromDone: "1 Jahr nach Erledigung (.+1y)",

    addTagOption: "\"{tag}\" hinzufügen",

    onSchedule: "Im Plan",
    skipThisOccurrence: "Diese Wiederholung überspringen",
    stopRepeatingAfter: "Nach dieser Wiederholung aufhören",
    moveToDateTime: "Zu Datum/Uhrzeit verschieben",
    clearOverride: "Überschreibung löschen",
    noteForOccurrence: "Notiz für diese Wiederholung",
    summonScheduled: "+ Geplant",
    summonDeadline: "+ Frist",
    summonRepeat: "+ Wiederholen",
    summonMove: "+ Verschieben",
    summonNote: "+ Notiz",

    quickTaskCapture: "Schnelle Aufgabenerfassung",
    couldNotSaveTask: "Aufgabe konnte nicht gespeichert werden.",

    someday: "Aufgaben",

    appTitle: "Mediant",
    loadAgenda: "Agenda laden",

    notificationStartsIn1Hour: "Beginnt in 1 Stunde · {time}",
  },
} as const;

export type MessageKey = keyof typeof messages.en;

function detectInitialLocale(): Locale {
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) return stored as Locale;
    }
  } catch {
    // localStorage may throw in some sandboxed contexts
  }
  if (typeof navigator !== "undefined") {
    const lang = (navigator.language ?? "").toLowerCase();
    if (lang.startsWith("nb") || lang.startsWith("nn") || lang.startsWith("no")) return "nb";
    if (lang.startsWith("it")) return "it";
    if (lang.startsWith("de")) return "de";
  }
  return "en";
}

let currentLocale: Locale = detectInitialLocale();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.setItem === "function") {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
  } catch {
    // localStorage may throw in some sandboxed contexts
  }
}

export function t(key: MessageKey, params?: Readonly<Record<string, string | number>>): string {
  const dict = messages[currentLocale] ?? messages.en;
  let str: string = dict[key] ?? messages.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}
