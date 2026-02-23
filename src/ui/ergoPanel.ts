import * as vscode from "vscode";
import { loadConfig } from "../config";
import { CameraManager } from "../camera/cameraManager";
import { getTodayBreaks } from "../storage/breaksStorage";
import { StatsModule } from "../stats/statsModule";

export function createErgoPanel(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  stats: StatsModule
) {
  const camera = new CameraManager();

  const cmd = vscode.commands.registerCommand("ergonomicIde.openErgoPanel", () => {
    const cfg = loadConfig();

    const panel = vscode.window.createWebviewPanel(
      "ergonomicIdeErgoPanel",
      "Ergonomia – Asystent zdrowia",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    let autoTimer: NodeJS.Timeout | undefined;
    if (cfg.enableCamera && cfg.continuousCameraMonitoring) {
      autoTimer = setInterval(async () => {
        try {
          const base64 = await camera.capture("ergonomic-auto");
          panel.webview.postMessage({ command: "autoImage", data: base64 });
        } catch {
          // brak spamu błędami
        }
      }, 30_000);
    }

    panel.onDidDispose(() => {
      if (autoTimer) clearInterval(autoTimer);
    });

    panel.webview.onDidReceiveMessage(async (message: any) => {
      if (message.command === "capture") {
        if (!cfg.enableCamera) {
          panel.webview.postMessage({ command: "error", text: "Moduł kamery jest wyłączony w ustawieniach." });
          return;
        }
        try {
          const base64 = await camera.capture("ergonomic-shot");
          panel.webview.postMessage({ command: "image", data: base64 });
        } catch (e: any) {
          panel.webview.postMessage({ command: "error", text: e?.message ?? String(e) });
        }
      }

      if (message.command === "initRequest") {
        panel.webview.postMessage({
          command: "init",
          todayBreaks: getTodayBreaks(context),
          dailyGoal: cfg.dailyBreakGoal,
          enableCamera: cfg.enableCamera,
        });
      }
    });

    panel.webview.html = getWebviewHtml(panel.webview, cfg.enableCamera);
  });

  context.subscriptions.push(cmd);
  output.appendLine("[ergonomicIde] Ergo panel ready");
}

function getWebviewHtml(webview: vscode.Webview, enableCamera: boolean): string {
  const cspSource = webview.cspSource;
  const enableCameraLiteral = enableCamera ? "true" : "false";

  return /* html */ `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${cspSource} https: data:;
                 script-src 'unsafe-inline' 'unsafe-eval' ${cspSource};
                 style-src 'unsafe-inline' ${cspSource};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ergonomia – Asystent zdrowia</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    h1 { font-size: 1.4rem; margin-bottom: 0.4rem; }
    h2 { font-size: 1.1rem; margin-top: 1.2rem; }
    .section { border: 1px solid var(--vscode-editorGroup-border); border-radius: 6px; padding: 10px; margin-bottom: 12px; }
    #imageContainer { display: flex; flex-direction: column; align-items: center; }
    img { max-width: 100%; border-radius: 8px; border: 1px solid var(--vscode-editorGroup-border); background: black; }
    button { margin-top: 8px; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--vscode-button-border, transparent);
             background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; }
    .status { font-size: 0.9rem; margin-top: 4px; padding: 4px 6px; border-radius: 4px; }
    #exerciseText { margin-top: 8px; padding: 8px; border-radius: 6px; border: 1px dashed var(--vscode-editorGroup-border); font-size: 0.95rem; }
  </style>
</head>
<body>
  <h1>Ergonomiczny asystent pracy</h1>

  <div class="section">
    <h2>1. Podgląd z kamery</h2>
    <div id="imageContainer">
      <img id="cameraImage" alt="Podgląd z kamery" />
      <button id="captureBtn">Zrób zdjęcie z kamery</button>
      <div id="cameraStatus" class="status">Nie wykonano jeszcze żadnego zdjęcia.</div>
    </div>
  </div>

  <div class="section">
    <h2>2. Losowe ćwiczenie ergonomiczne</h2>
    <button id="randomExerciseBtn">Pokaż losowe ćwiczenie</button>
    <div id="exerciseText">Kliknij przycisk powyżej, aby zobaczyć propozycję ćwiczenia.</div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const ENABLE_CAMERA = ${enableCameraLiteral};

  const img = document.getElementById('cameraImage');
  const captureBtn = document.getElementById('captureBtn');
  const cameraStatus = document.getElementById('cameraStatus');

  if (!ENABLE_CAMERA) {
    cameraStatus.textContent = 'Moduł kamery jest wyłączony w ustawieniach rozszerzenia.';
    captureBtn.disabled = true;
  } else {
    captureBtn.addEventListener('click', () => {
      cameraStatus.textContent = 'Robienie zdjęcia...';
      vscode.postMessage({ command: 'capture' });
    });
  }

  const randomExerciseBtn = document.getElementById('randomExerciseBtn');
  const exerciseText = document.getElementById('exerciseText');

  const EXERCISES = [
    'Oczy: oderwij wzrok od monitora i przez 20 sekund patrz w dal, następnie 10 razy zamrugaj.',
    'Kark: przechyl głowę w prawo na 10 sekund, wróć do środka i powtórz na lewą stronę.',
    'Nadgarstki: wykonaj 10 powolnych krążeń w obie strony.',
    'Plecy: wyprostuj się i zrób 3 spokojne „wyciągnięcia” w górę.',
    'Oddech: 5 spokojnych oddechów – wdech 4s, wydech 6s.'
  ];

  function showRandomExercise() {
    const idx = Math.floor(Math.random() * EXERCISES.length);
    exerciseText.textContent = EXERCISES[idx];
  }
  randomExerciseBtn.addEventListener('click', showRandomExercise);
  showRandomExercise();

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.command === 'image') {
      let src = msg.data;
      if (!src.startsWith('data:image')) src = 'data:image/jpeg;base64,' + src.trim();
      img.src = src;
      cameraStatus.textContent = 'Zdjęcie wykonane.';
    } else if (msg.command === 'error') {
      cameraStatus.textContent = msg.text || 'Błąd kamery.';
    }
  });

  vscode.postMessage({ command: 'initRequest' });
</script>
</body>
</html>
`;
}
