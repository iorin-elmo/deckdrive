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
  Palette,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { maximumCardCopies } from '@deck-drive/card-definitions';
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
  type PackOpening,
} from './api.js';
import { useSessionStore } from './store.js';
import {
  I18nProvider,
  localizeCard,
  localizeBattlePhase,
  localizeCardMetadata,
  localizePurchaseFrequencyPeriod,
  localizeValue,
  localizedCardName,
  useI18n,
} from './i18n.js';

const navigation = [
  { to: '/home', labelKey: 'navHome', icon: Sparkles },
  { to: '/cards', labelKey: 'navCards', icon: LibraryBig },
  { to: '/decks', labelKey: 'navDecks', icon: BookOpen },
  { to: '/packs', labelKey: 'navPacks', icon: Trophy },
  { to: '/missions', labelKey: 'navMissions', icon: BadgeCheck },
  { to: '/battle/cpu', labelKey: 'navCpu', icon: Swords },
  { to: '/settings', labelKey: 'navSettings', icon: SettingsIcon },
] as const;

export function App() {
  return (
    <I18nProvider>
      <Routes>
        <Route path="/" element={<TitlePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cards" element={<PublicCardsPage />} />
        <Route path="/cards/:cardId" element={<PublicCardDetailPage />} />
        <Route element={<AuthenticatedLayout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/decks" element={<DecksPage />} />
          <Route path="/decks/new" element={<DeckBuilderPage />} />
          <Route path="/decks/:deckId" element={<DeckDetailPage />} />
          <Route path="/decks/:deckId/edit" element={<DeckBuilderPage />} />
          <Route path="/packs" element={<PacksPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/battle/cpu" element={<CpuSetupPage />} />
          <Route path="/battle/cpu/:matchId" element={<CpuBattlePage />} />
          <Route path="/result/:matchId" element={<ResultPage />} />
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </I18nProvider>
  );
}

function TitlePage() {
  const playerId = useSessionStore((state) => state.playerId);
  const { t } = useI18n();
  return (
    <main className="title-scene min-h-screen px-5 py-6 text-stone-100">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col justify-between gap-12">
        <header className="flex items-center justify-between">
          <span className="text-sm font-bold tracking-[0.18em] text-cyan-200">DECKDRIVE</span>
          <Link className="quiet-link" to={playerId === null ? '/login' : '/home'}>
            {playerId === null ? t('developmentLogin') : t('enterGame')}
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </header>
        <section className="max-w-2xl pb-8 sm:pb-16">
          <p className="mb-4 text-sm font-semibold tracking-[0.14em] text-amber-200">
            {t('titleEyebrow')}
          </p>
          <h1 className="max-w-xl text-5xl font-black tracking-normal text-stone-50 sm:text-7xl">
            {t('titleHeadline').split('\n').at(0)}
            <br />
            {t('titleHeadline').split('\n').at(1)}
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-stone-200 sm:text-lg">
            {t('titleDescription')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="hero-command" to={playerId === null ? '/login' : '/home'}>
              <Play size={18} fill="currentColor" aria-hidden="true" />
              {playerId === null ? t('startDevelopment') : t('continue')}
            </Link>
            <Link className="hero-secondary" to="/cards">
              {t('exploreCards')}
            </Link>
          </div>
        </section>
        <LanguageControl className="self-start" />
        <footer className="flex flex-wrap gap-x-8 gap-y-2 text-xs font-medium tracking-wide text-stone-300">
          <span>{t('titleFooterCpu')}</span>
          <span>{t('titleFooterDecks')}</span>
          <span>{t('titleFooterRules')}</span>
        </footer>
      </div>
    </main>
  );
}

function SettingsPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeading
        eyebrow={t('settingsEyebrow')}
        title={t('settings')}
        description={t('settingsDescription')}
      />
      <section className="surface-panel mt-7 max-w-xl p-6">
        <LanguageControl />
      </section>
    </>
  );
}

function LanguageControl({ className }: { readonly className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={classNames('field-label', className)}>
      {t('language')}
      <select value={locale} onChange={(event) => setLocale(event.target.value as 'en' | 'ja')}>
        <option value="en">{t('english')}</option>
        <option value="ja">{t('japanese')}</option>
      </select>
    </label>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setPlayerId = useSessionStore((state) => state.setPlayerId);
  const enablePreview = useSessionStore((state) => state.enablePreview);
  const { t } = useI18n();
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
          {t('backToTitle')}
        </Link>
        <p className="eyebrow">{t('developmentAccess')}</p>
        <h1 id="login-title" className="mt-2 text-3xl font-black text-stone-50">
          {t('enterArena')}
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-300">{t('developmentLoginDescription')}</p>
        <form
          className="mt-7 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <label className="field-label">
            {t('email')}
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="field-label">
            {t('displayName')}
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
            {t('signInDevelopment')}
          </ActionButton>
        </form>
      </section>
    </main>
  );
}

function PublicCardLayout({ children }: { children: ReactNode }) {
  const playerId = useSessionStore((state) => state.playerId);
  const previewMode = useSessionStore((state) => state.previewMode);
  const { t } = useI18n();
  return (
    <div className="app-background min-h-screen text-stone-100">
      <header className="border-b border-stone-800 bg-zinc-950/90">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="font-black tracking-[0.16em] text-cyan-200">
            DECKDRIVE
          </Link>
          <div className="flex items-center gap-3">
            {previewMode ? (
              <span className="rounded border border-amber-300/40 px-2 py-1 text-xs font-bold text-amber-100">
                {t('offlinePreview')}
              </span>
            ) : null}
            <Link className="quiet-link" to={playerId === null ? '/login' : '/home'}>
              {playerId === null ? t('developmentLogin') : t('enterGame')}
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}

function PublicCardsPage() {
  return (
    <PublicCardLayout>
      <CardsPage />
    </PublicCardLayout>
  );
}

function PublicCardDetailPage() {
  return (
    <PublicCardLayout>
      <CardDetailPage />
    </PublicCardLayout>
  );
}

function AuthenticatedLayout() {
  const location = useLocation();
  const playerId = useSessionStore((state) => state.playerId);
  const previewMode = useSessionStore((state) => state.previewMode);
  const clearPlayerId = useSessionStore((state) => state.clearPlayerId);
  const queryClient = useQueryClient();
  const client = useApiClient();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const player = useQuery({
    queryKey: ['me', playerId, previewMode],
    queryFn: () => client.me(playerId!),
    enabled: playerId !== null,
  });
  const unauthorized = isUnauthorizedApiError(player.error);
  useEffect(() => {
    if (!unauthorized) return;
    queryClient.clear();
    clearPlayerId();
  }, [clearPlayerId, queryClient, unauthorized]);
  const signOut = () => {
    queryClient.clear();
    clearPlayerId();
  };
  if (playerId === null) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate replace to={`/login?returnTo=${encodeURIComponent(returnTo)}`} />;
  }
  if (unauthorized) {
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
          {previewMode ? (
            <span className="ml-auto rounded border border-amber-300/40 px-2 py-1 text-xs font-bold text-amber-100 sm:hidden">
              {t('offlinePreview')}
            </span>
          ) : null}
          <ActionButton
            tone="quiet"
            className="sm:hidden"
            aria-label={menuOpen ? t('closeNavigation') : t('openNavigation')}
            aria-controls="primary-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </ActionButton>
          <nav
            id="primary-navigation"
            aria-label={t('primaryNavigation')}
            className={classNames(
              'items-center gap-1 sm:flex',
              menuOpen
                ? 'absolute inset-x-4 top-16 z-10 flex flex-col items-stretch border border-stone-700 bg-zinc-950 p-3 shadow-2xl sm:static sm:flex-row sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none'
                : 'hidden',
            )}
          >
            {navigation.map(({ to, labelKey, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => classNames('nav-link', isActive && 'nav-link-active')}
              >
                <Icon size={16} aria-hidden="true" />
                {t(labelKey)}
              </NavLink>
            ))}
            <button className="nav-link sm:ml-3" type="button" onClick={signOut}>
              <DoorOpen size={16} aria-hidden="true" />
              {t('signOut')}
            </button>
          </nav>
          <div className="hidden text-right text-xs sm:block">
            <p className="font-semibold text-stone-100">
              {player.data?.displayName ?? t('loadingPlayer')}
            </p>
            <p className="text-amber-200">
              {previewMode ? t('offlinePreview') : formatBalances(player.data?.balances, t)}
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
        {player.isError ? <ApiFailure error={player.error} /> : <Outlet />}
      </main>
    </div>
  );
}

function HomePage() {
  const playerId = useSessionStore((state) => state.playerId)!;
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const { t } = useI18n();
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
        eyebrow={t('homeEyebrow')}
        title={t('homeTitle')}
        description={t('homeDescription')}
      />
      <section className="mt-8 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <article className="arena-panel min-h-72 p-6 sm:p-8">
          <div className="max-w-md">
            <p className="eyebrow">{t('nextPractice')}</p>
            <h2 className="mt-2 text-3xl font-black text-stone-50">{t('cpuArena')}</h2>
            <p className="mt-3 leading-7 text-stone-200">{t('cpuArenaDescription')}</p>
            <Link className="hero-command mt-7" to="/battle/cpu">
              <Crosshair size={18} aria-hidden="true" />
              {t('startCpuMatch')}
            </Link>
          </div>
        </article>
        <article className="surface-panel p-6">
          <p className="eyebrow">{t('playerStatus')}</p>
          {player.isLoading ? <LoadingNotice title={t('loadingPlayer')} /> : null}
          {player.data ? (
            <div className="mt-5 space-y-5">
              <div>
                <p className="text-2xl font-black">{player.data.displayName}</p>
                <p className="mt-1 text-sm text-stone-400">{t('developmentProfile')}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Metric label={t('gems')} value={String(player.data.balances.GEM ?? 0)} />
                <Metric
                  label={t('exchange')}
                  value={String(player.data.balances.EXCHANGE_POINT ?? 0)}
                />
              </div>
            </div>
          ) : null}
        </article>
      </section>
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <QuickLink
          to="/cards"
          icon={<LibraryBig size={20} aria-hidden="true" />}
          title={t('cardLibrary')}
          text={t('cardLibraryDescription')}
        />
        <QuickLink
          to="/decks"
          icon={<BookOpen size={20} aria-hidden="true" />}
          title={t('deckWorkshop')}
          text={
            decks.isError
              ? t('deckUnavailable')
              : decks.data === undefined
                ? t('loadingDecks')
                : t(decks.data.length === 1 ? 'deckReady' : 'decksReady').replace(
                    '{count}',
                    String(decks.data.length),
                  )
          }
        />
        <QuickLink
          to="/battle/cpu"
          icon={<Swords size={20} aria-hidden="true" />}
          title={t('cpuBattle')}
          text={t('cpuBattleDescription')}
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

function MissionsPage() {
  const playerId = useSessionStore((state) => state.playerId)!;
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const missions = useQuery({
    queryKey: ['missions', playerId, previewMode],
    queryFn: () => client.missions(playerId),
  });
  const progression = useQuery({
    queryKey: ['progression', playerId, previewMode],
    queryFn: () => client.progression(playerId),
  });
  const cosmetics = useQuery({
    queryKey: ['cosmetics', playerId, previewMode],
    queryFn: () => client.cosmetics(playerId),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['missions', playerId, previewMode] }),
      queryClient.invalidateQueries({ queryKey: ['progression', playerId, previewMode] }),
      queryClient.invalidateQueries({ queryKey: ['me', playerId, previewMode] }),
      queryClient.invalidateQueries({ queryKey: ['cosmetics', playerId, previewMode] }),
    ]);
  const claimMission = useMutation({
    mutationFn: (missionId: string) => client.claimMission(playerId, missionId),
    onSuccess: refresh,
  });
  const claimLogin = useMutation({
    mutationFn: () => client.claimLoginReward(playerId),
    onSuccess: refresh,
  });
  const lastLogin = progression.data?.lastLoginClaim;
  const loginAlreadyClaimed = lastLogin !== null && lastLogin !== undefined;

  return (
    <>
      <PageHeading
        eyebrow={t('missions')}
        title={t('missionHub')}
        description={t('missionHubDescription')}
      />
      <section className="mt-8 grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
        <article className="surface-panel p-6">
          <p className="eyebrow">{t('loginRewards')}</p>
          <p className="mt-3 text-sm leading-6 text-stone-300">{t('loginRewardDescription')}</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Metric label={t('level')} value={String(progression.data?.level ?? '-')} />
            <Metric label={t('experience')} value={String(progression.data?.experience ?? '-')} />
          </div>
          <ActionButton
            className="mt-5 w-full"
            disabled={loginAlreadyClaimed || claimLogin.isPending}
            onClick={() => claimLogin.mutate()}
          >
            {loginAlreadyClaimed ? t('claimedToday') : t('claimLogin')}
          </ActionButton>
          {claimLogin.isError ? (
            <div className="mt-4">
              <ApiFailure error={claimLogin.error} />
            </div>
          ) : null}
        </article>
        <article className="surface-panel p-6">
          <p className="eyebrow">{t('missions')}</p>
          {missions.isLoading ? <LoadingNotice title={t('missions')} /> : null}
          {missions.isError ? (
            <ApiFailure error={missions.error} onRetry={() => void missions.refetch()} />
          ) : null}
          <div className="mt-4 space-y-3">
            {missions.data?.map((mission) => {
              const complete = mission.progress >= mission.target;
              const claimed = mission.claimedAt !== null;
              return (
                <div
                  className="rounded-lg border border-stone-700 bg-zinc-950/40 p-4"
                  key={mission.id}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-stone-100">{mission.id}</p>
                      <p className="mt-1 text-sm text-stone-400">
                        {localizeValue(mission.cadence, locale)} ·{' '}
                        {mission.metric.replaceAll('_', ' ')}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-amber-200">
                      {String(mission.reward.amount)}{' '}
                      {mission.reward.currency === 'GEM' ? t('gems') : t('exchange')}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-sm text-stone-300">
                      {String(mission.progress)} / {String(mission.target)}
                    </span>
                    <ActionButton
                      tone="quiet"
                      disabled={!complete || claimed || claimMission.isPending}
                      onClick={() => claimMission.mutate(mission.id)}
                    >
                      {claimed ? t('claimed') : complete ? t('claim') : t('inProgress')}
                    </ActionButton>
                  </div>
                </div>
              );
            })}
          </div>
          {claimMission.isError ? (
            <div className="mt-4">
              <ApiFailure error={claimMission.error} />
            </div>
          ) : null}
        </article>
      </section>
      <section className="mt-8">
        <p className="eyebrow">{t('cosmetics')}</p>
        <h2 className="mt-2 text-3xl font-black">{t('cosmetics')}</h2>
        <p className="mt-3 text-sm text-stone-300">{t('cosmeticsDescription')}</p>
        {cosmetics.isError ? (
          <div className="mt-4">
            <ApiFailure error={cosmetics.error} onRetry={() => void cosmetics.refetch()} />
          </div>
        ) : null}
        {cosmetics.data?.length === 0 ? (
          <p className="mt-5 text-stone-400">{t('noCosmetics')}</p>
        ) : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cosmetics.data?.map((cosmetic) => (
            <article className="surface-panel p-5" key={cosmetic.id}>
              <Palette className="text-cyan-200" size={20} aria-hidden="true" />
              <p className="mt-5 text-xs font-bold tracking-wide text-amber-200">
                {cosmetic.kind.replaceAll('_', ' ')}
              </p>
              <h3 className="mt-2 text-xl font-black">{cosmetic.name}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-300">{cosmetic.description}</p>
              <p className="mt-4 text-xs text-stone-400">
                {cosmetic.acquiredAt === null ? t('inProgress') : t('claimed')}
              </p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function CardsPage() {
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const { locale, t } = useI18n();
  const cards = useQuery({ queryKey: ['cards', previewMode], queryFn: () => client.cards() });
  const [search, setSearch] = useState('');
  const visibleCards = cards.data?.filter((card) => {
    const localText = localizeCard(card.definition, locale);
    const searchableText =
      `${localText.name} ${localText.description} ${localizeCardMetadata(card.definition.class, locale)} ${localizeCardMetadata(card.definition.type, locale)} ${localizeCardMetadata(card.definition.rarity, locale)}`.toLowerCase();
    return searchableText.includes(search.trim().toLowerCase());
  });
  return (
    <>
      <PageHeading
        eyebrow={t('reference')}
        title={t('cardLibraryTitle')}
        description={t('cardLibraryDescriptionLong')}
      />
      <label className="search-field mt-7">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">{t('searchCards')}</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('searchCards')}
        />
      </label>
      <section aria-live="polite" className="mt-6">
        {cards.isLoading ? <LoadingNotice title={t('loadingCardLibrary')} /> : null}
        {cards.isError ? <ApiFailure error={cards.error} /> : null}
        {visibleCards?.length === 0 ? (
          <AsyncNotice kind="empty" title={t('noMatchingCards')}>
            {t('noMatchingCardsDescription')}
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
  const { t } = useI18n();
  const cards = useQuery({ queryKey: ['cards', previewMode], queryFn: () => client.cards() });
  const card = cards.data
    ? selectCardSummary(cards.data, cardId, searchParams.get('version'))
    : undefined;
  if (cards.isLoading) return <LoadingNotice title={t('loadingCard')} />;
  if (cards.isError) return <ApiFailure error={cards.error} />;
  if (card === undefined)
    return (
      <AsyncNotice kind="empty" title={t('cardNotFound')}>
        <Link className="quiet-link mt-3" to="/cards">
          {t('returnToCardLibrary')}
        </Link>
      </AsyncNotice>
    );
  return <CardDetail card={card} />;
}

function PacksPage() {
  const playerId = useSessionStore((state) => state.playerId)!;
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const [opening, setOpening] = useState<PackOpening | null>(null);
  const openingIdempotencyKeys = useRef(new Map<string, string>());
  const packs = useQuery({
    queryKey: ['packs', playerId, previewMode],
    queryFn: () => client.packs(playerId),
  });
  const open = useMutation({
    mutationFn: (productId: Parameters<DeckDriveClient['openPack']>[1]) => {
      let idempotencyKey = openingIdempotencyKeys.current.get(productId);
      if (idempotencyKey === undefined) {
        idempotencyKey = crypto.randomUUID();
        openingIdempotencyKeys.current.set(productId, idempotencyKey);
      }
      return client.openPack(playerId, productId, idempotencyKey);
    },
    onSuccess: (result, productId) => {
      openingIdempotencyKeys.current.delete(productId);
      setOpening(result);
      void queryClient.invalidateQueries({ queryKey: ['me', playerId, previewMode] });
      void queryClient.invalidateQueries({ queryKey: ['collection', playerId, previewMode] });
    },
  });
  return (
    <>
      <PageHeading
        eyebrow={t('packVault')}
        title={t('openPacks')}
        description={t('packDescription')}
      />
      {packs.isLoading ? (
        <div className="mt-7">
          <LoadingNotice title={t('loadingPacks')} />
        </div>
      ) : null}
      {packs.isError ? (
        <div className="mt-7">
          <ApiFailure error={packs.error} onRetry={() => void packs.refetch()} />
        </div>
      ) : null}
      <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {packs.data?.map((product) => (
          <article key={product.id} className="surface-panel p-5">
            <p className="eyebrow">
              {product.limit === null
                ? t('standard')
                : t('limited').replace('{period}', localizeValue(product.limit.period, locale))}
            </p>
            <h2 className="mt-2 text-xl font-black text-stone-50">
              {localizeValue(product.id, locale)}
            </h2>
            <p className="mt-2 text-sm text-amber-200">
              {t('gemsCost').replace('{count}', String(product.gemCost))}
            </p>
            {product.limit === null ? null : (
              <p className="mt-2 text-sm text-stone-300">
                {t('purchaseLimit')
                  .replace('{count}', String(product.limit.maximum))
                  .replace(
                    '{period}',
                    localizePurchaseFrequencyPeriod(product.limit.period, locale),
                  )}
              </p>
            )}
            <ActionButton
              className="mt-5 w-full"
              disabled={open.isPending}
              onClick={() => open.mutate(product.id)}
            >
              {open.isPending ? (
                <LoaderCircle className="animate-spin" size={17} aria-hidden="true" />
              ) : (
                <Trophy size={17} aria-hidden="true" />
              )}
              {t('openPack')}
            </ActionButton>
          </article>
        ))}
      </section>
      {open.isError ? (
        <div className="mt-6">
          <ApiFailure error={open.error} />
        </div>
      ) : null}
      {opening === null ? null : (
        <section className="surface-panel mt-7 p-6" aria-live="polite">
          <p className="eyebrow">{t('opened')}</p>
          <h2 className="mt-2 text-2xl font-black">
            {t('cardsReceived').replace('{count}', String(opening.cards.length))}
          </h2>
          <p className="mt-2 text-sm text-stone-300">
            {t('packResult')
              .replace('{gems}', String(opening.gemCost))
              .replace('{points}', String(opening.exchangePoints))}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {opening.cards.map((card, index) => (
              <span
                key={`${card.id}-${String(index)}`}
                className="rounded border border-cyan-300/40 px-3 py-2 text-sm font-bold text-cyan-100"
              >
                {t('cardRarity').replace('{rarity}', localizeCardMetadata(card.rarity, locale))}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function DecksPage() {
  const playerId = useSessionStore((state) => state.playerId)!;
  const previewMode = useSessionStore((state) => state.previewMode);
  const client = useApiClient();
  const { t } = useI18n();
  const decks = useQuery({
    queryKey: ['decks', playerId, previewMode],
    queryFn: () => client.decks(playerId),
  });
  return (
    <>
      <PageHeading eyebrow={t('workshop')} title={t('decks')} description={t('decksDescription')} />
      <Link className="hero-command mt-6" to="/decks/new">
        <Plus size={18} aria-hidden="true" />
        {t('buildDeck')}
      </Link>
      <section className="mt-7" aria-live="polite">
        {decks.isLoading ? <LoadingNotice title={t('loadingDecks')} /> : null}
        {decks.isError ? <ApiFailure error={decks.error} /> : null}
        {decks.data?.length === 0 ? (
          <AsyncNotice kind="empty" title={t('noDecks')}>
            {t('noDecksDescription')}
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
  const { locale, t } = useI18n();
  const decks = useQuery({
    queryKey: ['decks', playerId, previewMode],
    queryFn: () => client.decks(playerId),
  });
  const deck = decks.data?.find((candidate) => candidate.id === deckId);
  if (decks.isLoading) return <LoadingNotice title={t('loadingDeck')} />;
  if (decks.isError) return <ApiFailure error={decks.error} />;
  if (deck === undefined)
    return (
      <AsyncNotice kind="empty" title={t('deckNotFound')}>
        <Link className="quiet-link mt-3" to="/decks">
          {t('returnToDecks')}
        </Link>
      </AsyncNotice>
    );
  return (
    <>
      <PageHeading
        eyebrow={t('deckDetail')}
        title={deck.name}
        description={t('deckSummary')
          .replace('{count}', String(deckCardTotal(deck)))
          .replace('{version}', deck.cardDataVersion)}
      />
      <section className="mt-7 grid gap-4 lg:grid-cols-[1fr_0.4fr]">
        <div className="surface-panel overflow-hidden">
          <table className="deck-table">
            <thead>
              <tr>
                <th>{t('card')}</th>
                <th>{t('cost').replace('{count}', '')}</th>
                <th>{t('copies')}</th>
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
                      {localizeCard(item.cardVersion.definition, locale).name}
                    </Link>
                    <span>{localizeCardMetadata(item.cardVersion.definition.type, locale)}</span>
                  </td>
                  <td>{item.cardVersion.definition.cost}</td>
                  <td>{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="surface-panel p-6">
          <p className="eyebrow">{t('readyCheck')}</p>
          <p className="mt-4 text-3xl font-black">
            {String(deckCardTotal(deck))}
            <span className="text-base font-medium text-stone-400"> {t('cardsOutOfThirty')}</span>
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-300">{t('deckReadyDescription')}</p>
          <Link
            className="hero-command mt-6"
            to={`/battle/cpu?deck=${encodeURIComponent(deck.id)}`}
          >
            <Play size={17} fill="currentColor" aria-hidden="true" />
            {t('useForCpu')}
          </Link>
          <Link className="hero-secondary mt-3" to={`/decks/${encodeURIComponent(deck.id)}/edit`}>
            {t('editDeck')}
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
  const { locale, t } = useI18n();
  const decks = useQuery({
    queryKey: ['decks', playerId, previewMode],
    queryFn: () => client.decks(playerId),
  });
  const collection = useQuery({
    queryKey: ['collection', playerId, previewMode],
    queryFn: () => client.collection(playerId),
  });
  const deck = decks.data?.find((candidate) => candidate.id === deckId);
  const defaultDeckName = t('newDeck');
  const [name, setName] = useState(defaultDeckName);
  const [quantities, setQuantities] = useState<Readonly<Record<string, number>>>({});
  const initializedDeckId = useRef<string | null | undefined>(null);
  const newDeckNameEdited = useRef(false);

  useEffect(() => {
    if (initializedDeckId.current === deckId) return;
    if (deckId === undefined) {
      setName(defaultDeckName);
      newDeckNameEdited.current = false;
      setQuantities({});
      initializedDeckId.current = deckId;
      return;
    }
    if (deck === undefined) return;
    setName(deck.name);
    setQuantities(
      Object.fromEntries(deck.cards.map((card) => [card.cardVersionId, card.quantity])),
    );
    initializedDeckId.current = deckId;
  }, [deck, deckId, defaultDeckName]);

  useEffect(() => {
    if (deckId !== undefined || newDeckNameEdited.current) return;
    setName(defaultDeckName);
  }, [deckId, defaultDeckName]);

  const cardDataVersion = deck?.cardDataVersion ?? collection.data?.cardDataVersion;
  const ownedCards = deckBuilderCardsForVersion(collection.data?.cards ?? [], cardDataVersion);
  const total = deckBuilderCardTotal(quantities);
  const save = useMutation({
    mutationFn: () => {
      if (cardDataVersion === undefined) throw new Error('Card data is not available.');
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

  if (decks.isLoading || collection.isLoading) return <LoadingNotice title={t('loadingDeck')} />;
  if (decks.isError) return <ApiFailure error={decks.error} onRetry={() => void decks.refetch()} />;
  if (collection.isError)
    return <ApiFailure error={collection.error} onRetry={() => void collection.refetch()} />;
  if (cardDataVersion === undefined)
    return <AsyncNotice kind="empty" title={t('cardDataUnavailable')} />;
  if (deckId !== undefined && deck === undefined)
    return (
      <AsyncNotice kind="empty" title={t('deckNotFound')}>
        <Link className="quiet-link mt-3" to="/decks">
          {t('returnToDecks')}
        </Link>
      </AsyncNotice>
    );
  if (ownedCards.length === 0)
    return (
      <AsyncNotice kind="empty" title={t('noCollectionCards')}>
        {t('noCollectionCardsDescription')}
      </AsyncNotice>
    );

  return (
    <>
      <PageHeading
        eyebrow={t('deckBuilder')}
        title={deck === undefined ? t('buildDeck') : t('editDeckName').replace('{name}', deck.name)}
        description={t('deckBuilderDescription')}
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
            {t('deckName')}
            <input
              value={name}
              onChange={(event) => {
                newDeckNameEdited.current = true;
                setName(event.target.value);
              }}
              maxLength={80}
              required
            />
          </label>
          <p className="eyebrow mt-7">{t('readyCheck')}</p>
          <p className="mt-3 text-4xl font-black text-stone-50">
            {String(total)}{' '}
            <span className="text-base font-medium text-stone-400">{t('cardsOutOfThirty')}</span>
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-300">{t('quantityDescription')}</p>
          {save.isError ? <ApiFailure error={save.error} /> : null}
          <ActionButton
            className="mt-7 w-full"
            type="submit"
            disabled={total !== 30 || name.trim().length === 0 || save.isPending}
          >
            <BookOpen size={18} aria-hidden="true" />
            {save.isPending
              ? t('savingDeck')
              : deck === undefined
                ? t('createDeck')
                : t('saveDeck')}
          </ActionButton>
          <Link className="quiet-link mt-4" to="/decks">
            {t('returnToDecks')}
          </Link>
        </aside>
        <section className="surface-panel overflow-hidden">
          <table className="deck-table">
            <thead>
              <tr>
                <th>{t('card')}</th>
                <th>{t('owned')}</th>
                <th>{t('copies')}</th>
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
                        {localizeCard(card.cardVersion.definition, locale).name}
                      </Link>
                      <span>{localizeCardMetadata(card.cardVersion.definition.type, locale)}</span>
                    </td>
                    <td>{String(card.quantity)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <ActionButton
                          tone="quiet"
                          type="button"
                          aria-label={t('removeCard').replace(
                            '{name}',
                            localizeCard(card.cardVersion.definition, locale).name,
                          )}
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
                          aria-label={t('cardCopies').replace(
                            '{name}',
                            localizeCard(card.cardVersion.definition, locale).name,
                          )}
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
                          aria-label={t('addCard').replace(
                            '{name}',
                            localizeCard(card.cardVersion.definition, locale).name,
                          )}
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
  const { locale, t } = useI18n();
  const decks = useQuery({
    queryKey: ['decks', playerId, previewMode],
    queryFn: () => client.decks(playerId),
  });
  const queryDeck = new URLSearchParams(location.search).get('deck');
  const [deckId, setDeckId] = useState(queryDeck ?? '');
  const [difficulty, setDifficulty] = useState<CpuMatch['difficulty']>('NORMAL');
  useEffect(() => {
    setDeckId(queryDeck ?? '');
  }, [queryDeck]);
  const playableDecks = (decks.data ?? []).filter(isCpuReadyDeck);
  const selectedDeck = playableDecks.some((deck) => deck.id === deckId);
  const start = useMutation({
    mutationFn: () => client.startCpuMatch(playerId, deckId, difficulty),
    onSuccess: (match) => navigate(`/battle/cpu/${match.id}`, { state: { match } }),
  });
  return (
    <>
      <PageHeading
        eyebrow={t('cpuPractice')}
        title={t('setChallenge')}
        description={t('setChallengeDescription')}
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
            <LoadingNotice title={t('loadingDecks')} />
          ) : decks.isError ? (
            <ApiFailure error={decks.error} onRetry={() => void decks.refetch()} />
          ) : playableDecks.length === 0 ? (
            <AsyncNotice kind="empty" title={t('noReadyDecks')}>
              {t('noReadyDecksDescription')}
              <Link className="quiet-link mt-3" to="/decks/new">
                {t('buildDeck')}
              </Link>
            </AsyncNotice>
          ) : (
            <label className="field-label">
              {t('deck')}
              <select
                value={deckId}
                onChange={(event) => setDeckId(event.target.value)}
                disabled={decks.isLoading || decks.isError}
                required
              >
                <option value="">{t('chooseDeck')}</option>
                {playableDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name} ({String(deckCardTotal(deck))}/30)
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset className="mt-6">
            <legend className="field-label">{t('cpuDifficulty')}</legend>
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
                  {localizeValue(option, locale)}
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
            {start.isPending ? t('creatingMatch') : t('enterCpuArena')}
          </ActionButton>
        </form>
        <article className="arena-panel min-h-80 p-6 sm:p-8">
          <p className="eyebrow">{t('matchFormat')}</p>
          <h2 className="mt-2 text-3xl font-black">{t('matchSetup')}</h2>
          <p className="mt-4 max-w-md leading-7 text-stone-200">{t('matchSetupDescription')}</p>
          <ul className="mt-7 space-y-3 text-sm text-stone-200">
            <li className="flex gap-3">
              <BadgeCheck size={18} className="text-cyan-200" aria-hidden="true" />
              {t('ownedDeckOnly')}
            </li>
            <li className="flex gap-3">
              <BadgeCheck size={18} className="text-cyan-200" aria-hidden="true" />
              {t('serverInitialState')}
            </li>
            <li className="flex gap-3">
              <BadgeCheck size={18} className="text-cyan-200" aria-hidden="true" />
              {t('replayReadyState')}
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
  const { t } = useI18n();
  const started = (location.state as { readonly match?: CpuMatch } | null)?.match;
  const remoteMatch = useQuery({
    queryKey: ['match', playerId, matchId, previewMode],
    queryFn: () => client.match(playerId, matchId),
    enabled: started === undefined,
  });
  const state = started?.state ?? remoteMatch.data?.finalState ?? remoteMatch.data?.initialState;
  if (remoteMatch.isLoading && state === undefined)
    return <LoadingNotice title={t('loadingBattleState')} />;
  if (remoteMatch.isError) return <ApiFailure error={remoteMatch.error} />;
  if (state === null || state === undefined)
    return (
      <AsyncNotice kind="empty" title={t('matchStateUnavailable')}>
        {t('matchStateUnavailableDescription')}
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
  const { t } = useI18n();
  const match = useQuery({
    queryKey: ['match', playerId, matchId, previewMode],
    queryFn: () => client.match(playerId, matchId),
  });
  if (match.isLoading) return <LoadingNotice title={t('loadingResult')} />;
  if (match.isError) return <ApiFailure error={match.error} />;
  const state = match.data?.finalState;
  const abandoned = match.data?.status === 'ABANDONED';
  return (
    <>
      <PageHeading
        eyebrow={t('matchResult')}
        title={localizedResultTitle(match.data?.status, t)}
        description={t('resultDescription')}
      />
      {state === null || state === undefined ? (
        <AsyncNotice kind="empty" title={abandoned ? t('battleAbandoned') : t('noFinalResult')}>
          {abandoned ? t('abandonedDescription') : t('noFinalResultDescription')}
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
  const { locale, t } = useI18n();
  const client = useApiClient();
  const previewMode = useSessionStore((session) => session.previewMode);
  const cards = useQuery({
    queryKey: ['cards', previewMode],
    queryFn: () => client.cards(),
  });
  const player = state.players[0];
  const opponent = state.players[1];
  if (player === undefined || opponent === undefined)
    return (
      <AsyncNotice kind="error" title={t('invalidBattleState')}>
        {t('invalidBattleStateDescription')}
      </AsyncNotice>
    );
  return (
    <>
      <PageHeading
        eyebrow={
          difficulty === undefined
            ? t('persistedState')
            : `${localizeValue(difficulty, locale)} CPU`
        }
        title={t('cpuArena')}
        description={t('turn')
          .replace('{count}', String(state.turn))
          .replace('{phase}', localizeBattlePhase(state.phase, locale))}
      />
      <section className="battle-board mt-7" aria-label={t('battleState')}>
        <Combatant label={t('opponent')} player={opponent} tone="enemy" />
        <div className="battle-field">
          <p className="eyebrow">{t('battleField')}</p>
          <div className="battle-ring" aria-hidden="true" />
          <p className="mt-4 text-center text-sm text-stone-300">{t('battleFieldDescription')}</p>
        </div>
        <Combatant label={t('you')} player={player} tone="player" />
      </section>
      <section className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('hand')}</h2>
          <span className="text-sm text-stone-400">
            {t('cardsCount').replace('{count}', String(player.hand.length))}
          </span>
        </div>
        <div className="hand-row mt-3">
          {player.hand.length === 0 ? (
            <AsyncNotice kind="empty" title={t('noCardsInHand')}>
              {t('noCardsInHandDescription')}
            </AsyncNotice>
          ) : (
            player.hand.map((card) => (
              <article className="hand-card" key={card.id}>
                <p className="text-xs font-semibold text-amber-200">{t('card')}</p>
                <p className="mt-5 font-bold text-stone-50">
                  {localizedCardName(
                    card.definitionId,
                    state.cardDataVersion,
                    locale,
                    cards.data?.find(
                      (candidate) =>
                        candidate.cardId === card.definitionId &&
                        candidate.version === state.cardDataVersion,
                    )?.definition,
                  )}
                </p>
                <p className="mt-2 text-xs text-stone-400">
                  {t('instance').replace('{id}', card.id)}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link className="hero-command" to={`/result/${state.matchId}`}>
          <Trophy size={18} aria-hidden="true" />
          {t('viewResult')}
        </Link>
        <Link className="hero-secondary" to="/battle/cpu">
          {t('startAnother')}
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
  const { locale, t } = useI18n();
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
        <Metric label={t('block')} value={String(player.block)} />
        <Metric
          label={t('energy')}
          value={`${String(player.energy)}/${String(player.maxEnergy)}`}
        />
      </div>
      {player.statuses.length > 0 ? (
        <p className="mt-4 text-xs text-stone-300">
          {t('statuses')}:{' '}
          {player.statuses
            .map((status) => `${localizeValue(status.id, locale)} x${String(status.stacks)}`)
            .join(', ')}
        </p>
      ) : null}
    </article>
  );
}

function CardTile({ card }: { readonly card: CardSummary }) {
  const definition = card.definition;
  const { locale, t } = useI18n();
  const text = localizeCard(definition, locale);
  return (
    <Link to={cardDetailHref(card)} className="card-tile">
      <div className="flex items-start justify-between gap-3">
        <span className="rarity-chip">{localizeCardMetadata(definition.rarity, locale)}</span>
        <span
          className="cost-orb"
          aria-label={t('cost').replace('{count}', String(definition.cost))}
        >
          {definition.cost}
        </span>
      </div>
      <div className="mt-10">
        <p className="text-xs font-bold tracking-wide text-cyan-200">
          {localizeCardMetadata(definition.class, locale)} -{' '}
          {localizeCardMetadata(definition.type, locale)}
        </p>
        <h2 className="mt-2 text-xl font-black text-stone-50">{text.name}</h2>
        <p className="mt-3 text-sm leading-6 text-stone-300">{text.description}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {definition.keywords.map((keyword) => (
          <span className="keyword-chip" key={keyword}>
            {localizeCardMetadata(keyword, locale)}
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
  const { locale, t } = useI18n();
  const text = localizeCard(definition, locale);
  return (
    <section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
      <CardTile card={card} />
      <article className="surface-panel p-6 sm:p-8">
        <Link to="/cards" className="quiet-link">
          <ChevronRight className="rotate-180" size={16} aria-hidden="true" />
          {t('cardLibrary')}
        </Link>
        <p className="eyebrow mt-8">{t('cardDetail')}</p>
        <h1 className="mt-2 text-4xl font-black">{text.name}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-stone-200">{text.description}</p>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label={t('class')} value={localizeCardMetadata(definition.class, locale)} />
          <Metric label={t('type')} value={localizeCardMetadata(definition.type, locale)} />
          <Metric label={t('rarity')} value={localizeCardMetadata(definition.rarity, locale)} />
          <Metric label={t('version')} value={card.version} />
        </div>
      </article>
    </section>
  );
}

function DeckTile({ deck }: { readonly deck: Deck }) {
  const { t } = useI18n();
  return (
    <article className="surface-panel p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{t('savedDeck')}</p>
          <h2 className="mt-2 text-2xl font-black text-stone-50">{deck.name}</h2>
        </div>
        <span className="rounded-md border border-amber-300/40 px-2 py-1 text-xs font-bold text-amber-100">
          {String(deckCardTotal(deck))}/30
        </span>
      </div>
      <p className="mt-3 text-sm text-stone-300">
        {t('deckTileSummary')
          .replace('{count}', String(deck.cards.length))
          .replace('{version}', deck.cardDataVersion)}
      </p>
      <div className="mt-6 flex gap-3">
        <Link className="hero-secondary" to={`/decks/${deck.id}`}>
          {t('open')}
        </Link>
        <Link
          className="quiet-link self-center"
          to={`/battle/cpu?deck=${encodeURIComponent(deck.id)}`}
        >
          {t('cpuPractice')} <ChevronRight size={15} aria-hidden="true" />
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
  const { t } = useI18n();
  return (
    <Link to={to} className="quick-link">
      <span className="text-cyan-200">{icon}</span>
      <h2 className="mt-4 font-bold text-stone-50">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-300">{text}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-amber-200">
        {t('open')} <ChevronRight size={16} aria-hidden="true" />
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
  return Math.min(card.quantity, card.cardVersion.definition.deckLimit ?? maximumCardCopies);
}

export function deckBuilderCardsForVersion(
  cards: readonly OwnedCard[],
  cardDataVersion: string | undefined,
): readonly OwnedCard[] {
  return cardDataVersion === undefined
    ? []
    : cards.filter((card) => card.cardVersion.version === cardDataVersion);
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

export function isUnauthorizedApiError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function resultTitle(status: string | undefined): string {
  if (status === 'COMPLETED') return 'Battle complete';
  if (status === 'ABANDONED') return 'Battle abandoned';
  return 'Battle in progress';
}

function localizedResultTitle(
  status: string | undefined,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (status === 'COMPLETED') return t('battleComplete');
  if (status === 'ABANDONED') return t('battleAbandoned');
  return t('battleInProgress');
}

export function canOpenOfflinePreview(error: Error): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500);
}

function LoadingNotice({ title }: { readonly title: string }) {
  const { t } = useI18n();
  return (
    <AsyncNotice kind="loading" title={title}>
      <span className="inline-flex items-center gap-2">
        <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
        {t('working')}
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
  const { t } = useI18n();
  const unavailable = error instanceof ApiError && (error.status === 0 || error.status >= 500);
  const description =
    error instanceof ApiError && error.code === 'API_UNAVAILABLE'
      ? t('apiUnavailable')
      : error instanceof ApiError && error.code === 'REQUEST_FAILED'
        ? t('requestFailed')
        : error instanceof ApiError
          ? t('requestRejected')
              .replace('{code}', error.code)
              .replace('{status}', String(error.status))
          : t('serviceUnavailable');
  const advice = unavailable ? t('retryAdvice') : t('sessionAdvice');
  return (
    <AsyncNotice kind="error" title={t('unableToLoad')}>
      <p>
        {description} {advice}
      </p>
      {onPreview === undefined && onRetry === undefined ? null : (
        <div className="mt-4 flex flex-wrap gap-3">
          {onRetry === undefined ? null : (
            <ActionButton tone="quiet" onClick={onRetry}>
              <RotateCcw size={17} aria-hidden="true" />
              {t('tryAgain')}
            </ActionButton>
          )}
          {onPreview === undefined ? null : (
            <ActionButton tone="quiet" onClick={onPreview}>
              <Sparkles size={17} aria-hidden="true" />
              {t('openOfflinePreview')}
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

function formatBalances(
  balances: Readonly<Record<string, number>> | undefined,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (balances === undefined) return t('balancesLoading');
  return `${String(balances.GEM ?? 0)} ${t('gems')} - ${String(balances.EXCHANGE_POINT ?? 0)} ${t('exchange')}`;
}

function deckCardTotal(deck: Deck): number {
  return deck.cards.reduce((total, card) => total + card.quantity, 0);
}
