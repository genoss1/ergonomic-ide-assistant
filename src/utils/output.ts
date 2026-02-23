import * as vscode from "vscode";

export function createOutput(name: string): vscode.OutputChannel {
  const ch = vscode.window.createOutputChannel(name);
  ch.appendLine(`[${name}] output channel created`);
  return ch;
}
