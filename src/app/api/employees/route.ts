import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const BLOCKSCOUT_API_URL = 'https://blockscout.shardeum.org/api';
const CACHE_FILE = path.resolve(process.cwd(), 'balances-cache.json');

async function fetchTransactions(address: string) {
  // Fetch normal transactions (native transfers)
  const url = `${BLOCKSCOUT_API_URL}?module=account&action=txlist&address=${address}&sort=asc`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== '1' || !Array.isArray(data.result)) return [];
  
  // Process transactions: positive for incoming, negative for outgoing
  return data.result.map((tx: any) => {
    const value = Number(tx.value) / 1e18;
    if (tx.to?.toLowerCase() === address.toLowerCase()) {
      return { value, direction: 'in', hash: tx.hash, timestamp: tx.timeStamp };
    } else if (tx.from?.toLowerCase() === address.toLowerCase()) {
      return { value: -value, direction: 'out', hash: tx.hash, timestamp: tx.timeStamp };
    }
    return null;
  }).filter(Boolean);
}

async function fetchBlockNumberAtEndOfDay(date: Date): Promise<number | null> {
  // Get the timestamp for 23:59:59 UTC of the given date
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);
  const timestamp = Math.floor(endOfDay.getTime() / 1000);
  // Use Blockscout API to find the closest block before this timestamp
  const url = `${BLOCKSCOUT_API_URL}?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=before`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === '1' && data.result) {
    return Number(data.result);
  }
  return null;
}

async function fetchBalanceAtBlock(address: string, block: number): Promise<string | null> {
  const url = `${BLOCKSCOUT_API_URL}?module=account&action=balance&address=${address}&block=${block}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === '1' && data.result) {
    return data.result;
  }
  return null;
}

async function loadCache() {
  try {
    const content = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveCache(cache: any) {
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

export async function GET() {
  try {
    // Read addresses from wallets.txt
    const file = await fs.readFile("wallets.txt", "utf-8");
    const addresses = file.split(/\r?\n/).filter(Boolean);

    // Chunk addresses into groups of 20
    const chunkSize = 20;
    const chunks: string[][] = [];
    for (let i = 0; i < addresses.length; i += chunkSize) {
      chunks.push(addresses.slice(i, i + chunkSize));
    }

    // Fetch balances for each chunk and merge results
    const allResults: any[] = [];
    for (const chunk of chunks) {
      const balUrl = `${BLOCKSCOUT_API_URL}?module=account&action=balancemulti&address=${chunk.join(',')}`;
      const balRes = await fetch(balUrl);
      const balData = await balRes.json();
      if (Array.isArray(balData.result)) {
        allResults.push(...balData.result);
      }
    }

    // Create a map of address to result for easier lookup
    const addressToResult = new Map<string, any>();
    for (const b of allResults) {
      addressToResult.set(b.account.toLowerCase(), b);
    }

    // Prepare daily balance cache
    const cache = await loadCache();
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const days = 32;
    const allDailyBalances: Record<string, { date: string, balance: string }[]> = {};

    for (const address of addresses) {
      allDailyBalances[address] = [];
      let lastBalance: string | null = null;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCDate(now.getUTCDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        // Don't cache today or yesterday
        const isRecent = i === 0 || i === 1;
        cache[address] = cache[address] || {};
        if (!isRecent && cache[address][dateStr]) {
          allDailyBalances[address].push({ date: dateStr, balance: cache[address][dateStr] });
          lastBalance = cache[address][dateStr];
          continue;
        }
        const block = await fetchBlockNumberAtEndOfDay(d);
        let balance: string | null = lastBalance;
        if (block) {
          const fetched = await fetchBalanceAtBlock(address, block);
          if (fetched) {
            balance = fetched;
            if (!isRecent) cache[address][dateStr] = balance;
          }
        }
        allDailyBalances[address].push({ date: dateStr, balance: balance || '0' });
        lastBalance = balance || '0';
      }
    }
    await saveCache(cache);

    // Fetch transaction history for each address
    const histories = await Promise.all(addresses.map(async (address) => {
      const txs = await fetchTransactions(address);
      // Sort by timestamp to ensure chronological order
      return txs.sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp));
    }));

    // Return addresses, balances, and spark data
    return NextResponse.json({
      employees: addresses.map((address) => {
        const result = addressToResult.get(address.toLowerCase());
        return {
          address,
          balance: result ? result.balance : '0',
          spark: histories[addresses.indexOf(address)],
          dailyBalances: allDailyBalances[address],
        };
      }),
      rawBalances: allResults
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : error }, { status: 500 });
  }
} 