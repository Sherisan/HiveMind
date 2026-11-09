# HIVE MIND

Instant-win casino game on a honeycomb. Bees hide in some of the 19 cells: the player chooses 3, 5, 7 or 10. Open a
cell: honey boosts the multiplier, a bee stings and the bet is lost. Every honey cell shows a clue, how many bees touch
it, and every closed cell shows its exact chance of honey given all the clues. Cash out any time after the first honey.

```
npm install
npm run dev      # http://localhost:5188
npm run build
npm run rtp      # exact RTP check over every bee layout (fails if any strategy beats 97%)
```

The game plays against the game API (FeedingFranzeeAPI, `api/hive`). In dev, Vite proxies `/api` to
http://localhost:5003 and the API's `/api/dev-token` signs in a demo player. Production builds call `VITE_API_BASE`
with the lobby's `?token=`. Open the game with `?demo` (or build with `VITE_DEMO=1`) to play offline against the
in-browser engine (`createLocalEngine()` in `src/game/engine.ts`, demo wallet R1,000).

## Math (RTP 97%)

Every way of hiding the bees is equally likely: C(19, bees) layouts, from 969 (3 bees) to 92,378 (10). Before each
pick, the odds of a closed cell come from counting the layouts that agree with every clue on the board:

```
P(honey in cell) = layouts with honey in that cell / layouts that fit the clues
boost            = 1 / P
fair value       = product of the boosts of every honey pick
multiplier       = floor(970 × fair value) / 1000          (capped at ×500)
payout           = floor(bet × multiplier to the cent)
```

Every pick is a fair bet at its true odds, whatever the player knows, so the fair value is a martingale and the 3% is
taken once from the whole round. A cell the clues prove safe has boost ×1: reading the board lowers the risk, never the
house edge. No strategy, clue-reading or cash-out timing returns more than 97%. Products are exact (`BigInt` /
`BigInteger`), so client, server and verifier never disagree on a rounding edge. See `src/game/math.ts`.

| Bees | Name    | First cell honey | Cash out after it | Return at R10 |
|-----:|---------|-----------------:|------------------:|--------------:|
| 3    | Calm    | 84%              | ×1.151            | 96.93%        |
| 5    | Buzzing | 74%              | ×1.316            | 96.97%        |
| 7    | Angry   | 63%              | ×1.535            | 96.95%        |
| 10   | Swarm   | 47%              | ×2.047            | 96.96%        |

`npm run rtp` plays 13 strategies per level, plus clearing the whole hive at 3 bees (one pick in each kind of cell,
safest-first and riskiest-first runs, cash-out targets), on every possible bee layout, so its numbers are exact. The fair value always comes
to exactly 97.0000%. The real returns, after rounding down, run from 96.53% (one pick at R1) to 96.998% (R10). The
rounding loss is under a cent per round, so it shrinks as the stake grows.

Clearing every honey cell settles the round (`cleared`), and ×500 settles it as the top prize (`maxed`). The cap only
ever lowers the return. The API refuses a config whose `MaxWin` is below `MaxBet × 500`, so with a R5,000 max win the
max bet is R10.

## Provably fair

See `src/game/fair.ts`. The cells start as the list 0…18; bee `k` (0-based) takes the

```
pick(HMAC_SHA256(key: serverSeed, message: "clientSeed:nonce:k"), cells left)
```

-th cell still in the list, where `pick(digest, n) = (first 52 bits × n) >> 52`. A fresh server seed is used for each
round, its SHA-256 hash is shown before the bet, and the seed is revealed after the round. History → Verify redraws the
bees from the seed, replays every pick with its odds, and checks the multiplier and the payout.

`crypto.subtle` (used by the demo engine and Verify) needs a secure context: localhost or https.

## Backend (FeedingFranzeeAPI)

Engine `Hive`, GameId `hive-mind`, ProviderGameId 12, shaped like `api/defuse`:

- `Domain/Hive/Hive.cs`: `HiveBoard` (cells, neighbours), `HiveInfo` (open cells, clues, flood), `HiveRules` (layouts,
  odds, multiplier, payout) and `HiveFair` (bee draw), a port of `hex.ts`, `math.ts` and `fair.ts`
- `Application/Hive/HiveService.cs`: rounds, wallet debit and credit, history, idle timeout
- `Presentation/Controllers/HiveController.cs`: the endpoints below
- the `hive-mind` entry in `appsettings.json` `Games`, and `Infrastructure/Persistence/HiveMindGameServer.sql` /
  `HiveMindCatalogue.sql` for the deploy. With SQL configured, the API also copies the appsettings entry into
  `dbo.Games` on startup when the row is missing.

| Call                     | Body                         | Returns |
|--------------------------|------------------------------|---------|
| `GET  api/hive/info`     |                              | `{ minBet, maxBet, maxWin, currency, rtp, maxMultiplier, levels, cells }` |
| `GET  api/hive/state`    |                              | board |
| `POST api/hive/bet`      | `{ stake, bees }` (3/5/7/10) | board |
| `POST api/hive/pick`     | `{ cell }` (0–18)            | board |
| `POST api/hive/cashout`  |                              | board |
| `POST api/hive/seed`     | `{ clientSeed }`             | board |

board = `{ round: { id, bet, bees, picks: [{ cell, bee }], opened: [{ cell, clue }], multiplier, payout, status,
beeCells, balance, winPending } | null, fairness: { serverSeedHash, clientSeed, nonce }, history: [{ …, beeCells,
serverSeed, … }] }`, status ∈ `live | cashed | cleared | maxed | stung`. `beeCells` stays null while the round is live.

Server rules: each pick is priced from the board as it stood before the pick. Cash-out needs a honey pick first. Calls
are serialized per seat. A round idle for 10 minutes is cashed out at its multiplier; before the first pick that returns
the stake (status `cashed`, ×1). After a failed call the frontend re-reads the state, so a round the server closed
doesn't leave it stuck.

## Look and feel

The comb hangs from an oak branch in a sunlit forest. On a sting, the hive empties at the viewer. Bees pour out of
every bee cell into a 3D swarm: most dive past the camera, growing and blurring as they come, some circle the hive,
and one flies straight at you head-on until the screen takes the hit (shake, flash, thump). The swarm has its own
synth drone, and stereo whooshes for the bees that fly past.

- The effects canvas covers the whole screen (`src/game/effects.ts`). Bees fly in a simple perspective space: the
  camera is at the screen centre, the hive sits at depth F, and a bee at depth z is drawn F / z times larger.
- The bee art is drawn with canvas paths (`src/game/beeArt.ts`) and pre-rendered into sprites: a top view in four
  wing beats × four depth-of-field blurs, and a large head-on view.
- `prefers-reduced-motion` gets a small swarm around the hive only: no camera dive, no shake, no drifting pollen.

Performance rules this layout depends on:

- The branch and the comb's slab are their own SVG layer under the cells (`.hive-decor`). Don't move them back into
  the cells' SVG: every cell animation would then redraw their large `drop-shadow` filters (a swarm dropped from
  about 50 to 25 fps in testing).
- Nothing in the hive SVG animates forever. The den bees buzz for about 3 s, then stop.
- The forest's moving parts (light rays, bokeh, pollen, sprigs) animate `transform` and `opacity` only.

## Controls

Click a cell to open it; point at it first to read its odds in the side panel. On touch screens, tap to read and tap
again to open. Cells the clues prove are bees can't be opened. `Space` plays or cashes out. The Odds switch hides the
percentages for players who'd rather read the clues themselves.

## Files

- `src/game/hex.ts`: the honeycomb, neighbour masks
- `src/game/math.ts`: layouts, odds, fair value, multiplier, payout, flood, replay (no DOM; shared with the engines,
  the verifier and `scripts/rtp-check.ts`)
- `src/game/fair.ts`: provably-fair bee draw
- `src/game/engine.ts`: the `HiveApi` contract and the in-browser demo engine
- `src/game/httpEngine.ts`: client for `api/hive`
- `src/game/useGame.ts`: React state; every server call runs through one queue
- `src/game/effects.ts`: the full-screen effects canvas: the 3D swarm, honey splashes, confetti and idle bees (it
  animates outcomes, never decides them)
- `src/game/beeArt.ts`: bee artwork and sprites
- `src/components/Honeycomb.tsx`: the SVG hive (the branch and comb layer, and the cells); `Intel.tsx`: the odds panel
- `src/components/Forest.tsx`: the forest backdrop
- `tools/thumbnail.html`: the 1280×720 lobby thumbnail, drawn from the game's forest, comb and bee art; with `npm run dev`
  running, open `/tools/thumbnail.html` and screenshot it into `public/thumbnail.png`
