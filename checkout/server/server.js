const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares de segurança
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://api.bestfybr.com.br", "https://www.googletagmanager.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://viacep.com.br", "https://api.bestfybr.com.br", "https://www.googletagmanager.com", "https://www.google-analytics.com"],
      imgSrc: ["'self'", "data:", "https://api.qrserver.com", "https://cdn.shopify.com", "https://madeliebrasil.com", "https://m.media-amazon.com", "https://bk-reviews.b-cdn.net", "https://www.googletagmanager.com"],
    },
  },
}));
app.use(cors({
  origin: [
    'https://synergy.com.br',
    'https://www.synergy.com.br',
    'http://localhost:4321',
    'http://localhost:5173',
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Dados de Produtos ---
const productsData = require(path.join(__dirname, '..', '..', 'src', 'data', 'products.json'));

// --- Helpers ---
const BESTFY_API_URL = process.env.BESTFY_API_URL || 'https://api.bestfybr.com.br/v1';

function getAuthHeader() {
  const secretKey = process.env.BESTFY_SECRET_KEY;
  if (!secretKey) {
    throw new Error('BESTFY_SECRET_KEY não configurada');
  }
  return 'Basic ' + Buffer.from(secretKey + ':x').toString('base64');
}

async function bestfyRequest(method, endpoint, body = null) {
  const url = `${BESTFY_API_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Resposta inválida da API Bestfy (status ${response.status})`);
  }
  if (!response.ok) {
    const error = new Error(data.message || 'Erro na API Bestfy');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

// --- Rotas da API ---

// Retorna a chave pública para o frontend (tokenização de cartão)
app.get('/api/config', (req, res) => {
  res.json({
    publicKey: process.env.BESTFY_PUBLIC_KEY || '',
    testMode: process.env.NODE_ENV !== 'production',
  });
});

// Buscar produto por ID (para o checkout renderizar os dados)
app.get('/api/products/:id', (req, res) => {
  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId)) {
    return res.status(400).json({ error: 'ID de produto inválido' });
  }

  const product = productsData.products.find(p => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: 'Produto não encontrado' });
  }

  // Retorna apenas os dados necessários pro checkout
  res.json({
    id: product.id,
    title: product.title,
    price: product.price,
    comparePrice: product.comparePrice,
    images: product.images,
    hasVariants: product.hasVariants,
    variants: (product.variants || []).map(v => ({
      id: v.id,
      title: v.title,
      option1: v.option1,
      option2: v.option2,
      price: v.price,
      comparePrice: v.comparePrice,
    })),
    option1Name: product.option1Name,
    option2Name: product.option2Name,
  });
});

// Criar transação (cartão de crédito, PIX ou boleto)
app.post('/api/transactions', async (req, res) => {
  try {
    const {
      amount,
      paymentMethod,
      card,
      installments,
      customer,
      items,
      shipping,
      boleto,
      pix,
      metadata,
    } = req.body;

    // Validações básicas
    if (!amount || !paymentMethod || !customer || !items) {
      return res.status(400).json({ error: 'Campos obrigatórios: amount, paymentMethod, customer, items' });
    }

    if (!['credit_card', 'boleto', 'pix'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'paymentMethod inválido. Use: credit_card, boleto ou pix' });
    }

    if (paymentMethod === 'credit_card' && (!card || !card.token)) {
      return res.status(400).json({ error: 'Token do cartão é obrigatório para pagamento com cartão' });
    }

    const transactionData = {
      amount: parseInt(amount, 10),
      paymentMethod,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone ? customer.phone.replace(/\D/g, '') : undefined,
        document: customer.document,
        address: customer.address,
      },
      items,
      ip: req.ip,
    };

    if (paymentMethod === 'credit_card') {
      transactionData.card = { token: card.token };
      transactionData.installments = parseInt(installments, 10) || 1;
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

    if (process.env.POSTBACK_URL) {
      transactionData.postbackUrl = process.env.POSTBACK_URL;
    }

    const result = await bestfyRequest('POST', '/transactions', transactionData);
    res.json(result);
  } catch (error) {
    console.error('Erro ao criar transação:', error.data || error.message);
    res.status(error.status || 500).json({
      error: error.data || { message: 'Erro interno ao processar pagamento' },
    });
  }
});

// Buscar transação por ID
app.get('/api/transactions/:id', async (req, res) => {
  try {
    const result = await bestfyRequest('GET', `/transactions/${encodeURIComponent(req.params.id)}`);
    res.json(result);
  } catch (error) {
    console.error('Erro ao buscar transação:', error.data || error.message);
    res.status(error.status || 500).json({
      error: error.data || { message: 'Erro ao buscar transação' },
    });
  }
});

// Webhook/Postback da Bestfy
app.post('/api/postback', (req, res) => {
  const { type, data } = req.body;
  console.log(`[Postback] Tipo: ${type}, ID: ${data?.id}, Status: ${data?.status}`);
  // Aqui você pode processar a atualização (salvar em banco, enviar e-mail, etc.)
  res.sendStatus(200);
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Checkout rodando em http://localhost:${PORT}`);
});
