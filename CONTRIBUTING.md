# Contributing to Korvo Atlas

Thank you for your interest in contributing! This guide will help you get started.

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/korvohq/atlas.git
cd atlas

# Install dependencies
npm install

# Seed the database with example data
npm run seed

# Start the dev server
npm run dev
```

The API will be running at `http://localhost:3000`.

---

## Project Structure

```
atlas/
├── schemas/            # JSON Schema definitions for core objects
│   ├── question.json
│   ├── source.json
│   ├── claim.json
│   ├── artifact.json
│   └── validator.json
├── src/
│   ├── server.ts       # Express app entry point
│   ├── validation.ts   # AJV schema validators
│   ├── db/
│   │   └── database.ts # SQLite setup & migrations
│   └── routes/
│       ├── questions.ts
│       ├── sources.ts
│       ├── claims.ts
│       ├── artifacts.ts
│       └── validators.ts
├── seeds/
│   └── seed.ts         # Example research data
└── package.json
```

---

## Core Object Model

| Object       | Description                                                |
| ------------ | ---------------------------------------------------------- |
| **Question** | A research question — the starting point for investigation |
| **Source**   | Evidence or reference material backing a claim             |
| **Claim**    | A structured assertion derived from evidence               |
| **Artifact** | A research output composed from claims and sources         |
| **Validator**| A reviewer, contributor, or agent providing verification   |

Every object has a formal JSON Schema in `/schemas`. All API inputs are validated against these schemas.

---

## API Endpoints

All endpoints are under `/api`. Each resource supports:

| Method   | Path                    | Description        |
| -------- | ----------------------- | ------------------ |
| `GET`    | `/api/{resource}`       | List all           |
| `GET`    | `/api/{resource}/:id`   | Get by ID          |
| `POST`   | `/api/{resource}`       | Create             |
| `PATCH`  | `/api/{resource}/:id`   | Update             |
| `DELETE` | `/api/{resource}/:id`   | Delete             |

Resources: `questions`, `sources`, `claims`, `artifacts`, `validators`

---

## How to Contribute

### 1. Pick an issue
Browse [open issues](https://github.com/korvohq/atlas/issues) or propose a new one.

### 2. Fork & branch
```bash
git checkout -b feat/your-feature
```

### 3. Make your changes
- Follow the existing code style (TypeScript, Express routers)
- Add/update JSON Schemas if you change the object model
- Add seed data for new objects

### 4. Test locally
```bash
npm run seed:fresh   # reset DB and re-seed
npm run dev          # start server and verify
```

### 5. Open a PR
- Write a clear description of what changed and why
- Reference the issue number if applicable

---

## Areas Where Help Is Needed

- **Schema design** — refining the core object model
- **Validation layer** — endorsement, challenge, and reputation logic
- **Graph queries** — traversing relationships between objects
- **Search & discovery** — full-text search across artifacts and claims
- **Documentation** — API docs, guides, examples
- **Testing** — unit and integration tests
- **Frontend** — a web UI for browsing the research graph

---

## Code of Conduct

Be respectful. We're building public research infrastructure — that starts with treating each other well.

---

## License

By contributing, you agree that your contributions will be licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](./LICENSE). You also agree to the terms of the [Contributor License Agreement (CLA)](./CLA.md), which allows Korvo (the company) to use your contributions in its commercial products under a separate license.

