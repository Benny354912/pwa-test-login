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

  return {
    hashValue,
    generateSalt,
    setProtection,
    getProtectionType,
    verifyProtection,
    clearProtection,
    isProtected,
    PatternLock
  };
})();
