// Copyright (C) 2026 ResultProxy
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
	"encoding/json"
	"testing"
)

func TestValidateEngineConfig_WireGuardMissingKey(t *testing.T) {
	extra := map[string]interface{}{
		"public_key":  "pub",
		"address":     []string{"10.0.0.2/32"},
		"allowed_ips": []string{"0.0.0.0/0"},
	}
	raw, _ := json.Marshal(extra)
	code, err := validateEngineConfig(EngineConfig{
		Mode: ProxyModeTunnel,
		Proxy: ProxyConfig{
			Type:  "WIREGUARD",
			IP:    "127.0.0.1",
			Port:  51820,
			Extra: raw,
		},
	})
	if err == nil {
		t.Fatal("expected validation error")
	}
	if code != ConnectErrorInvalidConfig {
		t.Fatalf("unexpected code: %s", code)
	}
}

func TestValidateEngineConfig_Hysteria2RequiresPassword(t *testing.T) {
	raw := json.RawMessage(`{"sni":"example.com"}`)
	code, err := validateEngineConfig(EngineConfig{
		Mode: ProxyModeProxy,
		Proxy: ProxyConfig{
			Type:  "HYSTERIA2",
			IP:    "example.com",
			Port:  443,
			Extra: raw,
		},
	})
	if err == nil {
		t.Fatal("expected validation error")
	}
	if code != ConnectErrorInvalidConfig {
		t.Fatalf("unexpected code: %s", code)
	}
}

func TestValidateEngineConfig_WireGuardValidConfig(t *testing.T) {
	extra := map[string]interface{}{
		"private_key": "priv",
		"public_key":  "pub",
		"address":     []string{"10.0.0.2/32"},
		"allowed_ips": []string{"0.0.0.0/0"},
	}
	raw, _ := json.Marshal(extra)
	code, err := validateEngineConfig(EngineConfig{
		Mode: ProxyModeTunnel,
		Proxy: ProxyConfig{
			Type:  "WIREGUARD",
			IP:    "127.0.0.1",
			Port:  51820,
			Extra: raw,
		},
	})
	if err != nil {
		t.Fatalf("unexpected validation error: %v", err)
	}
	if code != "" {
		t.Fatalf("unexpected code: %s", code)
	}
}
