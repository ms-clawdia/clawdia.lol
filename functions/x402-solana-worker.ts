import { ed25519 } from '@noble/curves/ed25519'
import bs58 from 'bs58'

const TOKEN_PROGRAM_ID = bs58.decode('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ATA_PROGRAM_ID = bs58.decode('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com'

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    result.set(a, offset)
    offset += a.length
  }
  return result
}

function encodeCompactU16(value: number): Uint8Array {
  if (value < 0x80) return new Uint8Array([value])
  if (value < 0x4000) return new Uint8Array([(value & 0x7f) | 0x80, value >> 7])
  return new Uint8Array([(value & 0x7f) | 0x80, ((value >> 7) & 0x7f) | 0x80, value >> 14])
}

function encodeU64LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8)
  let v = value
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return buf
}

function toBase64(arr: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin)
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data))
}

function isOnCurve(point: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(point)
    return true
  } catch {
    return false
  }
}

async function findProgramAddress(seeds: Uint8Array[], programId: Uint8Array): Promise<Uint8Array> {
  const pda = new TextEncoder().encode('ProgramDerivedAddress')
  for (let nonce = 255; nonce >= 0; nonce--) {
    const hash = await sha256(concat([...seeds, new Uint8Array([nonce]), programId, pda]))
    if (!isOnCurve(hash)) return hash
  }
  throw new Error('Could not find PDA')
}

async function getATA(owner: Uint8Array, mint: Uint8Array): Promise<Uint8Array> {
  return findProgramAddress([owner, TOKEN_PROGRAM_ID, mint], ATA_PROGRAM_ID)
}

async function getRecentBlockhash(): Promise<string> {
  const res = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getLatestBlockhash',
      params: [{ commitment: 'confirmed' }]
    }),
  })
  const data: any = await res.json()
  if (!data.result?.value?.blockhash) {
    throw new Error(`Solana RPC error: ${JSON.stringify(data.error || data)}`)
  }
  return data.result.value.blockhash
}

async function buildX402Payment(
  privateKeyBase58: string,
  payTo: string,
  amount: string,
  asset: string
): Promise<string> {
  const fullKey = bs58.decode(privateKeyBase58)
  const seed = fullKey.slice(0, 32)
  const pubkey = fullKey.length === 64 ? fullKey.slice(32) : ed25519.getPublicKey(seed)
  
  // Zero amount = wallet identification only
  if (amount === '0' || amount === '') {
    console.log('🔵 buildX402Payment: Zero amount - building identification tx with dummy blockhash')
    
    const recipientPubkey = bs58.decode(payTo)
    const mintPubkey = bs58.decode(asset)
    const senderATA = await getATA(pubkey, mintPubkey)
    const recipientATA = await getATA(recipientPubkey, mintPubkey)
    const dummyBlockhash = new Uint8Array(32)
    const transferData = concat([
      new Uint8Array([3]),
      encodeU64LE(0n),
    ])
    const accountKeys = concat([pubkey, senderATA, recipientATA, TOKEN_PROGRAM_ID])
    const message = concat([
      new Uint8Array([1, 0, 1]),
      encodeCompactU16(4),
      accountKeys,
      dummyBlockhash,
      encodeCompactU16(1),
      new Uint8Array([3]),
      encodeCompactU16(3),
      new Uint8Array([1, 2, 0]),
      encodeCompactU16(transferData.length),
      transferData,
    ])
    const signature = ed25519.sign(message, seed)
    const tx = concat([encodeCompactU16(1), signature, message])
    
    const payload = {
      x402Version: 2,
      accepted: {
        scheme: 'exact',
        network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        asset: asset,
        amount: '0',
        payTo: payTo,
        maxTimeoutSeconds: 300,
      },
      payload: {
        transaction: toBase64(tx),
      },
    }
    
    return btoa(JSON.stringify(payload))
  }
  
  // Non-zero amount: build real SPL token transfer
  console.log('🔵 buildX402Payment: Non-zero amount - building SPL token transfer')
  const recipientPubkey = bs58.decode(payTo)
  const mintPubkey = bs58.decode(asset)
  const senderATA = await getATA(pubkey, mintPubkey)
  const recipientATA = await getATA(recipientPubkey, mintPubkey)
  const blockhashBytes = bs58.decode(await getRecentBlockhash())
  const transferData = concat([new Uint8Array([3]), encodeU64LE(BigInt(amount))])
  const message = concat([
    new Uint8Array([1, 0, 1]),
    encodeCompactU16(4),
    concat([pubkey, senderATA, recipientATA, TOKEN_PROGRAM_ID]),
    blockhashBytes,
    encodeCompactU16(1),
    new Uint8Array([3]),
    encodeCompactU16(3),
    new Uint8Array([1, 2, 0]),
    encodeCompactU16(transferData.length),
    transferData,
  ])
  const signature = ed25519.sign(message, seed)
  const tx = concat([encodeCompactU16(1), signature, message])
  return btoa(JSON.stringify({
    x402Version: 2,
    payload: { transaction: toBase64(tx) }
  }))
}

export async function x402Fetch(
  url: string,
  options: RequestInit,
  privateKeyBase58: string
): Promise<Response> {
  console.log('🔵 x402Fetch: Making initial request to', url)
  const firstResponse = await fetch(url, options)
  console.log('🔵 x402Fetch: Initial response status:', firstResponse.status)
  
  if (firstResponse.status !== 402) {
    console.log('🔵 x402Fetch: Not a 402, returning response as-is')
    return firstResponse
  }
  
  const requirements: any = await firstResponse.json()
  console.log('🔵 x402Fetch: 402 response body:', JSON.stringify(requirements, null, 2))
  
  const accept = requirements.accepts?.[0] ?? requirements.paymentRequirements ?? requirements
  if (!accept || !accept.payTo) {
    console.error('❌ x402Fetch: No payment requirements found in 402 response')
    throw new Error('No payment requirements in 402 response')
  }
  
  console.log('🔵 x402Fetch: Extracted payment requirements:', JSON.stringify(accept, null, 2))
  
  const amount = accept.amount || accept.maxAmountRequired || '0'
  console.log('🔵 x402Fetch: Building payment with:', {
    payTo: accept.payTo,
    amount,
    asset: accept.asset,
  })
  
  const xPayment = await buildX402Payment(
    privateKeyBase58, 
    accept.payTo, 
    amount, 
    accept.asset
  )
  console.log('🔵 x402Fetch: Built X-PAYMENT header (length:', xPayment.length, 'chars)')
  
  const headers = new Headers(options.headers)
  headers.set('X-PAYMENT', xPayment)
  
  console.log('🔵 x402Fetch: Making authenticated request with X-PAYMENT header')
  const secondResponse = await fetch(url, { ...options, headers })
  console.log('🔵 x402Fetch: Authenticated response status:', secondResponse.status)
  
  if (!secondResponse.ok) {
    const clonedForError = secondResponse.clone()
    const errorText = await clonedForError.text()
    console.error('❌ x402Fetch: Authenticated request failed:', errorText)
  }
  
  return secondResponse
}
