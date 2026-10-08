/** Classes partagées des écrans d'admin « projets » (charte A de la maquette). */
export const ui = {
  btn: "inline-block rounded-lg bg-[#6d8cff] px-3.5 py-2 text-sm text-white hover:bg-[#8aa2ff] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d8cff]",
  btnSecondary:
    "inline-block rounded-lg border border-[#26262a] bg-[#141416] px-3.5 py-2 text-sm text-[#ededee] hover:border-[#6d8cff] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d8cff]",
  btnDanger:
    "inline-block rounded-lg border border-[#ef5b5b] bg-transparent px-3.5 py-2 text-sm text-[#ef5b5b] hover:bg-[#ef5b5b]/10 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ef5b5b]",
  field:
    "w-full rounded-lg border border-[#26262a] bg-[#141416] px-2.5 py-2 text-sm text-[#ededee] placeholder:text-[#8b8b93] focus-visible:border-[#6d8cff] focus-visible:outline-none",
  label: "grid gap-1 text-[13px] text-[#8b8b93]",
  box: "grid gap-3.5 rounded-[10px] border border-[#26262a] bg-[#141416] p-4",
  boxTitle: "text-lg font-semibold text-[#ededee]",
  tag: "inline-flex items-center gap-1 rounded-full border border-[#26262a] px-2.5 py-px text-xs text-[#8b8b93]",
  tagActive: "inline-flex items-center gap-1 rounded-full border border-[#6d8cff] px-2.5 py-px text-xs text-[#6d8cff]",
  badgePublished: "rounded-md border border-[#3ecf8e] px-2 py-px text-[11px] text-[#3ecf8e]",
  badgeDraft: "rounded-md border border-[#e5a93c] px-2 py-px text-[11px] text-[#e5a93c]",
  drop: "grid cursor-pointer place-items-center rounded-[10px] border-2 border-dashed border-[#26262a] p-4 text-center text-[13px] text-[#8b8b93] hover:border-[#6d8cff] focus-within:border-[#6d8cff]",
  muted: "text-[#8b8b93]",
} as const;
