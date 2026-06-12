import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Connection, PublicKey } from 'npm:@solana/web3.js@1.98.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    let isAdmin = false;
    try {
      const user = await base44.auth.me();
      if (user && user.role === 'admin') isAdmin = true;
    } catch (_) {}
    
    if (!isAdmin) {
      try {
        const authHeader = req.headers.get('Authorization') || '';
        const token = authHeader.replace('Bearer ', '');
        if (token) {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (payload.walletAddress) {
              const walletUsers = await base44.asServiceRole.entities.WalletUser.filter({ wallet_address: payload.walletAddress });
              if (walletUsers[0]?.role === 'admin') isAdmin = true;
            }
          }
        }
      } catch (_) {}
    }
    
    if (!isAdmin) {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=f0184d45-f52a-44d3-9314-2365f64ea024';
    const PROGRAM_ID = '3ecFdHPbcU88UQ37iStPcGaz7Bg16RdSDDYqW5FzPabu';
    
    const connection = new Connection(RPC_URL, 'confirmed');
    const programId = new PublicKey(PROGRAM_ID);
    
    const filters = [{ dataSize: 281 }];
    const accounts = await connection.getProgramAccounts(programId, { filters, commitment: 'confirmed' });
    
    const allMatches = await base44.asServiceRole.entities.Match.filter({});
    const matchData = allMatches.map(m => ({ id: m.id, team_a: m.team_a, team_b: m.team_b }));
    
    const onChainMarkets = accounts.map(acc => {
      const data = acc.account.data;
      const teamA = new TextDecoder().decode(data.slice(40, 72)).replace(/\0/g, '').trim();
      const teamB = new TextDecoder().decode(data.slice(72, 103)).replace(/\0/g, '').trim();
      const oddsA = Number(data.readBigUInt64LE(156));
      const oddsB = Number(data.readBigUInt64LE(164));
      const oddsDraw = Number(data.readBigUInt64LE(172));
      return {
        pda: acc.pubkey.toBase58(),
        team_a: teamA,
        team_b: teamB,
        oracleOdds: { a: oddsA, b: oddsB, draw: oddsDraw },
        lamports: acc.account.lamports,
      };
    });
    
    // Find FAKE_ONCHAIN (no DB match)
    const FAKE_ONCHAIN = [];
    onChainMarkets.forEach(oc => {
      const dbMatch = matchData.find(m => 
        m.team_a.toLowerCase().trim() === oc.team_a.toLowerCase().trim() &&
        m.team_b.toLowerCase().trim() === oc.team_b.toLowerCase().trim()
      );
      if (!dbMatch) {
        FAKE_ONCHAIN.push(oc);
      }
    });
    
    // Count bettable vs dead
    const bettable = FAKE_ONCHAIN.filter(oc => oc.oracleOdds.a > 100);
    const dead = FAKE_ONCHAIN.filter(oc => oc.oracleOdds.a === 0);
    const other = FAKE_ONCHAIN.filter(oc => oc.oracleOdds.a <= 100 && oc.oracleOdds.a > 0);
    
    return Response.json({
      totalFakeOnchain: FAKE_ONCHAIN.length,
      bettable: bettable.length,
      dead: dead.length,
      other: other.length,
      bettableMarkets: bettable.map(m => ({ team_a: m.team_a, team_b: m.team_b, odds: m.oracleOdds })),
      deadMarkets: dead.map(m => ({ team_a: m.team_a, team_b: m.team_b, odds: m.oracleOdds })),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});