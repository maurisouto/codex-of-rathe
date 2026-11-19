"use client";

import Image from "next/image";
import Link from "next/link";
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import hero from "./assets/hero.webp";
import wayfindersArc from "./assets/wayfinders-arc-full.svg";
import {
  abandonRun,
  ChronicleRequestError,
  deadlineFromServer,
  elapsedLabel,
  highestLevelLabel,
  localResult,
  MODES,
  moveInOrder,
  parseSavedResult,
  recordResult,
  roundAction,
  secondsRemaining,
  startRun,
  subscribeToResult,
  type Mode,
  type RevealCard,
  type RoundResult,
  type SavedResult,
  type Snapshot,
} from "./chronicle-client";
import { ChronicleGuide } from "./chronicle-guide";
import styles from "./chronicle.module.css";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const serverResult = () => null;
type Direction = -1 | 1;
type Retry = { message: string; attempt: () => void; label?: string };
type MoveFocus = { id: string; direction: Direction };

function roundLabel(snapshot: Snapshot) {
  return snapshot.mode === "streak" ? `Streak · Level ${snapshot.level} of 6` : MODES[snapshot.mode].title;
}

function outcomeLabel(outcome: RoundResult["outcome"]) {
  if (outcome === "timeout") return "Time ran out";
  return outcome === "correct" ? "Order correct" : "Order incorrect";
}

function savedLabel(record: SavedResult) {
  if (record.mode === "streak") return highestLevelLabel(record.highestLevel);
  return [outcomeLabel(record.outcome), record.elapsedMs === null ? null : elapsedLabel(record.elapsedMs)]
    .filter(Boolean).join(" · ");
}

function cardColumns(count: number) {
  return { "--card-count": count } as CSSProperties;
}

function ResultArt({ card }: { card: RevealCard }) {
  const [unavailable, setUnavailable] = useState(false);
  return unavailable ? (
    <p className={styles.imageFallback}>Full card image unavailable</p>
  ) : (
    <Image
      unoptimized
      src={card.fullImageUrl}
      width={320}
      height={448}
      alt={`${card.name} full card`}
      onError={() => setUnavailable(true)}
      className={styles.fullArt}
    />
  );
}

export function ChroniclePlay() {
  const [mode, setMode] = useState<Mode>("streak");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<Retry | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const saved = parseSavedResult(useSyncExternalStore(subscribeToResult, localResult, serverResult));

  const current = useRef<Snapshot | null>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const deadline = useRef<number | null>(null);
  const problem = useRef(false);
  const loaded = useRef(new Set<string>());
  const modeInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const board = useRef<HTMLOListElement>(null);
  const moveFocus = useRef<MoveFocus | null>(null);

  const publish = useCallback((next: Snapshot, requestedAt: number) => {
    const sameRound = current.current?.roundId === next.roundId;
    if (!sameRound) {
      loaded.current = new Set();
      moveFocus.current = null;
      setAnnouncement("");
    }
    current.current = next;
    deadline.current = next.result ? null : deadlineFromServer(next, requestedAt, sameRound ? deadline.current : null);
    setSeconds(deadline.current === null ? null : secondsRemaining(deadline.current, performance.now()));
    setSnapshot(next);
    if (next.result?.complete) recordResult(next);
  }, []);

  const reset = useCallback((focus = true) => {
    generation.current++;
    const previous = current.current;
    current.current = null;
    pending.current = false;
    deadline.current = null;
    problem.current = false;
    moveFocus.current = null;
    if (previous && !previous.result?.complete) abandonRun(previous);
    setSnapshot(null);
    setBusy(false);
    setRetry(null);
    setSeconds(null);
    setAnnouncement("");
    if (focus) requestAnimationFrame(() => modeInput.current?.focus());
  }, []);

  const start = useCallback(async (nextMode: Mode) => {
    if (pending.current) return;
    reset(false);
    const token = generation.current;
    pending.current = true;
    setBusy(true);
    try {
      const requestedAt = performance.now();
      const next = await startRun(nextMode);
      if (generation.current === token) publish(next, requestedAt);
      else abandonRun(next);
    } catch {
      if (generation.current !== token) return;
      problem.current = true;
      setRetry({ message: "A complete run is unavailable right now.", attempt: () => void start(nextMode) });
    } finally {
      if (generation.current === token) {
        pending.current = false;
        setBusy(false);
      }
    }
  }, [publish, reset]);

  const perform = useCallback(async (
    action: Parameters<typeof roundAction>[1],
    order?: string[],
    focus?: MoveFocus,
  ) => {
    const previous = current.current;
    if (!previous || pending.current) return;
    const token = generation.current;
    pending.current = true;
    problem.current = false;
    setRetry(null);
    setBusy(true);
    try {
      const requestedAt = performance.now();
      const next = await roundAction(previous, action, order);
      if (generation.current !== token) {
        // Navigation may have abandoned the previous round while this transition opened a new one.
        if (action === "next" && next.roundId !== previous.roundId) abandonRun(next);
        return;
      }
      if (focus && !next.result) {
        moveFocus.current = focus;
        const cardName = next.cards.find((card) => card.id === focus.id)?.name;
        setAnnouncement(`${cardName ?? "Card"} moved to position ${next.order.indexOf(focus.id) + 1}.`);
      }
      publish(next, requestedAt);
    } catch (error) {
      if (generation.current !== token) return;
      problem.current = true;
      const expired = error instanceof ChronicleRequestError && (error.status === 404 || error.status === 410);
      setRetry(expired
        ? { message: "This run is no longer available.", label: "Start a new run", attempt: () => { reset(false); void start(previous.mode); } }
        : { message: "Chronicle could not update this round.", attempt: () => void perform(action, order, focus) });
    } finally {
      if (generation.current === token) {
        pending.current = false;
        setBusy(false);
      }
    }
  }, [publish, reset, start]);

  const onArtLoaded = (roundId: string, id: string) => {
    const round = current.current;
    if (!round || round.roundId !== roundId || round.result || round.ready || problem.current) return;
    loaded.current.add(id);
    if (loaded.current.size === round.cards.length && !pending.current) void perform("ready");
  };

  const onArtError = (roundId: string) => {
    const round = current.current;
    if (!round || round.roundId !== roundId || round.result) return;
    reset(false);
    setRetry({
      message: "An illustration could not load. This run was discarded.",
      label: "Start a new run",
      attempt: () => void start(round.mode),
    });
  };

  useEffect(() => () => {
    generation.current++;
    const previous = current.current;
    current.current = null;
    if (previous && !previous.result?.complete) abandonRun(previous);
  }, []);

  const resolved = Boolean(snapshot?.result);
  const roundId = snapshot?.roundId;
  useEffect(() => {
    if (roundId) heading.current?.focus();
  }, [roundId, resolved]);

  useLayoutEffect(() => {
    const focus = moveFocus.current;
    if (!focus || snapshot?.result || !board.current) return;
    const item = Array.from(board.current.children)
      .find((element) => (element as HTMLElement).dataset.cardId === focus.id);
    const controls = Array.from(item?.querySelectorAll("button:not(:disabled)") ?? []) as HTMLButtonElement[];
    const active = document.activeElement;
    if (active === document.body || item?.contains(active)) {
      (controls.find((button) => button.dataset.direction === String(focus.direction)) ?? controls[0])?.focus();
    }
    moveFocus.current = null;
  }, [snapshot]);

  useEffect(() => {
    if (snapshot?.deadlineMs == null || resolved) return;
    const tick = () => {
      if (deadline.current === null) return;
      const remaining = secondsRemaining(deadline.current, performance.now());
      setSeconds(remaining);
      if (remaining === 0 && !pending.current && !problem.current) void perform("expire");
    };
    const interval = window.setInterval(tick, 100);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [snapshot?.deadlineMs, resolved, perform]);

  const timedOut = (snapshot?.mode === "timed" && seconds === 0);
  const setOrder = (id: string, direction: Direction) => {
    const round = current.current;
    if (!round?.ready || round.result || pending.current || problem.current) return;
    if (deadline.current !== null && performance.now() >= deadline.current) {
      void perform("expire");
      return;
    }
    const order = moveInOrder(round.order, id, direction);
    if (order) void perform("move", order, { id, direction });
  };

  const lock = () => {
    const round = current.current;
    if (!round?.ready || round.result || pending.current || problem.current) return;
    if (deadline.current !== null && performance.now() >= deadline.current) {
      void perform("expire");
      return;
    }
    void perform("submit", round.order);
  };
  const showError = retry && (
    <div className={styles.error}>
      <p role="alert">{retry.message}</p>
      <button type="button" onClick={retry.attempt}>{retry.label ?? "Retry"}</button>
    </div>
  );

  function chooseMode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void start(mode);
  }

  return (
    <div className={styles.chronicle}>
      <nav className={styles.nav} aria-label="Chronicle">
        <Link href="/" onClick={() => reset(false)}><span aria-hidden="true">←&nbsp;</span>Back to Codex hub</Link>
        {!snapshot && <div><a href="#modes">Modes</a><a href="#how">How to play</a><a href="#faq">FAQ</a></div>}
      </nav>

      {!snapshot && (
        <>
          <header className={styles.hero}>
            <Image src={hero} alt="" fill sizes="(max-width: 760px) 100vw, 1120px" className={styles.heroArt} />
            <div>
              <h1 className={styles.sr}>Chronicle of Rathe</h1>
              <Image src={wayfindersArc} alt="" unoptimized className={styles.heroLogo} />
              <p>Every illustration leaves a mark on Rathe. Order their first commercial releases from earliest to latest.</p>
            </div>
          </header>
          <section id="modes" className={styles.panel}>
            <form onSubmit={chooseMode}>
              <fieldset disabled={busy}>
                <legend>Choose a mode</legend>
                <div className={styles.modes}>
                  {(Object.keys(MODES) as Mode[]).map((value) => (
                    <label className={styles.mode} key={value}>
                      <strong>
                        <input
                          ref={mode === value ? modeInput : undefined}
                          type="radio"
                          name="mode"
                          value={value}
                          checked={mode === value}
                          onChange={() => setMode(value)}
                        />{" "}{MODES[value].title}
                      </strong>
                      <span>{MODES[value].description}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {showError}
              <div className={styles.actions}>
                <button className={styles.primary} disabled={busy} type="submit">
                  {busy ? "Preparing round…" : "Start round"}
                </button>
                {saved && <small>Latest result on this browser · {MODES[saved.mode].title} · {savedLabel(saved)}</small>}
              </div>
            </form>
          </section>
          <ChronicleGuide />
        </>
      )}

      {snapshot && !snapshot.result && (
        <section className={styles.panel} aria-labelledby="chronicle-round-title">
          <header className={styles.roundHeader}>
            <div>
              <p>{roundLabel(snapshot)}</p>
              <h1 id="chronicle-round-title" ref={heading} tabIndex={-1}>Order the artwork</h1>
            </div>
            {seconds !== null && (
              <span className={styles.clock} role="timer" aria-label="Time remaining">{seconds}s left</span>
            )}
          </header>
          <div className={styles.axis}>
            <span>Earliest</span><i aria-hidden="true" /><span>Latest</span>
            <span className={styles.mobileAxis}>Read across each row</span>
          </div>
          <ol
            ref={board}
            className={styles.cards}
            style={cardColumns(snapshot.order.length)}
            aria-label="Your proposed release order"
          >
            {snapshot.order.map((id, position) => {
              const card = snapshot.cards.find((entry) => entry.id === id);
              if (!card) return null;
              return (
                <li key={`${snapshot.roundId}:${id}`} data-card-id={id} className={styles.card}>
                  <small>Position {position + 1}</small>
                  <Image
                    unoptimized
                    src={card.cropDataUrl}
                    alt={`${card.name} illustration`}
                    width={240}
                    height={189}
                    loading="eager"
                    className={styles.crop}
                    onLoad={() => onArtLoaded(snapshot.roundId, id)}
                    onError={() => onArtError(snapshot.roundId)}
                  />
                  <h2>{card.name}</h2>
                  <div className={styles.moves}>
                    {([-1, 1] as const).map((direction) => {
                      const earlier = direction === -1;
                      const label = earlier ? "Earlier" : "Later";
                      return (
                        <button
                          type="button"
                          key={direction}
                          data-direction={direction}
                          aria-label={`Move position ${position + 1} ${label.toLowerCase()}`}
                          disabled={!snapshot.ready || timedOut || (earlier ? position === 0 : position === snapshot.order.length - 1)}
                          aria-disabled={busy || retry !== null || undefined}
                          onClick={() => setOrder(id, direction)}
                        >{label}</button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className={styles.sr} role="status">{announcement}</p>
          {!snapshot.ready && !retry && <p role="status" className={styles.ready}>Preparing the board…</p>}
          {showError}
          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={!snapshot.ready || busy || retry !== null || timedOut}
              type="button"
              onClick={lock}
            >Lock order</button>
            <button type="button" onClick={() => reset()}>Return to modes</button>
          </div>
        </section>
      )}

      {snapshot?.result && (
        <section className={styles.panel} aria-labelledby="chronicle-result-title">
          <header className={styles.roundHeader}>
            <div>
              <p>{roundLabel(snapshot)}</p>
              <h1 id="chronicle-result-title" ref={heading} tabIndex={-1}>
                {snapshot.mode === "streak" && snapshot.result.outcome === "correct"
                  ? snapshot.result.complete ? "Streak complete" : "Level cleared"
                  : outcomeLabel(snapshot.result.outcome)}
              </h1>
            </div>
          </header>
          {snapshot.mode === "streak" && (
            <p>{snapshot.result.complete
              ? highestLevelLabel(snapshot.result.highestLevel)
              : "The next level adds one illustration."}</p>
          )}
          {snapshot.result.elapsedMs !== null && snapshot.mode === "untimed" && (
            <p>Elapsed time: {elapsedLabel(snapshot.result.elapsedMs)}</p>
          )}
          <p>{snapshot.result.outcome === "timeout"
            ? "The timeline compares your order when the clock ran out."
            : "The timeline compares your submitted positions with the correct release order."}</p>
          <div className={styles.axis}><span>Earliest release</span><i aria-hidden="true" /><span>Latest release</span></div>
          <ol className={styles.cards} style={cardColumns(snapshot.result.cards.length)} aria-label="Correct release order">
            {snapshot.result.cards.map((card, position) => (
              <li key={`${snapshot.roundId}:${card.id}`} className={styles.card}>
                <small>Position {position + 1} · Yours {card.submittedPosition}</small>
                <ResultArt card={card} />
                <h2>{card.name}</h2>
                <time dateTime={card.date}>{dateFormat.format(new Date(card.date))}</time>
                <p>{card.release}</p>
              </li>
            ))}
          </ol>
          {showError}
          <div className={styles.actions}>
            <button
              className={styles.primary}
              disabled={busy || retry !== null}
              type="button"
              onClick={() => {
                if (snapshot.result?.complete) void start(snapshot.mode);
                else void perform("next");
              }}
            >{snapshot.result.complete ? "Play again" : "Next level"}</button>
            <button type="button" onClick={() => reset()}>Return to modes</button>
          </div>
        </section>
      )}
    </div>
  );
}
