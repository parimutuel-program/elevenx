// Complete name → ISO 3166-1 alpha-2 code mapping for all 48 FIFA World Cup 2026 teams + extras
const NAME_TO_CODE = {
  // CONCACAF
  'usa': 'US', 'united states': 'US', 'united states of america': 'US',
  'mexico': 'MX', 'canada': 'CA', 'costa rica': 'CR', 'panama': 'PA',
  'jamaica': 'JM', 'honduras': 'HN', 'el salvador': 'SV', 'guatemala': 'GT',
  'cuba': 'CU', 'haiti': 'HT', 'trinidad and tobago': 'TT', 'trinidad & tobago': 'TT',
  // CONMEBOL
  'brazil': 'BR', 'argentina': 'AR', 'uruguay': 'UY', 'colombia': 'CO',
  'chile': 'CL', 'ecuador': 'EC', 'paraguay': 'PY', 'peru': 'PE',
  'venezuela': 'VE', 'bolivia': 'BO',
  // UEFA
  'france': 'FR', 'spain': 'ES', 'germany': 'DE', 'england': 'GB-ENG',
  'portugal': 'PT', 'netherlands': 'NL', 'belgium': 'BE', 'italy': 'IT',
  'croatia': 'HR', 'switzerland': 'CH', 'denmark': 'DK', 'austria': 'AT',
  'poland': 'PL', 'serbia': 'RS', 'ukraine': 'UA', 'sweden': 'SE',
  'norway': 'NO', 'scotland': 'GB-SCT', 'wales': 'GB-WLS', 'czechia': 'CZ',
  'czech republic': 'CZ', 'slovakia': 'SK', 'hungary': 'HU', 'romania': 'RO',
  'greece': 'GR', 'turkey': 'TR', 'albania': 'AL', 'slovenia': 'SI',
  'iceland': 'IS', 'finland': 'FI', 'russia': 'RU', 'ireland': 'IE',
  'northern ireland': 'GB-NIR', 'bosnia and herzegovina': 'BA', 'bosnia & herzegovina': 'BA',
  'north macedonia': 'MK', 'georgia': 'GE', 'moldova': 'MD', 'luxembourg': 'LU',
  'azerbaijan': 'AZ', 'armenia': 'AM', 'estonia': 'EE', 'latvia': 'LV',
  'lithuania': 'LT', 'belarus': 'BY', 'kazakhstan': 'KZ', 'bulgaria': 'BG',
  'cyprus': 'CY', 'malta': 'MT', 'andorra': 'AD', 'liechtenstein': 'LI',
  'san marino': 'SM', 'kosovo': 'XK', 'gibraltar': 'GI', 'faroe islands': 'FO',
  // AFC
  'japan': 'JP', 'south korea': 'KR', 'korea republic': 'KR', 'australia': 'AU',
  'iran': 'IR', 'saudi arabia': 'SA', 'qatar': 'QA', 'iraq': 'IQ',
  'uzbekistan': 'UZ', 'jordan': 'JO', 'oman': 'OM', 'bahrain': 'BH',
  'uae': 'AE', 'united arab emirates': 'AE', 'china': 'CN', 'china pr': 'CN',
  'thailand': 'TH', 'vietnam': 'VN', 'indonesia': 'ID', 'malaysia': 'MY',
  'india': 'IN', 'north korea': 'KP', 'dpr korea': 'KP', 'syria': 'SY',
  'kyrgyzstan': 'KG', 'tajikistan': 'TJ', 'turkmenistan': 'TM',
  // CAF
  'morocco': 'MA', 'senegal': 'SN', 'nigeria': 'NG', 'egypt': 'EG',
  'cameroon': 'CM', 'ghana': 'GH', 'south africa': 'ZA', 'algeria': 'DZ',
  'tunisia': 'TN', 'mali': 'ML', 'cote d\'ivoire': 'CI', 'ivory coast': 'CI',
  'democratic republic of congo': 'CD', 'dr congo': 'CD', 'congo dr': 'CD',
  'republic of congo': 'CG', 'guinea': 'GN', 'zambia': 'ZM', 'angola': 'AO',
  'mozambique': 'MZ', 'tanzania': 'TZ', 'uganda': 'UG', 'kenya': 'KE',
  'ethiopia': 'ET', 'burkina faso': 'BF', 'cape verde': 'CV', 'benin': 'BJ',
  'gabon': 'GA', 'mauritania': 'MR', 'namibia': 'NA', 'zimbabwe': 'ZW',
  'sierra leone': 'SL', 'equatorial guinea': 'GQ', 'sudan': 'SD',
  'central african republic': 'CF', 'liberia': 'LR', 'comoros': 'KM',
  'rwanda': 'RW', 'togo': 'TG', 'niger': 'NE', 'chad': 'TD',
  'mauritius': 'MU', 'seychelles': 'SC', 'libya': 'LY', 'botswana': 'BW',
  // OFC
  'new zealand': 'NZ', 'papua new guinea': 'PG', 'fiji': 'FJ',
  // CONMEBOL/others
  'trinidad': 'TT',
};

// ISO code → flag emoji (using Unicode regional indicator letters)
const CODE_TO_FLAG = {
  'US': '🇺🇸', 'MX': '🇲🇽', 'CA': '🇨🇦', 'CR': '🇨🇷', 'PA': '🇵🇦',
  'JM': '🇯🇲', 'HN': '🇭🇳', 'SV': '🇸🇻', 'GT': '🇬🇹', 'CU': '🇨🇺',
  'HT': '🇭🇹', 'TT': '🇹🇹',
  'BR': '🇧🇷', 'AR': '🇦🇷', 'UY': '🇺🇾', 'CO': '🇨🇴', 'CL': '🇨🇱',
  'EC': '🇪🇨', 'PY': '🇵🇾', 'PE': '🇵🇪', 'VE': '🇻🇪', 'BO': '🇧🇴',
  'FR': '🇫🇷', 'ES': '🇪🇸', 'DE': '🇩🇪', 'PT': '🇵🇹', 'NL': '🇳🇱',
  'BE': '🇧🇪', 'IT': '🇮🇹', 'HR': '🇭🇷', 'CH': '🇨🇭', 'DK': '🇩🇰',
  'AT': '🇦🇹', 'PL': '🇵🇱', 'RS': '🇷🇸', 'UA': '🇺🇦', 'SE': '🇸🇪',
  'NO': '🇳🇴', 'CZ': '🇨🇿', 'SK': '🇸🇰', 'HU': '🇭🇺', 'RO': '🇷🇴',
  'GR': '🇬🇷', 'TR': '🇹🇷', 'AL': '🇦🇱', 'SI': '🇸🇮', 'IS': '🇮🇸',
  'FI': '🇫🇮', 'RU': '🇷🇺', 'IE': '🇮🇪', 'BA': '🇧🇦', 'MK': '🇲🇰',
  'GE': '🇬🇪', 'MD': '🇲🇩', 'LU': '🇱🇺', 'AZ': '🇦🇿', 'AM': '🇦🇲',
  'EE': '🇪🇪', 'LV': '🇱🇻', 'LT': '🇱🇹', 'BY': '🇧🇾', 'KZ': '🇰🇿',
  'BG': '🇧🇬', 'CY': '🇨🇾', 'MT': '🇲🇹', 'AD': '🇦🇩', 'SM': '🇸🇲',
  'XK': '🇽🇰', 'GI': '🇬🇮', 'FO': '🇫🇴',
  // British nations (use GB for generic England/Scotland/Wales fallback)
  'GB': '🇬🇧', 'GB-ENG': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'GB-SCT': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'GB-WLS': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'GB-NIR': '🇬🇧',
  'JP': '🇯🇵', 'KR': '🇰🇷', 'AU': '🇦🇺', 'IR': '🇮🇷', 'SA': '🇸🇦',
  'QA': '🇶🇦', 'IQ': '🇮🇶', 'UZ': '🇺🇿', 'JO': '🇯🇴', 'OM': '🇴🇲',
  'BH': '🇧🇭', 'AE': '🇦🇪', 'CN': '🇨🇳', 'TH': '🇹🇭', 'VN': '🇻🇳',
  'ID': '🇮🇩', 'MY': '🇲🇾', 'IN': '🇮🇳', 'KP': '🇰🇵', 'SY': '🇸🇾',
  'KG': '🇰🇬', 'TJ': '🇹🇯', 'TM': '🇹🇲',
  'MA': '🇲🇦', 'SN': '🇸🇳', 'NG': '🇳🇬', 'EG': '🇪🇬', 'CM': '🇨🇲',
  'GH': '🇬🇭', 'ZA': '🇿🇦', 'DZ': '🇩🇿', 'TN': '🇹🇳', 'ML': '🇲🇱',
  'CI': '🇨🇮', 'CD': '🇨🇩', 'CG': '🇨🇬', 'GN': '🇬🇳', 'ZM': '🇿🇲',
  'AO': '🇦🇴', 'MZ': '🇲🇿', 'TZ': '🇹🇿', 'UG': '🇺🇬', 'KE': '🇰🇪',
  'ET': '🇪🇹', 'BF': '🇧🇫', 'CV': '🇨🇻', 'BJ': '🇧🇯', 'GA': '🇬🇦',
  'MR': '🇲🇷', 'NA': '🇳🇦', 'ZW': '🇿🇼', 'SL': '🇸🇱', 'GQ': '🇬🇶',
  'SD': '🇸🇩', 'CF': '🇨🇫', 'LR': '🇱🇷', 'KM': '🇰🇲', 'RW': '🇷🇼',
  'TG': '🇹🇬', 'NE': '🇳🇪', 'TD': '🇹🇩', 'MU': '🇲🇺', 'LY': '🇱🇾',
  'BW': '🇧🇼', 'SC': '🇸🇨',
  'NZ': '🇳🇿', 'PG': '🇵🇬', 'FJ': '🇫🇯',
};

// Get ISO code from team name
export const getCountryCode = (teamName) => {
  if (!teamName) return '';
  const key = teamName.toLowerCase().trim();
  return NAME_TO_CODE[key] || teamName.substring(0, 2).toUpperCase();
};

// Get flag emoji for team name
export const getTeamFlag = (teamName) => {
  if (!teamName) return '🏳️';
  const code = getCountryCode(teamName);
  return CODE_TO_FLAG[code] || '🏳️';
};

// Get flag color for team (primary color of their flag)
export const getFlagColor = (teamName) => {
  if (!teamName) return '#64748b';
  const colors = {
    'mexico': '#16a34a', 'usa': '#1e40af', 'canada': '#dc2626',
    'england': '#dc2626', 'france': '#1e40af', 'germany': '#000000', 'spain': '#dc2626',
    'portugal': '#dc2626', 'netherlands': '#ea580c', 'belgium': '#000000',
    'brazil': '#ca8a04', 'argentina': '#1e40af', 'uruguay': '#1e40af',
    'colombia': '#eab308', 'chile': '#3b82f6', 'ecuador': '#eab308',
    'paraguay': '#1e40af', 'peru': '#dc2626', 'morocco': '#dc2626',
    'senegal': '#16a34a', 'tunisia': '#dc2626', 'egypt': '#dc2626',
    'nigeria': '#16a34a', 'cameroon': '#16a34a', 'ghana': '#dc2626',
    'south africa': '#16a34a', 'algeria': '#16a34a', 'japan': '#dc2626',
    'south korea': '#dc2626', 'iran': '#dc2626', 'saudi arabia': '#16a34a',
    'australia': '#084594', 'qatar': '#8b0000', 'uzbekistan': '#1e40af',
    'jordan': '#dc2626', 'panama': '#dc2626', 'jamaica': '#eab308',
    'costa rica': '#1e40af', 'ukraine': '#1e40af', 'italy': '#003399',
    'croatia': '#dc2626', 'denmark': '#dc2626', 'switzerland': '#dc2626',
    'austria': '#dc2626', 'poland': '#dc2626', 'serbia': '#dc2626',
    'sweden': '#1e40af', 'norway': '#dc2626', 'scotland': '#1e40af',
    'czechia': '#dc2626', 'czech republic': '#dc2626', 'slovakia': '#dc2626',
    'hungary': '#dc2626', 'romania': '#1e40af', 'greece': '#1e40af',
    'turkey': '#dc2626', 'georgia': '#dc2626', 'slovenia': '#1e40af',
    'iraq': '#dc2626', 'indonesia': '#dc2626', 'vietnam': '#dc2626',
    'china': '#dc2626', 'china pr': '#dc2626',
    'cote d\'ivoire': '#ea580c', 'ivory coast': '#ea580c',
    'mali': '#16a34a', 'burkina faso': '#dc2626', 'guinea': '#dc2626',
    'cape verde': '#1e40af', 'dr congo': '#1e40af',
    'new zealand': '#000000',
  };
  return colors[teamName.toLowerCase().trim()] || '#64748b';
};