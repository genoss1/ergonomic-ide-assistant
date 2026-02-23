import * as vscode from "vscode";
/**
 * Snapshot statystyk prezentowanych w panelu bocznym.
 */
export type StatsSnapshot = {
  activeMinutesToday: number;
  linesAdded: number;
  linesDeleted: number;
  charsAdded: number;
  charsDeleted: number;
  keystrokesApprox: number;
  editorClicks: number;
  fileSwitches: number;
  saves: number;
  wpmApprox: number;
  breaksToday: number;
};

/**
 * Magazyn i przelicznik statystyk pracy użytkownika.
 *
 * Statystyki są liczone przyrostowo na podstawie zdarzeń z VS Code.
 * Zawiera normalizację CRLF → LF (żeby Enter nie liczył się jako 2 znaki na Windows).
 */
export class StatsStore {
  private dayKey = this.todayKey();

  activeMs = 0;
  lastTick = Date.now();

  linesAdded = 0;
  linesDeleted = 0;
  charsAdded = 0;
  charsDeleted = 0;

  keystrokesApprox = 0;
  editorClicks = 0;
  fileSwitches = 0;
  saves = 0;

  breaksToday = 0;

  ensureDay() {
    const k = this.todayKey();
    if (k !== this.dayKey) {
      this.dayKey = k;
      this.resetDay();
    }
  }

  resetDay() {
    this.activeMs = 0;
    this.linesAdded = 0;
    this.linesDeleted = 0;
    this.charsAdded = 0;
    this.charsDeleted = 0;
    this.keystrokesApprox = 0;
    this.editorClicks = 0;
    this.fileSwitches = 0;
    this.saves = 0;
    this.breaksToday = 0;
  }
  /**
   * Aktualizuje licznik aktywnego czasu pracy (bez długiej bezczynności).
   *
   * @param inactivityThresholdMs Próg bezczynności (ms).
   * @param lastActivityTime Timestamp ostatniej aktywności użytkownika.
   */
  tickActive(inactivityThresholdMs: number, lastActivityTime: number) {
    this.ensureDay();
    const now = Date.now();
    const dt = now - this.lastTick;
    this.lastTick = now;

    if (now - lastActivityTime <= inactivityThresholdMs) {
      this.activeMs += dt;
    }
  }

  /**
   * Aktualizuje liczniki na podstawie zdarzenia zmiany dokumentu (linie/znaki/klawisze approx).
   *
   * @param e Zdarzenie zmiany dokumentu (VS Code).
   */
  applyTextChange(e: vscode.TextDocumentChangeEvent) {
    this.ensureDay();

    for (const c of e.contentChanges) {
      const added = c.text ?? "";
      const removed = e.document.getText(c.range) ?? "";

      const addedNormalized = added.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const removedNormalized = removed.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      this.charsAdded += addedNormalized.length;
      this.charsDeleted += removedNormalized.length;

      this.keystrokesApprox += addedNormalized.length;

      const addedLines = added.length ? (added.split(/\r\n|\r|\n/).length - 1) : 0;
      const removedLines = removed.length ? (removed.split(/\r\n|\r|\n/).length - 1) : 0;

      this.linesAdded += Math.max(0, addedLines);
      this.linesDeleted += Math.max(0, removedLines);
    }
  }
  /**
   * Generuje aktualny snapshot statystyk do UI.
   * @returns Obiekt `StatsSnapshot`.
   */
  snapshot(): StatsSnapshot {
    const activeMinutes = Math.floor(this.activeMs / 60000);
    const minutes = Math.max(1, activeMinutes);
    const wordsApprox = this.charsAdded / 5;
    const wpm = Math.round(wordsApprox / minutes);

    return {
      activeMinutesToday: activeMinutes,
      linesAdded: this.linesAdded,
      linesDeleted: this.linesDeleted,
      charsAdded: this.charsAdded,
      charsDeleted: this.charsDeleted,
      keystrokesApprox: this.keystrokesApprox,
      editorClicks: this.editorClicks,
      fileSwitches: this.fileSwitches,
      saves: this.saves,
      wpmApprox: wpm,
      breaksToday: this.breaksToday,
    };
  }
  
  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
