# Chog Brain

Chogathon 2026 entry. Every Chog Genesis NFT (Monad, 1,969 items) becomes a living character:
its traits decide its personality, stats, and signature move, and its XP/level/memory are
stored against the token ID. No Chog, no character.

Contract: `0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763` (Monad, chain 143)

## Run

    npm install
    npm start            # http://localhost:3000
    npm test

Optional env: `ANTHROPIC_API_KEY` (Claude narrates duels; otherwise a built-in commentator is used),
`NARRATOR_MODEL`, `MONAD_RPC`, `IPFS_GATEWAY`, `PORT`, `DATA_FILE`.

## Testing without owning a Chog

Demo mode works with any token id 0-1968. Connect a wallet that owns the token for
onchain-verified play. If the Monad RPC or metadata host is unreachable, the app falls back to
seeded traits and says so on screen.

## How the NFT is essential

Stats and personality are derived from the token's traits; change any trait and the character
changes (tested). Progression is keyed by token ID, so the NFT is the save file and moves with the owner.
