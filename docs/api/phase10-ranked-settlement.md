# Phase 10: Ranked settlement（K02）

Issue #58。rating 計算の契約は [phase10-ranked.md](phase10-ranked.md) に記録する。

## 永続化契約

- `seasons`: 期間、初期 rating、soft reset retention、計算設定 version を保存する。同時に `ACTIVE` になれるのは DB partial unique index により一つだけ。
- `player_season_ratings`: season ごとの現在 rating と完了済み試合数。カード資産とは独立した行。
- `ranked_matches` と `ranked_match_players`: match 作成と同じ transaction で season、設定 version、両者の開始時 rating と完了済み試合数を固定する。参加者は `match_players` の複合 FK で制約する。
- `rating_history`: match/player に一件だけ。対戦相手、勝敗、開始時 rating、更新前後、K、E、S、damage と設定 version を記録する。
- `rating_abuse_flags`: 後続の K05 が判定根拠を格納するための match/player/type ごとの一意な行。

`RANKED` mode の match 作成は、active season が対象時刻を含まなければ失敗し、match 自体も rollback する。season 開始・切替と match 作成は同じ DB advisory transaction lock で直列化する。

match 終了時は server engine から `recordReplay` した結果だけで勝敗と HP damage を決める。match 行を lock した後、両 player の rating 行を player ID 順に lock する。完了状態、action、event、両者の rating と履歴を一つの transaction で commit する。同じ match/player の履歴 unique 制約に加え、既存の二件の履歴があれば settlement を再実行しない。別々の試合が同時に終わっても rating 更新は `increment` で lost update を防ぐ。

計算には開始時の rating snapshot を使用し、更新前後には transaction 内で lock 済みの現在値を記録する。これにより同時進行する試合は開始時の情報で K/E を決めつつ、結果の合計を失わない。浮動小数点の丸めは表示と別契約で扱う。

計算設定は `rating-policy.ts` の変更不可な version registry に登録する。settlement は `ranked_matches.rating_config_version` から設定を選び、現在の worker の新規 season 用設定を参照しない。新 version を導入するときは別 entry を追加し、進行中 match と履歴の再現に必要な旧 entry の値を保持する。未対応 version は rating を書き換えず transaction を失敗させる。

## Season 切替と復旧

`activateSeason()` は既存 active season と期間が重なる場合、または進行中の ranked match がある場合に失敗する。すべて終了後、旧 season を閉じ、新 season の行と soft reset した rating 行を同じ transaction で作る。完了済み試合数は 0 から始める。player のカード・通貨・cosmetics は変更しない。同じ season ID と同じ設定の再試行は無害で、設定が異なる再利用は拒否する。

試合終了前に DB 書き込みが失敗した場合、action、event、rating、履歴、match 完了状態はともに rollback する。client は同じ request ID を再試行できる。二つの worker が同じ match を同時に確定しようとした場合、既存の match 行 lock と action sequence の照合により一件のみ成功する。

## 境界と後続作業

K02 は永続化層だけを追加する。`RANKED` の queue と認証済み API、再接続、rated abandon / disconnect の扱いは K03（#59）で接続する。現在の PvP サービスから `RANKED` match は作成されない。abuse signal の生成と analytics は K05（#61）。season の実運用スケジュール、初期 rating、retention は別途運用設定として指定する。

## 検証

- 専用 PostgreSQL データベースへ migration を適用。
- DB 統合テストで同時終了、二重 worker、履歴の再実行、途中失敗からの再試行、進行中 match を伴う season 切替拒否、soft reset を確認。
- `pnpm test:integration` に ranked 統合テストを追加。
