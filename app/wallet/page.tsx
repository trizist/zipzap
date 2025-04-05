'use client'

import { useEffect, useState } from 'react'
import Header from '../components/Header'
import { Button } from '../components/ui/button'

interface IncomingPayment {
  paymentHash: string
  amountMsat: number
  createdAt: number
  receivedAt?: number
  status: 'PENDING' | 'RECEIVED' | 'EXPIRED'
  description?: string
  payerNote?: string
  paymentRequest: string
  expiresAt: number
}

export default function WalletPage() {
  const [incomingPayments, setIncomingPayments] = useState<IncomingPayment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Helper function to format millisatoshi to sats
  const formatSats = (amountMsat: any) => {
    console.log('Amount type:', typeof amountMsat, 'Value:', amountMsat);
    
    if (typeof amountMsat === 'undefined' || amountMsat === null) {
      return '0';
    }
    
    try {
      // If it's an object with amount_msat property (Phoenix API format)
      if (typeof amountMsat === 'object' && amountMsat !== null) {
        // Check if there's a value property (common in Phoenix API v2.x)
        if ('value' in amountMsat) {
          // Make sure to handle value as string or number
          const valueAsNumber = typeof amountMsat.value === 'string' 
            ? parseInt(amountMsat.value, 10) 
            : amountMsat.value;
            
          const sats = Math.floor(valueAsNumber / 1000);
          return isNaN(sats) ? '0' : sats.toLocaleString();
        }
        
        // Alternative format using amount_msat
        if ('amount_msat' in amountMsat) {
          const valueAsNumber = typeof amountMsat.amount_msat === 'string' 
            ? parseInt(amountMsat.amount_msat, 10) 
            : amountMsat.amount_msat;
            
          const sats = Math.floor(valueAsNumber / 1000);
          return isNaN(sats) ? '0' : sats.toLocaleString();
        }
        
        // Debug logging for unknown formats
        console.log('Amount object with unknown structure:', JSON.stringify(amountMsat));
        return '0';
      }
      
      // If it's a string (Phoenix API sometimes returns strings for numbers)
      if (typeof amountMsat === 'string') {
        const sats = Math.floor(parseInt(amountMsat, 10) / 1000);
        return isNaN(sats) ? '0' : sats.toLocaleString();
      }
      
      // If it's a number (our mock format or direct millisatoshi amount)
      if (typeof amountMsat === 'number') {
        // If the amount is very small, it might already be in satoshis rather than millisatoshis
        const sats = amountMsat < 1000 ? amountMsat : Math.floor(amountMsat / 1000);
        return isNaN(sats) ? '0' : sats.toLocaleString();
      }
      
      // Fallback
      return '0';
    } catch (err) {
      console.error('Error formatting amount:', err);
      return '0';
    }
  }

  // Helper function to format timestamp
  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Unknown';
    
    try {
      // Convert string to number if needed
      let timeValue: number;
      
      if (typeof timestamp === 'string') {
        timeValue = parseInt(timestamp, 10);
      } else {
        timeValue = timestamp as number;
      }
      
      // Phoenix CLI returns timestamps in milliseconds
      // Other Phoenix API formats might return timestamps in seconds
      const date = timeValue > 1_000_000_000_000 
        ? new Date(timeValue) // Already in milliseconds
        : new Date(timeValue * 1000); // Convert seconds to milliseconds
        
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.error('Invalid date from timestamp:', timestamp);
        return 'Unknown';
      }
      
      return date.toLocaleString();
    } catch (err) {
      console.error('Error formatting date:', err, 'timestamp:', timestamp);
      return 'Unknown';
    }
  }

  const fetchIncomingPayments = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      console.log('Fetching incoming payments from API...')
      const response = await fetch('/api/wallet/incoming-payments')
      
      const data = await response.json()
      
      if (!response.ok) {
        console.error('API error response:', data)
        throw new Error(data.error || `Error ${response.status}: ${response.statusText}`)
      }
      
      console.log('Received payments data:', data)
      
      // Handle different response formats (our mock vs actual Phoenix API format)
      let payments = [];
      
      if (Array.isArray(data)) {
        // Phoenix API returns an array directly
        console.log('Phoenix API format detected (array)');
        // Map the Phoenix API format to our component's expected format
        payments = data.map((payment, index) => {
          console.log('Processing payment:', JSON.stringify(payment, null, 2));
          
          // Generate a unique payment hash if not available
          const paymentHash = payment.paymentHash || payment.payment_hash || 
                             (payment.id ? `id-${payment.id}` : `payment-${index}-${Date.now()}`);
          
          // Extract amount from Phoenix API format - CLI shows receivedSat in satoshis
          let amountMsat = 0;
          if (payment.receivedSat) {
            // receivedSat is already in satoshis, convert to millisatoshis
            amountMsat = payment.receivedSat * 1000;
          } else if (payment.amount_msat) {
            if (typeof payment.amount_msat === 'object' && payment.amount_msat.value) {
              amountMsat = Number(payment.amount_msat.value);
            } else {
              amountMsat = Number(payment.amount_msat);
            }
          } else if (payment.amount) {
            amountMsat = Number(payment.amount);
          }
          
          // Determine payment status from the CLI format
          let status = 'PENDING';
          if (payment.isPaid === true) {
            status = 'RECEIVED';
          } else if (payment.status) {
            status = payment.status;
          }
          
          // Get description or payerNote and calculate timestamps
          // For BOLT 12 offers, there might be a payerNote instead of description
          const description = payment.description || payment.payerNote || '';
          
          // Handle different timestamp formats
          // createdAt might be in milliseconds in the Phoenix API
          const createdAt = payment.createdAt || payment.created_at || Date.now();
          const receivedAt = payment.completedAt || payment.received_at;
          
          // Phoenix doesn't seem to provide expiry info in the CLI output,
          // so we'll calculate an approximate expiry as 1 hour after creation
          const expiresAt = payment.expiresAt || payment.expires_at || 
                           (typeof createdAt === 'number' && createdAt > 1000000000000 ? 
                            createdAt + 3600000 : // If in milliseconds, add 1 hour 
                            (createdAt as number) * 1000 + 3600000); // If in seconds, convert to ms then add 1 hour
          
          return {
            paymentHash,
            amountMsat,
            createdAt,
            receivedAt,
            status,
            description: payment.description || '',
            payerNote: payment.payerNote || '',
            paymentRequest: payment.invoice || payment.payment_request || '',
            expiresAt
          };
        });
      } else if (data.payments && Array.isArray(data.payments)) {
        // Our mock format has a payments array property
        console.log('Mock format detected (payments property)');
        payments = data.payments;
      } else {
        console.warn('Unexpected response format from API:', data);
      }
      
      console.log('Processed payments:', payments);
      setIncomingPayments(payments)
    } catch (err: any) {
      console.error('Error fetching incoming payments:', err)
      
      // Display friendly error based on status code
      if (err.message.includes('Connection to Phoenix daemon refused')) {
        setError('Could not connect to Phoenix daemon. Make sure it is running and accessible.')
      } else if (err.message.includes('Phoenix API password not configured')) {
        setError('The Phoenix API password is not configured. Please set the PHOENIX_API_PASSWORD environment variable.')
      } else {
        setError(err.message || 'Failed to load payments')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchIncomingPayments()
    
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchIncomingPayments, 30000)
    
    return () => clearInterval(interval)
  }, [])

  // Helper function to get status badge styling
  const getStatusBadge = (status: string) => {
    const normalizedStatus = status?.toUpperCase() || '';
    
    if (normalizedStatus.includes('RECEIVED') || normalizedStatus.includes('SUCCEEDED')) {
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    }
    
    if (normalizedStatus.includes('PENDING') || normalizedStatus.includes('WAITING')) {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    }
    
    if (normalizedStatus.includes('EXPIRED') || normalizedStatus.includes('FAILED')) {
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
    
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
  }
  
  // Helper function to format status for display
  const formatStatus = (status: string) => {
    const normalizedStatus = status?.toUpperCase() || '';
    
    if (normalizedStatus.includes('RECEIVED') || normalizedStatus.includes('SUCCEEDED')) {
      return 'RECEIVED';
    }
    
    if (normalizedStatus.includes('PENDING') || normalizedStatus.includes('WAITING')) {
      return 'PENDING';
    }
    
    if (normalizedStatus.includes('EXPIRED') || normalizedStatus.includes('FAILED')) {
      return 'EXPIRED';
    }
    
    return status || 'UNKNOWN';
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <Header />
      <div className="w-full flex-1 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[800px] mx-auto w-full">
          <div className="py-8">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-3xl font-bold">Wallet</h1>
              <Button 
                onClick={fetchIncomingPayments}
                variant="outline"
                size="sm"
                disabled={isLoading}
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
            
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Incoming Payments</h2>
              
              {error && (
                <div className="p-4 mb-4 rounded-lg bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                  <div className="flex items-start gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-semibold mb-1">Connection Error</p>
                      <p>{error}</p>
                      {(error.includes('Phoenix daemon') || error.includes('PHOENIX_API_PASSWORD')) && (
                        <div className="mt-2 text-sm">
                          <p className="font-medium">Troubleshooting steps:</p>
                          <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                            {error.includes('Phoenix daemon') && (
                              <>
                                <li>Check if Phoenix daemon is running</li>
                                <li>Verify it's listening on port 9740</li>
                                <li>Check configuration and firewall settings if needed</li>
                              </>
                            )}
                            {error.includes('PHOENIX_API_PASSWORD') && (
                              <>
                                <li>Add PHOENIX_API_PASSWORD to your .env file</li>
                                <li>Restart the Next.js server after updating environment variables</li>
                              </>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {isLoading && !error && incomingPayments.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Loading payments...
                </div>
              ) : incomingPayments.length === 0 ? (
                <div className="text-center py-8 border rounded-lg border-dashed border-gray-300 dark:border-gray-700">
                  <p className="text-gray-500 dark:text-gray-400">No incoming payments found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {incomingPayments.map((payment) => (
                    <div 
                      key={payment.paymentHash} 
                      className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-mono text-sm text-gray-600 dark:text-gray-400">
                            {payment.paymentHash.substring(0, 10)}...
                          </span>
                          <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${getStatusBadge(payment.status)}`}>
                            {formatStatus(payment.status)}
                          </span>
                        </div>
                        <div className="text-lg font-bold">
                          {formatSats(payment.amountMsat)} sats
                        </div>
                      </div>
                      
                      {(payment.description || payment.payerNote) && (
                        <div className="text-sm mb-2 text-gray-700 dark:text-gray-300">
                          {payment.description ? (
                            <p>{payment.description}</p>
                          ) : payment.payerNote ? (
                            <div>
                              <p className="font-medium mb-1">Payer Note:</p>
                              <pre className="text-xs bg-gray-200 dark:bg-gray-900 p-2 rounded overflow-auto max-h-40">
                                {payment.payerNote}
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      )}
                      
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 space-y-1">
                        <div className="flex justify-between">
                          <span>Created:</span>
                          <span>{formatDate(payment.createdAt)}</span>
                        </div>
                        {payment.receivedAt && (
                          <div className="flex justify-between">
                            <span>Received:</span>
                            <span>{formatDate(payment.receivedAt)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Expires:</span>
                          <span>{formatDate(payment.expiresAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}