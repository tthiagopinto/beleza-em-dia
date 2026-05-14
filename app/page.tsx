'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Parcela = {
  id: string
  valor: number
  vencimento: string
  status: string
  vendas: {
    clientes: {
      nome: string
      whatsapp: string
    }
  }
}

export default function Home() {
  const [vencendo, setVencendo] = useState<Parcela[]>([])
  const [atrasadas, setAtrasadas] = useState<Parcela[]>([])
  const [loading, setLoading] = useState(true)

  const [modalAberto, setModalAberto] = useState(false)
  const [parcelaSelecionada, setParcelaSelecionada] = useState<Parcela | null>(null)
  const [novaData, setNovaData] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvandoProrrogacao, setSalvandoProrrogacao] = useState(false)

  useEffect(() => {
    buscarParcelas()
  }, [])

  async function buscarParcelas() {
    const hoje = new Date().toISOString().split('T')[0]
    const em7dias = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [{ data: v }, { data: a }] = await Promise.all([
      supabase
        .from('parcelas_receber')
        .select('*, vendas(*, clientes(nome, whatsapp))')
        .eq('status', 'pendente')
        .gte('vencimento', hoje)
        .lte('vencimento', em7dias)
        .order('vencimento'),
      supabase
        .from('parcelas_receber')
        .select('*, vendas(*, clientes(nome, whatsapp))')
        .eq('status', 'pendente')
        .lt('vencimento', hoje)
        .order('vencimento'),
    ])

    setVencendo(v || [])
    setAtrasadas(a || [])
    setLoading(false)
  }

  async function confirmarRecebimento(id: string) {
    const hoje = new Date().toISOString().split('T')[0]
    await supabase
      .from('parcelas_receber')
      .update({ status: 'recebido', recebido_em: hoje })
      .eq('id', id)
    buscarParcelas()
  }

  function abrirProrrogar(parcela: Parcela) {
    setParcelaSelecionada(parcela)
    setNovaData('')
    setMotivo('')
    setModalAberto(true)
  }

  async function confirmarProrrogacao() {
    if (!parcelaSelecionada || !novaData) return
    setSalvandoProrrogacao(true)
    await supabase
      .from('parcelas_receber')
      .update({
        vencimento_original: parcelaSelecionada.vencimento,
        vencimento: novaData,
        observacao: motivo || null,
      })
      .eq('id', parcelaSelecionada.id)
    setSalvandoProrrogacao(false)
    setModalAberto(false)
    setParcelaSelecionada(null)
    buscarParcelas()
  }

  function abrirWhatsapp(whatsapp: string) {
    const numero = whatsapp.replace(/\D/g, '')
    window.open('https://wa.me/55' + numero, '_blank')
  }

  function diasAtraso(vencimento: string) {
    const diff = Date.now() - new Date(vencimento).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  function diasParaVencer(vencimento: string) {
    const diff = new Date(vencimento).getTime() - Date.now()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-400">Carregando...</p>
    </div>
  )

  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-lg font-medium text-pink-800">Beleza em Dia</h1>
        <p className="text-sm text-gray-400">
          {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      <section className="mb-6">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Vence em breve</h2>
        {vencendo.length === 0 && (
          <p className="text-sm text-gray-400">Nenhum vencimento nos próximos 7 dias</p>
        )}
        <div className="flex flex-col gap-3">
          {vencendo.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-medium text-gray-800">{p.vendas?.clientes?.nome}</p>
                  <p className="text-sm text-gray-400">
                    Vence {new Date(p.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')} · Pix
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-800">
                    R$ {p.valor.toFixed(2).replace('.', ',')}
                  </p>
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
                    {diasParaVencer(p.vencimento)} dias
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => confirmarRecebimento(p.id)}
                  className="flex-1 bg-pink-800 text-white text-sm py-2 rounded-lg font-medium"
                >
                  ✓ Confirmar
                </button>
                <button
                  onClick={() => abrirProrrogar(p)}
                  className="flex-1 border border-pink-800 text-pink-800 text-sm py-2 rounded-lg font-medium"
                >
                  Prorrogar
                </button>
                <button
                  onClick={() => abrirWhatsapp(p.vendas?.clientes?.whatsapp)}
                  className="flex-1 bg-green-500 text-white text-sm py-2 rounded-lg font-medium"
                >
                  WhatsApp
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Em atraso</h2>
        {atrasadas.length === 0 && (
          <p className="text-sm text-gray-400">Nenhum pagamento em atraso 🎉</p>
        )}
        <div className="flex flex-col gap-3">
          {atrasadas.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-red-100 p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-medium text-gray-800">{p.vendas?.clientes?.nome}</p>
                  <p className="text-sm text-gray-400">
                    Venceu {new Date(p.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')} · {diasAtraso(p.vencimento)} dias
                  </p>
                </div>
                <p className="font-medium text-red-500">
                  R$ {p.valor.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => confirmarRecebimento(p.id)}
                  className="flex-1 bg-pink-800 text-white text-sm py-2 rounded-lg font-medium"
                >
                  ✓ Confirmar
                </button>
                <button
                  onClick={() => abrirProrrogar(p)}
                  className="flex-1 border border-pink-800 text-pink-800 text-sm py-2 rounded-lg font-medium"
                >
                  Prorrogar
                </button>
                <button
                  onClick={() => abrirWhatsapp(p.vendas?.clientes?.whatsapp)}
                  className="flex-1 bg-green-500 text-white text-sm py-2 rounded-lg font-medium"
                >
                  WhatsApp
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {modalAberto && parcelaSelecionada && (
        <div
          className="fixed inset-0 bg-black bg-opacity-40 flex items-end z-50"
          onClick={() => setModalAberto(false)}
        >
          <div
            className="bg-white rounded-t-2xl p-6 w-full max-w-md mx-auto flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-base font-medium text-gray-800">Prorrogar parcela</h2>
            <p className="text-sm text-gray-400">
              {parcelaSelecionada.vendas?.clientes?.nome} · R$ {parcelaSelecionada.valor.toFixed(2).replace('.', ',')}
            </p>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nova data de vencimento *</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={novaData}
                onChange={e => setNovaData(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Motivo (opcional)</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Ex: cliente pediu mais 15 dias"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
              />
            </div>
            <button
              onClick={confirmarProrrogacao}
              disabled={!novaData || salvandoProrrogacao}
              className="w-full bg-pink-800 text-white py-3 rounded-xl font-medium disabled:opacity-50"
            >
              {salvandoProrrogacao ? 'Salvando...' : 'Confirmar nova data'}
            </button>
            <button
              onClick={() => setModalAberto(false)}
              className="w-full border border-gray-200 text-gray-500 py-3 rounded-xl font-medium"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
