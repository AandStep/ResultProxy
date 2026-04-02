---
name: senior-go-developer
description: Use when writing, reviewing, or refactoring Go code — applies idiomatic Go patterns, concurrency safety, error handling discipline, and performance best practices as a senior Go engineer would
---

## Overview
Go rewards simplicity, explicitness, and composition. Senior Go code is readable, testable, and correct — not clever.

**Core principle:** Idiomatic Go > clever Go. If it requires a comment to explain what it does, rewrite it.

**Violating the letter of these rules is violating the spirit of Go.**

## The Iron Laws

```
ERRORS ARE VALUES — ALWAYS HANDLE THEM
GOROUTINES MUST HAVE AN OWNER — ALWAYS KNOW WHO STOPS THEM
INTERFACES BELONG TO THE CONSUMER — DEFINE AT POINT OF USE
```

---

## Error Handling

### Rule: Handle every error. Name errors descriptively.

```go
// ❌ BAD
result, _ := doSomething()

// ❌ BAD — lost context
if err != nil {
    return err
}

// ✅ GOOD — wrap with context
if err != nil {
    return fmt.Errorf("loading config from %s: %w", path, err)
}
```

### Sentinel errors — only for callers who need to branch

```go
var ErrNotFound = errors.New("not found")

// ✅ Correct check
if errors.Is(err, ErrNotFound) { ... }
```

### Custom error types — only when carrying structured data

```go
type ValidationError struct {
    Field   string
    Message string
}
func (e *ValidationError) Error() string {
    return fmt.Sprintf("validation failed on %s: %s", e.Field, e.Message)
}
```

---

## Concurrency

### Rule: Every goroutine must have a clear owner who can stop it.

```go
// ✅ GOOD — structured concurrency with WaitGroup
func processAll(ctx context.Context, items []Item) error {
    var wg sync.WaitGroup
    errc := make(chan error, len(items))

    for _, item := range items {
        wg.Add(1)
        go func(it Item) {
            defer wg.Done()
            if err := process(ctx, it); err != nil {
                errc <- err
            }
        }(item)
    }

    wg.Wait()
    close(errc)
    return <-errc // first error or nil
}
```

### Channels vs Mutex — pick the right tool

| Scenario | Use |
|----------|-----|
| Passing ownership of data | `chan` |
| Signaling events | `chan struct{}` |
| Protecting shared state | `sync.Mutex` |
| One-time initialization | `sync.Once` |
| Read-heavy shared state | `sync.RWMutex` |

### Always respect context cancellation

```go
select {
case <-ctx.Done():
    return ctx.Err()
case result := <-resultCh:
    return result, nil
}
```

---

## Interfaces

### Rule: Define interfaces where they are consumed, not where implemented.

```go
// ❌ BAD — in the producer package
package storage
type Storer interface { Store([]byte) error }

// ✅ GOOD — in the consumer package
package service
type dataStore interface { Store([]byte) error }
```

### Keep interfaces small

```go
// ❌ BAD — god interface
type Repository interface {
    Create(...) error
    Read(...) (T, error)
    Update(...) error
    Delete(...) error
    List(...) ([]T, error)
    Count(...) (int, error)
}

// ✅ GOOD — minimal interfaces composed at use site
type Reader interface { Read(id string) (T, error) }
type Writer interface { Write(T) error }
```

---

## Project Structure

```
/cmd/appname/main.go      — entry point, wires dependencies
/internal/                 — private packages, not importable externally
/internal/domain/          — business logic, no infrastructure deps
/internal/service/         — orchestration layer
/internal/repository/      — data access
/pkg/                      — public reusable packages
```

### main.go rule: wire only, no logic

```go
func main() {
    cfg := config.MustLoad()
    db  := postgres.MustConnect(cfg.DSN)
    svc := service.New(repository.New(db))
    server.New(svc).Run(cfg.Addr)
}
```

---

## Performance

### Slice / Map pre-allocation

```go
// ✅ Pre-allocate when size is known
result := make([]T, 0, len(input))
m      := make(map[string]T, len(keys))
```

### Avoid heap allocations in hot paths

```go
// ✅ Use sync.Pool for reusable objects
var bufPool = sync.Pool{New: func() any { return new(bytes.Buffer) }}

buf := bufPool.Get().(*bytes.Buffer)
defer func() { buf.Reset(); bufPool.Put(buf) }()
```

### String building

```go
// ❌ BAD — O(n²) concatenation
s := ""
for _, part := range parts { s += part }

// ✅ GOOD
var b strings.Builder
for _, part := range parts { b.WriteString(part) }
s := b.String()
```

---

## Testing

### Table-driven tests — always

```go
func TestFoo(t *testing.T) {
    cases := []struct {
        name    string
        input   string
        want    string
        wantErr bool
    }{
        {"happy path", "a", "A", false},
        {"empty", "", "", true},
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            got, err := Foo(tc.input)
            if (err != nil) != tc.wantErr {
                t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
            }
            if got != tc.want {
                t.Errorf("got %q, want %q", got, tc.want)
            }
        })
    }
}
```

### Use `t.Helper()` in test helpers

```go
func assertNoError(t *testing.T, err error) {
    t.Helper() // points to caller in failure output
    if err != nil { t.Fatalf("unexpected error: %v", err) }
}
```

### Avoid mocks — prefer real implementations or fakes

```go
// ✅ GOOD — in-memory fake
type fakeStore struct{ data map[string][]byte }
func (f *fakeStore) Store(key string, val []byte) error { f.data[key] = val; return nil }
```

---

## Common Mistakes & Red Flags

| Anti-pattern | Correct approach |
|-------------|------------------|
| `err != nil` without wrapping | `fmt.Errorf("context: %w", err)` |
| Goroutine without cancel/wait | Use `errgroup` or `WaitGroup` + `ctx` |
| Interface in producer package | Move interface to consumer |
| `panic` in library code | Return error instead |
| `init()` with side effects | Explicit initialization in `main` |
| Global mutable state | Inject dependencies |
| `time.Sleep` in tests | Use channels/conditions |
| Ignoring `golangci-lint` | Fix all lints before merging |

---

## Quick Reference

```bash
# Run tests with race detector — ALWAYS
go test -race ./...

# Benchmarks
go test -bench=. -benchmem ./...

# Lint (required before PR)
golangci-lint run ./...

# Build for production
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/app ./cmd/app
```

---

## Checklist Before Marking Code Complete

- [ ] Every error is handled and wrapped with context
- [ ] Every goroutine has an owner and respects `ctx.Done()`
- [ ] Interfaces defined in consumer packages, minimal surface
- [ ] Table-driven tests cover happy path + edge cases + errors
- [ ] `go test -race ./...` passes
- [ ] `golangci-lint run ./...` passes with zero issues
- [ ] No `panic` in library/service code
- [ ] No global mutable state; dependencies injected
- [ ] Hot paths pre-allocate slices/maps

Cannot check all boxes? Fix before opening PR.
