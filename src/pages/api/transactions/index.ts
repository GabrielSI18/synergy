import type { APIRoute } from 'astro';

function basicAuth(key: string) {
  return 'Basic ' + btoa(`${key}:x`);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;
  const BESTFY_API = (runtime?.env?.BESTFY_API_URL ?? 'https://api.bestfybr.com.br/v1') + '/transactions';
  const SECRET_KEY = runtime?.env?.BESTFY_SECRET_KEY ?? '';

  if (!SECRET_KEY) {
    return new Response(
      JSON.stringify({ error: 'SECRET_KEY não configurada no servidor.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body = await request.json();
  const { amount, paymentMethod, card, installments, customer, items, shipping, boleto, pix, metadata } = body;

  if (!amount || !paymentMethod || !customer || !items) {
    return new Response(
      JSON.stringify({ error: 'Campos obrigatórios: amount, paymentMethod, customer, items' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!['credit_card', 'boleto', 'pix'].includes(paymentMethod)) {
    return new Response(
      JSON.stringify({ error: 'paymentMethod inválido. Use: credit_card, boleto ou pix' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (paymentMethod === 'credit_card' && (!card || !card.token)) {
    return new Response(
      JSON.stringify({ error: 'Token do cartão é obrigatório para pagamento com cartão' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const transactionData: Record<string, unknown> = {
    amount: parseInt(String(amount), 10),
    paymentMethod,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone ? customer.phone.replace(/\D/g, '') : undefined,
      document: customer.document,
      address: customer.address,
    },
    items,
  };

  if (paymentMethod === 'credit_card') {
    transactionData.card = { token: card.token };
    transactionData.installments = parseInt(String(installments), 10) || 1;
  }

  if (paymentMethod === 'boleto' && boleto) {
    transactionData.boleto = boleto;
  }

  if (paymentMethod === 'pix' && pix) {
    transactionData.pix = pix;
  }

  if (shipping) {
    transactionData.shipping = shipping;
  }

  if (metadata) {
    transactionData.metadata = metadata;
  }

  const POSTBACK_URL = runtime?.env?.POSTBACK_URL;
  if (POSTBACK_URL) {
    transactionData.postbackUrl = POSTBACK_URL;
  }

  try {
    const response = await fetch(BESTFY_API, {
      method: 'POST',
      headers: {
        'Authorization': basicAuth(SECRET_KEY),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(transactionData),
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return new Response(
        JSON.stringify({ error: `Resposta inválida da API Bestfy (status ${response.status})` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: { message: 'Erro interno ao processar pagamento' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
