"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import Image from "next/image";
import { requestRunes, RunesRequestError, type RunesSnapshot } from "./runes-client";
import { selectionAfterRunAction } from "./runes-ui-state";
import styles from "./runes.module.css";

type PendingAction = { action: "ready" | "reveal" | "confirm" | "ack"; requestId: string; artworkId?: string; expectedCluesRevealed?: number };
const selectionKey = (runId: string) => `runes-selection:${runId}`;

function RuneEmblem({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 120" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="bevel">
      <path d="m17 13 24 21-17 27 31 1 7 29 19-25 26 7-12-29 19-23-33 8L60 4 48 39Z" />
      <path d="m30 89 24-9m16 28 6-25m20-5 15 17M16 112l17-20" />
    </svg>
  );
}

function elapsedLabel(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const HOW_TO_STEPS = [
  {
    title: "Read the first clue",
    body: "When all four illustrations have loaded, the timer starts and the first clue appears automatically. It counts as a clue used.",
  },
  {
    title: "Follow the trail",
    body: "Select Read the Runes to reveal one more clue. Each clue stays in the history. Reviewing clues or this guide does not pause the timer.",
  },
  {
    title: "Choose an artwork",
    body: "Select one of the four illustrations. You can change your selection until you select Confirm answer.",
  },
  {
    title: "Confirm your answer",
    body: "Select Confirm answer once. A correct choice wins; an incorrect choice ends the round immediately. The last clue still leaves Confirm answer available.",
  },
] as const;

const RUNES_FAQ = [
  ["When does the timer begin?", "After all four illustrations have loaded, the timer starts and the first clue appears automatically. It counts as a clue used."],
  ["Can I review clues?", "Yes. Every revealed clue stays in the history. Reviewing clues or this guide uses no extra clue, and the timer keeps running."],
  ["Can I change my answer?", "Yes. Change your selected artwork any time before you select Confirm answer. You can confirm only once."],
  ["Can I answer after the last clue?", "Yes. Revealing the last clue does not use your confirmation. Confirm answer remains available."],
  ["How are the four artworks chosen?", "Each round shows four distinct artwork crops with applicable catalog facts. Duplicate or ambiguous artwork is excluded."],
  ["When is the full card revealed?", "After the round ends. During play, you see artwork crops and clues that have been revealed."],
  ["How are wins ranked and losses kept?", "Authenticated wins rank by fewest clues, then fastest time; an exact tie shares a rank. Losses are kept in Your archive but do not set a best record."],
  ["Are guest or practice rounds recorded?", "No. Guest and tutorial rounds do not enter records, stats, or rankings. Sign in before a ranked round to save its result."],
] as const;

function RunesHowToContent() {
  return <div data-runes-how-to>
    <p className={styles.helpIntro}>Four illustrations. A trail of clues. Find the hidden artwork before the round closes.</p>
    <ol className={styles.helpGrid}>
      {HOW_TO_STEPS.map(({ title, body }, index) => <li key={title}>
        <p className={styles.stepNumber}>Step {index + 1}</p>
        <h3>{title}</h3>
        <p>{body}</p>
      </li>)}
    </ol>
    <div className={styles.helpExample}>
      <Image unoptimized src="/runes/crops/pool-01.webp" alt="A warrior carves a glowing rune into the earth." width={330} height={276} />
      <div><h3>Read the Runes · Example</h3><p><strong>Class</strong> · Runeblade</p><p>This clue applies to the illustrated card. Follow the same trail in a round.</p></div>
    </div>
  </div>;
}

function RunesFaqContent() {
  return <div data-runes-faq>
    {RUNES_FAQ.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
  </div>;
}

async function runAction(runId: string, pending: PendingAction): Promise<RunesSnapshot> {
  return requestRunes(`/api/runes/runs/${encodeURIComponent(runId)}`, pending, "POST");
}

function RoundResult({ snapshot, replay, reset, authenticated }: { snapshot: RunesSnapshot; replay: (mode: "ranked" | "tutorial") => void; reset: () => void; authenticated: boolean }) {
  const result = snapshot.result;
  if (!result) return null;
  const won = result.outcome === "correct";
  const selectedMatches = result.selectedArtwork.id === result.correctArtwork.id;
  return (
    <section className={`${styles.panel} ${styles.result}`} aria-labelledby="runes-result-title">
      <div>
        <p className={styles.eyebrow}>The round is complete</p>
        <h2 id="runes-result-title" tabIndex={-1} className={styles.title}>{won ? "Correct" : "Incorrect"}</h2>
        <p className={styles.lead}>
          {won ? "You uncovered the hidden artwork." : `You chose ${result.selectedArtwork.label}; the hidden artwork was ${result.correctArtwork.label}.`}
        </p>
        <p className={styles.status}>{result.cluesUsed} {result.cluesUsed === 1 ? "clue" : "clues"} · {elapsedLabel(result.elapsedMs)}</p>
        {snapshot.mode === "tutorial" && <p className={styles.reveal}>This practice round leaves your records and statistics untouched.</p>}
        {snapshot.mode === "ranked" && !authenticated && <p className={styles.reveal}>Guest rounds are not saved to records, statistics, or rankings.</p>}
        {snapshot.mode === "ranked" && authenticated && result.recorded && (won
          ? <p className={styles.reveal}>{result.personalBest ? `Your best: ${result.personalBest.clues} clues · ${elapsedLabel(result.personalBest.elapsedMs)} · rank ${result.personalBest.rank}.` : "Your win was saved to the Read the Runes archive."}</p>
          : <p className={styles.reveal}>This loss is recorded in your Runes archive; only victories set a best record.</p>)}
        {snapshot.mode === "ranked" && authenticated && !result.recorded && <p className={styles.error} role="alert">The round ended, but its record could not be saved. Retry the same confirmation to preserve it.</p>}
      </div>
      <section aria-labelledby="result-clues-title">
        <h3 id="result-clues-title">Clues revealed</h3>
        <ol className={styles.clues}>{snapshot.clues.map((clue) => <li key={`${clue.number}-${clue.label}`}><span className={styles.clueNumber} aria-hidden="true"><span>{clue.number}</span></span><div><strong>{clue.label}</strong><div className={styles.clueValue}>{clue.value}</div></div></li>)}</ol>
      </section>
      <div className={styles.resultGrid}>
        <article className={styles.resultCard}>
          <h3>{selectedMatches ? "Your answer · Correct artwork" : "Correct artwork"}</h3>
          <Image unoptimized src={result.correctArtwork.fullImageUrl} alt={`Full card: ${result.correctArtwork.name}`} width={450} height={628} />
          <p><strong>{result.correctArtwork.name}</strong> · {result.correctArtwork.set}</p>
        </article>
        {!selectedMatches && (
          <article className={styles.resultCard}>
            <h3>Your answer</h3>
            <Image unoptimized src={result.selectedArtwork.fullImageUrl} alt={`Full card: ${result.selectedArtwork.name}`} width={450} height={628} />
            <p><strong>{result.selectedArtwork.name}</strong> · {result.selectedArtwork.set}</p>
          </article>
        )}
      </div>
      <div className={styles.actions}>
        <button className={styles.button} type="button" onClick={() => replay(snapshot.mode)}>Play again</button>
        <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={reset}>Back to setup</button>
        <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/runes/leaderboard">Leaderboard</Link>
        <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/">Back to Codex hub</Link>
      </div>
    </section>
  );
}

function RunesHelpSections() {
  return <>
    <section className={`${styles.panel} ${styles.help}`} id="how" aria-labelledby="how-title">
      <h2 id="how-title" tabIndex={-1}>How to play</h2>
      <RunesHowToContent />
    </section>
    <section className={`${styles.panel} ${styles.help} ${styles.faq}`} id="faq" aria-labelledby="faq-title">
      <h2 id="faq-title" tabIndex={-1}>FAQ</h2>
      <RunesFaqContent />
    </section>
  </>;
}

export function RunesPlay() {
  const { user, isLoading: authLoading } = useAuth();
  const [snapshot, setSnapshot] = useState<RunesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readyCount, setReadyCount] = useState(0);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [zoomArt, setZoomArt] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const loadedArt = useRef(new Set<string>());
  const clockAnchor = useRef<number | null>(null);
  const zoomTrigger = useRef<HTMLButtonElement>(null);
  const zoomClose = useRef<HTMLButtonElement>(null);
  const zoomDialog = useRef<HTMLDialogElement>(null);
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const starting = useRef(false);

  const syncClock = useCallback((next: RunesSnapshot) => {
    setElapsed(next.elapsedMs);
    clockAnchor.current = next.status === "active" ? Date.now() - next.elapsedMs : null;
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const current = await requestRunes("/api/runes/runs");
        if (active) {
          setSnapshot(current);
          syncClock(current);
          if (current.status === "active") {
            const saved = window.sessionStorage.getItem(selectionKey(current.runId));
            if (saved && current.artworks.some(({ id }) => id === saved)) setSelected(saved);
          }
          if (current.status === "loading") setReadyCount(0);
        }
      } catch (cause) {
        if (active && (!(cause instanceof RunesRequestError) || cause.status !== 404)) setError(cause instanceof Error ? cause.message : "Could not restore the round.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [syncClock]);

  useEffect(() => {
    if (!snapshot || snapshot.status !== "active" || !clockAnchor.current) return;
    const tick = () => setElapsed(Math.max(0, Date.now() - clockAnchor.current!));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [snapshot]);

  const invoke = useCallback(async (pending: PendingAction) => {
    if (!snapshot || busy) return;
    setBusy(true);
    setError(null);
    setPendingAction(pending);
    try {
      const next = await runAction(snapshot.runId, pending);
      setPendingAction(null);
      setSelected((current) => selectionAfterRunAction(current, pending.action));
      if (pending.action === "ack") {
        window.sessionStorage.removeItem(selectionKey(snapshot.runId));
        setSnapshot(null);
        setSelected(null);
        clockAnchor.current = null;
        setElapsed(0);
        return;
      }
      setSnapshot(next);
      if (pending.action === "confirm") window.sessionStorage.removeItem(selectionKey(snapshot.runId));
      syncClock(next);
      if (pending.action === "ready") setAnnouncement("Round ready. Clue 1 is revealed. Choose an artwork.");
      else if (pending.action === "reveal") setAnnouncement(`Clue ${next.clues.length} revealed: ${next.clues.at(-1)?.label}, ${next.clues.at(-1)?.value}.`);
      else setAnnouncement(next.result?.outcome === "correct" ? "Correct. Round complete." : "Incorrect. Round complete.");
      if (pending.action === "confirm") {
        requestAnimationFrame(() => document.getElementById("runes-result-title")?.focus({ preventScroll: true }));
      }
    } catch (cause) {
      if (cause instanceof RunesRequestError && cause.status === 409 && pending.action !== "ack") {
        try {
          const latest = await requestRunes("/api/runes/runs");
          setSnapshot(latest);
          setPendingAction(null);
          if (latest.status === "complete") setSelected(null);
          syncClock(latest);
          setAnnouncement("The round changed. The latest clue and result state is loaded.");
          setError("The round changed in another request. Your latest state has been restored.");
          return;
        } catch {
          // Keep the exact pending action available if the recovery read also fails.
        }
      }
      setPendingAction(pending);
      setError(cause instanceof Error ? cause.message : "The action did not complete. Retry the same action.");
    } finally {
      setBusy(false);
    }
  }, [busy, snapshot, syncClock]);

  const start = useCallback(async (mode: "ranked" | "tutorial") => {
    if (starting.current || pendingAction) return;
    starting.current = true;
    setBusy(true);
    setError(null);
    setSelected(null);
    loadedArt.current.clear();
    setReadyCount(0);
    clockAnchor.current = null;
    try {
      if (snapshot?.status === "complete") {
        const ack: PendingAction = { action: "ack", requestId: crypto.randomUUID() };
        try {
          await runAction(snapshot.runId, ack);
          setSnapshot(null);
          setPendingAction(null);
        } catch (cause) {
          setPendingAction(ack);
          throw cause;
        }
      }
      const next = await requestRunes("/api/runes/runs", { mode });
      window.sessionStorage.removeItem(selectionKey(next.runId));
      setSnapshot(next);
      syncClock(next);
      setImageAttempt((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The round could not start.");
    } finally {
      setBusy(false);
      starting.current = false;
    }
  }, [pendingAction, snapshot, syncClock]);

  const handleImageLoad = (id: string) => {
    if (loadedArt.current.has(id)) return;
    loadedArt.current.add(id);
    setReadyCount(loadedArt.current.size);
  };
  const chooseArtwork = (artworkId: string) => {
    setSelected(artworkId);
    if (snapshot?.status === "active") window.sessionStorage.setItem(selectionKey(snapshot.runId), artworkId);
  };
  const handleImageError = (id: string) => {
    loadedArt.current.delete(id);
    setReadyCount(loadedArt.current.size);
    setError("An artwork could not be loaded. Retry the image before the timer starts.");
  };

  useEffect(() => {
    if (!snapshot || snapshot.status !== "loading" || snapshot.artworks.length !== 4 || readyCount !== 4 || busy || pendingAction) return;
    void invoke({ action: "ready", requestId: crypto.randomUUID() });
  }, [busy, invoke, pendingAction, readyCount, snapshot]);

  useEffect(() => {
    if (!zoomArt) return;
    const dialog = zoomDialog.current;
    if (dialog && !dialog.open) dialog.showModal();
    zoomClose.current?.focus();
  }, [zoomArt]);

  useEffect(() => {
    const dialog = helpDialog.current;
    if (!dialog) return;
    if (helpOpen && !dialog.open) dialog.showModal();
    if (!helpOpen && dialog.open) dialog.close();
  }, [helpOpen]);

  const reveal = () => void invoke({ action: "reveal", requestId: crypto.randomUUID(), expectedCluesRevealed: snapshot?.clues.length ?? 0 });
  const confirm = () => selected && void invoke({ action: "confirm", artworkId: selected, requestId: crypto.randomUUID() });
  const retry = () => pendingAction && void invoke(pendingAction);
  const reset = () => {
    if (snapshot?.status === "complete") void invoke({ action: "ack", requestId: crypto.randomUUID() });
    else { setSnapshot(null); setSelected(null); setError(null); setPendingAction(null); setElapsed(0); clockAnchor.current = null; }
  };

  const ready = snapshot?.status === "active";
  const result = snapshot?.status === "complete";
  const canReveal = ready && snapshot.cluesRemaining > 0 && !busy && !pendingAction;

  return (
    <main className={styles.experience} data-runes-setup={!snapshot ? "" : undefined} data-runes-active={ready ? "" : undefined}>
      <div className={styles.content}>
        {!snapshot && (
          <>
            <section className={`${styles.panel} ${styles.hero}`}>
              <RuneEmblem className={styles.heroMark} />
              <div>
                <p className={styles.eyebrow}>A trial of Runechant and sight</p>
                <h1 className={styles.title}>Read the Runes</h1>
                <p className={styles.lead}>Read the verified clues, study each artwork, and make one decisive answer.</p>
                <div className={styles.actions}>
                  <button className={styles.button} type="button" disabled={busy || Boolean(pendingAction) || authLoading || loading} onClick={() => void start("ranked")}>{busy ? "Preparing…" : "Start round"}</button>
                  <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={busy || Boolean(pendingAction) || loading} onClick={() => void start("tutorial")}>Try the tutorial</button>
                </div>
              </div>
            </section>
            <RunesHelpSections />
          </>
        )}

        {loading && !snapshot && <p role="status" className={styles.status}>Checking for an active round…</p>}

        {snapshot && !result && (
          <section className={`${styles.panel} ${styles.game}`} aria-labelledby="round-heading">
            <div className={styles.gameHeading}>
              <div><p className={styles.eyebrow}>{snapshot.mode === "tutorial" ? "Guided practice" : "Solo round"}</p><h1 id="round-heading" className={styles.title}>Identify the hidden artwork</h1></div>
              <div><p className={styles.status}>{snapshot.status === "active" ? `Time ${elapsedLabel(elapsed)}` : "Loading artwork…"}</p>{ready && <button ref={helpTrigger} className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => setHelpOpen(true)}>How to play &amp; FAQ</button>}</div>
            </div>
            {snapshot.status === "active" && <p className={styles.warning}>Clues used: {snapshot.clues.length} · Remaining: {snapshot.cluesRemaining}. One answer only; an incorrect answer ends the round immediately.</p>}
            <div className={styles.board}>
              <div>
                <fieldset className={styles.gallery} disabled={!ready || Boolean(pendingAction)}>
                  <legend className="sr-only">Choose one artwork</legend>
                  {snapshot.artworks.map((artwork) => (
                    <div key={artwork.id} className={styles.choice}>
                      <input id={`runes-option-${artwork.id}`} className="sr-only" type="radio" name="runes-artwork" value={artwork.id} checked={selected === artwork.id} onChange={() => chooseArtwork(artwork.id)} />
                      <label htmlFor={`runes-option-${artwork.id}`} className={styles.choiceLabel}>
                        <Image unoptimized width={330} height={276} sizes="(max-width: 760px) 45vw, 27vw" className={styles.art} src={artwork.cropUrl} alt="" onLoad={() => handleImageLoad(artwork.id)} onError={() => handleImageError(artwork.id)} key={`${artwork.id}-${imageAttempt}`} />
                        <span className={styles.optionLabel}><span className={styles.letter} aria-hidden="true">{artwork.label.slice(-1)}</span><span>{artwork.label}</span></span>
                      </label>
                      <button ref={(element) => { if (element && zoomArt === artwork.cropUrl) zoomTrigger.current = element; }} className={styles.zoomButton} type="button" aria-label={`Enlarge ${artwork.label}`} disabled={!ready || Boolean(pendingAction)} onClick={(event) => { zoomTrigger.current = event.currentTarget; setZoomArt(artwork.cropUrl); }}>Enlarge</button>
                    </div>
                  ))}
                </fieldset>
                {snapshot.status === "active" && <p className={styles.reveal}>Selected: {selected ? snapshot.artworks.find(({ id }) => id === selected)?.label : "None"}</p>}
              </div>
              <aside className={`${styles.panel} ${styles.cluePanel}`} aria-labelledby="clue-title">
                <h2 id="clue-title">Rune clues</h2>
                {snapshot.clues.length > 0 ? <ol className={styles.clues}>{snapshot.clues.map((clue) => <li key={`${clue.number}-${clue.label}`}><span className={styles.clueNumber} aria-hidden="true"><span>{clue.number}</span></span><div><strong>{clue.label}</strong><div className={styles.clueValue}>{clue.value}</div></div></li>)}</ol> : <p className={styles.status}>The first clue appears when all artwork is ready.</p>}
                <div className={styles.clueActions}>
                  {snapshot.cluesRemaining > 0 ? <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={!canReveal} onClick={reveal}>Read the Runes</button> : <p className={styles.status}>All clues revealed</p>}
                  <button className={styles.button} type="button" disabled={!ready || !selected || busy || Boolean(pendingAction)} onClick={confirm}>Confirm answer</button>
                </div>
                <p className={styles.warning}>One answer decides the round. An incorrect choice ends it immediately.</p>
              </aside>
            </div>
            <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
          </section>
        )}

        {ready && <RunesHelpSections />}

        {result && snapshot && <RoundResult snapshot={snapshot} replay={(mode) => void start(mode)} reset={reset} authenticated={Boolean(user)} />}
        {error && <div className={styles.error} role="alert"><p>{error}</p>{pendingAction ? <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={busy} onClick={retry}>Retry same action</button> : snapshot?.status === "loading" ? <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => { loadedArt.current.clear(); setReadyCount(0); setImageAttempt((value) => value + 1); setError(null); }}>Retry artwork</button> : <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => setError(null)}>Dismiss</button>}</div>}
      </div>
      <dialog ref={zoomDialog} className={styles.modal} aria-label="Enlarged artwork" onClose={() => { setZoomArt(null); requestAnimationFrame(() => zoomTrigger.current?.focus()); }} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}><button ref={zoomClose} className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => zoomDialog.current?.close()}>Close</button>{zoomArt && <Image unoptimized width={330} height={276} src={zoomArt} alt="Enlarged artwork crop" />}</dialog>
      <dialog ref={helpDialog} className={styles.helpDialog} aria-labelledby="active-help-title" onClose={() => { setHelpOpen(false); requestAnimationFrame(() => helpTrigger.current?.focus()); }}>
        <div className={styles.gameHeading}><h2 id="active-help-title">How to play &amp; FAQ</h2><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => helpDialog.current?.close()}>Close</button></div>
        <h3>How to play</h3><RunesHowToContent />
        <h3>FAQ</h3><RunesFaqContent />
      </dialog>
    </main>
  );
}
