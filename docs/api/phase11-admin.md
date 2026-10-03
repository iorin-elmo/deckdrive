# N00 管理コンソール

## 権限とログイン

管理者は Discord OAuth の `providerUserId` が `387855958627450881` のアカウントだけです。メールアドレス、表示名、開発用プレイヤーヘッダーでは管理権限を取得できません。管理 API はリクエストごとに有効なセッションの認証元が Discord であることと、紐づく Discord ID を照合し、変更操作では CSRF トークンも確認します。既存セッションには認証元が記録されていないため、管理画面の利用にはマイグレーション後の Discord 再ログインが必要です。管理画面のリンクは、この照合に成功したログインユーザーにだけゲーム画面のナビゲーションへ表示します。

ローカルでは `pnpm --filter @deck-drive/api dev`、`pnpm --filter @deck-drive/web dev`、`pnpm --filter @deck-drive/admin dev` をそれぞれ起動します。ゲーム画面で Discord ログイン後、表示される「管理」リンクから `http://localhost:5174` を開きます。管理画面とゲーム画面は同じホスト名で開いてください。本番の既定配置は同じドメインの `/admin/` で、リバースプロキシは管理画面の `/api` を API へ転送する必要があります。別の配置にする場合はビルド時に `VITE_ADMIN_URL`、`VITE_ADMIN_BASE`、`VITE_WEB_URL` を設定します。DB には N00 マイグレーションを適用します。

## 管理機能

| 操作 | API | 記録 |
| --- | --- | --- |
| プレイヤー検索・詳細・Rating 履歴 | `GET /api/v1/admin/players`, `/players/:id`, `/players/:id/rating` | メールは検索結果と詳細でマスク |
| 試合検索・リプレイ記録 | `GET /api/v1/admin/matches`, `/matches/:id/replay` | 試合の入力、イベント、スナップショットを閲覧 |
| 付与・ミッション完了・パックシミュレーション | `POST /api/v1/admin/actions` | 理由、変更前後、requestId を監査ログへ保存 |
| フラグ・メンテナンス | `GET /api/v1/admin/flags`, `POST /api/v1/admin/actions` | `SET_FLAG` を使用 |
| 監査ログ | `GET /api/v1/admin/audit` | 100 件ずつ、`nextCursor` で続きが取得可能 |

フラグは実際に切替先がある機能だけを管理画面へ表示します。`ENABLE_X_LOGIN` は受理済みの ADR 0002 で X ログイン自体が対象外のため設けません。`ENABLE_NEW_CARDS` は切替対象が実装されたときに追加します。初回のフラグ変更でも、監査ログの `before` には有効な既定値を記録します。

`MAINTENANCE_MODE` は通常の REST API に加えて PvP WebSocket の新規接続を HTTP 503 で拒否し、既存接続からの action には `MAINTENANCE_MODE` エラーを返します。メンテナンス中はサーバーの PvP 定期 tick も実行しません。フラグの確認に失敗した場合は接続や action を通さず、定期 tick も停止します。

変更操作には空でない `reason` と一意の `requestId` が必須です。同じ管理者と requestId の再送は記録済み結果を返し、異なる内容なら `409 ADMIN_REQUEST_CONFLICT` になります。変更と監査行は Serializable トランザクションで確定します。付与は通貨台帳、カード所持数、コスメティックの付与記録、ミッション進捗をそれぞれ更新します。

## デバッグ機能

`ENABLE_DEBUG` は初期状態で無効です。開発・ステージング環境で明示的に有効にしたときだけ、全カード付与、Gem・レベル・Rating 設定、特定の二つのデッキによる戦闘作成、強制ドロー、Seed 変更、ターンスキップ、ステータス付与、撃破を使用できます。本番環境では DB 上のフラグが有効でもデバッグ操作は拒否され、フラグ自体も有効にできません。

デバッグ戦闘は通常の試合やランキングから分離して `debug_battles` に保存します。初期状態、順序付きコマンド列、結果状態を保持し、`GET /api/v1/admin/debug-battles/:id` で再計算して一致を検証します。デバッグ戦闘には報酬や Rating 精算がありません。開発用のプレイヤーデータ変更も監査ログに残ります。

## ヘルスチェックとログ

`/health/live` はプロセス応答、`/health/ready` は DB 接続を確認します。`pnpm health` は両方へアクセスし、一方でも失敗すると終了コード 1 になります。接続先は `HEALTH_BASE_URL` で変更できます。

HTTP リクエストと WebSocket アップグレードには `x-request-id` を採番または検証します。HTTP 応答と WebSocket の 101 応答にも ID を返します。WebSocket の各アクションはプロトコルの `requestId` を記録します。ログは JSON Lines として標準出力へ書きます。`LOG_FILE` を設定するとディレクトリを起動時に用意してファイルへ非同期追記し、終了時に書き込みを完了させます。ディスクが遅い場合は最大 1 MiB のバッファを超えるファイル出力を破棄し、標準エラーへ通知します。`pnpm logs` で直近 100 件、`pnpm logs -- --request-id <ID>` で対象リクエストを確認できます。ログフィールドは許可リスト方式で、HTTP body、cookie、OAuth token、メールアドレス、管理操作理由は記録しません。非公開試合の招待コードはログの URL パスから伏せます。

既存の `pnpm replay`、`pnpm simulate:packs`、`pnpm db:seed`、`pnpm db:reset` も引き続き利用できます。`db:reset` は開発用 DB のみを対象にしてください。
