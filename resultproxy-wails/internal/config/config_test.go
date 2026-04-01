package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestManagerLoadSaveRoundTrip(t *testing.T) {
	tmpDir := t.TempDir()
	cs := newTestCrypto()
	mgr := NewManager(cs)

	if err := mgr.Init(tmpDir); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	// Should start with defaults.
	cfg := mgr.GetConfig()
	if cfg.RoutingRules.Mode != "global" {
		t.Errorf("expected default mode 'global', got %q", cfg.RoutingRules.Mode)
	}
	if cfg.Settings.Mode != "proxy" {
		t.Errorf("expected default settings.mode 'proxy', got %q", cfg.Settings.Mode)
	}

	// Modify and save.
	cfg.RoutingRules.Mode = "smart"
	cfg.Proxies = []ProxyEntry{
		{ID: "1", IP: "1.2.3.4", Port: 8080, Type: "http", Name: "Test"},
	}
	if err := mgr.SaveConfig(cfg); err != nil {
		t.Fatalf("SaveConfig failed: %v", err)
	}

	// Verify file exists.
	configPath := filepath.Join(tmpDir, "proxy_config.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		t.Fatal("config file was not created")
	}

	// Create new manager and load — should read saved data.
	mgr2 := NewManager(cs)
	if err := mgr2.Init(tmpDir); err != nil {
		t.Fatalf("Init (reload) failed: %v", err)
	}

	cfg2 := mgr2.GetConfig()
	if cfg2.RoutingRules.Mode != "smart" {
		t.Errorf("expected mode 'smart' after reload, got %q", cfg2.RoutingRules.Mode)
	}
	if len(cfg2.Proxies) != 1 {
		t.Fatalf("expected 1 proxy after reload, got %d", len(cfg2.Proxies))
	}
	if cfg2.Proxies[0].IP != "1.2.3.4" {
		t.Errorf("expected proxy IP '1.2.3.4', got %q", cfg2.Proxies[0].IP)
	}
}

func TestManagerMissingFile(t *testing.T) {
	tmpDir := t.TempDir()
	cs := newTestCrypto()
	mgr := NewManager(cs)

	if err := mgr.Init(tmpDir); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	cfg := mgr.GetConfig()
	if cfg.RoutingRules.Mode != "global" {
		t.Errorf("expected default mode when file missing, got %q", cfg.RoutingRules.Mode)
	}
}

func TestManagerCorruptedFile(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "proxy_config.json")
	os.WriteFile(configPath, []byte("not json at all {{{{"), 0o600)

	cs := newTestCrypto()
	mgr := NewManager(cs)

	// Should not error — falls back to defaults.
	if err := mgr.Init(tmpDir); err != nil {
		t.Fatalf("Init with corrupted file should not fail: %v", err)
	}

	cfg := mgr.GetConfig()
	if cfg.RoutingRules.Mode != "global" {
		t.Errorf("expected default mode for corrupted file, got %q", cfg.RoutingRules.Mode)
	}
}

func TestManagerUpdateRoutingRules(t *testing.T) {
	tmpDir := t.TempDir()
	cs := newTestCrypto()
	mgr := NewManager(cs)
	mgr.Init(tmpDir)

	err := mgr.UpdateRoutingRules(RoutingRules{
		Mode:         "whitelist",
		Whitelist:    []string{"example.com"},
		AppWhitelist: []string{"chrome.exe"},
	})
	if err != nil {
		t.Fatalf("UpdateRoutingRules failed: %v", err)
	}

	cfg := mgr.GetConfig()
	if cfg.RoutingRules.Mode != "whitelist" {
		t.Errorf("expected mode 'whitelist', got %q", cfg.RoutingRules.Mode)
	}
	if len(cfg.RoutingRules.Whitelist) != 1 || cfg.RoutingRules.Whitelist[0] != "example.com" {
		t.Errorf("unexpected whitelist: %v", cfg.RoutingRules.Whitelist)
	}
}

func TestEnsureDefaults(t *testing.T) {
	empty := AppConfig{}
	result := ensureDefaults(empty)

	if result.RoutingRules.Mode != "global" {
		t.Errorf("Mode: got %q, want 'global'", result.RoutingRules.Mode)
	}
	if result.Proxies == nil {
		t.Error("Proxies should not be nil after ensureDefaults")
	}
	if result.Settings.Theme != "dark" {
		t.Errorf("Theme: got %q, want 'dark'", result.Settings.Theme)
	}
}
