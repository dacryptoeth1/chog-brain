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

## Rage Bait Brawl

Open `/brawl.html` (or the button on the home page). Two Chogs fight 6-8 rounds and trash-talk each other in a
16:9 stage built for screen recording. Lines come from `POST /api/brawl`: Claude writes them on the server
(same `ANTHROPIC_API_KEY`, never sent to the browser); with no key, or if a line is too long or unsafe, a
canned line is used. Voices use the browser's `speechSynthesis` (pitch, rate and voice picked from the traits),
so no key is needed. Sounds (punch, hit, whoosh, crowd, ding, KO) are synthesized with Web Audio, so there are no
audio files or licences to credit. There are no pain or crying sounds.

## Deploy on Vercel

1. Push this repo to GitHub.
2. On vercel.com choose **Add New > Project**, import the repo, and deploy. The Express app in
   `server.js` is detected automatically and `public/` is served by the CDN.
3. In **Project Settings > Environment Variables** add `ANTHROPIC_API_KEY` (optional, enables Claude narration).
4. In the **Storage** tab add **Upstash Redis** (free plan) and connect it to the project. Vercel adds
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` itself; this makes XP and levels permanent.
   Without it the app still works, but progress resets when the server restarts.
5. Redeploy so the new variables are picked up.

## How the NFT is essential

Stats, personality, signature move and sword are all derived from the token's traits; change any
trait and the character changes (tested). Progression is keyed by token ID, so the NFT is the save
file and moves with its owner.

## Make NFTs load instantly

Reading each Chog from Monad and IPFS at request time is slow. Download every Chog's traits once:

    npm run snapshot     # a few minutes; safe to re-run, it resumes
    git add . ; git commit -m "Add Chog snapshot" ; git push

The server then reads traits from `data/chogs.json` with no network call, and the image route is cached at the edge.
