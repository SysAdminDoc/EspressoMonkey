import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import "../../pages/theme-tokens.css";
import "../../pages/dashboard.css";
import "../../pages/dashboard-workbench.css";
import "../../pages/dashboard-parity.css";

const rows = [
  ["Clean Reader", "Remove distractions and improve article typography", "4.8.2", "news.example", "12m ago", "Signed", true],
  ["GitHub Workflow Kit", "Streamline reviews, diffs, and repository navigation", "3.6.1", "github.com", "1h ago", "Signed", true],
  ["Video Focus Mode", "Hide clutter and keep playback controls intentional", "2.4.0", "video.example", "3h ago", "Reviewed", true],
  ["Research Notes", "Capture citations and page context to a local notebook", "1.9.3", "*", "Yesterday", "Local", true],
  ["Legacy Layout Fix", "Restore a compact layout on an internal application", "0.8.7", "app.example", "4d ago", "Local", false],
];

function renderRows() {
  return rows.map(([name, description, version, site, updated, source, enabled], index) => `
    <tr class="${name === "GitHub Workflow Kit" ? "selected row-selected" : ""}">
      <td class="center"><input type="checkbox" ${name === "GitHub Workflow Kit" ? "checked" : ""} aria-label="Select ${name}"></td>
      <td class="center">${index + 1}</td>
      <td class="center">${enabled ? '<span class="sv-status-dot good"></span>' : '<span class="sv-status-dot"></span>'}</td>
      <td>
        <div class="script-name-cell">
          <span class="script-icon-placeholder">${name.slice(0, 1)}</span>
          <div class="script-name-stack">
            <span class="script-name">${name}</span>
            <span class="script-author">${description}</span>
          </div>
        </div>
      </td>
      <td class="center">${version}</td>
      <td class="center">42 KB</td>
      <td class="center">180</td>
      <td class="center"><span class="site-icon site-more">${site === "*" ? "*" : site.slice(0, 1).toUpperCase()}</span> ${site}${index === 1 ? " +1" : ""}</td>
      <td class="center"><span class="script-health-badge good">${source}</span></td>
      <td class="center">-</td>
      <td class="center">${updated}</td>
      <td class="center">8ms</td>
      <td class="center"><button class="action-icon" type="button" aria-label="More ${name}">...</button></td>
    </tr>
  `).join("");
}

function renderThemedSelect(id, label, options) {
  return `
    <div class="themed-select" data-select-id="${id}">
      <select id="${id}" class="select-field bulk-select themed-select-native" tabindex="-1" aria-hidden="true" aria-label="${label}">
        ${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join("")}
      </select>
      <button class="select-field bulk-select themed-select-trigger" id="${id}Trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}Menu" aria-label="${label}">
        <span class="themed-select-label">${label}</span>
      </button>
      <div class="themed-select-menu" id="${id}Menu" role="listbox" aria-label="${label}" hidden>
        ${options.map(([value, text], index) => `<button class="themed-select-option${index === 0 ? " selected" : ""}" type="button" role="option" tabindex="-1" data-value="${value}" aria-selected="${index === 0}">${text}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderDashboardShell(theme = "dark") {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.density = "comfortable";
  document.documentElement.dataset.uiScale = "1";
  document.body.innerHTML = `
    <main class="visual-frame" data-testid="dashboard-shell" aria-label="ScriptVault dashboard shell">
      <div class="sv-workbench-shell">
        <aside class="sv-nav-rail" aria-label="ScriptVault workspace">
          <div class="sv-rail-brand">
            <div class="script-icon-placeholder" aria-hidden="true">SV</div>
            <div><strong>ScriptVault</strong><span>v3.30.3</span></div>
          </div>
          <nav class="sv-rail-nav" aria-label="Dashboard sections">
            <button class="sv-rail-item active" type="button"><span class="sv-rail-icon">#</span><span>Scripts</span><span class="sv-rail-count">12</span></button>
            <button class="sv-rail-item" type="button"><span class="sv-rail-icon">U</span><span>Updates</span><span class="sv-rail-count warning">2</span></button>
            <button class="sv-rail-item" type="button"><span class="sv-rail-icon">S</span><span>Settings</span></button>
            <button class="sv-rail-item" type="button"><span class="sv-rail-icon">W</span><span>Utilities</span></button>
            <button class="sv-rail-item" type="button"><span class="sv-rail-icon">T</span><span>Trash</span></button>
            <button class="sv-rail-item" type="button"><span class="sv-rail-icon">?</span><span>Help</span></button>
          </nav>
          <div class="sv-rail-section" aria-label="System tools">
            <span class="sv-rail-section-title">System</span>
            <button class="sv-rail-item sv-rail-subitem" type="button"><span class="sv-rail-icon">R</span><span>Backup &amp; Restore</span></button>
            <button class="sv-rail-item sv-rail-subitem" type="button"><span class="sv-rail-icon">I</span><span>Import / Export</span></button>
            <button class="sv-rail-item sv-rail-subitem" type="button"><span class="sv-rail-icon">D</span><span>Diagnostics</span></button>
          </div>
          <div class="sv-rail-section" aria-label="Trust tools">
            <span class="sv-rail-section-title">Trust</span>
            <button class="sv-rail-item sv-rail-subitem" type="button"><span class="sv-rail-icon">T</span><span>Trusted Sources</span><span class="sv-status-dot good"></span></button>
            <button class="sv-rail-item sv-rail-subitem" type="button"><span class="sv-rail-icon">P</span><span>Permissions</span></button>
            <button class="sv-rail-item sv-rail-subitem" type="button"><span class="sv-rail-icon">D</span><span>Domain Access</span></button>
          </div>
          <div class="sv-rail-storage">
            <div><span>Storage</span><strong>2.4 GB / 10 GB</strong></div>
            <div class="sv-rail-storage-track"><span style="width:24%"></span></div>
            <small>24%</small>
          </div>
          <div class="sv-rail-footer">
            <span class="sv-sync-dot"></span>
            <span class="sv-rail-footer-copy"><strong>Local-first vault</strong><small>Nothing leaves this device</small></span>
          </div>
        </aside>
        <section class="tm-content sv-workbench-main">
          <header class="sv-workbench-topbar" aria-label="Workspace command bar">
            <div class="sv-workbench-breadcrumb"><span>ScriptVault</span><span>/</span><strong>Scripts</strong></div>
            <button class="sv-command-trigger" type="button" aria-label="Search or run a command"><span aria-hidden="true">⌕</span><span>Search or run command...</span><kbd>Ctrl K</kbd></button>
            <div class="sv-workbench-topbar-actions">
              <div class="scripts-shell-health" id="svCommandHealth"><span class="sv-status-dot good"></span><div class="scripts-shell-health-copy"><strong>Local vault ready</strong><small>Last synced 2m ago</small></div></div>
              <button class="sv-topbar-icon" type="button" aria-label="Help">?</button>
              <button class="sv-topbar-icon" type="button" aria-label="Settings">⚙</button>
              <button class="toolbar-btn primary" id="btnNewScript" type="button">New script</button>
            </div>
          </header>
          <div id="scriptsPanel" class="tm-panel active">
            <div class="scripts-shell-header">
              <div class="scripts-shell-copy"><h2>Scripts</h2><p>Manage, review, and run your userscripts from one trusted workspace.</p></div>
              <div class="scripts-shell-stats" aria-label="Workspace stats">
                <div class="scripts-shell-stat"><span class="scripts-shell-stat-mark">S</span><div class="scripts-shell-stat-copy"><strong>12</strong><span>Scripts</span></div></div>
                <div class="scripts-shell-stat" data-tone="good"><span class="scripts-shell-stat-mark">ON</span><div class="scripts-shell-stat-copy"><strong>9</strong><span>Enabled</span></div></div>
                <div class="scripts-shell-stat" data-tone="info"><span class="scripts-shell-stat-mark">UP</span><div class="scripts-shell-stat-copy"><strong>2</strong><span>Updates</span></div></div>
              </div>
            </div>
            <div class="scripts-toolbar" role="toolbar" aria-label="Script controls">
              <div class="scripts-toolbar-left toolbar-section">
                <button class="toolbar-btn" id="btnExportAll" type="button">Backup</button>
                <button class="toolbar-btn" id="btnCheckUpdates" type="button">Check updates</button>
                <button class="toolbar-btn" id="btnNewFolder" type="button"><svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3z"></path></svg>Folder</button>
                <button class="toolbar-btn" id="btnFindScripts" type="button"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>Find</button>
                <div class="toolbar-divider"></div>
                ${renderThemedSelect("filterSelect", "All status", [["all", "All status"], ["enabled", "Enabled"], ["disabled", "Disabled"]])}
                ${renderThemedSelect("siteFilterSelect", "All sites", [["all", "All sites"], ["github.com", "github.com"], ["news.example", "news.example"]])}
                ${renderThemedSelect("savedViewSelect", "Saved views", [["default", "Saved views"], ["enabled", "Active scripts"], ["attention", "Needs review"], ["recent", "Recently updated"]])}
                <div class="bulk-action-cluster"><label class="bulk-toggle"><input type="checkbox"> <span>Select Shown</span></label><select class="select-field"><option>Choose Action</option></select><button class="btn">Apply</button></div>
                <label class="search-box" aria-label="Search scripts">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="M21 21 16.65 16.65"></path></svg>
                  <input value="" placeholder="Search scripts" aria-label="Search scripts">
                </label>
                <button class="toolbar-btn compact active" id="btnViewToggle" type="button">List</button>
                <button class="toolbar-btn compact" id="btnColumnToggle" type="button">Cols</button>
              </div>
              <div class="scripts-shell-actions" role="group" aria-label="Primary script actions">
                <button class="toolbar-btn" id="btnImportScript" type="button">Import</button>
                <button class="toolbar-btn" id="btnWorkbenchSyncNow" type="button">Sync</button>
              </div>
            </div>
            <span class="script-counter" id="scriptCounter">1-5 of 12</span>
            <div class="scripts-workbench-grid">
              <section class="scripts-list-stage">
                <div class="scripts-table-container table-wrapper">
                  <table class="scripts-table">
                    <thead><tr><th class="center">□</th><th class="center">#</th><th class="center">Status</th><th>Name</th><th class="center">Version</th><th class="center">Size</th><th class="center">Lines</th><th class="center">Sites</th><th class="center">Source</th><th class="center">Home</th><th class="center">Updated</th><th class="center">Perf</th><th class="center">More</th></tr></thead>
                    <tbody>${renderRows()}</tbody>
                  </table>
                </div>
                <section class="scripts-update-queue">
                  <div class="scripts-update-queue-header"><div><strong>Update Queue</strong><span class="sv-rail-count warning">3</span></div><div class="scripts-update-queue-actions"><button class="toolbar-btn">Review all</button><button class="toolbar-btn">Update all</button></div></div>
                  <div class="scripts-update-queue-list">
                    <article class="scripts-update-queue-row review-required"><div><strong>Legacy Layout Fix</strong><span>0.8.7 -> 0.9.0</span></div><a>Changelog</a><span class="pending-update-status review">Requires review</span><button class="toolbar-btn">Review update</button><button class="toolbar-btn">Ignore</button></article>
                    <article class="scripts-update-queue-row review-required"><div><strong>GitHub Workflow Kit</strong><span>3.6.1 -> 3.7.0</span></div><a>Changelog</a><span class="pending-update-status review">Requires review</span><button class="toolbar-btn">Review update</button><button class="toolbar-btn">Ignore</button></article>
                  </div>
                </section>
              </section>
              <aside class="script-inspector-panel" aria-label="Selected script inspector">
                <div class="script-inspector-header"><span class="script-inspector-eyebrow">Selected Script</span><strong>GitHub Workflow Kit</strong><span>Streamline reviews, diffs, and repository navigation with a focused local workflow.</span></div>
                <div class="script-inspector-actions">
                  <button class="btn btn-primary script-inspector-action-tile" id="scriptInspectorEdit" type="button"><span>&lt;/&gt;</span>Edit</button>
                  <button class="btn script-inspector-action-tile" id="scriptInspectorConfig" type="button"><span>*</span>Config</button>
                  <button class="btn script-inspector-action-tile" id="scriptInspectorAccess" type="button"><span>@</span>Site access</button>
                  <button class="btn script-inspector-action-tile" id="scriptInspectorUpdate" type="button"><span>...</span>Update</button>
                </div>
                <div class="script-inspector-tabs"><button class="active">Overview</button><button>Access</button><button>Activity</button></div>
                <div class="script-inspector-score" data-tone="good"><div><span>Trust Score</span><strong>96%</strong></div><small>No review flags</small></div>
                <div class="script-inspector-section"><h3>Overview</h3><dl class="script-inspector-meta"><div><dt>Status</dt><dd>Enabled</dd></div><div><dt>Version</dt><dd>3.6.1</dd></div><div><dt>Author</dt><dd>Local workspace</dd></div><div><dt>Source</dt><dd>Signed</dd></div><div><dt>License</dt><dd>MIT</dd></div><div><dt>Runs at</dt><dd>document-end</dd></div><div><dt>Updated</dt><dd>1 hour ago</dd></div><div><dt>Installed</dt><dd>28 days ago</dd></div><div><dt>Size</dt><dd>42 KB</dd></div></dl></div>
                <div class="script-inspector-section"><h3>Trust &amp; Security</h3><div class="script-inspector-checks"><div class="script-inspector-check good"><span>Code signature</span><strong>Valid</strong></div><div class="script-inspector-check good"><span>Known vulnerabilities</span><strong>Clear</strong></div><div class="script-inspector-check good"><span>Permissions</span><strong>5 granted</strong></div></div></div>
                <div class="script-inspector-section"><h3>Domain Access</h3><div class="script-inspector-domain-access"><div class="script-inspector-domain-row"><span>reddit.com</span><strong>Allow</strong></div><div class="script-inspector-domain-row"><span>old.reddit.com</span><strong>Allow</strong></div><div class="script-inspector-domain-row"><span>*.redd.it</span><strong>Allow</strong></div></div></div>
              </aside>
            </div>
          </div>
          <footer class="sv-workbench-statusbar"><span>12 scripts - 9 enabled - 3 disabled</span><span>2 with updates</span><span><span class="sv-status-dot good"></span> Engine: chrome.userScripts</span></footer>
        </section>
      </div>
    </main>
  `;

  const style = document.createElement("style");
  style.textContent = `
    body {
      min-height: 100vh;
      margin: 0;
      background: var(--sv-app-bg);
    }

    .visual-frame {
      position: relative;
      width: 1540px;
      height: 940px;
      overflow: hidden;
      border: 1px solid var(--hairline-strong);
      background: var(--sv-app-bg);
      box-shadow: var(--shadow-lg);
    }

    .visual-frame .sv-workbench-shell,
    .visual-frame .sv-nav-rail {
      min-height: 940px;
    }

    .visual-frame .sv-workbench-main {
      position: static;
    }

    .visual-frame .scripts-workbench-grid table {
      min-width: 0;
    }

    .visual-frame .search-box svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
    }

    .visual-frame .sv-workbench-statusbar {
      position: absolute;
      left: 232px;
      right: 0;
      bottom: 0;
    }
  `;
  document.head.append(style);
}

describe("dashboard visual shell", () => {
  it.each(["dark", "light", "catppuccin", "oled"])("matches the pinned %s list-view baseline", async (theme) => {
    await page.viewport(1600, 980);
    await page.mark("dashboard load", () => renderDashboardShell(theme));
    await page.mark(`theme switch: ${theme}`, () => {
      document.documentElement.dataset.theme = theme;
    });

    const shell = page.getByTestId("dashboard-shell");
    await page.mark("assertion: dashboard shell visible", () => expect.element(shell).toBeVisible());
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await page.mark("assertion: dashboard screenshot", () => (
      expect.element(shell).toMatchScreenshot(`dashboard-list-shell-${theme}`)
    ));
  });

  it("keeps the saved views menu inside the dark workbench theme", async () => {
    await page.viewport(1600, 980);
    await page.mark("dashboard load", () => renderDashboardShell("dark"));
    await page.mark("popover open: saved views", () => {
      const picker = document.querySelector('.themed-select[data-select-id="savedViewSelect"]');
      const trigger = document.getElementById("savedViewSelectTrigger");
      const menu = document.getElementById("savedViewSelectMenu");
      picker?.classList.add("open");
      trigger?.setAttribute("aria-expanded", "true");
      if (menu instanceof HTMLElement) menu.hidden = false;
    });

    const shell = page.getByTestId("dashboard-shell");
    await page.mark("assertion: saved views menu visible", async () => {
      await expect.element(shell).toBeVisible();
      await expect.element(page.getByRole("listbox", { name: "Saved views" })).toBeVisible();
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await page.mark("assertion: saved views screenshot", () => (
      expect.element(shell).toMatchScreenshot("dashboard-saved-views-open-dark")
    ));
  });

  it("records modal and popover landmarks for failure traces", async () => {
    await page.viewport(1200, 800);
    await page.mark("dashboard load", () => renderDashboardShell("dark"));
    await page.mark("theme switch: light", () => {
      document.documentElement.dataset.theme = "light";
    });
    await page.mark("modal open: script review", () => {
      document.body.insertAdjacentHTML("beforeend", `
        <dialog open aria-label="Script review" data-testid="trace-modal">
          <h2>Review script changes</h2>
          <button type="button">Approve update</button>
        </dialog>
      `);
    });
    await page.mark("popover open: review help", () => {
      document.body.insertAdjacentHTML("beforeend", `
        <aside role="tooltip" data-testid="trace-popover">Review permissions before approving.</aside>
      `);
    });

    await page.mark("assertion: overlays visible", async () => {
      await expect.element(page.getByTestId("trace-modal")).toBeVisible();
      await expect.element(page.getByTestId("trace-popover")).toBeVisible();
    });
  });
});
