import * as vscode from "vscode";

const GLOBAL_BREAKS_KEY = "ergonomicIde.breaksByDay";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getTodayBreaks(context: vscode.ExtensionContext): number {
  const stats = context.globalState.get<Record<string, number>>(GLOBAL_BREAKS_KEY, {});
  return stats[todayKey()] ?? 0;
}

export async function registerBreak(context: vscode.ExtensionContext): Promise<number> {
  const stats = context.globalState.get<Record<string, number>>(GLOBAL_BREAKS_KEY, {});
  const key = todayKey();
  stats[key] = (stats[key] ?? 0) + 1;
  await context.globalState.update(GLOBAL_BREAKS_KEY, stats);
  return stats[key];
}
