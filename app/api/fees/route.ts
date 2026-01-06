import { NextResponse } from 'next/server';
import { fetchEthereumTransactions } from '@/lib/blockchain';
import { aggregateFees } from '@/lib/aggregate';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    console.log('🚀 Starting GONDI fee data fetch...');
    
    // URGENT DEBUG: Test if we can make token API call at all in production
    const url = new URL(request.url);
    const debug = url.searchParams.get('debug');
    
    if (debug === 'token-test') {
      console.log('🧪 EMERGENCY TOKEN TEST MODE');
      const GONDI_CONTRACT = '0x4169447a424ec645f8a24dccfd8328f714dd5562';
      const tokenUrl = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=${GONDI_CONTRACT}&startblock=0&endblock=99999999&sort=asc&apikey=${process.env.ETHERSCAN_API_KEY}`;
      
      try {
        const response = await fetch(tokenUrl);
        const data = await response.json();
        console.log('🧪 Emergency token test result:', data.status, data.message);
        console.log('🧪 Transaction count:', data.result?.length || 0);
        
        return NextResponse.json({
          emergencyTest: true,
          status: data.status,
          message: data.message,
          transactionCount: data.result?.length || 0,
          apiKey: !!process.env.ETHERSCAN_API_KEY
        });
      } catch (error) {
        console.log('🧪 Emergency token test failed:', error);
        return NextResponse.json({
          emergencyTest: true,
          error: error instanceof Error ? error.message : String(error),
          apiKey: !!process.env.ETHERSCAN_API_KEY
        });
      }
    }
    
    // === COMPREHENSIVE ENVIRONMENT VARIABLE AUDIT ===
    console.log('🌍 === ENVIRONMENT VARIABLE DEEP INSPECTION ===');
    const envVars = {
      ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      NEXT_RUNTIME: process.env.NEXT_RUNTIME
    };
    
    Object.entries(envVars).forEach(([key, value]) => {
      if (key === 'ETHERSCAN_API_KEY') {
        console.log(`   - ${key}: ${value ? `[PRESENT - ${value.length} chars, starts with "${value.substring(0, 8)}..."]` : '[MISSING]'}`);
      } else {
        console.log(`   - ${key}: ${value || '[MISSING]'}`);
      }
    });
    
    // Check for common environment issues
    console.log('🔍 === ENVIRONMENT VALIDATION ===');
    const validations = [];
    
    if (!process.env.ETHERSCAN_API_KEY) {
      validations.push('❌ CRITICAL: ETHERSCAN_API_KEY is missing');
    } else if (process.env.ETHERSCAN_API_KEY.length < 20) {
      validations.push('⚠️  WARNING: ETHERSCAN_API_KEY seems too short');
    } else {
      validations.push('✅ ETHERSCAN_API_KEY is present and properly formatted');
    }
    
    if (process.env.VERCEL === '1') {
      validations.push('📦 Running in Vercel production environment');
    } else {
      validations.push('💻 Running in local/development environment');
    }
    
    validations.forEach(validation => console.log(`   ${validation}`));
    
    // Fetch Ethereum transactions (USDC, WETH, ETH)
    const transactions = await fetchEthereumTransactions();
    console.log(`📊 Processing ${transactions.length} transactions...`);
    
    // Aggregate fees with USD conversion
    const aggregated = await aggregateFees(transactions);
    
    // Calculate total USD value
    const grandTotalUSD = Object.values(aggregated.currencyBreakdown).reduce((sum, breakdown) => sum + breakdown.totalUSD, 0);
    console.log(`✅ Aggregation complete! Total: $${grandTotalUSD.toFixed(2)}`);

    // Get recent transactions for display
    const { getMultipleTokenPrices } = await import('@/lib/prices');
    const { parseTransactionValue } = await import('@/lib/blockchain');
    
    const currencies = new Set<string>();
    transactions.forEach(tx => {
      if (tx.tokenSymbol) {
        currencies.add(tx.tokenSymbol.toUpperCase());
      }
    });
    const prices = await getMultipleTokenPrices(Array.from(currencies));

    const recentTransactions = [...transactions]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20)
      .map(tx => {
        const currency = (tx.tokenSymbol || '').toUpperCase();
        const value = parseTransactionValue(tx.value, tx.tokenDecimal || 18);
        const price = prices[currency] || 0;
        const usdValue = value * price;
        
        return {
          hash: tx.hash,
          timestamp: tx.timestamp,
          tokenSymbol: tx.tokenSymbol,
          value: tx.value,
          tokenDecimal: tx.tokenDecimal || 18,
          from: tx.from,
          to: tx.to,
          network: tx.network,
          usdValue: usdValue,
        };
      });
    
    return NextResponse.json({
      success: true,
      data: aggregated,
      recentTransactions,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Error fetching fees:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch fee data'
      },
      { status: 500 }
    );
  }
}