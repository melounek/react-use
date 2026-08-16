# iOS probe

Sonda, která ověřuje, jak se dá vyvíjet nativní iOS aplikace, když agent běží
na Linuxu — tedy tam, kde Xcode ani iOS Simulator spustit nejdou.

Odpověď: přes **GitHub-hosted macOS runner**. Workflow
`.github/workflows/ios-probe.yml` vygeneruje Xcode projekt (XcodeGen), postaví
SwiftUI aplikaci, spustí ji v simulátoru, proklikne ji XCUITestem a nahraje
výstupy jako artefakt.

## Co z běhu vypadne

| Výstup | K čemu |
| --- | --- |
| PNG screenshoty (jeden na krok testu) | Vizuální kontrola — jak obrazovka skutečně vypadá |
| MP4 záznam obrazovky | Průběh celé interakce |
| Výpis UI hierarchie | Debug — typy prvků, identifikátory, souřadnice, rámečky |
| Log `xcodebuild` | Chyby kompilace a selhání assertů |
| `Result.xcresult` | Kompletní bundle výsledků testu |

## Naměřené časy

Zelený běh trvá **~3 min 40 s** od pushnutí (runner + XcodeGen + build + boot
simulátoru + test). Samotný build SwiftUI aplikace je ~13 s, boot simulátoru a
běh testu tvoří zbytek.

## Na co jsem narazil

- **Ruční boot simulátoru se zasekává.** `xcrun simctl bootstatus <udid> -b`
  visel na runneru přes deset minut. Řešení: nechat správu simulátoru na
  `xcodebuild test`, který si ho nabootuje, nainstaluje app a spustí ji sám.
- **SwiftUI vystavuje čtverce jako `StaticText`, ne `otherElements`.** První
  běh testu proto na prvním tapu spadl. Typ prvku prozradil přiložený výpis UI
  hierarchie — přesně ten druh informace, kvůli které tenhle cyklus dává smysl.

## Co tenhle cyklus neumí

Interaktivní debugging. Žádné breakpointy, žádné krokování v LLDB, žádný živý
náhled. Ladí se přes screenshoty, záznam obrazovky, výpis hierarchie a logy —
každá iterace stojí jeden běh workflow.
