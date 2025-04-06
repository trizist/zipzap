# ZipZap

![ZipZap Logo](public/zipzap.png)

Social media tipping using Lightning, BOLT 12, & Nostr

## Development

First, run the development server:

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

To use the wallet features, you will need to run [phoenixd](https://phoenix.acinq.co/server) on the same server (or local dev env) as the website. You will also need to set `NEXT_PUBLIC_USE_WALLET` to `true` and add the `PHOENIX_API_PASSWORD` in `.env`.

## ZipZap Protocol

sequenceDiagram
    participant Alice_Nostr as Alice's Nostr Client
    participant Alice_Lightning as Alice's Lightning Wallet
    participant Relays as Nostr Relays
    participant Bob_Nostr as Bob's Nostr Client
    participant Bob_Lightning as Bob's Lightning Wallet
    
    Note over Alice_Nostr: Alice adds 'lno' field to profile (kind 0)
    Alice_Nostr->>Relays: Publish updated profile with 'lno' field
    
    Note over Bob_Nostr: Bob sees Alice's post he wants to ZipZap
    
    Bob_Nostr->>Relays: Create & publish kind 9912 ZipZap Request
    Note over Bob_Nostr: References Alice's post ID<br>Includes Alice's offer
    
    Bob_Nostr->>Bob_Nostr: Generate bech32 'note...' of ZipZap Request
    
    Bob_Nostr->>Bob_Lightning: Send bech32 note ID
    
    Bob_Lightning->>Alice_Lightning: invoice_request with payerNote<br>containing note ID
    
    Alice_Lightning->>Alice_Lightning: Process payment
    
    Alice_Lightning->>Alice_Nostr: Signal payment with note ID in payerNote
    
    Alice_Nostr->>Relays: Query for 9912 ZipZap Request matching note ID
    Relays->>Alice_Nostr: Return matching ZipZap Request
    
    Note over Alice_Nostr: Alice learns Bob's pubkey ZipZapped her post
    
    Alice_Nostr->>Relays: Sign & broadcast kind 9913 ZipZap Receipt
    
    Note over Relays: Compatible clients will render ZipZap receipt in UI

## Spec Notes (WIP)

I've been thinking through a lot of different ways to implement this, starting with simple achievable things that have a lot of holes and edge cases through things that are harder to implement but are more robust and sound. Here's some train-of-thought notes on the topic.

### Anonymous profile zipzaps

- I publish my offer in my nostr profile
- I treat all payments to that offer as zipzaps and broadcast zipzap receipts for those payments
- I do not know the nostr profile that paid me, so these are all "anonymous zipzaps"
- I also do not know the post they are tipping, so these are all considered zipzaps to my profile
- PROS: easy to do, can be totally anonymous if that's what you want
- CONS: recipient can just publish zipzap receipts infinitely and create the impression they receive a ton of zipzaps (this can also be done with zaps using unpaid bolt11 invoices), zappers do not get the fun of taking credit for the zap, recipient doesn't know who to thank, etc.

### Zipzaps to posts - naive implementation

- Sender publishes a zipzap request referencing my pubkey, an event ID to one of my posts, a zipzap amount, and a unix timestamp
- I receive updates from relays that I have a zipzap request
- I check my lightning node to see if a payment was made against my offer with an amount that corresponds to the zipzap amount at a timestamp within 1 minute of the request's timestamp
- If yes, then I publish a zipzap receipt
- PROS: somewhat easy to do, recipients can know who is claiming to support them, senders get to take credit
- CONS: zipzap requests could be sniped. Suppose Alice publishes a zipzap request for 100 sat to Bob, and Mallory sees the request on the relay and also publishes zipzap requests referencing the same event ID and the same unix timestamp. Bob see's Malory's request and credits her with the zap instead of Alice. Or Mallory generates 9 npubs and sends 9 zipzap requests, meaning Bob has to randomly choose one to credit in the zipzap receipt meaning Alice only has a 10% chance of taking the credit even though she's the one who made the payment -- reductio ad absurdum!

### Zipzaps to posts - slightly better version
- Sender publishes a zipzap request referencing my pubkey, an event ID to one of my posts, a unix timestamp, and an *encrypted* amount.
- Same flow as above -- but the recipient decrypts the amount and then checks for payments against the offer.
- PROS: all the pros from above, plus it's harder for someone to snipe the credit or the zipzap. If somebody really wants to try brute forcing all the possible amounts to take credit, I'm sure that the recipient would love the extra bitcoin!
- CONS: It feels cumbersome to imagine the recipient's nostr client needing to be decrypt all these zipzap requests and then check or corresponding payments. You could imagine DOS attacking somebody by publishing thousands of zipzap requests that will never actually be paid.

### Include zipzap request in`payer_note` of the `invoice_request`

- Similar to how zap data is included in the LNURL Pay request callback
- Sender includes zipzap request event in the `payer_note` of the invoice request
- Recipient responds with the BOLT 12 invoice, eg. `lni...xyz`
- Sender pays invoice
- Recipient's finds a payment in their payment history with a zipzap request in the payer note, and broadcasts a zipzap receipt to nostr relays
- PROS: all the pros from above, plus it saves the recipient from the attack of being flooded with zipzaps requests that will never be paid
- CONS: recipient can still spoof zipzap requests by referencing payments that never happened -- but ultimately, this is already a problem with nostr zaps. So I think if we're cool with this for zaps, we're cool with it for zipzaps, and vice versa. Also, there might be limits to how much data we can fit into `payer_note`.

### Include zipzap request in an optional TLV field of the `invoice_request`

- Same flow as above, but instead of using `payer_note`, we use an extra TLV field. We use an odd feature bit to signal optional. Lightning nodes that do't understand it can still receive the payment, but lightning nodes that do understand it will recognize the zipzap request and broadcast a zipzap receipt upon completed payment.
- PROS: same as above, though perhaps we could save on space using binary encoding inside of the TLV field which I do not think we could do with `payer_note` (might be wrong on that one)
- CONS: same as above

### ZipZap Request

Draft of a ZipZap request note

```
{
  "kind": 9912,
  "content": "ZipZap!",
  "tags": [
    ["relays", "wss://mynostrrelay.xyz"],
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

### ZipZap Receipt

Draft of a ZipZap Receipt note

```
{
    "id": "{event_id}",
    "pubkey": "{my_pubkey_as_recipient}",
    "created_at": {invoice_paid_at},
    "kind": 9913,
    "tags": [
      ["p", "{my_pubkey_as_recipient}"],
      ["P", "{pubkey_of_zipzapsender (creator of the 9912 event)}"],
      ["e", "{id_of_my_post_that_was_zipzapped}"],
      ["lno", "{lno_from_profile_of_post_author}"],
      ["amount", {amount_of_payment}]
    ],
    "content": "",
    "sig": "{event_signature}"
  }
```