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

package proxy

import (
	"net"
	"testing"
)

func TestIsEngineTunIPv4(t *testing.T) {
	if !isEngineTunIPv4(net.ParseIP("172.19.0.1")) {
		t.Fatal("expected 172.19.0.1 to match engine TUN subnet")
	}
	if isEngineTunIPv4(net.ParseIP("172.19.1.1")) {
		t.Fatal("expected 172.19.1.1 outside /30")
	}
	if isEngineTunIPv4(net.ParseIP("10.0.0.1")) {
		t.Fatal("expected 10.0.0.1 not to match")
	}
}

func TestLooksLikeTunnelInterface(t *testing.T) {
	if !looksLikeTunnelInterface("Wintun Userspace Tunnel") {
		t.Fatal("wintun")
	}
	if looksLikeTunnelInterface("Ethernet") {
		t.Fatal("ethernet")
	}
}
