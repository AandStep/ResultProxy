// Copyright (C) 2026 ResultV
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Package mobile is the gomobile-bind entrypoint for the Android client.
// All exported symbols become Java/Kotlin bindings via gomobile, so they
// must use only basic types (string, int64, bool, []byte) or
// JSON-serialised payloads. Maps, interface{}, and func parameters are
// not allowed in the public API.
package mobile

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	_ "github.com/sagernet/gomobile" // ensure sagernet's gomobile/bind stays in go.mod for AAR builds
	"resultproxy-wails/internal/config"
	"resultproxy-wails/internal/proxy"
)

// Version returns the wrapper version. Bump on every breaking change to
// the Kotlin-facing API.
func Version() string {
	return "0.2.0-poc"
}

// ParseProxyURI parses a single proxy URI (vless://, vmess://, ss://,
// trojan://, hy2://, wg://, awg://) and returns a JSON-serialised
// ProxyEntry. Useful for displaying parsed fields; the connection path
// uses BuildSingBoxConfig instead.
func ParseProxyURI(uri string) (string, error) {
	entry, err := proxy.ParseProxyURI(uri)
	if err != nil {
		return "", err
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// FetchSubscription downloads a subscription URL and parses its body
// into a JSON array of ProxyEntry objects. Handles base64-encoded,
// line-separated, and JSON subscription formats (see
// proxy.ParseSubscriptionBody).
//
// Mirrors the desktop's two-pass fetch: many panels return a richer
// config (Hysteria2, Xray JSON) only to the Happ User-Agent; we try our
// own UA first, then fall back to Happ if the primary either failed or
// produced an entry list missing Hysteria2.
//
// Returns the JSON array as a string so gomobile can shuttle it across
// the JNI boundary; Kotlin re-parses with org.json.
func FetchSubscription(subURL, dataDir string) (string, error) {
	subURL = strings.TrimSpace(subURL)
	if subURL == "" {
		return "", fmt.Errorf("subscription URL is empty")
	}
	subURL = normalizeSubscriptionURL(subURL)

	hwid, err := config.StableHardwareID(dataDir)
	if err != nil {
		// HWID isn't strictly required — some panels just won't gate the
		// real config without it. Continue and let the fetch decide.
		hwid = ""
	}

	// Match desktop's User-Agent exactly — provider gating regularly keys
	// on it, so anything with "(Android)" or version drift breaks parity.
	primaryUA := "ResultV/3.1.1"
	primary, primaryDiag, primaryErr := fetchSubscriptionWithUA(subURL, primaryUA, hwid)

	tryHapp := primaryErr != nil || !hasHysteria(primary)
	var fallbackDiag string
	if tryHapp {
		if fallback, fbDiag, err := fetchSubscriptionWithUA(subURL, "Happ/1.0", hwid); err == nil && len(fallback) > 0 {
			fallbackDiag = fbDiag
			if primaryErr != nil || len(fallback) > len(primary) {
				primary = fallback
				primaryDiag = fbDiag
				primaryErr = nil
			}
		}
	}

	if primaryErr != nil {
		return "", primaryErr
	}
	rawCount := len(primary)
	primary = proxy.FilterInvalidSubscriptionEntries(primary)
	if len(primary) == 0 {
		return "", fmt.Errorf(
			"no valid proxies in subscription (parsed=%d, filtered=%d, url=%s, primary=%s, fallback=%s)",
			rawCount, rawCount-len(primary), subURL, primaryDiag, fallbackDiag,
		)
	}

	// Mirror desktop: collapse N "<name> Auto" copies into one virtual AUTO
	// entry whose Extra carries the member entries inline. mobile picks
	// members[0] at connect time (latency-based selection comes later).
	visible := buildAutoAwareEntries(primary)

	data, err := json.Marshal(visible)
	if err != nil {
		return "", fmt.Errorf("marshaling: %w", err)
	}
	return string(data), nil
}

// buildAutoAwareEntries reproduces app.go's auto-bundling: if a subscription
// is one big auto group (or contains an auto subset), the duplicates are
// collapsed into a single AUTO virtual entry with the members embedded by
// value. The non-auto remainder is appended unchanged.
func buildAutoAwareEntries(entries []config.ProxyEntry) []config.ProxyEntry {
	if len(entries) <= 1 {
		return entries
	}

	autoMembers, autoName, individuals, ok := proxy.SplitAutoEntries(entries)
	if ok && len(autoMembers) > 1 {
		auto := config.ProxyEntry{
			Name:  autoName,
			Type:  "AUTO",
			Extra: marshalAutoMembers(autoMembers),
		}
		out := make([]config.ProxyEntry, 0, 1+len(individuals))
		out = append(out, auto)
		out = append(out, individuals...)
		return out
	}

	if sharedName, ok := proxy.ExtractAutoGroupName(entries); ok && len(entries) > 1 {
		auto := config.ProxyEntry{
			Name:  sharedName,
			Type:  "AUTO",
			Extra: marshalAutoMembers(entries),
		}
		return []config.ProxyEntry{auto}
	}

	return entries
}

func marshalAutoMembers(members []config.ProxyEntry) json.RawMessage {
	data, err := json.Marshal(map[string]interface{}{"members": members})
	if err != nil {
		return json.RawMessage(`{"members":[]}`)
	}
	return data
}

// fetchSubscriptionWithUA returns (entries, diag, err) where diag is a
// short human-readable summary used when the caller wants to surface
// why a fetch produced zero usable entries.
func fetchSubscriptionWithUA(subURL, userAgent, hwid string) ([]config.ProxyEntry, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, subURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("building request: %w", err)
	}
	req.Header.Set("User-Agent", userAgent)
	if hwid != "" {
		req.Header.Set("x-hwid", hwid)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("fetching subscription: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("subscription returned HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		return nil, "", fmt.Errorf("reading body: %w", err)
	}

	preview := string(body)
	if len(preview) > 80 {
		preview = preview[:80]
	}
	preview = strings.ReplaceAll(strings.ReplaceAll(preview, "\n", " "), "\r", "")

	entries, err := proxy.ParseSubscriptionBody(string(body))
	diag := fmt.Sprintf("ua=%q bytes=%d preview=%q parsed=%d", userAgent, len(body), preview, len(entries))
	if err != nil {
		return nil, diag, fmt.Errorf("parsing subscription (%s): %w", diag, err)
	}
	return entries, diag, nil
}

func hasHysteria(entries []config.ProxyEntry) bool {
	for _, e := range entries {
		t := strings.ToUpper(e.Type)
		if strings.Contains(t, "HYSTERIA") || strings.Contains(t, "HY2") {
			return true
		}
	}
	return false
}

// normalizeSubscriptionURL applies provider-specific URL tweaks. impio.space
// only returns the rich Xray JSON config when the path ends in /json — without
// the suffix it serves a thin Shadowsocks-only list.
func normalizeSubscriptionURL(subURL string) string {
	if u, err := url.Parse(subURL); err == nil && u.Host == "my.impio.space" {
		if !strings.HasSuffix(strings.TrimRight(u.Path, "/"), "/json") {
			u.Path = strings.TrimRight(u.Path, "/") + "/json"
			return u.String()
		}
	}
	return subURL
}

// BuildSingBoxConfig converts a proxy URI directly into a sing-box JSON
// config suitable for libbox.CommandServer.StartOrReloadService on
// Android. The TUN inbound is left in auto_route mode so libbox calls
// the platform-side OpenTun() callback (which the VpnService implements).
//
// dataDir must be a writable, app-private path — typically
// context.filesDir on Android — used by sing-box for its cache_file.
//
// dnsServers is a comma-separated list ("8.8.8.8,1.1.1.1"); pass "" for
// built-in defaults.
func BuildSingBoxConfig(uri string, dataDir string, dnsServers string) (string, error) {
	entry, err := proxy.ParseProxyURI(uri)
	if err != nil {
		return "", fmt.Errorf("parsing URI: %w", err)
	}
	return buildSingBoxConfigFromEntry(entry, dataDir, dnsServers)
}

// BuildSingBoxConfigFromEntry is the entry-based counterpart used by
// subscription imports, where entries arrive as parsed ProxyEntry JSON
// (no source URI to round-trip through). entryJson is the same JSON that
// FetchSubscription puts in its result array.
//
// AUTO envelopes (Type=="AUTO" with Extra.members) are unwrapped to the
// first member; sing-box can't multiplex these natively in our PoC
// pipeline, and a latency-driven probe will live in Connect later.
func BuildSingBoxConfigFromEntry(entryJson, dataDir, dnsServers string) (string, error) {
	var entry config.ProxyEntry
	if err := json.Unmarshal([]byte(entryJson), &entry); err != nil {
		return "", fmt.Errorf("parsing entry JSON: %w", err)
	}
	if strings.EqualFold(entry.Type, "AUTO") {
		members, err := decodeAutoMembers(entry.Extra)
		if err != nil {
			return "", fmt.Errorf("auto members: %w", err)
		}
		if len(members) == 0 {
			return "", fmt.Errorf("auto profile has no members")
		}
		entry = members[0]
	}
	return buildSingBoxConfigFromEntry(entry, dataDir, dnsServers)
}

func decodeAutoMembers(extra json.RawMessage) ([]config.ProxyEntry, error) {
	if len(extra) == 0 {
		return nil, nil
	}
	var wrap struct {
		Members []config.ProxyEntry `json:"members"`
	}
	if err := json.Unmarshal(extra, &wrap); err != nil {
		return nil, err
	}
	return wrap.Members, nil
}

func buildSingBoxConfigFromEntry(entry config.ProxyEntry, dataDir, dnsServers string) (string, error) {
	if dataDir == "" {
		return "", fmt.Errorf("dataDir is required on mobile (pass context.filesDir)")
	}

	cfg := proxy.EngineConfig{
		Proxy: proxy.ProxyConfig{
			IP:       entry.IP,
			Port:     entry.Port,
			Type:     entry.Type,
			Username: entry.Username,
			Password: entry.Password,
			URI:      entry.URI,
			Extra:    entry.Extra,
		},
		Mode:      proxy.ProxyModeTunnel,
		DataDir:   dataDir,
		TunIPv4:   "172.19.0.1/30",
		IsAndroid: true,
	}
	if dnsServers != "" {
		for _, p := range strings.Split(dnsServers, ",") {
			if s := strings.TrimSpace(p); s != "" {
				cfg.DNSServers = append(cfg.DNSServers, s)
			}
		}
	}

	sb := proxy.BuildTunnelModeConfig(cfg)

	// Android-specific overrides: VpnService can't manipulate iptables
	// or perform privileged route operations. strict_route MUST be off
	// regardless of protocol. auto_route stays on — that's the signal
	// libbox uses to call PlatformInterface.OpenTun() instead of opening
	// a tun device itself. route_exclude_address is unnecessary since
	// VpnService.protect(fd) handles server-bypass at the socket level.
	//
	// Additionally, strip any process_path_regex rules: on Android,
	// SELinux (tclass=file, proc_net_tcp_udp) prevents untrusted_app from
	// reading /proc/net/tcp, so sing-box can never resolve a process path.
	// Our own process is already excluded via addDisallowedApplication in
	// BoxPlatform.openTun, so the self-bypass rule is redundant anyway.
	for i := range sb.Inbounds {
		if sb.Inbounds[i].Type == "tun" {
			sb.Inbounds[i].StrictRoute = false
			sb.Inbounds[i].AutoRoute = true
			sb.Inbounds[i].RouteExcludeAddress = nil
		}
	}
	if sb.Route != nil {
		var filteredRules []proxy.SBRouteRule
		for _, r := range sb.Route.Rules {
			if len(r.ProcessPathRegex) == 0 {
				filteredRules = append(filteredRules, r)
			}
		}
		sb.Route.Rules = filteredRules
		// `auto_detect_interface` is rejected by sing-box's NewNetworkManager
		// on Android (route/network.go:63 — only Linux/macOS/Windows). When
		// libbox is used WITH a PlatformInterface, sing-box discovers the
		// underlying interface via our CreateDefaultInterfaceMonitor and
		// per-socket `protect(fd)` automatically; we must NOT set the flag.
		sb.Route.AutoDetect = false
	}

	// `type: local` resolves through the system resolver, which on Android
	// means /etc/resolv.conf (absent) or 127.0.0.1:53 (no daemon) — every
	// proxy-server hostname lookup fails with "connection refused" and the
	// VLESS dial never starts. Replace the local server with a real public
	// DNS dialed via `direct` outbound — that goes through Android's normal
	// network because our package is in addDisallowedApplication.
	if sb.DNS != nil {
		for i := range sb.DNS.Servers {
			if sb.DNS.Servers[i].Type == "local" {
				sb.DNS.Servers[i] = proxy.SBDNSServer{
					Type:   "udp",
					Tag:    sb.DNS.Servers[i].Tag,
					Server: "1.1.1.1",
					Detour: "direct",
				}
			}
		}
	}
	// Crank logging up during PoC so failures (REALITY handshake, XHTTP
	// transport setup, …) actually surface in logcat. Disable later.
	if sb.Log == nil {
		sb.Log = &proxy.SBLog{}
	}
	sb.Log.Level = "debug"
	sb.Log.Disabled = false

	out, err := json.MarshalIndent(sb, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshaling config: %w", err)
	}
	return string(out), nil
}
