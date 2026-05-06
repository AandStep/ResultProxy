# ResultV Android Migration Plan

Migration of the ResultV desktop client (Wails v2 + Go + sing-box) to Android.
Go core stays shared; UI is rebuilt as a native Android app (Kotlin + Compose)
that calls into Go via a `gomobile bind` AAR.

---

## Phase 0 — Go core builds for Android — ✅ DONE

- [x] Add `mobile` build tag to desktop-only files (Wails runtime, systray,
      autostart, killswitch, …) so the core compiles for `GOOS=android`.
- [x] Carve out a `mobile/` Go package with a narrow gomobile-friendly API
      (string / int64 / bool / []byte only).
- [x] Workaround for golang.org/issues/68760 (`pidfd_android.go` + `-checklinkname=0`).
- [x] First successful AAR via `gomobile bind`.

## Phase 1 — Gradle skeleton + libbox AAR loads — ✅ DONE

- [x] `android/` module: AGP 8.13, Kotlin 2.0, Compose, Java 17.
- [x] `app/build.gradle.kts` with `compileSdk=34`, `minSdk=26`, BuildConfig.
- [x] `local.properties` → `BuildConfig.VLESS_URI` for PoC test URI (gitignored).
- [x] `proguard-rules.pro` keeps `libbox.**`, `mobile.**`, `go.**`.
- [x] AAR loads in real APK; `Mobile.version()` and `Mobile.parseProxyURI()`
      verified on Pixel 9 Pro emulator (API 36, x86_64).
- [x] Bind both `./mobile` + `experimental/libbox` into one AAR (sagernet's
      gomobile fork, `_ "github.com/sagernet/gomobile"` blank import).

## Phase 2 — VPN data plane (PoC) — ✅ DONE

- [x] `ResultVpnService` (foreground service, `specialUse` FGS type).
- [x] `BoxModule` singleton: `Libbox.setup`, `CommandServer`, lifecycle.
- [x] `BoxPlatform : PlatformInterface` — `openTun`, `protect`, stubs for
      the rest. `findConnectionOwner` throws to avoid wrapper nil-deref.
- [x] FD lifecycle: service owns `tunPfd`, closes on STOP/onRevoke/onDestroy.
- [x] Android-specific config tweaks in mobile wrapper:
      `strict_route=false`, `auto_route=true`, no `route_exclude_address`,
      `auto_detect_interface=false` (rejected by sing-box on Android),
      `process_path_regex` rules stripped (SELinux denies /proc/net/tcp),
      `dns.local` server replaced with `udp 1.1.1.1` via `direct` outbound
      (no resolv.conf / 127.0.0.1:53 daemon on Android).
- [x] Tested working: VLESS+REALITY+XHTTP (packet-up + stream-up),
      Trojan+REALITY+gRPC.

## Phase 3 — Stability & polish — ⚠️ MOSTLY DONE

- [x] Move `BoxModule.start` off the main thread (single-thread Executor).
- [x] Connection state machine + UI: `Idle / Connecting / Connected / Error`
      via `VpnState: StateFlow`, surfaced in Compose with a spinner.
- [x] Proper notification: title+text reflect current state, "Disconnect"
      action button on the notification itself.
- [x] Optimistic UI on Disconnect: state flips to Idle immediately, slow
      `BoxModule.stop` runs in background; tun fd closed synchronously
      so the system VPN icon drops at once.
- [ ] Auto-reconnect on `onRevoke()` only when user re-enables, not silently.
- [ ] Replace `android.R.drawable.ic_lock_lock` with a real app icon.
- [ ] Verify `addDisallowedApplication(packageName)` survives package rename
      for release builds.
- [ ] Drop `log.level=debug` once shipping (currently noisy but useful).

## Phase 4 — Profile management — ⚠️ FIRST SLICE DONE

- [x] Persist proxy profiles in `profiles.json` under `filesDir`
      (`ProfileRepository`, JSON-backed, reactive `StateFlow`).
- [x] `Profile` model carries either source `uri` or full parsed `entryJson`
      (subscription Xray-JSON has no source URI).
- [x] Paste-URI import with validation via `Mobile.parseProxyURI`.
- [x] Subscription import (`Mobile.fetchSubscription`):
      - HTTP fetch with desktop-parity `User-Agent: ResultV/3.1.1`
        and stable `x-hwid` header (via `config.StableHardwareID`).
      - `Happ/1.0` UA fallback when primary lacks Hysteria2 / fails.
      - Provider URL normalisation (`/json` suffix for `my.impio.space`).
      - Auto-bundle: collapses N "<name> Auto" duplicates into one virtual
        AUTO entry whose Extra carries members inline; Connect picks
        `members[0]` (latency-driven selection — TODO).
      - Diagnostic error format includes URL, response size, preview, parse
        counts so failures are debuggable from the UI.
- [x] Profile list with radio-select active, delete-per-row.
- [x] Connect path: prefers `entryJson` when present, falls back to URI.
- [ ] QR-code scan import.
- [ ] File import (`.txt` clipboard / `.conf` for WG/AWG).
- [ ] Edit / rename / drag-reorder profiles.
- [ ] Latency probe + auto-pick on AUTO profile (currently always
      `members[0]`; should iterate members on connect failure).

## Phase 5 — Routing & per-app rules — 🚧 NEXT

- [ ] Per-app routing UI: list installed apps, toggle proxy / direct / block.
- [ ] Map UI selection → `addAllowedApplication` / `addDisallowedApplication`
      on `VpnService.Builder` (mutually exclusive — pick one mode).
- [ ] Persist app selection per profile or globally (TBD).
- [ ] Bypass-LAN toggle: skip RFC1918 + multicast + link-local.
- [ ] Optional rule-sets / GeoIP (reuse desktop's path).
- [ ] DNS settings UI (custom servers, strategy, fakeip toggle).
- [ ] IPv6 toggle (currently `strategy: ipv4_only` hardcoded).

## Phase 6 — Quality of life

- [ ] Quick Settings tile (`TileService`) for one-tap connect to active profile.
- [ ] Always-on VPN compatibility: service must start with no UI input,
      load the last-active profile, or fail closed cleanly.
- [ ] Battery / data usage stats from libbox `CommandClient`.
- [ ] Localization: ru + en (mirror desktop `frontend/src/locales/`).
- [ ] Dark / light theme; Material You where available.
- [ ] Connection-stats banner (uplink/downlink/duration).

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
| VMess | ⏳ untested | ⏳ untested | Parser known, sing-box build supports it |
| Shadowsocks | ⏳ untested | ⏳ untested | Same |
| Hysteria2 | ❌ AVD UDP/QUIC NAT issues | ⏳ untested | Tunnel comes up, QUIC handshake times out — emulator-only fault expected |
| WireGuard | 🔒 blocked on UI | 🔒 blocked on UI | `.conf` file import not implemented yet |
| AmneziaWG | 🔒 blocked on UI | 🔒 blocked on UI | Same |

A full QA pass should happen on a real device once Phase 5 + Phase 6 land.

---

## Known issues / tech debt

- `findConnectionOwner` throws on every connection — spammy but harmless.
  Eventually return a sentinel "unknown" owner once the libbox wrapper
  supports it (currently it nil-derefs on a clean `(nil, err)` return).
- `usePlatformAutoDetectInterfaceControl=true` is set but **never fires**
  in observed logs — `protect()` is not invoked. Bypass works only because
  `addDisallowedApplication(packageName)` keeps our own UID off the tunnel.
  If we ever stop being a foreground caller (e.g. always-on VPN spawning
  via system trigger), revisit this.
- Gomobile uses sagernet's fork pinned at v0.1.12; `go.mod` carries a blank
  import to keep it as a direct dependency.
- `internal/godebug.defaultGODEBUG=multipathtcp=0` not yet wired into our
  ldflags (sing-box's own build script sets it). Probably fine for PoC.
- DNS strategy is hardcoded to `ipv4_only` — IPv6 untested.
- TUN stack is `gvisor` (sing-box default). The `system` stack broke the
  manually-pasted server in our environment, so we kept gvisor. Worth
  re-evaluating on a real device.
- DoT (TCP/853) traffic from Android system to our in-tunnel DNS server
  (172.19.0.2) gets forwarded to the proxy server which can't reach a
  private IP — wastes a few seconds at start. Cosmetic.
- Connect-by-URI keeps the original URI string; subscription-imported
  profiles don't have one (built from Xray-JSON). Both paths converge
  through `buildSingBoxConfigFromEntry`.

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
