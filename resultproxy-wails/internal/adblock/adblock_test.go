package adblock

import (
	"os"
	"testing"
)

func TestFallbackDomains(t *testing.T) {
	b := New()

	if !b.IsAdDomain("doubleclick.net") {
		t.Error("doubleclick.net should be blocked by default")
	}
	if !b.IsAdDomain("googlesyndication.com") {
		t.Error("googlesyndication.com should be blocked by default")
	}
	if b.IsAdDomain("google.com") {
		t.Error("google.com should NOT be blocked")
	}
}

func TestSuffixMatch(t *testing.T) {
	b := New()

	// "ads.doubleclick.net" should match "doubleclick.net".
	if !b.IsAdDomain("ads.doubleclick.net") {
		t.Error("ads.doubleclick.net should match doubleclick.net")
	}
	// "pagead2.googlesyndication.com" should match.
	if !b.IsAdDomain("pagead2.googlesyndication.com") {
		t.Error("pagead2.googlesyndication.com should match")
	}
}

func TestEmptyHostname(t *testing.T) {
	b := New()
	if b.IsAdDomain("") {
		t.Error("empty hostname should not be blocked")
	}
}

func TestCaseInsensitive(t *testing.T) {
	b := New()
	if !b.IsAdDomain("DoubleClick.Net") {
		t.Error("should be case insensitive")
	}
}

func TestLoadFromCache(t *testing.T) {
	tmpDir := t.TempDir()
	cacheFile := tmpDir + "/adblock_domains.txt"
	os.WriteFile(cacheFile, []byte("# comment\ncustom-ad.com\ntracking.io\n"), 0o644)

	b := New()
	initial := b.GetDomainCount()

	if err := b.LoadFromCache(tmpDir); err != nil {
		t.Fatalf("LoadFromCache failed: %v", err)
	}

	after := b.GetDomainCount()
	if after <= initial {
		t.Errorf("expected more domains after cache load, before=%d after=%d", initial, after)
	}

	if !b.IsAdDomain("custom-ad.com") {
		t.Error("custom-ad.com should be blocked after cache load")
	}
}

func TestGetDomains(t *testing.T) {
	b := New()
	domains := b.GetDomains()

	if len(domains) != len(fallbackAdDomains) {
		t.Errorf("expected %d domains, got %d", len(fallbackAdDomains), len(domains))
	}
}
