'use client'

import { Button } from "@/components/ui/button"
import { SimplePool } from 'nostr-tools'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from './components/Header'
import * as nip19 from 'nostr-tools/nip19'
import { getPublicKey } from 'nostr-tools'

if (!process.env.NEXT_PUBLIC_NOSTR_RELAY_URL) {
  throw new Error('NEXT_PUBLIC_NOSTR_RELAY_URL environment variable is not set')
}

const RELAY_URL = process.env.NEXT_PUBLIC_NOSTR_RELAY_URL

interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export default function Home() {
  const router = useRouter()
  const [pool, setPool] = useState<SimplePool | null>(null)
  const [hasProfile, setHasProfile] = useState(false)
  const [posts, setPosts] = useState<NostrEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Initialize relay pool
    const newPool = new SimplePool()
    setPool(newPool)

    // Check localStorage for credentials
    const storedNsec = localStorage.getItem('nostr_nsec')
    if (storedNsec) {
      setHasProfile(true)
      const { type, data } = nip19.decode(storedNsec)
      if (type === 'nsec') {
        const publicKey = getPublicKey(data)
        fetchPosts(newPool, publicKey)
      }
    } else {
      setIsLoading(false)
    }

    // Cleanup
    return () => {
      newPool.close([RELAY_URL])
    }
  }, [])

  const fetchPosts = async (poolInstance: SimplePool, pubkey: string) => {
    try {
      const events = await poolInstance.querySync([RELAY_URL], {
        kinds: [1],
        authors: [pubkey],
        limit: 10
      })
      setPosts(events.sort((a, b) => b.created_at - a.created_at))
    } catch (error) {
      console.error('Failed to fetch posts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
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
                className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90 transition-all"
              >
                Create Nostr Profile
              </Button>
            </div>
          ) : (
            <div className="py-6">
              <h2 className="text-2xl font-bold mb-6">Your Posts</h2>
              {isLoading ? (
                <div className="text-center text-muted-foreground">Loading posts...</div>
              ) : posts.length === 0 ? (
                <div className="text-center text-muted-foreground">No posts yet</div>
              ) : (
                <div className="space-y-4">
                  {posts.map(post => (
                    <div key={post.id} className="bg-[hsl(var(--secondary))] p-4 rounded-lg">
                      <p className="mb-2">{post.content}</p>
                      <p className="text-sm text-muted-foreground">
                        Posted on {formatDate(post.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
