'use client'

import { Button } from "@/components/ui/button"
import { generateSecretKey, getPublicKey, SimplePool } from 'nostr-tools'
import { finalizeEvent } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import { useState, useEffect } from 'react'
import { Textarea } from "../../components/ui/textarea"
import type { UnsignedEvent, Event, Filter } from 'nostr-tools'

if (!process.env.NEXT_PUBLIC_NOSTR_RELAY_URL) {
  throw new Error('NEXT_PUBLIC_NOSTR_RELAY_URL environment variable is not set')
}

const RELAY_URL = process.env.NEXT_PUBLIC_NOSTR_RELAY_URL

export default function NostrProfile() {
  const [nsec, setNsec] = useState<string | null>(null)
  const [npub, setNpub] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [pool, setPool] = useState<SimplePool | null>(null)
  const [posts, setPosts] = useState<Event[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Initialize relay pool
    const newPool = new SimplePool()
    setPool(newPool)

    // Check localStorage on mount
    const storedNsec = localStorage.getItem('nostr_nsec')
    if (storedNsec) {
      setNsec(storedNsec)
      const { type, data } = nip19.decode(storedNsec)
      if (type === 'nsec') {
        const publicKey = getPublicKey(data)
        const npubKey = nip19.npubEncode(publicKey)
        setNpub(npubKey)
        
        // Fetch posts when we have the public key
        fetchPosts(newPool, publicKey)
      }
    }

    // Cleanup
    return () => {
      newPool.close([RELAY_URL])
    }
  }, [])

  const fetchPosts = async (poolInstance: SimplePool, pubkey: string) => {
    setIsLoading(true)
    try {
      const filter: Filter = {
        kinds: [1],
        authors: [pubkey],
        limit: 10
      }
      const events = await poolInstance.querySync([RELAY_URL], filter)
      setPosts(events.sort((a: Event, b: Event) => b.created_at - a.created_at))
    } catch (error) {
      console.error('Failed to fetch posts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateProfile = () => {
    const sk = generateSecretKey()
    const nsecKey = nip19.nsecEncode(sk)
    const publicKey = getPublicKey(sk)
    const npubKey = nip19.npubEncode(publicKey)
    
    localStorage.setItem('nostr_nsec', nsecKey)
    setNsec(nsecKey)
    setNpub(npubKey)
  }

  const handlePublish = async () => {
    if (!nsec || !pool || !message.trim()) return

    setIsPublishing(true)
    try {
      const { type, data: secretKey } = nip19.decode(nsec)
      if (type !== 'nsec') throw new Error('Invalid secret key')

      // Create the event
      const eventTemplate: UnsignedEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: message,
        pubkey: getPublicKey(secretKey),
      }

      // Sign the event
      const signedEvent = finalizeEvent(eventTemplate, secretKey)

      // Publish to relay
      const pub = pool.publish([RELAY_URL], signedEvent)
      await Promise.race([
        pub,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ])

      // Add the new post to the list
      setPosts(prev => [signedEvent, ...prev])

      // Clear the message on success
      setMessage('')
    } catch (error) {
      console.error('Failed to publish:', error)
    } finally {
      setIsPublishing(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl text-[hsl(var(--foreground))]">
        ZipZap
      </h1>
      <p className="text-lg text-[hsl(var(--muted-foreground))] sm:text-xl">
        Enter the world of BOLT 12 zaps
      </p>
      {!npub ? (
        <Button 
          size="lg" 
          className="mt-6 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90 transition-all font-medium"
          onClick={handleCreateProfile}
        >
          Create Nostr Profile
        </Button>
      ) : (
        <div className="flex flex-col items-center gap-4 w-full max-w-md">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Your Nostr public key:</p>
          <code className="px-4 py-2 bg-[hsl(var(--secondary))] rounded-lg text-sm font-mono break-all">
            {npub}
          </code>
          <div className="w-full space-y-4 mt-4">
            <Textarea
              placeholder="What's on your mind?"
              value={message}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
              className="w-full min-h-[100px] bg-[hsl(var(--secondary))]"
            />
            <Button 
              onClick={handlePublish}
              disabled={isPublishing || !message.trim()}
              className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90 transition-all"
            >
              {isPublishing ? 'Publishing...' : 'Publish Post'}
            </Button>
          </div>

          <div className="w-full mt-8 space-y-4">
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">Your Posts</h2>
            {isLoading ? (
              <p className="text-[hsl(var(--muted-foreground))]">Loading posts...</p>
            ) : posts.length === 0 ? (
              <p className="text-[hsl(var(--muted-foreground))]">No posts yet. Write your first post!</p>
            ) : (
              <div className="space-y-4">
                {posts.map(post => (
                  <div 
                    key={post.id} 
                    className="p-4 rounded-lg bg-[hsl(var(--secondary))] text-left"
                  >
                    <p className="text-[hsl(var(--foreground))]">{post.content}</p>
                    <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                      {formatDate(post.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
} 