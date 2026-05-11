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

//go:build darwin

package processtree

import (
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	ps "github.com/mitchellh/go-ps"
	"golang.org/x/sys/unix"
)

// darwinXPCCompanions maps lowercase app binary names to the XPC service
// process names that handle their network connections. On macOS 15+, these
// services are spawned by launchd and have no parent-process link to the app,
// so they cannot be discovered via PPID tree walking. All entries are
// lowercase to match the normalised root set.
var darwinXPCCompanions = map[string][]string{
	// Safari and all WKWebView-based apps use the shared WebKit networking service.
	"safari": {
		"com.apple.webkit.networking",
		"com.apple.webkit.webcontent",
	},
}

// platformScan on macOS finds both classical child processes AND XPC service
// processes that are "responsible to" a root application.
//
// Modern macOS XPC services are spawned by launchd (PID 1), so their PPID
// is 1 rather than the launching app's PID. A traditional parent-child tree
// walk therefore finds zero descendants for apps like Safari. Instead we use
// PROC_PIDRESPONSIBLEINFO to find which XPC processes are owned by (i.e.
// responsible to) each root app PID.
//
// All binary names are resolved via proc_pidpath to get the full untruncated
// basename (the kernel comm field is limited to 15 chars).
func platformScan(roots []string) Snapshot {
	snap := Snapshot{Roots: append([]string(nil), roots...)}
	if len(roots) == 0 {
		return snap
	}

	procs, err := ps.Processes()
	if err != nil || len(procs) == 0 {
		return snap
	}

	rootSet := make(map[string]struct{}, len(roots))
	for _, r := range roots {
		rootSet[r] = struct{}{}
	}

	type procInfo struct {
		pid int
		exe string // lower-case comm (possibly truncated)
	}
	all := make([]procInfo, 0, len(procs))
	rootPIDs := make(map[int]struct{})

	for _, p := range procs {
		exe := strings.ToLower(strings.TrimSpace(p.Executable()))
		all = append(all, procInfo{pid: p.Pid(), exe: exe})
		if _, isRoot := rootSet[exe]; isRoot {
			rootPIDs[p.Pid()] = struct{}{}
		}
	}

	if len(rootPIDs) == 0 {
		return snap
	}

	// Build full-name map for root PIDs and resolve their full basename.
	descSet := make(map[string]struct{})

	// Also walk classical PPID-based children for apps that do fork() directly.
	children := make(map[int][]int, len(all))
	for _, p := range procs {
		ppid := p.PPid()
		if ppid != p.Pid() && ppid != 0 {
			children[ppid] = append(children[ppid], p.Pid())
		}
	}
	pidToExe := make(map[int]string, len(all))
	for _, pi := range all {
		pidToExe[pi.pid] = pi.exe
	}

	visited := make(map[int]bool)
	var dfsChildren func(pid int)
	dfsChildren = func(pid int) {
		if visited[pid] {
			return
		}
		visited[pid] = true
		for _, child := range children[pid] {
			exe := pidToExe[child]
			if _, isRoot := rootSet[exe]; !isRoot && exe != "" {
				if full := fullBasenameFromPID(child); full != "" {
					descSet[strings.ToLower(full)] = struct{}{}
				} else {
					descSet[exe] = struct{}{}
				}
			}
			dfsChildren(child)
		}
	}
	for rootPID := range rootPIDs {
		dfsChildren(rootPID)
	}

	// XPC responsible-PID walk: for every non-root process, if its
	// responsible PID is one of our root PIDs, include it as a descendant.
	// This works when the calling process has permission to query other
	// processes' responsible PIDs. Falls back to the companion map below.
	responsibleFound := false
	for _, pi := range all {
		if _, isRoot := rootSet[pi.exe]; isRoot {
			continue
		}
		respPID := responsiblePID(pi.pid)
		if respPID <= 0 {
			continue
		}
		if _, ok := rootPIDs[respPID]; ok {
			if full := fullBasenameFromPID(pi.pid); full != "" {
				descSet[strings.ToLower(full)] = struct{}{}
				responsibleFound = true
			} else if pi.exe != "" {
				descSet[pi.exe] = struct{}{}
				responsibleFound = true
			}
		}
	}

	// Fallback: if PROC_PIDRESPONSIBLEINFO is unavailable (requires
	// privileges in some macOS configurations), add well-known XPC companion
	// processes for recognized root apps. On macOS 15+, WebKit networking
	// runs as a system-shared launchd service with no PPID link to the
	// browser, so it can only be found via the companion map.
	if !responsibleFound {
		for root := range rootSet {
			for _, companion := range darwinXPCCompanions[root] {
				descSet[companion] = struct{}{}
			}
		}
	}

	if len(descSet) == 0 {
		return snap
	}
	out := make([]string, 0, len(descSet))
	for name := range descSet {
		out = append(out, name)
	}
	snap.Descendants = out
	return snap
}

// responsiblePID returns the "responsible PID" for a process — i.e. the PID
// of the app that launched or owns this XPC service. Returns 0 on error.
// Uses PROC_PIDRESPONSIBLEINFO (flavor 21), available since macOS 10.15.
func responsiblePID(pid int) int {
	const (
		procResponsibleInfo    = 21
		proccallnumpidinfo     = 0x2
		responsibleInfoBufSize = 8 // two int32_t fields
	)
	buf := make([]byte, responsibleInfoBufSize)
	n, _, errno := syscall.Syscall6(
		syscall.SYS_PROC_INFO,
		proccallnumpidinfo,
		uintptr(pid),
		procResponsibleInfo,
		0,
		uintptr(unsafe.Pointer(&buf[0])),
		responsibleInfoBufSize)
	if errno != 0 || n < 4 {
		return 0
	}
	// First field is ri_responsible_pid (uint32, native endian).
	rpid := int(uint32(buf[0]) | uint32(buf[1])<<8 | uint32(buf[2])<<16 | uint32(buf[3])<<24)
	if rpid == pid || rpid <= 0 {
		return 0
	}
	return rpid
}

// fullBasenameFromPID returns the basename of the executable path for pid
// using proc_pidpath. Returns "" on error (process exited, permission denied).
func fullBasenameFromPID(pid int) string {
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
	full := unix.ByteSliceToString(buf)
	if full == "" {
		return ""
	}
	return filepath.Base(full)
}
