/* Condomínios e apartamentos oficiais. */
(function (root) {
  const apartments = {
  "Be Urban": [
    "214",
    "904",
    "1010",
    "1302",
    "1408",
    "1410"
  ],
  "Conde Luciano": [
    "12"
  ],
  "Embaré": [
    "904",
    "1006"
  ],
  "Helbor Stay": [
    "2304"
  ],
  "Housi": [
    "62",
    "64",
    "91",
    "101",
    "104",
    "133"
  ],
  "Houx": [
    "2111"
  ],
  "Ipanema": [
    "82"
  ],
  "Lume Alto da Boa Vista": [
    "194A",
    "211A",
    "263A"
  ],
  "Maralta": [
    "111"
  ],
  "Marco Aurelio": [
    "410",
    "906"
  ],
  "Nexone": [
    "1609",
    "1709",
    "1908",
    "1910"
  ],
  "Type": [
    "54",
    "131",
    "139",
    "163",
    "179",
    "201",
    "202",
    "203",
    "204"
  ],
  "Unique Residence": [
    "506",
    "603",
    "605",
    "610",
    "706",
    "708",
    "710",
    "809",
    "810",
    "904",
    "905",
    "1001",
    "1002",
    "1007",
    "1101",
    "1109",
    "1201",
    "1206",
    "1209",
    "1307",
    "1309",
    "1403",
    "1407",
    "1601",
    "1603",
    "1604",
    "1608",
    "1701",
    "1704",
    "1806",
    "1810",
    "1901",
    "1908",
    "2010",
    "2110",
    "2203",
    "2208",
    "2304",
    "2310",
    "2603",
    "2702",
    "2703"
  ],
  "Universo Palace": [
    "604",
    "614"
  ],
  "Unlimited": [
    "618",
    "716",
    "817",
    "901",
    "902",
    "905",
    "909",
    "911",
    "919",
    "1012",
    "1106",
    "1111",
    "1112",
    "1312",
    "1317",
    "1412",
    "1413",
    "1419",
    "1518",
    "1608",
    "1611",
    "1709",
    "1711",
    "1809",
    "1910",
    "2012",
    "2013",
    "2109",
    "2111",
    "2112",
    "2506",
    "2605",
    "2611",
    "2810",
    "3006",
    "3010",
    "3103",
    "3111",
    "3202",
    "3403",
    "3411",
    "3412",
    "3710"
  ],
  "VN Melo": [
    "1208"
  ],
  "Xangô": [
    "103"
  ]
};
  const hotels = Object.keys(apartments).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  const filePath = value => typeof value === 'string' && /^[a-f0-9-]{36}\/[^/]+\/[a-f0-9-]{36}$/.test(value) && [...hotels, 'Unique'].includes(value.split('/')[1]);
  const catalog = { apartments, hotels, filePath };
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.BookCatalog = catalog;
})(typeof window === 'object' ? window : globalThis);
