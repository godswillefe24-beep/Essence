# AI System Documentation

Version: 1.0

Status: Living Document

---

# Overview

Essence includes an integrated AI assistant capable of answering
questions about the current page.

Unlike a generic chatbot, the assistant receives contextual information
from the article currently being viewed.

This allows users to ask questions such as:

- Summarize this article.
- Explain this section.
- Give examples.
- Simplify this topic.
- Ask follow-up questions.

---

# Objectives

The AI system exists to:

✓ Improve reader understanding

✓ Increase engagement

✓ Explain difficult concepts

✓ Answer article-specific questions

✓ Provide contextual assistance

The AI is intended to enhance the reading experience rather than replace
the article.

---

# High-Level Architecture

                User
                  │
                  ▼
          Chat Widget (Browser)
                  │
                  ▼
       Extract Current Page Context
                  │
                  ▼
      Build AI Request Payload
                  │
                  ▼
            Backend AI Route
                  │
                  ▼
           Large Language Model
                  │
                  ▼
             AI Response
                  │
                  ▼
          Chat Widget Displays Reply

---

# Core Concept

The AI does **not** answer questions using only general knowledge.

Instead, it is designed to receive information from the page currently
being viewed.

This behavior enables questions such as:

- "Summarize this post."

- "Explain this example."

- "What does the author mean?"

without requiring the article to exist in a separate database.

---

# Page Context

Observed behavior

The chat widget captures the article content currently displayed on the
page.

The captured content is sent as:

pageContext

This information is included with every AI request.

Purpose

Allow the AI to answer questions about the exact article being viewed.

---

# Context Source

Current implementation

Current page HTML

↓

Extract article text

↓

Limit context size

↓

Send to backend

The implementation limits the amount of extracted content before sending
it to the backend.

Exact extraction algorithm

To be documented from implementation.

---

# Backend Responsibilities

The backend is responsible for:

Receiving user messages

Receiving pageContext

Building the AI prompt

Sending the request to the LLM

Returning the generated response

Exact implementation

To be documented from server code.

---

# Prompt Construction

Observed behavior

The backend prioritizes pageContext over fallback data sources.

Purpose

Ensure the AI answers questions about the page currently open.

Exact system prompt

To be documented from implementation.

---

# Why pageContext Exists

Earlier versions relied on:

data/posts.json

This caused problems because the JSON file did not contain the complete
content of every article.

The system was updated so that pageContext became the primary knowledge
source for the active page.

Benefits

✓ Accurate summaries

✓ Better explanations

✓ Correct article references

✓ Reduced hallucinations

---

# Chat Widget

Responsibilities

Display conversation

Capture user input

Capture page context

Send API requests

Render AI responses

Handle loading state

Display errors

---

# AI Request

Observed fields

User message

pageContext

Additional fields

To be documented from implementation.

---

# AI Response

Expected responsibilities

Return assistant response

Handle errors gracefully

Maintain conversation flow

Exact response schema

To be documented from implementation.

---

# Error Handling

The AI system should gracefully handle:

Network failures

Backend failures

Timeouts

Empty responses

Invalid requests

Rate limits

Unavailable AI providers

Implementation details

To be documented.

---

# Security

The AI system should never expose:

Environment variables

API keys

Database credentials

Private user data

Server internals

Authentication tokens

---

# Performance

The system should:

Limit context size

Avoid unnecessary requests

Provide loading feedback

Return responses quickly

Reuse existing page content instead of re-fetching articles

---

# Protected Elements

The following are considered protected:

Chat widget HTML

Chat widget JavaScript

Backend AI endpoint

pageContext generation

Prompt builder

Changing these components may reduce answer quality or
break contextual responses.

---

# Compatibility Requirements

Every article page should contain a clear article structure so that
pageContext extraction remains reliable.

Removing or fundamentally changing the article structure may affect AI
performance.

---

# Future Improvements

Potential enhancements include:

Conversation history

Streaming responses

Code syntax highlighting

Citation support

Suggested follow-up questions

Context-aware examples

Multilingual assistance

Voice input

Voice output

Image understanding

Session memory

---

# Development Rules

When modifying the AI system:

✓ Preserve pageContext support.

✓ Preserve contextual answering.

✓ Maintain backward compatibility.

✓ Avoid unnecessary prompt changes.

✓ Keep prompt construction centralized.

✓ Validate user input.

✓ Handle failures gracefully.

---

# Observed Architecture Summary

Current Page

↓

Extract Visible Article Content

↓

pageContext

↓

Backend AI Route

↓

Prompt Builder

↓

Large Language Model

↓

Response

↓

Chat Widget

---

# Maintenance Checklist

Before deploying AI-related changes:

□ AI answers questions about the current article.

□ "Summarize this post" works correctly.

□ Context extraction still functions.

□ Empty pages are handled gracefully.

□ Errors display correctly.

□ Long articles remain within context limits.

□ No sensitive information is included in prompts.

□ Performance remains acceptable.

□ Existing frontend behavior is preserved.

---

# Future Documentation

The following implementation details should be added after inspecting the
server-side AI code:

- AI provider
- Model name
- Prompt template
- Request schema
- Response schema
- Token limits
- Context extraction algorithm
- Rate limiting
- Retry strategy
- Logging
- Monitoring