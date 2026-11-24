# Tome of Fyendal

Tome of Fyendal is an untimed solo trivia game about Flesh and Blood card art. It has its own entry in the Codex hub and lives at `/tome`.

## Phase 1

A session contains eight questions, each showing a different illustration and four possible answers. The player selects an answer and confirms it. The game then identifies the card, explains the correct answer, and lets the player advance. A correct answer earns one point. The final screen shows the score out of eight and offers answer review and a new game. Guests can play the entire session.

Use the approved Tome of Fyendal logo and the sapphire and silver palette. Keep the art's original colors inside a thin frame. Use the shared Cinzel and Inter typography for headings and controls, with Geist Mono for progress and score. The art and options must fit on narrow screens. Native grouped controls, visible focus, and text alongside feedback icons support keyboard and assistive technology use.

## Development approach

- Follow Chronicle's server-owned run model. Serve the cropped illustration, question and opaque choice IDs during play. Reveal the selected and correct answer, explanation, and card name after confirmation. Keep scoring on the server.
- Reuse the verified illustrations and commercial release evidence in the Chronicle index and match against the installed Flesh and Blood catalog. Treat illustration credits, card attributes, and release information as distinct sources. Generate only questions with one supported answer and three distinct distractors. Ask set and year questions about the first verified commercial appearance of the displayed artwork.
- Use the existing Codex public layout, header authentication, disclaimer, and hub tile conventions. Keep Tome gameplay state independent of Guess, Fragments and Chronicle. Phase 1 has no persistence, leaderboards, or friend challenges.
- Build the web flow around server snapshots. Keep question, confirmation, feedback, and results distinct. Provide a recovery path for request and image errors.

## Verification

Verify catalog matches, unique questions within a run, four choices per question, masking until confirmation, scoring, retry behavior, and final review. Check hub navigation and the full guest flow at narrow and wide viewport sizes, including keyboard selection and focus.
