# カードプール追加案

カードプールを広げ、同じクラスでも違う勝ち筋を選べるようにするための企画案。剣士・守護者・魔法使い・錬金術師・狩人の方向性を出発点に、相互作用とデッキ構築上の選択肢を増やした。以下は実装仕様ではなく、数値や効果はプレイテストで調整する前提の案。

## 表記と前提

- `N / R / SR / UR` はレアリティ、`コスト` はプレイ時に支払うエネルギー。`maxEnergy` は3で、ターン開始時の補充値を表す。エネルギー獲得効果は獲得量をそのまま加算し、`maxEnergy` を超えてよい。battle state/replayのエネルギー不変条件は `energy >= 0` とし、上限を設けない。実装時にBattlePlayerStateとsnapshot/replay validatorから `energy <= maxEnergy` の検証を除き、旧versionのreplayには従来の上限制約を適用する。各自のターン開始時は現在値を `maxEnergy`（3）に設定し、前ターンの余剰エネルギーは持ち越さない。カードコストは3以下にする。
- カード定義は既存契約の `class`（`SWORD` / `GUARDIAN` / `MAGE` / `ALCHEMIST` / `HUNTER` / `TRICKSTER` / `NEUTRAL`）、`type`（`ATTACK` / `SKILL` / `POWER` / `REACTION` / `CURSE`）、`keywords[]`、`version` を使う。表のクラスを `class` に設定し、以下の機械可読キーワードを `keywords[]` に付ける。`sword` は「抜き打ち」「返しの刃」「踏み込み」「二段斬り」「剣気」「受け流し」「連刃の型」「斬り上げ」「無明の太刀」「剣聖の教え」「一閃」に付け、「呼吸を整える」には付けない。魔法使い表の全カードには `magic`、名称が「魔導書」で始まるカードには追加で `grimoire` を付ける。錬金術師表の「素材」カードには `material`、狩人表の「矢」カードには `arrow` を付ける。赤・青・白の試薬には `reagent` とそれぞれ `reagent:red`・`reagent:blue`・`reagent:white`、通常素材の触媒（`alchemist_003`）にだけ `catalyst`、万能溶媒には `solvent` も付ける。`賢者の触媒`（`alchemist_010`）は `material` と `catalyst` を持たない。効果条件は表示名ではなくこれらのキーワードで判定する。
- まだリリース前のカード案なので、全カードの表示 `version` は `1.0.0` とし、リリース前の案の修正ではこのversionを上げない。リリース後に公開済みカードの効果や定義を変更するときは同じIDのversionを上げ、IDを再利用しない。定義レジストリは通常 `(definitionId, definitionVersion)` の組で解決し、同一IDの複数versionを並存させる。各versionの定義は不変とし、Replay検証は記録された組に完全一致する定義だけを使う。リリース前にreplayを保存する場合は、replay全体に不変な `draftDefinitionRevision`（card registryのcanonical digest）を必須で記録する。ドラフト定義を変更・追加するたびにこのrevisionを更新し、保存済みreplayは `(definitionId, definitionVersion, draftDefinitionRevision)` に一致する定義snapshotで検証する。該当する公開versionまたはドラフトsnapshotが未登録なら現在定義へフォールバックせず、検証不能として拒否する。`ID` は初出時に採番したクラス接頭辞と固定連番で構成し、表の行番号・表示順・後からの挿入に依存しない。既存IDは表を並べ替えても変更せず、新規カードにはそのクラスで未使用の連番を採番する。`type` は効果の性質で割り当てる。相手のカード使用・攻撃・ダメージに応答する効果があれば `REACTION`、戦闘状態に保存し自分の後続行動やターンで使う効果があれば `POWER`、それ以外で敵にダメージを与えるもの（詠唱完了時のダメージを含む）は `ATTACK`、残りは `SKILL` とする（上から優先）。詠唱の残り値が自分のターン経過で進むこと自体は `REACTION` にせず、詠唱完了時に敵へダメージを与える「雷鳴」「星辰落とし」は `ATTACK`、後続の自分のカード使用や合成に備える「剣気」「魔力充填」「賢者の触媒」は `POWER` とする。
- versioned registryの導入時は `validateCardDefinitions` の重複判定を `definitionId` 単独から `(definitionId, definitionVersion)` の組へ変更する。catalogの索引・永続化形式・lookup API・全呼び出し側も同じ組を必須入力として移行し、IDだけを受け取る旧APIは新protocolでは廃止する。validatorは同じ組の重複だけを `DUPLICATE_ID` として拒否し、同一IDの異なるversionを正当に並存させる。registryとcatalogのmigrationはversion付きの明示的変換で実施し、旧catalogを現在の定義で暗黙補完しない。
- 半分や割合で数値を求める場合は端数を切り捨てる。割合修正は同じ基礎値に対して加算・減算し、合算後に `floor(基礎値 × (1 + バフ率 - デバフ率))` を一度だけ適用する。各ダメージ・ブロック解決ごとに計算し、結果が負なら0にする。攻撃1回に複数のダメージヒットがある場合、各ヒットについて固定値の補正（次の攻撃への状態異常を含む）を加減してから割合修正を適用し、ブロックを処理する。各ヒットのブロック処理とHP更新の直後に終端結果を判定し、HPによる終端が成立した場合はその時点で残りのヒットと同一効果内の未解決手順を実行せず、成立した終端結果だけを記録する。終端が成立しない場合だけ次のヒットへ進む。次の攻撃への状態異常は次に解決する攻撃カード全体を対象とし、その最初のヒットだけに適用して消費する。割合を含む条件も同じく切り捨てて比較する。たとえばブロック5の半分は2、最大HP101の半分以下はHP50以下となる。
- 「この戦闘中」は戦闘終了まで続く効果。「次の自分のターン」は次のターン開始時に解決する。
- 「敵」「相手」は2人対戦の対戦相手1人を指す。
- この案はカードデータの追加だけでなく、battle state・engine・replay契約を変更する。実装時に `engineVersion` と `rulesVersion` を更新し、replayの永続フィールドまたは解釈が変わる場合は `replayFormatVersion` も更新する。replay検証は `formatVersion` からversion別の検証器・再生器へdispatchする。既存formatの検証器はそのschema・不変条件・対応するengine/rulesで固定して維持し、新formatは新しい検証器で検証する。未対応versionは明示的に拒否し、現行validatorで旧formatを解釈したり暗黙に移行したりしない。移行を行う場合は別途version付きの決定的変換として定義する。カード定義のversionは既定どおり全て `1.0.0` とし、これらのengine/replay versionとは独立して管理する。
- `BattlePhase` と `GameAction` はクライアント・snapshot・replayに公開するbattle protocol契約である。`PENDING_CARD_CHOICE` と `SUBMIT_CARD_CHOICE` / `CARD_CHOICE_TIMEOUT` は、新しい `battleProtocolVersion` でのみ有効にする。match作成時にサーバーと両クライアントの対応versionを照合してこのversionを固定し、battle state・全snapshot・Replayに記録する。旧protocolは `PLAYER_TURN` / `MATCH_END` の二値phaseと既存actionだけを使い、新phase・新actionを受信しない。新protocolのvalidatorとreplay再生器は新formatだけに対応し、旧protocolのclient、snapshot、replayを現行規則へ暗黙移行しない。対応versionを持たないclientは新protocolのmatchへ参加できない。
- `PENDING_CARD_CHOICE` を含む新formatの権威 `Replay` には、`actions: BattleInputRecord<GameAction>[]` と必須の `serverCommands: BattleInputRecord<ServerCommand>[]` を持たせる。`BattleInputRecord<T>` は `{ inputSequence: number, payload: T }` とし、各配列のpayloadには生のactionまたはcommandを保存する。`BattleInput` のkindは格納先配列から復元する。checksum・再生・永続化の対象はsequence付きrecord全体であり、payloadだけではない。各actionとcommandは共通の単調増加 `inputSequence` を持ち、replay再生器は両配列を `inputSequence` 順に結合して入力列を復元する。同一sequence、欠番、またはcommandだけを独立に再生することは拒否する。`CARD_CHOICE_TIMEOUT` は `serverCommands` にだけ保存し、`timeoutAuthorization`・request・所有者・deadlineAt・発行sequenceを含める。権威Replayのcanonical checksumは `actions` と `serverCommands` の両方を含む完全payloadから計算し、validatorは署名・順序・snapshot・eventとの連鎖を検証する。旧formatのReplayには `serverCommands` を追加せず、旧validatorで従来どおり検証する。プレイヤー向けReplay投影にはserver commandの認可情報を含めない。
- 新protocolでは、クライアントが送る `GameAction` payloadとbattle serviceが発行する `ServerCommand` payloadを、サーバーが採番する `BattleInput { inputSequence, kind: CLIENT_ACTION | SERVER_COMMAND, payload }` でエンベロープ化してからengineへ渡す。クライアントは `inputSequence` を送信・指定できず、認証・合法性検証後にbattle serviceが一意な値を割り当てる。Replayの `actions` と `serverCommands` の各recordはこのエンベロープの `inputSequence` を必須に持ち、`SUBMIT_CARD_CHOICE` を含む全GameAction variantはpayloadとしてはsequenceを持たない。validatorはエンベロープの連番だけを順序・重複・欠番の検証対象にする。
- 新protocolの `PlayCardAction` は `PLAY_CARD { type, playerId, cardInstanceId, targetId?, choices? }` とし、`choices` は `CARD_INSTANCES { kind, cardInstanceIds }`、`RECIPE { kind, recipeId }`、`CHANT_ENTRY { kind, chantEntryId }` の判別可能な `PlayCardChoice` 配列とする。同じ `kind` は1actionに1件だけ許可し、不要なkind、重複ID、カードごとの必要数と合わない配列を拒否する。validatorは対象の所有者・領域・タグ・枚数、recipe候補、詠唱キュー項目の所有者と存在を検証し、選択を暗黙補完しない。Replay schemaはこの型の完全な `PLAY_CARD` payloadを保存し、プレイヤー向け投影では各choiceを再帰的に可視性処理する。旧protocolの `PlayCardAction` には `choices` を追加せず、version別validatorで扱う。
- 新formatの `ReplaySnapshot` は `actionIndex` ではなく直前に解決した `inputSequence` を必須の境界キーとして持ち、永続化の一意キーを `(replayId, inputSequence)` に変更する。実入力の `inputSequence` は1から開始し、入力を一つも解決していない初期snapshotだけは予約値 `inputSequence: 0` を使う。validatorはsequence 0のaction / commandを拒否し、最初の実入力より前に初期snapshotがちょうど1件あることを要求する。以後のsnapshotは各 `BattleInput` 後に保存でき、同じ元 `PLAY_CARD` に属する保留境界と提出・timeout後の境界を別々に記録できる。永続テーブル・索引・read/write API・validatorをこのキーへ移行し、checksumにもこの境界値を含める。旧formatのsnapshotは既存の `actionIndex` を維持し、version別のread/write/validatorで扱い、暗黙移行しない。
- `choiceRequestId` はクライアントやカード効果に生成させず、battle serviceがmatchごとに永続化する `nextChoiceRequestSequence` から `choice:<sequence>` 形式で割り当てる。sequenceは1から開始し、新しい `PENDING_CARD_CHOICE` を作る権威トランザクション内で現在値を消費してcounterを1増やし、request ID・更新後counter・pending state・snapshot・deadline command・入力ジャーナル・outboxを原子的に保存する。rollback時はcounterも進めず、再起動時は永続stateのcounterを読み直すため採番済みIDを再利用しない。`(matchId, choiceRequestId)` はmatch内で一意とし、クライアントが指定した未発行ID、過去に解決済みのID、別matchのIDを受け付けない。Replay validatorは初期counter、各 `CARD_CHOICE_REQUESTED` の連続するrequest sequence、pending state・deadline/timeout署名・提出action・eventに記録された同一ID、および最終counterを検証し、重複・欠番・再利用・不一致を拒否する。旧protocolのstateにはこのcounterを追加しない。
- `PENDING_CARD_CHOICE` を作る入力の処理では、battle serviceがdeadline commandを生成・署名・採番し、pending state・対応snapshot・入力ジャーナル・`serverCommands`・deadline outboxを同一の権威ストレージトランザクションで保存する。失敗時は全てrollbackし、commit前にはrequestをクライアントへ公開しない。outboxは `(matchId, choiceRequestId)` を一意キーとし、保存済みcommandのsequenceと完全な署名済みpayloadを参照する。commit後のworkerは既存recordを配信してdeadline storeへ冪等に登録するだけで、commandの新規生成・再署名・再採番・Replayへの追記は行わない。deadline storeはjournalから復元可能なサービス内部のスケジュール索引とし、権威トランザクション外で更新する。同じキー・payloadの再登録は無操作、異なるpayloadは拒否する。登録後にoutboxを配信済みにし、途中停止時は未完了outboxを再配信する。既に解決済みのrequestは登録せず完了扱いにし、期限超過の未解決requestは通常の認可・排他規則に従ってtimeout処理へ送る。これにより、commit済みpendingには常に復元可能なdeadline commandが存在する。outboxとdeadline storeはプレイヤー向けstate/snapshotへ公開しない。
- `PLAY_CARD` が `PENDING_CARD_CHOICE` を作るトランザクションでは、元の `PLAY_CARD` inputの直後の `inputSequence` を `CARD_CHOICE_DEADLINE_ISSUED` に予約して入力ジャーナルと `serverCommands` に同時に記録する。outbox workerはこの既存journal recordを配信するだけで、新しいsequenceを採番しない。`CARD_CHOICE_REQUESTED` をクライアントへ返すのはこのトランザクションのcommit後とし、`SUBMIT_CARD_CHOICE` / `CARD_CHOICE_TIMEOUT` の受付は `(matchId, choiceRequestId)` の排他ロック内で、先行するdeadline command recordの存在とsequenceを確認してから次のsequenceを採番する。記録済みdeadline commandより先の提出・timeoutは拒否し、再起動後も同じjournal recordを読み直す。この直列化により、Replayでは常に `PLAY_CARD`、deadline command、提出またはtimeoutの順で入力列を復元できる。
- `PLAY_CARD` に限らず、`SUBMIT_CARD_CHOICE` を含む任意の `BattleInput` が解決の再開中に次の `PENDING_CARD_CHOICE` を作る場合も、同じ入力の直後の `inputSequence` を新しい `CARD_CHOICE_DEADLINE_ISSUED` に予約する。新requestのpending state・snapshot・deadline outbox・input journal recordを同一トランザクションで保存し、`(matchId, choiceRequestId)` の排他ロックと既存の直列化規則を適用する。したがって各段階のrequestは、requestを生んだinput、対応するdeadline command、次の提出またはtimeoutの順に独立して復元される。
- `CARD_CHOICE_TIMEOUT` の具体recordには、deadline commandを参照する `deadlineCommandSequence`、`deadlineAt`、battle serviceの時計で採番した `timeoutAt`、およびこれらとmatch ID・request ID・所有者・timeout input sequenceを束縛する署名付き `timeoutAttestation` を必須にする。battle serviceは自身の時刻が `deadlineAt` 以上の場合だけattestationを発行し、同じ排他トランザクションでtimeout recordを入力ジャーナルへ保存する。Replay validatorは公開検証鍵でdeadline commandの認可とtimeout attestationの両方を検証し、request・所有者・deadline command sequenceの一致と `timeoutAt >= deadlineAt` を要求する。replay再生時には実時計を読まず、記録済みの値と署名だけを検証する。これらの時刻・attestationは権威 `serverCommands` だけに保存し、battle state・snapshot・プレイヤー向け投影には含めない。
- `issuedAt`、`deadlineAt`、`timeoutAt` はUTCのUnix epoch millisecondsを表す非負のsafe integerに統一し、小数・文字列・ローカル時刻・safe integer範囲外の値を拒否する。`CARD_CHOICE_DEADLINE_ISSUED` の `deadlineAt` は厳密に `issuedAt + 60_000` とし、加算結果がsafe integer範囲を超えるcommandも拒否する。Replay validatorは署名検証に加えてこの等式を必ず検証し、一致しないdeadline commandと、それを参照するtimeoutを不正とする。`CARD_CHOICE_TIMEOUT` では同じ単位の `timeoutAt >= deadlineAt` を要求する。
- timeout commandが保存済み効果を再開した後は、各解決手順の直後に通常の終端判定を行う。HP終端または特殊勝利が成立した場合はrequestを消去して残りの手順と `TURN_ENDED` を実行せず、`MATCH_FINISHED` を終端イベントとして記録する。再開前に期限切れrequestだけを消費し、再開結果は終端、新しいpending、pendingなしの順で判定する。新しいpendingがあればそのrequestと中間状態を保持し、通常の原子的なdeadline予約を適用してターンを継続する。この場合 `TURN_ENDED` は記録しない。戦闘が継続し、かつpendingがない場合だけ `TURN_ENDED` を記録する。validatorもこの3分岐を検証し、効果再開中の終端または新pending成立後の `TURN_ENDED` を拒否する。ターン終了時効果で終端する場合は先行する `TURN_ENDED` を許可するが、`MATCH_FINISHED` 後のeventは常に拒否する。
- サーバー権威のaction/event/replayには完全な情報を保存する。プレイヤー向けイベント・snapshot・replayでは `visibility: ownerOnly` のレコードについて、相手への投影からカードID、定義IDとversion、発生元カードID・定義IDとversion、カード位置、選択値をすべて省略する。payloadの配列・入れ子に含まれる同種の識別情報も省略し、別フィールドへ複製して公開してはならない。山札からの選択IDを含む `PLAY_CARD.choices` も同様に扱う。
- 既存・新規を問わず、カードインスタンスIDまたは定義情報を含む全イベントに `visibility` を必須化する。`CARD_PLAYED` は公開プレイを示す監査イベントであり、カード領域の移動を表さない。`CARD_DRAWN` / `CARDS_DRAWN` は通常ドロー効果によるdrawPileからhandへの専用移動イベント、`CARD_DISCARDED` はdiscardへの移動、`CARD_EXHAUSTED` はexhaustへの移動であり、該当する移動はこのうち一つだけで記録する。山札検索・公開後の選択・並べ替えに伴うdrawPileからhandへの移動は通常ドローではなく、直前の `DECK_CARD_REVEALED` と選択を対応付ける `CARD_MOVED` だけで記録する。`変成液`、`賢者の触媒`、`矢継ぎ`、`戦術の確認` はこの検索移動に分類し、`CARD_DRAWN` / `CARDS_DRAWN` を追加記録しない。validatorは選択を伴う検索移動のドローイベント、および通常ドローへの `CARD_MOVED` の混在を拒否する。ドローイベントの `visibility` は移動するカードインスタンスのvisibilityを保持し、非公開カードは `ownerOnly`、公開済みカードは `allPlayers` とする。`CARDS_DRAWN` は同じvisibilityのカード群だけをまとめられ、公開済み・非公開カードが混在するドローは実際の順序を保って `CARD_DRAWN` またはvisibilityごとの `CARDS_DRAWN` に分割する。`CARD_DISCARDED` は移動後もカード識別情報が公開される場合だけ `allPlayers`、非公開のままなら `ownerOnly` とする。その他のカード移動・作成・廃棄・参照イベントも移動後の公開性に従い同じ規則を適用する。`ownerOnly` イベントの所有者向け表示は完全なpayloadを保ち、相手向け投影は `{ type, sequence, visibility, ownerPlayerId, redacted: true }` を必須フィールドとしてカードID・定義・source・位置・選択値を含めない。`CARDS_DRAWN` の `cardCount` のように効果回数の公開が必要な場合だけ個数を残す。
- 複数枚ドローで `CARDS_DRAWN` を使う場合は、実際のドロー順で同じvisibilityが連続する最大区間ごとに1recordを作る。「visibilityごと」はドロー全体から同じvisibilityを集約する意味ではない。たとえば `[ownerOnly, allPlayers, ownerOnly]` は3recordに分け、先頭と末尾のownerOnlyカードを同じ `CARDS_DRAWN` にまとめない。各record内のカードID順とrecordのevent sequenceを元のドロー順に一致させ、validatorは非連続区間の集約や順序変更を拒否する。すべてを1枚ずつ `CARD_DRAWN` として記録する形式も許可する。
- `Status`、`PendingEffect`、`BattleEffect`、`ChantEntry`、`CardModifier`、`pendingCardChoice` のstate項目、および `STATUS_*` / `PENDING_EFFECT_*` / `BATTLE_EFFECT_*` / `CHANT_*` / `CARD_MODIFIER_*` / `CARD_CHOICE_*` のイベントは、`ownerPlayerId` と `visibility` を必須とする。これらの項目・イベントに含まれる発生元・対象・選択候補・元定義・対象カードのID / definitionId / definitionVersionは、カード移動と同じ可視性を継承する。`ownerOnly` の場合、所有者には完全なstate/payloadを示し、相手向けsnapshot/replay/event投影では入れ子の配列・payload・中間状態を含めて同種の識別子、位置、選択値を再帰的に除去する。公開が必要なstatusId・stack・残りカウント・effect種別などの非識別値だけは保持できるが、伏せた識別子を別フィールドに複製してはならない。各validatorはstate項目・event・snapshotの `visibility` と所有者を検証し、ownerOnly項目の相手向け投影にカードまたは定義識別子が残るreplayを拒否する。
- `CardInstance` stateにも `visibility` を保存し、初期の非公開カードは `ownerOnly`、`CARD_PLAYED` または明示的公開で全員に識別情報を示したカードは `allPlayers` とする。以後の移動でも可視性を保持し、snapshot・replay投影は各カードのvisibilityに従って公開ゾーン内や公開イベント上の識別情報を保つか伏せる。カードの識別visibilityと山札内の位置情報は別に扱う。相手向けsnapshot/replayでは、山札内の全カードについて、公開済みカードであってもID・定義・順序・indexを伏せ、山札枚数だけを必要に応じて公開する。山札所有者には完全な順序を見せる。非公開カードのslot数は維持できるが、slot位置や定義は公開しない。相手の `arrowQueue` 投影もID列を伏せ、公開が必要な場合は本数のみ示す。
- 山札の検索・確認に伴う `DECK_CARD_REVEALED` と `CARD_MOVED` では、カード識別情報の `visibility` と山札位置情報の `positionVisibility` を別々に持つ。所有者だけが行う検索の `positionVisibility` は常に `ownerOnly` とする。対象カードの `visibility` が `allPlayers` の場合、相手向け投影には既知のカードID・定義だけを残せるが、`zone`、`fromZone` / `toZone`、`index`、順序をすべて省略する。`ownerOnly` の場合はレコード全体を共通のredacted形式へ投影する。`toZone: drawPile` の移動には次項のより厳しい規則を適用し、カード識別情報も含めてレコード全体をredacted形式へ投影する。validatorはidentityとpositionの二つの可視性を独立に検証する。
- `toZone: drawPile` のカード移動は、カードインスタンスが `allPlayers` であっても、山札所有者以外へのevent/replay投影では常に山札秘匿を優先する。この場合は `CARD_MOVED` を `{ type, sequence, visibility, ownerPlayerId, redacted: true }` に投影し、カードID・定義・移動元/先zone・index・順序を含めない。カード自身の `visibility` は変更せず、後に山札外へ移動した際の識別情報はそのvisibilityに従う。山札所有者と権威版には完全な移動を保存し、validatorは相手向け投影に山札への移動を特定できる識別子または位置情報が残るreplayを拒否する。
- 正式な `Replay` は完全な初期状態・action・event・snapshot・最終状態と単一checksumを持つ権威版とし、`verifyReplay` は完全情報に対してのみ実行する。プレイヤー向けには別型 `PlayerReplayView` を作り、`viewerPlayerId`、`projectionVersion`、投影済み初期状態・action・event・snapshot・最終状態、`projectionChecksum` を持たせる。全状態とaction choicesにもeventと同じ公開規則を再帰適用する。権威版replayを検証してから投影を作り、投影checksumは `projectionChecksum` 自体を除いた投影済みpayloadに対して既存と同じcanonical JSON・UTF-8 FNV-1a-32で計算する。`PlayerReplayView` はcanonical `verifyReplay` に渡さず、別の投影検証ではchecksum・連続event sequence・投影済みstate/eventの形式のみを検証し、完全なsimulationの検証済みとは扱わない。
- `seed`、`rngState`、`rngStateBefore` / `rngStateAfter` など乱数系列を復元できる値は、サーバー権威のlive battle state・snapshot・Replayに保存する。これにより任意の権威snapshotから後続のシャッフルを同じ乱数系列で再開できる。すべての `PlayerReplayView` とプレイヤー向けevent/snapshotからは除外する。`DECK_SHUFFLED` のowner向け投影には公開規則で許可された山札順だけを残し、所有者にも乱数状態は見せない。プレイヤー向けaction、stateの入れ子、checksum対象にもseedや同等の乱数状態を含めない。
- `PLAY_CARD.choices` の各 `cardInstanceIds` 配列は重複を許さず、同一IDを複数回指定したactionは不正として拒否する。配列順は選択順として保持する。
- プレイヤーstateは `exhaust` 配列を持つ。カードの一意性・領域不変条件・snapshot復元・replay検証は `drawPile` / `hand` / `discard` / `exhaust` の全領域を対象にする。カードコピー数上限もこれら全領域の同一 `(definitionId, definitionVersion)` のインスタンスを数え、解決した定義の `deckLimit` を適用する。特殊勝利による終端結果は `TerminalBattleResult.reason` で通常HP勝利と区別し、`MATCH_FINISHED`・`MATCH_END` phase・replay検証はreasonに応じた合法性を検証する。
- 新versionのreplay validatorは `BattlePlayerState.exhaust` を必須配列として検証し、`hasUniqueBattleStateIds` 相当の一意性検証も4領域を走査する。同一プレイヤー・同一 `(definitionId, definitionVersion)` の総数が、その定義の数値 `deckLimit` を超えるstateは拒否する。`deckLimit: null` の組には枚数上限を適用しない。旧versionのstate検証は従来の3領域・コピー上限規則を使う。
- 「廃棄」はこの案で新設する廃棄領域[新規：廃棄領域]へ移すことを指す。素材・通常カードを問わず廃棄領域へ移る全カードについて、`CARD_EXHAUSTED` に `ownerPlayerId`、`cardInstanceId`、`fromZone` / `fromIndex`、`toZone: exhaust` / `toIndex`（廃棄領域へ追加後のindex。末尾追加は移動前の廃棄領域枚数）、発生元カードID・定義ID・version、`visibility`、理由を記録する。廃棄領域も戦闘状態・snapshot・replayとカード領域の不変条件に含め、既存の山札・手札・捨て札からは除外する。カードIDや位置が所有者にしか分からない場合は `visibility: ownerOnly` とし、公開されたカードを廃棄する場合は `allPlayers` とする。`CARD_EXHAUSTED` は廃棄専用の移動イベントとして扱い、同じ移動に `CARD_MOVED` を重複記録しない。「保留」はターン終了時に手札に残す。
- この案で、`CARD_DRAWN` / `CARDS_DRAWN`、`CARD_DISCARDED`、`CARD_EXHAUSTED` のいずれにも該当しない既存カードインスタンスを別領域へ移すときは `CARD_MOVED` を記録する。1回の領域移動に専用イベントと `CARD_MOVED` を重複して記録してはならない。payloadは `ownerPlayerId`、`cardInstanceId`、`fromZone` / `fromIndex`、`toZone` / `toIndex`、`sourceCardInstanceId`、`sourceDefinitionId` / `sourceDefinitionVersion`、`visibility`、`reason` を必須とする。カード効果による移動では発生元カード情報を必須とし、カード起因でない山札補充などのシステム移動では発生元カード情報をnullとする。領域内のindexは0始まりで、`fromIndex` は移動前、`toIndex` は移動後の移動先配列での実際のindexとする。山札の一番上はindex 0、一番下は移動後の山札枚数-1、手札への末尾追加は移動前の手札枚数を `toIndex` とする。カードインスタンス自体は作り直さず、定義・コスト修正などの保持値を移動先へ引き継ぐ。`reason` はカード定義に対応する固定値（例：`TRICKSTER_QUICK_STEP`、`TRICKSTER_ESCAPE_STEP`、`TRICKSTER_RELOAD`、`TRICKSTER_TACTICAL_INSPECTION`、`TRICKSTER_ESCAPE`、`ALCHEMY_CATALYST`、`DRAW_PILE_EMPTY_RECYCLE`）を使う。山札のカードを確認するときは移動と区別して `DECK_CARD_REVEALED` を記録し、`ownerPlayerId`、`cardInstanceId`、`definitionId` / `definitionVersion`、`zone: drawPile`、確認時点の0始まり `index`、`visibility`、発生元カードのID・定義ID・version、`reason` を含める。`visibility` は `allPlayers` または `ownerOnly` とし、「公開」は `allPlayers`、「見る」や山札検索は `ownerOnly` を使う。`CARD_MOVED` はカードIDや位置が所有者にしか分からない移動では `ownerOnly` とし、公開済みカードの移動は効果に従って `allPlayers` とする。公開だけならカード位置は変わらず、移動も起きた場合は確認イベントの直後に `CARD_MOVED` を記録する。サーバー権威のaction/event/replayには完全な情報を保存し、プレイヤー向けイベント・snapshot・replayでは各レコードの `visibility` に従って相手に非公開のカードID、位置、選択値を伏せる。山札からの選択IDを含む `PLAY_CARD.choices` も同じ規則で相手向け表示から伏せる。これらのイベントも実際の解決順でaction・snapshot・replayに保存する。
- 山札をシャッフルするたび `DECK_SHUFFLED` を記録する。payloadは `ownerPlayerId`、`pile: drawPile`、シャッフル前後の `cardInstanceIds` 配列、`SeededRandom v1` の `rngStateBefore` / `rngStateAfter`、`reason`（例：`BATTLE_SETUP`、`DRAW_PILE_EMPTY_RECYCLE`、`TRICKSTER_ESCAPE`、`HUNTER_ARROW_SEARCH`）、（カード効果による場合）発生元カードID・定義ID・version、`visibility: ownerOnly` を含める。サーバー権威のreplayには完全な順序とRNG状態を保存し、プレイヤー向けイベント・snapshot・replayでは山札所有者だけにID順を見せる。
- カードを山札から引く、または山札を検索・参照する直前に山札が空なら、捨て札の全カードを現在の捨て札順で `CARD_MOVED`（`reason: DRAW_PILE_EMPTY_RECYCLE`）として山札へ移し、続けて `DECK_SHUFFLED` を1回記録してから処理する。各移動イベントの `visibility` はカードインスタンスのvisibilityを保持する。相手向け投影では、公開済みカードの移動イベントでも山札内の `fromIndex` / `toIndex` と順序を伏せる。複数枚のドロー中に山札が再び空になり捨て札にカードがあれば同じ手順を繰り返す。山札と捨て札がともに空なら残りのドローを行わず終了する。山札上N枚を見る効果は、補充後の山札枚数がN未満なら存在する分だけを対象とし、N枚揃えるために追加で捨て札を戻すことはしない。廃棄領域は山札補充に含めない。
- 状態異常は `statusId`・対象・発生元カードID・値（stack）・残り発動回数・失効条件を持ち、`STATUS_APPLIED` / `STATUS_UPDATED` / `STATUS_CONSUMED` / `STATUS_EXPIRED` イベントとstate/replayへ記録する。同じ `statusId` の重複は個別規則に従い、指定がなければ値を加算し、発動回数は更新しない。毒は `POISON`、凍結は `NEXT_TURN_FIRST_CARD_COST_UP`、氷片の弱体化は `NEXT_ATTACK_DAMAGE_DOWN`、目印の矢は `NEXT_ATTACK_DAMAGE_UP`、時間泥棒は `NEXT_TWO_CARD_COST_UP` とする。毒は対象の各ターン開始時、詠唱進行とドローより前にブロックを無視してstack分のダメージをHPへ与え、HPによる勝敗を判定して戦闘が続く場合にstackを1減らし0で消える。再付与した毒stackは加算する。凍結は対象の次ターンに最初に正常プレイするカードのコストをstack分増やし、そのターン終了時に残りを失効する。氷片の弱体化は対象の次の攻撃ダメージを2減らし、目印の矢は対象が次に受ける攻撃ダメージを4増やす。どちらも攻撃のブロック適用前に1度だけ適用し、その攻撃時に消費する。重ねて付与した場合は値を加算する。時間泥棒は対象の次の2回の正常なカード使用コストを1増やし、使用ごとに残り回数を1減らす。再付与時は残り回数を2に更新し、加算しない。いずれも戦闘終了時に失効する。
- 状態異常とは別に、1回以上の後続イベントを待つ効果は `pendingEffects` に保存する[新規：保留効果]。戦闘状態に保存する単調増加の `pendingEffectSequence` で `pending:<sequence>` 形式の一意な `pendingEffectId` を割り当てる。各項目は所有者、対象、発生元カードIDと定義version、trigger条件、適用payload、残り発動回数、失効条件、作成順を持つ。作成・更新・発動消費・失効は `PENDING_EFFECT_CREATED` / `PENDING_EFFECT_UPDATED` / `PENDING_EFFECT_CONSUMED` / `PENDING_EFFECT_EXPIRED` として記録し、battle state・snapshot・replayに保存する。イベントが成立したら作成順に条件を判定しpayloadを適用して発動回数を1減らし、0で項目を除く。条件が成立しないまま期限を迎えた項目は失効する。同じ効果が複数回付与された場合は独立した項目として追加し、カードに加算・上書き・再設定が明記される場合だけその規則を使う。`剣気` は次の剣カード使用時にそのカードの最初のダメージヒットへ+3、`魔力充填` は次の魔法ダメージヒットへ+2、`魔導書の封印` は次に受けるダメージヒットから5を減らす。`受け流し` は次に攻撃をブロックしたとき敵へ4ダメージ、`仕込み罠` は次の敵攻撃開始時に敵へ6ダメージを与えてその攻撃の各ヒットを3減らす。いずれも該当イベントで一度だけ消費する。保留効果は戦闘終了時に失効する。
- `賢者の触媒` は次の合成開始時、素材選択前に山札最上位1枚を公開するpendingEffectとして扱う。`追い風` は所有者・作成ターン・発生元・残り回数1を持つ単一pendingEffectとして保存する。後続カードのコスト計算時に-1を仮適用し、合法なプレイの確定時に `PENDING_EFFECT_CONSUMED` で消費する。不正なプレイ試行では消費しない。未消費のまま所有者の同ターンの `TURN_ENDED` を迎えた場合は、共通のpendingEffects作成順で同じ項目を消費して1枚引く。消費はドロー前に記録し、割引と終了時ドローを二重適用しない。カード数カウンターは用いず、未消費項目の存在で後続カード未使用を判定する。`逃げ足` は使用時のchoicesに選んだカードIDを持つpendingEffectを作る。`TURN_ENDED` 時にそのカードが手札にあり、かつその時点でも `arrowQueue` に含まれない場合だけ `CARD_MOVED` で山札の一番上へ移す。選択後に装填されていた場合、または手札を離れていた場合は移動せず失効する。
- 後続ターンや複数イベントに反応する常在効果は `battleEffects` に保存する[新規：常在効果]。`battleEffectSequence` で一意な `battleEffectId` を採番し、所有者・発生元カードIDと定義version・購読trigger・payload・適用条件・重複規則・有効期限を保持する。登録・変更・発動・失効は `BATTLE_EFFECT_CREATED` / `BATTLE_EFFECT_UPDATED` / `BATTLE_EFFECT_TRIGGERED` / `BATTLE_EFFECT_EXPIRED` に記録し、state・snapshot・replayへ保存する。カードの `type` は保存形式を決めず、各効果を `pendingEffects`・`battleEffects`・状態異常・card modifierのいずれかへ割り当てる。battle effectは発生元カードが捨て札または廃棄領域へ移動しても継続し、期限または戦闘終了時に失効する。明記のない同効果の複数発生は独立したbattleEffectとして重複し、それぞれpayloadを適用する。1ターン1回などの制限カウンターと、ターン開始・終了時の初期化もbattle stateとイベントに記録する。致死ダメージを止める効果は、ブロック等の軽減を適用した後、HPを減らす直前に判定する。該当する場合は `BATTLE_EFFECT_TRIGGERED` に加えて、ダメージイベントへ適用前ダメージ・実HPダメージ・防いだ超過分を記録し、実HPダメージを効果ごとの規則で切り詰めてから敗北判定へ進む。`連刃の型` は使用直前の剣カード使用数を判定に使い、このカード自身はその枚数に含めない。使用前に剣カードを1枚以上使っていた場合に限り、この戦闘中に後から使う剣カードへ+2ダメージを適用する状態を登録する。`剣聖の教え` は剣カード使用イベントごとに1ブロックを得る。`魔導書・連鎖` は現在の魔法カードの効果と詠唱開始の後に、次に使う魔法カード由来の `CHANT_STARTED` を1短縮するpendingEffectを作る。ドローに反応するbattle effectは、`CARD_DRAWN` ではそのイベントごとに1回、`CARDS_DRAWN` では `cardCount` 回を実際のドロー順に1回ずつ処理する。`予定変更` は解決後からそのターン中の各ドローで1ブロックを得て、`CARDS_DRAWN` の複数枚ドローでも引いた枚数分のブロックを得る。ターン終了時に2ダメージを受けて失効する。`矢羽の改良` は選択した矢カードインスタンスに戦闘中のダメージ補正+2を付ける。`最後の盾` は使用時に、所有者の次の相手ターン終了時まで、所有者がHP0以下になるダメージを受けるたび、実HPダメージを現在HP-1に切り詰めて超過分を防ぐbattleEffectを登録する。HPが1なら実HPダメージは0となる。効果はその相手ターン中の全ての該当ダメージに適用し、相手の `TURN_ENDED` が発生した後、そのイベントの終了時効果をすべて解決してから失効する。card modifierは対象カードに保存し、`CARD_MODIFIER_APPLIED` / `CARD_MODIFIER_EXPIRED` で記録する。常在効果の重複・trigger・期限の形式を変更するときはrules versionを更新する。
- ターン境界で複数の効果が発動するときは次の順序に固定する。`TURN_STARTED` を記録した後、状態異常のターン開始効果を発生順に解決し、各効果後に終端結果を判定する。戦闘が続く場合、`pendingEffects`、`battleEffects` の順に各種内の作成順で解決し、その後に詠唱キューを開始順に進めて完了効果を解決し、最後に通常ドローを行う。`TURN_ENDED` はイベントを記録した後、`pendingEffects`、`battleEffects` の順に各種内の作成順で解決し、各効果後に終端結果を判定する。全ての終了時効果を解決した後に期限切れの状態異常・保留効果・常在効果・一時コスト修正を失効させる。各イベントは実際に解決した順で連番記録し、同じtriggerの解決中に新規登録された効果は次回の該当triggerから有効とする。この順序により、例えば `踏み込み` のブロック減少を解決してから `砦の番人` が残存ブロックを判定する。
- ダメージ、ブロック、回復、ドローは既存の基本効果で表現できる。新しい仕組みの初出には `[新規：仕組み名]` を付ける。
- UR は強力な見せ場を作る枠であり、入手率やデッキ上限はゲーム側のルールに合わせて決める。

## 剣士：連撃と構えの切り替え

剣カードを続けて使う気持ちよさを保ちつつ、手札やエネルギーを使い切るか、次のターンに備えるかを選ばせる。

| カード | レアリティ / コスト | 効果案 | ID | version | type | deckLimit |
| --- | --- | --- | --- | --- | --- | --- |
| 抜き打ち | N / 1 | 4ダメージ。このターンに剣を使っていなければ、追加で2ダメージ。 | sword_001 | 1.0.0 | ATTACK | 3 |
| 返しの刃 | N / 1 | 3ダメージ。ブロックを得ているなら、さらに3ダメージ。 | sword_002 | 1.0.0 | ATTACK | 3 |
| 踏み込み | N / 1 | 6ダメージ。このターン終了時、自分のブロックを3失う。 | sword_003 | 1.0.0 | ATTACK | 3 |
| 二段斬り | R / 2 | 4ダメージを2回与える。 | sword_004 | 1.0.0 | ATTACK | 3 |
| 剣気 | R / 1 | 5ブロックを得る。次に使う剣は3ダメージ増える。 | sword_005 | 1.0.0 | POWER | 3 |
| 受け流し | R / 1 | 4ブロックを得る。次に受ける攻撃を防いだら、敵に4ダメージ。 | sword_006 | 1.0.0 | REACTION | 3 |
| 連刃の型 | R / 2 | 使用前に剣カードを1枚以上使っていた場合に限り、この戦闘中、このカードより後に使う剣カードへ2ダメージを加える。このカード自身は使用前の枚数に含めない。 | sword_007 | 1.0.0 | POWER | 3 |
| 呼吸を整える | R / 1 | 1枚引く。手札に剣があれば1エネルギーを得る。 | sword_008 | 1.0.0 | SKILL | 3 |
| 斬り上げ | SR / 2 | 8ダメージ。敵のブロックがあるなら、そのブロックを半分（端数切り捨て）にしてからダメージを与える。 | sword_009 | 1.0.0 | ATTACK | 3 |
| 無明の太刀 | SR / 3 | 14ダメージ。このターン剣を2枚以上使っていれば、コストを2回復する。 | sword_010 | 1.0.0 | ATTACK | 3 |
| 剣聖の教え | SR / 2 | この戦闘中、剣を使うたび1ブロックを得る。 | sword_011 | 1.0.0 | POWER | 3 |
| 一閃 | UR / 3 | 4・3・3ダメージをこの順に与える（合計10）。各ヒットの前に敵のブロックを2減らす。 | sword_012 | 1.0.0 | ATTACK | 3 |

## 守護者：ブロックを資源に変える

守り切るだけでなく、蓄えたブロックを回復や反撃、次ターンの準備に変換する。

| カード | レアリティ / コスト | 効果案 | ID | version | type | deckLimit |
| --- | --- | --- | --- | --- | --- | --- |
| 盾構え | N / 1 | 6ブロックを得る。 | guardian_001 | 1.0.0 | SKILL | 3 |
| かばう | N / 1 | 4ブロックを得る。次に受ける攻撃のダメージをさらに2減らす。 | guardian_002 | 1.0.0 | REACTION | 3 |
| 小休止 | N / 1 | 3ブロックを得て、1枚引く。 | guardian_003 | 1.0.0 | SKILL | 3 |
| 盾打ち | R / 1 | 4ダメージを与える。自分のブロック3ごとに、追加で1ダメージ。 | guardian_004 | 1.0.0 | ATTACK | 3 |
| 堅牢な陣 | R / 2 | 11ブロックを得る。次の自分のターン開始時にブロックを4失う。 | guardian_005 | 1.0.0 | POWER | 3 |
| 報復の構え | R / 1 | 次の敵ターン中に自分のブロックで実際に防いだダメージ量を記録する。その次の自分のターン開始時、毒ダメージ後かつ詠唱進行前に、記録量の半分（端数切り捨て）を敵へ与え、記録を0にする。 | guardian_006 | 1.0.0 | POWER | 3 |
| 盾の連携 | R / 2 | この戦闘中、ブロックを得る効果1回につき1度だけ1ブロックを追加で得る。追加分はこの効果を再誘発しない。 | guardian_007 | 1.0.0 | POWER | 3 |
| 鉄壁 | SR / 2 | 15ブロックを得る。次の自分のターン開始時に1枚引く。 | guardian_008 | 1.0.0 | POWER | 3 |
| 不屈の誓い | SR / 2 | HPが半分以下なら8回復する。それ以外なら12ブロックを得る。 | guardian_009 | 1.0.0 | SKILL | 3 |
| 砦の番人 | SR / 3 | この戦闘中、ターン終了時にブロックが残っていればカードを1枚引く。 | guardian_010 | 1.0.0 | POWER | 3 |
| 難攻不落 | UR / 3 | 20ブロックを得る。次の敵ターンに受ける最初の攻撃を0にする。 | guardian_011 | 1.0.0 | REACTION | 3 |
| 最後の盾 | UR / 2 | 使用時に、次の相手ターン終了時まで自分がHP0以下になるダメージを受けるたびHPを1にする効果を登録する。ブロック等の適用後にHPが0以下になるダメージは、この効果の発動で実HPダメージを現在HP-1に切り詰め、超過分を防ぐ。HPが1なら実HPダメージは0となる。このカードは使用後に廃棄領域へ移す。 | guardian_012 | 1.0.0 | REACTION | 3 |

## 魔法使い：詠唱の先払い

強力な魔法を予告して仕込み、相手に対処の猶予を与える代わりに、詠唱短縮や連鎖で大きな見返りを狙う。[新規：詠唱]

このクラスには、通常のダメージ勝利と異なる「大願成就」の特殊勝利ルート[新規：特殊勝利]を用意する。重い魔法書を手札に集めて燃やし、勝利への願いの詠唱を進める構築を想定する。長い準備を守り切ることが勝ち筋になる。

| カード | レアリティ / コスト | 効果案 | ID | version | type | deckLimit |
| --- | --- | --- | --- | --- | --- | --- |
| 火花 | N / 1 | 5ダメージ。 | mage_001 | 1.0.0 | ATTACK | 3 |
| 氷片 | N / 1 | 3ダメージを与え、敵の次の攻撃を2減らす。 | mage_002 | 1.0.0 | REACTION | 3 |
| 魔力充填 | N / 1 | 1エネルギーを得る。次に使う魔法は2ダメージ増える。 | mage_003 | 1.0.0 | POWER | 3 |
| 詠唱短縮 | R / 1 | 1枚引く。詠唱キューに魔法があれば1つを選び、残りカウントを1減らす。対象がなければ短縮だけ行わない。 | mage_004 | 1.0.0 | SKILL | 3 |
| 雷鳴 | R / 2 | 使用時に8ダメージを与えて詠唱1を開始する。詠唱完了時効果は4ダメージ。 | mage_005 | 1.0.0 | ATTACK | 3 |
| 魔力障壁 | R / 1 | 7ブロックを得る。自分の詠唱キューの項目1つにつき、さらに2ブロック。 | mage_006 | 1.0.0 | SKILL | 3 |
| 凍結の呪文 | R / 2 | 6ダメージ。敵に「次のターン、最初のカードのコスト+1」を付与する。[新規：状態異常] | mage_007 | 1.0.0 | REACTION | 3 |
| 魔導書・連鎖 | SR / 2 | この戦闘中、魔法カードの効果と詠唱開始を解決した後、次に使う魔法カードが開始する詠唱を1短縮する。 | mage_008 | 1.0.0 | POWER | 3 |
| 星辰落とし | SR / 3 | 使用時に16ダメージを与えて詠唱2を開始する。詠唱完了時効果は対戦相手に8ダメージ。 | mage_009 | 1.0.0 | ATTACK | 3 |
| 魔力転写 | SR / 1 | 詠唱キューの魔法1つを選び、残りカウントを2減らす。完了した場合はその効果を解決した後、1枚引く。対象がなければ何も行わない。 | mage_010 | 1.0.0 | SKILL | 3 |
| 魔導書・黒 | SR / 2 | この戦闘中、魔法のダメージ効果は追加でもう1回発動する。追加発動分はこの効果を再誘発しない。 | mage_011 | 1.0.0 | POWER | 3 |
| 魔導書・白 | R / 1 | この戦闘中、魔法の効果が発動するたび2回復する（ターン1回）。 | mage_012 | 1.0.0 | POWER | 3 |
| 魔導書・赤 | SR / 2 | この戦闘中、魔法は敵のブロックを無視する。 | mage_013 | 1.0.0 | POWER | 3 |
| 魔導書・青 | R / 1 | この戦闘中、魔法の効果が発動するたび1枚引く（ターン1回）。 | mage_014 | 1.0.0 | POWER | 3 |
| 時間停止 | UR / 3 | 詠唱キューの項目を開始順にすべて即時解決する。解決した項目1つにつき3ブロックを得る。 | mage_015 | 1.0.0 | SKILL | 3 |
| 終末の願い | UR / 3 | 使用時に詠唱3を開始する。詠唱完了時効果は敵に25ダメージ。使用者がダメージを受けるたび、この項目の残りカウントが1増える。 | mage_016 | 1.0.0 | REACTION | 3 |
| 勝利への願い | UR / 3 | 使用時に詠唱100を開始する。詠唱完了時効果はこの戦闘で勝利する。使用者がダメージを受けるたび、この項目の残りカウントが5増える。 | mage_017 | 1.0.0 | REACTION | 3 |
| 焚書 | SR / 1 | 手札から魔導書タグを持つカード1枚を選んで廃棄する。詠唱キューの「勝利への願い」を1つ選べた場合、その残りカウントを10減らす。対象がなければカウントを進めない。 | mage_018 | 1.0.0 | SKILL | 3 |
| 魔導書の封印 | R / 1 | 手札の魔導書1枚を山札の一番下に置く。次に受けるダメージを5減らす。 | mage_019 | 1.0.0 | REACTION | 3 |

詠唱キュー[新規：詠唱キュー]はカード領域と別のbattle state構造で、カードインスタンスを含まない順序付きQueueとする。戦闘状態に保存する単調増加の `chantEntrySequence` で一意な `chantEntryId`（`chant:<sequence>`）を割り当て、項目を選ぶactionではカードIDではなくこのIDを指定する。カードを使用して詠唱を開始すると、コスト支払いと `ON_PLAY` 効果の解決後も戦闘が続いている場合にだけ項目を作り、元カードは通常どおり捨て札へ移す。項目は `chantEntryId`、所有者、元カードの `definitionId` と `definitionVersion`、残りカウント、`ON_CHANT_COMPLETE` 効果データ、ダメージを受けたときに加える遅延値（通常0）、開始順を保持する。カードIDやコストを持たず、手札・山札・捨て札・廃棄領域のカード数には含めない。カード対象を取る通常効果の対象にはならず、カードのコスト変更・コピー・移動・廃棄などを受けない。詠唱キューを明示的に参照する効果と、当該項目の遅延値が0より大きい場合に限るダメージ後処理だけが項目を変更できる。特記がないキュー対象効果は使用者自身の詠唱キューだけを選ぶ。自分の各ターン開始時、通常のドローより前に自分の全項目の残りカウントを1減らし、0になった項目の完了効果だけを発動して項目を除去する。完了時に `ON_PLAY` 効果や詠唱開始効果を再実行しない。短縮効果も残りカウントを減らし、0以下になればその効果の解決中に完了する。即時解決・キャンセル・遅延も明示的なキュー操作とし、対象には `chantEntryId` を使う。解決完了・キャンセルした項目はキューから除去し、捨て札には置かない。項目に設定された遅延値は、使用者がダメージを受けた後に該当項目の残りカウントへ加える。詠唱開始・進行・遅延・完了・キャンセルを `CHANT_STARTED` / `CHANT_ADVANCED` / `CHANT_DELAYED` / `CHANT_COMPLETED` / `CHANT_CANCELLED` に記録し、イベントには項目ID・所有者・元定義ID/version・更新前後のカウントとQueue順を含める。battle state・snapshot・replayにもQueue順と項目の値を保持する。終端結果が成立した場合、残っている項目は解決せずにキューから除去し、キャンセルとして記録する。詠唱キュー由来の完了効果はカードインスタンス効果ではないが、元の `definitionId` の魔法効果として魔法参照パッシブを誘発する。効果定義に `ON_PLAY` / `ON_CHANT_COMPLETE` の解決時点を追加し、詠唱カードでは両方を明示する。時点を持たない既存カード効果は `ON_PLAY` として解釈する。ルール・card data versionを更新する。

「魔導書・黒」による追加ダメージ発動は元の魔法ダメージ効果ごとに1回だけ行う。詠唱キューの完了効果も元の `definitionId` を持つ魔法効果として扱う。追加発動には二次発動フラグを付け、同じ追加発動効果を再度誘発しない。

特殊勝利が成立した場合は、勝者IDと勝因（通常のHP勝利または特殊勝利）を含む `TerminalBattleResult` を設定して戦闘を終了する。既存の `MATCH_END` phase と `MATCH_FINISHED` イベントを通常勝利・特殊勝利・引き分けに使い、新しい終端phase名は導入しない。`MATCH_FINISHED` は `TerminalBattleResult` 全体を一度だけ記録する。`TerminalBattleResult` は `status: WIN | DRAW`、`winnerId`（WIN時のみ）、`reason: HP_DEPLETION | SPECIAL_VICTORY | SIMULTANEOUS_HP_DEPLETION` を持つ。片方だけがHP0以下なら `status: WIN`、`reason: HP_DEPLETION`、勝者は生存者とする。両者がHP0以下なら `status: DRAW`、`reason: SIMULTANEOUS_HP_DEPLETION`、`winnerId` は持たない。特殊勝利では `status: WIN`、`reason: SPECIAL_VICTORY` とし、`specialVictoryId` に `MAGE_GRAND_WISH` または `ALCHEMY_SAGE_STONE` を記録する。特殊勝利は両プレイヤーのHPが正で、HPによる終端が成立していない場合だけ判定する。`MATCH_END` のreplay validatorはreason別に検証する。`HP_DEPLETION` では生存者がwinnerIdだけであること、`SIMULTANEOUS_HP_DEPLETION` では生存者がいないこと、`SPECIAL_VICTORY` では両プレイヤーのHPが正でwinnerIdが存在し、対応する勝因event/action列が成立していることを要求する。`SPECIAL_VICTORY` では生存者が2人であることを許可し、HPによる終端とは異なる条件で `MATCH_END` を許可する。validatorはstatus・winnerIdの有無・reason・specialVictoryId・phase・`MATCH_FINISHED` とevent/action列の一致を検証し、不一致を拒否する。engine/rules/replay versionの扱いは共通version規則に従い、旧versionのreplayは従来契約で検証する。特殊勝利の判定順は下記の実装メモに従う。

## 錬金術師：素材を組み合わせる

素材カードを集めて合成先を選ぶ構築。素材を揃える手間に見合うよう、素材単体にも小さな使い道を用意する。[新規：合成・素材]

錬金術師には、素材を順に集めて「賢者の石」を完成させる特殊勝利ルートを用意する。攻撃・防御に使える素材を、完成条件のために温存する判断が中心になる。素材を揃えるだけで勝利にはせず、レシピを引いて段階的に合成する必要がある。

合成効果を持つカードを使うとき、指定された枚数の素材を原則手札から選んで合成する（別の領域を使える場合はカードに明記する）。選んだ素材の枚数と種類がレシピに完全一致すれば合成成功となり、素材を廃棄領域へ移して、完成品カードを新しいカードインスタンスとして手札に加える。レシピにない組み合わせでも合成自体は成立するが、合成失敗となり、素材を廃棄領域へ移して2ブロックを得る（完成品は作らない）。失敗は弱い効果に留め、無効な選択を理由にアクションを拒否しない。[新規：合成結果]

プレイヤーが現在確認できる対象の選択は `PLAY_CARD` action の `choices` に含め、`CARD_INSTANCES.cardInstanceIds` の順も選択順として扱う。合成では素材IDの `CARD_INSTANCES` と必要なら `RECIPE`、焚書では廃棄するカードIDの `CARD_INSTANCES` と進める詠唱キューの `CHANT_ENTRY`、詠唱短縮・魔力転写では対象キュー項目の `CHANT_ENTRY`、矢羽の改良では強化する装填矢1枚の `CARD_INSTANCES`、山札から選ぶ効果では、公開・検索後に行う選択を後述の継続選択actionに記録する。各 `cardInstanceIds` 配列は重複を許さず、同一IDを複数回指定したactionは不正として拒否する。サーバーはカード選択の所有者・領域・タグ・枚数と、キュー項目の所有者・存在・枚数・合法性をそれぞれ検証し、結果を暗黙に選び直さない。

山札検索や公開によって初めて選択候補が分かる効果は、まだ見ていないIDを最初の `PLAY_CARD.choices` に要求してはならない。この案では原子action契約を拡張し、`BattlePhase` に `PENDING_CARD_CHOICE` を追加する。`GameAction` には `SUBMIT_CARD_CHOICE { type, playerId, choiceRequestId, choice }` を追加し、`choice` は `CARD { cardInstanceId }`、`CARDS { cardInstanceIds }`、`RECIPE { recipeId }` の判別可能なunionとする。`CARD_CHOICE_TIMEOUT { type, playerId, choiceRequestId, deadlineCommandSequence, deadlineAt, timeoutAt, timeoutAuthorization, timeoutAttestation }` と `CARD_CHOICE_DEADLINE_ISSUED { type, playerId, choiceRequestId, issuedAt, deadlineAt, timeoutAuthorization }` はクライアントactionではなく、信頼済みbattle serviceだけがエンジンの内部command入口へ渡せる `ServerCommand` とする。timeoutの `deadlineCommandSequence` と `timeoutAuthorization` は保存済みdeadline commandを一意に参照し、`timeoutAttestation` はmatch ID・request ID・所有者・deadline command sequence・deadlineAt・timeoutAt・timeout input sequenceを束縛する。効果解決中に非公開の `CARD_CHOICE_REQUESTED` を所有者へ送り、`choiceRequestId`・`choice.kind`・そのkindに対応する候補（カードIDまたはrecipeId）を提示して、`PLAY_CARD` を `PENDING_CARD_CHOICE` で停止する。battle stateには `pendingCardChoice` としてrequest ID・所有者・元の `PLAY_CARD` input sequence・発生元カードIDとdefinition version・choice kind・候補・次に実行する効果手順のprogram counter・その手順の決定的な中間状態を保存し、wall-clockの `requestedAt` / `deadlineAt` は保存しない。複数種別の選択が必要な場合は、再開後に次の `CARD_CHOICE_REQUESTED` を作る。たとえば未知の素材を選んだ後に複数recipeが候補となる合成は、まず `CARD` または `CARDS`、続けて `RECIPE` requestを発行する。PENDING遷移を保存する同一トランザクション内でbattle serviceは、match ID・request ID・所有者・issuedAt・deadlineAt・発行sequenceを束縛した署名付き `CARD_CHOICE_DEADLINE_ISSUED` commandを生成・記録する。`deadlineAt = issuedAt + 60秒` とし、commit後のoutbox配信で保存済みcommandからdeadline storeを更新する。時刻と署名は権威の `serverCommands` / Replayだけに記録し、一般battle state・snapshot・プレイヤー向け投影には含めない。通常ターンの自動 `END_TURN` は保留中requestには送らない。`PENDING_CARD_CHOICE` 中は、該当所有者による一致したrequest ID・kind・候補の `SUBMIT_CARD_CHOICE`、またはdeadline経過後にbattle serviceが有効な署名付き認可を添えて渡す `CARD_CHOICE_TIMEOUT` だけを受け付け、他のプレイヤーのaction・クライアントからの `END_TURN`・別の `PLAY_CARD` は拒否する。エンジンは内部command入口をクライアントtransportから公開せず、request・所有者・deadline・認可hashを照合して不一致を拒否する。提出actionは未解決request・所有者・kind・候補を検証して `CARD_CHOICE_SUBMITTED` を記録し、保存済みの中間状態から同じ効果解決を再開する。timeout commandは `CARD_CHOICE_TIMED_OUT` を記録し、選択対象を選ばない「対象なし」分岐で保存済みの効果を再開して残りの必須手順を解決する。期限切れrequestは再開前に消費し、再開後は共通timeout規則に従い、終端なら終了、新しいpendingがあればそのrequestとdeadlineを保存して待機、どちらもなければ `TURN_ENDED` へ進む。timeoutでは元の `PLAY_CARD` を巻き戻さず、すでに解決済みのコスト・移動・公開を保持する。

Replayは元の `PLAY_CARD` と各 `SUBMIT_CARD_CHOICE` をactionとして保存し、`CARD_CHOICE_DEADLINE_ISSUED` と `CARD_CHOICE_TIMEOUT` は同一のsequence空間で順序付けたserver command recordとして保存する。deadline recordにはrequest・所有者・issuedAt・deadlineAt・発行sequence・`timeoutAuthorization` を、timeout recordには対応するdeadline recordのsequenceと同じ認可を含め、権威Replayだけに保存する。event sequenceは保留前後を通じて単調に連番とし、snapshotは各input後の `inputSequence` 境界で保存する。validatorは `CARD_CHOICE_REQUESTED`、`pendingCardChoice`、直後にrequest・所有者・発行sequenceが一致しbattle serviceの公開検証鍵で署名が検証できる `CARD_CHOICE_DEADLINE_ISSUED`、続く対応する `SUBMIT_CARD_CHOICE` と `CARD_CHOICE_SUBMITTED`、または同じ認可を参照する `CARD_CHOICE_TIMEOUT` と `CARD_CHOICE_TIMED_OUT`、再開後stateの連鎖を検証する。timeoutの再開結果に応じて、終端なら `MATCH_FINISHED`、新pendingなら `CARD_CHOICE_REQUESTED` と次のdeadline command、pendingなしの継続なら `TURN_ENDED` を検証する。replay検証では実時間を参照せず、記録済みのdeadline command・認可・sequenceだけを検証する。候補・kind・所有者・元input sequence・program counter・deadline・認可の不一致、保留中の別action、未解決requestを持つ終端stateを拒否する。複数の未知選択が続く場合は、一つの提出actionで再開した後に次のrequestを作成する。choice requestと提出選択のID・候補情報は権威replayに記録し、プレイヤー向け投影では相手に伏せる。`矢継ぎ`、`変成液`、`戦術の確認` はこの継続選択を使う。`賢者の触媒` が次の合成前に素材を山札から手札へ加えた場合は、その素材も候補に含める後続の素材選択にこの継続選択を使う。任意対象がない場合は各カードに記載したとおり対象依存効果だけを行わず、残りの効果は解決する。choices はサーバー権威のaction/replayに完全な値を保存し、プレイヤー向けaction/replayでは各選択の可視性に従って相手に非公開の山札カードIDを伏せる。イベントと状態変更は同じ完全な選択から再生する。

万能溶媒は選んだ素材1枚として数え、レシピ照合前にそのレシピの不足している素材1種類を代用する。溶媒1枚につき代用は1種類までで、溶媒カード自体も合成素材として廃棄する。溶媒を使った後に選択素材と一致するレシピがなければ、通常の合成失敗として2ブロックを得る。複数レシピに一致するときは合成時に対象レシピを選ぶ。一致候補がない場合も失敗として処理する。

合成レシピは `cardDataVersion` / `rulesVersion` に属する固定registryとし、各行の素材tag多重集合・許可領域・結果・触媒割引を判定に使う。`recipeId` は次の固定値を使う。通常レシピは素材2枚を手札から選び、レシピが一致すれば出力カードを生成する。賢者の石のレシピはregistryに属する固定の3素材レシピで、カード定義に指定された領域とstage更新を使う。

| recipeId | 素材tag | 許可領域 | 結果 | 出力definitionId | 触媒割引 |
| --- | --- | --- | --- | --- | --- |
| `ALCHEMY_RED_CATALYST` | `reagent:red` + `catalyst` | hand | 火薬瓶を生成 | `alchemist_005` | 実際に `catalyst` を使った場合のみ `costModifier: -1` |
| `ALCHEMY_BLUE_CATALYST` | `reagent:blue` + `catalyst` | hand | 結晶薬を生成 | `alchemist_006` | 実際に `catalyst` を使った場合のみ `costModifier: -1` |
| `ALCHEMY_SAGE_STONE` | `reagent:red` + `reagent:blue` + `reagent:white` | hand または discard | `alchemyStage` を規則に従って更新 | なし | なし |

`alchemist_011`（完全反応）と `alchemist_013`（大錬成）はカード定義に固定された特殊合成であり、このregistry検索を行わない。完全反応は手札から選んだ `reagent` 3枚を使い、色別効果を適用する。大錬成は手札の `material` 全てを使い、素材数に応じた効果を適用する。どちらも出力カード・触媒割引はない。万能溶媒は通常の2素材レシピに限り、他の選択素材1枚のtagでregistry候補を絞り、残り1枠のtagを代用して照合する。複数候補があれば `recipeId` で選び、実際の `catalyst` を含まないレシピに溶媒で触媒を代用した場合は割引しない。特殊レシピでは代用しない。カード数・所有者・領域など選択自体が不正ならactionを拒否するが、正当な素材選択でregistry候補がない場合は通常の合成失敗として2ブロックを得る。`recipeId` を指定する場合は候補に含まれる値でなければならない。

合成やカードコピーなど、戦闘中に新規カードインスタンスを作る効果には、battle state に保存する単調増加の `generatedCardSequence` を割り当て、1から始まる番号を割り当て順に使って `generated:<sequence>` をインスタンスIDとする。`generated:` は生成カード専用の予約名前空間とし、初期デッキのIDには使わない。エンジンが番号とIDを決め、クライアント入力では受け取らない。初期デッキ構築とカード生成の上限は、記録済みの `(definitionId, definitionVersion)` で定義を解決して、その `deckLimit` を使う。同じ組の既存カードを含む全4領域の合計で判定し、数値の `deckLimit` を超える生成は許可しない。`deckLimit: null` はその定義に個別の枚数上限を設けないことを意味し、全4領域の同じ組を何枚でも生成できる。カード生成後に数値上限を超える合成レシピは失敗扱いとし、素材を廃棄して2ブロックを得る。コピー先の数値上限に達している `偽の切り札` はコピーだけを行わず、生成連番も進めない。コピーは元カードと同じ `definitionId` / `definitionVersion` を持つ独立したインスタンスとして作り、カードを使ったプレイヤーの手札に加える。コピーの一時性が指定される場合も通常のカードゾーンに置き、効果に記された期限で廃棄領域へ移す。battle state の各カードインスタンスは `id`・`definitionId`・`definitionVersion`・`costModifier` を保持し、移動やsnapshot復元でも値を維持する。`CARD_CREATED` イベントには所有者・生成ID・カード定義IDとversion・生成元カードID・追加先・初期コスト修正値・`visibility` を含める。生成カードが非公開の手札へ加わる場合は `ownerOnly`、カード効果が生成を全員へ公開する場合は `allPlayers` とし、プレイヤー向けイベント/snapshot/replayは可視性に従って秘匿する。触媒による割引は完成品のカード定義を変更せず、その生成インスタンスに永続する `costModifier: -1` として記録し、そのカードが戦闘を離れるまで有効とする。実コストは固定コスト修正があればその値（0未満なら0）、なければ `max(0, 定義コスト + costModifier + 有効な一時修正の合計)` とする。適用と失効はイベントに記録し、snapshot/replayでも同じ値を復元する。廃棄領域への全ての移動は前述の `CARD_EXHAUSTED` で記録する。生成番号とイベントをbattle state・snapshot・replayに含め、同じaction列から同じIDと結果を再生成して検証する。

各一時コスト修正は対象カードID・発生元カードID・加算値または固定コスト・失効ターンを持ち、`CARD_COST_MODIFIER_APPLIED` と `CARD_COST_MODIFIER_EXPIRED` に記録する。`追い風` はこのカードを使った後に使う最初のカードへ `-1` を適用し、未使用の場合は現在のターン終了時にpendingEffectを消費して1枚引き、消費済みなら追加ドローしない。`手品師の袖` は選んだカードのコストを同じ期限で0に固定する。固定コストがあれば加算修正より優先し、なければ永続修正と有効な加算修正を合計する。最終コストは0未満にならない。

「賢者の石」はカードではなく、プレイヤーの戦闘状態に記録する錬成段階（0〜3）として扱う。`賢者の石のレシピ` が成功し、現在の段階が0の場合だけ段階1にする。通常レシピの成功では進まず、段階1以上で再び特殊レシピが成功しても段階を後退させない。第一錬成で段階3にし、完成カードは段階3で特殊勝利を成立させる。錬成段階はカード領域に置かず、戦闘状態とリプレイに保持する。

| カード | レアリティ / コスト | 効果案 | ID | version | type | deckLimit |
| --- | --- | --- | --- | --- | --- | --- |
| 赤の試薬 | N / 0・素材 | 2ダメージ。触媒と合成すると「火薬瓶」を作れる。 | alchemist_001 | 1.0.0 | ATTACK | 3 |
| 青の試薬 | N / 0・素材 | 3ブロック。触媒と合成すると「結晶薬」を作れる。 | alchemist_002 | 1.0.0 | SKILL | 3 |
| 触媒 | N / 1・素材 | 1枚引く。通常レシピで合成に使うと、完成品インスタンスのコストを1下げる。 | alchemist_003 | 1.0.0 | SKILL | 3 |
| 白の試薬 | N / 1・素材 | 2回復。賢者の石のレシピに使える。 | alchemist_004 | 1.0.0 | SKILL | 3 |
| 火薬瓶 | R / 1 | 7ダメージ。赤の試薬と触媒を合成して作る。 | alchemist_005 | 1.0.0 | ATTACK | 3 |
| 結晶薬 | R / 1 | 8ブロックを得る。青の試薬と触媒を合成して作る。 | alchemist_006 | 1.0.0 | SKILL | 3 |
| 変成液 | R / 1 | 手札のカード1枚を廃棄し、そのカードの現在の実コスト以下のカードを山札全体から所有者だけが検索する。検索で確認した各カードを、カードインスタンスの既存 `visibility` を引き継いだ `DECK_CARD_REVEALED` で記録する。1枚を選び、確認イベントの直後に同じ `visibility` の `CARD_MOVED` で手札へ移す。所有者だけの検索は非公開カードを新たに公開しないが、既に `allPlayers` のカードを再び秘匿しない。条件に合うカードがなければ手札へ加えない。選択後は残りの山札があれば `DECK_SHUFFLED`（`reason: ALCHEMY_TRANSFORM`）で切り直す。検索開始時に山札が空なら通常の山札補充規則を適用する。 | alchemist_007 | 1.0.0 | SKILL | 3 |
| 不安定な合成 | R / 0 | 素材2枚を合成する。対応するレシピがあれば完成品を作る。なければ合成失敗として2ブロックを得る。 | alchemist_008 | 1.0.0 | SKILL | 3 |
| 実験記録 | R / 1 | この戦闘中に合成した回数だけ、1枚引く（最大3枚）。 | alchemist_009 | 1.0.0 | POWER | 3 |
| 賢者の触媒 | SR / 2 | 次に行う合成では、素材を選ぶ前に山札が空なら通常の山札補充規則を適用し、一番上を1枚公開する（`DECK_CARD_REVEALED`、`visibility: allPlayers`）。素材なら直後に `CARD_MOVED`（`visibility: allPlayers`）で手札へ移す。素材でなければ位置を変えず何も加えない。補充後も山札が空なら何もしない。完成品のコストは変わらない。 | alchemist_010 | 1.0.0 | POWER | 3 |
| 完全反応 | SR / 2 | 特殊合成：赤・青・白の色付き試薬から3枚選んで廃棄領域へ移す。通常レシピ照合や合成失敗判定は行わず、赤1枚ごとに対戦相手へ4ダメージ、青1枚ごとに4ブロック、白1枚ごとに4回復を得る。同色が複数なら、その色の効果を枚数分重ねる。 | alchemist_011 | 1.0.0 | ATTACK | 3 |
| 賢者の触媒核 | UR / 3 | この戦闘中、素材を合成するたび1エネルギーを得る（ターン1回）。エネルギー獲得に上限は設けない。 | alchemist_012 | 1.0.0 | POWER | 3 |
| 大錬成 | UR / 3 | 特殊合成：手札の素材をすべて廃棄領域へ移す。通常レシピ照合や合成失敗判定は行わず、素材1枚につき対戦相手へ4ダメージと4ブロックを得る。 | alchemist_013 | 1.0.0 | ATTACK | 3 |
| 万能溶媒 | R / 1・素材 | 1枚引く。合成に使うと、完成品に必要な素材の種類1つを代用する（照合・廃棄の詳細は合成規則を参照）。 | alchemist_014 | 1.0.0 | SKILL | 3 |
| 賢者の石のレシピ | SR / 2 | 特殊レシピ：手札または捨て札から素材を3枚選ぶ。赤・青・白の試薬が各1枚なら成功し、廃棄領域へ移す。錬成段階が0なら段階1にする。段階1以上なら現在段階を維持する。それ以外の組み合わせ（万能溶媒を含む場合も含む）では素材3枚を廃棄領域へ移し、通常の合成失敗として2ブロックを得る（錬成段階は進まない）。この特殊レシピでは万能溶媒による代用を許可しない。 | alchemist_015 | 1.0.0 | SKILL | 3 |
| 賢者の石・第一錬成 | SR / 2 | 錬成段階が1なら段階を3にする。条件未達なら使用できない。 | alchemist_016 | 1.0.0 | SKILL | 3 |
| 賢者の石・完成 | UR / 3 | 錬成段階が3なら、このカードを使用して戦闘に勝利する。条件未達なら使用できない。 | alchemist_017 | 1.0.0 | SKILL | 3 |

## 狩人：装填と発射

矢を装填しておき、弓カードでまとめて発射する。装填キューを見せる UI と、矢の解決順を仕様化できると遊びやすい。[新規：装填]

「矢」カードは直接プレイできない。装填効果では手札の矢を選んでコストを支払い、そのカードインスタンスは手札に置いたまま、所有者別の `arrowQueue` に `cardInstanceId` を順に追加する。装填中の矢はキュー以外からは選択・使用できず、カード移動や廃棄を行う効果が明示的に対象にした場合はキューからも除く。発射時はキュー先頭の矢を一時的にロックして効果を解決し、解決後にキューから取り除いて手札から捨て札へ移す。このとき `ARROW_REMOVED` でQueue参照の削除を記録し、続けて `CARD_DISCARDED`（`from: hand`、`to: discard`）でカード領域の移動を記録する。`ARROW_FIRED` は発射と効果解決を記録するイベントであり、カード領域の移動イベントを兼ねない。`ARROW_FIRED` で矢の識別情報を全員に公開した後の `CARD_DISCARDED` も `visibility: allPlayers` とする。複数本の発射中にキューが空になったらそこで終了する。カードは常に既存のカード領域のどれか1つに属し、Queueは順序付きID参照だけを保持する。`ARROW_LOADED` / `ARROW_FIRED` / `ARROW_REMOVED` イベントに所有者・カードID・移動前後のQueue順・理由・`visibility` を記録し、Queue順もbattle state・snapshot・replayへ保存する。装填中の矢IDは `ARROW_LOADED` / `ARROW_REMOVED` とaction choicesで所有者だけに見せ、発射時の `ARROW_FIRED` は全員に見せる。

`ARROW_FIRED` の権威recordと所有者向け投影には、発射した矢IDと発射前後の完全なQueue順を保存する。相手向け投影は `visibility: allPlayers` の発射結果を示せるが、payloadからQueue内の全ID列・順序・indexを除去し、発射した矢の公開情報と `queueCountBefore` / `queueCountAfter` だけを残す。`ARROW_LOADED` / `ARROW_REMOVED` は引き続き所有者だけにIDと順序を示す。validatorは相手向け `ARROW_FIRED` 投影に未発射矢のIDまたはQueue順が残るreplayを拒否する。

action境界のbattle state、snapshot、replayでは、各ownerの `arrowQueue` の全IDがそのownerの手札にある `arrow` キーワード付きカードを1枚ずつ参照しなければならない。IDは同一queue内・別ownerのqueue間を含め重複不可とし、相手のカードやdrawPile / discard / exhaustのカードを参照したstateは不正とする。カードを別領域へ移す・廃棄する前に対応するqueue参照を同じ解決内で除き、イベント順にも反映する。snapshot/replay validatorはカード領域の一意性とは別に、このqueue参照整合性を検証する。発射中の一時ロックはaction内部だけで保持し、永続snapshotには残さない。

プレイヤーが選んだ矢は action の `choices` にある `CARD_INSTANCES.cardInstanceIds` 順に処理する。指定枚数の上限を超える選択は不正 action とし、装填時の矢ID選択は所有者だけに見せる。エネルギー不足の矢は装填せず手札に残して次の選択矢を判定する。矢継ぎの山札選択も同じchoicesに記録し、所有者以外には選択IDを伏せる。カードの切り直しには戦闘で共有する `SeededRandom v1` を使う。文字列seedはUnicodeコードポイント列として処理し、初期hashを `0x811c9dc5` として各コードポイントごとに `hash = imul(hash XOR codePoint, 0x01000193) modulo 2^32` を行う。共有battle seedは `BattleState.seed` / `Replay.seed` とも文字列だけを許可し、数値入力は暗黙に文字列化せず拒否する。文字列ハッシュの結果を符号なし32-bitの初期PRNG状態とする。`next()` はMulberry32で、`state = (state + 0x6d2b79f5) modulo 2^32` の後 `t = state` とし、`t = imul(t XOR (t >>> 15), t OR 1)`、`t = t XOR (t + imul(t XOR (t >>> 7), t OR 61))`、返り値をunsigned `(t XOR (t >>> 14)) / 2^32` とする。乗算は32-bit整数演算、`>>>` は符号なし右シフトとする。降順 Fisher–Yates（`i = n - 1` から `1`、`j = floor(next() * (i + 1))` として `i` と `j` を交換）で行う。PRNG状態と切り直し後のカードID順はサーバー権威のbattle state・snapshot・replayに保存し、切り直しイベントとreplayのプレイヤー向け表示は山札所有者にだけID順を見せる。アルゴリズムまたは乱数系列を変更するときはengine/rules versionを更新する。

| カード | レアリティ / コスト | 効果案 | ID | version | type | deckLimit |
| --- | --- | --- | --- | --- | --- | --- |
| 狩人の弓 | N / 1 | 3ブロックを得て、矢を1枚装填する。 | hunter_001 | 1.0.0 | SKILL | 3 |
| 矢継ぎ | N / 1 | 山札が空なら通常の山札補充規則を先に適用する。山札を所有者にだけ公開して検索し、検索で確認した各カードを、カードインスタンスの既存 `visibility` を引き継いだ `DECK_CARD_REVEALED` で記録する。矢1枚を選び、確認イベントの直後に同じ `visibility` の `CARD_MOVED` で手札へ移す。所有者だけの検索は非公開カードを新たに公開しないが、既に `allPlayers` のカードを再び秘匿しない。矢が見つからなければ何も手札へ移さない。検索後、山札にカードが残っていれば `DECK_SHUFFLED`（`reason: HUNTER_ARROW_SEARCH`）で切り直す。 | hunter_002 | 1.0.0 | SKILL | 3 |
| 毒矢 | N / 1・矢 | 4ダメージを与え、毒2を付与する。状態異常案。 | hunter_003 | 1.0.0 | ATTACK | 3 |
| 速射 | R / 1 | 装填キューの先頭2本を発射する。各矢のダメージは-1。 | hunter_004 | 1.0.0 | ATTACK | 3 |
| 貫通矢 | R / 2・矢 | 6ダメージ。敵のブロックを無視する。 | hunter_005 | 1.0.0 | ATTACK | 3 |
| 目印の矢 | R / 1・矢 | 3ダメージ。次に受ける攻撃ダメージを4増やす。 | hunter_006 | 1.0.0 | REACTION | 3 |
| 仕込み罠 | R / 1 | 次に敵が攻撃したとき、6ダメージを与えてその攻撃を3減らす。 | hunter_007 | 1.0.0 | REACTION | 3 |
| 矢羽の改良 | R / 1 | 装填中の矢1本を `cardInstanceId` で選ぶ。その矢はこの戦闘中2ダメージ増える。 | hunter_008 | 1.0.0 | POWER | 3 |
| 連装弓 | SR / 2 | 3ブロックを得て、矢を最大3枚装填する。選択順にコストを支払い、エネルギーが足りない矢は装填せずに残す。 | hunter_009 | 1.0.0 | SKILL | 3 |
| 追跡者 | SR / 2 | 装填キューの矢をすべて発射する。発射した矢1本につき2ブロックを得る。 | hunter_010 | 1.0.0 | ATTACK | 3 |
| 星穿ち | SR / 3・矢 | 装填キューから発射したとき10ダメージ。ダメージ解決後、戦闘が継続していれば、ロック中の自身だけを仮想的に除いたキューが3本以上あるか判定する。成立時は追加発射を1回予約する。自身の `ARROW_REMOVED`、`CARD_DISCARDED` をこの順で記録した後に予約を実行し、残ったキューの先頭1本を通常発射する。仮想除外ではstateを変更せずイベントも出さない。終端成立時は追加発射しない。 | hunter_011 | 1.0.0 | ATTACK | 3 |
| 百矢の雨 | UR / 3 | 解決開始時のarrowQueueを順序付きID列としてsnapshotする。snapshot内の矢を通常発射順にすべて解決する。星穿ちなどによる追加発射は通常発射として解決し、既に発射済みのsnapshot項目は再度通常発射しない。snapshotにない矢は追加発射・再発動に含めない。通常発射が全て終わった後、snapshot内で発射された各矢の効果だけをsnapshot順に `ARROW_REPEATED` で1回ずつ再解決する。再解決は矢をキューから発射・除去せず、星穿ちの追加発射など他の矢発射triggerを誘発しない。追加コストやカード領域の移動は行わない。 | hunter_012 | 1.0.0 | ATTACK | 3 |

`ARROW_REPEATED` は元の矢を再発射せず効果だけを再解決するイベントとする。payloadに `ownerPlayerId`、イベント全体で一意な連番 `sequence`、百矢の雨の `sourceCardInstanceId` / `sourceDefinitionId` / `sourceDefinitionVersion`、元の矢の `cardInstanceId` / `definitionId` / `definitionVersion`、通常発射時に確定した `cardModifierSnapshot`、`arrowQueueSnapshotIndex`、`repeatOrdinal: 1`、`visibility: allPlayers` を含める。通常発射と再解決は各効果解決直前に実際の順で記録し、replayは同じ矢定義versionとmodifier値を使って効果を再計算する。再解決はカード移動・コスト支払い・発射triggerを起こさない。

## トリックスター：手札と山札を操る

引き直し、仕込み、相手の予定への割り込みを中心に、運任せになりすぎない選択肢を作る。

| カード | レアリティ / コスト | 効果案 | ID | version | type | deckLimit |
| --- | --- | --- | --- | --- | --- | --- |
| 早業 | N / 0 | 手札1枚を山札の一番下に置き、1枚引く。移動は `CARD_MOVED` に記録する。山札から引く処理には山札補充規則を適用する。 | trickster_001 | 1.0.0 | SKILL | 3 |
| 袖の一枚 | N / 1 | 1枚引く。引いたカードがコスト1以下なら1ブロックを得る。 | trickster_002 | 1.0.0 | SKILL | 3 |
| 目くらまし | N / 1 | 3ダメージを与える。敵の次の攻撃を2減らす。 | trickster_003 | 1.0.0 | REACTION | 3 |
| すり替え | R / 1 | 手札1枚を捨て、山札から2枚引く。 | trickster_004 | 1.0.0 | SKILL | 3 |
| 予告状 | R / 1 | 敵の次のターン開始時、敵は2ダメージを受ける。自分は1枚引く。 | trickster_005 | 1.0.0 | POWER | 3 |
| 逃げ足 | R / 1 | 5ブロックを得る。使用時にarrowQueueに含まれない手札1枚を選ぶ。このターン終了時にそのカードが手札にあり、かつ `arrowQueue` に含まれない場合だけ `CARD_MOVED` で山札の一番上へ移す。選択後に装填された場合は移動せず失効する。移動先のカードIDは `PLAY_CARD.choices` の `CARD_INSTANCES.cardInstanceIds` に記録する。 | trickster_006 | 1.0.0 | POWER | 3 |
| 偽の切り札 | R / 2 | 手札からカード1枚のコピーを作り、手札に加える。コピーはターン終了時に廃棄される。 | trickster_007 | 1.0.0 | POWER | 3 |
| 仕込み直し | R / 1 | 捨て札からカード1枚を選び、`CARD_MOVED` で山札の一番上に置く。 | trickster_008 | 1.0.0 | SKILL | 3 |
| 時間泥棒 | SR / 2 | 6ダメージ。敵が次にカードを使うたび、そのコストを1増やす（最大2回）。 | trickster_009 | 1.0.0 | REACTION | 3 |
| 手品師の袖 | SR / 2 | 3枚引く。ドロー完了後の手札全体を候補として所有者だけに `CARD_CHOICE_REQUESTED` を送り、`PENDING_CARD_CHOICE` で停止する。`SUBMIT_CARD_CHOICE` の `CARD` 選択で1枚を選び、そのコストをこのターン中0にする。候補が0枚なら選択要求を作らず、コスト固定を行わない。 | trickster_010 | 1.0.0 | SKILL | 3 |
| 予定変更 | SR / 1 | このターン、カードを引くたび1ブロックを得る。ターン終了時に2ダメージを受ける。 | trickster_011 | 1.0.0 | POWER | 3 |
| 大脱出 | UR / 3 | 解決時の手札枚数と手札順を記録する。手札中の装填済み矢をarrowQueueの順で `ARROW_REMOVED`（`visibility: ownerOnly`）に記録してキューから除き、その後、手札順に全カードを `CARD_MOVED`（`visibility: ownerOnly`）で山札へ戻す。山札を `DECK_SHUFFLED`（`reason: TRICKSTER_ESCAPE`）で切り直して記録した枚数を引き、引いたカード1枚につき2ブロックを得る。切り直し後のID順は山札所有者以外に公開しない。 | trickster_012 | 1.0.0 | SKILL | 3 |

## ニュートラル：どのデッキにも小さな工夫を

クラスの仕組みに依存しないカードを加え、ピック時の悩みとデッキ調整の幅を増やす。

| カード | レアリティ / コスト | 効果案 | ID | version | type | deckLimit |
| --- | --- | --- | --- | --- | --- | --- |
| 応急手当 | N / 1 | 4回復。 | neutral_001 | 1.0.0 | SKILL | 3 |
| 整理整頓 | N / 0 | 手札1枚を捨て、1枚引く。 | neutral_002 | 1.0.0 | SKILL | 3 |
| 旅人の護符 | N / 1 | 5ブロックを得る。 | neutral_003 | 1.0.0 | SKILL | 3 |
| 戦術の確認 | R / 1 | 山札が空なら通常の山札補充規則を先に適用する。山札の上から最大3枚（`min(3, 山札枚数)`）を所有者にだけ見せ、上から順にindex 0から、カードインスタンスの既存 `visibility` を引き継いだ `DECK_CARD_REVEALED` として記録する。見られるカードが0枚なら何もしない。1枚を選び、確認イベントの直後に同じ `visibility` の `CARD_MOVED` で手札へ移す。残りのカードは元の相対順を保って山札の下へ移し、各移動を同じ `visibility` の `CARD_MOVED` に記録する。所有者だけの検索は非公開カードを新たに公開しないが、既に `allPlayers` のカードを再び秘匿しない。選択IDはaction/replayでは所有者だけに見せる。 | neutral_004 | 1.0.0 | SKILL | 3 |
| 予備の食料 | R / 1 | 3回復。手札が2枚以下なら、さらに1枚引く。 | neutral_005 | 1.0.0 | SKILL | 3 |
| 古びた羅針盤 | R / 1 | 山札の上からカードを1枚全員に公開する（`DECK_CARD_REVEALED`、`visibility: allPlayers`）。そのカードのコスト分ブロックを得る（最大6）。 | neutral_006 | 1.0.0 | SKILL | 3 |
| 休息の心得 | SR / 2 | 6回復。次の自分のターン開始時、5ブロックを得る。 | neutral_007 | 1.0.0 | POWER | 3 |
| 追い風 | SR / 1 | このカードを使った後、同じターンに最初に使うカードのコストを1下げる。割引用pendingEffectが未消費のまま同ターンの `TURN_ENDED` を迎えた場合、その項目を消費して1枚引く。 | neutral_008 | 1.0.0 | POWER | 3 |
| 英雄の意志 | UR / 3 | HPが10以下なら、HPを10にして敵に10ダメージ。それ以外なら8回復する。 | neutral_009 | 1.0.0 | ATTACK | 3 |

## デッキ構築の方向性

カード案は全7系統で93枚（剣士12、守護者12、魔法使い19、錬金術師17、狩人12、トリックスター12、ニュートラル9）。すべてを一度に実装する前提ではなく、初期セットは別途選定する。

| ビルド | 主なカード群 | 楽しさの核 | 注意点 |
| --- | --- | --- | --- |
| 剣の連撃 | 剣気、連刃の型、二段斬り | 手札の順番を組み、連続使用で伸ばす | ドローとコスト回復が揃うと無限連鎖しやすい |
| 盾の反撃 | 盾の連携、報復の構え、盾打ち | 防御を攻撃と次ターンの資源に変える | ブロックの持ち越し量に上限が必要か検討 |
| 詠唱コンボ | 詠唱短縮、魔導書・連鎖、星辰落とし | 大技を準備し、短縮で相手の予想を崩す | 詠唱キューの進行を妨害する手段と UI が必要 |
| 合成エンジン | 素材、触媒、賢者の触媒 | 素材を温存するか合成するかの判断 | 合成レシピの見つけやすさ、素材事故を軽減 |
| 錬金術師の特殊勝利 | 異なる色の素材、賢者の石のレシピ、賢者の石・完成 | 素材を集めて複数段階の錬成を通す | レシピと完成札へのアクセス、素材を使う通常戦術との競合 |
| 魔法使いの特殊勝利 | 魔導書、焚書、勝利への願い、詠唱短縮 | 魔導書を犠牲にしながら長い詠唱を守り抜く | 詠唱の進み具合の可視化、詠唱妨害と短縮の上限 |
| 弓の連射 | 矢継ぎ、連装弓、追跡者 | 装填キューを作り、一気に発射する | キュー上限と発射順を明示 |
| 手札操作 | すり替え、仕込み直し、手品師の袖 | 引き直しと順序調整で最適手を作る | 0コスト連鎖と過剰なサーチを監視 |

## 実装・バランス検討メモ

1. まず通常カードを追加し、状態異常や合成などの新システムは独立した小さなセットとして段階導入する。
2. 「戦闘中永続」の累積効果は、重複時に加算するか上書きするかをカードごとに明記する。
3. ドロー、コスト回復、コスト0化、追加攻撃の組み合わせはループを生みやすい。1ターンの回数上限や対象範囲を検討する。
4. 毒・麻痺・詠唱・装填・合成はキーワードの意味と解決タイミングを先に定義し、カード文言を統一する。
5. 特殊キューを導入する場合、プレイヤーが現在値・順序・次の解決内容を確認できる UI が必要。
6. カードプールに加える初回セットは各アーキタイプの低レアリティ基盤を厚くし、高レアリティが揃わなくてもビルドが成立するようにする。
7. 特殊勝利は勝利条件判定としてエンジンが解決する。各効果の解決後、先にHPによる通常の勝敗を判定し、戦闘が続いている場合だけ特殊勝利を判定する。HPによる勝敗が成立したら残りの効果を止め、特殊勝利で上書きしない。
8. 魔法使いは進行度を相手にも見せ、ダメージで遅延させるなど応答機会を用意する。短縮効果の重ね掛けには1ターンの上限を設ける。
9. 錬金術師の錬成カウンターは戦闘中のみ有効とし、必要な色・素材・廃棄先を明示する。代用素材だけで全工程を完了できないよう、レシピ側に異なる色の実素材を最低1つ要求する案も検討する。
10. 詠唱短縮のように対象が複数あり得る効果は、対象を選ぶか優先順を明示する。
