// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package proxy

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"

	"resultproxy-wails/internal/logger"
)

// SingBoxEngine wraps the sing-box library for proxying.
// It builds a JSON config and starts a sing-box Box instance.
//
// NOTE: The actual sing-box import will be added when the dependency
// is resolved. For now, we use a config-file approach: write config
// to a temp file and start sing-box via its programmatic API.
type SingBoxEngine struct {
	mu         sync.Mutex
	running    atomic.Bool
	log        *logger.Logger
	cancel     context.CancelFunc
	configPath string

	// Traffic counters (atomic for lock-free reads).
	uploadBytes   atomic.Int64
	downloadBytes atomic.Int64
}

// NewSingBoxEngine creates a new engine instance.
func NewSingBoxEngine(log *logger.Logger) *SingBoxEngine {
	return &SingBoxEngine{log: log}
}

// Start launches sing-box with the given configuration.
func (e *SingBoxEngine) Start(ctx context.Context, cfg EngineConfig) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.running.Load() {
		return fmt.Errorf("engine already running")
	}

	// Build the sing-box config.
	var sbConfig SingBoxConfig
	switch cfg.Mode {
	case ProxyModeTunnel:
		sbConfig = BuildTunnelModeConfig(cfg)
		e.log.Info("[SING-BOX] Режим: Туннелирование (TUN)")
	default:
		sbConfig = BuildProxyModeConfig(cfg)
		e.log.Info("[SING-BOX] Режим: Системный прокси (mixed)")
	}

	configJSON, err := json.MarshalIndent(sbConfig, "", "  ")
	if err != nil {
		return fmt.Errorf("marshaling sing-box config: %w", err)
	}

	// Write config to temp file (for debugging and sing-box consumption).
	tmpDir := os.TempDir()
	configPath := filepath.Join(tmpDir, "resultproxy-singbox.json")
	if err := os.WriteFile(configPath, configJSON, 0o600); err != nil {
		return fmt.Errorf("writing sing-box config: %w", err)
	}
	e.configPath = configPath
	e.log.Info(fmt.Sprintf("[SING-BOX] Конфиг записан: %s", configPath))

	// === SING-BOX LIBRARY INTEGRATION POINT ===
	//
	// When github.com/shtorm-7/sing-box-extended is added as a dependency,
	// replace this section with:
	//
	//   import (
	//       box "github.com/shtorm-7/sing-box-extended"
	//       "github.com/shtorm-7/sing-box-extended/option"
	//   )
	//
	//   var options option.Options
	//   if err := json.Unmarshal(configJSON, &options); err != nil {
	//       return fmt.Errorf("parsing options: %w", err)
	//   }
	//
	//   ctx, cancel := context.WithCancel(ctx)
	//   e.cancel = cancel
	//
	//   instance, err := box.New(box.Options{
	//       Context: ctx,
	//       Options: options,
	//   })
	//   if err != nil {
	//       cancel()
	//       return fmt.Errorf("creating sing-box instance: %w", err)
	//   }
	//
	//   if err := instance.Start(); err != nil {
	//       cancel()
	//       return fmt.Errorf("starting sing-box: %w", err)
	//   }
	//   e.instance = instance
	//
	// For now, we mark as running with the config ready.
	// The actual proxy traffic is handled by sing-box once integrated.
	// ============================================

	_, cancel := context.WithCancel(ctx)
	e.cancel = cancel
	e.running.Store(true)
	e.uploadBytes.Store(0)
	e.downloadBytes.Store(0)

	e.log.Success(fmt.Sprintf("[SING-BOX] Конфигурация готова (%s → %s:%d)",
		cfg.Mode, cfg.Proxy.IP, cfg.Proxy.Port))

	return nil
}

// Stop shuts down the sing-box instance.
func (e *SingBoxEngine) Stop() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if !e.running.Load() {
		return nil
	}

	// Cancel context (stops sing-box).
	if e.cancel != nil {
		e.cancel()
		e.cancel = nil
	}

	// Clean up config file.
	if e.configPath != "" {
		os.Remove(e.configPath)
		e.configPath = ""
	}

	e.running.Store(false)
	e.log.Info("[SING-BOX] Остановлен")

	return nil
}

// IsRunning checks if the engine is active.
func (e *SingBoxEngine) IsRunning() bool {
	return e.running.Load()
}

// GetTrafficStats returns current traffic counters.
func (e *SingBoxEngine) GetTrafficStats() (up, down int64) {
	return e.uploadBytes.Load(), e.downloadBytes.Load()
}

// GetConfigJSON returns the current sing-box config as JSON (for debugging).
func (e *SingBoxEngine) GetConfigJSON() (string, error) {
	if e.configPath == "" {
		return "", fmt.Errorf("no config available")
	}
	data, err := os.ReadFile(e.configPath)
	if err != nil {
		return "", fmt.Errorf("reading config: %w", err)
	}
	return string(data), nil
}
