"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import {
  startTomeRun,
  TomeRequestError,
  updateTomeRun,
  type TomeAnswer,
  type TomeQuestion,
  type TomeSnapshot,
} from "./tome-client";
import exampleCard from "./assets/guide-wtr160.webp";
import styles from "./tome.module.css";

function TomeIntro({ start, busy }: { start: () => void; busy: boolean }) {
  return (
    <>
      <section className={`${styles.panel} ${styles.hero}`} aria-labelledby="tome-title">
        <Image
          src="/assets/tome-of-fyendal-logo.png"
          width={2106}
          height={593}
          sizes="(max-width: 640px) 100vw, 540px"
          className={styles.logo}
          alt=""
          loading="eager"
        />
        <div className={styles.rule} aria-hidden="true" />
        <p className={styles.lead}>Look closely at the artwork, then answer a question about it or the card it comes from.</p>
        <p>Play eight questions at your own pace.</p>
        <button className={styles.primary} type="button" onClick={start} disabled={busy}>
          {busy ? "Loading trivia…" : "Start trivia"}
        </button>
      </section>
      <section className={styles.guide} aria-labelledby="tome-how">
        <h2 id="tome-how">How to play</h2>
        <ol>
          <li><strong>Study the artwork.</strong> You might be asked who illustrated it, what class the card belongs to, or where the artwork first appeared.</li>
          <li><strong>Choose one of four answers.</strong> You can change your choice before you select <strong>Check answer</strong>.</li>
          <li><strong>See the answer.</strong> Each correct answer earns one point. Review all eight answers at the end.</li>
        </ol>
        <div className={styles.example}>
          <Image src={exampleCard} alt="A figure holding a glowing tome" sizes="(max-width: 640px) 80vw, 240px" />
          <div>
            <h3>Example</h3>
            <p>Who illustrated this artwork?</p>
            <ul aria-label="Example choices">
              <li>Sebastian Giacobino</li>
              <li>Daniel Jiménez</li>
              <li>Livia Prima</li>
              <li>Alexander Mokhov</li>
            </ul>
            <details>
              <summary>Show answer</summary>
              <p><strong>Correct answer: Daniel Jiménez</strong></p>
              <p>Daniel Jiménez illustrated this artwork for Tome of Fyendal (WTR160) from <em>Welcome to Rathe</em>.</p>
            </details>
          </div>
        </div>
      </section>
    </>
  );
}

function TomeArtwork({
  question,
  busy,
  canReplace,
  replace,
}: {
  question: TomeQuestion;
  busy: boolean;
  canReplace: boolean;
  replace: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <div className={styles.artwork}>
      {failed ? (
        <div className={styles.artworkError}>
          <p role="status">The artwork couldn’t load.</p>
          <button className={styles.secondary} type="button" onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}>Retry image</button>
          {canReplace && (
            <button className={styles.secondary} type="button" disabled={busy} onClick={replace}>Replace question</button>
          )}
        </div>
      ) : (
        <>
          {/* The API supplies a vetted crop as a data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={attempt} src={question.artUrl} alt="Card illustration for this question" onError={() => setFailed(true)} />
          <button className={styles.artworkButton} type="button" onClick={() => dialog.current?.showModal()}>Enlarge artwork</button>
        </>
      )}
      <dialog ref={dialog} className={styles.dialog} aria-label="Enlarged artwork">
        <form method="dialog">
          <button className={styles.secondary} type="submit">Close artwork</button>
        </form>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={question.artUrl} alt="Card illustration for this question" />
      </dialog>
    </div>
  );
}

function TomeFeedback({ answer }: { answer: TomeAnswer }) {
  const correct = answer.selected === answer.correct;
  return (
    <div className={`${styles.feedback} ${correct ? styles.correct : styles.incorrect}`}>
      <strong><span aria-hidden="true">{correct ? "✓" : "×"} </span>{correct ? "Correct" : "Incorrect"}</strong>
      <p>{answer.explanation}</p>
    </div>
  );
}

function TomeResults({ snapshot, busy, start }: { snapshot: TomeSnapshot; busy: boolean; start: () => void }) {
  const [review, setReview] = useState(false);
  return (
    <>
      <p className={styles.score}>{snapshot.score} of {snapshot.total} correct</p>
      <div className={styles.controls}>
        <button type="button" className={styles.primary} disabled={busy} onClick={start}>
          {busy ? "Loading trivia…" : "Play again"}
        </button>
        <button type="button" className={styles.secondary} onClick={() => setReview((value) => !value)}
          aria-controls="tome-review" aria-expanded={review}>
          {review ? "Hide answers" : "Review answers"}
        </button>
      </div>
      <ol className={styles.review} id="tome-review" hidden={!review}>
        {snapshot.answers.map((answer) => (
          <li key={answer.position}>
            <h3>{answer.prompt}</h3>
            <p>{answer.cardName}</p>
            <p>Your answer: {answer.selected} · Correct answer: {answer.correct}</p>
            <TomeFeedback answer={answer} />
          </li>
        ))}
      </ol>
    </>
  );
}

export function TomePlay() {
  const [snapshot, setSnapshot] = useState<TomeSnapshot | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TomeRequestError | null>(null);
  const inFlight = useRef(false);
  const section = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  const question = snapshot?.question;
  const answer = snapshot?.status === "answered" ? snapshot.answers.at(-1) : undefined;
  const view = snapshot?.status;
  const questionId = question?.id;

  useEffect(() => {
    section.current?.focus();
  }, [view, questionId]);

  async function runTask(task: () => Promise<TomeSnapshot>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await task();
      if (next.status === "question") setChoice("");
      setSnapshot(next);
    } catch (issue) {
      setError(issue instanceof TomeRequestError
        ? issue
        : new TomeRequestError("Couldn’t connect to Tome of Fyendal. Try again."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function start() {
    void runTask(startTomeRun);
  }

  function advance(action: "next" | "replace") {
    if (!snapshot || !question) return;
    void runTask(() => updateTomeRun(snapshot.runId, { action, questionId: question.id }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || !question || !choice || answer || error?.expired) return;
    void runTask(() => updateTomeRun(snapshot.runId, { action: "answer", questionId: question.id, choiceId: choice }));
  }

  return (
    <div className={styles.tome}>
      <h1 id="tome-title" className="sr-only">Tome of Fyendal</h1>
      <p className="sr-only" role="status">
        {busy ? "Loading…" : answer ? `${answer.selected === answer.correct ? "Correct" : "Incorrect"}. ${answer.explanation}` : ""}
      </p>
      {error && (
        <div className={styles.requestError} role="alert">
          <p>{error.message}</p>
          {error.expired && <button className={styles.secondary} type="button" onClick={start} disabled={busy}>Start new trivia</button>}
        </div>
      )}
      {!snapshot && <TomeIntro start={start} busy={busy} />}
      {snapshot?.status === "complete" && (
        <section className={styles.panel} aria-labelledby={headingId}>
          <h2 id={headingId} ref={section} tabIndex={-1}>Trivia results</h2>
          <TomeResults snapshot={snapshot} busy={busy} start={start} />
        </section>
      )}
      {snapshot && question && (
        <section className={styles.panel} aria-labelledby={headingId}>
          <p className={styles.progress}>Question {snapshot.position} of {snapshot.total}</p>
          <h2 id={headingId} tabIndex={-1} ref={section}>{answer ? answer.cardName : question.prompt}</h2>
          <TomeArtwork key={question.id} question={question} busy={busy || !!error?.expired}
            canReplace={!answer} replace={() => advance("replace")} />
          <form onSubmit={submit}>
            <fieldset className={styles.options} disabled={busy || !!answer || !!error?.expired} aria-labelledby={answer ? undefined : headingId}>
              {answer && <legend>{question.prompt}</legend>}
              {question.choices.map((option) => {
                const correct = answer?.correct === option.label;
                const selected = answer?.selected === option.label;
                return (
                  <label key={option.id} className={styles.choice} data-correct={correct} data-incorrect={!!answer && selected && !correct}>
                    <input type="radio" name={question.id} checked={answer ? selected : choice === option.id}
                      onChange={() => setChoice(option.id)} />
                    <span>{option.label}</span>
                    {correct && <span className={styles.choiceTag}>Correct answer</span>}
                    {selected && !correct && <span className={styles.choiceTag}>Your answer</span>}
                  </label>
                );
              })}
            </fieldset>
            {answer ? (
              <>
                <TomeFeedback answer={answer} />
                <button className={styles.primary} type="button" onClick={() => advance("next")} disabled={busy || !!error?.expired}>
                  {snapshot.position === snapshot.total ? "See results" : "Next question"}
                </button>
              </>
            ) : (
              <button className={styles.primary} type="submit" disabled={!choice || busy || !!error?.expired}>Check answer</button>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
