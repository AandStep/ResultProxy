---
name: senior-react-developer
description: Use when writing, reviewing, or refactoring React code — applies idiomatic component design, state management discipline, performance optimization, and testing best practices as a senior React engineer would
---

## Overview
React rewards composability, predictability, and explicit data flow. Senior React code is readable, performant, and testable — not clever.

**Core principle:** UI = f(state). If a component is hard to test, it's hard to reason about — refactor the state, not the test.

**Violating the separation of concerns violates the spirit of React.**

---

## The Iron Laws

```
STATE BELONGS AS LOW AS POSSIBLE — LIFT ONLY WHEN NECESSARY
EFFECTS ARE FOR SYNCHRONIZATION — NOT BUSINESS LOGIC
COMPONENTS ARE PURE — SAME PROPS = SAME OUTPUT (within a render)
```

---

## Component Design

### Rule: One responsibility per component. If you need to scroll to understand it, split it.

```tsx
// ❌ BAD — god component, handles data fetching, UI, and business logic
function UserPage() {
  const [user, setUser] = useState(null)
  const [orders, setOrders] = useState([])
  useEffect(() => {
    fetch('/api/user').then(r => r.json()).then(setUser)
    fetch('/api/orders').then(r => r.json()).then(setOrders)
  }, [])
  // 200+ lines of JSX...
}

// ✅ GOOD — each piece has a single job
function UserPage() {
  return (
    <UserProvider>
      <UserHeader />
      <OrderList />
    </UserProvider>
  )
}
```

### Prefer function components. Never use class components in new code.

```tsx
// ❌ BAD — class component
class Counter extends React.Component {
  state = { count: 0 }
  render() { return <button onClick={() => this.setState(s => ({count: s.count + 1}))}>{this.state.count}</button> }
}

// ✅ GOOD
function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
```

### Name components explicitly. Anonymous arrow functions in exports → debugging pain.

```tsx
// ❌ BAD
export default () => <div>Hello</div>

// ✅ GOOD
export function WelcomeMessage() {
  return <div>Hello</div>
}
```

---

## Props & Types

### Rule: Every component's props MUST have an explicit TypeScript interface.

```tsx
// ❌ BAD — no type safety
function Button({ label, onClick, disabled }) { ... }

// ✅ GOOD
interface ButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'ghost'
}

function Button({ label, onClick, disabled = false, variant = 'primary' }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={styles[variant]}
    >
      {label}
    </button>
  )
}
```

### Avoid prop drilling beyond 2 levels — use Context or composition

```tsx
// ❌ BAD — drilling theme through 4 levels
<Page theme={theme}>
  <Layout theme={theme}>
    <Sidebar theme={theme}>
      <NavItem theme={theme} />
    </Sidebar>
  </Layout>
</Page>

// ✅ GOOD — Context for cross-cutting concerns
const ThemeContext = createContext<Theme>(defaultTheme)

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

function NavItem() {
  const theme = useContext(ThemeContext)
  return <li style={{ color: theme.primary }}>...</li>
}
```

---

## State Management

### Rule: State that only one component needs → local. State that siblings need → lift. State that the whole app needs → Context / external store.

```tsx
// ❌ BAD — global store for UI-only toggle state
const useStore = create(set => ({ isMenuOpen: false, toggleMenu: () => set(s => ({ isMenuOpen: !s.isMenuOpen })) }))

// ✅ GOOD — local state for local concerns
function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  return ...
}
```

### Always use functional updates when new state depends on old state

```tsx
// ❌ BAD — stale closure
setCount(count + 1)

// ✅ GOOD — functional update
setCount(prev => prev + 1)
```

### Derived state: compute from existing state, don't duplicate

```tsx
// ❌ BAD — duplicated state that can drift
const [items, setItems] = useState<Item[]>([])
const [count, setCount] = useState(0) // must be kept in sync manually

// ✅ GOOD — derive count from source of truth
const [items, setItems] = useState<Item[]>([])
const count = items.length // always correct
```

---

## Hooks

### Rule: Custom hooks extract stateful logic, not JSX. Name them `use*`.

```tsx
// ❌ BAD — logic scattered across component
function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchUser(userId)
      .then(setUser)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [userId])
  // ...
}

// ✅ GOOD — logic in a reusable hook
function useUser(userId: string) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchUser(userId)
      .then(data => { if (!cancelled) setUser(data) })
      .catch(err => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true } // cleanup on unmount / id change
  }, [userId])

  return { user, loading, error }
}

function UserProfile({ userId }: { userId: string }) {
  const { user, loading, error } = useUser(userId)
  if (loading) return <Spinner />
  if (error) return <ErrorMessage error={error} />
  return <UserCard user={user!} />
}
```

### useEffect discipline — the most abused hook

| Correct use | Wrong use |
|-------------|-----------|
| Syncing with external system (DOM, WebSocket) | Transforming data (use `useMemo` or compute inline) |
| Starting/stopping subscriptions | Deriving state from props |
| Fetching data (prefer React Query / SWR) | Responding to events (use handlers) |

```tsx
// ❌ BAD — effect as event handler
useEffect(() => {
  if (submitted) {
    saveData(formData)
    setSubmitted(false)
  }
}, [submitted])

// ✅ GOOD — handler as event handler
function handleSubmit() {
  saveData(formData)
}
```

### Always return cleanup from effects with subscriptions

```tsx
// ✅ GOOD
useEffect(() => {
  const subscription = eventBus.on('update', handleUpdate)
  return () => subscription.off()
}, [])
```

---

## Performance

### Rule: Optimize only after measuring. Premature memoization adds complexity with zero gain.

### useMemo / useCallback — only when the cost is proven

```tsx
// ❌ BAD — memoizing a trivial computation
const greeting = useMemo(() => `Hello, ${name}!`, [name])

// ✅ GOOD — memoize only expensive computations or stable references
const sortedItems = useMemo(
  () => [...items].sort(compareByDate),
  [items] // only recomputes when items change
)

// ✅ GOOD — stable callback reference passed to memoized child
const handleSelect = useCallback((id: string) => {
  onSelect(id)
}, [onSelect])
```

### React.memo — for expensive pure components with stable props

```tsx
// ✅ GOOD — prevents re-render when parent re-renders but props haven't changed
const ExpensiveChart = React.memo(function Chart({ data }: ChartProps) {
  return <canvas>{/* expensive render */}</canvas>
})
```

### Code splitting with lazy + Suspense

```tsx
// ✅ GOOD — load heavy pages only when navigated to
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function App() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Suspense>
  )
}
```

### List rendering — always use stable keys. Never use array index as key for dynamic lists.

```tsx
// ❌ BAD — index as key causes incorrect reconciliation on reorder/delete
{items.map((item, index) => <Item key={index} item={item} />)}

// ✅ GOOD — stable, unique identity
{items.map(item => <Item key={item.id} item={item} />)}
```

---

## Data Fetching

### Rule: Use React Query or SWR for server state. `useState + useEffect` for fetching = reinventing the wheel badly.

```tsx
// ❌ BAD — manual fetch with no caching, deduplication, or retry
const [data, setData] = useState(null)
useEffect(() => { fetch('/api/data').then(r => r.json()).then(setData) }, [])

// ✅ GOOD — React Query handles caching, background refresh, loading/error states
import { useQuery } from '@tanstack/react-query'

function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: () => api.getProducts(),
    staleTime: 60_000, // 1 minute
  })
}

function ProductList() {
  const { data: products, isLoading, error } = useProducts()
  if (isLoading) return <Spinner />
  if (error) return <ErrorMessage error={error} />
  return <ul>{products!.map(p => <ProductItem key={p.id} product={p} />)}</ul>
}
```

### Mutations — invalidate cache after success

```tsx
// ✅ GOOD
const queryClient = useQueryClient()

const updateProduct = useMutation({
  mutationFn: api.updateProduct,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['products'] })
  },
})
```

---

## Forms

### Rule: Use react-hook-form for non-trivial forms. Avoid controlled inputs for every keystroke.

```tsx
// ❌ BAD — state update on every keystroke, re-renders entire form
const [name, setName] = useState('')
const [email, setEmail] = useState('')
<input value={name} onChange={e => setName(e.target.value)} />

// ✅ GOOD — uncontrolled with validation
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
})

function ContactForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name && <span>{errors.name.message}</span>}
    </form>
  )
}
```

---

## Error Handling

### Rule: Every async boundary needs an error state. Every async boundary needs an Error Boundary.

```tsx
// ✅ GOOD — Error Boundary for unexpected render errors
import { ErrorBoundary } from 'react-error-boundary'

function App() {
  return (
    <ErrorBoundary fallback={<CrashPage />} onError={logError}>
      <Router />
    </ErrorBoundary>
  )
}
```

### Never swallow errors silently

```tsx
// ❌ BAD
try {
  await saveUser(user)
} catch {
  // silent failure
}

// ✅ GOOD — surface error to user
try {
  await saveUser(user)
} catch (err) {
  toast.error('Failed to save user: ' + getErrorMessage(err))
  reportError(err)
}
```

---

## Testing

### Rule: Test behavior, not implementation. If a test breaks on refactor without changing behavior — the test is wrong.

```tsx
// ❌ BAD — tests implementation details
expect(component.state.isLoading).toBe(true)
expect(component.instance().fetchData).toHaveBeenCalled()

// ✅ GOOD — tests what the user sees
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

test('shows product list after loading', async () => {
  render(<ProductList />)
  expect(screen.getByRole('progressbar')).toBeInTheDocument()
  await waitFor(() => {
    expect(screen.getByText('Widget Pro')).toBeInTheDocument()
  })
})

test('filters products by search term', async () => {
  const user = userEvent.setup()
  render(<ProductList />)
  await user.type(screen.getByRole('searchbox'), 'widget')
  expect(screen.getByText('Widget Pro')).toBeInTheDocument()
  expect(screen.queryByText('Gadget Basic')).not.toBeInTheDocument()
})
```

### Prefer `@testing-library/react`. Never test with Enzyme in new code.

### Mock at the network boundary, not inside components

```tsx
// ✅ GOOD — mock the API module, not internal hooks
vi.mock('../api/products', () => ({
  getProducts: vi.fn().mockResolvedValue([{ id: '1', name: 'Widget Pro' }]),
}))
```

---

## Project Structure

```
/src
├── app/                 — app-level setup (Router, Providers, global styles)
├── pages/               — route-level components (thin, compose features)
├── features/            — feature slices (self-contained: component + hook + api + types)
│   └── products/
│       ├── ProductList.tsx
│       ├── useProducts.ts
│       ├── productsApi.ts
│       └── types.ts
├── components/          — shared, reusable UI components (Button, Modal, etc.)
├── hooks/               — shared custom hooks
├── lib/                 — third-party wrappers, utilities
└── types/               — global TypeScript types
```

### Rule: features/ is self-contained. If two features share something — move it to components/ or hooks/.

---

## Common Mistakes & Red Flags

| Anti-pattern | Correct approach |
|-------------|-----------------|
| `useEffect` as event handler | Use event handler functions |
| Stale closure in effect | Add dependency to `deps` array or use `useCallback` |
| Array index as key in dynamic list | Use stable `item.id` |
| Prop drilling beyond 2 levels | Context or composition |
| Deriving state from props in effect | Compute inline or in `useMemo` |
| Anonymous default export | Named function export |
| `useState` for server data | React Query / SWR |
| Controlled input for every field | `react-hook-form` |
| Testing implementation details | Test behavior via `@testing-library/react` |
| Missing error boundary | Wrap async subtrees in `<ErrorBoundary>` |
| `console.log` left in production code | Remove or use structured logger |
| Direct DOM manipulation with `document.*` | Use `useRef` + React APIs |

---

## Quick Reference

```bash
# Run tests with coverage
npx vitest run --coverage

# Run tests in watch mode
npx vitest

# Type check
npx tsc --noEmit

# Lint
npx eslint src --ext .ts,.tsx

# Build
npm run build
```

---

## Checklist Before Marking Code Complete

- [ ] Every component has explicit TypeScript props interface
- [ ] No `any` type without a comment explaining why
- [ ] No `useEffect` used as event handler
- [ ] Effects with subscriptions return cleanup function
- [ ] Dynamic lists use stable `item.id` keys (not array index)
- [ ] Server state managed by React Query / SWR (not manual `useState + useEffect`)
- [ ] State lives at the lowest necessary level (no premature global state)
- [ ] `useMemo` / `useCallback` added only where profiling shows a need
- [ ] Async operations exposed behind Error Boundaries
- [ ] Tests cover behavior, not implementation — written with `@testing-library/react`
- [ ] `tsc --noEmit` passes with zero errors
- [ ] `eslint` passes with zero errors

Cannot check all boxes? Fix before opening PR.
