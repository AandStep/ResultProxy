const util = require("util");
const { execFile, exec } = require("child_process");
const execFileAsync = util.promisify(execFile);
const execAsync = util.promisify(exec);

async function test() {
  try {
    const { stdout } = await execFileAsync("cmd.exe", [
      "/c",
      'netstat -ano | findstr ":443"',
    ]);
    console.log(
      "execFileAsync cmd.exe findstr OK, lines:",
      stdout.split("\n").length,
    );
  } catch (e) {
    console.error("execFileAsync cmd.exe findstr ERR:", e.message);
  }

  try {
    const { stdout } = await execAsync('netstat -ano | findstr ":443"');
    console.log("execAsync findstr OK, lines:", stdout.split("\n").length);
  } catch (e) {
    console.error("execAsync findstr ERR:", e.message);
  }

  try {
    const { stdout } = await execFileAsync("wmic", [
      "process",
      "get",
      "Name,ParentProcessId,ProcessId",
    ]);
    console.log("wmic execFileAsync OK, len:", stdout.length);
  } catch (e) {
    console.error("wmic execFileAsync ERR:", e.message);
  }
}

test();
