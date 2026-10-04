# AGENTS.md — guidance for coding agents (Copilot coding agent, Codex, Claude)

This is `saulpatinojr/HCW-AzMigrateOrchestrator_App`: the Azure appliance. The shared migration core and the rule corpus are **not in this tree**; they come from
`saulpatinojr/HCW-AzMigrateOrchestrator_Addon` checked out as a sibling directory at the ref pinned in `.github/workflows/*.yml` (ADR-0027).

Build/test: `npm run addon:bootstrap` (clones and builds the sibling at the pinned ref) then `npm ci && npm test`. Web UI: `npm run web:build`.
Conventions and invariants: `CLAUDE.md`. Review expectations: `.github/copilot-instructions.md`.
AI-created changes go through the review → fix → current-head verification cycle in `.github/setup/HANDSHAKE.md`.
