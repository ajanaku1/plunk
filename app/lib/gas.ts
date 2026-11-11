/** Gas and deposit constants shared by every transaction the app signs. */

export function tgas(n: number): string {
  return `${n}000000000000`;
}

/** NEP-145 registration on wNEAR and on a coin: 0.00125 NEAR. */
export const STORAGE_DEPOSIT = '1250000000000000000000';
