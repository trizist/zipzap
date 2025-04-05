'use client'

import { Button } from "@/components/ui/button"
import { SimplePool } from 'nostr-tools'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from './components/Header'
import * as nip19 from 'nostr-tools/nip19'
import { getPublicKey, getEventHash } from 'nostr-tools'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { finalizeEvent } from 'nostr-tools/pure'
import type { UnsignedEvent } from 'nostr-tools'

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
      // Create the event template
      const eventTemplate: UnsignedEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: message,
        pubkey: '',
      }

      let signedEvent;
      
      // Check for NIP-07 extension first
      const storedPubkey = localStorage.getItem('nostr_pubkey')
      if (storedPubkey) {
        if (!window.nostr) {
          throw new Error('Nostr extension not found')
        }
        eventTemplate.pubkey = storedPubkey
        const sig = await window.nostr.signEvent(eventTemplate)
        const id = getEventHash(eventTemplate)
        signedEvent = { ...eventTemplate, sig, id }
      } else {
        // Fall back to local nsec
        const storedNsec = localStorage.getItem('nostr_nsec')
        if (!storedNsec) {
          throw new Error('No signing method available')
        }
        const { type, data: secretKey } = nip19.decode(storedNsec)
        if (type !== 'nsec') throw new Error('Invalid secret key')
        
        eventTemplate.pubkey = getPublicKey(secretKey)
        signedEvent = finalizeEvent(eventTemplate, secretKey)
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
