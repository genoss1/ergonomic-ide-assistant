import * as vscode from "vscode";
import { StatsStore } from "./statsStore";

export class StatsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "ergonomicIde.statsView";

  private view?: vscode.WebviewView;
  private refreshTimer?: NodeJS.Timeout;

  constructor(private readonly store: StatsStore) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    this.refreshTimer = setInterval(() => this.postUpdate(), 1000);

    webviewView.onDidDispose(() => {
      if (this.refreshTimer) clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
      this.view = undefined;
    });

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg?.command === "ready") this.postUpdate();
      if (msg?.command === "resetStats") {
        this.store.resetDay();
        this.postUpdate();
      }
    });

    this.postUpdate();
  }

  public postUpdate() {
    if (!this.view) return;
    this.view.webview.postMessage({ command: "stats", data: this.store.snapshot() });
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

  vscode.postMessage({ command: "ready" });

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.command === "stats") {
      const s = msg.data;
      el("active").textContent = s.activeMinutesToday;
      el("wpm").textContent = s.wpmApprox;
      el("lines").textContent = s.linesAdded + " / " + s.linesDeleted;
      el("chars").textContent = s.charsAdded + " / " + s.charsDeleted;
      el("keys").textContent = s.keystrokesApprox;
      el("clicks").textContent = s.editorClicks;
      el("switches").textContent = s.fileSwitches;
      el("saves").textContent = s.saves;
      el("breaks").textContent = s.breaksToday;
    }
  });

  document.getElementById("reset").addEventListener("click", () => {
    vscode.postMessage({ command: "resetStats" });
  });
</script>
</body>
</html>`;
  }
}
