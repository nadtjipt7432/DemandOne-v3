/**
 * A bounded, hand-authored country → state/region → city tree for the location
 * picker (login.tsx, account.tsx). Not a real geocoding dataset — covers enough
 * ground for a convincing demo (a handful of countries, their major
 * states/provinces/regions, a few cities each) without pretending to be exhaustive.
 */

export interface LocationCountry {
  country: string;
  regionLabel: string; // "State" / "Province" / "Region" — what to call the middle picker
  regions: { region: string; abbrev?: string; cities: string[] }[];
}

export const LOCATIONS: LocationCountry[] = [
  {
    country: 'United States',
    regionLabel: 'State',
    regions: [
      { region: 'Florida', abbrev: 'FL', cities: ['Miami', 'Orlando', 'Tampa', 'Jacksonville'] },
      { region: 'New York', abbrev: 'NY', cities: ['New York City', 'Brooklyn', 'Buffalo', 'Albany'] },
      { region: 'California', abbrev: 'CA', cities: ['San Francisco', 'Los Angeles', 'San Diego', 'Oakland'] },
      { region: 'Texas', abbrev: 'TX', cities: ['Austin', 'Houston', 'Dallas', 'San Antonio'] },
      { region: 'Illinois', abbrev: 'IL', cities: ['Chicago', 'Evanston', 'Naperville'] },
      { region: 'Massachusetts', abbrev: 'MA', cities: ['Boston', 'Cambridge', 'Worcester'] },
      { region: 'Washington', abbrev: 'WA', cities: ['Seattle', 'Bellevue', 'Spokane'] },
      { region: 'Georgia', abbrev: 'GA', cities: ['Atlanta', 'Savannah', 'Athens'] },
      { region: 'Colorado', abbrev: 'CO', cities: ['Denver', 'Boulder', 'Colorado Springs'] },
      { region: 'North Carolina', abbrev: 'NC', cities: ['Charlotte', 'Raleigh', 'Durham'] },
      { region: 'Pennsylvania', abbrev: 'PA', cities: ['Philadelphia', 'Pittsburgh'] },
      { region: 'Arizona', abbrev: 'AZ', cities: ['Phoenix', 'Tucson', 'Scottsdale'] },
    ],
  },
  {
    country: 'United Kingdom',
    regionLabel: 'Region',
    regions: [
      { region: 'England', cities: ['London', 'Manchester', 'Bristol', 'Leeds'] },
      { region: 'Scotland', cities: ['Edinburgh', 'Glasgow', 'Aberdeen'] },
      { region: 'Wales', cities: ['Cardiff', 'Swansea'] },
    ],
  },
  {
    country: 'Canada',
    regionLabel: 'Province',
    regions: [
      { region: 'Ontario', cities: ['Toronto', 'Ottawa', 'Hamilton'] },
      { region: 'British Columbia', cities: ['Vancouver', 'Victoria'] },
      { region: 'Quebec', cities: ['Montreal', 'Quebec City'] },
    ],
  },
];
