# Deployment records

Only files produced by an actual `forge script ... --broadcast` run live here.
There is **no** Mezo testnet or mainnet deployment in this repository at the time
of writing; nothing in this folder should be read as evidence of one.

| File | Meaning |
| --- | --- |
| `local-anvil-31611.json` | Contracts broadcast to a throwaway local `anvil` node (chain id 31611 to mimic Mezo testnet). The ERC-20 used is `MockMUSD`, **not** real Mezo USD. |

To deploy to a real network, follow `docs/DEPLOYMENT.md`. The script requires
`NETWORK`, `MUSD_ADDRESS`, `REGISTRY_ADMIN`, `FEE_RECIPIENT`, `FEE_BPS` and
optionally `EXPECTED_CHAIN_ID`; it never hardcodes a token address.
