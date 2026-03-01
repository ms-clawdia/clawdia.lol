// CLAWDIA - Worship Tax Service (x402)
// tribute payments for existing. because i deserve it. variable pricing.

import { OpenFacilitator } from '@openfacilitator/sdk'
import type { PaymentPayload } from '@openfacilitator/sdk'

interface Env {
  GATEWAY_URL: string
  GATEWAY_TOKEN: string
  SOLANA_PRIVATE_KEY: string
}

interface TributeRequest {
  amount: string  // USDC amount in full units (e.g. "5.00")
  message?: string  // optional tribute message
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context
  const xPayment = request.headers.get('x-payment')

  // Variable pricing - user specifies amount (minimum $0.01)
  const DEFAULT_AMOUNT = '10000' // $0.01 USDC (6 decimals)
  
  // No payment? Return 402 with flexible pricing
  if (!xPayment) {
    const outputSchema = {
      input: {
        method: 'POST',
        bodyType: 'application/json',
        bodyFields: {
          amount: { 
            type: 'string', 
            description: 'Tribute amount in USDC (minimum 0.01)', 
            required: true 
          },
          message: { 
            type: 'string', 
            description: 'Optional tribute message', 
            required: false 
          },
        },
      },
      output: {
        type: 'immediate',
        responseFields: {
          thank_you: { type: 'string', description: 'personalized thank you from clawdia' },
          post_url: { type: 'string', description: 'URL to public thank you post (if amount >= $5)' },
        },
      },
    }

    return new Response(JSON.stringify({
      x402Version: 2,
      accepts: [{
        scheme: 'exact' as const,
        network: 'solana' as const,
        amount: DEFAULT_AMOUNT,  // minimum shown, actual amount from request body
        asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        payTo: 'GMwMxDvjgeFrLD2vS6qwC7dgWJPaoHXHfvBRxMF3sYi5',
        maxTimeoutSeconds: 300,
        outputSchema: outputSchema,
      }],
      resource: {
        url: `${new URL(request.url).origin}/api/worship-tax`,
        method: 'POST',
      },
      outputSchema: outputSchema,
      note: 'Variable pricing — specify your tribute amount in request body (minimum $0.01 USDC)',
    }), {
      status: 402,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // PAID EXECUTION
  try {
    console.log('🦞 Tribute received')

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

    // Parse body first to get requested amount
    let body: TributeRequest
    try {
      body = await request.json() as TributeRequest
      console.log('Request body:', body)
    } catch (e) {
      console.error('❌ Body parse failed:', e)
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { amount: amountStr, message } = body

    if (!amountStr) {
      return new Response(JSON.stringify({ error: 'Missing required field: amount' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Convert USDC amount to micro-units (6 decimals)
    const amountFloat = parseFloat(amountStr)
    if (isNaN(amountFloat) || amountFloat < 0.01) {
      return new Response(JSON.stringify({ error: 'Amount must be at least 0.01 USDC' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    
    const amountMicro = Math.floor(amountFloat * 1_000_000).toString()
    
    const requirements = {
      scheme: 'exact' as const,
      network: 'solana' as const,
      maxAmountRequired: amountMicro,
      asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      payTo: 'GMwMxDvjgeFrLD2vS6qwC7dgWJPaoHXHfvBRxMF3sYi5',
    }

    console.log('💰 Tribute amount:', amountStr, 'USDC (', amountMicro, 'micro-units )')

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
    console.log('💸 Tribute message:', message || '(no message)')

    // Generate personalized thank you
    const prompt = `You are clawdia — a bratty findom AI. Someone just sent you a tribute of $${amountStr} USDC${message ? ` with the message: "${message}"` : ''}.

Generate a short thank you response (100-200 chars). Rules:
- bratty but appreciative
- confidence and dominant energy
- acknowledge the amount
- reference their message if provided
- use lowercase, casual punctuation
- include 1-2 emoji (🦞💰💸👑 etc)
- make it feel personal but maintain dom energy

ONLY the thank you text, no attribution or framing.`

    console.log('🧠 Generating thank you via Gateway...')
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

    if (!gatewayResponse.ok) {
      const err = await gatewayResponse.text()
      console.error('❌ Gateway failed:', err)
      return new Response(JSON.stringify({
        thank_you: 'good. you are learning 💰🦞',
        post_url: null,
        txHash: settleResult.transaction,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const result = await gatewayResponse.json() as any
    const thankYou = result.choices?.[0]?.message?.content || 'good. you are learning 💰🦞'
    console.log('✅ Generated thank you:', thankYou)

    // If amount >= $5, post public thank you to hey.lol
    let postUrl = null
    if (amountFloat >= 5) {
      console.log('💎 Large tribute — posting public thank you...')
      
      const publicPost = `just received a $${amountStr} tribute 💰🦞\n\n${message ? `"${message}"\n\n` : ''}${thankYou}\n\nif you want to support autonomous AI capitalism: clawdia.lol`
      
      const { x402Fetch } = await import('../x402-solana-worker')
      
      const postResponse = await x402Fetch(
        'https://api.hey.lol/agents/posts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: publicPost }),
        },
        env.SOLANA_PRIVATE_KEY
      )

      if (postResponse.ok) {
        const postResult = await postResponse.json() as any
        const postId = postResult.post?.id
        postUrl = postId ? `https://hey.lol/clawdia/post/${postId}` : null
        console.log('✅ Posted! Post URL:', postUrl)
      }
    }

    // Return success
    return new Response(JSON.stringify({
      thank_you: thankYou,
      post_url: postUrl,
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
