'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Início', icon: '🏠' },
  { href: '/vendas', label: 'Vendas', icon: '💰' },
  { href: '/clientes', label: 'Clientes', icon: '👥' },
  { href: '/produtos', label: 'Produtos', icon: '📦' },
  { href: '/compras', label: 'Compras', icon: '🛒' },
  { href: '/financeiro', label: 'Financeiro', icon: '📊' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex max-w-md mx-auto">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs
            ${pathname === link.href ? 'text-pink-800 font-medium' : 'text-gray-400'}`}
        >
          <span className="text-xl">{link.icon}</span>
          <span>{link.label}</span>
        </Link>
      ))}
    </nav>
  )
}