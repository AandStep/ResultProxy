package config

import (
	"strings"
	"testing"
)

func TestExportImportRoundTrip(t *testing.T) {
	cfg := AppConfig{
		Proxies: []ProxyEntry{
			{ID: "1", IP: "1.2.3.4", Port: 8080, Type: "http", Name: "Server 1"},
			{ID: "2", IP: "5.6.7.8", Port: 1080, Type: "socks5", Name: "Server 2"},
		},
		RoutingRules: RoutingRules{
			Mode:         "smart",
			Whitelist:    []string{"example.com"},
			AppWhitelist: []string{"chrome.exe"},
		},
	}

	exported, err := ExportConfig(cfg)
	if err != nil {
		t.Fatalf("ExportConfig failed: %v", err)
	}

	if !strings.HasPrefix(exported, exportPrefix) {
		t.Errorf("exported string should start with %q", exportPrefix)
	}

	imported, err := ImportConfig(exported)
	if err != nil {
		t.Fatalf("ImportConfig failed: %v", err)
	}

	if imported.Version != 1 {
		t.Errorf("Version: got %d, want 1", imported.Version)
	}
	if len(imported.Proxies) != 2 {
		t.Fatalf("expected 2 proxies, got %d", len(imported.Proxies))
	}
	if imported.Proxies[0].IP != "1.2.3.4" {
		t.Errorf("Proxy[0].IP: got %q, want '1.2.3.4'", imported.Proxies[0].IP)
	}
	if imported.RoutingRules.Mode != "smart" {
		t.Errorf("RoutingRules.Mode: got %q, want 'smart'", imported.RoutingRules.Mode)
	}
}

func TestImportWithoutPrefix(t *testing.T) {
	cfg := AppConfig{
		Proxies: []ProxyEntry{
			{ID: "1", IP: "1.2.3.4", Port: 8080, Type: "http"},
		},
		RoutingRules: RoutingRules{Mode: "global"},
	}

	exported, _ := ExportConfig(cfg)
	// Strip prefix.
	raw := strings.TrimPrefix(exported, exportPrefix)

	imported, err := ImportConfig(raw)
	if err != nil {
		t.Fatalf("ImportConfig without prefix failed: %v", err)
	}
	if len(imported.Proxies) != 1 {
		t.Errorf("expected 1 proxy, got %d", len(imported.Proxies))
	}
}

func TestImportInvalidBase64(t *testing.T) {
	_, err := ImportConfig("not-valid-base64!!!")
	if err == nil {
		t.Error("expected error for invalid base64")
	}
}

func TestImportInvalidJSON(t *testing.T) {
	// Valid base64 but invalid JSON.
	_, err := ImportConfig("RESULTPROXY:bm90IGpzb24=") // "not json"
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestImportValidation(t *testing.T) {
	cases := []struct {
		name    string
		export  ExportableConfig
		wantErr bool
	}{
		{
			name:    "valid",
			export:  ExportableConfig{Version: 1, Proxies: []ProxyEntry{{IP: "1.2.3.4", Port: 80}}},
			wantErr: false,
		},
		{
			name:    "invalid version",
			export:  ExportableConfig{Version: 0},
			wantErr: true,
		},
		{
			name:    "invalid port",
			export:  ExportableConfig{Version: 1, Proxies: []ProxyEntry{{IP: "1.2.3.4", Port: 99999}}},
			wantErr: true,
		},
		{
			name:    "empty proxy",
			export:  ExportableConfig{Version: 1, Proxies: []ProxyEntry{{Port: 80}}},
			wantErr: true,
		},
		{
			name:    "invalid mode",
			export:  ExportableConfig{Version: 1, RoutingRules: RoutingRules{Mode: "invalid"}},
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateImport(&tc.export)
			if (err != nil) != tc.wantErr {
				t.Errorf("validateImport() err = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}

func TestMergeImport(t *testing.T) {
	existing := AppConfig{
		Proxies: []ProxyEntry{
			{ID: "1", IP: "1.1.1.1", Port: 80, Name: "Existing"},
		},
		RoutingRules: RoutingRules{Mode: "global"},
		Settings:     AppSettings{Mode: "proxy", Theme: "dark"},
	}

	imported := &ExportableConfig{
		Version: 1,
		Proxies: []ProxyEntry{
			{ID: "1", IP: "1.1.1.1", Port: 80, Name: "Duplicate"},  // should be skipped
			{ID: "2", IP: "2.2.2.2", Port: 1080, Name: "New"},      // should be added
		},
		RoutingRules: RoutingRules{Mode: "smart", Whitelist: []string{"new.com"}},
	}

	result := MergeImport(existing, imported)

	// Routing rules should be replaced.
	if result.RoutingRules.Mode != "smart" {
		t.Errorf("RoutingRules.Mode: got %q, want 'smart'", result.RoutingRules.Mode)
	}

	// Should have 2 proxies (1 existing + 1 new, duplicate skipped).
	if len(result.Proxies) != 2 {
		t.Fatalf("expected 2 proxies after merge, got %d", len(result.Proxies))
	}

	// Settings should be untouched.
	if result.Settings.Theme != "dark" {
		t.Errorf("Settings.Theme should be 'dark', got %q", result.Settings.Theme)
	}
}
