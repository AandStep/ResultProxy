// Copyright (C) 2026 ResultProxy
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

package system

import (
	"context"
	"net"
	"sync"
	"time"
)

// NetworkStatus describes the current network connectivity state.
type NetworkStatus struct {
	Online    bool   `json:"online"`
	Latency   int64  `json:"latency"`   // ms to test host
	CheckedAt int64  `json:"checkedAt"` // unix timestamp
	Error     string `json:"error,omitempty"`
}

// StatusChangeHandler is called when network status changes.
type StatusChangeHandler func(status NetworkStatus)

// NetMonitor periodically checks internet connectivity and reports changes.
// Unlike polling-based approaches, it pushes events only on state transitions.
type NetMonitor struct {
	mu       sync.Mutex
	ctx      context.Context
	cancel   context.CancelFunc
	interval time.Duration
	handler  StatusChangeHandler
	last     NetworkStatus
	running  bool
}

// Known-reliable hosts for connectivity checks (TCP dial, not ICMP).
var checkHosts = []string{
	"dns.google:443",          // Google DNS
	"one.one.one.one:443",     // Cloudflare DNS
	"208.67.222.222:443",      // OpenDNS
}

// NewNetMonitor creates a network monitor with the given status change handler.
func NewNetMonitor(handler StatusChangeHandler) *NetMonitor {
	return &NetMonitor{
		interval: 5 * time.Second,
		handler:  handler,
		last:     NetworkStatus{Online: true}, // assume online initially
	}
}

// Start begins periodic connectivity checks in a background goroutine.
func (nm *NetMonitor) Start(parentCtx context.Context) {
	nm.mu.Lock()
	if nm.running {
		nm.mu.Unlock()
		return
	}
	nm.ctx, nm.cancel = context.WithCancel(parentCtx)
	nm.running = true
	nm.mu.Unlock()

	go nm.loop()
}

// Stop halts the network monitor.
func (nm *NetMonitor) Stop() {
	nm.mu.Lock()
	defer nm.mu.Unlock()

	if !nm.running {
		return
	}
	if nm.cancel != nil {
		nm.cancel()
	}
	nm.running = false
}

// GetStatus returns the last known network status.
func (nm *NetMonitor) GetStatus() NetworkStatus {
	nm.mu.Lock()
	defer nm.mu.Unlock()
	return nm.last
}

// SetInterval changes the check interval (minimum 1 second).
func (nm *NetMonitor) SetInterval(d time.Duration) {
	if d < time.Second {
		d = time.Second
	}
	nm.mu.Lock()
	nm.interval = d
	nm.mu.Unlock()
}

func (nm *NetMonitor) loop() {
	// Do an initial check immediately.
	nm.check()

	nm.mu.Lock()
	interval := nm.interval
	nm.mu.Unlock()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-nm.ctx.Done():
			return
		case <-ticker.C:
			nm.check()
		}
	}
}

func (nm *NetMonitor) check() {
	status := checkConnectivity()

	nm.mu.Lock()
	changed := status.Online != nm.last.Online
	nm.last = status
	handler := nm.handler
	nm.mu.Unlock()

	// Only notify on state transitions to avoid flooding.
	if changed && handler != nil {
		handler(status)
	}
}

// checkConnectivity tests TCP connectivity to known-reliable hosts.
// Uses TCP dial instead of ICMP to work without admin privileges.
func checkConnectivity() NetworkStatus {
	for _, host := range checkHosts {
		start := time.Now()
		conn, err := net.DialTimeout("tcp", host, 3*time.Second)
		if err == nil {
			conn.Close()
			return NetworkStatus{
				Online:    true,
				Latency:   time.Since(start).Milliseconds(),
				CheckedAt: time.Now().Unix(),
			}
		}
	}

	return NetworkStatus{
		Online:    false,
		CheckedAt: time.Now().Unix(),
		Error:     "all connectivity checks failed",
	}
}
