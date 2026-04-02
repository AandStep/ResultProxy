// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package config

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"github.com/google/uuid"
)

const (
	// keySalt must match the Node.js salt exactly for backward compatibility.
	keySalt = "_ResultProxy_SafeVault_v1"
)

// CryptoService handles AES-256-GCM encryption/decryption.
// It is wire-compatible with the Node.js CryptoService:
//
//	{ _isSecure: true, iv: <base64>, data: <base64>, authTag: <base64> }
type CryptoService struct {
	key [32]byte
}

// secureEnvelope is the on-disk JSON format produced by both Node.js and Go.
type secureEnvelope struct {
	IsSecure bool   `json:"_isSecure"`
	IV       string `json:"iv"`
	Data     string `json:"data"`
	AuthTag  string `json:"authTag"`
}

// NewCryptoService creates a CryptoService using the machine's hardware ID.
func NewCryptoService() (*CryptoService, error) {
	machineID, err := getHardwareID()
	if err != nil {
		return nil, fmt.Errorf("getting hardware ID: %w", err)
	}
	return NewCryptoServiceWithID(machineID), nil
}

// NewCryptoServiceWithID creates a CryptoService with a given machine ID.
// Useful for testing and for decrypting configs from other machines.
func NewCryptoServiceWithID(machineID string) *CryptoService {
	h := sha256.Sum256([]byte(machineID + keySalt))
	return &CryptoService{key: h}
}

// Encrypt serializes data to JSON and encrypts it with AES-256-GCM.
// Returns a JSON string in the secure envelope format.
func (cs *CryptoService) Encrypt(data any) (string, error) {
	plaintext, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("marshaling data: %w", err)
	}

	block, err := aes.NewCipher(cs.key[:])
	if err != nil {
		return "", fmt.Errorf("creating cipher: %w", err)
	}

	// IV = 16 bytes to match Node.js crypto.randomBytes(16).
	// AES-GCM standard nonce is 12 bytes, but Go's GCM implementation
	// accepts arbitrary nonce sizes. Node.js uses 16.
	iv := make([]byte, 16)
	if _, err := rand.Read(iv); err != nil {
		return "", fmt.Errorf("generating IV: %w", err)
	}

	// GCM with 16-byte nonce: Go handles this correctly.
	gcmWithNonce, err := cipher.NewGCMWithNonceSize(block, 16)
	if err != nil {
		return "", fmt.Errorf("creating GCM with nonce size 16: %w", err)
	}

	// Seal appends ciphertext + authTag to dst.
	sealed := gcmWithNonce.Seal(nil, iv, plaintext, nil)

	// Node.js separates ciphertext and authTag (last 16 bytes).
	ciphertext := sealed[:len(sealed)-gcmWithNonce.Overhead()]
	authTag := sealed[len(sealed)-gcmWithNonce.Overhead():]

	env := secureEnvelope{
		IsSecure: true,
		IV:       base64.StdEncoding.EncodeToString(iv),
		Data:     base64.StdEncoding.EncodeToString(ciphertext),
		AuthTag:  base64.StdEncoding.EncodeToString(authTag),
	}

	result, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshaling envelope: %w", err)
	}
	return string(result), nil
}

// Decrypt parses a secure envelope JSON string and decrypts the data.
// If the input is not a secure envelope (no _isSecure flag), it returns
// the raw parsed JSON — this handles legacy unencrypted configs.
func (cs *CryptoService) Decrypt(rawStr string) (json.RawMessage, error) {
	var env secureEnvelope
	if err := json.Unmarshal([]byte(rawStr), &env); err != nil {
		return nil, fmt.Errorf("parsing envelope: %w", err)
	}

	// Legacy unencrypted config — return as-is.
	if !env.IsSecure || env.Data == "" || env.IV == "" || env.AuthTag == "" {
		return json.RawMessage(rawStr), nil
	}

	iv, err := base64.StdEncoding.DecodeString(env.IV)
	if err != nil {
		return nil, fmt.Errorf("decoding IV: %w", err)
	}

	ciphertext, err := base64.StdEncoding.DecodeString(env.Data)
	if err != nil {
		return nil, fmt.Errorf("decoding data: %w", err)
	}

	authTag, err := base64.StdEncoding.DecodeString(env.AuthTag)
	if err != nil {
		return nil, fmt.Errorf("decoding authTag: %w", err)
	}

	block, err := aes.NewCipher(cs.key[:])
	if err != nil {
		return nil, fmt.Errorf("creating cipher: %w", err)
	}

	gcm, err := cipher.NewGCMWithNonceSize(block, len(iv))
	if err != nil {
		return nil, fmt.Errorf("creating GCM with nonce size %d: %w", len(iv), err)
	}

	// Reconstruct sealed = ciphertext + authTag (as Go's GCM expects).
	sealed := append(ciphertext, authTag...)

	plaintext, err := gcm.Open(nil, iv, sealed, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypting: %w", err)
	}

	return json.RawMessage(plaintext), nil
}

// DecryptInto decrypts and unmarshals into a typed destination.
func (cs *CryptoService) DecryptInto(rawStr string, dst any) error {
	raw, err := cs.Decrypt(rawStr)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, dst)
}

// --- Hardware ID retrieval ---

var hardwareIDRegex = regexp.MustCompile(`[a-fA-F0-9\-]{8,}`)

// getHardwareID returns a stable machine identifier.
func getHardwareID() (string, error) {
	var id string
	var err error

	switch runtime.GOOS {
	case "windows":
		id, err = windowsMachineGUID()
	case "darwin":
		id, err = darwinPlatformUUID()
	default:
		id, err = linuxMachineID()
	}

	if err == nil && id != "" {
		return id, nil
	}

	// Fallback: file-based persistent ID.
	return getOrCreateFallbackID()
}

func windowsMachineGUID() (string, error) {
	out, err := exec.Command("reg", "query",
		`HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography`,
		"/v", "MachineGuid").Output()
	if err != nil {
		return "", fmt.Errorf("reading MachineGuid: %w", err)
	}
	match := hardwareIDRegex.FindString(string(out))
	if match == "" {
		return "", errors.New("MachineGuid not found in registry output")
	}
	return match, nil
}

func darwinPlatformUUID() (string, error) {
	out, err := exec.Command("ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output()
	if err != nil {
		return "", fmt.Errorf("reading IOPlatformUUID: %w", err)
	}
	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, "IOPlatformUUID") {
			match := hardwareIDRegex.FindString(line)
			if match != "" {
				return match, nil
			}
		}
	}
	return "", errors.New("IOPlatformUUID not found")
}

func linuxMachineID() (string, error) {
	data, err := os.ReadFile("/etc/machine-id")
	if err != nil {
		return "", fmt.Errorf("reading /etc/machine-id: %w", err)
	}
	id := strings.TrimSpace(string(data))
	if len(id) < 8 {
		return "", errors.New("machine-id too short")
	}
	return id, nil
}

func getOrCreateFallbackID() (string, error) {
	fallbackDir := os.Getenv("APPDATA")
	if fallbackDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("getting home dir: %w", err)
		}
		fallbackDir = filepath.Join(home, ".config")
	}
	fallbackPath := filepath.Join(fallbackDir, "resultProxy", ".machine-fallback-id")

	// Try to read existing.
	if data, err := os.ReadFile(fallbackPath); err == nil {
		stored := strings.TrimSpace(string(data))
		if len(stored) >= 32 {
			return stored, nil
		}
	}

	// Generate new UUID.
	newID := uuid.New().String()

	dir := filepath.Dir(fallbackPath)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return newID, nil // use in-memory, best effort
	}
	if err := os.WriteFile(fallbackPath, []byte(newID), 0o600); err != nil {
		return newID, nil
	}

	return newID, nil
}
