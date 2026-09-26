# ADR 0002: Initial authentication provider scope

- Status: Accepted
- Date: 2026-09-26

## Context

DeckDrive needs a small, supportable authentication surface. Local browser
verification has been completed with Discord OAuth, while the email-address
flow remains a separate product and security work item.

## Decision

The initial supported social login is Discord OAuth. The product will also add
an email-address login flow as the non-social alternative.

Google and X are not supported. Their provider adapters, configuration, and
database enum values are not part of the product contract.

Discord OAuth continues to use authorization-code flow with PKCE, one-time
state validation, the signed HttpOnly OAuth-state cookie, and a server-side
opaque session. Provider client secrets remain deployment-only configuration.

## Consequences

- The login screen exposes Discord as the only social provider.
- Google / X are not supported or configured.
- Email login is intentionally not represented by development authentication;
  it needs its own verification, rate-limit, recovery, and E2E work item.
- A future decision to add a provider must introduce it as a new scoped change,
  including provider-specific live E2E and an ADR update.
