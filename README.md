# EasyLogin PWA - Sichere Login Manager

Eine professionelle PWA (Progressive Web App) für sichere zentrale Login-Verwaltung mit QR-Code Integration und PeerJS Synchronisation.

## 🎯 Features

### 1. **Kamera-Interface**
- Beim Start wird sofort die Kamera angezeigt
- Modernes QR-Code Scanner UI mit animierten Ecken
- Ein Klick öffnet den Password Manager
- Automatische Umgebungs-Kamera-Erkennung

### 2. **Password Manager**
- 💾 Sichere lokale Speicherung aller Logins
- Speichert: `host_name`, `username`, `password`
- Einfache Verwaltung (Hinzufügen, Bearbeiten, Löschen)
- Ein-Klick Login-Ausführung

### 3. **QR-Code Scanning & Verbindung**
- Scanne QR-Code von AdminPlus/Erweiterung
- Automatische PeerJS Verbindungsaufbau
- Real-time Datensynchronisation
- Geräte-Verwaltung Tab

### 4. **Login-Flow**
1. PWA scannt QR-Code
2. Empfängt Konfiguration via PeerJS
3. Zeigt passende Logins an
4. Führt Login aus: `POST https://<host_name>/api/logins`
5. Speichert Session unter `flutter.<hostname>_iw-session`
6. Optional: Automatischer Redirect nach Login

### 5. **Synchronisation**
- LocalStorage Austausch mit AdminPlus
- Echtzeitige Datensynchronisation via PeerJS
- Offline-Unterstützung durch Service Worker
- Sichere Ende-zu-Ende Kommunikation

## 📂 Dateien

```
easy-login-pwa/
├── index.html          # Hauptseite mit UI
├── app.js              # Logik & Funktionalität
├── manifest.json       # PWA Manifest
├── sw.js              # Service Worker
└── README.md          # Diese Datei
```

## 🚀 Installation & Nutzung

### Lokal starten
1. Files in einen HTTP-Server kopieren (nicht File:// wegen Service Worker)
2. Browser öffnen: `http://localhost:8000`

### Zu Home-Bildschirm hinzufügen
- **iOS**: Safari → Teilen → Zum Home-Bildschirm
- **Android**: Chrome → Menü → "Zum Startbildschirm hinzufügen"

## 🔧 Technologie Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Scanning**: jsQR (QR-Code Scanner)
- **QR Generation**: QRCode.js
- **Real-time**: PeerJS (P2P Kommunikation)
- **Storage**: LocalStorage, IndexedDB (optional)
- **Offline**: Service Worker + Cache API
- **PWA**: Manifest, Web App Icons, Shortcuts

## 🔐 Sicherheit

- ✅ Logins nur lokal gespeichert
- ✅ Keine unverschlüsselte Übertragung
- ✅ PeerJS P2P Verbindung
- ✅ CORS-sichere API Calls
- ✅ Offline-First Architektur

## 📡 PeerJS Integration

### Verbindungsaufbau
```javascript
// QR-Code enthält Peer ID
{
  "type": "EASY_LOGIN",
  "peerId": "unique-peer-id",
  "timestamp": 1234567890
}
```

### Nachrichtenformat

**AdminPlus → PWA (Konfiguration)**
```json
{
  "type": "STORE_CONFIG",
  "config": {
    "host_name": "tkh.iw-erp.de",
    "public_listing": true,
    "public_listing_name": "Turn-Klubb zu Hannover",
    "public_listing_image": "https://...",
    "itype": "iwERP"
  }
}
```

**PWA → AdminPlus (Login Erfolg)**
```json
{
  "type": "LOGIN_SUCCESS",
  "session": { "token": "...", "...": "..." },
  "hostname": "tkh.iw-erp.de"
}
```

## 📱 UI/UX Design

- ✨ Modernes Gradient Design (Blau #1F3A93)
- 🎨 Responsive für alle Geräte
- ⚡ Schnelle, flüssige Animationen
- 🌙 Dunkelheit bei Kamera, helles Manager UI
- ♿ Gute Kontrastwerte & Barrierefreiheit

## 🛠️ API Integration

### Login API
```
POST https://<host_name>/api/logins
Content-Type: application/json

Body:
{
  "login": {
    "username": "user",
    "password": "pass"
  }
}
```

### Erwartete Antwort
```json
{
  "token": "session-token",
  "session": "...",
  "redirect_url": "https://tkh.iw-erp.de/#/home"
}
```

## 🎓 Verwendungsbeispiel

```javascript
// Manuelle Login Speicherung
const login = {
  host_name: "example.com",
  username: "admin",
  password: "secure_password"
};
state.logins.push(login);
saveToStorage();

// Login ausführen
await performLogin("example.com", "admin", "secure_password");
```

## 📊 LocalStorage Keys

```javascript
// Gespeicherte Logins
localStorage.getItem('easyLogin_logins')

// Eigene Peer ID
localStorage.getItem('easyLogin_peerId')

// Externe Konfigurationen
localStorage.getItem('flutter.host_name_mit_unterstrichen')

// Sessions
localStorage.getItem('flutter.hostname_iw-session')
```

## 🌐 Browser Support

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 15+ (iOS)
- ✅ Samsung Internet 14+
- ⚠️ Benötigt HTTPS (außer localhost)
- ⚠️ Benötigt Kamerazugriff

## 🔄 Update & Versionierung

Service Worker kümmert sich um automatische Updates:
- Cache Version: `easylogin-v1`
- Automatische Aktualisierung bei neuem Deploy
- Alte Caches werden gelöscht

## 📝 Lizenz

Proprietär - Inwendo

## 📧 Support

Bei Fragen oder Problemen: support@inwendo.de
