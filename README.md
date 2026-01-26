# Ergonomic IDE Assistant (VS Code Extension)

Rozszerzenie dla **Visual Studio Code**, które wspiera profilaktykę chorób zawodowych u osób pracujących długotrwale przy komputerze (szczególnie programistów).  
Wtyczka przypomina o przerwach, podpowiada ćwiczenia ergonomiczne, prezentuje statystyki aktywności w edytorze oraz (opcjonalnie) umożliwia podgląd poprzez wykonywanie zdjęć z kamery.

> Projekt został przygotowany jako prototyp w ramach pracy dyplomowej: **„Zintegrowane środowisko programistyczne chroniące przed chorobami zawodowymi”**.

---

##  Najważniejsze funkcje

###  Przerwy i mikroprzerwy
- przerwy główne po określonym czasie ciągłej pracy,
- mikroprzerwy w krótszych odstępach,
- uwzględnienie braku aktywności (aby ograniczyć „fałszywe” przypomnienia),
- tryb **Focus** (czasowe wyciszenie przypomnień).

###  Losowe ćwiczenia ergonomiczne
- losowanie ćwiczeń z podziałem na kategorie:
  - oczy,
  - kręgosłup,
  - nadgarstki,
  - relaks / oddech,
- prezentacja ćwiczeń w panelu ergonomii (Webview).

###  Statystyki aktywności (boczny panel)
Widok „Statystyki pracy” pokazuje m.in.:
- aktywne minuty pracy (na podstawie aktywności w edytorze),
- linie + / -,
- znaki + / -,
- przybliżone klawisze (approx),
- przybliżone kliknięcia (proxy),
- przełączenia plików,
- zapisy,
- liczba przerw w danym dniu,
- WPM (approx).

> Uwaga: część metryk ma charakter **przybliżony**, ponieważ VS Code nie udostępnia pełnych niskopoziomowych zdarzeń (np. „prawdziwe kliknięcia myszy”). W pracy dyplomowej opisano ograniczenia i sposoby ich minimalizacji (np. debounce).

###  Kamera (opcjonalnie)
- zdjęcie na żądanie w panelu ergonomii,
- tryb cyklicznych zdjęć (monitoring w ujęciu prototypowym),
- obraz przekazywany do Webview jako base64 (bez wysyłki do chmury).

---

##  Instalacja

### 1) Instalacja z pliku `.vsix` (najprostsza)
1. Pobierz plik `.vsix` z zakładki **Releases** w tym repozytorium.
2. W VS Code:
   - Otwórz **Extensions**
   - Kliknij `...` (More Actions)
   - Wybierz **Install from VSIX...**
   - Wskaż pobrany plik

Po instalacji zalecane: **Developer: Reload Window**.

---

##  Uruchomienie w trybie developerskim (F5)
Jeśli chcesz uruchomić plugin jako projekt:

```bash
npm install
npm run compile
