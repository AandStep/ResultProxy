//go:build linux

package system

import (
	"strings"
	"testing"
)

func TestBuildNftablesRulesetDefaultDrop(t *testing.T) {
	got := buildNftablesRuleset("")
	if !strings.Contains(got, "policy drop;") {
		t.Fatalf("expected default-drop policy, got: %s", got)
	}
	if !strings.Contains(got, "table inet "+nftTableName) {
		t.Fatalf("expected table declaration, got: %s", got)
	}
}

func TestBuildNftablesRulesetAddsIPv4Proxy(t *testing.T) {
	got := buildNftablesRuleset("1.2.3.4")
	if !strings.Contains(got, "ip daddr 1.2.3.4 accept") {
		t.Fatalf("expected ipv4 proxy accept, got: %s", got)
	}
	if strings.Contains(got, "ip6 daddr 1.2.3.4") {
		t.Fatalf("ipv4 should not be emitted as ip6, got: %s", got)
	}
}

func TestBuildNftablesRulesetAddsIPv6Proxy(t *testing.T) {
	got := buildNftablesRuleset("::1")
	if !strings.Contains(got, "ip6 daddr ::1 accept") {
		t.Fatalf("expected ipv6 proxy accept, got: %s", got)
	}
}

func TestBuildNftablesRulesetAllowsLAN(t *testing.T) {
	got := buildNftablesRuleset("")
	for _, want := range []string{
		"127.0.0.0/8",
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"oif lo accept",
		"udp dport 53 accept",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("expected %q in ruleset, got: %s", want, got)
		}
	}
}

func TestExtractValidIP(t *testing.T) {
	cases := map[string]string{
		"1.2.3.4:8080":     "1.2.3.4",
		"127.0.0.1:7890":   "127.0.0.1",
		"[::1]:80":         "::1",
		"":                 "",
		"not-an-ip:1":      "",
		"example.com:1234": "",
	}
	for in, want := range cases {
		if got := extractValidIP(in); got != want {
			t.Errorf("extractValidIP(%q) = %q, want %q", in, got, want)
		}
	}
}
