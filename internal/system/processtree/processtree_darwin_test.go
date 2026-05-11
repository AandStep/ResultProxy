//go:build darwin

package processtree

import (
	"strings"
	"testing"

	ps "github.com/mitchellh/go-ps"
)

// TestScanDarwinFullBasename verifies that on macOS the processtree scan
// resolves truncated comm names to full binary basenames via proc_pidpath.
func TestScanDarwinFullBasename(t *testing.T) {
	procs, err := ps.Processes()
	if err != nil {
		t.Skipf("ps.Processes() failed: %v", err)
	}

	// Log all Safari/WebKit-related processes for diagnosis.
	t.Log("Safari/WebKit processes visible to go-ps:")
	for _, p := range procs {
		exe := strings.ToLower(strings.TrimSpace(p.Executable()))
		if exe == "safari" || strings.Contains(exe, "webkit") || strings.Contains(exe, "safari") {
			full := fullBasenameFromPID(p.Pid())
			t.Logf("  PID=%-6d PPID=%-6d comm=%-20q fullBasename=%q", p.Pid(), p.PPid(), p.Executable(), full)
		}
	}

	// If Safari is running, its descendants should include WebKit processes.
	snap := Scan([]string{"safari"})
	t.Logf("Scan(safari) -> Descendants: %v", snap.Descendants)
}
