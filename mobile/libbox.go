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
	"encoding/json"
	"fmt"
	"strings"

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
	if dataDir == "" {
		return "", fmt.Errorf("dataDir is required on mobile (pass context.filesDir)")
	}

	entry, err := proxy.ParseProxyURI(uri)
	if err != nil {
		return "", fmt.Errorf("parsing URI: %w", err)
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
