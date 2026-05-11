//go:build darwin

package processtree

import (
	"regexp"
	"syscall"
	"testing"
	"unsafe"

	ps "github.com/mitchellh/go-ps"
	"golang.org/x/sys/unix"
)

func fullAbsPathFromPID(pid int) string {
	const (
		procpidpathinfo     = 0xb
		procpidpathinfosize = 1024
		proccallnumpidinfo  = 0x2
	)
	buf := make([]byte, procpidpathinfosize)
	_, _, errno := syscall.Syscall6(
		syscall.SYS_PROC_INFO,
		proccallnumpidinfo,
		uintptr(pid),
		procpidpathinfo,
		0,
		uintptr(unsafe.Pointer(&buf[0])),
		procpidpathinfosize)
	if errno != 0 {
		return ""
	}
	return unix.ByteSliceToString(buf)
}

// TestRegexMatchesRealPaths verifies that the regexes generated from the
// Scan companions actually match the real full process paths on this system.
func TestRegexMatchesRealPaths(t *testing.T) {
	procs, err := ps.Processes()
	if err != nil {
		t.Skipf("ps.Processes: %v", err)
	}

	snap := Scan([]string{"safari"})
	t.Logf("Companions from Scan: %v", snap.Descendants)

	// Build all names: root + companions.
	names := append([]string{"safari"}, snap.Descendants...)

	// Build regexes matching engine.go's appWhitelistPathRegexes.
	type entry struct {
		name    string
		pattern string
		re      *regexp.Regexp
	}
	var rxs []entry
	for _, n := range names {
		esc := regexp.QuoteMeta(n)
		for _, pat := range []string{
			`(?i)(^|[\\/])` + esc + `$`,
			`(?i)[\\/]` + esc + `\.app[\\/]`,
		} {
			re := regexp.MustCompile(pat)
			rxs = append(rxs, entry{n, pat, re})
		}
	}

	t.Logf("Regexes (%d):", len(rxs))
	for _, rx := range rxs {
		t.Logf("  %q", rx.pattern)
	}

	// Check real process paths.
	t.Log("\nChecking Safari/WebKit process paths:")
	anyMatch := false
	for _, p := range procs {
		exe := p.Executable()
		if exe != "Safari" && exe != "com.apple.WebKit" && exe != "com.apple.Safari" {
			continue
		}
		fullPath := fullAbsPathFromPID(p.Pid())
		if fullPath == "" {
			continue
		}
		t.Logf("  PID=%-6d path=%q", p.Pid(), fullPath)
		matched := false
		for _, rx := range rxs {
			if rx.re.MatchString(fullPath) {
				t.Logf("    -> MATCHED: %q", rx.pattern)
				matched = true
				anyMatch = true
			}
		}
		if !matched {
			t.Logf("    -> NO MATCH against any regex")
		}
	}

	if !anyMatch {
		t.Errorf("no process paths matched — app whitelist will not work on this system")
	}
}
