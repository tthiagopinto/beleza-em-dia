'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import * as XLSX from 'xlsx'

type ParcelaReceber = {
  id: string
  valor: number
  vencimento: string
  recebido_em: string | null
  status: string
  vendas: {
    clientes: { nome: string }
  }
}

type ParcelaPagar = {
  id: string
  valor: number
  vencimento: string
  pago_em: string | null
  status: string
  compras: {
    fornecedor: string
    forma_pagamento: string
  }
}

type ResumoMes = {
  label: string
  mesStr: string
  aReceber: number
  aPagar: number
  isMesAtual: boolean
}

export default function Financeiro() {
  const [aba, setAba] = useState<'caixa' | 'competencia' | 'projecao'>('caixa')
  const [parcelasReceber, setParcelasReceber] = useState<ParcelaReceber[]>([])
  const [parcelasPagar, setParcelasPagar] = useState<ParcelaPagar[]>([])
  const [projecao, setProjecao] = useState<ResumoMes[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingProjecao, setLoadingProjecao] = useState(false)
  const [mes, setMes] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  useEffect(() => {
    buscarDados()
  }, [mes])

  useEffect(() => {
    if (aba === 'projecao') buscarProjecao()
  }, [aba])

  function calcularIntervalo(mesStr: string) {
    const [ano, mesNum] = mesStr.split('-').map(Number)
    const inicio = `${ano}-${String(mesNum).padStart(2, '0')}-01`
    const ultimoDia = new Date(ano, mesNum, 0).getDate()
    const fim = `${ano}-${String(mesNum).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
    return { inicio, fim }
  }

  async function buscarDados() {
    setLoading(true)
    const { inicio, fim } = calcularIntervalo(mes)

    const [{ data: receber }, { data: pagar }] = await Promise.all([
      supabase
        .from('parcelas_receber')
        .select('*, vendas(*, clientes(nome))')
        .gte('vencimento', inicio)
        .lte('vencimento', fim)
        .in('status', ['pendente', 'recebido'])
        .order('vencimento'),
      supabase
        .from('parcelas_pagar')
        .select('*, compras(fornecedor, forma_pagamento)')
        .gte('vencimento', inicio)
        .lte('vencimento', fim)
        .order('vencimento'),
    ])

    setParcelasReceber(receber || [])
    setParcelasPagar(pagar || [])
    setLoading(false)
  }

  async function buscarProjecao() {
    setLoadingProjecao(true)
    const hoje = new Date()
    const meses: ResumoMes[] = []

    for (let offset = -1; offset <= 3; offset++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1)
      const mesStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const { inicio, fim } = calcularIntervalo(mesStr)
      const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      const isMesAtual = mesStr === `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`

      const [{ data: receber }, { data: pagar }] = await Promise.all([
        supabase
          .from('parcelas_receber')
          .select('valor, status')
          .gte('vencimento', inicio)
          .lte('vencimento', fim),
        supabase
          .from('parcelas_pagar')
          .select('valor, status')
          .gte('vencimento', inicio)
          .lte('vencimento', fim),
      ])

      const aReceber = (receber || [])
        .filter(p => p.status === 'pendente')
        .reduce((sum, p) => sum + p.valor, 0)

      const aPagar = (pagar || [])
        .filter(p => p.status === 'pendente')
        .reduce((sum, p) => sum + p.valor, 0)

      meses.push({ label, mesStr, aReceber, aPagar, isMesAtual })
    }

    setProjecao(meses)
    setLoadingProjecao(false)
  }

  async function confirmarPagamento(id: string) {
    const hoje = new Date().toISOString().split('T')[0]
    await supabase
      .from('parcelas_pagar')
      .update({ status: 'pago', pago_em: hoje })
      .eq('id', id)
    buscarDados()
  }

  const totalRecebido = parcelasReceber
    .filter(p => p.status === 'recebido')
    .reduce((sum, p) => sum + p.valor, 0)

  const totalAReceber = parcelasReceber
    .filter(p => p.status === 'pendente')
    .reduce((sum, p) => sum + p.valor, 0)

  const totalPago = parcelasPagar
    .filter(p => p.status === 'pago')
    .reduce((sum, p) => sum + p.valor, 0)

  const totalAPagar = parcelasPagar
    .filter(p => p.status === 'pendente')
    .reduce((sum, p) => sum + p.valor, 0)

  const saldoCaixa = totalRecebido - totalPago
  const totalVendas = parcelasReceber.reduce((sum, p) => sum + p.valor, 0)
  const totalCompras = parcelasPagar.reduce((sum, p) => sum + p.valor, 0)
  const resultadoCompetencia = totalVendas - totalCompras

  function R(v: number) {
    return 'R$ ' + v.toFixed(2).replace('.', ',')
  }

  function exportarXlsx() {
    const entradas = parcelasReceber.map(p => ({
      Data: p.status === 'recebido' ? p.recebido_em : p.vencimento,
      Descrição: p.vendas?.clientes?.nome || '',
      Tipo: 'Entrada',
      Valor: p.valor,
      Status: p.status === 'recebido' ? 'Recebido' : 'A receber',
    }))

    const saidas = parcelasPagar.map(p => ({
      Data: p.status === 'pago' ? p.pago_em : p.vencimento,
      Descrição: p.compras?.fornecedor || '',
      Tipo: 'Saída',
      Valor: -p.valor,
      Status: p.status === 'pago' ? 'Pago' : 'A pagar',
    }))

    const todos = [...entradas, ...saidas].sort((a, b) =>
      (a.Data || '').localeCompare(b.Data || '')
    )

    const resumo = [
      {},
      { Descrição: 'Total recebido', Valor: totalRecebido },
      { Descrição: 'Total a receber', Valor: totalAReceber },
      { Descrição: 'Total pago', Valor: -totalPago },
      { Descrição: 'Total a pagar', Valor: -totalAPagar },
      { Descrição: 'Saldo do mês', Valor: saldoCaixa },
    ]

    const ws = XLSX.utils.json_to_sheet([...todos, ...resumo])
    ws['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fluxo de Caixa')
    XLSX.writeFile(wb, `fluxo-caixa-${mes}.xlsx`)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </div>
  )

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium text-gray-800">Financeiro</h1>
        <input
          type="month"
          className="border border-gray-200 rounded-lg px-3 py-1 text-sm"
          value={mes}
          onChange={e => setMes(e.target.value)}
        />
      </div>

      <div className="flex gap-2 mb-5">
        {(['caixa', 'competencia', 'projecao'] as const).map(a => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors
              ${aba === a ? 'bg-pink-100 border-pink-800 text-pink-800' : 'bg-white border-gray-200 text-gray-500'}`}
          >
            {a === 'caixa' ? 'Caixa' : a === 'competencia' ? 'Competência' : 'Projeção'}
          </button>
        ))}
      </div>

      {aba === 'caixa' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Recebido</p>
              <p className="font-medium text-green-700">{R(totalRecebido)}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Pago</p>
              <p className="font-medium text-red-600">{R(totalPago)}</p>
            </div>
            <div className="bg-yellow-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">A receber</p>
              <p className="font-medium text-yellow-700">{R(totalAReceber)}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">A pagar</p>
              <p className="font-medium text-orange-600">{R(totalAPagar)}</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 flex justify-between items-center">
            <span className="font-medium text-gray-600">Saldo do mês</span>
            <span className={`text-lg font-medium ${saldoCaixa >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {R(saldoCaixa)}
            </span>
          </div>

          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Entradas</p>
            <div className="flex flex-col gap-2">
              {parcelasReceber.map(p => (
                <div key={p.id} className="bg-white border border-gray-100 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.vendas?.clientes?.nome}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(p.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-green-600">+ {R(p.valor)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'recebido' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {p.status === 'recebido' ? 'Recebido' : 'Pendente'}
                    </span>
                  </div>
                </div>
              ))}
              {parcelasReceber.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-3">Nenhuma entrada neste mês</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Saídas</p>
            <div className="flex flex-col gap-2">
              {parcelasPagar.map(p => (
                <div key={p.id} className="bg-white border border-gray-100 rounded-xl p-3">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.compras?.fornecedor || 'Fornecedor'}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(p.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')} · {p.compras?.forma_pagamento}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-red-500">- {R(p.valor)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'pago' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        {p.status === 'pago' ? 'Pago' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                  {p.status === 'pendente' && (
                    <button
                      onClick={() => confirmarPagamento(p.id)}
                      className="w-full bg-pink-800 text-white text-xs py-2 rounded-lg font-medium"
                    >
                      ✓ Confirmar pagamento
                    </button>
                  )}
                </div>
              ))}
              {parcelasPagar.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-3">Nenhuma saída neste mês</p>
              )}
            </div>
          </div>

          <button
            onClick={exportarXlsx}
            className="w-full border border-green-700 text-green-700 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2"
          >
            ↓ Exportar fluxo de caixa (.xlsx)
          </button>
        </div>
      )}

      {aba === 'competencia' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Vendas do mês</p>
              <p className="font-medium text-green-700">{R(totalVendas)}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-1">Compras do mês</p>
              <p className="font-medium text-red-600">{R(totalCompras)}</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 flex justify-between items-center">
            <span className="font-medium text-gray-600">Resultado</span>
            <span className={`text-lg font-medium ${resultadoCompetencia >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {R(resultadoCompetencia)}
            </span>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Já recebido</span>
              <span className="text-green-600">{R(totalRecebido)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">A receber</span>
              <span className="text-yellow-600">{R(totalAReceber)}</span>
            </div>
            <div className="h-px bg-gray-100 my-1" />
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Já pago</span>
              <span className="text-red-500">{R(totalPago)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">A pagar</span>
              <span className="text-orange-500">{R(totalAPagar)}</span>
            </div>
          </div>
        </div>
      )}

      {aba === 'projecao' && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray-400">Parcelas pendentes por mês</p>
          {loadingProjecao ? (
            <p className="text-sm text-gray-400 text-center py-8">Carregando projeção...</p>
          ) : (
            projecao.map(m => (
              <div key={m.mesStr} className={`bg-white border rounded-xl p-4 ${m.isMesAtual ? 'border-pink-200' : 'border-gray-100'}`}>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm font-medium text-gray-800 capitalize">{m.label}</p>
                  {m.isMesAtual && <span className="text-xs bg-pink-100 text-pink-800 px-2 py-0.5 rounded-full">Atual</span>}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>A receber</span>
                  <span className="text-green-600 font-medium">{R(m.aReceber)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>A pagar</span>
                  <span className="text-red-500 font-medium">{R(m.aPagar)}</span>
                </div>
                <div className="h-px bg-gray-100 mb-2" />
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Saldo previsto</span>
                  <span className={`font-medium ${m.aReceber - m.aPagar >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {R(m.aReceber - m.aPagar)}
                  </span>
                </div>
              </div>
            ))
          )}
          <p className="text-xs text-gray-300 text-center">Considera apenas parcelas pendentes já cadastradas</p>
        </div>
      )}
    </div>
  )
}
