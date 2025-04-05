'use client'

import { useEffect, useState } from 'react'
import { getPublicKey } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SimplePool } from 'nostr-tools'

if (!process.env.NEXT_PUBLIC_NOSTR_RELAY_URL) {
  throw new Error('NEXT_PUBLIC_NOSTR_RELAY_URL environment variable is not set')
}

const RELAY_URL = process.env.NEXT_PUBLIC_NOSTR_RELAY_URL

interface ProfileMetadata {
  name?: string
  displayName?: string
  picture?: string
}

export default function Header() {
  const router = useRouter()
  const [npub, setNpub] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileMetadata>({})
  const [pool, setPool] = useState<SimplePool | null>(null)

  useEffect(() => {
    const newPool = new SimplePool()
    setPool(newPool)

    const storedNsec = localStorage.getItem('nostr_nsec')
    if (storedNsec) {
      const { type, data } = nip19.decode(storedNsec)
      if (type === 'nsec') {
        const publicKey = getPublicKey(data)
        const npubEncoded = nip19.npubEncode(publicKey)
        setNpub(npubEncoded)
        fetchProfile(newPool, publicKey)
      }
    }

    return () => {
      newPool.close([RELAY_URL])
    }
  }, [])

  const fetchProfile = async (poolInstance: SimplePool, pubkey: string) => {
    try {
      const events = await poolInstance.querySync([RELAY_URL], {
        kinds: [0],
        authors: [pubkey],
        limit: 1
      })
      if (events.length > 0) {
        try {
          const metadata = JSON.parse(events[0].content)
          setProfile(metadata)
        } catch (e) {
          console.error('Failed to parse profile metadata:', e)
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error)
    }
  }

  const getInitials = () => {
    if (profile.name) {
      return profile.name.slice(0, 2).toUpperCase()
    }
    if (profile.displayName) {
      return profile.displayName.slice(0, 2).toUpperCase()
    }
    if (npub) {
      const { type, data } = nip19.decode(npub)
      if (type === 'npub') {
        return data.slice(0, 2).toUpperCase()
      }
    }
    return '👤'
  }

  return (
    <header className="w-full bg-[hsl(var(--secondary))] border-b border-[hsl(var(--border))] relative z-[49]">
      <div className="w-full flex-1 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[800px] mx-auto w-full">
          <div className="flex items-center justify-between h-16">
            <Link 
              href="/"
              className="text-2xl font-bold hover:opacity-80 transition-opacity cursor-pointer"
              replace={true}
            >
              ZipZap
            </Link>
            {npub && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-8 h-8 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center hover:brightness-90 transition-all cursor-pointer">
                    {getInitials()}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end" 
                  className="z-[100] bg-[hsl(var(--background))] border border-[hsl(var(--border))] mt-2"
                  sideOffset={5}
                >
                  <DropdownMenuItem asChild className="cursor-pointer focus:bg-[hsl(var(--accent))] focus:text-[hsl(var(--accent-foreground))]">
                    <Link href="/profile" className="w-full">Edit Profile</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </header>
  )
} 