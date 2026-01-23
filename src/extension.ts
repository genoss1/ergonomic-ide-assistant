import * as vscode from "vscode";
import { StatsStore, StatsViewProvider } from "./statsView";

// node-webcam nie ma typów TS, więc any
const NodeWebcam: any = require("node-webcam");

const GLOBAL_STATS_KEY = "ergonomicIde.breaksByDay";

export function activate(context: vscode.ExtensionContext) {
  // (opcjonalnie) szybki sygnał, że extension host wstał
  vscode.window.showInformationMessage("Ergonomic IDE Assistant: aktywowany");

  const output = vscode.window.createOutputChannel("Ergonomic IDE Assistant");
  output.appendLine("[ergonomicIde] activate()");
  output.show(true);

  // ---- KONFIGURACJA Z USTAWIEŃ ----
  const config = vscode.workspace.getConfiguration("ergonomicIde");
  let workIntervalMinutes = config.get<number>("workIntervalMinutes", 25);
  let microBreakIntervalMinutes = config.get<number>(
    "microBreakIntervalMinutes",
    10
  );
  let dailyBreakGoal = config.get<number>("dailyBreakGoal", 5);
  let enableCamera = config.get<boolean>("enableCamera", true);
  let continuousCameraMonitoring = config.get<boolean>(
    "continuousCameraMonitoring",
    false
  );

  const CHECK_INTERVAL_MS = 60 * 1000; // sprawdzanie co minutę
  const INACTIVITY_THRESHOLD_MS = 3 * 60 * 1000; // jeśli brak aktywności > 3 min, nie przypominamy
  const FOCUS_MODE_MS = 60 * 60 * 1000; // tryb focus na 1h

  // ---- STATYSTYKI + WIDOK W BOCZNYM PANELU (Activity Bar) ----
  const statsStore = new StatsStore();
  const statsProvider = new StatsViewProvider(statsStore);

  // Najważniejsze: rejestracja providera widoku. ID musi pasować do package.json (ergonomicIde.statsView)
  try {
    // ---- Debug: otwórz widok statystyk + pokaż output ----
    const openStatsViewCommand = vscode.commands.registerCommand(
      "ergonomicIde.openStatsView",
      async () => {
        await vscode.commands.executeCommand(
          "workbench.view.extension.ergonomicIde"
        );
        output.show(true);
      }
    );

    const debugStatsCommand = vscode.commands.registerCommand(
      "ergonomicIde.debugStats",
      () => {
        const snap = statsStore.snapshot();
        output.appendLine("[ergonomicIde] snapshot: " + JSON.stringify(snap));
        vscode.window.showInformationMessage(JSON.stringify(snap));
      }
    );

    context.subscriptions.push(openStatsViewCommand, debugStatsCommand);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        "ergonomicIde.statsView",
        statsProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
      )
    );
    output.appendLine(
      "[ergonomicIde] Stats view provider registered for ergonomicIde.statsView"
    );
  } catch (e: any) {
    output.appendLine(
      "[ergonomicIde] FAILED to register stats view: " +
        (e?.message ?? String(e))
    );
    throw e;
  }

  // ---- ZMIENNE RUNTIME ----
  let lastActivityTime = Date.now();
  let lastBreakTime = Date.now();
  let lastBreakSuggestionTime = Date.now();
  let lastMicroSuggestionTime = Date.now();
  let focusUntil: number | null = null;

  // ---- STATUS BAR: czas od ostatniej przerwy ----
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "ergonomicIde.markBreak";
  statusBarItem.tooltip = "Kliknij, aby ręcznie oznaczyć przerwę.";
  statusBarItem.show();
  updateStatusBar(statusBarItem, lastBreakTime, focusUntil);

  // ---- Reagowanie na zmianę konfiguracji ----
  const configSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("ergonomicIde")) {
      const newConfig = vscode.workspace.getConfiguration("ergonomicIde");
      workIntervalMinutes = newConfig.get<number>("workIntervalMinutes", 25);
      microBreakIntervalMinutes = newConfig.get<number>(
        "microBreakIntervalMinutes",
        10
      );
      dailyBreakGoal = newConfig.get<number>("dailyBreakGoal", 5);
      enableCamera = newConfig.get<boolean>("enableCamera", true);
      continuousCameraMonitoring = newConfig.get<boolean>(
        "continuousCameraMonitoring",
        false
      );
    }
  });

  // ---- Monitorowanie aktywności + zmiany tekstu (linie/znaki/klawisze approx) ----
  const textChangeSub = vscode.workspace.onDidChangeTextDocument((e) => {
    lastActivityTime = Date.now();
    statsStore.applyTextChange(e);
    statsProvider.postUpdate();
  });

  // ---- Zliczanie zapisów ----
  const saveSub = vscode.workspace.onDidSaveTextDocument(() => {
    statsStore.saves += 1;
    statsProvider.postUpdate();
  });

  // ---- Zliczanie przełączeń plików ----
  let lastEditorUri: string | undefined;
  let lastEditorSwitchTick = 0;

  const editorSwitchSub = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      const now = Date.now();
      if (now - lastEditorSwitchTick < 150) return; // debounce
      lastEditorSwitchTick = now;

      const uri = editor?.document?.uri?.toString();
      if (!uri) return;

      if (uri === lastEditorUri) return; // ten sam plik → nie licz
      lastEditorUri = uri;

      statsStore.fileSwitches += 1;
      statsProvider.postUpdate();
    }
  );

  // ---- „kliknięcia” jako proxy: zmiany selekcji w edytorze (mysz/klawiatura) ----
  const selectionSub = vscode.window.onDidChangeTextEditorSelection(() => {
    statsStore.editorClicks += 1;
    statsProvider.postUpdate();
  });

  // ---- Główny timer ergonomiczny ----
  const interval = setInterval(() => {
    const now = Date.now();
    const sinceLastActivity = now - lastActivityTime;

    // liczenie aktywnego czasu + odświeżenie statystyk
    statsStore.tickActive(INACTIVITY_THRESHOLD_MS, lastActivityTime);
    statsProvider.postUpdate();

    // update status bara co minutę
    updateStatusBar(statusBarItem, lastBreakTime, focusUntil);

    // tryb focus – ignorujemy przypomnienia (ale statystyki nadal liczymy)
    if (focusUntil && now < focusUntil) {
      return;
    }

    // jeśli użytkownik był aktywny niedawno
    if (sinceLastActivity < INACTIVITY_THRESHOLD_MS) {
      const WORK_INTERVAL_MS = workIntervalMinutes * 60 * 1000;
      const MICRO_INTERVAL_MS = microBreakIntervalMinutes * 60 * 1000;

      // --- MIKROPRZERWA ---
      if (
        microBreakIntervalMinutes > 0 &&
        now - lastMicroSuggestionTime > MICRO_INTERVAL_MS
      ) {
        lastMicroSuggestionTime = now;
        vscode.window
          .showInformationMessage(
            "Ergonomia – mikroprzerwa: oderwij wzrok od monitora i porusz nadgarstkami.",
            "OK",
            "Otwórz panel ergonomii"
          )
          .then((sel) => {
            if (sel === "Otwórz panel ergonomii") {
              vscode.commands.executeCommand("ergonomicIde.openErgoPanel");
            }
          });
      }

      // --- GŁÓWNA PRZERWA ---
      const sinceLastSuggestion = now - lastBreakSuggestionTime;
      if (sinceLastSuggestion > WORK_INTERVAL_MS) {
        lastBreakSuggestionTime = now;
        vscode.window
          .showInformationMessage(
            "Ergonomia: pracujesz już dłuższy czas. Zrób pełną przerwę.",
            "Pokaż ćwiczenie",
            "Tryb fokus (1h)",
            "Ignoruj"
          )
          .then((selection) => {
            if (selection === "Pokaż ćwiczenie") {
              registerBreak(context, () => {
                lastBreakTime = Date.now();
                statsStore.breaksToday += 1;
                statsProvider.postUpdate();
                updateStatusBar(statusBarItem, lastBreakTime, focusUntil);
              });
              vscode.commands.executeCommand("ergonomicIde.openErgoPanel");
            } else if (selection === "Tryb fokus (1h)") {
              focusUntil = Date.now() + FOCUS_MODE_MS;
              vscode.window.showInformationMessage(
                "Tryb fokus włączony na 1 godzinę."
              );
              updateStatusBar(statusBarItem, lastBreakTime, focusUntil);
            }
          });
      }
    }
  }, CHECK_INTERVAL_MS);

  // ---- Komenda ręczna: oznacz przerwę ----
  const markBreakCommand = vscode.commands.registerCommand(
    "ergonomicIde.markBreak",
    () => {
      registerBreak(context, () => {
        lastBreakTime = Date.now();
        statsStore.breaksToday += 1; // brakowało w Twojej wersji
        statsProvider.postUpdate();
        updateStatusBar(statusBarItem, lastBreakTime, focusUntil);
        vscode.window.showInformationMessage(
          "Przerwa została oznaczona. Dobra robota! 🙂"
        );
      });
    }
  );

  // ---- Komenda: otwarcie panelu ergonomii (kamera + ćwiczenia) ----
  const openPanelCommand = vscode.commands.registerCommand(
    "ergonomicIde.openErgoPanel",
    () => {
      const panel = vscode.window.createWebviewPanel(
        "ergonomicIdeErgoPanel",
        "Ergonomia – Asystent zdrowia",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      // konfiguracja kamery po stronie extension hosta (Node.js)
      const webcam = NodeWebcam.create({
        width: 640,
        height: 480,
        quality: 80,
        output: "jpeg",
        callbackReturn: "base64",
      });

      const CAPTURE_INTERVAL_MS = 30 * 1000; // co 30 sekund
      let cameraInterval: NodeJS.Timeout | undefined;

      // Cykliczny „podgląd” (auto zdjęcia), tylko jeśli user włączył
      if (enableCamera && continuousCameraMonitoring) {
        cameraInterval = setInterval(() => {
          webcam.capture("ergonomic-auto", (err: Error | null, data: any) => {
            if (err || !data) return;

            const payload = normalizeToBase64(data);

            panel.webview.postMessage({
              command: "autoImage",
              data: payload,
            });
          });
        }, CAPTURE_INTERVAL_MS);
      }

      panel.onDidDispose(() => {
        if (cameraInterval) clearInterval(cameraInterval);
      });

      panel.webview.onDidReceiveMessage((message: any) => {
        if (message.command === "capture") {
          if (!enableCamera) {
            panel.webview.postMessage({
              command: "error",
              text: "Moduł kamery jest wyłączony w ustawieniach rozszerzenia.",
            });
            return;
          }

          webcam.capture("ergonomic-shot", (err: Error | null, data: any) => {
            if (err) {
              vscode.window.showErrorMessage("Błąd kamery: " + err.message);
              panel.webview.postMessage({
                command: "error",
                text: "Nie udało się zrobić zdjęcia z kamery.",
              });
              return;
            }

            if (!data) {
              panel.webview.postMessage({
                command: "error",
                text: "Kamera zwróciła pusty obraz.",
              });
              return;
            }

            const payload = normalizeToBase64(data);

            panel.webview.postMessage({
              command: "image",
              data: payload,
            });
          });
        } else if (message.command === "initRequest") {
          const todayBreaks = getTodayBreaks(context);
          panel.webview.postMessage({
            command: "init",
            todayBreaks,
            dailyGoal: dailyBreakGoal,
            enableCamera,
          });
        }
      });

      panel.webview.html = getWebviewContent(
        panel.webview,
        context.extensionUri,
        enableCamera
      );
    }
  );

  context.subscriptions.push(
    configSubscription,
    textChangeSub,
    saveSub,
    editorSwitchSub,
    selectionSub,
    openPanelCommand,
    markBreakCommand,
    statusBarItem,
    new vscode.Disposable(() => clearInterval(interval))
  );
}

export function deactivate() {}

// ---- Pomocnicze: statystyki przerw ----

function getTodayKey(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getTodayBreaks(context: vscode.ExtensionContext): number {
  const stats = context.globalState.get<Record<string, number>>(
    GLOBAL_STATS_KEY,
    {}
  );
  const key = getTodayKey();
  return stats[key] ?? 0;
}

function registerBreak(
  context: vscode.ExtensionContext,
  onRegistered?: () => void
) {
  const stats = context.globalState.get<Record<string, number>>(
    GLOBAL_STATS_KEY,
    {}
  );
  const key = getTodayKey();
  const current = stats[key] ?? 0;
  stats[key] = current + 1;

  context.globalState.update(GLOBAL_STATS_KEY, stats);
  if (onRegistered) onRegistered();
}

function updateStatusBar(
  statusBar: vscode.StatusBarItem,
  lastBreakTime: number,
  focusUntil: number | null
) {
  const now = Date.now();
  const minutesSinceBreak = Math.floor((now - lastBreakTime) / (60 * 1000));
  statusBar.text = `$(clock) Ergo: ${minutesSinceBreak} min od przerwy`;

  if (focusUntil && now < focusUntil) {
    const remainingMin = Math.ceil((focusUntil - now) / (60 * 1000));
    statusBar.tooltip = `Tryb fokus aktywny (jeszcze ok. ${remainingMin} min). Kliknij, aby ręcznie oznaczyć przerwę.`;
  } else {
    statusBar.tooltip = "Kliknij, aby ręcznie oznaczyć przerwę.";
  }
}

function normalizeToBase64(data: any): string {
  if (Buffer.isBuffer(data)) {
    return data.toString("base64");
  }
  if (typeof data === "string") {
    return data;
  }
  return Buffer.from(data).toString("base64");
}

// ---- Webview HTML + JS ----

function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  enableCamera: boolean
): string {
  const cspSource = webview.cspSource;
  const enableCameraLiteral = enableCamera ? "true" : "false";

  return /* html */ `
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta
        http-equiv="Content-Security-Policy"
        content="
            default-src 'none';
            img-src ${cspSource} https: data:;
            script-src 'unsafe-inline' 'unsafe-eval' ${cspSource};
            style-src 'unsafe-inline' ${cspSource};
        "
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ergonomia – Asystent zdrowia</title>
    <style>
        body {
            font-family: system-ui, sans-serif;
            margin: 0;
            padding: 12px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 { font-size: 1.4rem; margin-bottom: 0.4rem; }
        h2 { font-size: 1.1rem; margin-top: 1.2rem; }
        .section {
            border: 1px solid var(--vscode-editorGroup-border);
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 12px;
        }
        #imageContainer {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        img {
            max-width: 100%;
            border-radius: 8px;
            border: 1px solid var(--vscode-editorGroup-border);
            background: black;
        }
        button {
            margin-top: 8px;
            padding: 6px 10px;
            border-radius: 4px;
            border: 1px solid var(--vscode-button-border, transparent);
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
        }
        button:hover { filter: brightness(1.1); }
        .hint { font-size: 0.9rem; margin-top: 6px; }
        .status {
            font-size: 0.9rem;
            margin-top: 4px;
            padding: 4px 6px;
            border-radius: 4px;
        }
        .status-ok  { background-color: rgba(0, 200, 0, 0.15); }
        .status-warn{ background-color: rgba(255, 180, 0, 0.15); }
        ul { padding-left: 1.2rem; margin: 0.3rem 0; }
        li { margin: 0.1rem 0; }
        #exerciseText {
            margin-top: 8px;
            padding: 8px;
            border-radius: 6px;
            border: 1px dashed var(--vscode-editorGroup-border);
            font-size: 0.95rem;
        }
        .category-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 6px;
        }
        .category-button.active {
            outline: 2px solid var(--vscode-button-foreground);
        }
        #stats { margin-top: 6px; font-size: 0.9rem; }
    </style>
</head>
<body>
    <h1>Ergonomiczny asystent pracy</h1>
    <p>
        Ten panel pomaga Ci kontrolować postawę podczas pracy oraz pamiętać o przerwach.
        Podgląd z kamery jest realizowany natywnie i wyświetlany jako pojedyncze zdjęcia.
    </p>

    <div class="section" id="cameraSection">
        <h2>1. Podgląd z kamery</h2>
        <div id="imageContainer">
            <img id="cameraImage" alt="Podgląd z kamery" />
            <button id="captureBtn">Zrób zdjęcie z kamery</button>
            <div id="cameraStatus" class="status status-warn">
                Nie wykonano jeszcze żadnego zdjęcia.
            </div>
            <div class="hint">
                Po zrobieniu zdjęcia skontroluj:
                <ul>
                    <li>czy siedzisz w odpowiedniej odległości od monitora (ok. 50–70 cm),</li>
                    <li>czy głowa jest wyprostowana,</li>
                    <li>czy plecy są oparte o oparcie krzesła.</li>
                </ul>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>2. Losowe ćwiczenie ergonomiczne</h2>
        <p>Wybierz kategorię ćwiczeń, a następnie wylosuj propozycję:</p>
        <div class="category-buttons">
            <button class="category-button active" data-category="all">Wszystkie</button>
            <button class="category-button" data-category="eyes">Oczy</button>
            <button class="category-button" data-category="back">Kręgosłup</button>
            <button class="category-button" data-category="wrists">Nadgarstki</button>
            <button class="category-button" data-category="relax">Relaks / oddech</button>
        </div>
        <button id="randomExerciseBtn">Pokaż losowe ćwiczenie</button>
        <div id="exerciseText">
            Kliknij przycisk powyżej, aby zobaczyć propozycję ćwiczenia.
        </div>
    </div>

    <div class="section">
        <h2>3. Statystyki dnia</h2>
        <p id="stats">
            Ładowanie statystyk...
        </p>
        <div class="hint">
            Cel dzienny jest konfigurowalny w ustawieniach rozszerzenia (domyślnie 5 przerw).
        </div>
    </div>

    <div class="section">
        <h2>4. Przypomnienie o przerwach</h2>
        <p>
            Rozszerzenie monitoruje Twoją aktywność w edytorze i po określonym w ustawieniach
            czasie ciągłej pracy przypomina o przerwie. Oddzielnie działają krótkie mikroprzerwy.
        </p>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const ENABLE_CAMERA = ${enableCameraLiteral};

        // --- kamera ---
        const img = document.getElementById('cameraImage');
        const captureBtn = document.getElementById('captureBtn');
        const cameraStatus = document.getElementById('cameraStatus');

        if (!ENABLE_CAMERA) {
            cameraStatus.textContent = 'Moduł kamery jest wyłączony w ustawieniach rozszerzenia.';
            cameraStatus.classList.remove('status-ok');
            cameraStatus.classList.add('status-warn');
            captureBtn.disabled = true;
        } else {
            captureBtn.addEventListener('click', () => {
                cameraStatus.textContent = 'Robienie zdjęcia...';
                cameraStatus.classList.remove('status-ok');
                cameraStatus.classList.add('status-warn');
                vscode.postMessage({ command: 'capture' });
            });
        }

        // --- statystyki ---
        const statsEl = document.getElementById('stats');

        // --- ćwiczenia ---
        const randomExerciseBtn = document.getElementById('randomExerciseBtn');
        const exerciseText = document.getElementById('exerciseText');
        const categoryButtons = Array.from(document.querySelectorAll('.category-button'));

        const EXERCISES = {
            eyes: [
                'Oderwij wzrok od monitora i przez 20 sekund patrz w dal, następnie 10 razy powoli zamrugaj.',
                'Patrz kolejno w górę, w dół, w lewo i w prawo, zatrzymując wzrok na 3 sekundy w każdym kierunku.',
                'Zamknij oczy na 15 sekund, pozwalając im się rozluźnić, po czym otwórz je i kilka razy zamrugaj.'
            ],
            back: [
                'Usiądź na brzegu krzesła, wyprostuj plecy i trzy razy powoli „wyciągnij się” jakbyś chciał sięgnąć sufitu.',
                'Spleć dłonie za głową i delikatnie odchyl łokcie do tyłu, otwierając klatkę piersiową. Przytrzymaj 10 sekund.',
                'Siedząc prosto, wykonaj powolne skręty tułowia w lewo i w prawo, patrząc za siebie. Powtórz po 5 razy.'
            ],
            wrists: [
                'Wyprostuj ręce przed sobą, zegnij dłonie w dół i w górę, wykonaj 10 powtórzeń w wolnym tempie.',
                'Zaciśnij dłonie w pięści, następnie szeroko je rozprostuj. Wykonaj 15 powtórzeń.',
                'Chwyć palcami jednej dłoni dłoń drugiej i delikatnie odchyl ją do tyłu, rozciągając przód nadgarstka. Przytrzymaj 10 sekund i zmień stronę.'
            ],
            relax: [
                'Zamknij oczy i weź 5 spokojnych, głębokich oddechów – wdech nosem przez 4 sekundy, wydech ustami przez 6 sekund.',
                'Przez 30 sekund skup się wyłącznie na swoim oddechu, licząc w myślach wdechy od 1 do 10, a potem od nowa.',
                'Wstań od biurka, przeciągnij się i zrób kilka spokojnych kroków, obserwując jak stawiasz stopy.'
            ]
        };

        function getAllExercises() {
            return [
                ...EXERCISES.eyes,
                ...EXERCISES.back,
                ...EXERCISES.wrists,
                ...EXERCISES.relax
            ];
        }

        let selectedCategory = 'all';

        categoryButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                categoryButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedCategory = btn.getAttribute('data-category') || 'all';
            });
        });

        function showRandomExercise() {
            let pool = [];
            if (selectedCategory === 'all') {
                pool = getAllExercises();
            } else {
                pool = EXERCISES[selectedCategory] || getAllExercises();
            }

            if (pool.length === 0) {
                exerciseText.textContent = 'Brak ćwiczeń w wybranej kategorii.';
                return;
            }

            const idx = Math.floor(Math.random() * pool.length);
            exerciseText.textContent = pool[idx];
        }

        randomExerciseBtn.addEventListener('click', showRandomExercise);
        showRandomExercise();

        window.addEventListener('message', event => {
            const message = event.data;

            if (message.command === 'image') {
                let src = message.data;
                if (!src.startsWith('data:image')) {
                    src = 'data:image/jpeg;base64,' + src.trim();
                }
                img.src = src;
                cameraStatus.textContent = 'Zdjęcie wykonane. Sprawdź swoją postawę.';
                cameraStatus.classList.remove('status-warn');
                cameraStatus.classList.add('status-ok');
            } else if (message.command === 'error') {
                cameraStatus.textContent = message.text || 'Wystąpił błąd podczas używania kamery.';
                cameraStatus.classList.remove('status-ok');
                cameraStatus.classList.add('status-warn');
            } else if (message.command === 'init') {
                const today = message.todayBreaks ?? 0;
                const goal = message.dailyGoal ?? 5;
                statsEl.textContent = \`Dziś wykonałeś \${today} przerw(y). Cel dzienny: \${goal}.\`;
            }
        });

        vscode.postMessage({ command: 'initRequest' });
    </script>
</body>
</html>
`;
}
