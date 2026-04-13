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
	"encoding/base64"
	"encoding/json"
	"net/url"
	"strings"
	"testing"
)

func TestVLESSURIEmbeddedExtraAndOutboundXHTTP(t *testing.T) {
	q := url.Values{}
	q.Set("type", "xhttp")
	q.Set("path", "/xhttp/h3")
	q.Set("host", "cdn.example")
	q.Set("security", "tls")
	q.Set("sni", "example.com")
	q.Set("mode", "stream-one")
	q.Set("method", "POST")
	q.Set("extra", `{"xPaddingBytes":"200-800","headers":{"Referer":"https://ref.example/"}}`)

	line := "vless://af815621-b245-4149-89da-dd184cfc4b3d@example.com:443?" + q.Encode()

	entry, err := ParseProxyURI(line)
	if err != nil {
		t.Fatal(err)
	}

	var ex map[string]interface{}
	if err := json.Unmarshal(entry.Extra, &ex); err != nil {
		t.Fatal(err)
	}
	if got := stringFromExtraValue(ex["x_padding_bytes"]); got != "200-800" {
		t.Fatalf("x_padding_bytes: got %q", got)
	}
	h, ok := ex["headers"].(map[string]interface{})
	if !ok || stringFromExtraValue(h["Referer"]) != "https://ref.example/" {
		t.Fatalf("headers: %+v", ex["headers"])
	}
	if stringFromExtraValue(ex["method"]) != "POST" {
		t.Fatalf("method: %v", ex["method"])
	}

	out := buildProxyOutbound(ProxyConfig{
		IP:    entry.IP,
		Port:  entry.Port,
		Type:  entry.Type,
		Extra: entry.Extra,
	})
	tr := out.Transport
	if tr == nil || tr.Type != "xhttp" {
		t.Fatalf("transport: %+v", tr)
	}
	if tr.Path != "/xhttp/h3" || tr.Host != "cdn.example" || tr.Mode != "stream-one" {
		t.Fatalf("transport fields: %+v", tr)
	}
	if tr.UplinkHTTPMethod != "POST" {
		t.Fatalf("UplinkHTTPMethod: %q", tr.UplinkHTTPMethod)
	}
	if tr.XPaddingBytes != "200-800" {
		t.Fatalf("XPaddingBytes: %q", tr.XPaddingBytes)
	}
	if tr.Headers == nil || tr.Headers["Referer"] != "https://ref.example/" {
		t.Fatalf("Headers: %+v", tr.Headers)
	}
}

func TestXHTTPOmitPaddingWhenAbsent(t *testing.T) {
	q := url.Values{}
	q.Set("type", "xhttp")
	q.Set("path", "/p")
	q.Set("security", "none")
	line := "vless://af815621-b245-4149-89da-dd184cfc4b3d@example.com:80?" + q.Encode()
	entry, err := ParseProxyURI(line)
	if err != nil {
		t.Fatal(err)
	}
	out := buildProxyOutbound(ProxyConfig{IP: entry.IP, Port: entry.Port, Type: entry.Type, Extra: entry.Extra})
	
	if out.Transport == nil || out.Transport.XPaddingBytes != "100-1000" {
		t.Fatalf("expected default XPaddingBytes, got %q", out.Transport.XPaddingBytes)
	}
}

func TestXHTTPPassthroughXmuxScNoGRPC(t *testing.T) {
	extra := map[string]interface{}{
		"uuid":     "af815621-b245-4149-89da-dd184cfc4b3d",
		"network":  "xhttp",
		"security": "tls",
		"path":     "/x",
		"host":     "cdn",
		"sni":      "cdn",
		"xmux": map[string]interface{}{
			"maxConcurrency":   "10-20",
			"hKeepAlivePeriod": float64(30),
		},
		"scMaxEachPostBytes": "100-200",
		"noGRPCHeader":       true,
	}
	raw, err := json.Marshal(extra)
	if err != nil {
		t.Fatal(err)
	}
	out := buildProxyOutbound(ProxyConfig{IP: "example.com", Port: 443, Type: "VLESS", Extra: raw})
	tr := out.Transport
	if tr == nil || tr.Type != "xhttp" {
		t.Fatalf("transport: %+v", tr)
	}
	if tr.Xmux == nil {
		t.Fatal("expected xmux JSON")
	}
	var xmux map[string]interface{}
	if err := json.Unmarshal(tr.Xmux, &xmux); err != nil {
		t.Fatal(err)
	}
	if xmux["max_concurrency"] != "10-20" || xmux["h_keep_alive_period"] != float64(30) {
		t.Fatalf("xmux: %+v", xmux)
	}
	if tr.NoGRPCHeader == nil || !*tr.NoGRPCHeader {
		t.Fatal("no_grpc_header")
	}
	if tr.ScMaxEachPostBytes == nil {
		t.Fatal("sc_max_each_post_bytes")
	}
}

func TestParseSubscriptionBodyJSONList(t *testing.T) {
	body := `[{"outbounds":[{"tag":"proxy","protocol":"vless","settings":{"vnext":[{"address":"api.flowwow.app","port":23356,"users":[{"id":"10f2edcd-9ce8-4e0f-b7f3-f0d580416e7f","encryption":"none","flow":""}]}]},"streamSettings":{"network":"grpc","grpcSettings":{"serviceName":"api","authority":"","mode":false},"security":"reality","realitySettings":{"serverName":"icloud.com","publicKey":"REbCbLiQwWzmUHZgBc-oCO0CMtwgvWURtWkFjNfcQkk","shortId":"4149657667076e2b","fingerprint":"edge"}}}],"remarks":"🇱🇻 Латвия"}]`
	entries, err := ParseSubscriptionBody(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	e := entries[0]
	if e.Type != "VLESS" {
		t.Fatalf("expected VLESS, got %s", e.Type)
	}
	if e.IP != "api.flowwow.app" || e.Port != 23356 {
		t.Fatalf("unexpected endpoint: %s:%d", e.IP, e.Port)
	}
	if !strings.Contains(e.Name, "Латвия") {
		t.Fatalf("unexpected name: %s", e.Name)
	}
	var extra map[string]interface{}
	if err := json.Unmarshal(e.Extra, &extra); err != nil {
		t.Fatalf("extra json: %v", err)
	}
	if extra["security"] != "reality" {
		t.Fatalf("security: %v", extra["security"])
	}
	if extra["network"] != "grpc" {
		t.Fatalf("network: %v", extra["network"])
	}
	if extra["grpc-service-name"] != "api" {
		t.Fatalf("grpc-service-name: %v", extra["grpc-service-name"])
	}
	if extra["serviceName"] != "api" {
		t.Fatalf("serviceName: %v", extra["serviceName"])
	}
	if extra["pbk"] != "REbCbLiQwWzmUHZgBc-oCO0CMtwgvWURtWkFjNfcQkk" {
		t.Fatalf("pbk: %v", extra["pbk"])
	}
}

func TestParseSubscriptionBodyBase64Fallback(t *testing.T) {
	raw := "vless://10f2edcd-9ce8-4e0f-b7f3-f0d580416e7f@example.com:443?type=grpc&security=reality&pbk=abc123&sid=1#Node"
	body := base64.StdEncoding.EncodeToString([]byte(raw))
	entries, err := ParseSubscriptionBody(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Type != "VLESS" {
		t.Fatalf("expected VLESS, got %s", entries[0].Type)
	}
}

func TestVLESSURIGrpcServiceNameBuildsOutboundTransport(t *testing.T) {
	raw := "vless://10f2edcd-9ce8-4e0f-b7f3-f0d580416e7f@example.com:443?type=grpc&security=tls&serviceName=api#Node"
	entry, err := ParseProxyURI(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var extra map[string]interface{}
	if err := json.Unmarshal(entry.Extra, &extra); err != nil {
		t.Fatalf("extra json: %v", err)
	}
	if extra["grpc-service-name"] != "api" {
		t.Fatalf("grpc-service-name: %v", extra["grpc-service-name"])
	}
	if extra["serviceName"] != "api" {
		t.Fatalf("serviceName: %v", extra["serviceName"])
	}

	out := buildProxyOutbound(ProxyConfig{
		IP:    entry.IP,
		Port:  entry.Port,
		Type:  entry.Type,
		Extra: entry.Extra,
	})
	if out.Transport == nil {
		t.Fatal("transport is nil")
	}
	if out.Transport.Type != "grpc" {
		t.Fatalf("transport type: %s", out.Transport.Type)
	}
	if out.Transport.ServiceName != "api" {
		t.Fatalf("transport service_name: %v", out.Transport.ServiceName)
	}
}

func TestParseHysteria2URI(t *testing.T) {
	raw := "hy2://00f1a4734fd945648b7e621725695fa8@45.145.56.185:443/?obfs=salamander&obfs-password=UrIoouVH0TA8LbvphmPrxGjO5L3BnImV&sni=h2gr3.impio.space&insecure=0#impVPN%20%7C%20%D0%93%D0%B5%D1%80%D0%BC%D0%B0%D0%BD%D0%B8%D1%8F%20%F0%9F%87%A9%F0%9F%87%AA"
	entry, err := ParseProxyURI(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entry.Type != "HYSTERIA2" {
		t.Fatalf("expected HYSTERIA2, got %s", entry.Type)
	}
	if entry.IP != "45.145.56.185" || entry.Port != 443 {
		t.Fatalf("unexpected endpoint: %s:%d", entry.IP, entry.Port)
	}
	if entry.Name != "impVPN | Германия 🇩🇪" {
		t.Fatalf("unexpected name: %s", entry.Name)
	}

	var extra map[string]interface{}
	if err := json.Unmarshal(entry.Extra, &extra); err != nil {
		t.Fatalf("extra json: %v", err)
	}
	if extra["password"] != "00f1a4734fd945648b7e621725695fa8" {
		t.Fatalf("password: %v", extra["password"])
	}
	if extra["sni"] != "h2gr3.impio.space" {
		t.Fatalf("sni: %v", extra["sni"])
	}
	if extra["obfs_type"] != "salamander" {
		t.Fatalf("obfs_type: %v", extra["obfs_type"])
	}
	if extra["obfs_password"] != "UrIoouVH0TA8LbvphmPrxGjO5L3BnImV" {
		t.Fatalf("obfs_password: %v", extra["obfs_password"])
	}
	insecure, ok := extra["insecure"].(bool)
	if !ok || insecure {
		t.Fatalf("insecure: %v", extra["insecure"])
	}
}

func TestParseHysteria2URIAlias(t *testing.T) {
	raw := "hysteria2://00f1a4734fd945648b7e621725695fa8@45.145.56.185:443/?obfs=salamander&obfs-password=UrIoouVH0TA8LbvphmPrxGjO5L3BnImV&sni=h2gr3.impio.space&insecure=1#Node"
	entry, err := ParseProxyURI(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entry.Type != "HYSTERIA2" {
		t.Fatalf("expected HYSTERIA2, got %s", entry.Type)
	}
	if entry.IP != "45.145.56.185" || entry.Port != 443 {
		t.Fatalf("unexpected endpoint: %s:%d", entry.IP, entry.Port)
	}

	var extra map[string]interface{}
	if err := json.Unmarshal(entry.Extra, &extra); err != nil {
		t.Fatalf("extra json: %v", err)
	}
	if extra["password"] != "00f1a4734fd945648b7e621725695fa8" {
		t.Fatalf("password: %v", extra["password"])
	}
	insecure, ok := extra["insecure"].(bool)
	if !ok || !insecure {
		t.Fatalf("insecure: %v", extra["insecure"])
	}
}

func TestParseSubscriptionBodyUnsupported(t *testing.T) {
	_, err := ParseSubscriptionBody("not-a-subscription")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "unsupported subscription format") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseWireGuardURI(t *testing.T) {
	raw := "wg://privKey:pskKey@1.2.3.4:51820?public_key=pubKey&address=10.0.0.2/32,fd00::2/128&allowed_ips=0.0.0.0/0,::/0&mtu=1360#WG%20Node"
	entry, err := ParseProxyURI(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if entry.Type != "WIREGUARD" {
		t.Fatalf("expected WIREGUARD, got %s", entry.Type)
	}
	if entry.IP != "1.2.3.4" || entry.Port != 51820 {
		t.Fatalf("unexpected endpoint: %s:%d", entry.IP, entry.Port)
	}
	var extra map[string]interface{}
	if err := json.Unmarshal(entry.Extra, &extra); err != nil {
		t.Fatalf("extra json: %v", err)
	}
	if extra["private_key"] != "privKey" || extra["public_key"] != "pubKey" {
		t.Fatalf("unexpected keys: %+v", extra)
	}
	if extra["pre_shared_key"] != "pskKey" {
		t.Fatalf("unexpected psk: %v", extra["pre_shared_key"])
	}
}
