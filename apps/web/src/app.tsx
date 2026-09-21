import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  BookOpen,
  ChevronRight,
  Crosshair,
  DoorOpen,
  LibraryBig,
  LoaderCircle,
  LogIn,
  Menu,
  Minus,
  Plus,
  Play,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { ActionButton, AsyncNotice, classNames } from '@deck-drive/ui';

import {
  api,
  ApiError,
  previewApi,
  type BattleState,
  type CardSummary,
  type CpuMatch,
  type Deck,
  type DeckInput,
  type DeckDriveClient,
  type OwnedCard,
} from './api.js';
import { useSessionStore } from './store.js';

const navigation = [
  { to: '/home', label: 'Home', icon: Sparkles },
  { to: '/cards', label: 'Cards', icon: LibraryBig },
  { to: '/decks', label: 'Decks', icon: BookOpen },
  { to: '/battle/cpu', label: 'CPU', icon: Swords },
] as const;

export function App() {
  return (
    <Routes>
      <Route path="/" element={<TitlePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthenticatedLayout />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/cards" element={<CardsPage />} />
        <Route path="/cards/:cardId" element={<CardDetailPage />} />
        <Route path="/decks" element={<DecksPage />} />
        <Route path="/decks/new" element={<DeckBuilderPage />} />
        <Route path="/decks/:deckId" element={<DeckDetailPage />} />
        <Route path="/decks/:deckId/edit" element={<DeckBuilderPage />} />
        <Route path="/battle/cpu" element={<CpuSetupPage />} />
        <Route path="/battle/cpu/:matchId" element={<CpuBattlePage />} />
        <Route path="/result/:matchId" element={<ResultPage />} />
      </Route>
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

function TitlePage() {
  const playerId = useSessionStore((state) => state.playerId);
  return (
    <main className="title-scene min-h-screen px-5 py-6 text-stone-100">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col justify-between gap-12">
        <header className="flex items-center justify-between">
          <span className="text-sm font-bold tracking-[0.18em] text-cyan-200">DECKDRIVE</span>
          <Link className="quiet-link" to={playerId === null ? '/login' : '/home'}>
            {playerId === null ? 'Development login' : 'Enter game'}
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </header>
        <section className="max-w-2xl pb-8 sm:pb-16">
          <p className="mb-4 text-sm font-semibold tracking-[0.14em] text-amber-200">
            TACTICAL CARD BATTLES
          </p>
          <h1 className="max-w-xl text-5xl font-black tracking-normal text-stone-50 sm:text-7xl">
            Read the field.
            <br />
            Shape the turn.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-stone-200 sm:text-lg">
            Build a precise deck, challenge a CPU rival, and study every decision from the arena.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="hero-command" to={playerId === null ? '/login' : '/home'}>
              <Play size={18} fill="currentColor" aria-hidden="true" />
              {playerId === null ? 'Start in development' : 'Continue'}
            </Link>
            <Link className="hero-secondary" to="/cards">
              Explore cards
            </Link>
          </div>
        </section>
        <footer className="flex flex-wrap gap-x-8 gap-y-2 text-xs font-medium tracking-wide text-stone-300">
          <span>CPU practice</span>
          <span>Deck workshop</span>
          <span>Replay-ready rules</span>
        </footer>
      </div>
    </main>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setPlayerId = useSessionStore((state) => state.setPlayerId);
  const enablePreview = useSessionStore((state) => state.enablePreview);
  const returnTo = loginReturnPath(new URLSearchParams(location.search).get('returnTo'));
  const [email, setEmail] = useState('debug@deckdrive.local');
  const [displayName, setDisplayName] = useState('Debug Player');
  const login = useMutation({
    mutationFn: () => api.developmentLogin(email, displayName),
    onSuccess: ({ playerId }) => {
      setPlayerId(playerId);
      navigate(returnTo);
    },
  });
  return (
    <main className="app-background flex min-h-screen items-center justify-center p-5 text-stone-100">
      <section aria-labelledby="login-title" className="surface-panel w-full max-w-md p-6 sm:p-8">
        <Link className="quiet-link mb-8" to="/">
          <ChevronRight className="rotate-180" size={16} aria-hidden="true" />
          Back to title
        </Link>
        <p className="eyebrow">DEVELOPMENT ACCESS</p>
        <h1 id="login-title" className="mt-2 text-3xl font-black text-stone-50">
          Enter the arena
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-300">
          This placeholder is available only while the API runs in development mode.
        </p>
        <form
          className="mt-7 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <label className="field-label">
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="field-label">
            Display name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="nickname"
              required
            />
          </label>
          {login.isError ? (
            canOpenOfflinePreview(login.error) ? (
              <ApiFailure
                error={login.error}
                onPreview={() => {
                  enablePreview();
                  navigate(returnTo);
                }}
              />
            ) : (
              <ApiFailure error={login.error} />
            )
          ) : null}
          <ActionButton className="w-full" type="submit" disabled={login.isPending}>
            {login.isPending ? (
              <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
            ) : (
              <LogIn size={17} aria-hidden="true" />
            )}
            Sign in for development
          </ActionButton>
        </form>
      </section>
    </main>
  );
}

function AuthenticatedLayout() {
  const location = useLocation();
  const playerId = useSessionStore((state) => state.playerId);
  const previewMode = useSessionStore((state) => state.previewMode);
  const clearPlayerId = useSessionStore((state) => state.clearPlayerId);
  const client = useApiClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const player = useQuery({
    queryKey: ['me', playerId, previewMode],
    queryFn: () => client.me(playerId!),
    enabled: playerId !== null,
  });
  if (playerId === null) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate replace to={`/login?returnTo=${encodeURIComponent(returnTo)}`} />;
  }
  return (
    <div className="app-background min-h-screen text-stone-100">
      <header className="border-b border-stone-800 bg-zinc-950/90">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/home" className="font-black tracking-[0.16em] text-cyan-200">
            DECKDRIVE
          </Link>
          <ActionButton
            tone="quiet"
            className="sm:hidden"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-controls="primary-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </ActionButton>
          <nav
            id="primary-navigation"
            aria-label="Primary navigation"
            className={classNames(
              'items-center gap-1 sm:flex',
              menuOpen
                ? 'absolute inset-x-4 top-16 z-10 flex flex-col items-stretch border border-stone-700 bg-zinc-950 p-3 shadow-2xl sm:static sm:flex-row sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none'
                : 'hidden',
            )}
          >
            {navigation.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => classNames('nav-link', isActive && 'nav-link-active')}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
            <button className="nav-link sm:ml-3" type="button" onClick={clearPlayerId}>
              <DoorOpen size={16} aria-hidden="true" />
              Sign out
            </button>
          </nav>
          <div className="hidden text-right text-xs sm:block">
            <p className="font-semibold text-stone-100">
              {player.data?.displayName ?? 'Loading player'}
            </p>
            <p className="text-amber-200">
              {previewMode ? 'Offline preview' : formatBalances(player.data?.balances)}
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
        {player.isError ? <ApiFailure error={player.error} /> : <RoutesContent />}
      </main>
    </div>
  );
}

function RoutesContent() {
  return (
    <Routes>
      <Route path="/home" element={<HomePage />} />
      <Route path="/cards" element={<CardsPage />} />
      <Route path="/cards/:cardId" element={<CardDetailPage />} />
      <Route path="/decks" element={<DecksPage />} />
      <Route path="/decks/new" element={<DeckBuilderPage />} />
      <Route path="/decks/:deckId" element={<DeckDetailPage />} />
      <Route path="/decks/:deckId/edit" element={<DeckBuilderPage />} />
      <Route path="/battle/cpu" element={<CpuSetupPage />} />
      <Route path="/battle/cpu/:matchId" element={<CpuBattlePage />} />
      <Route path="/result/:matchId" element={<ResultPage />} />
    </Routes>
  );
}

function HomePage() {
  const playerId = useSessionStore((state) => state.playerId)!;
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const player = useQuery({
    queryKey: ['me', playerId, previewMode],
    queryFn: () => client.me(playerId),
  });
  const decks = useQuery({
    queryKey: ['decks', playerId, previewMode],
    queryFn: () => client.decks(playerId),
  });
  return (
    <>
      <PageHeading
        eyebrow="COMMAND DECK"
        title="Home"
        description="Choose a lane, then make the next clean move."
      />
      <section className="mt-8 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <article className="arena-panel min-h-72 p-6 sm:p-8">
          <div className="max-w-md">
            <p className="eyebrow">NEXT PRACTICE</p>
            <h2 className="mt-2 text-3xl font-black text-stone-50">CPU arena</h2>
            <p className="mt-3 leading-7 text-stone-200">
              Test the deck you know, choose a difficulty, and inspect the battle state after
              launch.
            </p>
            <Link className="hero-command mt-7" to="/battle/cpu">
              <Crosshair size={18} aria-hidden="true" />
              Start a CPU match
            </Link>
          </div>
        </article>
        <article className="surface-panel p-6">
          <p className="eyebrow">PLAYER STATUS</p>
          {player.isLoading ? <LoadingNotice title="Loading player status" /> : null}
          {player.data ? (
            <div className="mt-5 space-y-5">
              <div>
                <p className="text-2xl font-black">{player.data.displayName}</p>
                <p className="mt-1 text-sm text-stone-400">Development profile</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Gems" value={String(player.data.balances.GEM ?? 0)} />
                <Metric label="Exchange" value={String(player.data.balances.EXCHANGE_POINT ?? 0)} />
              </div>
            </div>
          ) : null}
        </article>
      </section>
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <QuickLink
          to="/cards"
          icon={<LibraryBig size={20} aria-hidden="true" />}
          title="Card library"
          text="Browse the available versioned card definitions."
        />
        <QuickLink
          to="/decks"
          icon={<BookOpen size={20} aria-hidden="true" />}
          title="Deck workshop"
          text={
            decks.isError
              ? 'Deck information is unavailable.'
              : decks.data === undefined
                ? 'Loading decks.'
                : `${String(decks.data.length)} deck${decks.data.length === 1 ? '' : 's'} ready for review.`
          }
        />
        <QuickLink
          to="/battle/cpu"
          icon={<Swords size={20} aria-hidden="true" />}
          title="CPU battle"
          text="Launch the selected deck against one of four CPU difficulties."
        />
      </section>
      {decks.isError ? (
        <div className="mt-4">
          <ApiFailure error={decks.error} onRetry={() => void decks.refetch()} />
        </div>
      ) : null}
    </>
  );
}

function CardsPage() {
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const cards = useQuery({ queryKey: ['cards', previewMode], queryFn: () => client.cards() });
  const [search, setSearch] = useState('');
  const visibleCards = cards.data?.filter((card) => {
    const text =
      `${card.definition.name} ${card.definition.description} ${card.definition.class}`.toLowerCase();
    return text.includes(search.trim().toLowerCase());
  });
  return (
    <>
      <PageHeading
        eyebrow="REFERENCE"
        title="Card library"
        description="Versioned definitions available to the current build."
      />
      <label className="search-field mt-7">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Search cards</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search card name, class, or text"
        />
      </label>
      <section aria-live="polite" className="mt-6">
        {cards.isLoading ? <LoadingNotice title="Loading card library" /> : null}
        {cards.isError ? <ApiFailure error={cards.error} /> : null}
        {visibleCards?.length === 0 ? (
          <AsyncNotice kind="empty" title="No cards match that search">
            Try a shorter name or clear the filter.
          </AsyncNotice>
        ) : null}
        {visibleCards !== undefined && visibleCards.length > 0 ? (
          <div className="card-grid">
            {visibleCards.map((card) => (
              <CardTile key={`${card.cardId}:${card.version}`} card={card} />
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

export function selectCardSummary(
  cards: readonly CardSummary[],
  cardId: string,
  version: string | null,
): CardSummary | undefined {
  return cards.find(
    (candidate) =>
      candidate.cardId === cardId && (version === null || candidate.version === version),
  );
}

function CardDetailPage() {
  const { cardId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const cards = useQuery({ queryKey: ['cards', previewMode], queryFn: () => client.cards() });
  const card = cards.data
    ? selectCardSummary(cards.data, cardId, searchParams.get('version'))
    : undefined;
  if (cards.isLoading) return <LoadingNotice title="Loading card" />;
  if (cards.isError) return <ApiFailure error={cards.error} />;
  if (card === undefined)
    return (
      <AsyncNotice kind="empty" title="Card not found">
        <Link className="quiet-link mt-3" to="/cards">
          Return to card library
        </Link>
      </AsyncNotice>
    );
  return <CardDetail card={card} />;
}

function DecksPage() {
  const playerId = useSessionStore((state) => state.playerId)!;
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const decks = useQuery({
    queryKey: ['decks', playerId, previewMode],
    queryFn: () => client.decks(playerId),
  });
  return (
    <>
      <PageHeading
        eyebrow="WORKSHOP"
        title="Decks"
        description="Review your saved lists before taking one into the CPU arena."
      />
      <Link className="hero-command mt-6" to="/decks/new">
        <Plus size={18} aria-hidden="true" />
        Build a deck
      </Link>
      <section className="mt-7" aria-live="polite">
        {decks.isLoading ? <LoadingNotice title="Loading decks" /> : null}
        {decks.isError ? <ApiFailure error={decks.error} /> : null}
        {decks.data?.length === 0 ? (
          <AsyncNotice kind="empty" title="No decks yet">
            Build a valid 30-card deck from your collection to begin CPU practice.
          </AsyncNotice>
        ) : null}
        {decks.data !== undefined && decks.data.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {decks.data.map((deck) => (
              <DeckTile key={deck.id} deck={deck} />
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

function DeckDetailPage() {
  const { deckId = '' } = useParams();
  const playerId = useSessionStore((state) => state.playerId)!;
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const decks = useQuery({
    queryKey: ['decks', playerId, previewMode],
    queryFn: () => client.decks(playerId),
  });
  const deck = decks.data?.find((candidate) => candidate.id === deckId);
  if (decks.isLoading) return <LoadingNotice title="Loading deck" />;
  if (decks.isError) return <ApiFailure error={decks.error} />;
  if (deck === undefined)
    return (
      <AsyncNotice kind="empty" title="Deck not found">
        <Link className="quiet-link mt-3" to="/decks">
          Return to decks
        </Link>
      </AsyncNotice>
    );
  return (
    <>
      <PageHeading
        eyebrow="DECK WORKSHOP"
        title={deck.name}
        description={`${String(deckCardTotal(deck))} cards - data version ${deck.cardDataVersion}`}
      />
      <section className="mt-7 grid gap-4 lg:grid-cols-[1fr_0.4fr]">
        <div className="surface-panel overflow-hidden">
          <table className="deck-table">
            <thead>
              <tr>
                <th>Card</th>
                <th>Cost</th>
                <th>Copies</th>
              </tr>
            </thead>
            <tbody>
              {deck.cards.map((item) => (
                <tr key={item.cardVersionId}>
                  <td>
                    <Link
                      to={cardDetailHref(item.cardVersion)}
                      className="font-semibold text-cyan-100 hover:text-cyan-200"
                    >
                      {item.cardVersion.definition.name}
                    </Link>
                    <span>{item.cardVersion.definition.type}</span>
                  </td>
                  <td>{item.cardVersion.definition.cost}</td>
                  <td>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="surface-panel p-6">
          <p className="eyebrow">READY CHECK</p>
          <p className="mt-4 text-3xl font-black">
            {String(deckCardTotal(deck))}
            <span className="text-base font-medium text-stone-400"> / 30 cards</span>
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-300">
            CPU match creation uses this saved deck and the game engine's legal-action rules.
          </p>
          <Link
            className="hero-command mt-6"
            to={`/battle/cpu?deck=${encodeURIComponent(deck.id)}`}
          >
            <Play size={17} fill="currentColor" aria-hidden="true" />
            Use for CPU
          </Link>
          <Link className="hero-secondary mt-3" to={`/decks/${encodeURIComponent(deck.id)}/edit`}>
            Edit deck
          </Link>
        </aside>
      </section>
    </>
  );
}

function DeckBuilderPage() {
  const { deckId } = useParams();
  const playerId = useSessionStore((state) => state.playerId)!;
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const decks = useQuery({
    queryKey: ['decks', playerId, previewMode],
    queryFn: () => client.decks(playerId),
  });
  const collection = useQuery({
    queryKey: ['collection', playerId, previewMode],
    queryFn: () => client.collection(playerId),
  });
  const deck = decks.data?.find((candidate) => candidate.id === deckId);
  const [name, setName] = useState('New deck');
  const [quantities, setQuantities] = useState<Readonly<Record<string, number>>>({});

  useEffect(() => {
    if (deck === undefined) return;
    setName(deck.name);
    setQuantities(
      Object.fromEntries(deck.cards.map((card) => [card.cardVersionId, card.quantity])),
    );
  }, [deck]);

  const ownedCards = collection.data ?? [];
  const cardDataVersion = deck?.cardDataVersion ?? ownedCards[0]?.cardVersion.version ?? '1.0.0';
  const total = deckBuilderCardTotal(quantities);
  const save = useMutation({
    mutationFn: () => {
      const input = deckBuilderInput(name, cardDataVersion, ownedCards, quantities);
      return deckId === undefined
        ? client.createDeck(playerId, input)
        : client.updateDeck(playerId, deckId, input);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['decks', playerId, previewMode] });
      navigate(`/decks/${saved.id}`);
    },
  });

  if (decks.isLoading || collection.isLoading)
    return <LoadingNotice title="Loading deck workshop" />;
  if (decks.isError) return <ApiFailure error={decks.error} onRetry={() => void decks.refetch()} />;
  if (collection.isError)
    return <ApiFailure error={collection.error} onRetry={() => void collection.refetch()} />;
  if (deckId !== undefined && deck === undefined)
    return (
      <AsyncNotice kind="empty" title="Deck not found">
        <Link className="quiet-link mt-3" to="/decks">
          Return to decks
        </Link>
      </AsyncNotice>
    );
  if (ownedCards.length === 0)
    return (
      <AsyncNotice kind="empty" title="No cards in your collection">
        This development player has no cards available for a 30-card deck.
      </AsyncNotice>
    );

  return (
    <>
      <PageHeading
        eyebrow="DECK BUILDER"
        title={deck === undefined ? 'Build a deck' : `Edit ${deck.name}`}
        description="Choose owned card versions, then save an exact 30-card list."
      />
      <form
        className="mt-7 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"
        onSubmit={(event) => {
          event.preventDefault();
          if (total === 30 && name.trim().length > 0) save.mutate();
        }}
      >
        <aside className="surface-panel h-fit p-6">
          <label className="field-label">
            Deck name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
            />
          </label>
          <p className="eyebrow mt-7">READY CHECK</p>
          <p className="mt-3 text-4xl font-black text-stone-50">
            {String(total)} <span className="text-base font-medium text-stone-400">/ 30 cards</span>
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-300">
            Each quantity is limited by the card's copy limit and your collection.
          </p>
          {save.isError ? <ApiFailure error={save.error} /> : null}
          <ActionButton
            className="mt-7 w-full"
            type="submit"
            disabled={total !== 30 || name.trim().length === 0 || save.isPending}
          >
            <BookOpen size={18} aria-hidden="true" />
            {save.isPending ? 'Saving deck' : deck === undefined ? 'Create deck' : 'Save deck'}
          </ActionButton>
          <Link className="quiet-link mt-4" to="/decks">
            Return to decks
          </Link>
        </aside>
        <section className="surface-panel overflow-hidden">
          <table className="deck-table">
            <thead>
              <tr>
                <th>Card</th>
                <th>Owned</th>
                <th>Copies</th>
              </tr>
            </thead>
            <tbody>
              {ownedCards.map((card) => {
                const limit = deckBuilderCopyLimit(card);
                const quantity = quantities[card.cardVersionId] ?? 0;
                return (
                  <tr key={card.cardVersionId}>
                    <td>
                      <Link
                        className="font-semibold text-cyan-100 hover:text-cyan-200"
                        to={cardDetailHref(card.cardVersion)}
                      >
                        {card.cardVersion.definition.name}
                      </Link>
                      <span>{card.cardVersion.definition.type}</span>
                    </td>
                    <td>{String(card.quantity)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <ActionButton
                          tone="quiet"
                          type="button"
                          aria-label={`Remove ${card.cardVersion.definition.name}`}
                          disabled={quantity === 0}
                          onClick={() =>
                            setQuantities((current) => ({
                              ...current,
                              [card.cardVersionId]: Math.max(0, quantity - 1),
                            }))
                          }
                        >
                          <Minus size={16} aria-hidden="true" />
                        </ActionButton>
                        <input
                          className="w-14 rounded-md border border-stone-600 bg-zinc-950 px-2 py-2 text-center text-sm font-bold text-stone-50"
                          type="number"
                          min="0"
                          max={limit}
                          value={quantity}
                          aria-label={`${card.cardVersion.definition.name} copies`}
                          onChange={(event) => {
                            const requested = Number(event.target.value);
                            const next = Number.isFinite(requested)
                              ? Math.min(limit, Math.max(0, Math.floor(requested)))
                              : 0;
                            setQuantities((current) => ({
                              ...current,
                              [card.cardVersionId]: next,
                            }));
                          }}
                        />
                        <ActionButton
                          tone="quiet"
                          type="button"
                          aria-label={`Add ${card.cardVersion.definition.name}`}
                          disabled={quantity >= limit}
                          onClick={() =>
                            setQuantities((current) => ({
                              ...current,
                              [card.cardVersionId]: Math.min(limit, quantity + 1),
                            }))
                          }
                        >
                          <Plus size={16} aria-hidden="true" />
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </form>
    </>
  );
}

function CpuSetupPage() {
  const playerId = useSessionStore((state) => state.playerId)!;
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const navigate = useNavigate();
  const location = useLocation();
  const decks = useQuery({
    queryKey: ['decks', playerId, previewMode],
    queryFn: () => client.decks(playerId),
  });
  const queryDeck = new URLSearchParams(location.search).get('deck');
  const [deckId, setDeckId] = useState(queryDeck ?? '');
  const [difficulty, setDifficulty] = useState<CpuMatch['difficulty']>('NORMAL');
  const playableDecks = (decks.data ?? []).filter(isCpuReadyDeck);
  const selectedDeck = playableDecks.some((deck) => deck.id === deckId);
  const start = useMutation({
    mutationFn: () => client.startCpuMatch(playerId, deckId, difficulty),
    onSuccess: (match) => navigate(`/battle/cpu/${match.id}`, { state: { match } }),
  });
  return (
    <>
      <PageHeading
        eyebrow="CPU PRACTICE"
        title="Set the challenge"
        description="Choose a saved deck and a CPU profile. The server remains authoritative for match creation."
      />
      <section className="mt-7 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <form
          className="surface-panel p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedDeck) return;
            start.mutate();
          }}
        >
          {decks.isLoading ? (
            <LoadingNotice title="Loading decks" />
          ) : decks.isError ? (
            <ApiFailure error={decks.error} onRetry={() => void decks.refetch()} />
          ) : playableDecks.length === 0 ? (
            <AsyncNotice kind="empty" title="No 30-card decks available">
              Build a valid 30-card deck before starting CPU practice.
              <Link className="quiet-link mt-3" to="/decks/new">
                Build a deck
              </Link>
            </AsyncNotice>
          ) : (
            <label className="field-label">
              Deck
              <select
                value={deckId}
                onChange={(event) => setDeckId(event.target.value)}
                disabled={decks.isLoading || decks.isError}
                required
              >
                <option value="">Choose a deck</option>
                {playableDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({String(deckCardTotal(deck))}/30)
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset className="mt-6">
            <legend className="field-label">CPU difficulty</legend>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(['EASY', 'NORMAL', 'HARD', 'EXPERT'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDifficulty(option)}
                  className={classNames(
                    'difficulty-option',
                    difficulty === option && 'difficulty-option-selected',
                  )}
                  aria-pressed={difficulty === option}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>
          {start.isError ? <ApiFailure error={start.error} /> : null}
          <ActionButton
            className="mt-7 w-full"
            type="submit"
            disabled={!selectedDeck || start.isPending}
          >
            <Swords size={18} aria-hidden="true" />
            {start.isPending ? 'Creating match' : 'Enter CPU arena'}
          </ActionButton>
        </form>
        <article className="arena-panel min-h-80 p-6 sm:p-8">
          <p className="eyebrow">MATCH FORMAT</p>
          <h2 className="mt-2 text-3xl font-black">Match setup</h2>
          <p className="mt-4 max-w-md leading-7 text-stone-200">
            The selected CPU profile is sent with match creation. The current API returns the
            initial state and does not execute CPU turns yet, so the profile does not alter this
            screen's state.
          </p>
          <ul className="mt-7 space-y-3 text-sm text-stone-200">
            <li className="flex gap-3">
              <BadgeCheck size={18} className="text-cyan-200" aria-hidden="true" />
              Owned deck only
            </li>
            <li className="flex gap-3">
              <BadgeCheck size={18} className="text-cyan-200" aria-hidden="true" />
              Server-created initial state
            </li>
            <li className="flex gap-3">
              <BadgeCheck size={18} className="text-cyan-200" aria-hidden="true" />
              Replay-ready match state
            </li>
          </ul>
        </article>
      </section>
    </>
  );
}

function CpuBattlePage() {
  const { matchId = '' } = useParams();
  const location = useLocation();
  const playerId = useSessionStore((state) => state.playerId)!;
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const started = (location.state as { readonly match?: CpuMatch } | null)?.match;
  const remoteMatch = useQuery({
    queryKey: ['match', playerId, matchId, previewMode],
    queryFn: () => client.match(playerId, matchId),
    enabled: started === undefined,
  });
  const state = started?.state ?? remoteMatch.data?.finalState ?? remoteMatch.data?.initialState;
  if (remoteMatch.isLoading && state === undefined)
    return <LoadingNotice title="Loading battle state" />;
  if (remoteMatch.isError) return <ApiFailure error={remoteMatch.error} />;
  if (state === null || state === undefined)
    return (
      <AsyncNotice kind="empty" title="Match state is not available">
        This match has no final state yet. Return to the CPU setup to launch a fresh practice match.
      </AsyncNotice>
    );
  return (
    <BattleBoard
      state={state}
      {...(started?.difficulty === undefined ? {} : { difficulty: started.difficulty })}
    />
  );
}

function ResultPage() {
  const { matchId = '' } = useParams();
  const playerId = useSessionStore((state) => state.playerId)!;
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const match = useQuery({
    queryKey: ['match', playerId, matchId, previewMode],
    queryFn: () => client.match(playerId, matchId),
  });
  if (match.isLoading) return <LoadingNotice title="Loading result" />;
  if (match.isError) return <ApiFailure error={match.error} />;
  const state = match.data?.finalState;
  const abandoned = match.data?.status === 'ABANDONED';
  return (
    <>
      <PageHeading
        eyebrow="MATCH RESULT"
        title={resultTitle(match.data?.status)}
        description="The server owns results. This view only renders persisted match data."
      />
      {state === null || state === undefined ? (
        <AsyncNotice kind="empty" title={abandoned ? 'Battle abandoned' : 'No final result yet'}>
          {abandoned
            ? 'This match was abandoned before a final result was persisted.'
            : 'The match is still in progress or has no persisted final state.'}
        </AsyncNotice>
      ) : (
        <BattleBoard state={state} />
      )}
    </>
  );
}

function BattleBoard({
  state,
  difficulty,
}: {
  readonly state: BattleState;
  readonly difficulty?: CpuMatch['difficulty'];
}) {
  const player = state.players[0];
  const opponent = state.players[1];
  if (player === undefined || opponent === undefined)
    return (
      <AsyncNotice kind="error" title="Invalid battle state">
        The server response did not include two players.
      </AsyncNotice>
    );
  return (
    <>
      <PageHeading
        eyebrow={difficulty === undefined ? 'PERSISTED STATE' : `${difficulty} CPU`}
        title="CPU arena"
        description={`Turn ${String(state.turn)} - ${state.phase.replaceAll('_', ' ').toLowerCase()}`}
      />
      <section className="battle-board mt-7" aria-label="Battle state">
        <Combatant label="Opponent" player={opponent} tone="enemy" />
        <div className="battle-field">
          <p className="eyebrow">BATTLE FIELD</p>
          <div className="battle-ring" aria-hidden="true" />
          <p className="mt-4 text-center text-sm text-stone-300">
            Server state is displayed here. Player action controls arrive with the multiplayer
            battle protocol.
          </p>
        </div>
        <Combatant label="You" player={player} tone="player" />
      </section>
      <section className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Hand</h2>
          <span className="text-sm text-stone-400">{String(player.hand.length)} cards</span>
        </div>
        <div className="hand-row mt-3">
          {player.hand.length === 0 ? (
            <AsyncNotice kind="empty" title="No cards in hand">
              The initial state did not draw any cards.
            </AsyncNotice>
          ) : (
            player.hand.map((card) => (
              <article className="hand-card" key={card.id}>
                <p className="text-xs font-semibold text-amber-200">CARD</p>
                <p className="mt-5 font-bold text-stone-50">{card.definitionId}</p>
                <p className="mt-2 text-xs text-stone-400">Instance {card.id}</p>
              </article>
            ))
          )}
        </div>
      </section>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link className="hero-command" to={`/result/${state.matchId}`}>
          <Trophy size={18} aria-hidden="true" />
          View result
        </Link>
        <Link className="hero-secondary" to="/battle/cpu">
          Start another
        </Link>
      </div>
    </>
  );
}

function Combatant({
  label,
  player,
  tone,
}: {
  readonly label: string;
  readonly player: BattleState['players'][number];
  readonly tone: 'player' | 'enemy';
}) {
  return (
    <article
      className={classNames('combatant', tone === 'enemy' ? 'combatant-enemy' : 'combatant-player')}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{label}</p>
          <p className="mt-1 font-bold text-stone-50">{player.id}</p>
        </div>
        <Shield
          size={22}
          className={tone === 'enemy' ? 'text-rose-300' : 'text-cyan-200'}
          aria-hidden="true"
        />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <Metric label="HP" value={`${String(player.hp)}/${String(player.maxHp)}`} />
        <Metric label="Block" value={String(player.block)} />
        <Metric label="Energy" value={`${String(player.energy)}/${String(player.maxEnergy)}`} />
      </div>
      {player.statuses.length > 0 ? (
        <p className="mt-4 text-xs text-stone-300">
          Statuses:{' '}
          {player.statuses.map((status) => `${status.id} x${String(status.stacks)}`).join(', ')}
        </p>
      ) : null}
    </article>
  );
}

function CardTile({ card }: { readonly card: CardSummary }) {
  const definition = card.definition;
  return (
    <Link to={cardDetailHref(card)} className="card-tile">
      <div className="flex items-start justify-between gap-3">
        <span className="rarity-chip">{definition.rarity}</span>
        <span className="cost-orb" aria-label={`Cost ${String(definition.cost)}`}>
          {definition.cost}
        </span>
      </div>
      <div className="mt-10">
        <p className="text-xs font-bold tracking-wide text-cyan-200">
          {definition.class} - {definition.type}
        </p>
        <h2 className="mt-2 text-xl font-black text-stone-50">{definition.name}</h2>
        <p className="mt-3 text-sm leading-6 text-stone-300">{definition.description}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {definition.keywords.map((keyword) => (
          <span className="keyword-chip" key={keyword}>
            {keyword}
          </span>
        ))}
      </div>
    </Link>
  );
}

export function cardDetailHref(card: Pick<CardSummary, 'cardId' | 'version'>): string {
  return `/cards/${encodeURIComponent(card.cardId)}?version=${encodeURIComponent(card.version)}`;
}

function CardDetail({ card }: { readonly card: CardSummary }) {
  const definition = card.definition;
  return (
    <section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
      <CardTile card={card} />
      <article className="surface-panel p-6 sm:p-8">
        <Link to="/cards" className="quiet-link">
          <ChevronRight className="rotate-180" size={16} aria-hidden="true" />
          Card library
        </Link>
        <p className="eyebrow mt-8">CARD DETAIL</p>
        <h1 className="mt-2 text-4xl font-black">{definition.name}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-200">{definition.description}</p>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Class" value={definition.class} />
          <Metric label="Type" value={definition.type} />
          <Metric label="Rarity" value={definition.rarity} />
          <Metric label="Version" value={card.version} />
        </div>
      </article>
    </section>
  );
}

function DeckTile({ deck }: { readonly deck: Deck }) {
  return (
    <article className="surface-panel p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">SAVED DECK</p>
          <h2 className="mt-2 text-2xl font-black text-stone-50">{deck.name}</h2>
        </div>
        <span className="rounded-md border border-amber-300/40 px-2 py-1 text-xs font-bold text-amber-100">
          {String(deckCardTotal(deck))}/30
        </span>
      </div>
      <p className="mt-3 text-sm text-stone-300">
        {String(deck.cards.length)} distinct card versions - {deck.cardDataVersion}
      </p>
      <div className="mt-6 flex gap-3">
        <Link className="hero-secondary" to={`/decks/${deck.id}`}>
          Inspect
        </Link>
        <Link
          className="quiet-link self-center"
          to={`/battle/cpu?deck=${encodeURIComponent(deck.id)}`}
        >
          CPU practice <ChevronRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function QuickLink({
  to,
  icon,
  title,
  text,
}: {
  readonly to: string;
  readonly icon: ReactNode;
  readonly title: string;
  readonly text: string;
}) {
  return (
    <Link to={to} className="quick-link">
      <span className="text-cyan-200">{icon}</span>
      <h2 className="mt-4 font-bold text-stone-50">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-300">{text}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-amber-200">
        Open <ChevronRight size={16} aria-hidden="true" />
      </span>
    </Link>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <header className="max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-black text-stone-50 sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm leading-7 text-stone-300 sm:text-base">{description}</p>
    </header>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
    </div>
  );
}

export function isCpuReadyDeck(deck: Deck): boolean {
  return deckCardTotal(deck) === 30;
}

export function deckBuilderCopyLimit(card: OwnedCard): number {
  return Math.min(card.quantity, card.cardVersion.definition.deckLimit ?? 3, 3);
}

export function deckBuilderCardTotal(quantities: Readonly<Record<string, number>>): number {
  return Object.values(quantities).reduce((total, quantity) => total + quantity, 0);
}

export function deckBuilderInput(
  name: string,
  cardDataVersion: string,
  cards: readonly OwnedCard[],
  quantities: Readonly<Record<string, number>>,
): DeckInput {
  const selected = cards.flatMap((card) => {
    const quantity = quantities[card.cardVersionId] ?? 0;
    return quantity === 0 ? [] : [{ cardVersionId: card.cardVersionId, quantity }];
  });
  return {
    name: name.trim(),
    cardDataVersion,
    cards: selected.map((card, position) => ({ ...card, position })),
  };
}

export function loginReturnPath(value: string | null): string {
  return value !== null && /^\/(?!\/)[^\\]*$/u.test(value) ? value : '/home';
}

export function resultTitle(status: string | undefined): string {
  if (status === 'COMPLETED') return 'Battle complete';
  if (status === 'ABANDONED') return 'Battle abandoned';
  return 'Battle in progress';
}

export function canOpenOfflinePreview(error: Error): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500);
}

function LoadingNotice({ title }: { readonly title: string }) {
  return (
    <AsyncNotice kind="loading" title={title}>
      <span className="inline-flex items-center gap-2">
        <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
        Working with the arena.
      </span>
    </AsyncNotice>
  );
}

function ApiFailure({
  error,
  onPreview,
  onRetry,
}: {
  readonly error: Error;
  readonly onPreview?: () => void;
  readonly onRetry?: () => void;
}) {
  const unavailable = error instanceof ApiError && (error.status === 0 || error.status >= 500);
  const description =
    error instanceof ApiError && error.code === 'API_UNAVAILABLE'
      ? 'The API is not running at the configured address.'
      : error instanceof ApiError && error.code === 'REQUEST_FAILED'
        ? 'The API proxy could not reach a running server.'
        : error instanceof ApiError
          ? `The API rejected this request: ${error.code} (${String(error.status)}).`
          : 'The service could not be reached.';
  const advice = unavailable
    ? 'Check that the API is running, then try again.'
    : 'Review the request details and your session, then try again.';
  return (
    <AsyncNotice kind="error" title="Unable to load this view">
      <p>
        {description} {advice}
      </p>
      {onPreview === undefined && onRetry === undefined ? null : (
        <div className="mt-4 flex flex-wrap gap-3">
          {onRetry === undefined ? null : (
            <ActionButton tone="quiet" onClick={onRetry}>
              <RotateCcw size={17} aria-hidden="true" />
              Try again
            </ActionButton>
          )}
          {onPreview === undefined ? null : (
            <ActionButton tone="quiet" onClick={onPreview}>
              <Sparkles size={17} aria-hidden="true" />
              Open offline preview
            </ActionButton>
          )}
        </div>
      )}
    </AsyncNotice>
  );
}

function useApiClient(): DeckDriveClient {
  const previewMode = useSessionStore((state) => state.previewMode);
  return previewMode ? previewApi : api;
}

function formatBalances(balances: Readonly<Record<string, number>> | undefined): string {
  if (balances === undefined) return 'Balances loading';
  return `${String(balances.GEM ?? 0)} gems - ${String(balances.EXCHANGE_POINT ?? 0)} exchange`;
}

function deckCardTotal(deck: Deck): number {
  return deck.cards.reduce((total, card) => total + card.quantity, 0);
}
