// EspressoMonkey v1.0.0 - Content Script Bridge
// Bridges messages between userscripts (USER_SCRIPT world) and background service worker

(function() {
  'use strict';
  
  // Prevent double initialization
  if (window.__EspressoMonkey_Bridge__) {
    return;
  }
  window.__EspressoMonkey_Bridge__ = true;
  
  // Unique channel ID to prevent conflicts with other extensions
  const CHANNEL_ID = 'EspressoMonkey_' + chrome.runtime.id;
  
  // Listen for messages from userscript world (USER_SCRIPT or page context)
  window.addEventListener('message', async (event) => {
    // Security: Only accept messages from same window
    if (event.source !== window) return;
    
    const msg = event.data;
    
    // Check for our message type
    if (!msg || typeof msg !== 'object') return;
    if (msg.channel !== CHANNEL_ID) return;
    if (msg.direction !== 'to-background') return;
    
    const msgId = msg.id;
    const action = msg.action;
    
    try {
      // Forward to background script and wait for response
      const result = await chrome.runtime.sendMessage({
        action: action,
        data: msg.data
      });
      
      // Send response back to userscript world
      window.postMessage({
        channel: CHANNEL_ID,
        direction: 'to-userscript',
        id: msgId,
        result: result,
        success: true
      }, '*');
    } catch (e) {
      // Handle specific error case where extension context was invalidated
      const errorMsg = e.message || 'Unknown error';
      if (errorMsg.includes('Extension context invalidated') || 
          errorMsg.includes('message channel closed')) {
        // Extension was reloaded, silently fail
        console.warn('[EspressoMonkey] Extension context invalidated, bridge reconnecting...');
      } else {
        console.error('[EspressoMonkey] Bridge error for', action, ':', errorMsg);
      }
      window.postMessage({
        channel: CHANNEL_ID,
        direction: 'to-userscript',
        id: msgId,
        error: errorMsg,
        success: false
      }, '*');
    }
  });
  
  // Listen for messages from background script (menu commands, value changes, XHR events)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Track if we handled the message
    let handled = false;
    
    // Menu command execution
    if (message.action === 'executeMenuCommand') {
      window.postMessage({
        channel: CHANNEL_ID,
        direction: 'to-userscript',
        type: 'menuCommand',
        scriptId: message.data?.scriptId,
        commandId: message.data?.commandId
      }, '*');
      handled = true;
    }
    
    // Value change notifications
    if (message.action === 'valueChanged') {
      window.postMessage({
        channel: CHANNEL_ID,
        direction: 'to-userscript',
        type: 'valueChanged',
        scriptId: message.data?.scriptId,
        key: message.data?.key,
        oldValue: message.data?.oldValue,
        newValue: message.data?.newValue,
        remote: message.data?.remote
      }, '*');
      handled = true;
    }
    
    // XHR event forwarding
    if (message.action === 'xhrEvent') {
      window.postMessage({
        channel: CHANNEL_ID,
        direction: 'to-userscript',
        type: 'xhrEvent',
        requestId: message.data?.requestId,
        scriptId: message.data?.scriptId,
        eventType: message.data?.type,
        data: message.data
      }, '*');
      handled = true;
    }
    
    // Always send response if we handled the message
    // This prevents "message channel closed" errors
    if (handled) {
      sendResponse({ success: true });
    }
    
    // Return false for synchronous response (we never do async here)
    return false;
  });
  
  // Expose channel ID for userscripts and signal ready
  window.__EspressoMonkey_ChannelID__ = CHANNEL_ID;
  window.__EspressoMonkey_BridgeReady__ = true;
  
  window.postMessage({
    channel: CHANNEL_ID,
    direction: 'to-userscript',
    type: 'bridgeReady'
  }, '*');
})();
