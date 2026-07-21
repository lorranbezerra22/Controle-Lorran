// Curated IATA airport dataset — principais aeroportos do Brasil + hubs mundiais.
// Adicione novos com PR. Coordenadas em graus decimais (lat, lng).

export type Airport = {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
};

export const AIRPORTS: Airport[] = [
  // ---------- BRASIL ----------
  { iata: "GRU", name: "Guarulhos Intl.", city: "São Paulo", country: "BR", lat: -23.4356, lng: -46.4731 },
  { iata: "CGH", name: "Congonhas", city: "São Paulo", country: "BR", lat: -23.6266, lng: -46.6553 },
  { iata: "VCP", name: "Viracopos", city: "Campinas", country: "BR", lat: -23.0074, lng: -47.1345 },
  { iata: "GIG", name: "Galeão", city: "Rio de Janeiro", country: "BR", lat: -22.8099, lng: -43.2506 },
  { iata: "SDU", name: "Santos Dumont", city: "Rio de Janeiro", country: "BR", lat: -22.9105, lng: -43.1631 },
  { iata: "BSB", name: "Juscelino Kubitschek", city: "Brasília", country: "BR", lat: -15.8697, lng: -47.9208 },
  { iata: "CNF", name: "Confins", city: "Belo Horizonte", country: "BR", lat: -19.6244, lng: -43.9719 },
  { iata: "PLU", name: "Pampulha", city: "Belo Horizonte", country: "BR", lat: -19.8512, lng: -43.9506 },
  { iata: "CWB", name: "Afonso Pena", city: "Curitiba", country: "BR", lat: -25.5285, lng: -49.1758 },
  { iata: "POA", name: "Salgado Filho", city: "Porto Alegre", country: "BR", lat: -29.9944, lng: -51.1714 },
  { iata: "FLN", name: "Hercílio Luz", city: "Florianópolis", country: "BR", lat: -27.6704, lng: -48.5525 },
  { iata: "NVT", name: "Navegantes", city: "Navegantes", country: "BR", lat: -26.8801, lng: -48.6514 },
  { iata: "IGU", name: "Foz do Iguaçu", city: "Foz do Iguaçu", country: "BR", lat: -25.6003, lng: -54.4850 },
  { iata: "SSA", name: "Salvador (Dep. Luís E. Magalhães)", city: "Salvador", country: "BR", lat: -12.9086, lng: -38.3225 },
  { iata: "REC", name: "Guararapes", city: "Recife", country: "BR", lat: -8.1264, lng: -34.9236 },
  { iata: "FOR", name: "Pinto Martins", city: "Fortaleza", country: "BR", lat: -3.7763, lng: -38.5326 },
  { iata: "NAT", name: "Aluízio Alves", city: "Natal", country: "BR", lat: -5.7681, lng: -35.3766 },
  { iata: "MCZ", name: "Zumbi dos Palmares", city: "Maceió", country: "BR", lat: -9.5108, lng: -35.7917 },
  { iata: "AJU", name: "Santa Maria", city: "Aracaju", country: "BR", lat: -10.9840, lng: -37.0703 },
  { iata: "JPA", name: "Castro Pinto", city: "João Pessoa", country: "BR", lat: -7.1459, lng: -34.9486 },
  { iata: "THE", name: "Teresina", city: "Teresina", country: "BR", lat: -5.0597, lng: -42.8236 },
  { iata: "SLZ", name: "Marechal Cunha Machado", city: "São Luís", country: "BR", lat: -2.5853, lng: -44.2341 },
  { iata: "BEL", name: "Val de Cans", city: "Belém", country: "BR", lat: -1.3792, lng: -48.4763 },
  { iata: "MAO", name: "Eduardo Gomes", city: "Manaus", country: "BR", lat: -3.0386, lng: -60.0497 },
  { iata: "PVH", name: "Jorge Teixeira", city: "Porto Velho", country: "BR", lat: -8.7093, lng: -63.9023 },
  { iata: "RBR", name: "Rio Branco", city: "Rio Branco", country: "BR", lat: -9.8688, lng: -67.8940 },
  { iata: "BVB", name: "Boa Vista", city: "Boa Vista", country: "BR", lat: 2.8461, lng: -60.6902 },
  { iata: "MCP", name: "Macapá", city: "Macapá", country: "BR", lat: 0.0506, lng: -51.0722 },
  { iata: "CGB", name: "Marechal Rondon", city: "Cuiabá", country: "BR", lat: -15.6529, lng: -56.1167 },
  { iata: "CGR", name: "Campo Grande", city: "Campo Grande", country: "BR", lat: -20.4687, lng: -54.6725 },
  { iata: "GYN", name: "Santa Genoveva", city: "Goiânia", country: "BR", lat: -16.6320, lng: -49.2207 },
  { iata: "PMW", name: "Palmas", city: "Palmas", country: "BR", lat: -10.2915, lng: -48.3570 },
  { iata: "VIX", name: "Eurico de Aguiar Salles", city: "Vitória", country: "BR", lat: -20.2581, lng: -40.2864 },
  { iata: "UDI", name: "Uberlândia", city: "Uberlândia", country: "BR", lat: -18.8828, lng: -48.2256 },
  { iata: "RAO", name: "Leite Lopes", city: "Ribeirão Preto", country: "BR", lat: -21.1341, lng: -47.7742 },
  { iata: "SJP", name: "São José do Rio Preto", city: "São José do Rio Preto", country: "BR", lat: -20.8166, lng: -49.4065 },
  { iata: "LDB", name: "Londrina", city: "Londrina", country: "BR", lat: -23.3335, lng: -51.1301 },
  { iata: "MGF", name: "Maringá", city: "Maringá", country: "BR", lat: -23.4794, lng: -52.0161 },
  { iata: "JOI", name: "Joinville", city: "Joinville", country: "BR", lat: -26.2245, lng: -48.7973 },
  { iata: "XAP", name: "Chapecó", city: "Chapecó", country: "BR", lat: -27.1341, lng: -52.6566 },
  { iata: "CXJ", name: "Caxias do Sul", city: "Caxias do Sul", country: "BR", lat: -29.1971, lng: -51.1875 },
  { iata: "PET", name: "Pelotas", city: "Pelotas", country: "BR", lat: -31.7183, lng: -52.3277 },
  { iata: "IOS", name: "Ilhéus", city: "Ilhéus", country: "BR", lat: -14.8160, lng: -39.0333 },
  { iata: "BPS", name: "Porto Seguro", city: "Porto Seguro", country: "BR", lat: -16.4386, lng: -39.0808 },

  // ---------- AMÉRICAS ----------
  { iata: "EZE", name: "Ministro Pistarini", city: "Buenos Aires", country: "AR", lat: -34.8222, lng: -58.5358 },
  { iata: "AEP", name: "Aeroparque J. Newbery", city: "Buenos Aires", country: "AR", lat: -34.5592, lng: -58.4156 },
  { iata: "SCL", name: "Arturo Merino Benítez", city: "Santiago", country: "CL", lat: -33.3898, lng: -70.7944 },
  { iata: "LIM", name: "Jorge Chávez", city: "Lima", country: "PE", lat: -12.0219, lng: -77.1143 },
  { iata: "BOG", name: "El Dorado", city: "Bogotá", country: "CO", lat: 4.7016, lng: -74.1469 },
  { iata: "UIO", name: "Mariscal Sucre", city: "Quito", country: "EC", lat: -0.1292, lng: -78.3575 },
  { iata: "MVD", name: "Carrasco", city: "Montevidéu", country: "UY", lat: -34.8384, lng: -56.0308 },
  { iata: "ASU", name: "Silvio Pettirossi", city: "Assunção", country: "PY", lat: -25.2400, lng: -57.5200 },
  { iata: "CCS", name: "Simón Bolívar", city: "Caracas", country: "VE", lat: 10.6031, lng: -66.9906 },
  { iata: "PTY", name: "Tocumen", city: "Cidade do Panamá", country: "PA", lat: 9.0714, lng: -79.3835 },
  { iata: "MEX", name: "Benito Juárez", city: "Cidade do México", country: "MX", lat: 19.4363, lng: -99.0721 },
  { iata: "CUN", name: "Cancún", city: "Cancún", country: "MX", lat: 21.0365, lng: -86.8770 },
  { iata: "MIA", name: "Miami Intl.", city: "Miami", country: "US", lat: 25.7959, lng: -80.2870 },
  { iata: "MCO", name: "Orlando Intl.", city: "Orlando", country: "US", lat: 28.4312, lng: -81.3081 },
  { iata: "FLL", name: "Fort Lauderdale", city: "Fort Lauderdale", country: "US", lat: 26.0742, lng: -80.1506 },
  { iata: "JFK", name: "John F. Kennedy", city: "Nova York", country: "US", lat: 40.6413, lng: -73.7781 },
  { iata: "EWR", name: "Newark", city: "Newark", country: "US", lat: 40.6895, lng: -74.1745 },
  { iata: "LGA", name: "LaGuardia", city: "Nova York", country: "US", lat: 40.7769, lng: -73.8740 },
  { iata: "BOS", name: "Logan Intl.", city: "Boston", country: "US", lat: 42.3656, lng: -71.0096 },
  { iata: "IAD", name: "Dulles", city: "Washington", country: "US", lat: 38.9531, lng: -77.4565 },
  { iata: "ATL", name: "Hartsfield–Jackson", city: "Atlanta", country: "US", lat: 33.6407, lng: -84.4277 },
  { iata: "ORD", name: "O'Hare", city: "Chicago", country: "US", lat: 41.9742, lng: -87.9073 },
  { iata: "DFW", name: "Dallas/Fort Worth", city: "Dallas", country: "US", lat: 32.8998, lng: -97.0403 },
  { iata: "IAH", name: "George Bush Intercontinental", city: "Houston", country: "US", lat: 29.9902, lng: -95.3368 },
  { iata: "LAX", name: "Los Angeles Intl.", city: "Los Angeles", country: "US", lat: 33.9416, lng: -118.4085 },
  { iata: "SFO", name: "San Francisco Intl.", city: "São Francisco", country: "US", lat: 37.6213, lng: -122.3790 },
  { iata: "LAS", name: "Harry Reid", city: "Las Vegas", country: "US", lat: 36.0840, lng: -115.1537 },
  { iata: "SEA", name: "Seattle-Tacoma", city: "Seattle", country: "US", lat: 47.4502, lng: -122.3088 },
  { iata: "YYZ", name: "Toronto Pearson", city: "Toronto", country: "CA", lat: 43.6777, lng: -79.6248 },
  { iata: "YUL", name: "Montréal-Trudeau", city: "Montreal", country: "CA", lat: 45.4706, lng: -73.7408 },
  { iata: "YVR", name: "Vancouver Intl.", city: "Vancouver", country: "CA", lat: 49.1967, lng: -123.1815 },

  // ---------- EUROPA ----------
  { iata: "LIS", name: "Humberto Delgado", city: "Lisboa", country: "PT", lat: 38.7742, lng: -9.1342 },
  { iata: "OPO", name: "Francisco Sá Carneiro", city: "Porto", country: "PT", lat: 41.2481, lng: -8.6814 },
  { iata: "MAD", name: "Adolfo Suárez", city: "Madri", country: "ES", lat: 40.4936, lng: -3.5668 },
  { iata: "BCN", name: "El Prat", city: "Barcelona", country: "ES", lat: 41.2974, lng: 2.0833 },
  { iata: "CDG", name: "Charles de Gaulle", city: "Paris", country: "FR", lat: 49.0097, lng: 2.5479 },
  { iata: "ORY", name: "Orly", city: "Paris", country: "FR", lat: 48.7262, lng: 2.3652 },
  { iata: "AMS", name: "Schiphol", city: "Amsterdã", country: "NL", lat: 52.3105, lng: 4.7683 },
  { iata: "LHR", name: "Heathrow", city: "Londres", country: "GB", lat: 51.4700, lng: -0.4543 },
  { iata: "LGW", name: "Gatwick", city: "Londres", country: "GB", lat: 51.1537, lng: -0.1821 },
  { iata: "FRA", name: "Frankfurt", city: "Frankfurt", country: "DE", lat: 50.0379, lng: 8.5622 },
  { iata: "MUC", name: "Munique", city: "Munique", country: "DE", lat: 48.3538, lng: 11.7861 },
  { iata: "ZRH", name: "Zurique", city: "Zurique", country: "CH", lat: 47.4647, lng: 8.5492 },
  { iata: "FCO", name: "Fiumicino", city: "Roma", country: "IT", lat: 41.8003, lng: 12.2389 },
  { iata: "MXP", name: "Malpensa", city: "Milão", country: "IT", lat: 45.6306, lng: 8.7281 },
  { iata: "IST", name: "Istambul", city: "Istambul", country: "TR", lat: 41.2753, lng: 28.7519 },
  { iata: "ATH", name: "Atenas", city: "Atenas", country: "GR", lat: 37.9364, lng: 23.9445 },
  { iata: "DUB", name: "Dublin", city: "Dublin", country: "IE", lat: 53.4213, lng: -6.2701 },
  { iata: "CPH", name: "Copenhague", city: "Copenhague", country: "DK", lat: 55.6180, lng: 12.6560 },
  { iata: "ARN", name: "Arlanda", city: "Estocolmo", country: "SE", lat: 59.6519, lng: 17.9186 },

  // ---------- ÁSIA / OCEANIA / ÁFRICA ----------
  { iata: "DXB", name: "Dubai Intl.", city: "Dubai", country: "AE", lat: 25.2532, lng: 55.3657 },
  { iata: "AUH", name: "Abu Dhabi", city: "Abu Dhabi", country: "AE", lat: 24.4330, lng: 54.6511 },
  { iata: "DOH", name: "Hamad Intl.", city: "Doha", country: "QA", lat: 25.2611, lng: 51.5651 },
  { iata: "HND", name: "Haneda", city: "Tóquio", country: "JP", lat: 35.5494, lng: 139.7798 },
  { iata: "NRT", name: "Narita", city: "Tóquio", country: "JP", lat: 35.7720, lng: 140.3929 },
  { iata: "ICN", name: "Incheon", city: "Seul", country: "KR", lat: 37.4602, lng: 126.4407 },
  { iata: "PEK", name: "Pequim Capital", city: "Pequim", country: "CN", lat: 40.0801, lng: 116.5846 },
  { iata: "PVG", name: "Pudong", city: "Xangai", country: "CN", lat: 31.1443, lng: 121.8083 },
  { iata: "HKG", name: "Hong Kong", city: "Hong Kong", country: "HK", lat: 22.3080, lng: 113.9185 },
  { iata: "SIN", name: "Changi", city: "Singapura", country: "SG", lat: 1.3644, lng: 103.9915 },
  { iata: "BKK", name: "Suvarnabhumi", city: "Bangkok", country: "TH", lat: 13.6900, lng: 100.7501 },
  { iata: "DEL", name: "Indira Gandhi", city: "Nova Deli", country: "IN", lat: 28.5562, lng: 77.1000 },
  { iata: "BOM", name: "Chhatrapati Shivaji", city: "Mumbai", country: "IN", lat: 19.0896, lng: 72.8656 },
  { iata: "SYD", name: "Kingsford Smith", city: "Sydney", country: "AU", lat: -33.9399, lng: 151.1753 },
  { iata: "MEL", name: "Tullamarine", city: "Melbourne", country: "AU", lat: -37.6690, lng: 144.8410 },
  { iata: "AKL", name: "Auckland", city: "Auckland", country: "NZ", lat: -37.0082, lng: 174.7850 },
  { iata: "JNB", name: "O. R. Tambo", city: "Joanesburgo", country: "ZA", lat: -26.1367, lng: 28.2411 },
  { iata: "CPT", name: "Cape Town", city: "Cidade do Cabo", country: "ZA", lat: -33.9648, lng: 18.6017 },
  { iata: "CAI", name: "Cairo", city: "Cairo", country: "EG", lat: 30.1114, lng: 31.4139 },
];

const IATA_INDEX: Record<string, Airport> = Object.fromEntries(AIRPORTS.map((a) => [a.iata, a]));

export const findAirport = (iata: string): Airport | undefined =>
  iata ? IATA_INDEX[iata.trim().toUpperCase()] : undefined;

export const searchAirports = (q: string, limit = 8): Airport[] => {
  const s = q.trim().toUpperCase();
  if (!s) return [];
  return AIRPORTS.filter(
    (a) =>
      a.iata.startsWith(s) ||
      a.city.toUpperCase().includes(s) ||
      a.name.toUpperCase().includes(s)
  ).slice(0, limit);
};
