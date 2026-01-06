import { NextResponse } from 'next/server';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Only enable in development or with special header
    const isDev = process.env.NODE_ENV === 'development';
    const debugHeader = request.headers.get('x-debug-auth');
    const isAuthorized = isDev || debugHeader === 'debug-gondi-2024';
    
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Debug endpoint disabled in production. Use x-debug-auth header.' },
        { status: 403 }
      );
    }

    // === COMPREHENSIVE DEBUG INFORMATION ===
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV,
        NEXT_RUNTIME: process.env.NEXT_RUNTIME,
        platform: process.platform,
        nodeVersion: process.version
      },
      apiKey: {
        present: !!process.env.ETHERSCAN_API_KEY,
        length: process.env.ETHERSCAN_API_KEY?.length || 0,
        prefix: process.env.ETHERSCAN_API_KEY?.substring(0, 8) || 'N/A',
        hash: process.env.ETHERSCAN_API_KEY ? 
          require('crypto').createHash('md5').update(process.env.ETHERSCAN_API_KEY).digest('hex').substring(0, 8) : 
          'N/A'
      },
      constants: {
        GONDI_CONTRACT: '0x4169447a424ec645f8a24dccfd8328f714dd5562',
        USDC_CONTRACT: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        WETH_CONTRACT: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        START_DATE: '2025-10-22T00:00:00Z',
        START_TIMESTAMP: Math.floor(new Date('2025-10-22T00:00:00Z').getTime() / 1000)
      },
      expectedCurrencies: {
        count: 3,
        list: ['USDC', 'WETH', 'ETH'],
        sources: {
          'USDC+WETH': 'ERC-20 token transactions API',
          'ETH': 'Internal ETH transactions API'
        }
      },
      apiEndpoints: {
        token: `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&address=0x4169447a424ec645f8a24dccfd8328f714dd5562&startblock=0&endblock=99999999&sort=asc&apikey=${process.env.ETHERSCAN_API_KEY ? '[PRESENT]' : '[MISSING]'}`,
        internal: `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlistinternal&address=0x4169447a424ec645f8a24dccfd8328f714dd5562&startblock=0&endblock=99999999&sort=asc&apikey=${process.env.ETHERSCAN_API_KEY ? '[PRESENT]' : '[MISSING]'}`,
        normal: `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=0x4169447a424ec645f8a24dccfd8328f714dd5562&startblock=0&endblock=99999999&sort=asc&apikey=${process.env.ETHERSCAN_API_KEY ? '[PRESENT]' : '[MISSING]'}`
      }
    };

    return NextResponse.json({
      success: true,
      debug: debugInfo,
      instructions: {
        compareWith: 'Compare this output with local environment',
        lookFor: [
          'Different API key hash/length',
          'Missing environment variables',
          'Different constants or timestamps',
          'Different API endpoint configurations'
        ]
      }
    });

  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Debug endpoint failed',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}