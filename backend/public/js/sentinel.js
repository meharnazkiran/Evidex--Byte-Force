/**
 * SENTINEL AI — Client-side Chat Module
 * Privacy-Preserving AI Analytics for EVIDEX
 */
(function () {
  'use strict';

  // State
  let isOpen = false;
  let isAuthenticated = false;
  let currentOfficerId = null;
  let isProcessing = false;

  // DOM References (populated on init)
  let orb, panel, authGate, chatArea, messagesContainer, chatInput, sendBtn, typingIndicator;
  let authInput, authBtn, authError, suggestionsContainer;

  const SUGGESTED_QUERIES = [
    'How many evidence items are on the ledger?',
    'Which officer registered the most evidence?',
    'Show me a case summary',
    'Any custody chain anomalies?',
    'Which org gets the most transfers?',
    'Tampering risk assessment'
  ];

  /**
   * Initialize all DOM references and event listeners.
   */
  function init() {
    orb = document.getElementById('sentinel-orb');
    panel = document.getElementById('sentinel-panel');
    authGate = document.getElementById('sentinel-auth-gate');
    chatArea = document.getElementById('sentinel-chat-area');
    messagesContainer = document.getElementById('sentinel-messages');
    chatInput = document.getElementById('sentinel-chat-input');
    sendBtn = document.getElementById('sentinel-send-btn');
    typingIndicator = document.getElementById('sentinel-typing');
    authInput = document.getElementById('sentinel-auth-input');
    authBtn = document.getElementById('sentinel-auth-btn');
    authError = document.getElementById('sentinel-auth-error');
    suggestionsContainer = document.getElementById('sentinel-suggestions');

    if (!orb || !panel) {
      console.warn('[SENTINEL] DOM elements not found. Sentinel AI disabled.');
      return;
    }

    // Event Listeners
    orb.addEventListener('click', togglePanel);
    document.getElementById('sentinel-close-btn').addEventListener('click', closePanel);
    authBtn.addEventListener('click', verifyAccess);
    authInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyAccess();
    });
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Render suggestion chips
    renderSuggestions();

    console.log('[SENTINEL] AI module initialized.');
  }

  function togglePanel() {
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function openPanel() {
    isOpen = true;
    panel.classList.add('open');
    orb.classList.add('active');
    if (isAuthenticated) {
      chatInput.focus();
    } else {
      authInput.focus();
    }
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('open');
    orb.classList.remove('active');
  }

  /**
   * Verify officer ID against the blockchain ledger ACL.
   */
  async function verifyAccess() {
    const officerId = authInput.value.trim();
    if (!officerId) {
      showAuthError('Enter your Officer ID');
      return;
    }

    authBtn.disabled = true;
    authBtn.textContent = 'VERIFYING...';
    authError.textContent = '';
    authError.className = 'sentinel-auth-error';

    try {
      const response = await fetch('/ai/verify-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officerId })
      });

      const data = await response.json();

      if (data.authorized) {
        isAuthenticated = true;
        currentOfficerId = officerId;
        
        // Show success briefly, then switch to chat
        authError.textContent = '✓ ACCESS GRANTED — Ledger ACL verified';
        authError.className = 'sentinel-auth-error sentinel-auth-success';
        
        setTimeout(() => {
          authGate.style.display = 'none';
          chatArea.classList.add('active');
          
          // Welcome message from the AI
          addMessage('ai', `Welcome, **${officerId}**. I'm SENTINEL AI — your privacy-preserving ledger analytics engine.\n\nI can analyze evidence metadata, custody chains, officer activity, and case statistics from the Hyperledger Fabric ledger. I **cannot** access evidence files or hashes — by design.\n\nWhat would you like to know?`);
          
          chatInput.focus();
        }, 800);
      } else {
        showAuthError(data.message || 'Access denied. Your ID is not on the ledger ACL.');
      }
    } catch (error) {
      showAuthError(`Connection error: ${error.message}`);
    } finally {
      authBtn.disabled = false;
      authBtn.textContent = 'VERIFY IDENTITY';
    }
  }

  function showAuthError(msg) {
    authError.textContent = msg;
    authError.className = 'sentinel-auth-error';
  }

  /**
   * Send a chat message to the AI backend.
   */
  async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message || isProcessing || !isAuthenticated) return;

    isProcessing = true;
    sendBtn.disabled = true;
    chatInput.value = '';

    // Add user message bubble
    addMessage('user', message);

    // Show typing indicator
    typingIndicator.classList.add('active');
    scrollToBottom();

    // Hide suggestions after first message
    if (suggestionsContainer) {
      suggestionsContainer.style.display = 'none';
    }

    try {
      const response = await fetch('/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officerId: currentOfficerId, message })
      });

      const data = await response.json();

      // Hide typing indicator
      typingIndicator.classList.remove('active');

      if (data.error && response.status === 403) {
        // Session revoked
        addMessage('ai', '⚠️ Your access has been revoked. Please re-authenticate.');
        isAuthenticated = false;
        setTimeout(() => {
          chatArea.classList.remove('active');
          authGate.style.display = 'flex';
          authError.textContent = '';
          authInput.value = '';
        }, 2000);
      } else if (data.response) {
        addMessage('ai', data.response);
      } else {
        addMessage('ai', '⚠️ No response received. Please try again.');
      }
    } catch (error) {
      typingIndicator.classList.remove('active');
      addMessage('ai', `⚠️ Connection error: ${error.message}`);
    } finally {
      isProcessing = false;
      sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  /**
   * Add a message bubble to the chat.
   */
  function addMessage(type, text) {
    const msgEl = document.createElement('div');
    msgEl.className = `sentinel-msg ${type}`;

    // Basic markdown-like formatting for AI responses
    if (type === 'ai') {
      let html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code style="background:rgba(138,92,246,0.15);padding:1px 5px;border-radius:4px;font-size:0.78rem;">$1</code>')
        .replace(/\n- /g, '\n• ')
        .replace(/\n/g, '<br>');
      msgEl.innerHTML = html;
    } else {
      msgEl.textContent = text;
    }

    // Insert before typing indicator
    messagesContainer.insertBefore(msgEl, typingIndicator);
    scrollToBottom();
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
  }

  /**
   * Render the suggested query chips.
   */
  function renderSuggestions() {
    if (!suggestionsContainer) return;
    
    SUGGESTED_QUERIES.forEach(query => {
      const chip = document.createElement('button');
      chip.className = 'sentinel-suggestion-chip';
      chip.textContent = query;
      chip.addEventListener('click', () => {
        chatInput.value = query;
        sendMessage();
      });
      suggestionsContainer.appendChild(chip);
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
