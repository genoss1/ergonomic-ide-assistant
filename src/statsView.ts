import * as vscode from "vscode";

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

  tickActive(inactivityThresholdMs: number, lastActivityTime: number) {
    this.ensureDay();
    const now = Date.now();
    const dt = now - this.lastTick;
    this.lastTick = now;

    if (now - lastActivityTime <= inactivityThresholdMs) {
      this.activeMs += dt;
    }
  }

  applyTextChange(e: vscode.TextDocumentChangeEvent) {
    this.ensureDay();

    for (const c of e.contentChanges) {
      const added = c.text ?? "";
      const removed = e.document.getText(c.range) ?? "";
      this.charsDeleted += removed.length;

      const addedNormalized = added.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const removedNormalized = removed
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

      this.charsAdded += addedNormalized.length;
      this.charsDeleted += removedNormalized.length;

      // keystrokes approx – licz na bazie znormalizowanych znaków
      this.keystrokesApprox += addedNormalized.length;

      const addedLines = added.length
        ? added.split(/\r\n|\r|\n/).length - 1
        : 0;
      const removedLines = removed.length
        ? removed.split(/\r\n|\r|\n/).length - 1
        : 0;

      this.linesAdded += Math.max(0, addedLines);
      this.linesDeleted += Math.max(0, removedLines);
    }
  }

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

export class StatsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "ergonomicIde.statsView";

  private view?: vscode.WebviewView;
  private refreshTimer?: NodeJS.Timeout;

  constructor(private readonly store: StatsStore) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    console.log("[ergonomicIde] resolveWebviewView called");
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    // >>> najpewniejsze: odświeżanie cykliczne, bo czasem pierwsze postMessage "ucieka"
    this.refreshTimer = setInterval(() => this.postUpdate(), 1000);

    webviewView.onDidDispose(() => {
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
      this.view = undefined;
    });

    // webview powie "ready", wtedy też wyślemy dane
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg?.command === "ready") {
        this.postUpdate();
      }
      if (msg?.command === "resetStats") {
        this.store.resetDay();
        this.postUpdate();
      }
    });

    // od razu spróbuj wysłać
    this.postUpdate();
  }

  public postUpdate() {
    if (!this.view) return;
    this.view.webview.postMessage({
      command: "stats",
      data: this.store.snapshot(),
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const csp = webview.cspSource;

    return /*html*/ `
<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${csp}; script-src 'unsafe-inline' ${csp};" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  body { font-family: system-ui, sans-serif; padding: 10px; color: var(--vscode-foreground); }
  .kpi { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .card { border: 1px solid var(--vscode-editorGroup-border); border-radius: 8px; padding: 8px; }
  .label { font-size: 12px; opacity: 0.8; }
  .value { font-size: 18px; font-weight: 600; margin-top: 2px; }
  button { margin-top: 10px; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--vscode-button-border, transparent);
           background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; }
</style>
</head>
<body>
  <div class="kpi">
    <div class="card"><div class="label">Aktywne minuty dziś</div><div class="value" id="active">0</div></div>
    <div class="card"><div class="label">WPM (approx)</div><div class="value" id="wpm">0</div></div>

    <div class="card"><div class="label">Linie + / -</div><div class="value" id="lines">0 / 0</div></div>
    <div class="card"><div class="label">Znaki + / -</div><div class="value" id="chars">0 / 0</div></div>

    <div class="card"><div class="label">Klawisze (approx)</div><div class="value" id="keys">0</div></div>
    <div class="card"><div class="label">Kliknięcia (proxy)</div><div class="value" id="clicks">0</div></div>

    <div class="card"><div class="label">Przełączenia plików</div><div class="value" id="switches">0</div></div>
    <div class="card"><div class="label">Zapisy</div><div class="value" id="saves">0</div></div>

    <div class="card" style="grid-column: 1 / span 2;">
      <div class="label">Przerwy dziś</div>
      <div class="value" id="breaks">0</div>
    </div>
  </div>

  <button id="reset">Resetuj statystyki (dziś)</button>

<script>
  const vscode = acquireVsCodeApi();
  const el = (id) => document.getElementById(id);

  // sygnał, że webview jest gotowe
  vscode.postMessage({ command: 'ready' });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.command === 'stats') {
      const s = msg.data;

      el('active').textContent = s.activeMinutesToday;
      el('wpm').textContent = s.wpmApprox;

      el('lines').textContent = s.linesAdded + ' / ' + s.linesDeleted;
      el('chars').textContent = s.charsAdded + ' / ' + s.charsDeleted;

      el('keys').textContent = s.keystrokesApprox;
      el('clicks').textContent = s.editorClicks;

      el('switches').textContent = s.fileSwitches;
      el('saves').textContent = s.saves;

      el('breaks').textContent = s.breaksToday;
    }
  });

  document.getElementById('reset').addEventListener('click', () => {
    vscode.postMessage({ command: 'resetStats' });
  });
</script>
</body>
</html>`;
  }
}
