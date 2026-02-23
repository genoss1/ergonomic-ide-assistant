import * as vscode from "vscode";

const GLOBAL_BREAKS_KEY = "ergonomicIde.breaksByDay";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
/**
 * Zwraca liczbę przerw wykonanych w bieżącym dniu.
 *
 * Dane są przechowywane w `context.globalState` w podziale na dni (YYYY-MM-DD).
 *
 * @param context Kontekst rozszerzenia.
 * @returns Liczba przerw zarejestrowanych dzisiaj.
 */
export function getTodayBreaks(context: vscode.ExtensionContext): number {
  const stats = context.globalState.get<Record<string, number>>(GLOBAL_BREAKS_KEY, {});
  return stats[todayKey()] ?? 0;
}
/**
 * Zwiększa licznik przerw dla bieżącego dnia i zapisuje wynik w `globalState`.
 *
 * @param context Kontekst rozszerzenia.
 * @returns Aktualna liczba przerw po inkrementacji.
 */
export async function registerBreak(context: vscode.ExtensionContext): Promise<number> {
  const stats = context.globalState.get<Record<string, number>>(GLOBAL_BREAKS_KEY, {});
  const key = todayKey();
  stats[key] = (stats[key] ?? 0) + 1;
  await context.globalState.update(GLOBAL_BREAKS_KEY, stats);
  return stats[key];
}
