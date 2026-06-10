// Country code to flag emoji mapping (for 2-letter and special codes)
const CODE_FLAGS = {
  'MX': '🇲🇽', 'ZA': '🇿🇦', 'KR': '🇰🇷', 'CZ': '🇨🇿', 'CA': '🇨🇦',
  'BA': '🇧🇦', 'QA': '🇶🇦', 'CH': '🇨🇭', 'US': '🇺🇸', 'PY': '🇵🇾',
  'AU': '🇦🇺', 'BR': '🇧🇷', 'MA': '🇲🇦', 'HT': '🇭🇹', 'DE': '🇩🇪',
};

// Get country code from team name
export const getCountryCode = (teamName) => {
  if (!teamName) return '';
  const codes = {
    'mexico': 'MX', 'usa': 'US', 'united states': 'US', 'canada': 'CA',
    'england': 'EN', 'france': 'FR', 'germany': 'DE', 'spain': 'ES', 'portugal': 'PT',
    'netherlands': 'NL', 'belgium': 'BE', 'croatia': 'HR', 'switzerland': 'CH',
    'denmark': 'DK', 'serbia': 'RS', 'poland': 'PL', 'sweden': 'SE', 'wales': 'WA',
    'italy': 'IT', 'austria': 'AT', 'czechia': 'CZ', 'czech republic': 'CZ',
    'ukraine': 'UA', 'bosnia and herzegovina': 'BA', 'bosnia & herzegovina': 'BA',
    'brazil': 'BR', 'argentina': 'AR', 'uruguay': 'UY', 'colombia': 'CO', 'chile': 'CL',
    'ecuador': 'EC', 'paraguay': 'PY', 'peru': 'PE',
    'morocco': 'MA', 'senegal': 'SN', 'tunisia': 'TN', 'egypt': 'EG', 'nigeria': 'NG',
    'cameroon': 'CM', 'ghana': 'GH', 'south africa': 'ZA', 'algeria': 'DZ',
    'japan': 'JP', 'south korea': 'KR', 'korea republic': 'KR', 'iran': 'IR',
    'saudi arabia': 'SA', 'australia': 'AU', 'qatar': 'QA', 'uzbekistan': 'UZ',
    'jordan': 'JO', 'panama': 'PA', 'jamaica': 'JM', 'costa rica': 'CR',
  };
  return codes[teamName.toLowerCase().trim()] || teamName.substring(0, 2).toUpperCase();
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
    'south africa': '#16a34a', 'algeria': '#ffffff', 'japan': '#dc2626',
    'south korea': '#dc2626', 'iran': '#dc2626', 'saudi arabia': '#16a34a',
    'australia': '#084594', 'qatar': '#dc2626', 'uzbekistan': '#1e40af',
    'jordan': '#000000', 'panama': '#1e40af', 'jamaica': '#eab308',
    'costa rica': '#1e40af', 'ukraine': '#1e40af',
  };
  return colors[teamName.toLowerCase().trim()] || '#64748b';
};

// Get flag emoji for team
export const getTeamFlag = (teamName, countryCode) => {
  const code = getCountryCode(teamName || '');
  const emojiFlags = {
    'MX': '🇲🇽', 'ZA': '🇿🇦', 'KR': '🇰🇷', 'CZ': '🇨🇿', 'CA': '🇨🇦',
    'BA': '🇧🇦', 'QA': '🇶🇦', 'CH': '🇨🇭', 'US': '🇺🇸', 'PY': '🇵🇾',
    'AU': '🇦🇺', 'BR': '🇧🇷', 'MA': '🇲🇦', 'HT': '🇭🇹', 'DE': '🇩🇪',
    'FR': '🇫🇷', 'GB': '🇬🇧', 'EN': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'ES': '🇪🇸', 'PT': '🇵🇹',
    'NL': '🇳🇱', 'BE': '🇧🇪', 'HR': '🇭🇷', 'DK': '🇩🇰', 'RS': '🇷🇸',
    'PL': '🇵🇱', 'SE': '🇸🇪', 'WA': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'IT': '🇮🇹', 'AT': '🇦🇹',
    'UA': '🇺🇦', 'AR': '🇦🇷', 'UY': '🇺🇾', 'CO': '🇨🇴', 'CL': '🇨🇱',
    'EC': '🇪🇨', 'PE': '🇵🇪', 'SN': '🇸🇳', 'TN': '🇹🇳', 'EG': '🇪🇬',
    'NG': '🇳🇬', 'CM': '🇨🇲', 'GH': '🇬🇭', 'DZ': '🇩🇿', 'JP': '🇯🇵',
    'IR': '🇮🇷', 'SA': '🇸🇦', 'UZ': '🇺🇿', 'JO': '🇯🇴', 'PA': '🇵🇦',
    'JM': '🇯🇲', 'CR': '🇨🇷',
  };
  return emojiFlags[code] || '🏳️';
};