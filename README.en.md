# ResultProxy

*Read this in other languages: [Русский](README.md)*

**ResultProxy** is a cross-platform proxy application built with Electron, React, and Vite.

🌐 **Official Project Website:** [https://result-proxy.ru/](https://result-proxy.ru/)

## ✨ Features

- Built-in ad blocker powered by `@ghostery/adblocker`
- HTTP and SOCKS proxy support
- Modern user interface built with React and Tailwind CSS
- Cross-platform (Windows, macOS, Linux)
- Multi-language interface (integrated with `i18next`)

## 🚀 Installation & Launch (for developers)

### Prerequisites

- Node.js (LTS version recommended)
- npm

### Steps

1. Clone the repository and navigate to the project directory:
   ```bash
   git clone <your_repository_link>
   cd ResultProxy
   ```

2. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```

3. Run the project in development mode:
   ```bash
   npm run dev
   ```
   *This command will simultaneously start the Vite process for React and the main Electron application window.*

## 📦 Building the Application

To build the installer files like `.exe`, `.AppImage`, and other formats, use the following commands:

- **For Windows:**
  ```bash
  npm run package
  ```

- **For Linux:**
  ```bash
  npm run package:linux
  ```

## 🛠 Tech Stack

- **Cross-platform framework:** [Electron](https://www.electronjs.org/)
- **Frontend:** [React](https://reactjs.org/), [Vite](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/)
- **Proxy and Networking:** `proxy-chain`, `socks`, `express`
- **Ad Blocking:** [@ghostery/adblocker](https://github.com/ghostery/adblocker)

---

**More information and app download:** [https://result-proxy.ru/](https://result-proxy.ru/)
