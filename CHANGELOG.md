# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-06-30

### Fixed

- **pnpm projects: end-user `pnpm install` no longer fails.** Scaffolded pnpm
  apps now ship a valid `pnpm-workspace.yaml` that resolves pnpm 11's
  `ERR_PNPM_IGNORED_BUILDS` for the dependency build scripts Next.js/shadcn pull
  in (`sharp`, `unrs-resolver`). Replaces the placeholder file `create-next-app`
  leaves behind, so there is no duplicate-key YAML error.

## [0.3.0] - 2026-06-29

### Changed

- **BREAKING: minimum Node.js is now 22** (was 20). The generated app's
  toolchain requires it — pnpm 11's binary needs `node:sqlite` (Node ≥22.13) and
  lint-staged's `listr2` requires Node ≥22.13 (Yarn enforces this strictly).
  `engines`, the runtime check, and the docs were updated to match.

### Fixed

- **pnpm 11:** the scaffold no longer aborts during `shadcn init` with
  `ERR_PNPM_IGNORED_BUILDS` (pnpm 11 defaults `strictDepBuilds=true`).
- **Husky setup in any folder:** the project is now `git init`-ed before Husky
  runs when it isn't already its own repository — `create-next-app` skips/rolls
  back git init when nested in an existing repo or when no git identity is
  configured, which previously failed the scaffold at the very end.

### Added

- Continuous integration on every pull request: unit tests on Node 22/24 plus an
  end-to-end scaffold-and-build across npm, pnpm, yarn, and bun.

## [0.2.0] - 2026-06-26

### Fixed

- **Argument parsing:** boolean flags no longer consume the project name. Orders
  like `create-next-shadcn-kit --pnpm my-app` and `--no-husky my-app` now keep
  `my-app` as the project name.
- **Project name validation** now runs on every path (including `--yes` and a
  name passed directly as an argument), rejecting invalid names and path
  traversal before any file system or process operation.
- **Redux import alias:** the generated `<Providers>` import is derived from the
  chosen import alias instead of being hard-coded to `@/`, so a custom alias
  (e.g. `~/*`) produces resolvable imports.

### Added

- Unit test suite (`node --test`) covering argument parsing, name validation,
  and the import-alias helper.
- The publish workflow now runs `npm test` before publishing.

## [0.1.2] - 2026-04-21

### Fixed

- Use `npx` to run the shadcn CLI for compatibility with Yarn v1.
- Require Node.js 20+.

## [0.1.1] - 2026-04-18

### Added

- npm publishing via OIDC trusted publisher, package metadata, and README
  badges.

## [0.1.0]

### Added

- Initial release: scaffold a Next.js app with shadcn/ui pre-integrated, with
  optional state management (Redux Toolkit or Zustand) and Husky + lint-staged +
  Prettier setup.

[0.3.1]: https://github.com/NikunjSonigara/create-next-shadcn-kit/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/NikunjSonigara/create-next-shadcn-kit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/NikunjSonigara/create-next-shadcn-kit/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/NikunjSonigara/create-next-shadcn-kit/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/NikunjSonigara/create-next-shadcn-kit/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/NikunjSonigara/create-next-shadcn-kit/releases/tag/v0.1.0
