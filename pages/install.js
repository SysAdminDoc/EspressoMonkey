// Dangerous permissions that warrant security warnings
const DANGEROUS_PERMISSIONS = [
  'GM_xmlhttpRequest',
  'GM.xmlHttpRequest',
  'GM_download',
  'GM_setClipboard',
  'unsafeWindow',
  'GM_cookie'
];

// Safe/benign permissions
const SAFE_PERMISSIONS = [
  'none',
  'GM_getValue',
  'GM_setValue',
  'GM_deleteValue',
  'GM_listValues',
  'GM_addStyle',
  'GM_getResourceText',
  'GM_getResourceURL',
  'GM_log',
  'GM_info'
];

let scriptCode = '';
let scriptMeta = null;
let existingScript = null;
let codeEditor = null;
let autoUpdate = true;
let enableOnInstall = true;

async function init() {
  // Load theme
  const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
  if (settings?.theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  
  const content = document.getElementById('content');
  
  try {
    // Get pending install data
    const data = await chrome.storage.local.get('pendingInstall');
    
    if (!data.pendingInstall) {
      showError('No script to install', 'Please try downloading the script again.');
      return;
    }
    
    scriptCode = data.pendingInstall.code;
    const sourceUrl = data.pendingInstall.url || '';
    
    // Parse metadata
    scriptMeta = parseMetadata(scriptCode);
    
    if (!scriptMeta) {
      showError('Invalid userscript', 'No valid userscript metadata block found.');
      return;
    }
    
    // Check if script already exists
    const response = await chrome.runtime.sendMessage({ action: 'getScripts' });
    const scripts = response?.scripts || [];
    existingScript = scripts.find(s => 
      s.meta.name === scriptMeta.name && 
      (s.meta.namespace === scriptMeta.namespace || (!s.meta.namespace && !scriptMeta.namespace))
    );
    
    // Render the install UI
    renderInstallUI(sourceUrl);
    
  } catch (e) {
    console.error('Install error:', e);
    showError('Error loading script', e.message);
  }
}

function parseMetadata(code) {
  const match = code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (!match) return null;
  
  const meta = {
    name: 'Unknown Script',
    namespace: '',
    version: '1.0.0',
    description: '',
    author: '',
    homepage: '',
    homepageURL: '',
    supportURL: '',
    updateURL: '',
    downloadURL: '',
    icon: '',
    icon64: '',
    license: '',
    match: [],
    include: [],
    exclude: [],
    'exclude-match': [],
    grant: [],
    require: [],
    resource: [],
    'run-at': 'document-idle',
    noframes: false
  };
  
  const lines = match[1].split('\n');
  for (const line of lines) {
    const m = line.match(/\/\/\s*@(\S+)\s+(.*)/);
    if (!m) continue;
    
    const [, key, value] = m;
    const val = value.trim();
    
    if (key === 'noframes') {
      meta.noframes = true;
    } else if (Array.isArray(meta[key])) {
      meta[key].push(val);
    } else if (key in meta) {
      meta[key] = val;
    }
  }
  
  // Normalize homepage
  meta.homepage = meta.homepage || meta.homepageURL;
  
  return meta;
}

function renderInstallUI(sourceUrl) {
  const content = document.getElementById('content');
  const badge = document.getElementById('install-type-badge');
  
  // Determine install type
  let isUpdate = false;
  let isReinstall = false;
  let versionChange = '';
  
  if (existingScript) {
    const existingVersion = existingScript.meta.version || '0.0.0';
    const newVersion = scriptMeta.version || '0.0.0';
    
    if (compareVersions(newVersion, existingVersion) > 0) {
      isUpdate = true;
      versionChange = `${existingVersion} → ${newVersion}`;
      badge.innerHTML = `<span class="update-badge">⬆️ Update Available</span>`;
    } else {
      isReinstall = true;
      badge.innerHTML = `<span class="reinstall-badge">🔄 Reinstall</span>`;
    }
  }
  
  // Check for dangerous permissions
  const hasDangerousPerms = scriptMeta.grant.some(g => DANGEROUS_PERMISSIONS.includes(g));
  
  // Build matches list
  const matches = [...scriptMeta.match, ...scriptMeta.include];
  const excludes = [...scriptMeta.exclude, ...scriptMeta['exclude-match']];
  
  // Get icon URL
  const iconUrl = scriptMeta.icon64 || scriptMeta.icon;
  
  let html = '';
  
  // Security warning if dangerous permissions
  if (hasDangerousPerms) {
    html += `
      <div class="security-warning">
        <div class="security-warning-header">
          <span>⚠️</span>
          <span>Security Notice</span>
        </div>
        <div class="security-warning-text">
          This script requests powerful permissions that could access data across websites or make network requests. 
          Only install if you trust the source.
        </div>
      </div>
    `;
  }
  
  // Script card
  html += `
    <div class="script-card">
      <div class="script-header">
        <div class="script-icon-row">
          <div class="script-icon">
            ${iconUrl ? `<img src="${escapeHtml(iconUrl)}" alt="" onerror="this.style.display='none'; this.parentElement.innerHTML='📜'">` : '📜'}
          </div>
          <div class="script-title-area">
            <div class="script-name">${escapeHtml(scriptMeta.name)}</div>
            <div class="script-version">
              ${isUpdate ? 
                `<span class="version-change">${escapeHtml(versionChange)}</span>` : 
                `v${escapeHtml(scriptMeta.version)}`
              }
            </div>
          </div>
        </div>
        ${scriptMeta.description ? `<div class="script-description">${escapeHtml(scriptMeta.description)}</div>` : ''}
      </div>
      
      <div class="script-meta">
        <div class="meta-grid">
          ${scriptMeta.author ? `
            <div class="meta-item">
              <span class="meta-label">Author</span>
              <span class="meta-value">${escapeHtml(scriptMeta.author)}</span>
            </div>
          ` : ''}
          
          ${scriptMeta.namespace ? `
            <div class="meta-item">
              <span class="meta-label">Namespace</span>
              <span class="meta-value">${escapeHtml(scriptMeta.namespace)}</span>
            </div>
          ` : ''}
          
          ${scriptMeta.license ? `
            <div class="meta-item">
              <span class="meta-label">License</span>
              <span class="meta-value">${escapeHtml(scriptMeta.license)}</span>
            </div>
          ` : ''}
          
          ${scriptMeta.homepage ? `
            <div class="meta-item">
              <span class="meta-label">Homepage</span>
              <span class="meta-value"><a href="${escapeHtml(scriptMeta.homepage)}" target="_blank">${escapeHtml(truncateUrl(scriptMeta.homepage))}</a></span>
            </div>
          ` : ''}
          
          <div class="meta-item full-width">
            <span class="meta-label">Source</span>
            <span class="meta-value">${escapeHtml(sourceUrl || 'Local file')}</span>
          </div>
        </div>
      </div>
      
      <!-- URL Patterns -->
      ${matches.length > 0 ? `
        <div class="section">
          <div class="section-title">
            <span>Runs on</span>
            <span class="count">${matches.length}</span>
          </div>
          <div class="match-list">
            ${matches.slice(0, 5).map(m => `<div class="match-item">${escapeHtml(m)}</div>`).join('')}
            ${matches.length > 5 ? `<div class="match-item" style="color: var(--text-muted)">...and ${matches.length - 5} more</div>` : ''}
          </div>
        </div>
      ` : ''}
      
      <!-- Excludes -->
      ${excludes.length > 0 ? `
        <div class="section">
          <div class="section-title">
            <span>Excludes</span>
            <span class="count">${excludes.length}</span>
          </div>
          <div class="match-list">
            ${excludes.slice(0, 3).map(m => `<div class="match-item">${escapeHtml(m)}</div>`).join('')}
            ${excludes.length > 3 ? `<div class="match-item" style="color: var(--text-muted)">...and ${excludes.length - 3} more</div>` : ''}
          </div>
        </div>
      ` : ''}
      
      <!-- Permissions -->
      <div class="section">
        <div class="section-title">
          <span>Permissions</span>
          <span class="count">${scriptMeta.grant.length || 1}</span>
        </div>
        <div class="tag-list">
          ${scriptMeta.grant.length > 0 ? 
            scriptMeta.grant.map(g => {
              const isDangerous = DANGEROUS_PERMISSIONS.includes(g);
              const isSafe = SAFE_PERMISSIONS.includes(g);
              return `<span class="tag ${isDangerous ? 'warning' : isSafe ? 'safe' : ''}">${escapeHtml(g)}</span>`;
            }).join('') :
            '<span class="tag safe">none</span>'
          }
        </div>
      </div>
      
      <!-- Resources -->
      ${scriptMeta.require.length > 0 || scriptMeta.resource.length > 0 ? `
        <div class="section">
          <div class="section-title">
            <span>External Resources</span>
            <span class="count">${scriptMeta.require.length + scriptMeta.resource.length}</span>
          </div>
          <div class="tag-list">
            ${scriptMeta.require.map(r => `<span class="tag">${escapeHtml(getUrlFilename(r))}</span>`).join('')}
            ${scriptMeta.resource.map(r => {
              const parts = r.split(/\s+/);
              return `<span class="tag">${escapeHtml(parts[0])}</span>`;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
  
  // Options
  html += `
    <div class="options">
      <div class="options-title">Installation Options</div>
      
      <div class="option-row">
        <div class="option-info">
          <span class="option-label">Enable on install</span>
          <span class="option-description">Start running the script immediately after installation</span>
        </div>
        <label class="toggle">
          <input type="checkbox" id="enable-install" checked>
          <span class="toggle-slider"></span>
        </label>
      </div>
      
      ${scriptMeta.updateURL || scriptMeta.downloadURL ? `
        <div class="option-row">
          <div class="option-info">
            <span class="option-label">Auto-update</span>
            <span class="option-description">Automatically check for and install updates</span>
          </div>
          <label class="toggle">
            <input type="checkbox" id="auto-update" checked>
            <span class="toggle-slider"></span>
          </label>
        </div>
      ` : ''}
    </div>
  `;
  
  // Code preview
  html += `
    <div class="code-preview">
      <div class="code-preview-header">
        <span class="code-preview-title">Script Code</span>
        <button class="code-preview-toggle" id="toggle-code">
          <span id="toggle-icon">▼</span>
          <span id="toggle-text">Show code</span>
        </button>
      </div>
      <div class="code-container" id="code-container">
        <textarea id="code-editor"></textarea>
      </div>
    </div>
  `;
  
  // Actions
  html += `
    <div class="actions">
      <button class="btn btn-secondary" id="btn-cancel">Cancel</button>
      <button class="btn ${isUpdate ? 'btn-update' : 'btn-primary'}" id="btn-install">
        ${isUpdate ? '⬆️ Update Script' : isReinstall ? '🔄 Reinstall Script' : '📥 Install Script'}
      </button>
    </div>
  `;
  
  content.innerHTML = html;
  
  // Setup code preview
  setupCodePreview();
  
  // Setup event listeners
  document.getElementById('btn-cancel').addEventListener('click', handleCancel);
  document.getElementById('btn-install').addEventListener('click', handleInstall);
  document.getElementById('toggle-code').addEventListener('click', toggleCodePreview);
  
  document.getElementById('enable-install')?.addEventListener('change', (e) => {
    enableOnInstall = e.target.checked;
  });
  
  document.getElementById('auto-update')?.addEventListener('change', (e) => {
    autoUpdate = e.target.checked;
  });
}

function setupCodePreview() {
  const textarea = document.getElementById('code-editor');
  if (!textarea) return;
  
  const theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'monokai';
  
  codeEditor = CodeMirror.fromTextArea(textarea, {
    mode: 'javascript',
    theme: theme,
    lineNumbers: true,
    readOnly: true,
    lineWrapping: true
  });
  
  codeEditor.setValue(scriptCode);
}

function toggleCodePreview() {
  const container = document.getElementById('code-container');
  const icon = document.getElementById('toggle-icon');
  const text = document.getElementById('toggle-text');
  
  container.classList.toggle('expanded');
  
  if (container.classList.contains('expanded')) {
    icon.textContent = '▲';
    text.textContent = 'Hide code';
    codeEditor?.refresh();
  } else {
    icon.textContent = '▼';
    text.textContent = 'Show code';
  }
}

function handleCancel() {
  chrome.storage.local.remove('pendingInstall');
  window.close();
}

async function handleInstall() {
  const btn = document.getElementById('btn-install');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner" style="width: 16px; height: 16px; border-width: 2px; margin: 0;"></span> Installing...';
  
  try {
    // If updating, we need to preserve the existing script ID
    const scriptId = existingScript?.id || null;
    
    const result = await chrome.runtime.sendMessage({
      action: 'saveScript',
      data: {
        code: scriptCode,
        id: scriptId,
        enabled: enableOnInstall,
        autoUpdate: autoUpdate
      }
    });
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    await chrome.storage.local.remove('pendingInstall');
    showSuccess(scriptMeta.name, existingScript ? 'updated' : 'installed');
    
  } catch (e) {
    console.error('Install failed:', e);
    btn.disabled = false;
    btn.innerHTML = '📥 Install Script';
    alert('Failed to install: ' + e.message);
  }
}

function showError(title, message) {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="error">
      <div class="error-icon">❌</div>
      <div class="error-title">${escapeHtml(title)}</div>
      <div class="error-message">${escapeHtml(message)}</div>
      <button class="btn btn-secondary" onclick="window.close()">Close</button>
    </div>
  `;
}

function showSuccess(name, action) {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="success">
      <div class="success-icon">✅</div>
      <div class="success-title">Script ${action === 'updated' ? 'Updated' : 'Installed'}!</div>
      <div class="success-message">${escapeHtml(name)} is now ${enableOnInstall ? 'active' : 'installed but disabled'}.</div>
    </div>
  `;
  
  setTimeout(() => window.close(), 2000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function truncateUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname.length > 20 ? u.pathname.substring(0, 20) + '...' : u.pathname);
  } catch {
    return url.length > 40 ? url.substring(0, 40) + '...' : url;
  }
}

function getUrlFilename(url) {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const filename = path.substring(path.lastIndexOf('/') + 1);
    return filename || u.hostname;
  } catch {
    return url.length > 30 ? url.substring(0, 30) + '...' : url;
  }
}

function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  
  return 0;
}

// Initialize
init();
