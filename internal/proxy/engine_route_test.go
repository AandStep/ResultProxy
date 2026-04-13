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
	cfg := BuildTunnelModeConfig(EngineConfig{
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
	cfg := BuildTunnelModeConfig(EngineConfig{
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

func TestBuildTunnelModeConfig_IPv4OnlyServerForcesIPv4DNS(t *testing.T) {
	
	
	
	cfg := BuildTunnelModeConfig(EngineConfig{
		Mode:  ProxyModeTunnel,
		Proxy: ProxyConfig{IP: "185.126.67.168", Port: 443, Type: "hysteria2"},
	})
	if cfg.DNS == nil {
		t.Fatal("dns missing")
	}
	if cfg.DNS.Strategy != "ipv4_only" {
		t.Fatalf("expected ipv4_only DNS strategy for IPv4-only server, got: %q", cfg.DNS.Strategy)
	}

	
	cfg2 := BuildTunnelModeConfig(EngineConfig{
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
