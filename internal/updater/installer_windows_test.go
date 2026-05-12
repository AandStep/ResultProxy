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

package updater

import (
	"strings"
	"testing"
)

func TestBuildPortableHandoverScript_ContainsCopyRestartAndLog(t *testing.T) {
	script := buildPortableHandoverScript("C:\\tmp\\new.exe", "C:\\apps\\ResultV.exe", "C:\\tmp\\resultv-updater.log")
	required := []string{
		"$logPath = 'C:\\tmp\\resultv-updater.log'",
		"[IO.File]::Copy('C:\\tmp\\new.exe','C:\\apps\\ResultV.exe',$true)",
		"Start-Process -FilePath 'C:\\apps\\ResultV.exe'",
		"portable update copy failed",
	}
	for _, token := range required {
		if !strings.Contains(script, token) {
			t.Fatalf("portable handover script missing token %q", token)
		}
	}
}

func TestBuildInstallerHandoverScript_WaitsAndLogsInstallerExit(t *testing.T) {
	script := buildInstallerHandoverScript(
		4242,
		"C:\\tmp\\ResultV-installer.exe",
		"C:\\Program Files\\ResultV\\ResultV.exe",
		"C:\\tmp\\resultv-updater.log",
	)
	required := []string{
		"Wait-Process -Id 4242 -Timeout 45",
		"Start-Process -FilePath 'C:\\tmp\\ResultV-installer.exe' -ArgumentList '/S' -Wait -PassThru",
		"installer exit code:",
		"Start-Process -FilePath 'C:\\Program Files\\ResultV\\ResultV.exe'",
	}
	for _, token := range required {
		if !strings.Contains(script, token) {
			t.Fatalf("installer handover script missing token %q", token)
		}
	}
}
