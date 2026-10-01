# Phase 10: Ranked rating contract

K00 の最初の実装単位（Issue #57）。親 Issue #22 と `IMPLEMENTATION_SPEC.md` §27–33, §86 に基づく。

## 現在の実装

- `apps/api/src/ranked/rating.ts`: 副作用のない Elo / damage performance / season soft reset。
- `apps/api/src/ranked/performance.ts`: server replay の `DAMAGE_DEALT` と対応する `ENTITY_DAMAGED` から、block と self damage を除いた HP damage を集計。
- K は試合開始前の完了済み ranked 試合数で選ぶ。0–20 は 40、21–100 は 28、101 以上は 20。
- 敗北時の `S` は `min(0.45, clamp(damageDealt / opponentInitialHp, 0, 1) * 0.45)`。勝利時は 1、引き分け時は 0.5。
- rating は丸めず計算する。表示時の丸めと永続化の精度は後続の API 契約で確定する。
- soft reset は anchor と retention を明示的に渡す純粋関数。season 開始時の一括更新、報酬、カード資産はまだ変更しない。

## 永続化・公開 API の契約案

以下は実装前に確定する設計事項。既存の `CASUAL` / `PRIVATE` は rating に影響させない。

1. `RANKED` match に season ID と両者の対戦開始時 rating を固定する。試合途中で season を切り替えない。
2. server replay の terminal result、initial HP、イベント、切断記録から集計する。クライアントが送る rating・damage・勝敗を受け取らない。
3. match 完了と両者の rating 更新・履歴を単一 DB transaction で commit する。match/player ごとの一意制約で二重計上を拒否し、再試行時は既存結果を返す。rating 行は一定順で lock し、同時終了する別試合の lost update を防ぐ。
4. 履歴には season、match、player、opponent、変更前後の rating、K、E、S、damageRatio、設定 version、abuse flag と根拠を残す。勝敗と試合イベントは既存 replay に紐付ける。
5. authenticated player の rating、rank、RR、履歴、現在 season と残り期間を読み出す API を設ける。rank の境界値と RR 表示は設定で管理し、UI は loading / error / empty / retry と mobile 幅を扱う。
6. abuse detection は同一相手との連戦、意図的敗北、damage farming、disconnect、boosting の signal を履歴に flag として残す。自動制裁は行わない。閾値と調査手順は設定と運用文書で確定する。
7. analytics は match length、turn count、class/card/deck の使用率と勝率、surrender/disconnect、pack 分布と重複率、rating changes を集計する。player 情報の露出範囲を API ごとに定める。

## 仕様上の未決事項

- Elo の式をそのまま使うと、期待勝率が敗北 bonus より小さい場合、敗北して rating が増える。§29 の「減少を緩和する」と式 `S = performanceBonus` の間に差がある。保存処理へ接続する前に、正の delta を許すか 0 で止めるか決める。
- Bronze から Grand Master までの rating 境界、I/II/III、RR 目盛りは未指定。
- season の期間、soft reset の anchor / retention、placement K、報酬・称号の条件は未指定。
- abuse signal の閾値と rated disconnect / abandon の勝敗扱いは未指定。

## 次のレビュー単位

1. #58: season / rating / history / abuse flag の schema と migration、transactional settlement と race / retry テスト。
2. #59: ranked queue、match lifecycle、認証済み read API、reconnect と disconnect 扱い。
3. #60: rank と season の UI、E2E。
4. #61: abuse signal と analytics。

この段階では rating 関数は PvP の完了処理へ未接続。Ranked queue、DB 更新、UI は利用できない。
