import RNFS from 'react-native-fs';

const AD_BLOCK_LIST_URL = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts';
const LOCAL_HOSTS_PATH = `${RNFS.DocumentDirectoryPath}/adblock_hosts.json`;

export const adblockService = {
    /**
     * Загружает список доменов для блокировки и конвертирует в JSON для быстрого доступа в Kotlin
     */
    updateHosts: async () => {
        try {
            const response = await fetch(AD_BLOCK_LIST_URL);
            const text = await response.text();
            
            const domains: string[] = [];
            const lines = text.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('0.0.0.0 ')) {
                    const domain = trimmed.split(' ')[1];
                    if (domain && domain !== '0.0.0.0') {
                        domains.push(domain);
                    }
                }
            }

            // Ограничиваем список для производительности мобильного устройства (топ 50к)
            const result = domains.slice(0, 50000);
            await RNFS.writeFile(LOCAL_HOSTS_PATH, JSON.stringify(result), 'utf8');
            return true;
        } catch (error) {
            console.error('[AdBlock] Update failed:', error);
            return false;
        }
    },

    getHostsPath: () => LOCAL_HOSTS_PATH
};
