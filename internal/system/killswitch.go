// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package system

// KillSwitch blocks all internet traffic when the proxy drops.
// Two strategies:
//   - Dead proxy: set system proxy to 127.0.0.1:65535 (no admin required)
//   - Firewall: add outbound block rules via netsh (admin required, more reliable)
//
// Platform-specific implementations in killswitch_*.go files.
type KillSwitch interface {
	// Enable activates the kill switch, optionally allowing traffic to proxyAddr.
	Enable(proxyAddr string) error
	// Disable deactivates the kill switch and restores normal connectivity.
	Disable() error
	// IsEnabled returns whether the kill switch is currently active.
	IsEnabled() bool
}
