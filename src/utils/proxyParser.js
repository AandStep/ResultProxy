/**
 * Парсит строку или содержимое файла с прокси.
 * Поддерживает форматы:
 * 1. CSV с заголовками (ip,port,login,password)
 * 2. ip:port:login:password
 * 3. ip:port@login:password
 */
export const parseProxies = (content) => {
  if (!content || typeof content !== "string") return [];

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  // Проверка на CSV с заголовками
  const firstLine = lines[0].toLowerCase();
  if (firstLine.includes("ip") && firstLine.includes("port")) {
    return parseCSV(lines);
  }

  // Парсинг TXT форматов
  return lines.map((line) => parseTxtLine(line)).filter((p) => p !== null);
};

const parseCSV = (lines) => {
  const headers = lines[0].split(/[;,]/).map((h) => h.trim().toLowerCase());
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(/[;,]/).map((v) => v.trim());
    if (values.length < 2) continue;

    const proxy = {
      type: "HTTP", // Значение по умолчанию
    };

    headers.forEach((header, index) => {
      const val = values[index];
      if (header === "ip") proxy.ip = val;
      else if (header === "port") proxy.port = val;
      else if (header === "login" || header === "username" || header === "user")
        proxy.username = val;
      else if (header === "password" || header === "pass") proxy.password = val;
      else if (header === "type" || header === "protocol")
        proxy.type = val.toUpperCase();
      else if (header === "name") proxy.name = val;
    });

    if (proxy.ip && proxy.port) {
      results.push(proxy);
    }
  }

  return results;
};

const parseTxtLine = (line) => {
  // Формат ip:port@login:password
  if (line.includes("@")) {
    const [server, auth] = line.split("@");
    const [ip, port] = server.split(":");
    const [login, password] = auth.split(":");
    if (ip && port) {
      return {
        ip,
        port,
        username: login || "",
        password: password || "",
        type: "HTTP",
      };
    }
  }

  // Формат ip:port:login:password или ip:port
  const parts = line.split(":");
  if (parts.length >= 2) {
    return {
      ip: parts[0],
      port: parts[1],
      username: parts[2] || "",
      password: parts[3] || "",
      type: "HTTP",
    };
  }

  return null;
};
