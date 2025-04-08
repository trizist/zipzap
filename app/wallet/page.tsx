'use client'

import { useEffect, useState } from 'react'
import { SimplePool } from 'nostr-tools'
import { getPublicKey, getEventHash, verifyEvent } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import { finalizeEvent } from 'nostr-tools/pure'
import Header from '../components/Header'
import { Button } from '../components/ui/button'

// Define a Nostr event type
interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

// Define possible types for amountMsat property
type AmountValue = {
  value: string | number;
} | {
  amount_msat: string | number;
}

interface IncomingPayment {
  paymentHash: string
  amountMsat: number | AmountValue
  createdAt: number
  receivedAt?: number
  status: 'PENDING' | 'RECEIVED' | 'EXPIRED'
  description?: string
  payerNote?: string
  paymentRequest: string
  expiresAt: number
  processedZipZap?: boolean  // Tracks if we've already processed a ZipZap for this payment
}

// Get the relay URL from environment variables or use a default
const RELAY_URL = process.env.NEXT_PUBLIC_NOSTR_RELAY_URL || 'wss://relay.example.com';

// Check if wallet is enabled via environment variable
const WALLET_ENABLED = process.env.NEXT_PUBLIC_USE_WALLET === 'true';

// Window.nostr interface is defined in app/types/nostr.d.ts

export default function WalletPage() {
  const [incomingPayments, setIncomingPayments] = useState<IncomingPayment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nostrPool, setNostrPool] = useState<SimplePool | null>(null)
  const [processingZipZap, setProcessingZipZap] = useState<string | null>(null)
  const [processingStatus, setProcessingStatus] = useState<{id: string, status: string, message: string}[]>([])
  const [lastProcessedTime, setLastProcessedTime] = useState<number>(0)

  // Helper function to format millisatoshi to sats
  const formatSats = (amountMsat: unknown) => {
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
            
          // Add type checking for valueAsNumber
          const numericValue = typeof valueAsNumber === 'number' ? valueAsNumber : 0;
          const sats = Math.floor(numericValue / 1000);
          return isNaN(sats) ? '0' : sats.toLocaleString();
        }
        
        // Alternative format using amount_msat
        if ('amount_msat' in amountMsat) {
          const valueAsNumber = typeof amountMsat.amount_msat === 'string' 
            ? parseInt(amountMsat.amount_msat, 10) 
            : amountMsat.amount_msat;
            
          // Add type checking for valueAsNumber
          const numericValue = typeof valueAsNumber === 'number' ? valueAsNumber : 0;
          const sats = Math.floor(numericValue / 1000);
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
  const formatDate = (timestamp: unknown) => {
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
          // Extract description but don't store it in a separate variable unless needed
          payment.description = payment.description || '';
          
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
    } catch (err: unknown) {
      console.error('Error fetching incoming payments:', err)
      
      // Display friendly error based on status code
      if (err instanceof Error && err.message.includes('Connection to Phoenix daemon refused')) {
        setError('Could not connect to Phoenix daemon. Make sure it is running and accessible.')
      } else if (err instanceof Error && err.message.includes('Phoenix API password not configured')) {
        setError('The Phoenix API password is not configured. Please set the PHOENIX_API_PASSWORD environment variable.')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load payments')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Skip if wallet is not enabled
    if (!WALLET_ENABLED) return;
    
    // Initialize the Nostr relay pool
    const pool = new SimplePool();
    setNostrPool(pool);
    
    fetchIncomingPayments();
    
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchIncomingPayments, 30000);
    
    return () => {
      // Clean up
      clearInterval(interval);
      pool.close([RELAY_URL]);
    };
  }, []);
  
  // Process new payments every time incomingPayments changes
  useEffect(() => {
    // Skip if wallet is not enabled
    if (!WALLET_ENABLED) return;
    
    // Check if we need to process any ZipZaps
    const now = Date.now();
    
    // Only process if at least 10 seconds have passed since last check
    // This prevents excessive processing when multiple state updates happen
    if (now - lastProcessedTime < 10000) {
      return;
    }
    
    setLastProcessedTime(now);
    processZipZapPayments();
  // We don't want to add processZipZapPayments as a dependency because it would cause infinite loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingPayments, lastProcessedTime])

  // Helper function to get status badge styling
  const getStatusBadge = (status: string) => {
    const normalizedStatus = status?.toUpperCase() || '';
    
    if (normalizedStatus.includes('RECEIVED') || normalizedStatus.includes('SUCCEEDED')) {
      return 'bg-green-900/30 text-green-400';
    }
    
    if (normalizedStatus.includes('PENDING') || normalizedStatus.includes('WAITING')) {
      return 'bg-yellow-900/30 text-yellow-400';
    }
    
    if (normalizedStatus.includes('EXPIRED') || normalizedStatus.includes('FAILED')) {
      return 'bg-gray-800 text-gray-400';
    }
    
    return 'bg-gray-800 text-gray-400';
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
  
  // Function to extract note IDs from text or JSON
  const extractNoteIds = (text: string): string[] => {
    if (!text) return [];
    
    console.log('Analyzing text for note IDs:', text);
    const foundIds: string[] = [];
    
    // Look for "note1..." pattern (NIP-19 encoded note IDs)
    const noteRegex = /\b(note1[a-zA-Z0-9]{20,})\b/g;
    const directMatches = Array.from(text.matchAll(noteRegex), m => m[1]);
    foundIds.push(...directMatches);
    
    // Try to parse as JSON (for structured payer notes like ZipZap events)
    try {
      // Check if the text might be JSON
      if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        const jsonObj = JSON.parse(text);
        
        // If it's a kind 9912 event, extract its ID
        if (jsonObj && jsonObj.kind === 9912 && jsonObj.id) {
          // Encode the event ID as a note
          try {
            const noteId = nip19.noteEncode(jsonObj.id);
            console.log('Found event ID in JSON and encoded as note:', noteId);
            foundIds.push(noteId);
          } catch (err) {
            console.error('Failed to encode event ID as note:', err);
          }
        }
      }
    } catch {
      // Not valid JSON, ignore
      console.log('Note is not valid JSON, continuing with regex matches only');
    }
    
    console.log('Found note IDs:', foundIds);
    return foundIds;
  }
  
  // Function to decode note ID to hex
  const decodeNoteId = async (noteId: string): Promise<string | null> => {
    try {
      const { type, data } = nip19.decode(noteId);
      if (type === 'note') {
        return data as string; // The hex event ID
      }
      return null;
    } catch (err) {
      console.error('Failed to decode note ID:', err);
      return null;
    }
  }
  
  // Function to fetch a ZipZap event from the relay
  const fetchZipZapEvent = async (eventId: string): Promise<NostrEvent | null> => {
    if (!nostrPool) return null;
    
    try {
      console.log(`Fetching ZipZap event with ID: ${eventId}`);
      
      // Ensure we're using the hex ID format
      let hexId = eventId;
      if (eventId.startsWith('note1')) {
        try {
          const { type, data } = nip19.decode(eventId);
          if (type === 'note') {
            hexId = data as string;
          }
        } catch (err) {
          console.error('Failed to decode note ID:', err);
          return null;
        }
      }
      
      console.log(`Using hex ID for query: ${hexId}`);
      
      // Query with a small timeout to prevent hanging
      const events = await Promise.race([
        nostrPool.querySync([RELAY_URL], {
          ids: [hexId],
          kinds: [9912], // Only kind 9912 (ZipZap request)
        }),
        new Promise<NostrEvent[]>((resolve) => setTimeout(() => resolve([]), 5000))
      ]);
      
      if (events && events.length > 0) {
        console.log('Found ZipZap event:', events[0]);
        return events[0];
      } else {
        console.log('No ZipZap event found with that ID');
        return null;
      }
    } catch (err) {
      console.error('Failed to fetch ZipZap event:', err);
      return null;
    }
  }
  
  // Function to create and publish a ZipZap receipt (kind 9913)
  const createZipZapReceipt = async (zipZapEvent: NostrEvent, payment: IncomingPayment): Promise<boolean> => {
    // Get the target pubkey and post ID from the zipZapEvent
    const targetPubkey = zipZapEvent.pubkey; // pubkey of the ZipZap sender
    
    // Get the post ID and LNO from the ZipZap event tags
    let postId = '';
    let lnoTag = '';
    
    for (const tag of zipZapEvent.tags) {
      if (tag[0] === 'e') {
        postId = tag[1];
      } else if (tag[0] === 'lno') {
        lnoTag = tag[1];
      }
    }
    
    if (!postId) {
      console.error('ZipZap event missing required post ID tag');
      return false;
    }
    
    // Get our pubkey for signing
    const storedPubkey = localStorage.getItem('nostr_pubkey');
    const storedNsec = localStorage.getItem('nostr_nsec');
    
    if (!storedPubkey && !storedNsec) {
      console.error('No signing key available for creating ZipZap receipt');
      return false;
    }
    
    let pubkey: string;
    if (storedPubkey) {
      pubkey = storedPubkey;
    } else {
      const { type, data: secretKey } = nip19.decode(storedNsec!);
      if (type !== 'nsec') {
        console.error('Invalid secret key');
        return false;
      }
      pubkey = getPublicKey(secretKey);
    }
    
    // Fix for "created_at too late" - use a timestamp slightly in the past (30 seconds)
    const now = Math.floor(Date.now() / 1000) - 30;
    
    // For payment receivedAt, ensure it's in seconds, not milliseconds
    const receivedTime = payment.receivedAt ? 
      (payment.receivedAt > 1000000000000 ? Math.floor(payment.receivedAt / 1000) : payment.receivedAt) : 
      now;
    
    // Use the earlier of the two timestamps to prevent "created_at too late" errors
    const safeTimestamp = Math.min(now, receivedTime);
    
    // Get payment amount in satoshis for the amount tag
    let amountSats = "0";
    if (typeof payment.amountMsat === 'number') {
      amountSats = String(Math.floor(payment.amountMsat / 1000));
    } else if (typeof payment.amountMsat === 'object' && payment.amountMsat !== null) {
      // Check if it has a value property (type checking)
      if ('value' in payment.amountMsat && payment.amountMsat.value) {
        const valueProp = payment.amountMsat.value;
        const numValue = typeof valueProp === 'string' ? parseInt(valueProp, 10) : Number(valueProp);
        amountSats = String(Math.floor(numValue / 1000));
      }
    }
    
    console.log(`Creating ZipZap receipt with timestamp ${safeTimestamp} and amount ${amountSats} sats`);
    
    // Create the receipt event
    const receiptEvent = {
      kind: 9913,
      created_at: safeTimestamp,
      pubkey,
      tags: [
        ['p', pubkey], // my pubkey as the recipient
        ['P', targetPubkey], // pubkey of the ZipZap sender
        ['e', postId], // id of the post that was zapped
        ['amount', amountSats], // Add the payment amount in sats
      ],
      content: '',
    };
    
    // Add lno tag if available
    if (lnoTag) {
      receiptEvent.tags.push(['lno', lnoTag]);
    }
    
    // Calculate the ID
    const id = getEventHash(receiptEvent);
    const eventToSign = { ...receiptEvent, id };
    
    try {
      let signedEvent: NostrEvent;
      
      // Sign with extension or local key
      if (storedPubkey) {
        if (!window.nostr) {
          throw new Error('Nostr extension not found');
        }
        
        const sig = await window.nostr.signEvent(eventToSign);
        
        // Handle different signature formats
        let finalSig: string = '';
        if (typeof sig === 'string') {
          finalSig = sig;
        } else if (typeof sig === 'object' && sig !== null && 'sig' in sig && typeof sig.sig === 'string') {
          finalSig = sig.sig;
        } else {
          throw new Error('Unexpected signature format');
        }
        
        signedEvent = {
          ...eventToSign,
          sig: finalSig,
        };
      } else {
        // Sign with local key
        const { type, data: secretKey } = nip19.decode(storedNsec!);
        if (type !== 'nsec') throw new Error('Invalid secret key');
        
        signedEvent = finalizeEvent(eventToSign, secretKey);
      }
      
      // Verify the event
      if (!verifyEvent(signedEvent)) {
        throw new Error('Event verification failed');
      }
      
      // Publish to relay
      console.log('Publishing ZipZap receipt:', signedEvent);
      const pub = nostrPool!.publish([RELAY_URL], signedEvent);
      
      await Promise.race([
        pub,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Publish timeout')), 5000))
      ]);
      
      console.log('Successfully published ZipZap receipt');
      return true;
    } catch (err) {
      console.error('Failed to create or publish ZipZap receipt:', err);
      return false;
    }
  }
  
  // Function to process all unprocessed payments
  const processZipZapPayments = async () => {
    if (!nostrPool || processingZipZap) return;
    
    // Look for received payments with payer notes containing "note1..."
    const paymentsToProcess = incomingPayments.filter(payment => 
      (payment.status === 'RECEIVED' || formatStatus(payment.status) === 'RECEIVED') && 
      !payment.processedZipZap &&
      (payment.payerNote || payment.description)
    );
    
    if (paymentsToProcess.length === 0) return;
    
    console.log(`Found ${paymentsToProcess.length} payments to check for ZipZap notes`);
    
    // Process each payment one by one
    for (const payment of paymentsToProcess) {
      try {
        setProcessingZipZap(payment.paymentHash);
        
        // Extract note IDs from payer note or description
        const text = payment.payerNote || payment.description || '';
        const noteIds = extractNoteIds(text);
        
        if (noteIds.length === 0) {
          // No note IDs found, mark as processed and continue
          setIncomingPayments(prev => prev.map(p => 
            p.paymentHash === payment.paymentHash ? { ...p, processedZipZap: true } : p
          ));
          continue;
        }
        
        console.log(`Found ${noteIds.length} note IDs in payment ${payment.paymentHash}`, noteIds);
        
        // Process the first note ID we find
        const noteId = noteIds[0];
        
        // Update status
        setProcessingStatus(prev => [...prev, {
          id: payment.paymentHash,
          status: 'decoding',
          message: `Decoding note ID: ${noteId}`
        }]);
        
        // Decode note ID to get the event ID
        const eventId = await decodeNoteId(noteId);
        if (!eventId) {
          console.log('Failed to decode note ID, marking payment as processed');
          setIncomingPayments(prev => prev.map(p => 
            p.paymentHash === payment.paymentHash ? { ...p, processedZipZap: true } : p
          ));
          continue;
        }
        
        // Update status
        setProcessingStatus(prev => [...prev, {
          id: payment.paymentHash,
          status: 'fetching',
          message: `Fetching ZipZap event with ID: ${eventId}`
        }]);
        
        // Fetch the ZipZap event
        const zipZapEvent = await fetchZipZapEvent(eventId);
        if (!zipZapEvent) {
          console.log('No ZipZap event found for this note ID, marking payment as processed');
          setIncomingPayments(prev => prev.map(p => 
            p.paymentHash === payment.paymentHash ? { ...p, processedZipZap: true } : p
          ));
          continue;
        }
        
        // Verify it's a kind 9912 event
        if (zipZapEvent.kind !== 9912) {
          console.log('Found event is not a ZipZap request (kind 9912), marking payment as processed');
          setIncomingPayments(prev => prev.map(p => 
            p.paymentHash === payment.paymentHash ? { ...p, processedZipZap: true } : p
          ));
          continue;
        }
        
        // Update status
        setProcessingStatus(prev => [...prev, {
          id: payment.paymentHash,
          status: 'creating',
          message: 'Creating and publishing ZipZap receipt'
        }]);
        
        // Create and publish the ZipZap receipt
        const success = await createZipZapReceipt(zipZapEvent, payment);
        
        // Update status
        setProcessingStatus(prev => [...prev, {
          id: payment.paymentHash,
          status: success ? 'success' : 'error',
          message: success ? 'ZipZap receipt published successfully' : 'Failed to publish ZipZap receipt'
        }]);
        
        // Mark payment as processed regardless of outcome
        setIncomingPayments(prev => prev.map(p => 
          p.paymentHash === payment.paymentHash ? { ...p, processedZipZap: true } : p
        ));
      } catch (err) {
        console.error(`Error processing payment ${payment.paymentHash}:`, err);
        
        // Update status
        setProcessingStatus(prev => [...prev, {
          id: payment.paymentHash,
          status: 'error',
          message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
        }]);
        
        // Mark as processed to avoid infinite retry
        setIncomingPayments(prev => prev.map(p => 
          p.paymentHash === payment.paymentHash ? { ...p, processedZipZap: true } : p
        ));
      }
    }
    
    // Reset processing state
    setProcessingZipZap(null);
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <Header />
      <div className="w-full flex-1 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[800px] mx-auto w-full">
          <div className="py-8">
            {!WALLET_ENABLED ? (
              <div className="p-8 text-center border-2 border-dashed border-gray-700 rounded-lg">
                <h2 className="text-2xl font-bold mb-4">Wallet Not Activated</h2>
                <p className="text-gray-400 mb-6">
                  The wallet feature is not enabled in this deployment.
                </p>
                <p className="text-sm text-gray-500">
                  Set <code className="bg-gray-800 px-1 py-0.5 rounded">NEXT_PUBLIC_USE_WALLET=true</code> in your environment variables to enable it.
                </p>
              </div>
            ) : (
              <>
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
                                    <li>Verify it&apos;s listening on port 9740</li>
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
                    <div className="text-center py-8 text-gray-400">
                      Loading payments...
                    </div>
                  ) : incomingPayments.length === 0 ? (
                    <div className="text-center py-8 border rounded-lg border-dashed border-gray-700">
                      <p className="text-gray-400">No incoming payments found</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {incomingPayments.map((payment) => (
                        <div 
                          key={payment.paymentHash} 
                          className="p-4 rounded-lg bg-gray-800 border border-gray-700"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="font-mono text-sm text-gray-400">
                                {payment.paymentHash.substring(0, 10)}...
                              </span>
                              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${getStatusBadge(payment.status)}`}>
                                {formatStatus(payment.status)}
                              </span>
                              {payment.processedZipZap && (
                                <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-purple-900/30 text-purple-400">
                                  ZipZap
                                </span>
                              )}
                            </div>
                            <div className="text-lg font-bold">
                              {formatSats(payment.amountMsat)} sats
                            </div>
                          </div>
                          
                          {(payment.description || payment.payerNote) && (
                            <div className="text-sm mb-2 text-gray-300">
                              {payment.description ? (
                                <p>{payment.description}</p>
                              ) : payment.payerNote ? (
                                <div>
                                  <p className="font-medium mb-1">Payer Note:</p>
                                  <pre className="text-xs bg-gray-900 p-2 rounded overflow-auto max-h-40">
                                    {payment.payerNote}
                                  </pre>
                                </div>
                              ) : null}
                            </div>
                          )}
                          
                          <div className="text-xs text-gray-400 mt-2 space-y-1">
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
                
                {/* ZipZap Processing Status */}
                {processingStatus.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold mb-4">ZipZap Processing</h2>
                    <div className="space-y-2">
                      {processingStatus.slice(-10).map((status, index) => (
                        <div 
                          key={`${status.id}-${index}`}
                          className={`p-3 rounded-lg text-sm ${
                            status.status === 'error' ? 'bg-red-900/30 text-red-400' :
                            status.status === 'success' ? 'bg-green-900/30 text-green-400' :
                            'bg-blue-900/30 text-blue-400'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {status.status === 'error' ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                              </svg>
                            ) : status.status === 'success' ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" fill="none" />
                                <path d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z" strokeOpacity="0.75" fill="none" />
                                <path d="M12 2C6.47715 2 2 6.47715 2 12" strokeLinecap="round" fill="none" />
                              </svg>
                            )}
                            <span>{status.message}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {processingZipZap && (
                      <div className="mt-4">
                        <p className="text-sm text-center text-gray-400">
                          Processing ZipZap for payment {processingZipZap.substring(0, 8)}...
                        </p>
                      </div>
                    )}
                    <Button 
                      onClick={() => setProcessingStatus([])}
                      variant="outline"
                      size="sm"
                      className="mt-4 w-full"
                    >
                      Clear Log
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}