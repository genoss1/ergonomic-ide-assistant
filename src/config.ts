import * as vscode from "vscode";
/**
 * Konfiguracja użytkownika wczytywana z ustawień VS Code (`ergonomicIde.*`).
 */
export type ErgoConfig = {
  workIntervalMinutes: number;
  microBreakIntervalMinutes: number;
  dailyBreakGoal: number;
  enableCamera: boolean;
  continuousCameraMonitoring: boolean;
};
/**
 * Wczytuje bieżącą konfigurację rozszerzenia z ustawień VS Code.
 * @returns Obiekt konfiguracji `ErgoConfig`.
 */
export function loadConfig(): ErgoConfig {
  const c = vscode.workspace.getConfiguration("ergonomicIde");
  return {
    workIntervalMinutes: c.get<number>("workIntervalMinutes", 25),
    microBreakIntervalMinutes: c.get<number>("microBreakIntervalMinutes", 10),
    dailyBreakGoal: c.get<number>("dailyBreakGoal", 5),
    enableCamera: c.get<boolean>("enableCamera", true),
    continuousCameraMonitoring: c.get<boolean>("continuousCameraMonitoring", false),
  };
}
/**
 * Subskrybuje zmiany ustawień rozszerzenia i wywołuje callback z nową konfiguracją.
 *
 * @param context Kontekst rozszerzenia (do rejestracji subskrypcji).
 * @param onChange Funkcja wywoływana po zmianie ustawień.
 */
export function watchConfig(
  context: vscode.ExtensionContext,
  onChange: (cfg: ErgoConfig) => void
) {
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("ergonomicIde")) {
        onChange(loadConfig());
      }
    })
  );
}
