import { NextResponse } from 'next/server';

// Sample response mock for development when Phoenix daemon is not available
// Format to match the Phoenix CLI format but with mock data
const MOCK_PAYMENTS = [
  {
    "type": "incoming_payment",
    "subType": "lightning",
    "paymentHash": "aabbcc1122334455667788990011223344556677889900112233445566778899",
    "preimage": "0011223344556677889900112233445566778899001122334455667788990011",
    "isPaid": true,
    "receivedSat": 12,
    "fees": 0,
    "payerNote": `{
  "kind": 9912,
  "created_at": ${Math.floor(Date.now() / 1000) - 300},
  "content": "ZipZap!",
  "tags": [
    ["relays", "wss://relay.example.com"],
    ["lno", "lno1..."],
    ["p", "pubkey1..."],
    ["e", "event1..."]
  ],
  "pubkey": "000000000000000000000000000000000000000000000000000000000000000000",
  "id": "mockid1234567890",
  "sig": "sig000000000000000000000000000000000000000000000000000000000000000000"
}`,
    "payerKey": "000000000000000000000000000000000000000000000000000000000000000001",
    "completedAt": Date.now() - 30000, // 30 seconds ago
    "createdAt": Date.now() - 60000    // 1 minute ago
  },
  {
    "type": "incoming_payment",
    "subType": "lightning",
    "paymentHash": "1122334455667788990011223344556677889900112233445566778899001122",
    "preimage": "2233445566778899001122334455667788990011223344556677889900112233",
    "description": "funding wallet",
    "invoice": "lnbc400u1p0000xxpp50000000000000000000000000000000000000000000000000000000000000000qcqzyssp50000000000000000000000000000000000000000000000000000000000000sqqqqqqqqqqqqqqqqqqqsqqqqqysgq0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000qqqqq0000",
    "isPaid": true,
    "receivedSat": 17573,
    "fees": 22427000,
    "completedAt": Date.now() - 120000,   // 2 minutes ago
    "createdAt": Date.now() - 150000      // 2.5 minutes ago
  }
];

export async function GET() {
  try {
    // Check if we should use mocks (for development/testing)
    const useMock = process.env.USE_MOCK_PHOENIX === 'true';
    
    if (useMock) {
      console.log('Using mock Phoenix API data');
      return NextResponse.json(MOCK_PAYMENTS);
    }
    
    const apiPassword = process.env.PHOENIX_API_PASSWORD;

    if (!apiPassword) {
      console.error('Phoenix API password not configured');
      return NextResponse.json(
        { error: 'Phoenix API password not configured' },
        { status: 500 }
      );
    }

    console.log('Attempting to connect to Phoenix API at http://localhost:9740');
    
    try {
      const response = await fetch('http://localhost:9740/payments/incoming?all=true', {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(`:${apiPassword}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        // Add a shorter timeout so the request doesn't hang for too long
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error(`Phoenix API error (${response.status}):`, errorData);
        return NextResponse.json(
          { error: `Phoenix API error: ${response.status} - ${errorData || response.statusText}` },
          { status: response.status }
        );
      }

      const data = await response.json();
      console.log('Successfully fetched incoming payments. Sample:', 
        data && data.length > 0 ? JSON.stringify(data[0], null, 2) : 'No payments found');
        
      // Return the data directly as an array
      return NextResponse.json(data);
    } catch (fetchError: unknown) {
      console.error('Fetch operation error:', fetchError);
      
      // Check if it's a connection error (most likely phoenixd is not running)
      // Type narrowing for fetchError to check for cause property
      if (fetchError && 
          typeof fetchError === 'object' && 
          'cause' in fetchError && 
          fetchError.cause && 
          typeof fetchError.cause === 'object' && 
          'code' in fetchError.cause && 
          (fetchError.cause.code === 'ECONNREFUSED' || 
           fetchError.cause.code === 'UND_ERR_SOCKET')) {
        // If connection refused and we have the mock option available, return mock data
        if (process.env.NODE_ENV === 'development') {
          console.log('Phoenix daemon not available, using mock data for development');
          return NextResponse.json(MOCK_PAYMENTS);
        }
        
        return NextResponse.json(
          { error: 'Connection to Phoenix daemon refused. Make sure phoenixd is running on port 9740.' },
          { status: 503 }
        );
      }
      
      // Check if it's a timeout
      if (fetchError && 
          typeof fetchError === 'object' && 
          'name' in fetchError && 
          typeof fetchError.name === 'string' &&
          (fetchError.name === 'TimeoutError' || fetchError.name === 'AbortError')) {
        return NextResponse.json(
          { error: 'Connection to Phoenix daemon timed out. The service might be overloaded or not running.' },
          { status: 504 }
        );
      }
      
      throw fetchError; // Re-throw to be caught by the outer catch block
    }
  } catch (error: unknown) {
    console.error('Error in API route:', error);
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}