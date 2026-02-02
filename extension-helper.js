// ===== EXTENSION HELPER für EasyLogin Integration =====
// Diese Datei hilft der Browser-Erweiterung/AdminPlus mit der EasyLogin PWA zu kommunizieren

class EasyLoginConnector {
    constructor() {
        this.peer = null;
        this.peerConnection = null;
        this.localPeerId = null;
        this.remotePeerId = null;
    }
    
    /**
     * Initialisiere PeerJS Verbindung
     */
    async initializePeer() {
        return new Promise((resolve, reject) => {
            this.peer = new Peer();
            
            this.peer.on('open', (id) => {
                this.localPeerId = id;
                console.log('✅ AdminPlus Peer ID:', id);
                resolve(id);
            });
            
            this.peer.on('error', (err) => {
                console.error('❌ Peer error:', err);
                reject(err);
            });
        });
    }
    
    /**
     * Verbinde dich mit PWA (anhand ihres QR-Code gescannten Peer IDs)
     */
    connectToPWA(pwaPeerId) {
        return new Promise((resolve, reject) => {
            if (!this.peer) {
                reject(new Error('Peer nicht initialisiert'));
                return;
            }
            
            this.remotePeerId = pwaPeerId;
            this.peerConnection = this.peer.connect(pwaPeerId);
            
            this.peerConnection.on('open', () => {
                console.log('✅ Mit PWA verbunden');
                resolve();
            });
            
            this.peerConnection.on('data', (data) => {
                this.handlePWAMessage(data);
            });
            
            this.peerConnection.on('error', (err) => {
                console.error('Connection error:', err);
                reject(err);
            });
        });
    }
    
    /**
     * Sende Konfiguration an PWA
     * Die PWA speichert diese unter LocalStorage Schlüssel: flutter.{hostname}
     */
    sendConfigToPWA(config) {
        if (!this.peerConnection || !this.peerConnection.open) {
            console.error('❌ Nicht mit PWA verbunden');
            return false;
        }
        
        const message = {
            type: 'STORE_CONFIG',
            config: {
                host_name: config.host_name,
                public_listing: config.public_listing || false,
                public_listing_name: config.public_listing_name || '',
                public_listing_image: config.public_listing_image || '',
                itype: config.itype || ''
            }
        };
        
        this.peerConnection.send(message);
        console.log('📤 Konfiguration an PWA gesendet:', config.host_name);
        return true;
    }
    
    /**
     * Fordere Login-Daten von PWA an
     */
    async requestLoginData(hostname) {
        return new Promise((resolve, reject) => {
            if (!this.peerConnection || !this.peerConnection.open) {
                reject(new Error('Nicht mit PWA verbunden'));
                return;
            }
            
            const handler = (data) => {
                if (data.type === 'LOGIN_DATA_RESPONSE' && data.logins) {
                    this.peerConnection.off('data', handler);
                    resolve(data.logins);
                }
            };
            
            this.peerConnection.on('data', handler);
            
            this.peerConnection.send({
                type: 'REQUEST_LOGIN_DATA',
                host_name: hostname
            });
            
            // Timeout nach 10 Sekunden
            setTimeout(() => {
                this.peerConnection.off('data', handler);
                reject(new Error('Antwort Timeout'));
            }, 10000);
        });
    }
    
    /**
     * Verarbeite Nachrichten von der PWA
     */
    handlePWAMessage(data) {
        console.log('📨 Nachricht von PWA:', data);
        
        if (data.type === 'LOGIN_SUCCESS') {
            // PWA hat erfolgreich angemeldet
            this.handleLoginSuccess(data);
        } else if (data.type === 'CONFIG_STORED') {
            console.log('✅ Konfiguration auf PWA gespeichert');
        }
    }
    
    /**
     * Verarbeite erfolgreichen Login
     */
    handleLoginSuccess(data) {
        const { session, hostname } = data;
        
        // Speichere Session unter flutter.{hostname}_iw-session
        const sessionKey = `flutter.${hostname.replace(/\./g, '_')}_iw-session`;
        localStorage.setItem(sessionKey, JSON.stringify(session));
        
        console.log('✅ Session gespeichert unter:', sessionKey);
        
        // Trigger Event für Rest der Erweiterung
        window.dispatchEvent(new CustomEvent('easyLoginSuccess', {
            detail: { hostname, session }
        }));
    }
    
    /**
     * Generiere QR-Code für deine Peer ID
     */
    generateQRCode(canvasElementId) {
        if (!this.localPeerId) {
            console.error('❌ Local Peer ID nicht verfügbar');
            return;
        }
        
        const qrData = JSON.stringify({
            type: 'EASY_LOGIN',
            peerId: this.localPeerId,
            timestamp: Date.now()
        });
        
        // Benötigt QRCode.js Library
        if (typeof QRCode !== 'undefined') {
            QRCode.toCanvas(document.getElementById(canvasElementId), qrData, {
                width: 300,
                margin: 2,
                color: { dark: '#1F3A93', light: '#ffffff' }
            }, (error) => {
                if (error) {
                    console.error('QR Generation error:', error);
                }
            });
        }
    }
    
    /**
     * Trenne Verbindung
     */
    disconnect() {
        if (this.peerConnection) {
            this.peerConnection.close();
        }
        if (this.peer) {
            this.peer.destroy();
        }
        console.log('❌ Verbindung beendet');
    }
}

// ===== EXAMPLE USAGE FÜR AdminPlus/Erweiterung =====
/*

// Initialisiere Connector
const easyLogin = new EasyLoginConnector();

// 1. Initialisiere Peer
await easyLogin.initializePeer();

// 2. Benutzer scannt QR-Code der PWA mit dieser Erweiterung
// Die PWA hat ihren QR-Code mit ihrer Peer ID generiert
async function onQRCodeScanned(qrData) {
    const qrInfo = JSON.parse(qrData);
    
    if (qrInfo.type === 'EASY_LOGIN') {
        // 3. Verbinde zur PWA
        await easyLogin.connectToPWA(qrInfo.peerId);
        
        // 4. Sende Konfiguration
        easyLogin.sendConfigToPWA({
            host_name: "tkh.iw-erp.de",
            public_listing: true,
            public_listing_name: "Turn-Klubb zu Hannover",
            public_listing_image: "https://tkh.iw-erp.de/logo",
            itype: "iwERP"
        });
    }
}

// 5. Benutzer will sich anmelden - fordere Login an
async function initiateLogin(hostname) {
    try {
        const logins = await easyLogin.requestLoginData(hostname);
        console.log('Verfügbare Logins:', logins);
        
        // Zeige UI zum Auswählen oder automatisch verwenden
        if (logins.length === 1) {
            // Automatisch Login verwenden
            const { username, password } = logins[0];
            // Führe Login durch (PWA macht das über ihre API)
        }
    } catch (error) {
        console.error('Login-Anfrage fehler:', error);
    }
}

// Listen für erfolgreiche Logins
window.addEventListener('easyLoginSuccess', (event) => {
    const { hostname, session } = event.detail;
    console.log(`✅ Erfolgreich angemeldet in ${hostname}`);
    
    // Lade die Seite neu oder navigiere zum Home
    window.location.href = `https://${hostname}/#/home`;
});

*/

// Export für Use in verschiedenen Umgebungen
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EasyLoginConnector;
}
