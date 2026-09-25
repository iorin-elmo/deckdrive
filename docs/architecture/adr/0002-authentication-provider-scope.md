# ADR 0002: Initial authentication provider scope

- Status: Accepted
- Date: 2026-09-26

## Context

DeckDrive has provider adapters for Google, Discord, and X, plus a cookie
session and explicit account-linking boundary. Provider onboarding and its
operational overhead differ substantially, however. Local browser verification
has been completed with Discord; Google and X have not been adopted for the
initial product surface.

## Decision

The initial supported social login is Discord OAuth. The product will also add
an email-address login flow as the non-social alternative.

Google and X are not advertised or enabled in the initial UI or deployment.
Their adapters remain internal extension points and require a separate product,
privacy, provider-configuration, and live E2E decision before activation.

Discord OAuth continues to use authorization-code flow with PKCE, one-time
state validation, the signed HttpOnly OAuth-state cookie, and a server-side
opaque session. Provider client secrets remain deployment-only configuration.

## Consequences

- The login screen exposes Discord as the only social provider.
- Missing Google/X credentials are not a production incident while those
  providers are out of scope.
- Email login is intentionally not represented by development authentication;
  it needs its own verification, rate-limit, recovery, and E2E work item.
- Any future Google/X activation must include provider-specific live E2E and
  update this ADR before the UI is changed.
