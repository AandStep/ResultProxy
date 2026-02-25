// === СИСТЕМА ДИНАМИЧЕСКОГО ШИФРОВАНИЯ (БЕЗ ХАРДКОДА) ===
export const encryptWithPassword = (data, pwd) => {
  try {
    const text = JSON.stringify(data);
    const bytes = new TextEncoder().encode(text);
    const pwdBytes = new TextEncoder().encode(pwd);

    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = bytes[i] ^ pwdBytes[i % pwdBytes.length];
    }

    let bin = "";
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
  } catch (e) {
    return null;
  }
};

export const decryptWithPassword = (encodedStr, pwd) => {
  try {
    const bin = atob(encodedStr);
    const bytes = new Uint8Array(bin.length);
    const pwdBytes = new TextEncoder().encode(pwd);

    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i) ^ pwdBytes[i % pwdBytes.length];
    }

    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  } catch (e) {
    // Резервный метод для поддержки старых форматов
    try {
      const resultBinary = atob(encodedStr);
      let decodedText = "";
      for (let i = 0; i < resultBinary.length; i++) {
        decodedText += String.fromCharCode(
          resultBinary.charCodeAt(i) ^ pwd.charCodeAt(i % pwd.length),
        );
      }
      return JSON.parse(decodeURIComponent(decodedText));
    } catch (err) {
      return null;
    }
  }
};
