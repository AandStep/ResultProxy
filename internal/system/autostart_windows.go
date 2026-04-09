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

//go:build windows
















package system

import (
	"fmt"
	"strings"

	"golang.org/x/sys/windows/registry"
)

const taskName = "ResultProxyAutostart"




func EnableAutostart(exePath string, args ...string) error {
	if !IsAdmin() {
		return fmt.Errorf("требуются права администратора для создания задачи в планировщике")
	}

	argsStr := ""
	if len(args) > 0 {
		argsStr = " " + strings.Join(args, " ")
	}

	
	taskCmd := fmt.Sprintf(`\"%s\"%s`, strings.ReplaceAll(exePath, "/", "\\"), argsStr)
	cmd := command("schtasks",
		"/create",
		"/tn", taskName,
		"/tr", taskCmd,
		"/sc", "ONLOGON",
		"/rl", "HIGHEST",
		"/f",
	)

	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("создание задачи schtasks: %s: %w", string(out), err)
	}

	return nil
}


func DisableAutostart() error {
	cmd := command("schtasks", "/delete", "/tn", taskName, "/f")
	_ = cmd.Run() 
	return nil
}


func IsAutostartEnabled() bool {
	cmd := command("schtasks", "/query", "/tn", taskName)
	return cmd.Run() == nil
}



func SetRunAsAdminFlag(exePath string, enable bool) error {
	regPath := `Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers`

	key, err := registry.OpenKey(registry.CURRENT_USER, regPath, registry.SET_VALUE|registry.QUERY_VALUE)
	if err != nil {
		
		key, _, err = registry.CreateKey(registry.CURRENT_USER, regPath, registry.SET_VALUE)
		if err != nil {
			return fmt.Errorf("opening AppCompatFlags registry key: %w", err)
		}
	}
	defer key.Close()

	if enable {
		return key.SetStringValue(exePath, "~ RUNASADMIN")
	}

	_ = key.DeleteValue(exePath) 
	return nil
}
