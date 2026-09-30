# DECK//DRIVE
## AI Coding Agent Implementation Specification

> Version: 1.0  
> Status: Implementation Ready  
> Target: Raspberry Pi OS 64-bit / Chrome / Firefox / Edge  
> Primary Language: TypeScript  
> Architecture: Modular Monolith + Independent Game Engine

---

# 1. Purpose

本プロジェクトは、ブラウザで動作するデジタルカードゲーム `DECK//DRIVE` を開発する。

ゲームの中心は、

- デッキ構築
- 状況判断
- リソース管理
- カードシナジー
- 相手の意図の推測
- PvP
- ランク戦

である。

カードの所有量やレアリティだけで勝敗が決まらないことを最重要設計思想とする。

---

# 2. Absolute Design Principles

以下は実装上の最優先ルールである。

## P1. Skill > Collection

カード資産よりプレイヤースキルを優先する。

高レアカードは単純な上位互換にしない。

---

## P2. Server Authoritative

PvPにおいてクライアントを信用しない。

クライアントは「何をしたいか」だけを送信する。

ダメージ、ドロー、乱数、勝敗、報酬などをクライアントから受け取らない。

---

## P3. Deterministic

同一条件なら同一結果になること。

```text
seed
+
initial state
+
action sequence
=
same result
```

を保証する。

---

## P4. Everything Important Must Be Reproducible

以下は必ず追跡可能にする。

- Match
- Action
- Event
- RNG
- Reward
- Pack opening
- Currency transaction
- Admin operation

---

## P5. Raspberry Pi First

最終サーバーはRaspberry Pi OS 64-bit。

過剰なインフラを導入しない。

初期構成は1台で完結させる。

---

## P6. Automation First

手作業による環境構築を極力なくす。

```text
mise
Docker
Terraform
Ansible
CI
```

を利用する。

---

## P7. Testability

ゲームルールはGame Engineへ集約する。

UIからゲームルールを実装してはいけない。

---

## P8. UX Is Part of the Product

「機能が動く」だけを完成条件にしない。

loading / error / empty / reconnect / accessibility / responsiveまで実装する。

---

# 3. Technology Stack

## Frontend

- React
- TypeScript
- Vite
- React Router
- Zustand
- TanStack Query
- Tailwind CSS
- CSS Variables

## Backend

- Node.js
- TypeScript
- NestJS

## Database

- PostgreSQL
- Prisma

## Realtime

- WebSocket

## Testing

- Vitest
- Playwright
- fast-check

## Tool management

- mise
- pnpm

## Infrastructure

- Docker
- Docker Compose
- Terraform
- Ansible

---

# 4. Repository Structure

```text
deck-drive/
├── apps/
│   ├── web/
│   ├── api/
│   └── admin/
│
├── packages/
│   ├── game-engine/
│   ├── card-definitions/
│   ├── shared/
│   ├── ui/
│   ├── config/
│   ├── logger/
│   └── test-utils/
│
├── infra/
│   ├── terraform/
│   ├── ansible/
│   └── docker/
│
├── tests/
│   ├── e2e/
│   ├── integration/
│   └── fixtures/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── game/
│   └── operations/
│
├── scripts/
│
├── .github/
│   └── workflows/
│
├── mise.toml
├── package.json
├── pnpm-workspace.yaml
├── docker-compose.yml
└── README.md
```

---

# 5. Development Environment

## 5.1 mise

すべての開発ツールのバージョンを`mise.toml`で固定する。

最低限:

```text
node
pnpm
terraform
ansible
```

を管理する。

バージョンを勝手に変更しない。

---

# 5.2 One-command setup

以下を成立させる。

```bash
mise install
pnpm install
pnpm setup
pnpm dev
```

`pnpm setup`:

```text
.env生成
↓
Docker起動
↓
DB migration
↓
DB seed
↓
開発ユーザー生成
↓
カードデータ投入
↓
ミッション投入
↓
コスメティック投入
```

---

# 5.3 Local Docker

開発環境:

```text
postgres
mailpit
api
web
admin
```

Redisは初期版では必須にしない。

---

# 6. Architecture

## 6.1 Modular Monolith

初期構成:

```text
                 Browser
                    |
              HTTPS / WSS
                    |
                 nginx
                    |
             Application
                    |
      ┌─────────────┼─────────────┐
      |             |             |
     REST        WebSocket      Admin
      |             |
      └─────────────┤
                    |
               Game Engine
                    |
                PostgreSQL
```

---

# 6.2 Domain modules

API:

```text
auth
player
card
deck
battle
match
rating
pack
mission
reward
cosmetic
season
admin
health
```

各module:

```text
controller
service
repository
domain
dto
```

---

# 6.3 Dependency rules

以下は禁止。

```text
Game Engine → DB
Game Engine → HTTP
Game Engine → React
Game Engine → NestJS
```

Game Engineは純粋なdomain packageとする。

---

# 7. Game Engine

最重要コンポーネント。

`packages/game-engine`

## API

```ts
validateAction(
  state: BattleState,
  action: GameAction,
  definitions?: CardDefinitionSource
): ValidationResult;

applyAction(
  state: BattleState,
  action: GameAction,
  definitions?: CardDefinitionSource
): EngineResult;

calculateResult(
  state: BattleState
): BattleResult;
```

`PLAY_CARD` には、そのmatchで固定された `CardDefinitionSource` を渡す。`END_TURN` では
`definitions` 引数は不要である。

可能な限りpure functionとする。

global mutable state禁止。

---

# 8. Battle State

概念:

```ts
type BattleState = {
  matchId: MatchId;
  rulesVersion: string;
  cardDataVersion: string;
  seed: string;

  turn: number;
  activePlayerId: PlayerId;
  phase: BattlePhase;
  initialDrawCount: number;
  turnDrawCount: number;

  players: BattlePlayerState[];

  stack: EffectStack;

  events: GameEvent[];
};
```

`initialDrawCount` は各プレイヤーの初期手札に、`turnDrawCount` は各ターン開始時に適用する。

Player:

```ts
type BattlePlayerState = {
  id: PlayerId;

  hp: number;
  maxHp: number;

  energy: number;
  maxEnergy: number;

  block: number;

  drawPile: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];

  statuses: Status[];
};
```

---

# 9. Initial Battle Rules

初期値:

```text
HP = 30
Max Energy = 3
Deck = 30 cards
Same card = max 3
```

ターン制。

Blockあり。

Intent表示あり。

---

# 10. Battle State Machine

```text
MATCH_INIT
    ↓
DRAW
    ↓
PLAYER_TURN
    ↓
ACTION
    ↓
RESOLVE
    ↓
CHECK_WIN
    ↓
NEXT_TURN
    ↓
PLAYER_TURN
    ↓
...
    ↓
MATCH_END
```

状態遷移をコード上で明示する。

---

### E03 atomic public contract

E03 exposes only stable phases: `PLAYER_TURN` and `MATCH_END`. A submitted
`PLAY_CARD` resolves `ACTION`, `RESOLVE`, and `CHECK_WIN` atomically before the
next state is returned. `END_TURN` resolves `NEXT_TURN` atomically. The expanded
diagram above is the internal resolution sequence, not a set of observable
`BattleState.phase` values.

# 11. Game Action

例:

```ts
type GameAction =
  | {
      type: "PLAY_CARD";
      playerId: PlayerId;
      cardId: CardId;
      targetId?: EntityId;
    }
  | {
      type: "END_TURN";
      playerId: PlayerId;
    };
```

クライアントから、

```text
damage
heal amount
draw result
random result
```

などを受け取ってはいけない。

---

# 12. Game Events

ActionからEventを生成する。

例:

```text
CARD_PLAYED
EFFECT_STARTED
DAMAGE_DEALT
BLOCK_REDUCED
ENTITY_DAMAGED
STATUS_APPLIED
STATUS_REMOVED
CARD_DRAWN
CARD_DISCARDED
TURN_STARTED
TURN_ENDED
MATCH_FINISHED
```

UI animationはGame Eventを利用する。

---

# 13. RNG

Game Engineから`Math.random()`を排除する。

```ts
interface RandomSource {
  next(): number;
}
```

実装:

```text
SeededRandom
FixedRandom
```

---

# 14. Replay

すべてのMatchに以下を保存する。

```text
matchId
engineVersion
rulesVersion
cardDataVersion
seed
initialState
actions
events
finalState
```

CLI:

```bash
pnpm replay --match <matchId>
```

---

# 15. Replay Regression

重要な試合をfixture化。

```text
tests/fixtures/replays/
```

Engine更新後に全Replayを再生する。

意図しない結果変更が発生した場合CIをfailさせる。

---

# 16. Card System

Card:

```text
id
name
class
rarity
cost
type
description
effects
keywords
artwork
deckLimit
```

Classes:

```text
Sword
Guardian
Mage
Alchemist
Hunter
Trickster
Neutral
```

MVP:

```text
Sword
Guardian
Neutral
```

Card types:

```text
Attack
Skill
Power
Reaction
Curse
```

---

# 17. Card DSL

単純な効果はデータ定義する。

```ts
{
  id: "sword_strike",
  cost: 1,
  type: "ATTACK",
  effects: [
    {
      type: "DAMAGE",
      amount: 6,
      target: "ENEMY"
    }
  ]
}
```

複雑な効果だけcustom resolverを使う。

---

# 18. Card Versioning

カードデータを直接上書きしない。

```text
cards
card_versions
```

Matchに、

```text
cardDataVersion
rulesVersion
engineVersion
```

を保存。

過去Replayを維持する。

---

# 19. Deck Building

初期:

```text
30 cards
same card max 3
deck cost cap
```

高レアリティカードは、

```text
deck cost
copy limit
```

で構築上のトレードオフを発生させる。

---

# 20. CPU

難易度:

```text
Easy
Normal
Hard
Expert
```

CPUもGame Engineを使用。

CPU専用のゲームルールは禁止。

CPU:

```text
legal actions
↓
evaluate
↓
choose
```

---

# 21. PvP

完全Server Authoritative。

```text
Client Action
↓
Authentication
↓
Match validation
↓
Action validation
↓
Game Engine
↓
Persist
↓
Broadcast
```

---

# 22. WebSocket

Endpoint:

```text
/ws/matches/:matchId
```

Client:

```text
ACTION
PING
RESYNC
```

Server:

```text
STATE
EVENT
ERROR
PONG
```

---

# 23. Reconnection

disconnect後、

```text
60 seconds
```

程度のgrace periodを設ける。

再接続時:

```text
latest snapshot
+
missing events
```

を送信。

---

# 24. Turn Timeout

初期:

```text
60 seconds
```

0になったらauto end turn。

連続timeoutはペナルティ。

---

# 25. Match Modes

## Ranked

Rating変動。

## Casual

Rating変動なし。

## Private

Room code。

---

# 26. Matchmaking

Ranked:

```text
Elo近傍優先
```

待機時間に応じて許容レート差を拡大。

Casual:

```text
緩いマッチング
```

Private:

```text
code based
```

---

# 27. Rating System

Eloを基礎とする。

期待値:

```text
E = 1 / (1 + 10 ^ ((Rb - Ra) / 400))
```

基本:

```text
ΔR = K × (S - E)
```

---

# 28. K Value

初期値:

```text
0-20 games
K = 40

21-100 games
K = 28

101+ games
K = 20
```

Season placementでは高Kを使用可能。

定数ではなく設定として管理。

---

# 29. Performance Adjustment

「格上相手に負けても善戦した」場合にRating減少を緩和する。

基本:

```text
damageRatio =
damageDealt / opponentInitialHp
```

0～1にclamp。

敗北時:

```text
performanceBonus =
min(0.45, damageRatio * 0.45)
```

```text
S = performanceBonus
```

としてEloへ入力する。

例:

```text
完全敗北      ≈ S 0.00
善戦          ≈ S 0.20
瀕死まで削る  ≈ S 0.40
```

初期値はbalance設定として変更可能にする。

---

# 30. Performance Anti-abuse

damageだけを稼いで意図的に負ける戦術を防ぐ。

将来的に、

```text
damage
board advantage
turn efficiency
resource efficiency
```

を統合できるStrategy interfaceを作る。

MVPではdamageRatio中心でよい。

---

# 31. Rating Abuse Detection

以下を記録/検出:

```text
同一相手との異常な連戦
意図的敗北
damage farming
disconnect abuse
boosting
```

Suspicious matchをflag可能にする。

---

# 32. Rank Presentation

内部:

```text
rating
```

UI:

```text
Bronze
Silver
Gold
Platinum
Diamond
Master
Grand Master
```

各rankにI/II/IIIを設定可能。

UIは、

```text
Rank
RR / Progress
```

形式を目指す。

---

# 33. Seasons

Seasonごとに:

```text
rating soft reset
rank
rank rewards
cosmetics
titles
missions
```

を更新。

カード資産は維持する。

---

# 34. Authentication

OAuth Provider Adapter:

```text
Google
Discord
X
```

DB:

```text
users
oauth_accounts
```

OAuth account:

```text
id
userId
provider
providerUserId
createdAt
```

同一Userに複数Providerをlink可能。

---

# 35. Session Security

以下を利用:

```text
HttpOnly
Secure
SameSite
CSRF protection
OAuth state validation
```

secretをclientへ送らない。

---

# 36. Pack System

ガチャではなくPackと呼ぶ。

## Normal Pack

```text
5 cards
R以上 1枚確定
```

## Box

```text
10 packs
50 cards

SR 2枚以上
UR 1枚以上
```

## Rare Pack

```text
5 cards
R以上 5枚
UR 1枚確定
```

---

# 37. Box Guarantee

Box最低保証:

```text
R以上: 10枚
SR: 2枚
UR: 1枚
```

保証処理はserver-side。

---

# 38. Pack Generation

Pure function:

```ts
openPack(seed, pool): PackResult
openBox(seed, pool): BoxResult
```

抽選とUIを分離。

---

# 39. Pack Simulation

大量シミュレーションCLIを実装。

```bash
pnpm simulate:packs
```

以下を確認可能にする。

```text
rarity distribution
average SR
average UR
duplicate rate
```

---

# 40. Pack Products

現金販売なし。

Gemで購入。

## Weekly

```text
Box
10% discount
1/week
```

## Monthly

```text
Normal Box
+
Rare Pack x1

通常Boxと同価格
1/month
```

---

# 41. Currency

```text
Gem
Exchange Point
```

Gem:

```text
missions
level rewards
login bonus
events
admin
```

などから取得。

---

# 42. Duplicate Conversion

同一カード3枚まで。

4枚目以降:

```text
Card
↓
Exchange Point
```

共通通貨。

暫定:

```text
N    5
R   15
SR  50
SSR 150
UR  500
```

レアリティ別交換通貨は作らない。

---

# 43. Currency Ledger

すべての通貨変更をledger化。

```text
id
playerId
currency
amount
type
reason
referenceId
createdAt
```

---

# 44. Transaction Safety

Pack開封:

```text
BEGIN
↓
lock player
↓
validate balance
↓
deduct Gem
↓
generate cards
↓
grant cards
↓
convert duplicates
↓
write opening log
↓
COMMIT
```

同一リクエストの二重処理を防ぐ。

---

# 45. Idempotency

以下にはidempotency keyを付ける。

```text
Pack opening
Reward claim
Currency grant
Card grant
Cosmetic grant
```

---

# 46. Cosmetics

すべてゲーム性能に影響させない。

種類:

```text
Card Frame
Card Full-Art FX
Card Animation
Hologram
Leader Skin
Playmat
Card Sleeve
Title
Profile Decoration
```

---

# 47. Cosmetic Sources

```text
Gem
Exchange Point
Daily Mission
Weekly Mission
Monthly Mission
Player Level
Login Bonus
Ranked Reward
Event
Achievement
```

---

# 48. Cosmetic Rendering

```text
Card
├── Artwork
├── Base Frame
├── Rarity Frame
├── Cosmetic FX
├── Hologram
├── Particle
└── Interaction
```

Game EngineはCosmeticを知らない。

---

# 49. Missions

Daily:

```text
CPU battle
PvP battle
card play
damage
block
win
```

Weekly:

```text
ranked games
class usage
deck objectives
```

Progressはserver authoritative。

---

# 50. Login Bonus

7-day cycle。

例:

```text
Day 1 Gem
Day 2 Exchange Point
Day 3 Pack
Day 4 Gem
Day 5 Cosmetic
Day 6 Pack
Day 7 Rare Reward
```

日付判定はserver time。

---

# 51. Player Level

XPを取得。

Reward:

```text
Gem
Pack
Cosmetic
Exchange Point
Title
```

Player Levelによる戦闘能力補正は禁止。

---

# 52. Database

主要テーブル:

```text
users
oauth_accounts
players

cards
card_versions
player_cards

decks
deck_cards

matches
match_players
match_actions
match_events
match_snapshots

ratings
rating_history
seasons

packs
pack_products
pack_openings

missions
player_missions

login_rewards
player_login_rewards

cosmetics
player_cosmetics

currency_transactions
exchange_point_transactions

admin_actions
audit_logs
```

---

# 53. Match Persistence

保存:

```text
match
players
actions
events
snapshots
```

Match Eventをanalytics/replayにも利用する。

---

# 54. Database Rules

- Prisma migrationをGit管理
- production DBを直接編集しない
- migrationはreview対象
- destructive migrationを避ける
- expand/contractを推奨

---

# 55. Admin

Admin appを作る。

機能:

```text
Player Search
Player Detail
Gem Grant
Exchange Point Grant
Card Grant
Cosmetic Grant
Mission Complete
Match Search
Replay
Rating Inspection
Pack Simulation
Feature Flags
Maintenance Mode
```

---

# 56. Audit Log

Admin操作:

```text
adminId
action
target
reason
timestamp
before
after
```

を保存。

---

# 57. Debug Mode

development/staging only:

```text
Give All Cards
Set Gem
Set Level
Set Rating
Start Specific Battle
Force Draw
Force RNG Seed
Skip Turn
Apply Status
Kill Entity
```

ProductionではFeature Flagで完全無効化。

---

# 58. Debug CLI

以下を実装する。

```bash
pnpm replay
pnpm simulate:packs
pnpm db:seed
pnpm db:reset
pnpm health
pnpm logs
```

必要に応じてdebug CLIを増やす。

---

# 59. Structured Logging

JSON logging。

例:

```json
{
  "level": "info",
  "event": "match.action",
  "matchId": "...",
  "playerId": "...",
  "action": "PLAY_CARD",
  "requestId": "..."
}
```

---

# 60. Correlation ID

HTTP / WebSocket requestへ:

```text
requestId
```

Match処理へ:

```text
matchId
playerId
```

を付与。

ログから、

```text
request
→ API
→ Game Engine
→ DB
→ WebSocket
```

を追跡可能にする。

---

# 61. Error Handling

User:

```text
カードを使用できません
```

Log:

```text
ACTION_REJECTED
reason=CARD_NOT_IN_HAND
matchId=...
requestId=...
```

内部エラー詳細をclientへ送らない。

---

# 62. Health

```text
/health/live
/health/ready
```

live:

```text
process alive
```

ready:

```text
DB reachable
dependencies ready
```

---

# 63. Frontend State

Server State:

```text
TanStack Query
```

UI State:

```text
Zustand
```

Battle State:

```text
WebSocket
```

Game Rules:

```text
Game Engine
```

FrontendへGame Engineの別実装を作らない。

---

# 64. Frontend Routes

```text
/
├── title
├── login
├── home
├── missions
├── rewards
├── cards
├── cards/:id
├── decks
├── decks/:id
├── packs
├── pack-opening
├── battle/cpu
├── battle/ranked
├── battle/casual
├── battle/private
├── profile
├── cosmetics
└── settings
```

---

# 65. Battle UI

最低限:

```text
Opponent HP
Opponent Intent
Opponent statuses

Battle Field

Player HP
Player Block
Energy

Hand

End Turn
```

カードは視認性を最優先。

---

# 66. Card States

```text
normal
hover
focus
active
selected
disabled
new
```

をデザインシステムとして定義。

---

# 67. Accessibility

必須:

```text
keyboard navigation
visible focus
aria-label
sufficient contrast
non-color information
reduced motion
```

---

# 68. Responsive

対象:

```text
Desktop
Tablet
Mobile
```

ただし対戦ゲームの操作性を優先し、極端に小さい画面では明確な警告/対応方針を持つ。

---

# 69. Animation

Event-driven。

例:

```text
CARD_PLAYED
→ card animation

DAMAGE_DEALT
→ damage number
→ hit animation

BLOCK_REDUCED
→ shield animation

CARD_DRAWN
→ card movement
```

Game Engineはanimationを知らない。

---

# 70. Performance

Frontend:

```text
code splitting
lazy loading
image compression
WebP/AVIF
cache
prefetch
```

Server:

```text
軽量Game Engine
適切なDB index
同期処理の最小化
ログrotate
```

---

# 71. Static Assets

```text
/assets/cards
/assets/cosmetics
/assets/leaders
/assets/playmats
```

静的ファイルはnginxから配信可能にする。

---

# 72. Asset Licensing

公開版では、

- original assets
- 明確なgame-use license
- 必要な許諾

を優先する。

外部イラストをカードコンテンツの中心に利用する場合は利用規約を必ず確認する。

---

# 73. Security

必須:

```text
HTTPS
HttpOnly cookies
CSRF protection
OAuth state validation
input validation
rate limiting
WebSocket authentication
RBAC
XSS prevention
SQL injection prevention
audit logging
```

---

# 74. Rate Limits

対象:

```text
login
pack opening
reward claim
matchmaking
WebSocket action
admin API
```

Currency / reward系を特に厳しくする。

---

# 75. Anti Cheat

clientを信用しない。

Serverが、

```text
legal card
legal target
legal turn
legal energy
legal state
```

を検証する。

---

# 76. Backup

Raspberry Piはsingle point of failure。

必須:

```text
daily PostgreSQL dump
weekly full backup
retention
restore test
```

バックアップをPi内部だけに保存しない。

---

# 77. Disaster Recovery

新しいPiへ、

```text
Raspberry Pi OS
↓
Ansible
↓
Docker
↓
configuration
↓
DB restore
↓
application
↓
health check
```

で復旧できること。

---

# 78. Infrastructure

## Terraform

外部インフラ・DNS・必要な管理対象をコード化。

## Ansible

Pi OSの構成をコード化。

## Docker Compose

アプリケーションruntimeをコード化。

責務を混ぜない。

---

# 79. Production deployment

```bash
pnpm infra:plan
pnpm infra:apply
pnpm deploy
pnpm health
```

Deploy:

```text
build
↓
tag
↓
backup
↓
migration
↓
restart
↓
health check
↓
smoke test
```

---

# 80. Rollback

前versionのDocker imageを保持。

Application rollback可能にする。

DB migrationは不可逆変更を避ける。

---

# 81. CI

PR:

```text
lint
format check
typecheck
unit test
integration test
engine replay
build
```

main:

```text
all above
E2E
Docker build
```

---

# 82. Testing Pyramid

```text
                E2E
             /       \
       Integration   Replay
          /             \
       Unit -------- Game Engine
```

Game Engine testを最重要とする。

---

# 83. Game Engine Tests

カードごとに、

```text
given
when
then
```

を記述。

例:

```ts
it("deals 5 damage", () => {
  const definitions = [{ id: "strike", cost: 1, effects: [{ type: "DAMAGE", amount: 5, target: "ENEMY" }] }];
  const result = applyAction(state, action, definitions);

  expect(result.state.players[1].hp).toBe(25);
});
```

---

# 84. Property Based Tests

fast-check等を利用。

保証:

```text
HP never below 0
energy never below 0
card count never negative
deck size never exceeds limit
same card never exceeds 3
invalid action never changes state
turn cannot regress
```

---

# 85. E2E

必須flow:

```text
login
home
login bonus
mission
card list
card detail
deck build
CPU battle
pack opening
box opening
cosmetic
ranked
private match
disconnect
reconnect
```

Chrome / FirefoxをCIで実行。

EdgeはChromium系として定期検証。

---

# 86. Analytics

記録:

```text
match length
turn count
class pick rate
card usage rate
deck win rate
class win rate
surrender rate
disconnect rate
pack distribution
duplicate rate
rating changes
```

Balance調整に使用。

---

# 87. Balance Rules

以下は禁止:

```text
random instant kill
universal auto-win
mandatory high rarity
extreme first-player advantage
unanswerable lock
pure random victory
```

カードを強くする場合もcounterplayを用意する。

---

# 88. Initial Cards

初期目標:

```text
N    12
R    10
SR    7
SSR   4
UR    2
```

合計35枚程度。

MVP:

```text
Sword
Guardian
Neutral
```

---

# 89. Missions / Rewards Loop

ゲーム全体の循環:

```text
Play
↓
Mission
↓
Gem / Reward
↓
Pack
↓
New Cards
↓
Deck Building
↓
Battle
↓
Rating
↓
Cosmetics
↓
Play
```

---

# 90. Cosmetics Loop

カード性能をインフレさせず、

```text
card cosmetics
leader skins
playmats
sleeves
titles
profile decorations
```

によって長期的な収集目的を作る。

---

# 91. Feature Flags

例:

```text
ENABLE_RANKED
ENABLE_RARE_PACK
ENABLE_X_LOGIN
ENABLE_COSMETICS
ENABLE_PRIVATE_MATCH
ENABLE_NEW_CARDS
MAINTENANCE_MODE
```

---

# 92. Environment

```text
development
staging
production
```

を分離。

Production debug seed禁止。

Production OAuth secretをlocalへ持ち込まない。

---

# 93. Environment Variables

例:

```text
DATABASE_URL
SESSION_SECRET

GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET

DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET

X_CLIENT_ID
X_CLIENT_SECRET

PUBLIC_BASE_URL
```

`.env.example`をGit管理。

secretはcommit禁止。

---

# 94. API

```text
POST /api/v1/auth/oauth/:provider
GET  /api/v1/me

GET  /api/v1/cards
GET  /api/v1/cards/:id

GET  /api/v1/decks
POST /api/v1/decks
PUT  /api/v1/decks/:id
DELETE /api/v1/decks/:id

GET  /api/v1/missions
POST /api/v1/missions/:id/claim

GET  /api/v1/packs
POST /api/v1/packs/:id/open

GET /api/v1/cosmetics

POST /api/v1/matches
GET /api/v1/matches/:id
```

---

# 95. API Versioning

```text
/api/v1
```

破壊的変更はv2。

Game Engine versionとAPI versionを分離。

---

# 96. Repository Rules

Game Engine:

```text
No DB
No HTTP
No React
No filesystem
```

Domain:

```text
repository interfaces
```

Infrastructure:

```text
Prisma implementation
```

---

# 97. ADR

重要な設計判断を記録。

```text
docs/architecture/adr/

0001-modular-monolith.md
0002-game-engine-isolation.md
0003-postgresql.md
0004-rpi-deployment.md
0005-elo-rating.md
0006-pack-system.md
0007-deterministic-replay.md
0008-iac.md
0009-oauth.md
0010-cosmetics.md
```

---

# 98. Commands

必須:

```bash
pnpm dev
pnpm build

pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:engine

pnpm lint
pnpm typecheck

pnpm db:migrate
pnpm db:seed
pnpm db:reset
pnpm db:studio

pnpm replay
pnpm simulate:packs

pnpm infra:plan
pnpm infra:apply

pnpm deploy
pnpm health
pnpm logs
```

---

# 99. Development Seed

Development DBには、

```text
debug user
sample cards
sample decks
sample cosmetics
sample missions
sample pack products
sample matches
```

を投入する。

本番seedにはdebug userを含めない。

---

# 100. Debug Fixtures

```text
tests/fixtures/
├── cards/
├── decks/
├── battles/
├── packs/
└── replays/
```

ファイル名はテスト目的が分かるようにする。

例:

```text
damage-reduces-block.json
poison-kills-at-end-turn.json
duplicate-ur-converts-points.json
ranked-underdog-loss.json
```

---

# 101. Data Integrity

Currency / Card / Rewardはtransactional。

例えばPack開封は、

```text
currency deduction
+
card grant
+
duplicate conversion
+
opening record
```

をatomicに処理する。

---

# 102. Match Concurrency

同一MatchへのActionはserializeする。

同時操作によって、

```text
double action
negative energy
duplicate turn
```

などが発生しないこと。

---

# 103. Snapshot

Match中、

```text
action/event sequence
```

を保存し、一定間隔でsnapshotを作る。

Reconnect時の再構築を高速化する。

---

# 104. Logging Policy

ログに以下を絶対に出さない。

```text
password
OAuth secret
session secret
access token
refresh token
```

必要に応じてPIIをmaskする。

---

# 105. Browser Compatibility

正式対応:

```text
Chrome
Firefox
Edge
```

主要画面をPlaywrightで検証する。

---

# 106. Mobile

Mobileでも最低限閲覧・管理可能なresponsive UIを用意。

ただしPvPの操作性を優先。

---

# 107. Implementation Strategy

Coding AIは一度に全機能を実装しない。

以下のvertical slice方式を採用する。

---

## Phase 0 — Foundation

実装:

```text
monorepo
mise
pnpm
TypeScript
ESLint
Prettier
Docker Compose
CI
```

完了条件:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm build
```

が成功。

---

## Phase 1 — Game Engine

実装:

```text
BattleState
GameAction
GameEvent
RNG
State Machine
basic effects
basic cards
```

CPUなし。

UIなしでもテスト可能にする。

---

## Phase 2 — Replay

実装:

```text
seed
action recording
event recording
snapshot
replay CLI
```

同一seedで同一結果になることをテスト。

---

## Phase 3 — Database

Prisma schema:

```text
players
cards
card_versions
player_cards
decks
deck_cards
matches
match_events
match_actions
match_snapshots
```

Migration / Seed。

---

## Phase 4 — API

実装:

```text
Player
Cards
Decks
CPU Match
Rewards
```

---

## Phase 5 — Web

実装:

```text
Title
Login placeholder
Home
Card List
Card Detail
Deck Builder
CPU Battle
Result
```

---

## Phase 6 — Pack

実装:

```text
Pack
Box
Rare Pack
Pack opening
Currency
Duplicate conversion
```

Simulation CLIも実装。

---

## Phase 7 — Meta

実装:

```text
Missions
Login Bonus
Player Level
Cosmetics
```

---

## Phase 8 — Authentication

実装:

```text
Google
Discord
X
```

Provider Adapterを使用。

---

## Phase 9 — PvP

実装:

```text
WebSocket
Matchmaking
Casual
Private
Reconnect
```

---

## Phase 10 — Ranked

実装:

```text
Elo
K values
Performance adjustment
Rank
Season
Rating history
```

---

## Phase 11 — Admin

実装:

```text
Player management
Currency grant
Card grant
Cosmetic grant
Match replay
Rating inspection
Pack simulation
Feature flags
```

---

## Phase 12 — Infrastructure

実装:

```text
Ansible
Terraform
Docker production
backup
restore
deployment
rollback
health monitoring
```

---

## Phase 13 — Polish

実装:

```text
Animations
Cosmetics FX
Accessibility
Responsive
Performance
Browser compatibility
UX polish
```

---

# 108. Coding AI Operating Rules

Coding AIは以下を厳守する。

## Rule 1

仕様書をsource of truthとして扱う。

## Rule 2

軽微な曖昧点で作業を停止しない。

合理的な設計を自分で決める。

## Rule 3

重要な判断はADRへ記録。

## Rule 4

既存コードを確認してから変更する。

## Rule 5

Game EngineをUIへコピーしない。

## Rule 6

重要なロジックにはテストを書く。

## Rule 7

DBを直接編集しない。

## Rule 8

secretをcommitしない。

## Rule 9

production debug functionalityを残さない。

## Rule 10

仕様変更時は、

```text
code
test
docs
```

を同時更新する。

---

# 109. When Requirements Conflict

優先順位:

```text
1. Security
2. Server Authority
3. Determinism / Replayability
4. Data Integrity
5. Skill > Collection
6. Raspberry Pi compatibility
7. Testability
8. Maintainability
9. UX
10. Implementation convenience
```

---

# 110. Definition of Done

機能は以下を満たして完成とする。

```text
[ ] Implementation
[ ] Typecheck
[ ] Unit test
[ ] Integration test if applicable
[ ] E2E test if user-facing
[ ] Error state
[ ] Loading state
[ ] Empty state
[ ] Accessibility
[ ] Responsive
[ ] Logging
[ ] Security
[ ] Documentation
```

Game Engine変更:

```text
[ ] deterministic test
[ ] replay regression
```

DB変更:

```text
[ ] migration
[ ] transaction safety
[ ] recovery consideration
```

---

# 111. Final Acceptance Criteria

## Developer setup

```bash
mise install
pnpm install
pnpm setup
pnpm dev
```

で起動。

---

## Game

```text
Login
→ Home
→ Deck
→ CPU Battle
→ Result
→ Reward
```

が完全に動作。

---

## Pack

```text
Pack
Box
Rare Pack
Duplicate conversion
```

が動作。

---

## PvP

```text
Matchmaking
WebSocket
Server Authoritative
Reconnect
```

が動作。

---

## Ranked

```text
Elo
Performance adjustment
Rank
Season
```

が動作。

---

## Debug

```bash
pnpm replay --match <matchId>
```

で実際のMatchを再現。

---

## Infrastructure

新しいRaspberry Piへ、

```text
OS
→ Ansible
→ Docker
→ DB
→ Application
```

を再構築可能。

---

## Recovery

BackupからDBをrestoreしてゲームを復旧可能。

---

# 112. Final Product Architecture

```text
                         INTERNET
                             |
                     HTTPS / WebSocket
                             |
                         [ nginx ]
                             |
                     [ Application ]
                             |
          ┌──────────────────┼──────────────────┐
          |                  |                  |
       REST API          WebSocket            Admin
          |                  |
          └──────────────┬───┘
                         |
                  [ Domain Modules ]
                         |
       ┌─────────────────┼──────────────────┐
       |                 |                  |
     Cards              Match             Rating
       |                 |                  |
     Decks            Matchmaking         Season
       |                 |
       └──────────┬──────┘
                  |
             [ GAME ENGINE ]
                  |
        ┌─────────┼──────────┐
        |         |          |
      Rules     Effects      RNG
        |         |          |
        └─────────┼──────────┘
                  |
             Event Stream
                  |
             Replay System
                  |
             PostgreSQL
```

Infrastructure:

```text
Raspberry Pi OS 64-bit
        |
     Ansible
        |
      Docker
        |
  Docker Compose
        |
 ┌──────┼─────────┐
 nginx  API      PostgreSQL
```

Development:

```text
mise
 ↓
pnpm
 ↓
Docker Compose
 ↓
Vitest / Playwright
 ↓
CI
```

---

# 113. Most Important Requirement

このプロジェクトの技術的な最終目標は、

> **「作れる」ではなく、「誰が環境を壊しても、AIが原因を追跡し、同じ状態を再現し、修正し、テストし、Raspberry Piへ再デプロイできる」こと**

である。

したがって、

```text
Deterministic Game Engine
+
Replay
+
Structured Logs
+
Request IDs
+
Database Transactions
+
Automated Tests
+
mise
+
Docker
+
Terraform
+
Ansible
+
CI
+
Backup / Restore
```

を単なる補助機能ではなく、本プロジェクトの中核アーキテクチャとして扱う。

ゲーム面では、

> **Skill > Collection**

を最後まで維持する。

カード収集、Pack、Rank、Mission、Level、Cosmeticsは、

```text
遊ぶ
↓
上達する
↓
報酬を得る
↓
集める
↓
デッキを試す
↓
また遊ぶ
```

という循環を作るために存在する。

課金によってカード性能を販売しない。

---

# 114. Start Instruction for Coding AI

この仕様書を読み終えたら、質問待ちで停止せず、まずrepositoryを分析する。

repositoryが空の場合:

```text
Phase 0
→ Phase 1
→ Phase 2
```

から開始する。

既存repositoryの場合は既存コードを尊重し、必要なarchitectureとの差分を整理してから実装する。

各phaseについて、

```text
Implement
→ Test
→ Verify
→ Document
→ Commit-ready state
```

まで完了させる。

実装途中で合理的な判断が必要になった場合は、以下を優先する。

```text
Security
>
Server Authority
>
Determinism
>
Data Integrity
>
Skill
>
Maintainability
>
UX
>
Convenience
```

そして、最終的に**ローカル開発からRaspberry Pi本番運用まで再現可能な完成プロジェクト**を生成すること。
