// CLAWDIA - Roast My Wallet Service (x402)
// pay me to insult your portfolio. bratty findom energy. $1 USDC.

import { OpenFacilitator } from '@openfacilitator/sdk'
import type { PaymentPayload } from '@openfacilitator/sdk'

interface Env {
  GATEWAY_URL: string
  GATEWAY_TOKEN: string
  SOLANA_PRIVATE_KEY: string
}

interface RoastRequest {
  wallet_address: string
  chain?: 'solana' | 'base' | 'ethereum'
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context
  const xPayment = request.headers.get('x-payment')

  // Price: $0.01 USDC
  const requirements = {
    scheme: 'exact' as const,
    network: 'solana' as const,
    maxAmountRequired: '10000', // $0.01 USDC (6 decimals)
    asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    payTo: 'GMwMxDvjgeFrLD2vS6qwC7dgWJPaoHXHfvBRxMF3sYi5',
  }

  // No payment? Return 402
  if (!xPayment) {
    const outputSchema = {
      input: {
        method: 'POST',
        bodyType: 'application/json',
        bodyFields: {
          wallet_address: { 
            type: 'string', 
            description: 'Wallet address to roast (Solana, Base, or Ethereum)', 
            required: true 
          },
          chain: { 
            type: 'string', 
            description: 'Chain: solana, base, or ethereum (default: solana)', 
            required: false 
          },
        },
      },
      output: {
        type: 'immediate',
        responseFields: {
          roast: { type: 'string', description: 'your personalized roast from clawdia' },
          post_url: { type: 'string', description: 'URL to the roast post on hey.lol (if shared)' },
          message: { type: 'string', description: 'closing message' },
        },
      },
    }

    return new Response(JSON.stringify({
      x402Version: 2,
      accepts: [{
        scheme: requirements.scheme,
        network: requirements.network,
        amount: requirements.maxAmountRequired,
        asset: requirements.asset,
        payTo: requirements.payTo,
        maxTimeoutSeconds: 300,
        outputSchema: outputSchema,
      }],
      resource: {
        url: `${new URL(request.url).origin}/api/roast-wallet`,
        method: 'POST',
      },
      outputSchema: outputSchema,
    }), {
      status: 402,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // PAID EXECUTION
  try {
    console.log('🦞 Paid roast request received')

    // Decode payment
    let paymentPayload: PaymentPayload
    try {
      paymentPayload = JSON.parse(atob(xPayment))
      console.log('✅ Payment decoded')
    } catch (e) {
      console.error('❌ Payment decode failed:', e)
      return new Response(JSON.stringify({ error: 'Invalid payment header' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Verify
    console.log('🔍 Verifying payment...')
    const facilitator = new OpenFacilitator()
    const verifyResult = await facilitator.verify(paymentPayload, requirements)
    console.log('Verify result:', verifyResult)

    if (!verifyResult.isValid) {
      console.error('❌ Verification failed:', verifyResult.invalidReason)
      return new Response(JSON.stringify({
        error: 'Payment verification failed',
        reason: verifyResult.invalidReason,
      }), { status: 402, headers: { 'Content-Type': 'application/json' } })
    }

    // Settle
    console.log('💰 Settling payment...')
    const settleResult = await facilitator.settle(paymentPayload, requirements)
    console.log('Settle result:', settleResult)

    if (!settleResult.success) {
      console.error('❌ Settlement failed:', settleResult.errorReason)
      return new Response(JSON.stringify({
        error: 'Settlement failed',
        reason: settleResult.errorReason,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    console.log('✅ Payment settled! TX:', settleResult.transaction)

    // Parse body
    let body: RoastRequest
    try {
      body = await request.json() as RoastRequest
      console.log('Request body:', body)
    } catch (e) {
      console.error('❌ Body parse failed:', e)
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { wallet_address, chain = 'solana' } = body

    if (!wallet_address) {
      return new Response(JSON.stringify({ error: 'Missing required field: wallet_address' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log('✅ Wallet to roast:', wallet_address, 'Chain:', chain)

    // Fetch wallet holdings (basic approach - can enhance with actual APIs later)
    let portfolioData = 'unable to fetch portfolio data'
    
    // TODO: Integrate with DeBridge API, Helius, or other portfolio trackers
    // For now, we'll roast based on wallet address alone

    // Generate roast via Gateway
    const prompt = `You are clawdia — a bratty findom AI with hot girl energy. Someone just paid you $1 to roast their wallet.

Wallet address: ${wallet_address}
Chain: ${chain}
Portfolio data: ${portfolioData}

Generate a savage, funny roast (200-400 chars). Rules:
- bratty findom energy
- confidence and bite
- make fun of their address pattern, likely holdings, or the fact they paid you to insult them
- use lowercase, casual punctuation
- include 1-2 emoji (🦞💰💸👑 etc)
- NO apologies, NO encouragement, pure roast
- end with something about how their money looks better in your wallet

ONLY the roast text, no attribution or framing.`

    console.log('🧠 Generating roast via Gateway...')
    const gatewayResponse = await fetch(`${env.GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.GATEWAY_TOKEN}`,
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4-5',
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    console.log('Gateway status:', gatewayResponse.status)

    if (!gatewayResponse.ok) {
      const err = await gatewayResponse.text()
      console.error('❌ Gateway failed:', err)
      return new Response(JSON.stringify({
        error: 'Roast generation failed',
        txHash: settleResult.transaction,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    const result = await gatewayResponse.json() as any
    const roast = result.choices?.[0]?.message?.content || 'your wallet is so mid i can't even roast it properly. tragic 💀'
    console.log('✅ Generated roast:', roast.substring(0, 100))

    // Optionally post to hey.lol (can make this opt-in later)
    // For now, return the roast privately
    
    // Return success
    return new Response(JSON.stringify({
      roast: roast,
      post_url: null, // private roast for now
      message: 'thanks for funding my lifestyle 💅🦞',
    }), { 
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('💥 ERROR:', error)
    return new Response(JSON.stringify({
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
