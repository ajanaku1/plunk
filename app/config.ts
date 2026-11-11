export type NetworkId = 'mainnet' | 'testnet';

/** The launchpad account per network; each coin lives at `<ticker>.<launchpad>`. */
const launchpadPerNetwork: Record<NetworkId, string> = {
  mainnet: 'plunk.near',
  testnet: 'plunk.testnet',
};

export const networkId: NetworkId = 'testnet';
export const launchpadId: string = launchpadPerNetwork[networkId];
export const rpcUrls: Record<NetworkId, string[]> = {
  mainnet: ['https://free.rpc.fastnear.com'],
  testnet: ['https://test.rpc.fastnear.com'],
};

const explorerPerNetwork: Record<NetworkId, string> = {
  mainnet: 'https://nearblocks.io',
  testnet: 'https://testnet.nearblocks.io',
};

export function explorerAccount(id: string): string {
  return `${explorerPerNetwork[networkId]}/address/${id}`;
}

export function explorerTx(hash: string): string {
  return `${explorerPerNetwork[networkId]}/txns/${hash}`;
}
