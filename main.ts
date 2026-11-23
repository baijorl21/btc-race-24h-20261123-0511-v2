// Trend-ride bot for the make.fun BTC 24h race (bars-replay/v1, one asset: CBBTC vs USDC).
//
// Why this shape: a round trip here costs roughly 25-35 bps once the 4 bps fee, 2 bps modelled
// slippage and the pool's own price impact are counted, and 1-minute BTC noise is only ~5 bps a
// bar. Anything that trades often pays the toll until it is broke, so this bot trades rarely and
// only with the trend:
//
//   - Regime: an uptrend means the 1-hour EMA of closes sits above the 4-hour EMA by a small
//     margin (so a flat, choppy tape does not count) and the close itself is above the 4-hour EMA.
//   - Entry: flat, in an uptrend, after at least two hours of bars so the EMAs mean something,
//     and not in the last two hours of the day (a late entry cannot earn its round trip back).
//     Size is 85% of equity, scaled down if the pool depth would make the impact exceed ~12 bps.
//   - Exit: a wide trailing stop (220 bps under the best close since entry) so ordinary pullbacks
//     do not shake the position out, plus a hard stop 130 bps under the entry fill for the case
//     where the "trend" was a head-fake. After an exit the bot sits out 120 bars before it may
//     re-enter, which keeps a sideways tape from turning into a string of paid round trips.
//
// Everything is a pure function of the bars seen so far: no clock, no environment, no randomness,
// so the two grading runs produce identical action logs.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const FAST_EMA_BARS = 60; // 1 hour of 1-minute bars
const SLOW_EMA_BARS = 240; // 4 hours
const TREND_MARGIN = 1.001; // fast EMA must clear the slow EMA by ~10 bps
const MIN_HISTORY_BARS = 120; // no entries until the EMAs are seeded on real data
const TRAILING_STOP = 0.022; // exit 220 bps below the best close since entry
const HARD_STOP = 0.013; // exit 130 bps below the entry fill price
const SIZE_FRACTION = 85n; // percent of equity per entry
const MAX_IMPACT_BPS = 12n; // scale the order down rather than push the pool harder than this
const COOLDOWN_BARS = 120; // bars to sit out after an exit (two hours: a re-entry sooner than
// that is usually the same sideways tape charging another round trip)
const WINDOW_BARS = 1440; // both the dev and the race window are 24h of 1-minute bars
const NO_ENTRY_TAIL_BARS = 120; // stop opening new positions this many bars before the end
const SLIPPAGE_CAP_BPS = 250; // room for the modelled slippage, our impact and a bar of drift

let symbol = 'CBBTC';
let barsSeen = 0;
let fastEma = 0;
let slowEma = 0;
let peakClose = 0; // best close since the current position opened (0 = flat)
let entryPrice = 0; // fill price of the current position, in close-price units
let cooldownUntilBar = -1;
let wasHolding = false;

function emaStep(prev: number, value: number, period: number): number {
  const k = 2 / (period + 1);
  return prev + k * (value - prev);
}

/** The price our buy filled at, from this batch's fills, if the fill is reported here. */
function buyFillPrice(state: BarsState, batch: { fills: { side: string; symbol: string; status: string; price: string }[] }): number {
  for (const f of batch.fills) {
    if (f.side === 'buy' && f.symbol === symbol && f.status === 'filled') return Number(BigInt(f.price));
  }
  return 0;
}

await runBars({
  onHello(state) {
    symbol = state.hello.symbols[0]?.symbol ?? symbol;
  },
  onBatch(state, batch) {
    const bar = batch.bars.find((b) => b.symbol === symbol);
    if (bar === undefined) return []; // no fresh bar this minute: decide nothing on stale prices
    const close = Number(BigInt(bar.c));
    barsSeen += 1;
    fastEma = barsSeen === 1 ? close : emaStep(fastEma, close, FAST_EMA_BARS);
    slowEma = barsSeen === 1 ? close : emaStep(slowEma, close, SLOW_EMA_BARS);

    const held = state.positions.get(symbol);
    const holding = held !== undefined && held.qty > 0n;
    if (holding && !wasHolding) {
      // A position just appeared: anchor the stops to it.
      peakClose = close;
      entryPrice = buyFillPrice(state, batch) || close;
    }
    if (!holding && wasHolding) {
      // The position just closed: start the cooldown from this bar.
      cooldownUntilBar = barsSeen + COOLDOWN_BARS;
      peakClose = 0;
      entryPrice = 0;
    }
    wasHolding = holding;
    if (state.warmingUp) return [];

    if (holding) {
      if (close > peakClose) peakClose = close;
      const trailHit = close < peakClose * (1 - TRAILING_STOP);
      const hardHit = entryPrice > 0 && close < entryPrice * (1 - HARD_STOP);
      if (trailHit || hardHit) {
        const sell: OrderInput = { side: 'sell', symbol, qty: held.qty, max_slippage_bps: SLIPPAGE_CAP_BPS };
        return [sell];
      }
      return [];
    }

    // Flat: look for a trend worth paying the round trip for.
    const windowBar = state.seq - state.warmupBars;
    // Strength confirmation: besides the regime check, the close must also sit above the
    // fast EMA, so we buy into strength rather than catching the first dip of a rollover.
    const uptrend = fastEma > slowEma * TREND_MARGIN && close > slowEma && close > fastEma;
    if (!uptrend || barsSeen < MIN_HISTORY_BARS || barsSeen <= cooldownUntilBar) return [];
    if (windowBar >= WINDOW_BARS - NO_ENTRY_TAIL_BARS) return [];

    let notional = (state.equity * SIZE_FRACTION) / 100n;
    if (notional > state.cash) notional = state.cash;
    const room = state.weightRoom(symbol);
    if (notional > room) notional = room;
    const impact = state.impactBps(symbol, notional);
    if (impact !== null && impact > MAX_IMPACT_BPS) notional = (notional * MAX_IMPACT_BPS) / impact;
    if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];

    const buy: OrderInput = { side: 'buy', symbol, notional_quote_units: notional, max_slippage_bps: SLIPPAGE_CAP_BPS };
    return [buy];
  },
});
