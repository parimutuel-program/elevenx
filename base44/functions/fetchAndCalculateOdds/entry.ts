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

    // Fetch World Cup Winner odds
    const winnerResponse = await fetch(
      `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup_winner/odds?apiKey=${THE_ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=decimal`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    const winnerData = await winnerResponse.json();
    console.log('World Cup Winner odds:', winnerData);

    let winnerOutcomes = [];
    
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
          }
        }
      }
    }

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
          status: 'coming_soon',
          open_until: '2026-07-19T19:00:00Z',
          outcomes,
          total_volume: 0,
          solana_market_created: false,
          solana_market_pda: null,
        };
        
        await base44.entities.FuturesMarket.create(marketData);
        console.log(`Created market for ${team.country}`);
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

// Simple flag mapping for common countries
function getFlag(countryName) {
  const flagMap = {
    'Brazil': '🇧🇷',
    'Argentina': '🇦🇷',
    'France': '🇫🇷',
    'Spain': '🇪🇸',
    'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'Germany': '🇩🇪',
    'Portugal': '🇵🇹',
    'Netherlands': '🇳🇱',
    'Belgium': '🇧🇪',
    'Italy': '🇮🇹',
    'Croatia': '🇭🇷',
    'Uruguay': '🇺🇾',
    'Colombia': '🇨🇴',
    'Mexico': '🇲🇽',
    'USA': '🇺🇸',
    'Morocco': '🇲🇦',
    'Japan': '🇯🇵',
    'Senegal': '🇸🇳',
    'Denmark': '🇩🇰',
    'Switzerland': '🇨🇭',
    'South Korea': '🇰🇷',
    'Australia': '🇦🇺',
    'Nigeria': '🇳🇬',
    'Egypt': '🇪🇬',
    'Iran': '🇮🇷',
    'Saudi Arabia': '🇸🇦',
    'Canada': '🇨🇦',
    'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
    'Poland': '🇵🇱',
    'Tunisia': '🇹🇳',
    'Ecuador': '🇪🇨',
    'Cameroon': '🇨🇲',
    'Ghana': '🇬🇭',
    'Algeria': '🇩🇿',
    'Costa Rica': '🇨🇷',
    'Jamaica': '🇯🇲',
    'Panama': '🇵🇦',
    'Serbia': '🇷🇸',
    'Ukraine': '🇺🇦',
    'Sweden': '🇸🇪',
    'Austria': '🇦🇹',
    'Czech Republic': '🇨🇿',
    'Chile': '🇨🇱',
    'Peru': '🇵🇪',
    'Paraguay': '🇵🇾',
    'Bolivia': '🇧🇴',
  };
  return flagMap[countryName] || '🌍';
}