// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package system

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

// TrafficStats holds network traffic counters.
type TrafficStats struct {
	Received int64 `json:"received"` // bytes
	Sent     int64 `json:"sent"`     // bytes
}

// GetNetworkTraffic retrieves current network statistics via netstat -e.
// Port of WindowsNetwork.cjs getNetworkTraffic().
func GetNetworkTraffic() TrafficStats {
	out, err := exec.Command("netstat", "-e").Output()
	if err != nil {
		return TrafficStats{}
	}

	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		parts := strings.Fields(strings.TrimSpace(line))
		if len(parts) >= 3 {
			received, err1 := strconv.ParseInt(parts[len(parts)-2], 10, 64)
			sent, err2 := strconv.ParseInt(parts[len(parts)-1], 10, 64)
			if err1 == nil && err2 == nil && received > 0 {
				return TrafficStats{Received: received, Sent: sent}
			}
		}
	}

	return TrafficStats{}
}

// IsAdmin checks if the current process has administrator privileges.
func IsAdmin() bool {
	// "net session" succeeds only with admin rights.
	err := exec.Command("net", "session").Run()
	return err == nil
}

// RestartAsAdmin restarts the current process with elevated privileges via ShellExecute "runas".
func RestartAsAdmin(exePath string, args ...string) error {
	// PowerShell's Start-Process with -Verb RunAs triggers UAC.
	psArgs := fmt.Sprintf(`Start-Process -FilePath '%s' -Verb RunAs`, exePath)
	if len(args) > 0 {
		psArgs += fmt.Sprintf(` -ArgumentList '%s'`, strings.Join(args, " "))
	}
	return exec.Command("powershell", "-Command", psArgs).Start()
}
