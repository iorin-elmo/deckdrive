This directory is intentionally empty.

Scripts placed here run once against a fresh `postgres-data` volume via the
official postgres image's `docker-entrypoint-initdb.d` mechanism. Schema
changes belong to Prisma migrations (owned by D00), not to scripts in this
directory.
