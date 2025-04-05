'use client'

import Header from '../components/Header'

export default function WalletPage() {
  return (
    <div className="w-full min-h-screen bg-background">
      <Header />
      <div className="w-full flex-1 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[800px] mx-auto w-full">
          <div className="py-8">
            <h1 className="text-3xl font-bold mb-4">Wallet</h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">Coming Soon</p>
          </div>
        </div>
      </div>
    </div>
  )
}