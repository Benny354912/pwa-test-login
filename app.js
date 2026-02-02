// ===== STATE MANAGEMENT =====
const state = {
    logins: [],
    currentDevice: null,
    peerConnection: null,
    localPeerId: null,
    isManagerOpen: false,
    connectedDevices: new Map(),
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('sw.js');
            console.log('✅ Service Worker registered');
        } catch (error) {
            console.warn('⚠️ Service Worker registration failed:', error);
        }
    }
    
    // Load persisted data
    loadFromStorage();
    
    // Initialize camera
    initializeCamera();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize PeerJS
    initializePeerConnection();
});

// ===== CAMERA INITIALIZATION =====
async function initializeCamera() {
    const video = document.getElementById('videoElement');
    const loadingSpinner = document.querySelector('.loading-spinner');
    
    try {
        loadingSpinner.style.display = 'flex';
        
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        
        video.srcObject = stream;
        video.addEventListener('loadedmetadata', () => {
            loadingSpinner.style.display = 'none';
            startQRScanning(video);
        });
    } catch (error) {
        console.error('❌ Camera error:', error);
        loadingSpinner.style.display = 'none';
        showAlert('Kamerazugriff erforderlich', 'error');
    }
}

// ===== QR SCANNING =====
async function startQRScanning(video) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const imageData = new ImageData(1, 1);
    let isProcessing = false;
    
    const scanFrame = () => {
        if (state.isManagerOpen) {
            requestAnimationFrame(scanFrame);
            return;
        }
        
        if (video.readyState === video.HAVE_ENOUGH_DATA && !isProcessing) {
            isProcessing = true;
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            try {
                imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                
                if (code) {
                    handleQRCodeScanned(code.data);
                    isProcessing = false;
                    return;
                }
            } catch (error) {
                console.warn('QR scan error:', error);
            }
            
            isProcessing = false;
        }
        
        requestAnimationFrame(scanFrame);
    };
    
    scanFrame();
}

// ===== QR CODE HANDLER =====
async function handleQRCodeScanned(qrData) {
    console.log('📱 QR Code scanned:', qrData);
    
    try {
        // Parse the QR code data - expecting it to contain connection info
        const qrInfo = JSON.parse(qrData);
        
        if (qrInfo.peerId) {
            // Connect to the peer
            connectToPeer(qrInfo.peerId);
        } else if (qrInfo.host_name) {
            // Direct login info was scanned
            const loginData = {
                host_name: qrInfo.host_name,
                public_listing: qrInfo.public_listing || false,
                public_listing_name: qrInfo.public_listing_name || '',
                public_listing_image: qrInfo.public_listing_image || '',
                itype: qrInfo.itype || ''
            };
            
            storeLoginData(loginData);
            showAlert('✅ Login-Daten empfangen!', 'success');
        }
    } catch (error) {
        console.warn('Invalid QR code format:', error);
    }
}

// ===== PEERJS CONNECTION =====
function initializePeerConnection() {
    const peer = new Peer();
    
    peer.on('open', (id) => {
        state.localPeerId = id;
        console.log('🆔 My Peer ID:', id);
        // Store for generating QR codes
        localStorage.setItem('easyLogin_peerId', id);
    });
    
    peer.on('connection', (conn) => {
        handlePeerConnection(conn);
    });
    
    peer.on('error', (err) => {
        console.error('🔴 Peer error:', err);
    });
    
    state.peerConnection = peer;
}

function connectToPeer(remotePeerId) {
    if (!state.peerConnection) {
        showAlert('PeerJS nicht bereit', 'error');
        return;
    }
    
    console.log('🔗 Verbinde zu Peer:', remotePeerId);
    const conn = state.peerConnection.connect(remotePeerId);
    
    handlePeerConnection(conn);
}

function handlePeerConnection(conn) {
    conn.on('open', () => {
        console.log('✅ Verbindung hergestellt');
        state.currentDevice = {
            id: conn.peer,
            connection: conn
        };
        
        state.connectedDevices.set(conn.peer, conn);
        updateDevicesTab();
        showAlert('Gerät verbunden', 'success');
    });
    
    conn.on('data', (data) => {
        handlePeerMessage(data, conn);
    });
    
    conn.on('error', (err) => {
        console.error('Connection error:', err);
        showAlert('Verbindungsfehler', 'error');
    });
    
    conn.on('close', () => {
        console.log('❌ Verbindung beendet');
        state.connectedDevices.delete(conn.peer);
        if (state.currentDevice?.id === conn.peer) {
            state.currentDevice = null;
        }
        updateDevicesTab();
    });
}

function handlePeerMessage(data, conn) {
    console.log('📨 Nachricht vom Gerät:', data);
    
    if (data.type === 'REQUEST_LOGIN_DATA') {
        // AdminPlus fordert Login-Daten für ein System an
        const { host_name } = data;
        const matches = state.logins.filter(login => login.host_name === host_name);
        
        conn.send({
            type: 'LOGIN_DATA_RESPONSE',
            logins: matches
        });
    } else if (data.type === 'STORE_CONFIG') {
        // Speichere die Konfiguration vom AdminPlus
        const config = data.config;
        storeLoginData(config);
        
        conn.send({
            type: 'CONFIG_STORED',
            success: true
        });
    }
}

function storeLoginData(data) {
    // Store in localStorage under flutter key
    const key = `flutter.${data.host_name.replace(/\./g, '_')}`;
    localStorage.setItem(key, JSON.stringify(data));
    console.log('💾 Konfiguration gespeichert:', key);
}

// ===== LOGIN MANAGEMENT =====
async function performLogin(hostname, username, password) {
    const url = `https://${hostname}/api/logins`;
    
    try {
        console.log('🔐 Login attempt für:', hostname);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                login: {
                    username: username,
                    password: password
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const loginResponse = await response.json();
        console.log('✅ Login erfolgreich:', loginResponse);
        
        // Store session
        if (loginResponse.session || loginResponse.token) {
            const sessionKey = `flutter.${hostname.replace(/\./g, '_')}_iw-session`;
            localStorage.setItem(sessionKey, JSON.stringify(loginResponse));
            
            // Send to connected device
            if (state.currentDevice) {
                state.currentDevice.connection.send({
                    type: 'LOGIN_SUCCESS',
                    session: loginResponse,
                    hostname: hostname
                });
            }
            
            showAlert('✅ Login erfolgreich!', 'success');
            
            // Redirect if available
            if (loginResponse.redirect_url) {
                window.location.href = loginResponse.redirect_url;
            }
        }
        
        return true;
    } catch (error) {
        console.error('❌ Login fehler:', error);
        showAlert('Login fehlgeschlagen: ' + error.message, 'error');
        return false;
    }
}

// ===== STORAGE =====
function loadFromStorage() {
    const stored = localStorage.getItem('easyLogin_logins');
    if (stored) {
        try {
            state.logins = JSON.parse(stored);
            console.log('📖 Logins geladen:', state.logins.length);
        } catch (error) {
            console.error('Storage error:', error);
        }
    }
}

function saveToStorage() {
    localStorage.setItem('easyLogin_logins', JSON.stringify(state.logins));
}

// ===== UI EVENT LISTENERS =====
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            e.target.classList.add('active');
            const tabName = e.target.dataset.tab;
            document.getElementById(`${tabName}Content`).classList.add('active');
        });
    });
    
    // Manager toggle
    document.getElementById('cameraView').addEventListener('click', toggleManager);
    document.getElementById('backBtn').addEventListener('click', toggleManager);
    
    // QR Button
    document.getElementById('qrBtn').addEventListener('click', showQRCode);
    
    // Form submission
    document.getElementById('addLoginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const hostname = document.getElementById('hostNameInput').value;
        const username = document.getElementById('usernameInput').value;
        const password = document.getElementById('passwordInput').value;
        
        state.logins.push({
            host_name: hostname,
            username: username,
            password: password,
            timestamp: Date.now()
        });
        
        saveToStorage();
        renderLogins();
        closeModal('addLoginModal');
        
        document.getElementById('addLoginForm').reset();
        showAlert('✅ Login hinzugefügt', 'success');
    });
    
    // Clear all
    document.getElementById('clearAllBtn').addEventListener('click', () => {
        if (confirm('Alle Daten wirklich löschen?')) {
            state.logins = [];
            state.connectedDevices.clear();
            localStorage.clear();
            renderLogins();
            updateDevicesTab();
            showAlert('🗑️ Alle Daten gelöscht', 'info');
        }
    });
}

function toggleManager() {
    state.isManagerOpen = !state.isManagerOpen;
    document.getElementById('cameraView').style.display = state.isManagerOpen ? 'none' : 'flex';
    document.getElementById('managerView').style.display = state.isManagerOpen ? 'flex' : 'none';
    
    if (state.isManagerOpen) {
        renderLogins();
        updateDevicesTab();
    }
}

// ===== LOGIN RENDERING =====
function renderLogins() {
    const container = document.getElementById('loginsContent');
    
    if (state.logins.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔑</div>
                <div class="empty-state-text">Keine Logins gespeichert</div>
                <div class="empty-state-subtext">Logins werden über QR-Code hinzugefügt</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.logins.map((login, index) => `
        <div class="login-item">
            <div class="login-item-header">
                <div class="login-item-hostname">🌐 ${login.host_name}</div>
                <div class="login-item-actions">
                    <button class="action-btn" onclick="performLogin('${login.host_name}', '${login.username}', '${login.password}')" title="Login">↗️</button>
                    <button class="action-btn" onclick="editLogin(${index})" title="Bearbeiten">✏️</button>
                    <button class="action-btn" onclick="deleteLogin(${index})" title="Löschen">🗑️</button>
                </div>
            </div>
            <div class="login-item-username">👤 ${login.username}</div>
            <div class="login-item-password">🔑 ••••••••</div>
        </div>
    `).join('');
}

function editLogin(index) {
    const login = state.logins[index];
    document.getElementById('hostNameInput').value = login.host_name;
    document.getElementById('usernameInput').value = login.username;
    document.getElementById('passwordInput').value = login.password;
    
    // Change form behavior
    document.getElementById('addLoginForm').onsubmit = (e) => {
        e.preventDefault();
        state.logins[index] = {
            host_name: document.getElementById('hostNameInput').value,
            username: document.getElementById('usernameInput').value,
            password: document.getElementById('passwordInput').value,
            timestamp: Date.now()
        };
        saveToStorage();
        renderLogins();
        closeModal('addLoginModal');
        document.getElementById('addLoginForm').reset();
        showAlert('✅ Login aktualisiert', 'success');
    };
    
    openModal('addLoginModal');
    document.querySelector('.modal-header').textContent = 'Login bearbeiten';
}

function deleteLogin(index) {
    if (confirm('Login wirklich löschen?')) {
        state.logins.splice(index, 1);
        saveToStorage();
        renderLogins();
        showAlert('🗑️ Login gelöscht', 'success');
    }
}

function updateDevicesTab() {
    const container = document.getElementById('devicesContent');
    
    if (state.connectedDevices.size === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📡</div>
                <div class="empty-state-text">Keine verbundenen Geräte</div>
                <div class="empty-state-subtext">Scanne einen QR-Code um zu verbinden</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = Array.from(state.connectedDevices.entries()).map(([peerId, conn]) => `
        <div class="login-item">
            <div class="login-item-header">
                <div class="login-item-hostname">📱 Verbunden</div>
                <button class="action-btn" onclick="disconnectDevice('${peerId}')" title="Trennen">❌</button>
            </div>
            <div class="login-item-username">Peer ID: ${peerId.substring(0, 8)}...</div>
            <div class="login-item-password">Status: Online ✅</div>
        </div>
    `).join('');
}

function disconnectDevice(peerId) {
    const conn = state.connectedDevices.get(peerId);
    if (conn) {
        conn.close();
        state.connectedDevices.delete(peerId);
        updateDevicesTab();
        showAlert('Gerät getrennt', 'info');
    }
}

// ===== QR CODE DISPLAY =====
function showQRCode() {
    if (!state.localPeerId) {
        showAlert('Peer ID nicht verfügbar', 'error');
        return;
    }
    
    const qrData = JSON.stringify({
        type: 'EASY_LOGIN',
        peerId: state.localPeerId,
        timestamp: Date.now()
    });
    
    QRCode.toCanvas(document.getElementById('qrCanvas'), qrData, {
        width: 250,
        margin: 1,
        color: { dark: '#1F3A93', light: '#ffffff' }
    }, (error) => {
        if (error) {
            console.error('QR error:', error);
            showAlert('QR-Code konnte nicht generiert werden', 'error');
        }
    });
    
    openModal('qrDisplayModal');
}

// ===== MODAL HELPERS =====
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    // Reset form
    const form = document.getElementById('addLoginForm');
    if (form) {
        form.onsubmit = (e) => {
            e.preventDefault();
            // Default add behavior
        };
        form.reset();
        document.querySelector('.modal-header').textContent = 'Neuen Login hinzufügen';
    }
}

// Click outside modal to close
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// ===== ALERTS =====
function showAlert(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 3000);
}
