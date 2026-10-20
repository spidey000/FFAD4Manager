# Vendored source provenance

This package is vendored from the `viewer-package` directory of the canonical
Three_Slicer monorepo release `v0.3.5`.

- Canonical commit: `917b79d3bda5beb83d55fa2de828ffa8e33e8a02`
- Upstream `viewer-package` tree: `48f32478be72f61e33895a2cf427e7d45a65e3c1`
- Verified mirror commit: `b3ab1b9183278d103b7ddbdcee3198036174bf2e` (same package tree)

The source package, tests, fixtures, `LICENSE`, and `THIRD-PARTY-NOTICES.md`
are retained from upstream. This file documents the local vendoring and does
not replace or modify the upstream license.

## Updating

To update, check out an explicitly selected canonical upstream tag (do not use
the moving `main` branch), verify the `viewer-package` tree against its
recorded commit/tree provenance, and replace this directory with that source.
Keep the upstream license, notices, source, tests, and fixtures intact; then
update this provenance record and the local package lock as needed. The root
`web` build runs this package's upstream build before Vite builds the host.
That build creates the package's ignored `dist/` locally; generated output is
not committed.
