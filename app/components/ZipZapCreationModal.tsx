import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"

interface ZipZapCreationModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (amount: number, message: string) => void
  postAuthor: string
  lno?: string
}

export default function ZipZapCreationModal({ 
  isOpen, 
  onClose, 
  onSubmit,
  postAuthor,
  lno
}: ZipZapCreationModalProps) {
  const [amount, setAmount] = useState<number>(21);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [useCustomAmount, setUseCustomAmount] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("ZipZap!");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  
  const handleSubmit = () => {
    setIsSubmitting(true);
    try {
      const finalAmount = useCustomAmount 
        ? parseInt(customAmount || "0", 10) 
        : amount;
      
      if (finalAmount <= 0) {
        alert("Please enter a valid amount greater than 0");
        setIsSubmitting(false);
        return;
      }
      
      onSubmit(finalAmount, message);
    } catch (err) {
      console.error("Error submitting ZipZap:", err);
      setIsSubmitting(false);
    }
  };
  
  const handleAmountSelect = (selectedAmount: number) => {
    setAmount(selectedAmount);
    setUseCustomAmount(false);
  };
  
  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers
    if (/^\d*$/.test(value)) {
      setCustomAmount(value);
      setUseCustomAmount(true);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] sm:max-w-[500px] md:max-w-[640px] bg-gray-950 border-gray-800 overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-white">Send a ZipZap</DialogTitle>
          <DialogDescription className="text-gray-300">
            Send a ZipZap to {postAuthor}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="mt-4 space-y-4 w-full max-w-full overflow-x-hidden">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Choose amount
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              {[12, 21, 99, 1000].map((amt) => (
                <Button 
                  key={amt}
                  type="button"
                  onClick={() => handleAmountSelect(amt)}
                  variant={amount === amt && !useCustomAmount ? "default" : "outline"}
                  className={amount === amt && !useCustomAmount ? "bg-yellow-500 text-black hover:bg-yellow-400" : ""}
                >
                  {amt} sats
                </Button>
              ))}
            </div>
            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Custom amount
              </label>
              <div className="flex flex-wrap gap-2">
                <div className="flex-1 max-w-full">
                  <Input
                    type="number"
                    value={customAmount}
                    onChange={handleCustomAmountChange}
                    onClick={() => setUseCustomAmount(true)}
                    placeholder="Enter custom amount"
                    className={`bg-gray-800 text-gray-200 w-full ${useCustomAmount ? "border-yellow-500" : ""}`}
                  />
                </div>
                <span className="flex items-center text-gray-300">sats</span>
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Message
            </label>
            <Textarea 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message (optional)"
              className="bg-gray-800 text-gray-200"
              rows={3}
            />
          </div>
          
          {lno && (
            <div className="text-xs text-gray-400">
              <p>Recipient Lightning Offer: <span className="font-mono">{lno}</span></p>
            </div>
          )}
        </div>
        
        <DialogFooter className="mt-6 flex flex-col sm:flex-row gap-2">
          <Button
            onClick={onClose}
            variant="outline"
            className="w-full"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isSubmitting || (useCustomAmount && (!customAmount || parseInt(customAmount, 10) <= 0))}
            className="w-full bg-yellow-500 text-black hover:bg-yellow-400"
          >
            {isSubmitting ? "Processing..." : "Send ZipZap"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}