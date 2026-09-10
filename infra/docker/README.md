# infra/docker

Local development runtime assets referenced by the root `docker-compose.yml`.

## Layout

```text
infra/docker/
├── postgres/
│   └── init/        # optional *.sql / *.sh scripts run once on first DB init
└── README.md
```

## Scope

- This directory holds Compose-adjacent assets for local development only
  (see spec §78, "Docker Compose codifies application runtime").
- Terraform (`infra/terraform`) and Ansible (`infra/ansible`) own external
  infrastructure and Raspberry Pi host configuration respectively; do not
  duplicate that responsibility here.
- `api/`, `web/`, and `admin/` service definitions and their Dockerfiles are
  added by each app's owning implementation phase, once the apps exist. Until
  then, `docker-compose.yml` only defines the `postgres` and `mailpit`
  dependencies described by this task (F02).

## Postgres init scripts

Files placed in `postgres/init/` are executed once, in lexical order, only
when the `postgres-data` volume is first created (see the official
`postgres` image's `docker-entrypoint-initdb.d` behavior). This directory is
currently empty; Prisma migrations (owned by D00) are the source of truth for
schema changes and should not be duplicated here.
