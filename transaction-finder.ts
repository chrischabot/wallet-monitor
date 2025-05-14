import { ethers } from 'ethers';
import * as fs from 'fs';

const BLOCKSCOUT_API_URL = 'https://blockscout-testnet.shardeum.org/api/v2';
const ADDRESS = '0x31B8942433BD3f0A4C62EF1F2Af06F47C1dD8c32';

interface Transaction {
    hash: string;
    from: {
        hash: string;
    };
    to: {
        hash: string;
    };
    value: string;
    block_number: number;
}

async function getTransactions() {
    try {
        // Fetch transactions from Blockscout API
        const response = await fetch(`${BLOCKSCOUT_API_URL}/addresses/${ADDRESS}/transactions`);
        const data = await response.json();
        
        if (!data.items || !Array.isArray(data.items)) {
            console.error('Unexpected API response format:', data);
            return;
        }

        const transactions = data.items as Transaction[];
        
        console.log(`Found ${transactions.length} transactions for address ${ADDRESS}\n`);
        
        // Filter for transactions sent FROM this address
        const sentTransactions = transactions.filter(tx => 
            tx.from.hash.toLowerCase() === ADDRESS.toLowerCase()
        );

        console.log(`Found ${sentTransactions.length} transactions sent FROM this address:\n`);

        // Filter for transactions with value 545
        const targetTransactions = sentTransactions.filter(tx => 
            ethers.formatEther(tx.value) === '545.0'
        );

        console.log(`Found ${targetTransactions.length} transactions with value 545 SHM:\n`);

        // Log transaction details and collect addresses
        const targetAddresses = targetTransactions.map(tx => tx.to.hash);

        // Save addresses to file
        fs.writeFileSync('employees.txt', targetAddresses.join('\n'));
        
        console.log('Addresses have been saved to employees.txt');
        console.log('\nTransaction details:');
        
        targetTransactions.forEach((tx, index) => {
            console.log(`\nTransaction #${index + 1}:`);
            console.log(`  Hash: ${tx.hash}`);
            console.log(`  To: ${tx.to.hash}`);
            console.log(`  Value: ${ethers.formatEther(tx.value)} SHM`);
            console.log(`  Block: ${tx.block_number}`);
            console.log('---');
        });

    } catch (error) {
        console.error('Error fetching transactions:', error);
    }
}

getTransactions().catch(console.error);
