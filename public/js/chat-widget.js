// public/js/chat-widget.js
//
// Floating AI chat widget for Essence. Drop this <script> tag near the end
// of index.html / about.html / post pages, along with chat-widget.css.
// No dependencies, no build step.

(function () {
  const STORAGE_KEY = null; // intentionally not persisting chat across reloads (privacy-simple by default)
  const MAX_HISTORY_TURNS = 8;

  let history = [];
  let isOpen = false;
  let isSending = false;

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function buildWidget() {
    const root = el('div', 'essence-chat-root');

    const bubble = el('button', 'essence-chat-bubble');
    bubble.setAttribute('aria-label', 'Open chat assistant');
    bubble.innerHTML = '💬';

    const panel = el('div', 'essence-chat-panel essence-chat-hidden');

    const header = el('div', 'essence-chat-header');
    const headerTitle = el('span', null, 'Ask Essence');
    const closeBtn = el('button', 'essence-chat-close', '×');
    closeBtn.setAttribute('aria-label', 'Close chat');
    header.appendChild(headerTitle);
    header.appendChild(closeBtn);

    const messages = el('div', 'essence-chat-messages');
    const greeting = el(
      'div',
      'essence-chat-msg essence-chat-msg-assistant',
      "Hi! I can answer questions about posts on this blog, or just chat. What's on your mind?"
    );
    messages.appendChild(greeting);

    const inputRow = el('div', 'essence-chat-input-row');
    const input = document.createElement('textarea');
    input.className = 'essence-chat-input';
    input.rows = 1;
    input.placeholder = 'Type a message…';
    const sendBtn = el('button', 'essence-chat-send', 'Send');

    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(inputRow);

    root.appendChild(panel);
    root.appendChild(bubble);
    document.body.appendChild(root);

    bubble.addEventListener('click', () => togglePanel(panel));
    closeBtn.addEventListener('click', () => togglePanel(panel, false));

    sendBtn.addEventListener('click', () => sendMessage(input, messages, sendBtn));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input, messages, sendBtn);
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
  }

  function togglePanel(panel, force) {
    isOpen = typeof force === 'boolean' ? force : !isOpen;
    panel.classList.toggle('essence-chat-hidden', !isOpen);
  }

  function appendMessage(container, role, text) {
    const msg = el('div', `essence-chat-msg essence-chat-msg-${role}`, text);
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    return msg;
  }

  async function sendMessage(input, messages, sendBtn) {
    const text = input.value.trim();
    if (!text || isSending) return;

    isSending = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    appendMessage(messages, 'user', text);
    const typingMsg = appendMessage(messages, 'assistant', 'Thinking…');
    typingMsg.classList.add('essence-chat-typing');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });

      const data = await res.json();

      if (!res.ok) {
        typingMsg.textContent = data.error || 'Something went wrong. Please try again.';
        typingMsg.classList.remove('essence-chat-typing');
        isSending = false;
        sendBtn.disabled = false;
        return;
      }

      typingMsg.textContent = data.reply;
      typingMsg.classList.remove('essence-chat-typing');

      if (data.sources && data.sources.length > 0) {
        const sourcesEl = el('div', 'essence-chat-sources');
        sourcesEl.textContent =
          'Based on: ' + data.sources.map((s) => s.title).filter(Boolean).join(', ');
        messages.appendChild(sourcesEl);
        messages.scrollTop = messages.scrollHeight;
      }

      history.push({ role: 'user', content: text });
      history.push({ role: 'assistant', content: data.reply });
      if (history.length > MAX_HISTORY_TURNS * 2) {
        history = history.slice(-MAX_HISTORY_TURNS * 2);
      }
    } catch (err) {
      typingMsg.textContent = "Couldn't reach the chat service. Please try again shortly.";
      typingMsg.classList.remove('essence-chat-typing');
    } finally {
      isSending = false;
      sendBtn.disabled = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildWidget);
  } else {
    buildWidget();
  }
})();
