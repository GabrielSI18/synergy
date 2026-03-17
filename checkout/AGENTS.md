# Checkout Bestfy - Contexto do Projeto

## Visão Geral

Este projeto é um checkout personalizado que integra com a **API da Bestfy** (gateway de pagamento brasileiro). Aceita pagamento via **cartão de crédito**, **PIX** e **boleto** (se habilitado na conta).

---

## API Bestfy - Referência Completa

### Autenticação

- Padrão: **Basic Access Authentication**
- Header: `Authorization: Basic <base64(SECRET_KEY:x)>`
- Chaves encontradas em: `https://app.bestfybr.com.br/settings/credentials`
- Duas chaves: **secret key** (backend) e **public key** (frontend, para tokenizar cartões)

```js
const auth = 'Basic ' + Buffer.from(SECRET_KEY + ':x').toString('base64');
```

### Base URL

```
https://api.bestfybr.com.br/v1
```

---

### Endpoints Principais

#### POST /transactions — Criar Transação

Cria uma transação com cartão, PIX ou boleto.

**Body:**
```json
{
  "amount": 5000,               // int32, obrigatório — valor em centavos (5000 = R$50,00)
  "paymentMethod": "credit_card", // string, obrigatório — "credit_card" | "boleto" | "pix"
  "card": {                      // obrigatório se credit_card
    "token": "hash_do_cartao"
  },
  "installments": 1,             // obrigatório se credit_card
  "customer": {                  // object, obrigatório
    "name": "Nome Completo",
    "email": "email@exemplo.com",
    "phone": "11999999999",
    "document": { "number": "12345678900", "type": "cpf" },
    "address": {
      "street": "Rua Exemplo",
      "streetNumber": "100",
      "complement": "Apto 1",
      "zipCode": "01452922",
      "neighborhood": "Bairro",
      "city": "São Paulo",
      "state": "SP",
      "country": "BR"
    }
  },
  "items": [                     // array, obrigatório
    {
      "title": "Produto",
      "unitPrice": 5000,
      "quantity": 1,
      "tangible": true,
      "externalRef": "SKU123"
    }
  ],
  "shipping": {                  // opcional
    "fee": 1000,
    "address": { /* mesmo formato do address */ }
  },
  "boleto": {                    // opcional, para boleto
    "expiresInDays": 2
  },
  "pix": {                       // opcional, para pix
    "expiresInDays": 1
  },
  "postbackUrl": "https://...",  // opcional — URL para webhooks
  "metadata": "dados extras",    // opcional
  "traceable": false,            // opcional — rastrear entrega
  "ip": "127.0.0.1",            // opcional — IP do cliente
  "splits": [                    // opcional — divisão de pagamento
    { "recipientId": 1, "amount": 5000 }
  ]
}
```

**Resposta (Objeto Transaction):**
```json
{
  "id": 282,
  "status": "paid",               // processing | authorized | paid | refunded | waiting_payment | refused | chargedback | canceled | in_protest | partially_paid
  "amount": 5000,
  "authorizedAmount": 5000,
  "paidAmount": 5000,
  "refundedAmount": 0,
  "paymentMethod": "credit_card",
  "installments": 1,
  "acquirerType": "getnet",
  "externalId": "...",
  "companyId": 123,
  "secureId": "uuid",
  "secureUrl": "https://link.compra.com.br/pagar/uuid",
  "postbackUrl": null,
  "metadata": null,
  "traceable": false,
  "createdAt": "2022-07-18T09:54:22.000Z",
  "updatedAt": "2022-07-18T09:54:22.000Z",
  "ip": null,
  "customer": { /* objeto customer */ },
  "card": {
    "id": 147,
    "brand": "visa",
    "holderName": "NOME",
    "lastDigits": "1111",
    "expirationMonth": 3,
    "expirationYear": 2028,
    "createdAt": "..."
  },
  "pix": {
    "qrcode": "código_copia_e_cola",
    "url": "https://...",
    "expirationDate": "2022-07-20",
    "createdAt": "..."
  },
  "boleto": {
    "url": "https://...",
    "barcode": "12345...",
    "digitableLine": "12345...",
    "expirationDate": "2022-07-20",
    "instructions": "...",
    "createdAt": "..."
  },
  "items": [ /* array de items */ ],
  "shipping": null,
  "refusedReason": null,
  "refunds": [],
  "delivery": null,
  "fee": { "fixedAmount": 200, "spreadPercentage": 4, "estimatedFee": 600, "netAmount": 9400 },
  "splits": [ { "recipientId": 1, "amount": 5000, "netAmount": 4400 } ]
}
```

#### GET /transactions — Listar Transações
#### GET /transactions/:id — Buscar Transação por ID
#### POST /transactions/:id/refund — Estornar Transação
#### PUT /transactions/:id/test — Atualizar Status de Transação de Teste
#### PUT /transactions/:id/delivery — Alterar Status de Entrega

---

#### POST /checkouts — Criar Checkout (hospedado pela Bestfy)

Cria um checkout hospedado. Retorna `secureUrl` para redirecionar o cliente.

**Body:**
```json
{
  "amount": 1000,
  "items": [
    { "title": "Produto", "unitPrice": 1000, "quantity": 1, "tangible": true }
  ],
  "settings": {
    "defaultPaymentMethod": "credit_card",
    "requestAddress": false,
    "requestPhone": true,
    "requestDocument": true,
    "traceable": false,
    "card": { "enabled": true, "freeInstallments": 1, "maxInstallments": 12 },
    "boleto": { "enabled": false, "expiresInDays": 2 },
    "pix": { "enabled": true, "expiresInDays": 2 }
  },
  "postbackUrl": "https://...",
  "description": "Descrição interna",
  "splits": []
}
```

#### GET /checkouts/:id — Buscar Checkout por ID

---

#### POST /customers — Criar Cliente
#### GET /customers — Listar Clientes
#### GET /customers/:id — Buscar Cliente

---

#### POST /transfers — Criar Transferência
#### GET /transfers/:id — Buscar Transferência
#### GET /balance — Obter Saldo Disponível

---

#### POST /recipients — Criar Recebedor
#### GET /recipients — Listar Recebedores
#### GET /recipients/:id — Buscar Recebedor
#### PUT /recipients/:id — Atualizar Recebedor

---

#### GET /company — Dados da Empresa
#### PUT /company — Atualizar Dados da Empresa

---

### Tokenização de Cartão (Frontend)

A tokenização acontece no frontend com a lib JS da Bestfy. O número do cartão **nunca** passa pelo backend.

```html
<script src="https://api.bestfybr.com.br/v1/js"></script>
```

```js
Bestfy.setPublicKey("chave_publica");
Bestfy.setTestMode(true); // remover em produção

const token = await Bestfy.encrypt({
  number: "4111111111111111",
  holderName: "Nome Completo",
  expMonth: 12,
  expYear: 2030,
  cvv: "123"
});
// Enviar o token para o backend criar a transação
```

**Cartão de teste:** `4111 1111 1111 1111`

---

### Formato dos Postbacks (Webhooks)

A Bestfy envia POST para a `postbackUrl` quando o status de uma transação muda.

**Payload:**
```json
{
  "id": 686401,
  "type": "transaction",          // "transaction" | "checkout" | "transfer"
  "objectId": "282",
  "url": "https://sua-url.com",
  "data": { /* objeto transaction/checkout/transfer completo */ }
}
```

---

## Arquitetura do Projeto

```
checkout/
├── server/
│   └── server.js            ← Backend Express (proxy seguro para API Bestfy)
├── public/
│   ├── index.html            ← Página do checkout
│   ├── css/style.css         ← Estilos (responsivo, moderno)
│   └── js/checkout.js        ← Lógica frontend (tokenização, validação, UI)
├── .env                      ← Credenciais (NÃO versionar)
├── .env.example              ← Template de variáveis
├── .gitignore
└── package.json
```

### Stack

- **Backend**: Node.js + Express
- **Frontend**: HTML/CSS/JS puro (sem framework)
- **Segurança**: Helmet (CSP), CORS, rate-limit, chave secreta só no backend
- **CEP**: Busca automática via ViaCEP

### Variáveis de Ambiente (.env)

```env
BESTFY_SECRET_KEY=sk_live_...     # Chave secreta (backend)
BESTFY_PUBLIC_KEY=pk_live_...     # Chave pública (frontend, tokenização)
PORT=3000
NODE_ENV=test                      # test ou production
BESTFY_API_URL=https://api.bestfybr.com.br/v1
POSTBACK_URL=                      # URL para receber webhooks (opcional)
```

### Notas Importantes

- **Valores sempre em centavos**: R$ 50,00 = `5000`
- **Telefone**: formato `11999999999` (só números)
- **CEP**: formato `01452922` (só números)
- **Estado**: 2 letras maiúsculas (`SP`, `RJ`, etc.)
- **Document type**: `cpf` ou `cnpj`
- **CSP**: O servidor precisa permitir `script-src` para `https://api.bestfybr.com.br` (lib de tokenização), `connect-src` para `https://viacep.com.br`, e `img-src` para `https://api.qrserver.com` (QR Code PIX)
- **Boleto**: Pode estar desabilitado na conta — verificar `permissions.isBoletoAvailable` em `GET /company`
- **PIX**: Retorna `qrcode` (código copia-e-cola) e `url` — gerar imagem do QR via serviço externo
