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
	"encoding/json"
	"testing"
)

const testMachineID = "test-machine-id-12345678"

func newTestCrypto() *CryptoService {
	return NewCryptoServiceWithID(testMachineID)
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	cs := newTestCrypto()

	original := map[string]any{
		"routingRules": map[string]any{
			"mode":         "global",
			"whitelist":    []any{"localhost", "127.0.0.1"},
			"appWhitelist": []any{},
		},
	}

	encrypted, err := cs.Encrypt(original)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	
	var env secureEnvelope
	if err := json.Unmarshal([]byte(encrypted), &env); err != nil {
		t.Fatalf("encrypted output is not valid JSON: %v", err)
	}
	if !env.IsSecure {
		t.Error("_isSecure should be true")
	}
	if env.IV == "" || env.Data == "" || env.AuthTag == "" {
		t.Error("envelope fields should not be empty")
	}

	
	raw, err := cs.Decrypt(encrypted)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("Unmarshal decrypted data failed: %v", err)
	}

	rules, ok := result["routingRules"].(map[string]any)
	if !ok {
		t.Fatal("routingRules not found or wrong type")
	}
	if rules["mode"] != "global" {
		t.Errorf("expected mode 'global', got %v", rules["mode"])
	}
}

func TestDecryptInto(t *testing.T) {
	cs := newTestCrypto()

	type Config struct {
		Name string `json:"name"`
		Port int    `json:"port"`
	}
	original := Config{Name: "test-proxy", Port: 14081}

	encrypted, err := cs.Encrypt(original)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	var result Config
	if err := cs.DecryptInto(encrypted, &result); err != nil {
		t.Fatalf("DecryptInto failed: %v", err)
	}

	if result.Name != original.Name {
		t.Errorf("Name: got %q, want %q", result.Name, original.Name)
	}
	if result.Port != original.Port {
		t.Errorf("Port: got %d, want %d", result.Port, original.Port)
	}
}

func TestDecryptLegacyUnencrypted(t *testing.T) {
	cs := newTestCrypto()

	
	legacy := `{"routingRules":{"mode":"global"}}`

	raw, err := cs.Decrypt(legacy)
	if err != nil {
		t.Fatalf("Decrypt legacy failed: %v", err)
	}

	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatalf("Unmarshal failed: %v", err)
	}
	rules := result["routingRules"].(map[string]any)
	if rules["mode"] != "global" {
		t.Errorf("expected mode 'global', got %v", rules["mode"])
	}
}

func TestDecryptWrongKey(t *testing.T) {
	cs1 := NewCryptoServiceWithID("machine-A")
	cs2 := NewCryptoServiceWithID("machine-B")

	encrypted, err := cs1.Encrypt(map[string]string{"secret": "data"})
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	_, err = cs2.Decrypt(encrypted)
	if err == nil {
		t.Error("expected decryption to fail with wrong key")
	}
}

func TestNodeJSCompatibility(t *testing.T) {
	
	
	
	
	
	
	
	
	
	
	
	
	
	t.Skip("TODO: populate with actual Node.js encrypted output for cross-compat validation")
}

func TestEncryptProducesUniqueIVs(t *testing.T) {
	cs := newTestCrypto()
	data := map[string]string{"key": "value"}

	enc1, err := cs.Encrypt(data)
	if err != nil {
		t.Fatalf("Encrypt 1 failed: %v", err)
	}
	enc2, err := cs.Encrypt(data)
	if err != nil {
		t.Fatalf("Encrypt 2 failed: %v", err)
	}

	var env1, env2 secureEnvelope
	json.Unmarshal([]byte(enc1), &env1)
	json.Unmarshal([]byte(enc2), &env2)

	if env1.IV == env2.IV {
		t.Error("two encryptions produced the same IV — randomness failure")
	}
	if env1.Data == env2.Data {
		t.Error("two encryptions produced the same ciphertext — randomness failure")
	}
}
