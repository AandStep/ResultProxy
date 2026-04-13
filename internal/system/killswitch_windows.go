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

//go:build windows
















package system

import (
	"fmt"
	"net"
	"strings"
	"sync"
)

const (
	firewallRuleName = "ResultV_KillSwitch"
)








type WindowsKillSwitch struct {
	mu      sync.Mutex
	enabled bool
	isAdmin bool
}


func NewKillSwitch() KillSwitch {
	return &WindowsKillSwitch{
		isAdmin: IsAdmin(),
	}
}



func (ks *WindowsKillSwitch) Enable(proxyAddr string) error {
	ks.mu.Lock()
	defer ks.mu.Unlock()

	if ks.enabled {
		return nil
	}

	if ks.isAdmin {
		if err := ks.enableFirewall(proxyAddr); err != nil {
			return fmt.Errorf("enabling firewall kill switch: %w", err)
		}
	} else {
		return fmt.Errorf("kill switch requires administrator privileges for firewall rules")
	}

	ks.enabled = true
	return nil
}


func (ks *WindowsKillSwitch) Disable() error {
	ks.mu.Lock()
	defer ks.mu.Unlock()

	if !ks.enabled {
		return nil
	}

	if err := ks.disableFirewall(); err != nil {
		return fmt.Errorf("disabling firewall kill switch: %w", err)
	}

	ks.enabled = false
	return nil
}


func (ks *WindowsKillSwitch) IsEnabled() bool {
	ks.mu.Lock()
	defer ks.mu.Unlock()
	return ks.enabled
}



func (ks *WindowsKillSwitch) enableFirewall(proxyAddr string) error {
	
	_ = ks.disableFirewall()

	
	blockCmd := command("netsh", "advfirewall", "firewall", "add", "rule",
		"name="+firewallRuleName+"_BlockAll",
		"dir=out",
		"action=block",
		"enable=yes",
		"profile=any",
		"protocol=any",
	)
	if out, err := blockCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("adding block rule: %s: %w", string(out), err)
	}

	
	if proxyIP := extractValidIP(proxyAddr); proxyIP != "" {
		allowProxyCmd := command("netsh", "advfirewall", "firewall", "add", "rule",
			"name="+firewallRuleName+"_AllowProxy",
			"dir=out",
			"action=allow",
			"enable=yes",
			"profile=any",
			"protocol=any",
			"remoteip="+proxyIP,
		)
		if out, err := allowProxyCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("adding allow proxy rule: %s: %w", string(out), err)
		}
	}

	
	allowLocalCmd := command("netsh", "advfirewall", "firewall", "add", "rule",
		"name="+firewallRuleName+"_AllowLocal",
		"dir=out",
		"action=allow",
		"enable=yes",
		"profile=any",
		"protocol=any",
		"remoteip=127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16",
	)
	if out, err := allowLocalCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("adding allow local rule: %s: %w", string(out), err)
	}

	
	allowDNSCmd := command("netsh", "advfirewall", "firewall", "add", "rule",
		"name="+firewallRuleName+"_AllowDNS",
		"dir=out",
		"action=allow",
		"enable=yes",
		"profile=any",
		"protocol=udp",
		"remoteport=53",
	)
	if out, err := allowDNSCmd.CombinedOutput(); err != nil {
		
		_ = out
	}

	return nil
}




func extractValidIP(addr string) string {
	if addr == "" {
		return ""
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = strings.TrimSpace(addr)
	}
	host = strings.Trim(host, "[]")
	if host == "" {
		return ""
	}
	if net.ParseIP(host) == nil {
		return ""
	}
	return host
}


func (ks *WindowsKillSwitch) disableFirewall() error {
	
	suffixes := []string{"_BlockAll", "_AllowProxy", "_AllowLocal", "_AllowDNS"}
	for _, suffix := range suffixes {
		cmd := command("netsh", "advfirewall", "firewall", "delete", "rule",
			"name="+firewallRuleName+suffix,
		)
		_ = cmd.Run() 
	}
	return nil
}



func DetectGPOConflict() bool {
	
	cmd := command("reg", "query",
		`HKLM\Software\Policies\Microsoft\Windows\CurrentVersion\Internet Settings`,
		"/v", "ProxySettingsPerUser",
	)
	out, err := cmd.CombinedOutput()
	if err == nil && len(out) > 0 {
		
		return true
	}

	
	cmd2 := command("reg", "query",
		`HKLM\Software\Policies\Microsoft\Windows\CurrentVersion\Internet Settings`,
		"/v", "ProxyEnable",
	)
	out2, err2 := cmd2.CombinedOutput()
	if err2 == nil && len(out2) > 0 {
		return true
	}

	return false
}
