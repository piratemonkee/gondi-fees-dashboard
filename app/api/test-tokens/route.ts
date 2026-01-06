import { NextResponse } from 'next/server';

// Test endpoint to verify token API is working in production
export async function GET() {
  try {
    console.log('🧪 Testing token API directly...');
    
    const GONDI_CONTRACT = '0x4169447a424ec645f8a24dccfd8328f714dd5562';
    const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
    
    if (!ETHERSCAN_API_KEY) {
      return NextResponse.json({ error: 'API key missing' });
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
        debug: 'Token API failed'
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
      sample: results.slice(0, 3).map(tx => ({
        contract: tx.contractAddress,
        symbol: tx.tokenSymbol,
        to: tx.to,
        value: tx.value,
        timeStamp: tx.timeStamp
      }))
    });
    
  } catch (error) {
    console.error('🚨 Test API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}