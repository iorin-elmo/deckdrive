# Phase 4 API contract

The native HTTP adapter serves the versioned `/api/v1` controller. The adapter
is deliberately separate from domain services and the game engine.

## Authentication boundary

認証済みAPIは `deckdrive_session` Cookieからユーザーとプレイヤーを特定します。
本番では `X-Deckdrive-Player-Id` による認証は許可しません。この旧ヘッダーは
`NODE_ENV=development` または `test` の場合だけ利用できます。

`POST /api/v1/auth/development` は `NODE_ENV=development` のローカル開発専用です。
本文 `{ email, displayName }` に対して `{ playerId, displayName, csrfToken }` と
セッションCookieを返します。他環境では404です。本番のメールログインではありません。

## OAuth / session contract (O00)

対応プロバイダーはDiscordのみです。Google / Xは非対応、メールログインは別タスクです。
方針は [ADR 0002](../architecture/adr/0002-authentication-provider-scope.md) を参照してください。

| メソッド・パス | 契約 |
| --- | --- |
| `GET /api/v1/auth/oauth/discord/start?returnTo=/home` | ブラウザをDiscord認可画面へ302リダイレクトし、試行ごとの署名付きstate Cookieを発行します。 |
| `GET /api/v1/auth/oauth/discord/callback?code=...&state=...` | state・PKCEを検証してログインセッションを発行し、アプリの `/login?returnTo=...` へ302で戻します。該当state Cookieは失効します。 |
| `POST /api/v1/auth/oauth/discord/link?returnTo=/settings` | 有効なセッションと `X-CSRF-Token` が必須。本文不要。`{ authorizationUrl }` とstate Cookieを返し、クライアントが認可URLへ遷移します。callbackでも開始時と同じ有効なセッションが必要です。連携完了時は既存session / CSRF Cookieを維持します。 |
| `GET /api/v1/auth/session` | 有効なCookieに対して `{ playerId, displayName, csrfToken }` を返します。未認証・失効・期限切れは401です。 |
| `POST /api/v1/auth/logout` | セッションと `X-CSRF-Token` が必須。セッションを失効させ、session / CSRF Cookieを削除して204を返します。 |

`returnTo` はアプリ内パスだけ許可し、UTF-8で256バイト、JSON文字列化後258バイトを
超える場合などは `/home` にフォールバックします。stateの有効期間は10分です。
開始・callback失敗時は、有効な `APP_BASE_URL` が設定されていれば
`/login?oauthError=...` へ戻ります。設定不備で安全な戻り先がない場合はJSONエラーです。
代表的なコードは `OAUTH_INVALID_REQUEST`、`OAUTH_ACCOUNT_LINK_REQUIRED`、
`OAUTH_RATE_LIMITED`、`OAUTH_NOT_CONFIGURED`、`OAUTH_PROVIDER_NOT_CONFIGURED`、
`OAUTH_PROVIDER_UNAVAILABLE` です。

セッションの有効期間は14日です。`deckdrive_session` はHttpOnly、本番では
`Secure; SameSite=None`、開発では `SameSite=Lax` です。`deckdrive_csrf` は
`SameSite=Strict`（本番ではSecure）で、APIが返した `csrfToken` を更新系リクエスト
（POST / PUT / DELETE）の `X-CSRF-Token` ヘッダーに指定します。不一致は403
`CSRF_VALIDATION_FAILED` です。開発ログインとOAuth開始・callbackはこの更新系契約の例外です。

`/auth/session` は有効なCSRF Cookieを再利用します。Cookieが欠落・不正な場合の回復は、
設定済みアプリのOriginまたは `Sec-Fetch-Site: same-origin` があるリクエストに限定します。
クロスオリジンではCSRF CookieをJavaScriptで読まず、レスポンスの `csrfToken` を使用します。

JSON request bodies are limited to 1 MiB. Malformed JSON receives `400`, and a
body exceeding the limit receives `413` before the controller is invoked.

## Browser access

The native HTTP adapter handles browser CORS preflight and allows
`http://localhost:5173` by default. Set `CORS_ORIGINS` to a comma-separated
allowlist when serving the web client from another origin. The allowlist covers
the JSON content type, `X-CSRF-Token`, `Idempotency-Key`, and the development-only
`X-Deckdrive-Player-Id` header. Browser API requests must use `credentials: 'include'`;
allowed origins receive `Access-Control-Allow-Credentials: true`.
Production `APP_BASE_URL` and `OAUTH_REDIRECT_BASE_URL` require HTTPS.
HTTP development must use the same hostname for the app and API (ports may differ;
do not mix `localhost` and `127.0.0.1`). Browsers blocking third-party cookies need
a same-site API or reverse proxy. The server binds `127.0.0.1` by default. Even when
`HOST` is explicitly set for another host or container, development login accepts
loopback clients only; use an authenticated reverse proxy for any remote access.

## Implemented endpoints

- `GET /api/v1/cards` and `GET /api/v1/cards/:id` expose versioned card data.
- `GET /api/v1/me` returns the authenticated player and derived ledger balances.
- `GET /api/v1/collection` returns the authenticated player's owned card versions
  and quantities for deck construction, plus the configured current card-data version.
- `GET /api/v1/decks`, `POST /api/v1/decks`, `PUT /api/v1/decks/:id`, and
  `DELETE /api/v1/decks/:id` manage only the caller's decks.
- `POST /api/v1/matches` creates a CPU match from an owned deck and accepts
  `EASY`, `NORMAL`, `HARD`, or `EXPERT`; `GET /api/v1/matches/:id` is owner-only.

Deck writes require exactly 30 owned cards and enforce both the global and
per-card copy limits. CPU decisions use only actions accepted by the game
engine. `CurrencyTransaction` is append-only, has a positive reward amount,
and is unique on player plus idempotency key; the reward service performs its
lookup and insert inside the same Prisma transaction for reuse by Pack and
Mission phases.

## Phase boundary

この文書はPhase 4のAPI契約を基礎に、O00で導入した認証契約を反映しています。
OAuthセッションは実装済みであり、将来予定のプレイヤーヘッダー認証の置き換えではありません。
ゲーム・報酬などの各フェーズの詳細は実装仕様書を参照してください。
