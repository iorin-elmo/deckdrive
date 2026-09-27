# DECK//DRIVE Agent Context

## Project contract

DECK//DRIVE は Modular Monolith + Independent Game Engine で構成する。

レビュー・実装時は `docs/IMPLEMENTATION_SPEC.md` をプロダクトおよびアーキテクチャ契約として扱う。

特に以下は例外を作らない。

### Server Authoritative

クライアントは意図だけを送る。

damage、draw結果、乱数結果、reward、勝敗などの権威値をclientから信用しない。

### Deterministic Game Engine

同一の

- seed
- initial state
- action sequence
- rules/card data version

から同じ結果を再現できなければならない。

Game Engineでは再現不能な乱数、時刻、global mutable state、外部I/Oへ依存しない。

### Game Engine isolation

`packages/game-engine` から以下へ依存しない。

- Database / Prisma
- HTTP
- React
- NestJS
- filesystem

ゲームルールをFrontend、API controller、CPU専用ロジックへ複製しない。

### Reproducibility

重要な状態変化は後から説明・再現できる必要がある。

特に:

- Match
- Action
- Event
- RNG
- Reward
- Pack opening
- Currency transaction
- Admin operation

を追跡可能にする。

### Data integrity

Currency / Card / Rewardの変更はtransactionalに行う。

再試行され得る操作ではidempotencyを設計する。

同時リクエスト、unique constraint race、途中失敗を正常系と同様に検討する。

### UX completeness

UI変更ではhappy pathだけを完成扱いしない。

必要に応じて以下を確認する。

- loading
- error
- empty
- reconnect
- accessibility
- responsive
- retry/recovery

## Design source precedence

設計判断を確認するときは次の順で情報を集める。

1. `docs/IMPLEMENTATION_SPEC.md` の Absolute Design Principles
2. 対象機能に関する受理済みADR
3. 対象モジュールの詳細設計ドキュメント
4. 対応Issueの受け入れ条件
5. PR本文

下位の文書が上位の原則を暗黙に上書きしてはいけない。

矛盾を発見した場合は推測で解消せず、矛盾として扱う。

## Pull request review

レビュー時は `.github/skills/code-review/SKILL.md` の手順を使用する。

レビューはdiffだけを局所的に読む作業ではない。

変更された契約について、そのproducer、consumer、persistence、tests、configuration、documentationを必要な範囲で追跡する。

特に「APIを追加したがUIから到達不能」「DB契約を変えたが再試行時だけ壊れる」「成功時は動くが失敗時に復旧不能」のようなcross-layer defectを重点的に探す。
