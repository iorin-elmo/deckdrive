import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ActionButton, AsyncNotice } from '@deck-drive/ui';

import { ApiError, type Deck, type DeckDriveClient, type RankedHistoryPage } from './api.js';
import { useI18n } from './i18n.js';

const words = {
  en: {
    eyebrow: 'RANKED',
    title: 'Rank and season',
    description: 'Track your rating and enter a rated match.',
    season: 'Current season',
    ends: 'Ends',
    rating: 'Rating',
    games: 'Ranked games',
    noSeason: 'No active season',
    noSeasonDetail: 'Ranked play opens when the next season starts.',
    loading: 'Loading ranked status',
    failed: 'Ranked status could not be loaded.',
    retry: 'Try again',
    rank: 'Rank',
    rr: 'Rank Rating',
    queue: 'Ranked queue',
    deck: 'Deck',
    find: 'Find ranked opponent',
    waiting: 'Waiting for an opponent…',
    reconnecting: 'Checking your queue after reconnecting…',
    expired: 'Your queue expired. Choose a deck and try again.',
    queueFailed: 'Queue status could not be loaded.',
    cancel: 'Cancel matchmaking',
    cancelled: 'Matchmaking was cancelled.',
    noDeck: 'No ready deck',
    noDeckDetail: 'Build a 30-card deck to enter ranked play.',
    build: 'Build a deck',
    preview: 'Ranked matchmaking requires a live sign-in.',
    history: 'Rating history',
    noHistory: 'No ranked results yet',
    noHistoryDetail: 'Completed ranked matches will appear here.',
    historyFailed: 'Rating history could not be loaded.',
    more: 'Load more',
    result: 'View match result',
    win: 'Win',
    loss: 'Loss',
    draw: 'Draw',
  },
  ja: {
    eyebrow: 'ランク戦',
    title: 'ランクとシーズン',
    description: 'レーティングを確認してランク戦に参加します。',
    season: '現在のシーズン',
    ends: '終了日',
    rating: 'レーティング',
    games: 'ランク戦数',
    noSeason: '開催中のシーズンはありません',
    noSeasonDetail: '次のシーズン開始後にランク戦へ参加できます。',
    loading: 'ランク情報を読み込み中',
    failed: 'ランク情報を読み込めませんでした。',
    retry: '再試行',
    rank: 'ランク',
    rr: 'ランクRR',
    queue: 'ランク戦マッチング',
    deck: 'デッキ',
    find: '対戦相手を探す',
    waiting: '対戦相手を探しています…',
    reconnecting: '再接続後のマッチング状態を確認中…',
    expired: 'マッチングの期限が切れました。デッキを選んで再試行してください。',
    queueFailed: 'マッチング状態を確認できませんでした。',
    cancel: 'マッチングを取り消す',
    cancelled: 'マッチングを取り消しました。',
    noDeck: '使用できるデッキがありません',
    noDeckDetail: '30枚のデッキを作成してください。',
    build: 'デッキを作る',
    preview: 'ランク戦への参加にはログインが必要です。',
    history: 'レーティング履歴',
    noHistory: 'ランク戦の結果はまだありません',
    noHistoryDetail: 'ランク戦を終えると、ここに結果が表示されます。',
    historyFailed: 'レーティング履歴を読み込めませんでした。',
    more: 'さらに表示',
    result: '試合結果を見る',
    win: '勝利',
    loss: '敗北',
    draw: '引き分け',
  },
} as const;

const rankNames = {
  BRONZE: 'Bronze',
  SILVER: 'Silver',
  GOLD: 'Gold',
  PLATINUM: 'Platinum',
  DIAMOND: 'Diamond',
  MASTER: 'Master',
  GRAND_MASTER: 'Grand Master',
} as const;

export function RankedPage({
  client,
  playerId,
  previewMode,
}: {
  readonly client: DeckDriveClient;
  readonly playerId: string;
  readonly previewMode: boolean;
}) {
  const { locale } = useI18n();
  const w = words[locale];
  const navigate = useNavigate();
  const storageKey = `deckdrive:ranked:queue:${playerId}`;
  const [queueEntry, setQueueEntry] = useState(() => readQueue(storageKey));
  const queueEntryRef = useRef(queueEntry);
  const refreshInFlight = useRef<Promise<unknown> | null>(null);
  const cancelRequested = useRef(false);
  const queueId = queueEntry?.queueId ?? '';
  const [queueNotice, setQueueNotice] = useState<'EXPIRED' | 'CANCELLED' | null>(null);
  const [deckId, setDeckId] = useState('');
  useEffect(() => {
    const entry = readQueue(storageKey);
    queueEntryRef.current = entry;
    setQueueEntry(entry);
    setQueueNotice(null);
    const syncQueue = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      const saved = readQueue(storageKey);
      queueEntryRef.current = saved;
      setQueueEntry(saved);
    };
    window.addEventListener('storage', syncQueue);
    return () => window.removeEventListener('storage', syncQueue);
  }, [storageKey]);
  const profile = useQuery({
    queryKey: ['ranked-profile', playerId, previewMode],
    queryFn: () => client.rankedProfile(playerId),
  });
  const decks = useQuery({
    queryKey: ['decks', playerId, previewMode],
    queryFn: () => client.decks(playerId),
  });
  const playableDecks = (decks.data ?? []).filter(isReadyDeck);
  const selectedDeckId =
    queueEntry?.deckId ??
    (playableDecks.some((deck) => deck.id === deckId) ? deckId : (playableDecks[0]?.id ?? ''));
  const history = useInfiniteQuery({
    queryKey: ['ranked-history', playerId, previewMode],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => client.rankedHistory(playerId, pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const queue = useQuery({
    queryKey: ['ranked-queue', playerId, queueId],
    queryFn: () => client.rankedMatchStatus(playerId, queueId),
    enabled: queueId.length > 0 && !previewMode,
    refetchInterval: (query) =>
      query.state.data?.status === 'MATCHED' || query.state.data?.status === 'EXPIRED'
        ? false
        : 1_000,
  });
  const start = useMutation({
    mutationFn: () => client.startRankedMatch(playerId, selectedDeckId),
    onSuccess: (result) => {
      cancelRequested.current = false;
      if (result.status === 'MATCHED' && result.matchId !== undefined) {
        navigate(`/battle/pvp/${result.matchId}`);
        return;
      }
      const entry = { queueId: result.queueId, deckId: selectedDeckId };
      window.localStorage.setItem(storageKey, JSON.stringify(entry));
      queueEntryRef.current = entry;
      setQueueEntry(entry);
      setQueueNotice(null);
    },
  });
  const cancel = useMutation({
    mutationFn: async () => {
      cancelRequested.current = true;
      try {
        await refreshInFlight.current?.catch(() => undefined);
        const current = queueEntryRef.current;
        if (current === null) throw new Error('Ranked queue is no longer active.');
        return await client.cancelRankedMatch(playerId, current.queueId);
      } catch (error) {
        cancelRequested.current = false;
        throw error;
      }
    },
    onSuccess: (result) => {
      queueEntryRef.current = null;
      if (result.status === 'MATCHED' && result.matchId !== undefined) {
        window.localStorage.removeItem(storageKey);
        navigate(`/battle/pvp/${result.matchId}`);
        return;
      }
      window.localStorage.removeItem(storageKey);
      setQueueEntry(null);
      setQueueNotice('CANCELLED');
    },
  });
  const refresh = useMutation({
    mutationFn: async (entry: { readonly queueId: string; readonly deckId: string }) => {
      const pending = client.startRankedMatch(playerId, entry.deckId);
      refreshInFlight.current = pending;
      try {
        const result = await pending;
        if (result.status === 'QUEUED' && result.queueId !== entry.queueId)
          queueEntryRef.current = { ...entry, queueId: result.queueId };
        return result;
      } finally {
        if (refreshInFlight.current === pending) refreshInFlight.current = null;
      }
    },
    onSuccess: (result, previous) => {
      if (cancelRequested.current) return;
      if (result.status === 'MATCHED' && result.matchId !== undefined) {
        queueEntryRef.current = null;
        window.localStorage.removeItem(storageKey);
        navigate(`/battle/pvp/${result.matchId}`);
      } else if (result.queueId !== previous.queueId) {
        const entry = { ...previous, queueId: result.queueId };
        window.localStorage.setItem(storageKey, JSON.stringify(entry));
        queueEntryRef.current = entry;
        setQueueEntry(entry);
      }
    },
  });

  useEffect(() => {
    if (queueEntry === null || previewMode) return;
    const timer = window.setInterval(() => {
      if (!cancelRequested.current && !refresh.isPending) refresh.mutate(queueEntry);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [previewMode, queueEntry, refresh.isPending, refresh.mutate]);

  useEffect(() => {
    if (queue.data?.status === 'MATCHED' && queue.data.matchId !== undefined) {
      queueEntryRef.current = null;
      window.localStorage.removeItem(storageKey);
      navigate(`/battle/pvp/${queue.data.matchId}`, { replace: true });
    }
    if (
      queue.data?.status === 'EXPIRED' ||
      queue.data?.status === 'CANCELLED' ||
      (queue.error instanceof ApiError && queue.error.status === 404)
    ) {
      queueEntryRef.current = null;
      window.localStorage.removeItem(storageKey);
      setQueueEntry(null);
      setQueueNotice(queue.data?.status === 'CANCELLED' ? 'CANCELLED' : 'EXPIRED');
    }
  }, [navigate, queue.data, queue.error, storageKey]);

  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const rank = profile.data?.rank;
  const rr = profile.data?.rr;
  return (
    <>
      <div>
        <p className="eyebrow">{w.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black text-stone-50 sm:text-4xl">{w.title}</h1>
        <p className="mt-3 text-stone-300">{w.description}</p>
      </div>
      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <section className="surface-panel p-5 sm:p-6" aria-labelledby="ranked-season-heading">
          <h2 id="ranked-season-heading" className="text-xl font-bold">
            {w.season}
          </h2>
          {profile.isPending ? <AsyncNotice kind="loading" title={w.loading} /> : null}
          {profile.isError ? (
            <RetryNotice title={w.failed} retry={w.retry} onRetry={() => void profile.refetch()} />
          ) : null}
          {profile.data?.season === null ? (
            <AsyncNotice kind="empty" title={w.noSeason}>
              {w.noSeasonDetail}
            </AsyncNotice>
          ) : null}
          {profile.data?.season !== null &&
          profile.data !== undefined &&
          rank !== null &&
          rank !== undefined &&
          rr !== null &&
          rr !== undefined ? (
            <div className="mt-5 space-y-5">
              <div>
                <p className="text-sm text-stone-300">{w.rank}</p>
                <p className="mt-1 text-3xl font-black text-amber-200">
                  {rankNames[rank.name as keyof typeof rankNames] ?? rank.name}{' '}
                  {rank.division ?? ''}
                </p>
              </div>
              <div>
                <div className="flex justify-between gap-2 text-sm">
                  <span>{w.rr}</span>
                  <strong>
                    {rr} / {profile.data.rrGoal}
                  </strong>
                </div>
                <progress
                  className="mt-2 h-3 w-full accent-cyan-300"
                  max={profile.data.rrGoal}
                  value={rr}
                  aria-label={`${w.rr}: ${rr} / ${profile.data.rrGoal}`}
                />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-stone-400">{w.rating}</dt>
                  <dd className="text-lg font-bold">{Math.round(profile.data.rating ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-stone-400">{w.games}</dt>
                  <dd className="text-lg font-bold">{profile.data.completedGames ?? 0}</dd>
                </div>
              </dl>
              <p className="text-sm text-stone-300">
                {w.ends}:{' '}
                <time dateTime={profile.data.season.endsAt}>
                  {formatDate(profile.data.season.endsAt, locale)}
                </time>
              </p>
            </div>
          ) : null}
        </section>
        <section className="surface-panel p-5 sm:p-6" aria-labelledby="ranked-queue-heading">
          <h2 id="ranked-queue-heading" className="text-xl font-bold">
            {w.queue}
          </h2>
          {previewMode ? <AsyncNotice kind="empty" title={w.preview} /> : null}
          {!previewMode && decks.isPending ? (
            <AsyncNotice kind="loading" title={w.loading} />
          ) : null}
          {!previewMode && decks.isError ? (
            <RetryNotice title={w.failed} retry={w.retry} onRetry={() => void decks.refetch()} />
          ) : null}
          {!previewMode && decks.isSuccess && playableDecks.length === 0 ? (
            <AsyncNotice kind="empty" title={w.noDeck}>
              {w.noDeckDetail}
              <Link className="quiet-link mt-3" to="/decks/new">
                {w.build}
              </Link>
            </AsyncNotice>
          ) : null}
          {!previewMode && playableDecks.length > 0 ? (
            <div className="mt-5">
              <label className="field-label">
                {w.deck}
                <select
                  value={selectedDeckId}
                  onChange={(event) => setDeckId(event.target.value)}
                  disabled={queueId.length > 0}
                >
                  {playableDecks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </label>
              <ActionButton
                className="mt-5 w-full"
                type="button"
                disabled={
                  !profile.isSuccess ||
                  profile.data.season === null ||
                  queueId.length > 0 ||
                  start.isPending
                }
                onClick={() => start.mutate()}
              >
                {queueId.length > 0 ? w.waiting : w.find}
              </ActionButton>
              {start.isError ? (
                <RetryNotice title={w.queueFailed} retry={w.retry} onRetry={() => start.mutate()} />
              ) : null}
            </div>
          ) : null}
          {queueId.length > 0 ? (
            <div className="mt-4">
              <p role="status" className="text-sm text-cyan-100">
                {queue.isPending ? w.reconnecting : w.waiting}
              </p>
              <ActionButton
                className="mt-3"
                tone="quiet"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                {w.cancel}
              </ActionButton>
            </div>
          ) : null}
          {queueNotice !== null ? (
            <p role="status" className="mt-3 text-sm text-amber-200">
              {queueNotice === 'EXPIRED' ? w.expired : w.cancelled}
            </p>
          ) : null}
          {queue.isError && queueId.length > 0 ? (
            <RetryNotice
              title={w.queueFailed}
              retry={w.retry}
              onRetry={() => void queue.refetch()}
            />
          ) : null}
          {cancel.isError ? (
            <RetryNotice title={w.queueFailed} retry={w.retry} onRetry={() => cancel.mutate()} />
          ) : null}
          {refresh.isError && queueEntry !== null ? (
            <RetryNotice
              title={w.queueFailed}
              retry={w.retry}
              onRetry={() => refresh.mutate(queueEntry)}
            />
          ) : null}
        </section>
      </div>
      <section className="surface-panel mt-5 p-5 sm:p-6" aria-labelledby="ranked-history-heading">
        <h2 id="ranked-history-heading" className="text-xl font-bold">
          {w.history}
        </h2>
        {history.isPending ? <AsyncNotice kind="loading" title={w.loading} /> : null}
        {history.isError ? (
          <RetryNotice
            title={w.historyFailed}
            retry={w.retry}
            onRetry={() => void history.refetch()}
          />
        ) : null}
        {history.isSuccess && items.length === 0 ? (
          <AsyncNotice kind="empty" title={w.noHistory}>
            {w.noHistoryDetail}
          </AsyncNotice>
        ) : null}
        {items.length > 0 ? (
          <ol className="mt-4 divide-y divide-stone-700">
            {items.map((entry) => (
              <HistoryRow key={entry.id} entry={entry} locale={locale} w={w} />
            ))}
          </ol>
        ) : null}
        {history.hasNextPage ? (
          <ActionButton
            className="mt-4"
            tone="quiet"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            {w.more}
          </ActionButton>
        ) : null}
        {history.isFetchNextPageError ? (
          <RetryNotice
            title={w.historyFailed}
            retry={w.retry}
            onRetry={() => void history.fetchNextPage()}
          />
        ) : null}
      </section>
    </>
  );
}

function HistoryRow({
  entry,
  locale,
  w,
}: {
  readonly entry: RankedHistoryPage['items'][number];
  readonly locale: 'en' | 'ja';
  readonly w: typeof words.en | typeof words.ja;
}) {
  const outcome = entry.outcome === 'WIN' ? w.win : entry.outcome === 'LOSS' ? w.loss : w.draw;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div>
        <p className="font-semibold">
          {outcome} · {entry.ratingBefore.toFixed(0)} → {entry.ratingAfter.toFixed(0)}
        </p>
        <time className="text-sm text-stone-400" dateTime={entry.createdAt}>
          {formatDate(entry.createdAt, locale)}
        </time>
      </div>
      <div className="flex items-center gap-4">
        <strong className={entry.delta >= 0 ? 'text-cyan-200' : 'text-rose-200'}>
          {w.rating} {entry.delta >= 0 ? '+' : ''}
          {entry.delta.toFixed(0)}
        </strong>
        <Link className="quiet-link" to={`/result/${encodeURIComponent(entry.matchId)}`}>
          {w.result}
        </Link>
      </div>
    </li>
  );
}

function RetryNotice({
  title,
  retry,
  onRetry,
}: {
  readonly title: string;
  readonly retry: string;
  readonly onRetry: () => void;
}) {
  return (
    <AsyncNotice kind="error" title={title}>
      <ActionButton className="mt-3" tone="quiet" onClick={onRetry}>
        {retry}
      </ActionButton>
    </AsyncNotice>
  );
}

function formatDate(value: string, locale: 'en' | 'ja') {
  return new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function isReadyDeck(deck: Deck): boolean {
  return deck.cards.reduce((sum, card) => sum + card.quantity, 0) === 30;
}

function readQueue(key: string): { readonly queueId: string; readonly deckId: string } | null {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    if (
      value !== null &&
      typeof value === 'object' &&
      'queueId' in value &&
      typeof value.queueId === 'string' &&
      'deckId' in value &&
      typeof value.deckId === 'string'
    )
      return { queueId: value.queueId, deckId: value.deckId };
  } catch {
    /* An invalid local queue marker is ignored. */
  }
  return null;
}
