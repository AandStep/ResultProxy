---
name: senior-wails-developer
description: Use when writing, reviewing, or refactoring Wails v2/v3 desktop applications — applies idiomatic Go backend patterns, safe JS↔Go binding design, lifecycle management, and cross-platform best practices as a senior Wails engineer would
---

## Overview
Wails bridges a Go backend with a web frontend (HTML/JS/TS). Senior Wails code keeps these two worlds **strictly separated**: Go owns state and system access, the frontend owns presentation. Crossing this boundary carelessly causes race conditions, crashes, and unmaintainable code.

**Core principle:** Go backend = source of truth. Frontend = thin display layer. Never let the frontend own critical state.

**Violating the separation of concerns violates the spirit of Wails.**

---

## The Iron Laws

```
BINDINGS ARE NOT REST ENDPOINTS — TREAT THEM AS TYPED FUNCTION CALLS
CONTEXT IS YOUR LIFETIME SIGNAL — NEVER IGNORE ctx.Done()
RUNTIME CALLS FROM WRONG GOROUTINE = CRASH — USE THE MAIN THREAD
```

---

## Project Structure

```
/                          — project root
├── main.go                — entry: create app, register bindings, run
├── app.go                 — App struct: startup/shutdown lifecycle
├── wails.json             — Wails config (name, version, frontend dir)
├── build/                 — platform-specific assets (icons, manifests)
├── frontend/              — web app (Vite/React/Svelte/Vue)
│   ├── src/
│   │   └── lib/
│   │       └── wailsjs/   — AUTO-GENERATED — never edit by hand
│   │           ├── go/    — generated Go binding wrappers
│   │           └── runtime/  — Wails runtime JS
│   └── wails.js           — generated shim
└── internal/              — private Go packages (business logic)
    ├── service/
    └── repository/
```

### main.go rule: wire only, no logic

```go
func main() {
    app := NewApp()
    err := wails.Run(&options.App{
        Title:     "My App",
        Width:     1024,
        Height:    768,
        AssetServer: &assetserver.Options{
            Assets: assets, // go:embed frontend/dist
        },
        OnStartup:  app.startup,
        OnShutdown: app.shutdown,
        Bind: []interface{}{
            app,
        },
    })
    if err != nil {
        log.Fatalf("wails.Run: %v", err)
    }
}
```

---

## App Struct & Lifecycle

### Rule: App struct holds context. startup/shutdown own the lifecycle.

```go
type App struct {
    ctx    context.Context
    cancel context.CancelFunc
    svc    *service.Service
}

func NewApp() *App {
    return &App{}
}

// startup is called when the app is ready — ctx is the Wails app context
func (a *App) startup(ctx context.Context) {
    a.ctx, a.cancel = context.WithCancel(ctx)
    a.svc = service.New()
    // Start background work only after startup — never in init()
    go a.svc.StartBackground(a.ctx)
}

// shutdown is called before the window closes
func (a *App) shutdown(ctx context.Context) {
    a.cancel()
    a.svc.Close()
}
```

### ❌ Common mistake: using ctx before startup

```go
// ❌ BAD — a.ctx is nil if called before startup
func (a *App) Greet() string {
    select {
    case <-a.ctx.Done():
        return ""
    ...
    }
}

// ✅ GOOD — guard against nil
func (a *App) Greet() string {
    if a.ctx == nil {
        return ""
    }
    ...
}
```

---

## Bindings (Go ↔ JS)

### Rule: Bound methods must be exported, on a pointer receiver, and return at most (T, error).

```go
// ✅ GOOD — correct binding signature
func (a *App) GetUserProfile(id string) (UserProfile, error) {
    return a.svc.FindUser(a.ctx, id)
}

// ❌ BAD — unexported, ignored by Wails
func (a *App) getUser() {}

// ❌ BAD — returns raw error string (loses type information)
func (a *App) GetUser() string {
    u, err := a.svc.FindUser(a.ctx, "1")
    if err != nil {
        return "error: " + err.Error()  // frontend can't branch on error type
    }
    return u.Name
}
```

### Return clean DTOs, not domain types

```go
// ❌ BAD — exposes internal domain struct to JS
type User struct {
    ID       int
    Password string  // leaked fields!
    db       *sql.DB // unexportable, confuses generator
}

// ✅ GOOD — explicit DTO for the binding layer
type UserDTO struct {
    ID   int    `json:"id"`
    Name string `json:"name"`
}

func (a *App) GetUser(id int) (UserDTO, error) {
    u, err := a.svc.FindUser(a.ctx, id)
    if err != nil {
        return UserDTO{}, fmt.Errorf("GetUser %d: %w", id, err)
    }
    return UserDTO{ID: u.ID, Name: u.Name}, nil
}
```

### Async vs Sync bindings

| Use case | Pattern |
|----------|---------|
| Fast, non-blocking read | `func (a *App) GetConfig() Config` |
| I/O or long computation | `func (a *App) LoadFile(path string) (string, error)` — frontend awaits |
| Streaming / push | `wails.EventsEmit` (see Events section) |

**Never block a binding call for >100ms.** Start a goroutine and emit an event instead.

---

## Events (Push from Go to Frontend)

### Rule: Use `runtime.EventsEmit` for async push; never poll from JS.

```go
// ✅ GOOD — emit typed event from Go
func (a *App) watchProgress(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            return
        case p := <-a.svc.Progress():
            runtime.EventsEmit(a.ctx, "progress:update", map[string]int{
                "percent": p,
            })
        }
    }
}
```

```js
// frontend — receive typed event
import { EventsOn } from '../wailsjs/runtime'

EventsOn('progress:update', (data) => {
  setProgress(data.percent)
})
```

### Event naming convention

```
domain:action
```

Examples: `download:progress`, `proxy:statusChanged`, `update:available`

### Cleanup event listeners on component unmount

```js
// ✅ GOOD — React example
useEffect(() => {
    const off = EventsOn('proxy:statusChanged', handleStatus)
    return () => off()  // cleanup on unmount
}, [])
```

---

## Runtime & Thread Safety

### Rule: `runtime.*` functions (dialogs, menu, window) MUST be called from the main thread or from a binding call context.

```go
// ✅ GOOD — called inside binding (safe)
func (a *App) PickFile() (string, error) {
    path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
        Title: "Select File",
    })
    return path, err
}

// ❌ BAD — calling runtime from arbitrary goroutine
go func() {
    runtime.WindowSetTitle(a.ctx, "Done")  // undefined behavior
}()
```

### Window operations — batch, don't scatter

```go
func (a *App) startup(ctx context.Context) {
    a.ctx = ctx
    // Set window properties once, during startup
    runtime.WindowSetMinSize(ctx, 800, 600)
    runtime.WindowCenter(ctx)
}
```

---

## File Embedding

### Rule: Embed frontend/dist at build time. Never serve from disk in production.

```go
//go:embed all:frontend/dist
var assets embed.FS

// In main.go wails.Run options:
AssetServer: &assetserver.Options{
    Assets: assets,
},
```

### Dev mode: use Vite dev server with proxy

In `wails.json`:
```json
{
  "frontend": {
    "devServerUrl": "http://localhost:5173"
  }
}
```

---

## Cross-Platform Considerations

### File paths — always use `filepath`, never string concat

```go
// ❌ BAD
path := dir + "\\" + "config.json"

// ✅ GOOD
path := filepath.Join(dir, "config.json")
```

### App data directory

```go
import "github.com/wailsapp/wails/v2/pkg/runtime"

// Get user config dir (cross-platform)
func configPath() string {
    base, _ := os.UserConfigDir()
    return filepath.Join(base, "MyApp", "config.json")
}
```

### Tray icon — platform-specific menu quirks

```go
// ✅ Menu must be built before window creation OR updated via runtime
systemTray := menu.NewMenu()
systemTray.Append(menu.Text("Open", nil, func(cd *menu.CallbackData) {
    runtime.WindowShow(a.ctx)
}))
systemTray.Append(menu.Text("Quit", keys.CmdOrCtrl("q"), func(cd *menu.CallbackData) {
    runtime.Quit(a.ctx)
}))
```

---

## Performance

### Don't serialize large payloads through bindings

```go
// ❌ BAD — serializes 10k rows to JSON on every call
func (a *App) GetAllLogs() []LogEntry { return a.logs }

// ✅ GOOD — paginate
func (a *App) GetLogs(page, size int) LogPage {
    return a.svc.PageLogs(page, size)
}
```

### Debounce high-frequency events on the JS side

```js
// ❌ BAD — re-renders on every byte
EventsOn('data:chunk', (chunk) => setState(prev => prev + chunk))

// ✅ GOOD — batch updates
const buffer = useRef([])
EventsOn('data:chunk', (chunk) => {
    buffer.current.push(chunk)
})
setInterval(() => {
    if (buffer.current.length > 0) {
        setState(prev => prev + buffer.current.join(''))
        buffer.current = []
    }
}, 50)
```

---

## Security

### Never trust frontend input — validate on the Go side

```go
// ❌ BAD — frontend controls what file gets read
func (a *App) ReadFile(path string) (string, error) {
    return os.ReadFile(path)  // path traversal!
}

// ✅ GOOD — restrict to allowed directories
func (a *App) ReadFile(name string) (string, error) {
    allowedDir := filepath.Join(a.dataDir, "user-files")
    clean := filepath.Join(allowedDir, filepath.Base(name))
    if !strings.HasPrefix(clean, allowedDir) {
        return "", errors.New("access denied")
    }
    return os.ReadFile(clean)
}
```

### Don't expose sensitive env vars or credentials via bindings

```go
// ❌ BAD
func (a *App) GetConfig() AppConfig {
    return a.cfg  // contains DB passwords, API keys
}

// ✅ GOOD — return only what the UI needs
func (a *App) GetDisplayConfig() DisplayConfig {
    return DisplayConfig{Theme: a.cfg.Theme, Language: a.cfg.Lang}
}
```

---

## Common Mistakes & Red Flags

| Anti-pattern | Correct approach |
|-------------|-----------------|
| Calling `runtime.*` from goroutine | Call only from binding context or `startup` |
| Domain types as binding return values | Use explicit DTOs with json tags |
| `wailsjs/` files edited manually | Those are auto-generated; run `wails generate module` |
| Frontend owns critical app state | Go backend is source of truth |
| Blocking binding call (>100ms) | Return immediately, emit event when done |
| `os.ReadFile(path)` with user-supplied path | Sanitize with `filepath.Base` + prefix check |
| No error return on binding method | Always return `(T, error)` for fallible operations |
| `init()` with Wails runtime calls | Runtime unavailable at init; use `startup` |
| Polling from JS via `setInterval` | Use `EventsEmit` push model |
| Single `App` struct with 50+ methods | Split into domain services, bind the `App` as coordinator |

---

## Quick Reference

```bash
# Create new project
wails init -n myapp -t react-ts

# Dev mode (hot reload)
wails dev

# Build production binary
wails build -clean -upx

# Regenerate JS bindings after Go changes
wails generate module

# Build with cross-compilation (from CI)
wails build -platform windows/amd64
wails build -platform darwin/universal
wails build -platform linux/amd64
```

---

## Checklist Before Marking Code Complete

- [ ] `startup` stores `ctx`; `shutdown` calls `cancel()` and closes resources
- [ ] All bound methods are exported, on pointer receiver, return `(T, error)`
- [ ] Binding return types are explicit DTOs (not raw domain structs)
- [ ] No `runtime.*` calls from arbitrary goroutines
- [ ] User-supplied file paths sanitized before `os.ReadFile` / `os.WriteFile`
- [ ] Long operations emit events instead of blocking binding calls
- [ ] Event listeners cleaned up on JS component unmount
- [ ] `frontend/dist` embedded via `//go:embed` (not served from disk)
- [ ] File paths use `filepath.Join`, not string concatenation
- [ ] No sensitive config fields exposed through bindings
- [ ] `wails build -clean` succeeds with zero errors

Cannot check all boxes? Fix before opening PR.
