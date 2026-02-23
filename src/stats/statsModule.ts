import * as vscode from "vscode";
import { StatsStore } from "./statsStore";
import { StatsViewProvider } from "./statsView";
import { registerStatsTracking, ActivityRef } from "./statsTracker";

export type StatsModule = {
  store: StatsStore;
  provider: StatsViewProvider;
  lastActivityTime: ActivityRef;
};
/**
 * Inicjalizuje moduł statystyk:
 * - rejestruje WebViewViewProvider,
 * - podpina eventy śledzące aktywność,
 * - rejestruje komendy debugowe.
 *
 * @param context Kontekst rozszerzenia.
 * @param output Kanał logów.
 * @returns Obiekt modułu statystyk.
 */
export function createStatsModule(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel
): StatsModule {
  const store = new StatsStore();
  const provider = new StatsViewProvider(store);
  const lastActivityTime: ActivityRef = { value: Date.now() };

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("ergonomicIde.statsView", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ergonomicIde.debugStats", () => {
      const snap = store.snapshot();
      output.appendLine("[ergonomicIde] snapshot: " + JSON.stringify(snap));
      vscode.window.showInformationMessage(JSON.stringify(snap));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ergonomicIde.openStatsView", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.ergonomicIde");
      output.show(true);
    })
  );

  registerStatsTracking(context, store, provider, lastActivityTime);
  output.appendLine("[ergonomicIde] Stats module ready");
  return { store, provider, lastActivityTime };
}
