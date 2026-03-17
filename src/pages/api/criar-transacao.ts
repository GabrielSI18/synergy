import type { APIRoute } from 'astro';

// ============================================================
// POST /api/criar-transacao
// Recebe os dados do formulário de checkout e cria a transação
// na API da Bestfy. A SECRET_KEY fica apenas no servidor.
// ============================================================

const BESTFY_API = 'https://api.bestfybr.com.br/v1/transactions';

// Coloque sua SECRET_KEY aqui (futuramente use variável de ambiente)
const SECRET_KEY = 'SUA_SECRET_KEY_AQUI';

function basicAuth(key: string) {
  return 'Basic ' + btoa(`${key}:x`);
}

// Mapa de produtos disponíveis
// Ajuste os preços e IDs conforme necessário
const PRODUTOS: Record<string, { nome: string; valor: number; parcelas: number }> = {
  '1-unidade': {
    nome: 'Secador BettDow AirLux Pro — 1 Unidade',
    valor: 19990, // em centavos = R$ 199,90
    parcelas: 12,
  },
  '2-unidades': {
    nome: 'Secador BettDow AirLux Pro — 2 Unidades',
    valor: 34990, // R$ 349,90
    parcelas: 12,
  },
  'kit-profissional': {
    nome: 'Kit Profissional BettDow AirLux Pro',
    valor: 24990, // R$ 249,90
    parcelas: 12,
  },
};

export const POST: APIRoute = async ({ request }) => {
  // Aceita JSON ou form-data
  let body: Record<string, string>;
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    body = await request.json();
  } else {
    const form = await request.formData();
    body = Object.fromEntries(form.entries()) as Record<string, string>;
  }

  const { produto, nome, email, cpf, telefone, metodo, numero_cartao, validade, cvv, nome_cartao, parcelas } = body;

  // Validação básica
  if (!produto || !nome || !email || !cpf || !metodo) {
    return new Response(
      JSON.stringify({ erro: 'Campos obrigatórios ausentes.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const prod = PRODUTOS[produto];
  if (!prod) {
    return new Response(
      JSON.stringify({ erro: 'Produto inválido.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Monta o payload para a Bestfy
  // Estrutura baseada no padrão de gateways BR (ajuste conforme doc oficial)
  const payload: Record<string, unknown> = {
    amount: prod.valor,
    description: prod.nome,
    payment_method: metodo === 'pix' ? 'pix' : 'credit_card',
    customer: {
      name: nome.trim(),
      email: email.trim().toLowerCase(),
      document: cpf.replace(/\D/g, ''),
      phone: telefone?.replace(/\D/g, '') ?? '',
    },
  };

  // Dados extras para cartão de crédito
  if (metodo === 'cartao') {
    payload.card = {
      number: numero_cartao?.replace(/\D/g, ''),
      expiration_date: validade,
      cvv,
      holder_name: nome_cartao,
    };
    payload.installments = Number(parcelas ?? 1);
  }

  try {
    const resp = await fetch(BESTFY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: basicAuth(SECRET_KEY),
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ erro: data?.message ?? 'Erro ao processar pagamento.', detalhes: data }),
        { status: resp.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Retorna o que a Bestfy devolveu (qr_code, pix_copia_cola, status, id, etc.)
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ erro: 'Falha de comunicação com o gateway.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
