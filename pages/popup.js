// EspressoMonkey Popup v2.0.12
// Tampermonkey-style popup interface

(function() {
    'use strict';

    // State
    let currentTab = null;
    let currentUrl = '';
    let pageScripts = [];
    let settings = {};
    let userScriptsAvailable = true;

    // DOM Elements
    const elements = {
        headerToggle: document.getElementById('headerToggle'),
        headerCheckIcon: document.getElementById('headerCheckIcon'),
        scriptList: document.getElementById('scriptList'),
        btnFindScripts: document.getElementById('btnFindScripts'),
        btnNewScript: document.getElementById('btnNewScript'),
        btnUtilities: document.getElementById('btnUtilities'),
        utilitiesSubmenu: document.getElementById('utilitiesSubmenu'),
        btnExportZip: document.getElementById('btnExportZip'),
        btnImport: document.getElementById('btnImport'),
        btnCheckUpdates: document.getElementById('btnCheckUpdates'),
        btnDashboard: document.getElementById('btnDashboard'),
        setupWarning: document.getElementById('setupWarning'),
        btnOpenExtSettings: document.getElementById('btnOpenExtSettings')
    };

    // Initialize
    async function init() {
        await checkUserScriptsAvailability();
        await loadSettings();
        await getCurrentTab();
        await loadPageScripts();
        setupEventListeners();
        updateEnabledState();
    }
    
    // Check if userScripts API is available and enabled
    async function checkUserScriptsAvailability() {
        try {
            if (!chrome.userScripts) {
                userScriptsAvailable = false;
                showSetupWarning();
                return;
            }
            
            // Try to use the API to see if it's enabled
            await chrome.userScripts.getScripts();
            userScriptsAvailable = true;
            hideSetupWarning();
        } catch (error) {
            // Error likely means userScripts not enabled
            console.warn('userScripts API not available:', error.message);
            userScriptsAvailable = false;
            showSetupWarning();
        }
    }
    
    function showSetupWarning() {
        if (elements.setupWarning) {
            elements.setupWarning.classList.add('visible');
        }
    }
    
    function hideSetupWarning() {
        if (elements.setupWarning) {
            elements.setupWarning.classList.remove('visible');
        }
    }

    // Load settings
    async function loadSettings() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
            settings = response?.settings || response || {};
        } catch (error) {
            console.error('Failed to load settings:', error);
            settings = { enabled: true };
        }
    }

    // Get current tab
    async function getCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            currentTab = tab;
            currentUrl = tab?.url || '';
        } catch (error) {
            console.error('Failed to get current tab:', error);
        }
    }

    // Load scripts for current page
    async function loadPageScripts() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getScriptsForUrl',
                url: currentUrl
            });

            // Filter to only scripts that match this URL and are enabled (or all if showing disabled too)
            pageScripts = (response || []).filter(s => s.enabled !== false || true);
            renderScriptList();
        } catch (error) {
            console.error('Failed to load scripts:', error);
            pageScripts = [];
            renderScriptList();
        }
    }

    // Update enabled state UI
    function updateEnabledState() {
        const enabled = settings.enabled !== false;
        
        if (elements.headerCheckIcon) {
            elements.headerCheckIcon.classList.toggle('disabled', !enabled);
        }
    }

    // Render script list
    function renderScriptList() {
        if (!elements.scriptList) return;

        if (pageScripts.length === 0) {
            elements.scriptList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📜</div>
                    <div class="empty-state-text">No scripts for this page</div>
                </div>
            `;
            return;
        }

        elements.scriptList.innerHTML = pageScripts.map(script => {
            const name = script.metadata?.name || script.meta?.name || 'Unnamed Script';
            const enabled = script.enabled !== false;
            const icon = getScriptIcon(script);

            return `
                <div class="script-item" data-script-id="${script.id}">
                    <label class="script-toggle">
                        <input type="checkbox" ${enabled ? 'checked' : ''} data-toggle-id="${script.id}">
                        <span class="slider"></span>
                    </label>
                    <div class="script-icon">${icon}</div>
                    <span class="script-name">${escapeHtml(name)}</span>
                    <div class="script-arrow">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </div>
                </div>
            `;
        }).join('');

        // Attach event listeners
        elements.scriptList.querySelectorAll('.script-item').forEach(item => {
            const scriptId = item.dataset.scriptId;

            // Toggle label - prevent click propagation
            const toggleLabel = item.querySelector('.script-toggle');
            toggleLabel?.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            // Toggle checkbox
            const checkbox = item.querySelector('input[type="checkbox"]');
            checkbox?.addEventListener('change', (e) => {
                e.stopPropagation();
                toggleScript(scriptId, e.target.checked);
            });

            // Click on item opens dashboard
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.script-toggle')) {
                    openDashboard(scriptId);
                }
            });
        });
    }

    // Get icon for script (emoji or favicon-style)
    function getScriptIcon(script) {
        const meta = script.metadata || script.meta || {};
        const name = (meta.name || '').toLowerCase();
        
        // Match common script types to icons
        if (name.includes('youtube') || name.includes('ytkit')) return '▶️';
        if (name.includes('facebook') || name.includes('fb')) return '📘';
        if (name.includes('twitter') || name.includes('x.com')) return '🐦';
        if (name.includes('reddit')) return '🤖';
        if (name.includes('github')) return '🐙';
        if (name.includes('google')) return '🔍';
        if (name.includes('amazon')) return '📦';
        if (name.includes('netflix')) return '🎬';
        if (name.includes('twitch')) return '🎮';
        if (name.includes('instagram')) return '📷';
        if (name.includes('tiktok')) return '🎵';
        if (name.includes('dark') || name.includes('night')) return '🌙';
        if (name.includes('ad') && (name.includes('block') || name.includes('null'))) return '🛡️';
        if (name.includes('download')) return '⬇️';
        if (name.includes('privacy') || name.includes('security')) return '🔒';
        if (name.includes('4chan') || name.includes('8chan')) return '🍀';
        
        // Default icon
        return '📜';
    }

    // Toggle script enabled/disabled
    async function toggleScript(scriptId, enabled) {
        try {
            await chrome.runtime.sendMessage({
                action: 'toggleScript',
                scriptId: scriptId,
                enabled: enabled
            });

            // Update local state
            const script = pageScripts.find(s => s.id === scriptId);
            if (script) {
                script.enabled = enabled;
            }

            // Update badge for current tab
            updateBadgeForTab();
        } catch (error) {
            console.error('Failed to toggle script:', error);
        }
    }

    // Toggle global scripts enabled/disabled
    async function toggleGlobalEnabled() {
        const newEnabled = settings.enabled === false;
        
        try {
            await chrome.runtime.sendMessage({
                action: 'setSettings',
                settings: { enabled: newEnabled }
            });

            settings.enabled = newEnabled;
            updateEnabledState();
            
            // Update badge
            updateBadgeForTab();
        } catch (error) {
            console.error('Failed to toggle global enabled:', error);
        }
    }

    // Update badge for current tab
    async function updateBadgeForTab() {
        try {
            await chrome.runtime.sendMessage({
                action: 'updateBadgeForTab',
                tabId: currentTab?.id,
                url: currentUrl
            });
        } catch (error) {
            // Ignore errors
        }
    }

    // Open dashboard
    function openDashboard(scriptId = null) {
        const url = scriptId 
            ? chrome.runtime.getURL(`pages/dashboard.html#script_${scriptId}`)
            : chrome.runtime.getURL('pages/dashboard.html');
        chrome.tabs.create({ url });
        window.close();
    }

    // Create new script for current page
    async function createNewScript() {
        try {
            let hostname = 'example.com';
            try {
                hostname = new URL(currentUrl).hostname;
            } catch (e) {}

            const defaultCode = `// ==UserScript==
// @name        New Script for ${hostname}
// @namespace   http://espressomonkey.local/
// @version     1.0
// @description Script for ${hostname}
// @author      You
// @match       *://${hostname}/*
// @grant       none
// ==/UserScript==

(function() {
    'use strict';
    
    // Your code here...
    
})();`;

            const response = await chrome.runtime.sendMessage({
                action: 'createScript',
                code: defaultCode
            });

            if (response?.success && response?.scriptId) {
                openDashboard(response.scriptId);
            } else {
                openDashboard();
            }
        } catch (error) {
            console.error('Failed to create script:', error);
            openDashboard();
        }
    }

    // Find scripts on GreasyFork
    function findScripts() {
        try {
            let hostname = '';
            try {
                hostname = new URL(currentUrl).hostname;
            } catch (e) {}
            
            const searchUrl = hostname 
                ? `https://greasyfork.org/en/scripts?q=${encodeURIComponent(hostname)}`
                : 'https://greasyfork.org/en/scripts';
            chrome.tabs.create({ url: searchUrl });
            window.close();
        } catch (error) {
            console.error('Failed to search for scripts:', error);
        }
    }

    // Export to ZIP
    async function exportToZip() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'exportZip' });
            
            if (response?.zipData) {
                // Convert base64 to blob and download
                const byteCharacters = atob(response.zipData);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/zip' });
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = response.filename || `espressomonkey-backup-${new Date().toISOString().split('T')[0]}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                
                window.close();
            }
        } catch (error) {
            console.error('Failed to export:', error);
        }
    }

    // Import from file
    function importFromFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.zip';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const isZip = file.name.toLowerCase().endsWith('.zip');
                
                if (isZip) {
                    const arrayBuffer = await file.arrayBuffer();
                    const base64 = btoa(
                        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                    );
                    
                    await chrome.runtime.sendMessage({
                        action: 'importFromZip',
                        zipData: base64,
                        options: { overwrite: true }
                    });
                } else {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    
                    await chrome.runtime.sendMessage({
                        action: 'importAll',
                        data: { data, options: { overwrite: true } }
                    });
                }
                
                // Reload and close
                await loadPageScripts();
                updateBadgeForTab();
            } catch (error) {
                console.error('Failed to import:', error);
            }
        };

        input.click();
    }

    // Check for updates
    async function checkForUpdates() {
        try {
            await chrome.runtime.sendMessage({ action: 'checkUpdates' });
            window.close();
        } catch (error) {
            console.error('Failed to check updates:', error);
        }
    }

    // Escape HTML
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // Setup event listeners
    function setupEventListeners() {
        // Header toggle (global enable/disable)
        elements.headerToggle?.addEventListener('click', toggleGlobalEnabled);

        // Find scripts
        elements.btnFindScripts?.addEventListener('click', findScripts);

        // New script
        elements.btnNewScript?.addEventListener('click', createNewScript);

        // Utilities submenu toggle
        elements.btnUtilities?.addEventListener('click', () => {
            elements.utilitiesSubmenu?.classList.toggle('open');
        });

        // Utilities actions
        elements.btnExportZip?.addEventListener('click', exportToZip);
        elements.btnImport?.addEventListener('click', importFromFile);
        elements.btnCheckUpdates?.addEventListener('click', checkForUpdates);

        // Dashboard
        elements.btnDashboard?.addEventListener('click', () => openDashboard());
        
        // Setup warning - Open extension settings
        elements.btnOpenExtSettings?.addEventListener('click', () => {
            // Get extension ID and open management page
            const extensionId = chrome.runtime.id;
            chrome.tabs.create({ 
                url: `chrome://extensions/?id=${extensionId}` 
            });
            window.close();
        });
    }

    // Start
    document.addEventListener('DOMContentLoaded', init);
})();
