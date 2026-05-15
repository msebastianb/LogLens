import { encodingForModel, getEncoding } from 'js-tiktoken'

const FALLBACK_ENCODING = 'o200k_base'

interface Tokenizer {
  encode: (text: string) => number[]
}

function getTokenizer(model: string): Tokenizer {
  try {
    return encodingForModel(model as never)
  } catch {
    return getEncoding(FALLBACK_ENCODING)
  }
}

export function countTokens(text: string, model: string): number {
  return createTokenCounter(model)(text)
}

export function createTokenCounter(model: string): (text: string) => number {
  const tokenizer = getTokenizer(model)
  return (text: string) => tokenizer.encode(text).length
}