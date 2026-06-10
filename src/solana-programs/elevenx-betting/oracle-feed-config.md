# Switchboard On-Demand Feed Configuration
## Multi-Source Consensus Oracle for Match Results

This document explains how to configure the Switchboard On-Demand feed that powers trustless settlement for ElevenX betting markets.

---

## Architecture Overview

### The Trust Model

Instead of trusting a single admin to decide match results, we use **3 independent data sources** that must all agree on the outcome:

1. **The Odds API** - Primary sports odds provider
2. **API-Football** - Independent football data provider  
3. **Sportradar** - Enterprise sports data provider

Each source fetches match results independently and returns a normalized value:
- `0` = Home team / Outcome A won
- `1` = Away team / Outcome B won
- `2` = Draw

### Consensus Rules

The feed is configured with strict consensus requirements:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `minJobResponses` | `3` | ALL three sources must return a value |
| `maxVariance` | `0` | All sources must agree exactly (no tolerance) |
| `maxStalenessSeconds` | `600` | Result must be from last 10 minutes |
| `minSampleSize` | `1` | One sample per job is sufficient |

**Security Properties:**
- ✅ If any source is missing → feed produces NO value → settlement reverts
- ✅ If sources disagree → variance > 0 → feed produces NO value → settlement reverts
- ✅ If match not completed → all sources return null → no settlement possible
- ✅ Admin CANNOT override - can only VOID + refund if stuck

---

## Feed Configuration Template

### Step 1: Create the Oracle Jobs

Each job fetches from one provider and normalizes to 0/1/2.

#### Job 1: The Odds API

```typescript
import { OracleJob, Task } from "@switchboard-xyz/on-demand";

export function createTheOddsApiJob(eventId: string): OracleJob {
  return OracleJob.fromObject({
    name: "The Odds API - Match Result",
    tasks: [
      {
        httpTask: {
          url: `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/scores?daysFrom=3&eventIds=${eventId}&apiKey=${THE_ODDS_API_KEY}`,
        },
      },
      {
        jsonParseTask: {
          path: `$[?(@.id == '${eventId}' && @.completed == true)]`,
        },
      },
      {
        jsonParseTask: {
          path: "$[0].scores[0].score",
        },
      },
      // Arithmetic to convert [home, away] → 0/1/2
      // This requires Switchboard's valueTask or custom resolver
      // See: https://docs.switchboard.xyz/reference/task
      {
        valueTask: {
          // Custom logic: if home > away → 0, home < away → 1, else → 2
          // Implementation depends on current Switchboard task docs
          value: "NORMALIZE_SCORE_RESULT", // Placeholder - verify against docs
        },
      },
    ],
  });
}
```

#### Job 2: API-Football

```typescript
export function createApiFootballJob(fixtureId: string): OracleJob {
  return OracleJob.fromObject({
    name: "API-Football - Match Result",
    tasks: [
      {
        httpTask: {
          url: `https://v3.football.api-sports.io/fixtures?id=${fixtureId}`,
          headers: [
            { key: "x-apisports-key", value: `${API_FOOTBALL_KEY}` },
          ],
        },
      },
      {
        jsonParseTask: {
          // Only accept finished matches
          path: "$.response[?(@.fixture.status.short == 'FT')]",
        },
      },
      {
        jsonParseTask: {
          path: "$[0].goals",
        },
      },
      // Normalize home.goals vs away.goals → 0/1/2
      {
        valueTask: {
          value: "NORMALIZE_SCORE_RESULT",
        },
      },
    ],
  });
}
```

#### Job 3: Sportradar

```typescript
export function createSportradarJob(matchId: string): OracleJob {
  return OracleJob.fromObject({
    name: "Sportradar - Match Result",
    tasks: [
      {
        httpTask: {
          url: `https://api.sportradar.com/soccer/trial/v4/en/matches/${matchId}/summary.json?api_key=${SPORTRADAR_KEY}`,
        },
      },
      {
        jsonParseTask: {
          path: "$.sport_event_status[?(@.status == 'closed')]",
        },
      },
      {
        jsonParseTask: {
          path: "$[0].winner_id",
        },
      },
      // Map winner_id → 0/1/2
      {
        valueTask: {
          value: "MAP_WINNER_ID",
        },
      },
    ],
  });
}
```

---

### Step 2: Build the Feed with Consensus

```typescript
import { FeedBuilder } from "@switchboard-xyz/on-demand";

export async function createMatchResultFeed(
  connection: Connection,
  payer: Keypair,
  config: {
    theOddsEventId: string;
    apiFootballFixtureId: string;
    sportradarMatchId: string;
  }
) {
  const builder = new FeedBuilder(connection, payer);

  // Add all three jobs
  builder.addJob(createTheOddsApiJob(config.theOddsEventId));
  builder.addJob(createApiFootballJob(config.apiFootballFixtureId));
  builder.addJob(createSportradarJob(config.sportradarMatchId));

  // Set consensus requirements
  builder.setMinJobResponses(3); // ALL must respond
  builder.setMaxVariance(0);     // Must agree exactly
  builder.setMaxStalenessSeconds(600); // 10 minutes
  builder.setMinSampleSize(1);

  // Build and deploy the feed
  const feedAddress = await builder.build();

  console.log(`Feed deployed at: ${feedAddress.toString()}`);
  return feedAddress;
}
```

---

### Step 3: Pin Feed to Market (On-Chain)

When creating a betting market, the admin MUST pin the feed pubkey:

```typescript
// In your market creation backend function:
const feedAddress = await createMatchResultFeed({
  theOddsEventId: "match_123",
  apiFootballFixtureId: "456",
  sportradarMatchId: "sr:match:789",
});

// Pass feedAddress to createMarket instruction
await createMarketOnChain({
  matchId,
  settlementFeed: feedAddress.toString(), // CRITICAL: pin the feed
  openUntil,
  settleAfter,
});
```

The on-chain program stores this in `BetMarket.settlement_feed` and enforces it during settlement.

---

## Testing on Devnet

### 1. Deploy Test Feed

```bash
cd solana-programs/elevenx-betting
npm install
npm run build

# Deploy to devnet with test event IDs
node scripts/create-test-feed.js \
  --event-id "test_match_001" \
  --cluster devnet
```

### 2. Verify Feed Output

```bash
# Check feed value on-chain
solana account <FEED_ADDRESS> --output json | jq '.data[0]' | base64 -d | xxd
```

### 3. Test Settlement Flow

```bash
# Create test market with pinned feed
npm run create-test-market -- \
  --feed <FEED_ADDRESS> \
  --open-until $(date -v+1H +%s) \
  --settle-after $(date -v+2H +%s)

# Wait for match time to pass, then settle
npm run settle-from-oracle -- --market <MARKET_PDA>
```

---

## Emergency Fallback: Void + Refund

If the oracle feed fails (e.g., all 3 APIs down, or feed misconfigured), the admin can only VOID the market:

```typescript
// Admin calls force_void_market
// This sets market.voided = true, market.settled = true
// All bettors can then call refund() to get their stake back
// LPs can call withdraw_liquidity() to recover unmatched funds
```

**Critical Security Property:** Admin can NEVER pick a winner - only refund everyone.

---

## API Key Management

Add these secrets in Base44 Dashboard → Settings → Environment Variables:

| Secret Name | Provider | Get From |
|-------------|----------|----------|
| `THE_ODDS_API_KEY` | The Odds API | https://the-odds-api.com/dashboard |
| `API_FOOTBALL_KEY` | API-Football | https://dashboard.api-football.com |
| `SPORTRADAR_KEY` | Sportradar | https://developer.sportradar.com |

---

## Verification Checklist

Before mainnet deployment:

- [ ] All 3 jobs return consistent 0/1/2 for test matches
- [ ] Feed produces NO value for incomplete/postponed matches
- [ ] Feed rejects stale results (>10 minutes old)
- [ ] On-chain settlement reverts if feed has no value
- [ ] Admin can void + refund if feed is stuck
- [ ] Code audit confirms no admin backdoors
- [ ] Test with real completed matches on devnet

---

## References

- Switchboard On-Demand Docs: https://docs.switchboard.xyz/
- Task Reference: https://docs.switchboard.xyz/reference/task
- The Odds API: https://the-odds-api.com/
- API-Football: https://api-football.com/
- Sportradar: https://developer.sportradar.com/