# Protected Elements

Version: 1.0

## Purpose

This document lists every HTML element, API route, JavaScript hook, localStorage key, and data attribute that other parts of Essence depend on.

Changing any of these requires updating every dependent file.

---

# HTML IDs

These IDs are referenced by JavaScript.

Do NOT rename without updating the corresponding scripts.

## Authentication

auth-modal

auth-btn

logout-btn

user-info

login-form

register-form

---

## Comments

comments-section

comment-form

comment-name

comment-text

comment-submit

---

## Search

search-input

search-results

---

## Theme

theme-toggle

---

## AI Chat

chat-widget

chat-input

chat-send

chat-messages

---

## Newsletter

newsletter-form

newsletter-email

---

# HTML Classes

These are queried by JavaScript.

.comments-section

.comment

.comment-submit

.comment-name

.comment-text

.post-card

.filter-btn

.tag

.like-button

.share-button

.theme-toggle

.sidebar-widget

.related-post

.popular-post

.recent-post

---

# data-* Attributes

These are application contracts.

data-post-id

Used by:

Comments

Likes

Analytics

Related posts

Must always contain the correct post ID.

---

data-category

Used for homepage filtering.

---

data-tag

Used for tag system.

---

data-share

Used by share buttons.

---

# Local Storage Keys

Do not rename.

auth_token

auth_user

admin_token

theme

blog_data

---

# API Endpoints

Authentication

POST /api/auth/login

POST /api/auth/register

POST /api/auth/validate

---

Comments

GET /api/comments/:postId

POST /api/comments

DELETE /api/comments/:id

---

Analytics

GET /api/analytics

POST /api/analytics/view/:postId

---

Admin

POST /api/admin/login

GET /api/admin/subscribers

GET /api/admin/subscribers/export

DELETE /api/admin/subscribers/:id

---

Tags

GET /api/tags/popular

---

# Database

The following wrapper functions are public contracts.

all()

get()

run()

transaction()

Do not change signatures without updating the entire backend.

---

# AI Chat Requirements

Every article page must contain:

<main>

or

<article>

containing the article content.

The AI extracts page content to build pageContext.

Changing the page structure may reduce AI answer quality.

---

# Article Requirements

Every post must include

Title

Description

Canonical URL

Open Graph

Twitter Card

JSON-LD

Comments section

Correct data-post-id

Hero image

Publication date

---

# JavaScript Modules

The following modules should remain backward compatible.

Theme

Authentication

Comments

Analytics

AI Chat

Search

Related Posts

Likes

Newsletter

---

# Service Worker

Changing file names requires updating

service-worker.js

CACHE_NAME

precache list

---

# Breaking Change Checklist

Before committing code, verify:

□ AI still answers questions about the current page.

□ Comments still load.

□ Comments can be submitted.

□ Likes still work.

□ Analytics still increment.

□ Search still works.

□ Categories still filter.

□ Authentication still works.

□ Theme still persists.

□ Newsletter still submits.

□ Service worker updates correctly.

□ Mobile layout still works.

If any item fails,

DO NOT MERGE.