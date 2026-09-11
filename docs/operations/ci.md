# CI

The `Quality` workflow is the Phase 0 pull-request and branch acceptance
gate. It runs for every pull request and for pushes to `develop` and `main`.
The workflow has read-only repository permissions and cancels a superseded run
for the same ref.

## Current required check

Configure `quality` as a required status check for pull requests targeting
`develop` and `main`. It performs a clean installation using the versions
fixed by the workspace contract, then runs:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm format
pnpm typecheck
pnpm test
pnpm build
```

`pnpm install --frozen-lockfile` validates that the committed lockfile is
sufficient for a clean checkout. The workflow caches pnpm's store, never
`node_modules`.

## Test gates by delivery phase

Only checks that execute a real command and can fail are present in CI. An
unimplemented test category must not be represented by an always-successful
workflow job or made a required check.

| Gate | Current state | Owner / enablement condition |
| --- | --- | --- |
| Lint | Required in `quality` | F01 baseline is implemented. |
| Format check | Required in `quality` | F01 baseline is implemented. |
| Typecheck | Required in `quality` | F01 baseline is implemented. |
| Unit tests | Required in `quality` | Vitest has a real configuration-validation test from F01. |
| Build | Required in `quality` | F01 workspace packages provide build commands. |
| Integration tests | Not introduced | Add a failing-capable command and CI job when a service integration test exists (D00/D01 and later). |
| Engine replay regression | Not introduced | Add after replay fixtures and the regression suite exist (R00/R02). |
| E2E | Not introduced | Add after the user-facing flows and Playwright suite exist (W00 and later). |
| Docker image build | Not introduced | Add once app Dockerfiles exist; F02 supplies only PostgreSQL and Mailpit runtime services. |

The product specification requires lint, formatting, typecheck, unit,
integration, replay, and build checks for pull requests, plus E2E and Docker
image builds for `main`. The missing gates above remain explicit delivery work;
they do not pass by omission and must be added before their owning feature is
accepted for production.

## Local reproduction

Run the same commands from a clean checkout after installing the versions in
`mise.toml`:

```sh
mise install
pnpm install --frozen-lockfile
pnpm lint
pnpm format
pnpm typecheck
pnpm test
pnpm build
```

F02's Compose runtime is validated separately with `docker compose config` and
the local setup script. CI does not start PostgreSQL or Mailpit until an
integration suite requires them.

## Branch protection

After the workflow has completed successfully once, configure branch
protection for `develop` and `main` to require the `quality` check and an
independent pull-request review. Do not use an administrative bypass to merge
changes that have not passed the required check.
