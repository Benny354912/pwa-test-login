#!/bin/bash
# Quick Start für PWA Storage Verschlüsselung

## Installation & Test

### 1. Dependencies prüfen
# Die App nutzt nur Web Crypto API (built-in, kein npm nötig)

### 2. Lokal testen
# In VS Code:
# 1. Live Server Extension installieren (falls nicht vorhanden)
# 2. pwa/index.html mit Right-Click → "Open with Live Server"
# 3. App öffnet sich unter http://127.0.0.1:5500/pwa/

### 3. Verschlüsselung testen

# Test 1: PIN-Setup testen
echo "Test 1: PIN-Setup"
echo "1. Öffne App"
echo "2. Wähle 'PIN' (📌)"
echo "3. Gib PIN ein: 1234"
echo "4. Login hinzufügen: Name='GitHub', User='dev@example.com', Pass='secret'"
echo "5. F12 → Application → localStorage"
echo "6. easylogin_logins sollte hexadecimal verschlüsselt sein"
echo ""

# Test 2: Unlock testen
echo "Test 2: Unlock mit PIN"
echo "1. Seite neu laden"
echo "2. PIN-Screen sollte angezeigt werden"
echo "3. Falsche PIN eingeben: 5678"
echo "4. Fehlermeldung: 'PIN falsch'"
echo "5. Richtige PIN eingeben: 1234"
echo "6. Logins sollten geladen und angezeigt werden"
echo ""

# Test 3: Passwort-Setup testen
echo "Test 3: Passwort-Setup"
echo "1. localStorage leeren: localStorage.clear()"
echo "2. Seite neu laden"
echo "3. Wähle 'Passwort' (🔒)"
echo "4. Gib Passwort ein: 'SecurePass123'"
echo "5. Bestätigung: 'SecurePass123'"
echo "6. Logins hinzufügen"
echo "7. Verifizieren dass Daten verschlüsselt sind"
echo ""

# Test 4: Muster-Setup testen
echo "Test 4: Muster-Setup"
echo "1. localStorage leeren"
echo "2. Seite neu laden"
echo "3. Wähle 'Muster' (⊙)"
echo "4. Zeichne Muster mit mindestens 4 Punkten"
echo "5. Muster speichern"
echo "6. Nach Reload: Muster-Lock sollte angezeigt werden"
echo ""

# Test 5: No-Encryption Mode
echo "Test 5: Keine Verschlüsselung"
echo "1. localStorage leeren"
echo "2. Seite neu laden"
echo "3. Wähle 'Kein Schutz' (✓)"
echo "4. App sollte sofort zur Main-View gehen"
echo "5. Logins hinzufügen"
echo "6. localStorage → easylogin_logins sollte normales JSON sein"
echo ""

# Test 6: Import/Export mit Verschlüsselung
echo "Test 6: Import/Export"
echo "1. Mit PIN geschützte Logins"
echo "2. Export-Button drücken (Download JSON)"
echo "3. localStorage leeren oder neue Session"
echo "4. Setup neu mit anderen PIN: 4567"
echo "5. Import-Button → Datei auswählen"
echo "6. Logins sollten importiert werden"
echo "7. Mit neuer PIN (4567) sollte Zugriff funktionieren"
echo ""

### Sicherheit überprüfen

echo "🔐 Sicherheits-Checks:"
echo ""
echo "1. PBKDF2 Check (sollte 100.000 Iterationen sein):"
echo "   Code: crypto-utils.js, Zeile ~48, iterations: 100000"
echo ""
echo "2. AES-256-GCM Check (sollte 256-bit sein):"
echo "   Code: crypto-utils.js, Zeile ~50, length: 256"
echo ""
echo "3. Random Salt & IV:"
echo "   ✅ Salt: 16 Bytes pro Account (in setProtection)"
echo "   ✅ IV: 12 Bytes pro Encryption (in encryptData)"
echo ""
echo "4. Password Requirements:"
echo "   - PIN: 4-8 Ziffern (beachte: wird als String gehashed, nicht als Zahl)"
echo "   - Passwort: mindestens 6 Zeichen"
echo "   - Muster: mindestens 4 Punkte"
echo ""

### Debugging

echo "🐛 Debug-Tipps:"
echo ""
echo "1. Verbose Logging aktivieren:"
echo "   app.js, Zeile 5: const DEBUG = true;"
echo ""
echo "2. Encryption/Decryption debuggen:"
echo "   console.log() vor/nach CryptoUtils.encryptData()"
echo ""
echo "3. localStorage inspizieren:"
echo "   F12 → Application → localStorage → easylogin_*"
echo ""
echo "4. Performance messen:"
echo "   console.time('encryption');"
echo "   await CryptoUtils.encryptData(data, pwd);"
echo "   console.timeEnd('encryption');"
echo ""

### Browser Compatibility

echo "🌐 Browser-Kompatibilität:"
echo ""
echo "✅ Chrome 37+"
echo "✅ Firefox 34+"
echo "✅ Safari 14.1+"
echo "✅ Edge 79+"
echo ""
echo "⚠️  IE: NICHT UNTERSTÜTZT (kein Web Crypto API)"
echo ""
