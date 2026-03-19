# Governance

How Korvo Atlas is structured, what is open, and what is commercial.

---

## Principle

> **If removing it would break trust in the system → it must be open.**
> **If removing it would break the user experience → it can be closed.**

---

## Atlas = The Open Protocol

Korvo Atlas is an open-source protocol and API for publishing, verifying, and structuring research.

The following components are open source under the [Apache License 2.0](./LICENSE):

- **Core schemas** — JSON Schema definitions for all research objects (questions, sources, claims, artifacts, validators, chain records, challenges, endorsements, revisions)
- **REST API** — Full CRUD endpoints for all research objects
- **Blockchain publish layer** — Bundle, hash, store, and anchor research artifacts on-chain
- **Verification logic** — Content hashing, on-chain proof verification, verification CLI
- **Storage and chain adapters** — Pluggable interfaces for IPFS, Arweave, Base L2, Arbitrum, Solana
- **Challenge and endorsement system** — Open dispute and validation workflows
- **Revision history** — Transparent audit trail for all artifact changes
- **OpenAPI specification** — Machine-readable API documentation
- **SDK and client libraries** — Tools for integrating with Atlas
- **Seed data and development tooling** — Everything needed to run Atlas locally

Anyone can:
- Run their own Atlas node
- Verify any published research artifact independently
- Build applications on top of the Atlas API
- Contribute to the protocol via pull requests
- Inspect how every part of the trust system works

---

## Korvo = The Commercial Product

[Korvo](https://korvo.io) is the company that operates the canonical Atlas public hub and builds commercial products on top of the open protocol.

The following components are developed and operated by Korvo and are **not** part of the open-source project:

- **Korvo Chat App** — The conversational research interface ("ChatGPT for research")
- **LLM orchestration** — Model selection, prompt engineering, research agent logic
- **Trust-weighted ranking** — Advanced search and discovery algorithms
- **Reputation engine** — The algorithm that computes validator reputation scores, anti-gaming heuristics, and reviewer matching
- **Paper ingestion pipeline** — Automated crawling, parsing, and structuring of open-access papers
- **Enterprise features** — Team workspaces, private research, managed APIs, SSO/SAML, SLA-backed service
- **Anti-abuse systems** — Spam detection, quality filtering, content moderation
- **Hosted infrastructure** — The canonical public hub at `atlas.korvo.io`, managed database, CDN, monitoring

---

## The Canonical Hub

Korvo operates the canonical public Atlas hub. This is the primary instance where:

- Research is published and discoverable
- Validators build reputation
- On-chain anchoring happens by default
- The global research graph grows

Self-hosted Atlas nodes can operate independently, but the canonical hub is where the network effects concentrate.

---

## Decision-Making

For the open-source Atlas protocol:

- **Schema changes** — Proposed via GitHub issues and pull requests. Breaking changes require community discussion.
- **New object types** — Require a JSON Schema, database migration, API endpoints, and documentation.
- **Protocol changes** — Changes to hashing, anchoring, or verification logic require careful review since they affect trust guarantees.
- **Feature requests** — Filed as GitHub issues. Community contributions welcome.

Korvo maintains final merge authority on the open-source repository to ensure protocol integrity and quality standards.

---

## Trademarks

The names "Korvo" and "Korvo Atlas", and any associated logos, marks, or branding, are not granted under the open-source license and remain protected brand assets. See [TRADEMARKS.md](./TRADEMARKS.md).

---

## No Token

Korvo Atlas does not have and does not plan to issue a cryptocurrency token. The blockchain layer exists for integrity proofs and provenance, not financialization. This position may evolve, but only if there is a clear, non-speculative utility case.

---

## Summary

| Component | Open / Closed | Where |
|-----------|:------------:|-------|
| Schemas & validation | Open | This repo |
| REST API & endpoints | Open | This repo |
| Chain publish & verify | Open | This repo |
| Challenge & endorsement | Open | This repo |
| Revision history | Open | This repo |
| OpenAPI spec & SDKs | Open | This repo |
| Verification CLI | Open | This repo |
| Reputation algorithm | Closed | Korvo |
| LLM orchestration | Closed | Korvo |
| Trust-weighted search | Closed | Korvo |
| Paper ingestion pipeline | Closed | Korvo |
| Enterprise features | Closed | Korvo |
| Anti-abuse systems | Closed | Korvo |
| Canonical hub operations | Closed | Korvo |

