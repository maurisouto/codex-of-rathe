# Repository handoff checklist

Use this checklist when transferring the repository to another user or organization.

## Repository

- [ ] Configure the new remote or transfer ownership on GitHub or its equivalent.
- [ ] Invite collaborators with the appropriate permissions.
- [ ] Document the main branches, including `main` and open feature branches.
- [ ] Link to or export open issues and pull requests.

## Secrets (keep out of Git)

- [ ] Rotate or reassign `DATABASE_URL` (Supabase or Postgres).
- [ ] Reassign `NEXT_PUBLIC_SUPABASE_*` and Supabase service keys.
- [ ] Update `CORS_ORIGIN` and `API_PROXY_TARGET` in Vercel and Render.
- [ ] Transfer `COOP_REALTIME_SECRET` if the co-op WebSocket uses it.
- [ ] Update OAuth redirect URLs in Supabase to `{origin}/auth/callback`.

## Hosting

- [ ] Grant access to the Vercel web project.
- [ ] Grant access to the Render API service.
- [ ] Confirm that the API build runs `npm run db:deploy`.
- [ ] After deployment, smoke-test `/api/health`, `/`, `/puzzle`, and `/puzzle/leaderboard`.

## Documentation handoff

- [ ] The recipient has read [HANDOFF.md](./HANDOFF.md).
- [ ] The recipient can open the repository in Cursor, where `.cursor/rules/project-context.mdc` applies automatically.
- [ ] The recipient has copied `.env.example` to their local `.env`.

## Local verification for the recipient

```bash
npm install
cp .env.example .env   # Fill in the environment variables.
npm run db:deploy
npm run dev:api        # Terminal 1
npm run dev            # Terminal 2
npm test
```

## Uncommitted work

- [ ] Report any local changes that have yet to be pushed, such as Fragments migrations or assets.
- [ ] Decide whether to merge to `main` before the handoff or document the branch for the recipient.

## Contact

- [ ] Set up a channel for questions during the transition (one to two weeks recommended).
- [ ] Share service credentials securely, for example through 1Password.
