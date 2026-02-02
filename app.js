// AdminPlus PWA - App Logic
class AdminPlusApp {
    constructor() {
        this.currentView = 'scanner';
        this.peerConnection = null;
        this.cameraStream = null;
        this.scanningActive = false;
        this.currentHostname = '';
        this.db = null;
        
        this.init();
    }

    async init() {
        await this.initDB();
        await this.registerServiceWorker();
        this.setupEventListeners();
        this.showView('scanner');
    }

    // ==================== Database (IndexedDB) ====================

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('AdminPlusDB', 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('logins')) {
                    const store = db.createObjectStore('logins', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('hostname', 'hostname', { unique: false });
                    store.createIndex('username', 'username', { unique: false });
                }
            };
        });
    }

    async saveLogin(hostname, username, password) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['logins'], 'readwrite');
            const store = tx.objectStore('logins');

            // Check ob bereits existiert
            const index = store.index('hostname');
            const range = IDBKeyRange.only(hostname);
            const request = index.getAll(range);

            request.onsuccess = () => {
                const existing = request.result.find(l => l.username === username && l.hostname === hostname);
                
                if (existing) {
                    // Update
                    const updateReq = store.put({
                        ...existing,
                        password: btoa(password), // Base64 encode
                        updated: new Date()
                    });
                    updateReq.onsuccess = () => resolve(updateReq.result);
                    updateReq.onerror = () => reject(updateReq.error);
                } else {
                    // Insert
                    const addReq = store.add({
                        hostname,
                        username,
                        password: btoa(password),
                        created: new Date(),
                        updated: new Date()
                    });
                    addReq.onsuccess = () => resolve(addReq.result);
                    addReq.onerror = () => reject(addReq.error);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getLoginsByHostname(hostname) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['logins'], 'readonly');
            const store = tx.objectStore('logins');
            const index = store.index('hostname');
            const range = IDBKeyRange.only(hostname);
            const request = index.getAll(range);

            request.onsuccess = () => {
                const logins = request.result.map(l => ({
                    ...l,
                    password: atob(l.password) // Decode
                }));
                resolve(logins);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteLogin(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['logins'], 'readwrite');
            const store = tx.objectStore('logins');
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== Service Worker ====================

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('sw.js');
            } catch (error) {
                console.error('SW registration failed:', error);
            }
        }
    }

    // ==================== UI ====================

    showView(name) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(`${name}-view`);
        if (view) {
            view.classList.add('active');
            this.currentView = name;
        }
    }

    setupEventListeners() {
        // Scanner
        document.getElementById('toggle-camera').addEventListener('click', () => this.toggleCamera());

        // Navigation
        document.getElementById('add-login-btn').addEventListener('click', () => this.showAddLoginView());
        document.getElementById('back-to-scanner').addEventListener('click', () => this.showView('scanner'));
        document.getElementById('cancel-add-login').addEventListener('click', () => this.showView('login'));

        // Add Login Form
        document.getElementById('add-login-form').addEventListener('submit', (e) => this.handleAddLogin(e));
        document.getElementById('toggle-password').addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.getElementById('login-password');
            input.type = input.type === 'password' ? 'text' : 'password';
        });

        // Error View
        document.getElementById('error-retry').addEventListener('click', () => this.showView('scanner'));
    }

    // ==================== Camera & QR Scanner ====================

    async toggleCamera() {
        if (this.scanningActive) {
            this.stopCamera();
        } else {
            await this.startCamera();
        }
    }

    async startCamera() {
        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });

            const video = document.getElementById('camera');
            video.srcObject = this.cameraStream;
            
            this.scanningActive = true;
            document.getElementById('toggle-camera').textContent = '⏹ Kamera stoppen';
            
            this.scanQRCodes();
        } catch (error) {
            this.showError('Kamerazugriff verweigert');
            console.error('Camera error:', error);
        }
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        this.scanningActive = false;
        document.getElementById('toggle-camera').textContent = '📷 Kamera starten';
    }

    scanQRCodes() {
        const video = document.getElementById('camera');
        const canvas = document.getElementById('canvas');
        const canvasContext = canvas.getContext('2d');

        const scan = () => {
            if (!this.scanningActive) return;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvasContext.drawImage(video, 0, 0);

            const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);

            if (code) {
                this.handleQRCode(code.data);
                return;
            }

            requestAnimationFrame(scan);
        };

        scan();
    }

    handleQRCode(data) {
        try {
            const qrData = JSON.parse(data);
            if (qrData.peerId && qrData.hostName) {
                this.stopCamera();
                this.connectToPeer(qrData.peerId, qrData.hostName);
            }
        } catch (error) {
            console.error('Invalid QR data:', error);
        }
    }

    // ==================== PeerJS ====================

    connectToPeer(peerId, hostName) {
        this.currentHostname = hostName;
        this.showView('login-progress');
        document.getElementById('progress-text').textContent = 'PeerJS Verbindung wird aufgebaut...';

        if (!window.Peer) {
            this.showError('PeerJS nicht verfügbar');
            return;
        }

        const conn = window.peer.connect(peerId);

        conn.on('open', async () => {
            console.log('Verbindung offen');
            // Logins laden
            const logins = await this.getLoginsByHostname(hostName);
            this.showLoginSelection(logins, conn, hostName);
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            this.showError('Verbindungsfehler');
        });

        this.peerConnection = conn;
    }

    // ==================== Login Management ====================

    async showLoginSelection(logins, conn, hostName) {
        if (logins.length === 0) {
            this.showAddLoginView(hostName);
            return;
        }

        document.getElementById('instance-name').textContent = hostName;
        const list = document.getElementById('login-list');
        list.innerHTML = logins.map(login => `
            <div class="login-item" data-id="${login.id}" data-username="${login.username}">
                <div class="login-avatar">${login.username.charAt(0).toUpperCase()}</div>
                <div class="login-info">
                    <div class="login-name">${login.username}</div>
                    <div class="login-username">${hostName}</div>
                </div>
                <button type="button" class="login-delete" data-id="${login.id}">✕</button>
            </div>
        `).join('');

        // Select Login
        list.querySelectorAll('.login-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                if (!e.target.closest('.login-delete')) {
                    const loginId = parseInt(item.dataset.id);
                    const login = logins.find(l => l.id === loginId);
                    await this.performLogin(login, conn, hostName);
                }
            });
        });

        // Delete Login
        list.querySelectorAll('.login-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const loginId = parseInt(btn.dataset.id);
                if (confirm('Dieses Konto löschen?')) {
                    await this.deleteLogin(loginId);
                    this.showLoginSelection(
                        await this.getLoginsByHostname(hostName),
                        conn,
                        hostName
                    );
                }
            });
        });

        this.showView('login');
    }

    showAddLoginView(hostName = this.currentHostname) {
        document.getElementById('login-hostname').value = hostName || this.currentHostname;
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('login-remember').checked = true;
        this.showView('add-login');
    }

    async handleAddLogin(e) {
        e.preventDefault();

        const hostname = document.getElementById('login-hostname').value;
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        if (!hostname || !username || !password) {
            this.showError('Alle Felder ausfüllen');
            return;
        }

        try {
            await this.saveLogin(hostname, username, password);
            const logins = await this.getLoginsByHostname(hostname);
            this.showLoginSelection(logins, this.peerConnection, hostname);
        } catch (error) {
            this.showError('Fehler beim Speichern');
            console.error(error);
        }
    }

    // ==================== Login ====================

    async performLogin(login, conn, hostName) {
        this.showView('login-progress');
        document.getElementById('progress-text').textContent = 'Anmeldung läuft...';

        try {
            const response = await fetch(`https://${hostName}/api/logins`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: {
                        username: login.username,
                        password: login.password
                    }
                })
            });

            if (!response.ok) {
                throw new Error('Login failed');
            }

            const sessionData = await response.json();

            // Sende Session via PeerJS
            if (conn && conn.open) {
                conn.send({
                    type: 'LOGIN_SESSION',
                    session: sessionData
                });
            }

            this.showSuccess('Anmeldung erfolgreich!');
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Anmeldung fehlgeschlagen');
        }
    }

    // ==================== UI States ====================

    showError(message) {
        document.getElementById('error-message').textContent = message;
        this.showView('error');
    }

    showSuccess(message) {
        document.getElementById('success-message').textContent = message;
        this.showView('success');

        let countdown = 3;
        document.getElementById('countdown').textContent = countdown;
        const interval = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
                clearInterval(interval);
            } else {
                document.getElementById('countdown').textContent = countdown;
            }
        }, 1000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // PeerJS initialisieren
    window.peer = new Peer({
        host: 'peerserver.adminplus.local',
        port: 9000,
        secure: false
    });

    // App starten
    window.app = new AdminPlusApp();
});
