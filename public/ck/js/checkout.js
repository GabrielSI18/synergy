// ========================================
// Bestfy Checkout - Frontend (3 Steps)
// ========================================

(function () {
  'use strict';

  // --- Configuração ---
  let config = { publicKey: '', testMode: true };
  let selectedMethod = 'credit_card';
  let currentStep = 1;
  let selectedShipping = { label: 'Correios-PAC', price: 0 };
  let pixTransactionId = null;
  let pixPollInterval = null;

  // Google Ads Conversion helper
  function fireGoogleConversion(value, transactionId) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'conversion', {
        send_to: 'AW-17318558682/zra6COzHvIocENr3kMJA',
        value: value,
        currency: 'BRL',
        transaction_id: transactionId || '',
      });
    }
  }

  // Facebook Pixel Purchase helper
  function fireFacebookPurchase(value, transactionId) {
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'Purchase', {
        value: value,
        currency: 'BRL',
        content_type: 'product',
        transaction_id: transactionId || '',
      });
    }
  }

  // Dados do produto (carregados dinamicamente via query params)
  let orderItems = [];
  let productData = null;

  // --- Leitura de Query Params ---
  function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      productId: params.get('product'),
      variantId: params.get('variant'),
      quantity: parseInt(params.get('qty'), 10) || 1,
      items: params.get('items'),
    };
  }

  // --- Inicialização ---
  async function init() {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        config = await res.json();
      }
    } catch {
      console.warn('Não foi possível carregar config do servidor');
    }

    const { productId, variantId, quantity, items } = getQueryParams();
    const isPreview = new URLSearchParams(window.location.search).has('preview');

    if (items) {
      await loadCartItems(items);
    } else if (productId) {
      await loadProduct(productId, variantId, quantity);
    } else if (!isPreview) {
      showError('Nenhum produto selecionado. Volte à loja e selecione um produto.');
      return;
    }

    renderOrderSummary();
    setupStepButtons();
    setupPaymentTabs();
    setupMasks();
    setupCEPLookup();
    setupShippingOptions();
    setupPayButton();
    setupCopyButtons();
    setupEditButtons();
    checkPreviewMode();
  }

  // --- Carregar múltiplos itens do carrinho ---
  async function loadCartItems(itemsBase64) {
    try {
      const cartItems = JSON.parse(atob(itemsBase64));
      if (!Array.isArray(cartItems) || cartItems.length === 0) {
        throw new Error('Carrinho vazio');
      }
      for (const item of cartItems) {
        await loadProduct(String(item.pid), item.vid ? String(item.vid) : null, item.qty || 1);
      }
    } catch (err) {
      showError('Erro ao carregar itens do carrinho: ' + err.message);
    }
  }

  // --- Carregar produto do servidor ---
  async function loadProduct(productId, variantId, quantity) {
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}`);
      if (!res.ok) throw new Error('Produto não encontrado');
      productData = await res.json();

      let title = productData.title;
      let price = productData.price;
      let image = productData.images?.[0] || null;
      let variantTitle = '';

      if (variantId && productData.variants?.length) {
        const variant = productData.variants.find(v => String(v.id) === String(variantId));
        if (variant) {
          variantTitle = variant.title;
          title = `${productData.title} - ${variant.title}`;
          price = variant.price || price;
        }
      }

      orderItems.push({
        title: productData.title,
        variantTitle,
        fullTitle: title,
        unitPrice: Math.round(price * 100),
        quantity,
        tangible: true,
        image,
      });
    } catch (err) {
      showError('Erro ao carregar produto: ' + err.message);
    }
  }

  // --- Resumo do Pedido ---
  function renderOrderSummary() {
    const container = document.getElementById('order-items');
    let total = 0;

    if (orderItems.length === 0) {
      container.innerHTML = '<p class="order-empty">Nenhum item no pedido</p>';
      document.getElementById('order-total-value').textContent = formatCurrency(0);
      const subtotalEl = document.getElementById('order-subtotal-value');
      if (subtotalEl) subtotalEl.textContent = formatCurrency(0);
      return;
    }

    container.innerHTML = orderItems.map(item => {
      const itemTotal = item.unitPrice * item.quantity;
      total += itemTotal;
      const imageHtml = item.image
        ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="order-item-image">`
        : '';
      const variantHtml = item.variantTitle
        ? `<span class="order-item-variant">${escapeHtml(item.variantTitle)}</span>`
        : '';
      return `
        <div class="order-item">
          ${imageHtml}
          <div class="order-item-info">
            <span class="order-item-title">${escapeHtml(item.title)}</span>
            ${variantHtml}
            <span class="order-item-price">${formatCurrency(itemTotal)}</span>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('order-total-value').textContent = formatCurrency(total);
    const subtotalEl = document.getElementById('order-subtotal-value');
    if (subtotalEl) subtotalEl.textContent = formatCurrency(total);

    updateTotals();
  }

  // --- Atualizar parcelas no select ---
  function updateInstallments(totalCents) {
    const select = document.getElementById('card-installments');
    if (!select) return;
    select.innerHTML = '';
    const interestRate = 0.0299; // 2.99% ao mês
    for (let i = 1; i <= 12; i++) {
      let installmentValue;
      let label;
      if (i === 1) {
        installmentValue = totalCents;
        label = `1x de ${formatCurrency(installmentValue)} (à vista)`;
      } else {
        const totalWithInterest = totalCents * Math.pow(1 + interestRate, i);
        installmentValue = Math.round(totalWithInterest / i);
        label = `${i}x de ${formatCurrency(installmentValue)}`;
      }
      const option = document.createElement('option');
      option.value = i;
      option.textContent = label;
      select.appendChild(option);
    }
    updatePixDiscount(totalCents);
  }

  function updatePixDiscount(totalCents) {
    const discounted = Math.round(totalCents * 0.95);
    const el = document.getElementById('pix-discount-value');
    if (el) el.textContent = formatCurrency(discounted);
  }

  // ===========================
  // STEP NAVIGATION
  // ===========================
  function setupStepButtons() {
    document.getElementById('btn-step-1').addEventListener('click', () => {
      if (validateStep1()) {
        completeStep(1);
        openStep(2);
      }
    });

    document.getElementById('btn-step-2').addEventListener('click', () => {
      if (validateStep2()) {
        completeStep(2);
        openStep(3);
      }
    });
  }

  function setupEditButtons() {
    document.getElementById('edit-step-1').addEventListener('click', () => {
      editStep(1);
    });
    document.getElementById('edit-step-2').addEventListener('click', () => {
      editStep(2);
    });
  }

  function openStep(step) {
    currentStep = step;
    const card = document.querySelector(`[data-step="${step}"]`);
    card.classList.remove('step-card--locked', 'step-card--completed');
    card.classList.add('step-card--active');

    const body = document.getElementById(`body-step-${step}`);
    body.style.display = '';

    const summary = document.getElementById(`summary-step-${step}`);
    if (summary) summary.style.display = 'none';

    const lockedMsg = document.getElementById(`locked-msg-${step}`);
    if (lockedMsg) lockedMsg.style.display = 'none';

    const editBtn = document.getElementById(`edit-step-${step}`);
    if (editBtn) editBtn.style.display = 'none';

    // Subtitle visible
    const subtitle = card.querySelector('.step-card__subtitle:not(.step-card__locked-msg)');
    if (subtitle) subtitle.style.display = '';

    // Scroll into view
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function completeStep(step) {
    const card = document.querySelector(`[data-step="${step}"]`);
    card.classList.remove('step-card--active', 'step-card--locked');
    card.classList.add('step-card--completed');

    const body = document.getElementById(`body-step-${step}`);
    body.style.display = 'none';

    const subtitle = card.querySelector('.step-card__subtitle:not(.step-card__locked-msg)');
    if (subtitle) subtitle.style.display = 'none';

    // Show summary
    const summary = document.getElementById(`summary-step-${step}`);
    if (summary) {
      summary.innerHTML = buildStepSummary(step);
      summary.style.display = '';
    }

    // Show edit button
    const editBtn = document.getElementById(`edit-step-${step}`);
    if (editBtn) editBtn.style.display = '';
  }

  function editStep(step) {
    // Re-lock everything after this step
    for (let i = step + 1; i <= 3; i++) {
      lockStep(i);
    }
    openStep(step);
  }

  function lockStep(step) {
    const card = document.querySelector(`[data-step="${step}"]`);
    card.classList.remove('step-card--active', 'step-card--completed');
    card.classList.add('step-card--locked');

    const body = document.getElementById(`body-step-${step}`);
    body.style.display = 'none';

    const summary = document.getElementById(`summary-step-${step}`);
    if (summary) summary.style.display = 'none';

    const editBtn = document.getElementById(`edit-step-${step}`);
    if (editBtn) editBtn.style.display = 'none';

    const lockedMsg = document.getElementById(`locked-msg-${step}`);
    if (lockedMsg) lockedMsg.style.display = '';
  }

  function buildStepSummary(step) {
    if (step === 1) {
      const name = document.getElementById('customer-name').value.trim();
      const email = document.getElementById('customer-email').value.trim();
      const phone = document.getElementById('customer-phone').value.trim();
      return `<strong>${escapeHtml(name)}</strong><br>${escapeHtml(email)} · ${escapeHtml(phone)}`;
    }
    if (step === 2) {
      const street = document.getElementById('address-street').value.trim();
      const number = document.getElementById('address-number').value.trim();
      const neighborhood = document.getElementById('address-neighborhood').value.trim();
      const city = document.getElementById('address-city').value.trim();
      const state = document.getElementById('address-state').value;
      const cep = document.getElementById('address-cep').value.trim();
      const shippingText = selectedShipping.price === 0
        ? `${escapeHtml(selectedShipping.label)} · <strong>Grátis</strong>`
        : `${escapeHtml(selectedShipping.label)} · <strong>${formatCurrency(selectedShipping.price)}</strong>`;
      return `${escapeHtml(street)}, ${escapeHtml(number)} - ${escapeHtml(neighborhood)}<br>${escapeHtml(city)}/${escapeHtml(state)} · CEP ${escapeHtml(cep)}<br>${shippingText}`;
    }
    return '';
  }

  // --- Step Validations ---
  function validateStep1() {
    clearFieldErrors();
    hideError();
    const errors = [];
    const fields = [
      { id: 'customer-name', label: 'Nome' },
      { id: 'customer-email', label: 'E-mail' },
      { id: 'customer-cpf', label: 'CPF' },
      { id: 'customer-phone', label: 'Telefone' },
    ];

    fields.forEach(({ id, label }) => {
      const el = document.getElementById(id);
      if (!el.value.trim()) {
        errors.push(label);
        showFieldError(el, `${label} é obrigatório`);
      }
    });

    const cpfEl = document.getElementById('customer-cpf');
    const cpf = cpfEl.value.replace(/\D/g, '');
    if (cpf.length > 0 && !validateCPF(cpf) && !cpfEl.classList.contains('error')) {
      errors.push('CPF inválido');
      showFieldError(cpfEl, 'CPF inválido');
    }

    const emailEl = document.getElementById('customer-email');
    if (emailEl.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value) && !emailEl.classList.contains('error')) {
      errors.push('E-mail inválido');
      showFieldError(emailEl, 'E-mail inválido');
    }

    if (errors.length > 0) {
      document.querySelector('.error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  function validateStep2() {
    clearFieldErrors();
    hideError();
    const errors = [];

    // Check CEP first — if address fields aren't visible yet, prompt
    const addressFields = document.getElementById('address-fields');
    if (addressFields.style.display === 'none') {
      const cepEl = document.getElementById('address-cep');
      showFieldError(cepEl, 'Preencha o CEP para continuar');
      cepEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }

    const fields = [
      { id: 'address-cep', label: 'CEP' },
      { id: 'address-street', label: 'Rua' },
      { id: 'address-number', label: 'Número' },
      { id: 'address-neighborhood', label: 'Bairro' },
      { id: 'address-city', label: 'Cidade' },
      { id: 'address-state', label: 'Estado' },
    ];

    fields.forEach(({ id, label }) => {
      const el = document.getElementById(id);
      if (!el.value.trim()) {
        errors.push(label);
        showFieldError(el, `${label} é obrigatório`);
      }
    });

    if (errors.length > 0) {
      document.querySelector('.error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  function validateStep3() {
    clearFieldErrors();
    hideError();
    const errors = [];

    if (selectedMethod === 'credit_card') {
      const fields = [
        { id: 'card-number', label: 'Número do cartão' },
        { id: 'card-holder', label: 'Nome no cartão' },
        { id: 'card-expiry', label: 'Validade' },
        { id: 'card-cvv', label: 'CVV' },
      ];
      fields.forEach(({ id, label }) => {
        const el = document.getElementById(id);
        if (!el.value.trim()) {
          errors.push(label);
          showFieldError(el, `${label} é obrigatório`);
        }
      });
    }

    if (errors.length > 0) {
      document.querySelector('.error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  // --- Tabs de Pagamento ---
  function setupPaymentTabs() {
    const tabs = document.querySelectorAll('.payment-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        selectedMethod = tab.dataset.method;
        document.querySelectorAll('.payment-content').forEach(c => c.classList.remove('active'));
        const target = document.getElementById('payment-' + selectedMethod);
        if (target) target.classList.add('active');
      });
    });
  }

  // --- Máscaras de Input ---
  function setupMasks() {
    const cpfInput = document.getElementById('customer-cpf');
    const phoneInput = document.getElementById('customer-phone');
    const cardNumber = document.getElementById('card-number');
    const cardExpiry = document.getElementById('card-expiry');

    cpfInput.addEventListener('input', () => { cpfInput.value = maskCPF(cpfInput.value); });
    phoneInput.addEventListener('input', () => { phoneInput.value = maskPhone(phoneInput.value); });
    cardNumber.addEventListener('input', () => { cardNumber.value = maskCardNumber(cardNumber.value); });
    cardExpiry.addEventListener('input', () => { cardExpiry.value = maskExpiry(cardExpiry.value); });
  }

  function validateCPF(cpf) {
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    for (let t = 9; t < 11; t++) {
      let sum = 0;
      for (let i = 0; i < t; i++) sum += parseInt(cpf[i], 10) * (t + 1 - i);
      let digit = ((sum * 10) % 11) % 10;
      if (parseInt(cpf[t], 10) !== digit) return false;
    }
    return true;
  }

  function maskCPF(v) {
    return v.replace(/\D/g, '').slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  function maskPhone(v) {
    v = v.replace(/\D/g, '').slice(0, 11);
    if (v.length > 6) return v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    if (v.length > 2) return v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    return v;
  }

  function maskCEP(v) {
    return v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
  }

  function maskCardNumber(v) {
    return v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  function maskExpiry(v) {
    return v.replace(/\D/g, '').slice(0, 4).replace(/(\d{2})(\d)/, '$1/$2');
  }

  // --- Busca CEP (ViaCEP) ---
  function setupCEPLookup() {
    const cepInput = document.getElementById('address-cep');
    const cepGroup = cepInput.closest('.form-group');
    const addressFields = document.getElementById('address-fields');

    function tryLookup() {
      const cep = cepInput.value.replace(/\D/g, '');
      if (cep.length !== 8) return;
      cepGroup.classList.add('cep-loading');
      // Clear previous CEP error
      const prevErr = cepGroup.querySelector('.field-error');
      if (prevErr) prevErr.remove();
      cepInput.classList.remove('error');

      const minDelay = new Promise(resolve => setTimeout(resolve, 800));

      Promise.all([
        fetch(`https://viacep.com.br/ws/${encodeURIComponent(cep)}/json/`).then(r => r.json()),
        minDelay
      ])
        .then(([data]) => {
          if (!data.erro) {
            document.getElementById('address-street').value = data.logradouro || '';
            document.getElementById('address-neighborhood').value = data.bairro || '';
            document.getElementById('address-city').value = data.localidade || '';
            document.getElementById('address-state').value = data.uf || '';
          } else {
            // CEP not found — show warning and highlight required fields
            showFieldError(cepInput, 'Ops! Não achamos o endereço. Preencha os campos abaixo pra continuar');
            const required = ['address-street', 'address-number', 'address-neighborhood', 'address-city', 'address-state'];
            required.forEach(id => document.getElementById(id).classList.add('error'));
          }
          addressFields.style.display = '';
        })
        .catch(() => {
          showFieldError(cepInput, 'Erro ao buscar CEP. Preencha o endereço manualmente');
          addressFields.style.display = '';
        })
        .finally(() => {
          cepGroup.classList.remove('cep-loading');
        });
    }

    cepInput.addEventListener('blur', tryLookup);
    cepInput.addEventListener('input', () => {
      cepInput.value = maskCEP(cepInput.value);
      const raw = cepInput.value.replace(/\D/g, '');
      if (raw.length === 8) tryLookup();
    });
  }

  // --- Shipping selection ---
  function setupShippingOptions() {
    const radios = document.querySelectorAll('input[name="shipping"]');
    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        // Update selected class on labels
        document.querySelectorAll('.shipping-option').forEach(l => l.classList.remove('shipping-option--selected'));
        radio.closest('.shipping-option').classList.add('shipping-option--selected');
        selectedShipping = {
          label: radio.dataset.label,
          price: parseInt(radio.dataset.price, 10),
        };
        updateTotals();
      });
    });
  }

  function updateTotals() {
    const subtotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const shippingEl = document.getElementById('order-shipping-value');
    const totalEl = document.getElementById('order-total-value');
    const total = subtotal + selectedShipping.price;
    if (shippingEl) {
      shippingEl.textContent = selectedShipping.price === 0 ? 'Grátis' : formatCurrency(selectedShipping.price);
    }
    if (totalEl) {
      totalEl.textContent = formatCurrency(total);
    }
    updateInstallments(total);
  }

  // --- Botão Pagar ---
  function setupPayButton() {
    document.getElementById('btn-pay').addEventListener('click', handlePayment);
  }

  async function handlePayment() {
    hideError();
    hideResult();

    if (!validateStep3()) return;

    const btn = document.getElementById('btn-pay');
    setLoading(btn, true);

    try {
      const customer = getCustomerData();
      const subtotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      let total = subtotal + selectedShipping.price;

      // 5% discount for PIX
      if (selectedMethod === 'pix') {
        total = Math.round(total * 0.95);
      }

      const body = {
        amount: total,
        paymentMethod: selectedMethod,
        customer,
        items: orderItems.map(i => ({
          title: i.fullTitle || i.title,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
          tangible: i.tangible,
        })),
      };

      if (selectedMethod === 'credit_card') {
        const token = await tokenizeCard();
        body.card = { token };
        body.installments = parseInt(document.getElementById('card-installments').value, 10);
      }

      if (selectedMethod === 'pix') {
        body.pix = { expiresInDays: 1 };
      }

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || data.error?.errors?.[0]?.message || 'Erro ao processar pagamento');
      }

      showResult(data);
    } catch (err) {
      showError(err.message || 'Erro inesperado. Tente novamente.');
    } finally {
      setLoading(btn, false);
    }
  }

  // --- Tokenização de cartão ---
  async function tokenizeCard() {
    if (typeof Bestfy === 'undefined') {
      throw new Error('Biblioteca de tokenização não carregada. Recarregue a página.');
    }

    Bestfy.setPublicKey(config.publicKey);
    if (config.testMode) Bestfy.setTestMode(true);

    const number = document.getElementById('card-number').value.replace(/\s/g, '');
    const holderName = document.getElementById('card-holder').value.trim();
    const expiry = document.getElementById('card-expiry').value.split('/');
    const cvv = document.getElementById('card-cvv').value;

    const token = await Bestfy.encrypt({
      number,
      holderName,
      expMonth: parseInt(expiry[0], 10),
      expYear: 2000 + parseInt(expiry[1], 10),
      cvv,
    });

    if (!token) throw new Error('Erro ao tokenizar cartão. Verifique os dados.');
    return token;
  }

  // --- Dados do cliente ---
  function getCustomerData() {
    return {
      name: document.getElementById('customer-name').value.trim(),
      email: document.getElementById('customer-email').value.trim(),
      phone: document.getElementById('customer-phone').value.replace(/\D/g, ''),
      document: {
        number: document.getElementById('customer-cpf').value.replace(/\D/g, ''),
        type: 'cpf',
      },
      address: {
        street: document.getElementById('address-street').value.trim(),
        streetNumber: document.getElementById('address-number').value.trim(),
        complement: document.getElementById('address-complement').value.trim() || null,
        zipCode: document.getElementById('address-cep').value.replace(/\D/g, ''),
        neighborhood: document.getElementById('address-neighborhood').value.trim(),
        city: document.getElementById('address-city').value.trim(),
        state: document.getElementById('address-state').value,
        country: 'BR',
      },
    };
  }

  function clearFieldErrors() {
    document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    document.querySelectorAll('.field-error').forEach(el => el.remove());
  }

  function showFieldError(inputEl, msg) {
    // For phone input inside wrapper, add error to wrapper
    const wrapper = inputEl.closest('.phone-input-wrapper');
    if (wrapper) {
      wrapper.classList.add('error');
    } else {
      inputEl.classList.add('error');
    }
    const span = document.createElement('span');
    span.className = 'field-error';
    // Append to form-group, not the wrapper
    const formGroup = inputEl.closest('.form-group');
    (formGroup || inputEl.parentElement).appendChild(span);
    span.textContent = msg;
  }

  // --- Exibir Resultado ---
  function showResult(data) {
    // Hide all steps
    document.querySelectorAll('.step-card').forEach(c => c.style.display = 'none');

    const resultDiv = document.getElementById('payment-result');
    const title = document.getElementById('result-title');
    const message = document.getElementById('result-message');
    const successIcon = document.getElementById('result-icon-success');
    const waitingIcon = document.getElementById('result-icon-waiting');

    if (selectedMethod === 'credit_card') {
      if (data.status === 'paid' || data.status === 'authorized') {
        successIcon.style.display = 'block';
        waitingIcon.style.display = 'none';
        title.textContent = 'Pagamento aprovado!';
        message.textContent = 'Seu pedido foi confirmado com sucesso.';
        // Fire Google Ads conversion
        const subtotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
        const total = subtotal + selectedShipping.price;
        fireGoogleConversion(total / 100, data.id);
        fireFacebookPurchase(total / 100, data.id);
      } else if (data.status === 'refused') {
        document.querySelectorAll('.step-card').forEach(c => c.style.display = '');
        showError('Pagamento recusado. Verifique os dados do cartão e tente novamente.');
        return;
      } else {
        waitingIcon.style.display = 'block';
        successIcon.style.display = 'none';
        title.textContent = 'Processando pagamento';
        message.textContent = 'Seu pagamento está sendo processado. Você receberá uma confirmação em breve.';
      }
      populateCardResultSummary();
      document.getElementById('card-result-details').style.display = 'block';
      document.querySelector('.checkout-container').classList.add('checkout-container--pix');
      document.querySelector('.order-summary').style.display = 'none';
    }

    if (selectedMethod === 'pix' && data.pix) {
      // Hide generic result heading — pix-screen has its own
      successIcon.style.display = 'none';
      waitingIcon.style.display = 'none';
      title.style.display = 'none';
      message.style.display = 'none';

      document.getElementById('pix-result').style.display = 'block';
      document.getElementById('pix-qrcode-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.pix.qrcode)}`;
      document.getElementById('pix-code').value = data.pix.qrcode;

      // Populate PIX discount value
      const subtotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      const total = subtotal + selectedShipping.price;
      const discounted = Math.round(total * 0.95);
      const discountEl = document.getElementById('pix-discount-display');
      if (discountEl) discountEl.textContent = formatCurrency(discounted);

      startPixTimer();
      populatePixSummary();
      document.querySelector('.checkout-container').classList.add('checkout-container--pix');
      document.querySelector('.order-summary').style.display = 'none';

      // Start polling PIX payment status
      pixTransactionId = data.id;
      startPixPolling(discounted);
    }

    resultDiv.style.display = 'block';
  }

  // --- PIX Timer ---
  let pixTimerInterval = null;
  function startPixTimer() {
    if (pixTimerInterval) clearInterval(pixTimerInterval);
    let remaining = 30 * 60; // 30 minutes
    const el = document.getElementById('pix-timer');
    function tick() {
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      if (remaining <= 0) {
        clearInterval(pixTimerInterval);
        el.textContent = 'Expirado';
      }
      remaining--;
    }
    tick();
    pixTimerInterval = setInterval(tick, 1000);
  }

  // --- PIX Payment Status Polling ---
  function startPixPolling(pixAmount) {
    if (pixPollInterval) clearInterval(pixPollInterval);
    pixPollInterval = setInterval(async () => {
      if (!pixTransactionId) return;
      try {
        const res = await fetch(`/api/transactions/${encodeURIComponent(pixTransactionId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'paid' || data.status === 'authorized') {
          clearInterval(pixPollInterval);
          pixPollInterval = null;
          fireGoogleConversion(pixAmount / 100, pixTransactionId);
          fireFacebookPurchase(pixAmount / 100, pixTransactionId);
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 15000);
  }

  function hideResult() {
    document.getElementById('payment-result').style.display = 'none';
    document.getElementById('pix-result').style.display = 'none';
    document.getElementById('card-result-details').style.display = 'none';
    document.getElementById('result-icon-success').style.display = 'none';
    document.getElementById('result-icon-waiting').style.display = 'none';
    document.getElementById('result-title').style.display = '';
    document.getElementById('result-message').style.display = '';
    document.querySelectorAll('.step-card').forEach(c => c.style.display = '');
    document.querySelector('.checkout-container').classList.remove('checkout-container--pix');
    document.querySelector('.order-summary').style.display = '';
    if (pixTimerInterval) { clearInterval(pixTimerInterval); pixTimerInterval = null; }
    if (pixPollInterval) { clearInterval(pixPollInterval); pixPollInterval = null; }
  }

  function populatePixSummary() {
    populateResultItems('pix-summary-items');
    populateResultAddress('pix-summary-address', 'pix-summary-shipping');
    const subtotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    document.getElementById('pix-summary-subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('pix-summary-frete').textContent =
      selectedShipping.price === 0 ? 'Grátis' : formatCurrency(selectedShipping.price);
    const total = subtotal + selectedShipping.price;
    const discounted = Math.round(total * 0.95);
    document.getElementById('pix-summary-total').textContent = formatCurrency(discounted);
  }

  function populateCardResultSummary() {
    populateResultItems('result-summary-items');
    populateResultAddress('result-summary-address', 'result-summary-shipping');

    // Customer
    const name = document.getElementById('customer-name').value.trim();
    const email = document.getElementById('customer-email').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    document.getElementById('result-summary-customer').innerHTML =
      `<strong>${escapeHtml(name)}</strong><br>${escapeHtml(email)}<br>${escapeHtml(phone)}`;

    // Totals
    const subtotal = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    document.getElementById('result-summary-subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('result-summary-frete').textContent =
      selectedShipping.price === 0 ? 'Grátis' : formatCurrency(selectedShipping.price);
    document.getElementById('result-summary-total').textContent = formatCurrency(subtotal + selectedShipping.price);
  }

  function populateResultItems(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = orderItems.map(item => {
      const itemTotal = item.unitPrice * item.quantity;
      const imgClass = containerId.startsWith('pix') ? 'pix-order-summary__img' : 'result-summary__item-img';
      const itemClass = containerId.startsWith('pix') ? 'pix-order-summary__item' : 'result-summary__item';
      const infoClass = containerId.startsWith('pix') ? 'pix-order-summary__item-info' : 'result-summary__item-info';
      const titleClass = containerId.startsWith('pix') ? 'pix-order-summary__item-title' : 'result-summary__item-title';
      const variantClass = containerId.startsWith('pix') ? 'pix-order-summary__variant' : 'result-summary__item-variant';
      const qtyClass = containerId.startsWith('pix') ? 'pix-order-summary__item-qty' : 'result-summary__item-qty';
      const priceClass = containerId.startsWith('pix') ? 'pix-order-summary__item-price' : 'result-summary__item-price';
      const imageHtml = item.image
        ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="${imgClass}">`
        : '';
      const variantHtml = item.variantTitle
        ? `<span class="${variantClass}">${escapeHtml(item.variantTitle)}</span>`
        : '';
      return `
        <div class="${itemClass}">
          ${imageHtml}
          <div class="${infoClass}">
            <span class="${titleClass}">${escapeHtml(item.title)}</span>
            ${variantHtml}
            <span class="${qtyClass}">Qtd: ${item.quantity}</span>
          </div>
          <span class="${priceClass}">${formatCurrency(itemTotal)}</span>
        </div>
      `;
    }).join('');
  }

  function populateResultAddress(addressId, shippingId) {
    const street = document.getElementById('address-street').value.trim();
    const number = document.getElementById('address-number').value.trim();
    const neighborhood = document.getElementById('address-neighborhood').value.trim();
    const city = document.getElementById('address-city').value.trim();
    const state = document.getElementById('address-state').value;
    const cep = document.getElementById('address-cep').value.trim();
    document.getElementById(addressId).innerHTML =
      `${escapeHtml(street)}, ${escapeHtml(number)} - ${escapeHtml(neighborhood)}<br>${escapeHtml(city)}/${escapeHtml(state)} · CEP ${escapeHtml(cep)}`;
    const shippingText = selectedShipping.price === 0
      ? `${escapeHtml(selectedShipping.label)} · <strong>Grátis</strong>`
      : `${escapeHtml(selectedShipping.label)} · <strong>${formatCurrency(selectedShipping.price)}</strong>`;
    document.getElementById(shippingId).innerHTML = shippingText;
  }

  // --- Copiar para clipboard ---
  function setupCopyButtons() {
    document.getElementById('btn-copy-pix').addEventListener('click', () => {
      copyToClipboard(document.getElementById('pix-code').value, 'btn-copy-pix');
    });

  }

  function copyToClipboard(text, btnId) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById(btnId);
      const original = btn.innerHTML;
      btn.textContent = '✓ Copiado!';
      setTimeout(() => { btn.innerHTML = original; }, 2000);
    });
  }

  // --- UI Helpers ---
  function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.querySelector('.btn-text').style.display = loading ? 'none' : '';
    btn.querySelector('.btn-loading').style.display = loading ? '' : 'none';
  }

  function showError(msg) {
    const el = document.getElementById('error-message');
    el.textContent = msg;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideError() {
    document.getElementById('error-message').style.display = 'none';
  }

  function formatCurrency(cents) {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Expose API for external scripts (e.g. order bumps) ---
  window.__checkout = {
    addItem(item) {
      orderItems.push(item);
      renderOrderSummary();
    },
    getItems() { return orderItems; },
    updateTotals,
    renderOrderSummary,
  };

  // --- Start ---
  document.addEventListener('DOMContentLoaded', init);

  // --- Preview Mode (dev only) ---
  // Use ?preview=pix or ?preview=success or ?preview=processing
  function checkPreviewMode() {
    const preview = new URLSearchParams(window.location.search).get('preview');
    if (!preview) return;

    // Mock order data if empty
    if (orderItems.length === 0) {
      orderItems.push({
        title: 'Produto de Teste',
        fullTitle: 'Produto de Teste - Tamanho M',
        unitPrice: 20990,
        quantity: 1,
        tangible: true,
        image: '',
        variantTitle: 'M / Preto',
      });
      renderOrderSummary();
    }

    // Fill mock form fields for preview summaries
    const mockFields = {
      'customer-name': 'João da Silva',
      'customer-email': 'joao@email.com',
      'customer-phone': '(11) 99999-9999',
      'address-street': 'Rua Exemplo',
      'address-number': '123',
      'address-neighborhood': 'Centro',
      'address-city': 'São Paulo',
      'address-state': 'SP',
      'address-cep': '01001-000',
    };
    Object.entries(mockFields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = val;
    });

    if (preview === 'pix') {
      selectedMethod = 'pix';
      showResult({
        status: 'waiting_payment',
        pix: {
          qrcode: '00020126880014br.gov.bcb.pix2566qrcodepix-h.bb.com.br/pix/v2/preview-fake-code-1234567890',
        },
      });
    } else if (preview === 'success') {
      selectedMethod = 'credit_card';
      showResult({ status: 'paid' });
    } else if (preview === 'processing') {
      selectedMethod = 'credit_card';
      showResult({ status: 'processing' });
    }
  }

  // --- Counter Animation ---
  function initCounterAnimation() {
    const counters = document.querySelectorAll('.counter-number[data-target]');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.getAttribute('data-target'), 10);
          if (isNaN(target)) return;
          animateCounter(el, target);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach((c) => observer.observe(c));
  }

  function animateCounter(el, endNumber) {
    const duration = 2000;
    const steps = 60;
    const stepValue = endNumber / steps;
    let current = 0;
    const interval = setInterval(() => {
      current += stepValue;
      if (current >= endNumber) {
        el.textContent = endNumber;
        clearInterval(interval);
      } else {
        el.textContent = Math.floor(current);
      }
    }, duration / steps);
  }

  initCounterAnimation();
})();
