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

const EventEmitter = require("events");

class StateStore extends EventEmitter {
  constructor() {
    super();
    this.state = {
      isConnected: false,
      activeProxy: null,
      bytesSent: 0,
      bytesReceived: 0,
      speedReceived: 0,
      speedSent: 0,
      isProxyDead: false,
      killSwitch: false,
      adblock: false,
      uiProxies: [], // proxies cached from UI
      lastTickStats: { received: 0, sent: 0, time: Date.now() },
      sessionStartStats: { received: 0, sent: 0 },
    };
  }

  getState() {
    return this.state;
  }

  update(partialState) {
    let changed = false;
    for (const key in partialState) {
      if (this.state[key] !== partialState[key]) {
        this.state[key] = partialState[key];
        changed = true;
      }
    }
    if (changed) {
      this.emit("change", this.state);
    }
  }
}

module.exports = new StateStore();
