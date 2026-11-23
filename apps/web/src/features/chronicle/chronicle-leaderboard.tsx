"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-context";
import { getSupabaseAccessTokenForApi } from "@/lib/auth/game-api-headers";
import { MODES, type Mode } from "./chronicle-client";
import styles from "./chronicle.module.css";
import boardStyles from "./chronicle-leaderboard.module.css";

const modes = ["streak", "timed", "untimed"] as const satisfies readonly Mode[];

type Entry = {
  rank: number;
  userId: string;
  displayName: string;
  score: number;
};

type Standings = {
  entries: Entry[];
  personalBest: Entry | null;
};

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; standings: Standings };

function formatScore(mode: Mode, score: number) {
  if (mode === "streak") return `Level ${score}`;
  const minutes = Math.floor(score / 60_000);
  const seconds = ((score % 60_000) / 1000).toFixed(3);
  return minutes ? `${minutes}:${seconds.padStart(6, "0")}` : `${seconds} s`;
}

async function fetchStandings(mode: Mode, signedIn: boolean, signal: AbortSignal) {
  const headers = new Headers();
  if (signedIn) {
    const { accessToken } = await getSupabaseAccessTokenForApi();
    if (!accessToken) throw new Error("Chronicle session unavailable");
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  const response = await fetch(`/api/chronicle/leaderboard?mode=${mode}`, {
    headers,
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Chronicle leaderboard unavailable");
  return response.json() as Promise<Standings>;
}

function ModeStandings({ mode, userId, authPending }: {
  mode: Mode;
  userId: string | null;
  authPending: boolean;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (authPending) return;
    const controller = new AbortController();
    void fetchStandings(mode, userId !== null, controller.signal).then(
      (standings) => {
        if (!controller.signal.aborted) setState({ status: "ready", standings });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: "error" });
      },
    );
    return () => controller.abort();
  }, [attempt, authPending, mode, userId]);

  if (state.status === "loading") return <p role="status">Loading standings…</p>;

  if (state.status === "error") {
    return (
      <div className={boardStyles.feedback}>
        <p role="alert">The standings could not be loaded.</p>
        <button type="button" onClick={() => {
          setState({ status: "loading" });
          setAttempt((value) => value + 1);
        }}>Try again</button>
      </div>
    );
  }

  const { entries, personalBest } = state.standings;
  return (
    <>
      <div className={boardStyles.personal}>
        <h3>Your best</h3>
        {personalBest ? (
          <p>{formatScore(mode, personalBest.score)} · Rank {personalBest.rank}</p>
        ) : (
          <p>{userId ? "You haven’t set a record in this mode yet." : "Sign in before playing to save your best scores."}</p>
        )}
      </div>
      {entries.length === 0 ? (
        <p>No records yet for {MODES[mode].title}.</p>
      ) : (
        <table className={boardStyles.table}>
          <caption className={styles.sr}>{MODES[mode].title} standings</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col">{mode === "streak" ? "Highest level" : "Best time"}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.userId} data-personal={entry.userId === userId || undefined}>
                <td>{entry.rank}</td>
                <th scope="row">
                  <Link href={`/u/${encodeURIComponent(entry.userId)}`}>{entry.displayName}</Link>
                </th>
                <td>{formatScore(mode, entry.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function ChronicleLeaderboard() {
  const { user, isLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("streak");

  return (
    <div className={styles.chronicle}>
      <header className={boardStyles.heading}>
        <h1>Leaderboard</h1>
        <p>Chronicle of Rathe</p>
      </header>
      <section className={styles.panel} aria-label="Chronicle standings">
        <div className={boardStyles.modes} role="group" aria-label="Leaderboard mode">
          {modes.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              className={mode === value ? styles.primary : undefined}
              onClick={() => setMode(value)}
            >
              {MODES[value].title}
            </button>
          ))}
        </div>
        <ModeStandings
          key={`${mode}:${user?.id ?? "guest"}:${isLoading}`}
          mode={mode}
          userId={user?.id ?? null}
          authPending={isLoading}
        />
      </section>
    </div>
  );
}
