"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

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

function TomeIntro({ start, busy, authPending }: { start: () => void; busy: boolean; authPending: boolean }) {
  return (
    <>
      <section className={`${styles.panel} ${styles.hero}`} aria-labelledby="tome-title">
        <Image
          src="/assets/tome-of-fyendal-logo.png"
          width={2106}
          height={593}
          sizes="(max-width: 600px) min(85vw, 360px), (max-width: 767px) min(85vw, 512px), (max-width: 896px) 43vw, 380px"
          className={styles.logo}
          alt=""
          loading="eager"
        />
        <div className={styles.heroCopy}>
          <p className={styles.lead}>Every illustration has a record. How much of it can you recall?</p>
          <p className={styles.heroDescription}>
            Eight questions on Flesh and Blood card art, from the artist’s credit to the artwork’s first release.
          </p>
          <Button variant="outline" size="lg" className={styles.primary} type="button" onClick={start} disabled={busy || authPending}>
            {busy ? "Loading trivia…" : "Begin trivia"}
          </Button>
        </div>
      </section>
      <section className={styles.guide} aria-labelledby="how">
        <h2 id="how" tabIndex={-1}>How to play</h2>
        <ol role="list">
          <li>
            <h3>Examine the illustration</h3>
            <p>Each question asks about the artwork, the card, or the artwork’s first commercial release.</p>
          </li>
          <li>
            <h3>Choose one answer</h3>
            <p>Select one of four options, then select <strong>Check answer</strong> to confirm.</p>
          </li>
          <li>
            <h3>Read the reveal</h3>
            <p>Each correct answer earns one point. Review all eight answers at the end.</p>
          </li>
        </ol>
        <Panel variant="subtle" className={styles.example}>
          <Image src={exampleCard} alt="A figure holds a glowing tome between dark shelves." sizes="(max-width: 640px) 80vw, 240px" />
          <div>
            <h3>Example question</h3>
            <p className={styles.examplePrompt}>Who illustrated this artwork?</p>
            <ul role="list" aria-label="Example choices">
              <li>Sebastian Giacobino</li>
              <li className={styles.exampleCorrect}>Daniel Jiménez</li>
              <li>Livia Prima</li>
              <li>Alexander Mokhov</li>
            </ul>
            <details>
              <summary><span>Show answer</span><span>Hide answer</span></summary>
              <div className={styles.exampleReveal}>
                <p><strong>Correct answer: Daniel Jiménez</strong></p>
                <p>Daniel Jiménez illustrated this artwork for Tome of Fyendal (WTR160) in <em>Welcome to Rathe</em>.</p>
              </div>
            </details>
          </div>
        </Panel>
      </section>
      <section className={`${styles.guide} ${styles.faq}`} aria-labelledby="faq">
        <h2 id="faq" tabIndex={-1}>FAQ</h2>
        <details>
          <summary>Do I need an account?</summary>
          <p>You can play as a guest. To save your score and appear on the <Link href="/tome/leaderboard">leaderboard</Link>, sign in before selecting <strong>Begin trivia</strong> and finish all eight questions.</p>
        </details>
        <details>
          <summary>How is my rank determined?</summary>
          <p>The leaderboard ranks players by their best completed score out of eight. Players with the same best score share a rank.</p>
        </details>
        <details>
          <summary>Which release counts?</summary>
          <p>Release questions refer to the artwork’s first commercial release. The same illustration can appear again in later printings.</p>
        </details>
        <details>
          <summary>What if an illustration doesn’t load?</summary>
          <p>Select <strong>Retry image</strong>. If it still doesn’t load, select <strong>Replace question</strong> before checking an answer.</p>
        </details>
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
          <p role="status">The illustration could not be loaded.</p>
          <Button variant="outline" className={styles.secondary} type="button" onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}>Retry image</Button>
          {canReplace && (
            <Button variant="outline" className={styles.secondary} type="button" disabled={busy} onClick={replace}>Replace question</Button>
          )}
        </div>
      ) : (
        <>
          {/* The API supplies a vetted crop as a data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={attempt} src={question.artUrl} alt="Card illustration for this question" onError={() => setFailed(true)} />
          <Button variant="outline" className={styles.artworkButton} type="button" onClick={() => dialog.current?.showModal()}>Enlarge artwork</Button>
        </>
      )}
      <dialog ref={dialog} className={styles.dialog} aria-label="Enlarged artwork">
        <form method="dialog">
          <Button variant="outline" className={styles.secondary} type="submit">Close artwork</Button>
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
      <p className={styles.revealedCard}>{answer.cardName}</p>
      <p>{answer.explanation}</p>
    </div>
  );
}

function TomeResults({ snapshot, busy, start }: { snapshot: TomeSnapshot; busy: boolean; start: () => void }) {
  const [review, setReview] = useState(false);
  return (
    <>
      <div className={styles.resultSummary}>
        <p className={styles.score}>{snapshot.score} of {snapshot.total} correct</p>
        <div className={styles.controls}>
          <Button variant="outline" type="button" className={styles.primary} disabled={busy} onClick={start}>
            {busy ? "Loading trivia…" : "Play again"}
          </Button>
          <Button variant="outline" type="button" className={styles.secondary} onClick={() => setReview((value) => !value)}
            aria-controls="tome-review" aria-expanded={review}>
            {review ? "Hide answers" : "Review answers"}
          </Button>
        </div>
      </div>
      <ol role="list" className={styles.review} id="tome-review" hidden={!review}>
        {snapshot.answers.map((answer) => (
          <li key={answer.position}>
            <p className={styles.progress}>Question {answer.position}</p>
            <h3>{answer.prompt}</h3>
            <p className={styles.reviewAnswers}>
              <span><strong>Your answer:</strong> {answer.selected}</span>
              <span><strong>Correct answer:</strong> {answer.correct}</span>
            </p>
            <TomeFeedback answer={answer} />
          </li>
        ))}
      </ol>
    </>
  );
}

export function TomePlay() {
  const { user, isLoading } = useAuth();
  const ranked = useRef(false);
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
        : new TomeRequestError("Tome of Fyendal could not be reached. Please try again."));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function start() {
    if (isLoading) return;
    const signedIn = !!user;
    void runTask(async () => {
      const next = await startTomeRun(signedIn);
      ranked.current = signedIn;
      return next;
    });
  }

  function advance(action: "next" | "replace") {
    if (!snapshot || !question) return;
    void runTask(() => updateTomeRun(snapshot.runId, { action, questionId: question.id }, ranked.current));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot || !question || !choice || answer || error?.expired) return;
    void runTask(() => updateTomeRun(snapshot.runId, { action: "answer", questionId: question.id, choiceId: choice }, ranked.current));
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
          {error.expired && <Button variant="outline" className={styles.secondary} type="button" onClick={start} disabled={busy}>Start new trivia</Button>}
        </div>
      )}
      {!snapshot && <TomeIntro start={start} busy={busy} authPending={isLoading} />}
      {snapshot?.status === "complete" && (
        <section className={`${styles.panel} ${styles.session}`} aria-labelledby={headingId}>
          <h2 id={headingId} ref={section} tabIndex={-1}>Trivia results</h2>
          <p>{ranked.current ? "Result saved to your account." : "Sign in before playing to save your score."}</p>
          <TomeResults snapshot={snapshot} busy={busy} start={start} />
        </section>
      )}
      {snapshot && question && (
        <section className={`${styles.panel} ${styles.session}`} aria-labelledby={headingId}>
          <p className={styles.progress}>Question {snapshot.position} of {snapshot.total}</p>
          <h2 id={headingId} tabIndex={-1} ref={section}>{question.prompt}</h2>
          <div className={styles.round}>
            <TomeArtwork key={question.id} question={question} busy={busy || !!error?.expired}
              canReplace={!answer} replace={() => advance("replace")} />
            <form onSubmit={submit}>
              <fieldset className={styles.options} disabled={busy || !!answer || !!error?.expired} aria-labelledby={headingId}>
                {question.choices.map((option) => {
                  const correct = answer?.correct === option.label;
                  const selected = answer?.selected === option.label;
                  return (
                    <label key={option.id} className={styles.choice} data-correct={correct} data-incorrect={!!answer && selected && !correct}>
                      <input type="radio" name={question.id} checked={answer ? selected : choice === option.id}
                        onChange={() => setChoice(option.id)} />
                      <span>{option.label}</span>
                      <span className={styles.choiceTag}>
                        {correct ? "Correct answer" : answer && selected ? "Your answer" : ""}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              {answer ? (
                <>
                  <TomeFeedback answer={answer} />
                  <Button variant="outline" className={styles.primary} type="button" onClick={() => advance("next")} disabled={busy || !!error?.expired}>
                    {snapshot.position === snapshot.total ? "See results" : "Next question"}
                  </Button>
                </>
              ) : (
                <Button variant="outline" className={styles.primary} type="submit" disabled={!choice || busy || !!error?.expired}>Check answer</Button>
              )}
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
