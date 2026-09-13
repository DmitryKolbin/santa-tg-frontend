import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  api,
  download,
  tg,
  type Game,
  type Profile,
  type Thread,
  type Message,
  type Readiness,
} from "./api";
import "./style.css";

const go = (path: string) => {
  location.hash = path;
};
function useAction() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return { error, busy, run };
}
function useLoad<T>(path: string) {
  const [data, setData] = useState<T>(),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    setError("");
    api<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, error, reload };
}
function ErrorText({ text }: { text?: string }) {
  return text ? (
    <p className="error" role="alert">
      {text}
    </p>
  ) : null;
}
function Loading({ error, retry }: { error?: string; retry?: () => void }) {
  return error ? (
    <>
      <ErrorText text={error} />
      {retry && (
        <button className="secondary" onClick={retry}>
          Повторить
        </button>
      )}
    </>
  ) : (
    <p role="status" className="muted">
      Загружаем…
    </p>
  );
}
function PageTitle({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <div className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{children}</h1>
    </div>
  );
}
function Settings({
  single,
  mutual,
  setSingle,
  setMutual,
}: {
  single: boolean;
  mutual: boolean;
  setSingle: (value: boolean) => void;
  setMutual: (value: boolean) => void;
}) {
  return (
    <fieldset className="settings">
      <legend>Правила жеребьёвки</legend>
      <label className="toggle">
        <span>
          <strong>Только одна цепочка</strong>
          <small>
            Все дарят по кругу. Выключите, чтобы разрешить несколько кругов.
          </small>
        </span>
        <input
          type="checkbox"
          checked={single}
          onChange={(e) => setSingle(e.target.checked)}
        />
      </label>
      <label className="toggle">
        <span>
          <strong>Разрешить взаимные пары</strong>
          <small>
            А дарит Б, а Б дарит А. Без этого в игре должно быть минимум три
            человека.
          </small>
        </span>
        <input
          type="checkbox"
          checked={mutual}
          onChange={(e) => setMutual(e.target.checked)}
        />
      </label>
    </fieldset>
  );
}
function Home() {
  const { data, error, reload } = useLoad<Game[]>("/games");
  return (
    <>
      <section className="hero">
        <span className="eyebrow">МАЛЕНЬКИЙ СЕКРЕТ. БОЛЬШАЯ РАДОСТЬ.</span>
        <h1>
          Кто-то ждёт
          <br />
          вашего <em>чуда.</em>
        </h1>
        <div className="gift" aria-hidden="true">
          <span>✦</span>🎁<span>✧</span>
        </div>
        <p>
          Соберите близких. Мы поможем каждому
          <br />
          найти того, кого он порадует.
        </p>
        <button onClick={() => go("/new")}>＋ Создать игру</button>
      </section>
      <div className="section-heading">
        <h2>Мои игры</h2>
        <button className="text-button" onClick={reload}>
          Обновить
        </button>
      </div>
      {!data ? (
        <Loading error={error} retry={reload} />
      ) : (
        <>
          <ErrorText text={error} />
          {data.length === 0 ? (
            <div className="empty">
              Здесь пока тихо.
              <p>Создайте первую игру или откройте ссылку от организатора.</p>
            </div>
          ) : (
            data.map((g) => (
              <button
                className="game-card"
                key={g.id}
                onClick={() => go("/game/" + g.id)}
              >
                <span className="card-icon" aria-hidden="true">
                  {g.started ? "🎁" : "✦"}
                </span>
                <span>
                  <strong>{g.name}</strong>
                  <small>
                    {g.count} участников ·{" "}
                    {g.is_owner ? "Вы организатор" : g.creator_name}
                  </small>
                  <span className={"badge " + (g.started ? "green" : "")}>
                    {g.started
                      ? "Подарки нашли адресатов"
                      : "Собираем участников"}
                  </span>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            ))
          )}
        </>
      )}
    </>
  );
}
function ProfilePage() {
  const { data, error, reload } = useLoad<Profile>("/me"),
    locations = useLoad<Record<string, string>>("/locations");
  return (
    <>
      <PageTitle eyebrow="НЕМНОГО О ВАС">Мой wishlist</PageTitle>
      <p className="muted">
        Помогите вашему Санте выбрать подарок. Анкета общая для всех игр.
      </p>
      {data && locations.data ? (
        <ProfileForm initial={data} locations={locations.data} />
      ) : (
        <Loading
          error={error || locations.error}
          retry={() => {
            reload();
            locations.reload();
          }}
        />
      )}
    </>
  );
}
function ProfileForm({
  initial,
  locations,
}: {
  initial: Profile;
  locations: Record<string, string>;
}) {
  const [value, setValue] = useState(initial),
    [saved, setSaved] = useState(false),
    action = useAction();
  const change = (patch: Partial<Profile>) => {
    setSaved(false);
    setValue({ ...value, ...patch });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void action.run(async () => {
          const { name: _, ...input } = value;
          await api("/me", "PUT", input);
          setSaved(true);
        });
      }}
    >
      <label>
        Адрес для подарка
        <textarea
          required
          maxLength={2000}
          rows={3}
          value={value.address}
          onChange={(e) => change({ address: e.target.value })}
          placeholder="Страна, город, индекс, адрес и имя получателя"
        />
      </label>
      <label>
        Что вас порадует?
        <textarea
          maxLength={4000}
          rows={5}
          value={value.wishlist}
          onChange={(e) => change({ wishlist: e.target.value })}
          placeholder="Любимые вещи, интересы, ссылки. И что лучше не дарить."
        />
      </label>
      <small className="muted">
        Wishlist необязателен, но очень поможет вашему Санте.
      </small>
      <label>
        Где вы находитесь
        <select
          required
          value={value.location}
          onChange={(e) => change({ location: e.target.value })}
        >
          <option value="">Выберите локацию</option>
          {Object.entries(locations).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Куда можете отправить подарок</legend>
        {Object.entries(locations).map(([code, name]) => (
          <label className="check" key={code}>
            <input
              type="checkbox"
              checked={value.destinations.includes(code)}
              onChange={(e) =>
                change({
                  destinations: e.target.checked
                    ? [...value.destinations, code]
                    : value.destinations.filter((d) => d !== code),
                })
              }
            />
            {name}
          </label>
        ))}
      </fieldset>
      <ErrorText text={action.error} />
      {saved && (
        <p role="status" className="success">
          Анкета сохранена ✓
        </p>
      )}
      <button disabled={action.busy}>
        {action.busy ? "Сохраняем…" : "Сохранить анкету"}
      </button>
    </form>
  );
}
function NewGame() {
  const [name, setName] = useState(""),
    [single, setSingle] = useState(true),
    [mutual, setMutual] = useState(true),
    action = useAction();
  return (
    <>
      <PageTitle eyebrow="СОБЕРИТЕ СВОИХ">Новая игра</PageTitle>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            const g = await api<Game>("/games", "POST", {
              name,
              single_cycle: single,
              allow_mutual_pairs: mutual,
            });
            go("/game/" + g.id);
          });
        }}
      >
        <label>
          Название
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Зимние чудеса"
          />
        </label>
        <Settings
          single={single}
          mutual={mutual}
          setSingle={setSingle}
          setMutual={setMutual}
        />
        <ErrorText text={action.error} />
        <button disabled={action.busy}>
          {action.busy ? "Создаём…" : "Создать и пригласить"}
        </button>
        <p className="muted">
          До 50 участников. Чтобы дарить подарки самому, вступите в игру по
          своей ссылке.
        </p>
      </form>
    </>
  );
}
function Invite({ token }: { token: string }) {
  const {
      data: g,
      error,
      reload,
    } = useLoad<
      Pick<Game, "id" | "name" | "creator_name" | "started" | "is_member">
    >("/invites/" + encodeURIComponent(token)),
    action = useAction();
  return (
    <>
      <PageTitle eyebrow="ВАС ПРИГЛАСИЛИ">Время дарить</PageTitle>
      {!g ? (
        <Loading error={error} retry={reload} />
      ) : (
        <section className="panel invite">
          <div className="large-icon" aria-hidden="true">
            💌
          </div>
          <h2>{g.name}</h2>
          <p>Организатор: {g.creator_name}</p>
          <p className="muted">
            {g.started
              ? "Жеребьёвка уже прошла."
              : "Один подарок от вас. Один сюрприз для вас."}
          </p>
          <ErrorText text={action.error} />
          <button
            disabled={action.busy || (g.started && !g.is_member)}
            onClick={() =>
              void action.run(async () => {
                if (!g.is_member)
                  await api(
                    "/invites/" + encodeURIComponent(token) + "/join",
                    "POST",
                    {},
                  );
                go("/game/" + g.id);
              })
            }
          >
            {g.is_member ? "Открыть игру" : "Присоединиться"}
          </button>
        </section>
      )}
    </>
  );
}
function GamePage({ id }: { id: string }) {
  const { data: g, error, reload } = useLoad<Game>("/games/" + id);
  return !g ? (
    <Loading error={error} retry={reload} />
  ) : (
    <>
      <ErrorText text={error} />
      <GameDetails
        key={g.id + ":" + g.round + ":" + g.started}
        g={g}
        reload={reload}
      />
    </>
  );
}
function GameDetails({ g, reload }: { g: Game; reload: () => void }) {
  const [single, setSingle] = useState(g.single_cycle),
    [mutual, setMutual] = useState(g.allow_mutual_pairs),
    [name, setName] = useState(g.name);
  const [report, setReport] = useState<Readiness>(),
    [force, setForce] = useState(false),
    [notice, setNotice] = useState("");
  const action = useAction(),
    threads = useLoad<Thread[]>("/games/" + g.id + "/threads");
  const changed =
    single !== g.single_cycle ||
    mutual !== g.allow_mutual_pairs ||
    name !== g.name;
  return (
    <>
      <PageTitle eyebrow={"РОЗЫГРЫШ № " + g.round}>{g.name}</PageTitle>
      <div className="chips">
        <span className="badge">{g.count}/50 участников</span>
        <span className="badge">
          {g.started ? "Жеребьёвка завершена" : "Ждём участников"}
        </span>
      </div>
      <p className="muted">
        {g.single_cycle ? "Одна общая цепочка" : "Любое число цепочек"} ·{" "}
        {g.allow_mutual_pairs ? "Взаимные пары разрешены" : "Без взаимных пар"}
      </p>
      <ErrorText text={action.error} />
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {g.is_owner && g.invite_url && (
        <section className="panel">
          <h2>Вместе веселее</h2>
          <p className="muted">Игра доступна только по приглашению.</p>
          <label>
            Ссылка приглашения
            <input
              readOnly
              value={g.invite_url}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <div className="button-row">
            <button
              className="secondary"
              onClick={() =>
                void action.run(async () => {
                  await navigator.clipboard.writeText(g.invite_url!);
                  setNotice("Ссылка скопирована");
                })
              }
            >
              Копировать
            </button>
            <button
              onClick={() =>
                tg?.openTelegramLink(
                  "https://t.me/share/url?url=" +
                    encodeURIComponent(g.invite_url!) +
                    "&text=" +
                    encodeURIComponent("Присоединяйтесь к «" + g.name + "»!"),
                )
              }
            >
              Пригласить ↗
            </button>
          </div>
          {!g.is_member && !g.started && (
            <button
              className="text-button"
              onClick={() =>
                go("/invite/" + g.invite_url!.split("startapp=")[1])
              }
            >
              Я тоже хочу участвовать
            </button>
          )}
        </section>
      )}
      {g.is_member && (
        <button className="secondary full" onClick={() => go("/profile")}>
          Моя анкета и wishlist ↗
        </button>
      )}
      {g.started && g.is_member && <Receiver id={g.id} />}
      {g.is_owner && !g.started && (
        <section className="panel">
          <h2>Подготовка игры</h2>
          <label>
            Название
            <input
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Settings
            single={single}
            mutual={mutual}
            setSingle={(v) => {
              setSingle(v);
              setReport(undefined);
            }}
            setMutual={(v) => {
              setMutual(v);
              setReport(undefined);
            }}
          />
          {changed && (
            <button
              className="secondary full"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  const saved = await api<Game>("/games/" + g.id, "PATCH", {
                    name,
                    single_cycle: single,
                    allow_mutual_pairs: mutual,
                  });
                  setReport(undefined);
                  reload();
                  setName(saved.name);
                  setSingle(saved.single_cycle);
                  setMutual(saved.allow_mutual_pairs);
                  setNotice("Настройки сохранены");
                })
              }
            >
              Сохранить настройки
            </button>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => {
                setForce(e.target.checked);
                setReport(undefined);
              }}
            />
            Исключить незаполненные анкеты
          </label>
          <button
            className="secondary full"
            disabled={action.busy || changed}
            onClick={() =>
              void action.run(async () =>
                setReport(
                  await api<Readiness>(
                    "/games/" + g.id + "/readiness",
                    "POST",
                    { force },
                  ),
                ),
              )
            }
          >
            Проверить готовность
          </button>
          {report && (
            <div className="readiness">
              <h3>Готовность участников</h3>
              {report.members.map((m, i) => (
                <div className="member" key={i}>
                  <strong>{m.name}</strong>
                  <small>
                    {m.missing.length
                      ? "Не заполнено: " + m.missing.join(", ")
                      : "Готово ✓"}
                    {m.wishlist_empty ? " · Без wishlist" : ""}
                  </small>
                </div>
              ))}
              <ErrorText text={report.error} />
              {report.excluded.length > 0 && force && (
                <p className="warning">
                  Будут исключены: {report.excluded.join(", ")}
                </p>
              )}
              {report.ready && (
                <p className="success">Распределение возможно ✓</p>
              )}
            </div>
          )}
          <button
            className="full"
            disabled={action.busy || changed || !report?.ready}
            onClick={() =>
              void action.run(async () => {
                const latest = await api<Readiness>(
                  "/games/" + g.id + "/readiness",
                  "POST",
                  { force },
                );
                setReport(latest);
                if (!latest.ready) return;
                const exclusion = latest.excluded.length
                  ? "\nБудут исключены: " + latest.excluded.join(", ")
                  : "";
                if (!window.confirm("Провести жеребьёвку?" + exclusion)) return;
                await api("/games/" + g.id + "/draw", "POST", {
                  force,
                  exclusions: latest.exclusions,
                });
                reload();
              })
            }
          >
            {action.busy ? "Проверяем…" : "✦ Провести жеребьёвку"}
          </button>
        </section>
      )}
      <section className="panel">
        <h2>Тайная переписка</h2>
        {!threads.data ? (
          <Loading error={threads.error} retry={threads.reload} />
        ) : threads.data.length === 0 ? (
          <p className="muted">Диалоги появятся после жеребьёвки.</p>
        ) : (
          threads.data.map((t) => (
            <button
              key={t.key}
              className="thread-button"
              onClick={() => go("/chat/" + t.key + "/" + g.id)}
            >
              <span>
                {t.side === "santa" ? "✦ Мой Санта" : "🎁 Мой получатель"}
                <small>
                  Розыгрыш № {t.round}
                  {t.read_only ? " · Архив" : ""}
                </small>
              </span>
              <span>→</span>
            </button>
          ))
        )}
      </section>
      <Announcements game={g} />
      {g.is_owner && g.started && (
        <button
          className="danger full"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              if (
                !window.confirm(
                  "Сбросить жеребьёвку? Старые назначения перестанут действовать, переписка станет архивной.",
                )
              )
                return;
              await api("/games/" + g.id + "/reset", "POST", {});
              reload();
            })
          }
        >
          Сбросить жеребьёвку
        </button>
      )}
      <button
        className="text-button"
        onClick={() => {
          reload();
          threads.reload();
        }}
      >
        Обновить игру
      </button>
    </>
  );
}
function Receiver({ id }: { id: number }) {
  const { data, error, reload } = useLoad<{
    name: string;
    address: string;
    wishlist: string;
  }>("/games/" + id + "/receiver");
  return (
    <section className="panel recipient">
      <span className="eyebrow">ВАШ МАЛЕНЬКИЙ СЕКРЕТ</span>
      <h2>Вы дарите подарок…</h2>
      {data ? (
        <>
          <h3>{data.name}</h3>
          <small>Адрес</small>
          <p className="preserve">{data.address}</p>
          <small>Wishlist</small>
          <p className="preserve">
            {data.wishlist || "Получатель оставил выбор вам."}
          </p>
        </>
      ) : (
        <>
          <p className="muted">
            {error === "Не найдено"
              ? "Вы не включены в этот розыгрыш. Проверьте анкету и обратитесь к организатору."
              : error || "Открываем конверт…"}
          </p>
          {error && error !== "Не найдено" && (
            <button className="text-button" onClick={reload}>
              Повторить
            </button>
          )}
        </>
      )}
    </section>
  );
}
function Announcements({ game }: { game: Game }) {
  const [text, setText] = useState(""),
    [version, setVersion] = useState(0),
    action = useAction();
  return (
    <section className="panel">
      <h2>От организатора</h2>
      <Feed path={"/games/" + game.id + "/announcements"} version={version} />
      {game.is_owner && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await api("/games/" + game.id + "/announcements", "POST", {
                text,
              });
              setText("");
              setVersion((v) => v + 1);
            });
          }}
        >
          <label>
            Объявление
            <textarea
              required
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Например, отправляем подарки до 20 декабря"
            />
          </label>
          <ErrorText text={action.error} />
          <button disabled={action.busy}>Отправить участникам</button>
        </form>
      )}
    </section>
  );
}
function Feed({
  path,
  polling = true,
  version = 0,
}: {
  path: string;
  polling?: boolean;
  version?: number;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const action = useAction();
  useEffect(() => {
    let stopped = false,
      busy = false,
      cursor = 0;
    setMessages([]);
    setLoading(true);
    const load = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        let batch: Message[];
        do {
          batch = await api<Message[]>(path + "?after=" + cursor);
          if (stopped) return;
          if (batch.length) {
            cursor = batch[batch.length - 1].id;
            setMessages((old) => [...old, ...batch]);
          }
        } while (batch.length === 100);
        setError("");
      } catch (e) {
        if (!stopped)
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить сообщения",
          );
      } finally {
        busy = false;
        if (!stopped) setLoading(false);
      }
    };
    void load();
    const interval = polling ? setInterval(() => void load(), 5000) : undefined;
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [path, polling, version]);
  return (
    <div className="feed" aria-live="polite">
      <ErrorText text={error || action.error} />
      {loading ? (
        <Loading />
      ) : messages.length === 0 ? (
        <p className="muted">Сообщений пока нет.</p>
      ) : (
        messages.map((m) => (
          <article key={m.id} className={"bubble " + (m.mine ? "mine" : "")}>
            <p className="preserve">{m.text}</p>
            {m.file_key && (
              <button
                className="attachment"
                disabled={action.busy}
                onClick={() =>
                  void action.run(() => download(m.file_key!, m.file_name!))
                }
              >
                ↓ {m.file_name}
              </button>
            )}
            <time dateTime={m.created}>
              {new Date(m.created).toLocaleString("ru", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </time>
          </article>
        ))
      )}
    </div>
  );
}
function Chat({ threadKey, gameId }: { threadKey: string; gameId: string }) {
  const { data, error, reload } = useLoad<Thread[]>(
      "/games/" + gameId + "/threads",
    ),
    [text, setText] = useState(""),
    [file, setFile] = useState<File>(),
    [version, setVersion] = useState(0),
    action = useAction();
  const fileInput = useRef<HTMLInputElement>(null),
    thread = data?.find((t) => t.key === threadKey);
  useEffect(() => {
    const visible = () => {
      if (!document.hidden) reload();
    };
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(reload, 5000);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      clearInterval(timer);
    };
  }, [reload]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void action.run(async () => {
      if (file && file.size > 20 * 1024 * 1024)
        throw new Error("Файл больше 20 МБ");
      const body = new FormData();
      body.set("text", text);
      if (file) body.set("file", file);
      await api("/threads/" + threadKey + "/messages", "POST", body);
      setText("");
      setFile(undefined);
      if (fileInput.current) fileInput.current.value = "";
      setVersion((v) => v + 1);
    });
  };
  if (!data) return <Loading error={error} retry={reload} />;
  if (!thread) return <ErrorText text="Диалог не найден" />;
  return (
    <>
      <PageTitle eyebrow={"РОЗЫГРЫШ № " + thread.round}>
        {thread.side === "santa" ? "Мой Санта" : "Мой получатель"}
      </PageTitle>
      <p className="muted">
        {thread.side === "santa"
          ? "Личность вашего Санты останется секретом."
          : "Получатель не видит вашего имени. Не раскрывайте себя в сообщениях и файлах."}
      </p>
      <ErrorText text={error} />
      <Feed path={"/threads/" + threadKey + "/messages"} version={version} />
      {thread.read_only ? (
        <p className="warning">Архив розыгрыша. Только для чтения.</p>
      ) : (
        <form className="composer" onSubmit={submit}>
          <label>
            Сообщение
            <textarea
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Спросите о чём-нибудь важном…"
            />
          </label>
          <label className="file-label">
            Фото, видео, аудио или документ · до 20 МБ
            <input
              ref={fileInput}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>
          <ErrorText text={action.error} />
          <button disabled={action.busy || (!text.trim() && !file)}>
            {action.busy ? "Отправляем…" : "Отправить ↗"}
          </button>
        </form>
      )}
    </>
  );
}
function App() {
  const [path, setPath] = useState(location.hash.slice(1) || "/"),
    [notifications, setNotifications] = useState(
      !!tg?.initDataUnsafe.user?.allows_write_to_pm,
    );
  useEffect(() => {
    if (!location.hash && tg?.initDataUnsafe.start_param)
      go("/invite/" + encodeURIComponent(tg.initDataUnsafe.start_param));
    const changed = () => {
      setPath(location.hash.slice(1) || "/");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", changed);
    changed();
    tg?.ready();
    tg?.expand();
    const theme = () => {
      document.documentElement.dataset.theme = tg?.colorScheme || "light";
    };
    theme();
    tg?.onEvent("themeChanged", theme);
    return () => {
      window.removeEventListener("hashchange", changed);
      tg?.offEvent("themeChanged", theme);
    };
  }, []);
  const parts = path.split("/").filter(Boolean);
  const back = () => go(parts[0] === "chat" ? "/game/" + parts[2] : "/");
  useEffect(() => {
    if (path === "/") tg?.BackButton.hide();
    else tg?.BackButton.show();
    tg?.BackButton.onClick(back);
    return () => tg?.BackButton.offClick(back);
  }, [path]);
  if (!tg?.initData)
    return (
      <main>
        <PageTitle eyebrow="SECRET SANTA">
          Подарки начинаются
          <br />с маленького секрета.
        </PageTitle>
        <div className="large-icon" aria-hidden="true">
          🎁
        </div>
        <p>
          Откройте приложение из Telegram — кнопкой в боте или по приглашению
          организатора.
        </p>
      </main>
    );
  let page: ReactNode;
  switch (parts[0]) {
    case "profile":
      page = <ProfilePage />;
      break;
    case "new":
      page = <NewGame />;
      break;
    case "invite":
      page = <Invite token={parts[1] || ""} />;
      break;
    case "game":
      page = <GamePage id={parts[1]} />;
      break;
    case "chat":
      page = <Chat threadKey={parts[1]} gameId={parts[2]} />;
      break;
    default:
      page = <Home />;
  }
  return (
    <>
      <header>
        <button className="brand" onClick={() => go("/")}>
          <span aria-hidden="true">✦</span> SECRET SANTA
        </button>
        {path !== "/" && (
          <button className="text-button" onClick={back}>
            ← Назад
          </button>
        )}
      </header>
      <main key={path}>
        {page}
        {!notifications && tg.requestWriteAccess && (
          <button
            className="notification-button"
            onClick={() =>
              tg?.requestWriteAccess?.((allowed) => setNotifications(allowed))
            }
          >
            Включить уведомления от бота
          </button>
        )}
      </main>
      <nav aria-label="Основная навигация">
        <button
          aria-current={path === "/" ? "page" : undefined}
          onClick={() => go("/")}
        >
          <span aria-hidden="true">✦</span> Мои игры
        </button>
        <button
          aria-current={path === "/profile" ? "page" : undefined}
          onClick={() => go("/profile")}
        >
          <span aria-hidden="true">♡</span> Моя анкета
        </button>
      </nav>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
