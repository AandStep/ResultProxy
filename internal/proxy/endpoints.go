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

package proxy

import (
	"encoding/json"
	"strings"
)

const (
	DefaultWireGuardAddress   = "10.0.0.2/32"
	DefaultWireGuardAllowedIP = "0.0.0.0/0"
)



func buildEndpoints(proxy ProxyConfig) []SBEndpoint {
	pt := strings.ToUpper(strings.TrimSpace(proxy.Type))
	if pt != "WIREGUARD" && pt != "AMNEZIAWG" {
		return nil
	}
	extra := parseExtra(proxy)

	address := stringListFromExtra(extra, "address", "local_address", "localAddress")
	if len(address) == 0 {
		address = []string{DefaultWireGuardAddress}
	}

	privateKey := getStringField(extra, "private_key", "")
	if privateKey == "" {
		privateKey = getStringField(extra, "privateKey", "")
	}
	publicKey := getStringField(extra, "public_key", "")
	if publicKey == "" {
		publicKey = getStringField(extra, "publicKey", "")
	}
	psk := getStringField(extra, "pre_shared_key", "")
	if psk == "" {
		psk = getStringField(extra, "preSharedKey", "")
	}

	peerAllowed := stringListFromExtra(extra, "allowed_ips", "allowedIps")
	if len(peerAllowed) == 0 {
		peerAllowed = []string{DefaultWireGuardAllowedIP}
	}

	peer := SBWireGuardPeer{
		Address:                     proxy.IP,
		Port:                        proxy.Port,
		PublicKey:                   publicKey,
		PreSharedKey:                psk,
		AllowedIPs:                  peerAllowed,
		PersistentKeepaliveInterval: intFromExtra(extra, "persistent_keepalive_interval", "persistentKeepaliveInterval"),
		Reserved:                    intListFromExtra(extra, "reserved"),
	}

	ep := SBEndpoint{
		Type:          "wireguard",
		Tag:           "proxy",
		Detour:        "direct",
		System:        getBoolField(extra, "system"),
		Name:          getStringField(extra, "name", ""),
		MTU:           intFromExtra(extra, "mtu", "MTU"),
		Address:       address,
		PrivateKey:    privateKey,
		ListenPort:    intFromExtra(extra, "listen_port", "listenPort"),
		Peers:         []SBWireGuardPeer{peer},
		UDPTimeout:    getStringField(extra, "udp_timeout", ""),
		Workers:       intFromExtra(extra, "workers", "Workers"),
		DisablePauses: getBoolField(extra, "disable_pauses"),
	}

	if pt == "AMNEZIAWG" {
		am := amneziaFromExtra(extra)
		if am != nil {
			ep.Amnezia = am
		}
	}

	return []SBEndpoint{ep}
}

func stringListFromExtra(extra map[string]interface{}, keys ...string) []string {
	for _, k := range keys {
		if v, ok := extra[k]; ok && v != nil {
			if out := stringListFromAny(v); len(out) > 0 {
				return out
			}
		}
	}
	return nil
}

func stringListFromAny(v interface{}) []string {
	switch t := v.(type) {
	case []string:
		var out []string
		for _, s := range t {
			s = strings.TrimSpace(s)
			if s != "" {
				out = append(out, s)
			}
		}
		return out
	case []interface{}:
		var out []string
		for _, it := range t {
			s, ok := it.(string)
			if !ok {
				continue
			}
			s = strings.TrimSpace(s)
			if s != "" {
				out = append(out, s)
			}
		}
		return out
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return nil
		}
		parts := strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == ';' || r == '\n' || r == '\r' || r == '\t' })
		var out []string
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				out = append(out, p)
			}
		}
		return out
	default:
		return nil
	}
}

func intListFromExtra(extra map[string]interface{}, key string) []int {
	if extra == nil {
		return nil
	}
	v, ok := extra[key]
	if !ok || v == nil {
		return nil
	}
	switch t := v.(type) {
	case []int:
		return append([]int(nil), t...)
	case []interface{}:
		var out []int
		for _, it := range t {
			n := intFromAny(it)
			out = append(out, n)
		}
		return out
	default:
		return nil
	}
}

func amneziaFromExtra(extra map[string]interface{}) *SBWireGuardAmnezia {
	v, ok := extra["amnezia"]
	if !ok || v == nil {
		return nil
	}
	m, ok := v.(map[string]interface{})
	if !ok {
		if raw, ok := v.(json.RawMessage); ok && len(raw) > 0 {
			var mm map[string]interface{}
			if json.Unmarshal(raw, &mm) == nil {
				m = mm
			}
		}
	}
	if m == nil {
		return nil
	}
	am := &SBWireGuardAmnezia{
		JC:    intFromAny(m["jc"]),
		JMin:  intFromAny(m["jmin"]),
		JMax:  intFromAny(m["jmax"]),
		S1:    intFromAny(m["s1"]),
		S2:    intFromAny(m["s2"]),
		S3:    intFromAny(m["s3"]),
		S4:    intFromAny(m["s4"]),
		H1:    uint32(intFromAny(m["h1"])),
		H2:    uint32(intFromAny(m["h2"])),
		H3:    uint32(intFromAny(m["h3"])),
		H4:    uint32(intFromAny(m["h4"])),
		I1:    stringFromExtraValue(m["i1"]),
		I2:    stringFromExtraValue(m["i2"]),
		I3:    stringFromExtraValue(m["i3"]),
		I4:    stringFromExtraValue(m["i4"]),
		I5:    stringFromExtraValue(m["i5"]),
		J1:    stringFromExtraValue(m["j1"]),
		J2:    stringFromExtraValue(m["j2"]),
		J3:    stringFromExtraValue(m["j3"]),
		ITime: int64(intFromAny(m["itime"])),
	}
	if *am == (SBWireGuardAmnezia{}) {
		return nil
	}
	return am
}
