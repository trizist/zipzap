import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Button } from "@/app/components/ui/button"

interface ZipZapModalProps {
  isOpen: boolean
  onClose: () => void
  eventJson: string
}

export default function ZipZapModal({ isOpen, onClose, eventJson }: ZipZapModalProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(eventJson)
      alert('Copied to clipboard!')
    } catch (err) {
      console.error('Failed to copy:', err)
      alert('Failed to copy to clipboard')
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>ZipZap Request</DialogTitle>
          <DialogDescription>
            This is a ZipZap Request. The sender of the ZipZap will include this in the payer_note of the invoice_request which must be made against the BOLT 12 offer.
          </DialogDescription>
        </DialogHeader>
        <div className="relative mt-4">
          <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto text-sm">
            {eventJson}
          </pre>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            className="absolute top-2 right-2"
          >
            Copy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 