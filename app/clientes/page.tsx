'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Cliente = {
  id: string
  nome: string
  whatsapp: string
  endereco: string
  cidade: string
  observacoes: string
}

const clienteVazio = {
  nome: '',
  whatsapp: '',
  endereco: '',
  cidade: '',
  observacoes: '',
}

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [mostraForm, setMostraForm] = useState(false)
  const [form, setForm] = useState(clienteVazio)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    buscarClientes()
  }, [])

  async function buscarClientes() {
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .order('nome')
    setClientes(data || [])
    setLoading(false)
  }

  async function salvar() {
    if (!form.nome) return
    setSalvando(true)
    if (editandoId) {
      await supabase.from('clientes').update(form).eq('id', editandoId)
    } else {
      await supabase.from('clientes').insert(form)
    }
    setForm(clienteVazio)
    setEditandoId(null)
    setMostraForm(false)
    setSalvando(false)
    buscarClientes()
  }

  function editar(c: Cliente) {
    setForm({ nome: c.nome, whatsapp: c.whatsapp, endereco: c.endereco, cidade: c.cidade, observacoes: c.observacoes })
    setEditandoId(c.id)
    setMostraForm(true)
  }

  function cancelar() {
    setForm(clienteVazio)
    setEditandoId(null)
    setMostraForm(false)
  }

  function iniciais(nome: string) {
    return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  }

  const filtrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase())
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
          {editandoId ? 'Editar cliente' : 'Novo cliente'}
        </h1>
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Nome *</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Ex: Salão Bella Arte"
            value={form.nome}
            onChange={e => setForm({ ...form, nome: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">WhatsApp</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="(11) 99999-9999"
            value={form.whatsapp}
            onChange={e => setForm({ ...form, whatsapp: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Endereço</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Rua, número, bairro"
            value={form.endereco}
            onChange={e => setForm({ ...form, endereco: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Cidade</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="São Paulo"
            value={form.cidade}
            onChange={e => setForm({ ...form, cidade: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Observações</label>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Ex: prefere pix no dia 10"
            value={form.observacoes}
            onChange={e => setForm({ ...form, observacoes: e.target.value })}
          />
        </div>
        <button
          onClick={salvar}
          disabled={salvando || !form.nome}
          className="w-full bg-pink-800 text-white py-3 rounded-xl font-medium disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : 'Salvar cliente'}
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
        <h1 className="text-lg font-medium text-gray-800">Clientes</h1>
        <button
          onClick={() => setMostraForm(true)}
          className="bg-pink-800 text-white text-sm px-4 py-2 rounded-lg"
        >
          + Novo
        </button>
      </div>

      <input
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
        placeholder="Buscar cliente..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />

      <p className="text-xs text-gray-400 mb-3">{filtrados.length} clientes</p>

      <div className="flex flex-col gap-3">
        {filtrados.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-800 font-medium text-sm flex-shrink-0">
              {iniciais(c.nome)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{c.nome}</p>
              <p className="text-sm text-gray-400 truncate">{c.whatsapp || 'Sem WhatsApp'}</p>
            </div>
            <button
              onClick={() => editar(c)}
              className="text-gray-300 text-lg px-2"
            >
              ✎
            </button>
          </div>
        ))}
        {filtrados.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            {busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado ainda'}
          </p>
        )}
      </div>
    </div>
  )
}
