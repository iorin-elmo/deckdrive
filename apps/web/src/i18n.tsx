import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react';
import {
  basicCardDefinitions,
  packCardDefinitions,
  type CardDefinition,
} from '@deck-drive/card-definitions';

import { useLocaleStore, type Locale } from './locale-store.js';

const resources = {
  en: {
    language: '🌐 Language',
    english: 'English',
    japanese: '日本語',
    settings: 'Settings',
    settingsEyebrow: 'PREFERENCES',
    settingsDescription: 'Choose the language shown throughout DeckDrive.',
    titleEyebrow: 'TACTICAL CARD BATTLES',
    titleDescription:
      'Build a precise deck, challenge a CPU rival, and study every decision from the arena.',
    developmentLogin: 'Development login',
    enterGame: 'Enter game',
    startDevelopment: 'Start in development',
    continue: 'Continue',
    exploreCards: 'Explore cards',
    navHome: 'Home',
    navCards: 'Cards',
    navDecks: 'Decks',
    navPacks: 'Packs',
    navMissions: 'Progress',
    navCpu: 'CPU',
    navSettings: 'Settings',
    signOut: 'Sign out',
    openNavigation: 'Open navigation',
    closeNavigation: 'Close navigation',
    primaryNavigation: 'Primary navigation',
    offlinePreview: 'Offline preview',
    loadingPlayer: 'Loading player',
    balancesLoading: 'Balances loading',
    titleHeadline: 'Read the field.\nShape the turn.',
    titleFooterCpu: 'CPU practice',
    titleFooterDecks: 'Deck workshop',
    titleFooterRules: 'Replay-ready rules',
    backToTitle: 'Back to title',
    developmentAccess: 'DEVELOPMENT ACCESS',
    enterArena: 'Enter the arena',
    developmentLoginDescription:
      'This placeholder is available only while the API runs in development mode.',
    email: 'Email',
    displayName: 'Display name',
    signInDevelopment: 'Sign in for development',
    homeEyebrow: 'COMMAND DECK',
    homeTitle: 'Home',
    homeDescription: 'Choose a lane, then make the next clean move.',
    nextPractice: 'NEXT PRACTICE',
    cpuArena: 'CPU arena',
    cpuArenaDescription:
      'Test the deck you know, choose a difficulty, and inspect the battle state after launch.',
    startCpuMatch: 'Start a CPU match',
    playerStatus: 'PLAYER STATUS',
    developmentProfile: 'Development profile',
    gems: 'Gems',
    exchange: 'Exchange',
    cardLibrary: 'Card library',
    cardLibraryDescription: 'Browse the available versioned card definitions.',
    deckWorkshop: 'Deck workshop',
    deckWorkshopDescription: 'Review and manage your saved decks.',
    cpuBattle: 'CPU battle',
    cpuBattleDescription: 'Launch the selected deck against one of four CPU difficulties.',
    open: 'Open',
    deckUnavailable: 'Deck information is unavailable.',
    loadingDecks: 'Loading decks.',
    deckReady: '{count} deck ready for review.',
    decksReady: '{count} decks ready for review.',
    reference: 'REFERENCE',
    cardLibraryTitle: 'Card library',
    cardLibraryDescriptionLong: 'Versioned definitions available to the current build.',
    searchCards: 'Search card name, class, or text',
    loadingCardLibrary: 'Loading card library',
    noMatchingCards: 'No cards match that search',
    noMatchingCardsDescription: 'Try a shorter name or clear the filter.',
    loadingCard: 'Loading card',
    cardNotFound: 'Card not found',
    returnToCardLibrary: 'Return to card library',
    cardDetail: 'CARD DETAIL',
    class: 'Class',
    type: 'Type',
    rarity: 'Rarity',
    version: 'Version',
    cost: 'Cost {count}',
    cpuPractice: 'CPU PRACTICE',
    setChallenge: 'Set the challenge',
    setChallengeDescription:
      'Choose a saved deck and a CPU profile. The server remains authoritative for match creation.',
    noReadyDecks: 'No 30-card decks available',
    noReadyDecksDescription: 'Build a valid 30-card deck before starting CPU practice.',
    buildDeck: 'Build a deck',
    deck: 'Deck',
    chooseDeck: 'Choose a deck',
    cpuDifficulty: 'CPU difficulty',
    creatingMatch: 'Creating match',
    enterCpuArena: 'Enter CPU arena',
    matchFormat: 'MATCH FORMAT',
    matchSetup: 'Match setup',
    matchSetupDescription:
      "The selected CPU profile is sent with match creation. The current API returns the initial state and does not execute CPU turns yet, so the profile does not alter this screen's state.",
    ownedDeckOnly: 'Owned deck only',
    serverInitialState: 'Server-created initial state',
    replayReadyState: 'Replay-ready match state',
    loadingBattleState: 'Loading battle state',
    matchStateUnavailable: 'Match state is not available',
    matchStateUnavailableDescription:
      'This match has no final state yet. Return to the CPU setup to launch a fresh practice match.',
    persistedState: 'PERSISTED STATE',
    turn: 'Turn {count} - {phase}',
    battleState: 'Battle state',
    opponent: 'Opponent',
    you: 'You',
    battleField: 'BATTLE FIELD',
    battleFieldDescription:
      'Server state is displayed here. Player action controls arrive with the multiplayer battle protocol.',
    hand: 'Hand',
    cardsCount: '{count} cards',
    noCardsInHand: 'No cards in hand',
    noCardsInHandDescription: 'The initial state did not draw any cards.',
    card: 'CARD',
    instance: 'Instance {id}',
    viewResult: 'View result',
    startAnother: 'Start another',
    block: 'Block',
    energy: 'Energy',
    statuses: 'Statuses',
    packVault: 'PACK VAULT',
    openPacks: 'Open packs',
    packDescription:
      'Purchases spend Gems atomically. Fourth and later copies convert to Exchange Points.',
    loadingPacks: 'Loading pack catalogue',
    standard: 'STANDARD',
    limited: '{period} LIMITED',
    gemsCost: '{count} Gems',
    purchaseLimit: '{count} purchase per {period}.',
    openPack: 'Open pack',
    opened: 'OPENED',
    cardsReceived: '{count} cards received',
    packResult: 'Spent {gems} Gems. Duplicate conversion: {points} Exchange Points.',
    cardRarity: '{rarity} card',
    workshop: 'WORKSHOP',
    decks: 'Decks',
    decksDescription: 'Review your saved lists before taking one into the CPU arena.',
    noDecks: 'No decks yet',
    noDecksDescription: 'Build a valid 30-card deck from your collection to begin CPU practice.',
    loadingDeck: 'Loading deck',
    deckNotFound: 'Deck not found',
    returnToDecks: 'Return to decks',
    deckDetail: 'DECK WORKSHOP',
    savedDeck: 'SAVED DECK',
    deckSummary: '{count} cards - data version {version}',
    deckTileSummary: '{count} distinct card versions - {version}',
    copies: 'Copies',
    readyCheck: 'READY CHECK',
    cardsOutOfThirty: '/ 30 cards',
    deckReadyDescription:
      "CPU match creation uses this saved deck and the game engine's legal-action rules.",
    useForCpu: 'Use for CPU',
    editDeck: 'Edit deck',
    deckBuilder: 'DECK BUILDER',
    editDeckName: 'Edit {name}',
    deckBuilderDescription: 'Choose owned card versions, then save an exact 30-card list.',
    deckName: 'Deck name',
    newDeck: 'New deck',
    quantityDescription: "Each quantity is limited by the card's copy limit and your collection.",
    savingDeck: 'Saving deck',
    createDeck: 'Create deck',
    saveDeck: 'Save deck',
    owned: 'Owned',
    removeCard: 'Remove {name}',
    cardCopies: '{name} copies',
    addCard: 'Add {name}',
    noCollectionCards: 'No cards in your collection',
    noCollectionCardsDescription:
      'This development player has no cards available for a 30-card deck.',
    cardDataUnavailable: 'Card data is not available',
    loadingResult: 'Loading result',
    matchResult: 'MATCH RESULT',
    resultDescription: 'The server owns results. This view only renders persisted match data.',
    battleComplete: 'Battle complete',
    battleAbandoned: 'Battle abandoned',
    battleInProgress: 'Battle in progress',
    noFinalResult: 'No final result yet',
    abandonedDescription: 'This match was abandoned before a final result was persisted.',
    noFinalResultDescription: 'The match is still in progress or has no persisted final state.',
    invalidBattleState: 'Invalid battle state',
    invalidBattleStateDescription: 'The server response did not include two players.',
    working: 'Working with the arena.',
    unableToLoad: 'Unable to load this view',
    tryAgain: 'Try again',
    openOfflinePreview: 'Open offline preview',
    apiUnavailable: 'The API is not running at the configured address.',
    requestFailed: 'The API proxy could not reach a running server.',
    requestRejected: 'The API rejected this request: {code} ({status}).',
    serviceUnavailable: 'The service could not be reached.',
    retryAdvice: 'Check that the API is running, then try again.',
    sessionAdvice: 'Review the request details and your session, then try again.',
    missionHub: 'Missions & progression',
    missionHubDescription: 'Server time governs mission progress and reward claims.',
    loginRewards: 'Login rewards',
    loginRewardDescription: 'Claim one reward per day on a seven-day cycle.',
    claimLogin: 'Claim login reward',
    claimedToday: 'Today’s reward is claimed',
    level: 'Level',
    experience: 'Experience',
    missions: 'Missions',
    claim: 'Claim',
    claimed: 'Claimed',
    inProgress: 'In progress',
    notOwned: 'Not owned',
    cosmetics: 'Cosmetics',
    cosmeticsDescription: 'Cosmetics change presentation only and never affect battle performance.',
    noCosmetics: 'No cosmetics are owned yet.',
  },
  ja: {
    navMissions: 'ミッション',
    missionHub: 'ミッションと進行状況',
    missionHubDescription: 'サーバー時刻を基準に、進捗と報酬を安全に管理します。',
    loginRewards: 'ログインボーナス',
    loginRewardDescription: '1日1回、7日サイクルで報酬を受け取れます。',
    claimLogin: 'ログイン報酬を受け取る',
    claimedToday: '本日の報酬は受取済みです',
    level: 'レベル',
    experience: '経験値',
    missions: 'ミッション',
    claim: '受け取る',
    claimed: '受取済み',
    inProgress: '進行中',
    notOwned: '未所有',
    cosmetics: 'コスメティック',
    cosmeticsDescription: 'コスメティックは見た目のみを変更し、戦闘性能に影響しません。',
    noCosmetics: '所有コスメティックはまだありません。',
    language: '🌐 言語',
    english: 'English',
    japanese: '日本語',
    settings: '設定',
    settingsEyebrow: '環境設定',
    settingsDescription: 'DeckDrive全体で表示する言語を選択します。',
    titleEyebrow: '戦術カードバトル',
    titleDescription: 'デッキを組み、CPUライバルに挑み、アリーナでの判断を振り返りましょう。',
    developmentLogin: '開発用ログイン',
    enterGame: 'ゲームを始める',
    startDevelopment: '開発モードで始める',
    continue: '続ける',
    exploreCards: 'カードを見る',
    navHome: 'ホーム',
    navCards: 'カード',
    navDecks: 'デッキ',
    navPacks: 'パック',
    navCpu: 'CPU',
    navSettings: '設定',
    signOut: 'サインアウト',
    openNavigation: 'ナビゲーションを開く',
    closeNavigation: 'ナビゲーションを閉じる',
    primaryNavigation: 'メインナビゲーション',
    offlinePreview: 'オフラインプレビュー',
    loadingPlayer: 'プレイヤーを読み込み中',
    balancesLoading: '残高を読み込み中',
    titleHeadline: '戦況を読む。\nこのターンを形づくる。',
    titleFooterCpu: 'CPU練習',
    titleFooterDecks: 'デッキ工房',
    titleFooterRules: 'リプレイ対応ルール',
    backToTitle: 'タイトルへ戻る',
    developmentAccess: '開発用アクセス',
    enterArena: 'アリーナへ入る',
    developmentLoginDescription:
      'この仮ログインは、APIが開発モードで動作している場合にのみ利用できます。',
    email: 'メールアドレス',
    displayName: '表示名',
    signInDevelopment: '開発用にサインイン',
    homeEyebrow: 'コマンドデッキ',
    homeTitle: 'ホーム',
    homeDescription: '行き先を選び、次の一手を打ちましょう。',
    nextPractice: '次の練習',
    cpuArena: 'CPUアリーナ',
    cpuArenaDescription: '使い慣れたデッキで難易度を選び、開始後の対戦状態を確認できます。',
    startCpuMatch: 'CPU対戦を始める',
    playerStatus: 'プレイヤー情報',
    developmentProfile: '開発用プロフィール',
    gems: 'ジェム',
    exchange: '交換ポイント',
    cardLibrary: 'カードライブラリ',
    cardLibraryDescription: '利用できるバージョン付きカード定義を確認します。',
    deckWorkshop: 'デッキ工房',
    deckWorkshopDescription: '保存済みデッキを確認・管理します。',
    cpuBattle: 'CPU対戦',
    cpuBattleDescription: '選んだデッキで4段階のCPU難易度に挑戦します。',
    open: '開く',
    deckUnavailable: 'デッキ情報を取得できません。',
    loadingDecks: 'デッキを読み込み中です。',
    deckReady: '{count}個のデッキを確認できます。',
    decksReady: '{count}個のデッキを確認できます。',
    reference: 'リファレンス',
    cardLibraryTitle: 'カードライブラリ',
    cardLibraryDescriptionLong: '現在のビルドで利用できるバージョン付きカード定義です。',
    searchCards: 'カード名、クラス、効果文で検索',
    loadingCardLibrary: 'カードライブラリを読み込み中',
    noMatchingCards: '該当するカードはありません',
    noMatchingCardsDescription: '短い名前で検索するか、フィルターを解除してください。',
    loadingCard: 'カードを読み込み中',
    cardNotFound: 'カードが見つかりません',
    returnToCardLibrary: 'カードライブラリに戻る',
    cardDetail: 'カード詳細',
    class: 'クラス',
    type: '種別',
    rarity: 'レアリティ',
    version: 'バージョン',
    cost: 'コスト {count}',
    cpuPractice: 'CPU練習',
    setChallenge: '対戦を設定',
    setChallengeDescription:
      '保存済みデッキとCPUプロフィールを選びます。対戦作成はサーバーが管理します。',
    noReadyDecks: '30枚デッキがありません',
    noReadyDecksDescription: 'CPU練習を始めるには、有効な30枚デッキを作成してください。',
    buildDeck: 'デッキを作る',
    deck: 'デッキ',
    chooseDeck: 'デッキを選ぶ',
    cpuDifficulty: 'CPU難易度',
    creatingMatch: '対戦を作成中',
    enterCpuArena: 'CPUアリーナへ入る',
    matchFormat: '対戦形式',
    matchSetup: '対戦設定',
    matchSetupDescription:
      '選択したCPUプロフィールは対戦作成時に送信されます。現在のAPIは初期状態を返すのみで、CPUターンはまだ実行しないため、プロフィールでこの画面の状態は変わりません。',
    ownedDeckOnly: '所持デッキのみ',
    serverInitialState: 'サーバー生成の初期状態',
    replayReadyState: 'リプレイ対応の対戦状態',
    loadingBattleState: '対戦状態を読み込み中',
    matchStateUnavailable: '対戦状態を取得できません',
    matchStateUnavailableDescription:
      'この対戦にはまだ最終状態がありません。CPU設定に戻って新しい練習対戦を開始してください。',
    persistedState: '保存済み状態',
    turn: 'ターン {count} - {phase}',
    battleState: '対戦状態',
    opponent: '対戦相手',
    you: 'あなた',
    battleField: '戦場',
    battleFieldDescription:
      'ここにはサーバーの状態を表示します。プレイヤー操作はマルチプレイヤー対戦プロトコルとともに提供されます。',
    hand: '手札',
    cardsCount: '{count}枚',
    noCardsInHand: '手札にカードがありません',
    noCardsInHandDescription: '初期状態でカードは引かれていません。',
    card: 'カード',
    instance: 'インスタンス {id}',
    viewResult: '結果を見る',
    startAnother: 'もう一度始める',
    block: 'ブロック',
    energy: 'エナジー',
    statuses: '状態',
    packVault: 'パック保管庫',
    openPacks: 'パックを開ける',
    packDescription:
      '購入時にジェムを原子的に消費します。4枚目以降の重複カードは交換ポイントに変換されます。',
    loadingPacks: 'パックカタログを読み込み中',
    standard: '通常',
    limited: '{period}限定',
    gemsCost: '{count}ジェム',
    purchaseLimit: '{period}あたり{count}回購入できます。',
    openPack: 'パックを開ける',
    opened: '開封結果',
    cardsReceived: '{count}枚のカードを獲得',
    packResult: '{gems}ジェム消費しました。重複変換: {points}交換ポイント。',
    cardRarity: '{rarity}カード',
    workshop: '工房',
    decks: 'デッキ',
    decksDescription: 'CPUアリーナに持ち込む前に、保存済みのデッキを確認します。',
    noDecks: 'デッキがありません',
    noDecksDescription: 'CPU練習を始めるには、コレクションから有効な30枚デッキを作成してください。',
    loadingDeck: 'デッキを読み込み中',
    deckNotFound: 'デッキが見つかりません',
    returnToDecks: 'デッキ一覧に戻る',
    deckDetail: 'デッキ工房',
    savedDeck: '保存済みデッキ',
    deckSummary: '{count}枚 - データバージョン {version}',
    deckTileSummary: '異なるカードバージョン {count}種 - {version}',
    copies: '枚数',
    readyCheck: '準備確認',
    cardsOutOfThirty: '/ 30枚',
    deckReadyDescription:
      'CPU対戦の作成では、この保存済みデッキとゲームエンジンの有効アクション規則を使用します。',
    useForCpu: 'CPUで使う',
    editDeck: 'デッキを編集',
    deckBuilder: 'デッキ作成',
    editDeckName: '{name}を編集',
    deckBuilderDescription: '所持カードのバージョンを選び、正確に30枚のリストを保存します。',
    deckName: 'デッキ名',
    newDeck: '新しいデッキ',
    quantityDescription: '各枚数はカードのコピー上限と所持数で制限されます。',
    savingDeck: 'デッキを保存中',
    createDeck: 'デッキを作成',
    saveDeck: 'デッキを保存',
    owned: '所持数',
    removeCard: '{name}を減らす',
    cardCopies: '{name}の枚数',
    addCard: '{name}を増やす',
    noCollectionCards: 'コレクションにカードがありません',
    noCollectionCardsDescription:
      'この開発用プレイヤーには、30枚デッキに使えるカードがありません。',
    cardDataUnavailable: 'カードデータを取得できません',
    loadingResult: '結果を読み込み中',
    matchResult: '対戦結果',
    resultDescription:
      '結果はサーバーが管理します。この画面では保存済みの対戦データのみを表示します。',
    battleComplete: '対戦完了',
    battleAbandoned: '対戦は中断されました',
    battleInProgress: '対戦進行中',
    noFinalResult: '最終結果はまだありません',
    abandonedDescription: '最終結果が保存される前に、この対戦は中断されました。',
    noFinalResultDescription: '対戦は進行中か、保存済みの最終状態がありません。',
    invalidBattleState: '対戦状態が不正です',
    invalidBattleStateDescription: 'サーバーの応答に2人のプレイヤーが含まれていません。',
    working: 'アリーナを処理中です。',
    unableToLoad: 'この画面を読み込めません',
    tryAgain: '再試行',
    openOfflinePreview: 'オフラインプレビューを開く',
    apiUnavailable: '設定されたアドレスでAPIが起動していません。',
    requestFailed: 'APIプロキシが実行中のサーバーに接続できません。',
    requestRejected: 'APIがこのリクエストを拒否しました: {code} ({status})。',
    serviceUnavailable: 'サービスに接続できません。',
    retryAdvice: 'APIが起動していることを確認して、もう一度試してください。',
    sessionAdvice: 'リクエスト内容とセッションを確認して、もう一度試してください。',
  },
} as const;

type TranslationKey = keyof (typeof resources)['en'];

interface I18nContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <I18nContext.Provider value={{ locale, setLocale, t: (key) => resources[locale][key] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (value === null) throw new Error('useI18n must be used inside I18nProvider.');
  return value;
}

const localizedCardText: Readonly<Record<Locale, Readonly<Record<string, CardText>>>> = {
  en: {},
  ja: {
    sword_strike: { name: '一閃', description: '敵に6ダメージを与える。' },
    guardian_guard: { name: '守り', description: 'ブロックを5得る。' },
    neutral_insight: { name: '洞察', description: 'カードを1枚引く。' },
    sword_lunge: { name: '突撃', description: '敵に4ダメージを与える。' },
    sword_riposte: { name: '返し技', description: '敵に5ダメージを与える。' },
    guardian_bulwark: { name: '城壁', description: 'ブロックを7得る。' },
    guardian_mend: { name: '手当て', description: 'HPを3回復する。' },
    neutral_focus: { name: '集中', description: 'カードを1枚引く。' },
    neutral_spark: { name: '火花', description: '敵に3ダメージを与える。' },
    neutral_recovery: { name: '回復', description: 'HPを2回復する。' },
    pack_scout: { name: '斥候', description: '敵に3ダメージを与える。' },
    pack_vanguard: { name: '先鋒', description: '敵に7ダメージを与える。' },
    pack_aegis: { name: 'イージス', description: 'ブロックを11得る。' },
    pack_starfall: { name: '星落とし', description: '敵に12ダメージを与える。' },
    pack_eternal_mend: { name: '永久の癒やし', description: 'HPを10回復する。' },
  },
};

const localizedCardTextByVersion: Readonly<Record<Locale, Readonly<Record<string, CardText>>>> = {
  en: {},
  ja: {
    ...Object.fromEntries(
      Object.entries(localizedCardText.ja).map(([id, text]) => [`${id}@1.0.0`, text]),
    ),
    'sword_strike@1.1.0': { name: '一閃+', description: '敵に7ダメージを与える。' },
  },
};

interface CardText {
  readonly name: string;
  readonly description: string;
}

export function localizeCard(definition: CardDefinition, locale: Locale): CardText {
  const configuredTranslation = locale === 'ja' ? definition.translations?.ja : undefined;
  return (
    configuredTranslation ??
    localizedCardTextByVersion[locale][`${definition.id}@${definition.version}`] ??
    definition
  );
}

export function localizedCardName(
  cardId: string,
  cardDataVersion: string,
  locale: Locale,
  definition?: CardDefinition,
): string {
  if (definition?.id === cardId && definition.version === cardDataVersion)
    return localizeCard(definition, locale).name;
  const versionedText = localizedCardTextByVersion[locale][`${cardId}@${cardDataVersion}`];
  if (versionedText !== undefined) return versionedText.name;
  const bundledDefinition = [...basicCardDefinitions, ...packCardDefinitions].find(
    (card) => card.id === cardId && card.version === cardDataVersion,
  );
  return bundledDefinition === undefined ? cardId : localizeCard(bundledDefinition, locale).name;
}

const cardMetadata: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: {},
  ja: {
    SWORD: '剣士',
    GUARDIAN: '守護者',
    MAGE: '魔術師',
    ALCHEMIST: '錬金術師',
    HUNTER: '狩人',
    TRICKSTER: '道化師',
    NEUTRAL: 'ニュートラル',
    ATTACK: '攻撃',
    SKILL: 'スキル',
    POWER: 'パワー',
    REACTION: 'リアクション',
    CURSE: '呪い',
    BASIC: '基本',
    COMMON: 'コモン',
    UNCOMMON: 'アンコモン',
    RARE: 'レア',
    N: 'N',
    R: 'R',
    SR: 'SR',
    SSR: 'SSR',
    UR: 'UR',
    block: 'ブロック',
    draw: 'ドロー',
    heal: '回復',
  },
};

export function localizeCardMetadata(value: string, locale: Locale): string {
  return cardMetadata[locale][value] ?? value;
}

const localizedValues: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: {
    NORMAL_PACK: 'Normal pack',
    RARE_PACK: 'Rare pack',
    BOX: 'Box',
    WEEKLY_BOX: 'Weekly box',
    MONTHLY_BUNDLE: 'Monthly bundle',
    DAY: 'Daily',
    WEEK: 'Weekly',
    MONTH: 'Monthly',
    DAILY: 'Daily',
    WEEKLY: 'Weekly',
    EASY: 'Easy',
    NORMAL: 'Normal',
    HARD: 'Hard',
    EXPERT: 'Expert',
    PLAYER_TURN: 'Player turn',
    CPU_TURN: 'CPU turn',
    MATCH_END: 'Match end',
    BURN: 'Burn',
    POISON: 'Poison',
    WEAK: 'Weak',
    VULNERABLE: 'Vulnerable',
    STRENGTH: 'Strength',
    REGEN: 'Regeneration',
    THORNS: 'Thorns',
    CPU_BATTLE: 'CPU battle',
    PVP_BATTLE: 'PvP battle',
    CARD_PLAY: 'Play cards',
    DAMAGE: 'Deal damage',
    BLOCK: 'Gain block',
    WIN: 'Win battles',
    RANKED_BATTLE: 'Ranked battle',
    CLASS_USAGE: 'Use classes',
    DECK_OBJECTIVE: 'Deck objective',
    CARD_FRAME: 'Card frame',
    CARD_FULL_ART_FX: 'Full-art effect',
    CARD_ANIMATION: 'Card animation',
    HOLOGRAM: 'Hologram',
    LEADER_SKIN: 'Leader skin',
    PLAYMAT: 'Playmat',
    CARD_SLEEVE: 'Card sleeve',
    TITLE: 'Title',
    PROFILE_DECORATION: 'Profile decoration',
  },
  ja: {
    NORMAL_PACK: '通常パック',
    RARE_PACK: 'レアパック',
    BOX: 'ボックス',
    WEEKLY_BOX: 'ウィークリーボックス',
    MONTHLY_BUNDLE: 'マンスリーバンドル',
    DAY: 'デイリー',
    WEEK: 'ウィークリー',
    MONTH: 'マンスリー',
    DAILY: 'デイリー',
    WEEKLY: 'ウィークリー',
    EASY: 'かんたん',
    NORMAL: 'ふつう',
    HARD: 'むずかしい',
    EXPERT: 'エキスパート',
    PLAYER_TURN: 'プレイヤーのターン',
    CPU_TURN: 'CPUのターン',
    BURN: '火傷',
    POISON: '毒',
    WEAK: '弱体',
    VULNERABLE: '脆弱',
    STRENGTH: '筋力',
    REGEN: '再生',
    THORNS: '棘',
    DRAW: 'ドロー',
    MAIN: 'メイン',
    END: '終了',
    MATCH_END: '対戦終了',
    CPU_BATTLE: 'CPUバトル',
    PVP_BATTLE: '対人バトル',
    CARD_PLAY: 'カード使用',
    DAMAGE: 'ダメージ',
    BLOCK: 'ブロック',
    WIN: '勝利',
    RANKED_BATTLE: 'ランク戦',
    CLASS_USAGE: 'クラス使用',
    DECK_OBJECTIVE: 'デッキ目標',
    CARD_FRAME: 'カードフレーム',
    CARD_FULL_ART_FX: 'フルアートエフェクト',
    CARD_ANIMATION: 'カードアニメーション',
    HOLOGRAM: 'ホログラム',
    LEADER_SKIN: 'リーダースキン',
    PLAYMAT: 'プレイマット',
    CARD_SLEEVE: 'カードスリーブ',
    TITLE: '称号',
    PROFILE_DECORATION: 'プロフィール装飾',
  },
};

export function localizeValue(value: string, locale: Locale): string {
  return localizedValues[locale][value] ?? value;
}

interface CosmeticLocalizationInput {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly description: string;
}

interface CosmeticLocalization {
  readonly kind: string;
  readonly name: string;
  readonly description: string;
}

const cosmeticTranslations: Readonly<
  Record<Locale, Readonly<Record<string, CosmeticLocalization>>>
> = {
  en: {},
  ja: {
    'frame.aurora': {
      kind: 'カードフレーム',
      name: 'オーロラフレーム',
      description: '涼やかなシアンで彩るカードフレームです。',
    },
    'art.starlight': {
      kind: 'フルアートエフェクト',
      name: 'スターライト',
      description: 'フルアートを星明かりで淡く演出します。',
    },
    'animation.comet': {
      kind: 'カードアニメーション',
      name: 'コメット',
      description: 'カード登場時に彗星の軌跡を描きます。',
    },
    'hologram.prism': {
      kind: 'ホログラム',
      name: 'プリズム',
      description: '虹色にきらめくホログラム仕上げです。',
    },
    'leader.vanguard': {
      kind: 'リーダースキン',
      name: 'ヴァンガード',
      description: '先陣を切るリーダーのポートレートです。',
    },
    'playmat.observatory': {
      kind: 'プレイマット',
      name: '天文台',
      description: '夜空を見上げる天文台のプレイマットです。',
    },
    'sleeve.circuit': {
      kind: 'カードスリーブ',
      name: 'サーキット',
      description: '回路模様のカードスリーブです。',
    },
    'title.pathfinder': {
      kind: '称号',
      name: 'パスファインダー',
      description: '新たな道を切り開く者の称号です。',
    },
    'profile.signal': {
      kind: 'プロフィール装飾',
      name: 'シグナル',
      description: 'プロフィールを彩る信号の装飾です。',
    },
  },
};

export function localizeCosmetic(
  cosmetic: CosmeticLocalizationInput,
  locale: Locale,
): CosmeticLocalization {
  return (
    cosmeticTranslations[locale][cosmetic.id] ?? {
      kind: localizeValue(cosmetic.kind, locale),
      name: cosmetic.name,
      description: cosmetic.description,
    }
  );
}

const purchaseFrequencyPeriods: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: { WEEK: 'week', MONTH: 'month' },
  ja: { WEEK: '週', MONTH: '月' },
};

export function localizePurchaseFrequencyPeriod(period: string, locale: Locale): string {
  return purchaseFrequencyPeriods[locale][period] ?? localizeValue(period, locale);
}

const battlePhases = {
  en: { PLAYER_TURN: 'Player turn', MATCH_END: 'Match end' },
  ja: { PLAYER_TURN: 'プレイヤーのターン', MATCH_END: '対戦終了' },
} as const;

export function localizeBattlePhase(phase: string, locale: Locale): string {
  return battlePhases[locale][phase as keyof (typeof battlePhases)[typeof locale]] ?? phase;
}
