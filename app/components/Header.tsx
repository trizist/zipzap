'use client'

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Link from "next/link"

interface HeaderProps {
  npub: string | null
  picture?: string
  displayName?: string
  onCreateProfile: () => void
}

export default function Header({ npub, picture, displayName, onCreateProfile }: HeaderProps) {
  // Get initials for avatar fallback
  const getInitials = () => {
    if (!displayName) return '👤'
    return displayName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link 
          href="/"
          className="flex items-center space-x-2"
        >
          <span className="font-bold text-xl">ZipZap</span>
        </Link>

        <div className="flex items-center space-x-2">
          {!npub ? (
            <Button
              onClick={onCreateProfile}
              variant="outline"
              size="sm"
            >
              Create Profile
            </Button>
          ) : (
            <Avatar className="h-8 w-8 transition-all hover:scale-105">
              <AvatarImage src={picture} alt={displayName || 'Profile'} />
              <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-700 text-white">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </header>
  )
} 