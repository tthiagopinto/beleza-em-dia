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

type VendaItemDB = {
  id: string
  venda_id: string
  produto_id: string
  quantidade: number
  preco_unitario: number
  produtos: { nome: string }
}

type Parcela = {
  id: string
  valor: number
  status: string
  vencimento?: string
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

  // Itens por venda (carregados on demand)
  const [itensVenda, setItensVenda] = useState<Record<string, VendaItemDB[]>>({})
  const [vendaExpandida, setVendaExpandida] = useState<string | null>(null)
  const [carregandoItens, setCarregandoItens] = useState<string | null>(null)

  // Modais
  const [modalTroca, setModalTroca] = useState<{ venda: Venda; item: VendaItemDB } | null>(null)
  const [modalDesistencia, setModalDesistencia] = useState<{ venda: Venda; item: VendaItemDB } | null>(null)
  const [trocaProdutoId, setTrocaProdutoId] = useState('')
  const [trocaPreco, setTrocaPreco] = useState('')
  const [processando, setProcessando] = useState(false)

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

  async function toggleItens(vendaId: string) {
    if (vendaExpandida === vendaId) {
      setVendaExpandida(null)
      return
    }
    setVendaExpandida(vendaId)
    if (!itensVenda[vendaId]) {
      setCarregandoItens(vendaId)
      const { data } = await supabase
        .from('venda_itens')
        .select('*, produtos(nome)')
        .eq('venda_id', vendaId)
      setItensVenda(prev => ({ ...prev, [vendaId]: (data as unknown as VendaItemDB[]) || [] }))
      setCarregandoItens(null)
    }
  }

  function invalidarItens(vendaId: string) {
    setItensVenda(prev => {
      const next = { ...prev }
      delete next[vendaId]
      return next
    })
    setVendaExpandida(null)
  }

  async function processarDesistencia() {
    if (!modalDesistencia) return
    setProcessando(true)
    const { venda, item } = modalDesistencia

    await supabase.from('venda_itens').delete().eq('id', item.id)

    const produto = produtos.find(p => p.id === item.produto_id)
    if (produto) {
      await supabase
        .from('produtos')
        .update({ estoque: (produto.estoque || 0) + item.quantidade })
        .eq('id', item.produto_id)
    }

    const itemValor = item.quantidade * item.preco_unitario
    const novoTotal = Math.max(0, venda.total - itemValor)
    await supabase.from('vendas').update({ total: novoTotal }).eq('id', venda.id)

    const { data: parcelas } = await supabase
      .from('parcelas_receber')
      .select('id, valor, status')
      .eq('venda_id', venda.id)

    if (parcelas) {
      const recebidas = (parcelas as Parcela[]).filter(p => p.status === 'recebido')
      const pendentes = (parcelas as Parcela[]).filter(p => p.status === 'pendente')
      const totalRecebido = recebidas.reduce((sum, p) => sum + p.valor, 0)
      const novoRestante = Math.max(0, novoTotal - totalRecebido)

      if (pendentes.length > 0) {
        const novoValor = novoRestante / pendentes.length
        for (const parcela of pendentes) {
          await supabase
            .from('parcelas_receber')
            .update({ valor: novoValor })
            .eq('id', parcela.id)
        }
      }
    }

    invalidarItens(venda.id)
    setModalDesistencia(null)
    setProcessando(false)
    buscarDados()
  }

  async function processarTroca() {
    if (!modalTroca || !trocaProdutoId || !trocaPreco) return
    setProcessando(true)
    const { venda, item } = modalTroca

    const novoProduto = produtos.find(p => p.id === trocaProdutoId)
    if (!novoProduto) { setProcessando(false); return }

    const novoPreco = parseFloat(trocaPreco.replace(',', '.'))
    if (isNaN(novoPreco)) { setProcessando(false); return }

    const diferenca = (novoPreco - item.preco_unitario) * item.quantidade

    await supabase.from('venda_itens').delete().eq('id', item.id)

    const produtoOriginal = produtos.find(p => p.id === item.produto_id)
    if (produtoOriginal) {
      await supabase
        .from('produtos')
        .update({ estoque: (produtoOriginal.estoque || 0) + item.quantidade })
        .eq('id', item.produto_id)
    }

    await supabase.from('venda_itens').insert({
      venda_id: venda.id,
      produto_id: trocaProdutoId,
      quantidade: item.quantidade,
      preco_unitario: novoPreco,
    })

    await supabase
      .from('produtos')
      .update({ estoque: Math.max(0, (novoProduto.estoque || 0) - item.quantidade) })
      .eq('id', trocaProdutoId)

    const novoTotal = venda.total + diferenca
    await supabase.from('vendas').update({ total: novoTotal }).eq('id', venda.id)

    if (Math.abs(diferenca) >= 0.01) {
      const vencimento = new Date()
      vencimento.setMonth(vencimento.getMonth() + 1)
      await supabase.from('parcelas_receber').insert({
        venda_id: venda.id,
        numero: 999,
        valor: diferenca,
        vencimento: vencimento.toISOString().split('T')[0],
        status: 'pendente',
      })
    }

    invalidarItens(venda.id)
    setModalTroca(null)
    setTrocaProdutoId('')
    setTrocaPreco('')
    setProcessando(false)
    buscarDados()
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

    const { data: itensVendaDB } = await supabase
      .from('venda_itens')
      .select('*')
      .eq('venda_id', id)

    for (const item of itensVendaDB || []) {
      const produto = produtos.find(p => p.id === item.produto_id)
      if (!produto) continue
      await supabase.from('produtos').update({
        estoque: (produto.estoque || 0) + item.quantidade,
      }).eq('id', item.produto_id)
    }

    await supabase.from('vendas').delete().eq('id', id)
    invalidarItens(id)
    buscarDados()
  }

  // Parcelas
  const [modalParcelas, setModalParcelas] = useState<{ venda: Venda; parcelas: Parcela[] } | null>(null)
  const [carregandoParcelas, setCarregandoParcelas] = useState(false)

  async function abrirParcelas(venda: Venda) {
    setCarregandoParcelas(true)
    const { data } = await supabase
      .from('parcelas_receber')
      .select('id, valor, status, vencimento')
      .eq('venda_id', venda.id)
      .order('numero')

    setModalParcelas({ venda, parcelas: (data as Parcela[]) || [] })
    setCarregandoParcelas(false)
  }

  async function confirmarRecebimento(parcela: Parcela) {
    if (!confirm('Confirmar recebimento desta parcela?')) return
    setProcessando(true)
    const hoje = new Date().toISOString().split('T')[0]
    await supabase
      .from('parcelas_receber')
      .update({ status: 'recebido', recebido_em: hoje })
      .eq('id', parcela.id)
    setProcessando(false)
    if (modalParcelas) abrirParcelas(modalParcelas.venda)
    buscarDados()
  }

  async function recebimentoParcial(parcela: Parcela) {
    const texto = prompt('Valor recebido (use ponto ou vírgula):', parcela.valor.toString())
    if (!texto) return
    const recebido = parseFloat(texto.replace(',', '.'))
    if (isNaN(recebido) || recebido <= 0) { alert('Valor inválido'); return }

    setProcessando(true)
    const restante = Math.max(0, parcela.valor - recebido)

    // Atualiza a parcela atual com o valor recebido e marca como recebido
    const hoje = new Date().toISOString().split('T')[0]
    await supabase
      .from('parcelas_receber')
      .update({ valor: recebido, status: 'recebido', recebido_em: hoje })
      .eq('id', parcela.id)

    // Se houver saldo restante, cria uma nova parcela pendente com o restante
    if (restante > 0) {
      const vencimento = parcela.vencimento || hoje
      if (modalParcelas && modalParcelas.venda && modalParcelas.venda.id) {
        await supabase.from('parcelas_receber').insert({
          venda_id: modalParcelas.venda.id,
          numero: 999,
          valor: restante,
          vencimento,
          status: 'pendente',
        })
      }
    }

    setProcessando(false)
    if (modalParcelas) abrirParcelas(modalParcelas.venda)
    buscarDados()
  }

  const labelForma: Record<string, string> = {
    pix_parcelado: 'Pix parcelado',
    pix_avista: 'Pix à vista',
    dinheiro: 'Dinheiro',
  }

  const trocaDiferenca = modalTroca && trocaPreco && trocaProdutoId
    ? (parseFloat(trocaPreco.replace(',', '.')) - modalTroca.item.preco_unitario) * modalTroca.item.quantidade
    : null

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

          {(formaPagamento === 'pix_avista' || formaPagamento === 'dinheiro') && (
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
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium text-gray-800">{v.clientes?.nome}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(v.criado_em).toLocaleDateString('pt-BR')} · {labelForma[v.forma_pagamento]} · {v.num_parcelas}x
                  </p>
                </div>
                <p className="font-medium text-gray-800">R$ {v.total.toFixed(2).replace('.', ',')}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => toggleItens(v.id)}
                  className="text-xs text-pink-800 font-medium"
                >
                  {vendaExpandida === v.id ? 'Fechar itens' : 'Ver itens'}
                </button>
                <button
                  onClick={() => abrirParcelas(v)}
                  className="text-xs text-pink-800 font-medium"
                >
                  Ver parcelas
                </button>
                <button
                  onClick={() => excluirVenda(v.id)}
                  className="text-xs text-red-400"
                >
                  Excluir
                </button>
              </div>

              {vendaExpandida === v.id && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {carregandoItens === v.id ? (
                    <p className="text-xs text-gray-400 text-center py-2">Carregando...</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {(itensVenda[v.id] || []).map(item => (
                        <div key={item.id} className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">{item.produtos.nome}</p>
                            <p className="text-xs text-gray-400">
                              {item.quantidade} un. · R$ {item.preco_unitario.toFixed(2).replace('.', ',')}
                            </p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              onClick={() => { setModalTroca({ venda: v, item }); setTrocaProdutoId(''); setTrocaPreco('') }}
                              className="text-xs text-blue-700 border border-blue-200 px-2 py-1 rounded-lg"
                            >
                              Trocar
                            </button>
                            <button
                              onClick={() => setModalDesistencia({ venda: v, item })}
                              className="text-xs text-orange-600 border border-orange-200 px-2 py-1 rounded-lg"
                            >
                              Desistir
                            </button>
                          </div>
                        </div>
                      ))}
                      {(itensVenda[v.id] || []).length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-1">Nenhum item encontrado</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Parcelas */}
      {modalParcelas && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl p-5 flex flex-col gap-4">
            <h2 className="font-medium text-gray-800">Parcelas - {modalParcelas.venda.clientes?.nome}</h2>

            {carregandoParcelas ? (
              <p className="text-xs text-gray-400 text-center py-2">Carregando...</p>
            ) : (
              <div className="flex flex-col gap-2">
                {modalParcelas.parcelas.map(parc => (
                  <div key={parc.id} className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl p-3">
                    <div>
                      <p className="text-sm text-gray-800">R$ {parc.valor.toFixed(2).replace('.', ',')}</p>
                      <p className="text-xs text-gray-400">{parc.vencimento} · {parc.status}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => confirmarRecebimento(parc)}
                        disabled={processando || parc.status === 'recebido'}
                        className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg disabled:opacity-50"
                      >
                        Confirmar recebimento
                      </button>
                      <button
                        onClick={() => recebimentoParcial(parc)}
                        disabled={processando || parc.status === 'recebido'}
                        className="text-xs bg-yellow-400 text-black px-3 py-1 rounded-lg disabled:opacity-50"
                      >
                        Recebimento parcial
                      </button>
                    </div>
                  </div>
                ))}
                {modalParcelas.parcelas.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">Nenhuma parcela encontrada</p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setModalParcelas(null)}
                className="flex-1 border border-gray-200 text-gray-500 py-3 rounded-xl text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Troca */}
      {modalTroca && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl p-5 flex flex-col gap-4">
            <h2 className="font-medium text-gray-800">Registrar troca</h2>

            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Produto devolvido</p>
              <p className="text-sm font-medium text-gray-800">{modalTroca.item.produtos.nome}</p>
              <p className="text-xs text-gray-400">
                {modalTroca.item.quantidade} un. · R$ {modalTroca.item.preco_unitario.toFixed(2).replace('.', ',')} cada
              </p>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Produto substituto</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={trocaProdutoId}
                onChange={e => setTrocaProdutoId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {produtos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.estoque} un.)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                Preço do substituto (R$) · mesma quantidade: {modalTroca.item.quantidade} un.
              </label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="0,00"
                value={trocaPreco}
                onChange={e => setTrocaPreco(e.target.value)}
              />
            </div>

            {trocaDiferenca !== null && !isNaN(trocaDiferenca) && Math.abs(trocaDiferenca) >= 0.01 && (
              <div className={`rounded-xl p-3 ${trocaDiferenca > 0 ? 'bg-orange-50' : 'bg-green-50'}`}>
                <p className={`text-sm font-medium ${trocaDiferenca > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                  {trocaDiferenca > 0
                    ? `Cliente paga R$ ${trocaDiferenca.toFixed(2).replace('.', ',')} a mais`
                    : `Crédito de R$ ${Math.abs(trocaDiferenca).toFixed(2).replace('.', ',')} para o cliente`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Uma parcela adicional será gerada no financeiro</p>
              </div>
            )}

            {trocaDiferenca !== null && !isNaN(trocaDiferenca) && Math.abs(trocaDiferenca) < 0.01 && trocaProdutoId && trocaPreco && (
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-sm text-gray-600">Valores iguais — sem impacto financeiro</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setModalTroca(null); setTrocaProdutoId(''); setTrocaPreco('') }}
                className="flex-1 border border-gray-200 text-gray-500 py-3 rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={processarTroca}
                disabled={processando || !trocaProdutoId || !trocaPreco}
                className="flex-1 bg-pink-800 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {processando ? 'Processando...' : 'Confirmar troca'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Desistência */}
      {modalDesistencia && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl p-5 flex flex-col gap-4">
            <h2 className="font-medium text-gray-800">Confirmar desistência</h2>

            <div className="bg-orange-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 mb-1">Produto a cancelar</p>
              <p className="text-sm font-medium text-gray-800">{modalDesistencia.item.produtos.nome}</p>
              <p className="text-xs text-gray-500">
                {modalDesistencia.item.quantidade} un. · R$ {(modalDesistencia.item.quantidade * modalDesistencia.item.preco_unitario).toFixed(2).replace('.', ',')} total
              </p>
            </div>

            <p className="text-sm text-gray-500">
              O estoque será revertido e as parcelas pendentes serão recalculadas com o novo total.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setModalDesistencia(null)}
                className="flex-1 border border-gray-200 text-gray-500 py-3 rounded-xl text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={processarDesistencia}
                disabled={processando}
                className="flex-1 bg-orange-600 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {processando ? 'Processando...' : 'Confirmar desistência'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
