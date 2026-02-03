(function () {
    'use strict';

    // Original console methods speichern
    const originalConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info,
        debug: console.debug,
        clear: console.clear,
        dir: console.dir,
        dirxml: console.dirxml,
        table: console.table,
        trace: console.trace,
        group: console.group,
        groupCollapsed: console.groupCollapsed,
        groupEnd: console.groupEnd,
        time: console.time,
        timeEnd: console.timeEnd,
        timeLog: console.timeLog,
        count: console.count,
        countReset: console.countReset,
        assert: console.assert,
        profile: console.profile,
        profileEnd: console.profileEnd,
        timeStamp: console.timeStamp
    };

    // Konsole Status
    let consoleState = {
        isVisible: false,
        position: { x: 20, y: 20 },
        size: { width: 600, height: 400 },
        history: [],
        historyIndex: -1,
        lastMessage: null,
        isMobile: false,
        originalTitle: document.title,
        messageCache: new Map(),
        lastOutputLine: null,
        logBuffer: [],
        maxBufferSize: 1000
    };

    // CSS Styles
    const styles = `
        .dev-console {
            position: fixed;
            z-index: 10000;
            background: #1e1e1e;
            border-radius: 8px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            overflow: hidden;
            transition: all 0.3s ease;
            border: 1px solid #333;
            resize: both;
            min-width: 300px;
            min-height: 200px;
            max-width: 90vw;
            max-height: 90vh;
            display: none;
            touch-action: none;
        }

        .dev-console.visible {
            display: block;
        }

        .dev-console-header {
            background: #252526;
            color: #fff;
            padding: 12px 16px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #333;
            user-select: none;
            touch-action: none;
        }

        .dev-console-title {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 16px;
            font-weight: 500;
        }

        .dev-console-icon {
            width: 12px;
            height: 12px;
            background: #007acc;
            border-radius: 50%;
        }

        .dev-console-controls {
            display: flex;
            gap: 10px;
        }

        .dev-console-btn {
            background: #3c3c3c;
            border: none;
            color: #fff;
            width: 32px;
            height: 32px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            transition: all 0.2s;
            -webkit-tap-highlight-color: transparent;
        }

        .dev-console-btn:hover,
        .dev-console-btn:active {
            background: #4c4c4c;
            transform: scale(1.05);
        }

        .dev-console-btn.close:after {
            content: "×";
            line-height: 1;
        }

        .dev-console-body {
            height: calc(100% - 49px);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .dev-console-output {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            background: #1e1e1e;
            color: #d4d4d4;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 14px;
            -webkit-overflow-scrolling: touch;
        }

        .dev-console-input-container {
            display: flex;
            border-top: 1px solid #333;
            background: #252526;
            align-items: center;
            min-height: 44px;
        }

        .dev-console-prompt {
            color: #007acc;
            padding: 0 12px;
            user-select: none;
            font-weight: bold;
            font-size: 16px;
        }

        .dev-console-input {
            flex: 1;
            background: transparent;
            border: none;
            color: #fff;
            padding: 12px;
            font-family: inherit;
            font-size: 14px;
            outline: none;
            font-size: 16px;
            min-height: 44px;
        }

        .dev-console-input:focus {
            outline: none;
        }

        .dev-console-log {
            margin: 4px 0;
            padding: 6px 8px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.05);
            line-height: 1.4;
            animation: highlight 0.5s ease;
            position: relative;
        }

        @keyframes highlight {
            0% { background-color: rgba(255, 255, 255, 0.1); }
            100% { background-color: rgba(255, 255, 255, 0.05); }
        }

        .dev-console-log.log { color: #d4d4d4; }
        .dev-console-log.error { 
            color: #f44747;
            background: rgba(244, 71, 71, 0.1);
        }
        .dev-console-log.warn { 
            color: #ffcc00;
            background: rgba(255, 204, 0, 0.1);
        }
        .dev-console-log.info { 
            color: #007acc;
            background: rgba(0, 122, 204, 0.1);
        }
        .dev-console-log.debug { 
            color: #888;
            background: rgba(136, 136, 136, 0.1);
        }

        .dev-console-log.command { 
            color: #4ec9b0;
            background: rgba(78, 201, 176, 0.1);
        }

        .dev-console-log.result { 
            color: #d7ba7d;
            background: rgba(215, 186, 125, 0.1);
        }

        .dev-console-log.dir { 
            color: #9cdcfe;
            font-style: italic;
        }

        .dev-console-log.table {
            background: rgba(30, 30, 30, 0.95);
            overflow-x: auto;
        }

        .dev-console-table {
            border-collapse: collapse;
            width: 100%;
            margin: 5px 0;
            font-family: monospace;
        }

        .dev-console-table th {
            background: #252526;
            color: #d4d4d4;
            padding: 6px 10px;
            text-align: left;
            border: 1px solid #333;
            font-weight: bold;
        }

        .dev-console-table td {
            padding: 4px 8px;
            border: 1px solid #333;
            color: #d4d4d4;
        }

        .dev-console-table tr:nth-child(even) {
            background: rgba(255, 255, 255, 0.03);
        }

        .dev-console-table tr:hover {
            background: rgba(255, 255, 255, 0.08);
        }

        .dev-console-group {
            margin-left: 15px;
            border-left: 2px solid #007acc;
            padding-left: 10px;
        }

        .dev-console-group-label {
            color: #007acc;
            font-weight: bold;
            cursor: pointer;
            user-select: none;
            padding: 4px 0;
            margin: 4px 0;
        }

        .dev-console-group-label:hover {
            background: rgba(0, 122, 204, 0.1);
        }

        .dev-console-group-label:before {
            content: "▼ ";
            font-size: 10px;
            margin-right: 5px;
        }

        .dev-console-group-label.collapsed:before {
            content: "▶ ";
        }

        .dev-console-group-content {
            overflow: hidden;
        }

        .dev-console-group-content.collapsed {
            display: none;
        }

        .dev-console-log-count {
            background: #007acc;
            color: white;
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 10px;
            margin-left: 8px;
            display: inline-block;
            vertical-align: middle;
            min-width: 20px;
            text-align: center;
            font-weight: bold;
        }

        .dev-console-resize-handle {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 20px;
            height: 20px;
            cursor: nwse-resize;
            background: linear-gradient(135deg, transparent 50%, #007acc 50%);
            border-bottom-right-radius: 8px;
            opacity: 0.5;
            transition: opacity 0.2s;
        }

        .dev-console-resize-handle:hover {
            opacity: 1;
        }

        /* Mobile Konsole */
        .mobile-console-toggle {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 56px;
            height: 56px;
            background: #007acc;
            border-radius: 50%;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(0, 122, 204, 0.3);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            transition: all 0.3s ease;
            -webkit-tap-highlight-color: transparent;
            user-select: none;
        }

        .mobile-console-toggle:active {
            transform: scale(0.95);
            box-shadow: 0 2px 10px rgba(0, 122, 204, 0.4);
        }

        .mobile-console-toggle span {
            font-size: 28px;
            line-height: 1;
        }

        /* Mobile Optimierungen */
        @media (max-width: 768px) {
            .dev-console {
                width: calc(100vw - 20px) !important;
                height: 70vh !important;
                left: 10px !important;
                top: 10px !important;
                resize: none;
                max-width: calc(100vw - 20px);
                max-height: calc(100vh - 80px);
                border-radius: 12px;
            }
            
            .dev-console-header {
                padding: 16px;
                touch-action: none;
            }
            
            .dev-console-btn {
                width: 44px;
                height: 44px;
                font-size: 24px;
            }
            
            .dev-console-resize-handle {
                width: 30px;
                height: 30px;
            }
            
            .dev-console-output {
                padding: 16px;
                font-size: 15px;
            }
            
            .dev-console-input {
                font-size: 16px;
                min-height: 48px;
                padding: 14px;
            }
            
            .dev-console-prompt {
                font-size: 18px;
                padding: 0 14px;
            }
            
            .mobile-console-toggle {
                display: flex;
            }
            
            .dev-console-log {
                padding: 8px 10px;
                margin: 6px 0;
                font-size: 15px;
            }
            
            .dev-console-log-count {
                font-size: 12px;
                padding: 3px 9px;
            }
        }

        /* Tablet */
        @media (min-width: 769px) and (max-width: 1024px) {
            .dev-console {
                max-width: 85vw;
                max-height: 80vh;
            }
        }

        /* Scrollbar Styling */
        .dev-console-output::-webkit-scrollbar {
            width: 12px;
        }

        .dev-console-output::-webkit-scrollbar-track {
            background: #252526;
            border-radius: 6px;
        }

        .dev-console-output::-webkit-scrollbar-thumb {
            background: #555;
            border-radius: 6px;
            border: 3px solid #252526;
        }

        .dev-console-output::-webkit-scrollbar-thumb:hover {
            background: #777;
        }
    `;

    // HTML Template
    const consoleHTML = `
        <div class="dev-console-header">
            <div class="dev-console-title">
                <div class="dev-console-icon"></div>
                <span>Dev Console</span>
            </div>
            <div class="dev-console-controls">
                <button class="dev-console-btn close" title="Schließen" aria-label="Konsole schließen"></button>
            </div>
        </div>
        <div class="dev-console-body">
            <div class="dev-console-output"></div>
            <div class="dev-console-input-container">
                <div class="dev-console-prompt">></div>
                <input type="text" class="dev-console-input" placeholder="Befehl eingeben..." aria-label="Konsolenbefehl">
            </div>
        </div>
        <div class="dev-console-resize-handle" aria-label="Größe ändern"></div>
    `;

    // Globale Variablen
    let consoleElement = null;
    let outputElement = null;
    let inputElement = null;
    let mobileToggleBtn = null;
    let isDragging = false;
    let isResizing = false;
    let dragOffset = { x: 0, y: 0 };
    let resizeStart = { x: 0, y: 0, width: 0, height: 0 };
    let groupStack = [];
    let currentGroup = null;

    // LocalStorage laden
    function loadState() {
        try {
            const saved = localStorage.getItem('dev_console_state');
            if (saved) {
                const parsed = JSON.parse(saved);
                consoleState = { ...consoleState, ...parsed };
            }
        } catch (e) {
            console.error('Fehler beim Laden des Console-States:', e);
        }
    }

    // LocalStorage speichern
    function saveState() {
        try {
            localStorage.setItem('dev_console_state', JSON.stringify({
                isVisible: consoleState.isVisible,
                position: consoleState.position,
                size: consoleState.size
            }));
        } catch (e) {
            console.error('Fehler beim Speichern des Console-States:', e);
        }
    }

    // Erstelle Mobile Toggle Button
    function createMobileToggle() {
        mobileToggleBtn = document.createElement('button');
        mobileToggleBtn.className = 'mobile-console-toggle';
        mobileToggleBtn.setAttribute('aria-label', 'Konsole öffnen');
        mobileToggleBtn.innerHTML = '<span>⌨️</span>';
        mobileToggleBtn.addEventListener('click', toggleConsole);
        document.body.appendChild(mobileToggleBtn);
    }

    // Prüfe ob Mobilgerät
    function checkIfMobile() {
        consoleState.isMobile = window.innerWidth <= 768 ||
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0;
        return consoleState.isMobile;
    }

    // Konsole erstellen
    function createConsole() {
        // Stylesheet hinzufügen
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);

        // Mobile Toggle Button erstellen
        createMobileToggle();

        // Console Element erstellen
        consoleElement = document.createElement('div');
        consoleElement.className = 'dev-console';
        consoleElement.innerHTML = consoleHTML;
        document.body.appendChild(consoleElement);

        // Referenzen zu Elementen
        outputElement = consoleElement.querySelector('.dev-console-output');
        inputElement = consoleElement.querySelector('.dev-console-input');
        const header = consoleElement.querySelector('.dev-console-header');
        const closeBtn = consoleElement.querySelector('.close');
        const resizeHandle = consoleElement.querySelector('.dev-console-resize-handle');

        // Mobile Check
        checkIfMobile();

        // Position und Größe setzen
        applyState();

        // Event Listener für Desktop
        header.addEventListener('mousedown', startDrag);
        resizeHandle.addEventListener('mousedown', startResize);

        // Event Listener für Touch (Mobile)
        header.addEventListener('touchstart', startDragTouch, { passive: false });
        resizeHandle.addEventListener('touchstart', startResizeTouch, { passive: false });

        // Buttons
        closeBtn.addEventListener('click', hideConsole);
        inputElement.addEventListener('keydown', handleInputKey);
        inputElement.addEventListener('keyup', handleInputKeyUp);

        // Globale Event Listener für Drag/Resize
        document.addEventListener('mousemove', handleDragResizeMove);
        document.addEventListener('mouseup', stopDragResize);
        document.addEventListener('touchmove', handleDragResizeMoveTouch, { passive: false });
        document.addEventListener('touchend', stopDragResize);

        // Tastatur-Shortcuts
        document.addEventListener('keydown', handleGlobalKeydown);

        // Fenster Resize Event
        window.addEventListener('resize', handleWindowResize);

        // Original console methods überschreiben
        overrideConsoleMethods();

        // Vorherige Console-Logs erfassen (wenn möglich)
        capturePreviousLogs();

        // Willkommensnachricht
        logToConsole('info', 'Dev Console initialisiert. Verwende F2 oder den Mobile-Button.');
        logToConsole('info', 'Befehle: clear, cls');
    }

    // Vorherige Console-Logs erfassen
    function capturePreviousLogs() {
        // Puffer für frühere Logs (falls verfügbar)
        if (window.consoleBuffer && Array.isArray(window.consoleBuffer)) {
            window.consoleBuffer.forEach(log => {
                logToConsole(log.type, log.message, false, log.data);
            });
        }
    }

    // Zustand anwenden
    function applyState() {
        if (!consoleElement) return;

        if (consoleState.isVisible) {
            consoleElement.classList.add('visible');
        } else {
            consoleElement.classList.remove('visible');
        }

        // Auf Mobilgeräten zentrieren
        if (consoleState.isMobile) {
            consoleElement.style.left = '10px';
            consoleElement.style.top = '10px';
            consoleElement.style.width = `calc(100vw - 20px)`;
            consoleElement.style.height = `70vh`;
        } else {
            consoleElement.style.left = `${consoleState.position.x}px`;
            consoleElement.style.top = `${consoleState.position.y}px`;
            consoleElement.style.width = `${consoleState.size.width}px`;
            consoleElement.style.height = `${consoleState.size.height}px`;
        }
    }

    // Drag & Drop Funktionen
    function startDrag(e) {
        if (consoleState.isMobile) return;
        e.preventDefault();
        isDragging = true;
        const rect = consoleElement.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        consoleElement.style.cursor = 'grabbing';
    }

    function startDragTouch(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            isDragging = true;
            const rect = consoleElement.getBoundingClientRect();
            dragOffset.x = e.touches[0].clientX - rect.left;
            dragOffset.y = e.touches[0].clientY - rect.top;
            consoleElement.style.cursor = 'grabbing';
        }
    }

    function handleDragResizeMove(e) {
        if (isDragging) handleDragMove(e);
        if (isResizing) handleResizeMove(e);
    }

    function handleDragResizeMoveTouch(e) {
        if (isDragging || isResizing) {
            e.preventDefault();
            if (isDragging) handleDragMove(e);
            if (isResizing) handleResizeMove(e);
        }
    }

    function handleDragMove(e) {
        if (!isDragging) return;

        let x, y;
        if (e.type === 'touchmove') {
            x = e.touches[0].clientX - dragOffset.x;
            y = e.touches[0].clientY - dragOffset.y;
        } else {
            x = e.clientX - dragOffset.x;
            y = e.clientY - dragOffset.y;
        }

        // Innerhalb des Viewports halten
        const maxX = window.innerWidth - consoleElement.offsetWidth;
        const maxY = window.innerHeight - consoleElement.offsetHeight;

        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));

        consoleState.position = { x, y };
        consoleElement.style.left = `${x}px`;
        consoleElement.style.top = `${y}px`;
    }

    // Resize Funktionen
    function startResize(e) {
        if (consoleState.isMobile) return;
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        const rect = consoleElement.getBoundingClientRect();
        resizeStart = {
            x: e.clientX,
            y: e.clientY,
            width: rect.width,
            height: rect.height
        };
    }

    function startResizeTouch(e) {
        if (consoleState.isMobile) return;
        if (e.touches.length === 1) {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            const rect = consoleElement.getBoundingClientRect();
            resizeStart = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
                width: rect.width,
                height: rect.height
            };
        }
    }

    function handleResizeMove(e) {
        if (!isResizing || consoleState.isMobile) return;

        let clientX, clientY;
        if (e.type === 'touchmove') {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const dx = clientX - resizeStart.x;
        const dy = clientY - resizeStart.y;

        const newWidth = Math.max(300, Math.min(resizeStart.width + dx, window.innerWidth - consoleState.position.x));
        const newHeight = Math.max(200, Math.min(resizeStart.height + dy, window.innerHeight - consoleState.position.y));

        consoleState.size = {
            width: newWidth,
            height: newHeight
        };

        consoleElement.style.width = `${newWidth}px`;
        consoleElement.style.height = `${newHeight}px`;
    }

    function stopDragResize() {
        if (isDragging || isResizing) {
            isDragging = false;
            isResizing = false;
            consoleElement.style.cursor = '';
            if (!consoleState.isMobile) {
                saveState();
            }
        }
    }

    // Konsole ausblenden
    function hideConsole() {
        consoleState.isVisible = false;
        if (consoleElement) {
            consoleElement.classList.remove('visible');
        }
        // Titel zurücksetzen
        document.title = consoleState.originalTitle;
        saveState();
    }

    // Konsole einblenden
    function showConsole() {
        consoleState.isVisible = true;
        if (consoleElement) {
            consoleElement.classList.add('visible');
            // Titel setzen
            if (!document.title.startsWith('(DEV) ')) {
                consoleState.originalTitle = document.title;
                document.title = '(DEV) ' + consoleState.originalTitle;
            }
            // Auf Mobilgeräten nach oben scrollen
            if (consoleState.isMobile) {
                window.scrollTo(0, 0);
            }
            setTimeout(() => inputElement.focus(), 100);
        }
        saveState();
    }

    // Toggle Konsole
    function toggleConsole() {
        checkIfMobile();
        if (consoleState.isVisible) {
            hideConsole();
        } else {
            showConsole();
        }
    }

    // Fenster Resize Handler
    function handleWindowResize() {
        checkIfMobile();
        if (consoleState.isMobile && consoleState.isVisible) {
            // Auf Mobilgeräten immer volle Breite
            applyState();
        }
        // Titel aktualisieren, falls nötig
        if (consoleState.isVisible && !document.title.startsWith('(DEV) ')) {
            consoleState.originalTitle = document.title;
            document.title = '(DEV) ' + consoleState.originalTitle;
        }
    }

    // Konsoleneingabe verarbeiten
    function handleInputKey(e) {
        // Enter zum Ausführen
        if (e.key === 'Enter' && inputElement.value.trim()) {
            const command = inputElement.value.trim();

            // Zur History hinzufügen
            consoleState.history.unshift(command);
            if (consoleState.history.length > 50) {
                consoleState.history.pop();
            }
            consoleState.historyIndex = -1;

            // Befehl anzeigen
            logToConsole('command', `> ${command}`);

            // Special commands
            if (command === 'clear' || command === 'cls') {
                clearConsole();
                inputElement.value = '';
                return;
            }

            try {
                // Befehl ausführen
                const result = eval.call(window, command);

                // Ergebnis anzeigen (wenn nicht undefined)
                if (result !== undefined) {
                    logToConsole('result', String(result));
                }

            } catch (err) {
                logToConsole('error', err.toString());
            }

            inputElement.value = '';
            scrollToBottom();
        }

        // Pfeiltasten für History
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (consoleState.historyIndex < consoleState.history.length - 1) {
                consoleState.historyIndex++;
                inputElement.value = consoleState.history[consoleState.historyIndex];
            } else if (consoleState.history.length > 0 && consoleState.historyIndex === -1) {
                consoleState.historyIndex = 0;
                inputElement.value = consoleState.history[0];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (consoleState.historyIndex > 0) {
                consoleState.historyIndex--;
                inputElement.value = consoleState.history[consoleState.historyIndex];
            } else {
                consoleState.historyIndex = -1;
                inputElement.value = '';
            }
        }

        // Tab für Autovervollständigung
        if (e.key === 'Tab') {
            e.preventDefault();
            // Einfache Autovervollständigung für häufig genutzte Befehle
            const current = inputElement.value;
            const commands = ['console.', 'document.', 'window.', 'clear', 'cls'];
            const matching = commands.filter(cmd => cmd.startsWith(current));
            if (matching.length === 1) {
                inputElement.value = matching[0];
            }
        }
    }

    function handleInputKeyUp(e) {
        // Autofokus behalten
        if (consoleState.isVisible) {
            inputElement.focus();
        }
    }

    // Globale Tastatur-Shortcuts
    function handleGlobalKeydown(e) {
        // F2 zum Toggle (alternativ zu F12)
        if (e.key === 'F2') {
            e.preventDefault();
            toggleConsole();
        }

        // Escape zum Verstecken
        if (e.key === 'Escape' && consoleState.isVisible) {
            hideConsole();
        }

        // STRG + L zum Leeren (wie in Terminals)
        if (e.ctrlKey && e.key === 'l') {
            e.preventDefault();
            clearConsole();
        }
    }

    // Formatierung von Werten
    function formatValue(value) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value === 'string') return value;
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value, null, 2);
            } catch (e) {
                return String(value);
            }
        }
        return String(value);
    }

    // Console Methods überschreiben
    function overrideConsoleMethods() {
        // Buffer für frühere Logs
        if (!window.consoleBuffer) {
            window.consoleBuffer = [];
        }

        // Helper-Funktion für alle Console-Methoden
        const createInterceptor = (type, original) => {
            return function (...args) {
                // Formatieren der Nachricht
                const message = args.map(arg => formatValue(arg)).join(' ');

                // In unserer Konsole anzeigen
                logToConsole(type, message, false, args.length > 1 ? args : args[0]);

                // In Original-Konsole ausgeben
                original.apply(console, args);

                // Für später speichern
                window.consoleBuffer.push({
                    type,
                    message,
                    data: args.length > 1 ? args : args[0],
                    timestamp: Date.now()
                });

                // Buffer größe beschränken
                if (window.consoleBuffer.length > consoleState.maxBufferSize) {
                    window.consoleBuffer.shift();
                }
            };
        };

        // Special interceptor for console.table
        console.table = function (data, columns) {
            // In unserer Konsole anzeigen
            displayTable(data, columns);

            // In Original-Konsole ausgeben
            originalConsole.table.apply(console, arguments);

            // Für später speichern
            window.consoleBuffer.push({
                type: 'table',
                message: 'Table output',
                data: data,
                timestamp: Date.now()
            });
        };

        // Special interceptor for console.dir
        console.dir = function (obj) {
            const message = formatValue(obj);

            // In unserer Konsole anzeigen
            logToConsole('dir', message, false, obj);

            // In Original-Konsole ausgeben
            originalConsole.dir.apply(console, arguments);

            // Für später speichern
            window.consoleBuffer.push({
                type: 'dir',
                message: message,
                data: obj,
                timestamp: Date.now()
            });
        };

        // Special interceptor for console.group
        console.group = function (...args) {
            const label = args.map(arg => formatValue(arg)).join(' ') || 'Group';
            startGroup(label, false);
            originalConsole.group.apply(console, arguments);
        };

        console.groupCollapsed = function (...args) {
            const label = args.map(arg => formatValue(arg)).join(' ') || 'Group';
            startGroup(label, true);
            originalConsole.groupCollapsed.apply(console, arguments);
        };

        console.groupEnd = function () {
            endGroup();
            originalConsole.groupEnd.apply(console, arguments);
        };

        // Alle anderen Methoden überschreiben
        console.log = createInterceptor('log', originalConsole.log);
        console.error = createInterceptor('error', originalConsole.error);
        console.warn = createInterceptor('warn', originalConsole.warn);
        console.info = createInterceptor('info', originalConsole.info);
        console.debug = createInterceptor('debug', originalConsole.debug);

        // Clear
        console.clear = function () {
            clearConsole();
            originalConsole.clear();
            window.consoleBuffer = [];
        };
    }

    // Tabelle anzeigen
    function displayTable(data, columns) {
        if (!outputElement) return;

        const timestamp = new Date().toLocaleTimeString();
        const logElement = document.createElement('div');
        logElement.className = 'dev-console-log table';

        const header = document.createElement('div');
        header.textContent = `[${timestamp}] Table:`;
        logElement.appendChild(header);

        if (data && typeof data === 'object') {
            const table = document.createElement('table');
            table.className = 'dev-console-table';

            const thead = document.createElement('thead');
            const tbody = document.createElement('tbody');

            let headers = [];

            if (Array.isArray(data)) {
                // Für Arrays
                if (data.length > 0 && typeof data[0] === 'object') {
                    headers = columns || Object.keys(data[0]);
                } else {
                    headers = ['(index)', 'Value'];
                }

                // Header
                const headerRow = document.createElement('tr');
                headers.forEach(headerText => {
                    const th = document.createElement('th');
                    th.textContent = String(headerText);
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);

                // Daten
                data.forEach((item, index) => {
                    const row = document.createElement('tr');

                    if (typeof item === 'object' && item !== null) {
                        headers.forEach(header => {
                            const td = document.createElement('td');
                            td.textContent = formatValue(item[header]);
                            row.appendChild(td);
                        });
                    } else {
                        const tdIndex = document.createElement('td');
                        tdIndex.textContent = String(index);
                        row.appendChild(tdIndex);

                        const tdValue = document.createElement('td');
                        tdValue.textContent = formatValue(item);
                        row.appendChild(tdValue);
                    }

                    tbody.appendChild(row);
                });
            } else {
                // Für Objekte
                headers = ['Key', 'Value'];

                const headerRow = document.createElement('tr');
                headers.forEach(headerText => {
                    const th = document.createElement('th');
                    th.textContent = headerText;
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);

                // Daten
                Object.keys(data).forEach(key => {
                    const row = document.createElement('tr');

                    const tdKey = document.createElement('td');
                    tdKey.textContent = key;
                    row.appendChild(tdKey);

                    const tdValue = document.createElement('td');
                    tdValue.textContent = formatValue(data[key]);
                    row.appendChild(tdValue);

                    tbody.appendChild(row);
                });
            }

            table.appendChild(thead);
            table.appendChild(tbody);
            logElement.appendChild(table);
        } else {
            const errorMsg = document.createElement('div');
            errorMsg.textContent = 'Invalid data for table';
            errorMsg.style.color = '#f44747';
            logElement.appendChild(errorMsg);
        }

        // In die aktuelle Gruppe oder direkt zum Output hinzufügen
        if (currentGroup) {
            currentGroup.content.appendChild(logElement);
        } else {
            outputElement.appendChild(logElement);
        }

        scrollToBottom();
    }

    // Gruppe starten
    function startGroup(label, collapsed) {
        if (!outputElement) return;

        const groupElement = document.createElement('div');
        groupElement.className = 'dev-console-group';

        const labelElement = document.createElement('div');
        labelElement.className = 'dev-console-group-label';
        if (collapsed) labelElement.classList.add('collapsed');
        labelElement.textContent = label;

        const contentElement = document.createElement('div');
        contentElement.className = 'dev-console-group-content';
        if (collapsed) contentElement.classList.add('collapsed');

        labelElement.addEventListener('click', () => {
            contentElement.classList.toggle('collapsed');
            labelElement.classList.toggle('collapsed');
        });

        groupElement.appendChild(labelElement);
        groupElement.appendChild(contentElement);

        // Zur Gruppe hinzufügen
        groupStack.push(currentGroup);
        currentGroup = {
            element: groupElement,
            content: contentElement
        };

        // In die übergeordnete Gruppe oder direkt zum Output hinzufügen
        if (groupStack.length > 0 && groupStack[groupStack.length - 1]) {
            groupStack[groupStack.length - 1].content.appendChild(groupElement);
        } else {
            outputElement.appendChild(groupElement);
        }
    }

    // Gruppe beenden
    function endGroup() {
        if (groupStack.length > 0) {
            currentGroup = groupStack.pop();
        } else {
            currentGroup = null;
        }
    }

    // Nachricht in der Konsole anzeigen (mit verbesserter Duplikat-Erkennung)
    function logToConsole(type, message, isFromCache = false, rawData = null) {
        if (!outputElement) return;

        const timestamp = new Date().toLocaleTimeString();
        const messageKey = `${type}:${message}`;

        // Prüfe, ob es sich um eine Wiederholung der letzten Ausgabe handelt
        const isRepeating = consoleState.lastOutputLine &&
            consoleState.lastOutputLine.type === type &&
            consoleState.lastOutputLine.message === message;

        if (isRepeating) {
            // Erhöhe Zähler im Cache
            const count = (consoleState.messageCache.get(messageKey) || 1) + 1;
            consoleState.messageCache.set(messageKey, count);

            // Finde das letzte Element und aktualisiere es
            const lastChild = outputElement.lastChild;
            if (lastChild && lastChild.classList.contains(type)) {
                // Entferne alten Zähler, falls vorhanden
                const oldCounter = lastChild.querySelector('.dev-console-log-count');
                if (oldCounter) {
                    oldCounter.remove();
                }

                // Füge neuen Zähler hinzu
                const counterSpan = document.createElement('span');
                counterSpan.className = 'dev-console-log-count';
                counterSpan.textContent = count;
                lastChild.appendChild(counterSpan);

                // Aktualisiere Zeitstempel
                const textNode = lastChild.childNodes[0];
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    textNode.textContent = `[${timestamp}] ${message} `;
                }
            }
        } else {
            // Neue Nachricht
            consoleState.lastOutputLine = { type, message };

            // Cache zurücksetzen für diese Kombination
            consoleState.messageCache.set(messageKey, 1);

            const logElement = document.createElement('div');
            logElement.className = `dev-console-log ${type}`;

            const textNode = document.createTextNode(`[${timestamp}] ${message}`);
            logElement.appendChild(textNode);

            // In die aktuelle Gruppe oder direkt zum Output hinzufügen
            if (currentGroup) {
                currentGroup.content.appendChild(logElement);
            } else {
                outputElement.appendChild(logElement);
            }

            scrollToBottom();
        }
    }

    // Konsole leeren
    function clearConsole() {
        if (outputElement) {
            outputElement.innerHTML = '';
            consoleState.lastOutputLine = null;
            consoleState.messageCache.clear();
            groupStack = [];
            currentGroup = null;
        }
        logToConsole('info', 'Konsole geleert.');
    }

    // Zum Ende scrollen
    function scrollToBottom() {
        if (outputElement) {
            outputElement.scrollTop = outputElement.scrollHeight;
        }
    }

    // Initialisierung
    function init() {
        // State laden
        loadState();

        // Warte, bis DOM bereit ist
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createConsole);
        } else {
            createConsole();
        }
    }

    // Initialisierung starten
    init();

    // Globale Funktionen für manuelle Steuerung
    window.devConsole = {
        show: showConsole,
        hide: hideConsole,
        toggle: toggleConsole,
        clear: clearConsole,
        log: function (...args) {
            const message = args.map(arg => formatValue(arg)).join(' ');
            logToConsole('log', message);
            originalConsole.log.apply(console, args);
        },
        execute: function (command) {
            if (inputElement) {
                inputElement.value = command;
                const event = new KeyboardEvent('keydown', { key: 'Enter' });
                inputElement.dispatchEvent(event);
            }
        },
        getLogs: function () {
            return window.consoleBuffer || [];
        }
    };

})();