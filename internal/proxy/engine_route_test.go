// Copyright (C) 2026 ResultV
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package proxy

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestBuildRoute_NestedDomainException_ProducesProxyOverride(t *testing.T) {
	cfg := EngineConfig{
		RoutingMode: ModeWhitelist,
		Whitelist:   []string{".ru", "2ip.ru"},
	}

	route := buildRoute(cfg)
	if route == nil {
		t.Fatal("expected non-nil route")
	}

	var ruDirect bool
	var twoIPProxy bool
	var twoIPRuleIndex = -1
	var ruRuleIndex = -1

	for i, r := range route.Rules {
		if len(r.DomainSuffix) != 1 {
			continue
		}
		switch r.DomainSuffix[0] {
		case "ru":
			if r.Outbound == "direct" {
				ruDirect = true
				ruRuleIndex = i
			}
		case "2ip.ru":
			if r.Outbound == "proxy" {
				twoIPProxy = true
				twoIPRuleIndex = i
			}
		}
	}

	if !ruDirect {
		t.Fatalf("expected direct rule for ru suffix, rules=%+v", route.Rules)
	}
	if !twoIPProxy {
		t.Fatalf("expected proxy override rule for 2ip.ru suffix, rules=%+v", route.Rules)
	}
	if twoIPRuleIndex > ruRuleIndex {
		t.Fatalf("expected more specific rule (2ip.ru) before ru: twoIP=%d ru=%d", twoIPRuleIndex, ruRuleIndex)
	}
}

func TestBuildRoute_TunnelMode_IncludesSelfDirectRule(t *testing.T) {
	cfg := EngineConfig{Mode: ProxyModeTunnel}
	route := buildRoute(cfg)
	if route == nil {
		t.Fatal("expected non-nil route")
	}

	exe, err := os.Executable()
	if err != nil {
		t.Fatalf("os.Executable: %v", err)
	}
	base := filepath.Base(exe)
	want := `(?i)(^|[\\/])` + regexp.QuoteMeta(base) + `$`

	var found bool
	for _, r := range route.Rules {
		if r.Outbound != "direct" || len(r.ProcessPathRegex) == 0 {
			continue
		}
		for _, rx := range r.ProcessPathRegex {
			if rx == want {
				found = true
				break
			}
		}
		if found {
			break
		}
	}
	if !found {
		t.Fatalf("expected self direct rule with process_path_regex %q, rules=%+v", want, route.Rules)
	}
}

func TestBuildRoute_TunnelMode_ProbeDomainsRoutedThroughProxyBeforeSelfDirect(t *testing.T) {
	cfg := EngineConfig{
		Mode:  ProxyModeTunnel,
		Proxy: ProxyConfig{Type: "ss"},
	}
	route := buildRoute(cfg)
	if route == nil {
		t.Fatal("expected non-nil route")
	}

	probeIdx := -1
	selfDirectIdx := -1
	for i, r := range route.Rules {
		if r.Outbound == "proxy" && len(r.Domain) > 0 {
			for _, d := range r.Domain {
				if d == "connectivitycheck.gstatic.com" {
					probeIdx = i
					break
				}
			}
		}
		if r.Outbound == "direct" && len(r.ProcessPathRegex) > 0 {
			selfDirectIdx = i
		}
	}
	if probeIdx < 0 {
		t.Fatalf("expected probe-domain → proxy rule, rules=%+v", route.Rules)
	}
	if selfDirectIdx < 0 {
		t.Fatalf("expected self-direct rule for non-endpoint protocol")
	}
	if probeIdx > selfDirectIdx {
		t.Fatalf("probe-domain rule (idx=%d) must precede self-direct rule (idx=%d)", probeIdx, selfDirectIdx)
	}
}

func TestBuildRoute_TunnelMode_WireGuardDoesNotIncludeSelfDirectRule(t *testing.T) {
	cfg := EngineConfig{
		Mode:  ProxyModeTunnel,
		Proxy: ProxyConfig{Type: "wireguard"},
	}
	route := buildRoute(cfg)
	if route == nil {
		t.Fatal("expected non-nil route")
	}
	for _, r := range route.Rules {
		if r.Outbound == "direct" && len(r.ProcessPathRegex) > 0 {
			t.Fatalf("unexpected process self direct rule for wireguard endpoint, rules=%+v", route.Rules)
		}
	}
}

func TestBuildRoute_TunnelMode_AmneziaWGDoesNotIncludeSelfDirectRule(t *testing.T) {
	cfg := EngineConfig{
		Mode:  ProxyModeTunnel,
		Proxy: ProxyConfig{Type: "amneziawg"},
	}
	route := buildRoute(cfg)
	if route == nil {
		t.Fatal("expected non-nil route")
	}
	for _, r := range route.Rules {
		if r.Outbound == "direct" && len(r.ProcessPathRegex) > 0 {
			t.Fatalf("unexpected process self direct rule for amnezia endpoint, rules=%+v", route.Rules)
		}
	}
}

func TestBuildRoute_TunnelMode_DoesNotBlockUDP443(t *testing.T) {
	cfg := EngineConfig{
		Mode:  ProxyModeTunnel,
		Proxy: ProxyConfig{Type: "http"},
	}
	route := buildRoute(cfg)
	if route == nil {
		t.Fatal("expected non-nil route")
	}

	for _, r := range route.Rules {
		if r.Outbound != "block" || r.Action != "route" {
			continue
		}
		if len(r.Network) == 1 && r.Network[0] == "udp" && len(r.Port) == 1 && r.Port[0] == 443 {
			t.Fatalf("did not expect udp:443 block rule in tunnel mode, rules=%+v", route.Rules)
		}
	}
}

func TestBuildRoute_TunnelMode_Hysteria2DoesNotBlockUDP443(t *testing.T) {
	cfg := EngineConfig{
		Mode:  ProxyModeTunnel,
		Proxy: ProxyConfig{Type: "hysteria2"},
	}
	route := buildRoute(cfg)
	if route == nil {
		t.Fatal("expected non-nil route")
	}
	for _, r := range route.Rules {
		if r.Outbound != "block" || r.Action != "route" {
			continue
		}
		if len(r.Network) == 1 && r.Network[0] == "udp" && len(r.Port) == 1 && r.Port[0] == 443 {
			t.Fatalf("did not expect udp:443 block for hysteria2, rules=%+v", route.Rules)
		}
	}
}

func TestBuildTunnelModeConfig_WireGuardFinalTargetDefined(t *testing.T) {
	cfg := mustBuildTunnelModeConfig(t, EngineConfig{
		Mode:  ProxyModeTunnel,
		Proxy: ProxyConfig{Type: "wireguard"},
	})
	if cfg.Route == nil {
		t.Fatal("expected route")
	}
	if cfg.Route.Final != "proxy" {
		t.Fatalf("unexpected final tag: %s", cfg.Route.Final)
	}
	if err := validateRouteFinalTarget(cfg); err != nil {
		t.Fatalf("expected valid final target: %v", err)
	}
}

func TestBuildTunnelModeConfig_DNSServersPresent(t *testing.T) {
	cfg := mustBuildTunnelModeConfig(t, EngineConfig{
		Mode:  ProxyModeTunnel,
		Proxy: ProxyConfig{Type: "hysteria2"},
	})
	if cfg.DNS == nil || len(cfg.DNS.Servers) == 0 {
		t.Fatal("dns servers missing")
	}
	foundNonLocal := false
	for _, s := range cfg.DNS.Servers {
		if s.Type != "local" {
			foundNonLocal = true
		}
	}
	if !foundNonLocal {
		t.Fatal("expected at least one non-local dns server")
	}
}

func TestBuildTunnelModeConfig_SSTunnelHasTCPDNSDetour(t *testing.T) {
	cfg := mustBuildTunnelModeConfig(t, EngineConfig{
		Mode:  ProxyModeTunnel,
		Proxy: ProxyConfig{Type: "ss"},
	})
	if cfg.DNS == nil {
		t.Fatal("dns missing")
	}
	hasTCP := false
	for _, s := range cfg.DNS.Servers {
		if s.Type == "tcp" && s.Detour == "proxy" {
			hasTCP = true
			break
		}
	}
	if !hasTCP {
		t.Fatalf("expected at least one tcp dns server with proxy detour, got: %+v", cfg.DNS.Servers)
	}
}

func TestBuildTunnelModeConfig_CustomDNSUniqueTagsAndTCPForSSTunnel(t *testing.T) {
	cfg := mustBuildTunnelModeConfig(t, EngineConfig{
		Mode:       ProxyModeTunnel,
		Proxy:      ProxyConfig{Type: "SS"},
		DNSServers: []string{"8.8.8.8", "1.1.1.1"},
	})
	if cfg.DNS == nil {
		t.Fatal("dns missing")
	}
	seenTags := map[string]struct{}{}
	tcpCount := 0
	for _, s := range cfg.DNS.Servers {
		if _, ok := seenTags[s.Tag]; ok {
			t.Fatalf("duplicate dns tag found: %q in %+v", s.Tag, cfg.DNS.Servers)
		}
		seenTags[s.Tag] = struct{}{}
		if s.Type == "tcp" && s.Detour == "proxy" {
			tcpCount++
		}
	}
	if tcpCount < 2 {
		t.Fatalf("expected tcp detour servers for each custom dns, got %+v", cfg.DNS.Servers)
	}
}

func TestBuildTunnelModeConfig_IPv4OnlyServerForcesIPv4DNS(t *testing.T) {

	cfg := mustBuildTunnelModeConfig(t, EngineConfig{
		Mode:  ProxyModeTunnel,
		Proxy: ProxyConfig{IP: "185.126.67.168", Port: 443, Type: "hysteria2"},
	})
	if cfg.DNS == nil {
		t.Fatal("dns missing")
	}
	if cfg.DNS.Strategy != "ipv4_only" {
		t.Fatalf("expected ipv4_only DNS strategy for IPv4-only server, got: %q", cfg.DNS.Strategy)
	}

	cfg2 := mustBuildTunnelModeConfig(t, EngineConfig{
		Mode:  ProxyModeTunnel,
		Proxy: ProxyConfig{IP: "1.2.3.4", Port: 443, Type: "vless"},
	})
	if cfg2.DNS.Strategy != "ipv4_only" {
		t.Fatalf("expected ipv4_only for VLESS IPv4 server, got: %q", cfg2.DNS.Strategy)
	}
}

func TestBuildRoute_TunnelMode_ServerIPBypassBeforeSniff(t *testing.T) {

	cfg := EngineConfig{
		Mode:  ProxyModeTunnel,
		Proxy: ProxyConfig{IP: "185.126.67.168", Port: 443, Type: "hysteria2"},
	}
	route := buildRoute(cfg)
	if route == nil {
		t.Fatal("expected non-nil route")
	}

	bypassIdx := -1
	sniffIdx := -1
	for i, r := range route.Rules {
		if r.Action == "sniff" && sniffIdx == -1 {
			sniffIdx = i
		}
		if r.Outbound == "direct" && len(r.IPCidr) > 0 {
			for _, cidr := range r.IPCidr {
				if cidr == "185.126.67.168/32" {
					bypassIdx = i
					break
				}
			}
		}
	}

	if bypassIdx == -1 {
		t.Fatalf("expected server IP bypass rule, rules=%+v", route.Rules)
	}
	if sniffIdx == -1 {
		t.Fatalf("expected sniff rule, rules=%+v", route.Rules)
	}
	if bypassIdx >= sniffIdx {
		t.Fatalf("server IP bypass (idx=%d) must come BEFORE sniff (idx=%d) to prevent routing loops, rules=%+v",
			bypassIdx, sniffIdx, route.Rules)
	}
}

func TestSplitDNSServer(t *testing.T) {
	cases := []struct {
		in       string
		wantHost string
		wantPort int
	}{
		{in: "8.8.8.8", wantHost: "8.8.8.8", wantPort: 0},
		{in: "1.1.1.1:5353", wantHost: "1.1.1.1", wantPort: 5353},
		{in: "[2606:4700:4700::1111]:53", wantHost: "2606:4700:4700::1111", wantPort: 53},
	}
	for _, tc := range cases {
		host, port := splitDNSServer(tc.in)
		if host != tc.wantHost || port != tc.wantPort {
			t.Fatalf("splitDNSServer(%q) = (%q,%d), want (%q,%d)", tc.in, host, port, tc.wantHost, tc.wantPort)
		}
	}
}

func TestBuildProxyModeConfig_CustomDNSHaveUniqueTags(t *testing.T) {
	cfg := mustBuildProxyModeConfig(t, EngineConfig{
		Mode:       ProxyModeProxy,
		ListenAddr: "127.0.0.1:14081",
		Proxy:      ProxyConfig{Type: "SS", IP: "example.com", Port: 443, Password: "p"},
		DNSServers: []string{"8.8.8.8", "1.1.1.1"},
	})
	if cfg.DNS == nil {
		t.Fatal("dns missing")
	}
	seenTags := map[string]struct{}{}
	nonLocal := 0
	for _, s := range cfg.DNS.Servers {
		if _, ok := seenTags[s.Tag]; ok {
			t.Fatalf("duplicate dns tag found: %q in %+v", s.Tag, cfg.DNS.Servers)
		}
		seenTags[s.Tag] = struct{}{}
		if s.Type != "local" {
			nonLocal++
		}
	}
	if nonLocal < 2 {
		t.Fatalf("expected at least two custom dns servers, got %+v", cfg.DNS.Servers)
	}
}

func TestBuildProxyModeConfig_CustomDNSDirectUDP(t *testing.T) {
	// proxy-режим: custom DNS servers должны быть прямыми UDP без detour.
	// DNS через detour: proxy создавал circular dependency и ломал все соединения.
	cfg := mustBuildProxyModeConfig(t, EngineConfig{
		Mode:       ProxyModeProxy,
		ListenAddr: "127.0.0.1:14081",
		Proxy:      ProxyConfig{Type: "TROJAN", IP: "docs.meowmeowcat.top", Port: 7443, Password: "p"},
		DNSServers: []string{"8.8.8.8", "1.1.1.1"},
	})
	if cfg.DNS == nil {
		t.Fatal("dns missing")
	}
	custom := 0
	for _, s := range cfg.DNS.Servers {
		if strings.HasPrefix(s.Tag, "custom-") {
			custom++
			if s.Type != "udp" || s.Detour != "" {
				t.Fatalf("expected direct udp dns (no detour) in proxy mode, got %+v", s)
			}
		}
	}
	if custom != 2 {
		t.Fatalf("expected 2 custom dns servers, got %+v", cfg.DNS.Servers)
	}
}

func TestBuildProxyModeConfig_NoDNSRulesInProxyMode(t *testing.T) {
	// proxy-режим: без detour не нужны DNS-правила для домена прокси-сервера.
	cfg := mustBuildProxyModeConfig(t, EngineConfig{
		Mode:       ProxyModeProxy,
		ListenAddr: "127.0.0.1:14081",
		Proxy:      ProxyConfig{Type: "TROJAN", IP: "docs.meowmeowcat.top", Port: 7443, Password: "p"},
	})
	if cfg.DNS == nil {
		t.Fatal("dns missing")
	}
	if len(cfg.DNS.Rules) != 0 {
		t.Fatalf("expected no dns rules in proxy mode, got rules=%+v", cfg.DNS.Rules)
	}
}

// TestBuildProxyModeConfig_AppWhitelistEnablesFindProcess verifies that when
// the user has app exclusions, the proxy-mode config tells sing-box to
// resolve PID/process for every connection. Without find_process the
// process_path_regex rules wouldn't fire and excluded apps would still
// route through the proxy.
func TestBuildProxyModeConfig_AppWhitelistEnablesFindProcess(t *testing.T) {
	cfg := mustBuildProxyModeConfig(t, EngineConfig{
		Mode:         ProxyModeProxy,
		ListenAddr:   "127.0.0.1:14081",
		Proxy:        ProxyConfig{Type: "TROJAN", IP: "1.2.3.4", Port: 443, Password: "p"},
		AppWhitelist: []string{"steam.exe", "steamwebhelper.exe"},
	})
	if cfg.Route == nil {
		t.Fatal("route missing")
	}
	if !cfg.Route.FindProcess {
		t.Fatal("expected find_process=true when app whitelist is set, got false")
	}
}

func TestBuildProxyModeConfig_NoAppWhitelistOmitsFindProcess(t *testing.T) {
	cfg := mustBuildProxyModeConfig(t, EngineConfig{
		Mode:       ProxyModeProxy,
		ListenAddr: "127.0.0.1:14081",
		Proxy:      ProxyConfig{Type: "TROJAN", IP: "1.2.3.4", Port: 443, Password: "p"},
	})
	if cfg.Route == nil {
		t.Fatal("route missing")
	}
	if cfg.Route.FindProcess {
		t.Fatal("expected find_process=false when whitelist empty, got true")
	}
}

// TestBuildRoute_ProxyMode_AppWhitelistGetsDirectRule covers the actual
// excluded-process rule. In proxy mode the mixed inbound terminates the
// connection locally; sing-box looks up the originating PID and matches
// against process_path_regex. The rule must point at the direct outbound
// so the excluded app bypasses the tunnel.
func TestBuildRoute_ProxyMode_AppWhitelistGetsDirectRule(t *testing.T) {
	cfg := EngineConfig{
		Mode:         ProxyModeProxy,
		AppWhitelist: []string{"steam.exe", "steamwebhelper.exe"},
	}
	route := buildRoute(cfg)
	if route == nil {
		t.Fatal("route missing")
	}
	var found bool
	for _, r := range route.Rules {
		if r.Outbound != "direct" || len(r.ProcessPathRegex) == 0 {
			continue
		}
		if len(r.ProcessPathRegex) >= 2 {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected process_path_regex direct rule with both entries, rules=%+v", route.Rules)
	}
}

// TestAppWhitelistPathRegexes_BundlePathRegex verifies that for each
// whitelisted name two regexes are generated: one matching the binary basename
// at the end of the process path, and one matching anything inside a
// <name>.app bundle directory. The second regex is critical on macOS where
// apps like Safari use XPC sub-processes (e.g. com.apple.WebKit.Networking)
// that make the actual network connections and live inside Safari.app.
func TestAppWhitelistPathRegexes_BundlePathRegex(t *testing.T) {
	regexes := appWhitelistPathRegexes([]string{"Safari", "Discord"})
	// 2 entries × 2 regexes each = 4 total
	if len(regexes) != 4 {
		t.Fatalf("expected 4 regexes (2 per entry), got %d: %v", len(regexes), regexes)
	}

	type check struct {
		regex string
		path  string
		want  bool
	}
	checks := []check{
		// Binary basename regexes
		{regexes[0], "/Applications/Safari.app/Contents/MacOS/Safari", true},
		{regexes[0], "/Applications/Discord.app/Contents/MacOS/Discord", false},
		// Bundle-path regexes catch XPC sub-processes
		{regexes[1], "/Applications/Safari.app/Contents/XPCServices/com.apple.WebKit.Networking.xpc/Contents/MacOS/com.apple.WebKit.Networking", true},
		{regexes[1], "/Applications/Safari.app/Contents/MacOS/Safari", true},
		{regexes[1], "/Applications/Chromium.app/Contents/MacOS/Chromium", false},
		// Discord regexes
		{regexes[2], "/Applications/Discord.app/Contents/MacOS/Discord", true},
		{regexes[3], "/Applications/Discord.app/Contents/Frameworks/Discord Helper.app/Contents/MacOS/Discord Helper", true},
	}
	for _, c := range checks {
		re, err := regexp.Compile(c.regex)
		if err != nil {
			t.Fatalf("invalid regex %q: %v", c.regex, err)
		}
		got := re.MatchString(c.path)
		if got != c.want {
			t.Errorf("regex %q against %q: got %v, want %v", c.regex, c.path, got, c.want)
		}
	}
}
