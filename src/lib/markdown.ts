export const SECTION_LABELS: Record<string, string> = {
  'core idea': '核心观点',
  'frameworks introduced': '核心框架',
  'key concepts': '关键概念',
  'mental models': '心智模型',
  'anti-patterns': '反模式',
  'worked example': '案例拆解',
  'key takeaways': '关键要点',
  'connects to': '章节关联',
}

export function normalizeHeading(raw: string): string {
  return raw
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim()
    .toLowerCase()
}

export function sectionLabel(raw: string): string | null {
  return SECTION_LABELS[normalizeHeading(raw)] ?? null
}

export function getSections(markdown: string): Array<{ raw: string; zh: string }> {
  const sections: Array<{ raw: string; zh: string }> = []
  for (const match of markdown.matchAll(/^##\s+(.+?)\s*$/gm)) {
    const raw = match[1]
    sections.push({ raw, zh: sectionLabel(raw) || raw })
  }
  return sections
}

export function stripTitle(markdown: string): string {
  return markdown.replace(/^﻿?#[^\n]*\n+/, '')
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
