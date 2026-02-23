import * as vscode from "vscode";
import { loadConfig, ErgoConfig } from "../config";
import { registerBreak } from "../storage/breaksStorage";
import { StatsModule } from "../stats/statsModule";

export function createBreakModule(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  stats: StatsModule
) {
  let cfg: ErgoConfig = loadConfig();

  let lastBreakTime = Date.now();
  let lastBreakSuggestionTime = Date.now();
  let lastMicroSuggestionTime = Date.now();
  let focusUntil: number | null = null;

  const CHECK_INTERVAL_MS = 60 * 1000;
  const INACTIVITY_THRESHOLD_MS = 3 * 60 * 1000;
  const FOCUS_MODE_MS = 60 * 60 * 1000;

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = "ergonomicIde.markBreak";
  statusBar.show();

  function updateStatusBar() {
    const now = Date.now();
    const minutesSinceBreak = Math.floor((now - lastBreakTime) / (60 * 1000));
    statusBar.text = `$(clock) Ergo: ${minutesSinceBreak} min od przerwy`;

    if (focusUntil && now < focusUntil) {
      const remainingMin = Math.ceil((focusUntil - now) / (60 * 1000));
      statusBar.tooltip = `Tryb fokus aktywny (jeszcze ok. ${remainingMin} min). Kliknij, aby oznaczyć przerwę.`;
    } else {
      statusBar.tooltip = "Kliknij, aby ręcznie oznaczyć przerwę.";
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("ergonomicIde")) {
        cfg = loadConfig();
      }
    })
  );

  const markBreakCommand = vscode.commands.registerCommand("ergonomicIde.markBreak", async () => {
    await registerBreak(context);
    lastBreakTime = Date.now();
    stats.store.breaksToday += 1;
    stats.provider.postUpdate();
    updateStatusBar();
    vscode.window.showInformationMessage("Przerwa została oznaczona. Dobra robota! 🙂");
  });

  const interval = setInterval(async () => {
    const now = Date.now();
    const sinceLastActivity = now - stats.lastActivityTime.value;

    stats.store.tickActive(INACTIVITY_THRESHOLD_MS, stats.lastActivityTime.value);
    stats.provider.postUpdate();

    updateStatusBar();

    if (focusUntil && now < focusUntil) return;

    if (sinceLastActivity < INACTIVITY_THRESHOLD_MS) {
      const WORK_INTERVAL_MS = cfg.workIntervalMinutes * 60 * 1000;
      const MICRO_INTERVAL_MS = cfg.microBreakIntervalMinutes * 60 * 1000;

      if (cfg.microBreakIntervalMinutes > 0 && (now - lastMicroSuggestionTime) > MICRO_INTERVAL_MS) {
        lastMicroSuggestionTime = now;
        vscode.window.showInformationMessage(
          "Ergonomia – mikroprzerwa: oderwij wzrok od monitora i porusz nadgarstkami.",
          "OK",
          "Otwórz panel ergonomii"
        ).then(sel => {
          if (sel === "Otwórz panel ergonomii") {
            vscode.commands.executeCommand("ergonomicIde.openErgoPanel");
          }
        });
      }

      const sinceLastSuggestion = now - lastBreakSuggestionTime;
      if (sinceLastSuggestion > WORK_INTERVAL_MS) {
        lastBreakSuggestionTime = now;
        vscode.window.showInformationMessage(
          "Ergonomia: pracujesz już dłuższy czas. Zrób pełną przerwę.",
          "Pokaż ćwiczenie",
          "Tryb fokus (1h)",
          "Ignoruj"
        ).then(async selection => {
          if (selection === "Pokaż ćwiczenie") {
            await registerBreak(context);
            lastBreakTime = Date.now();
            stats.store.breaksToday += 1;
            stats.provider.postUpdate();
            updateStatusBar();
            vscode.commands.executeCommand("ergonomicIde.openErgoPanel");
          } else if (selection === "Tryb fokus (1h)") {
            focusUntil = Date.now() + FOCUS_MODE_MS;
            vscode.window.showInformationMessage("Tryb fokus włączony na 1 godzinę.");
            updateStatusBar();
          }
        });
      }
    }
  }, CHECK_INTERVAL_MS);

  updateStatusBar();

  context.subscriptions.push(
    statusBar,
    markBreakCommand,
    new vscode.Disposable(() => clearInterval(interval))
  );

  output.appendLine("[ergonomicIde] Break module ready");
}
