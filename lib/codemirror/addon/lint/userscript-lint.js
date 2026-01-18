// ScriptMonkey Userscript Linter
// Real-time metadata validation for userscripts
(function(mod) {
  if (typeof exports == "object" && typeof module == "object")
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd)
    define(["../../lib/codemirror"], mod);
  else
    mod(CodeMirror);
})(function(CodeMirror) {
  "use strict";

  // Valid @run-at values
  const VALID_RUN_AT = [
    'document-start',
    'document-body',
    'document-end',
    'document-idle',
    'context-menu'
  ];

  // Valid @inject-into values
  const VALID_INJECT_INTO = ['auto', 'page', 'content'];

  // Valid @sandbox values
  const VALID_SANDBOX = ['raw', 'JavaScript', 'DOM'];

  // Known GM_* APIs for @grant
  const VALID_GRANTS = [
    'none',
    'unsafeWindow',
    'window.close',
    'window.focus',
    'window.onurlchange',
    'GM_info',
    'GM_getValue',
    'GM_setValue',
    'GM_deleteValue',
    'GM_listValues',
    'GM_getValues',
    'GM_setValues',
    'GM_deleteValues',
    'GM_addValueChangeListener',
    'GM_removeValueChangeListener',
    'GM_getResourceText',
    'GM_getResourceURL',
    'GM_addStyle',
    'GM_addElement',
    'GM_openInTab',
    'GM_closeTab',
    'GM_focusTab',
    'GM_registerMenuCommand',
    'GM_unregisterMenuCommand',
    'GM_notification',
    'GM_xmlhttpRequest',
    'GM.xmlHttpRequest',
    'GM_download',
    'GM_getTab',
    'GM_saveTab',
    'GM_getTabs',
    'GM_setClipboard',
    'GM_log',
    'GM_cookie',
    'GM_webRequest',
    // Greasemonkey 4+ style
    'GM.getValue',
    'GM.setValue',
    'GM.deleteValue',
    'GM.listValues',
    'GM.getResourceUrl',
    'GM.notification',
    'GM.openInTab',
    'GM.setClipboard',
    'GM.xmlHttpRequest',
    'GM.info'
  ];

  // Known metadata directives
  const KNOWN_DIRECTIVES = [
    'name', 'namespace', 'version', 'description', 'author',
    'match', 'include', 'exclude', 'exclude-match', 'excludeMatch',
    'grant', 'require', 'resource', 'run-at', 'noframes',
    'icon', 'icon64', 'iconURL', 'defaulticon', 'homepage', 'homepageURL',
    'website', 'source', 'updateURL', 'downloadURL', 'supportURL',
    'connect', 'antifeature', 'unwrap', 'inject-into', 'sandbox',
    'compatible', 'incompatible', 'license', 'copyright', 'contributor'
  ];

  // Deprecated directives
  const DEPRECATED_DIRECTIVES = {
    'include': 'Consider using @match instead for better security',
    'unwrap': '@unwrap is deprecated in most userscript managers'
  };

  // GM APIs that require corresponding @grant
  const GM_API_PATTERN = /\b(GM_\w+|GM\.\w+|unsafeWindow)\b/g;

  function lintUserscript(text, options, cm) {
    const annotations = [];
    const lines = text.split('\n');
    
    // Find metadata block
    const metaStartMatch = text.match(/\/\/\s*==UserScript==/);
    const metaEndMatch = text.match(/\/\/\s*==\/UserScript==/);
    
    let metaStartLine = -1;
    let metaEndLine = -1;
    let inMetaBlock = false;
    
    // Tracking for metadata
    const foundDirectives = {
      name: false,
      match: [],
      include: [],
      grant: [],
      require: [],
      resource: [],
      connect: []
    };

    // Find meta block boundaries
    for (let i = 0; i < lines.length; i++) {
      if (/\/\/\s*==UserScript==/.test(lines[i])) {
        metaStartLine = i;
        inMetaBlock = true;
      }
      if (/\/\/\s*==\/UserScript==/.test(lines[i])) {
        metaEndLine = i;
        break;
      }
    }

    // Check for metadata block existence
    if (metaStartLine === -1) {
      annotations.push({
        from: CodeMirror.Pos(0, 0),
        to: CodeMirror.Pos(0, lines[0]?.length || 0),
        message: 'Missing ==UserScript== header. Scripts must start with a metadata block.',
        severity: 'error'
      });
      return annotations;
    }

    if (metaEndLine === -1) {
      annotations.push({
        from: CodeMirror.Pos(metaStartLine, 0),
        to: CodeMirror.Pos(metaStartLine, lines[metaStartLine].length),
        message: 'Missing ==/UserScript== closing tag',
        severity: 'error'
      });
      return annotations;
    }

    // Check if metadata block is at the start
    let hasContentBeforeMeta = false;
    for (let i = 0; i < metaStartLine; i++) {
      const trimmed = lines[i].trim();
      if (trimmed && !trimmed.startsWith('//')) {
        hasContentBeforeMeta = true;
        annotations.push({
          from: CodeMirror.Pos(i, 0),
          to: CodeMirror.Pos(i, lines[i].length),
          message: 'Code before ==UserScript== block may not execute properly',
          severity: 'warning'
        });
      }
    }

    // Parse and validate each line in metadata block
    for (let i = metaStartLine + 1; i < metaEndLine; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Skip empty lines
      if (!trimmed) continue;
      
      // Check for proper comment format
      if (!trimmed.startsWith('//')) {
        annotations.push({
          from: CodeMirror.Pos(i, 0),
          to: CodeMirror.Pos(i, line.length),
          message: 'Metadata lines must start with //',
          severity: 'error'
        });
        continue;
      }

      // Parse directive
      const directiveMatch = trimmed.match(/\/\/\s*@(\S+)(?:\s+(.*))?/);
      if (!directiveMatch) continue;

      const directive = directiveMatch[1];
      const value = (directiveMatch[2] || '').trim();
      const directiveStart = line.indexOf('@');

      // Check for unknown directives
      if (!KNOWN_DIRECTIVES.includes(directive)) {
        annotations.push({
          from: CodeMirror.Pos(i, directiveStart),
          to: CodeMirror.Pos(i, directiveStart + directive.length + 1),
          message: `Unknown directive: @${directive}`,
          severity: 'warning'
        });
      }

      // Check for deprecated directives
      if (DEPRECATED_DIRECTIVES[directive]) {
        annotations.push({
          from: CodeMirror.Pos(i, directiveStart),
          to: CodeMirror.Pos(i, directiveStart + directive.length + 1),
          message: DEPRECATED_DIRECTIVES[directive],
          severity: 'info'
        });
      }

      // Track found directives
      if (directive === 'name') {
        foundDirectives.name = true;
        if (!value) {
          annotations.push({
            from: CodeMirror.Pos(i, directiveStart),
            to: CodeMirror.Pos(i, line.length),
            message: '@name requires a value',
            severity: 'error'
          });
        }
      }

      // Validate @match patterns
      if (directive === 'match') {
        foundDirectives.match.push({ line: i, value });
        if (!value) {
          annotations.push({
            from: CodeMirror.Pos(i, directiveStart),
            to: CodeMirror.Pos(i, line.length),
            message: '@match requires a URL pattern',
            severity: 'error'
          });
        } else {
          const matchError = validateMatchPattern(value);
          if (matchError) {
            annotations.push({
              from: CodeMirror.Pos(i, line.indexOf(value)),
              to: CodeMirror.Pos(i, line.length),
              message: matchError,
              severity: 'error'
            });
          }
        }
      }

      // Track @include
      if (directive === 'include') {
        foundDirectives.include.push({ line: i, value });
        if (!value) {
          annotations.push({
            from: CodeMirror.Pos(i, directiveStart),
            to: CodeMirror.Pos(i, line.length),
            message: '@include requires a URL pattern',
            severity: 'error'
          });
        }
      }

      // Validate @grant
      if (directive === 'grant') {
        foundDirectives.grant.push({ line: i, value });
        if (!value) {
          annotations.push({
            from: CodeMirror.Pos(i, directiveStart),
            to: CodeMirror.Pos(i, line.length),
            message: '@grant requires a value (use "none" for no grants)',
            severity: 'error'
          });
        } else if (!VALID_GRANTS.includes(value)) {
          annotations.push({
            from: CodeMirror.Pos(i, line.indexOf(value)),
            to: CodeMirror.Pos(i, line.length),
            message: `Unknown grant: ${value}`,
            severity: 'warning'
          });
        }
      }

      // Validate @run-at
      if (directive === 'run-at') {
        if (!value) {
          annotations.push({
            from: CodeMirror.Pos(i, directiveStart),
            to: CodeMirror.Pos(i, line.length),
            message: '@run-at requires a value',
            severity: 'error'
          });
        } else if (!VALID_RUN_AT.includes(value)) {
          annotations.push({
            from: CodeMirror.Pos(i, line.indexOf(value)),
            to: CodeMirror.Pos(i, line.length),
            message: `Invalid @run-at value. Valid values: ${VALID_RUN_AT.join(', ')}`,
            severity: 'error'
          });
        }
      }

      // Validate @inject-into
      if (directive === 'inject-into') {
        if (value && !VALID_INJECT_INTO.includes(value)) {
          annotations.push({
            from: CodeMirror.Pos(i, line.indexOf(value)),
            to: CodeMirror.Pos(i, line.length),
            message: `Invalid @inject-into value. Valid values: ${VALID_INJECT_INTO.join(', ')}`,
            severity: 'error'
          });
        }
      }

      // Validate @sandbox
      if (directive === 'sandbox') {
        if (value && !VALID_SANDBOX.includes(value)) {
          annotations.push({
            from: CodeMirror.Pos(i, line.indexOf(value)),
            to: CodeMirror.Pos(i, line.length),
            message: `Invalid @sandbox value. Valid values: ${VALID_SANDBOX.join(', ')}`,
            severity: 'warning'
          });
        }
      }

      // Validate @require URLs
      if (directive === 'require') {
        foundDirectives.require.push({ line: i, value });
        if (!value) {
          annotations.push({
            from: CodeMirror.Pos(i, directiveStart),
            to: CodeMirror.Pos(i, line.length),
            message: '@require requires a URL',
            severity: 'error'
          });
        } else if (!isValidURL(value)) {
          annotations.push({
            from: CodeMirror.Pos(i, line.indexOf(value)),
            to: CodeMirror.Pos(i, line.length),
            message: 'Invalid URL format in @require',
            severity: 'error'
          });
        } else if (value.startsWith('http://')) {
          annotations.push({
            from: CodeMirror.Pos(i, line.indexOf(value)),
            to: CodeMirror.Pos(i, line.length),
            message: 'Consider using HTTPS for @require URLs',
            severity: 'info'
          });
        }
      }

      // Validate @resource
      if (directive === 'resource') {
        foundDirectives.resource.push({ line: i, value });
        const resourceMatch = value.match(/^(\S+)\s+(.+)$/);
        if (!resourceMatch) {
          annotations.push({
            from: CodeMirror.Pos(i, directiveStart),
            to: CodeMirror.Pos(i, line.length),
            message: '@resource requires format: @resource name url',
            severity: 'error'
          });
        } else if (!isValidURL(resourceMatch[2])) {
          annotations.push({
            from: CodeMirror.Pos(i, line.indexOf(resourceMatch[2])),
            to: CodeMirror.Pos(i, line.length),
            message: 'Invalid URL format in @resource',
            severity: 'error'
          });
        }
      }

      // Validate @connect
      if (directive === 'connect') {
        foundDirectives.connect.push({ line: i, value });
        if (!value) {
          annotations.push({
            from: CodeMirror.Pos(i, directiveStart),
            to: CodeMirror.Pos(i, line.length),
            message: '@connect requires a domain',
            severity: 'error'
          });
        }
      }

      // Validate @version format
      if (directive === 'version') {
        if (value && !/^\d+(\.\d+)*(-[\w.]+)?(\+[\w.]+)?$/.test(value)) {
          annotations.push({
            from: CodeMirror.Pos(i, line.indexOf(value)),
            to: CodeMirror.Pos(i, line.length),
            message: 'Version should follow semver format (e.g., 1.0.0)',
            severity: 'info'
          });
        }
      }

      // Validate URL-type directives
      const urlDirectives = ['homepage', 'homepageURL', 'website', 'source', 
                            'updateURL', 'downloadURL', 'supportURL'];
      if (urlDirectives.includes(directive) && value) {
        if (!isValidURL(value)) {
          annotations.push({
            from: CodeMirror.Pos(i, line.indexOf(value)),
            to: CodeMirror.Pos(i, line.length),
            message: `Invalid URL format in @${directive}`,
            severity: 'warning'
          });
        }
      }
    }

    // Check for required @name
    if (!foundDirectives.name) {
      annotations.push({
        from: CodeMirror.Pos(metaStartLine, 0),
        to: CodeMirror.Pos(metaStartLine, lines[metaStartLine].length),
        message: 'Missing required @name directive',
        severity: 'error'
      });
    }

    // Check for @match or @include
    if (foundDirectives.match.length === 0 && foundDirectives.include.length === 0) {
      annotations.push({
        from: CodeMirror.Pos(metaEndLine, 0),
        to: CodeMirror.Pos(metaEndLine, lines[metaEndLine].length),
        message: 'Missing @match or @include directive. Script will not run on any pages.',
        severity: 'warning'
      });
    }

    // Check for GM API usage without corresponding @grant
    const grantedAPIs = foundDirectives.grant.map(g => g.value);
    const hasGrantNone = grantedAPIs.includes('none');
    
    // Scan code after metadata for GM API usage
    for (let i = metaEndLine + 1; i < lines.length; i++) {
      const line = lines[i];
      let match;
      
      GM_API_PATTERN.lastIndex = 0;
      while ((match = GM_API_PATTERN.exec(line)) !== null) {
        const api = match[1];
        
        // Skip GM_info (always available)
        if (api === 'GM_info' || api === 'GM.info') continue;
        
        // Check if granted
        const isGranted = grantedAPIs.some(g => {
          if (g === api) return true;
          // Handle GM. vs GM_ variants
          if (api.startsWith('GM.')) {
            const gmUnderscore = 'GM_' + api.slice(3);
            return g === gmUnderscore;
          }
          return false;
        });

        if (!isGranted && !hasGrantNone) {
          // Only warn if there are other grants (implicit grant none)
          if (grantedAPIs.length > 0) {
            annotations.push({
              from: CodeMirror.Pos(i, match.index),
              to: CodeMirror.Pos(i, match.index + api.length),
              message: `${api} requires @grant ${api}`,
              severity: 'warning'
            });
          }
        } else if (hasGrantNone && api !== 'unsafeWindow') {
          annotations.push({
            from: CodeMirror.Pos(i, match.index),
            to: CodeMirror.Pos(i, match.index + api.length),
            message: `${api} is not available with @grant none`,
            severity: 'error'
          });
        }
      }

      // Check for unsafeWindow usage
      if (/\bunsafeWindow\b/.test(line) && !grantedAPIs.includes('unsafeWindow') && !hasGrantNone) {
        if (grantedAPIs.length > 0) {
          const idx = line.indexOf('unsafeWindow');
          annotations.push({
            from: CodeMirror.Pos(i, idx),
            to: CodeMirror.Pos(i, idx + 12),
            message: 'unsafeWindow requires @grant unsafeWindow',
            severity: 'warning'
          });
        }
      }
    }

    // Check for @grant none with other grants
    if (hasGrantNone && grantedAPIs.length > 1) {
      const noneLine = foundDirectives.grant.find(g => g.value === 'none');
      if (noneLine) {
        annotations.push({
          from: CodeMirror.Pos(noneLine.line, 0),
          to: CodeMirror.Pos(noneLine.line, lines[noneLine.line].length),
          message: '@grant none should not be combined with other @grant directives',
          severity: 'warning'
        });
      }
    }

    // Check for GM_xmlhttpRequest without @connect
    const usesXHR = grantedAPIs.includes('GM_xmlhttpRequest') || 
                    grantedAPIs.includes('GM.xmlHttpRequest');
    if (usesXHR && foundDirectives.connect.length === 0) {
      annotations.push({
        from: CodeMirror.Pos(metaEndLine, 0),
        to: CodeMirror.Pos(metaEndLine, lines[metaEndLine].length),
        message: 'Consider adding @connect directives for domains used with GM_xmlhttpRequest',
        severity: 'info'
      });
    }

    return annotations;
  }

  // Validate @match pattern
  function validateMatchPattern(pattern) {
    // Special patterns
    if (pattern === '<all_urls>') return null;
    if (pattern === '*://*/*') return null;
    if (pattern === '*://*') return 'Pattern should be *://*/* to match all URLs';
    
    // Basic format: scheme://host/path
    const matchRegex = /^(\*|https?|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*]+)\/(.*)$/;
    const match = pattern.match(matchRegex);
    
    if (!match) {
      // Check common mistakes
      if (!pattern.includes('://')) {
        return 'Match pattern must include scheme (e.g., *://)';
      }
      if (pattern.startsWith('http://') || pattern.startsWith('https://')) {
        if (!pattern.includes('/', pattern.indexOf('://') + 3)) {
          return 'Match pattern must include a path (at minimum /)';
        }
      }
      return 'Invalid match pattern format. Use scheme://host/path (e.g., *://*.example.com/*)';
    }

    const [, scheme, host, path] = match;

    // Validate scheme
    if (!['*', 'http', 'https', 'file', 'ftp'].includes(scheme)) {
      return `Invalid scheme: ${scheme}. Valid schemes: *, http, https, file, ftp`;
    }

    // Validate host
    if (host !== '*') {
      if (host.startsWith('*.')) {
        const domain = host.slice(2);
        if (domain.includes('*')) {
          return 'Wildcard (*) can only appear at the start of host as *. prefix';
        }
        if (!domain.includes('.') && domain !== 'localhost') {
          return 'Wildcard host must have at least one domain segment (e.g., *.example.com)';
        }
      } else if (host.includes('*')) {
        return 'Wildcard (*) in host must be *.domain.com format';
      }
    }

    return null;
  }

  // Check if string is a valid URL
  function isValidURL(string) {
    try {
      const url = new URL(string);
      return ['http:', 'https:', 'file:', 'ftp:', 'data:'].includes(url.protocol);
    } catch {
      return false;
    }
  }

  // Register the linter with CodeMirror
  CodeMirror.registerHelper("lint", "javascript", lintUserscript);

  // Also expose as a standalone function
  window.lintUserscript = lintUserscript;
});
