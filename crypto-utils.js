/* Crypto Utils für Easy Login */
const CryptoUtils = (() => {
  const PROTECTION_KEY = 'easylogin_protection';
  const HASH_KEY = 'easylogin_hash';
  const SALT_KEY = 'easylogin_salt';

  /**
   * Hasht einen String mit SHA-256
   */
  async function hashValue(value, salt = '') {
    const encoder = new TextEncoder();
    const data = encoder.encode(value + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generiert einen zufälligen Salt
   */
  function generateSalt() {
    return crypto.getRandomValues(new Uint8Array(16))
      .reduce((hex, byte) => hex + ('0' + byte.toString(16)).slice(-2), '');
  }

  /**
   * Speichert die Schutz-Einstellung
   */
  async function setProtection(type, value) {
    const salt = generateSalt();
    const hash = await hashValue(value, salt);
    
    localStorage.setItem(PROTECTION_KEY, type);
    localStorage.setItem(HASH_KEY, hash);
    localStorage.setItem(SALT_KEY, salt);
  }

  /**
   * Gibt den aktuellen Schutz-Typ zurück
   */
  function getProtectionType() {
    return localStorage.getItem(PROTECTION_KEY) || 'none';
  }

  /**
   * Verarbeitet ein PIN/Passwort/Muster und gibt wahr zurück wenn korrekt
   */
  async function verifyProtection(value) {
    const protectionType = getProtectionType();
    
    if (protectionType === 'none') {
      return true;
    }

    const storedHash = localStorage.getItem(HASH_KEY);
    const storedSalt = localStorage.getItem(SALT_KEY);
    
    if (!storedHash || !storedSalt) {
      return false;
    }

    const hash = await hashValue(value, storedSalt);
    return hash === storedHash;
  }

  /**
   * Löscht alle Schutz-Informationen (beim Zurücksetzen)
   */
  function clearProtection() {
    localStorage.removeItem(PROTECTION_KEY);
    localStorage.removeItem(HASH_KEY);
    localStorage.removeItem(SALT_KEY);
  }

  /**
   * Gibt zurück ob Schutz eingestellt ist
   */
  function isProtected() {
    return getProtectionType() !== 'none';
  }

  // Pattern-Handling für Muster
  const PatternLock = (() => {
    const PATTERN_POINTS = 9;
    const GRID_SIZE = 3;
    let selectedPoints = [];

    function createPatternCanvas(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;

      container.innerHTML = '';
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      canvas.className = 'pattern-grid';
      container.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      const pointRadius = 20;
      const spacing = 100;

      // Zeichne Grid
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          const x = 50 + j * spacing;
          const y = 50 + i * spacing;
          ctx.fillStyle = '#e5e7eb';
          ctx.fillRect(x - 25, y - 25, 50, 50);
          ctx.fillStyle = '#d1d5db';
          ctx.beginPath();
          ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Touch-Handler
      canvas.addEventListener('touchstart', (e) => handlePatternInput(e, canvas, spacing));
      canvas.addEventListener('touchmove', (e) => handlePatternInput(e, canvas, spacing));
      canvas.addEventListener('touchend', (e) => endPattern(e));

      return canvas;
    }

    function handlePatternInput(e, canvas, spacing) {
      if (e.touches.length === 0) return;
      
      const rect = canvas.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;

      const point = getPointAtCoords(x, y, spacing);
      if (point !== null && !selectedPoints.includes(point)) {
        selectedPoints.push(point);
        redrawPattern(canvas, spacing);
      }
    }

    function endPattern(e) {
      e.preventDefault();
    }

    function getPointAtCoords(x, y, spacing) {
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          const px = 50 + j * spacing;
          const py = 50 + i * spacing;
          const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
          if (dist < 40) {
            return i * GRID_SIZE + j;
          }
        }
      }
      return null;
    }

    function redrawPattern(canvas, spacing) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Zeichne Grid
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          const x = 50 + j * spacing;
          const y = 50 + i * spacing;
          const idx = i * GRID_SIZE + j;
          const isSelected = selectedPoints.includes(idx);

          ctx.fillStyle = isSelected ? '#1e88e5' : '#e5e7eb';
          ctx.fillRect(x - 25, y - 25, 50, 50);
          ctx.fillStyle = isSelected ? '#1565c0' : '#d1d5db';
          ctx.beginPath();
          ctx.arc(x, y, 20, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Zeichne Linien
      ctx.strokeStyle = '#1e88e5';
      ctx.lineWidth = 3;
      selectedPoints.forEach((point, idx) => {
        const i = Math.floor(point / GRID_SIZE);
        const j = point % GRID_SIZE;
        const x = 50 + j * spacing;
        const y = 50 + i * spacing;
        if (idx === 0) {
          ctx.beginPath();
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }

    function getPattern() {
      return selectedPoints.join('');
    }

    function resetPattern() {
      selectedPoints = [];
    }

    return {
      createPatternCanvas,
      getPattern,
      resetPattern,
      PATTERN_POINTS
    };
  })();

  // ===== Public/Private Key Encryption =====
  const EncryptionUtils = (() => {
    /**
     * Generiert ein neues Public/Private Key Paar (RSA-OAEP)
     */
    async function generateKeyPair() {
      try {
        const keyPair = await crypto.subtle.generateKey(
          {
            name: 'RSA-OAEP',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]), // 65537
            hash: 'SHA-256'
          },
          true, // extractable
          ['encrypt', 'decrypt']
        );
        return keyPair;
      } catch (error) {
        console.error('Fehler beim Generieren des Key Paares:', error);
        return null;
      }
    }

    /**
     * Exportiert einen Public Key in JWK Format
     */
    async function exportPublicKey(publicKey) {
      try {
        const jwk = await crypto.subtle.exportKey('jwk', publicKey);
        return JSON.stringify(jwk);
      } catch (error) {
        console.error('Fehler beim Exportieren des Public Keys:', error);
        return null;
      }
    }

    /**
     * Importiert einen Public Key aus JWK Format
     */
    async function importPublicKey(jwkString) {
      try {
        const jwk = JSON.parse(jwkString);
        const publicKey = await crypto.subtle.importKey(
          'jwk',
          jwk,
          {
            name: 'RSA-OAEP',
            hash: 'SHA-256'
          },
          true,
          ['encrypt']
        );
        return publicKey;
      } catch (error) {
        console.error('Fehler beim Importieren des Public Keys:', error);
        return null;
      }
    }

    /**
     * Verschlüsselt einen Text mit einem Public Key
     */
    async function encryptWithPublicKey(publicKey, text) {
      try {
        // Prüfe ob Public Key gültig ist
        if (!publicKey || typeof publicKey !== 'object') {
          throw new Error('Ungültiger Public Key: Key ist nicht vom erwarteten Typ');
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        
        // RSA-OAEP mit 2048-bit Key kann maximal ~214 Bytes verschlüsseln
        if (data.byteLength > 190) {
          console.warn(`Warnung: Daten zu groß für RSA-OAEP (${data.byteLength} bytes). Mit Hybrid-Verschlüsselung würde dieses Problem gelöst.`);
        }

        const encryptedBuffer = await crypto.subtle.encrypt(
          'RSA-OAEP',
          publicKey,
          data
        );
        // Konvertiere zu Base64 für Transport
        return btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
      } catch (error) {
        console.error('Fehler beim Verschlüsseln:', error.message);
        console.error('Error Details:', error);
        if (error.message && error.message.includes('data')) {
          console.error('Mögliche Ursache: Die zu verschlüsselnden Daten sind zu groß für RSA-OAEP');
        }
        return null;
      }
    }

    /**
     * Entschlüsselt einen Text mit einem Private Key
     */
    async function decryptWithPrivateKey(privateKey, encryptedBase64) {
      try {
        // Konvertiere von Base64
        const encryptedData = Uint8Array.from(
          atob(encryptedBase64),
          c => c.charCodeAt(0)
        );
        const decryptedBuffer = await crypto.subtle.decrypt(
          'RSA-OAEP',
          privateKey,
          encryptedData
        );
        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
      } catch (error) {
        console.error('Fehler beim Entschlüsseln:', error);
        return null;
      }
    }

    /**
     * Verschlüsselt ein Objekt mit einem Public Key
     */
    async function encryptObject(publicKey, obj) {
      const jsonString = JSON.stringify(obj);
      return await encryptWithPublicKey(publicKey, jsonString);
    }

    /**
     * Verschlüsselt ein Objekt mit Hybrid-Verschlüsselung (AES-GCM + RSA-OAEP)
     * Dies umgeht die Größenlimitierung von RSA
     */
    async function encryptObjectHybrid(publicKey, obj) {
      try {
        const jsonString = JSON.stringify(obj);
        
        // Generiere einen zufälligen AES-Schlüssel
        const aesKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        
        // Verschlüssele die Daten mit AES-GCM
        const encoder = new TextEncoder();
        const data = encoder.encode(jsonString);
        const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV für GCM
        
        const encryptedData = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: iv },
          aesKey,
          data
        );
        
        // Exportiere den AES-Schlüssel
        const rawKey = await crypto.subtle.exportKey('raw', aesKey);
        
        // Verschlüssele den AES-Schlüssel mit RSA-OAEP
        const encryptedKey = await encryptWithPublicKey(
          publicKey,
          btoa(String.fromCharCode(...new Uint8Array(rawKey)))
        );
        
        if (!encryptedKey) {
          throw new Error('Konnte AES-Schlüssel nicht mit Public Key verschlüsseln');
        }
        
        // Gebe das Hybrid-Format zurück
        return JSON.stringify({
          hybrid: true,
          encryptedKey: encryptedKey,
          encryptedData: btoa(String.fromCharCode(...new Uint8Array(encryptedData))),
          iv: btoa(String.fromCharCode(...iv))
        });
      } catch (error) {
        console.error('Fehler bei Hybrid-Verschlüsselung:', error.message);
        return null;
      }
    }

    /**
     * Entschlüsselt ein Objekt mit Hybrid-Verschlüsselung
     */
    async function decryptObjectHybrid(privateKey, hybridString) {
      try {
        const hybrid = JSON.parse(hybridString);
        if (!hybrid.hybrid) {
          throw new Error('Keine Hybrid-Verschlüsselung erkannt');
        }
        
        // Entschlüssele den AES-Schlüssel
        const decryptedKeyBase64 = await decryptWithPrivateKey(
          privateKey,
          hybrid.encryptedKey
        );
        
        if (!decryptedKeyBase64) {
          throw new Error('Konnte AES-Schlüssel nicht entschlüsseln');
        }
        
        // Importiere den AES-Schlüssel
        const keyBuffer = Uint8Array.from(atob(decryptedKeyBase64), c => c.charCodeAt(0));
        const aesKey = await crypto.subtle.importKey(
          'raw',
          keyBuffer,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );
        
        // Entschlüssele die Daten
        const encryptedData = Uint8Array.from(atob(hybrid.encryptedData), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(hybrid.iv), c => c.charCodeAt(0));
        
        const decryptedBuffer = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv },
          aesKey,
          encryptedData
        );
        
        const decoder = new TextDecoder();
        const jsonString = decoder.decode(decryptedBuffer);
        return JSON.parse(jsonString);
      } catch (error) {
        console.error('Fehler bei Hybrid-Entschlüsselung:', error.message);
        return null;
      }
    }

    /**
     * Verschlüsselt ein Objekt mit automatischem Fallback zu Hybrid-Verschlüsselung
     */
    async function encryptObjectSafe(publicKey, obj) {
      // Versuche zuerst direkte RSA-OAEP Verschlüsselung
      const result = await encryptObject(publicKey, obj);
      
      if (result) {
        // Erfolgreich mit direkter Verschlüsselung
        return result;
      }
      
      // Fallback zu Hybrid-Verschlüsselung
      console.log('Direkte RSA-Verschlüsselung fehlgeschlagen, versuche Hybrid-Verschlüsselung...');
      const hybridResult = await encryptObjectHybrid(publicKey, obj);
      
      if (hybridResult) {
        console.log('Hybrid-Verschlüsselung erfolgreich');
        return hybridResult;
      }
      
      return null;
    }

    /**
     * Entschlüsselt ein Objekt mit automatischer Erkennung des Formats
     */
    async function decryptObjectSafe(privateKey, encryptedString) {
      try {
        const obj = JSON.parse(encryptedString);
        if (obj.hybrid) {
          // Hybrid-Format erkannt
          return await decryptObjectHybrid(privateKey, encryptedString);
        }
      } catch (e) {
        // Keine JSON Hybrid-Format, versuche direkte Entschlüsselung
      }
      
      // Versuche direkte Entschlüsselung (altes Format)
      return await decryptObject(privateKey, encryptedString);
    }


    return {
      generateKeyPair,
      exportPublicKey,
      importPublicKey,
      encryptWithPublicKey,
      decryptWithPrivateKey,
      encryptObject,
      decryptObject,
      encryptObjectHybrid,
      decryptObjectHybrid,
      encryptObjectSafe,
      decryptObjectSafe
    };
  })();

  return {
    hashValue,
    generateSalt,
    setProtection,
    getProtectionType,
    verifyProtection,
    clearProtection,
    isProtected,
    PatternLock,
    EncryptionUtils
  };
})();
