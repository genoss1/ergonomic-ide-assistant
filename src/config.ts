import * as vscode from "vscode";

export type ErgoConfig = {
  workIntervalMinutes: number;
  microBreakIntervalMinutes: number;
  dailyBreakGoal: number;
  enableCamera: boolean;
  continuousCameraMonitoring: boolean;
};

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
