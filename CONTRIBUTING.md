# Contributing

1. Fork/branch, `npm run addon:bootstrap` (sibling core at the pinned ref), `npm ci`, make the change, `npm test`, `npm run web:build`.
2. Rules and core packages are changed in `saulpatinojr/HCW-AzMigrateOrchestrator_Addon`; bump `ADDON_REF` here in a reviewed PR to consume them.
3. Fill the PR template honestly: what you ran, what you did not, and why. Link requirement IDs.
4. Keep ADRs for design decisions and `VALIDATION.md` for limitations current.
5. Be kind; see `CODE_OF_CONDUCT.md`.
