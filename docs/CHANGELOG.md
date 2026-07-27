# Contributing to Essence

Thank you for contributing to Essence.

Essence is an AI-powered blogging platform built with HTML, CSS,
JavaScript, Node.js, and Turso.

Our primary goal is to improve the project **without breaking existing functionality**.

---

## Core Principles

1. Preserve compatibility.

2. Prefer small changes over large rewrites.

3. Do not rename IDs, classes, or API routes without updating all dependent code.

4. Keep code readable.

5. Document significant architectural changes.

---

## Before You Commit

Verify that:

- AI chat still works.
- Authentication works.
- Comments load and submit.
- Likes work.
- Analytics are recorded.
- Newsletter subscriptions work.
- Service worker functions correctly.
- Mobile layout remains responsive.

---

## Coding Standards

### HTML

- Use semantic HTML5.
- Every image requires descriptive `alt` text.
- Maintain heading hierarchy (`h1` → `h2` → `h3`).
- Preserve required IDs and `data-*` attributes.

### CSS

- Reuse design tokens.
- Avoid duplicate styles.
- Prefer utility classes only when appropriate.

### JavaScript

- One responsibility per module.
- Use `const` and `let`; avoid `var`.
- Handle asynchronous operations with `async/await`.
- Catch and handle errors.
- Do not manipulate the DOM before it is ready.

### Backend

- Use the `db.js` wrapper for database access.
- Parameterize SQL queries.
- Validate all input.
- Return consistent JSON responses.

---

## AI Compatibility

The AI chat depends on the page's content structure.

Do not remove or fundamentally change the `<article>` or `<main>` content without updating the AI extraction logic.

---

## Database Rules

Never:

- hardcode credentials,
- commit `.env`,
- modify the database schema without a migration,
- bypass the shared database wrapper.

---

## Git Workflow

Commit messages should be concise and descriptive.

Examples:

feat: add syntax highlighting

fix: resolve comment submission bug

docs: update architecture documentation

refactor: simplify theme toggle logic

---

## Pull Request Checklist

- Code builds successfully.
- No console errors.
- Existing functionality is preserved.
- Documentation updated if necessary.
- Accessibility considered.
- Performance impact reviewed.

---

## Project Philosophy

Improve the implementation.

Preserve the user experience.

Every change should leave the codebase cleaner than it was before.

# AI-Assisted Development

AI-generated code must:

- Follow the project's architecture.
- Preserve protected elements.
- Be reviewed before committing.
- Include comments only when they improve clarity.
- Avoid unnecessary dependencies.
- Match the project's coding style.