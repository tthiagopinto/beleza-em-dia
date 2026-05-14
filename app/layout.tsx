import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import BottomNav from './components/BottomNav'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Beleza em Dia',
  description: 'Gestão financeira para produtos de salão',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-gray-50 max-w-md mx-auto min-h-screen`}>
        <main className="pb-20">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  )
}