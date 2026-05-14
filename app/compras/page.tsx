'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

type Produto = {
  id: string
  nome: string
  categoria: string
  estoque: number
  custo_medio: number
}

type ItemCompra = {
  produto_id: string
  nome: string
  quantidade: number
  custo_unitario: number
}

type Compra = {
  id: string
  fornecedor: string
  total: number
  forma_pagamento: string
  num_parcelas: number
  criado_em: string
}

const formasPagamento = ['cartao', 'pix', 'boleto']
const labelForma: Record<string, string> = {
  cartao: 'Cartão de crédito',
  pix: 'Pix',
  boleto: 'Boleto',
}

export default function Compras() {
  const [aba, setAba] = useState<'nova' | 'historico'>('nova')
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [itens, setItens] = useState<ItemCompra[]>([])
  const [fornecedor, setFornecedor] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('cartao')
  const [numParcelas, setNumParcelas] = useState(1)
  const [primeiraParcela, setPrimeiraParcela] = useState('')
  const [chavePix, setChavePix] = useState('')
  const [codigoBarras, setCodigoBarras] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [importando, setImportando] = useState(false)

  // Adição manual
  const [mostraAddManual, setMostraAddManual] = useState(false)
  const [produtoSelecionado, setProdutoSelecionado] = useState('')
  const [qtdManual, setQtdManual] = useState('')
  const [custoManual, setCustoManual] = useState('')

  useEffect(() => {
    buscarProdutos()
    buscarCompras()
  }, [])

  async function buscarProdutos() {
    const { data } = await supabase.from('produtos').select('*').order('nome')
    setProdutos(data || [])
  }

  async function buscarCompras() {
    const { data } = await supabase
      .from('compras')
      .select('*')
      .order('criado_em', { ascending: false })
    setCompras(data || [])
  }

  async function importarXlsx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(sheet)

      const novosItens: ItemCompra[] = []
      let produtosAtuais = [...produtos]

      for (const row of rows) {
        const nome = String(row['produto'] || row['Produto'] || row['PRODUTO'] || '').trim()
        const quantidade = parseFloat(row['quantidade'] || row['Quantidade'] || row['QUANTIDADE'] || 0)
        const custo = parseFloat(row['valor'] || row['Valor'] || row['VALOR'] || row['custo'] || row['Custo'] || 0)

        if (!nome || !quantidade || !custo) continue

        let produto = produtosAtuais.find(p => p.nome.toLowerCase() === nome.toLowerCase())

        if (!produto) {
          const { data } = await supabase
            .from('produtos')
            .insert({ nome, categoria: '', estoque: 0, custo_medio: custo })
            .select()
            .single()
          produto = data
          produtosAtuais = [...produtosAtuais, data]
        }

        if (produto) {
          novosItens.push({
            produto_id: produto.id,
            nome: produto.nome,
            quantidade,
            custo_unitario: custo,
          })
        }
      }

      setItens(prev => [...prev, ...novosItens])
      await buscarProdutos()
      setImportando(false)
    }
    reader.readAsArrayBuffer(file)
  }

  function adicionarManual() {
    if (!produtoSelecionado || !qtdManual || !custoManual) return
    const produto = produtos.find(p => p.id === produtoSelecionado)
    if (!produto) return
    setItens(prev => [...prev, {
      produto_id: produto.id,
      nome: produto.nome,
      quantidade: parseFloat(qtdManual),
      custo_unitario: parseFloat(custoManual.replace(',', '.')),
    }])
    setProdutoSelecionado('')
    setQtdManual('')
    setCustoManual('')
    setMostraAddManual(false)
  }

  function removerItem(index: number) {
    setItens(itens.filter((_, i) => i !== index))
  }

  function totalCompra() {
    return itens.reduce((sum, i) => sum + i.quantidade * i.custo_unitario, 0)
  }

  function valorParcela() {
    if (!numParcelas) return 0
    return totalCompra() / numParcelas
  }

  async function salvar() {
    if (itens.length === 0 || !primeiraParcela) return
    setSalvando(true)

    const total = totalCompra()

    const { data: compra } = await supabase
      .from('compras')
      .insert({ fornecedor, total, forma_pagamento: formaPagamento, num_parcelas: numParcelas, primeira_parcela: primeiraParcela })
      .select()
      .single()

    if (!compra) { setSalvando(false); return }

    await supabase.from('compra_itens').insert(
      itens.map(i => ({
        compra_id: compra.id,
        produto_id: i.produto_id,
        quantidade: i.quantidade,
        custo_unitario: i.custo_unitario,
      }))
    )

    const parcelas = Array.from({ length: numParcelas }, (_, i) => {
      const data = new Date(primeiraParcela + 'T12:00:00')
      data.setMonth(data.getMonth() + i)
      return {
        compra_id: compra.id,
        numero: i + 1,
        valor: valorParcela(),
        vencimento: data.toISOString().split('T')[0],
        status: 'pendente',
        codigo_barras: formaPagamento === 'boleto' ? codigoBarras : null,
      }
    })

    await supabase.from('parcelas_pagar').insert(parcelas)

    for (const item of itens) {
      const produto = produtos.find(p => p.id === item.produto_id)
      if (!produto) continue
      const estoqueAtual = produto.estoque || 0
      const custoMedioAtual = produto.custo_medio || 0
      const novoEstoque = estoqueAtual + item.quantidade
      const novoCustoMedio = ((custoMedioAtual * estoqueAtual) + (item.custo_unitario * item.quantidade)) / novoEstoque
      await supabase.from('produtos').update({
        estoque: novoEstoque,
        custo_medio: Math.round(novoCustoMedio * 100) / 100,
      }).eq('id', item.produto_id)
    }

    setItens([])
    setFornecedor('')
    setFormaPagamento('cartao')
    setNumParcelas(1)
    setPrimeiraParcela('')
    setChavePix('')
    setCodigoBarras('')
    setSalvando(false)
    setSucesso(true)
    buscarCompras()
    setTimeout(() => setSucesso(false), 3000)
  }

  async function excluirCompra(id: string) {
    if (!confirm('Excluir esta compra? O estoque e custo médio dos produtos serão revertidos.')) return

    const { data: itensCompra } = await supabase
      .from('compra_itens')
      .select('*')
      .eq('compra_id', id)

    for (const item of itensCompra || []) {
      const produto = produtos.find(p => p.id === item.produto_id)
      if (!produto) continue
      const novoEstoque = Math.max(0, (produto.estoque || 0) - item.quantidade)
      await supabase.from('produtos').update({ estoque: novoEstoque }).eq('id', item.produto_id)
    }

    await supabase.from('compras').delete().eq('id', id)
    buscarCompras()
    buscarProdutos()
  }

  return (
    <div className="p-4">
      <h1 className="text-lg font-medium text-gray-800 mb-4">Compras</h1>

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setAba('nova')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors
            ${aba === 'nova' ? 'bg-pink-100 border-pink-800 text-pink-800' : 'bg-white border-gray-200 text-gray-500'}`}
        >
          Nova compra
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
              ✓ Compra registrada com sucesso!
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Fornecedor</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Ex: Distribuidora Beleza"
              value={fornecedor}
              onChange={e => setFornecedor(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-2 block">Importar pedido (.xlsx)</label>
            <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-200 rounded-xl py-4 cursor-pointer hover:border-pink-300">
              <span className="text-sm text-gray-400">
                {importando ? 'Importando...' : '📎 Selecionar arquivo Excel'}
              </span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importarXlsx} disabled={importando} />
            </label>
            <p className="text-xs text-gray-400 mt-1">Colunas esperadas: produto, quantidade, valor</p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs text-gray-400">Itens da compra</label>
              <button
                onClick={() => setMostraAddManual(!mostraAddManual)}
                className="text-xs text-pink-800 font-medium"
              >
                + Adicionar manualmente
              </button>
            </div>

            {mostraAddManual && (
              <div className="bg-gray-50 rounded-xl p-3 flex flex-col gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Produto</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={produtoSelecionado}
                    onChange={e => setProdutoSelecionado(e.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Quantidade</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      placeholder="0"
                      type="number"
                      value={qtdManual}
                      onChange={e => setQtdManual(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Custo unit. (R$)</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      placeholder="0,00"
                      value={custoManual}
                      onChange={e => setCustoManual(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={adicionarManual}
                    disabled={!produtoSelecionado || !qtdManual || !custoManual}
                    className="flex-1 bg-pink-800 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Adicionar
                  </button>
                  <button
                    onClick={() => setMostraAddManual(false)}
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
                        {item.quantidade} un. · R$ {item.custo_unitario.toFixed(2).replace('.', ',')} cada
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-700">
                        R$ {(item.quantidade * item.custo_unitario).toFixed(2).replace('.', ',')}
                      </p>
                      <button onClick={() => removerItem(i)} className="text-red-300 text-lg">✕</button>
                    </div>
                  </div>
                ))}
                <div className="bg-gray-50 rounded-xl p-3 flex justify-between">
                  <span className="text-sm font-medium text-gray-600">Total</span>
                  <span className="text-sm font-medium text-gray-800">
                    R$ {totalCompra().toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>
            )}

            {itens.length === 0 && !mostraAddManual && (
              <p className="text-sm text-gray-400 text-center py-4">
                Importe um xlsx ou adicione produtos manualmente
              </p>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-2 block">Forma de pagamento</label>
            <div className="grid grid-cols-3 gap-2">
              {formasPagamento.map(f => (
                <button
                  key={f}
                  onClick={() => { setFormaPagamento(f); setNumParcelas(1) }}
                  className={`py-2 px-3 rounded-xl text-sm font-medium border transition-colors
                    ${formaPagamento === f ? 'bg-pink-100 border-pink-800 text-pink-800' : 'bg-white border-gray-200 text-gray-500'}`}
                >
                  {labelForma[f]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Parcelas</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={numParcelas}
                onChange={e => setNumParcelas(parseInt(e.target.value))}
              >
                {(formaPagamento === 'boleto' ? [1,2,3] : formaPagamento === 'pix' ? [1,2,3,4,5,6] : [1,2,3,4,5,6,7,8,9,10,11,12]).map(n => (
                  <option key={n} value={n}>{n}x de R$ {itens.length ? valorParcela().toFixed(2).replace('.', ',') : '0,00'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">
                {formaPagamento === 'cartao' ? '1ª parcela' : 'Data pagamento'}
              </label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={primeiraParcela}
                onChange={e => setPrimeiraParcela(e.target.value)}
              />
            </div>
          </div>

          {formaPagamento === 'pix' && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Chave Pix do fornecedor (opcional)</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="CPF, CNPJ, e-mail ou telefone"
                value={chavePix}
                onChange={e => setChavePix(e.target.value)}
              />
            </div>
          )}

          {formaPagamento === 'boleto' && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Código de barras (opcional)</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Cole ou digite o código"
                value={codigoBarras}
                onChange={e => setCodigoBarras(e.target.value)}
              />
            </div>
          )}

          <button
            onClick={salvar}
            disabled={salvando || itens.length === 0 || !primeiraParcela}
            className="w-full bg-pink-800 text-white py-3 rounded-xl font-medium disabled:opacity-50"
          >
            {salvando ? 'Registrando...' : 'Registrar compra'}
          </button>
        </div>
      )}

      {aba === 'historico' && (
        <div className="flex flex-col gap-3">
          {compras.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma compra registrada ainda</p>
          )}
          {compras.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium text-gray-800">{c.fornecedor || 'Sem fornecedor'}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(c.criado_em).toLocaleDateString('pt-BR')} · {labelForma[c.forma_pagamento]} · {c.num_parcelas}x
                  </p>
                </div>
                <p className="font-medium text-gray-800">R$ {c.total.toFixed(2).replace('.', ',')}</p>
              </div>
              <button
                onClick={() => excluirCompra(c.id)}
                className="text-xs text-red-400 mt-1"
              >
                Excluir compra
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
