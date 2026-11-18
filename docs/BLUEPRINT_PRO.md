# GUESS A CARD, ANY CARD — BLUEPRINT PRO

## 0. Document
Version: PRO v1\
Status: approved for implementation\
Reference role: Senior Project Lead\
Purpose: turn the product vision into an actionable guide for Cursor and iterative development.

## 0.1 Current architecture (runtime catalog, 2026)

Current implementation in this monorepo:

- **Canonical card source:** the **`@flesh-and-blood/cards`** package (official printings).
- **API catalog:** the server filters and loads the catalog **into memory at startup**. The **available sets** come from that catalog.
- **New game:** the server chooses a **random card** from the catalog (with lobby set filters). The flow has no `Puzzle` or `PuzzleStep` rows and no `puzzleId`.
- **Persistence:** each `Game` stores a **snapshot** (`cardId`, `cardName`, `cardSet`, `cardImageUrl`, `revealSeed`, `revealCardKind`, `cardTemplateKey`) for **deterministic** reveals and guesses without joins to content tables.
- **Reveal engine:** plans and steps are calculated at runtime (shared package and seed). The same seed produces the same plan.
- **Admin:** the admin is currently outside gameplay and this database.
- **Per-card stats:** `user_card_stats` uses **`cardId`** (catalog ID).

Historical sections that mention a “puzzle DB” or an admin sharing Supabase describe an earlier design. **§0.1** takes precedence for implementation.

---

# 1. PRODUCT VISION

## 1.1 Elevator pitch
**Guess a Card, Any Card** is an online party game inspired by Flesh and Blood. A heavily obscured card is gradually revealed.\
The player or group must guess the card before running out of attempts.

The game should feel:
- fun
- easy to learn
- satisfying when you guess correctly
- visually engaging for sharing, streaming, and playing with friends
- usable on desktop and mobile

## 1.2 Business and product objective
Build a strong **single-player** experience first, then expand to:
- competitive multiplayer
- cooperative multiplayer
- challenge a friend

## 1.3 Target audience
Primary:
- Flesh and Blood players
- local communities
- friends already somewhat familiar with the game

Secondary:
- streamers
- content creators
- groups looking for a FaB-related icebreaker

## 1.4 Access requirements
- guest play must be available
- registration must be optional
- registered users can save their stats and profile
- initial sign-in: Google or Discord OAuth

---

# 2. PRODUCT PRINCIPLES

## 2.1 Principles
1. **The card is the focus of the experience.**
2. **Each step must build tension and make the card clearer.**
3. **The UX should feel fast and uncluttered.**
4. **Single player must work reliably before expanding multiplayer.**
5. **The game app consumes the official catalog and stores game snapshots. Card authoring is outside its scope.**
6. **The system should support future datasets while keeping the current MVP focused.**

## 2.2 Initial non-goals
- in-app chat
- a card or custom dataset editor in the game app at this stage
- custom dataset support at this stage
- a complex global leaderboard in the MVP
- a setup flow with too many choices up front

---

# 3. MODES OF PLAY

## 3.1 Single Player
### Description
A player sees an obscured card and gets **1 guess per step**.\
A wrong guess triggers the next reveal step.\
A correct guess wins the game.\
The player loses if they run out of steps without a correct guess.

### Mode objectives
- be the first mode in production
- validate the card reveal UX (main viewer)
- validate autocomplete
- validate attempt and time tracking
- validate personal stats

### Rules
- 1 guess per step
- no required visible timer
- the game ends immediately on a correct guess
- using all steps without a correct guess ends in a loss

### Persistence
Guest:
- optional basic local storage

Registered user:
- stats stored in the database

---

## 3.2 Competitive Multiplayer
### Description
All players see the **same card** and the **same step** at the same time.

Each player:
- has their own input
- guesses at their own pace during the current step
- sees the next step once all players have submitted a guess or the timer expires

### Win condition
1. The winner is the player who guesses correctly in the **fewest attempts**.
2. If attempts are tied, the winner is the player with the **shortest total time**.

### Rules
- 1 guess per step
- per-step timer configurable by the host
- the step advances when:
  - everyone has submitted a guess, or
  - the timer expires
- a player who guesses correctly may be locked as solved until the group finishes the step
- the results show a comparison of guess histories and times

### Design note
Competitive multiplayer ranks players by attempts and total time. The first submission alone does not decide the winner.

---

## 3.3 Cooperative Multiplayer
### Description
Everyone sees the same card and can talk outside the app.\
Only **one person per step** can submit the team's guess.

### Rules
- randomized turn order set at game start and fixed thereafter
- each step has one active player
- a wrong guess triggers the next reveal step and passes the turn to the next player
- if someone disconnects, the host can enter the team's guess
- no in-app chat

### Win condition
The team wins if it guesses correctly before running out of steps.

### Loss condition
The team loses if it uses every step without a correct guess.

---

## 3.4 Challenge a Friend
### Description
An asymmetric social mode.
The host chooses a specific card and challenges someone else to guess it.

### Use cases
- same device
- shareable link
- content for friends, streams, or jokes between players

### Basic rules
- the host can filter by set and select a specific card
- the challenge uses the selected card with the same snapshot and reveal as single player
- the player taking the challenge follows the single-player rules

### Recommended status
Design the architecture now and implement it after single player is stable, beyond the initial MVP.

---

# 4. CARD CATALOG & REVEAL (runtime)

## 4.1 Card source of truth
- **Package:** `@flesh-and-blood/cards` (official printings).
- **Playable catalog:** the API filters and keeps an in-memory catalog **at process startup**. A catalog load failure blocks gameplay until startup or the dependency is fixed.

## 4.2 Game app responsibilities
- Exposes **sets** derived from the catalog in the lobby.
- Chooses a **random card** from the pool when creating a game, applying any set filters.
- Writes a complete **snapshot** for the game in `games` (see §12).
- Calculates the **reveal plan deterministically** from `revealSeed`, `revealCardKind`, and `cardTemplateKey`. The client and server share the same logic through `@gac/shared/reveal`.
- Logs guesses, results, and stats independently of `Puzzle` and `PuzzleStep` tables.

## 4.3 Game app exclusions (current MVP)
- Runtime editing of the official FaB dataset.
- Database storage for pregenerated images per step. The client composes overlays from the art and reveal plan.

## 4.4 Conceptual model per game (snapshot)
Fields stored in `games` include at least:
- `cardId` — stable catalog printing ID
- `cardName`, `cardSet`, `cardImageUrl`
- `revealSeed` — entropy for the overlay plan
- `revealCardKind`, `cardTemplateKey` — classification for the zone engine

## 4.5 Selection and variety
- The host or player chooses one or more **sets** using catalog set codes.
- The game draws a random card from the union of those sets, applying the service's filtering rules.
- Strong per-host repeat prevention is **optional future work**. It can be implemented without `HostPuzzleHistory`.

---

# 5. USER JOURNEYS

## 5.1 Single Player Journey
1. The user opens the home page.
2. They choose single player.
3. They select eligible sets.
4. They start the game.
5. An optional short countdown appears.
6. Step 1 appears.
7. They enter a guess with autocomplete.
8. They submit their guess.
9. A wrong guess advances to step 2.
10. They repeat until they guess correctly or lose.
11. The results screen shows:
   - outcome
   - fully revealed card
   - guess history
   - total time
   - attempts
   - play again CTA

## 5.2 Competitive Journey
1. The host creates a room.
2. The host selects sets.
3. The host sets the per-step timer.
4. The host shares a link.
5. Players join.
6. Players choose an avatar or receive a random one.
7. The host starts the game.
8. A countdown appears.
9. Everyone sees the current step.
10. Each player submits a guess.
11. When everyone has submitted or the timer expires, the game advances to the next step.
12. The game displays its final rankings.

## 5.3 Cooperative Journey
1. The host creates a room.
2. The host selects sets.
3. Players join.
4. Players get avatars.
5. The host starts the game.
6. The game randomizes turn order.
7. A countdown appears.
8. Each step clearly shows whose turn it is.
9. The active player submits a guess.
10. A wrong guess passes the turn to the next player.
11. The results screen displays the team's guess history.

## 5.4 Challenge Journey
1. The host creates a challenge.
2. The host filters by set.
3. The host chooses a card.
4. The host generates a link or plays on the same device.
5. The friend tries to guess the card.
6. The game displays the result.

---

# 6. UX BLUEPRINT

## 6.1 UX objectives
- make the next action immediately clear
- minimize input friction
- make each reveal exciting
- keep the focus on the card
- keep mobile layouts uncluttered
- make the game visually engaging on streams

## 6.2 Information always visible during play
### Required
- card art and current reveal state
- current step and total steps
- attempts used
- attempts remaining
- guess input
- submit button
- outcome of the last attempt

### Mode-specific
Single:
- personal progress

Competitive:
- player list
- who has submitted a guess and who is still pending
- time left in the current step

Coop:
- active player
- turn order
- essential host controls

## 6.3 Final result
Include:
- fully revealed card
- correct name
- set
- guess history
- times
- replay CTA
- return home CTA
- player or team summary in multiplayer

---

# 7. VISUAL DIRECTION

## 7.1 Style
- inspired by Flesh and Blood
- dark fantasy
- streamer-friendly
- clean and legible
- high contrast

## 7.2 Product name
**Guess a Card, Any Card**

## 7.3 Logo direction
Conceptual inspiration:
- indirect reference to “Pick a Card, Any Card”
- a sense of magic tricks, knowledge, or divination
- possible combination of:
  - card
  - eye or vision
  - magical flash
  - dark ornamental frame

## 7.4 Avatars
Preferences:
- FaB heroes or card art
- random assignment when a player skips manual selection

---

# 8. ANIMATION & SOUND

## 8.1 Required animations
- **slide** transition between steps
- win feedback
- loss feedback
- final card reveal

## 8.2 Criteria
- smooth
- fast
- lightweight
- mobile-compatible

## 8.3 Sounds
- submit guess
- correct guess
- wrong guess
- next step or reveal

## 8.4 Constraints
- low volume
- volume control is optional for the MVP

---

# 9. TECH ARCHITECTURE

## 9.1 Stack
- Frontend: Next.js
- Backend: Hono
- Real-time: native WebSockets
- Database: PostgreSQL (e.g. Supabase)
- ORM: Prisma
- Auth: Supabase Auth with Google or Discord OAuth
- Cards: `@flesh-and-blood/cards` and an in-memory API catalog. The server resolves the URLs for card art.

## 9.2 Repository
Monorepo for the **game app** (web, API, and `packages/shared`). The admin is outside this flow.

## 9.3 Logical architecture
### Layers
1. Presentation Layer
2. Game State Layer
3. Real-time Transport Layer
4. Persistence Layer
5. **Card catalog and reveal** (runtime and database snapshots)
6. Auth/Profile Layer

## 9.4 Technical principle
Keep these responsibilities separate:
- UI logic
- game state logic
- WebSocket transport logic
- persistence
- **catalog loading, card resolution, and reveal**

---

# 10. REPO STRUCTURE RECOMMENDED

```txt
/game
  /src
    /app
      /(public)
        /page.tsx
        /single/page.tsx
        /competitive/page.tsx
        /coop/page.tsx
        /challenge/page.tsx
        /room/[id]/page.tsx
        /profile/page.tsx
        /stats/page.tsx
    /components
      /game
        PuzzleViewer.tsx
        GuessInput.tsx
        StepIndicator.tsx
        AttemptsIndicator.tsx
        ResultBanner.tsx
        PlayerStatusList.tsx
        TurnIndicator.tsx
        TimerBar.tsx
      /room
        RoomLobby.tsx
        PlayerCard.tsx
        AvatarSelector.tsx
        SetSelector.tsx
      /layout
      /ui
    /features
      /auth
      /profile
      /rooms
      /game-session
      /stats
    /lib
      /supabase
      /ws
      /audio
      /utils
      /config
    /server
      http-app.ts
      websocket.ts
      room-handlers.ts
      game-engine.ts
      reconnect.ts
      timers.ts
    /types
      game.ts
      room.ts
      ws.ts
      db.ts
    /hooks
    /stores
      useRoomStore.ts
      useGameStore.ts
      useProfileStore.ts
    /prisma
      schema.prisma
      /migrations
      /seed
```

---

# 11. DOMAIN MODEL

## 11.1 Core entities
- User
- GuestSession
- Room
- RoomPlayer
- Game (game with a **card snapshot** in the database)
- GamePlayer
- Guess
- UserStat / UserCardStat (by **`cardId`**)
- Achievement

## 11.2 Conceptual responsibilities
### User
Authentication and a persistent profile.

### GuestSession
Lightweight, nonpersistent or semipersistent guest identity.

### Room
Container for the pregame lobby and live multiplayer session.

### Game
A game instance references a card through **snapshot fields** (`cardId`, name, set, art, seed, kind, and template) without a foreign key to puzzle tables.

### Guess
Record of an attempt by player and step.

### UserCardStat
Aggregates by **`userId` + `cardId`** from the catalog, independent of legacy puzzles.

---

# 12. DATABASE DESIGN (PRO)

## 12.1 `users` table
```sql
id uuid pk
display_name text not null
email text unique null
provider text null
avatar_url text null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## 12.2 `profiles` table
```sql
user_id uuid pk references users(id)
preferred_avatar_id text null
bio text null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## 12.3 Card catalog (runtime)

The current model has no `puzzles` or `puzzle_steps` tables. The playable catalog is held in memory and comes from **`@flesh-and-blood/cards`**. Redeploying restarts the process and **refreshes** the catalog.

## 12.4 `rooms` table
```sql
id uuid pk
host_user_id uuid null references users(id)
host_guest_id text null
mode text not null
state text not null
selected_sets text[] not null
timer_per_step_seconds int null
current_game_id uuid null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## 12.5 `room_players` table
```sql
id uuid pk
room_id uuid not null references rooms(id) on delete cascade
user_id uuid null references users(id)
guest_id text null
display_name text not null
avatar_id text null
is_host boolean not null default false
turn_order int null
joined_at timestamptz not null default now()
left_at timestamptz null
is_connected boolean not null default true
```

## 12.6 `games` table
```sql
id uuid pk
room_id uuid null references rooms(id) on delete set null
mode text not null
-- Card snapshot (catalog). All fields are NOT NULL in the current game schema.
card_id text not null
card_name text not null
card_set text not null
card_image_url text not null
reveal_seed text not null
reveal_card_kind text not null
card_template_key text not null
status text not null
current_step int null
active_turn_room_player_id uuid null references room_players(id)
competitive_step_deadline_at timestamptz null
started_at timestamptz not null default now()
finished_at timestamptz null
winner_user_id uuid null references users(id)
winner_guest_id text null
winning_attempt_count int null
winning_total_time_ms int null
created_at timestamptz not null default now()
```

## 12.7 `game_players` table
```sql
id uuid pk
game_id uuid not null references games(id) on delete cascade
room_player_id uuid null references room_players(id) on delete set null
user_id uuid null references users(id)
guest_id text null
display_name text not null
avatar_id text null
final_rank int null
solved_at_step int null
solved_total_time_ms int null
did_win boolean not null default false
created_at timestamptz not null default now()
```

## 12.8 `guesses` table
```sql
id uuid pk
game_id uuid not null references games(id) on delete cascade
game_player_id uuid not null references game_players(id) on delete cascade
step_number int not null
guess_text text not null
normalized_guess_text text not null
is_correct boolean not null
time_taken_ms int not null
created_at timestamptz not null default now()
```

## 12.9 `user_stats` table
```sql
user_id uuid pk references users(id) on delete cascade
games_played int not null default 0
games_won int not null default 0
games_lost int not null default 0
average_attempts_to_win numeric(6,2) null
best_attempts_record int null
best_time_record_ms int null
updated_at timestamptz not null default now()
```

## 12.10 `user_card_stats` table
```sql
id uuid pk
user_id uuid not null references users(id) on delete cascade
card_id text not null
times_played int not null default 0
times_won int not null default 0
average_attempts numeric(6,2) null
average_time_ms numeric(12,2) null

unique(user_id, card_id)
```

## 12.11 `achievements` table
```sql
id uuid pk
code text unique not null
name text not null
description text not null
created_at timestamptz not null default now()
```

## 12.12 `user_achievements` table
```sql
id uuid pk
user_id uuid not null references users(id) on delete cascade
achievement_id uuid not null references achievements(id) on delete cascade
unlocked_at timestamptz not null default now()

unique(user_id, achievement_id)
```

---

# 13. PRISMA SCHEMA NOTES

## 13.1 Recommended enums
```prisma
enum GameMode {
  SINGLE
  COMPETITIVE
  COOP
  CHALLENGE
}

enum RoomState {
  LOBBY
  COUNTDOWN
  IN_PROGRESS
  FINISHED
  ABANDONED
}

enum GameStatus {
  PENDING
  IN_PROGRESS
  WON
  LOST
  DRAW
  CANCELLED
}
```

## 13.2 Important indexes
- `games(room_id)`, `games(status)`, `games(active_turn_room_player_id)`
- `guesses(game_id, game_player_id, step_number)`
- `room_players(room_id, joined_at)`
- `user_card_stats(user_id)`

---

# 14. STATE MODEL

## 14.1 Room State
```ts
type RoomState =
  | "LOBBY"
  | "COUNTDOWN"
  | "IN_PROGRESS"
  | "FINISHED"
  | "ABANDONED"
```

## 14.2 Game Session State
```ts
type GameMode = "SINGLE" | "COMPETITIVE" | "COOP" | "CHALLENGE"

type PlayerRuntimeState = {
  playerId: string
  displayName: string
  avatarId?: string
  isConnected: boolean
  hasSubmittedCurrentStep: boolean
  isSolved: boolean
  solvedAtStep?: number
  totalTimeMs: number
  attemptsUsed: number
}

type RuntimeGameState = {
  gameId: string
  roomId?: string
  mode: GameMode
  cardId: string
  cardName: string
  dataSource: string
  fabSet?: string | null
  currentStep: number
  totalSteps: number
  status: "IN_PROGRESS" | "WON" | "LOST" | "FINISHED"
  players: PlayerRuntimeState[]
  activeTurnPlayerId?: string
  stepDeadlineAt?: string
  startedAt: string
  finishedAt?: string
}
```

## 14.3 Minimum client store
- currentRoom
- currentGame
- selfPlayer
- currentStepImageUrl
- suggestions
- guessHistory
- timerRemaining
- ui flags
- reconnect status

---

# 15. WEBSOCKET EVENT CONTRACT

## 15.1 Principles
- small, explicit messages
- consistent event names
- separate command events from state events
- send a full snapshot on reconnect

## 15.2 Base structure
```ts
type WsEnvelope<TType extends string, TPayload> = {
  type: TType
  payload: TPayload
  sentAt: string
}
```

## 15.3 Client → Server events
```ts
type ClientEvents =
  | { type: "room:create"; payload: CreateRoomPayload }
  | { type: "room:join"; payload: JoinRoomPayload }
  | { type: "room:start"; payload: { roomId: string } }
  | { type: "player:update-avatar"; payload: { roomId: string; avatarId: string } }
  | { type: "game:submit-guess"; payload: SubmitGuessPayload }
  | { type: "client:reconnect"; payload: { roomId: string; playerId: string } }
  | { type: "host:force-advance"; payload: { roomId: string } }
```

## 15.4 Server → Client events
```ts
type ServerEvents =
  | { type: "room:created"; payload: RoomSnapshot }
  | { type: "room:joined"; payload: RoomSnapshot }
  | { type: "room:player-joined"; payload: RoomPlayerJoinedPayload }
  | { type: "room:player-left"; payload: RoomPlayerLeftPayload }
  | { type: "room:countdown"; payload: { secondsRemaining: number } }
  | { type: "game:started"; payload: GameSnapshot }
  | { type: "game:step"; payload: StepSnapshot }
  | { type: "game:guess-submitted"; payload: GuessSubmittedPayload }
  | { type: "game:step-complete"; payload: StepCompletePayload }
  | { type: "game:result"; payload: GameResultPayload }
  | { type: "state:full"; payload: FullReconnectState }
  | { type: "error"; payload: ErrorPayload }
```

## 15.5 Key payloads
```ts
type SubmitGuessPayload = {
  roomId?: string
  gameId: string
  playerId: string
  stepNumber: number
  guessText: string
  submittedAt: string
}

type StepSnapshot = {
  gameId: string
  currentStep: number
  totalSteps: number
  imageUrl: string
  activeTurnPlayerId?: string
  deadlineAt?: string
}
```

---

# 16. RECONNECTION STRATEGY

## 16.1 Requirement
A player who loses their connection must be able to return and recover the **full state**.

## 16.2 Required server response
- room
- players
- current game
- current step
- guess history
- who has already submitted in the current step
- timer deadline
- win or loss state if the game is over

## 16.3 Client strategy
1. Detect the disconnect.
2. Try to reconnect automatically.
3. Resend the player's identity.
4. Receive `state:full`.
5. Rehydrate the stores.
6. Continue without reloading the page if possible.

## 16.4 Edge cases
- If the room has already finished, show the results screen.
- If the player already guessed correctly, return with their solved status.
- If the player missed the countdown, join the current step directly.

---

# 17. GAME ENGINES

## 17.1 Engine separation
Recommended:
- `singlePlayerEngine`
- `competitiveEngine`
- `coopEngine`
- `challengeEngine`

All engines share:
- catalog access and card snapshots
- guess normalization
- result calculation
- persistence layer

## 17.2 Single Player engine responsibilities
- start a game with a random card from the catalog
- validate the guess
- advance the step
- determine the win or loss outcome
- persist the game
- update stats for registered users

## 17.3 Competitive engine responsibilities
- synchronize the group's step
- record each player's guess
- detect when everyone has submitted
- manage the per-step timer
- determine the final rankings

## 17.4 Coop engine responsibilities
- randomize turn order
- determine the active player
- advance the turn
- allow the host to override when applicable
- persist the team's guess history

---

# 18. GUESS NORMALIZATION

## 18.1 Requirement
Players enter free text. The system should allow reasonable variation when comparing it with a card name.

## 18.2 Basic rules
- trim leading and trailing whitespace
- lowercase
- collapse repeated spaces
- normalize special characters when applicable

## 18.3 MVP
Compare exact strings after normalization.

## 18.4 Future work
Possible additions:
- alias
- limited fuzzy matching
- tolerance for apostrophes or hyphens

---

# 19. AUTOCOMPLETE / SUGGESTIONS

## 19.1 Requirement
Autocomplete should display a list of matching cards as the user types.

## 19.2 Source
Canonical Flesh and Blood card dataset.

## 19.3 Behavior
- debounced input
- suggestions as the user types
- keyboard navigation
- select suggestions by click or tap
- clear, fast submission

## 19.4 UX rule
Keep autocomplete suggestions from getting in the user's way.

---

# 20. ROOM / LOBBY DESIGN

## 20.1 Room creation
Fields:
- mode
- selected sets
- per-step timer (competitive multiplayer only)
- optional visibility setting in a future phase
- create button

## 20.2 Lobby UI
- room code / link
- players list
- avatar picker
- selected sets summary
- host controls
- start button
- optional ready status in a future phase

## 20.3 Countdown
On game start:
- visible countdown
- optional subtle sound
- transition to the first step

---

# 21. SCREEN INVENTORY

## 21.1 Home
- logo
- CTA single player
- CTA competitive
- CTA coop
- CTA challenge
- login/register optional
- stats/profile access if logged

## 21.2 Single setup
- set selector
- start button

## 21.3 Room lobby
- players
- avatars
- sets
- timer
- host start

## 21.4 Game screen
- card and reveal (visual focus)
- step / attempts info
- guess input
- history
- player statuses
- timer or turn indicator

## 21.5 Result screen
- big reveal card
- outcome
- guess history
- ranking if multi
- replay
- leave room

## 21.6 Profile
- avatar
- summary stats
- records
- achievements
- easiest/hardest/most played cards

---

# 22. MOBILE-FIRST ADAPTATIONS

## 22.1 Layout priorities
1. card art and reveal
2. input
3. step info
4. essential status
5. history via drawer

## 22.2 Avoid on mobile
- too many columns
- persistent side panels
- redundant text
- long lists that are always visible

## 22.3 Recommended drawer
`HistoryDrawer`
- swipe or button open
- shows previous guesses
- can show player statuses in multiplayer

---

# 23. PROFILE & STATS

## 23.1 Required stats
- games played
- wins
- losses
- average attempts to win
- best attempts
- best time
- most played cards
- hardest cards
- easiest cards

## 23.2 Suggested achievements
- First Blood: first win
- Sharp Eye: win on or before step 3
- Consistent Scholar: 5 consecutive wins
- Set Specialist: 10 wins in the same set
- Never Give Up: win on the final step

## 23.3 Calculating easiest and hardest cards
Recommended:
- easiest = cards with the lowest average attempts to win
- hardest = cards with the highest average attempts or loss rate

---

# 24. ANALYTICS & OBSERVABILITY

## 24.1 Useful events
- room created
- room joined
- game started
- guess submitted
- game won
- game lost
- reconnect happened
- autocomplete used
- profile viewed

## 24.2 Useful metrics
- drop-off before the first guess
- average game duration
- win rate by set
- reconnection rate
- average step on which players solve the card

## 24.3 Recommended logs
Backend:
- room lifecycle
- ws connections
- timer firing
- guess validation
- result calculation

---

# 25. SECURITY / INTEGRITY

## 25.1 Rules
- treat client state as untrusted
- the server checks:
  - whether the step is correct
  - whether the player can submit
  - whether the player already submitted in this step
  - whether the game is still active

## 25.2 Challenge a friend
If a future release adds links for specific cards:
- validate minimum permissions
- keep sensitive data private
- prevent bulk enumeration when it is unnecessary

---

# 26. MVP SCOPE RECOMMENDATION

## 26.1 MVP scope
### Phase 1
- single player
- optional sign-in
- basic stats
- autocomplete
- result screen
- simple profile

### Phase 2
- competitive multiplayer
- room lobby
- websocket sync
- reconnection

### Phase 3
- cooperative mode
- turn system
- host override

### Phase 4
- challenge a friend
- achievements
- richer stats

## 26.2 Phase 1 exclusions
- chat
- complex global leaderboard
- spectating
- unrestricted public access to custom card selection
- excessive animations

---

# 27. IMPLEMENTATION ORDER

## 27.1 Recommended order
1. base repo + architecture
2. auth + profile shell
3. card catalog service and snapshots in `games`
4. single player engine
5. guess normalization + autocomplete
6. result persistence
7. stats/profile page
8. room & lobby model
9. websocket layer
10. competitive mode
11. reconnection
12. coop mode
13. challenge mode

---

# 28. CURSOR PROMPTS — MASTER SET

## 28.1 Prompt 1 — Foundation / App Skeleton
```text
You are a senior full-stack engineer. Build the initial production-grade foundation for a Next.js + Hono + Prisma + Supabase game app called "Guess a Card, Any Card".

Requirements:
- App router structure
- shared TypeScript types folder
- server folder for Hono and WebSocket handlers
- feature-based organization
- clean separation between UI, state, domain logic and transport
- prepare for modes: single, competitive, coop, challenge
- add placeholder pages and route shells
- add basic Tailwind layout
- create reusable UI primitives for panels, buttons, inputs and drawers
- no mock business logic mixed into components
- code must be extensible and clean
```

## 28.2 Prompt 2 — Prisma Schema + DB layer
```text
Create a production-ready Prisma schema for this game app.

Entities required:
- users
- profiles
- rooms
- room_players
- games (with card snapshot columns: cardId, cardName, cardSet, cardImageUrl,
  revealSeed, revealCardKind, cardTemplateKey — no puzzle FK)
- game_players
- guesses
- user_stats
- user_card_stats (unique userId + cardId)
- achievements
- user_achievements

Requirements:
- use enums where appropriate
- add indexes for query-heavy paths
- model guest flows carefully
- preserve referential integrity
- include created_at / updated_at where useful
- include notes/comments in the schema for maintainability

After the schema, generate:
- migration strategy notes
- seed script plan
- repository/service layer outline for card catalog integration and stats updates
```

## 28.3 Prompt 3 — Card catalog + Single Player Engine
```text
Implement the single player domain for "Guess a Card, Any Card".

Requirements:
- load @flesh-and-blood/cards into a filtered in-memory catalog at API startup
- fetch available sets from that catalog (not from DB puzzle tables)
- create single-player game from selected sets
- choose a random playable card; persist full snapshot on Game
- expose reveal inputs (image URL, revealSeed, kind, template) for the client
- accept one guess per step
- normalize guess text
- compare to canonical card name from snapshot
- on wrong guess, advance to next step
- on correct guess, finish game
- on max step reached without correct guess, lose game
- persist game, player result and guesses
- update user stats if authenticated; merge per-card stats by cardId

Deliver:
- domain services
- repositories
- TypeScript types
- testable pure functions for result calculation
```

## 28.4 Prompt 4 — Autocomplete / Guess UX
```text
Implement a high-quality card name suggestion system for the Guess input.

Requirements:
- consume canonical FaB card source or cached card names
- debounce user input
- return matching suggestions
- support keyboard navigation
- support mouse/tap selection
- keep the UI responsive on mobile
- do not over-autocomplete aggressively
- separate search logic from presentation
- expose a reusable GuessInput component
```

## 28.5 Prompt 5 — Single Player UI
```text
Build the full single player gameplay screen.

Requirements:
- centered card / reveal as the main focal point
- visible step indicator and attempts remaining
- guess input below image
- smooth slide transition between steps
- success and failure state banners
- result screen with:
  - revealed card image
  - correct card name
  - step reached
  - attempts used
  - total time
  - guess history
  - replay and home CTA
- desktop shows persistent history panel
- mobile uses a history drawer CTA
- code should be componentized and production-ready
```

## 28.6 Prompt 6 — Auth + Profile + Stats
```text
Implement optional authentication and profile/stat pages.

Requirements:
- Supabase Auth with Google and Discord OAuth
- guests can still play
- authenticated users have:
  - profile page
  - personal stats
  - best records
  - most played cards
  - hardest cards
  - easiest cards
  - achievements section
- keep profile UI clean and streamer-friendly
- separate auth plumbing from profile presentation
```

## 28.7 Prompt 7 — Room + Lobby
```text
Implement multiplayer room and lobby foundations.

Requirements:
- create room flow
- join room by link/id
- select sets
- choose timer per step for competitive
- avatar selection from predefined hero/card-art based options
- player list in lobby
- host start control
- countdown before match start
- persistent room state on the backend
- app should be ready for native WebSocket integration
```

## 28.8 Prompt 8 — Native WebSocket Server
```text
Implement a native WebSocket layer using Hono for the game.

Requirements:
- room-level communication
- typed event contracts
- client->server commands and server->client state events
- message routing
- validation per event
- reconnect flow with full state snapshot
- no trust in client-side authority
- keep handlers small and composable
- prepare for competitive and coop engines
```

## 28.9 Prompt 9 — Competitive Engine
```text
Implement the competitive multiplayer game engine.

Rules:
- all players see same step at same time
- each player has one guess per step
- step advances when all players submitted or timer expires
- players may submit as soon as the step starts
- winner is lowest attempts, then lowest total time
- persist all guesses and final ranking
- expose enough state for UI:
  - who submitted
  - who is solved
  - timer remaining
  - current step
```

## 28.10 Prompt 10 — Reconnection
```text
Implement robust reconnection for multiplayer sessions.

Requirements:
- detect disconnects
- automatically rejoin room when possible
- restore full room + game state from server
- preserve solved status
- preserve guess history
- preserve current deadline/timer
- allow host disconnect without killing room
- handle reconnect into finished game gracefully
```

## 28.11 Prompt 11 — Cooperative Engine
```text
Implement cooperative multiplayer mode.

Rules:
- same card / reveal plan for all players
- random but fixed player order decided at game start
- only active player can submit the guess for the current step
- if active player disconnects, host may submit on behalf of team
- no internal chat
- show clear turn indicator and team progress
- persist team guess history and final outcome
```

## 28.12 Prompt 12 — Challenge a Friend
```text
Implement the Challenge a Friend mode.

Requirements:
- host can filter by set and choose a specific card from the catalog
- challenge can be played on same device or by sharing a link
- gameplay follows single-player rules
- challenge metadata should preserve who created it and which cardId was selected
- structure code so challenge mode reuses single-player components wherever possible
```

---

# 29. ACCEPTANCE CRITERIA

## 29.1 Single Player done means
- user can choose sets
- system starts a game
- the card and reveal render correctly
- suggestions work
- guesses are persisted
- win/lose works
- result screen works
- registered user stats update correctly

## 29.2 Competitive done means
- room create/join works
- players sync properly
- step advance is correct
- ranking is correct
- reconnection works

## 29.3 Coop done means
- turn order is visible
- only active player can submit
- host override works
- final result is consistent

---

# 30. RISKS & MITIGATIONS

## 30.1 Risk: multiplayer complexity too early
Mitigation:
- single player first
- shared engine abstractions
- typed WebSocket contracts from the start

## 30.2 Risk: drawing the same card repeatedly
Mitigation:
- expand the pool of sets and update the card dependency
- optional future work: keep per-host history in the app without relying on puzzle tables

## 30.3 Risk: autocomplete lag
Mitigation:
- pre-index card names
- debounce
- memoized filtering

## 30.4 Risk: reconnect inconsistency
Mitigation:
- server authoritative snapshot
- idempotent event handling
- room/game persistence

---

# 31. FINAL RECOMMENDATION AS PROJECT LEAD

Recommended implementation path:

1. Build a **polished single-player experience**.
2. Finish the following:
   - card snapshots and deterministic reveals
   - guess normalization
   - result persistence
   - profile/stats
3. Begin multiplayer work after completing those foundations.

This approach provides:
- a solid foundation
- a playable game early in development
- lower architectural risk
- a product to demonstrate before adding real-time complexity

---

# 32. NEXT ACTION RECOMMENDED

Start with this sequence:
1. Foundation / skeleton
2. Prisma schema
3. Card catalog + single player engine
4. Single player UI
5. Auth + profile
6. Multiplayer foundations

---

# 33. HANDOFF NOTE FOR NEXT CHAT / CURSOR

Use this document as the project reference when starting implementation.\
A new agent or chat taking over the project should know:
- **§0.1** describes the implemented architecture (`@flesh-and-blood/cards` catalog and snapshots in `games`).
- The game app is a monorepo (web, API, and shared). The admin is outside the current flow.
- PostgreSQL stores sessions and stats. The API keeps the catalog in memory.
- Single player is the priority.
- Multiplayer comes later and will build on this architecture.

