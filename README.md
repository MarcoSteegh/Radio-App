# World Radio Explorer

Een leerproject in React + TypeScript dat een radio-ontdekkingservaring biedt met wereldkaart, live streams en persoonlijke favorieten.

## Features

- Wereldkaart met interactieve radiostations (Leaflet + React-Leaflet).
- Zoeken op station, stad of genre.
- Debounced search voor vloeiende UX tijdens typen.
- Live afspelen via HTML5 audio.
- Favorieten beheren (toevoegen/verwijderen).
- Favorieten persistent in localStorage.
- Favorieten exporteren en importeren als JSON.
- Filters op land, taal en tag.
- Nearby stations op basis van geolocatie.
- Toast meldingen en loading skeletons.

## Tech Stack

- React 19
- TypeScript
- Vite
- Leaflet
- React-Leaflet
- ESLint

## Scripts

- `npm run dev`: start lokale development server.
- `npm run build`: typecheck + productie build.
- `npm run lint`: lint checks.
- `npm run preview`: preview van productie build.

## Starten

1. Installeer dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Open de URL die Vite toont in de terminal.

## Data Source

- Station metadata en stream URLs worden opgehaald via de publieke Radio Browser API.

## JSON import/export formaat (favorieten)

- Export levert een array van station objecten op.
- Import verwacht dezelfde structuur.
- Ongeldige items worden genegeerd door sanitization.

Voorbeeld:

```json
[
  {
    "stationuuid": "abc123",
    "name": "Example FM",
    "country": "Netherlands",
    "state": "",
    "favicon": "",
    "url_resolved": "https://example.com/stream",
    "language": "dutch",
    "tags": "pop,news",
    "votes": 0,
    "clickcount": 0,
    "geo_lat": 52.37,
    "geo_long": 4.9
  }
]
```

## Opmerkingen

- Niet elke publieke stream is altijd online.
- Geolocatie vereist browsertoestemming.
- Dit project is bedoeld voor persoonlijk leren en experimenteren.

## Roadmap

- Station health checks: periodiek stream URLs valideren en offline stations automatisch verbergen.
- Audio UX: volume normalisatie en fade-in/fade-out tussen stations.
- Favorites UX: drag-and-drop sortering en pinnen van favoriete stations.
- Zoekkwaliteit: fuzzy search en score-gebaseerde ranking.
- PWA: installeerbare app met basis offline shell.
- Theming: light/dark mode toggle met persistente voorkeur.
- Testdekking: unit tests voor sanitization/import en integratietests voor filterflows.
