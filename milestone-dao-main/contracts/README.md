# CrowdfundingDAO — Hardhat (Polygon Amoy)

Standalone Hardhat workspace. Runs independently from the web app.

## Setup

```bash
cd contracts
npm install
cp .env.example .env   # fill in values
```

Required env:

- `AMOY_RPC_URL` — e.g. https://rpc-amoy.polygon.technology
- `PRIVATE_KEY` — funded deployer key (Amoy MATIC from a faucet)
- `POLYGONSCAN_API_KEY` — for `npx hardhat verify`

## Commands

```bash
npx hardhat compile
npx hardhat test                                  # runs refund-window tests
npx hardhat run scripts/deploy.ts --network amoy  # deploy
npx hardhat run scripts/verify.ts --network amoy  # verify on PolygonScan
```

After deploy, the script prints the contract address and writes
`deployments/amoy.json` for the verify script to consume.

## Refund window

The contract enforces:
- `castRefundVote` reverts after `refundDeadline`
- `executeRefund` reverts before `refundDeadline`
- `refundDeadline = projectDeadline + REFUND_WINDOW` (14 days by default)

See `test/CrowdfundingDAO.refund-window.test.ts` for coverage.
