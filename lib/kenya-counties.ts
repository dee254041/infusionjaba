/** Official counties plus place names staff type into the distributor region or address. */
const KENYA_COUNTY_MATCHERS: Array<{ name: string; aliases: string[] }> = [
  { name: 'Mombasa', aliases: ['mombasa', 'nyali', 'likoni', 'bamburi', 'changamwe', 'kisauni'] },
  { name: 'Kwale', aliases: ['kwale', 'ukunda', 'diani', 'msambweni'] },
  { name: 'Kilifi', aliases: ['kilifi', 'malindi', 'watamu', 'mtwapa'] },
  { name: 'Tana River', aliases: ['tana river', 'hola', 'garsen'] },
  { name: 'Lamu', aliases: ['lamu'] },
  { name: 'Taita-Taveta', aliases: ['taita taveta', 'taita', 'taveta', 'voi'] },
  { name: 'Garissa', aliases: ['garissa'] },
  { name: 'Wajir', aliases: ['wajir'] },
  { name: 'Mandera', aliases: ['mandera'] },
  { name: 'Marsabit', aliases: ['marsabit', 'moyale'] },
  { name: 'Isiolo', aliases: ['isiolo'] },
  { name: 'Meru', aliases: ['meru', 'maua'] },
  { name: 'Tharaka-Nithi', aliases: ['tharaka nithi', 'tharaka', 'chuka', 'kathwana'] },
  { name: 'Embu', aliases: ['embu'] },
  { name: 'Kitui', aliases: ['kitui'] },
  { name: 'Machakos', aliases: ['machakos', 'athi river', 'mlolongo', 'syokimau'] },
  { name: 'Makueni', aliases: ['makueni', 'wote', 'mtito andei'] },
  {
    name: 'Nyandarua',
    aliases: ['nyandarua', 'ol kalou'],
  },
  { name: 'Nyeri', aliases: ['nyeri', 'karatina', 'othaya'] },
  { name: 'Kirinyaga', aliases: ['kirinyaga', 'kerugoya', 'kutus'] },
  { name: "Murang'a", aliases: ['muranga', 'murang a', 'kenol'] },
  {
    name: 'Kiambu',
    aliases: ['kiambu', 'ruiru', 'thika', 'juja', 'kikuyu', 'limuru', 'kabete', 'githunguri', 'kiambu road'],
  },
  { name: 'Turkana', aliases: ['turkana', 'lodwar'] },
  { name: 'West Pokot', aliases: ['west pokot', 'kapenguria'] },
  { name: 'Samburu', aliases: ['samburu', 'maralal'] },
  { name: 'Trans Nzoia', aliases: ['trans nzoia', 'kitale'] },
  { name: 'Uasin Gishu', aliases: ['uasin gishu', 'eldoret'] },
  { name: 'Elgeyo-Marakwet', aliases: ['elgeyo marakwet', 'elgeyo', 'marakwet', 'iten'] },
  { name: 'Nandi', aliases: ['nandi', 'kapsabet'] },
  { name: 'Baringo', aliases: ['baringo', 'kabarnet'] },
  { name: 'Laikipia', aliases: ['laikipia', 'nanyuki', 'nyahururu'] },
  { name: 'Nakuru', aliases: ['nakuru', 'naivasha', 'gilgil', 'molo'] },
  { name: 'Narok', aliases: ['narok'] },
  {
    name: 'Kajiado',
    aliases: ['kajiado', 'kitengela', 'ngong', 'ongata rongai', 'rongai', 'kiserian', 'isinya'],
  },
  { name: 'Kericho', aliases: ['kericho', 'litein'] },
  { name: 'Bomet', aliases: ['bomet', 'sotik'] },
  { name: 'Kakamega', aliases: ['kakamega', 'mumias'] },
  { name: 'Vihiga', aliases: ['vihiga', 'mbale'] },
  { name: 'Bungoma', aliases: ['bungoma', 'webuye', 'kimilili'] },
  { name: 'Busia', aliases: ['busia'] },
  { name: 'Siaya', aliases: ['siaya', 'bondo'] },
  { name: 'Kisumu', aliases: ['kisumu'] },
  { name: 'Homa Bay', aliases: ['homa bay', 'homabay'] },
  { name: 'Migori', aliases: ['migori', 'awendo'] },
  { name: 'Kisii', aliases: ['kisii'] },
  { name: 'Nyamira', aliases: ['nyamira'] },
  {
    name: 'Nairobi',
    aliases: [
      'nairobi',
      'nrb',
      'westlands',
      'kilimani',
      'karen',
      'langata',
      'lavington',
      'kileleshwa',
      'parklands',
      'gigiri',
      'runda',
      'muthaiga',
      'village market',
      'eastleigh',
      'kasarani',
      'mirema',
      'roysambu',
      'zimmerman',
      'kahawa',
      'pipeline',
      'embakasi',
      'donholm',
      'buruburu',
      'umoja',
      'kayole',
      'komarock',
      'south b',
      'south c',
      'industrial area',
      'cbd',
      'ngong road',
      'kingara',
      'kawangware',
      'kangemi',
      'dagoretti',
      'kibera',
      'mathare',
      'hurlingham',
      'upperhill',
      'upper hill',
      'ngara',
      'pangani',
      'githurai',
      'ruaraka',
      'baba dogo',
      'lucky summer',
      'garden city',
      'two rivers',
    ],
  },
]

function normalizePlace(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const EMPTY_PLACE = new Set(['', 'no region', 'n a', 'na', 'none', 'unknown', 'nairobi n a'])

/** Longest matching place name wins, so "West Pokot" is not read as a shorter alias. */
export function resolveKenyaCounty(...parts: Array<string | null | undefined>): string | null {
  const hay = normalizePlace(parts.filter((part) => part && String(part).trim()).join(' '))
  if (EMPTY_PLACE.has(hay)) return null

  let best: { name: string; length: number } | null = null
  for (const county of KENYA_COUNTY_MATCHERS) {
    for (const alias of county.aliases) {
      const needle = normalizePlace(alias)
      if (!needle) continue
      const pattern = new RegExp(`(?:^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`)
      if (pattern.test(hay) && (!best || needle.length > best.length)) {
        best = { name: county.name, length: needle.length }
      }
    }
  }
  return best?.name ?? null
}
