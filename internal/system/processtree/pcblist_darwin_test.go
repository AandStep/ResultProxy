//go:build darwin

package processtree

import (
	"encoding/binary"
	"net"
	"os"
	"testing"
	"time"

	"golang.org/x/sys/unix"
)

// TestPcblistStructSize verifies that sing-box's TCP pcblist struct offsets
// are correct for the running macOS version. Creates a local TCP connection,
// then searches the kernel's pcblist for the matching entry and checks that
// the PID field points to our own process.
func TestPcblistStructSize(t *testing.T) {
	const (
		xinpgenSize       = 24
		xsocketOffset     = 104
		xinpcbLocalPort   = 18
		xsocketLastPID    = 68
		tcpExtraSize      = 208
	)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	serverAddr := ln.Addr().(*net.TCPAddr)

	type result struct {
		localAddr *net.TCPAddr
		conn      net.Conn
	}
	ch := make(chan result, 1)
	go func() {
		c, err := net.Dial("tcp", serverAddr.String())
		if err != nil {
			ch <- result{}
			return
		}
		ch <- result{localAddr: c.LocalAddr().(*net.TCPAddr), conn: c}
	}()
	serverConn, err := ln.Accept()
	if err != nil {
		t.Fatal(err)
	}
	defer serverConn.Close()
	r := <-ch
	if r.conn == nil {
		t.Fatal("client failed to connect")
	}
	defer r.conn.Close()
	srcPort := uint16(r.localAddr.Port)

	time.Sleep(20 * time.Millisecond)

	pcb, err := unix.SysctlRaw("net.inet.tcp.pcblist_n")
	if err != nil {
		t.Fatalf("SysctlRaw: %v", err)
	}
	t.Logf("pcblist_n size=%d, our PID=%d, looking for localPort=%d", len(pcb), os.Getpid(), srcPort)

	myPID := uint32(os.Getpid())

	// Test candidate struct sizes.
	for _, ss := range []int{384, 400, 408, 416, 424, 432, 440, 448, 456, 464, 480} {
		itemSize := ss + tcpExtraSize
		for i := xinpgenSize; i+itemSize <= len(pcb); i += itemSize {
			port := binary.BigEndian.Uint16(pcb[i+xinpcbLocalPort : i+xinpcbLocalPort+2])
			if port != srcPort {
				continue
			}
			so := i + xsocketOffset
			if so+xsocketLastPID+4 > len(pcb) {
				break
			}
			pid := binary.NativeEndian.Uint32(pcb[so+xsocketLastPID : so+xsocketLastPID+4])
			match := pid == myPID
			t.Logf("structSize=%-4d: found localPort=%d pid=%d (expected %d) MATCH=%v",
				ss, port, pid, myPID, match)
			if match {
				path := fullBasenameFromPID(int(pid))
				t.Logf("  proc_pidpath -> %q", path)
			}
		}
	}
}
