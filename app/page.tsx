'use client'

import { Button } from "@/components/ui/button"
import { SimplePool } from 'nostr-tools'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from './components/Header'
import * as nip19 from 'nostr-tools/nip19'
import { getPublicKey, getEventHash, verifyEvent } from 'nostr-tools'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { finalizeEvent } from 'nostr-tools/pure'
import type { UnsignedEvent } from 'nostr-tools'

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
}

export default function Home() {
  const router = useRouter()
  const [pool, setPool] = useState<SimplePool | null>(null)
  const [hasProfile, setHasProfile] = useState(false)
  const [posts, setPosts] = useState<NostrEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)

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

    // Cleanup
    return () => {
      newPool.close([RELAY_URL])
    }
  }, [])

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
          return { ...post, author: authorProfile }
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
                  <div key={post.id} className="bg-[hsl(var(--secondary))] p-4 rounded-lg">
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar className="h-8 w-8">
                        {post.author?.picture ? (
                          <AvatarImage src={post.author.picture} alt={getAuthorDisplayName(post.author, post.pubkey)} />
                        ) : null}
                        <AvatarFallback className="bg-gray-300 border-2 border-[hsl(var(--border))] flex items-center justify-center">{getAuthorInitials(post.author)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{getAuthorDisplayName(post.author, post.pubkey)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(post.created_at)}
                        </p>
                      </div>
                    </div>
                    <p className="mb-2">{post.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
