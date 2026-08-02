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
- Node.js + Express API
- MySQL (XAMPP)
- Leaflet
- React-Leaflet
- ESLint

## Scripts

- `npm run dev`: start lokale development server.
- `npm run api`: start backend API server op `http://127.0.0.1:3000`.
- `npm run build`: typecheck + productie build.
- `npm run lint`: lint checks.
- `npm run preview`: preview van productie build.

## Starten

1. Installeer dependencies:

```bash
npm install
```

2. Importeer het schema in MySQL:

```bash
mysql -u root -p radio_app < supabase/schema.sql
```

3. Zet lokale omgevingsvariabelen:

- Frontend `.env.local`:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000/api
```

- Backend (bijv. `.env` in project root):

```bash
API_PORT=3000
API_HOST=127.0.0.1
API_CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=radio_app
SERVICE_KEY=change-me
IMAGE_PROXY_ALLOWED_HOSTS=
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
ADMIN_TOKEN_SECRET=change-me-to-a-long-random-secret
VITE_OBSERVABILITY_ENABLED=false
```

4. Start backend API:

```bash
npm run api
```

5. Start development server:

```bash
npm run dev
```

6. Open de URL die Vite toont in de terminal.

## Data Source

- Station metadata en stream URLs worden opgehaald via de publieke Radio Browser API.
- Station data wordt lokaal opgeslagen in MySQL via de API-laag.

## Admin API

Admin review endpoints gebruiken login + server-side sessiecookie (httpOnly).

- `POST /api/admin/login`
  - Body: `{ "username": "...", "password": "..." }`
  - Response: `{ "authenticated": true, "expiresAt": 123456789 }`
- `POST /api/admin/refresh`
  - Vernieuwt een geldige admin sessie en revoke't de oude token.
- `POST /api/admin/logout`
  - Revoke't de huidige admin sessie en wist de auth-cookie.

- `GET /api/admin/submissions?status=pending|approved|all&offset=0&limit=100`
  - Haalt ingestuurde stations op voor review.
- `PATCH /api/admin/submissions/:id`
  - Body: `{ "approved": true }` of `{ "approved": false }`.
  - Bij `approved: true` vult de database-trigger automatisch de `stations` tabel.

Deze endpoints vereisen een geldige admin sessiecookie.

`POST /api/admin/stations/bulk-upsert` blijft beveiligd met `x-service-key` voor importscripts.
- `POST /api/admin/stations/bulk-upsert`
  - Verwacht array met station objects, gebruikt door `scripts/import-stations.mjs`.

## API Hardening

- `POST /api/submissions` heeft basis rate limiting op IP:
  - `SUBMISSION_RATE_LIMIT_WINDOW_MS` (default `60000`)
  - `SUBMISSION_RATE_LIMIT_MAX` (default `5`)
- Fouten van de backend volgen een consistente shape:
  - `{ "code": "SOME_ERROR_CODE", "message": "..." }`

## Favicon Proxy Cache

- `GET /api/image-proxy` gebruikt een in-memory cache voor favicon responses.
- Cache tuning via env vars:
  - `IMAGE_PROXY_CACHE_TTL_MS` (default `600000`)
  - `IMAGE_PROXY_CACHE_MAX_ITEMS` (default `500`)

## Image Proxy Security

- `GET /api/image-proxy` blokkeert localhost/private netwerk targets (SSRF mitigatie).
- Optionele host allowlist via `IMAGE_PROXY_ALLOWED_HOSTS` (comma-separated).
  - Ondersteunt exacte hosts en wildcard suffixes zoals `*.example.com`.
- Aparte rate limiting op image proxy:
  - `IMAGE_PROXY_RATE_LIMIT_WINDOW_MS` (default `60000`)
  - `IMAGE_PROXY_RATE_LIMIT_MAX` (default `120`)

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
