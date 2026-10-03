import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type CardSummary, type Deck } from './api.js';
import { useSessionStore } from './store.js';

interface Card {
  id: string;
  definitionId: string;
  costModifier: number;
  visibility: string;
}
interface Player {
  id: string;
  hp: number;
  maxHp: number;
  energy: number;
  block: number;
  hand: Card[];
  discard: Card[];
  exhaust: Card[];
  synthesisCount: number;
  alchemyStage: number;
  pool?: {
    values: Record<string, number>;
    arrowQueue?: string[];
    arrowCount?: number;
    modifiers?: Record<string, { fixedCost?: number }>;
  };
}
interface Action {
  type: string;
  playerId: string;
  cardInstanceId?: string;
  choices?: {
    kind: string;
    cardInstanceIds?: string[];
    chantEntryId?: string;
    recipeId?: string;
  }[];
  choice?: { kind: string; cardInstanceId?: string; cardInstanceIds?: string[]; recipeId?: string };
}
interface ChoiceOptions {
  cardInstanceId: string;
  candidateIds: string[];
  min: number;
  max: number;
  chantIds: string[];
  cost: number;
}
interface Battle {
  id: string;
  status: string;
  mode: string;
  inviteCode: string | null;
  expiresAt: string;
  state: null | {
    lastInputSequence: number;
    turn: number;
    activePlayerId: string;
    phase: string;
    players: Player[];
    pendingCardChoice?: { ownerPlayerId: string; choiceRequestId: string; candidateIds?: string[] };
    chantQueue: {
      chantEntryId: string;
      ownerPlayerId: string;
      sourceDefinitionId: string;
      remaining: number;
    }[];
    events: { sequence: number; type: string; [key: string]: unknown }[];
  };
  result: { status: string; winnerId?: string; reason?: string; specialVictoryId?: string } | null;
  legalActions: Action[];
  choiceOptions?: ChoiceOptions[];
}

export function AlphaBattlePage() {
  const playerId = useSessionStore((state) => state.playerId)!;
  const preview = useSessionStore((state) => state.previewMode);
  const { battleId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate(),
    queryClient = useQueryClient();
  const [deckId, setDeckId] = useState(''),
    [code, setCode] = useState(''),
    [cpuClass, setCpuClass] = useState('SWORD');
  const decks = useQuery({
    queryKey: ['decks', playerId],
    queryFn: () => api.decks(playerId),
    enabled: !preview,
  });
  const cards = useQuery({ queryKey: ['cards'], queryFn: () => api.cards() });
  const battle = useQuery({
    queryKey: ['alpha-battle', battleId ?? 'active', playerId],
    queryFn: () =>
      api.request<Battle | null>(`/api/v1/alpha-battles/${battleId ?? 'active'}`, { playerId }),
    refetchInterval: 1500,
    enabled: !preview,
  });
  const mutation = useMutation({
    retry: (count, error) => count < 2 && (!(error instanceof ApiError) || error.status >= 500),
    mutationFn: async (input: { path: string; body?: unknown; method?: 'POST' | 'DELETE' }) =>
      api.request<Battle>(input.path, {
        method: input.method ?? 'POST',
        playerId,
        ...(input.body ? { body: input.body } : {}),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(['alpha-battle', result.id, playerId], result);
      navigate(`/battle/test/${result.id}`);
      void queryClient.invalidateQueries({ queryKey: ['alpha-battle'] });
    },
  });
  useEffect(() => {
    if (!battleId && battle.data && ['WAITING', 'IN_PROGRESS'].includes(battle.data.status))
      navigate(`/battle/test/${battle.data.id}`, { replace: true });
  }, [battleId, battle.data, navigate]);
  const selected =
    deckId ||
    (decks.data?.some((deck) => deck.id === searchParams.get('deck'))
      ? searchParams.get('deck')!
      : '') ||
    decks.data?.[0]?.id ||
    '';
  const cardMap = new Map(cards.data?.map((card) => [card.cardId, card.definition]));
  const name = (id: string) =>
    cardMap.get(id)?.translations?.ja?.name ?? cardMap.get(id)?.name ?? id;
  const current = battle.data,
    state = current?.state,
    own = state?.players.find((player) => player.id === playerId),
    enemy = state?.players.find((player) => player.id !== playerId);
  const allInstances = [...(own?.hand ?? []), ...(own?.discard ?? []), ...(own?.exhaust ?? [])];
  const choiceLabel = (action: Action) =>
    action.choices
      ?.map(
        (choice) =>
          choice.cardInstanceIds
            ?.map((id) => {
              const card = allInstances.find((entry) => entry.id === id);
              return card ? name(card.definitionId) : id;
            })
            .join(' → ') ?? (choice.chantEntryId ? `詠唱 ${choice.chantEntryId}` : choice.recipeId),
      )
      .filter(Boolean)
      .join(' / ') || '選択なし';
  const act = (action: Action) => {
    if (current && state)
      mutation.mutate({
        path: `/api/v1/alpha-battles/${current.id}/actions`,
        body: { action, requestId: crypto.randomUUID(), expectedSequence: state.lastInputSequence },
      });
  };
  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">対戦テスト</p>
          <h1>全カードで対戦</h1>
          <p>
            93枚の提案カード・特殊勝利に対応。調整前のルールでCPU・カジュアル・招待対戦を試せます。
          </p>
        </div>
        <Link to="/decks">デッキを編集</Link>
      </header>
      {preview ? (
        <p role="status">対戦にはログインしてください。</p>
      ) : (
        <>
          {(battle.isPending || decks.isPending) && <p role="status">読み込み中…</p>}
          {(battle.error || mutation.error || decks.error) && (
            <div role="alert">
              <p>{(mutation.error ?? battle.error ?? decks.error)?.message}</p>
              <button
                onClick={() => {
                  mutation.reset();
                  void battle.refetch();
                  void decks.refetch();
                }}
              >
                再接続
              </button>
            </div>
          )}
          {!state && current?.status !== 'WAITING' && (
            <div className="panel">
              <label>
                使用デッキ
                <select value={selected} onChange={(event) => setDeckId(event.target.value)}>
                  {decks.data?.map((deck: Deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </label>
              {!decks.data?.length && (
                <p>
                  30枚のデッキを先に作成してください。<Link to="/decks/new">デッキ作成</Link>
                </p>
              )}
              <label>
                CPUのクラス
                <select value={cpuClass} onChange={(event) => setCpuClass(event.target.value)}>
                  {['SWORD', 'GUARDIAN', 'MAGE', 'ALCHEMIST', 'HUNTER', 'TRICKSTER'].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
              {(['CPU', 'CASUAL', 'PRIVATE'] as const).map((mode) => (
                <button
                  key={mode}
                  disabled={!selected || mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      path: '/api/v1/alpha-battles',
                      body: { mode, deckId: selected, cpuClass },
                    })
                  }
                >
                  {mode === 'CPU'
                    ? 'CPU戦'
                    : mode === 'CASUAL'
                      ? 'カジュアル対戦'
                      : '招待ルーム作成'}
                </button>
              ))}
              <label>
                招待コード
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.trim().toUpperCase())}
                  maxLength={12}
                />
              </label>
              <button
                disabled={!selected || code.length !== 12 || mutation.isPending}
                onClick={() =>
                  mutation.mutate({
                    path: `/api/v1/alpha-battles/join/${code}`,
                    body: { deckId: selected },
                  })
                }
              >
                招待ルームに参加
              </button>
            </div>
          )}
          {current?.status === 'WAITING' && (
            <div className="panel">
              <h2>対戦相手を待っています</h2>
              {current.inviteCode && (
                <p>
                  招待コード：<strong>{current.inviteCode}</strong>
                </p>
              )}
              <p>
                相手も「全カードで対戦」を開いてください。待機期限：
                {new Date(current.expiresAt).toLocaleTimeString()}
              </p>
              <button
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ path: `/api/v1/alpha-battles/${current.id}`, method: 'DELETE' })
                }
              >
                待機をキャンセル
              </button>
            </div>
          )}
          {state && own && enemy && (
            <>
              <div className="panel">
                <p>
                  ターン {state.turn} ／{' '}
                  {state.activePlayerId === playerId ? 'あなたのターン' : '相手のターン'}
                </p>
                <p>
                  相手：HP {enemy.hp}/{enemy.maxHp} ／ ブロック {enemy.block} ／ 手札{' '}
                  {enemy.hand.length} ／ 装填 {enemy.pool?.arrowCount ?? 0}
                </p>
                <p>
                  あなた：HP {own.hp}/{own.maxHp} ／ ブロック {own.block} ／ エネルギー {own.energy}
                </p>
                <p>
                  合成 {own.synthesisCount}回 ／ 錬金段階 {own.alchemyStage} ／ 装填{' '}
                  {own.pool?.arrowQueue?.length ?? 0}
                </p>
                {state.chantQueue.length > 0 && (
                  <ul>
                    {state.chantQueue.map((chant) => (
                      <li key={chant.chantEntryId}>
                        {chant.ownerPlayerId === playerId ? '自分' : '相手'}：
                        {name(chant.sourceDefinitionId)} 残り {chant.remaining}
                      </li>
                    ))}
                  </ul>
                )}
                {current.result?.status !== 'IN_PROGRESS' && (
                  <div role="status">
                    <h2>
                      {current.result?.status === 'DRAW'
                        ? '引き分け'
                        : current.result?.winnerId === playerId
                          ? '勝利'
                          : '敗北'}
                    </h2>
                    <p>
                      {current.result?.reason === 'SPECIAL_VICTORY'
                        ? `特殊勝利：${current.result.specialVictoryId}`
                        : current.result?.reason === 'FORFEIT'
                          ? '投了'
                          : 'HPによる決着'}
                    </p>
                    <Link to="/battle/test">次の対戦へ</Link>
                  </div>
                )}
              </div>
              {state.pendingCardChoice?.ownerPlayerId === playerId && (
                <div className="panel">
                  <h2>カードを選んでください（60秒）</h2>
                  {current.legalActions
                    .filter((action) => action.type === 'SUBMIT_CARD_CHOICE')
                    .map((action, index) => {
                      const id = action.choice?.cardInstanceId ?? action.choice?.recipeId ?? '',
                        card = allInstances.find((entry) => entry.id === id);
                      return (
                        <button
                          key={index}
                          disabled={mutation.isPending}
                          onClick={() => act(action)}
                        >
                          {action.choice?.cardInstanceIds
                            ? action.choice.cardInstanceIds
                                .map((id) =>
                                  name(
                                    allInstances.find((card) => card.id === id)?.definitionId ?? id,
                                  ),
                                )
                                .join(' + ')
                            : card
                              ? name(card.definitionId)
                              : name(
                                  (state.events.findLast((event) => event.cardInstanceId === id)
                                    ?.definitionId as string) ?? id,
                                )}
                        </button>
                      );
                    })}
                </div>
              )}
              <div className="card-grid">
                {own.hand.map((card) => {
                  const definition = cardMap.get(card.definitionId),
                    actions = current.legalActions.filter(
                      (action) => action.type === 'PLAY_CARD' && action.cardInstanceId === card.id,
                    );
                  return (
                    <HandCard
                      key={card.id}
                      card={card}
                      title={name(card.definitionId)}
                      description={
                        definition?.translations?.ja?.description ?? definition?.description ?? ''
                      }
                      cost={(definition?.cost ?? 0) + card.costModifier}
                      loaded={own.pool?.arrowQueue?.includes(card.id) ?? false}
                      options={current.choiceOptions?.find(
                        (option) => option.cardInstanceId === card.id,
                      )}
                      targetName={(id) =>
                        name(allInstances.find((card) => card.id === id)?.definitionId ?? id)
                      }
                      playerId={playerId}
                      actions={actions}
                      label={choiceLabel}
                      disabled={mutation.isPending}
                      play={act}
                    />
                  );
                })}
              </div>
              {current.result?.status === 'IN_PROGRESS' && (
                <div className="panel">
                  <button
                    disabled={
                      mutation.isPending ||
                      !current.legalActions.some((action) => action.type === 'END_TURN')
                    }
                    onClick={() => act({ type: 'END_TURN', playerId })}
                  >
                    ターン終了
                  </button>
                  <button
                    disabled={mutation.isPending}
                    onClick={() => act({ type: 'FORFEIT', playerId })}
                  >
                    投了
                  </button>
                </div>
              )}
              <details className="panel">
                <summary>対戦ログ</summary>
                <ol>
                  {state.events.slice(-40).map((event, index) => (
                    <li key={index}>
                      {event.type}
                      {event.amount !== undefined ? ` ${String(event.amount)}` : ''}
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
function HandCard({
  card,
  title,
  description,
  cost,
  loaded,
  actions,
  label,
  disabled,
  play,
  options,
  targetName,
  playerId,
}: {
  card: Card;
  title: string;
  description: string;
  cost: number;
  loaded: boolean;
  actions: Action[];
  label: (action: Action) => string;
  disabled: boolean;
  play: (action: Action) => void;
  options: ChoiceOptions | undefined;
  targetName: (id: string) => string;
  playerId: string;
}) {
  const [selection, setSelection] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]),
    [chant, setChant] = useState('');
  const custom = options && (options.max > 0 || options.chantIds.length > 0);
  const selectedCards = chosen.filter((id) => options?.candidateIds.includes(id));
  const selectedChant = options?.chantIds.includes(chant) ? chant : options?.chantIds[0];
  const index = Math.min(selection, Math.max(0, actions.length - 1));
  return (
    <article className="panel">
      <h3>{title}</h3>
      <p>
        コスト {options?.cost ?? cost}
        {loaded ? ' ／ 装填中' : ''}
      </p>
      <p>{description}</p>
      {custom && (
        <fieldset>
          <legend>
            効果の対象を選択（カード {options.min}〜{options.max}枚）
          </legend>
          {options.candidateIds.map((id) => (
            <button
              type="button"
              key={id}
              aria-pressed={selectedCards.includes(id)}
              disabled={
                disabled || (!selectedCards.includes(id) && selectedCards.length >= options.max)
              }
              onClick={() =>
                setChosen(
                  selectedCards.includes(id)
                    ? selectedCards.filter((card) => card !== id)
                    : [...selectedCards, id],
                )
              }
            >
              {selectedCards.includes(id) ? `${selectedCards.indexOf(id) + 1}. ` : ''}
              {targetName(id)}
            </button>
          ))}
          {options.chantIds.length > 0 && (
            <label>
              対象の詠唱
              <select value={selectedChant} onChange={(event) => setChant(event.target.value)}>
                {options.chantIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
      )}
      {!custom && actions.length > 1 && (
        <label>
          効果の対象
          <select value={index} onChange={(event) => setSelection(Number(event.target.value))}>
            {actions.map((action, choice) => (
              <option key={choice} value={choice}>
                {label(action)}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        disabled={
          disabled ||
          !actions.length ||
          Boolean(
            custom && (selectedCards.length < options.min || selectedCards.length > options.max),
          )
        }
        onClick={() => {
          if (custom) {
            play({
              type: 'PLAY_CARD',
              playerId,
              cardInstanceId: card.id,
              choices: [
                ...(options.max > 0
                  ? [{ kind: 'CARD_INSTANCES', cardInstanceIds: selectedCards }]
                  : []),
                ...(selectedChant ? [{ kind: 'CHANT_ENTRY', chantEntryId: selectedChant }] : []),
              ],
            });
          } else if (actions[index]) play(actions[index]);
        }}
      >
        使用
      </button>
    </article>
  );
}

export function CardExchangePage() {
  const playerId = useSessionStore((state) => state.playerId)!,
    queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const catalog = useQuery({
    queryKey: ['card-exchange', playerId],
    queryFn: () =>
      api.request<{
        costs: Record<string, number>;
        cards: { id: string; cardId: string; definition: CardSummary['definition'] }[];
      }>('/api/v1/card-exchange', { playerId }),
  });
  const collection = useQuery({
      queryKey: ['collection', playerId],
      queryFn: () => api.collection(playerId),
    }),
    player = useQuery({ queryKey: ['me', playerId], queryFn: () => api.me(playerId) });
  const exchange = useMutation({
    retry: (count, error) => count < 2 && (!(error instanceof ApiError) || error.status >= 500),
    mutationFn: ({
      cardVersionId,
      idempotencyKey,
    }: {
      cardVersionId: string;
      idempotencyKey: string;
    }) =>
      api.request('/api/v1/card-exchange', {
        method: 'POST',
        playerId,
        body: { cardVersionId },
        idempotencyKey,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection'] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const balance = player.data?.balances.EXCHANGE_POINT ?? 0;
  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <h1>カード交換</h1>
          <p>交換ポイント：{balance} ／ カードは各3枚まで。交換価格は暫定です。</p>
        </div>
        <Link to="/packs">パックを開封</Link>
      </header>
      <label>
        カード検索
        <input value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {(catalog.isPending || collection.isPending) && <p>読み込み中…</p>}
      {(catalog.error || exchange.error || collection.error || player.error) && (
        <p role="alert">
          {(exchange.error ?? catalog.error ?? collection.error ?? player.error)?.message}
        </p>
      )}
      <div className="card-grid">
        {catalog.data?.cards
          .filter((card) =>
            `${card.definition.name} ${card.definition.translations?.ja?.name ?? ''}`.includes(
              search,
            ),
          )
          .map((card) => {
            const count =
                collection.data?.cards.find((owned) => owned.cardVersionId === card.id)?.quantity ??
                0,
              cost = catalog.data.costs[card.definition.rarity] ?? Infinity;
            return (
              <article className="panel" key={card.id}>
                <h2>{card.definition.translations?.ja?.name ?? card.definition.name}</h2>
                <p>
                  {card.definition.rarity} ／ 所持 {count}/3
                </p>
                <button
                  disabled={
                    exchange.isPending || count >= 3 || balance < cost || collection.isPending
                  }
                  onClick={() =>
                    exchange.mutate({ cardVersionId: card.id, idempotencyKey: crypto.randomUUID() })
                  }
                >
                  {cost}ポイントで1枚交換
                </button>
              </article>
            );
          })}
      </div>
    </section>
  );
}
