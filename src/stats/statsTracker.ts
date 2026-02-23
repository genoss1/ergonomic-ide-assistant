import * as vscode from "vscode";
import { StatsStore } from "./statsStore";
import { StatsViewProvider } from "./statsView";

export type ActivityRef = { value: number };
/**
 * Rejestruje nasłuchy zdarzeń VS Code, które zasilają statystyki.
 *
 * W tym miejscu wykonywane są także zabezpieczenia przed podwójnym naliczaniem
 * (np. debounce dla selekcji i przełączeń edytora).
 *
 * @param context Kontekst rozszerzenia (subskrypcje).
 * @param store Magazyn statystyk.
 * @param view Provider widoku statystyk (do odświeżania UI).
 * @param lastActivityTime Referencja do czasu ostatniej aktywności.
 */
export function registerStatsTracking(
  context: vscode.ExtensionContext,
  store: StatsStore,
  view: StatsViewProvider,
  lastActivityTime: ActivityRef
) {
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      lastActivityTime.value = Date.now();
      store.applyTextChange(e);
      view.postUpdate();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      store.saves += 1;
      view.postUpdate();
    })
  );

  let lastEditorUri: string | undefined;
  let lastEditorSwitchTick = 0;

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const now = Date.now();
      if (now - lastEditorSwitchTick < 150) return;
      lastEditorSwitchTick = now;

      const uri = editor?.document?.uri?.toString();
      if (!uri) return;
      if (uri === lastEditorUri) return;

      lastEditorUri = uri;
      store.fileSwitches += 1;
      view.postUpdate();
    })
  );

  let lastSelectionTick = 0;
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(() => {
      const now = Date.now();
      if (now - lastSelectionTick < 120) return;
      lastSelectionTick = now;

      store.editorClicks += 1;
      view.postUpdate();
    })
  );
}
