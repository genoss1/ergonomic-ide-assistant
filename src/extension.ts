import * as vscode from "vscode";
import { createOutput } from "./utils/output";
import { createStatsModule } from "./stats/statsModule";
import { createBreakModule } from "./breaks/breakManager";
import { createErgoPanel } from "./ui/ergoPanel";

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage("Ergonomic IDE Assistant: aktywowany");
  const output = createOutput("Ergonomic IDE Assistant");
  output.show(true);

  const stats = createStatsModule(context, output);
  createBreakModule(context, output, stats);
  createErgoPanel(context, output, stats);

  output.appendLine("[ergonomicIde] ready");
}

export function deactivate() {}
