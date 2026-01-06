import { NextResponse } from 'next/server';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Test endpoint to verify token API is working in production
export async function GET() {
  try {
    console.log('🧪 Testing token API directly...');
    
    const GONDI_CONTRACT = '0x4169447a424ec645f8a24dccfd8328f714dd5562';
    const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
    
    if (!ETHERSCAN_API_KEY) {
      return NextResponse.json({ 
        success: false,
        error: 'API key missing',
        hasApiKey: false
      });
    }
    
    // Test the exact same URL as in blockchain.ts
    const tokenUrl = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=${GONDI_CONTRACT}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    
    console.log('🔗 Testing URL:', tokenUrl.substring(0, 120) + '...');
    
    const response = await fetch(tokenUrl);
    const data = await response.json();
    
    console.log('📊 Raw API Response Status:', data.status);
    console.log('📊 Raw API Response Message:', data.message);
    
    if (data.status === '0') {
      return NextResponse.json({
        success: false,
        error: data.message,
        result: data.result,
        debug: 'Token API failed',
        apiKey: {
          present: !!ETHERSCAN_API_KEY,
          length: ETHERSCAN_API_KEY?.length || 0,
          prefix: ETHERSCAN_API_KEY?.substring(0, 8) || 'N/A'
        }
      });
    }
    
    const results = Array.isArray(data.result) ? data.result : [];
    console.log(`📊 Token transactions count: ${results.length}`);
    
    // Log token contracts in response
    const contracts = new Set(results.map(tx => tx.contractAddress?.toLowerCase()));
    const symbols = new Set(results.map(tx => tx.tokenSymbol));
    
    console.log('📊 Contracts found:', Array.from(contracts));
    console.log('📊 Symbols found:', Array.from(symbols));
    
    return NextResponse.json({
      success: true,
      totalTransactions: results.length,
      contracts: Array.from(contracts),
      symbols: Array.from(symbols),
      apiKey: {
        present: !!ETHERSCAN_API_KEY,
        length: ETHERSCAN_API_KEY?.length || 0,
        prefix: ETHERSCAN_API_KEY?.substring(0, 8) || 'N/A'
      },
      sample: results.slice(0, 3).map(tx => ({
        contract: tx.contractAddress,
        symbol: tx.tokenSymbol,
        to: tx.to,
        value: tx.value,
        timeStamp: tx.timeStamp
      }))
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache'
      }
    });
    
  } catch (error) {
    console.error('🚨 Test API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      debug: 'Exception thrown during API test'
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    });
  }
}