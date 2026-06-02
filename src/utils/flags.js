// Country name to flag emoji mapping for World Cup 2026 teams
const COUNTRY_FLAGS = {
  // North America (Hosts)
  'mexico': '🇲🇽',
  'usa': '🇺🇸',
  'united states': '🇺🇸',
  'canada': '🇨🇦',
  
  // Europe
  'england': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'france': '🇫🇷',
  'germany': '🇩🇪',
  'spain': '🇪🇸',
  'portugal': '🇵🇹',
  'netherlands': '🇳🇱',
  'belgium': '🇧🇪',
  'croatia': '🇭🇷',
  'switzerland': '🇨🇭',
  'denmark': '🇩🇰',
  'serbia': '🇷🇸',
  'poland': '🇵🇱',
  'sweden': '🇸🇪',
  'norway': '🇳🇴',
  'scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  'ireland': '🇮🇪',
  'italy': '🇮🇹',
  'austria': '🇦🇹',
  'czechia': '🇨🇿',
  'czech republic': '🇨🇿',
  'ukraine': '🇺🇦',
  'romania': '🇷🇴',
  'hungary': '🇭🇺',
  'turkey': '🇹🇷',
  'greece': '🇬🇷',
  'slovakia': '🇸🇰',
  'slovenia': '🇸🇮',
  'finland': '🇫🇮',
  'iceland': '🇮🇸',
  'bosnia and herzegovina': '🇧🇦',
  'bosnia': '🇧🇦',
  
  // South America
  'brazil': '🇧🇷',
  'argentina': '🇦🇷',
  'uruguay': '🇺🇾',
  'colombia': '🇨🇴',
  'chile': '🇨🇱',
  'ecuador': '🇪🇨',
  'paraguay': '🇵🇾',
  'peru': '🇵🇪',
  'venezuela': '🇻🇪',
  'bolivia': '🇧🇴',
  
  // Africa
  'morocco': '🇲🇦',
  'senegal': '🇸🇳',
  'tunisia': '🇹🇳',
  'egypt': '🇪🇬',
  'nigeria': '🇳🇬',
  'cameroon': '🇨🇲',
  'ghana': '🇬🇭',
  'ivory coast': '🇨🇮',
  'south africa': '🇿🇦',
  'algeria': '🇩🇿',
  'mali': '🇲🇱',
  'burkina faso': '🇧🇫',
  'guinea': '🇬🇳',
  'cape verde': '🇨🇻',
  'congo': '🇨🇬',
  'dr congo': '🇨🇩',
  'gabon': '🇬🇦',
  'benin': '🇧🇯',
  'madagascar': '🇲🇬',
  'mauritania': '🇲🇷',
  'niger': '🇳🇪',
  'zambia': '🇿🇲',
  'zimbabwe': '🇿🇼',
  'mozambique': '🇲🇿',
  'angola': '🇦🇴',
  'botswana': '🇧🇼',
  'namibia': '🇳🇦',
  
  // Asia
  'japan': '🇯🇵',
  'south korea': '🇰🇷',
  'korea republic': '🇰🇷',
  'iran': '🇮🇷',
  'saudi arabia': '🇸🇦',
  'australia': '🇦🇺',
  'qatar': '🇶🇦',
  'uae': '🇦🇪',
  'united arab emirates': '🇦🇪',
  'iraq': '🇮🇶',
  'uzbekistan': '🇺🇿',
  'china': '🇨🇳',
  'jordan': '🇯🇴',
  'oman': '🇴🇲',
  'palestine': '🇵🇸',
  'lebanon': '🇱🇧',
  'syria': '🇸🇾',
  'yemen': '🇾🇪',
  'india': '🇮🇳',
  'thailand': '🇹🇭',
  'vietnam': '🇻🇳',
  'malaysia': '🇲🇾',
  'singapore': '🇸🇬',
  'indonesia': '🇮🇩',
  'philippines': '🇵🇭',
  
  // Oceania
  'new zealand': '🇳🇿',
  'fiji': '🇫🇯',
  'papua new guinea': '🇵🇬',
  
  // Caribbean / Central America
  'jamaica': '🇯🇲',
  'costa rica': '🇨🇷',
  'panama': '🇵🇦',
  'honduras': '🇭🇳',
  'guatemala': '🇬🇹',
  'el salvador': '🇸🇻',
  'nicaragua': '🇳🇮',
  'trinidad and tobago': '🇹🇹',
  'haiti': '🇭🇹',
  'cuba': '🇨🇺',
  'curacao': '🇨🇼',
  'barbados': '🇧🇧',
};

// Convert country code to emoji flag
export const getFlagEmoji = (countryCode) => {
  if (!countryCode) return '🏳️';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt());
  return String.fromCodePoint(...codePoints);
};

// Get flag emoji from country name
export const getFlagFromName = (countryName) => {
  if (!countryName) return '🏳️';
  const normalizedName = countryName.toLowerCase().trim();
  return COUNTRY_FLAGS[normalizedName] || getFlagEmoji(normalizedName) || '🏳️';
};

// Get flag for team (handles both name and country code)
export const getTeamFlag = (teamName, countryCode) => {
  if (countryCode) {
    return getFlagEmoji(countryCode);
  }
  if (teamName) {
    return getFlagFromName(teamName);
  }
  return '🏳️';
};