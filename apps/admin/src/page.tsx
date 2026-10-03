import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from './api.js';
import { clearPendingAdminRequestId, pendingAdminRequestId } from './request-id.js';

type Section = 'players' | 'matches' | 'operations' | 'debug' | 'flags' | 'audit';
type Item = Record<string, unknown>;
type Flag = { name: string; enabled: boolean; configurable: boolean };
type Action =
  'GRANT_CURRENCY' | 'GRANT_CARD' | 'GRANT_COSMETIC' | 'COMPLETE_MISSION' | 'SIMULATE_PACK';
const sections: readonly [Section, string][] = [
  ['players', 'プレイヤー'],
  ['matches', '試合・リプレイ'],
  ['operations', '付与・シミュレーション'],
  ['debug', 'デバッグ'],
  ['flags', '機能フラグ'],
  ['audit', '監査ログ'],
];
const actions: readonly [Action, string][] = [
  ['GRANT_CURRENCY', '通貨を付与'],
  ['GRANT_CARD', 'カードを付与'],
  ['GRANT_COSMETIC', 'コスメティックを付与'],
  ['COMPLETE_MISSION', 'ミッションを完了'],
  ['SIMULATE_PACK', 'パックをシミュレーション'],
];
const debugActions = [
  'GIVE_ALL_CARDS',
  'SET_GEM',
  'SET_LEVEL',
  'SET_RATING',
  'START_DEBUG_BATTLE',
  'FORCE_DRAW',
  'FORCE_RNG_SEED',
  'SKIP_TURN',
  'APPLY_STATUS',
  'KILL_ENTITY',
] as const;
type DebugAction = (typeof debugActions)[number];

function explain(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'ログインが必要です。';
    if (error.status === 403 && error.code === 'ADMIN_FORBIDDEN')
      return 'このDiscordアカウントには管理権限がありません。';
    return `${error.code}（HTTP ${error.status}）`;
  }
  return error instanceof Error ? error.message : '通信に失敗しました。';
}

function lostAccess(error: unknown): 'login' | 'forbidden' | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 401) return 'login';
  return error.code === 'ADMIN_FORBIDDEN' ? 'forbidden' : null;
}

function JsonDetail({ value }: { value: unknown }) {
  return <pre className="detail">{JSON.stringify(value, null, 2)}</pre>;
}

function replaySnapshots(value: unknown): { eventSequence: number; state: unknown }[] | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('snapshots' in value) ||
    !Array.isArray(value.snapshots)
  )
    return null;
  return value.snapshots.filter(
    (snapshot): snapshot is { eventSequence: number; state: unknown } =>
      typeof snapshot === 'object' &&
      snapshot !== null &&
      typeof snapshot.eventSequence === 'number' &&
      'state' in snapshot,
  );
}

function ReplayViewer({ snapshots }: { snapshots: { eventSequence: number; state: unknown }[] }) {
  const [index, setIndex] = useState(0);
  const current = snapshots[index];
  return (
    <div>
      <p>
        スナップショット {snapshots.length === 0 ? 0 : index + 1} / {snapshots.length}
      </p>
      <div className="actions">
        <button disabled={index === 0} onClick={() => setIndex(index - 1)}>
          前へ
        </button>
        <button disabled={index >= snapshots.length - 1} onClick={() => setIndex(index + 1)}>
          次へ
        </button>
      </div>
      {current ? (
        <>
          <p>イベント番号: {current.eventSequence}</p>
          <JsonDetail value={current.state} />
        </>
      ) : (
        <p>保存されたスナップショットはありません。下の記録で入力とイベントを確認できます。</p>
      )}
    </div>
  );
}

export function AdminApp() {
  const [access, setAccess] = useState<'loading' | 'allowed' | 'login' | 'forbidden' | 'error'>(
    'loading',
  );
  const [csrf, setCsrf] = useState('');
  const [name, setName] = useState('');
  const [section, setSection] = useState<Section>('players');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [detail, setDetail] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<Item | null>(null);
  const [action, setAction] = useState<Action>('GRANT_CURRENCY');
  const [playerId, setPlayerId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [amount, setAmount] = useState('1');
  const [currency, setCurrency] = useState('GEM');
  const [productId, setProductId] = useState('NORMAL_PACK');
  const [seed, setSeed] = useState('');
  const [reason, setReason] = useState('');
  const [debugAction, setDebugAction] = useState<DebugAction>('GIVE_ALL_CARDS');
  const [battleId, setBattleId] = useState('');
  const [firstDeckId, setFirstDeckId] = useState('');
  const [secondDeckId, setSecondDeckId] = useState('');
  const [cardInstanceId, setCardInstanceId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [debugValue, setDebugValue] = useState('1');
  const [seasonId, setSeasonId] = useState('');

  const authenticate = useCallback(async () => {
    setAccess('loading');
    setError('');
    try {
      const session = await api<{ displayName: string; csrfToken: string }>('auth/session');
      setName(session.displayName);
      setCsrf(session.csrfToken);
      await api('admin/session');
      setAccess('allowed');
    } catch (cause) {
      setAccess(
        cause instanceof ApiError && cause.status === 401
          ? 'login'
          : cause instanceof ApiError && cause.code === 'ADMIN_FORBIDDEN'
            ? 'forbidden'
            : 'error',
      );
      setError(explain(cause));
    }
  }, []);

  useEffect(() => {
    void authenticate();
  }, [authenticate]);

  const refresh = useCallback(async (selected: Section, search: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    setDetail(null);
    setPendingAction(null);
    try {
      if (selected === 'players' || selected === 'matches' || selected === 'audit') {
        const path =
          selected === 'audit'
            ? 'admin/audit'
            : `admin/${selected}?q=${encodeURIComponent(search)}`;
        const data = await api<{ items: Item[] }>(path);
        setItems(data.items);
        if (selected === 'audit')
          setAuditCursor((data as { nextCursor?: string | null }).nextCursor ?? null);
      } else if (selected === 'flags' || selected === 'debug') {
        const data = await api<{ items: Flag[] }>('admin/flags');
        setFlags(data.items);
      }
    } catch (cause) {
      const state = lostAccess(cause);
      if (state) setAccess(state);
      setError(explain(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (access === 'allowed') void refresh(section, '');
  }, [access, section, refresh]);

  async function inspect(path: string) {
    setBusy(true);
    setError('');
    setDetail(null);
    try {
      setDetail(await api(path));
    } catch (cause) {
      const state = lostAccess(cause);
      if (state) setAccess(state);
      setError(explain(cause));
    } finally {
      setBusy(false);
    }
  }

  async function moreAudit() {
    if (!auditCursor) return;
    setBusy(true);
    setError('');
    try {
      const data = await api<{ items: Item[]; nextCursor: string | null }>(
        `admin/audit?cursor=${encodeURIComponent(auditCursor)}`,
      );
      setItems((previous) => [...previous, ...data.items]);
      setAuditCursor(data.nextCursor);
    } catch (cause) {
      const state = lostAccess(cause);
      if (state) setAccess(state);
      setError(explain(cause));
    } finally {
      setBusy(false);
    }
  }

  async function execute(command: Item) {
    const payload = {
      ...command,
      reason: typeof command.reason === 'string' ? command.reason : reason.trim(),
    };
    setBusy(true);
    setError('');
    setMessage('');
    setPendingAction(payload);
    let requestId = '';
    try {
      requestId = await pendingAdminRequestId(payload);
      const result = await api<Item>('admin/actions', csrf, {
        ...payload,
        requestId,
      });
      clearPendingAdminRequestId();
      setPendingAction(null);
      if (section === 'flags') await refresh('flags', '');
      setDetail(result);
      setMessage('操作を記録しました。');
    } catch (cause) {
      const state = lostAccess(cause);
      if (state) setAccess(state);
      setError(`${explain(cause)}${requestId ? ` · リクエストID: ${requestId}` : ''}`);
    } finally {
      setBusy(false);
    }
  }

  function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command: Item = { action };
    if (action === 'GRANT_CURRENCY')
      Object.assign(command, { playerId, currency, amount: Number(amount) });
    if (action === 'GRANT_CARD')
      Object.assign(command, { playerId, cardVersionId: targetId, quantity: Number(amount) });
    if (action === 'GRANT_COSMETIC') Object.assign(command, { playerId, cosmeticId: targetId });
    if (action === 'COMPLETE_MISSION') Object.assign(command, { playerId, missionId: targetId });
    if (action === 'SIMULATE_PACK') Object.assign(command, { productId, seed });
    void execute(command);
  }

  function submitDebug(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command: Item = debugActions.slice(0, 4).includes(debugAction as 'GIVE_ALL_CARDS')
      ? {
          action: debugAction,
          playerId,
          ...(debugAction === 'GIVE_ALL_CARDS' ? {} : { value: Number(debugValue) }),
        }
      : debugAction === 'START_DEBUG_BATTLE'
        ? { action: debugAction, firstDeckId, secondDeckId, seed }
        : {
            action: 'DEBUG_BATTLE_COMMAND',
            battleId,
            command: {
              type: debugAction,
              ...(debugAction === 'FORCE_DRAW' ? { playerId, cardInstanceId } : {}),
              ...(debugAction === 'FORCE_RNG_SEED' ? { seed } : {}),
              ...(debugAction === 'APPLY_STATUS'
                ? { playerId, statusId, stacks: Number(debugValue) }
                : {}),
              ...(debugAction === 'KILL_ENTITY' ? { playerId } : {}),
            },
          };
    void execute(command);
  }

  if (access !== 'allowed')
    return (
      <main className="gate">
        <h1>DECK//DRIVE 管理</h1>
        <p role="status">{access === 'loading' ? '権限を確認しています…' : error}</p>
        {access === 'login' && (
          <a
            className="button"
            href={`${import.meta.env.VITE_WEB_URL || (import.meta.env.DEV ? 'http://localhost:5173' : '')}/login`}
          >
            ゲームでDiscordログインする
          </a>
        )}
        {access !== 'loading' && <button onClick={() => void authenticate()}>再確認</button>}
      </main>
    );

  return (
    <div className="layout">
      <header>
        <div>
          <span className="brand">DECK//DRIVE</span>
          <h1>管理コンソール</h1>
        </div>
        <span>{name} · 管理者</span>
      </header>
      <nav aria-label="管理メニュー">
        {sections.map(([key, label]) => (
          <button
            key={key}
            className={section === key ? 'active' : ''}
            aria-current={section === key ? 'page' : undefined}
            onClick={() => {
              setSection(key);
              setQuery('');
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <main>
        {error && (
          <p className="notice error" role="alert">
            {error}{' '}
            <button
              onClick={() =>
                pendingAction ? void execute(pendingAction) : void refresh(section, query)
              }
            >
              {pendingAction ? '同じリクエストIDで再試行' : '再試行'}
            </button>
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {busy && <p role="status">読み込み中…</p>}
        {(section === 'players' || section === 'matches') && (
          <section>
            <h2>{section === 'players' ? 'プレイヤー検索' : '試合検索'}</h2>
            <form
              className="search"
              onSubmit={(event) => {
                event.preventDefault();
                void refresh(section, query);
              }}
            >
              <label>
                検索語{' '}
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={section === 'players' ? '表示名・メール' : '試合ID'}
                />
              </label>
              <button disabled={busy}>検索</button>
            </form>
            {!busy && items.length === 0 && <p>該当するデータはありません。</p>}
            <ul className="results">
              {items.map((item) => (
                <li key={String(item.id)}>
                  <div>
                    <strong>
                      {section === 'players' ? String(item.displayName) : String(item.id)}
                    </strong>
                    <small>
                      {section === 'players'
                        ? String(item.email ?? 'メールなし')
                        : `${String(item.mode)} · ${String(item.status)}`}
                    </small>
                  </div>
                  <div className="actions">
                    {section === 'players' ? (
                      <>
                        <button
                          onClick={() => {
                            setPlayerId(String(item.id));
                            void inspect(`admin/players/${item.id}`);
                          }}
                        >
                          詳細
                        </button>
                        <button onClick={() => void inspect(`admin/players/${item.id}/rating`)}>
                          Rating
                        </button>
                      </>
                    ) : (
                      <button onClick={() => void inspect(`admin/matches/${item.id}/replay`)}>
                        リプレイ記録
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {section === 'matches' && (
          <section>
            <h2>シーズン分析</h2>
            <form
              className="search"
              onSubmit={(event) => {
                event.preventDefault();
                void inspect(`admin/seasons/${seasonId}/report`);
              }}
            >
              <label>
                シーズンID{' '}
                <input
                  required
                  value={seasonId}
                  onChange={(event) => setSeasonId(event.target.value)}
                />
              </label>
              <button disabled={busy || !seasonId}>レポート</button>
              <button
                type="button"
                disabled={busy || !seasonId}
                onClick={() => void inspect(`admin/seasons/${seasonId}/flags`)}
              >
                不正検知フラグ
              </button>
            </form>
          </section>
        )}
        {section === 'operations' && (
          <section>
            <h2>操作・シミュレーション</h2>
            <p>すべての操作は理由、変更前後、リクエストIDとともに記録されます。</p>
            <form className="form" onSubmit={submitAction}>
              <label>
                操作{' '}
                <select
                  value={action}
                  onChange={(event) => setAction(event.target.value as Action)}
                >
                  {actions.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {action !== 'SIMULATE_PACK' && (
                <label>
                  プレイヤーID{' '}
                  <input
                    required
                    value={playerId}
                    onChange={(event) => setPlayerId(event.target.value)}
                  />
                </label>
              )}
              {action === 'GRANT_CURRENCY' && (
                <label>
                  通貨{' '}
                  <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                    <option value="GEM">Gem</option>
                    <option value="EXCHANGE_POINT">交換ポイント</option>
                  </select>
                </label>
              )}
              {['GRANT_CARD', 'GRANT_COSMETIC', 'COMPLETE_MISSION'].includes(action) && (
                <label>
                  {action === 'GRANT_CARD'
                    ? 'カードバージョンID'
                    : action === 'GRANT_COSMETIC'
                      ? 'コスメティックID'
                      : 'ミッションID'}
                  <input
                    required
                    value={targetId}
                    onChange={(event) => setTargetId(event.target.value)}
                  />
                </label>
              )}
              {['GRANT_CURRENCY', 'GRANT_CARD'].includes(action) && (
                <label>
                  数量{' '}
                  <input
                    required
                    type="number"
                    min="1"
                    {...(action === 'GRANT_CURRENCY' ? { max: 1_000_000 } : {})}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
              )}
              {action === 'SIMULATE_PACK' && (
                <>
                  <label>
                    商品{' '}
                    <select
                      value={productId}
                      onChange={(event) => setProductId(event.target.value)}
                    >
                      <option>NORMAL_PACK</option>
                      <option>RARE_PACK</option>
                      <option>BOX</option>
                    </select>
                  </label>
                  <label>
                    Seed{' '}
                    <input
                      required
                      value={seed}
                      onChange={(event) => setSeed(event.target.value)}
                    />
                  </label>
                </>
              )}
              <label>
                理由{' '}
                <textarea
                  required
                  maxLength={2000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button disabled={busy || !reason.trim()}>実行して監査ログへ記録</button>
            </form>
          </section>
        )}
        {section === 'debug' && (
          <section>
            <h2>開発用デバッグ</h2>
            <p>
              隔離されたデバッグ戦闘とテスト用のデータ操作です。実行履歴と理由は監査ログへ保存されます。
            </p>
            <p role="status">
              {flags.find((flag) => flag.name === 'ENABLE_DEBUG')?.enabled
                ? 'デバッグ機能は有効です。'
                : 'ENABLE_DEBUG が無効です。フラグ画面で有効にしてください。本番環境では利用できません。'}
            </p>
            <form className="form" onSubmit={submitDebug}>
              <label>
                操作{' '}
                <select
                  value={debugAction}
                  onChange={(event) => setDebugAction(event.target.value as DebugAction)}
                >
                  {debugActions.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              {[
                'GIVE_ALL_CARDS',
                'SET_GEM',
                'SET_LEVEL',
                'SET_RATING',
                'FORCE_DRAW',
                'APPLY_STATUS',
                'KILL_ENTITY',
              ].includes(debugAction) && (
                <label>
                  プレイヤーID{' '}
                  <input
                    required
                    value={playerId}
                    onChange={(event) => setPlayerId(event.target.value)}
                  />
                </label>
              )}
              {['SET_GEM', 'SET_LEVEL', 'SET_RATING', 'APPLY_STATUS'].includes(debugAction) && (
                <label>
                  {debugAction === 'APPLY_STATUS' ? 'スタック数' : '設定値'}
                  <input
                    required
                    type="number"
                    min={debugAction === 'SET_LEVEL' || debugAction === 'APPLY_STATUS' ? '1' : '0'}
                    value={debugValue}
                    onChange={(event) => setDebugValue(event.target.value)}
                  />
                </label>
              )}
              {debugAction === 'START_DEBUG_BATTLE' && (
                <>
                  <label>
                    先攻デッキID{' '}
                    <input
                      required
                      value={firstDeckId}
                      onChange={(event) => setFirstDeckId(event.target.value)}
                    />
                  </label>
                  <label>
                    後攻デッキID{' '}
                    <input
                      required
                      value={secondDeckId}
                      onChange={(event) => setSecondDeckId(event.target.value)}
                    />
                  </label>
                </>
              )}
              {[
                'FORCE_DRAW',
                'FORCE_RNG_SEED',
                'SKIP_TURN',
                'APPLY_STATUS',
                'KILL_ENTITY',
              ].includes(debugAction) && (
                <label>
                  デバッグ戦闘ID{' '}
                  <input
                    required
                    value={battleId}
                    onChange={(event) => setBattleId(event.target.value)}
                  />
                </label>
              )}
              {debugAction === 'FORCE_DRAW' && (
                <label>
                  カードインスタンスID{' '}
                  <input
                    required
                    value={cardInstanceId}
                    onChange={(event) => setCardInstanceId(event.target.value)}
                  />
                </label>
              )}
              {debugAction === 'APPLY_STATUS' && (
                <label>
                  ステータスID{' '}
                  <input
                    required
                    value={statusId}
                    onChange={(event) => setStatusId(event.target.value)}
                  />
                </label>
              )}
              {['START_DEBUG_BATTLE', 'FORCE_RNG_SEED'].includes(debugAction) && (
                <label>
                  Seed{' '}
                  <input required value={seed} onChange={(event) => setSeed(event.target.value)} />
                </label>
              )}
              <label>
                理由{' '}
                <textarea
                  required
                  maxLength={2000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button
                disabled={
                  busy ||
                  !reason.trim() ||
                  !flags.find((flag) => flag.name === 'ENABLE_DEBUG')?.enabled
                }
              >
                実行
              </button>
            </form>
            <form
              className="search"
              onSubmit={(event) => {
                event.preventDefault();
                void inspect(`admin/debug-battles/${battleId}`);
              }}
            >
              <label>
                戦闘IDで再生・検証{' '}
                <input
                  required
                  value={battleId}
                  onChange={(event) => setBattleId(event.target.value)}
                />
              </label>
              <button disabled={busy || !battleId}>戦闘記録を表示</button>
            </form>
          </section>
        )}
        {section === 'flags' && (
          <section>
            <h2>機能フラグ・メンテナンス</h2>
            <p>変更には理由が必要です。本番環境ではデバッグを有効にできません。</p>
            <label>
              変更理由{' '}
              <textarea
                required
                value={reason}
                maxLength={2000}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <ul className="results">
              {flags.map((flag) => (
                <li key={flag.name}>
                  <div>
                    <strong>{flag.name}</strong>
                    <small>
                      {flag.enabled ? '有効' : '無効'}
                      {!flag.configurable ? ' · 本番環境では変更不可' : ''}
                    </small>
                  </div>
                  <button
                    disabled={busy || !flag.configurable || !reason.trim()}
                    onClick={() =>
                      void execute({ action: 'SET_FLAG', name: flag.name, enabled: !flag.enabled })
                    }
                  >
                    {flag.enabled ? '無効にする' : '有効にする'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {section === 'audit' && (
          <section>
            <h2>監査ログ</h2>
            {!busy && items.length === 0 && <p>記録はありません。</p>}
            <ul className="results">
              {items.map((item) => (
                <li key={String(item.id)}>
                  <div>
                    <strong>{String(item.action)}</strong>
                    <small>
                      {String(item.target)} · {String(item.timestamp)}
                    </small>
                    <small>理由: {String(item.reason)}</small>
                  </div>
                  <button onClick={() => setDetail(item)}>変更前後</button>
                </li>
              ))}
            </ul>
            {auditCursor && (
              <button disabled={busy} onClick={() => void moreAudit()}>
                次の100件
              </button>
            )}
          </section>
        )}
        {detail !== null && (
          <section>
            <h2>詳細</h2>
            {replaySnapshots(detail) !== null && (
              <ReplayViewer
                key={String((detail as Item).id)}
                snapshots={replaySnapshots(detail)!}
              />
            )}
            <JsonDetail value={detail} />
          </section>
        )}
      </main>
    </div>
  );
}
