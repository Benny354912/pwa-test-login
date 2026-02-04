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

  // ===== State =====
  let setupComplete = false;
  let unlocked = false;
  let qrScanner = null;
  let peer = null;
  let conn = null;
  let lastPayload = null;
  let logins = [];
  let currentLoginId = null;
  let protectionPassword = null; // Speichert das Passwort nach Unlock

  const LOGINS_KEY = 'easylogin_logins';
  const SETUP_KEY = 'easylogin_setup_complete';

  // ===== Initialization =====
  document.addEventListener('DOMContentLoaded', async () => {
    registerServiceWorker();

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

  async function startProtectionSetup(type) {
    document.querySelectorAll('.protection-setup').forEach(s => s.classList.add('hidden'));

    if (type === 'none') {
      protectionPassword = null;
      await CryptoUtils.setProtection('none', '');
      completeSetup();
      return;
    }

    document.querySelector('.setup-container')?.classList.add('hidden');

    if (type === 'pattern') {
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
      document.querySelector('.setup-container')?.classList.remove('hidden');
      document.querySelector('#pattern-setup .back-btn').removeEventListener('click', handleBack);
    };
    document.querySelector('#pattern-setup .back-btn')?.addEventListener('click', handleBack);

    const handlePatternComplete = () => {
      pattern = CryptoUtils.PatternLock.getPattern();
      if (pattern.length >= 4) {
        nextBtn.classList.remove('hidden');
        document.getElementById('pattern-status').textContent = 'Muster speichern?';
      }
    };

    if (canvas) {
      canvas.addEventListener('touchend', handlePatternComplete);
      canvas.addEventListener('pointerup', handlePatternComplete);
      canvas.addEventListener('mouseup', handlePatternComplete);
    }

    const handleNext = async () => {
      await CryptoUtils.setProtection('pattern', pattern);
      protectionPassword = pattern;
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
    setupPinKeypad('pin-input', 'pin-keypad-setup', 8);

    const handleBack = () => {
      pinSetup.classList.add('hidden');
      document.querySelector('.setup-container')?.classList.remove('hidden');
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
      protectionPassword = pin;
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
      document.querySelector('.setup-container')?.classList.remove('hidden');
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
      protectionPassword = passwordInput.value;
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
    let unlockInProgress = false;

    const guardUnlock = async (fn) => {
      if (unlockInProgress) return;
      unlockInProgress = true;
      try {
        await fn();
      } finally {
        unlockInProgress = false;
      }
    };

    if (protectionType === 'none') {
      protectionPassword = null;
      loadLogins();
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
          protectionPassword = pattern;
          await loadLogins();
          completeUnlock();
        } else {
          document.getElementById('pattern-lock-error').textContent = 'Muster falsch';
          document.getElementById('pattern-lock-error').classList.remove('hidden');
          CryptoUtils.PatternLock.resetPattern();
        }
      };
      unlockBtn?.addEventListener('click', () => guardUnlock(handleUnlock));
      const patternCanvas = document.querySelector('#pattern-unlock-canvas canvas');
      patternCanvas?.addEventListener('pointerup', () => guardUnlock(handleUnlock));
      patternCanvas?.addEventListener('mouseup', () => guardUnlock(handleUnlock));
    } else if (protectionType === 'pin') {
      document.getElementById('pin-lock').classList.remove('hidden');
      setupPinKeypad('pin-unlock', 'pin-keypad-lock', 8);
      const handleUnlock = async () => {
        const pin = document.getElementById('pin-unlock').value;
        if (await CryptoUtils.verifyProtection(pin)) {
          protectionPassword = pin;
          await loadLogins();
          completeUnlock();
        } else {
          document.getElementById('pin-lock-error').textContent = 'PIN falsch';
          document.getElementById('pin-lock-error').classList.remove('hidden');
        }
      };
      unlockBtn?.addEventListener('click', () => guardUnlock(handleUnlock));
      const pinInput = document.getElementById('pin-unlock');
      pinInput?.addEventListener('input', () => {
        guardUnlock(handleUnlock);
      });
    } else if (protectionType === 'password') {
      document.getElementById('password-lock').classList.remove('hidden');
      const handleUnlock = async () => {
        const password = document.getElementById('password-unlock').value;
        if (await CryptoUtils.verifyProtection(password)) {
          protectionPassword = password;
          await loadLogins();
          completeUnlock();
        } else {
          document.getElementById('password-lock-error').textContent = 'Passwort falsch';
          document.getElementById('password-lock-error').classList.remove('hidden');
        }
      };
      unlockBtn?.addEventListener('click', () => guardUnlock(handleUnlock));
      const passwordInput = document.getElementById('password-unlock');
      passwordInput?.addEventListener('input', () => {
        guardUnlock(handleUnlock);
      });
    }
  }

  function setupPinKeypad(inputId, keypadId, maxLength = 8) {
    const input = document.getElementById(inputId);
    const keypad = document.getElementById(keypadId);
    if (!input || !keypad) return;

    if (keypad.dataset.bound === 'true') return;
    keypad.dataset.bound = 'true';

    const updateValue = (next) => {
      input.value = next;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-key],[data-action]');
      if (!btn) return;

      if (btn.dataset.key) {
        if (input.value.length >= maxLength) return;
        updateValue(input.value + btn.dataset.key);
        return;
      }

      if (btn.dataset.action === 'back') {
        updateValue(input.value.slice(0, -1));
      } else if (btn.dataset.action === 'clear') {
        updateValue('');
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key >= '0' && e.key <= '9') {
        if (input.value.length >= maxLength) {
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Backspace') return;
      if (e.key === 'Tab') return;
      e.preventDefault();
    });
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
    
    // Suche & Sort Event-Listener
    document.getElementById('login-search')?.addEventListener('input', (e) => {
      renderLoginsList(e.target.value);
    });
    document.getElementById('login-sort')?.addEventListener('change', () => {
      const searchValue = document.getElementById('login-search')?.value || '';
      renderLoginsList(searchValue);
    });
    
    // TOTP Preview Event-Listener
    const login2faInput = document.getElementById('login-2fa');
    if (login2faInput) {
      let totpInterval = null;
      
      const updateTOTPPreview = () => {
        const secret = login2faInput.value.trim();
        const previewDiv = document.getElementById('totp-preview');
        const codeSpan = document.getElementById('totp-code');
        
        if (secret && window.TOTPUtils) {
          const code = window.TOTPUtils.generateTOTP(secret);
          if (code) {
            codeSpan.textContent = code;
            previewDiv.style.display = 'block';
          } else {
            previewDiv.style.display = 'none';
          }
        } else {
          previewDiv.style.display = 'none';
        }
      };
      
      login2faInput.addEventListener('input', () => {
        updateTOTPPreview();
        // Update alle 30 Sekunden wenn Secret eingegeben
        if (totpInterval) clearInterval(totpInterval);
        if (login2faInput.value.trim()) {
          totpInterval = setInterval(updateTOTPPreview, 30000);
        }
      });
      
      login2faInput.addEventListener('blur', () => {
        if (totpInterval) {
          clearInterval(totpInterval);
          totpInterval = null;
        }
      });
    }
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
          
          // Suche Event-Listener für Login-Auswahl
          const selectionSearch = document.getElementById('selection-search');
          if (selectionSearch) {
            selectionSearch.value = '';
            selectionSearch.addEventListener('input', (e) => {
              renderAvailableLogins(e.target.value);
            });
          }
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
    peer.on('open', () => {
      log('Peer geoeffnet');
      conn = peer.connect(payload.peerId, { reliable: true });
      conn.on('open', () => {
        log('Verbindung offen, sende Hello');
        conn.send({ type: 'EasyLoginHello', client: 'PWA' });
      });
      conn.on('close', () => {
        log('Verbindung geschlossen');
        updateScanStatus('Verbindung getrennt');
        setMode('camera-mode');
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

  // ===== Login Management =====
  async function loadLogins() {
    try {
      const encryptedData = localStorage.getItem(LOGINS_KEY);
      if (!encryptedData) {
        logins = [];
        return;
      }

      // Wenn noch kein Passwort vorhanden, Logins unverschlüsselt laden (Legacy)
      if (!protectionPassword) {
        try {
          logins = JSON.parse(encryptedData);
        } catch {
          logins = [];
        }
        return;
      }

      // Versuche zu entschlüsseln
      try {
        const decrypted = await CryptoUtils.decryptData(encryptedData, protectionPassword);
        logins = JSON.parse(decrypted);
      } catch (err) {
        log('Fehler beim Entschlüsseln:', err);
        logins = [];
      }
    } catch (err) {
      log('Fehler beim Laden der Logins:', err);
      logins = [];
    }
  }

  async function saveLogins() {
    try {
      const jsonData = JSON.stringify(logins);
      
      // Verschlüssele wenn Passwort vorhanden
      if (protectionPassword && CryptoUtils.getProtectionType() !== 'none') {
        const encrypted = await CryptoUtils.encryptData(jsonData, protectionPassword);
        localStorage.setItem(LOGINS_KEY, encrypted.data);
      } else {
        // Keine Verschlüsselung
        localStorage.setItem(LOGINS_KEY, jsonData);
      }
    } catch (err) {
      log('Fehler beim Speichern der Logins:', err);
    }
  }

  function renderLoginsList(filter = '') {
    const list = document.getElementById('logins-list');
    if (!list) return;

    if (!logins.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔐</div><p>Noch keine Logins</p><small>Füge deinen ersten Login hinzu</small></div>';
      return;
    }

    // Filter und Sort
    let displayLogins = logins.map((login, idx) => ({ ...login, originalIdx: idx }));
    
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      displayLogins = displayLogins.filter(login => 
        login.name.toLowerCase().includes(lowerFilter) ||
        login.username.toLowerCase().includes(lowerFilter)
      );
    }

    const sortBy = document.getElementById('login-sort')?.value || 'name';
    if (sortBy === 'name') {
      displayLogins.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'recent') {
      displayLogins.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    }

    if (!displayLogins.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>Keine Logins gefunden</p><small>Versuche einen anderen Suchbegriff</small></div>';
      return;
    }

    list.innerHTML = displayLogins.map(login => {
      const has2FA = login.twofa && login.twofa.trim();
      const hasNote = login.note && login.note.trim();
      return `
        <div class="login-item" data-login-idx="${login.originalIdx}">
          <div class="login-icon">
            ${has2FA ? '🔐' : '🔑'}
          </div>
          <div class="login-info">
            <div class="login-name">${escapeHtml(login.name)}</div>
            <div class="login-username">${escapeHtml(login.username)}</div>
            ${hasNote ? `<div class="login-note-preview">📝 ${escapeHtml(login.note.substring(0, 40))}${login.note.length > 40 ? '...' : ''}</div>` : ''}
          </div>
          <div class="login-badges">
            ${has2FA ? '<span class="badge badge-2fa">2FA</span>' : ''}
          </div>
          <div class="login-actions">
            <button class="edit-login-btn" title="Bearbeiten">✎</button>
          </div>
        </div>
      `;
    }).join('');

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

  async function handleLoginFormSubmit(e) {
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

    await saveLogins();
    renderLoginsList();
    document.getElementById('login-form-container').classList.add('hidden');
  }

  document.addEventListener('click', async (e) => {
    if (e.target.id === 'delete-login-btn') {
      e.preventDefault();
      const id = document.getElementById('login-id').value;
      logins = logins.filter(l => l.id !== id);
      await saveLogins();
      renderLoginsList();
      document.getElementById('login-form-container').classList.add('hidden');
    }
  });

  // ===== Available Logins After QR Scan =====
  function renderAvailableLogins(filter = '') {
    const container = document.getElementById('available-logins');
    if (!container) return;

    if (!logins.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔐</div><p>Keine Logins vorhanden</p><small>Füge zuerst einen Login hinzu</small></div>';
      return;
    }

    // Filter
    let displayLogins = logins.map((login, idx) => ({ ...login, originalIdx: idx }));
    
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      displayLogins = displayLogins.filter(login => 
        login.name.toLowerCase().includes(lowerFilter) ||
        login.username.toLowerCase().includes(lowerFilter)
      );
    }

    // Sort alphabetically
    displayLogins.sort((a, b) => a.name.localeCompare(b.name));

    if (!displayLogins.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>Keine Logins gefunden</p><small>Versuche einen anderen Suchbegriff</small></div>';
      return;
    }

    container.innerHTML = displayLogins.map(login => {
      const has2FA = login.twofa && login.twofa.trim();
      return `
        <button class="available-login-btn" data-login-idx="${login.originalIdx}">
          <div class="login-select-icon">${has2FA ? '🔐' : '🔑'}</div>
          <div class="login-select-info">
            <div class="login-select-name">${escapeHtml(login.name)}</div>
            <div class="login-select-username">${escapeHtml(login.username)}</div>
          </div>
          ${has2FA ? '<span class="badge badge-2fa-mini">2FA</span>' : ''}
        </button>
      `;
    }).join('');

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
    
    // Update lastUsed timestamp
    login.lastUsed = Date.now();
    saveLogins();
    
    log('Sende Login:', { name: login.name, username: login.username });
    
    // Generiere TOTP-Code aus Secret falls vorhanden
    let twofaCode = '';
    if (login.twofa && login.twofa.trim()) {
      if (window.TOTPUtils) {
        twofaCode = window.TOTPUtils.generateTOTP(login.twofa);
        if (twofaCode) {
          log('✓ 2FA Code generiert:', twofaCode);
        } else {
          log('✗ Fehler beim Generieren des 2FA Codes');
          updateScanStatus('Fehler: 2FA Secret ungültig');
          return;
        }
      } else {
        log('✗ TOTP Utils nicht verfügbar');
        updateScanStatus('Fehler: TOTP-Modul fehlt');
        return;
      }
    }
    
    sendLogin(login.username, login.password, twofaCode);
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

    log('Sende Login:', { username, hasPassword: !!password, has2FA: !!twofa, host: lastPayload.host });

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
        log('2FA erforderlich');
        conn.send({
          type: 'EasyLoginResponse',
          success: false,
          missing2fa: true,
          session: data,
          host: lastPayload.host,
          ref: lastPayload.ref
        });
        if (twofa) {
          await verify2FA(twofa, data);
        } else {
          show2FADialog(data);
        }
        return;
      }

      log('Sende EasyLoginResponse mit success:', response.ok);
      conn.send({
        type: 'EasyLoginResponse',
        success: response.ok,
        session: data,
        host: lastPayload.host,
        ref: lastPayload.ref
      });

      setMode('camera-mode');
    } catch (error) {
      log('Fehler bei sendLogin:', error);
      conn.send({
        type: 'EasyLoginResponse',
        success: false,
        error: error?.message,
        host: lastPayload.host,
        ref: lastPayload.ref
      });
    }
  }

  // ===== 2FA Handling =====
  function show2FADialog(loginData) {
    const dialog = document.getElementById('twofa-dialog');
    document.getElementById('twofa-input').value = '';
    dialog.classList.remove('hidden');
    window._current2FAData = loginData;
  }

  async function verify2FA(code, loginData) {
    if (!conn?.open || !lastPayload) {
      log('Fehler: Keine Verbindung bei 2FA');
      return;
    }

    log('Verifiziere 2FA mit Code:', code);

    try {
      const sessionToken =
        loginData?.sessionToken ||
        loginData?.sessionId ||
        loginData?.sessionid ||
        loginData?.token ||
        loginData?.session?.token ||
        loginData?.session?.sessionToken ||
        loginData?.session?.sessionId ||
        loginData?.session?.sessionid ||
        loginData?.session?.id ||
        '';
      log('2FA Session Token:', sessionToken ? 'vorhanden' : 'FEHLT');
      
      const url = `https://${lastPayload.host}/api/session/verify2fa/all/${code}`;
      log('2FA Verify URL:', url);
      
      const headers = {
        'Content-Type': 'application/json',
        'x-session-token': sessionToken
      };

      const response = await fetch(url, {
        method: 'GET',
        headers
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
        conn.send({
          type: 'EasyLoginResponse',
          success: true,
          session: verifyData || loginData,
          host: lastPayload.host,
          ref: lastPayload.ref
        });
        setMode('camera-mode');
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
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target?.result || '[]');
          if (Array.isArray(imported)) {
            logins = imported;
            await saveLogins();
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
