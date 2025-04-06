'use client'

import { Button } from "@/app/components/ui/button"
import { SimplePool } from 'nostr-tools'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from './components/Header'
import * as nip19 from 'nostr-tools/nip19'
import { getPublicKey, getEventHash, verifyEvent } from 'nostr-tools'
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar"
import { Textarea } from "@/app/components/ui/textarea"
import { finalizeEvent } from 'nostr-tools/pure'
import type { UnsignedEvent } from 'nostr-tools'
import { LightningIcon } from '@bitcoin-design/bitcoin-icons-react/filled'
import ZipZapModal from './components/ZipZapModal'

// Define a type for any Nostr event
type NostrEventBase = {
  kind: number
  created_at: number
  content: string
  tags: string[][]
  pubkey: string
  id?: string
  sig?: string
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>
      signEvent(event: NostrEventBase): Promise<string>
    }
  }
}

if (!process.env.NEXT_PUBLIC_NOSTR_RELAY_URL) {
  throw new Error('NEXT_PUBLIC_NOSTR_RELAY_URL environment variable is not set')
}

const RELAY_URL = process.env.NEXT_PUBLIC_NOSTR_RELAY_URL

interface ProfileMetadata {
  name?: string
  displayName?: string
  picture?: string
  lno?: string
}

interface ZipZapReceipt {
  id: string
  amount: string
  pubkey: string
}

interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
  author?: ProfileMetadata | null
  zipZapCount?: number
  zipZapReceipts?: ZipZapReceipt[]
}

export default function Home() {
  const router = useRouter()
  const [pool, setPool] = useState<SimplePool | null>(null)
  const [hasProfile, setHasProfile] = useState(false)
  const [posts, setPosts] = useState<NostrEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [isZapping, setIsZapping] = useState<string | null>(null)
  const [zipZapNote, setZipZapNote] = useState<string | null>(null)

  useEffect(() => {
    // Initialize relay pool
    const newPool = new SimplePool()
    setPool(newPool)

    // Check for either login method
    const hasNpub = localStorage.getItem('nostr_npub')
    const hasNsec = localStorage.getItem('nostr_nsec')
    if (hasNpub || hasNsec) {
      setHasProfile(true)
    }

    // Fetch all posts regardless of login status
    fetchPosts(newPool)
    
    // Set up an interval to periodically refresh ZipZap counts
    const refreshInterval = setInterval(() => {
      if (posts.length > 0) {
        console.log('Refreshing ZipZap counts...');
        fetchPosts(newPool);
      }
    }, 60000); // Every minute

    // Cleanup
    return () => {
      clearInterval(refreshInterval);
      newPool.close([RELAY_URL])
    }
  }, [])
  
  // Also refresh posts when a ZipZap is created
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refreshPosts = React.useCallback((poolInstance) => {
    if (poolInstance) {
      fetchPosts(poolInstance);
    }
  }, []);

  useEffect(() => {
    if (zipZapNote && pool) {
      // Wait a bit to allow the event to propagate to the relay
      const timer = setTimeout(() => {
        console.log('Refreshing posts after ZipZap creation...');
        refreshPosts(pool);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [zipZapNote, pool, refreshPosts])

  const fetchAuthorProfile = async (poolInstance: SimplePool, pubkey: string): Promise<ProfileMetadata | null> => {
    try {
      const events = await poolInstance.querySync([RELAY_URL], {
        kinds: [0],
        authors: [pubkey],
        limit: 1
      })
      if (events.length > 0) {
        try {
          return JSON.parse(events[0].content)
        } catch (e) {
          console.error('Failed to parse author profile metadata:', e)
        }
      }
    } catch (error) {
      console.error('Failed to fetch author profile:', error)
    }
    return null
  }

  // Fetch ZipZap receipts (kind 9913) for a given post ID
  const fetchZipZapReceipts = async (poolInstance: SimplePool, postId: string): Promise<{
    count: number;
    receipts: ZipZapReceipt[];
  }> => {
    try {
      // Query for kind 9913 events that have an 'e' tag matching the post ID
      const events = await poolInstance.querySync([RELAY_URL], {
        kinds: [9913],
        '#e': [postId],
        limit: 100 // Reasonable limit
      });
      
      // Store unique receipts by event ID
      const uniqueReceipts = new Map<string, ZipZapReceipt>();
      
      console.log(`Found ${events.length} total ZipZap receipts for post ${postId}`);
      
      // Process each receipt
      events.forEach((event, index) => {
        // Skip invalid events
        if (event.kind !== 9913 || !verifyEvent(event) || !event.id) return;
        
        // Extract amount from tags
        let amount = "0";
        for (const tag of event.tags) {
          if (tag[0] === 'amount' && tag[1]) {
            amount = tag[1];
            break;
          }
        }
        
        // Log receipt info
        console.log(`Receipt ${index + 1}:`, {
          id: event.id.substring(0, 8) + '...',
          pubkey: event.pubkey.substring(0, 8) + '...',
          amount,
          kind: event.kind,
          created_at: new Date(event.created_at * 1000).toISOString()
        });
        
        // Add to unique receipts map if not already present
        if (!uniqueReceipts.has(event.id)) {
          uniqueReceipts.set(event.id, {
            id: event.id,
            amount,
            pubkey: event.pubkey
          });
        }
      });
      
      // Convert map values to array
      const receipts = Array.from(uniqueReceipts.values());
      
      console.log(`Found ${receipts.length} unique valid ZipZap receipts for post ${postId}`);
      return {
        count: receipts.length,
        receipts
      };
    } catch (error) {
      console.error(`Failed to fetch ZipZap receipts for post ${postId}:`, error);
      return {
        count: 0,
        receipts: []
      };
    }
  };

  const fetchPosts = async (poolInstance: SimplePool) => {
    try {
      const events = await poolInstance.querySync([RELAY_URL], {
        kinds: [1],
        limit: 50
      })
      
      // Sort events by timestamp
      const sortedEvents = events.sort((a, b) => b.created_at - a.created_at)
      
      // Fetch author profiles for all posts
      const postsWithAuthors = await Promise.all(
        sortedEvents.map(async (post) => {
          const authorProfile = await fetchAuthorProfile(poolInstance, post.pubkey)
          
          // Only fetch ZipZap receipts for posts from authors with lno tag
          let zipZapCount = 0;
          let zipZapReceipts: ZipZapReceipt[] = [];
          
          if (authorProfile?.lno) {
            const result = await fetchZipZapReceipts(poolInstance, post.id);
            zipZapCount = result.count;
            zipZapReceipts = result.receipts;
          }
          
          return { 
            ...post, 
            author: authorProfile, 
            zipZapCount,
            zipZapReceipts
          };
        })
      )
      
      setPosts(postsWithAuthors)
    } catch (error) {
      console.error('Failed to fetch posts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  const getAuthorInitials = (author: ProfileMetadata | null | undefined) => {
    if (author?.name) {
      return author.name.slice(0, 2).toUpperCase()
    }
    if (author?.displayName) {
      return author.displayName.slice(0, 2).toUpperCase()
    }
    return '👤'
  }

  const getAuthorDisplayName = (author: ProfileMetadata | null | undefined, pubkey?: string) => {
    if (author?.displayName) {
      return author.displayName
    }
    if (author?.name) {
      return author.name
    }
    if (pubkey) {
      return `${pubkey.slice(0, 8)}...`
    }
    return 'Anonymous'
  }

  const handlePublish = async () => {
    if (!pool || !message.trim()) return

    setIsPublishing(true)
    try {
      // Check for NIP-07 extension first
      const storedPubkey = localStorage.getItem('nostr_pubkey')
      if (storedPubkey) {
        if (!window.nostr) {
          throw new Error('Nostr extension not found')
        }
        
        try {
          // Create the base event
          const baseEvent = {
            kind: 1,
            pubkey: storedPubkey,
            created_at: Math.floor(Date.now() / 1000),
            content: message,
            tags: []
          }

          console.log('Base event:', baseEvent)

          // Calculate the event hash
          const id = getEventHash(baseEvent)
          console.log('Event ID:', id)

          // Create the event to sign
          const eventToSign = {
            ...baseEvent,
            id
          }
          console.log('Event to sign:', eventToSign)

          try {
            // Get the signature from Alby
            // @ts-ignore - Ignore type checking for now
            const sig = await window.nostr.signEvent(eventToSign)
            console.log('Raw signature from Alby:', sig)
            console.log('Signature type:', typeof sig)

            // Handle different signature formats
            let finalSig = sig
            if (typeof sig === 'object' && sig !== null) {
              console.log('Signature is an object:', sig)
              // If sig is an object, it might contain the signature in a property
              if ('sig' in sig) {
                finalSig = sig.sig
              } else {
                throw new Error('Unexpected signature format')
              }
            }

            if (!finalSig || typeof finalSig !== 'string') {
              throw new Error('Invalid signature format')
            }

            // Construct the complete signed event
            const completeEvent = {
              ...baseEvent,
              id,
              sig: finalSig
            }
            console.log('Complete event:', completeEvent)

            // Verify the event is valid before publishing
            const isValid = verifyEvent(completeEvent)
            console.log('Event verification result:', isValid)

            if (!isValid) {
              throw new Error('Event verification failed')
            }

            // Publish to relay
            const pub = pool.publish([RELAY_URL], completeEvent)
            await Promise.race([
              pub,
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ])

            // Add the new post to the list with author profile
            const authorProfile = await fetchAuthorProfile(pool, completeEvent.pubkey)
            setPosts(prev => [{ ...completeEvent, author: authorProfile }, ...prev])

            // Clear the message on success
            setMessage('')
          } catch (error) {
            console.error('Signature error:', error)
            throw new Error('Failed to get valid signature from extension')
          }
        } catch (error) {
          console.error('Failed to sign/verify event:', error)
          throw error
        }
      } else {
        // Fall back to local nsec
        const storedNsec = localStorage.getItem('nostr_nsec')
        if (!storedNsec) {
          throw new Error('No signing method available')
        }
        const { type, data: secretKey } = nip19.decode(storedNsec)
        if (type !== 'nsec') throw new Error('Invalid secret key')
        
        const baseEvent = {
          kind: 1,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: message,
          pubkey: getPublicKey(secretKey)
        }
        
        const signedEvent = finalizeEvent(baseEvent, secretKey)

        // Verify the event is valid before publishing
        if (!verifyEvent(signedEvent)) {
          throw new Error('Event verification failed')
        }

        // Publish to relay
        const pub = pool.publish([RELAY_URL], signedEvent)
        await Promise.race([
          pub,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ])

        // Add the new post to the list with author profile
        const authorProfile = await fetchAuthorProfile(pool, signedEvent.pubkey)
        setPosts(prev => [{ ...signedEvent, author: authorProfile }, ...prev])

        // Clear the message on success
        setMessage('')
      }
    } catch (error) {
      console.error('Failed to publish:', error)
      alert('Failed to publish post. Please try again.')
    } finally {
      setIsPublishing(false)
    }
  }

  const handleZap = async (post: NostrEvent) => {
    if (!post.author?.lno || !pool || isZapping) return
    
    setIsZapping(post.id)
    try {
      // Get the public key first
      const storedPubkey = localStorage.getItem('nostr_pubkey')
      const storedNsec = localStorage.getItem('nostr_nsec')
      
      if (!storedPubkey && !storedNsec) {
        throw new Error('No signing method available')
      }

      let pubkey: string
      if (storedPubkey) {
        pubkey = storedPubkey
      } else {
        const { type, data: secretKey } = nip19.decode(storedNsec!)
        if (type !== 'nsec') throw new Error('Invalid secret key')
        pubkey = getPublicKey(secretKey)
      }

      // Create the ZipZap event (kind 9912)
      const baseEvent = {
        kind: 9912,
        created_at: Math.floor(Date.now() / 1000),
        content: 'ZipZap!',
        pubkey,
        tags: [
          ['relays', RELAY_URL],
          ['lno', post.author.lno],
          ['p', post.pubkey],
          ['e', post.id]
        ]
      }

      // Calculate the event hash
      const id = getEventHash(baseEvent)

      if (storedPubkey) {
        if (!window.nostr) {
          throw new Error('Nostr extension not found')
        }

        // Get the signature from Alby
        // @ts-ignore - Ignore type checking for now
        const sig = await window.nostr.signEvent({
          ...baseEvent,
          id
        })

        // Handle different signature formats
        let finalSig = sig
        if (typeof sig === 'object' && sig !== null) {
          if ('sig' in sig) {
            finalSig = sig.sig
          } else {
            throw new Error('Unexpected signature format')
          }
        }

        if (!finalSig || typeof finalSig !== 'string') {
          throw new Error('Invalid signature format')
        }

        // Construct the complete signed event
        const completeEvent = {
          ...baseEvent,
          id,
          sig: finalSig
        }

        // Verify event
        if (!verifyEvent(completeEvent)) {
          throw new Error('Event verification failed')
        }
        
        // Publish the event to the relay
        console.log('Publishing ZipZap event to relay:', RELAY_URL);
        const pub = pool.publish([RELAY_URL], completeEvent);
        
        try {
          await Promise.race([
            pub,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Publish timeout')), 5000))
          ]);
          console.log('Successfully published ZipZap event');
          
          // Encode the event ID as a note and show it
          const noteEncoded = nip19.noteEncode(completeEvent.id);
          setZipZapNote(noteEncoded);
        } catch (pubError) {
          console.error('Failed to publish ZipZap event:', pubError);
          alert('Event created but publishing to relay failed. You can still use the event ID.');
          
          // Still encode the event ID even if publishing failed
          const noteEncoded = nip19.noteEncode(completeEvent.id);
          setZipZapNote(noteEncoded);
        }
      } else {
        // Handle local nsec signing
        const { type, data: secretKey } = nip19.decode(storedNsec!)
        if (type !== 'nsec') throw new Error('Invalid secret key')
        
        const signedEvent = finalizeEvent(baseEvent, secretKey)

        if (!verifyEvent(signedEvent)) {
          throw new Error('Event verification failed')
        }
        
        // Publish the event to the relay
        console.log('Publishing ZipZap event to relay:', RELAY_URL);
        const pub = pool.publish([RELAY_URL], signedEvent);
        
        try {
          await Promise.race([
            pub,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Publish timeout')), 5000))
          ]);
          console.log('Successfully published ZipZap event');
          
          // Encode the event ID as a note and show it
          const noteEncoded = nip19.noteEncode(signedEvent.id);
          setZipZapNote(noteEncoded);
        } catch (pubError) {
          console.error('Failed to publish ZipZap event:', pubError);
          alert('Event created but publishing to relay failed. You can still use the event ID.');
          
          // Still encode the event ID even if publishing failed
          const noteEncoded = nip19.noteEncode(signedEvent.id);
          setZipZapNote(noteEncoded);
        }
      }
    } catch (error) {
      console.error('Failed to create ZipZap:', error)
      alert('Failed to create ZipZap. Please try again.')
    } finally {
      setIsZapping(null)
    }
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <Header />
      <div className="w-full flex-1 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[800px] mx-auto w-full">
          {!hasProfile ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <h2 className="text-4xl font-bold mb-4">Enter the world of BOLT 12 zaps</h2>
              <p className="text-lg text-muted-foreground mb-8">Create your Nostr profile to get started</p>
              <Button 
                onClick={() => router.push('/login')}
                className="bg-gray-900 text-white hover:bg-gray-800 transition-all"
              >
                Get Started
              </Button>
            </div>
          ) : (
            <div className="w-full space-y-4 py-6">
              <Textarea
                placeholder="What's on your mind?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full min-h-[100px] bg-gray-100 dark:bg-gray-800"
              />
              <Button 
                onClick={handlePublish}
                disabled={isPublishing || !message.trim()}
                className="w-full bg-gray-900 text-white hover:bg-gray-800 transition-all"
              >
                {isPublishing ? 'Publishing...' : 'Publish Post'}
              </Button>
            </div>
          )}
          <div className="py-6">
            <h2 className="text-2xl font-bold mb-6">Recent Posts</h2>
            {isLoading ? (
              <div className="text-center text-muted-foreground">Loading posts...</div>
            ) : posts.length === 0 ? (
              <div className="text-center text-muted-foreground">No posts yet</div>
            ) : (
              <div className="space-y-4">
                {posts.map(post => (
                  <div 
                    key={post.id} 
                    className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="w-10 h-10">
                        {post.author?.picture ? (
                          <AvatarImage src={post.author.picture} />
                        ) : null}
                        <AvatarFallback>{getAuthorInitials(post.author)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">
                          {getAuthorDisplayName(post.author, post.pubkey)}
                        </p>
                        <p className="text-xs text-muted-foreground mb-2">
                          {formatDate(post.created_at)}
                        </p>
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {post.content}
                        </p>
                        
                        {/* ZipZap pills display */}
                        {post.zipZapReceipts && post.zipZapReceipts.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {post.zipZapReceipts.map((receipt) => (
                              <div 
                                key={receipt.id} 
                                className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-500 text-black"
                              >
                                {parseInt(receipt.amount).toLocaleString()} sats
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0">
                        {post.author?.lno && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleZap(post)}
                            disabled={isZapping === post.id}
                            className="shrink-0 text-yellow-500 hover:text-yellow-600 hover:bg-yellow-100 dark:hover:bg-yellow-900/20"
                          >
                            <LightningIcon className="w-5 h-5" />
                            <span className="sr-only">ZipZap this post</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <ZipZapModal
        isOpen={!!zipZapNote}
        onClose={() => setZipZapNote(null)}
        noteId={zipZapNote || ''}
      />
    </div>
  )
}
