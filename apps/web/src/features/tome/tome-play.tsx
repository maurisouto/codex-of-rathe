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
            <p>Each correct answer earns one point. Checking your answer moves you to the next question. Review all eight answers at the end.</p>
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
  replace,
}: {
  question: TomeQuestion;
  busy: boolean;
  replace: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  return (
    <div className={styles.artwork}>
      {failed ? (
        <div className={styles.artworkError}>
          <p role="status">The illustration could not be loaded.</p>
          <Button variant="outline" className={styles.secondary} type="button" onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}>Retry image</Button>
          <Button variant="outline" className={styles.secondary} type="button" disabled={busy} onClick={replace}>Replace question</Button>
        </div>
      ) : (
        // The API supplies a vetted crop as a data URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={attempt} src={question.artUrl} alt="Card illustration for this question" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

function TomeProgress({ position, total }: { position: number; total: number }) {
  return (
    <div className={styles.steps} role="group" aria-label={`Trivia progress: ${position - 1} of ${total} answered`}>
      <p className={styles.progress}>Question {position} of {total}</p>
      <span className={styles.stepMarks} aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span key={index} data-step={index + 1 === position ? "current" : index + 1 < position ? "complete" : "pending"} />
        ))}
      </span>
    </div>
  );
}

function TomeFeedback({ answer }: { answer?: TomeAnswer }) {
  return (
    <div className={styles.feedbackSlot}>
      {answer && (
        <div className={styles.feedback}>
          <p className={styles.progress}>Previous answer · Question {answer.position}</p>
          <p>
            <strong className={answer.selected === answer.correct ? styles.correct : styles.incorrect}>
              {answer.selected === answer.correct ? "Correct" : "Incorrect"}
            </strong>
            {" · "}<strong>Correct answer:</strong> {answer.correct}
          </p>
          <p>{answer.explanation}</p>
        </div>
      )}
    </div>
  );
}

function TomeResults({ snapshot, busy, start }: { snapshot: TomeSnapshot; busy: boolean; start: () => void }) {
  return (
    <>
      <div className={styles.resultSummary}>
        <p className={styles.score}>{snapshot.score} of {snapshot.total} correct</p>
        <Button variant="outline" type="button" className={styles.primary} disabled={busy} onClick={start}>
          {busy ? "Loading trivia…" : "Play again"}
        </Button>
      </div>
      <h3 className={styles.reviewTitle}>Answers review</h3>
      <ol role="list" className={styles.review}>
        {snapshot.answers.map((answer) => (
          <li key={answer.position}>
            {answer.artUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={answer.artUrl} alt="" loading="lazy" />
            )}
            <div>
              <p className={styles.progress}>
                Question {answer.position} · {answer.selected === answer.correct ? "Correct" : "Incorrect"}
              </p>
              <p className={styles.reviewPrompt}><strong>{answer.prompt}</strong></p>
              <p className={styles.reviewAnswers}>
                <span><strong>Your answer:</strong> {answer.selected}</span>
                <span><strong>Correct answer:</strong> {answer.correct}</span>
              </p>
              <p className={styles.reviewExplanation}>{answer.explanation}</p>
            </div>
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
  const [submittedChoice, setSubmittedChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TomeRequestError | null>(null);
  const inFlight = useRef(false);
  const section = useRef<HTMLHeadingElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  const question = snapshot?.question;
  const answer = snapshot?.answers.at(-1);
  const view = snapshot?.status;
  const questionId = question?.id;

  useEffect(() => {
    const heading = section.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const { top, bottom } = heading.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) {
      heading.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [view, questionId]);

  useEffect(() => {
    if (submittedChoice && error && !error.expired && document.activeElement === document.body) {
      submitButton.current?.focus({ preventScroll: true });
    }
  }, [error, submittedChoice]);

  async function runTask(task: () => Promise<TomeSnapshot>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await task();
      setChoice("");
      setSubmittedChoice(null);
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

  function replace() {
    if (!snapshot || !question || submittedChoice || error?.expired) return;
    void runTask(() => updateTomeRun(snapshot.runId, { action: "replace", questionId: question.id }, ranked.current));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const choiceId = submittedChoice ?? choice;
    if (!snapshot || !question || !choiceId || error?.expired || inFlight.current) return;
    setSubmittedChoice(choiceId);
    void runTask(() => updateTomeRun(snapshot.runId, { action: "confirm", questionId: question.id, choiceId }, ranked.current));
  }

  const requestError = error && (
    <div className={styles.requestError} role="alert">
      <p>{error.message}</p>
      {error.expired && <Button variant="outline" className={styles.secondary} type="button" onClick={start} disabled={busy}>Start new trivia</Button>}
    </div>
  );

  return (
    <div className={styles.tome}>
      <h1 id="tome-title" className="sr-only">Tome of Fyendal</h1>
      <p className="sr-only" role="status">
        {answer && `Question ${answer.position}: ${answer.selected === answer.correct ? "Correct" : "Incorrect"}. Correct answer: ${answer.correct}.`}
      </p>
      {!question && requestError}
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
          <TomeProgress position={snapshot.position} total={snapshot.total} />
          <TomeFeedback answer={answer} />
          <div className={styles.round}>
            <h2 id={headingId} tabIndex={-1} ref={section}>
              <span className="sr-only">Question {snapshot.position} of {snapshot.total}. </span>
              {question.prompt}
            </h2>
            <TomeArtwork key={question.id} question={question} busy={busy || !!submittedChoice || !!error?.expired}
              replace={replace} />
            <form onSubmit={submit}>
              <fieldset className={styles.options} disabled={busy || !!submittedChoice || !!error?.expired} aria-labelledby={headingId}>
                {question.choices.map((option) => (
                  <label key={option.id} className={styles.choice}>
                    <input type="radio" name={question.id} checked={choice === option.id}
                      onChange={() => setChoice(option.id)} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
              {requestError}
              <Button variant="outline" className={styles.primary} ref={submitButton} type="submit" disabled={!choice || busy || !!error?.expired}>
                {submittedChoice && error && !error.expired ? "Retry answer" : "Check answer"}
              </Button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
