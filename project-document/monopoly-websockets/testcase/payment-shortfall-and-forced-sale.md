# Payment shortfall and forced sale v4

The server creates an ordered, durable payment queue for mandatory rent and card
claims. While a shortfall is active, ordinary trade and development commands are
blocked.

The debtor can sell an owned property to the Bank at the authoritative gross price
`floor((price + investedBuildCost) * 70 / 100)`, or propose that fixed sale to one
active buyer. The seller receives gross consideration before the payment queue
consumes the active debt. Every committed sale immediately retries the active claim.
Timeout sells properties in tile order; bankruptcy occurs only after no saleable
property remains.

Proposal terms are private to the seller and designated buyer and are restored
through private player state after reconnect or restart.
