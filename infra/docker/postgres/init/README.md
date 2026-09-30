This directory contains no init scripts by default; only this README and an
empty `.gitkeep` placeholder.

Scripts placed here run once against a fresh `postgres-data` volume via the
official postgres image's `docker-entrypoint-initdb.d` mechanism. Schema
changes belong to Prisma migrations (owned by D00), not to scripts in this
directory.
