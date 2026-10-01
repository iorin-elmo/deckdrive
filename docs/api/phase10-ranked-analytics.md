# Phase 10: Ranked abuse signal と analytics（K05）

Issue #61。基礎となる rating 履歴と season は [ranked settlement](phase10-ranked-settlement.md) の契約に従う。

## 入力と再集計

`ranked_matches` に紐付く終了済み match、サーバーが確定した `rating_history`、保存済み `match_events`、対戦開始時の `deck_snapshot`、`pack_openings.result` だけを読む。完了試合は両者の rating 履歴がそろった場合のみ対象にする。試合の長さは `created_at` から `completed_at`、turn 数は最終 state の `turn`、切断回数は接続済み状態から切断状態へ移った回数を使う。切断通知の重複では増やさない。

集計値は保存済みの原本からその都度計算し、累積カウンターを更新しない。同じ season を再集計しても加算されない。flag は `(match_id, player_id, type)` の一意制約と `skipDuplicates` で再走査を安全にし、途中失敗後も再実行できる。既存のレビュー状態と証拠は再走査で変更しない。判定閾値を変えるときは設定 version を更新し、既存 flag の再評価は運用レビューで行う。

## 検出設定

`apps/api/src/ranked/analytics.ts` の `abuseThresholds` が `ranked-abuse-v1` の判定設定。判定には同一 season の完了試合のみを使い、相手との比較は直近 1 時間とする。

| signal | 初期条件 | flag 対象 |
| --- | --- | --- |
| `REPEAT_OPPONENT` | 同じ相手と 4 試合以上 | 両者 |
| `INTENTIONAL_LOSS` | 同じ相手への 3 敗以上、各試合 3 turn 以下かつ HP damage ratio が 0.05 以下 | 敗者 |
| `DAMAGE_FARMING` | 同じ相手への 3 敗以上、各試合 HP damage ratio が 0.85 以上 | 敗者 |
| `BOOSTING` | 同じ相手への 4 勝以上、勝利時 rating 増分の合計が 40 以上 | 勝者 |
| `DISCONNECT_ABUSE` | 一試合で切断 3 回以上、または切断記録のある放棄試合 | 対象者 |

flag の `evidence` は season ID、根拠 match ID の列、設定 version、観測値と閾値を保存する。match ID から replay、保存済み action/event、rating 履歴へ遡れる。これらは調査の入口であり、不正の確定や rating の自動変更はしない。短い試合や善戦した敗北だけで単独 flag を立てない。

誤検知では運用担当者が replay と通信状況を確認し、理由を書いて `DISMISSED` にする。確認できた場合は `CONFIRMED` にする。再調査は `OPEN` に戻せる。操作ごとに operator、変更前後の状態、理由、時刻を `rating_abuse_reviews` に追記する。同じ担当者・状態・理由による直後の再試行は同じレビューを返す。レビュー済み flag は再走査でも状態を保つ。flag とレビュー履歴は season とともに保管し、自動削除しない。

## 閲覧と個人情報

API サーバーは analytics と flag の HTTP endpoint を提供しない。DB 接続権限を持つ運用環境からのみ、`RANKED_ANALYTICS_OPERATOR` に作業者識別子を設定して以下を実行する。`DATABASE_URL` も必要。

```text
pnpm --filter @deck-drive/api ranked:analytics report <season-id>
pnpm --filter @deck-drive/api ranked:analytics scan <season-id>
pnpm --filter @deck-drive/api ranked:analytics flags <season-id>
pnpm --filter @deck-drive/api ranked:analytics review <flag-id> DISMISSED "通信障害を確認"
```

`report` は aggregate のみで player ID、match ID、開封者 ID を含まない。完了/放棄試合数、平均試合秒数と turn 数、切断数、rating 差分、class/card/deck ごとの使用回数・勝利数・勝率、pack product/rarity 分布と重複率を返す。card は定義 ID と version を区別する。deck はカード version ID と枚数から作る fingerprint を表示し、所有者や deck ID は返さない。class/card/deck の使用回数は「その試合で使った座席」単位で数え、保存済み deck snapshot がない座席は該当 breakdown から除外する。pack は season の期間中の開封を集計し、ranked 参加者だけには限定しない。

`flags` と `review` の出力には player ID、match ID、調査理由が含まれる。運用担当者以外へ転送しない。閲覧権限は DB 接続資格情報と運用端末の権限で管理する。一般プレイヤーの認証 Cookie や development player ID では到達できない。

現在の game action には surrender が存在しないため、`surrenderCount` は `null`（未計測）とする。後続のサーバー権威 surrender event が導入されたら、その event を原本として集計する。存在しないイベントを 0 件として扱わない。
