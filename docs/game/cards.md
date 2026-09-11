# 最小カード DSL

カード定義は versioned でシリアライズ可能なデータであり、engine の実行コードを
含まない。`id` は lower snake case、`version` は `x.y.z`、`deckLimit` は `1..3` または
`null` とする。基本カードは重複投入上限を 3 枚にする。

E02 の最小セットは次の 3 枚である。ここでの数値は DSL と検証の受け入れ用であり、
最終的なバランス値は後続のカード設計で扱う。

| ID | Class | Cost | Effect |
| --- | --- | --- | --- |
| `sword_strike` | Sword | 1 | Enemy に 6 damage |
| `guardian_guard` | Guardian | 1 | Self に 5 block |
| `neutral_insight` | Neutral | 1 | Self が 1 draw |

Effects は `DAMAGE`、`HEAL`、`GAIN_BLOCK`、`DRAW`、`CUSTOM` をサポートする。クライアントは
effect の実行結果を送信せず、engine がカード定義を解釈して状態と event を生成する。
