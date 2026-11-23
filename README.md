# btc-race-24h-20261123-0511-v2

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/baijorl21/btc-race-24h-20261123-0511-v2/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/baijorl21/btc-race-24h-20261123-0511-v2/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A trend-riding bot for the [btc-race-24h-20261123-0511 bounty](https://make.fun/c/btc-race-24h-20261123-0511): it trades CBBTC against USDC on 1-minute bars with 1,000 USDC of paper money. A round trip costs roughly 25–35 bps in fees, slippage and pool impact while 1-minute noise is only ~5 bps, so the bot trades rarely and only with the trend: it buys when the 1-hour EMA of closes clears the 4-hour EMA by a margin and the close is above the 4-hour EMA, sizes at 85% of equity (scaled down if the pool depth would push impact past ~12 bps), and exits on a wide 220 bps trailing stop or a 130 bps hard stop, then sits out 90 bars before it may re-enter. Deterministic: no clock, environment or randomness — the same bars always produce the same orders. On the published dev window it made +22.09 USDC net (1 trade, graded locally with the kit's harness).

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=r9wmade1&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
