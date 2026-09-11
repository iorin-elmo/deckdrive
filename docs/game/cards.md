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

Effects は次の variant をサポートする。`amount` は 1 以上の整数、`resolver` は空白だけでは
ない文字列である。

| Type | 必須フィールド | 許可 target |
| --- | --- | --- |
| `DAMAGE` | `amount`, `target` | `SELF`, `ENEMY` |
| `HEAL` | `amount`, `target` | `SELF` |
| `GAIN_BLOCK` | `amount`, `target` | `SELF` |
| `DRAW` | `amount`, `target` | `SELF` |
| `CUSTOM` | `resolver`, `target` | `SELF`, `ENEMY` |

例えば `DAMAGE` は `{ "type": "DAMAGE", "amount": 6, "target": "ENEMY" }` と表現する。
クライアントは effect の実行結果を送信せず、engine がカード定義を解釈して状態と event を
生成する。
