# DECK//DRIVE ビジュアル・演出・サウンド仕様

> Status: Design baseline  
> Updated: 2026-09-15  
> Scope: 対戦画面、カード、ターン遷移、パック開封、効果音、いらすとや素材運用

## 1. 体験の核

DECK//DRIVE は「カードを一枚出すたびに、小さな必殺技を放つ」デジタルカードゲームとして設計する。カードの効果を即座に理解でき、操作したことへの反応が気持ちよく、長い対戦でも情報過多にならないことを最優先にする。

世界観は **ネオンで増幅されたアーケード卓上対戦**。イラストは親しみのあるいらすとや素材を中心にしつつ、フレーム、光、粒子、画面遷移、文字組みで「素材を並べただけ」には見せない。かわいさと競技性を両立させる。

### 演出の原則

1. **意味が先、派手さは後。** ダメージ・防御・回復・ドローを色、軌道、音で区別する。
2. **入力に即応する。** ホバーは 80 ms 以内、押下は即時、結果はネットワーク待ちでも予告表示する。
3. **勝敗に関わる演出は必ず最後まで読める。** HP、ブロック、エネルギーの変化を画面外で済ませない。
4. **演出を短縮可能にする。** 対戦のテンポを損なう長尺ムービーは作らず、パック開封以外の**各イベント演出**は原則 1.2 秒以内に収める。複数イベントからなる action は sequence 順に連結するため、この上限を超え得る。致死から結果表示までの終局シーケンスだけは最大 2.1 秒の例外とする。短縮は確定済みイベントを捨てず、現在の演出と保留キューを sequence 順に 100 ms の状態遷移へ畳む操作とする。
5. **再現性を守る。** 対戦結果は game-engine のイベント列が唯一の正。クライアントの演出はイベントを再生するだけで、ゲーム状態を変更しない。

## 2. アートディレクション

### カラーと質感

| 役割 | 色 | 用途 |
| --- | --- | --- |
| 背景 | `#07111F` / `#0D2038` | 卓面、暗部、余白 |
| 画面の基調光 | `#29D7FF` | UI、通常の選択、ドロー |
| 攻撃 | `#FF5A6A` → `#FFB347` | ダメージ、攻撃カード、被弾 |
| 防御 | `#5DE2A5` → `#7CD4FF` | ブロック、防御カード、軽減 |
| 回復 | `#D7FF6D` | 回復、再生 |
| レア | `#B78CFF` | RARE、パックの高レア演出 |
| SUPER RARE | `#FF7BD5` | SR のカード枠、公開リング |
| SPECIAL SUPER RARE | `#A9E8FF` | SSR のカード枠、公開リング |
| ULTRA RARE | `#FFD166` | UR のカード枠、公開リング |
| 警告 | `#FFC857` | エネルギー不足、残り時間 |

背景は深い青黒のグラデーションに、弱い走査線、細いグリッド、浮遊する微粒子を重ねる。発光は色数を増やしすぎず、同時に強く光る要素を「選択中のカード」「解決中の効果」「主ボタン」の三つまでに制限する。

### タイポグラフィとアイコン

- 数値は視認性の高い太字サンセリフ、カード名はやや幅のある太字で統一する。
- HP はハート、ブロックは盾、エネルギーは稲妻、ドローはカード束のアイコンを用いる。色だけで意味を伝えない。
- 数字の増減では `+5 BLOCK` / `-6` を対象の近くに大きく出し、色・アイコン・短いラベルを併用する。

## 3. カードデザイン

カードは縦長比率 `5:7`、標準表示 220 × 308 px を基準にする。スマートフォンでは 154 × 216 px まで縮小できること。角丸は 16 px、イラスト枠の角丸は 10 px とする。

```text
┌────────────────────┐
│  1              攻撃 │  コスト / 種別
│ ┌──────────────────┐ │
│ │   いらすとや絵   │ │  主役を中央、余白を残す
│ └──────────────────┘ │
│ ストライク             │  カード名
│ 相手に 6 ダメージ。    │  効果文
│  SWORD       ● BASIC  │  クラス / レアリティ
└────────────────────┘
```

### フレームの役割

| 情報 | 表現 |
| --- | --- |
| クラス | 左右の細い発光ラインとカード下部のラベル色。SWORD=赤、GUARDIAN=緑、MAGE=紫、ALCHEMIST=黄、HUNTER=橙、TRICKSTER=青緑、NEUTRAL=青灰。 |
| 種別 | 右上バッジ。ATTACK=照準、SKILL=工具、POWER=稲妻、REACTION=稲光、CURSE=割れた印。 |
| コスト | 左上の大きな六角形チップ。使用不能時は彩度を落とし、ホバー時に不足値を表示する。 |
| レアリティ | 外周の細い縁と箔のような緩い光。BASIC は無彩色、COMMON は青、UNCOMMON は緑、RARE は紫、SR はピンク、SSR は水色、UR は金。常時点滅させない。 |

現行 `@deck-drive/card-definitions` の rarity 契約は `RARE` までである。Pack の SR / SSR / UR 保証を有効化する前に、card-definitions の versioned rarity contract と Pack の提供割合・保証 contract へ `SR` / `SSR` / `UR` を追加し、この表示トークンを対応付ける。`ViewerSafeCard.rarity` は同じ versioned `CardRarity` を使うため、wire decoder と visual replay decoder もその新しい契約を受け入れる版へ同時に更新する。構造的な `@deck-drive/game-engine` の `CardDefinition` contract は rarity を持たないため変更しない。それまでは SR / SSR / UR を含む Pack を公開しない。

### 状態別の振る舞い

| 状態 | 見た目 | 操作感 |
| --- | --- | --- |
| 通常 | 軽い影、微粒子なし | クリック可能 |
| キーボードフォーカス | 3 px の基調光アウトラインをカード外側に表示。ホバーの浮上・拡大とは独立し、コントラスト比 3:1 以上を保つ | Enter / Space で選択、Esc で選択解除 |
| ホバー / タップ選択 | 8 px 浮上、外周を 180 ms で発光、1.03 倍 | 効果の対象を淡く予告 |
| ドラッグ中 | 1.08 倍、回転を解除、プレイ領域へ薄い軌道 | 有効な対象のみ明るくする |
| 使用可能 | コストチップが基調光で呼吸（2.4 秒周期） | クリックまたはドラッグで使用 |
| 使用不可 | 彩度 35%、コストチップを暗くする | クリック時に短い拒否音と不足理由 |
| 解決中 | 効果色へ短く明度を変化させてから残光 | 入力を受け付けない |
| 墓地へ | 縮小しながら 8° 傾き、0.28 秒で吸い込まれる | 演出中でも次の状態はキューで保持 |

## 4. 対戦演出

すべての UI 演出は viewer projection の `viewSequence` 順に再生する。`GameEvent.sequence` は engine / rules replay の順序として保持し、UI 順序の待機には使わない。同一アクション内のイベントは 60〜120 ms の最小間隔で連結し、通信の到着順には依存しない。`DAMAGE_DEALT.amount` はブロック軽減前の攻撃量であり、実 HP ダメージを意味しない。

ドローを一つの演出に合成できるのは、同じ `playerId` の `CARD_DRAWN`、`CARDS_DRAWN`、または `sourceEventType` が `CARD_DRAWN` / `CARDS_DRAWN` である `REDACTED` draw marker が `viewSequence` 上で連続する区間だけとする。`EFFECT_STARTED`、ダメージ、状態変化、`CARD_DISCARDED`、または `sourceEventType` が `CARD_DISCARDED` である private discard marker が 1 件でも入った時点で区間を閉じ、前後のドローをまたいで合成しない。private discard marker はカードを表示せず墓地カウンタだけを 180 ms で更新する独立 entry とする。同じ source draw を individual event と batch event の両方で投影してはならず、server projection は batch の `CARDS_DRAWN` か構成する `CARD_DRAWN` 群のどちらか一方だけを出力する。

連続 draw 区間の描画は、`n≤5` なら各カードまたは非公開時のカード背面を 90 ms 間隔で順に表示する。`n>5` なら先頭 5 枚だけを同じ間隔で表示し、580 ms 時点で残り `n-5` 枚を一つの束と `+{n-5}` 表記に畳む。表示可能なカードは `presentationCardRef` のカタログから表面を描画し、private draw は常に背面だけを描画する。区間の完了時に live region へ一度だけ「{playerLabel} がカードを {n} 枚引きました」と通知し、private draw ではカード名を通知しない。圧縮された束にも「残り {n-5} 枚」の代替テキストを付ける。

| engine event | 視覚演出 | 音 | 標準時間 |
| --- | --- | --- | --- |
| `CARD_PLAYED` | 手札から中央プレイレーンへカードが弧を描いて飛ぶ（280 ms）。カード名の 0.5 秒表示は後続 event を止めない独立 overlay とする | 紙のスワイプ + 小さな決定音 | 280 ms |
| `EFFECT_STARTED` | server-provided `presentationEffectRef` に対応する metadata の effect type 色でカード枠を一度だけ発光。複数効果では effect ごとに一拍置く | 短いチャージ音 | 120 ms |
| `DAMAGE_DEALT` | `sourceId` から `targetId` へ中立色の軌跡を飛ばす「攻撃予告」。自己ダメージでは自分のパネル内へ短く収束させる。対象はまだ揺らさず、HP ダメージ色も使わない | 斬撃 / 打撃の導入音 | 180–260 ms |
| `BLOCK_REDUCED` | 盾の六角形が前面に出て、ひび割れて消える。実 HP の減少より先に再生 | 金属の軽い反響 | 180 ms |
| `ENTITY_DAMAGED` | HP バーが左から減り、`-N` が上へ跳ねる。対象は 6 px 横揺れ、赤橙の衝撃波 | 被弾音。amount が大きいほど低音を追加 | 240 ms |
| `BLOCK_GAINED` | 自分を囲む半透明の六角シールドが組み上がり、`+N BLOCK` | 上昇するガラス音 | 360 ms |
| `HEALED` | 黄緑の粒子が下から上へ流れ、HP バーを満たす | 柔らかな上昇音 | 360 ms |
| `CARDS_DRAWN` | 将来の batch event 用。viewer-safe な `presentationCardRefs` の枚数をカード束の移動と枚数表示でまとめて示す。現行 basic resolver は emit しないため、実装時にこの event の発火を前提にしない | 紙をめくる音を最大 3 レイヤー | `D(0)=0`、`D(n)=min(220 + 90 × (n - 1), 580)` ms |
| `CARD_DRAWN` | 現行 resolver のドローイベント。viewer 自身または公開ドローは viewer ごとの `presentationCardRef` を表示用に保持する。非公開の相手ドローは ID を含めない `REDACTED` marker と枚数だけの transition に変換する。連続区間の合成と `n≤5` / `n>5` の表示は上記規則に従う | 紙をめくる音 | `D(0)=0`、`D(n)=min(220 + 90 × (n - 1), 580)` ms |
| `CARD_DISCARDED` | 解決済みカードが縮み、墓地カウンタへ吸い込まれる | 小さな紙音 | 180 ms |
| `STATUS_APPLIED` | `status` のアイコンを対象のステータス列に 0.18 秒で追加し、輪郭を一度だけ発光 | 小さな付与音 | 180 ms |
| `STATUS_REMOVED` | `statusId` に対応するアイコンを対象のステータス列から淡く消す。不明な ID は表示を変えずログに記録 | 柔らかな解除音 | 150 ms |
| `MATCH_FINISHED` | 勝敗時は画面の彩度を少し落として勝者側から色を戻し、`VICTORY` / `DEFEAT` を表示。`result.status === 'DRAW'` は両者を中立の青灰にし、`DRAW` を表示 | 勝利=短い和音、敗北=低い終止音、引き分け=中立の終止音 | 1,200 ms |

### 攻撃・防御の細則

- ダメージの色は `ENTITY_DAMAGED` による HP 減少だけに使い、ブロックに吸収された分は青緑のシールド演出にする。`DAMAGE_DEALT` は中立色の攻撃予告に留める。`6 DAMAGE` のうち 5 ブロックなら、先に攻撃予告、次に `BLOCK -5`、続けて `HP -1` を表示する。完全にブロックされた場合も攻撃予告と `BLOCK_REDUCED` は表示するが、赤橙の衝撃波、HP 揺れ、HP 数値は出さない。
- 同じ対象への多段ダメージは、個別に揺らすのではなく 150 ms 内の入力を一つの衝撃群にまとめる。ただし数値は個別に残す。
- 回避不能の大ダメージ（将来の閾値: 最大 HP の 25% 以上）は、画面全体ではなく対象パネル周辺だけを 1 回強く光らせる。カメラ揺れは既定で無効にし、設定で有効化する。
- 防御獲得時のシールドは蓄積値を視覚化するが、重ねすぎない。2 枚目以降は同じシールドを明るくして数値だけ更新する。
- 致死ダメージでも event の順序を変えない。`ENTITY_DAMAGED`（240 ms）の後に `CARD_DISCARDED`（180 ms）を再生し、その直後に 400 ms の terminal barrier を置く。`MATCH_FINISHED` は barrier 完了後に再生するため、捨て札を飛ばす演出を消さず、結果画面の前に死亡状態を確実に読める。
- 通常設定でも、発光は対象カードまたは対象パネルの範囲に限定し、1 event につき 1 回・120 ms 以下、同じ要素では 1 秒に 3 回以下とする。全画面フラッシュ、色を交互に切り替える点滅、連続する白フラッシュは使わない。

## 5. ターン遷移

ターン終了から相手ターン開始までは、入力可能状態が曖昧にならない **1 枚ドロー時は合計 650 ms** の遷移にする。`turnDrawCount` は可変のため、2 枚以上では入力可能化をドロー演出完了後へ遅らせる。各処理は次の開始時刻で一部並行して動く。

1. 0 ms: `TURN_ENDED` — 現プレイヤーのプレイレーンを閉じ、手札を 8% 暗くする（160 ms）。
2. 100 ms: 画面中央に細いネオン線を横切らせ、`ENEMY TURN` または `YOUR TURN` を表示（240 ms）。自分の番は基調光、相手の番は青紫。
3. 290 ms: 同じ player の連続した draw 区間ごとに、viewer-safe な `CARD_DRAWN`、`CARDS_DRAWN`、`REDACTED` draw marker をまとめて再生する。`n` は要求枚数ではなく、その区間の表示可能な `CARD_DRAWN` の件数、`CARDS_DRAWN.presentationCardRefs.length`、redacted marker ごとの `after.handCountByPlayer - before.handCountByPlayer` の正の差分を合計した実ドロー数とする。ドロー以外の entry は区間を分断するため、`EFFECT_STARTED`、ダメージ、状態変化をまたいで合成・加算しない。ドロー演出時間は `D(0)=0`、`D(n)=min(220 + 90 × (n - 1), 580)` ms。`n>5` の圧縮表示は表の規則に従う。
4. `290 + D(n)` ms: sequence 上で後続の `TURN_STARTED` を再生し、エネルギーを 120 ms で満たす。同時に自分の番だけ手札を 6 px せり上げる（120 ms）。
5. `max(650, 410 + D(n))` ms: 主ボタンを有効化できる最短時刻とする。実際の有効化には下記の authoritative snapshot と連続 sequence の条件も必要である。したがって、入力可能化は常にドローと `TURN_STARTED` の表示完了後になり、1 枚ドローでは最短 650 ms、2 枚以上では枚数に応じて延長される。

通常の対戦画面には「演出を短縮」トグルを用意する。オンにすると、現在の演出と保留中の各 event を sequence 順に 100 ms の最終状態表示へ遷移し、効果音は再生しない。ゲーム状態・イベント・ドロー枚数は変えない。短縮しても主ボタンは通常時と同じ `max(650, 410 + D(n))` より前には有効化しない。入力を有効化できるのは、その時刻と短縮後のローカルキュー完了の両方を満たし、さらに最新の authoritative snapshot で `phase === 'PLAYER_TURN'` かつ `activePlayerId === viewerPlayerId` であり、snapshot の `lastViewSequence` までを連続して反映済みで `nextExpectedViewSequence === lastViewSequence + 1` の場合だけとする。未着 event や未取得の `TURN_STARTED` をキューの空きだけで補わない。

相手の行動中は操作領域を単に無効化するのではなく、相手のアバター周囲に「思考中」の弱いリングを表示する。通信待ちでは `同期中…` を表示し、ゲームのイベントが届くまで偽の結果を確定表示しない。

## 6. パック開封

パック開封は収集体験の見せ場だが、結果を隠して不安を煽る賭博的な表現は避ける。サーバーで確定した内容だけを受信し、演出はその結果を順に見せる。

以下の基本フローは **Normal Pack / Rare Pack の 1 パック（5 枚）** に適用する。Box は 10 パック・50 枚であり、各パックに基本フローを適用する。Box 開封では、パック 1/10 の進捗、各パックの保証、Box 全体の最低保証を表示し、`残りを短縮して開封` で未開封パックを順に確定表示へ畳める。キーボード操作も各パックごとに同じカード確認フローを繰り返し、最後のパック後に Box 全体の結果へフォーカスを移す。

### フロー

1. **選択** — パックを棚から選ぶ。ホバーで封の一部が光り、収録枚数と提供割合への導線を常時表示する。
2. **開封** — タップ / クリックで封を横に裂く。紙の裂け目と、パック周辺だけに収めた 0.35 秒の柔らかな光を出す。`演出を短縮` ボタンはこの時点から表示する。モーション削減時は光らせず、0.15 秒の不透明度フェードと静的な開封アイコンに置き換える。
3. **放出** — 5 枚を裏向きで扇状に置く。レアリティは裏面の発光量でほのかに予告するが、色だけでは区別しない。
4. **公開** — 左から順に選択して 3D 風の半回転（0.42 秒）。カード名、効果、所持済み枚数を読み上げ可能なテキストとして表示する。モーション削減時は回転を行わず、0.15 秒の非点滅フェード後に表面を静的に切り替える。
5. **ハイライト** — RARE は紫、SR はピンク、SSR は水色、UR は金のリングと紙吹雪を 0.8 秒。いずれもレア名バッジを併記し、自動連続点滅・全画面フラッシュは行わない。モーション削減時は粒子を出さず、静的な高コントラストのバッジと枠色だけで示す。
6. **確定** — `コレクションへ` と `もう一度開封` を表示。重複カードの変換量・保存先を明示する。

### パック開封のキーボード操作

- パック選択中は選択中パックを roving tab stop とし、矢印キーで移動、Enter / Space で開封する。開封開始後は `演出を短縮` ボタンへフォーカスを移す。
- カードが扇状に並んだら、先頭の未公開カードへフォーカスを移す。左右矢印で未公開・公開済みカードを移動し、Enter / Space でフォーカス中のカードを公開する。Tab はカード群を飛ばして `演出を短縮`、次に補助操作へ移動する。
- `演出を短縮` は Enter / Space で実行でき、フォーカスを失わない。短縮後も矢印キーと Enter / Space で各カードの名称、効果、所持枚数を確認できる。
- 全カード公開後は `コレクションへ` にフォーカスを移す。Tab で `もう一度開封` へ移動でき、Enter / Space で実行する。Esc は直前の安全な画面へ戻るが、確定済みのパック結果を破棄しない。

### パック用サウンド

| 場面 | 音の方向 |
| --- | --- |
| パック選択 | ビニールを軽く擦る音 + 高いクリック |
| 封を裂く | 紙 / 袋の裂ける音。過剰な爆発音は使わない |
| カード公開 | 裏返る紙音 + 短い上昇チャイム |
| RARE 公開 | 公開音に 2 音の和音と柔らかな余韻を追加 |
| 重複 | 落ち着いた変換音。残念さを強調しない |

## 7. サウンドシステム

- BGM、SE、UI 音、ボイス（将来）の個別音量を 0–100 で提供する。初期値は BGM 55、SE 70、UI 60。
- 同一 SE は 80 ms 以内に連続再生しない。連撃など必要な場合はピッチを ±4% だけ変え、最大 3 レイヤーまでにする。
- BGM は戦闘中の集中を邪魔しない 90–115 BPM、短いループのアンビエント・エレクトロ。自分のターンにはハイハットを一段足し、勝敗確定時に 300 ms でフェードする。
- ブラウザの自動再生制限に従い、最初のユーザー入力後に音声を初期化する。音が無効でもすべての情報は視覚とテキストで分かるようにする。
- `prefers-reduced-motion` またはゲーム内「演出を抑える」が有効なら、粒子・揺れ・拡大に加え、発光、白フラッシュ、点滅を停止する。0.15 秒の非点滅フェード、静的アイコン、数値表示に置き換える。音は独立して設定できる。

## 8. いらすとや素材の利用方針

いらすとやの画像は、公式への用途確認が完了するまで本番ビルドへ収録しない。確認前はプレースホルダーを使う。許可を得た場合も、画像単体がカード商品・収集対象の中心に見えないよう、カードのルール情報、独自フレーム、UI、ゲーム進行を主たる価値とし、画像は挿絵・装飾として扱う。カード背景、枠、UI アイコン、パックのロゴには使用しない。

### 素材選定・加工

- 公式サイトから取得したオリジナルを、カードごとに 1 点だけ登録する。検索結果や第三者サイトから取得しない。
- 背景を切り抜く、余白を調整する、枠の内側でトリミングする加工は可とする。イラスト本体の色調変更は行わず、クラスごとの色は独自フレームと背景で表現する。ただし作者・素材の印象を損なう攻撃的、差別的、性的、過激な文脈には使わない。
- カード名と絵の意味を揃える。例: `Strike` は剣・格闘の絵、`Guard` は盾・防具の絵、`Insight` はひらめき・読書の絵を候補にする。
- イラストの上に重要なルールテキストを重ねない。挿絵は中央に置き、顔や道具がコスト・カード名・効果文と重ならないトリミングを選ぶ。
- 同じ絵を複数カードに使う場合は、イラスト自体の色調を変えず、差分は独自フレームに限る。異なる表情・ポーズは別素材として数える。将来、権利者が許可したイラストの色替え版を使う場合は、派生版ごとに別アセット ID・別素材点数として台帳に登録し、用途確認を改めて取得する。

### ライセンス運用

- 本プロジェクトは、いらすとやの画像そのものを販売・再配布しない。また、現時点では広告掲載、ゲーム内課金、素材・カードを得るための課金を含む形で公開する予定はない。したがって本リリースの利用形態は非商用を前提とする。
- 現行の公式規約では、規約範囲内なら商用・非商用で利用できる一方、商用の一制作物で 21 点以上を使う場合は有償対応が必要。広告掲載・課金を含むゲームは商用として数える前提で管理する。規約は変更され得るため、リリースごとに公式規約を再確認する。
- 「ダウンロード」導線を UI に設けないことは、ブラウザ配信された画像をユーザーが取得できないことを保証するものではない。素材の再利用を技術的な制御で担保できるとは扱わず、公式規約、用途確認の回答、素材台帳に基づいて利用可否を判断する。許可がない限り、素材を中心に見せるカード、素材獲得を報酬にする仕組み、素材の再配布・販売は行わない。
- 将来、広告・課金を導入するなど商用形態へ変える場合も、公開前に用途確認を必ず取得する。商用の一制作物で素材が 21 点以上になる場合は、その確認とは別に必要な有償利用の条件を問い合わせて満たす。20 点以下であっても、用途確認を省略してよい根拠にはしない。Canva を利用する場合にも、完成物・利用経路がその条件に合うかを公式案内で確認する。
- クレジット表記の有無にかかわらず、社内素材台帳には出典 URL、取得日、利用カード、加工内容、商用点数を必ず記録する。

公開ゲート: 素材を初めて収録する前に、カードゲーム内の挿絵としての具体的な表示例、非商用であること、画像単体の販売・再配布をしないことをいらすとやへ提示し、用途確認の回答を台帳に記録する。回答が得られない、または許可されない場合は、いらすとや素材を使用しない。

公式参照: [いらすとや「ご利用について」](https://www.irasutoya.com/p/terms.html)、[いらすとや「よくあるご質問」](https://www.irasutoya.com/p/faq.html)。これは実装・運用上のチェック項目であり、個別の利用可否は公開時点の公式規約と権利者の用途確認を優先する。

### 素材台帳（必須）

CSV のヘッダーを唯一のスキーマとする。以下は各列の説明であり、台帳行の別表現ではない。

| CSV field | 内容 |
| --- | --- |
| `asset_id` | 一意の素材 ID |
| `local_asset_path` | 実際に配布する repository-relative path |
| `source_url` / `acquired_on` | 公式取得元と取得日 |
| `card_ids` | 再利用を含むカード ID のセミコロン区切り一覧 |
| `derivative_variant_id` / `modifications` | 派生素材 ID と加工内容 |
| `material_count` | この行が表す素材点数（派生色は別行） |
| `official_use_confirmation_reference` / `confirmation_received_on` | 用途確認の証跡と受領日 |
| `terms_url` / `terms_checked_on` / `terms_revision_reference` | 規約 URL、確認日、確認した版または保存先 |
| `reviewer` / `status` | 責任者と `PENDING` / `APPROVED` / `REJECTED` の公開可否 |

台帳は [irasutoya-register.csv](assets/irasutoya-register.csv) として管理し、素材を追加・交換したプルリクエストでは必ず更新する。1 行は 1 素材（または色替えなどの 1 派生素材）であり、複数カードで再利用する場合は `card_ids` に列挙する。`local_asset_path` は実際に配布するファイルの repository-relative path とし、`@deck-drive/card-definitions` の versioned `CardDefinition.artwork` はこの値と完全一致させる。構造的な `@deck-drive/game-engine` の `CardDefinition` を変更するものではない。用途確認の回答と規約確認の証跡を同じ行へ記録するため、素材点数を重複行で水増し・過少計上しない。

## 9. 実装インターフェース

UI は server-projected event を受け取る `BattleAnimationQueue` を持つ。完全な engine `BattleState`（全手札・山札・墓地・seed を含む）はサーバーだけに保持し、ブラウザには `ViewerPresentationEnvelope` の viewer-safe な snapshot と event だけを送る。クライアントは snapshot を直ちに authoritative state として更新し、ゲームロジックはアニメーション終了を待たない。一方、画面に表示する HP、ブロック、手札、山札、墓地、エネルギー、ステータスは `presentationState` に保持する。`turn`、`activePlayerId`、`phase`、`lastViewSequence` は snapshot の必須値とし、再接続直後に `YOUR TURN` / `ENEMY TURN`、主ボタンの有効可否、終局画面、次に待つ sequence を推測なしで復元する。サーバーは viewer ごとに、各表示 event の `PresentationTransition`（before / after）を同梱する。クライアントはコスト、最大エネルギー、墓地枚数を推測・最終状態との差分計算で導かず、この transition だけで演出する。演出完了時だけ `presentationState` を transition の終了値へ進めるため、確定状態が先に届いても値が最終値へ瞬間移動しない。action 応答では action 前の `presentationBaselineViewSequence` から entries を再生した後に authoritative snapshot と照合し、再接続用 snapshot では直ちに `presentationState` を 150 ms フェードで同期する。

キューはグローバルな `GameEvent.sequence` ではなく、viewer ごとに連続する `viewSequence` をキーにした保留バッファを持つ。プライベート情報を隠す global event は viewer projection で ID やカード定義を含まない `REDACTED` marker となる。marker は非機密な `sourceSequence`、`sourceEventType`、`playerId` を保持するため、visual replay verifier は対応する engine event が欠落・重複していないことを確認できる。`CARDS_DRAWN` だけは、1 件の batch entry、同じ `sourceSequence` / `playerId` を持つ連続した `CARD_DRAWN` group、または 1 件の redacted marker のいずれかへ投影する。individual group は `viewSequence` 順・重複しない `presentationCardRef`・source の枚数を保ち、batch と混在してはならない。他の source event は viewer-safe event または matching redacted marker の 1 件だけへ投影する。marker も viewer に観測可能な集計値（例: `handCountByPlayer`、`drawPileCountByPlayer`、`discardCountByPlayer`）の before / after transition を持ち、非公開のカード内容を出さずにカウンタを正しく進める。action 応答のキューは `presentationBaselineViewSequence + 1` から開始し、entries が authoritative snapshot の `lastViewSequence` まで連続することを検証する。再接続用 snapshot は entries を含まず、`lastViewSequence + 1` で `nextExpectedViewSequence` を初期化する。これにより action 演出を final snapshot によって飛ばさず、再接続後に既反映 entries を二重再生しない。`nextExpectedViewSequence` 未満は重複として破棄し、欠番が 1.5 秒を超えて続く、または再接続した場合は、演出を推測・スキップせず viewer-scoped event 履歴または最新 `ViewerPresentationEnvelope` を再取得する。最新 snapshot へ復帰する場合は、未再生の演出を安全な 150 ms フェードに畳み、snapshot の `lastViewSequence + 1` から再開する。

受信時は wire payload を decoder で検証してからキューへ入れる。未知 payload は `viewSequence` の有無にかかわらずキューへ進めない。現在の演出を 150 ms で安全にフェードして、イベント履歴と最新スナップショットを再取得する resync barrier とする。診断ログには schema error、`viewSequence`、イベント種別、不可逆ハッシュだけを記録し、raw payload、カード ID、手札、ユーザー識別子は記録しない。スナップショットを受け取るまで `presentationState` を進めず、後続 event も再生しないため、不明な状態変化をまたいで古い表示値から演出することはない。各キュー項目は元の `GameEvent` ではなく、server whitelist を通過した `ViewerSafeEvent` または `RedactedMarker` だけを保持する。演出種別は UI 用の派生情報であり、viewer projection を置き換えない。

engine の `EFFECT_STARTED.effectId` はサーバー内でだけ扱う opaque 値であり、ブラウザは受け取らず解析もしない。サーバーは action result、viewer-scoped event 履歴、リプレイに、対象 event の `viewSequence` と viewer ごとの `presentationEffectRef` をキーとした `EffectPresentationMetadata` を必ず同梱する。decoder は event と metadata の `viewSequence` および `presentationEffectRef` が一致しなければ resync barrier を起動する。metadata 内のカード参照も engine の `cardInstanceId` ではなく viewer ごとの不透明な `presentationCardRef` とし、非公開カードの ID を投影しない。`ViewerPresentationEnvelope.cardCatalogByPresentationRef` は、snapshot や event が参照するカードの表示名、コスト、効果文、アートワークを同じ opaque ref で解決する。ただし viewer 自身の手札とルール上公開されたカードだけを収録し、相手の非公開カードや `REDACTED` marker の参照は追加しない。decoder は `ownHandCardRefs`、公開捨て札 refs、`CARD_PLAYED` / `CARD_DRAWN` / `CARD_DISCARDED` の `presentationCardRef`、`CARDS_DRAWN.presentationCardRefs`、および effect metadata の `presentationCardRef` がすべて catalog にあることをキュー投入前に検証する。欠落する ref を持つ event / metadata は種類を問わず resync barrier とし、`REDACTED` marker は card ref も catalog entry も持たない。`effectIndex` はカード定義の `effects` 配列と同じ **0 始まり**、`effectType` はその要素の type とする。`CUSTOM` を含む全 type は server-provided `presentationTone` を使い、`CUSTOM` の既定値は中立 tone とする。再接続時も、未再生の `EFFECT_STARTED` に対応する metadata と必要な card catalog entry を同じレスポンスに含める。metadata または必要な catalog entry がない `EFFECT_STARTED` は中立フラッシュを推測表示せず、resync barrier として扱う。

```ts
import type { CardRarity } from '@deck-drive/card-definitions';
import type { GameEvent, Status, TerminalBattleResult } from '@deck-drive/game-engine';

type AnimationKind =
  | 'card-play'
  | 'effect-start'
  | 'attack-intent'
  | 'damage'
  | 'block-break'
  | 'block-gain'
  | 'heal'
  | 'draw'
  | 'discard'
  | 'status-apply'
  | 'status-remove'
  | 'turn-change'
  | 'match-result'
  | 'redacted';

interface EffectPresentationMetadata {
  readonly viewSequence: number;
  readonly presentationEffectRef: string;
  readonly presentationCardRef: string;
  /** Zero-based index in CardDefinition.effects. */
  readonly effectIndex: number;
  readonly effectType: 'DAMAGE' | 'HEAL' | 'GAIN_BLOCK' | 'DRAW' | 'CUSTOM';
  readonly presentationTone: 'attack' | 'defense' | 'recovery' | 'draw' | 'neutral';
}

/** Display fields only; never expose a raw CardInstance or engine definition ID. */
interface ViewerSafeCard {
  readonly presentationCardRef: string;
  /** Version of the @deck-drive/card-definitions contract used for these display fields. */
  readonly definitionVersion: string;
  readonly name: string;
  readonly class: 'SWORD' | 'GUARDIAN' | 'MAGE' | 'ALCHEMIST' | 'HUNTER' | 'TRICKSTER' | 'NEUTRAL';
  readonly type: 'ATTACK' | 'SKILL' | 'POWER' | 'REACTION' | 'CURSE';
  /** Keep this imported versioned contract in sync before enabling new rarities in Pack. */
  readonly rarity: CardRarity;
  readonly cost: number;
  readonly rulesText: string;
  /** Null means the client must render its built-in card-art placeholder. */
  readonly artwork: string | null;
}

interface BattlePresentationState {
  readonly viewerPlayerId: string;
  /** Public current-turn state used to restore input availability after reconnecting. */
  readonly turn: number;
  readonly activePlayerId: string;
  readonly phase: 'PLAYER_TURN' | 'MATCH_END';
  readonly hpByEntity: Readonly<Record<string, number>>;
  readonly maxHpByEntity: Readonly<Record<string, number>>;
  readonly blockByEntity: Readonly<Record<string, number>>;
  readonly energyByPlayer: Readonly<Record<string, number>>;
  readonly maxEnergyByPlayer: Readonly<Record<string, number>>;
  /** Viewer-scoped opaque refs for the viewer's own hand; opponent identities are never projected. */
  readonly ownHandCardRefs: readonly string[];
  /** Public hand sizes for all players, including the viewer. */
  readonly handCountByPlayer: Readonly<Record<string, number>>;
  readonly drawPileCountByPlayer: Readonly<Record<string, number>>;
  readonly discardCountByPlayer: Readonly<Record<string, number>>;
  /** Viewer-safe refs only when the game rules make that discard public; otherwise an empty array. */
  readonly publicDiscardCardRefsByPlayer: Readonly<Record<string, readonly string[]>>;
  readonly statusesByEntity: Readonly<Record<string, readonly Status[]>>;
  /** Null until MATCH_END; required to restore VICTORY, DEFEAT, or DRAW after reconnect. */
  readonly terminalResult: TerminalBattleResult | null;
}

interface PresentationTransition {
  readonly before: BattlePresentationState;
  readonly after: BattlePresentationState;
}

interface BattlePresentationSnapshot {
  readonly state: BattlePresentationState;
  /** Highest viewer-scoped entry already represented by this authoritative state. */
  readonly lastViewSequence: number;
}

/** A browser-only DTO. Never send a raw GameEvent or engine card instance ID to the viewer. */
type ViewerSafeEvent =
  | { readonly sourceSequence: number; readonly type: 'CARD_PLAYED'; readonly playerId: string; readonly presentationCardRef: string }
  | { readonly sourceSequence: number; readonly type: 'EFFECT_STARTED'; readonly presentationEffectRef: string }
  | { readonly sourceSequence: number; readonly type: 'DAMAGE_DEALT'; readonly sourceId: string; readonly targetId: string; readonly amount: number }
  | { readonly sourceSequence: number; readonly type: 'BLOCK_REDUCED'; readonly targetId: string; readonly amount: number }
  | { readonly sourceSequence: number; readonly type: 'ENTITY_DAMAGED'; readonly targetId: string; readonly amount: number }
  | { readonly sourceSequence: number; readonly type: 'HEALED'; readonly targetId: string; readonly amount: number }
  | { readonly sourceSequence: number; readonly type: 'BLOCK_GAINED'; readonly targetId: string; readonly amount: number }
  | { readonly sourceSequence: number; readonly type: 'CARDS_DRAWN'; readonly playerId: string; readonly presentationCardRefs: readonly string[] }
  | { readonly sourceSequence: number; readonly type: 'CARD_DRAWN'; readonly playerId: string; readonly presentationCardRef: string }
  | { readonly sourceSequence: number; readonly type: 'CARD_DISCARDED'; readonly playerId: string; readonly presentationCardRef: string }
  | { readonly sourceSequence: number; readonly type: 'STATUS_APPLIED'; readonly targetId: string; readonly status: Status }
  | { readonly sourceSequence: number; readonly type: 'STATUS_REMOVED'; readonly targetId: string; readonly statusId: string }
  | { readonly sourceSequence: number; readonly type: 'TURN_STARTED'; readonly playerId: string }
  | { readonly sourceSequence: number; readonly type: 'TURN_ENDED'; readonly playerId: string }
  | { readonly sourceSequence: number; readonly type: 'MATCH_FINISHED'; readonly result: TerminalBattleResult };

interface RedactedMarker {
  readonly sourceSequence: number;
  readonly playerId: string;
  readonly sourceEventType: 'CARD_DRAWN' | 'CARDS_DRAWN' | 'CARD_DISCARDED';
  readonly reason: 'PRIVATE_CARD';
}

type ProjectedBattleEntry =
  | {
      readonly viewSequence: number;
      readonly event: Extract<ViewerSafeEvent, { readonly type: 'EFFECT_STARTED' }>;
      readonly transition: PresentationTransition;
      readonly effectMetadata: EffectPresentationMetadata;
    }
  | {
      readonly viewSequence: number;
      readonly event: Exclude<ViewerSafeEvent, { readonly type: 'EFFECT_STARTED' }>;
      readonly transition: PresentationTransition;
      readonly effectMetadata?: never;
    }
  | {
      readonly viewSequence: number;
      readonly marker: RedactedMarker;
      readonly transition: PresentationTransition;
    };

interface ViewerPresentationEnvelopeBase {
  /** Only refs visible to this viewer, including every ref carried by an entry. */
  readonly cardCatalogByPresentationRef: Readonly<Record<string, ViewerSafeCard>>;
}

/** An action response replays from the previously acknowledged presentation boundary. */
interface ActionPresentationEnvelope extends ViewerPresentationEnvelopeBase {
  readonly kind: 'ACTION';
  readonly presentationBaselineViewSequence: number;
  readonly authoritativeSnapshot: BattlePresentationSnapshot;
  readonly entries: readonly ProjectedBattleEntry[];
}

/** Initial load and reconnect state never replay entries already represented by the snapshot. */
interface ResyncPresentationEnvelope extends ViewerPresentationEnvelopeBase {
  readonly kind: 'RESYNC';
  readonly snapshot: BattlePresentationSnapshot;
  readonly entries: readonly [];
}

type ViewerPresentationEnvelope = ActionPresentationEnvelope | ResyncPresentationEnvelope;

/** Persisted projection intentionally excludes live RESYNC envelopes. */
interface PersistedVisualReplayProjection {
  readonly initialSnapshot: BattlePresentationSnapshot;
  readonly initialCardCatalogByPresentationRef: Readonly<Record<string, ViewerSafeCard>>;
  readonly actions: readonly ActionPresentationEnvelope[];
}

/** Persisted alongside an engine replay; live action/resync responses use ViewerPresentationEnvelope. */
interface VisualReplayEnvelope {
  readonly visualReplayFormatVersion: number;
  readonly sourceEngineReplayChecksum: string;
  /** FNV-1a over canonical JSON of this envelope with envelopeChecksum omitted. */
  readonly envelopeChecksum: string;
  readonly projection: PersistedVisualReplayProjection;
}

type VisualReplayEnvelopeChecksumInput = Omit<VisualReplayEnvelope, 'envelopeChecksum'>;

type AnimationKindForEvent<Event extends ViewerSafeEvent> =
  Event extends { readonly type: 'CARD_PLAYED' } ? 'card-play'
  : Event extends { readonly type: 'EFFECT_STARTED' } ? 'effect-start'
  : Event extends { readonly type: 'DAMAGE_DEALT' } ? 'attack-intent'
  : Event extends { readonly type: 'BLOCK_REDUCED' } ? 'block-break'
  : Event extends { readonly type: 'ENTITY_DAMAGED' } ? 'damage'
  : Event extends { readonly type: 'HEALED' } ? 'heal'
  : Event extends { readonly type: 'BLOCK_GAINED' } ? 'block-gain'
  : Event extends { readonly type: 'CARDS_DRAWN' | 'CARD_DRAWN' } ? 'draw'
  : Event extends { readonly type: 'CARD_DISCARDED' } ? 'discard'
  : Event extends { readonly type: 'STATUS_APPLIED' } ? 'status-apply'
  : Event extends { readonly type: 'STATUS_REMOVED' } ? 'status-remove'
  : Event extends { readonly type: 'TURN_STARTED' | 'TURN_ENDED' } ? 'turn-change'
  : Event extends { readonly type: 'MATCH_FINISHED' } ? 'match-result'
  : never;

type AssertNever<Value extends never> = Value;
type UnmappedViewerSafeEventType = {
  [Type in ViewerSafeEvent['type']]: AnimationKindForEvent<Extract<ViewerSafeEvent, { readonly type: Type }>> extends never
    ? Type
    : never;
}[ViewerSafeEvent['type']];
type _ViewerSafeEventMappingIsExhaustive = AssertNever<UnmappedViewerSafeEventType>;
type UnprojectedGameEventType = Exclude<GameEvent['type'], ViewerSafeEvent['type'] | RedactedMarker['sourceEventType']>;
type _GameEventProjectionIsExhaustive = AssertNever<UnprojectedGameEventType>;

interface BaseBattleAnimation<Event extends ViewerSafeEvent> {
  readonly viewSequence: number;
  readonly event: Event;
  readonly transition: PresentationTransition;
  readonly startedAt: number;
  readonly reducedMotion: boolean;
}

type EffectStartAnimation =
  BaseBattleAnimation<Extract<ViewerSafeEvent, { readonly type: 'EFFECT_STARTED' }>> & {
      readonly kind: 'effect-start';
      readonly effectMetadata: EffectPresentationMetadata;
    };

type NonEffectAnimation<Event extends Exclude<ViewerSafeEvent, { readonly type: 'EFFECT_STARTED' }>> =
  Event extends ViewerSafeEvent
    ? BaseBattleAnimation<Event> & {
        readonly kind: AnimationKindForEvent<Event>;
      readonly effectMetadata?: never;
      }
    : never;

type RedactedAnimation = {
  readonly viewSequence: number;
  readonly kind: 'redacted';
  readonly marker: RedactedMarker;
  readonly transition: PresentationTransition;
  readonly startedAt: number;
  readonly reducedMotion: boolean;
};

type BattleAnimation =
  | EffectStartAnimation
  | NonEffectAnimation<Exclude<ViewerSafeEvent, { readonly type: 'EFFECT_STARTED' }>>
  | RedactedAnimation;
```

現行 engine の `GameEvent` 全 variant と、viewer projection の `ViewerSafeEvent` 全 variant を網羅してテストする。対象は `CARD_PLAYED`、`EFFECT_STARTED`、`DAMAGE_DEALT`、`BLOCK_REDUCED`、`ENTITY_DAMAGED`、`BLOCK_GAINED`、`HEALED`、`CARDS_DRAWN`、`CARD_DRAWN`、`CARD_DISCARDED`、`STATUS_APPLIED`、`STATUS_REMOVED`、`TURN_ENDED`、`TURN_STARTED`、`MATCH_FINISHED`。型テストで `GameEvent['type']` の全種が viewer-safe event または redacted marker に投影可能であり、各 viewer-safe event が animation kind を持つことを検証する。`CARDS_DRAWN` は engine contract に存在するが、現行 basic resolver が emit しないため、projection の fixture で batch 表示・`D(n)`・catalog 解決を検証する。`n≤5` の全件表示、`n>5` の先頭 5 枚・残り束・live region・private draw の背面のみ表示も検証する。テストでは、順不同・重複・欠番・再接続時に、連続した `viewSequence` 以外を先行再生しないこと、`REDACTED` marker が非公開 global event を待たせず、`playerId` ごとの private discard marker が draw 区間を分断して墓地カウンタだけを進めること、手札・山札・墓地の公開カウンタだけを transition どおり進め、カード ID を含まないこと、server-provided transition、metadata、versioned class / type / rarity を含む card catalog が保持されること、`artwork: null` ではプレースホルダーを表示すること、完全ブロックでは HP ダメージ演出を生成しないことも確認する。action envelope は baseline の次から snapshot の `lastViewSequence` までを再生し、resync envelope は entries を再生せず `lastViewSequence + 1` を次の期待値にすること、入力が authoritative `phase` / `activePlayerId` と連続反映済みの sequence を満たすまで有効化されないことも確認する。`EFFECT_STARTED` の metadata または必要な catalog entry の欠落、および将来追加される未知イベントは、秘密情報を含まない診断情報だけを記録して resync barrier を起動し、snapshot 受領後に再開することを確認する。リプレイは engine checksum と visual envelope checksum、event / metadata の key 関係を検証し、非batch source event は viewer-safe event または source sequence / type 付き redacted marker の 1 件に、`CARDS_DRAWN` は batch event、matching redacted marker、または同じ source sequence / player の連続した `CARD_DRAWN` group のいずれか一つに対応することを検証する。

さらに、decoder が手札・公開捨て札・全カード参照 event・effect metadata の catalog coverage を検証してからキューに入れ、欠落時は resync barrier になることを確認する。`maxHpByEntity` に基づく HP バー、`terminalResult` による再接続後の勝利・敗北・引き分け画面、モーション削減時の非回転パック公開、短縮時にも維持される入力有効化の最短時刻を検証する。永続 visual replay は live `RESYNC` envelope を受理せず、initial snapshot と順序付き action projection のみを保存すること、`envelopeChecksum` を除いた canonical JSON から checksum を計算すること、改ざん時に検証失敗することも確認する。

## 10. 完成判定

- カードを選択・使用・解決・墓地送りまで、効果の種類が音なしでも識別できる。
- ダメージのブロック吸収と HP ダメージが別々に理解できる。
- 自分 / 相手のターン、通信待ち、入力不能の理由が常に分かる。
- パック開封で全カードをキーボードとタッチ操作で確認でき、演出短縮ができる。
- モーション削減、色覚多様性、音量設定を有効にしても対戦情報が失われない。
- すべてのいらすとや素材が台帳にあり、公開形態に対する素材数・規約確認が完了している。
