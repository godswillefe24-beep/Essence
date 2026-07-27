# Essence Architecture

Version: 1.0
Status: Initial Audit

---

# Overview

Essence is a full-stack AI-powered blogging platform.

The frontend is primarily static HTML enhanced with JavaScript, while the
backend exposes REST APIs backed by a Turso (libSQL) database.

Unlike a traditional static blog, the site includes:

- AI-powered contextual chat
- User authentication
- Comments
- Analytics
- Likes
- Newsletter subscribers
- Admin dashboard
- Search
- Categories
- Progressive Web App support

---

# High-Level Architecture

                    Browser
                       │
        ┌──────────────┴──────────────┐
        │                             │
     HTML/CSS                    JavaScript
        │                             │
        └──────────────┬──────────────┘
                       │
                    REST API
                       │
        ┌──────────────┼──────────────┐
        │              │              │
      Turso         AI Service      Analytics
      Database

---

# Frontend

Technology

- HTML5
- CSS3
- Vanilla JavaScript

Main Pages

- Home
- Individual blog posts
- Admin dashboard
- Subscribers admin
- Authentication modal

Features

✓ Theme toggle

✓ Reading progress

✓ Search

✓ Categories

✓ Comments

✓ Likes

✓ Related posts

✓ Analytics

✓ Share buttons

✓ AI Chat

✓ Authentication

✓ Newsletter

---

# Backend

The frontend communicates with a REST API.

Observed endpoints include:

Authentication

POST /api/auth/login

POST /api/auth/register

POST /api/auth/validate

Comments

GET /api/comments/:postId

POST /api/comments

Analytics

GET /api/analytics

POST /api/analytics/view/:postId

Tags

GET /api/tags/popular

Admin

POST /api/admin/login

GET /api/admin/subscribers

DELETE /api/admin/subscribers/:id

GET /api/admin/subscribers/export

---

# Database

Database

Turso (libSQL)

Database wrapper

db.js

Functions

all()

get()

run()

transaction()

Database access is centralized.

---

# Authentication

Frontend stores:

auth_token

auth_user

Authentication flow

Login

↓

Backend validates

↓

JWT returned

↓

Stored in localStorage

↓

Authenticated requests use Authorization header

---

# AI System

The AI chat widget is page-aware.

Workflow

Current page

↓

Extract article content

↓

Send pageContext

↓

Backend AI

↓

Response

Important:

The page structure is part of the AI system.

---

# Analytics

Tracks:

- page views
- likes
- subscribers

Some analytics come from the backend while localStorage is used as a fallback.

---

# Service Worker

The application registers:

service-worker.js

Purpose

- Offline caching
- Faster loading
- PWA support

---

# Local Storage

Current keys include

blog_data

auth_token

auth_user

admin_token

---

# Existing Strengths

✓ Clean Turso wrapper

✓ API-driven architecture

✓ AI context awareness

✓ Authentication

✓ Modular frontend

✓ PWA support

✓ SEO

✓ Admin dashboard

---

# Areas for Improvement

1. Create a reusable article template.

2. Replace duplicated HTML across posts.

3. Introduce design tokens.

4. Create reusable UI components.

5. Improve CSS organization.

6. Improve documentation.

7. Add automated testing.

---

# Protected Systems

These must remain compatible during development.

- AI Chat
- Turso
- Authentication
- Comments
- Analytics
- Service Worker
- Existing API endpoints

No breaking changes should be introduced without updating dependent code.

---

# Development Philosophy

Improve the implementation.

Do not change behavior.

Maintain backward compatibility.