---
name: code-review
description: Exhaustive DECK//DRIVE pull request review. Validate implementation against design documents and find related defects before submitting a single consolidated review.
---

# DECK//DRIVE exhaustive code review

目的は「最初の問題を見つけること」ではない。

PRが設計契約を満たしているかを確認し、同じ根本原因から発生する問題をできるだけ1回のレビューで発見する。

レビューコメントは探索の途中では投稿しない。

以下のpassを完了してから候補を整理して投稿する。

---

## Pass 0 — Understand the intended change

最初に次を確認する。

1. PR本文
2. linked Issue と受け入れ条件
3. changed files
4. `docs/IMPLEMENTATION_SPEC.md`
5. relevant ADR
6. relevant module documentation
7. PR自身が変更している設計書

変更の目的を1〜数個の「observable behavior / invariant」として内部的に整理する。

例:

- OAuth loginが安全に完了・失敗・再試行できる
- Reward claimがexactly-once相当で処理される
- Game Engineの新Actionがdeterministicに再生できる
- UIが特定API contractを正しく利用する

---

## Pass 1 — Build a requirements matrix

変更に関係する要求を列挙し、それぞれについて次を確認する。

| Requirement | Implementation | Consumer | Test | Docs/config |
| --- | --- | --- | --- | --- |
| requirement | exists? | wired? | proves it? | synchronized? |

特に「実装自体は存在するが、実際のproduct flowから到達しない」状態を探す。

API endpoint、service、DB schema、UI、configurationのどれか一つだけ実装されている状態を完成と判断しない。

---

## Pass 2 — Specification and architecture

全changed fileを設計観点でもう一度確認する。

### Always check

- Absolute Design Principlesへの違反
- Server Authoritative境界
- deterministic behavior
- replay/reproducibility
- Game Engine isolation
- version contract
- public API compatibility
- ADRとの矛盾
- docsとcodeのdrift

### Game Engine

`packages/game-engine/**` またはbattle/card rulesが関係する場合:

- DB / HTTP / React / NestJS / filesystem依存がない
- `Math.random()`、現在時刻、global mutable stateに依存しない
- invalid actionがstateを変更しない
- ActionからEventへ必要な情報が失われない
- Replayで同じ結果を再構築できる
- rules/card/engine versionが必要な場所で固定される
- CPUやUIへ別実装のruleが生まれていない
- 新stateがsnapshot / replay / serializationの対象になっている

---

## Pass 3 — End-to-end behavior

変更した機能について、コードをファイル単位ではなくflow単位で追う。

可能な場合:

client
→ HTTP/WebSocket
→ authentication/validation
→ application/service
→ domain/Game Engine
→ repository/database
→ response/event
→ client state/UI

の順で確認する。

producerとconsumer双方を確認する。

### Mandatory scenario expansion

各flowについて最低限次を考える。

- success
- invalid input
- dependency failure
- retry
- repeated invocation
- concurrent invocation
- partial completion
- startup/restart
- stale persisted state
- cleanup/expiry

Browserを含む場合:

- first load
- reload
- back/forward navigation
- multiple tabs
- same-origin
- cross-origin
- development
- production
- unavailable API/provider
- expired/revoked session

---

## Pass 4 — Security, concurrency and lifecycle

認証、通貨、報酬、Pack、Match、admin、永続化変更では特に深く確認する。

### Authentication / session

確認する:

- authenticationとauthorizationの順序
- session expiry / revocation
- CSRF
- OAuth state / PKCE
- account linking
- logout
- callback failure
- return destination validation
- cookie scope / SameSite / Secure
- trusted proxy handling
- rate limit key
- multi-tab
- concurrent callback
- restart / multiple processes
- environment misconfiguration
- production fail-closed behavior

1つ問題を発見したら、そのflowの開始・成功・失敗・retry・cleanupまで確認してから次へ進む。

### Persistence

新しいtable / row lifecycleについて確認する:

- 作成
- 読取
- 更新
- expiration
- deletion / retention
- indexes
- uniqueness
- concurrent creation
- migration
- rollback / compatibility

永続データが無制限に増加しないか確認する。

### Currency / Reward / Pack

確認する:

- transaction boundary
- idempotency key namespace
- same key + same payload
- same key + different payload
- concurrent duplicate request
- failure halfway through
- retry after unknown result
- balance cannot become invalid
- audit/replay information

### Match

確認する:

- simultaneous actions
- stale action
- turn ownership
- duplicate action
- deterministic ordering
- event ordering
- reconnect
- snapshot/replay

---

## Pass 5 — UX and integration completeness

UI変更、またはUIから利用されるbackend変更では以下を見る。

- loading
- error
- empty
- retry
- reconnect
- accessibility
- responsive
- browser navigation
- localized user guidance where applicable

backendが新しいerror codeを返す場合、UIがそのcodeを正しく扱うか確認する。

新しいbackend capabilityがproduct featureとして必要なら、実際にユーザーがそこへ到達するUI/flowがあるか確認する。

development-only機能がproduction UIへ露出していないか確認する。

---

## Pass 6 — Tests as proofs

「テストがある」だけで十分としない。

各重要要求について、

> この実装が要求に違反した場合、このテストは本当に失敗するか？

を確認する。

特に次を疑う。

- test名だけが要求を主張している
- assertionが実際のsecurity propertyを検証していない
- mockがproduction behaviorと違う
- happy pathのみ
- raceを逐次実行でしか試していない
- configuration branchがテストされていない
- regression testが元のbugを再現していない

bug候補を発見した場合、既存テストがなぜ検出できなかったかも確認する。

---

## Pass 7 — Operations and documentation

以下に影響する変更ではcode以外も確認する。

- environment variables
- Docker
- deployment
- database migration
- CI
- browser/API origin
- secrets
- networking
- backup / restore

必要な `.env.example`、運用文書、API文書、ADR、IMPLEMENTATION_SPECが更新されているか確認する。

実装と文書でdefault値やproduction requirementが違わないか確認する。

---

## Pass 8 — Sibling search

問題候補を見つけるたび、すぐにコメントせず sibling search を行う。

### Search dimensions

同じ問題について:

- 同じfunctionの別branch
- 同じserviceの別entrypoint
- 同じcontractを使う全caller
- 同じdataを生成する全producer
- 同じdataを読む全consumer
- 同じenv/configの全利用箇所
- 同種のroute
- 同種のDB operation
- 同種のUI flow
- 同じfailure modeの別タイミング

を調べる。

例:

「callbackでconfig検証が遅い」
→ start側は?
→ link callbackは?
→ retry時は?
→ state消費前か?
→ 他replicaでは?
→ error UXは?

「cookie/token rotationが問題」
→ reloadは?
→ multi-tabは?
→ logoutは?
→ account linkは?
→ cross-originは?
→ concurrent recoveryは?

このpassがラリー数削減のため最重要である。

---

## Pass 9 — Final consistency check

コメント投稿前に確認する。

- changed fileを全て確認した
- relevant specを確認した
- linked Issue acceptance criteriaを確認した
- producer/consumerを追跡した
- failure/retry/concurrencyを確認した
- testsを確認した
- docs/config/migrationを確認した
- 各findingについてsibling searchを行った
- finding同士をdeduplicateした

未確認項目がある場合、レビューを確定せず先に確認する。

---

## Reporting policy

投稿するのは主に以下。

- spec violation
- correctness bug
- security issue
- data corruption/loss risk
- race condition
- retry/idempotency bug
- replay/determinism violation
- broken product flow
- meaningful test gap

原則として投稿しない:

- formatterで直るもの
- lintで検出済みのもの
- 単なる命名の好み
- speculativeなmicro optimization
- 根拠のない将来懸念

同じ根本原因による複数箇所は、修正範囲が分かるよう1つのコメントへまとめる。

すべてのhigh-confidence findingを集めてからレビューを提出する。

1個または数個のfindingを発見したことを理由に探索を終了しない。
