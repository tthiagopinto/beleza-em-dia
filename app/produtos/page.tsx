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

type RankingItem = {
  produto_id: string
  nome: string
  totalQuantidade: number
  totalReceita: number
  lucro: number
}

const produtoVazio = {
  nome: '',
  categoria: '',
}

export default function Produtos() {
  const [aba, setAba] = useState<'lista' | 'ranking'>('lista')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [mostraForm, setMostraForm] = useState(false)
  const [form, setForm] = useState(produtoVazio)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')
  const [ranking, setRanking] = useState<RankingItem[]>([])
  const [rankingPor, setRankingPor] = useState<'quantidade' | 'lucro'>('quantidade')
  const [loadingRanking, setLoadingRanking] = useState(false)

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

  async function buscarRanking() {
    setLoadingRanking(true)
    const { data } = await supabase
      .from('venda_itens')
      .select('produto_id, quantidade, preco_unitario, produtos(nome, custo_medio)')

    if (!data) { setLoadingRanking(false); return }

    const mapa: Record<string, RankingItem> = {}
    for (const item of data) {
      const prod = item.produtos as unknown as { nome: string; custo_medio: number }
      if (!mapa[item.produto_id]) {
        mapa[item.produto_id] = {
          produto_id: item.produto_id,
          nome: prod?.nome || 'Desconhecido',
          totalQuantidade: 0,
          totalReceita: 0,
          lucro: 0,
        }
      }
      const receita = item.quantidade * item.preco_unitario
      const custo = item.quantidade * (prod?.custo_medio || 0)
      mapa[item.produto_id].totalQuantidade += item.quantidade
      mapa[item.produto_id].totalReceita += receita
      mapa[item.produto_id].lucro += receita - custo
    }

    setRanking(Object.values(mapa))
    setLoadingRanking(false)
  }

  function abrirRanking() {
    setAba('ranking')
    if (ranking.length === 0) buscarRanking()
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

  const filtrados = produtos
    .filter(p =>
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      (p.categoria || '').toLowerCase().includes(busca.toLowerCase())
    )
    .sort((a, b) => b.estoque - a.estoque)

  const rankingOrdenado = [...ranking].sort((a, b) =>
    rankingPor === 'quantidade'
      ? b.totalQuantidade - a.totalQuantidade
      : b.lucro - a.lucro
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
        {aba === 'lista' && (
          <button
            onClick={() => setMostraForm(true)}
            className="bg-pink-800 text-white text-sm px-4 py-2 rounded-lg"
          >
            + Novo
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setAba('lista')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors
            ${aba === 'lista' ? 'bg-pink-100 border-pink-800 text-pink-800' : 'bg-white border-gray-200 text-gray-500'}`}
        >
          Produtos
        </button>
        <button
          onClick={abrirRanking}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors
            ${aba === 'ranking' ? 'bg-pink-100 border-pink-800 text-pink-800' : 'bg-white border-gray-200 text-gray-500'}`}
        >
          Ranking
        </button>
      </div>

      {aba === 'lista' && (
        <>
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
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Financeiro</p>
                      <p className="font-medium text-sm text-gray-700">
                        R$ {((p.estoque * p.custo_medio) || 0).toFixed(2).replace('.', ',')}
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
        </>
      )}

      {aba === 'ranking' && (
        <>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setRankingPor('quantidade')}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors
                ${rankingPor === 'quantidade' ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-500'}`}
            >
              Por quantidade
            </button>
            <button
              onClick={() => setRankingPor('lucro')}
              className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors
                ${rankingPor === 'lucro' ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-500'}`}
            >
              Por lucro
            </button>
          </div>

          {loadingRanking && (
            <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
          )}

          {!loadingRanking && rankingOrdenado.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma venda registrada ainda</p>
          )}

          <div className="flex flex-col gap-3">
            {rankingOrdenado.map((item, i) => (
              <div key={item.produto_id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                  ${i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-400'}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{item.nome}</p>
                  <p className="text-xs text-gray-400">
                    {item.totalQuantidade} un. vendidas · receita R$ {item.totalReceita.toFixed(2).replace('.', ',')}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  {rankingPor === 'quantidade' ? (
                    <>
                      <p className="font-medium text-gray-800">{item.totalQuantidade} un.</p>
                      <p className="text-xs text-green-600">lucro R$ {item.lucro.toFixed(2).replace('.', ',')}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-green-700">R$ {item.lucro.toFixed(2).replace('.', ',')}</p>
                      <p className="text-xs text-gray-400">{item.totalQuantidade} un.</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
