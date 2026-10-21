# Chog Brain

Chogathon 2026 entry. Every Chog Genesis NFT (Monad, 1,969 items) becomes a living character:
its traits decide its personality, stats, signature move and its own sword, and its XP, level and
memory are stored against the token ID. Duels are narrated by Claude; the loser cries.
No Chog, no character.

Contract: `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763` (Monad, chain 143)

## Run locally

    npm install
    npm start            # http://localhost:3000
    npm test

See `.env.example` for optional settings. Demo mode works with any token id 0-1968; connect a wallet
that owns the token for onchain-verified play. If the Monad RPC or metadata host can't be reached,
the app falls back to seeded traits and says why on screen.

## Deploy on Vercel

1. Push this repo to GitHub.
2. On vercel.com choose **Add New > Project**, import the repo, and deploy. The Express app in
   `server.js` is detected automatically and `public/` is served by the CDN.
3. In **Project Settings > Environment Variables** add `ANTHROPIC_API_KEY` (optional, enables Claude narration).
4. In the **Storage** tab add **Upstash Redis** (free plan) and connect it to the project. Vercel adds
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` itself; this makes XP and levels permanent.
   Without it the app still works, but progress resets when the server restarts.
5. Redeploy so the new variables are picked up.

## How to play

- **Arena run:** pick a Chog and fight one Chog after another. Each turn you choose Attack, Special (your
  Chog's signature move, 3-turn cooldown) or Guard (block most damage, heal a little, maybe counter).
  Opponents get tougher each stage and every 5th stage is a boss. You heal 60% between stages.
  Win streaks score points, and your best stage and score are saved to the token.
- **Daily boss:** one attempt per Chog per UTC day against a boss that is the same for everyone.
- **Narrated duel:** an automatic fight narrated by Claude. The loser cries.

Every fight is refereed by the server (`lib/battle.js`), so the client can't invent health or skip cooldowns.

## How the NFT is essential

Stats, personality, signature move and sword are all derived from the token's traits; change any
trait and the character changes (tested). Progression is keyed by token ID, so the NFT is the save
file and moves with its owner.

## Make NFTs load instantly

Reading each Chog from Monad and IPFS at request time is slow. Download every Chog's traits once:

    npm run snapshot     # a few minutes; safe to re-run, it resumes
    git add . ; git commit -m "Add Chog snapshot" ; git push

The server then reads traits from `data/chogs.json` with no network call, and the image route is cached at the edge.
