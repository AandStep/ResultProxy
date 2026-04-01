// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package proxy

// SystemProxy manages OS-level proxy settings.
// Platform-specific implementations are in sysproxy_*.go files.
type SystemProxy interface {
	// Set enables the system proxy with the given address and bypass list.
	Set(addr string, bypass []string) error
	// Disable removes system proxy settings.
	Disable() error
	// DisableSync performs synchronous cleanup (for shutdown).
	DisableSync()
	// ApplyKillSwitch sets a dead proxy to block all traffic.
	ApplyKillSwitch() error
}
