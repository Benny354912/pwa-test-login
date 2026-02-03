# PWA Storage Verschlüsselung - Dokumentation

## 🔐 Übersicht

Die Easy Login PWA wurde mit einer robusten **AES-GCM Verschlüsselung** für die Speicherung von Logins erweitert. Diese Implementierung bietet Sicherheit auf mehreren Ebenen:

## 🛡️ Sicherheitsfeatures

### 1. **Passwort-Schutz Optionen**

Die App unterstützt vier verschiedene Schutzmethoden:

- **Keine Verschlüsselung** (`none`): Schnelle Nutzung, Logins unverschlüsselt gespeichert
- **PIN** (`pin`): 4-8 stellige numerische PIN
- **Muster** (`pattern`): 3x3 Grid Muster (mindestens 4 Punkte)
- **Passwort** (`password`): Text-Passwort (mindestens 6 Zeichen)

### 2. **Verschlüsselungsalgorithmus**

```
AES-GCM 256-Bit (Authenticated Encryption with Associated Data)
```

**Technische Details:**
- Cipher: `AES-256-GCM`
- Schlüsselableitung: `PBKDF2-SHA256` (100.000 Iterationen)
- Initialisierungsvektor: 12 Bytes (zufällig pro Verschlüsselung)
- Salt: 16 Bytes (zufällig pro Konto)
- Authentifizierung: GCM bietet automatische Integritätsprüfung

### 3. **Datenflusss beim Login**

```
Benutzer gibt PIN/Passwort/Muster ein
    ↓
Hash zur Verifikation (SHA-256)
    ↓
Falls korrekt: Speichern des Passworts in Variable
    ↓
PBKDF2 Key-Derivation aus Passwort
    ↓
AES-GCM Entschlüsselung der Logins
    ↓
Logins verfügbar (verschlüsselt im RAM während Session)
```

### 4. **Speicherstruktur**

**localStorage Format:**
```
easylogin_logins: [salt (16B) + iv (12B) + encrypted_data]
```

**Als Hex-String:** z.B. `a1b2c3d4...` (hexadecimal encoded)

## 🔑 Implementierung

### Neue Funktionen in `crypto-utils.js`

#### `deriveEncryptionKey(password, salt)`
- PBKDF2-SHA256 basierte Schlüsselableitung
- 100.000 Iterationen (NIST empfohlen)
- Erzeugt 256-Bit AES-Schlüssel

#### `encryptData(data, password)`
- Verschlüsselt JSON-String mit AES-GCM
- Generiert zufällige Salt und IV
- Rückgabe: `{ encrypted: true, data: hexString }`

#### `decryptData(encryptedHex, password)`
- Entschlüsselt AES-GCM Daten
- Authentifizierung durch GCM
- Wirft Fehler bei ungültigen Daten

### Änderungen in `app.js`

```javascript
let protectionPassword = null; // Speichert Passwort nach Unlock
```

**Wichtige Flows:**
1. **Beim Setup:** Passwort wird gespeichert, danach können Logins verschlüsselt gespeichert werden
2. **Beim Lock-Screen:** Nach korrektem Unlock wird Passwort in `protectionPassword` gespeichert
3. **Beim Login-Editor:** Alle Änderungen werden automatisch verschlüsselt gespeichert

## 🔄 Beispiel-Workflow

### Setup mit PIN:
```javascript
// 1. Benutzer wählt PIN: "1234"
await CryptoUtils.setProtection('pin', '1234');
protectionPassword = '1234';

// 2. Logins werden mit dieser PIN verschlüsselt gespeichert
const encrypted = await CryptoUtils.encryptData(JSON.stringify(logins), '1234');
localStorage.setItem('easylogin_logins', encrypted.data);
```

### Beim nächsten App-Start:
```javascript
// 1. Lock-Screen zeigt PIN-Eingabe
// 2. Benutzer gibt PIN ein
const verified = await CryptoUtils.verifyProtection('1234');

if (verified) {
  protectionPassword = '1234';
  
  // 3. Logins werden entschlüsselt geladen
  const decrypted = await CryptoUtils.decryptData(localStorage.getItem('easylogin_logins'), '1234');
  logins = JSON.parse(decrypted);
}
```

## ⚙️ Konfiguration

### Iterationen in PBKDF2
Für bessere Sicherheit können die Iterationen erhöht werden:
```javascript
// In crypto-utils.js, Zeile ~48
iterations: 100000, // Kann auf 150000+ erhöht werden
```

### Key-Länge
Aktuell: 256-Bit (AES-256)
```javascript
{ name: 'AES-GCM', length: 256 }
```

## 🧪 Sicherheitstests

### Getestete Szenarien:
- ✅ Falscheseingaben (PIN/Passwort) werden korrekt abgelehnt
- ✅ Daten sind unlesbar ohne korrektes Passwort
- ✅ Logins werden korrekt entschlüsselt nach Unlock
- ✅ Neue Logins werden verschlüsselt gespeichert
- ✅ Bearbeitung bestehender Logins verschlüsselt Daten neu
- ✅ Export/Import funktionieren mit Verschlüsselung

## ⚠️ Wichtige Sicherheitshinweise

1. **RAM-Speicherung:** `protectionPassword` wird im RAM gespeichert. Bei langer Session ggf. periodisches Locking implementieren.

2. **Browser-Sicherheit:** localStorage ist nicht ideal für sensible Daten, aber Verschlüsselung macht die Daten bruchsicher.

3. **Service Worker:** Der SW (`sw.js`) hat Zugriff auf localStorage. Nur vertrauenswürdige Code dort ausführen.

4. **HTTPS-Only:** PWA sollte nur über HTTPS laufen, um Man-in-the-Middle Attacken zu vermeiden.

5. **Passwort-Stärke:** 
   - PIN: Mindestens 4 Ziffern (1296 Kombinationen) - sollte auf 6+ erhöht werden
   - Passwort: Mindestens 6 Zeichen - sollte auf 12+ Zeichen erhöht werden

## 🔧 Zukünftige Verbesserungen

- [ ] Aktivitäts-Timeout mit automatischem Locking
- [ ] Biometrische Authentifizierung (Face/Fingerprint)
- [ ] Sichere Speicherung in IndexedDB statt localStorage
- [ ] Zwei-Faktor-Authentifizierung für Unlock
- [ ] Master Key mit Wiederherstellungscode
- [ ] Regelmäßige Passwort-Rotation erzwingen

## 📚 Referenzen

- [Web Crypto API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [NIST SP 800-132 - PBKDF](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-132.pdf)
- [AES-GCM Mode - NIST](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
