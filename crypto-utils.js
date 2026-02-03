/* Crypto Utils für Easy Login */
const CryptoUtils = (() => {
  const PROTECTION_KEY = 'easylogin_protection';
  const HASH_KEY = 'easylogin_hash';
  const SALT_KEY = 'easylogin_salt';
  const ENCRYPTION_METHOD_KEY = 'easylogin_enc_method'; // 'none' oder 'aes-gcm'

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
   * Leitet einen Verschlüsselungsschlüssel aus einem Passwort ab
   * Nutzt PBKDF2 für sichere Key-Derivation
   */
  async function deriveEncryptionKey(password, salt) {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    const saltData = encoder.encode(salt);

    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordData,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltData,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Verschlüsselt einen String mit AES-GCM
   */
  async function encryptData(data, password) {
    if (!password) {
      // Kein Passwort = keine Verschlüsselung
      return {
        encrypted: false,
        data: data
      };
    }

    try {
      const salt = generateSalt();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const key = await deriveEncryptionKey(password, salt);
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(data);

      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encodedData
      );

      // Kombiniere salt + iv + encrypted data
      const combined = new Uint8Array(salt.length / 2 + 12 + encryptedBuffer.byteLength);
      const saltBytes = new Uint8Array(salt.length / 2);
      for (let i = 0; i < salt.length; i += 2) {
        saltBytes[i / 2] = parseInt(salt.substr(i, 2), 16);
      }
      combined.set(saltBytes, 0);
      combined.set(iv, saltBytes.length);
      combined.set(new Uint8Array(encryptedBuffer), saltBytes.length + 12);

      return {
        encrypted: true,
        data: Array.from(combined)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
      };
    } catch (err) {
      console.error('Encryption error:', err);
      throw err;
    }
  }

  /**
   * Entschlüsselt einen String mit AES-GCM
   */
  async function decryptData(encryptedHex, password) {
    if (!password) {
      return encryptedHex;
    }

    try {
      // Parse: first 16 bytes = salt, next 12 bytes = iv, rest = encrypted
      const bytes = [];
      for (let i = 0; i < encryptedHex.length; i += 2) {
        bytes.push(parseInt(encryptedHex.substr(i, 2), 16));
      }

      const saltBytes = bytes.slice(0, 16);
      const ivBytes = bytes.slice(16, 28);
      const encryptedBytes = bytes.slice(28);

      const salt = Array.from(saltBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const key = await deriveEncryptionKey(password, salt);
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(ivBytes) },
        key,
        new Uint8Array(encryptedBytes)
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (err) {
      console.error('Decryption error:', err);
      throw err;
    }
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
    
    // Speichere dass wir AES-GCM Verschlüsselung nutzen
    localStorage.setItem(ENCRYPTION_METHOD_KEY, type === 'none' ? 'none' : 'aes-gcm');
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
    let isDrawing = false;

    function createPatternCanvas(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;

      container.innerHTML = '';
      const canvas = document.createElement('canvas');
      const size = 300;
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.className = 'pattern-grid';
      container.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const pointRadius = 20;
      const spacing = size / GRID_SIZE;
      const offset = spacing / 2;

      // Zeichne Grid
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          const x = offset + j * spacing;
          const y = offset + i * spacing;
          ctx.fillStyle = '#e5e7eb';
          ctx.fillRect(x - 25, y - 25, 50, 50);
          ctx.fillStyle = '#d1d5db';
          ctx.beginPath();
          ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Pointer-Handler (Touch + Mouse)
      canvas.addEventListener('pointerdown', (e) => {
        isDrawing = true;
        canvas.setPointerCapture(e.pointerId);
        handlePatternInput(e, canvas, spacing, offset);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!isDrawing) return;
        handlePatternInput(e, canvas, spacing, offset);
      });
      const endHandler = (e) => {
        isDrawing = false;
        endPattern(e);
      };
      canvas.addEventListener('pointerup', endHandler);
      canvas.addEventListener('pointerleave', endHandler);

      return canvas;
    }

    function handlePatternInput(e, canvas, spacing, offset) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const point = getPointAtCoords(x, y, spacing, offset);
      if (point !== null && !selectedPoints.includes(point)) {
        selectedPoints.push(point);
        redrawPattern(canvas, spacing, offset);
      }
    }

    function endPattern(e) {
      e.preventDefault();
    }

    function getPointAtCoords(x, y, spacing, offset) {
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          const px = offset + j * spacing;
          const py = offset + i * spacing;
          const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
          if (dist < 40) {
            return i * GRID_SIZE + j;
          }
        }
      }
      return null;
    }

    function redrawPattern(canvas, spacing, offset) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Zeichne Grid
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          const x = offset + j * spacing;
          const y = offset + i * spacing;
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
        const x = offset + j * spacing;
        const y = offset + i * spacing;
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

  return {
    hashValue,
    generateSalt,
    setProtection,
    getProtectionType,
    verifyProtection,
    clearProtection,
    isProtected,
    encryptData,
    decryptData,
    deriveEncryptionKey,
    PatternLock
  };
})();
