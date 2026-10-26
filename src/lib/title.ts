/** 把「小岛经济学：鱼、美元和经济的故事」拆成主标题与副标题 */
export function splitBookTitle(title: string): { main: string; sub: string } {
  const withColon = title.match(/^([^：:]{1,12})([：:].+)$/)
  if (withColon) {
    return { main: withColon[1].trim(), sub: withColon[2].trim() }
  }
  const withParen = title.match(/^(.*?)(（.+）)$/)
  if (withParen) {
    return { main: withParen[1].trim(), sub: withParen[2].trim() }
  }
  return { main: title, sub: '' }
}

/** 封面副标题去掉标点，让排版更干净 */
export function cleanCoverSubtitle(sub: string): string {
  return sub.replace(/^[：:（(]\s*/, '').replace(/[）)]$/, '')
}
