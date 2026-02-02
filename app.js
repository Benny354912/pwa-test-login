/* Easy Login PWA */
(() => {
  const scanView = document.getElementById('scan-view');
  const managerView = document.getElementById('manager-view');
  const toggleViewBtn = document.getElementById('toggle-view');
  const backToScanBtn = document.getElementById('back-to-scan');
  const scanTapArea = document.getElementById('scan-tap-area');
  const scanStatus = document.getElementById('scan-status');
  const connStatus = document.getElementById('conn-status');
  const connInstance = document.getElementById('conn-instance');
  const loginList = document.getElementById('login-list');
  const loginForm = document.getElementById('login-form');
  const resetFormBtn = document.getElementById('reset-form');
  const manualForm = document.getElementById('manual-form');

  let qrScanner = null;
  let peer = null;
  let conn = null;
  let lastPayload = null;
  let logins = loadLogins();

  registerServiceWorker();
  renderLogins();
  startScanner();

  toggleViewBtn?.addEventListener('click', () => setView('manager'));
  backToScanBtn?.addEventListener('click', () => setView('scan'));
  scanTapArea?.addEventListener('click', () => setView('manager'));

  loginForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const id = document.getElementById('login-id').value || generateId();
    const name = document.getElementById('login-name').value.trim();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!name || !username || !password) return;

    const existingIndex = logins.findIndex((item) => item.id === id);
    const entry = { id, name, username, password };
    if (existingIndex >= 0) {
      logins[existingIndex] = entry;
    } else {
      logins.push(entry);
    }

    saveLogins();
    renderLogins();
    loginForm.reset();
  });

  resetFormBtn?.addEventListener('click', () => {
    loginForm.reset();
    document.getElementById('login-id').value = '';
  });

  manualForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('manual-username').value.trim();
    const password = document.getElementById('manual-password').value;
    if (!username || !password) return;
    await performLogin(username, password);
  });

  function setView(view) {
    if (view === 'manager') {
      scanView.classList.remove('active');
      managerView.classList.add('active');
      toggleViewBtn.textContent = 'Zur Kamera';
      stopScanner();
    } else {
      managerView.classList.remove('active');
      scanView.classList.add('active');
      toggleViewBtn.textContent = 'Passwort‑Manager';
      startScanner();
    }
  }

  function startScanner() {
    if (qrScanner) return;

    const container = document.getElementById('qr-reader');
    if (!container) {
      updateScanStatus('Scanner nicht verfügbar', 'danger');
      return;
    }

    if (!window.Html5Qrcode) {
      updateScanStatus('Scanner lädt...', 'warning');
      setTimeout(startScanner, 500);
      return;
    }

    qrScanner = new window.Html5Qrcode('qr-reader');
    const config = { fps: 10, qrbox: { width: 240, height: 240 } };

    window.Html5Qrcode.getCameras()
      .then((cameras) => {
        if (!cameras || cameras.length === 0) {
          throw new Error('Keine Kamera gefunden');
        }
        const cameraId = cameras[0].id;
        updateScanStatus('Bereit zum Scannen', 'success');
        return qrScanner.start(cameraId, config, onScanSuccess, onScanFailure);
      })
      .catch((err) => {
        console.error('Scanner Fehler:', err);
        updateScanStatus('Kamera nicht verfügbar', 'danger');
        qrScanner = null;
      });
  }

  function stopScanner() {
    if (!qrScanner) return;
    qrScanner.stop().then(() => {
      qrScanner.clear();
      qrScanner = null;
    });
  }

  function onScanSuccess(decodedText) {
    try {
      const payload = JSON.parse(decodedText);
      if (!payload?.peerId) throw new Error('Ungültiger QR‑Code');
      lastPayload = payload;
      console.log('QR gescannt:', payload);
      updateScanStatus('QR gescannt – verbinde…', 'success');
      connectPeer(payload);
      setTimeout(() => {
        if (conn && conn.open) {
          updateScanStatus('Verbunden – Login auswählen', 'success');
          setView('manager');
        }
      }, 500);
    } catch (err) {
      console.error('QR Parse error:', err);
      updateScanStatus('Ungültiger QR‑Code', 'warning');
    }
  }

  function onScanFailure() {
    // Scan failure - continue scanning
  }

  function updateScanStatus(text, type) {
    if (!scanStatus) return;
    scanStatus.textContent = text;
    scanStatus.classList.remove('success', 'warning', 'danger');
    if (type) scanStatus.classList.add(type);
  }

  function updateConnectionStatus(text, type) {
    if (!connStatus) return;
    connStatus.textContent = text;
    connStatus.classList.remove('success', 'warning', 'danger');
    if (type) connStatus.classList.add(type);
  }

  function connectPeer(payload) {
    if (!window.Peer) {
      updateConnectionStatus('PeerJS fehlt', 'danger');
      return;
    }

    if (peer) {
      peer.destroy();
      peer = null;
    }

    peer = new Peer({ host: '0.peerjs.com', port: 443, secure: true });
    updateConnectionStatus('Verbinde…', 'warning');

    peer.on('open', () => {
      conn = peer.connect(payload.peerId, { reliable: true });
      conn.on('open', () => {
        updateConnectionStatus('Verbunden', 'success');
        connInstance.textContent = payload.host || 'Unbekannt';
        conn.send({ type: 'EasyLoginHello', client: 'PWA' });
      });

      conn.on('close', () => updateConnectionStatus('Verbindung getrennt', 'warning'));
      conn.on('error', () => updateConnectionStatus('Verbindungsfehler', 'danger'));
    });

    peer.on('error', () => updateConnectionStatus('PeerJS Fehler', 'danger'));
  }

  async function performLogin(username, password) {
    if (!conn || !conn.open || !lastPayload?.host) {
      updateConnectionStatus('Keine Verbindung', 'danger');
      return;
    }

    updateConnectionStatus('Login wird gesendet…', 'warning');

    const url = `https://${lastPayload.host}/api/logins`;
    const body = {
      login: {
        username,
        password
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await response.json().catch(() => null);
      const payload = {
        type: 'EasyLoginResponse',
        success: response.ok,
        status: response.status,
        session: data,
        host: lastPayload.host,
        ref: lastPayload.ref || lastPayload.host
      };

      conn.send(payload);
      updateConnectionStatus(response.ok ? 'Login erfolgreich' : 'Login fehlgeschlagen', response.ok ? 'success' : 'danger');
    } catch (error) {
      conn.send({
        type: 'EasyLoginResponse',
        success: false,
        error: error?.message || 'Unbekannter Fehler',
        host: lastPayload.host,
        ref: lastPayload.ref || lastPayload.host
      });
      updateConnectionStatus('Login fehlgeschlagen', 'danger');
    }
  }

  function renderLogins() {
    if (!loginList) return;

    if (!logins.length) {
      loginList.innerHTML = '<p class="muted">Noch keine Logins gespeichert.</p>';
      return;
    }

    loginList.innerHTML = '';
    logins.forEach((item) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'login-item';

      wrapper.innerHTML = `
        <div class="row">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="muted">${escapeHtml(item.username)}</span>
        </div>
        <div class="actions">
          <button class="login-btn">Login</button>
          <button class="edit-btn">Bearbeiten</button>
          <button class="delete-btn">Löschen</button>
        </div>
      `;

      wrapper.querySelector('.login-btn').addEventListener('click', () => {
        performLogin(item.username, item.password);
      });

      wrapper.querySelector('.edit-btn').addEventListener('click', () => {
        document.getElementById('login-id').value = item.id;
        document.getElementById('login-name').value = item.name;
        document.getElementById('login-username').value = item.username;
        document.getElementById('login-password').value = item.password;
      });

      wrapper.querySelector('.delete-btn').addEventListener('click', () => {
        logins = logins.filter((entry) => entry.id !== item.id);
        saveLogins();
        renderLogins();
      });

      loginList.appendChild(wrapper);
    });
  }

  function loadLogins() {
    try {
      const raw = localStorage.getItem('easylogins');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveLogins() {
    localStorage.setItem('easylogins', JSON.stringify(logins));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function generateId() {
    if (crypto?.randomUUID) {
      return crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js');
    }
  }
})();
