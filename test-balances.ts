import fetch from 'node-fetch';
import { promises as fs } from 'fs';

const BLOCKSCOUT_API_URL = 'https://blockscout.shardeum.org/api';

async function testBalances() {
  try {
    // Read addresses from wallets.txt
    const file = await fs.readFile("wallets.txt", "utf-8");
    const addresses = file.split(/\r?\n/).filter(Boolean);
    console.log('Read addresses from wallets.txt:', addresses);

    // Chunk addresses into groups of 20
    const chunkSize = 20;
    const chunks = [];
    for (let i = 0; i < addresses.length; i += chunkSize) {
      chunks.push(addresses.slice(i, i + chunkSize));
    }
    console.log('Chunked addresses:', chunks);

    // Fetch balances for each chunk and merge results
    const allResults = [];
    for (const chunk of chunks) {
      const balUrl = `${BLOCKSCOUT_API_URL}?module=account&action=balancemulti&address=${chunk.join(',')}`;
      console.log('Fetching chunk URL:', balUrl);
      const balRes = await fetch(balUrl);
      const balData = await balRes.json();
      console.log('Chunk API response:', JSON.stringify(balData, null, 2));
      if (Array.isArray(balData.result)) {
        allResults.push(...balData.result);
      }
    }

    // Create a map of address to result for easier lookup
    const addressToResult = new Map();
    for (const b of allResults) {
      addressToResult.set(b.account.toLowerCase(), b);
    }

    console.log('\nDetailed balance comparison:');
    console.log('===========================\n');
    for (const addr of addresses) {
      const result = addressToResult.get(addr.toLowerCase());
      if (result) {
        const balanceInWei = result.balance;
        const balanceInSHM = parseFloat(balanceInWei) / 1e18;
        console.log(`
Address: ${addr}
Raw balance (wei): ${balanceInWei}
Converted balance (SHM): ${balanceInSHM}
Explorer URL: https://blockscout.shardeum.org/address/${addr}
-------------------`);
      } else {
        console.log(`
Address: ${addr}
Result: Not found in API response
Explorer URL: https://blockscout.shardeum.org/address/${addr}
-------------------`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testBalances(); 