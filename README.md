# DECK//DRIVE

DECK//DRIVE is a browser-based digital card game. This repository is a pnpm
workspace for its web, API, admin, and shared packages.

## Repository layout

- `apps/` — deployable web, API, and admin applications.
- `packages/` — reusable domain, UI, configuration, logging, and test packages.
- `infra/` — Terraform, Ansible, and Docker assets.
- `tests/` — end-to-end, integration, and shared test fixtures.
- `docs/` — architecture, API, game, and operations documentation.
- `scripts/` — developer and operational command-line tools.

The directories are intentionally scaffolded without application source. The
implementation and quality gates are introduced by their owning Phase 0 tasks.

## Toolchain contract

Tool versions are pinned in `mise.toml`; do not replace them with floating
versions in individual workspaces.

| Tool | Version | Purpose |
| --- | --- | --- |
| Node.js | 26.8.2 | JavaScript runtime |
| pnpm | 12.3.4 | Workspace package manager |
| Terraform | 1.16.1 | Infrastructure provisioning |
| pipx | 1.17.2 | Ansible installer (WSL2/Linux only) |
| Ansible | 14.4.0 | Host configuration (WSL2/Linux only) |

## Setup

Install [mise](https://mise.jdx.dev/) and activate it in your shell, then run:

```sh
mise install
pnpm install
```

The generated `pnpm-lock.yaml` is part of the workspace contract. CI and clean
checkouts should use `pnpm install --frozen-lockfile`.

## Quality commands

Shared TypeScript, ESLint, and Prettier configuration lives in
`packages/config` and is wired from the repository root. Every workspace
project has a minimal `src/index.ts`, `tsconfig.json` (extending
`packages/config/tsconfig/base.json`), and `build` / `typecheck` scripts.

```sh
pnpm lint       # eslint .
pnpm format     # prettier --check .
pnpm typecheck  # tsc -p tsconfig.json --noEmit in every workspace project
pnpm build      # tsc -p tsconfig.json in every workspace project
pnpm test       # vitest run
```

`pnpm format:write` applies Prettier fixes. Markdown files and the generated
`pnpm-lock.yaml` are excluded from Prettier via `.prettierignore`.

## Platform boundary

Node.js, pnpm, and Terraform are supported on Windows, WSL2, and Linux. Use a
current PowerShell on Windows, or a POSIX shell in WSL2/Linux, consistently for
each checkout. Ansible control-node execution is supported only in WSL2 or
Linux; do not run playbooks from native Windows. Docker runtime setup belongs to
F02 and is not supplied by this scaffold.
