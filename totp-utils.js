/* TOTP (Time-based One-Time Password) Generator */
(() => {
  window.TOTPUtils = {
    /**
     * Generiert einen 6-stelligen TOTP-Code aus einem Secret
     * @param {string} secret - Base32-kodierter Secret Key
     * @returns {string} 6-stelliger TOTP-Code
     */
    generateTOTP(secret) {
      try {
        // Entferne Leerzeichen und konvertiere zu Großbuchstaben
        secret = secret.replace(/\s/g, '').toUpperCase();
        
        // Dekodiere Base32
        const key = this.base32Decode(secret);
        
        // Berechne Time Counter (30 Sekunden Intervall)
        const timeCounter = Math.floor(Date.now() / 1000 / 30);
        
        // Generiere HMAC-SHA1
        const hmac = this.hmacSHA1(key, this.intToBytes(timeCounter));
        
        // Dynamic Truncation
        const offset = hmac[hmac.length - 1] & 0x0f;
        const code = (
          ((hmac[offset] & 0x7f) << 24) |
          ((hmac[offset + 1] & 0xff) << 16) |
          ((hmac[offset + 2] & 0xff) << 8) |
          (hmac[offset + 3] & 0xff)
        ) % 1000000;
        
        // Fülle mit führenden Nullen auf
        return code.toString().padStart(6, '0');
      } catch (err) {
        console.error('TOTP Generation Error:', err);
        return '';
      }
    },

    /**
     * Base32 Dekodierung
     */
    base32Decode(base32) {
      const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      let bits = '';
      
      for (let i = 0; i < base32.length; i++) {
        const val = base32Chars.indexOf(base32[i]);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
      }
      
      const bytes = [];
      for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substr(i, 8), 2));
      }
      
      return new Uint8Array(bytes);
    },

    /**
     * Integer zu Bytes konvertieren (Big Endian)
     */
    intToBytes(num) {
      const bytes = new Uint8Array(8);
      for (let i = 7; i >= 0; i--) {
        bytes[i] = num & 0xff;
        num = num >> 8;
      }
      return bytes;
    },

    /**
     * HMAC-SHA1 Implementierung
     */
    hmacSHA1(key, message) {
      const blockSize = 64;
      
      // Key padding
      if (key.length > blockSize) {
        key = this.sha1(key);
      }
      if (key.length < blockSize) {
        const paddedKey = new Uint8Array(blockSize);
        paddedKey.set(key);
        key = paddedKey;
      }
      
      // Create inner and outer padded keys
      const ipad = new Uint8Array(blockSize);
      const opad = new Uint8Array(blockSize);
      for (let i = 0; i < blockSize; i++) {
        ipad[i] = key[i] ^ 0x36;
        opad[i] = key[i] ^ 0x5c;
      }
      
      // HMAC = SHA1(opad || SHA1(ipad || message))
      const innerHash = this.sha1(this.concat(ipad, message));
      return this.sha1(this.concat(opad, innerHash));
    },

    /**
     * SHA1 Hash Funktion
     */
    sha1(data) {
      const words = [];
      const dataLen = data.length;
      
      // Convert bytes to words
      for (let i = 0; i < dataLen; i++) {
        words[i >> 2] |= data[i] << (24 - (i % 4) * 8);
      }
      
      // Append padding
      const bitLen = dataLen * 8;
      words[dataLen >> 2] |= 0x80 << (24 - (dataLen % 4) * 8);
      words[(((dataLen + 8) >> 6) << 4) + 15] = bitLen;
      
      // Initialize hash values
      let h0 = 0x67452301;
      let h1 = 0xEFCDAB89;
      let h2 = 0x98BADCFE;
      let h3 = 0x10325476;
      let h4 = 0xC3D2E1F0;
      
      // Main loop
      for (let i = 0; i < words.length; i += 16) {
        const w = new Array(80);
        for (let j = 0; j < 16; j++) {
          w[j] = words[i + j] || 0;
        }
        
        for (let j = 16; j < 80; j++) {
          const temp = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
          w[j] = (temp << 1) | (temp >>> 31);
        }
        
        let a = h0, b = h1, c = h2, d = h3, e = h4;
        
        for (let j = 0; j < 80; j++) {
          let f, k;
          if (j < 20) {
            f = (b & c) | (~b & d);
            k = 0x5A827999;
          } else if (j < 40) {
            f = b ^ c ^ d;
            k = 0x6ED9EBA1;
          } else if (j < 60) {
            f = (b & c) | (b & d) | (c & d);
            k = 0x8F1BBCDC;
          } else {
            f = b ^ c ^ d;
            k = 0xCA62C1D6;
          }
          
          const temp = ((a << 5) | (a >>> 27)) + f + e + k + w[j];
          e = d;
          d = c;
          c = (b << 30) | (b >>> 2);
          b = a;
          a = temp;
        }
        
        h0 = (h0 + a) | 0;
        h1 = (h1 + b) | 0;
        h2 = (h2 + c) | 0;
        h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0;
      }
      
      // Convert hash to bytes
      const hash = new Uint8Array(20);
      for (let i = 0; i < 5; i++) {
        const h = [h0, h1, h2, h3, h4][i];
        hash[i * 4] = (h >>> 24) & 0xff;
        hash[i * 4 + 1] = (h >>> 16) & 0xff;
        hash[i * 4 + 2] = (h >>> 8) & 0xff;
        hash[i * 4 + 3] = h & 0xff;
      }
      
      return hash;
    },

    /**
     * Konkateniere zwei Uint8Arrays
     */
    concat(a, b) {
      const result = new Uint8Array(a.length + b.length);
      result.set(a);
      result.set(b, a.length);
      return result;
    }
  };
})();
