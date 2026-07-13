# Miruum — OTA Connector Gateway

Miruum aggregates hotel rate & availability from multiple **supply sources**:

- **DIRECT** — hotels managed by Miruum's own Channel Manager (Extranet).
- **OTA** — Miruum as a sub-agent of Tiket.com / Agoda / Traveloka (or any other).

Any OTA B2B REST API plugs in via **config only** — no code change, no deploy.

## How it works

Each `SupplyChannel` has:

| Field | Meaning |
|---|---|
| `connectorType` | `MOCK` (demo data) · `HTTP` (real API via gateway) · `DIRECT` (own inventory) |
| `config` | Gateway config JSON (see below) — only used when `connectorType = HTTP` |
| `commissionPct` | Miruum markup added on top of the supplier nett price |

`backend/src/gateway.ts` turns a `config` into live offers. `syncOffers()` pulls
every source, applies the markup, and caches the **cheapest available** offer as
the hotel's headline price.

## Config shape

```json
{
  "baseUrl": "https://api.provider.com",
  "auth": { "type": "bearer|header|basic|query", "tokenEnv": "PROVIDER_TOKEN" },
  "request": {
    "method": "GET|POST",
    "path": "/rates/{externalId}",
    "query":  { "checkin": "{checkIn}", "checkout": "{checkOut}" },
    "headers": { "Accept": "application/json" },
    "body": { }
  },
  "map": {
    "basePrice": "data.price.amount",
    "available": "data.available",
    "roomsLeft": "data.roomsLeft",
    "deeplink": "data.url",
    "supplierRef": "data.rateId",
    "priceMultiplier": 1,
    "availableTrueValue": true
  }
}
```

- **Placeholders** in `path`/`query`/`body`: `{slug} {externalId} {name} {city} {checkIn} {checkOut}`.
  `{externalId}` = the hotel's id at that OTA — set it per hotel in Back Office → Hotel → Edit (`externalId`).
- **Auth secrets** are referenced by ENV var name, never stored in the DB:
  - `bearer` → `tokenEnv`
  - `header` → `header` (name) + `valueEnv`
  - `basic`  → `userEnv` + `passEnv`
  - `query`  → `param` (name) + `valueEnv`
- **`map`** uses dot-paths (`data.rooms.0.price`). `priceMultiplier` scales the nett
  price; `availableTrueValue` maps a non-boolean availability field.

## Preloaded templates

Tiket.com, Agoda and Traveloka ship with a **starter template** (`connectorType`
stays `MOCK` until you activate). These are modeled on each provider's common
pattern — **verify endpoint & field paths against the real API docs** once you
have the contract.

Token ENV vars (set in `deploy/.env`, then `docker compose up -d`):

| Channel | ENV var | Notes |
|---|---|---|
| Tiket.com | `TIKETCOM_SECRET` | header `Authorization` |
| Agoda | `AGODA_AUTH` | value = `{siteId}:{apiKey}` |
| Traveloka | `TRAVELOKA_API_KEY` | header `X-API-Key` |

## Go-live checklist per OTA

1. Sign the B2B/affiliate contract → get credentials + API docs.
2. Set the token in `deploy/.env` (e.g. `AGODA_AUTH=12345:abcdef`), redeploy.
3. Back Office → **Channel Manager** → open the channel:
   - adjust `config` (endpoint/paths) to match the real API,
   - set `commissionPct` (your markup),
   - switch `connectorType` to **HTTP**, **Simpan**.
4. Click **Test** — green means the mapping works.
5. For each hotel also sold on that OTA, set its `externalId` (Hotel → Edit).
6. Click **Sync harga & ketersediaan** — offers now come from the live API.

If an API call fails, that offer is marked unavailable and the rest keep working.
