import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Button } from "@/app/components/ui/button"

// Check if wallet is enabled via environment variable
const WALLET_ENABLED = process.env.NEXT_PUBLIC_USE_WALLET === 'true'

interface ZipZapModalProps {
  isOpen: boolean
  onClose: () => void
  noteId: string
  lno?: string
}

export default function ZipZapModal({ isOpen, onClose, noteId, lno }: ZipZapModalProps) {
  const [copied, setCopied] = useState<string | null>(null);
  
  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      alert('Failed to copy to clipboard')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] sm:max-w-[500px] md:max-w-[640px] bg-gray-950 border-gray-800 overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-white">ZipZap Request Created!</DialogTitle>
          <DialogDescription className="text-gray-300">
            Your ZipZap request has been published to the relay. The note ID below can be shared with others to reference this ZipZap request.
            {!WALLET_ENABLED && (
              <p className="mt-2 text-yellow-500">
                Note: Wallet features are currently disabled in this deployment.
              </p>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4 space-y-4 w-full max-w-full overflow-x-hidden">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              ZipZap Note ID
            </label>
            <div className="p-4 rounded-lg bg-gray-800 overflow-x-auto">
              <pre className="text-sm whitespace-pre-wrap break-all text-gray-200">
                {noteId}
              </pre>
            </div>
            
            <Button 
              onClick={() => handleCopy(noteId, "note")}
              className="w-full mt-2 bg-yellow-500 text-black font-medium hover:bg-yellow-400 transition-all"
            >
              {copied === "note" ? 'Copied Note ID!' : 'Copy Note ID'}
            </Button>
            
            <p className="text-xs text-center text-gray-400 mt-2">
              This note ID can be used in Nostr clients to reference your ZipZap request.
            </p>
          </div>
          
          {lno && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Lightning Offer
              </label>
              <div className="p-4 rounded-lg bg-gray-800 overflow-x-auto">
                <pre className="text-sm whitespace-pre-wrap break-all text-gray-200">
                  {lno}
                </pre>
              </div>
              
              <Button 
                onClick={() => handleCopy(lno, "lno")}
                className="w-full mt-2 bg-yellow-500 text-black font-medium hover:bg-yellow-400 transition-all"
              >
                {copied === "lno" ? 'Copied Lightning Offer!' : 'Copy Lightning Offer'}
              </Button>
              
              <p className="text-xs text-center text-gray-400 mt-2">
                This Lightning Offer can be used to pay the recipient directly.
              </p>
            </div>
          )}
          
          {!WALLET_ENABLED && (
            <p className="text-sm text-center text-yellow-500 mt-2">
              Note: Wallet functionality is currently disabled in this deployment.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}