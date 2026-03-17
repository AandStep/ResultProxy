import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEFAULT_DAEMON_URL = Platform.OS === 'android' ? 'http://10.0.2.2:14091' : 'http://127.0.0.1:14091';
const DEFAULT_TOKEN = 'dev-token-result-proxy-2026';

let cachedToken: string | null = DEFAULT_TOKEN;
let cachedUrl: string | null = null;

export const getBaseUrl = async (): Promise<string> => {
    if (cachedUrl) return cachedUrl;
    cachedUrl = (await AsyncStorage.getItem('daemonUrl')) || DEFAULT_DAEMON_URL;
    return cachedUrl;
};

export const setBaseUrl = async (url: string): Promise<void> => {
    cachedUrl = url;
    await AsyncStorage.setItem('daemonUrl', url);
};

export const setApiToken = async (token: string): Promise<void> => {
    cachedToken = token;
    await AsyncStorage.setItem('apiToken', token);
};

export const apiFetch = async (
    endpoint: string,
    options: RequestInit = {},
): Promise<Response> => {
    if (!cachedToken) {
        cachedToken = (await AsyncStorage.getItem('apiToken')) ?? '';
    }
    const baseUrl = await getBaseUrl();

    return fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${cachedToken}`,
        },
    });
};
