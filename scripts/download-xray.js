import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import https from 'https';
import { extract } from 'zip-lib';

const XRAY_VERSION = '1.8.24'; // Using a stable recent version
const XRAY_REPO = 'XTLS/Xray-core';

const getDownloadUrl = (platform, arch) => {
  let fileName = '';
  if (platform === 'win32') {
    fileName = arch === 'x64' ? `Xray-windows-64.zip` : `Xray-windows-32.zip`;
  } else if (platform === 'linux') {
    fileName = arch === 'x64' ? `Xray-linux-64.zip` : `Xray-linux-arm64-v8a.zip`;
  } else if (platform === 'darwin') {
    fileName = arch === 'arm64' ? `Xray-macos-arm64-v8a.zip` : `Xray-macos-64.zip`;
  }

  if (!fileName) throw new Error(`Unsupported platform/arch: ${platform}/${arch}`);

  return `https://github.com/${XRAY_REPO}/releases/download/v${XRAY_VERSION}/${fileName}`;
};

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
      }

      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
};

async function main() {
  const platform = process.platform;
  const arch = process.arch;

  const binDir = path.join(process.cwd(), 'backend', 'core', 'bin');
  await fsp.mkdir(binDir, { recursive: true });

  const tempZip = path.join(binDir, 'xray-temp.zip');

  console.log(`Downloading Xray-core v${XRAY_VERSION} for ${platform}-${arch}...`);
  try {
    const url = getDownloadUrl(platform, arch);
    console.log(`URL: ${url}`);

    await downloadFile(url, tempZip);
    console.log('Download complete. Extracting...');
    await extract(tempZip, binDir);
    console.log('Extracted successfully.');
    await fsp.unlink(tempZip);
    console.log('Cleanup complete.');
  } catch (e) {
    console.error(e);
  }
}

main();
