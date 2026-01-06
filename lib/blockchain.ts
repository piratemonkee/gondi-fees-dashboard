import { Transaction } from './types';

// Contract addresses
const GONDI_CONTRACT = '0x4169447a424ec645f8a24dccfd8328f714dd5562';
const USDC_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WETH_CONTRACT = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

// Start date: October 22, 2025
const START_DATE = new Date('2025-10-22T00:00:00Z');
const START_TIMESTAMP = Math.floor(START_DATE.getTime() / 1000);

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

export function parseTransactionValue(value: string, decimals: number = 18): number {
  try {
    const bigIntValue = BigInt(value);
    const divisor = BigInt(10 ** decimals);
    const quotient = bigIntValue / divisor;
    const remainder = bigIntValue % divisor;
    return Number(quotient) + Number(remainder) / Number(divisor);
  } catch (error) {
    console.error('Error parsing transaction value:', error, { value, decimals });
    return 0;
  }
}

async function fetchWithRetry(url: string, retries: number = 3): Promise<any[]> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔗 API call (attempt ${i + 1}): ${url.substring(0, 100)}...`);
      
      const response = await fetch(url, { 
        headers: {
          'User-Agent': 'GONDI-FeeTracker/1.0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === '0') {
        if (data.message === 'No transactions found') {
          console.log('ℹ️ No transactions found for this request');
          return [];
        }
        throw new Error(`Etherscan API error: ${data.message || data.result}`);
      }
      
      const results = Array.isArray(data.result) ? data.result : [];
      console.log(`✅ Received ${results.length} results`);
      return results;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Attempt ${i + 1} failed:`, errorMsg);
      
      if (i === retries - 1) {
        console.error('❌ All retry attempts failed');
        throw error;
      }
      
      // Wait before retry - longer delays for production stability
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
  return [];
}

export async function fetchEthereumTransactions(): Promise<Transaction[]> {
  try {
    const transactions: Transaction[] = [];
    
    console.log('🔍 Fetching transactions for GONDI contract:', GONDI_CONTRACT);
    console.log('📅 Date range: Oct 22, 2025 onwards');
    console.log('🔑 API Key present:', !!ETHERSCAN_API_KEY);

    if (!ETHERSCAN_API_KEY) {
      throw new Error('ETHERSCAN_API_KEY is required but not set');
    }

    // Build URLs with start timestamp filter (using V2 API with correct format)
    // PRODUCTION FIX: Use V2 API but with correct parameter structure
    const baseParams = `startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    
    // 1. ERC-20 Token transfers TO the contract (USDC + WETH) - V2 API format
    const tokenUrl = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=${GONDI_CONTRACT}&${baseParams}`;
    
    // 2. Internal ETH transactions TO the contract - V2 API format
    const internalUrl = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlistinternal&address=${GONDI_CONTRACT}&${baseParams}`;
    
    // 3. Regular ETH transactions TO the contract - V2 API format
    const normalUrl = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${GONDI_CONTRACT}&${baseParams}`;

    // === COMPREHENSIVE DEBUGGING: Per-Currency Configuration ===
    console.log('🔍 === CURRENCY CONFIGURATION AUDIT ===');
    const currencyConfigs = [
      {
        name: 'ERC20_TOKENS_USDC_WETH',
        chainId: 1,
        contractAddress: GONDI_CONTRACT,
        tokenContracts: [USDC_CONTRACT, WETH_CONTRACT],
        startTimestamp: START_TIMESTAMP,
        url: tokenUrl,
        expectedCurrencies: ['USDC', 'WETH']
      },
      {
        name: 'INTERNAL_ETH',
        chainId: 1, 
        contractAddress: GONDI_CONTRACT,
        tokenContracts: [],
        startTimestamp: START_TIMESTAMP,
        url: internalUrl,
        expectedCurrencies: ['ETH']
      },
      {
        name: 'NORMAL_ETH',
        chainId: 1,
        contractAddress: GONDI_CONTRACT, 
        tokenContracts: [],
        startTimestamp: START_TIMESTAMP,
        url: normalUrl,
        expectedCurrencies: ['ETH']
      }
    ];
    
    currencyConfigs.forEach((config, index) => {
      console.log(`📋 Config ${index + 1}: ${config.name}`);
      console.log(`   - ChainId: ${config.chainId}`);
      console.log(`   - Contract: ${config.contractAddress}`);
      console.log(`   - Token Contracts: [${config.tokenContracts.join(', ')}]`);
      console.log(`   - Start Timestamp: ${config.startTimestamp} (${new Date(config.startTimestamp * 1000).toISOString()})`);
      console.log(`   - Expected Currencies: [${config.expectedCurrencies.join(', ')}]`);
      console.log(`   - URL (masked): ${config.url.substring(0, 80)}...`);
    });
    
    console.log('🔗 Starting parallel API calls...');
    
    // Add timing and detailed execution tracking
    const callStartTime = Date.now();
    
    // PRODUCTION FIX: Use sequential calls instead of Promise.allSettled to avoid timeout issues
    // This ensures token transactions (USDC/WETH) are processed properly in production
    let tokenResults: PromiseSettledResult<any[]>;
    let internalResults: PromiseSettledResult<any[]>;
    let normalResults: PromiseSettledResult<any[]>;
    
    try {
      // First: Fetch token transactions (USDC/WETH) - this is the critical failing call
      console.log('⏱️  STARTING Token API call (USDC/WETH) - SEQUENTIAL MODE');
      const tokenStart = Date.now();
      const tokenData = await fetchWithRetry(tokenUrl);
      tokenResults = { status: 'fulfilled', value: tokenData } as PromiseFulfilledResult<any[]>;
      console.log(`⏱️  COMPLETED Token API call in ${Date.now() - tokenStart}ms - Got ${tokenData.length} results`);
    } catch (error) {
      console.log(`⏱️  FAILED Token API call - Error:`, error);
      tokenResults = { status: 'rejected', reason: error } as PromiseRejectedResult;
    }
    
    try {
      // Second: Fetch internal ETH transactions
      console.log('⏱️  STARTING Internal ETH API call - SEQUENTIAL MODE');
      const internalStart = Date.now();
      const internalData = await fetchWithRetry(internalUrl);
      internalResults = { status: 'fulfilled', value: internalData } as PromiseFulfilledResult<any[]>;
      console.log(`⏱️  COMPLETED Internal ETH API call in ${Date.now() - internalStart}ms - Got ${internalData.length} results`);
    } catch (error) {
      console.log(`⏱️  FAILED Internal ETH API call - Error:`, error);
      internalResults = { status: 'rejected', reason: error } as PromiseRejectedResult;
    }
    
    try {
      // Third: Fetch normal ETH transactions
      console.log('⏱️  STARTING Normal ETH API call - SEQUENTIAL MODE');
      const normalStart = Date.now();
      const normalData = await fetchWithRetry(normalUrl);
      normalResults = { status: 'fulfilled', value: normalData } as PromiseFulfilledResult<any[]>;
      console.log(`⏱️  COMPLETED Normal ETH API call in ${Date.now() - normalStart}ms - Got ${normalData.length} results`);
    } catch (error) {
      console.log(`⏱️  FAILED Normal ETH API call - Error:`, error);
      normalResults = { status: 'rejected', reason: error } as PromiseRejectedResult;
    }
    
    console.log(`⏱️  ALL API CALLS COMPLETED in ${Date.now() - callStartTime}ms`);
    console.log('📊 === DETAILED API RESULTS SUMMARY ===');
    console.log('  - Token Results Status:', tokenResults.status, 
      tokenResults.status === 'fulfilled' ? `(${tokenResults.value.length} results)` : `(${tokenResults.reason})`);
    console.log('  - Internal Results Status:', internalResults.status,
      internalResults.status === 'fulfilled' ? `(${internalResults.value.length} results)` : `(${internalResults.reason})`);
    console.log('  - Normal Results Status:', normalResults.status,
      normalResults.status === 'fulfilled' ? `(${normalResults.value.length} results)` : `(${normalResults.reason})`);

    // Process ERC-20 token transfers (USDC & WETH)
    if (tokenResults.status === 'fulfilled') {
      console.log(`🔍 Processing ${tokenResults.value.length} raw token transactions`);
      
      // Log first few transactions for debugging
      if (tokenResults.value.length > 0) {
        console.log('📋 Sample token transactions:');
        tokenResults.value.slice(0, 3).forEach((tx, i) => {
          console.log(`   ${i + 1}. Contract: ${tx.contractAddress}, Symbol: ${tx.tokenSymbol}, To: ${tx.to}, Value: ${tx.value}, Timestamp: ${tx.timeStamp}`);
        });
      }
      
      const tokens = tokenResults.value
        .filter(tx => {
          // Filter by date
          const txTimestamp = parseInt(tx.timeStamp);
          if (txTimestamp < START_TIMESTAMP) {
            console.log(`   🚫 Filtered out (date): ${tx.hash} - ${new Date(txTimestamp * 1000).toISOString()}`);
            return false;
          }
          
          // Must be TO the GONDI contract
          if (tx.to?.toLowerCase() !== GONDI_CONTRACT.toLowerCase()) {
            console.log(`   🚫 Filtered out (to): ${tx.hash} - ${tx.to} vs ${GONDI_CONTRACT}`);
            return false;
          }
          
          // Must have value
          if (!tx.value || BigInt(tx.value) <= 0) {
            console.log(`   🚫 Filtered out (value): ${tx.hash} - ${tx.value}`);
            return false;
          }
          
          // Must be USDC or WETH
          const contractAddress = tx.contractAddress?.toLowerCase();
          const isValidToken = contractAddress === USDC_CONTRACT.toLowerCase() || 
                               contractAddress === WETH_CONTRACT.toLowerCase();
          
          if (!isValidToken) {
            console.log(`   🚫 Filtered out (contract): ${tx.hash} - ${contractAddress} vs ${USDC_CONTRACT}|${WETH_CONTRACT}`);
          } else {
            console.log(`   ✅ Accepted token: ${tx.hash} - ${tx.tokenSymbol} (${contractAddress})`);
          }
          
          return isValidToken;
        })
        .map(tx => ({
          hash: tx.hash,
          timestamp: parseInt(tx.timeStamp) * 1000,
          value: tx.value,
          tokenSymbol: tx.tokenSymbol === 'WETHEREUM' ? 'WETH' : tx.tokenSymbol,
          tokenDecimal: parseInt(tx.tokenDecimal || '18'),
          from: tx.from,
          to: tx.to,
          network: 'ethereum' as const,
          blockNumber: parseInt(tx.blockNumber),
        }));

      transactions.push(...tokens);
      console.log(`✅ Processed ${tokens.length} ERC-20 token transactions (USDC/WETH)`);
    } else {
      console.error('❌ Token transactions (USDC/WETH) failed!');
      console.error('   Reason:', tokenResults.reason);
      console.error('   Error details:', JSON.stringify(tokenResults, null, 2));
      console.error('   This means USDC and WETH revenue will be missing!');
      console.error('   🔍 Debug: Token URL was:', tokenUrl);
      
      // Try a direct retry for token transactions
      console.log('🔄 Attempting direct retry for token transactions...');
      try {
        const retryTokens = await fetchWithRetry(tokenUrl);
        const retryProcessed = retryTokens
          .filter(tx => {
            const txTimestamp = parseInt(tx.timeStamp);
            if (txTimestamp < START_TIMESTAMP) return false;
            if (tx.to?.toLowerCase() !== GONDI_CONTRACT.toLowerCase()) return false;
            if (!tx.value || BigInt(tx.value) <= 0) return false;
            const contractAddress = tx.contractAddress?.toLowerCase();
            return contractAddress === USDC_CONTRACT.toLowerCase() || 
                   contractAddress === WETH_CONTRACT.toLowerCase();
          })
          .map(tx => ({
            hash: tx.hash,
            timestamp: parseInt(tx.timeStamp) * 1000,
            value: tx.value,
            tokenSymbol: tx.tokenSymbol === 'WETHEREUM' ? 'WETH' : tx.tokenSymbol,
            tokenDecimal: parseInt(tx.tokenDecimal || '18'),
            from: tx.from,
            to: tx.to,
            network: 'ethereum' as const,
            blockNumber: parseInt(tx.blockNumber),
          }));
        
        transactions.push(...retryProcessed);
        console.log(`✅ Retry successful! Processed ${retryProcessed.length} ERC-20 token transactions`);
      } catch (retryError) {
        console.error('❌ Retry also failed:', retryError);
      }
    }

    // Process internal ETH transactions
    if (internalResults.status === 'fulfilled') {
      const ethInternal = internalResults.value
        .filter(tx => {
          // Filter by date
          const txTimestamp = parseInt(tx.timeStamp);
          if (txTimestamp < START_TIMESTAMP) return false;
          
          // Must be TO the GONDI contract
          if (tx.to?.toLowerCase() !== GONDI_CONTRACT.toLowerCase()) return false;
          
          // Must have ETH value
          return tx.value && BigInt(tx.value) > 0;
        })
        .map(tx => ({
          hash: tx.hash,
          timestamp: parseInt(tx.timeStamp) * 1000,
          value: tx.value,
          tokenSymbol: 'ETH',
          tokenDecimal: 18,
          from: tx.from,
          to: tx.to,
          network: 'ethereum' as const,
          blockNumber: parseInt(tx.blockNumber || '0'),
        }));

      transactions.push(...ethInternal);
      console.log(`✅ Processed ${ethInternal.length} internal ETH transactions`);
    } else {
      console.error('❌ Internal ETH transactions failed:', internalResults.reason);
    }

    // Process normal ETH transactions 
    if (normalResults.status === 'fulfilled') {
      const ethNormal = normalResults.value
        .filter(tx => {
          // Filter by date
          const txTimestamp = parseInt(tx.timeStamp);
          if (txTimestamp < START_TIMESTAMP) return false;
          
          // Must be TO the GONDI contract
          if (tx.to?.toLowerCase() !== GONDI_CONTRACT.toLowerCase()) return false;
          
          // Must have ETH value
          return tx.value && BigInt(tx.value) > 0;
        })
        .map(tx => ({
          hash: tx.hash,
          timestamp: parseInt(tx.timeStamp) * 1000,
          value: tx.value,
          tokenSymbol: 'ETH',
          tokenDecimal: 18,
          from: tx.from,
          to: tx.to,
          network: 'ethereum' as const,
          blockNumber: parseInt(tx.blockNumber),
        }));

      transactions.push(...ethNormal);
      console.log(`✅ Processed ${ethNormal.length} normal ETH transactions`);
    } else {
      console.error('❌ Normal ETH transactions failed:', normalResults.reason);
    }

    // Remove duplicates (same hash + same value)
    const uniqueTransactions = transactions.filter((tx, index, array) => {
      return array.findIndex(t => t.hash === tx.hash && t.value === tx.value) === index;
    });

    // Log summary
    const summary: Record<string, number> = {};
    uniqueTransactions.forEach(tx => {
      const symbol = tx.tokenSymbol || 'UNKNOWN';
      summary[symbol] = (summary[symbol] || 0) + 1;
    });

    console.log(`🎯 Final Summary: ${uniqueTransactions.length} unique transactions`);
    console.log('📊 By currency:', summary);
    
    // Critical check for missing currencies
    if (!summary['USDC'] || summary['USDC'] === 0) {
      console.error('🚨 WARNING: No USDC transactions found! This indicates token API failure.');
    }
    if (!summary['WETH'] || summary['WETH'] === 0) {
      console.error('🚨 WARNING: No WETH transactions found! This indicates token API failure.');
    }
    if (summary['ETH'] && summary['ETH'] > 0) {
      console.log('✅ ETH transactions found successfully.');
    }
    
    return uniqueTransactions;

  } catch (error) {
    console.error('❌ Error fetching Ethereum transactions:', error);
    return [];
  }
}