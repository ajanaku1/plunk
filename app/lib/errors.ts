/** One readable line from whatever a wallet, RPC or contract threw. */
export function messageOf(e: unknown): string {
  const raw = rawMessage(e);
  const panic = /Smart contract panicked: ([^"\n]+)/.exec(raw);
  if (panic) return panic[1];
  if (/reject|cancel|denied|closed/i.test(raw)) return 'Cancelled in the wallet.';
  if (/NotEnoughBalance|not enough balance|insufficient/i.test(raw)) return 'Not enough NEAR in your account for this.';
  if (/Exceeded the prepaid gas|GasLimitExceeded/i.test(raw)) return 'Ran out of gas. Try again; the contract resumes where it stopped.';
  if (/does not exist/i.test(raw)) return raw.replace(/ at block height \d+/, '');
  if (/Failed to fetch|NetworkError|ECONN|timeout/i.test(raw)) return 'Network hiccup talking to NEAR. Try again in a moment.';
  return raw || 'Something went wrong';
}

function rawMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return '';
  }
}
