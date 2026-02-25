const WindowsProcess = require("./backend/system/process/WindowsProcess.cjs");
const BaseProcessManager = require("./backend/system/process/BaseProcessManager.cjs");

async function test() {
  const pm = new WindowsProcess();

  // mock process cache behavior
  pm.isCaching = false;

  console.log("Fetching process list...");
  const list = await pm.fetchRawProcessList();
  console.log(`Found ${Object.keys(list || {}).length} processes in raw list.`);

  // test getProcessInfo for node
  const pid = process.pid.toString();
  console.log(`Testing getProcessInfo for self (PID: ${pid})...`);
  const info = await pm.getProcessInfo(pid);
  console.log("Self info:", info);

  // test checkAppWhitelist with "node.exe" mapping to some remotePort
  // We'll create a socket to ourselves
  const net = require("net");
  const server = net.createServer(async (c) => {
    console.log("Got connection from port:", c.remotePort);

    // Test getPidByPort
    const socketPid = await pm.getPidByPort(c.remotePort);
    console.log("getPidByPort returned:", socketPid);

    // Test checkAppWhitelist
    const res = await pm.checkAppWhitelist(
      c.remotePort,
      ["node.exe", "discord.exe"],
      "test.local",
      console.log,
    );
    console.log("checkAppWhitelist returned:", res);

    c.end();
    server.close();
  });

  server.listen(14082, "127.0.0.1", () => {
    console.log("Server listening, connecting...");
    net.connect(14082, "127.0.0.1");
  });
}

test();
