import type { APIRoute } from 'astro';

function basicAuth(key: string) {
  return 'Basic ' + btoa(`${key}:x`);
}

export const GET: APIRoute = async ({ params, locals }) => {
  const runtime = (locals as any).runtime;
  const BESTFY_API_URL = runtime?.env?.BESTFY_API_URL ?? 'https://api.bestfybr.com.br/v1';
  const SECRET_KEY = runtime?.env?.BESTFY_SECRET_KEY ?? '';

  if (!SECRET_KEY) {
    return new Response(
      JSON.stringify({ error: 'SECRET_KEY não configurada' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const txId = params.id;
  if (!txId) {
    return new Response(
      JSON.stringify({ error: 'ID da transação é obrigatório' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const response = await fetch(`${BESTFY_API_URL}/transactions/${encodeURIComponent(txId)}`, {
      method: 'GET',
      headers: {
        'Authorization': basicAuth(SECRET_KEY),
        'Accept': 'application/json',
      },
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
      JSON.stringify({ error: { message: 'Erro ao buscar transação' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
