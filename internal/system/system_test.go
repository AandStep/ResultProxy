package system

import (
	"testing"
)

func TestGetNetworkTraffic(t *testing.T) {
	stats := GetNetworkTraffic()
	// On a live system, at least some traffic should exist.
	// On CI without network, both may be 0 — that's ok.
	if stats.Received < 0 || stats.Sent < 0 {
		t.Errorf("unexpected negative traffic: %+v", stats)
	}
	t.Logf("Network stats: received=%d bytes, sent=%d bytes", stats.Received, stats.Sent)
}

func TestIsAdmin(t *testing.T) {
	// Just test that it doesn't panic. Value depends on execution context.
	result := IsAdmin()
	t.Logf("IsAdmin: %v", result)
}

func TestIsAutostartEnabled(t *testing.T) {
	// Test that it runs without panicking.
	result := IsAutostartEnabled()
	t.Logf("IsAutostartEnabled: %v", result)
}
