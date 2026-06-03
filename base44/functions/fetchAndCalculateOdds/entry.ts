import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const THE_ODDS_API_KEY = Deno.env.get('THE_ODDS_API_KEY');

/**
 * Fetches World Cup winner odds and calculates 2nd/3rd place odds using formula
 * Formula: 2nd place ≈ 50% of 1st place odds, 3rd place ≈ 30% of 1st place odds
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    if (!THE_ODDS_API_KEY) {
      return Response.json({ error: 'THE_ODDS_API_KEY not configured' }, { status: 500 });
    }

    // Fetch World Cup Winner odds - try multiple sport keys
    const sportKeys = [
      'soccer_fifa_world_cup',
      'soccer_fifa_world_cup_winner',
      'soccer_world_cup_2026',
    ];
    
    let winnerOutcomes = [];
    
    for (const sportKey of sportKeys) {
      try {
        const winnerResponse = await fetch(
          `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${THE_ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=decimal`,
          { headers: { 'Accept': 'application/json' } }
        );
        
        const winnerData = await winnerResponse.json();
        console.log(`Trying ${sportKey}:`, winnerData);
        
        if (winnerData.error_code) {
          console.log(`${sportKey} failed:`, winnerData.message);
          continue;
        }
        
        if (Array.isArray(winnerData) && winnerData.length > 0) {
          const event = winnerData[0];
          if (event.bookmakers && event.bookmakers.length > 0) {
            const bookmaker = event.bookmakers[0];
            const markets = bookmaker.markets;
            
            if (markets && markets.length > 0) {
              const h2hMarket = markets.find(m => m.key === 'h2h');
              if (h2hMarket && h2hMarket.outcomes) {
                winnerOutcomes = h2hMarket.outcomes.map(o => ({
                  name: o.name,
                  odds: o.price,
                }));
                console.log(`Success with ${sportKey}, found ${winnerOutcomes.length} outcomes`);
                break;
              }
            }
          }
        }
      } catch (err) {
        console.log(`Error trying ${sportKey}:`, err.message);
        continue;
      }
    }
    
    // Fallback data for all 48 World Cup teams
    const fallbackOdds = [
      { name: 'Brazil', odds: 5.5 },
      { name: 'Argentina', odds: 6.0 },
      { name: 'France', odds: 7.0 },
      { name: 'England', odds: 8.0 },
      { name: 'Spain', odds: 9.0 },
      { name: 'Germany', odds: 10.0 },
      { name: 'Portugal', odds: 11.0 },
      { name: 'Netherlands', odds: 13.0 },
      { name: 'Belgium', odds: 15.0 },
      { name: 'Italy', odds: 17.0 },
      { name: 'USA', odds: 50.0 },
      { name: 'Mexico', odds: 60.0 },
      { name: 'Canada', odds: 100.0 },
      { name: 'Morocco', odds: 40.0 },
      { name: 'Japan', odds: 80.0 },
      { name: 'South Korea', odds: 100.0 },
      { name: 'Australia', odds: 150.0 },
      { name: 'Nigeria', odds: 120.0 },
      { name: 'Egypt', odds: 200.0 },
      { name: 'Iran', odds: 250.0 },
      { name: 'Saudi Arabia', odds: 300.0 },
      { name: 'Senegal', odds: 150.0 },
      { name: 'Denmark', odds: 60.0 },
      { name: 'Switzerland', odds: 70.0 },
      { name: 'Croatia', odds: 35.0 },
      { name: 'Uruguay', odds: 40.0 },
      { name: 'Colombia', odds: 45.0 },
      { name: 'Ecuador', odds: 100.0 },
      { name: 'Poland', odds: 80.0 },
      { name: 'Ukraine', odds: 150.0 },
      { name: 'Sweden', odds: 120.0 },
      { name: 'Austria', odds: 150.0 },
      { name: 'Wales', odds: 200.0 },
      { name: 'Serbia', odds: 150.0 },
      { name: 'Tunisia', odds: 250.0 },
      { name: 'Cameroon', odds: 200.0 },
      { name: 'Ghana', odds: 180.0 },
      { name: 'Algeria', odds: 250.0 },
      { name: 'Costa Rica', odds: 300.0 },
      { name: 'Jamaica', odds: 350.0 },
      { name: 'Panama', odds: 400.0 },
      { name: 'Qatar', odds: 500.0 },
      { name: 'Bosnia and Herzegovina', odds: 300.0 },
      { name: 'Czechia', odds: 200.0 },
      { name: 'South Africa', odds: 350.0 },
      { name: 'Chile', odds: 150.0 },
      { name: 'Peru', odds: 200.0 },
      { name: 'Paraguay', odds: 250.0 },
    ];
    
    // Merge API data with fallback - prefer API odds when available, otherwise use fallback
    const apiOddsMap = {};
    winnerOutcomes.forEach(o => { apiOddsMap[o.name] = o.odds; });
    
    winnerOutcomes = fallbackOdds.map(team => ({
      name: team.name,
      odds: apiOddsMap[team.name] || team.odds, // Use API odds if available, otherwise fallback
    }));
    
    console.log(`Merged odds: ${Object.keys(apiOddsMap).length} from API, ${fallbackOdds.length - Object.keys(apiOddsMap).length} from fallback`);

    console.log('Processed winner outcomes:', winnerOutcomes.length);

    // Calculate 2nd and 3rd place odds using formula
    const calculatedOutcomes = winnerOutcomes.map(team => {
      const firstPlaceOdds = team.odds;
      // Formula: 2nd place ≈ 50% of 1st place odds (inverse relationship)
      const secondPlaceOdds = Math.max(1.5, firstPlaceOdds * 0.5);
      // Formula: 3rd place ≈ 30% of 1st place odds
      const thirdPlaceOdds = Math.max(1.2, firstPlaceOdds * 0.3);
      
      return {
        country: team.name,
        flag: getFlag(team.name),
        firstPlaceOdds,
        secondPlaceOdds: parseFloat(secondPlaceOdds.toFixed(2)),
        thirdPlaceOdds: parseFloat(thirdPlaceOdds.toFixed(2)),
      };
    });

    // Update or create FuturesMarket records for each country
    const existingMarkets = await base44.entities.FuturesMarket.list();
    
    for (const team of calculatedOutcomes) {
      const existingMarket = existingMarkets.find(m => m.country === team.country);
      
      const outcomes = [
        { 
          label: `${team.country} - 1st Place`, 
          position: '1st',
          flag: team.flag,
          odds: team.firstPlaceOdds,
          pool: 0,
          lp_offers: 0,
        },
        { 
          label: `${team.country} - 2nd Place`, 
          position: '2nd',
          flag: team.flag,
          odds: team.secondPlaceOdds,
          pool: 0,
          lp_offers: 0,
        },
        { 
          label: `${team.country} - 3rd Place`, 
          position: '3rd',
          flag: team.flag,
          odds: team.thirdPlaceOdds,
          pool: 0,
          lp_offers: 0,
        },
      ];

      if (existingMarket) {
        // Update existing market with new odds
        await base44.entities.FuturesMarket.update(existingMarket.id, {
          outcomes,
          country_flag: team.flag,
        });
        console.log(`Updated market for ${team.country}`);
      } else {
        // Create new market for this country
        const marketData = {
          title: `${team.country} World Cup Finish`,
          subtitle: `Where will ${team.country} finish?`,
          country: team.country,
          country_flag: team.flag,
          category: 'tournament',
          icon: team.flag,
          status: 'open',
          open_until: '2026-07-19T19:00:00Z',
          outcomes,
          total_volume: 0,
          solana_market_created: false,
          solana_market_pda: null,
        };
        
        await base44.entities.FuturesMarket.create(marketData);
        console.log(`✅ Created market for ${team.country} with odds: 1st=${team.firstPlaceOdds}, 2nd=${team.secondPlaceOdds}, 3rd=${team.thirdPlaceOdds}`);
      }
    }

    return Response.json({
      success: true,
      countriesProcessed: calculatedOutcomes.length,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('fetchAndCalculateOdds error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Simple flag mapping for all 48 World Cup 2026 teams
function getFlag(countryName) {
  const flagMap = {
    // Group A
    'Mexico': '🇲🇽',
    'South Africa': '🇿🇦',
    'South Korea': '🇰🇷',
    'Czechia': '🇨🇿',
    'Czech Republic': '🇨🇿',
    // Group B
    'Canada': '🇨🇦',
    'Bosnia and Herzegovina': '🇧🇦',
    'Qatar': '🇶🇦',
    'Switzerland': '🇨🇭',
    // Group C
    'Brazil': '🇧🇷',
    'Morocco': '🇲🇦',
    'Poland': '🇵🇱',
    'Saudi Arabia': '🇸🇦',
    // Group D
    'USA': '🇺🇸',
    'Ecuador': '🇪🇨',
    'Denmark': '🇩🇰',
    'Cameroon': '🇨🇲',
    // Group E
    'Germany': '🇩🇪',
    'Japan': '🇯🇵',
    'Nigeria': '🇳🇬',
    'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
    // Group F
    'Argentina': '🇦🇷',
    'Sweden': '🇸🇪',
    'Iran': '🇮🇷',
    'Jamaica': '🇯🇲',
    // Group G
    'Spain': '🇪🇸',
    'Australia': '🇦🇺',
    'Tunisia': '🇹🇳',
    'Panama': '🇵🇦',
    // Group H
    'France': '🇫🇷',
    'Senegal': '🇸🇳',
    'Austria': '🇦🇹',
    'Costa Rica': '🇨🇷',
    // Group I
    'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'Uruguay': '🇺🇾',
    'Ukraine': '🇺🇦',
    'Ghana': '🇬🇭',
    // Group J
    'Portugal': '🇵🇹',
    'Croatia': '🇭🇷',
    'Chile': '🇨🇱',
    'Algeria': '🇩🇿',
    // Group K
    'Netherlands': '🇳🇱',
    'Colombia': '🇨🇴',
    'Serbia': '🇷🇸',
    'Egypt': '🇪🇬',
    // Group L
    'Italy': '🇮🇹',
    'Belgium': '🇧🇪',
    'Peru': '🇵🇪',
    'Paraguay': '🇵🇾',
    // Others
    'Bolivia': '🇧🇴',
  };
  return flagMap[countryName] || '🌍';
}