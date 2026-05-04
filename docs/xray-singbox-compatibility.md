# Xray ↔ sing-box compatibility matrix

This document tracks how ResultV translates Xray-style configuration knobs into the
sing-box-extended engine it ships. Where Xray and sing-box disagree on a field name
ResultV accepts both spellings (camelCase / snake_case / Clash aliases) so any
mainstream URI or JSON subscription works without manual editing.

## Protocols

| Protocol      | Xray field                | sing-box field                  | ResultV behaviour                                                              |
| ------------- | ------------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| VLESS         | `id`, `flow`, `encryption`| `uuid`, `flow`                  | URI + JSON. `xtls-rprx-vision` flow forwarded as-is.                           |
| VLESS UDP     | `packet_encoding` (Xray's xudp) | `packet_encoding`         | Defaults to `xudp`; override via `packet_encoding=none/packetaddr/...`.        |
| VMess         | `scy` (cipher)            | `security`                      | Maps `scy`/`encryption`/`security_cipher` → `security`.                        |
| VMess         | `globalPadding`, `authenticatedLength` | `global_padding`, `authenticated_length` | Both spellings accepted.                              |
| Trojan        | `password` (TLS)          | `password`                      | URI + JSON.                                                                    |
| Shadowsocks   | `method`/`password`       | `method`/`password`             | URI + JSON.                                                                    |
| Hysteria2     | `auth`/`password`/`auth_str`/`userpass` | `password`            | All aliases accepted. ALPN defaults to `h3`.                                   |
| WireGuard     | `secretKey`/`publicKey`/`peers[].endpoint` | `private_key`/`peers[].public_key`/`peers[].address`+`peers[].port` | URI (`wg://`), JSON (Xray + sing-box shapes).            |
| AmneziaWG     | `awg://?Jc=&Jmin=&...`    | endpoint `amnezia` block        | Full AWG 2.0: `Jc/Jmin/Jmax`, `S1-S4`, `H1-H4`, `I1-I5`, `J1-J3`, `Itime`. Case-insensitive query keys. JSON subscriptions with `amnezia` block parsed. JMin>JMax auto-swapped, negatives clamped to 0. |

## Transports

| Transport             | Xray         | sing-box      | ResultV notes                                                                       |
| --------------------- | ------------ | ------------- | ----------------------------------------------------------------------------------- |
| Raw TCP               | `tcp`        | (none)        | Default. ALPN left empty for plain TCP to avoid h2/Trojan framing mismatches.       |
| TCP + HTTP obfs       | `tcp` + `header.type=http` | `http` | Auto-converted to `transport.type=http` with method/path/Host headers extracted. |
| WebSocket             | `ws`         | `ws`          | `path`, `host`, `ed=N` (early data) → `max_early_data` + `early_data_header_name`.  |
| WebSocket early-data  | `?ed=2048` in path | `max_early_data`, `early_data_header_name` | Auto-extracted from path; default header `Sec-WebSocket-Protocol`. |
| HTTPUpgrade           | `httpupgrade`| `httpupgrade` | `path`, `host` forwarded.                                                           |
| HTTP/2                | `http`/`h2`  | `http`        | `host`, `path`, `method`.                                                           |
| gRPC                  | `grpc`       | `grpc`        | `service_name`, `idle_timeout`, `ping_timeout`, `permit_without_stream`.            |
| xhttp / splithttp     | `xhttp`      | `xhttp`       | Mode (`stream-one`/`packet-up`/`stream-up`), `xPaddingBytes`, `xmux`, `noGRPCHeader`, `scMaxEachPostBytes` etc. preserved. |

## TLS / Reality

| Field               | Xray             | sing-box                     | ResultV behaviour                                          |
| ------------------- | ---------------- | ---------------------------- | ---------------------------------------------------------- |
| Server name         | `serverName`/`sni` | `tls.server_name`          | Both accepted; falls back to peer host.                    |
| ALPN                | `alpn` (CSV)     | `tls.alpn` (array)           | Splits on `,`/`\n`/`|`/`;`. Default `h2,http/1.1` for HTTP-style transports; empty for plain TCP. |
| uTLS fingerprint    | `fp`             | `tls.utls.fingerprint`       | Aliases: `fp`, `client-fingerprint`, `clientFingerprint`, `client_fingerprint`. |
| Reality public key  | `pbk`            | `tls.reality.public_key`     | Aliases: `pbk`, `publicKey`, `public_key`.                 |
| Reality short ID    | `sid`            | `tls.reality.short_id`       | Lower-cased if pure hex; pass-through otherwise.           |
| Reality SpiderX     | `spx`            | `tls.reality.spider_x`       | Aliases: `spx`, `spider_x`, `spiderX`.                     |
| Min/Max TLS version | (Xray uses Go std lib) | `tls.min_version`/`tls.max_version` | Aliases: `min_version`/`minVersion`/`tls-min-version`. |
| Cipher suites       | (n/a)            | `tls.cipher_suites`          | Aliases: `cipher_suites`/`cipherSuites`. Splits on `,/:/;/\n/|`. |

## Known gaps

- **Multi-peer WireGuard** subscriptions: only the first peer is consumed (matches Xray's typical client-side single-peer pattern).
- **TUIC / Naive / etc.** are not implemented; ResultV currently focuses on the protocols above.
- ALPN for plain TCP: deliberately left empty so the server picks a compatible value. If you set ALPN explicitly via URI/JSON it is honoured verbatim.
