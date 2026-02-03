/* Easy Login PWA - Moderne Version mit Setup, Lock Screen & 2FA */
(() => {
  // ===== Debug Mode =====
  const DEBUG = true;
  const log = (msg, data) => {
    if (!DEBUG) return;
    if (data) {
      console.log('%c[PWA-EasyLogin]', 'color: #22c55e; font-weight: bold;', msg, data);
    } else {
      console.log('%c[PWA-EasyLogin]', 'color: #22c55e; font-weight: bold;', msg);
    }
  };

  // ===== TOTP Generator =====
  const TOTPGenerator = {
    base32Decode: (str) => {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
      let bits = '';
      for (let i = 0; i < str.length; i++) {
        const idx = alphabet.indexOf(str[i].toUpperCase());
        if (idx === -1) throw new Error('Invalid base32');
        bits += idx.toString(2).padStart(5, '0');
      }
      const bytes = [];
      for (let i = 0; i < bits.length; i += 8) {
        bytes.push(parseInt(bits.substr(i, 8), 2));
      }
      return new Uint8Array(bytes);
    },
    generate: async (secret) => {
      try {
        if (!secret) return null;
        const key = TOTPGenerator.base32Decode(secret);
        const time = Math.floor(Date.now() / 1000 / 30);
        const counter = new ArrayBuffer(8);
        const view = new DataView(counter);
        view.setBigInt64(0, BigInt(time), false);
        const key_obj = await crypto.subtle.importKey(
          'raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', key_obj, counter);
        const bytes = new Uint8Array(signature);
        const offset = bytes[bytes.length - 1] & 0xf;
        const dbc = ((bytes[offset] & 0x7f) << 24)
          | ((bytes[offset + 1] & 0xff) << 16)
          | ((bytes[offset + 2] & 0xff) << 8)
          | (bytes[offset + 3] & 0xff);
        const code = (dbc % 1000000).toString().padStart(6, '0');
        return code;
      } catch (err) {
        log('TOTP Generate Error:', err);
        return null;
      }
    }
  };

  // ===== State =====
  let setupComplete = false;
  let unlocked = false;
  let qrScanner = null;
  let peer = null;
  let conn = null;
  let lastPayload = null;
  let logins = [];
  let currentLoginId = null;
  let currentKeyPair = null; // Aktuelles Public/Private Key Paar
  let remotePublicKey = null; // Public Key der Remote-Seite

  const LOGINS_KEY = 'easylogin_logins';
  const SETUP_KEY = 'easylogin_setup_complete';

  // ===== Initialization =====
  document.addEventListener('DOMContentLoaded', async () => {
    registerServiceWorker();
    loadLogins();

    setupComplete = localStorage.getItem(SETUP_KEY) === 'true';
    if (!setupComplete) {
      showScreen('setup-screen');
      initSetup();
    } else {
      showScreen('lock-screen');
      initLock();
    }
  });

  // ===== Screen Management =====
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.remove('hidden');
  }

  function setMode(modeId) {
    document.querySelectorAll('.mode').forEach(m => m.classList.remove('active'));
    const mode = document.getElementById(modeId);
    if (mode) mode.classList.add('active');
  }

  // ===== Setup =====
  function initSetup() {
    document.querySelectorAll('.setup-option').forEach(btn => {
      btn.addEventListener('click', () => startProtectionSetup(btn.dataset.protection));
    });
    document.getElementById('setup-import-btn')?.addEventListener('click', importLogins);
  }

  function startProtectionSetup(type) {
    document.querySelectorAll('.protection-setup').forEach(s => s.classList.add('hidden'));

    if (type === 'none') {
      completeSetup();
    } else if (type === 'pattern') {
      showPatternSetup();
    } else if (type === 'pin') {
      showPinSetup();
    } else if (type === 'password') {
      showPasswordSetup();
    }
  }

  function showPatternSetup() {
    const patternSetup = document.getElementById('pattern-setup');
    patternSetup.classList.remove('hidden');
    const canvas = CryptoUtils.PatternLock.createPatternCanvas('pattern-canvas');
    const nextBtn = document.getElementById('pattern-next-btn');
    let pattern = '';

    const handleBack = () => {
      CryptoUtils.PatternLock.resetPattern();
      patternSetup.classList.add('hidden');
      document.querySelector('#pattern-setup .back-btn').removeEventListener('click', handleBack);
    };
    document.querySelector('#pattern-setup .back-btn')?.addEventListener('click', handleBack);

    if (canvas) {
      canvas.addEventListener('touchend', () => {
        pattern = CryptoUtils.PatternLock.getPattern();
        if (pattern.length >= 4) {
          nextBtn.classList.remove('hidden');
          document.getElementById('pattern-status').textContent = 'Muster speichern?';
        }
      });
    }

    const handleNext = async () => {
      await CryptoUtils.setProtection('pattern', pattern);
      completeSetup();
      nextBtn.removeEventListener('click', handleNext);
    };
    nextBtn?.addEventListener('click', handleNext);
  }

  function showPinSetup() {
    const pinSetup = document.getElementById('pin-setup');
    pinSetup.classList.remove('hidden');
    const pinInput = document.getElementById('pin-input');
    const nextBtn = document.getElementById('pin-next-btn');
    const errorText = document.getElementById('pin-error');

    const handleBack = () => {
      pinSetup.classList.add('hidden');
      document.querySelector('#pin-setup .back-btn').removeEventListener('click', handleBack);
    };
    document.querySelector('#pin-setup .back-btn')?.addEventListener('click', handleBack);

    const handleNext = async () => {
      const pin = pinInput.value;
      if (pin.length < 4 || pin.length > 8) {
        errorText.textContent = 'PIN muss 4-8 Ziffern lang sein';
        errorText.classList.remove('hidden');
        return;
      }
      await CryptoUtils.setProtection('pin', pin);
      completeSetup();
      nextBtn.removeEventListener('click', handleNext);
    };
    nextBtn?.addEventListener('click', handleNext);
  }

  function showPasswordSetup() {
    const passwordSetup = document.getElementById('password-setup');
    passwordSetup.classList.remove('hidden');
    const passwordInput = document.getElementById('password-input');
    const confirmInput = document.getElementById('password-confirm');
    const nextBtn = document.getElementById('password-next-btn');
    const errorText = document.getElementById('password-error');

    const handleBack = () => {
      passwordSetup.classList.add('hidden');
      document.querySelector('#password-setup .back-btn').removeEventListener('click', handleBack);
    };
    document.querySelector('#password-setup .back-btn')?.addEventListener('click', handleBack);

    const handleNext = async () => {
      if (passwordInput.value !== confirmInput.value) {
        errorText.textContent = 'Passwörter stimmen nicht überein';
        errorText.classList.remove('hidden');
        return;
      }
      if (passwordInput.value.length < 6) {
        errorText.textContent = 'Passwort muss mindestens 6 Zeichen lang sein';
        errorText.classList.remove('hidden');
        return;
      }
      await CryptoUtils.setProtection('password', passwordInput.value);
      completeSetup();
      nextBtn.removeEventListener('click', handleNext);
    };
    nextBtn?.addEventListener('click', handleNext);
  }

  async function completeSetup() {
    localStorage.setItem(SETUP_KEY, 'true');
    setupComplete = true;
    showScreen('lock-screen');
    initLock();
  }

  // ===== Lock Screen =====
  function initLock() {
    const protectionType = CryptoUtils.getProtectionType();
    const unlockBtn = document.getElementById('unlock-btn');

    if (protectionType === 'none') {
      completeUnlock();
      return;
    }

    document.querySelectorAll('.lock-method').forEach(m => m.classList.add('hidden'));

    if (protectionType === 'pattern') {
      document.getElementById('pattern-lock').classList.remove('hidden');
      CryptoUtils.PatternLock.createPatternCanvas('pattern-unlock-canvas');
      
      const handleUnlock = async () => {
        const pattern = CryptoUtils.PatternLock.getPattern();
        if (await CryptoUtils.verifyProtection(pattern)) {
          completeUnlock();
        } else {
          document.getElementById('pattern-lock-error').textContent = 'Muster falsch';
          document.getElementById('pattern-lock-error').classList.remove('hidden');
          CryptoUtils.PatternLock.resetPattern();
        }
      };
      unlockBtn?.addEventListener('click', handleUnlock);
    } else if (protectionType === 'pin') {
      document.getElementById('pin-lock').classList.remove('hidden');
      const handleUnlock = async () => {
        const pin = document.getElementById('pin-unlock').value;
        if (await CryptoUtils.verifyProtection(pin)) {
          completeUnlock();
        } else {
          document.getElementById('pin-lock-error').textContent = 'PIN falsch';
          document.getElementById('pin-lock-error').classList.remove('hidden');
        }
      };
      unlockBtn?.addEventListener('click', handleUnlock);
    } else if (protectionType === 'password') {
      document.getElementById('password-lock').classList.remove('hidden');
      const handleUnlock = async () => {
        const password = document.getElementById('password-unlock').value;
        if (await CryptoUtils.verifyProtection(password)) {
          completeUnlock();
        } else {
          document.getElementById('password-lock-error').textContent = 'Passwort falsch';
          document.getElementById('password-lock-error').classList.remove('hidden');
        }
      };
      unlockBtn?.addEventListener('click', handleUnlock);
    }
  }

  function completeUnlock() {
    unlocked = true;
    showScreen('main-screen');
    initMain();
  }

  // ===== Main Screen =====
  function initMain() {
    setMode('camera-mode');
    startQRScanner();
    renderLoginsList();

    document.getElementById('edit-logins-btn')?.addEventListener('click', () => setMode('editor-mode'));
    document.getElementById('back-to-camera-btn')?.addEventListener('click', () => {
      setMode('camera-mode');
      document.getElementById('login-form-container').classList.add('hidden');
    });
    document.getElementById('add-login-btn')?.addEventListener('click', showAddLoginForm);
    document.getElementById('cancel-form-btn')?.addEventListener('click', () => {
      document.getElementById('login-form-container').classList.add('hidden');
    });
    document.getElementById('login-form')?.addEventListener('submit', handleLoginFormSubmit);
    document.getElementById('cancel-selection-btn')?.addEventListener('click', () => setMode('camera-mode'));
    document.getElementById('manual-login-form')?.addEventListener('submit', handleManualLogin);
    document.getElementById('twofa-submit-btn')?.addEventListener('click', handle2FASubmit);
    document.getElementById('twofa-cancel-btn')?.addEventListener('click', () => {
      document.getElementById('twofa-dialog').classList.add('hidden');
    });
    document.getElementById('export-logins-btn')?.addEventListener('click', exportLogins);
    document.getElementById('settings-btn')?.addEventListener('click', () => {
      alert('Einstellungen in Bearbeitung');
    });
  }

  // ===== QR Scanner =====
  function startQRScanner() {
    if (qrScanner) return;
    const container = document.getElementById('qr-reader');
    if (!container || !window.Html5Qrcode) return;

    qrScanner = new window.Html5Qrcode('qr-reader');
    const config = { fps: 10, qrbox: { width: 240, height: 240 } };

    window.Html5Qrcode.getCameras()
      .then(cameras => {
        if (!cameras || !cameras.length) throw new Error('Keine Kamera');
        return qrScanner.start(cameras[0].id, config, onQRScan, onQRError);
      })
      .catch(err => {
        console.error('Scanner Error:', err);
        updateScanStatus('Kamera nicht verfügbar');
      });
  }

  function onQRScan(decodedText) {
    try {
      log('QR Code gescannt:', decodedText);
      const payload = JSON.parse(decodedText);
      log('QR Payload geparst:', payload);
      if (!payload?.peerId) throw new Error('Invalid QR');
      lastPayload = payload;
      updateScanStatus('QR gescannt');
      connectPeer(payload);
      setTimeout(() => {
        if (conn?.open) {
          log('Verbindung offen, zeige Login-Auswahl');
          setMode('login-selection-mode');
          renderAvailableLogins();
        } else {
          log('Verbindung NICHT offen nach 1s');
        }
      }, 1000);
    } catch (err) {
      log('QR Parse Error:', err);
      updateScanStatus('Ungültiger QR-Code');
    }
  }

  function onQRError() {}

  function updateScanStatus(text) {
    const statusEl = document.getElementById('scan-status-text');
    if (statusEl) statusEl.textContent = text;
  }

  // ===== Peer Connection =====
  function connectPeer(payload) {
    if (!window.Peer) return;
    if (peer) peer.destroy();

    log('Verbinde zu Peer:', payload.peerId);
    peer = new Peer({ host: '0.peerjs.com', port: 443, secure: true });
    peer.on('open', async () => {
      log('Peer geoeffnet');
      
      // Generiere neue Keys für diese Verbindung
      currentKeyPair = await CryptoUtils.EncryptionUtils.generateKeyPair();
      if (!currentKeyPair) {
        log('Fehler: Key Paar konnte nicht generiert werden');
        return;
      }
      log('Neues Key Paar generiert');
      
      conn = peer.connect(payload.peerId, { reliable: true });
      conn.on('open', async () => {
        log('Verbindung offen');
        
        // Exportiere Public Key und sende Hello mit Public Key
        const publicKeyString = await CryptoUtils.EncryptionUtils.exportPublicKey(currentKeyPair.publicKey);
        conn.send({ 
          type: 'EasyLoginHello', 
          client: 'PWA',
          publicKey: publicKeyString 
        });
        log('Hello mit Public Key gesendet');
      });
      
      conn.on('data', async (data) => {
        log('Daten empfangen:', data?.type);
        await handleEncryptedData(data);
      });
      
      conn.on('close', () => {
        log('Verbindung geschlossen');
        updateScanStatus('Verbindung getrennt');
        setMode('camera-mode');
        cleanupConnection();
      });
      
      conn.on('error', (err) => {
        log('Verbindungsfehler:', err);
      });
    });
    peer.on('error', (err) => {
      log('PeerJS Fehler:', err);
      updateScanStatus('PeerJS Fehler');
    });
  }

  /**
   * Verarbeitet empfangene Daten und entschlüsselt falls nötig
   */
  async function handleEncryptedData(data) {
    if (!data) return;
    
    // Wenn Remote Public Key mit Hello kommt, speichere ihn
    if (data.type === 'EasyLoginHello' && data.publicKey) {
      remotePublicKey = await CryptoUtils.EncryptionUtils.importPublicKey(data.publicKey);
      log('Remote Public Key empfangen und gespeichert');
      return;
    }
    
    // Wenn Nachricht verschlüsselt ist, entschlüssele sie
    if (data.encrypted && data.encryptedData && currentKeyPair?.privateKey) {
      // Nutze sichere Entschlüsselung mit Hybrid-Support
      const decrypted = await CryptoUtils.EncryptionUtils.decryptObjectSafe(
        currentKeyPair.privateKey,
        data.encryptedData
      );
      
      if (decrypted) {
        log('Nachricht entschlüsselt:', decrypted?.type);
        // Verarbeite die entschlüsselte Nachricht
        if (decrypted.type === 'EasyLoginResponse') {
          handleLoginResponse(decrypted);
        }
        return;
      } else {
        log('Fehler beim Entschlüsseln der Nachricht');
        return;
      }
    }
    
    // Unverschlüsselte Nachrichten (für Kompatibilität)
    if (data.type === 'EasyLoginResponse') {
      handleLoginResponse(data);
    }
  }

  /**
   * Verarbeitet Login-Response
   */
  function handleLoginResponse(data) {
    // Hier wird die ursprüngliche Logik ausgeführt
    // Diese Funktion wird aus den bestehenden Funktionen aufgerufen
  }

  /**
   * Sendet verschlüsselte Nachricht über PeerJS
   */
  async function sendEncryptedMessage(message) {
    if (!conn?.open) {
      log('Fehler: Keine offene Verbindung');
      return false;
    }
    
    if (!remotePublicKey) {
      log('KRITISCHER FEHLER: Remote Public Key nicht verfügbar - kann nicht verschlüsseln');
      updateScanStatus('Verschlüsselung fehlgeschlagen - bitte versuchen Sie es erneut');
      return false;
    }
    
    try {
      // Nutze sichere Verschlüsselung mit Hybrid-Fallback
      const encryptedData = await CryptoUtils.EncryptionUtils.encryptObjectSafe(
        remotePublicKey,
        message
      );
      
      if (encryptedData) {
        conn.send({
          encrypted: true,
          encryptedData: encryptedData
        });
        log('Verschlüsselte Nachricht gesendet:', message?.type);
        return true;
      } else {
        log('KRITISCHER FEHLER: Verschlüsselung fehlgeschlagen');
        updateScanStatus('Verschlüsselung fehlgeschlagen - bitte versuchen Sie es erneut');
        return false;
      }
    } catch (error) {
      log('KRITISCHER FEHLER beim Senden verschlüsselter Nachricht:', error);
      updateScanStatus('Verschlüsselung fehlgeschlagen - bitte versuchen Sie es erneut');
      return false;
    }
  }

  /**
   * Schließt die Verbindung sauber
   */
  function cleanupConnection() {
    if (conn?.open) {
      try {
        conn.close();
      } catch {}
    }
    conn = null;
    currentKeyPair = null;
    remotePublicKey = null;
  }

  // ===== Login Management =====
  function loadLogins() {
    try {
      logins = JSON.parse(localStorage.getItem(LOGINS_KEY) || '[]');
    } catch {
      logins = [];
    }
  }

  function saveLogins() {
    localStorage.setItem(LOGINS_KEY, JSON.stringify(logins));
  }

  function renderLoginsList() {
    const list = document.getElementById('logins-list');
    if (!list) return;

    if (!logins.length) {
      list.innerHTML = '<p style="text-align: center; color: var(--muted);">Noch keine Logins</p>';
      return;
    }

    list.innerHTML = logins.map((login, idx) => `
      <div class="login-item" data-login-idx="${idx}">
        <div class="login-info">
          <strong>${escapeHtml(login.name)}</strong>
          <span>${escapeHtml(login.username)}</span>
        </div>
        <div class="login-actions">
          <button class="edit-login-btn">Bearbeiten</button>
        </div>
      </div>
    `).join('');

    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.edit-login-btn');
      if (btn) {
        const item = btn.closest('.login-item');
        const idx = parseInt(item.dataset.loginIdx);
        if (logins[idx]) editLogin(logins[idx].id);
      }
    });
  }

  function editLogin(id) {
    currentLoginId = id;
    const login = logins.find(l => l.id === id);
    if (!login) return;

    document.getElementById('form-title').textContent = 'Login bearbeiten';
    document.getElementById('login-id').value = id;
    document.getElementById('login-name').value = login.name;
    document.getElementById('login-username').value = login.username;
    document.getElementById('login-password').value = login.password;
    document.getElementById('login-2fa').value = login.twofa || '';
    document.getElementById('login-note').value = login.note || '';
    document.getElementById('delete-login-btn').classList.remove('hidden');
    document.getElementById('login-form-container').classList.remove('hidden');
  }

  function showAddLoginForm() {
    currentLoginId = null;
    document.getElementById('form-title').textContent = 'Login hinzufügen';
    document.getElementById('login-form').reset();
    document.getElementById('delete-login-btn').classList.add('hidden');
    document.getElementById('login-form-container').classList.remove('hidden');
  }

  function handleLoginFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('login-id').value || generateId();
    const name = document.getElementById('login-name').value.trim();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const twofa = document.getElementById('login-2fa').value.trim();
    const note = document.getElementById('login-note').value.trim();

    if (!name || !username || !password) return;

    const idx = logins.findIndex(l => l.id === id);
    const login = { id, name, username, password, twofa, note };

    if (idx >= 0) {
      logins[idx] = login;
    } else {
      logins.push(login);
    }

    saveLogins();
    renderLoginsList();
    document.getElementById('login-form-container').classList.add('hidden');
  }

  document.addEventListener('click', (e) => {
    if (e.target.id === 'delete-login-btn') {
      e.preventDefault();
      const id = document.getElementById('login-id').value;
      logins = logins.filter(l => l.id !== id);
      saveLogins();
      renderLoginsList();
      document.getElementById('login-form-container').classList.add('hidden');
    }
  });

  // ===== Available Logins After QR Scan =====
  function renderAvailableLogins() {
    const container = document.getElementById('available-logins');
    if (!container) return;

    if (!logins.length) {
      container.innerHTML = '<p style="text-align: center; color: var(--muted);">Keine Logins vorhanden</p>';
      return;
    }

    container.innerHTML = logins.map((login, idx) => `
      <button class="available-login-btn" data-login-idx="${idx}">
        <strong>${escapeHtml(login.name)}</strong><br>
        <span style="font-size: 12px; color: var(--muted);">${escapeHtml(login.username)}</span>
      </button>
    `).join('');

    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.available-login-btn');
      if (btn) {
        const idx = parseInt(btn.dataset.loginIdx);
        if (logins[idx]) selectLoginForSending(logins[idx].id);
      }
    });
  }

  function selectLoginForSending(id) {
    log('Waehle Login zum Senden:', id);
    const login = logins.find(l => l.id === id);
    if (!login) {
      log('Fehler: Login nicht gefunden');
      return;
    }
    log('Sende Login:', { name: login.name, username: login.username, has2FA: !!login.twofa });
    sendLogin(login.username, login.password, login.twofa);
  }

  // ===== Manual Login =====
  function handleManualLogin(e) {
    e.preventDefault();
    const username = document.getElementById('manual-username').value.trim();
    const password = document.getElementById('manual-password').value;
    const twofa = document.getElementById('manual-2fa').value.trim();
    sendLogin(username, password, twofa);
  }

  // ===== Send Login to Desktop =====
  async function sendLogin(username, password, twofa = '') {
    if (!conn?.open || !lastPayload) {
      log('Fehler: Keine Verbindung oder lastPayload');
      return;
    }

    log('Sende Login:', { username, hasPassword: !!password, host: lastPayload.host });

    try {
      const url = `https://${lastPayload.host}/api/logins`;
      log('Login API URL:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: { username, password } })
      });

      log('Login Response Status:', response.status, 'OK:', response.ok);
      
      // 401 Unauthorized - erkenne dies und sende es nicht
      if (response.status === 401) {
        log('Login Failed: 401 Unauthorized - sende NICHT über PeerJS');
        updateScanStatus('Login fehlgeschlagen');
        setMode('camera-mode');
        return;
      }
      
      const data = await response.json().catch(() => {
        log('JSON Parse Error bei Login Response');
        return null;
      });

      log('Login Response Data:', data);

      if (data?.missing2fa) {
        log('2FA erforderlich, twofa Schlüssel vorhanden:', !!twofa);
        
        // Sende Login-Response mit missing2FA=true an Erweiterung, wenn kein 2FA-Schlüssel vorhanden
        if (!twofa) {
          log('Kein 2FA Schlüssel vorhanden - sende Login mit missing2FA=true an Erweiterung');
          await sendEncryptedMessage({
            type: 'EasyLoginResponse',
            success: false,
            missing2fa: true,
            session: data,
            host: lastPayload.host,
            ref: lastPayload.ref
          });
        }
        
        // Manuelle 2FA-Eingabe ermöglichen
        if (twofa) {
          const totpCode = await TOTPGenerator.generate(twofa);
          log('Generierter TOTP Code:', totpCode ? totpCode : 'Fehler');
          if (totpCode) {
            await verify2FA(totpCode, data);
          } else {
            await show2FADialog(data);
          }
        } else {
          await show2FADialog(data);
        }
        return;
      }

      log('Sende EasyLoginResponse mit success:', response.ok);
      await sendEncryptedMessage({
        type: 'EasyLoginResponse',
        success: response.ok,
        session: data,
        host: lastPayload.host,
        ref: lastPayload.ref
      });
      
      if (response.ok) {
        log('Login erfolgreich - Verbindung wird geschlossen');
        updateScanStatus('Login erfolgreich');
        setMode('camera-mode');
        
        // Warte kurz, dann schließe Verbindung sauber
        setTimeout(() => {
          cleanupConnection();
        }, 1000);
      } else {
        setMode('camera-mode');
      }
    } catch (error) {
      log('Fehler bei sendLogin:', error);
      await sendEncryptedMessage({
        type: 'EasyLoginResponse',
        success: false,
        error: error?.message,
        host: lastPayload.host,
        ref: lastPayload.ref
      });
    }
  }

  // ===== 2FA Handling =====
  async function show2FADialog(loginData, twofa = '') {
    const dialog = document.getElementById('twofa-dialog');
    document.getElementById('twofa-input').value = '';
    dialog.classList.remove('hidden');
    window._current2FAData = loginData;
    
    // Wenn 2FA-Schlüssel vorhanden, generiere und prefill Code
    if (twofa) {
      const totpCode = await TOTPGenerator.generate(twofa);
      if (totpCode) {
        log('Prefill 2FA Dialog mit generiertem Code:', totpCode);
        document.getElementById('twofa-input').value = totpCode;
      }
    }
  }

  async function verify2FA(code, loginData) {
    if (!conn?.open || !lastPayload) {
      log('Fehler: Keine Verbindung bei 2FA');
      return;
    }

    log('Verifiziere 2FA mit Code:', code);

    try {
      // sessionid aus der Login Response auslesen
      const sessionToken = loginData.sessionid || '';
      log('2FA Session Token (sessionid):', sessionToken ? sessionToken.substring(0, 20) + '...' : 'FEHLT');
      
      if (!sessionToken) {
        log('Fehler: Keine sessionid in loginData gefunden');
        updateScanStatus('2FA Fehler: Keine Session');
        setMode('camera-mode');
        return;
      }
      
      const url = `https://${lastPayload.host}/api/session/verify2fa/all/${code}`;
      log('2FA Verify URL:', url);
      log('2FA Request Header x-session-token:', sessionToken.substring(0, 20) + '...');
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-session-token': sessionToken
        }
      });

      log('2FA Response Status:', response.status);
      
      // 401 bei 2FA - auch nicht weitersenden
      if (response.status === 401) {
        log('2FA Failed: 401 Unauthorized');
        updateScanStatus('2FA Verifizierung fehlgeschlagen');
        setMode('camera-mode');
        return;
      }
      
      const verifyData = await response.json().catch(() => null);
      log('2FA Verify Data:', verifyData);

      if (response.ok) {
        await sendEncryptedMessage({
          type: 'EasyLoginResponse',
          success: true,
          session: verifyData || loginData,
          host: lastPayload.host,
          ref: lastPayload.ref
        });
        log('2FA erfolgreich - Verbindung wird geschlossen');
        updateScanStatus('Login erfolgreich');
        setMode('camera-mode');
        
        // Warte kurz, dann schließe Verbindung sauber
        setTimeout(() => {
          cleanupConnection();
        }, 1000);
      } else {
        log('2FA Verifizierung fehlgeschlagen');
        updateScanStatus('2FA Verifizierung fehlgeschlagen');
        setMode('camera-mode');
      }
    } catch (error) {
      log('2FA Fehler:', error);
      updateScanStatus('2FA Fehler aufgetreten');
      setMode('camera-mode');
    }
  }

  function handle2FASubmit() {
    const code = document.getElementById('twofa-input').value;
    if (code && window._current2FAData) {
      verify2FA(code, window._current2FAData);
      document.getElementById('twofa-dialog').classList.add('hidden');
    }
  }

  // ===== Export/Import =====
  function exportLogins() {
    const data = JSON.stringify(logins, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `easylogin-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importLogins() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target?.result || '[]');
          if (Array.isArray(imported)) {
            logins = imported;
            saveLogins();
            completeSetup();
          }
        } catch (err) {
          alert('Import fehlgeschlagen');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // ===== Utilities =====
  function generateId() {
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
})();
