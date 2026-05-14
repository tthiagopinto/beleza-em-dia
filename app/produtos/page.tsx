'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Produto = {
  id: string
  nome: string
  categoria: string
  estoque: number
  custo_medio: number
}

const produtoVazio = {
  nome: '',
  categoria: '',
}

export default function Produtos() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [mostraForm, setMostraForm] = useState(false)
  const [form, setForm] = useState(produtoVazio)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    buscarProdutos()
  }, [])

  async function buscarProdutos() {
    const { data } = await supabase
      .from('produtos')
      .select('*')
      .order('nome')
    setProdutos(data || [])
    setLoading(false)
  }

  async function salvar() {
    if (!form.nome) return
    setSalvando(true)
    const dados = {
      nome: form.nome,
      categoria: form.categoria,
    }
    if (editandoId) {
      await supabase.from('produtos').update(dados).eq('id', editandoId)
    } else {
      await supabase.from('produtos').insert({ ...dados, estoque: 0, custo_medio: 0 })
    }
    setForm(produtoVazio)
    setEditandoId(null)
    setMostraForm(false)
    setSalvando(false)
    buscarProdutos()
  }

  function editar(p: Produto) {
    setForm({ nome: p.nome, categoria: p.categoria || '' })
    setEditandoId(p.id)
    setMostraForm(true)
  }

  function cancelar() {
    setForm(produtoVazio)
    setEditandoId(null)
    setMostraForm(false)
  }

  const filtrados = produtos.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (p.categoria || '').toLowerCase().includes(busca.toLowerCase())
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </div>
  )

  if (mostraForm) return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={cancelar} className="text-gray-400 text-xl">←</button>
        <h1 className="text-lg font-medium text-gray-800">
          {editandoId ? 'Editar produto' : 'Novo produto'}
        </h1>
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Nome *</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Ex: Keratina Pro 1kg"
            value={form.nome}
            onChange={e => setForm({ ...form, nome: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Marca</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Ex: Loreal, Wella, Cadiveu..."
            value={form.categoria}
            onChange={e => setForm({ ...form, categoria: e.target.value })}
          />
        </div>
        <button
          onClick={salvar}
          disabled={salvando || !form.nome}
          className="w-full bg-pink-800 text-white py-3 rounded-xl font-medium disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : 'Salvar produto'}
        </button>
        <button
          onClick={cancelar}
          className="w-full border border-pink-800 text-pink-800 py-3 rounded-xl font-medium"
        >
          Cancelar
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium text-gray-800">Produtos</h1>
        <button
          onClick={() => setMostraForm(true)}
          className="bg-pink-800 text-white text-sm px-4 py-2 rounded-lg"
        >
          + Novo
        </button>
      </div>

      <input
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
        placeholder="Buscar por nome ou marca..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />

      <p className="text-xs text-gray-400 mb-3">{filtrados.length} produtos</p>

      <div className="flex flex-col gap-3">
        {filtrados.map((p) => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex justify-between items-center">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{p.nome}</p>
                <p className="text-xs text-gray-400">{p.categoria || 'Sem marca'}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-gray-400">Estoque</p>
                  <p className={`font-medium text-sm ${p.estoque <= 2 ? 'text-orange-500' : 'text-gray-700'}`}>
                    {p.estoque} un. {p.estoque <= 2 ? '⚠️' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Custo médio</p>
                  <p className="font-medium text-sm text-gray-700">
                    R$ {(p.custo_medio || 0).toFixed(2).replace('.', ',')}
                  </p>
                </div>
                <button onClick={() => editar(p)} className="text-gray-300 text-lg">✎</button>
              </div>
            </div>
          </div>
        ))}
        {filtrados.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            {busca ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado ainda'}
          </p>
        )}
      </div>
    </div>
  )
}
