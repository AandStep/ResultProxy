# План: in-app updater для ResultV

> Статус: **черновик плана**, реализация отложена.
> Связан с пунктом #8 security audit (Update integrity).

## Цель

Заменить текущий поток «жмёшь Обновить → открывается браузер → ручное скачивание → ручной запуск» на полностью встроенное обновление в стиле Cursor/VSCode/Slack:

```
[Уведомление] → [Прогресс 0→100%] → [Установка] → [Перезапуск] → готово
```

Без браузера, без ручных кликов, с проверкой целостности.

## Текущее состояние (до реализации)

- `update.json` на `raw.githubusercontent.com/AandStep/ResultV/main/update.json` содержит `version` и `downloadUrl`.
- `frontend/src/hooks/useCheckUpdate.js` фетчит файл при старте, сравнивает версии.
- `frontend/src/components/ui/UpdateNotificationModal.jsx` показывает модал, кнопка «Обновить» → `window.open(downloadUrl, "_blank")` (с whitelist хостов из #8).
- Bинарики собираются GitHub Actions при `git tag v*`, попадают в release-assets.

## Целевая архитектура

### Слой 1 — Release pipeline (GitHub Actions)

В `.github/workflows/release.yml` после сборки добавить шаг:

1. Посчитать `sha256` каждого артефакта:
   - `ResultV-Setup-<version>.exe` (Windows NSIS)
   - `ResultV-<version>-portable.exe` (Windows portable)
   - `ResultV-<version>.dmg` (macOS)
   - `ResultV-<version>.AppImage` (Linux)
   - `resultv_<version>_amd64.deb` (Linux Debian)
2. Сгенерировать обновлённый `update.json` с блоком:
   ```json
   "platforms": {
     "windows-amd64-installer": {
       "url": "https://github.com/AandStep/ResultV/releases/download/v<X>/ResultV-Setup-<X>.exe",
       "sha256": "<hex>",
       "size": <bytes>
     },
     "windows-amd64-portable": {
       "url": "...",
       "sha256": "...",
       "size": ...
     },
     "darwin-universal": { ... },
     "linux-amd64-appimage": { ... },
     "linux-amd64-deb": { ... }
   }
   ```
3. Закоммитить `update.json` обратно в `main` (либо через `peter-evans/create-pull-request`, либо напрямую от `github-actions[bot]`).

Альтернатива: вместо коммита — выкладывать `update.json` как release-asset и менять `useCheckUpdate.js` на чтение из `releases/latest/download/update.json`. Так избегаем мусорных коммитов в `main`, но теряем возможность видеть историю изменений `update.json`.

### Слой 2 — Backend (Go, `internal/updater/`)

```
internal/updater/
├── updater.go              // Главный API: Check, Download, Verify, Install
├── manifest.go             // Парсинг update.json, выбор platform для текущей ОС
├── download.go             // HTTPS-скачивание с progress callback, host pinning
├── verify.go               // SHA-256 проверка
├── installer_windows.go    // build tag: windows
├── installer_darwin.go     // build tag: darwin
├── installer_linux.go      // build tag: linux
├── installer_stub.go       // build tag: !windows,!darwin,!linux
└── updater_test.go
```

#### Главный API (внутри пакета)

```go
type ProgressFn func(downloaded, total int64)

type Updater struct {
    AllowedHosts []string         // whitelist для download URLs
    ManifestURL  string           // https://raw.../update.json
    DownloadDir  string           // обычно os.TempDir()
}

func (u *Updater) Check(ctx context.Context) (*Manifest, error)
func (u *Updater) Download(ctx context.Context, m *Manifest, progress ProgressFn) (path string, err error)
func (u *Updater) Verify(path string, expectedSHA256 string) error
func (u *Updater) Install(path string) error
```

#### Безопасность скачивания

- HTTPS-only. Host из download URL должен быть в `AllowedHosts` (`github.com`, `result-proxy.ru`).
- TLS — стандартный crypto/tls с системным root store. Без `InsecureSkipVerify` никогда.
- Размер ограничен: если `Content-Length > 200MB` или фактический объём превысил — отказ. Без этого MITM может слать вечный поток.
- Файл пишется в `%TEMP%/ResultV-update-<sha256-prefix-8>.exe`, права `0o600`.
- После `Verify` проверяется `actual == expected`. Несовпадение → удалить файл, вернуть ошибку, **никогда** не запускать.

#### Платформо-специфичная установка

**Windows portable (`.exe` без инсталлятора)**:
- Проблема: процесс не может перезаписать свой собственный EXE пока он запущен.
- Решение: **батник-handover**.
  1. Writer пишет `%TEMP%/resultv-update.bat` с содержанием:
     ```batch
     @echo off
     timeout /t 2 /nobreak > NUL
     copy /Y "<new.exe>" "<current.exe>"
     start "" "<current.exe>"
     del "%~f0"
     ```
  2. `cmd.Start()` запускает батник асинхронно.
  3. Приложение делает `os.Exit(0)`.
  4. Батник ждёт пока exe освободится, копирует новый поверх, запускает, самоудаляется.
- Никогда не отдавать управление пока скачанный файл не верифицирован.

**Windows NSIS installer**:
- Запустить `start /wait "ResultV-Setup.exe" /S` (silent install).
- Дождаться выхода → перезапуск приложения через `os.StartProcess(currentExe, args...)`.
- Закрыть текущий процесс.

**macOS .dmg**:
- `hdiutil attach "<update.dmg>" -nobrowse -mountpoint /tmp/resultv-update`.
- `ditto /tmp/resultv-update/ResultV.app /Applications/ResultV.app`.
- `hdiutil detach /tmp/resultv-update`.
- Запустить новую версию: `open /Applications/ResultV.app`.
- Текущий процесс exits.
- Альтернатива: интегрировать **Sparkle** через CGO. Это стандарт macOS-апдейтеров, есть подпись пакетов через EdDSA. Большая зависимость, но «правильный» путь долгосрочно.

**Linux .AppImage**:
- Скопировать новый файл поверх существующего.
- `chmod +x`.
- `exec` через `syscall.Exec` (заменяет процесс in-place).

**Linux .deb / .rpm**:
- Сложно: запуск `pkexec apt install ./resultv.deb` требует политики polkit и руту.
- Pragmatic: на этих форматах **открываем системный пакет-менеджер** (`xdg-open file.deb` открывает GNOME Software / Discover). Это уже не in-app, но безопасно — установку делает доверенный системный компонент.

### Слой 3 — Frontend

#### `UpdaterModal.jsx`

```
┌────────────────────────────┐
│ Обновление до 3.2.0        │
│                            │
│ Скачивание...   12.4 МБ    │
│ [██████████░░░░░░░] 65%    │
│                            │
│              [ Отмена ]    │
└────────────────────────────┘
```

Состояния:
- `idle` — кнопка «Обновить» в `UpdateNotificationModal`.
- `downloading` — progress bar, размер, MB/s, ETA.
- `verifying` — короткое состояние «Проверка целостности...».
- `installing` — «Установка...» без отмены (точка невозврата).
- `restarting` — «Перезапуск...» (приложение выходит).
- `failed` — текст ошибки, кнопка «Попробовать снова» / «Скачать в браузере» (fallback на текущий поток).

#### Wails events

- `update:progress` `{ downloaded, total, speedBps }` — стримится во время скачивания.
- `update:verified` — после успешной sha256 проверки.
- `update:failed` `{ stage, message }` — на любом этапе.

#### API

```js
// frontend/src/utils/wailsAPI.js
startUpdate: async () => StartUpdate()
cancelUpdate: async () => CancelUpdate()
```

### Слой 4 — Безопасность (на чём не экономим)

| Проверка | Зачем |
|---|---|
| HTTPS host из whitelist | Нельзя редиректить на чужой домен |
| sha256 матчится с update.json | Главная защита от подмены |
| size ≤ 200MB | Защита от resource exhaustion |
| Атомарная запись (write to .tmp, rename) | Прерванная загрузка не оставляет битый файл |
| `0o600` на скачанном файле | Другой локальный юзер не подменит между Verify и Install |
| update.json fetch — HTTPS | Manifest сам должен быть защищён от MITM |
| Не выполнять untrusted batch/sh файлы | Только то, что мы сами генерим |
| После Install — exec нового exe из защищённого пути | Не из `%TEMP%` (там может быть подмена) |

Что **не** делаем на первом этапе:
- ❌ Code signing на Windows (нужен EV-сертификат, $300+/год).
- ❌ Дельта-обновления (xdelta3).
- ❌ Откат на предыдущую версию.
- ❌ Auto-download без подтверждения пользователя.

### Слой 5 — Тестирование

- **Unit**: парсер manifest, выбор platform по `runtime.GOOS+GOARCH`, sha256-verify (правильный/неправильный/тампленный), host-whitelist.
- **Integration**: httptest-сервер с эмуляцией update.json + скачивание + verify. Проверки негативных сценариев (corrupted body, wrong sha, 404, timeout).
- **Manual**: на каждой ОС — реальный апдейт с **dev**-релиза `v0.0.1-dev` → `v0.0.2-dev`. До прод-релиза. Иначе риск разломать обновлятор у живых пользователей.

## Roadmap по фазам

### Фаза 0 — Сейчас
- [x] Удалить пустые слоты `platforms.*` из `update.json` (preемптивное добавление вводило в заблуждение).
- [x] Этот документ.

### Фаза 1 — Windows portable (MVP, ~1 рабочий день)
- [ ] `internal/updater/` каркас (`updater.go`, `manifest.go`, `download.go`, `verify.go`).
- [ ] `installer_windows.go` — батник-handover для portable.
- [ ] GitHub Action: sha256 + регенерация `update.json`.
- [ ] `App.StartUpdate()` Wails-метод + events.
- [ ] `UpdaterModal.jsx` минимальный.
- [ ] Тесты.
- [ ] Релиз `v3.2.0` с in-app updater для Windows portable. NSIS — пока в браузере.

### Фаза 2 — Windows NSIS, macOS, Linux AppImage (~1 рабочий день)
- [ ] `installer_windows.go` — ветка NSIS silent install.
- [ ] `installer_darwin.go` — `.dmg` mount + ditto.
- [ ] `installer_linux.go` — `.AppImage` replace + chmod.
- [ ] Linux `.deb`/`.rpm` — fallback на `xdg-open`.

### Фаза 3 — Полировка (~0.5 дня)
- [ ] Скорость / ETA в UI.
- [ ] Cancel во время скачивания.
- [ ] Retry на network errors.
- [ ] Логи в `%APPDATA%/ResultV/updater.log` (без секретов).

### Фаза 4 — Долгосрочное
- [ ] Sparkle для macOS (с EdDSA-подписью).
- [ ] Code signing на Windows (EV cert).
- [ ] Auto-check периодически в фоне (с уведомлением, не auto-install).

## Открытые вопросы

1. **Где хранить update.json?**
   - Сейчас: `raw.githubusercontent.com/.../main/update.json` (требует коммит в `main`).
   - Альтернатива: release-asset последнего тега (`releases/latest/download/update.json`).
   - Альтернатива 2: на своём сервере `https://result-proxy.ru/update.json` (контроль выше, но добавляет точку отказа).

2. **Что если у юзера нет прав на запись в `Program Files`?**
   - Portable installs обычно лежат в `%APPDATA%/Local/Programs/` или `Desktop/` — права есть.
   - Для NSIS-инсталляции в `Program Files` нужен UAC-prompt → инсталлер сам его делает.

3. **Прерванное обновление**
   - Файл частично скачан → следующий запуск удаляет `%TEMP%/ResultV-update-*` старше 24ч.

4. **Откатываемся ли при failed install?**
   - На portable: батник копирует `<old.exe>` в `<old.exe>.bak` перед заменой. Если новый exe не запускается через N секунд — батник восстанавливает.
   - Сложно надёжно автоматизировать. На первой итерации — просто `.bak` и инструкция «если не запустилось, восстановите .bak руками».

## Связанные security-задачи

- Этот план **завершает** #8 (Update integrity) из security audit.
- Перед реализацией нужно убедиться что #1-#7 уже выпущены — иначе пользователи получат updater'а в небезопасную версию.
