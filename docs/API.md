# API Documentation

Version: 1.0

Status: Living Document

---

# Overview

Essence exposes a REST API that powers:

- Authentication
- Comments
- Analytics
- Tags
- Newsletter
- Administration

All endpoints return JSON unless otherwise specified.

---

# Base URL

Development

http://localhost:3000

Production

Configured by deployment environment.

---

# Authentication

Some endpoints require authentication.

When authenticated, include:

Authorization: Bearer <token>

---

# Authentication API

## Login

POST /api/auth/login

Purpose

Authenticate an existing user.

Authentication

Not required.

Request

To be documented from implementation.

Response

To be documented from implementation.

Possible Responses

200 OK

400 Bad Request

401 Unauthorized

500 Internal Server Error

---

## Register

POST /api/auth/register

Purpose

Create a new account.

Authentication

Not required.

Request

To be documented from implementation.

Response

To be documented from implementation.

Possible Responses

201 Created

400 Bad Request

409 Conflict

500 Internal Server Error

---

## Validate Token

POST /api/auth/validate

Purpose

Validate an existing authentication token.

Authentication

Bearer Token

Response

To be documented from implementation.

---

# Comments API

## Get Comments

GET /api/comments/:postId

Purpose

Retrieve comments for a blog post.

Authentication

Not required.

Path Parameters

postId

Returns

List of comments.

Exact schema

To be documented from implementation.

---

## Create Comment

POST /api/comments

Purpose

Submit a new comment.

Authentication

Implementation-dependent.

Request

To be documented from implementation.

Response

To be documented from implementation.

---

## Delete Comment

DELETE /api/comments/:id

Purpose

Delete a comment.

Authentication

Administrator or owner (implementation-dependent).

---

# Analytics API

## Record Page View

POST /api/analytics/view/:postId

Purpose

Increment page view count.

Authentication

Not required.

Path Parameters

postId

Returns

Success response.

Exact schema

To be documented.

---

## Analytics Dashboard

GET /api/analytics

Purpose

Retrieve analytics information.

Authentication

Implementation-dependent.

---

# Tags API

## Popular Tags

GET /api/tags/popular

Purpose

Return popular tags.

Authentication

Not required.

Returns

Tag collection.

Schema

To be documented.

---

# Newsletter API

Newsletter functionality exists within the application.

Observed endpoint(s)

To be documented from implementation.

---

# Admin API

## Admin Login

POST /api/admin/login

Purpose

Authenticate administrator.

Authentication

Not required.

---

## Subscribers

GET /api/admin/subscribers

Purpose

Return newsletter subscribers.

Authentication

Administrator.

---

## Export Subscribers

GET /api/admin/subscribers/export

Purpose

Export subscriber list.

Authentication

Administrator.

Response

Implementation-dependent.

---

## Delete Subscriber

DELETE /api/admin/subscribers/:id

Purpose

Remove subscriber.

Authentication

Administrator.

---

# HTTP Status Codes

200 OK

201 Created

204 No Content

400 Bad Request

401 Unauthorized

403 Forbidden

404 Not Found

409 Conflict

422 Unprocessable Entity

500 Internal Server Error

---

# Authentication Flow

Client

↓

POST /api/auth/login

↓

JWT returned

↓

Stored in localStorage

↓

Authorization header added

↓

Protected API requests

---

# Error Format

Target Format

```json
{
  "success": false,
  "message": "Human-readable error",
  "code": "ERROR_CODE"
}
```

Current implementation

To be verified.

---

# Success Format

Target Format

```json
{
  "success": true,
  "data": {}
}
```

Current implementation

To be verified.

---

# Versioning

Current

No API versioning observed.

Future Recommendation

/api/v1/

for long-term compatibility.

---

# Security Notes

- Validate all user input.
- Use parameterized SQL.
- Never expose secrets.
- Authenticate protected endpoints.
- Rate-limit public endpoints.
- Sanitize user-generated content.
- Escape rendered HTML where required.

---

# Endpoints Observed

| Endpoint | Method | Status |
|-----------|--------|--------|
| /api/auth/login | POST | Observed |
| /api/auth/register | POST | Observed |
| /api/auth/validate | POST | Observed |
| /api/comments/:postId | GET | Observed |
| /api/comments | POST | Observed |
| /api/comments/:id | DELETE | Observed |
| /api/analytics | GET | Observed |
| /api/analytics/view/:postId | POST | Observed |
| /api/tags/popular | GET | Observed |
| /api/admin/login | POST | Observed |
| /api/admin/subscribers | GET | Observed |
| /api/admin/subscribers/export | GET | Observed |
| /api/admin/subscribers/:id | DELETE | Observed |

---

# Maintenance Notes

Whenever a new endpoint is added:

1. Add it to this document.
2. Document request parameters.
3. Document response schema.
4. Document authentication requirements.
5. Document expected status codes.
6. Link to the frontend module that consumes it.

This document is the single source of truth for the Essence REST API.