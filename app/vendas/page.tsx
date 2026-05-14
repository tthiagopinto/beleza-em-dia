'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Cliente = {
  id: string
  nome: string
  whatsapp: string
}

type Produto = {
  id: string
  nome: string
  categoria: string
  estoque: number
}

type ItemVenda = {
  produto_id: string
  nome: string
  quantidade: number
  preco_unitario: number
}

type Venda = {
  id: string
  criado_em: string
  total: number
  num_parcelas: number
  forma_pagamento: string
  clientes: { nome: string }
}

export default function Vendas() {
  const [aba, setAba] = useState<'nova' | 'historico'>('nova')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [vendas, setVendas] = useState<Venda[]>([])
  const [clienteId, setClienteId] = useState('')
  const [itens, setItens] = useState<ItemVenda[]>([])
  const [formaPagamento, setFormaPagamento] = useState('pix_parcelado')
  const [numParcelas, setNumParcelas] = useState(1)
  const [primeiraParcela, setPrimeiraParcela] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)

  const [mostraAddItem, setMostraAddItem] = useState(false)
  const [produtoSelecionado, setProdutoSelecionado] = useState('')
  const [qtdItem, setQtdItem] = useState('')
  const [precoItem, setPrecoItem] = useState('')

  useEffect(() => {
    buscarDados()
  }, [])

  async function buscarDados() {
    const [{ data: c }, { data: p }, { data: v }] = await Promise.all([
      supabase.from('clientes').select('*').order('nome'),
      supabase.from('produtos').select('*').order('nome'),
      supabase.from('vendas').select('*, clientes(nome)').order('criado_em', { ascending: false }),
    ])
    setClientes(c || [])
    setProdutos(p || [])
    setVendas(v || [])
  }

  function adicionarItem() {
    if (!produtoSelecionado || !qtdItem || !precoItem) return
    const produto = produtos.find(p => p.id === produtoSelecionado)
    if (!produto) return
    setItens(prev => [...prev, {
      produto_id: produto.id,
      nome: produto.nome,
      quantidade: parseFloat(qtdItem),
      preco_unitario: parseFloat(precoItem.replace(',', '.')),
    }])
    setProdutoSelecionado('')
    setQtdItem('')
    setPrecoItem('')
    setMostraAddItem(false)
  }

  function removerItem(index: number) {
    setItens(itens.filter((_, i) => i !== index))
  }

  function totalVenda() {
    return itens.reduce((sum, i) => sum + i.quantidade * i.preco_unitario, 0)
  }

  function valorParcela() {
    if (!numParcelas) return 0
    return totalVenda() / numParcelas
  }

  async function salvar() {
    if (!clienteId || itens.length === 0 || !primeiraParcela) return
    setSalvando(true)

    const total = totalVenda()

    const { data: venda } = await supabase
      .from('vendas')
      .insert({
        cliente_id: clienteId,
        total,
        forma_pagamento: formaPagamento,
        num_parcelas: numParcelas,
        primeira_parcela: primeiraParcela,
      })
      .select()
      .single()

    if (!venda) { setSalvando(false); return }

    await supabase.from('venda_itens').insert(
      itens.map(i => ({
        venda_id: venda.id,
        produto_id: i.produto_id,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
      }))
    )

    const parcelas = Array.from({ length: numParcelas }, (_, i) => {
      const data = new Date(primeiraParcela + 'T12:00:00')
      data.setMonth(data.getMonth() + i)
      return {
        venda_id: venda.id,
        numero: i + 1,
        valor: valorParcela(),
        vencimento: data.toISOString().split('T')[0],
        status: 'pendente',
      }
    })

    await supabase.from('parcelas_receber').insert(parcelas)

    for (const item of itens) {
      const produto = produtos.find(p => p.id === item.produto_id)
      if (!produto) continue
      const novoEstoque = Math.max(0, (produto.estoque || 0) - item.quantidade)
      await supabase.from('produtos').update({ estoque: novoEstoque }).eq('id', item.produto_id)
    }

    setClienteId('')
    setItens([])
    setFormaPagamento('pix_parcelado')
    setNumParcelas(1)
    setPrimeiraParcela('')
    setSalvando(false)
    setSucesso(true)
    buscarDados()
    setTimeout(() => setSucesso(false), 3000)
  }

  async function excluirVenda(id: string) {
    if (!confirm('Excluir esta venda? As parcelas e o estoque serão revertidos.')) return

    const { data: itensVenda } = await supabase
      .from('venda_itens')
      .select('*')
      .eq('venda_id', id)

    for (const item of itensVenda || []) {
      const produto = produtos.find(p => p.id === item.produto_id)
      if (!produto) continue
      await supabase.from('produtos').update({
        estoque: (produto.estoque || 0) + item.quantidade,
      }).eq('id', item.produto_id)
    }

    await supabase.from('vendas').delete().eq('id', id)
    buscarDados()
  }

  const labelForma: Record<string, string> = {
    pix_parcelado: 'Pix parcelado',
    pix_avista: 'Pix à vista',
    dinheiro: 'Dinheiro',
  }

  return (
    <div className="p-4">
      <h1 className="text-lg font-medium text-gray-800 mb-4">Vendas</h1>

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setAba('nova')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors
            ${aba === 'nova' ? 'bg-pink-100 border-pink-800 text-pink-800' : 'bg-white border-gray-200 text-gray-500'}`}
        >
          Nova venda
        </button>
        <button
          onClick={() => setAba('historico')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors
            ${aba === 'historico' ? 'bg-pink-100 border-pink-800 text-pink-800' : 'bg-white border-gray-200 text-gray-500'}`}
        >
          Histórico
        </button>
      </div>

      {aba === 'nova' && (
        <div className="flex flex-col gap-4">
          {sucesso && (
            <div className="bg-green-100 text-green-700 rounded-xl p-3 text-sm font-medium">
              ✓ Venda registrada com sucesso!
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Cliente *</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={clienteId}
              onChange={e => setClienteId(e.target.value)}
            >
              <option value="">Selecione o cliente...</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs text-gray-400">Produtos</label>
              <button
                onClick={() => setMostraAddItem(!mostraAddItem)}
                className="text-xs text-pink-800 font-medium"
              >
                + Adicionar produto
              </button>
            </div>

            {mostraAddItem && (
              <div className="bg-gray-50 rounded-xl p-3 flex flex-col gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Produto</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={produtoSelecionado}
                    onChange={e => setProdutoSelecionado(e.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {produtos.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nome} ({p.estoque} un.)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Quantidade</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      placeholder="0"
                      type="number"
                      value={qtdItem}
                      onChange={e => setQtdItem(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Preço unit. (R$)</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      placeholder="0,00"
                      value={precoItem}
                      onChange={e => setPrecoItem(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={adicionarItem}
                    disabled={!produtoSelecionado || !qtdItem || !precoItem}
                    className="flex-1 bg-pink-800 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Adicionar
                  </button>
                  <button
                    onClick={() => setMostraAddItem(false)}
                    className="flex-1 border border-gray-200 text-gray-500 py-2 rounded-lg text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {itens.length > 0 && (
              <div className="flex flex-col gap-2">
                {itens.map((item, i) => (
                  <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.nome}</p>
                      <p className="text-xs text-gray-400">
                        {item.quantidade} un. · R$ {item.preco_unitario.toFixed(2).replace('.', ',')} cada
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-700">
                        R$ {(item.quantidade * item.preco_unitario).toFixed(2).replace('.', ',')}
                      </p>
                      <button onClick={() => removerItem(i)} className="text-red-300 text-lg">✕</button>
                    </div>
                  </div>
                ))}
                <div className="bg-gray-50 rounded-xl p-3 flex justify-between">
                  <span className="text-sm font-medium text-gray-600">Total</span>
                  <span className="text-sm font-medium text-gray-800">
                    R$ {totalVenda().toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>
            )}

            {itens.length === 0 && !mostraAddItem && (
              <p className="text-sm text-gray-400 text-center py-4">
                Nenhum produto adicionado ainda
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-2 block">Forma de recebimento</label>
            <div className="grid grid-cols-3 gap-2">
              {['pix_parcelado', 'pix_avista', 'dinheiro'].map(f => (
                <button
                  key={f}
                  onClick={() => { setFormaPagamento(f); setNumParcelas(1) }}
                  className={`py-2 px-2 rounded-xl text-xs font-medium border transition-colors
                    ${formaPagamento === f ? 'bg-pink-100 border-pink-800 text-pink-800' : 'bg-white border-gray-200 text-gray-500'}`}
                >
                  {labelForma[f]}
                </button>
              ))}
            </div>
          </div>

          {formaPagamento === 'pix_parcelado' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Parcelas</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={numParcelas}
                  onChange={e => setNumParcelas(parseInt(e.target.value))}
                >
                  {[1,2,3,4,5,6].map(n => (
                    <option key={n} value={n}>
                      {n}x de R$ {itens.length ? valorParcela().toFixed(2).replace('.', ',') : '0,00'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">1º pagamento</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={primeiraParcela}
                  onChange={e => setPrimeiraParcela(e.target.value)}
                />
              </div>
            </div>
          )}

          {formaPagamento === 'pix_avista' && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Data do recebimento</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={primeiraParcela}
                onChange={e => setPrimeiraParcela(e.target.value)}
              />
            </div>
          )}

          {formaPagamento === 'dinheiro' && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Data do recebimento</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={primeiraParcela}
                onChange={e => setPrimeiraParcela(e.target.value)}
              />
            </div>
          )}

          <button
            onClick={salvar}
            disabled={salvando || !clienteId || itens.length === 0 || !primeiraParcela}
            className="w-full bg-pink-800 text-white py-3 rounded-xl font-medium disabled:opacity-50"
          >
            {salvando ? 'Registrando...' : 'Registrar venda'}
          </button>
        </div>
      )}

      {aba === 'historico' && (
        <div className="flex flex-col gap-3">
          {vendas.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma venda registrada ainda</p>
          )}
          {vendas.map(v => (
            <div key={v.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex justify-between items-start mb-1">
                <div>
                  <p className="font-medium text-gray-800">{v.clientes?.nome}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(v.criado_em).toLocaleDateString('pt-BR')} · {labelForma[v.forma_pagamento]} · {v.num_parcelas}x
                  </p>
                </div>
                <p className="font-medium text-gray-800">R$ {v.total.toFixed(2).replace('.', ',')}</p>
              </div>
              <button
                onClick={() => excluirVenda(v.id)}
                className="text-xs text-red-400 mt-1"
              >
                Excluir venda
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
