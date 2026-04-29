//go:build darwin

package system

import (
	"strings"
	"testing"
)

func TestBuildPFRulesAlwaysBlocksByDefault(t *testing.T) {
	got := buildPFRules("")
	if !strings.Contains(got, "block out all") {
		t.Fatalf("expected default block: %s", got)
	}
	if strings.Contains(got, "pass out from any to \n") {
		t.Fatalf("empty proxy IP should not produce empty pass rule: %s", got)
	}
}

func TestBuildPFRulesAddsProxyPass(t *testing.T) {
	got := buildPFRules("1.2.3.4")
	if !strings.Contains(got, "pass out from any to 1.2.3.4") {
		t.Fatalf("expected proxy pass rule, got: %s", got)
	}
}

func TestBuildPFRulesAllowsLAN(t *testing.T) {
	got := buildPFRules("")
	for _, want := range []string{
		"127.0.0.0/8",
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"port 53",
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
