# Public REST API

TurnAgain publishes its service catalogue as a read-only JSON API, so other programs can use the same data the website shows. The API is one Firebase Cloud Function, `api` (2nd gen, `australia-southeast1`), whose source is `functions/api.js` and `functions/lib/publicService.js`.

Base URL: `https://australia-southeast1-fit5032-7b50f.cloudfunctions.net/api`

## Routes

| Method and path | Returns |
|---|---|
| `GET /services` | a page of published services, `{ data, page, pageSize, total, totalPages }` |
| `GET /services/:id` | one published service, `{ data }`, or 404 |
| any other method | 405 `{ "error": { "code": "method-not-allowed" } }` |
| any other path | 404 `{ "error": { "code": "not-found" } }` |
| any read failure | 500 `{ "error": { "code": "internal" } }` with `Cache-Control: no-store`; the cause is written only to the function log |

Only published documents are ever read (`services where status == 'published'`), and only the public fields leave the function.

## Public fields

`id, name, summary, actionTypes, itemCategories, acceptedItems, aliases, suburb, postcode, address, searchAreas, geo, openingHours, acceptanceConditions, excludedConditions, preparation, access, cost, source, updatedAt`

`acceptanceConditions` lists the conditions a drop-off must meet and `excludedConditions` the things the place does not take, one entry each; a document stored before `excludedConditions` existed omits it. `openingHours` is a list of lines whose first is the weekly schedule (for example `Mon-Fri 9am-5pm; Sat 10am-4pm; Sun closed`) and whose later lines are notes; `access` lists short facts and notes, one per entry.

`updatedAt` is an ISO 8601 string (`null` when unparseable). `source` carries at most `organisation`, `url`, `checkedAt` (non-string entries are dropped; the key is omitted when nothing remains); `geo` is `null`, omitted when latitude, longitude or precision are invalid, or `{ latitude, longitude, precision: 'venue' | 'area', sourceUrl?, checkedAt? }`. `status`, `createdAt`, `revision` and any unknown key never leave the function, and a field the document does not carry is omitted. The whitelist is derived from one projector per field, so the two cannot drift.

## Query parameters (`GET /services`)

| Parameter | Values | Default | Notes |
|---|---|---|---|
| `q` | text, trimmed to 100 characters | `''` | whole-word, case-insensitive, diacritic-insensitive match on `name`, `acceptedItems`, `aliases`, `summary`, `suburb`; every word must appear (`bike` does not match `bicycle`). The website's item-aware matching (categories, aliases, verbs) is deliberately not exposed here. |
| `action` | `repair`, `reuse`, `recycle`; repeatable | none | every requested action must be present on the record; duplicates are ignored |
| `sort` | `name-asc`, `name-desc` | `name-asc` | name, then `id` ascending in both directions so paging is stable |
| `page` | positive integer | `1` | a page past the end returns `data: []` with the true `total` |
| `pageSize` | integer 1–50 | `10` | |

A repeated scalar key (`?q=a&q=b`) takes its first value. Any invalid value is 400 with every invalid field named:

```json
{ "error": { "code": "invalid-query", "fields": { "sort": "must be one of name-asc, name-desc", "page": "must be a positive integer" } } }
```

## Headers

Every response: `Content-Type: application/json; charset=utf-8`, `X-Content-Type-Options: nosniff`. A 200 carries `Cache-Control: public, max-age=300`; every error carries `Cache-Control: no-store`, so a cached 404 or 500 never hides a fix. CORS comes from `cors: true`: the request `Origin` is reflected (never `*`), `Vary: Origin` is added and an `OPTIONS` preflight is answered with 204 by the wrapper.

## Reads, caching and the 1,000 cap

- One in-memory memo per function instance holds the published list for five minutes (`MEMO_TTL_MS` in `functions/api.js`); concurrent requests share one in-flight read, and a read that fails is forgotten so the next request retries. The browser holds a second layer: a 200 carries `Cache-Control: public, max-age=300`, so a response served near the end of the memo's five minutes can be reused by the client for another five; end to end a change can take up to about ten minutes to be visible.
- The list read stops at 1,000 documents (`READ_CAP`, pages of 100); `total` reflects the loaded set. Below the cap the memo is a complete list, so an unknown id is a 404 without a Firestore read. Only when the memo holds the full 1,000 does `GET /services/:id` fall back to one by-id read that checks `status == 'published'`.
- Read estimate: `3 × 288 × N` document reads per day is an estimate for the sustained-warm case (three instances, `maxInstances: 3`, each refreshing every five minutes, 288 times a day, all day, each refresh reading every published document once), not a ceiling: a cold start or an instance replacement discards the in-process memo (Cloud Functions does not promise to keep global state between invocations) and costs an extra refresh, and by-id reads above the cap add to it. With `N = 40` the estimate is 34,560; with the 63 published services 54,432, above the 50,000 reads/day free-tier-equivalent, but only under traffic sustained around the clock; idle instances scale to zero and the memo is not refreshed. If it ever matters, the TTL is one constant.
- A malformed id (anything outside `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`) is a 404 and never reaches Firestore.

## Examples

The results in the comments were checked against the live API on 2026-10-14. Git Bash (PowerShell users: `curl.exe`, because `curl` there is an alias of `Invoke-WebRequest`):

```bash
B=https://australia-southeast1-fit5032-7b50f.cloudfunctions.net/api

curl -s -D - "$B/services?q=repair&pageSize=2" -o page.json
# HTTP/1.1 200 OK (or HTTP/2 200, depending on the local curl build)
# content-type: application/json; charset=utf-8
# cache-control: public, max-age=300
# x-content-type-options: nosniff
# page.json: "data" holds 2 records without a "status" key; "page": 1, "pageSize": 2, "total": 15, "totalPages": 8

curl -s "$B/services/frankston-roving-repair-program"
# { "data": { "id": "frankston-roving-repair-program", "name": "Frankston Roving Repair Program", ... } }
# with the other public fields; "updatedAt" is an ISO string such as "2026-10-06T23:31:33.369Z"

curl -s "$B/services?action=repair&action=reuse&sort=name-desc&pageSize=50"
# every record carries both actions: "total": 5, "totalPages": 1, starting with wecycle-community-bike-shed-northcote

curl -s -o /dev/null -w "%{http_code}\n" "$B/services/does-not-exist"
# 404 (body { "error": { "code": "not-found" } }, cache-control: no-store)

curl -s "$B/services?page=0&sort=price"
# 400 { "error": { "code": "invalid-query", "fields": { "sort": "must be one of name-asc, name-desc", "page": "must be a positive integer" } } }

curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Length: 0" "$B/services"
# 405. Send the Content-Length header: a bare `curl -X POST` with no body is answered 411 by Google's
# front end before the function runs.

curl -s -D - -o /dev/null -X OPTIONS -H "Origin: https://turnagainau.pages.dev" -H "Access-Control-Request-Method: GET" "$B/services" | grep -i "HTTP/\|access-control\|vary"
# HTTP/1.1 204 No Content
# access-control-allow-origin: https://turnagainau.pages.dev
# vary: Origin, Access-Control-Request-Headers
```

The full list, `GET /services`, returned `"total": 63`, `"pageSize": 10` and `"totalPages": 7` on the same day.

## Not part of the API

`HEAD` is answered 405 like every non-GET method (a link checker may prefer HEAD). Activities, sessions, bookings, ratings and users are not exposed. The website's four Firebase callables (`sendBookingEmail`, `sendSessionEmail`, `promoteNextBooking`, `adminSetUserAccess`) serve the signed-in app and are not routes of this API. There is no authentication, no write route and no rate limit beyond the instance cap and the memo.
