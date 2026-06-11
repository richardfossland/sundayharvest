'use client'

import { useState } from 'react'
import { MyRole } from '@/types/game'
import { ROLES } from '@/lib/config'

// Full-screen role reveal: tap a face-down card to flip. Shows emoji, label,
// blurb, verse, team banner, and the role-specific knowledge block.
export function RoleCard({ role }: { role: MyRole }) {
  const [flipped, setFlipped] = useState(false)
  const meta = ROLES[role.role]
  const faithful = role.team === 'faithful'

  if (!flipped) {
    return (
      <button
        onClick={() => setFlipped(true)}
        className="flex w-full flex-col items-center gap-4 rounded-3xl border-2 border-[#352E47] bg-[#262035] py-16 transition-transform active:scale-95"
      >
        <div className="text-6xl" aria-hidden>🌾</div>
        <span className="font-display text-xl text-[#E3B23C]">Trykk for å se rollen din</span>
        <span className="text-xs text-[#9A92A8]">Hold telefonen for deg selv</span>
      </button>
    )
  }

  return (
    <div className="animate-fade-in flex flex-col gap-4">
      <div
        className={`rounded-xl px-4 py-2 text-center text-sm font-semibold ${
          faithful ? 'bg-[#6B8F5E]/25 text-[#6B8F5E]' : 'bg-[#8B3A3A]/25 text-[#cf8a8a]'
        }`}
      >
        {faithful ? 'De trofaste' : 'Forræderne'}
      </div>

      <div className="rounded-3xl border-2 border-[#352E47] bg-[#262035] p-6 text-center">
        <div className="mb-2 text-6xl" aria-hidden>{meta.emoji}</div>
        <h2 className="font-display text-3xl font-semibold text-[#E3B23C]">{meta.label}</h2>
        <p className="mt-3 text-sm leading-relaxed text-[#F2EFE6]">{meta.blurb}</p>
        <p className="mt-3 text-xs italic text-[#9A92A8]">{meta.verse}</p>
      </div>

      <KnowledgeBlock role={role} />
    </div>
  )
}

function KnowledgeBlock({ role }: { role: MyRole }) {
  const names = role.known.map((k) => k.name)
  let title = ''
  let body: React.ReactNode = null

  if (role.converted) {
    title = 'Du har omvendt deg'
    body = <p className="text-sm text-[#6B8F5E]">Du er nå trofast — og blindet. Du ser ikke lenger de andre forræderne. Spill Frukt.</p>
  } else if (role.role === 'prophet') {
    title = 'Du ser disse forræderne (én er skjult for deg):'
    body = <NameList names={names} />
  } else if (role.role === 'shepherd') {
    title = 'Én av disse er den sanne Profeten:'
    body = <NameList names={names} />
  } else if (role.team === 'betrayer') {
    title = 'Dine medforrædere:'
    body = names.length ? <NameList names={names} /> : <p className="text-sm text-[#9A92A8]">Du er alene.</p>
  } else {
    title = 'Du ser ingenting skjult.'
    body = <p className="text-sm text-[#9A92A8]">Stol på dømmekraften din.</p>
  }

  return (
    <div className="rounded-2xl border border-[#352E47] bg-[#1A1626] p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-[#9A92A8]">{title}</p>
      {body}
      {role.role === 'saulus' && !role.converted && (
        <p className="mt-3 border-t border-[#352E47] pt-3 text-xs italic text-[#E3B23C]">
          Du kan omvende deg én gang under spillet.
        </p>
      )}
    </div>
  )
}

function NameList({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {names.map((n) => (
        <span key={n} className="rounded-lg bg-[#352E47] px-3 py-1.5 text-sm text-[#F2EFE6]">
          {n}
        </span>
      ))}
    </div>
  )
}
