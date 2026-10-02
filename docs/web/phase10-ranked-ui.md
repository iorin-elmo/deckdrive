# K04: Rank と season の画面

Issue #60。認証後の `/ranked` に現在の season、rating、rank、RR、完了試合数と rating 履歴を表示する。画面は K03 の `GET /api/v1/ranked/profile` と `GET /api/v1/ranked/history` を読む。rank 境界、division、RR は K03 のサーバー設定で計算し、web は返却値を表示する。クライアントは rating、勝敗、damage を送らない。

## 対戦導線

- 30 枚の保存済みデッキを選び、`POST /api/v1/matches/ranked` に deck ID だけを送る。
- 待機中は本人の queue ID を使って 1 秒ごとに状態を確認する。queue ID と deck ID は player ID ごとにブラウザの localStorage に保存し、再読み込み後も照会する。
- K03 の検索範囲拡大を反映するため、待機中は同じ deck ID で 30 秒ごとに enqueue を再送する。新しい queue ID が返れば保存値を更新する。
- 待機取消は `DELETE /api/v1/matches/ranked/queue/:queueId` を呼ぶ。成立済みなら server が返した match ID の PvP 画面へ進む。
- マッチ成立時は `/battle/pvp/:matchId`、履歴からは `/result/:matchId` に進む。

## 画面状態と検証

season 未開催、履歴なし、使用可能なデッキなし、通信失敗、待機期限切れ、取消、再接続を個別に表示する。失敗時は画面上で再試行できる。RR の目盛りはラベル付きの native progress、各操作は button / link / select を使う。幅 375px の mobile 表示とキーボード操作を Playwright で検証する。

`pnpm test:e2e` は API 応答を差し替えてブラウザ操作を検証する。K03 の実 API / DB 接続の検証は K03 の integration test が担当する。
