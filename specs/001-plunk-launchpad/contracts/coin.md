# Contract interface: Coin (global contract, `<ticker>.plunk.near`)

Standard NEP-141 + NEP-145 storage + NEP-148 metadata: `ft_transfer`, `ft_transfer_call`, `ft_resolve_transfer`, `ft_balance_of`, `ft_total_supply`, `ft_metadata`, `storage_deposit`. Every balance change runs the epoch/min-balance hook (data-model).

## Extra methods
| Method | Caller | Notes (FR) |
|---|---|---|
| `new({launchpad, exchange, metadata, mint_to})` | batch init only | Mints the full supply to the launchpad. `excluded = {exchange, launchpad}` |
| `ft_on_transfer` (from `wnear`, msg `{"reward_near":<epoch>}`) | launchpad only | Adds to epoch `<epoch>`'s NEAR pot (FR-018) |
| `distribute({epoch, coin_amount})` | launchpad only | Closes the epoch's pots. Below the minimum, they roll over (FR-018/023) |
| `claim()` | anyone | Settles the caller and pays both the NEAR and coin rewards |
| `burn({amount})` | launchpad only | Burns from the launchpad's balance |

## Views
`get_claimable(account)` → `{near, coin}`, `get_epoch(e)` → `{eligible_total, pot_near, pot_coin, distributed}`, `current_epoch()`.
