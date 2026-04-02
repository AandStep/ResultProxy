package proxy

import (
	"os"
	"testing"
)

func TestNormalizeRule(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"example.com", "example.com"},
		{"*.ru", "ru"},
		{".ru", "ru"},
		{"ru", "ru"},
		{"*.example.com", "example.com"},
		{"https://example.com/path", "example.com"},
		{"http://example.com/", "example.com"},
		{"  Example.COM  ", "example.com"},
		{"**..test..**", "test"},
		{"", ""},
	}

	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			got := normalizeRule(tc.input)
			if got != tc.want {
				t.Errorf("normalizeRule(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestIsWhitelisted_SingleMatch(t *testing.T) {
	r := NewRouter()
	// ".ru" matches "avito.ru" → 1 match → bypass
	result := r.IsWhitelisted("avito.ru", []string{".ru"})
	if !result.IsWhitelisted {
		t.Error("expected avito.ru to be whitelisted with rule .ru")
	}
	if len(result.MatchingRules) != 1 {
		t.Errorf("expected 1 matching rule, got %d", len(result.MatchingRules))
	}
}

func TestIsWhitelisted_DoubleMatch(t *testing.T) {
	r := NewRouter()
	// ".ru" + "avito.ru" → "avito.ru" matches 2 → proxy
	result := r.IsWhitelisted("avito.ru", []string{".ru", "avito.ru"})
	if result.IsWhitelisted {
		t.Error("expected avito.ru to NOT be whitelisted with 2 matching rules")
	}
	if len(result.MatchingRules) != 2 {
		t.Errorf("expected 2 matching rules, got %d", len(result.MatchingRules))
	}
}

func TestIsWhitelisted_TripleMatch(t *testing.T) {
	r := NewRouter()
	// ".ru" + "avito.ru" + "m.avito.ru" → "m.avito.ru" matches 3 → bypass
	result := r.IsWhitelisted("m.avito.ru", []string{".ru", "avito.ru", "m.avito.ru"})
	if !result.IsWhitelisted {
		t.Error("expected m.avito.ru to be whitelisted with 3 matching rules")
	}
	if len(result.MatchingRules) != 3 {
		t.Errorf("expected 3 matching rules, got %d", len(result.MatchingRules))
	}
}

func TestIsWhitelisted_NoMatch(t *testing.T) {
	r := NewRouter()
	result := r.IsWhitelisted("google.com", []string{"yandex.ru", "mail.ru"})
	if result.IsWhitelisted {
		t.Error("expected google.com to NOT be whitelisted")
	}
}

func TestIsWhitelisted_Empty(t *testing.T) {
	r := NewRouter()
	result := r.IsWhitelisted("google.com", nil)
	if result.IsWhitelisted {
		t.Error("expected false for nil whitelist")
	}

	result = r.IsWhitelisted("", []string{"example.com"})
	if result.IsWhitelisted {
		t.Error("expected false for empty hostname")
	}
}

func TestIsWhitelisted_Deduplication(t *testing.T) {
	r := NewRouter()
	// Duplicate rules should be deduplicated → still 1 match.
	result := r.IsWhitelisted("example.com", []string{"example.com", "example.com", "example.com"})
	if !result.IsWhitelisted {
		t.Error("expected whitelisted with deduplicated rules (1 unique match)")
	}
	if len(result.MatchingRules) != 1 {
		t.Errorf("expected 1 matching rule after dedup, got %d", len(result.MatchingRules))
	}
}

func TestIsWhitelisted_SubdomainMatch(t *testing.T) {
	r := NewRouter()
	// "example.com" should match "sub.example.com"
	result := r.IsWhitelisted("sub.example.com", []string{"example.com"})
	if !result.IsWhitelisted {
		t.Error("expected sub.example.com to match example.com")
	}
}

func TestShouldProxy_GlobalMode(t *testing.T) {
	r := NewRouter()
	whitelist := []string{"localhost", "127.0.0.1"}

	useProxy, _ := r.ShouldProxy("google.com", ModeGlobal, whitelist)
	if !useProxy {
		t.Error("global mode: non-whitelisted domain should use proxy")
	}

	useProxy, _ = r.ShouldProxy("localhost", ModeGlobal, whitelist)
	if useProxy {
		t.Error("global mode: whitelisted domain should bypass")
	}
}

func TestShouldProxy_SmartMode(t *testing.T) {
	r := NewRouter()
	whitelist := []string{"localhost", "127.0.0.1"}

	// discord.com is in default blocked list.
	useProxy, reason := r.ShouldProxy("discord.com", ModeSmart, whitelist)
	if !useProxy {
		t.Errorf("smart mode: blocked domain should use proxy, reason: %s", reason)
	}

	// google.com is NOT blocked.
	useProxy, reason = r.ShouldProxy("google.com", ModeSmart, whitelist)
	if useProxy {
		t.Errorf("smart mode: non-blocked domain should go direct, reason: %s", reason)
	}

	// localhost is whitelisted AND not blocked → bypass.
	useProxy, _ = r.ShouldProxy("localhost", ModeSmart, whitelist)
	if useProxy {
		t.Error("smart mode: whitelisted and non-blocked should bypass")
	}
}

func TestShouldProxy_SmartMode_NestedExceptions(t *testing.T) {
	r := NewRouter()
	// ".ru" whitelists all → "avito.ru" has 2 matches → NOT bypass → even count → proxy
	// In smart mode with nested exception, we should proxy.
	whitelist := []string{".ru", "avito.ru"}

	useProxy, reason := r.ShouldProxy("avito.ru", ModeSmart, whitelist)
	if !useProxy {
		t.Errorf("smart mode: nested exception should proxy, reason: %s", reason)
	}
}

func TestIsBlockedDomain(t *testing.T) {
	r := NewRouter()

	if !r.IsBlockedDomain("discord.com") {
		t.Error("discord.com should be blocked")
	}
	if !r.IsBlockedDomain("cdn.discord.com") {
		t.Error("cdn.discord.com should be blocked (substring match)")
	}
	if r.IsBlockedDomain("google.com") {
		t.Error("google.com should not be blocked")
	}
	if r.IsBlockedDomain("") {
		t.Error("empty hostname should not be blocked")
	}
}

func TestGetSafeOSWhitelist(t *testing.T) {
	r := NewRouter()

	// "ru" has no children → safe.
	safe := r.GetSafeOSWhitelist([]string{".ru"})
	if len(safe) != 1 || safe[0] != "ru" {
		t.Errorf("expected [ru], got %v", safe)
	}

	// ".ru" + "avito.ru" → "ru" has child "avito.ru" → NOT safe.
	// "avito.ru" matches 2 rules → not a bypass → not safe.
	safe = r.GetSafeOSWhitelist([]string{".ru", "avito.ru"})
	if len(safe) != 0 {
		t.Errorf("expected no safe domains with conflicting rules, got %v", safe)
	}
}

func TestGetSafeOSWhitelist_NonConflicting(t *testing.T) {
	r := NewRouter()
	// Two unrelated domains → both safe.
	safe := r.GetSafeOSWhitelist([]string{"example.com", "test.org"})
	if len(safe) != 2 {
		t.Errorf("expected 2 safe domains, got %v", safe)
	}
}

func TestLoadBlockedLists(t *testing.T) {
	r := NewRouter()
	initial := len(r.GetBlockedDomains())

	// Create a temp file with blocked domains.
	tmpFile := t.TempDir() + "/test-blocked.txt"
	content := "# comment\nnewblocked.com\nanotherblocked.org\n"
	if err := os.WriteFile(tmpFile, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	r.LoadBlockedLists(tmpFile)
	after := len(r.GetBlockedDomains())

	if after != initial+2 {
		t.Errorf("expected %d blocked domains after load, got %d", initial+2, after)
	}
	if !r.IsBlockedDomain("newblocked.com") {
		t.Error("newblocked.com should be blocked after loading")
	}
}
