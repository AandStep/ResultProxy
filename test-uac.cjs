/*
 * Copyright (C) 2026 ResultProxy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const { spawn } = require("child_process");

const exePath = process.execPath;
const args = ["-v"];

console.log(`Executable: ${exePath}`);

const psArgs = [
  "-WindowStyle",
  "Hidden",
  "-Command",
  `Start-Sleep -Seconds 2; Start-Process -FilePath '${exePath}' -ArgumentList '${args.join(" ")}' -Verb RunAs`,
];

console.log(`Command: powershell ${psArgs.join(" ")}`);

const child = spawn("powershell", psArgs, {
  detached: true,
  stdio: "ignore",
});

child.unref();
console.log("PS spawn success, exiting parent process...");
process.exit(0);
