# Automatic world agent on product signup

Each Ixis product should create the person's Apixis world agent once, then send them to `/enter?from=<client>`.

Renoxis already does this. Copy the same server call.

## Hub route

`POST https://www.apixis.dev/api/agent/provision`

Headers:

```
Content-Type: application/json
Authorization: Bearer <that product's APIXIS_WORLD_KEY>
```

Body:

```json
{
  "from": "socixis",
  "email": "person@email",
  "name": "optional display name"
}
```

`from` must match the product key. A key from another product returns 401.

## Env

On the **product** Vercel project:

```
APIXIS_WORLD_KEY=<long random>
```

On **apixis-dev** Production + Preview, `APIXIS_WORLD_KEYS` is a comma list of `client:sha256(key)` pairs for every allow-listed client. Never put the plain product key on the hub.

## Allow-listed clients

`renoxis` `socixis` `rawixis` `contraxis` `halaxis` `lyrixis` `recovra` `qahwahworld` `launchixis` `deduxis` `geoxis` `contentbot` `nurserytoons` `ominix` `wattixis`

Not clients: AwadBot, COMMAND.

After a 200, show: "Your agent is ready. Enter the Apixis world" linking to
`https://www.apixis.dev/enter?from=<client>`.

Idempotent: second call returns `created: false` and does not grant another 1,000 starter Ixis (granted once, on Apixis.dev).
