# DECK//DRIVE — Copilot Code Review Instructions

## Review objective

このリポジトリのコードレビューで最も重要なのは、単なるコード品質ではなく、変更後のシステムが DECK//DRIVE の設計契約を満たしていることを確認することである。

レビューでは style や好みより、以下を優先する。

1. 仕様・設計との不整合
2. correctness bug
3. security / authorization / data integrity
4. concurrency / idempotency / retry safety
5. deterministic replay の破壊
6. API・DB・UI間の契約不整合
7. failure path / edge case の欠落
8. 回帰テストの不足

formatter、lint、単純な命名、機械的なstyle指摘は、実害がない限りレビューコメントにしない。

## Sources of truth

レビュー開始時に、変更範囲に応じて以下を確認する。

- `docs/IMPLEMENTATION_SPEC.md`
- `docs/copilot-instructions.md`（開発・PR運用の正本）
- `docs/PARALLEL_WORK_PLAN.md`
- `docs/architecture/adr/`
- 変更対象に対応する `docs/api/`, `docs/game/`, `docs/web/`, `docs/operations/`
- PRが解決するGitHub Issueがある場合、その受け入れ条件
- PR本文に記載された意図的なscope

`IMPLEMENTATION_SPEC.md` の Absolute Design Principles は最優先の不変条件として扱う。

より具体的なADRやモジュール設計が仕様を詳細化することは許容するが、Absolute Design Principlesと矛盾してはいけない。

仕様・ADR・実装が互いに矛盾する場合は、どれかを推測して正しいものとして扱わず、矛盾そのものをレビュー指摘する。

PRが既存設計を意図的に変更する場合、コードだけでなく対応する仕様またはADRも同じPRで更新されているか確認する。

## Review completeness

最初に発見した問題でレビューを終了しない。

レビューコメントを投稿する前に、変更された全ファイルと関連する既存コードを確認し、`.github/skills/code-review/SKILL.md` の全レビューpassを完了する。

1件の問題を発見した場合、その問題の同系統ケースを同じレビュー内で探索する。

例:

- successだけでなく failure / retry
- 1回だけでなく repeated / concurrent
- 開始だけでなく completion / cleanup
- developmentだけでなく production
- same-originだけでなく cross-origin
- current tabだけでなく reload / multi-tab
- normal inputだけでなく empty / invalid / boundary
- 新規データだけでなく既存データとの互換性
- 単一processだけでなく restart / multi-process が関係するか

同じ根本原因の指摘は可能な限り1件にまとめる。

## DECK//DRIVE invariants

常に以下を疑う。

- clientを権威として扱っていないか
- Game EngineにDB / HTTP / React / filesystem依存が入っていないか
- `Math.random()` や再現不能な入力がgameplayへ入っていないか
- Action / Event / RNG / Reward / Currency / Admin操作が再現・追跡可能か
- Game EngineのルールをFrontendやCPU側へ複製していないか
- currency / card / reward処理がatomicか
- idempotency keyが競合・再試行・並行実行でも安全か
- Matchへの同時Actionがserializeされるか
- migrationが破壊的でないか
- secret / token / PIIがログやclientへ漏れないか
- loading / error / empty / reconnect / accessibility / responsive が必要な画面で欠落していないか
- 実装した契約を壊す変更を検出するテストが存在するか

## Review output

高い確信を持てる、実際に修正価値のある問題を優先する。

レビューは可能な限り一度で問題候補を出し切る。

「今回はここまで確認した」という理由でレビューを終了せず、全passを完了してから投稿する。
