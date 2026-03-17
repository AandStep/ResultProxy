export type ParsedProxy = {
    ip: string;
    port: string;
    username: string;
    password: string;
    type: string;
    name?: string;
};

/**
 * Валидация IP-адреса или домена
 */
export const validateIp = (ip: string): boolean => {
    if (!ip || typeof ip !== 'string') return false;
    
    // Регулярное выражение для IPv4, IPv6 и доменных имен
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
    
    const cleanIp = ip.split(':')[0]; // На случай, если передан ip:port
    
    return ipv4Regex.test(cleanIp) || ipv6Regex.test(cleanIp) || domainRegex.test(cleanIp);
};

/**
 * Валидация порта
 */
export const validatePort = (port: string | number): boolean => {
    const num = Number(port);
    return Number.isInteger(num) && num >= 1 && num <= 65535;
};

/**
 * Комплексная валидация прокси
 */
export const validateProxy = (proxy: Partial<ParsedProxy>): boolean => {
    if (!proxy || typeof proxy !== 'object') return false;
    if (!proxy.ip || !validateIp(proxy.ip)) return false;
    if (!proxy.port || !validatePort(proxy.port)) return false;
    return true;
};

export const parseProxies = (content: string): ParsedProxy[] => {
    if (!content || typeof content !== 'string') return [];

    const lines = content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
    if (lines.length === 0) return [];

    const firstLine = lines[0].toLowerCase();
    let parsed: ParsedProxy[] = [];
    
    if (firstLine.includes('ip') && firstLine.includes('port')) {
        parsed = parseCSV(lines);
    } else {
        parsed = lines.map(line => parseTxtLine(line)).filter((p): p is ParsedProxy => p !== null);
    }

    // Фильтрация валидных прокси
    return parsed.filter(validateProxy);
};

const parseCSV = (lines: string[]): ParsedProxy[] => {
    const headers = lines[0].split(/[;,]/).map(h => h.trim().toLowerCase());
    const results: ParsedProxy[] = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(/[;,]/).map(v => v.trim());
        if (values.length < 2) continue;

        const proxy: Partial<ParsedProxy> & { type: string } = { type: 'HTTP' };

        headers.forEach((header, index) => {
            const val = values[index];
            if (!val) return;
            
            if (header === 'ip') proxy.ip = val;
            else if (header === 'port') proxy.port = val;
            else if (header === 'login' || header === 'username' || header === 'user')
                proxy.username = val;
            else if (header === 'password' || header === 'pass') proxy.password = val;
            else if (header === 'type' || header === 'protocol')
                proxy.type = val.toUpperCase();
            else if (header === 'name') proxy.name = val;
        });

        if (proxy.ip && proxy.port) {
            results.push({
                ip: proxy.ip,
                port: proxy.port,
                username: proxy.username || '',
                password: proxy.password || '',
                type: proxy.type,
                name: proxy.name,
            });
        }
    }

    return results;
};

const parseTxtLine = (line: string): ParsedProxy | null => {
    // Формат ip:port@login:password
    if (line.includes('@')) {
        const [server, auth] = line.split('@');
        if (!server) return null;
        
        const [ip, port] = server.split(':');
        const [login, password] = (auth || '').split(':');
        if (ip && port) {
            return {
                ip,
                port,
                username: login || '',
                password: password || '',
                type: 'HTTP',
            };
        }
    }

    // Формат ip:port:login:password
    const parts = line.split(':');
    if (parts.length >= 2) {
        return {
            ip: parts[0],
            port: parts[1],
            username: parts[2] || '',
            password: parts[3] || '',
            type: 'HTTP',
        };
    }

    return null;
};
