# Airplane Chess

Šachy pro webový prohlížeč. Dva režimy hry, kompletní pravidla FIDE, žádný
backend a žádné běhové závislosti — celá appka je jeden HTML soubor.

## Režimy

**Pass & Play** — oba hráči na jedné šachovnici na jednom telefonu. Deska se po
každém tahu sama otočí ke hráči na tahu (lze vypnout v menu).

**2 zařízení** — spojení bez internetu, dvěma cestami:

| Cesta | Technologie | Kdy funguje |
| --- | --- | --- |
| Hráči v okolí | `BroadcastChannel` | Další okna/záložky téhle hry na stejném zařízení. Najdou se sama. |
| Pozvánka s kódem | WebRTC data channel, `iceServers: []` | Dvě zařízení na stejné Wi-Fi, hotspotu nebo Bluetooth PAN. |

Pozvánka s kódem nepoužívá žádný STUN ani TURN server, takže se ICE omezí na
host kandidáty a spojení nikdy neopustí místní síť. SDP se zkrátí na ~120 znaků
(`packSdp`/`unpackSdp` v `src/net.js`), aby šel kód poslat zprávou nebo i
nadiktovat.

Prohlížeč neumí navázat Bluetooth spojení sám od sebe — Web Bluetooth funguje
jen proti GATT periferii, prohlížeč se periferií stát nemůže. Pokud tedy
telefony spojíš přes Bluetooth PAN (sdílení připojení), jsou na jedné IP síti a
pozvánka s kódem funguje úplně stejně jako přes Wi-Fi.

## Pravidla

Kompletní generátor tahů: rošáda na obě strany, en passant, proměna pěšce s
výběrem figury, šach / mat / pat, pravidlo 50 tahů, trojí opakování pozice,
nedostatečný materiál, pád praporku (a remíza, když vítěz nemá na mat materiál).

Správnost je ověřená perft testy proti publikovaným hodnotám:

```
node chess/test/perft.js
```

Pokrývá šest standardních testovacích pozic do hloubky 4–5 (startpos depth 5 =
4 865 609 uzlů), plus SAN zápis, mat a pat.

## Build

Zdroje jsou rozdělené v `src/`, build je slepí do dvou výstupů:

```
node chess/build.js
```

- `chess/index.html` — samostatná stránka, otevři přímo ze souboru nebo nahraj kamkoliv
- `chess/app.html` — stejný obsah bez `<html>`/`<head>`/`<body>` obálky

Žádné externí requesty za běhu: styl, skripty i figurky (vlastní SVG siluety)
jsou inline, takže hra funguje i v letadle.

## Struktura

```
src/engine.js   pravidla, generování tahů, SAN, FEN, PGN, detekce konce partie
src/pieces.js   SVG figurky (45×45, jedna geometrie pro obě barvy)
src/net.js      LobbyLink (BroadcastChannel) + DirectLink (WebRTC)
src/ui.js       obrazovky, šachovnice, hodiny, pozvánky, menu
src/style.css   vizuální systém
src/markup.html DOM kostra
```
