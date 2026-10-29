# Snipio 1.4.2

Release preparation date: 29 October 2026.

## Changes

- Added a Firefox desktop Manifest V3 package while keeping shared source for Chrome and Edge.
- Adapted background media and clipboard handling to Firefox's local event-page context; Chrome and Edge retain their local offscreen document.
- Prefer the browser's Promise-based extension API, with a Chromium fallback.
- Replaced the previous short tone with a soft 0.68-second four-voice expansion chord. The same `assets/sounds/expansion.wav` is included in every browser package.
- Generate the sound entirely from mathematical oscillators in `scripts/generate-sound.cjs`; no MP3 recording or third-party sample is embedded.
- Added repeatable browser-specific ZIP builds and package checks. All executable scripts remain local to the extension package.

## Verification record

The publisher reported on 29 October 2026 that the Firefox development version was working. This is a user-reported manual smoke check of the adapted runtime and soft sound, not an independently observed automated native-Firefox suite. The exact Firefox version and operating system were not recorded.

The preparation work has automated coverage for the shared logic, Firefox background API branches, package construction, and browser UI. The existing Chromium/Edge suite and the browser-only Firefox-package API regression run in a Chromium engine. They must not be described as an automated Firefox-engine pass. Consult the current test output/report for final counts and results after rebuilding.

Mozilla AMO validation, signing, and store approval occur separately during submission. The local ZIP is unsigned until processed by Mozilla.

## Packages

| File | Purpose |
| --- | --- |
| `dist/snipio-chrome-edge-1.4.2.zip` | Chrome Web Store update or Edge Add-ons submission |
| `dist/snipio-firefox-1.4.2.zip` | Firefox Add-ons submission |
| `dist/snipio-firefox-source-1.4.2.zip` | Readable source/build material, only if Mozilla requests it |

The source ZIP is not an installable extension. Store packages have `manifest.json` at their root and include the license, privacy policy, and notices. Firefox requires desktop version 140 or newer; Android support is not claimed.

## Short store release notes

Added Firefox desktop support and a softer expansion sound shared across browsers. Improved cross-browser background and clipboard handling. Snipio remains free, open source, local-first, and usable without an account or registration.

## Что делать дальше

1. Для локальной установки Chrome или Edge нажми **Перезагрузить / Reload** на странице расширений и обнови вкладку сайта. Если загружаешь собранный пакет, используй `dist/chrome-edge/`.
2. Для временной установки Firefox выбери **Reload** в `about:debugging`, используя `dist/firefox/manifest.json`. В обоих случаях должен звучать новый мягкий аккорд.
3. Опубликуй обновлённые исходники и `PRIVACY.md` в своём публичном GitHub-репозитории. Проверь, что ссылка на политику открывается без входа в аккаунт.
4. В кабинете Chrome Web Store загрузи `snipio-chrome-edge-1.4.2.zip` как новую версию существующего расширения. Для Edge используй тот же Chrome/Edge ZIP в Microsoft Partner Center.
5. В Firefox Add-on Developer Hub загрузи `snipio-firefox-1.4.2.zip`. Для первой публикации выбери **On this site**. Если Firefox-расширение уже создано, добавь новую версию к существующей записи.
6. Если Mozilla отдельно попросит исходники, приложи `snipio-firefox-source-1.4.2.zip` и укажи команду сборки `node scripts/build.cjs firefox` с Node.js 22 или новее. Не загружай архив исходников вместо установочного ZIP.
7. Проверь результаты валидатора, сведения о конфиденциальности и данные издателя, затем отправь заявку на проверку. Наличие ZIP и прохождение локальных тестов не означают одобрение магазина.

Если нужен тестовый сценарий для проверяющих: аккаунт не требуется. Создать `.test` с текстом `Hello from Snipio`, открыть обычную HTTP/HTTPS-страницу с редактируемым полем и набрать `.test`. Дополнительно проверить локальный звук, сохранение, статистику и экспорт/импорт резервной копии.
