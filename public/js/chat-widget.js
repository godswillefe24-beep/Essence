// public/js/chat-widget.js
//
// Floating AI chat widget for Essence. Drop this <script> tag near the end
// of index.html / about.html / post pages, along with chat-widget.css.
// No dependencies, no build step. Renders replies as they stream in.

(function () {
  const MAX_HISTORY_TURNS = 8;
  const MAX_PAGE_CONTENT_CHARS = 4000;

  let history = [];
  let isOpen = false;
  let isSending = false;
  let activeController = null;
  let lastPrompt = "";

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Grabs the visible text of whatever article/post content exists on the
  // current page, so the AI actually knows what page the visitor is on
  // instead of only being able to answer from the (incomplete) posts.json
  // database. Without this, "summarize this post" has nothing to work with.
  function getPageContext() {
    const articleEl = document.querySelector("article");
    const mainEl = document.querySelector("main");
    const source = articleEl || mainEl;
    const text = source ? source.innerText.trim() : "";

    return {
      url: window.location.pathname,
      title: document.title,
      content: text.slice(0, MAX_PAGE_CONTENT_CHARS),
    };
  }

  function buildWidget() {
    const root = el("div", "essence-chat-root");

    const bubble = el("button", "essence-chat-bubble");
    bubble.setAttribute("aria-label", "Open chat assistant");
    bubble.innerHTML = "💬";

    const panel = el("div", "essence-chat-panel essence-chat-hidden");

    const header = el("div", "essence-chat-header");
    const headerTitle = el("span", null, "Ask Essence");
    const closeBtn = el("button", "essence-chat-close", "×");
    closeBtn.setAttribute("aria-label", "Close chat");
    header.appendChild(headerTitle);
    header.appendChild(closeBtn);

    const messages = el("div", "essence-chat-messages");
    const greeting = el(
      "div",
      "essence-chat-msg essence-chat-msg-assistant",
      "Hi! I can answer questions about posts on this blog, or just chat. What's on your mind?",
    );
    messages.appendChild(greeting);

    const inputRow = el("div", "essence-chat-input-row");
    const input = document.createElement("textarea");
    input.className = "essence-chat-input";
    input.rows = 1;
    input.placeholder = "Type a message…";
    const sendBtn = el("button", "essence-chat-send", "Send");
    const cancelBtn = el("button", "essence-chat-cancel", "Stop");
    cancelBtn.type = "button";
    cancelBtn.hidden = true;
    cancelBtn.setAttribute("aria-label", "Stop generating a response");

    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
    inputRow.appendChild(cancelBtn);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(inputRow);

    root.appendChild(panel);
    root.appendChild(bubble);
    document.body.appendChild(root);

    bubble.addEventListener("click", () => togglePanel(panel));
    closeBtn.addEventListener("click", () => togglePanel(panel, false));

    sendBtn.addEventListener("click", () =>
      sendMessage(input, messages, sendBtn),
    );
    cancelBtn.addEventListener("click", () => activeController?.abort());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input, messages, sendBtn);
      }
    });
    root.addEventListener("click", (event) => {
      const retry = event.target.closest(".essence-chat-retry");
      if (retry && lastPrompt && !isSending) {
        input.value = lastPrompt;
        sendMessage(input, messages, sendBtn);
      }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
  }

  function togglePanel(panel, force) {
    isOpen = typeof force === "boolean" ? force : !isOpen;
    panel.classList.toggle("essence-chat-hidden", !isOpen);
  }

  function appendMessage(container, role, text) {
    const msg = el("div", `essence-chat-msg essence-chat-msg-${role}`, text);
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    return msg;
  }

  async function sendMessage(input, messages, sendBtn) {
    const text = input.value.trim();
    if (!text || isSending) return;

    isSending = true;
    lastPrompt = text;
    activeController = new AbortController();
    sendBtn.disabled = true;
    const cancelBtn = sendBtn.parentElement.querySelector(
      ".essence-chat-cancel",
    );
    if (cancelBtn) cancelBtn.hidden = false;
    input.value = "";
    input.style.height = "auto";

    appendMessage(messages, "user", text);
    const replyMsg = appendMessage(messages, "assistant", "Thinking…");
    replyMsg.classList.add("essence-chat-typing");

    let fullText = "";
    let sources = [];
    let firstDeltaReceived = false;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          pageContext: getPageContext(),
        }),
        signal: activeController.signal,
      });

      if (!response.ok) {
        // Rate-limit / validation / server errors arrive as plain JSON,
        // not a stream, since the server catches those before it starts streaming.
        let errMsg = "Something went wrong. Please try again.";
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch {
          // ignore parse failure, use default message
        }
        replyMsg.textContent = errMsg;
        replyMsg.classList.remove("essence-chat-typing");
        isSending = false;
        sendBtn.disabled = false;
        return;
      }

      if (!response.body || !response.body.getReader) {
        throw new Error("Streaming not supported by this browser.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleEvent = (rawEvent) => {
        const dataLines = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.trim().startsWith("data:"))
          .map((line) => line.trim().slice(5).trim());
        if (dataLines.length === 0) return;

        const jsonStr = dataLines.join("");
        let evt;
        try {
          evt = JSON.parse(jsonStr);
        } catch {
          return;
        }

        if (evt.type === "sources") {
          sources = evt.sources || [];
        } else if (evt.type === "delta" && evt.text) {
          if (!firstDeltaReceived) {
            replyMsg.classList.remove("essence-chat-typing");
            replyMsg.textContent = "";
            firstDeltaReceived = true;
          }
          fullText += evt.text;
          replyMsg.textContent = fullText;
          messages.scrollTop = messages.scrollHeight;
        } else if (evt.type === "error") {
          replyMsg.textContent = evt.message || "Something went wrong.";
          replyMsg.classList.remove("essence-chat-typing");
          if (!replyMsg.querySelector(".essence-chat-retry")) {
            const retry = el("button", "essence-chat-retry", "Try again");
            retry.type = "button";
            retry.setAttribute("aria-label", "Try the AI request again");
            replyMsg.appendChild(retry);
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop(); // keep incomplete event for next chunk

        for (const rawEvent of events) {
          handleEvent(rawEvent);
        }
      }

      if (buffer.trim()) handleEvent(buffer);

      if (!fullText) {
        // Stream ended with nothing rendered (e.g. immediate error event).
        replyMsg.classList.remove("essence-chat-typing");
        if (!replyMsg.textContent || replyMsg.textContent === "Thinking…") {
          replyMsg.textContent = "Didn't get a response.";
          const retry = el("button", "essence-chat-retry", "Try again");
          retry.type = "button";
          retry.setAttribute("aria-label", "Try the AI request again");
          replyMsg.appendChild(retry);
        }
      }

      if (sources.length > 0) {
        const sourcesEl = el("div", "essence-chat-sources");
        sourcesEl.appendChild(document.createTextNode("Based on: "));
        sources.forEach((source) => {
          if (source.url) {
            const link = el("a", "essence-chat-source-link", source.title);
            link.href = source.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            sourcesEl.appendChild(link);
          } else {
            sourcesEl.appendChild(document.createTextNode(source.title || ""));
          }
          sourcesEl.appendChild(document.createTextNode(" "));
        });
        messages.appendChild(sourcesEl);
        messages.scrollTop = messages.scrollHeight;
      }

      if (fullText) {
        history.push({ role: "user", content: text });
        history.push({ role: "assistant", content: fullText });
        if (history.length > MAX_HISTORY_TURNS * 2) {
          history = history.slice(-MAX_HISTORY_TURNS * 2);
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        replyMsg.textContent = "Response stopped.";
      } else {
        replyMsg.textContent = "Couldn't reach the chat service.";
        const retry = el("button", "essence-chat-retry", "Try again");
        retry.type = "button";
        replyMsg.appendChild(retry);
      }
      replyMsg.classList.remove("essence-chat-typing");
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      if (cancelBtn) cancelBtn.hidden = true;
      activeController = null;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget);
  } else {
    buildWidget();
  }
})();
