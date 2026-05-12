# In-App Updater — как использовать и как тестировать

## Как это работает end-to-end

```
[Запуск приложения]
       │
       ▼
useCheckUpdate.js фетчит update.json с GitHub (main ветка)
       │  version из update.json > установленной версии?
       ├── нет → тихо, обновлений нет
       └── да  →
              │  update.json содержит заполненный блок platforms?
              ├── нет  → UpdateNotificationModal (браузер, старый флоу)
              └── да   → UpdaterModal (in-app updater)
                            │
                       [Нажал «Обновить»]
                            │
                       StartUpdate() [Go]
                            ├── FetchManifest → выбирает платформу
                            ├── ValidateAssetURL (whitelist)
                            ├── Download → update:progress events
                            ├── Verify SHA-256
                            │     несовпадение → файл удаляется, update:failed
                            └── Install
                                  Windows portable → bat-handover → os.Exit(0)
                                  Windows NSIS     → /S silent install → os.Exit(0)
                                  macOS .dmg       → hdiutil + ditto → os.Exit(0)
                                  Linux AppImage   → rename + syscall.Exec
```

### Ключи платформ в update.json

| Ключ | Когда используется |
|------|--------------------|
| `windows-amd64-portable` | exe не в Program Files |
| `windows-amd64-installer` | exe в Program Files (NSIS) |
| `darwin-universal` | macOS (любая архитектура) |
| `linux-amd64-appimage` | Linux, AppImage |
| `linux-amd64-deb` | (резерв, открывает xdg-open) |

---

## Как выпустить ПРОДАКШН-релиз (обычный флоу)

1. Обновить версию в `wails.json` (`info.productVersion`).
2. Обновить `update.json`: поля `version`, `releaseTitle`, `releaseNotes`, `downloadUrl`.
3. Закоммитить оба файла в `main`.
4. Поставить тег без дефиса и запушить:
   ```
   git tag v3.2.0
   git push origin v3.2.0
   ```
5. GitHub Actions:
   - Собирает артефакты для Windows / macOS / Linux.
   - Создаёт GitHub Release (не prerelease).
   - Вычисляет sha256 каждого артефакта.
   - Коммитит `update.json` с заполненным блоком `platforms` в **`main`**.
6. Пользователи при следующем запуске увидят `UpdaterModal` с кнопкой «Обновить».

---

## Как выпустить ТЕСТОВЫЙ релиз (пользователи не увидят)

Тестовый релиз — это тег с дефисом, например `v3.2.0-dev.1`.
CI автоматически:
- Помечает GitHub Release как **Pre-release** (не появляется как «Latest»).
- Коммитит `update.json` в **`dev`** ветку, а не в `main`.
- Собирает артефакты с `ManifestURLOverride`, указывающим на dev-ветку.

### Пошаговая инструкция

#### Шаг 1 — собрать «старую» версию для установки на тестовую машину

Сборка вручную на Windows (portable-вариант):

```powershell
# Временно поставить низкую версию в wails.json → "productVersion": "0.0.1"
# Затем:
wails build -nsis -platform windows/amd64 `
  -ldflags "-X resultproxy-wails/internal/updater.ManifestURLOverride=https://raw.githubusercontent.com/AandStep/ResultV/dev/update.json"
```

Результат: `build/bin/ResultV.exe` — это «старая» версия, которую установим.
Скопируй её куда удобно (рабочий стол, отдельная папка).

> **Важно**: флаг `ManifestURLOverride` нужен, чтобы эта сборка проверяла
> `dev/update.json`, а не `main/update.json`. Иначе тест-релиз она не увидит.

#### Шаг 2 — поставить актуальную версию в wails.json

```json
"productVersion": "3.2.0"
```

Закоммитить в dev. Это будет версия нового обновления.

#### Шаг 3 — создать тег и запушить

```bash
git tag v3.2.0-dev.1
git push origin v3.2.0-dev.1
```

CI запустится, соберёт артефакты, создаст pre-release и закоммитит `update.json`
(с sha256 + URL) в ветку `dev`.

#### Шаг 4 — дождаться завершения CI (~15-20 минут)

Проверить что в ветке `dev` появился обновлённый `update.json`:
```
https://raw.githubusercontent.com/AandStep/ResultV/dev/update.json
```

Должен содержать заполненные поля `platforms`:
```json
{
  "version": "3.2.0-dev.1",
  "platforms": {
    "windows-amd64-portable": {
      "url": "https://github.com/AandStep/ResultV/releases/download/v3.2.0-dev.1/ResultV.exe",
      "sha256": "abc123...",
      "size": 12345678
    }
    ...
  }
}
```

#### Шаг 5 — тест

Запустить «старую» версию (`ResultV.exe` из Шага 1).
- Должен появиться `UpdaterModal` с версией `3.2.0-dev.1`.
- Нажать «Обновить».
- Следить за прогресс-баром.
- После завершения приложение перезапустится с новой версией.
- Проверить: `Настройки → версия` должна показывать `3.2.0-dev.1`.

---

## Быстрый тест без GitHub (локально, 5 минут)

Если не хочется пушить тег, можно проверить весь флоу локально через mock-сервер.

### 1. Собрать два exe-файла

```powershell
# "Старая" версия (то, что уже установлено у пользователя)
# Отредактируй wails.json: "productVersion": "0.0.1"
wails build -platform windows/amd64 `
  -ldflags '-X resultproxy-wails/internal/updater.ManifestURLOverride=http://localhost:8765/update.json'
copy build\bin\ResultV.exe test\old\ResultV.exe

# "Новая" версия (артефакт обновления)
# Отредактируй wails.json: "productVersion": "0.0.2"
wails build -platform windows/amd64
copy build\bin\ResultV.exe test\new\ResultV.exe
```

### 2. Вычислить sha256 новой версии

```powershell
(Get-FileHash test\new\ResultV.exe -Algorithm SHA256).Hash.ToLower()
# → например: a1b2c3d4...
```

### 3. Создать update.json для локального сервера

```json
{
  "version": "0.0.2",
  "downloadUrl": "http://localhost:8765/",
  "platforms": {
    "windows-amd64-portable": {
      "url": "http://localhost:8765/ResultV.exe",
      "sha256": "a1b2c3d4...",
      "size": 12345678
    }
  }
}
```

> **Внимание**: в реальном updater.go в `AllowedHosts` нет localhost.
> Для теста временно добавь `"localhost"` в список или используй `127.0.0.1`.
> Не забудь убрать после теста.

Либо запусти тест через `go test -run TestDownload...` с httptest-сервером.

### 4. Поднять локальный сервер

```powershell
# В папке test/new/ запусти простой HTTP-сервер:
python -m http.server 8765
# или (Node.js):
npx serve -p 8765 test\new
```

Также нужен `update.json` — можно положить рядом с `ResultV.exe` в `test\new\`.

### 5. Запустить «старую» версию и проверить

```powershell
test\old\ResultV.exe
```

---

## Диагностика проблем

### update.json не обновился в ветке

Проверь что CI-джоб `create-release` завершился успешно. Если шаг
«Commit updated update.json» упал — скорее всего нет прав на push.
Убедись что в `.github/workflows/release.yml` у джоба `create-release` есть:
```yaml
permissions:
  contents: write
```

### Модал не переключается на UpdaterModal

Проверь `update.json` — поле `platforms` должно содержать хотя бы один элемент
с непустыми `url` и `sha256`. Если `platforms` пуст или отсутствует — показывается
старый `UpdateNotificationModal`.

### SHA-256 mismatch

Файл скачался с ошибкой или подменён. Скачанный файл автоматически удаляется.
Пользователю показывается `update:failed` с кнопками «Повторить» и «В браузере».

### Установщик не запустился (Windows portable)

Проверь права записи в папку, где лежит exe. Для portable — приложение должно
лежать в папке без UAC (рабочий стол, AppData/Local, любая пользовательская папка).
Если exe в `Program Files` — используется NSIS-ветка, ей нужен UAC.

### «Нет обновления для этой платформы»

`platforms` в `update.json` не содержит записи для текущей платформы с непустым
sha256. Либо CI ещё не дошёл до шага вычисления sha256, либо соответствующий
артефакт не был собран.

---

## Архитектурная шпаргалка

```
internal/updater/
├── updater.go              ← Updater struct, Check/Download/Verify/Install
│                             ManifestURLOverride (ldflags)
├── manifest.go             ← FetchManifest, ResolveAsset, ValidateAssetURL
├── download.go             ← HTTPS + progress + size limit + atomic rename
├── verify.go               ← SHA-256, при ошибке удаляет файл
├── installer_windows.go    ← currentPlatformKey, isInstalledBuild,
│                             installPortable (bat), installNSIS
├── installer_darwin.go     ← hdiutil + ditto + open
├── installer_linux.go      ← rename + syscall.Exec
├── installer_stub.go       ← заглушка для прочих платформ
└── updater_test.go         ← unit + httptest интеграционные тесты

app.go                      ← StartUpdate(), CancelUpdate()
                              Events: update:progress/verifying/verified/installing/failed

frontend/
├── hooks/useCheckUpdate.js     ← +hasPlatformAsset
├── components/ui/UpdaterModal.jsx  ← все состояния UI
├── utils/wailsAPI.js           ← startUpdate, cancelUpdate
└── App.jsx                     ← UpdaterModal vs UpdateNotificationModal
```

### Переменная для переопределения манифест-URL

```bash
# В ldflags при сборке:
-X resultproxy-wails/internal/updater.ManifestURLOverride=<URL>

# Пример для dev-теста:
-X resultproxy-wails/internal/updater.ManifestURLOverride=https://raw.githubusercontent.com/AandStep/ResultV/dev/update.json
```
