# DECK//DRIVE 並列開発計画

更新日: 2026-09-10

## 目的と現在地

- 正本は [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md) と [copilot-instructions.md](copilot-instructions.md)。本書は仕様の置き換えではなく実行計画。
- 現時点の成果物は仕様書と本計画のみ。アプリケーション実装・CI・テストは未作成。
- 仕様 §107 の Phase 0 から 13 の順に受け入れる。全機能を同時に実装しない。
- 並列化は原則として同一 Phase 内に限定する。後続 Phase は設計調査のみ先行可能で、実装着手は前 Phase の受け入れ後。
- 以下のタスクはすべて未着手。GitHub Issue 作成時に担当、状態、ブランチ、PR、検証結果を追跡する。

## GitHub 追跡先

- リポジトリ: [iorin-elmo/deckdrive](https://github.com/iorin-elmo/deckdrive) (private)。
- main と develop に元の仕様書を初回登録済み。以後の変更はレビュー付き PR とする。
- 本計画のレビュー: [PR #1](https://github.com/iorin-elmo/deckdrive/pull/1) (`docs/parallel-work-plan` → `develop`)。レビューとマージは未完了。
- [タスク一覧](https://github.com/iorin-elmo/deckdrive/issues) に24件を登録済み。依存は各 Issue 本文にリンクし、すべて未着手・未割当。
- 最初に PR #1 を独立レビューし、マージ後に F00 を割り当てる。F00 完了後に F01 と F02 を並列化する。

| Phase | タスクと Issue |
| --- | --- |
| 0 | [F00 #2](https://github.com/iorin-elmo/deckdrive/issues/2), [F01 #3](https://github.com/iorin-elmo/deckdrive/issues/3), [F02 #4](https://github.com/iorin-elmo/deckdrive/issues/4), [F03 #5](https://github.com/iorin-elmo/deckdrive/issues/5) |
| 1 | [E00 #6](https://github.com/iorin-elmo/deckdrive/issues/6), [E01 #7](https://github.com/iorin-elmo/deckdrive/issues/7), [E02 #8](https://github.com/iorin-elmo/deckdrive/issues/8), [E03 #9](https://github.com/iorin-elmo/deckdrive/issues/9), [E04 #10](https://github.com/iorin-elmo/deckdrive/issues/10) |
| 2 | [R00 #11](https://github.com/iorin-elmo/deckdrive/issues/11), [R01 #12](https://github.com/iorin-elmo/deckdrive/issues/12), [R02 #13](https://github.com/iorin-elmo/deckdrive/issues/13) |
| 3 | [D00 #14](https://github.com/iorin-elmo/deckdrive/issues/14), [D01 #15](https://github.com/iorin-elmo/deckdrive/issues/15) |
| 4 | [A00 #16](https://github.com/iorin-elmo/deckdrive/issues/16) |
| 5 | [W00 #17](https://github.com/iorin-elmo/deckdrive/issues/17) |
| 6 | [P00 #18](https://github.com/iorin-elmo/deckdrive/issues/18) |
| 7 | [M00 #19](https://github.com/iorin-elmo/deckdrive/issues/19) |
| 8 | [O00 #20](https://github.com/iorin-elmo/deckdrive/issues/20) |
| 9 | [V00 #21](https://github.com/iorin-elmo/deckdrive/issues/21) |
| 10 | [K00 #22](https://github.com/iorin-elmo/deckdrive/issues/22) |
| 11 | [N00 #23](https://github.com/iorin-elmo/deckdrive/issues/23) |
| 12 | [I00 #24](https://github.com/iorin-elmo/deckdrive/issues/24) |
| 13 | [U00 #25](https://github.com/iorin-elmo/deckdrive/issues/25) |

## チーム構成

| 役割 | 責任 | 制約 |
| --- | --- | --- |
| 統合担当 | 契約調整、ルート設定、依存更新、タスク割当、統合検証 | 実装担当の変更を無断で書き換えない |
| 実装 AI A | 現在の Phase の中核機能 | 割当範囲のみ変更 |
| 実装 AI B | 独立したデータ・基盤機能 | 同じファイルを A と共有しない |
| 検証 AI C | 独立した契約テスト、回帰テスト、レビュー | 他担当の未確定 API を推測して実装しない |
| レビュー担当 / ユーザー | 仕様・安全性・テスト・差分の確認と承認 | 自己承認でレビューを代替しない |

最初は統合担当 + 実装担当 2 名 + 検証担当 1 名を上限の目安とする。依存待ちの担当に別 Phase の実装を始めさせない。レビュー担当は実装担当とは別の AI セッションでもよいが、GitHub の required approval を満たせるかはアカウント・プラン・権限を別途確認する。

## ブランチと作業場所

1. 初期仕様を main に登録し、develop を作る初回 bootstrap はユーザー承認のうえで実施済み。
2. 以後は最新の develop から `feat/<task-id>-<topic>` または `docs/<task-id>-<topic>` を分岐する。
3. 各 AI は別 clone または別 Git worktree を使う。同じ作業ディレクトリで並列編集しない。
4. worktree はリポジトリの外の兄弟ディレクトリに作る。同じブランチを複数 worktree で使用しない。
5. 1 PR は 1 つの受け入れ可能な変更とし、大きいタスクはさらに分割する。分割時は親タスク ID を PR に記載する。
6. PR の向き先は develop。レビュー指摘解消と必要なチェック成功後に、権限を持つ担当がマージする。
7. 後続タスクは依存 PR のマージ後に最新 develop から分岐する。未マージの他担当ブランチに暗黙依存しない。
8. main へのマージはリリース時のレビュー付き PR に限定する。force push とレビューの迂回は禁止。

例: F00 のマージ後、統合担当が以下を実行して担当ごとにフォルダーを渡す。

```sh
git fetch origin
git worktree add -b feat/f01-quality ../deckdrive-f01 origin/develop
git worktree add -b feat/f02-local-runtime ../deckdrive-f02 origin/develop
```

## 共有ファイルの所有権

| 対象 | 所有者 | 他担当が必要とするとき |
| --- | --- | --- |
| ルート package.json、pnpm-lock.yaml、pnpm-workspace.yaml、mise.toml | 統合担当 | 必要パッケージ・用途を Issue に申請し、統合担当が別の小さい PR に反映 |
| 共有 TypeScript / lint / format 設定、packages/config | F01 担当 | 設定変更を依頼 |
| .github/workflows | F03 担当、以後は統合担当 | 必要ジョブと実行コマンドを依頼 |
| packages/shared | 現 Phase の契約担当 | API 変更を先に合意して契約 PR を作る |
| packages/game-engine の公開 API | E00 担当、以後は Engine 担当 | UI / API 側で代替ルールを作らない |
| packages/card-definitions | E02 担当 | Engine 側は確定済みデータ形式に依存 |
| Prisma schema と migration 履歴 | DB 担当 1 名 | 他担当は必要なモデル変更を依頼。並行して migration を生成しない |
| tests/fixtures/replays | Replay 担当 | 期待値の変更理由と旧版再現性をレビュー |
| docs/PARALLEL_WORK_PLAN.md | 統合担当 | 担当ごとの知見は別の docs ファイルに記録 |

担当固有の package.json でも依存追加は統合担当と調整する。lockfile の競合を手動で合成しない。各担当の開発サーバーは別ポート、DB integration test は別 DB / schema を使い、共有 DB に reset を実行しない。

## 最初に発行するタスク

依存欄の `-` は前提タスクなし。実装は TDD の Red → Green → Refactor を小さい単位で繰り返す。環境設定・文書のみの変更は、構成検証やリンク検証を対応する確認手段とする。

変更範囲に記載した未作成のパスは、各タスクで作成する成果物の予定先であり、既存文書への参照リンクではない。特に新規文書と ADR ディレクトリは下表で明示する。本計画のローカル文書リンク検証は、Markdown リンクの参照先が現在存在することを確認するもので、予定成果物の存在確認は含まない。

| ID | Phase | タスク | 依存 | 変更範囲 | 完了条件 |
| --- | --- | --- | --- | --- | --- |
| F00 | 0 | workspace とツールバージョンの契約 | - | ルート manifests、mise.toml、各 workspace の最小 manifests、README | 仕様 §4 の配置、§5 のバージョン固定、pnpm install 成功。Windows / WSL / Linux の対応境界を記録 |
| F01 | 0 | TypeScript と品質チェック | F00 | packages/config、最小ソースと設定、品質コマンド | pnpm lint / typecheck / build 成功、format check と Vitest の実行基盤。意味のない常時成功テストは禁止 |
| F02 | 0 | ローカル Docker と環境雛形 | F00 | infra/docker、docker-compose.yml、.env.example、scripts/setup 関連、docs/operations/local-development.md（F02 で新規作成） | Compose 構成検証、PostgreSQL / Mailpit の起動と health。api / web / admin の実起動は各実装と統合時に検証し、未実装を明記 |
| F03 | 0 | PR CI と基盤受け入れ | F01,F02 | .github/workflows、docs/operations/ci.md（F03 で新規作成） | clean checkout で install / lint / format / typecheck / build。unit / integration / replay / E2E の導入段階と残ゲートを明示し、未実装を成功扱いしない |
| E00 | 1 | Engine / カード公開契約と ADR | F03 | packages/game-engine の型・公開入口、packages/card-definitions の型、docs/architecture/adr/（E00 でディレクトリと ADR 文書を新規作成） | BattleState / Action / Event / Result / RNG 契約、version の責務、依存禁止をレビュー。状態不変性と不正 Action の失敗テスト |
| E01 | 1 | 決定的 RNG | E00 | packages/game-engine/src/random と隣接テスト | SeededRandom / FixedRandom。同 seed の同列、保存復元、Math.random 不使用。外部 I/O・global mutable state なし |
| E02 | 1 | 最小カード DSL と基本カード | E00 | packages/card-definitions のデータ・検証・テスト、docs/game/cards.md（E02 で新規作成） | Sword / Guardian / Neutral の最小データ、カード ID / version / DSL / copy limit の検証。35 枚全体の完成とは分ける |
| E03 | 1 | 状態遷移と基本効果 | E01,E02 | packages/game-engine の状態遷移・action・effect と隣接テスト | validateAction / applyAction / calculateResult、HP30・energy3、合法手、block・draw・勝敗、イベント順序を given/when/then で検証 |
| E04 | 1 | Engine 不変条件と Phase 受け入れ | E03 | packages/game-engine の property test、tests/fixtures/battles、docs/game/engine.md（E04 で新規作成） | fast-check で §84、不正 action で不変、決定性・ゲーム外依存禁止を検証。UI / CPU への依存なし |
| R00 | 2 | Replay 形式と記録 | E04 | packages/game-engine の Replay 純粋処理、tests/fixtures/replays、docs/game/replay.md（R00 で新規作成） | seed / versions / initialState / actions / events / snapshots / finalState を記録。同条件の再生一致と改変検出。filesystem は Engine 外 |
| R01 | 2 | Replay CLI | R00 | scripts/replay 関連と隣接テスト | pnpm replay --match <matchId> の成功・存在しない ID・非対応 version・不一致を検証。Phase 2 は fixture 入力、実 DB 接続は D01 |
| R02 | 2 | Replay 回帰ゲート | R00 | tests の Replay 回帰スイート、統合担当による CI 追記 | 既知 fixture 再現、期待結果の故意の不一致で失敗。旧 version の結果を黙って上書きしない |
| D00 | 3 | Prisma schema / migration / seed | R01,R02 | apps/api の Prisma 関連、tests/fixtures の DB seed データ | §52 のうち Phase 3 対象、version 保全・制約・index、空 DB migration / seed、開発専用 seed の本番拒否、復旧方針 |
| D01 | 3 | Match 永続化と Replay 接続 | D00 | apps/api の Match repository、scripts/replay の DB adapter、tests/integration/replay | actions / events / snapshots を保存し実 matchId で再生。Engine に DB を持ち込まない。transaction と再構築テスト |

### 開始可能な並列枠

- 現在: 計画 PR #1 のレビュー待ち。マージ後に F00 の担当 1 名が実装開始可能。別 AI は仕様レビューと環境前提の調査を読み取り専用で実行できる。
- F00 マージ後: F01 と F02 を並列実装。F01 がルートの品質コマンドを変更する間、F02 はルート manifests を変更しない。
- F01 と F02 マージ後: F03 で統合。構成だけで api / web / admin が動いたことにはしない。
- E00 マージ後: E01 と E02 を並列実装。その後 E03 → E04。
- R00 マージ後: R01 と R02 を並列実装。その後 D00 → D01。

## 後続 Phase のバックログ

下表は親タスク。各 Phase 開始時に上表と同じ粒度まで分割し、変更ファイルと契約を確定してから AI に渡す。前 Phase の全タスク受け入れが追加の前提となる。

| ID | Phase | 内容と仕様参照 | 依存 | 並列分担と受け入れ |
| --- | --- | --- | --- | --- |
| A00 | 4 | Player / Cards / Decks / CPU Match / Rewards API (§19-20,94-96) | D01 | 先に DTO と認可境界、DB 担当による schema 追加。次に collection/deck と CPU 方策を分担。CPU は合法手だけを Engine に渡し、4 難易度を検証。報酬は ledger / idempotency / transaction を先に最小実装し Phase 6 で再利用。開発認証は production で拒否 |
| W00 | 5 | Title / Login placeholder / Home / Cards / Deck / CPU / Result (§63-72) | A00 | UI 契約と packages/ui を先行、その後 cards/decks と battle を分担。React Router / Zustand / Query / Tailwind を仕様どおり使用。カード画像のライセンスを記録。CPU 一連の E2E と loading/error/empty、a11y、responsive |
| P00 | 6 | Pack / Box / Rare / Currency / duplicates (§36-45,101) | W00 | 抽選・シミュレーションと transactional API を確定した契約で並列化。DB 変更は一人。R/SR/UR 保証、二重要求・同時購入・ロールバック、重複変換、UI/E2E |
| M00 | 7 | Mission / Login / Level / Cosmetics (§46-51,89-90) | P00 | 共通 reward grant を先行し進捗処理と cosmetic UI を分担。server time / 冪等付与 / 戦闘能力への影響なしを検証 |
| O00 | 8 | OAuth Google / Discord / X と session (§34-35,73-74) | M00 | Provider Adapter / session / link 契約を先行。provider ごとに別ファイル。state / CSRF / HttpOnly / Secure / SameSite、link 不正操作、rate limit、secret 漏洩防止と login E2E |
| V00 | 9 | WebSocket / Casual / Private / reconnect (§21-26,75,102-103) | O00 | 認証済み protocol と player 向け state projection を先行し server/client を分担。相手手札・山札・seed の漏洩防止、action serialize、timeout / grace 約60秒、snapshot + missing events、切断復帰 E2E |
| K00 | 10 | Ranked / Elo / Season / analytics (§27-33,86) | V00 | 純粋 rating strategy と表示を契約後に並列化。K=40/28/20 の境界、damageRatio clamp、負け bonus 上限0.45、同一試合の二重計上防止、abuse flag、履歴と season soft reset |
| N00 | 11 | Admin / debug / logs / health / flags (§55-62,91-93,104) | K00 | RBAC / audit 契約を先行し API と admin UI を分担。全管理機能、reason / before / after、requestId、PII mask、本番 debug 禁止、権限拒否テスト。基本の health / logging / security は必要な先行 Phase から実装 |
| I00 | 12 | Pi IaC / deployment / backup / recovery (§76-80) | N00 | runtime/Ansible と外部 Terraform 対象を分担。外部 provider・DNS・費用・Pi 接続先はユーザー確認。ARM64 build、daily dump / weekly full / 外部保管 / retention、restore 実演、migration と image rollback、health/smoke |
| U00 | 13 | UX / 35 cards / balance / performance / browsers (§65-72,85-88,105-106) | I00 | 見た目と性能検証を分担。event-driven animation、reduced motion、全状態、Chrome/Firefox CI・Edge 定期検証、Desktop/Tablet/Mobile。N12/R10/SR7/SSR4/UR2 を完成し counterplay を確認 |

## 契約を先に確定する項目

- Engine: card definition ID と instance ID、target の表現、phase 遷移、不正 Action の戻り値、イベント順序、seed と RNG state、version 対応方針。
- 初期ルール未指定値: 初手枚数、turn draw、手札上限、山札枯渇、block の寿命、先攻差、deck cost cap、各カード詳細。E00/E02 でテスト可能な提案を ADR にし、仕様を勝手に確定値へ書き換えない。
- Replay: snapshot と action/event sequence の対応、旧 engine/card/rules version のロード方針。
- API: DTO / validation / error code / pagination / idempotency。TypeScript の型だけで入力検証を済ませない。
- PvP: 認証主体と playerId の一致、公開情報だけの projection、sequence / resync / duplicate action / concurrent action の扱い。
- 永続化: repository interface、transaction 境界、unique constraint と idempotency の保管範囲。DB schema の変更は DB 担当に集約。

## AI に渡す作業指示テンプレート

以下の項目を埋めてセッションごとに渡す。起動用の専用エージェント設定ではなく、作業依頼本文である。

```text
タスク ID / Issue:
目的:
正本: docs/copilot-instructions.md, docs/IMPLEMENTATION_SPEC.md
補助計画: docs/PARALLEL_WORK_PLAN.md
ベース: origin/develop の確認済み commit SHA
作業場所 / ブランチ:
依存 PR: (すべて merged を確認)
変更してよいファイル・ディレクトリ:
変更禁止: 他担当の所有物、共通 manifests / lockfile (担当指定がない場合)
確定済み契約 / ADR:
受け入れ条件:
最初に失敗させるテスト / 最小検証:
必要な最終検証コマンド:
知見の記録先: docs 内の担当別ファイル
手順: 既存確認 → Red → Green → Refactor → 検証 → docs → 小さい commit → PR
不明点: 軽微な判断は記録。共有契約・仕様変更・外部費用は統合担当へ相談。
禁止: 他 worktree の変更、main/develop への直接実装、自己判断マージ、secret の出力・commit。
報告: 変更内容、実行した検証と結果、未検証項目と理由、残リスク、PR URL。
```

## 共通の完了ゲート

- PR は実装担当以外がレビューし、指摘を解消する。レビューを省略して並列速度を上げない。
- §81 の PR チェック: lint / format check / typecheck / unit / integration / engine replay / build。main はさらに E2E / Docker build。未導入ゲートは未導入と表示し、導入前に本番受け入れしない。
- 各機能は §110 の DoD を PR に列挙する。適用外は理由を記載し、未実施と区別する。
- Engine 変更には決定性と replay regression。DB 変更には migration / transaction / recovery。UI 変更には E2E / 全状態 / a11y / responsive。
- 機能に必要な logging / security / error state は後の Phase へ丸ごと先送りしない。
- 統合担当はマージ後の develop でも確認し、個別 branch の成功だけで Phase 完了としない。
- 最終受け入れは §111 の setup、CPU→reward、Pack、PvP、Ranked、実試合 Replay、Pi 再構築、バックアップ復旧をすべて実演する。
- 実機・OAuth provider・private repo の保護機能など環境待ちはブロック項目として残し、代替テストだけで完了扱いしない。

## ユーザー確認が必要な外部操作

- GitHub: `iorin-elmo/deckdrive` を private で作成済み。
- GitHub 認証はブラウザまたは端末でユーザー本人が行う。token / password をチャットに貼らない。
- 初回 commit / push、main / develop 作成、計画 PR、24件の Issues 登録は承認済み・実施済み。レビューとマージは別途行う。
- GitHub Actions の有料枠、private repo の branch protection 利用可否、外部サービス・DNS・Pi・バックアップ先は必要時に確認する。
- 本番への deploy、破壊的 DB 操作、課金が発生する apply は個別承認を得る。