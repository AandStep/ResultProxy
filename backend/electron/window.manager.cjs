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

const { BrowserWindow, nativeImage, app, session, shell } = require("electron");
const path = require("path");

class WindowManager {
  constructor() {
    this.mainWindow = null;
  }

  create(show = true) {
    const isDev = process.env.NODE_ENV === "development";
    const iconPath = isDev
      ? path.join(__dirname, "../../public", "logo.png")
      : path.join(__dirname, "../../dist", "logo.png");

    this.mainWindow = new BrowserWindow({
      width: 1050,
      height: 780,
      icon: nativeImage.createFromPath(iconPath),
      autoHideMenuBar: true,
      show: show,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        preload: path.join(__dirname, "preload.cjs"),
      },
    });

    // Открываем внешние ссылки в системном браузере
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http:") || url.startsWith("https:")) {
        shell.openExternal(url);
        return { action: "deny" };
      }
      return { action: "allow" };
    });

    // CSP-заголовки (только в production — в dev Vite требует inline-скрипты и WebSocket для HMR)
    if (!isDev) {
      session.defaultSession.webRequest.onHeadersReceived(
        (details, callback) => {
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              "Content-Security-Policy": [
                [
                  "default-src 'self'",
                  "script-src 'self'",
                  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                  "font-src 'self' https://fonts.gstatic.com",
                  "img-src 'self' data: https://flagcdn.com https://cdnjs.cloudflare.com",
                  "connect-src 'self' http://127.0.0.1:14080 https://raw.githubusercontent.com",
                ].join("; "),
              ],
            },
          });
        },
      );
    }

    this.mainWindow.loadURL(
      isDev
        ? "http://localhost:5173"
        : `file://${path.join(__dirname, "../../dist/index.html")}`,
    );

    this.mainWindow.on("close", (event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        this.mainWindow.hide();
      }
      return false;
    });
  }

  show() {
    if (this.mainWindow) {
      if (!this.mainWindow.isVisible()) this.mainWindow.show();
      if (this.mainWindow.isMinimized()) this.mainWindow.restore();
      this.mainWindow.focus();
    }
  }

  toggle() {
    if (this.mainWindow) {
      this.mainWindow.isVisible()
        ? this.mainWindow.hide()
        : this.mainWindow.show();
    }
  }
}

module.exports = WindowManager;
