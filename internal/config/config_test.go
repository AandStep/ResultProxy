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

package config

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestManagerLoadSaveRoundTrip(t *testing.T) {
	tmpDir := t.TempDir()
	cs := newTestCrypto()
	mgr := NewManager(cs)

	if err := mgr.Init(tmpDir); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	
	cfg := mgr.GetConfig()
	if cfg.RoutingRules.Mode != "global" {
		t.Errorf("expected default mode 'global', got %q", cfg.RoutingRules.Mode)
	}
	if cfg.Settings.Mode != "proxy" {
		t.Errorf("expected default settings.mode 'proxy', got %q", cfg.Settings.Mode)
	}

	
	cfg.RoutingRules.Mode = "smart"
	cfg.Proxies = []ProxyEntry{
		{ID: "1", IP: "1.2.3.4", Port: 8080, Type: "http", Name: "Test"},
	}
	if err := mgr.SaveConfig(cfg); err != nil {
		t.Fatalf("SaveConfig failed: %v", err)
	}

	
	configPath := filepath.Join(tmpDir, "proxy_config.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		t.Fatal("config file was not created")
	}

	
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

	
	if err := mgr.Init(tmpDir); err == nil || !errors.Is(err, ErrDecryptFailed) {
		t.Fatalf("Init with corrupted file should return ErrDecryptFailed: %v", err)
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

func TestAppSettingsHasLastSelectedProxyIDField(t *testing.T) {
	settingsType := reflect.TypeOf(AppSettings{})
	field, ok := settingsType.FieldByName("LastSelectedProxyID")
	if !ok {
		t.Fatal("AppSettings must contain LastSelectedProxyID field")
	}

	if got := field.Tag.Get("json"); got != "lastSelectedProxyId,omitempty" {
		t.Fatalf("json tag mismatch: got %q, want %q", got, "lastSelectedProxyId,omitempty")
	}
}

func TestManagerSaveLoadLastSelectedProxyID(t *testing.T) {
	settingsType := reflect.TypeOf(AppSettings{})
	field, ok := settingsType.FieldByName("LastSelectedProxyID")
	if !ok {
		t.Fatal("AppSettings must contain LastSelectedProxyID field")
	}
	if field.Type.Kind() != reflect.String {
		t.Fatalf("LastSelectedProxyID must be string, got %s", field.Type.Kind())
	}

	tmpDir := t.TempDir()
	cs := newTestCrypto()
	mgr := NewManager(cs)
	if err := mgr.Init(tmpDir); err != nil {
		t.Fatalf("Init failed: %v", err)
	}

	cfg := mgr.GetConfig()
	settingsValue := reflect.ValueOf(&cfg.Settings).Elem()
	settingsValue.FieldByName("LastSelectedProxyID").SetString("proxy-42")

	if err := mgr.SaveConfig(cfg); err != nil {
		t.Fatalf("SaveConfig failed: %v", err)
	}

	mgr2 := NewManager(cs)
	if err := mgr2.Init(tmpDir); err != nil {
		t.Fatalf("Init (reload) failed: %v", err)
	}
	cfg2 := mgr2.GetConfig()
	got := reflect.ValueOf(cfg2.Settings).FieldByName("LastSelectedProxyID").String()
	if got != "proxy-42" {
		t.Fatalf("lastSelectedProxyId was not preserved: got %q", got)
	}
}

func TestManagerLoadLegacyConfigWithoutLastSelectedProxyID(t *testing.T) {
	type legacyAppSettings struct {
		Autostart  bool   `json:"autostart"`
		KillSwitch bool   `json:"killswitch"`
		AdBlock    bool   `json:"adblock"`
		Mode       string `json:"mode"`
		Language   string `json:"language"`
		Theme      string `json:"theme"`
	}
	type legacyAppConfig struct {
		RoutingRules  RoutingRules      `json:"routingRules"`
		Proxies       []ProxyEntry      `json:"proxies"`
		Settings      legacyAppSettings `json:"settings"`
		Subscriptions []Subscription    `json:"subscriptions,omitempty"`
	}

	tmpDir := t.TempDir()
	cs := newTestCrypto()
	mgr := NewManager(cs)

	legacyCfg := legacyAppConfig{
		RoutingRules: RoutingRules{
			Mode:         "global",
			Whitelist:    []string{"localhost", "127.0.0.1"},
			AppWhitelist: []string{},
		},
		Proxies: []ProxyEntry{
			{ID: "1", IP: "10.0.0.2", Port: 8080, Type: "http", Name: "Legacy"},
		},
		Settings: legacyAppSettings{
			Mode:     "proxy",
			Language: "ru",
			Theme:    "dark",
		},
	}

	encrypted, err := cs.Encrypt(legacyCfg)
	if err != nil {
		t.Fatalf("encrypt legacy config failed: %v", err)
	}

	configPath := filepath.Join(tmpDir, "proxy_config.json")
	if err := os.WriteFile(configPath, []byte(encrypted), 0o600); err != nil {
		t.Fatalf("write legacy config failed: %v", err)
	}

	if err := mgr.Init(tmpDir); err != nil {
		t.Fatalf("Init with legacy config should succeed: %v", err)
	}

	cfg := mgr.GetConfig()
	if cfg.Settings.LastSelectedProxyID != "" {
		t.Fatalf("expected empty lastSelectedProxyId for legacy config, got %q", cfg.Settings.LastSelectedProxyID)
	}
	if len(cfg.Proxies) != 1 || cfg.Proxies[0].ID != "1" {
		t.Fatalf("legacy proxies were not loaded correctly: %+v", cfg.Proxies)
	}
}

func TestManagerInitMigratesLegacyConfig(t *testing.T) {
	base := t.TempDir()
	newDir := filepath.Join(base, "ResultV")
	legacyDir := filepath.Join(base, "ResultProxy")
	if err := os.MkdirAll(legacyDir, 0o700); err != nil {
		t.Fatalf("mkdir legacy dir: %v", err)
	}

	cs := newTestCrypto()
	legacyCfg := DefaultConfig()
	legacyCfg.Proxies = []ProxyEntry{
		{ID: "legacy-1", IP: "8.8.8.8", Port: 443, Type: "http", Name: "Legacy"},
	}
	enc, err := cs.Encrypt(legacyCfg)
	if err != nil {
		t.Fatalf("encrypt legacy config: %v", err)
	}
	legacyPath := filepath.Join(legacyDir, "proxy_config.json")
	if err := os.WriteFile(legacyPath, []byte(enc), 0o600); err != nil {
		t.Fatalf("write legacy config: %v", err)
	}

	mgr := NewManager(cs)
	if err := mgr.Init(newDir); err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	cfg := mgr.GetConfig()
	if len(cfg.Proxies) != 1 || cfg.Proxies[0].ID != "legacy-1" {
		t.Fatalf("legacy config was not migrated: %+v", cfg.Proxies)
	}
	if _, err := os.Stat(filepath.Join(newDir, "proxy_config.json")); err != nil {
		t.Fatalf("new config file missing after migration: %v", err)
	}
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Fatalf("legacy config file should be moved, err=%v", err)
	}
}

func TestManagerInitPrefersNewConfigOverLegacy(t *testing.T) {
	base := t.TempDir()
	newDir := filepath.Join(base, "ResultV")
	legacyDir := filepath.Join(base, "ResultProxy")
	if err := os.MkdirAll(newDir, 0o700); err != nil {
		t.Fatalf("mkdir new dir: %v", err)
	}
	if err := os.MkdirAll(legacyDir, 0o700); err != nil {
		t.Fatalf("mkdir legacy dir: %v", err)
	}

	cs := newTestCrypto()
	newCfg := DefaultConfig()
	newCfg.Proxies = []ProxyEntry{{ID: "new", IP: "1.1.1.1", Port: 443, Type: "http"}}
	legacyCfg := DefaultConfig()
	legacyCfg.Proxies = []ProxyEntry{{ID: "legacy", IP: "8.8.8.8", Port: 443, Type: "http"}}

	newEnc, err := cs.Encrypt(newCfg)
	if err != nil {
		t.Fatalf("encrypt new config: %v", err)
	}
	legacyEnc, err := cs.Encrypt(legacyCfg)
	if err != nil {
		t.Fatalf("encrypt legacy config: %v", err)
	}

	newPath := filepath.Join(newDir, "proxy_config.json")
	legacyPath := filepath.Join(legacyDir, "proxy_config.json")
	if err := os.WriteFile(newPath, []byte(newEnc), 0o600); err != nil {
		t.Fatalf("write new config: %v", err)
	}
	if err := os.WriteFile(legacyPath, []byte(legacyEnc), 0o600); err != nil {
		t.Fatalf("write legacy config: %v", err)
	}

	mgr := NewManager(cs)
	if err := mgr.Init(newDir); err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	cfg := mgr.GetConfig()
	if len(cfg.Proxies) != 1 || cfg.Proxies[0].ID != "new" {
		t.Fatalf("new config must have priority, got: %+v", cfg.Proxies)
	}
	if _, err := os.Stat(legacyPath); err != nil {
		t.Fatalf("legacy config should remain untouched when new exists: %v", err)
	}
}

func TestManagerInitPromotesLegacyWhenNewIsEmpty(t *testing.T) {
	base := t.TempDir()
	newDir := filepath.Join(base, "ResultV")
	legacyDir := filepath.Join(base, "ResultProxy")
	if err := os.MkdirAll(newDir, 0o700); err != nil {
		t.Fatalf("mkdir new dir: %v", err)
	}
	if err := os.MkdirAll(legacyDir, 0o700); err != nil {
		t.Fatalf("mkdir legacy dir: %v", err)
	}

	cs := newTestCrypto()
	newCfg := DefaultConfig()
	legacyCfg := DefaultConfig()
	legacyCfg.Proxies = []ProxyEntry{{ID: "legacy", IP: "8.8.4.4", Port: 443, Type: "http"}}

	newEnc, err := cs.Encrypt(newCfg)
	if err != nil {
		t.Fatalf("encrypt new config: %v", err)
	}
	legacyEnc, err := cs.Encrypt(legacyCfg)
	if err != nil {
		t.Fatalf("encrypt legacy config: %v", err)
	}

	newPath := filepath.Join(newDir, "proxy_config.json")
	legacyPath := filepath.Join(legacyDir, "proxy_config.json")
	if err := os.WriteFile(newPath, []byte(newEnc), 0o600); err != nil {
		t.Fatalf("write new config: %v", err)
	}
	if err := os.WriteFile(legacyPath, []byte(legacyEnc), 0o600); err != nil {
		t.Fatalf("write legacy config: %v", err)
	}

	mgr := NewManager(cs)
	if err := mgr.Init(newDir); err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	cfg := mgr.GetConfig()
	if len(cfg.Proxies) != 1 || cfg.Proxies[0].ID != "legacy" {
		t.Fatalf("legacy config should replace empty new config, got: %+v", cfg.Proxies)
	}
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Fatalf("legacy config should be removed after promotion, err=%v", err)
	}
}
