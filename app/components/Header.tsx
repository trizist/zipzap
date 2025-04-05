'use client'

import { useEffect, useState } from 'react'
import { getPublicKey } from 'nostr-tools'
import * as nip19 from 'nostr-tools/nip19'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function Header() {
  const router = useRouter()
  const [npub, setNpub] = useState<string | null>(null)

  useEffect(() => {
    const storedNsec = localStorage.getItem('nostr_nsec')
    if (storedNsec) {
      const { type, data } = nip19.decode(storedNsec)
      if (type === 'nsec') {
        const publicKey = getPublicKey(data)
        const npubEncoded = nip19.npubEncode(publicKey)
        setNpub(npubEncoded)
      }
    }
  }, [])

  return (
    <header className="w-full bg-[hsl(var(--secondary))] border-b border-[hsl(var(--border))]">
      <div className="w-full flex-1 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[800px] mx-auto w-full">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-2xl font-bold">ZipZap</h1>
            {npub && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-8 h-8 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] flex items-center justify-center hover:brightness-90 transition-all">
                    {npub.slice(0, 2)}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => router.push('/profile')}>
                    Edit Profile
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