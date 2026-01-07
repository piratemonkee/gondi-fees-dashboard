import { Transaction } from './types';

// Simple cache to prevent rate limiting - cache for 30 minutes
const API_CACHE = new Map<string, { data: any, timestamp: number }>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

function getCachedData(url: string) {
  const cached = API_CACHE.get(url);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log(`📦 Using cached data for ${url.substring(0, 50)}...`);
    return cached.data;
  }
  return null;
}

function setCachedData(url: string, data: any) {
  API_CACHE.set(url, { data, timestamp: Date.now() });
}

// Contract addresses
const GONDI_CONTRACT = '0x4169447a424ec645f8a24dccfd8328f714dd5562';
const USDC_CONTRACT = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // Fixed: Correct USDC contract address
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
  // Check cache first
  const cachedData = getCachedData(url);
  if (cachedData) {
    return cachedData;
  }

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
      
      // Cache successful results for 30 minutes
      setCachedData(url, results);
      
      return results;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Attempt ${i + 1} failed:`, errorMsg);
      
      if (i === retries - 1) {
        console.error('❌ All retry attempts failed');
        throw error;
      }
      
      // Wait before retry - exponential backoff for rate limiting
      const delay = Math.min(5000, 1000 * Math.pow(2, i)); // 1s, 2s, 4s max
      console.log(`⏰ Waiting ${delay}ms before retry due to rate limiting...`);
      await new Promise(resolve => setTimeout(resolve, delay));
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

    // RATE LIMIT FIX: Use V2 API with proper rate limiting
    const baseParams = `startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    
    // 1. ERC-20 Token transfers TO the contract (USDC + WETH) - V2 API
    const tokenUrl = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=${GONDI_CONTRACT}&${baseParams}`;
    
    // 2. Internal ETH transactions TO the contract - V2 API
    const internalUrl = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlistinternal&address=${GONDI_CONTRACT}&${baseParams}`;

    // Rate limiting info
    console.log('🔍 API Configuration (Rate Limit Safe):');
    console.log(`   - Token API: ${tokenUrl.substring(0, 80)}...`);
    console.log(`   - Internal API: ${internalUrl.substring(0, 80)}...`);
    console.log(`   - Using delays between calls to prevent rate limiting`);
    
    console.log('🔗 Starting sequential API calls with rate limiting...');
    
    // RATE LIMIT FIX: Sequential calls with delays to prevent rate limiting
    const callStartTime = Date.now();
    
    // Call 1: Token transactions (most important)
    console.log('🔗 Calling token API...');
    const tokenResults = await Promise.allSettled([fetchWithRetry(tokenUrl)]).then(r => r[0]);
    
    // Wait 1 second between calls to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Call 2: Internal ETH transactions  
    console.log('🔗 Calling internal ETH API...');
    const internalResults = await Promise.allSettled([fetchWithRetry(internalUrl)]).then(r => r[0]);
    
    console.log(`⏱️  ALL API CALLS COMPLETED in ${Date.now() - callStartTime}ms`);
    console.log('📊 === API RESULTS SUMMARY (Rate Limited Safe) ===');
    console.log('  - Token Results Status:', tokenResults.status, 
      tokenResults.status === 'fulfilled' ? `(${tokenResults.value.length} results)` : `(${tokenResults.reason})`);
    console.log('  - Internal Results Status:', internalResults.status,
      internalResults.status === 'fulfilled' ? `(${internalResults.value.length} results)` : `(${internalResults.reason})`);

    // Process ERC-20 token transfers (USDC & WETH) - EXACT LOCAL LOGIC
    if (tokenResults.status === 'fulfilled') {
      const tokens = tokenResults.value
        .filter(tx => {
          // Filter by date
          const txTimestamp = parseInt(tx.timeStamp);
          if (txTimestamp < START_TIMESTAMP) return false;
          
          // Must be TO the GONDI contract
          if (tx.to?.toLowerCase() !== GONDI_CONTRACT.toLowerCase()) return false;
          
          // Must have value
          if (!tx.value || BigInt(tx.value) <= 0) return false;
          
          // Must be USDC or WETH
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

    // Note: Skipping normal ETH transactions to reduce API calls and avoid rate limiting

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