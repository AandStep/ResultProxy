# ResultV Android Migration Plan

Migration of the ResultV desktop client (Wails v2 + Go + sing-box) to Android.
Go core stays shared; UI is rebuilt as a native Android app (Kotlin + Compose,
Material 3) that calls into Go via a `gomobile bind` AAR.

---

## Phase 0 — Go core builds for Android — ✅ DONE

- [x] `mobile` build tag on desktop-only files (Wails runtime, systray,
      autostart, killswitch).
- [x] `mobile/` Go package with gomobile-friendly API (string / int64 / bool / []byte).
- [x] Workaround for golang.org/issues/68760 (`pidfd_android.go` + `-checklinkname=0`).
- [x] First successful AAR via `gomobile bind`.

## Phase 1 — Gradle skeleton + libbox AAR loads — ✅ DONE

- [x] `android/` module: AGP 8.13, Kotlin 2.0, Compose, Java 17.
- [x] `app/build.gradle.kts` with `compileSdk=34`, `minSdk=26`, BuildConfig.
- [x] `local.properties` → `BuildConfig.VLESS_URI` for PoC test URI (gitignored).
- [x] `proguard-rules.pro` keeps `libbox.**`, `mobile.**`, `go.**`.
- [x] AAR loads in real APK; `Mobile.version()` and `Mobile.parseProxyURI()`
      verified on Pixel 9 Pro emulator (API 36).
- [x] Bind both `./mobile` + `experimental/libbox` into one AAR (sagernet's
      gomobile fork, blank-import keeps it as a direct go.mod dep).

## Phase 2 — VPN data plane (PoC) — ✅ DONE

- [x] `ResultVpnService` (foreground service, `specialUse` FGS type).
- [x] `BoxModule` singleton: `Libbox.setup`, `CommandServer`, lifecycle.
- [x] `BoxPlatform : PlatformInterface` — `openTun`, `protect`, stubs, custom
      `findConnectionOwner` that throws to dodge a wrapper nil-deref.
- [x] FD lifecycle: service owns `tunPfd`, closes on STOP/onRevoke/onDestroy.
- [x] Android-specific config tweaks in mobile wrapper:
      `strict_route=false`, `auto_route=true`, no `route_exclude_address`,
      `auto_detect_interface=false` (rejected by sing-box on Android),
      `process_path_regex` rules stripped (SELinux denies /proc/net/tcp),
      `dns.local` server replaced with `udp 1.1.1.1` via `direct` outbound
      (no resolv.conf / 127.0.0.1:53 daemon on Android).
- [x] Tested working (emulator): VLESS+REALITY+XHTTP packet-up, stream-up,
      Trojan+REALITY+gRPC.

## Phase 3 — Stability & polish — ⚠️ MOSTLY DONE

- [x] `BoxModule.start` off the main thread (single-thread Executor).
- [x] Connection state machine: `Idle / Connecting / Connected / Error` via
      `VpnState: StateFlow`, surfaced with spinner in Compose.
- [x] Notification: title+text reflect state, "Disconnect" action button.
- [x] Optimistic UI on Disconnect (state flips immediately, slow stop runs in BG).
- [x] **Live config reload** — `BoxModule.reload(configJson)` calls
      libbox's `startOrReloadService` on the running CommandServer; engine
      swaps in-place and re-invokes `BoxPlatform.openTun` so per-app routing
      changes also take effect. `ResultVpnService` runs a flow watcher
      (`combine(RoutingRulesRepository, AppRoutingRepository, ProfileRepository)
      .distinctUntilChanged().drop(1).debounce(300)`) that rebuilds the
      sing-box config and calls reload — so domain exclusions, per-app rules,
      and active-profile switches apply without disconnect/reconnect.
- [ ] Auto-reconnect on `onRevoke()` only when user re-enables, not silently.
- [x] Replace `android.R.drawable.ic_lock_lock` with a real app icon —
      adaptive launcher icon driven by the brand PNG
      (`mipmap-xxxhdpi/ic_launcher_logo.png`, 1080×1080) wrapped in
      `drawable/ic_launcher_foreground.xml` (`<inset 20%>` so the logo
      reads as a shield inside the launcher mask, white background).
      Splash screen: `drawable/splash_background.xml` (logo on
      `#060608`) + `Theme.ResultV.Splash` swapped to `Theme.ResultV` in
      `MainActivity.onCreate` before `super`. Notification small icon
      switched to `R.drawable.ic_notification` but the path didn't
      render at 24dp; left as a flat shield placeholder, low priority.
- [ ] Verify `addDisallowedApplication(packageName)` survives package rename
      for release builds.
- [ ] Drop `log.level=debug` once shipping (currently noisy but useful).

## Phase 4 — Profile management — ⚠️ FIRST SLICE DONE

- [x] Persist proxy profiles in `profiles.json` under `filesDir`
      (`ProfileRepository`, JSON-backed, reactive `StateFlow`).
- [x] `Profile` carries either source `uri` or full parsed `entryJson`.
- [x] Paste-URI import with validation via `Mobile.parseProxyURI`.
- [x] **From clipboard** + **From file (SAF)** quick-import buttons on Add screen.
- [x] Subscription import (`Mobile.fetchSubscription`):
      - Desktop-parity `User-Agent: ResultV/3.1.1`, stable `x-hwid`.
      - `Happ/1.0` UA fallback when primary lacks Hysteria2 / fails.
      - Provider URL normalisation (`/json` suffix for `my.impio.space`).
      - Auto-bundle: collapses N "<name> Auto" duplicates into one virtual
        AUTO entry whose Extra carries members inline; Connect picks
        `members[0]` (latency-driven selection — TODO).
      - Diagnostic error format with URL, response size, preview, parse counts.
- [x] Profile list with delete + active-radio (Proxies tab).
- [x] Connect path prefers `entryJson` when present, falls back to URI.
- [ ] Subscription metadata + lifecycle:
      - Need `Subscription` model (id, url, name, expiry, traffic limit, used).
      - Refresh button per subscription that re-fetches and reconciles.
      - Delete-whole-subscription that cascades to its profiles.
      - Requires Go-side change to `Mobile.fetchSubscription` to return
        `Subscription-Userinfo` / `Profile-Title` headers — **AAR rebuild**.
- [x] Manual protocol picker on Add screen — third tab "Manual" with a 3×N
      grid of protocol cards (VLESS / VMess / Trojan / Shadowsocks / Hysteria2 /
      WireGuard / AmneziaWG). Per-protocol form (typed fields, choice
      dropdowns, password masking) builds a share-URI, validates via
      `Mobile.parseProxyURI`, then persists as a normal `Profile.fromUri`.
      `ManualPane.kt`, pure Kotlin — no AAR rebuild.
      HTTP/HTTPS skipped (engine has no top-level handler); SOCKS5 deferred
      to a separate slice that requires `Profile.fromEntryJson` plumbing.
- [ ] QR-code scan import.
- [ ] Edit / rename / drag-reorder profiles.
- [ ] Latency probe + auto-pick on AUTO profile (currently always
      `members[0]`; should iterate members on connect failure).
- [ ] Favourites: persist `Profile.isFavorite` and surface in Home dropdown.

## Phase 5 — Routing & per-app rules — ⚠️ UI DONE, WIRING PENDING

- [x] `RoutingRulesRepository` — Global / Smart mode + domain exclusions list.
- [x] `AppRoutingRepository` — All / AllowList / DisallowList + selected packages.
- [x] Rules screen redesigned to mirror desktop:
      - Mode cards with green border highlight (Global active, Smart "coming soon").
      - **Domain exclusions** card — input + Add, chip list with X, Quick-add
        chips for `*.ru` `*.рф` `*.su` `*.by` `*.kz`.
      - **Per-app routing** as a section below — segmented All/Allow/Block.
- [x] Per-app routing applied in `BoxPlatform.openTun`
      (addAllowedApplication / addDisallowedApplication, mutually exclusive).
- [x] Domain exclusions wired to sing-box config —
      `Mobile.BuildSingBoxConfig{,FromEntry}` takes an `excludedDomains`
      comma-separated string. `splitDomainPatterns` classifies entries
      (`*.ru` → `domain_suffix=.ru`, `yandex.ru` → exact `domain`) and the
      builder appends a route rule routing matches to `direct`. **Must be
      AFTER the `Action: sniff` rule** — sing-box only knows the IP at TUN
      ingress; SNI/Host (and therefore the domain matcher) only become
      available after sniff runs. Live-reload via `BoxModule.reload`
      means edits apply without disconnect/reconnect (Phase 3).
- [ ] **Smart (Antizapret)** real implementation:
      - Geosite ruleset download + sing-box `route.rule_set` config.
      - Behaviour: only listed sites go through proxy, rest direct.
- [ ] Bypass-LAN toggle: skip RFC1918 + multicast + link-local.
- [ ] IPv6 toggle (currently `strategy: ipv4_only` hardcoded in mobile builder).
- [ ] Custom DNS via UI — currently DNS is hardcoded `1.1.1.1`/`8.8.8.8`.

## Phase 6 — Quality of life — 🚧 PARTIALLY DONE

- [x] Material 3 design system: `Brand` palette, `ResultVTheme` with all
      M3 slots filled (no purple leaks).
- [x] `Scaffold` + `CenterAlignedTopAppBar` + `NavigationBar` (5-tab),
      edge-to-edge via `enableEdgeToEdge()` so app draws under status bar
      while M3 Scaffold's `WindowInsets.systemBars` keeps the bottom nav
      bar above the gesture pill.
- [x] Reusable Compose components: `PowerButton`, `ServerRow`, `StatusHeader`,
      `Sparkline`, `Section` wrapper. Unified radii (20dp main cards,
      pill chips). PowerButton uses a radial-gradient halo (no blurred
      opaque disc) for a soft desktop-style glow on connected/error/connecting.
- [x] ServerRow shows numeric ping (`xx ms`, colour-coded < 80 / 80–200 /
      > 200) — placeholder values from `mockLatencyMs(profile.id)` until
      the real probe lands.
- [x] Home statistics: download/upload cards (placeholder values from
      `TrafficStats` — real numbers need libbox `CommandClient` subscription).
- [x] Settings stub:
      - Language switcher with DropdownMenu (EN / RU / ES / DE / FR / ZH) — UI only.
      - General toggles (Kill Switch, Adblock, IPv6) — disabled placeholders.
      - DNS presets via FilterChip (Auto / Google / Cloudflare / Quad9) — UI only.
- [ ] Real traffic stats wired from libbox `CommandClient`.
- [~] Real localization — **infrastructure done, partial extraction**.
      `locale/LocaleManager.kt` (DIY, persists via SharedPreferences,
      applies via `Activity.attachBaseContext` + `recreate()`),
      `res/values/strings.xml` + `values-ru/strings.xml` (~40 keys),
      Settings dropdown reduced to EN/RU and wired to `LocaleManager`.
      Extracted: tabs/top bar (`MainActivity`), `HomeScreen`,
      `SettingsScreen`, `StatusHeader` (`PowerButton.kt`), `ServerRow`
      contentDescriptions, `ResultVpnService` notification text +
      channel name. **Not extracted yet** (mechanical follow-up):
      `AddScreen` (paste/clipboard/file/manual + every protocol form),
      `ProxiesScreen` (active/delete/empty states), `RulesScreen`
      (mode cards, domain exclusions card, per-app routing card).
- [x] `vpn/SettingsRepository.kt` — persistent UI settings store
      (DNS preset/custom, kill-switch, adblock, ipv6 — placeholders
      until engine-side wiring lands in next AAR-rebuild session).
- [ ] Quick Settings tile (`TileService`) for one-tap connect.
- [ ] Always-on VPN compatibility (start with no UI input, load last profile).
- [ ] Connection-stats banner (uplink/downlink/duration) on Home.
- [ ] Battery / data usage stats from libbox `CommandClient`.
- [ ] Material You dynamic color — **dropped** at user request.

## Phase 7 — Release engineering

- [ ] Multi-ABI release build: arm64-v8a + armeabi-v7a (drop x86 unless we
      keep emulator support in CI).
- [ ] App signing config (release keystore, separate from debug).
- [ ] R8 minification + Proguard rules audit.
- [ ] AAR rebuild script in `scripts/` (`build-android-aar.ps1` + `.sh`)
      — currently the gomobile invocation lives only in this doc.
- [ ] CI: GitHub Actions builds AAR + APK on push, attaches to release.
- [ ] Play Store listing OR direct-download APK + auto-update flow.

---

## Protocol coverage matrix

| Protocol | Emulator (AVD) | Real device | Notes |
|---|---|---|---|
| VLESS + REALITY + XHTTP (packet-up) | ✅ | ⏳ untested | First PoC |
| VLESS + REALITY + XHTTP (stream-up) | ✅ | ⏳ untested | impVPN subscription |
| Trojan + REALITY + gRPC | ✅ | ⏳ untested | impVPN subscription |
| VMess | ⏳ untested | ⏳ untested | Parser & build supports it |
| Shadowsocks | ⏳ untested | ⏳ untested | Same |
| Hysteria2 | ❌ AVD UDP/QUIC NAT issues | ⏳ untested | Tunnel up, QUIC handshake times out — emulator-only fault expected |
| WireGuard | 🔒 blocked on UI | 🔒 blocked on UI | `.conf` file import not implemented yet |
| AmneziaWG | 🔒 blocked on UI | 🔒 blocked on UI | Same |

A full QA pass should happen on a real device once Phase 5 wiring + Phase 6
real-traffic-stats are in.

---

## Immediate next milestones (in priority order)

1. **Localization second pass** — extract remaining hardcoded strings on
   `AddScreen` (incl. `ManualPane` per-protocol forms), `ProxiesScreen`,
   `RulesScreen` and add RU translations. Pure-Kotlin, no rebuild.
   Mechanical work: search-and-replace `Text("…")` → `stringResource(R.string.…)`.

2. **Pure-Kotlin pending hangouts** (no AAR rebuild):
   - DNS picker → `Mobile.buildSingBoxConfig*(dnsServers=…)`. Plumbing
     point: `MainActivity.connect()` and `ResultVpnService.triggerReload()`
     currently hardcode `"8.8.8.8,1.1.1.1"`. Replace with
     `SettingsRepository.resolveDnsServers()`.
   - Auto-reconnect on revoke consent: notification with "Reconnect"
     action instead of silent stop in `ResultVpnService.onRevoke`.
   - Quick Settings tile (`TileService`) + Always-on VPN compat
     (`ResultVpnService.onStartCommand` with no `EXTRA_CONFIG_JSON`
     should load active profile from `ProfileRepository`).

3. **Subscription lifecycle** — model + UI + Go-side metadata.
   Touches: `mobile/libbox.go`, new `Subscription.kt`, `ProxiesScreen.kt`
   (collapsible subscription cards with refresh/delete), AAR rebuild.

4. **Real traffic stats** — `libbox.CommandClient` subscription that pushes
   bytes/second to `TrafficStats`. Go binding + Kotlin client thread.

5. **Engine-side flips** (need AAR rebuild, batch together):
   - IPv6 toggle (currently `strategy: ipv4_only` hardcoded in
     `mobile/libbox.go`).
   - Bypass-LAN toggle (RFC1918 + multicast + link-local skip).
   - Smart (Antizapret) with geosite ruleset.
   - `log.level=debug` → off in release builds.

---

## Known issues / tech debt

- `findConnectionOwner` throws on every connection — spammy but harmless.
- `usePlatformAutoDetectInterfaceControl=true` is set but **never fires** in
  observed logs. Bypass works only because `addDisallowedApplication(ownPkg)`
  keeps our UID off the tunnel. Revisit if always-on VPN needs platform protect.
- Gomobile uses sagernet's fork pinned at v0.1.12.
- `internal/godebug.defaultGODEBUG=multipathtcp=0` not yet wired into ldflags.
- DNS strategy hardcoded `ipv4_only`. IPv6 untested.
- TUN stack `gvisor` (sing-box default). `system` stack broke our env, kept gvisor.
- DoT (TCP/853) traffic from system DNS hits in-tunnel server (172.19.0.2)
  and gets forwarded to proxy uselessly — wastes a few seconds at start. Cosmetic.
- Connect-by-URI keeps the original URI; subscription-imported profiles
  use `entryJson`. Both paths converge through `buildSingBoxConfigFromEntry`.
- Settings are UI-only stubs — toggles and DNS choices don't wire to engine yet.

## Build cheatsheet

```bash
# from repo root
gomobile bind \
  -target=android -androidapi=26 \
  -tags="mobile,with_gvisor,with_utls,with_clash_api,with_quic,with_wireguard" \
  -ldflags="-checklinkname=0" \
  -o android/libs/libbox.aar \
  ./mobile github.com/sagernet/sing-box/experimental/libbox
```

Then in Android Studio: Sync → Run on Pixel 9 Pro emulator (API 36).
Pure-Kotlin changes don't need a rebuild — just Sync.
