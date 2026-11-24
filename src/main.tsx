import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createRoot } from "react-dom/client";
import {
  api,
  download,
  tg,
  type Game,
  type GameMember,
  type Profile,
  type Thread,
  type Message,
  type AnnouncementSummary,
  type Readiness,
} from "./api";
import "./style.css";

const MAX_MEMBERS = 50;
const go = (path: string) => {
  location.hash = path;
};
const currentPath = () =>
  location.hash.startsWith("#/") ? location.hash.slice(1) : "/";
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
function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10,
    h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}
// Textarea that grows with its content instead of scrolling inside a small box.
function AutoTextarea({
  minRows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [props.value]);
  return <textarea ref={ref} rows={minRows} {...props} />;
}
const urlPattern = /(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)\]»])/g;
function shortURL(url: string) {
  const bare = url.replace(/^https?:\/\/(www\.)?/, "");
  return bare.length > 32 ? bare.slice(0, 30) + "…" : bare;
}
// Linkify renders plain text with http(s) URLs as links opened outside the Mini App.
function Linkify({ text }: { text: string }) {
  return (
    <>
      {text.split(urlPattern).map((part, i) =>
        i % 2 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (tg?.openLink) {
                e.preventDefault();
                tg.openLink(part);
              }
            }}
          >
            {shortURL(part)}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}
function Expandable({ text, lines = 8 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false),
    long = text.length > 400 || text.split("\n").length > lines;
  return (
    <>
      <p
        className={"preserve" + (long && !open ? " clamped" : "")}
        style={{ WebkitLineClamp: lines }}
      >
        <Linkify text={text} />
      </p>
      {long && (
        <button className="link-button" onClick={() => setOpen(!open)}>
          {open ? "Свернуть" : "Показать полностью"}
        </button>
      )}
    </>
  );
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
    <div className="loading">
      <ErrorText text={error} />
      {retry && (
        <button className="secondary small" onClick={retry}>
          Повторить
        </button>
      )}
    </div>
  ) : (
    <p role="status" className="hint loading">
      Загрузка…
    </p>
  );
}
function PageTitle({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="hint">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function Section({
  title,
  footer,
  children,
}: {
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      {title && <h2 className="section-title">{title}</h2>}
      {children}
      {footer && <p className="section-footer">{footer}</p>}
    </section>
  );
}
function Row({
  title,
  subtitle,
  tail,
  onClick,
  muted,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  tail?: ReactNode;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button className={"row" + (muted ? " muted" : "")} onClick={onClick}>
      <span className="row-main">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
      <span className="row-tail">
        {tail}
        <span className="chevron" aria-hidden="true">
          ›
        </span>
      </span>
    </button>
  );
}
function Unread({ count, label }: { count: number; label: string }) {
  return count > 0 ? (
    <span className="unread" aria-label={label}>
      {count}
    </span>
  ) : null;
}
function rulesText(single: boolean, mutual: boolean) {
  return (
    (single ? "одна цепочка" : "можно несколько цепочек") +
    ", " +
    (mutual ? "взаимные пары разрешены" : "без взаимных пар")
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
    <>
      <label className="toggle">
        <span>
          Одна цепочка
          <small>
            Все дарят по кругу: А → Б → В → А. Если выключить, может получиться
            несколько отдельных кругов.
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
          Взаимные пары
          <small>
            А дарит Б, а Б дарит А. Если выключить, нужно минимум трое
            участников.
          </small>
        </span>
        <input
          type="checkbox"
          checked={mutual}
          onChange={(e) => setMutual(e.target.checked)}
        />
      </label>
    </>
  );
}
function Home() {
  const { data, error, reload } = useLoad<Game[]>("/games");
  return (
    <>
      <PageTitle
        title="Мои игры"
        subtitle={<span className="festive">❄ Тайный Санта</span>}
        action={
          <button className="small" onClick={() => go("/new")}>
            + Новая игра
          </button>
        }
      />
      {!data ? (
        <Loading error={error} retry={reload} />
      ) : (
        <>
          <ErrorText text={error} />
          {data.length === 0 ? (
            <div className="card empty">
              <div className="empty-icon" aria-hidden="true">
                🎄
              </div>
              <p>Игр пока нет.</p>
              <p className="hint">
                Создайте новую или откройте ссылку-приглашение от организатора.
              </p>
            </div>
          ) : (
            <div className="list">
              {data.map((g) => (
                <Row
                  key={g.id}
                  onClick={() => go("/game/" + g.id)}
                  title={g.name}
                  subtitle={
                    g.count +
                    " " +
                    plural(g.count, "участник", "участника", "участников") +
                    " · " +
                    (g.is_owner ? "вы организатор" : g.creator_name)
                  }
                  tail={
                    g.missing?.length ? (
                      <span className="badge warn">⚠️ заполните анкету</span>
                    ) : (
                      <span className={"badge" + (g.started ? " done" : "")}>
                        {g.started ? "пары готовы" : "набор"}
                      </span>
                    )
                  }
                />
              ))}
            </div>
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
      <PageTitle
        title="Анкета"
        subtitle="Одна на все игры. Адрес и пожелания видит только тот, кто дарит подарок вам."
      />
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
      <Section title="Адрес доставки">
        <AutoTextarea
          className="card-input"
          aria-label="Адрес доставки"
          required
          maxLength={2000}
          minRows={2}
          value={value.address}
          onChange={(e) => change({ address: e.target.value })}
          placeholder="Страна, город, индекс, улица, ФИО получателя"
        />
      </Section>
      <Section
        title="Пожелания"
        footer={
          value.wishlist.length > 3000
            ? value.wishlist.length + " из 4000 символов"
            : "Необязательно, но Санте так будет проще. Ссылки станут кликабельными."
        }
      >
        <AutoTextarea
          className="card-input"
          aria-label="Пожелания"
          maxLength={4000}
          minRows={4}
          value={value.wishlist}
          onChange={(e) => change({ wishlist: e.target.value })}
          placeholder={
            "Что нравится, размеры, чего не дарить.\nМожно списком и со ссылками на товары."
          }
        />
      </Section>
      <Section title="Где вы живёте">
        <select
          className="card-input"
          aria-label="Где вы живёте"
          required
          value={value.location}
          onChange={(e) => change({ location: e.target.value })}
        >
          <option value="">Выберите</option>
          {Object.entries(locations).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </Section>
      <Section
        title="Куда готовы отправить подарок"
        footer="По этим направлениям подбираются пары."
      >
        <div className="card list-card">
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
        </div>
      </Section>
      <ErrorText text={action.error} />
      {saved && (
        <p role="status" className="success">
          Сохранено
        </p>
      )}
      <button className="full" disabled={action.busy}>
        {action.busy ? "Сохраняем…" : "Сохранить"}
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
      <PageTitle title="Новая игра" />
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
        <Section title="Название">
          <input
            className="card-input"
            aria-label="Название"
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Новый год 2027"
          />
        </Section>
        <Section
          title="Правила жеребьёвки"
          footer={
            "До " +
            MAX_MEMBERS +
            " участников. Организатор сам в игру не попадает: если тоже хотите дарить, вступите по своей ссылке."
          }
        >
          <div className="card list-card">
            <Settings
              single={single}
              mutual={mutual}
              setSingle={setSingle}
              setMutual={setMutual}
            />
          </div>
        </Section>
        <ErrorText text={action.error} />
        <button className="full" disabled={action.busy}>
          {action.busy ? "Создаём…" : "Создать"}
        </button>
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
      <PageTitle title="Приглашение" />
      {!g ? (
        <Loading error={error} retry={reload} />
      ) : (
        <>
          <div className="card invite">
            <h2>{g.name}</h2>
            <p className="hint">Организатор: {g.creator_name}</p>
            {g.started && !g.is_member && (
              <p className="warning">Жеребьёвка уже прошла, вступить нельзя.</p>
            )}
          </div>
          {!g.is_member && !g.started && (
            <p className="section-footer">
              Перед жеребьёвкой заполните анкету: адрес и куда готовы отправить
              подарок.
            </p>
          )}
          <ErrorText text={action.error} />
          <button
            className="full"
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
            {g.is_member ? "Открыть игру" : "Вступить"}
          </button>
        </>
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
  const action = useAction(),
    threads = useLoad<Thread[]>("/games/" + g.id + "/threads");
  useEffect(() => {
    const timer = setInterval(threads.reload, 5000);
    return () => clearInterval(timer);
  }, [threads.reload]);
  const current = threads.data?.filter((t) => !t.read_only) ?? [],
    archive = threads.data?.filter((t) => t.read_only) ?? [];
  return (
    <>
      <PageTitle
        title={g.name}
        subtitle={
          <>
            {g.count} из {MAX_MEMBERS} ·{" "}
            {g.started ? "пары готовы" : "идёт набор"}
            {g.round > 1 && " · розыгрыш №" + g.round}
            <br />
            {rulesText(g.single_cycle, g.allow_mutual_pairs)}
          </>
        }
      />
      {g.missing && g.missing.length > 0 && (
        <MissingProfile missing={g.missing} />
      )}
      {g.started && g.is_member && <Receiver id={g.id} />}
      {(g.started || archive.length > 0) && (
        <Section title="Переписка">
          {!threads.data ? (
            <Loading error={threads.error} retry={threads.reload} />
          ) : current.length === 0 ? (
            <p className="card hint">Вас нет в этом розыгрыше.</p>
          ) : (
            <ThreadList threads={current} gameId={g.id} />
          )}
        </Section>
      )}
      <Announcements game={g} />
      {g.is_member && (
        <Section>
          <div className="list">
            <Row
              title="Моя анкета"
              subtitle={
                g.started
                  ? "Если поменяете адрес, Санта получит уведомление"
                  : "Заполните до жеребьёвки"
              }
              onClick={() => go("/profile")}
            />
          </div>
        </Section>
      )}
      {g.is_owner && !g.started && g.invite_url && <InviteLink game={g} />}
      {g.is_owner && !g.started && <DrawPanel g={g} reload={reload} />}
      {archive.length > 0 && (
        <details className="section archive">
          <summary className="section-title">Прошлые розыгрыши</summary>
          <ThreadList threads={archive} gameId={g.id} />
        </details>
      )}
      <ErrorText text={action.error} />
      {g.is_owner && g.started && (
        <button
          className="danger full"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              if (
                !window.confirm(
                  "Сбросить жеребьёвку? Пары перестанут действовать, переписка уйдёт в архив.",
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
    </>
  );
}
function MissingProfile({ missing }: { missing: string[] }) {
  return (
    <div className="alert-card" role="alert">
      <div className="alert-icon" aria-hidden="true">
        ⚠️
      </div>
      <div className="alert-body">
        <strong>Анкета не заполнена</strong>
        <p>
          Не хватает: {missing.map((m) => m.toLowerCase()).join(", ")}. Пока
          анкета не заполнена, вы не попадёте в жеребьёвку.
        </p>
        <button className="small" onClick={() => go("/profile")}>
          Заполнить анкету
        </button>
      </div>
    </div>
  );
}
function ThreadList({
  threads,
  gameId,
}: {
  threads: Thread[];
  gameId: number;
}) {
  return (
    <div className="list">
      {threads.map((t) => (
        <Row
          key={t.key}
          muted={t.read_only}
          onClick={() => go("/chat/" + t.key + "/" + gameId)}
          title={
            t.side === "receiver"
              ? "🎁 " + t.counterpart_name
              : "🎅 Тайный Санта"
          }
          subtitle={
            (t.side === "receiver" ? "вы дарите" : "дарит вам") +
            (t.read_only ? " · розыгрыш №" + t.round : "") +
            (t.received ? " · подарок получен" : "")
          }
          tail={<Unread count={t.unread_count} label="Непрочитанные" />}
        />
      ))}
    </div>
  );
}
function InviteLink({ game: g }: { game: Game }) {
  const [copied, setCopied] = useState(false),
    action = useAction();
  return (
    <Section
      title="Приглашение"
      footer="Отправьте ссылку тем, кто будет участвовать."
    >
      <div className="card">
        <input
          className="link-input"
          readOnly
          aria-label="Ссылка приглашения"
          value={g.invite_url}
          onFocus={(e) => e.target.select()}
        />
        <div className="button-row">
          <button
            className="secondary small"
            onClick={() =>
              void action.run(async () => {
                await navigator.clipboard.writeText(g.invite_url!);
                setCopied(true);
              })
            }
          >
            {copied ? "Скопировано" : "Скопировать"}
          </button>
          <button
            className="small"
            onClick={() =>
              tg?.openTelegramLink(
                "https://t.me/share/url?url=" +
                  encodeURIComponent(g.invite_url!) +
                  "&text=" +
                  encodeURIComponent("Тайный Санта «" + g.name + "»"),
              )
            }
          >
            Поделиться
          </button>
        </div>
        {!g.is_member && (
          <button
            className="link-button"
            onClick={() => go("/invite/" + g.invite_url!.split("startapp=")[1])}
          >
            Участвовать самому
          </button>
        )}
        <ErrorText text={action.error} />
      </div>
    </Section>
  );
}
function DrawPanel({ g, reload }: { g: Game; reload: () => void }) {
  const [single, setSingle] = useState(g.single_cycle),
    [mutual, setMutual] = useState(g.allow_mutual_pairs),
    [name, setName] = useState(g.name),
    [report, setReport] = useState<Readiness>(),
    [force, setForce] = useState(false),
    [notice, setNotice] = useState(""),
    members = useLoad<GameMember[]>("/games/" + g.id + "/members"),
    action = useAction();
  const changed =
    single !== g.single_cycle ||
    mutual !== g.allow_mutual_pairs ||
    name !== g.name;
  return (
    <>
      <Section title="Настройки">
        <div className="card list-card">
          <label className="inline-field">
            Название
            <input
              maxLength={120}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNotice("");
              }}
            />
          </label>
          <Settings
            single={single}
            mutual={mutual}
            setSingle={(v) => {
              setSingle(v);
              setReport(undefined);
              setNotice("");
            }}
            setMutual={(v) => {
              setMutual(v);
              setReport(undefined);
              setNotice("");
            }}
          />
        </div>
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
                setNotice("Сохранено");
              })
            }
          >
            Сохранить изменения
          </button>
        )}
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
      </Section>
      <MembersPanel
        g={g}
        members={members}
        onChange={() => {
          setReport(undefined);
          members.reload();
          reload();
        }}
      />
      <Section
        title="Жеребьёвка"
        footer={changed ? "Сначала сохраните изменения." : undefined}
      >
        <div className="card list-card">
          <label className="check">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => {
                setForce(e.target.checked);
                setReport(undefined);
              }}
            />
            Не включать тех, кто не заполнил анкету
          </label>
        </div>
        {report && (
          <>
            <ErrorText text={report.error} />
            {report.problems.length > 0 && (
              <div className="warning problems" role="alert">
                <strong>Что мешает</strong>
                <ul>
                  {report.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.excluded.length > 0 && force && (
              <p className="warning">
                Не попадут в розыгрыш: {report.excluded.join(", ")}
              </p>
            )}
            {report.ready && (
              <p className="success">Всё готово, можно проводить.</p>
            )}
          </>
        )}
        <ErrorText text={action.error} />
        <div className="button-row">
          <button
            className="secondary"
            disabled={action.busy || changed}
            onClick={() =>
              void action.run(async () => {
                members.reload();
                setReport(
                  await api<Readiness>(
                    "/games/" + g.id + "/readiness",
                    "POST",
                    { force },
                  ),
                );
              })
            }
          >
            Проверить
          </button>
          <button
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
                  ? "\nНе попадут в розыгрыш: " + latest.excluded.join(", ")
                  : "";
                if (
                  !window.confirm(
                    "Провести жеребьёвку? Поменять пары потом можно только сбросом." +
                      exclusion,
                  )
                )
                  return;
                await api("/games/" + g.id + "/draw", "POST", {
                  force,
                  exclusions: latest.exclusions,
                });
                reload();
              })
            }
          >
            {action.busy ? "Секунду…" : "Провести"}
          </button>
        </div>
      </Section>
    </>
  );
}
function memberStatus(m: GameMember) {
  return m.missing.length
    ? "нет: " + m.missing.map((f) => f.toLowerCase()).join(", ")
    : "анкета заполнена" + (m.wishlist_empty ? ", без пожеланий" : "");
}
function MembersPanel({
  g,
  members,
  onChange,
}: {
  g: Game;
  members: { data?: GameMember[]; error: string; reload: () => void };
  onChange: () => void;
}) {
  const action = useAction(),
    list = members.data ?? [],
    names = new Map(list.map((m) => [m.id, m.name])),
    incomplete = list.filter((m) => m.missing.length > 0).length;
  const change = (method: string, path: string, body?: unknown) =>
    void action.run(async () => {
      await api(path, method, body);
      onChange();
    });
  return (
    <Section
      title={"Участники" + (incomplete ? " · без анкеты: " + incomplete : "")}
      footer="Запреты видите только вы. Запрет односторонний: «Аня не дарит Пете» не мешает Пете дарить Ане."
    >
      {!members.data ? (
        <Loading error={members.error} retry={members.reload} />
      ) : list.length === 0 ? (
        <p className="card hint">Пока никто не присоединился.</p>
      ) : (
        <div className="list">
          {list.map((m) => {
            const options = list.filter(
              (other) => other.id !== m.id && !m.blocked.includes(other.id),
            );
            return (
              <div className="member-card" key={m.id}>
                <div className="member-head">
                  <span className="row-main">
                    <strong>{m.name}</strong>
                    <small className={m.missing.length ? "bad" : "ok"}>
                      {m.missing.length ? "⚠️ " : "✓ "}
                      {memberStatus(m)}
                    </small>
                  </span>
                  <button
                    className="link-button danger-link"
                    disabled={action.busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Исключить «" +
                            m.name +
                            "» из игры? Бот пришлёт уведомление, запреты с этим участником удалятся.",
                        )
                      )
                        change("DELETE", "/games/" + g.id + "/members/" + m.id);
                    }}
                  >
                    Исключить
                  </button>
                </div>
                {(m.blocked.length > 0 || options.length > 0) && (
                  <div className="blocked">
                    {m.blocked.length > 0 && (
                      <span className="hint">Не дарит:</span>
                    )}
                    {m.blocked.map((id) => (
                      <span className="chip" key={id}>
                        {names.get(id)}
                        <button
                          className="chip-remove"
                          aria-label={"Снять запрет: " + names.get(id)}
                          disabled={action.busy}
                          onClick={() =>
                            change(
                              "DELETE",
                              "/games/" + g.id + "/blocked/" + m.id + "/" + id,
                            )
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {options.length > 0 && (
                      <label className="chip add">
                        + Не дарит…
                        <select
                          aria-label={"Кому " + m.name + " не дарит"}
                          value=""
                          disabled={action.busy}
                          onChange={(e) =>
                            e.target.value &&
                            change("POST", "/games/" + g.id + "/blocked", {
                              sender: m.id,
                              receiver: Number(e.target.value),
                            })
                          }
                        >
                          <option value="">Выберите участника</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ErrorText text={action.error} />
    </Section>
  );
}
function Receiver({ id }: { id: number }) {
  const { data, error, reload } = useLoad<{
      name: string;
      address: string;
      wishlist: string;
    }>("/games/" + id + "/receiver"),
    [copied, setCopied] = useState(false);
  return (
    <Section title="Вы дарите">
      <div className="card recipient">
        {data ? (
          <>
            <div className="recipient-name">{data.name}</div>
            <div className="field">
              <small>Пожелания</small>
              {data.wishlist ? (
                <Expandable text={data.wishlist} />
              ) : (
                <p className="hint">Не указаны. Можно спросить в переписке.</p>
              )}
            </div>
            <div className="field">
              <small>Адрес</small>
              <p className="preserve">{data.address}</p>
              <button
                className="link-button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(data.address)
                    .then(() => setCopied(true))
                }
              >
                {copied ? "Скопировано" : "Скопировать адрес"}
              </button>
            </div>
          </>
        ) : error === "Не найдено" ? (
          <p className="hint">
            Вас нет в этом розыгрыше: скорее всего, анкета не была заполнена.
            Напишите организатору.
          </p>
        ) : (
          <Loading error={error} retry={error ? reload : undefined} />
        )}
      </div>
    </Section>
  );
}
function Announcements({ game }: { game: Game }) {
  const [expanded, setExpanded] = useState(false),
    [text, setText] = useState(""),
    [version, setVersion] = useState(0),
    action = useAction(),
    summary = useLoad<AnnouncementSummary>(
      "/games/" + game.id + "/announcements/latest",
    );
  useEffect(() => {
    const timer = setInterval(summary.reload, 5000);
    return () => clearInterval(timer);
  }, [summary.reload]);
  const latest = summary.data?.latest;
  if (summary.data && !latest && !game.is_owner) return null;
  return (
    <Section title="Объявления организатора">
      <div className="card announcements">
        <button
          type="button"
          className="announcement-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="announcement-preview">
            {latest?.text || <span className="hint">Пока ничего</span>}
          </span>
          <span className="row-tail">
            {!expanded && (
              <Unread
                count={summary.data?.unread_count ?? 0}
                label="Непрочитанные объявления"
              />
            )}
            <span className="chevron" aria-hidden="true">
              {expanded ? "⌃" : "⌄"}
            </span>
          </span>
        </button>
        <ErrorText text={summary.error} />
        {expanded && (
          <Feed
            path={"/games/" + game.id + "/announcements"}
            version={version}
            onLoad={summary.reload}
            empty="Объявлений нет."
          />
        )}
        {expanded && game.is_owner && (
          <form
            className="announce-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await api("/games/" + game.id + "/announcements", "POST", {
                  text,
                });
                setText("");
                setVersion((v) => v + 1);
                summary.reload();
              });
            }}
          >
            <AutoTextarea
              aria-label="Объявление"
              required
              minRows={2}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Например: отправляем подарки до 20 декабря"
            />
            <ErrorText text={action.error} />
            <button className="small" disabled={action.busy || !text.trim()}>
              Отправить всем
            </button>
          </form>
        )}
      </div>
    </Section>
  );
}
const dayFormat = new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
  }),
  timeFormat = new Intl.DateTimeFormat("ru", {
    hour: "2-digit",
    minute: "2-digit",
  });
function dayLabel(date: Date) {
  const today = new Date(),
    yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Сегодня";
  if (date.toDateString() === yesterday.toDateString()) return "Вчера";
  return dayFormat.format(date);
}
const nearBottom = () =>
  window.innerHeight + window.scrollY >=
  document.documentElement.scrollHeight - 120;
function Feed({
  path,
  version = 0,
  onLoad,
  empty = "Сообщений пока нет.",
  chat = false,
}: {
  path: string;
  version?: number;
  onLoad?: () => void;
  empty?: string;
  chat?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const action = useAction(),
    loadRef = useRef<() => Promise<void>>(undefined),
    stick = useRef(true);
  useEffect(() => {
    let stopped = false,
      busy = false,
      cursor = 0;
    setMessages([]);
    setLoading(true);
    stick.current = true;
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
            stick.current = stick.current || nearBottom();
            setMessages((old) => [...old, ...batch]);
          }
        } while (batch.length === 100);
        setError("");
        onLoad?.();
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
    loadRef.current = load;
    void load();
    const interval = setInterval(() => void load(), 5000);
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [path, onLoad]);
  useEffect(() => {
    if (version) {
      stick.current = true;
      void loadRef.current?.();
    }
  }, [version]);
  useEffect(() => {
    if (chat && stick.current && messages.length) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      stick.current = false;
    }
  }, [chat, messages]);
  let lastDay = "";
  return (
    <div className={"feed" + (chat ? " chat-feed" : "")} aria-live="polite">
      <ErrorText text={error || action.error} />
      {loading ? (
        <Loading />
      ) : messages.length === 0 ? (
        <p className="hint feed-empty">{empty}</p>
      ) : (
        messages.map((m) => {
          const date = new Date(m.created),
            day = dayLabel(date),
            separator = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id} className="message">
              {separator && <div className="day">{day}</div>}
              <article className={"bubble" + (m.mine ? " mine" : "")}>
                {m.text && (
                  <p className="preserve">
                    <Linkify text={m.text} />
                  </p>
                )}
                {m.file_key && (
                  <button
                    className="attachment"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(() => download(m.file_key!, m.file_name!))
                    }
                  >
                    <span aria-hidden="true">📎</span> {m.file_name}
                  </button>
                )}
                <time dateTime={m.created}>{timeFormat.format(date)}</time>
              </article>
            </div>
          );
        })
      )}
    </div>
  );
}
function Delivery({ thread, reload }: { thread: Thread; reload: () => void }) {
  const [tracking, setTracking] = useState(thread.tracking_number),
    action = useAction();
  useEffect(
    () => setTracking(thread.tracking_number),
    [thread.tracking_number],
  );
  if (thread.side === "receiver")
    return (
      <div className="delivery">
        {thread.received ? (
          <p className="delivery-line ok">
            ✓ Получатель отметил, что подарок у него
          </p>
        ) : (
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(async () => {
                await api("/threads/" + thread.key + "/tracking", "PUT", {
                  tracking_number: tracking,
                });
                reload();
              });
            }}
          >
            <input
              aria-label="Трек-номер"
              required
              maxLength={200}
              disabled={thread.read_only}
              value={tracking}
              onChange={(event) => setTracking(event.target.value)}
              placeholder="Трек-номер посылки"
            />
            {tracking.trim() !== thread.tracking_number && (
              <button className="small" disabled={action.busy}>
                Сохранить
              </button>
            )}
          </form>
        )}
        <ErrorText text={action.error} />
      </div>
    );
  return (
    <div className="delivery">
      <div className="delivery-row">
        <span className="delivery-line">
          {thread.received ? (
            <span className="ok">✓ Подарок получен</span>
          ) : thread.tracking_number ? (
            <>
              Трек-номер:{" "}
              <strong className="select">{thread.tracking_number}</strong>
            </>
          ) : (
            <span className="hint">Трек-номера пока нет</span>
          )}
        </span>
        {!thread.read_only && (
          <button
            className={"small" + (thread.received ? " secondary" : "")}
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await api("/threads/" + thread.key + "/received", "POST", {
                  received: !thread.received,
                });
                reload();
              })
            }
          >
            {thread.received ? "Отменить" : "Подарок получен"}
          </button>
        )}
      </div>
      <ErrorText text={action.error} />
    </div>
  );
}
function Composer({
  threadKey,
  onSent,
}: {
  threadKey: string;
  onSent: () => void;
}) {
  const [text, setText] = useState(""),
    [file, setFile] = useState<File>(),
    action = useAction(),
    fileInput = useRef<HTMLInputElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [text]);
  const clearFile = () => {
    setFile(undefined);
    if (fileInput.current) fileInput.current.value = "";
  };
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() && !file) return;
    void action.run(async () => {
      if (file && file.size > 20 * 1024 * 1024)
        throw new Error("Файл больше 20 МБ");
      const body = new FormData();
      body.set("text", text);
      if (file) body.set("file", file);
      await api("/threads/" + threadKey + "/messages", "POST", body);
      setText("");
      clearFile();
      onSent();
    });
  };
  return (
    <form className="composer" onSubmit={submit}>
      <ErrorText text={action.error} />
      {file && (
        <div className="file-chip">
          <span>📎 {file.name}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Убрать файл"
            onClick={clearFile}
          >
            ×
          </button>
        </div>
      )}
      <div className="composer-row">
        <label className="icon-button attach" title="Файл до 20 МБ">
          <span aria-hidden="true">📎</span>
          <input
            ref={fileInput}
            type="file"
            aria-label="Прикрепить файл"
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </label>
        <textarea
          ref={textarea}
          rows={1}
          aria-label="Сообщение"
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder="Сообщение"
        />
        <button
          className="send"
          aria-label="Отправить"
          disabled={action.busy || (!text.trim() && !file)}
        >
          ↑
        </button>
      </div>
    </form>
  );
}
function Chat({ threadKey, gameId }: { threadKey: string; gameId: string }) {
  const { data, error, reload } = useLoad<Thread[]>(
      "/games/" + gameId + "/threads",
    ),
    [version, setVersion] = useState(0);
  const thread = data?.find((t) => t.key === threadKey);
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
  if (!data) return <Loading error={error} retry={reload} />;
  if (!thread) return <ErrorText text="Диалог не найден" />;
  const isSanta = thread.side === "receiver";
  return (
    <div className="chat">
      <div className="chat-head">
        <h1>{isSanta ? "🎁 " + thread.counterpart_name : "🎅 Тайный Санта"}</h1>
        <p className="hint">
          {isSanta
            ? "Вы дарите. Ваше имя скрыто, не подписывайтесь."
            : "Дарит вам. Кто это, не видно."}
          {" · "}
          {thread.game_name}
          {thread.read_only && ", розыгрыш №" + thread.round}
        </p>
        <Delivery thread={thread} reload={reload} />
      </div>
      <ErrorText text={error} />
      <Feed
        chat
        path={"/threads/" + threadKey + "/messages"}
        version={version}
        empty={
          isSanta
            ? "Можно уточнить размер, адрес или что-то по пожеланиям."
            : "Санта может написать, если что-то уточнить."
        }
      />
      {thread.read_only ? (
        <p className="archive-note">
          Это архив прошлого розыгрыша, писать сюда нельзя.
        </p>
      ) : (
        <Composer
          threadKey={threadKey}
          onSent={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}
function App() {
  const [path, setPath] = useState(currentPath()),
    [notifications, setNotifications] = useState(
      !!tg?.initDataUnsafe.user?.allows_write_to_pm,
    );
  useEffect(() => {
    if (tg?.initDataUnsafe.start_param)
      go("/invite/" + encodeURIComponent(tg.initDataUnsafe.start_param));
    const changed = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", changed);
    changed();
    tg?.ready();
    tg?.expand();
    try {
      tg?.setHeaderColor?.("secondary_bg_color");
      tg?.setBackgroundColor?.("secondary_bg_color");
    } catch {
      // Older Telegram clients do not support these.
    }
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
        <PageTitle
          title="Тайный Санта"
          subtitle="Откройте приложение через бота в Telegram."
        />
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
  const inChat = parts[0] === "chat";
  return (
    <>
      <main key={path} className={inChat ? "in-chat" : undefined}>
        {page}
        {!inChat && !notifications && tg.requestWriteAccess && (
          <button
            className="link-button notification-button"
            onClick={() =>
              tg?.requestWriteAccess?.((allowed) => setNotifications(allowed))
            }
          >
            Разрешить боту присылать уведомления
          </button>
        )}
      </main>
      {!inChat && (
        <nav aria-label="Основная навигация">
          <button
            aria-current={path === "/" ? "page" : undefined}
            onClick={() => go("/")}
          >
            <span aria-hidden="true">🎁</span> Игры
          </button>
          <button
            aria-current={path === "/profile" ? "page" : undefined}
            onClick={() => go("/profile")}
          >
            <span aria-hidden="true">📝</span> Анкета
          </button>
        </nav>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
