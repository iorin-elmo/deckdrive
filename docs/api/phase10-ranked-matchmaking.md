# Phase 10: Ranked matchmaking と履歴 API（K03）

Issue #59。K02 の [transactional settlement](phase10-ranked-settlement.md) と既存 PvP session を接続する。

## 認証済み API

| 操作 | Endpoint | 応答 |
| --- | --- | --- |
| 待機・再試行 | `POST /api/v1/matches/ranked` | `QUEUED` または `MATCHED`、本人の queue ID |
| 待機状態 | `GET /api/v1/matches/ranked/queue/:queueId` | `WAITING`、`MATCHED`、`EXPIRED`、`CANCELLED` |
| 待機取り消し | `DELETE /api/v1/matches/ranked/queue/:queueId` | `CANCELLED`、成立済みなら `MATCHED` |
| 投了 | `POST /api/v1/matches/:matchId/forfeit` | 確定後の status |
| 現在の season と rating | `GET /api/v1/ranked/profile` | season、rating、rank、RR、完了試合数 |
| 本人の履歴 | `GET /api/v1/ranked/history?cursor=:id` | 20 件ずつ、次ページ cursor |

すべて session 認証の対象。POST と DELETE は CSRF token を検証する。開発用 player header は production では無効。queue ID と match ID は必ず本人の参加記録で照合し、履歴は認証済み player ID だけで検索する。履歴 API は相手の deck、手札、個人情報を返さない。client から勝敗、damage、rating、forfeit 理由は受け取らない。`FORFEIT` は server だけが replay action として生成する。

## マッチングと復旧

`ranked_queue_entries` は待機時の season、rating、deck snapshot、カードデータ version を保持する。同じ player に有効な待機行は DB partial unique index で一つだけ。同じ deck の再要求は同じ queue ID を返し、異なる deck は conflict にする。待機行は 15 分で期限切れ。開始時の許容 rating 差は 100、30 秒ごとに 50 広げ、最大 500 とする。候補の中では rating 差が最小の相手を選び、同点なら先着順。既存待機者が再び POST すると拡大後の範囲で再評価する。

待機中の client は GET で状態を確認し、許容差の再評価が必要なときは同じ deck ID で POST を再試行する。enqueue は player ごとに 10 秒で 10 回までとし、超過時は 429 を返す。season が切り替わった場合は旧 season の待機行を `EXPIRED` にしてから新しい queue ID を発行する。

複数 API worker の queue 操作を PostgreSQL transaction advisory lock で直列化する。同じ transaction で K02 の season lock も取得してから active season を読むため、切替と match 開始の間で season がずれない。両者の待機状態変更、match、deck snapshot、season/rating snapshot は一つの transaction で確定する。失敗時は全体を rollback し、仮 session を破棄する。待機と match 状態は DB に残り、API 再起動後も queue ID で照会できる。進行中 match は既存 PvP の replay から復元し、WebSocket の `STATE` と欠落イベントを再送する。

## 終了と rating

通常の勝敗は engine replay から K02 の処理で確定する。Ranked の投了、片方の 60 秒切断猶予切れ、連続 3 回の turn timeout は server が `FORFEIT` action を記録し、敗者 HP を 0 にして勝者を決める。action、event、match 完了、両者の rating と履歴は K02 と同じ transaction に入る。両者とも一度も接続せずに猶予が切れた場合は無効試合として `ABANDONED` にし、rating を変えない。`CASUAL` と `PRIVATE` も rating を変えない。

`FORFEIT` を使う新規 Ranked match の engine / rules version は `1.1.0` に固定する。既存の Casual / Private match と replay は `1.0.0` のまま再現する。

## Rank 表示値

表示設定と rank・RR の計算は `@deck-drive/shared` の `rankDisplayConfig` / `rankProgress` に置く。API と K04 の UI はこの共有モジュールを参照する。rank 境界は Bronze 0、Silver 1200、Gold 1400、Platinum 1600、Diamond 1800、Master 2000、Grand Master 2200。各 rank の幅を III、II、I に三分し、区間内の進捗を RR 0–99 で返す。Grand Master の表示幅は 300（2200–2500）とし、2500 以上は RR 99 に固定する。rating 自体は丸めず保持する。

## 検証・適用外

- DB 統合テストで重複 enqueue、別 worker の同時要求、rating 差の拡大、再起動復元、本人のみの API、forfeit settlement、Casual/Private 非適用を確認する。
- engine / session test で server forfeit の replay と、未接続の両者を無効試合にする扱いを確認する。
- Rank UI、loading / empty / retry 表示は K04（#60）。abuse signal と analytics は K05（#61）。
