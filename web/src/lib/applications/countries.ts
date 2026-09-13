/**
 * Every country's dialling code, for the phone question on /apply.
 *
 * WHY THIS EXISTS: the old Google Form took a phone number as free text, and
 * an international student typing 03001234567 left a number nobody here could
 * ring. Asking for the country separately is the only way to end up with
 * something dialable without guessing at it afterwards.
 *
 * HOW IT WAS BUILT — not typed by hand, and not to be edited by hand:
 *
 *   1. Codes from mledoze/countries (dist/countries-unescaped.json), which
 *      gives each country an `idd` of { root, suffixes }. A single suffix is
 *      part of the code (GB = "+4" + "4"); many suffixes are area codes
 *      inside one code, so only the root counts — US and Canada are both "+1".
 *   2. Names from `Intl.DisplayNames(["en-GB"], { type: "region" })`, so the
 *      spellings are the British ones a Brighton student expects.
 *   3. Sorted by name.
 *
 * Two deliberate departures from the source data:
 *
 *   - Western Sahara is listed as +212. The dataset gives it two Moroccan
 *     AREA prefixes rather than a dialling code of its own; it is reached on
 *     Morocco's +212.
 *   - Antarctica and Heard & McDonald Islands are dropped: no dialling code
 *     in the source, having no permanent population.
 *
 * Spot-checked against 21 known codes (GB +44, IE +353, PK +92, IN +91,
 * BD +880, NG +234, SA +966, AE +971, EG +20, JM +1876, and others).
 */

/** [ISO 3166-1 alpha-2, dialling code, English name] — a tuple rather than an
 *  object because this whole list ships to the browser. */
type Row = readonly [cc: string, dial: string, name: string];

const ROWS: readonly Row[] = [
  ["AF", "+93", "Afghanistan"],
  ["AX", "+35818", "Åland Islands"],
  ["AL", "+355", "Albania"],
  ["DZ", "+213", "Algeria"],
  ["AS", "+1684", "American Samoa"],
  ["AD", "+376", "Andorra"],
  ["AO", "+244", "Angola"],
  ["AI", "+1264", "Anguilla"],
  ["AG", "+1268", "Antigua & Barbuda"],
  ["AR", "+54", "Argentina"],
  ["AM", "+374", "Armenia"],
  ["AW", "+297", "Aruba"],
  ["AU", "+61", "Australia"],
  ["AT", "+43", "Austria"],
  ["AZ", "+994", "Azerbaijan"],
  ["BS", "+1242", "Bahamas"],
  ["BH", "+973", "Bahrain"],
  ["BD", "+880", "Bangladesh"],
  ["BB", "+1246", "Barbados"],
  ["BY", "+375", "Belarus"],
  ["BE", "+32", "Belgium"],
  ["BZ", "+501", "Belize"],
  ["BJ", "+229", "Benin"],
  ["BM", "+1441", "Bermuda"],
  ["BT", "+975", "Bhutan"],
  ["BO", "+591", "Bolivia"],
  ["BA", "+387", "Bosnia & Herzegovina"],
  ["BW", "+267", "Botswana"],
  ["BV", "+47", "Bouvet Island"],
  ["BR", "+55", "Brazil"],
  ["IO", "+246", "British Indian Ocean Territory"],
  ["VG", "+1284", "British Virgin Islands"],
  ["BN", "+673", "Brunei"],
  ["BG", "+359", "Bulgaria"],
  ["BF", "+226", "Burkina Faso"],
  ["BI", "+257", "Burundi"],
  ["KH", "+855", "Cambodia"],
  ["CM", "+237", "Cameroon"],
  ["CA", "+1", "Canada"],
  ["CV", "+238", "Cape Verde"],
  ["BQ", "+599", "Caribbean Netherlands"],
  ["KY", "+1345", "Cayman Islands"],
  ["CF", "+236", "Central African Republic"],
  ["TD", "+235", "Chad"],
  ["CL", "+56", "Chile"],
  ["CN", "+86", "China"],
  ["CX", "+61", "Christmas Island"],
  ["CC", "+61", "Cocos (Keeling) Islands"],
  ["CO", "+57", "Colombia"],
  ["KM", "+269", "Comoros"],
  ["CG", "+242", "Congo - Brazzaville"],
  ["CD", "+243", "Congo - Kinshasa"],
  ["CK", "+682", "Cook Islands"],
  ["CR", "+506", "Costa Rica"],
  ["CI", "+225", "Côte d’Ivoire"],
  ["HR", "+385", "Croatia"],
  ["CU", "+53", "Cuba"],
  ["CW", "+599", "Curaçao"],
  ["CY", "+357", "Cyprus"],
  ["CZ", "+420", "Czechia"],
  ["DK", "+45", "Denmark"],
  ["DJ", "+253", "Djibouti"],
  ["DM", "+1767", "Dominica"],
  ["DO", "+1", "Dominican Republic"],
  ["EC", "+593", "Ecuador"],
  ["EG", "+20", "Egypt"],
  ["SV", "+503", "El Salvador"],
  ["GQ", "+240", "Equatorial Guinea"],
  ["ER", "+291", "Eritrea"],
  ["EE", "+372", "Estonia"],
  ["SZ", "+268", "Eswatini"],
  ["ET", "+251", "Ethiopia"],
  ["FK", "+500", "Falkland Islands"],
  ["FO", "+298", "Faroe Islands"],
  ["FJ", "+679", "Fiji"],
  ["FI", "+358", "Finland"],
  ["FR", "+33", "France"],
  ["GF", "+594", "French Guiana"],
  ["PF", "+689", "French Polynesia"],
  ["TF", "+262", "French Southern Territories"],
  ["GA", "+241", "Gabon"],
  ["GM", "+220", "Gambia"],
  ["GE", "+995", "Georgia"],
  ["DE", "+49", "Germany"],
  ["GH", "+233", "Ghana"],
  ["GI", "+350", "Gibraltar"],
  ["GR", "+30", "Greece"],
  ["GL", "+299", "Greenland"],
  ["GD", "+1473", "Grenada"],
  ["GP", "+590", "Guadeloupe"],
  ["GU", "+1671", "Guam"],
  ["GT", "+502", "Guatemala"],
  ["GG", "+44", "Guernsey"],
  ["GN", "+224", "Guinea"],
  ["GW", "+245", "Guinea-Bissau"],
  ["GY", "+592", "Guyana"],
  ["HT", "+509", "Haiti"],
  ["HN", "+504", "Honduras"],
  ["HK", "+852", "Hong Kong SAR China"],
  ["HU", "+36", "Hungary"],
  ["IS", "+354", "Iceland"],
  ["IN", "+91", "India"],
  ["ID", "+62", "Indonesia"],
  ["IR", "+98", "Iran"],
  ["IQ", "+964", "Iraq"],
  ["IE", "+353", "Ireland"],
  ["IM", "+44", "Isle of Man"],
  ["IL", "+972", "Israel"],
  ["IT", "+39", "Italy"],
  ["JM", "+1876", "Jamaica"],
  ["JP", "+81", "Japan"],
  ["JE", "+44", "Jersey"],
  ["JO", "+962", "Jordan"],
  ["KZ", "+7", "Kazakhstan"],
  ["KE", "+254", "Kenya"],
  ["KI", "+686", "Kiribati"],
  ["XK", "+383", "Kosovo"],
  ["KW", "+965", "Kuwait"],
  ["KG", "+996", "Kyrgyzstan"],
  ["LA", "+856", "Laos"],
  ["LV", "+371", "Latvia"],
  ["LB", "+961", "Lebanon"],
  ["LS", "+266", "Lesotho"],
  ["LR", "+231", "Liberia"],
  ["LY", "+218", "Libya"],
  ["LI", "+423", "Liechtenstein"],
  ["LT", "+370", "Lithuania"],
  ["LU", "+352", "Luxembourg"],
  ["MO", "+853", "Macao SAR China"],
  ["MG", "+261", "Madagascar"],
  ["MW", "+265", "Malawi"],
  ["MY", "+60", "Malaysia"],
  ["MV", "+960", "Maldives"],
  ["ML", "+223", "Mali"],
  ["MT", "+356", "Malta"],
  ["MH", "+692", "Marshall Islands"],
  ["MQ", "+596", "Martinique"],
  ["MR", "+222", "Mauritania"],
  ["MU", "+230", "Mauritius"],
  ["YT", "+262", "Mayotte"],
  ["MX", "+52", "Mexico"],
  ["FM", "+691", "Micronesia"],
  ["MD", "+373", "Moldova"],
  ["MC", "+377", "Monaco"],
  ["MN", "+976", "Mongolia"],
  ["ME", "+382", "Montenegro"],
  ["MS", "+1664", "Montserrat"],
  ["MA", "+212", "Morocco"],
  ["MZ", "+258", "Mozambique"],
  ["MM", "+95", "Myanmar (Burma)"],
  ["NA", "+264", "Namibia"],
  ["NR", "+674", "Nauru"],
  ["NP", "+977", "Nepal"],
  ["NL", "+31", "Netherlands"],
  ["NC", "+687", "New Caledonia"],
  ["NZ", "+64", "New Zealand"],
  ["NI", "+505", "Nicaragua"],
  ["NE", "+227", "Niger"],
  ["NG", "+234", "Nigeria"],
  ["NU", "+683", "Niue"],
  ["NF", "+672", "Norfolk Island"],
  ["KP", "+850", "North Korea"],
  ["MK", "+389", "North Macedonia"],
  ["MP", "+1670", "Northern Mariana Islands"],
  ["NO", "+47", "Norway"],
  ["OM", "+968", "Oman"],
  ["PK", "+92", "Pakistan"],
  ["PW", "+680", "Palau"],
  ["PS", "+970", "Palestinian Territories"],
  ["PA", "+507", "Panama"],
  ["PG", "+675", "Papua New Guinea"],
  ["PY", "+595", "Paraguay"],
  ["PE", "+51", "Peru"],
  ["PH", "+63", "Philippines"],
  ["PN", "+64", "Pitcairn Islands"],
  ["PL", "+48", "Poland"],
  ["PT", "+351", "Portugal"],
  ["PR", "+1", "Puerto Rico"],
  ["QA", "+974", "Qatar"],
  ["RE", "+262", "Réunion"],
  ["RO", "+40", "Romania"],
  ["RU", "+7", "Russia"],
  ["RW", "+250", "Rwanda"],
  ["WS", "+685", "Samoa"],
  ["SM", "+378", "San Marino"],
  ["ST", "+239", "São Tomé & Príncipe"],
  ["SA", "+966", "Saudi Arabia"],
  ["SN", "+221", "Senegal"],
  ["RS", "+381", "Serbia"],
  ["SC", "+248", "Seychelles"],
  ["SL", "+232", "Sierra Leone"],
  ["SG", "+65", "Singapore"],
  ["SX", "+1721", "Sint Maarten"],
  ["SK", "+421", "Slovakia"],
  ["SI", "+386", "Slovenia"],
  ["SB", "+677", "Solomon Islands"],
  ["SO", "+252", "Somalia"],
  ["ZA", "+27", "South Africa"],
  ["GS", "+500", "South Georgia & South Sandwich Islands"],
  ["KR", "+82", "South Korea"],
  ["SS", "+211", "South Sudan"],
  ["ES", "+34", "Spain"],
  ["LK", "+94", "Sri Lanka"],
  ["BL", "+590", "St Barthélemy"],
  ["SH", "+2", "St Helena"],
  ["KN", "+1869", "St Kitts & Nevis"],
  ["LC", "+1758", "St Lucia"],
  ["MF", "+590", "St Martin"],
  ["PM", "+508", "St Pierre & Miquelon"],
  ["VC", "+1784", "St Vincent & the Grenadines"],
  ["SD", "+249", "Sudan"],
  ["SR", "+597", "Suriname"],
  ["SJ", "+4779", "Svalbard & Jan Mayen"],
  ["SE", "+46", "Sweden"],
  ["CH", "+41", "Switzerland"],
  ["SY", "+963", "Syria"],
  ["TW", "+886", "Taiwan"],
  ["TJ", "+992", "Tajikistan"],
  ["TZ", "+255", "Tanzania"],
  ["TH", "+66", "Thailand"],
  ["TL", "+670", "Timor-Leste"],
  ["TG", "+228", "Togo"],
  ["TK", "+690", "Tokelau"],
  ["TO", "+676", "Tonga"],
  ["TT", "+1868", "Trinidad & Tobago"],
  ["TN", "+216", "Tunisia"],
  ["TR", "+90", "Türkiye"],
  ["TM", "+993", "Turkmenistan"],
  ["TC", "+1649", "Turks & Caicos Islands"],
  ["TV", "+688", "Tuvalu"],
  ["UG", "+256", "Uganda"],
  ["UA", "+380", "Ukraine"],
  ["AE", "+971", "United Arab Emirates"],
  ["GB", "+44", "United Kingdom"],
  ["US", "+1", "United States"],
  ["UY", "+598", "Uruguay"],
  ["UM", "+268", "US Outlying Islands"],
  ["VI", "+1340", "US Virgin Islands"],
  ["UZ", "+998", "Uzbekistan"],
  ["VU", "+678", "Vanuatu"],
  ["VA", "+3", "Vatican City"],
  ["VE", "+58", "Venezuela"],
  ["VN", "+84", "Vietnam"],
  ["WF", "+681", "Wallis & Futuna"],
  ["EH", "+212", "Western Sahara"],
  ["YE", "+967", "Yemen"],
  ["ZM", "+260", "Zambia"],
  ["ZW", "+263", "Zimbabwe"],
];

export type Country = {
  /** ISO 3166-1 alpha-2. This is what travels to the server and gets checked. */
  cc: string;
  /** With the leading +. */
  dial: string;
  name: string;
  /** The flag, as an emoji. */
  flag: string;
};

/**
 * The flag as a pair of Unicode REGIONAL INDICATOR symbols — "GB" becomes the
 * UK flag — rather than 248 image files. It costs nothing to ship and it
 * scales with the surrounding text.
 *
 * The known limitation, accepted: Windows ships no flag glyphs, so a desktop
 * Windows browser draws the two letters instead. That is why the dialling
 * code and the country name always sit beside it rather than the flag being
 * the only label — on Windows the row still reads correctly, just plainer.
 * Nearly all of these are filled in on a phone, where flags render.
 */
export function flagFor(cc: string): string {
  return String.fromCodePoint(
    ...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

export const COUNTRIES: readonly Country[] = ROWS.map(([cc, dial, name]) => ({
  cc, dial, name, flag: flagFor(cc),
}));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.cc, c]));

export function countryByCode(cc: string): Country | undefined {
  return BY_CODE.get(cc.toUpperCase());
}

/** Brighton, Sussex and BSMS — nearly everyone filling this in is on a UK
 *  number, so the picker opens on one and most people never touch it. */
export const DEFAULT_COUNTRY = "GB";
