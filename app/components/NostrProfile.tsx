'use client'

import { Button } from "@/app/components/ui/button"
import { generateSecretKey, getPublicKey, SimplePool } from 'nostr-tools'
import { finalizeEvent } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import { useState, useEffect } from 'react'
import { Textarea } from "@/app/components/ui/textarea"
import { Input } from "@/app/components/ui/input"
import Header from './Header'
import type { UnsignedEvent, Event, Filter } from 'nostr-tools'

if (!process.env.NEXT_PUBLIC_NOSTR_RELAY_URL) {
  throw new Error('NEXT_PUBLIC_NOSTR_RELAY_URL environment variable is not set')
}

const RELAY_URL = process.env.NEXT_PUBLIC_NOSTR_RELAY_URL

interface ProfileMetadata {
  name?: string
  displayName?: string
  website?: string
  about?: string
  lno?: string // BOLT 12 offer
  picture?: string
}

interface ZipZapStats {
  count: number
  totalAmount: number
}

interface PostWithZipZaps extends Event {
  zipZapStats?: ZipZapStats
}

export default function NostrProfile() {
  const [nsec, setNsec] = useState<string | null>(null)
  const [npub, setNpub] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [pool, setPool] = useState<SimplePool | null>(null)
  const [posts, setPosts] = useState<PostWithZipZaps[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [profile, setProfile] = useState<ProfileMetadata>({})
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isZipZapping, setIsZipZapping] = useState<string | null>(null)

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
        
        // Fetch posts and profile when we have the public key
        fetchPosts(newPool, publicKey)
        fetchProfile(newPool, publicKey)
      }
    }

    // Cleanup
    return () => {
      newPool.close([RELAY_URL])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchProfile = async (poolInstance: SimplePool, pubkey: string) => {
    try {
      const filter: Filter = {
        kinds: [0],
        authors: [pubkey],
        limit: 1
      }
      const events = await poolInstance.querySync([RELAY_URL], filter)
      if (events.length > 0) {
        const profileEvent = events[0]
        try {
          const metadata = JSON.parse(profileEvent.content)
          setProfile(metadata)
        } catch (e) {
          console.error('Failed to parse profile metadata:', e)
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error)
    }
  }

  const handleUpdateProfile = async () => {
    if (!nsec || !pool) return

    setIsUpdatingProfile(true)
    try {
      const { type, data: secretKey } = nip19.decode(nsec)
      if (type !== 'nsec') throw new Error('Invalid secret key')

      // Create the metadata event
      const eventTemplate: UnsignedEvent = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(profile),
        pubkey: getPublicKey(secretKey),
      }

      // Sign and publish the event
      const signedEvent = finalizeEvent(eventTemplate, secretKey)
      await pool.publish([RELAY_URL], signedEvent)
    } catch (error) {
      console.error('Failed to update profile:', error)
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const fetchZipZapsForPost = async (poolInstance: SimplePool, postId: string): Promise<ZipZapStats> => {
    try {
      const filter: Filter = {
        kinds: [9912],
        '#e': [postId]
      }
      const events = await poolInstance.querySync([RELAY_URL], filter)
      
      const totalAmount = events.reduce((sum, event) => {
        const amountTag = event.tags.find(tag => tag[0] === 'amount')
        return sum + (amountTag ? parseInt(amountTag[1], 10) : 0)
      }, 0)

      return {
        count: events.length,
        totalAmount
      }
    } catch (error) {
      console.error('Failed to fetch zipzaps for post:', error)
      return { count: 0, totalAmount: 0 }
    }
  }

  const fetchPosts = async (poolInstance: SimplePool, pubkey: string) => {
    setIsLoading(true)
    try {
      const filter: Filter = {
        kinds: [1],
        authors: [pubkey],
        limit: 10
      }
      const events = await poolInstance.querySync([RELAY_URL], filter)
      const sortedEvents = events.sort((a: Event, b: Event) => b.created_at - a.created_at)
      
      // Fetch zipzap stats for each post
      const postsWithStats = await Promise.all(
        sortedEvents.map(async (post) => {
          const stats = await fetchZipZapsForPost(poolInstance, post.id)
          return { ...post, zipZapStats: stats }
        })
      )
      
      setPosts(postsWithStats)
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

  const fetchAuthorProfile = async (pubkey: string): Promise<ProfileMetadata | null> => {
    if (!pool) return null
    
    try {
      const filter: Filter = {
        kinds: [0],
        authors: [pubkey],
        limit: 1
      }
      const events = await pool.querySync([RELAY_URL], filter)
      if (events.length > 0) {
        const profileEvent = events[0]
        try {
          return JSON.parse(profileEvent.content)
        } catch (e) {
          console.error('Failed to parse author profile metadata:', e)
        }
      }
    } catch (error) {
      console.error('Failed to fetch author profile:', error)
    }
    return null
  }

  const handleZipZap = async (post: PostWithZipZaps) => {
    if (!nsec || !pool) return
    
    setIsZipZapping(post.id)
    try {
      // Fetch the author's profile to get their LNO
      const authorProfile = await fetchAuthorProfile(post.pubkey)
      if (!authorProfile?.lno) {
        console.error('Author does not have a BOLT 12 offer configured')
        return
      }

      const { type, data: secretKey } = nip19.decode(nsec)
      if (type !== 'nsec') throw new Error('Invalid secret key')

      // Create the ZipZap event
      const eventTemplate: UnsignedEvent = {
        kind: 9912,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['relays', RELAY_URL],
          ['amount', '1212'],
          ['lno', authorProfile.lno],
          ['p', post.pubkey],
          ['e', post.id]
        ],
        content: 'ZipZap!',
        pubkey: getPublicKey(secretKey),
      }

      // Sign and publish the event
      const signedEvent = finalizeEvent(eventTemplate, secretKey)
      const pub = pool.publish([RELAY_URL], signedEvent)
      
      // Wait for publication with timeout
      await Promise.race([
        pub,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ])

      // After successful zipzap, update the post's stats
      const newStats = await fetchZipZapsForPost(pool, post.id)
      setPosts(prevPosts => 
        prevPosts.map(p => 
          p.id === post.id 
            ? { ...p, zipZapStats: newStats }
            : p
        )
      )

      console.log('ZipZap event broadcast successfully!', {
        eventId: signedEvent.id,
        authorPubkey: post.pubkey,
        postId: post.id
      })
    } catch (error) {
      console.error('Failed to send ZipZap:', error)
    } finally {
      setIsZipZapping(null)
    }
  }

  const formatZipZapStats = (stats?: ZipZapStats) => {
    if (!stats || stats.count === 0) return null
    const requestText = stats.count === 1 ? 'request' : 'requests'
    return `${stats.count} zipzap ${requestText} (${stats.totalAmount} sats)`
  }

  return (
    <div className="w-full -h-screen flex flex-col bg-background">
      <Header 
        npub={npub}
        picture={profile.picture}
        displayName={profile.displayName}
        onCreateProfile={handleCreateProfile}
      />
      
      <div className="w-full flex-1 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[800px] mx-auto w-full">
          <div className="py-6 space-y-6">
            {!npub ? (
              <div className="py-12 text-center">
                <h1 className="text-4xl font-bold tracking-tight sm:text-6xl text-[hsl(var(--foreground))]">
                  ZipZap
                </h1>
                <p className="mt-4 text-lg text-[hsl(var(--muted-foreground))] sm:text-xl">
                  Enter the world of BOLT 12 zaps
                </p>
              </div>
            ) : (
              <div className="space-y-6 w-full">
                {/* Profile Form */}
                <div className="w-full bg-[hsl(var(--secondary))] p-4 rounded-lg">
                  <h3 className="text-lg font-semibold mb-4">Profile Settings</h3>
                  <div className="space-y-3">
                    <Input
                      placeholder="Username"
                      value={profile.name || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                      className="bg-[hsl(var(--background))]"
                    />
                    <Input
                      placeholder="Display Name"
                      value={profile.displayName || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile(prev => ({ ...prev, displayName: e.target.value }))}
                      className="bg-[hsl(var(--background))]"
                    />
                    <Input
                      placeholder="Website"
                      value={profile.website || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile(prev => ({ ...prev, website: e.target.value }))}
                      className="bg-[hsl(var(--background))]"
                    />
                    <Input
                      placeholder="Profile Picture URL"
                      value={profile.picture || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile(prev => ({ ...prev, picture: e.target.value }))}
                      className="bg-[hsl(var(--background))]"
                    />
                    <Textarea
                      placeholder="About Me"
                      value={profile.about || ''}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setProfile(prev => ({ ...prev, about: e.target.value }))}
                      className="bg-[hsl(var(--background))]"
                    />
                    <Input
                      placeholder="BOLT 12 Offer"
                      value={profile.lno || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfile(prev => ({ ...prev, lno: e.target.value }))}
                      className="bg-[hsl(var(--background))]"
                    />
                    <Button 
                      onClick={handleUpdateProfile}
                      disabled={isUpdatingProfile}
                      className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:brightness-90 transition-all"
                    >
                      {isUpdatingProfile ? 'Updating Profile...' : 'Update Profile'}
                    </Button>
                  </div>
                </div>

                {/* Post Creation Form */}
                <div className="w-full space-y-4">
                  <Textarea
                    placeholder="What's on your mind?"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
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

                {/* Posts List */}
                <div className="w-full space-y-4">
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
                          <div className="mt-2 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                                {formatDate(post.created_at)}
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleZipZap(post)}
                                disabled={isZipZapping === post.id}
                                className="text-xs"
                              >
                                {isZipZapping === post.id ? 'Zapping...' : '⚡️ ZipZap'}
                              </Button>
                            </div>
                            {post.zipZapStats && post.zipZapStats.count > 0 && (
                              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                                {formatZipZapStats(post.zipZapStats)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 