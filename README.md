# ZipZap

BOLT 12 Nostr Zaps

## Development

First, run the development server:

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Spec Notes (WIP)

### ZipZap Request

```
{
  "kind": 9912,
  "content": "ZipZap!",
  "tags": [
    ["relays", "wss://mynostrrelay.xyz"],
    ["amount", "1212"],
    ["lno", "{lno_from_profile_of_post_author}"],
    ["p", "{pubkey_of_author_of_the_post}"],
    ["e", "{id_of_the_post}"]
  ],
  "pubkey": "{my_pubkey}",
  "created_at": {current_unix_timestamp},
  "id": "{event_id}",
  "sig": "{event_signature}"
}
```