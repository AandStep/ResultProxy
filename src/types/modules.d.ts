import { NativeModules } from 'react-native';

declare module 'react-native' {
  interface NativeModulesStatic {
    VpnModule: {
      startVpn(proxyHost: string, proxyPort: number, appWhitelist: string[]): void;
      stopVpn(): void;
    };
  }
}

export {};
