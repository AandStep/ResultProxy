export const detectCountry = async (ip, name = "") => {
  try {
    let cleanIp = ip.split(":")[0];
    if (
      cleanIp === "127.0.0.1" ||
      cleanIp === "localhost" ||
      cleanIp.startsWith("192.168.")
    ) {
      return "local";
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `http://ip-api.com/json/${cleanIp}?fields=countryCode`,
      { signal: controller.signal },
    );
    clearTimeout(id);
    const data = await res.json();
    if (data.countryCode) {
      return data.countryCode.toLowerCase();
    }
  } catch (error) {}

  const s = name.toLowerCase();
  if (
    s.includes("ru") ||
    s.includes("rus") ||
    s.includes("ру") ||
    s.includes("россия")
  )
    return "ru";
  if (
    s.includes("us") ||
    s.includes("usa") ||
    s.includes("сша") ||
    s.includes("america")
  )
    return "us";
  if (s.includes("de") || s.includes("germany") || s.includes("герм"))
    return "de";
  if (
    s.includes("uk") ||
    s.includes("gb") ||
    s.includes("london") ||
    s.includes("англия") ||
    s.includes("британ")
  )
    return "gb";
  if (
    s.includes("nl") ||
    s.includes("neth") ||
    s.includes("нидерланд") ||
    s.includes("голландия")
  )
    return "nl";
  if (s.includes("fr") || s.includes("france") || s.includes("франц"))
    return "fr";
  if (s.includes("kz") || s.includes("kazakhstan") || s.includes("казах"))
    return "kz";
  if (s.includes("ua") || s.includes("ukraine") || s.includes("украин"))
    return "ua";
  if (s.includes("tr") || s.includes("turkey") || s.includes("турц"))
    return "tr";
  if (s.includes("fi") || s.includes("finland") || s.includes("финлянд"))
    return "fi";

  return "unknown";
};
