# 🔮 ElevenX Oracle Integration Guide

## Overview

ElevenX uses oracle providers to automatically verify match results and settle bets in a trustless, decentralized manner. The oracle system supports multiple providers with automatic failover.

---

## 🎯 Supported Oracle Providers

### 1. **Pyth Network** (Recommended)
- **Type**: Decentralized oracle network
- **Data**: Real-time sports data feeds
- **Latency**: ~400ms
- **Cost**: ~0.01 SOL per query
- **Status**: ⏳ Integration template ready

### 2. **Switchboard**
- **Type**: On-demand oracle
- **Data**: Customizable sports feeds
- **Latency**: ~600ms
- **Cost**: ~0.008 SOL per query
- **Status**: ⏳ Integration template ready

### 3. **Manual Verification** (Fallback)
- **Type**: Admin-verified
- **Data**: Admin input
- **Latency**: Instant
- **Cost**: Free
- **Status**: ✅ Active

---

## 📦 Current Implementation

### Files Created
- ✅ `functions/oracleService.js` - Oracle service backend function
- ✅ `functions/settleBetWithOracle.js` - Settlement with oracle integration
- ✅ Admin panel oracle status display
- ✅ Manual verification fallback

### Architecture
```
┌─────────────┐
│   Match     │
│  Finished   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│  Oracle Service     │
│  - Pyth (primary)   │
│  - Switchboard      │
│  - Manual (fallback)│
└──────┬──────────────┘
       │
       ▼
┌─────────────┐
│  Verify     │
│  Signature  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Settle     │
│  Bets       │
└─────────────┘
```

---

## 🚀 Setup Instructions

### Step 1: Choose Oracle Provider

#### Option A: Pyth Network
1. Visit [Pyth Network](https://pyth.network)
2. Create developer account
3. Request access to sports data feeds
4. Get API key: `PYTH_API_KEY`
5. Configure feed IDs for your sports/events

#### Option B: Switchboard
1. Visit [Switchboard](https://switchboard.xyz)
2. Create account
3. Configure custom oracle feed
4. Get feed ID and API credentials
5. Test with sample data

### Step 2: Configure Backend

Update `functions/oracleService.js`:

```javascript
const ORACLE_CONFIG = {
  provider: 'pyth', // or 'switchboard'
  pyth: {
    baseUrl: 'https://hermes.pyth.network',
    apiKey: Deno.env.get('PYTH_API_KEY'),
    priceFeedIds: {
      SOCCER_WORLD_CUP: 'YOUR_FEED_ID_HERE',
    },
  },
  switchboard: {
    baseUrl: 'https://api.switchboard.xyz',
    apiKey: Deno.env.get('SWITCHBOARD_API_KEY'),
    feedId: 'YOUR_FEED_ID_HERE',
  },
};
```

### Step 3: Set Environment Variables

In Base44 dashboard → Settings → Environment Variables:

```
PYTH_API_KEY=your_pyth_api_key
SWITCHBOARD_API_KEY=your_switchboard_key
ORACLE_PROVIDER=pyth
```

### Step 4: Test Oracle Integration

```bash
# Test oracle service
curl -X POST https://your-app.base44.app/functions/oracleService \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"matchId": "test_match_123", "provider": "pyth"}'
```

Expected response:
```json
{
  "success": true,
  "oracleResult": {
    "winner": "team_a",
    "scoreA": 2,
    "scoreB": 1,
    "verified": true,
    "provider": "pyth",
    "timestamp": "2026-05-31T20:00:00Z"
  }
}
```

---

## 🔐 Security Considerations

### Signature Verification
Always verify oracle signatures to prevent tampering:

```javascript
import { verify } from 'npm:@noble/ed25519';

function verifyOracleSignature(data, signature, publicKey) {
  const isValid = verify(signature, data, publicKey);
  if (!isValid) {
    throw new Error('Invalid oracle signature');
  }
  return true;
}
```

### Multi-Oracle Consensus (Recommended for Production)
For high-value bets, use multiple oracles:

```javascript
const results = await Promise.all([
  fetchPythResult(match),
  fetchSwitchboardResult(match),
  fetchThirdOracleResult(match),
]);

// Require 2/3 consensus
const consensus = results.filter(r => r.winner === results[0].winner);
if (consensus.length < 2) {
  throw new Error('Oracle consensus failed');
}
```

---

## 📊 Oracle Provider Comparison

| Feature | Pyth | Switchboard | Manual |
|---------|------|-------------|--------|
| **Decentralization** | High | High | None |
| **Latency** | ~400ms | ~600ms | Instant |
| **Cost per Query** | ~0.01 SOL | ~0.008 SOL | Free |
| **Data Accuracy** | High | High | Variable |
| **Setup Complexity** | Medium | Medium | Easy |
| **Reliability** | 99.9% | 99.9% | 100% |
| **Best For** | Production | Production | Testing/Fallback |

---

## 🛠️ Implementation Status

### ✅ Completed
- Oracle service architecture
- Manual verification fallback
- Admin panel integration
- Settlement logic
- Error handling

### ⏳ Pending
- Pyth Network integration (requires API access)
- Switchboard integration (requires API access)
- Signature verification implementation
- Multi-oracle consensus
- Production testing

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Oracle service responds correctly
- [ ] Manual verification works
- [ ] Error handling for failed oracle calls
- [ ] Signature verification (when implemented)

### Integration Tests
- [ ] End-to-end settlement flow
- [ ] Oracle failure → manual fallback
- [ ] Admin can override oracle result
- [ ] Bets settle correctly based on oracle data

### Load Tests
- [ ] Handle 100 concurrent settlements
- [ ] Oracle API rate limiting
- [ ] Database consistency under load

---

## 🚨 Troubleshooting

### Oracle Returns "Pending"
- Check API credentials
- Verify feed ID is correct
- Ensure oracle provider has data for your sport/event

### Settlement Fails
- Check oracle signature verification
- Verify match ID exists
- Ensure bet status is "active"

### High Latency
- Switch to closer oracle endpoint
- Implement caching for repeated queries
- Consider manual verification for time-sensitive matches

---

## 📈 Next Steps

1. **Get Oracle API Access**
   - Apply for Pyth sports data feeds
   - Or configure Switchboard custom feed

2. **Implement Signature Verification**
   - Add crypto verification logic
   - Store oracle public keys securely

3. **Test with Real Data**
   - Use devnet for testing
   - Settle test bets with oracle data
   - Monitor for accuracy

4. **Deploy to Production**
   - Enable oracle for mainnet
   - Monitor first 100 settlements
   - Keep manual fallback available

---

## 📞 Resources

- **Pyth Network Docs**: https://docs.pyth.network
- **Switchboard Docs**: https://docs.switchboard.xyz
- **Solana Oracle Guide**: https://docs.solana.com/developing/oracles
- **ElevenX Oracle Service**: `functions/oracleService.js`

---

**Last Updated:** 2026-05-31  
**Status:** Template Ready - Awaiting Oracle API Access  
**Next Action:** Apply for Pyth/Switchboard sports data feeds