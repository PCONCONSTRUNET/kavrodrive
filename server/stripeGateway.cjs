const env = require('./env.cjs');
const db = require('./db.cjs');
const Stripe = require('stripe');

let cachedClient = null;
let cachedSecret = '';
let customFactoryForTest = null;

function getStripeSecretKey() {
  return String(env.STRIPE_SECRET_KEY || '').trim();
}

function getStripePublishableKey() {
  return String(env.STRIPE_PUBLISHABLE_KEY || env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim();
}

function getStripeWebhookSecret() {
  return String(env.STRIPE_WEBHOOK_SECRET || '').trim();
}

function isStripeEnabled() {
  return Boolean(getStripeSecretKey() || customFactoryForTest);
}

function _setStripeClientFactoryForTest(factoryOrNull) {
  customFactoryForTest = typeof factoryOrNull === 'function' ? factoryOrNull : null;
  cachedClient = null;
  cachedSecret = '';
}

function getStripeClient() {
  if (customFactoryForTest) {
    return customFactoryForTest();
  }
  const secret = getStripeSecretKey();
  if (!secret) {
    throw new Error('STRIPE_SECRET_KEY não configurada no servidor.');
  }
  if (!cachedClient || cachedSecret !== secret) {
    cachedClient = new Stripe(secret);
    cachedSecret = secret;
  }
  return cachedClient;
}

function toBrlCents(amountBrl) {
  return Math.max(50, Math.round((Number(amountBrl) || 0) * 100));
}

function toBrlFromCents(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

function normalizeStripeBrand(rawBrand) {
  const b = String(rawBrand || '').toLowerCase();
  if (b === 'visa') return 'Visa';
  if (b === 'mastercard') return 'Mastercard';
  if (b === 'elo') return 'Elo';
  if (b === 'amex') return 'Amex';
  if (b === 'hipercard') return 'Hipercard';
  if (b === 'diners') return 'Diners';
  if (!b) return 'Cartão';
  return b.charAt(0).toUpperCase() + b.slice(1);
}

function formatStripeErrorPt(err) {
  const code = String(err?.code || err?.raw?.code || '').toLowerCase();
  const decline = String(err?.decline_code || err?.raw?.decline_code || '').toLowerCase();
  if (decline === 'insufficient_funds') return 'Saldo ou limite insuficiente no cartão.';
  if (decline === 'expired_card' || code === 'expired_card') return 'Este cartão está vencido.';
  if (code === 'incorrect_cvc') return 'Código de segurança (CVV) inválido.';
  if (code === 'incorrect_number') return 'Número do cartão inválido.';
  if (code === 'authentication_required') return 'O banco emissor exigiu verificação adicional (3DS).';
  if (code === 'card_declined' || decline) return 'Cartão recusado pelo banco emissor. Tente outro cartão ou PIX.';
  return err?.message || 'Não foi possível processar o pagamento na Stripe.';
}

function parseStripeGatewayToken(rawToken) {
  const str = String(rawToken || '').trim();
  if (!str.startsWith('stripe_pm_')) return null;
  const rest = str.slice('stripe_pm_'.length);
  const idx = rest.indexOf(':');
  if (idx <= 0) return null;
  const customerId = rest.slice(0, idx).trim();
  const paymentMethodId = rest.slice(idx + 1).trim();
  if (!customerId || !paymentMethodId) return null;
  return { customerId, paymentMethodId };
}

async function readStoredStripeCustomerId(clientId, clientPhone) {
  if (!clientId) return '';
  if (!db.pool) {
    const cli = (db.localStore?.clients || []).find(c => c.id === clientId);
    if (cli?.stripe_customer_id) return String(cli.stripe_customer_id);
  } else {
    const r = await db.query('SELECT stripe_customer_id FROM public.clients WHERE id = $1 LIMIT 1', [clientId]);
    if (r.rows[0]?.stripe_customer_id) return String(r.rows[0].stripe_customer_id);
  }

  // Reaproveita customerId se já existir cartão Stripe salvo anteriormente
  const cleanPhone = String(clientPhone || '').replace(/\D/g, '');
  const savedCards = !db.pool
    ? (db.localStore?.saved_cards || []).filter(c => c.client_id === clientId || (cleanPhone.length >= 8 && String(c.client_phone || '').replace(/\D/g, '') === cleanPhone))
    : (await db.query(
        `SELECT gateway_token FROM public.saved_cards
         WHERE ($1 <> '' AND client_id = $1)
            OR ($2 <> '' AND regexp_replace(COALESCE(client_phone, ''), '\\D', '', 'g') = $2)
         ORDER BY created_at DESC LIMIT 5`,
        [String(clientId || ''), cleanPhone]
      )).rows;

  for (const row of savedCards || []) {
    const parsed = parseStripeGatewayToken(row.gateway_token || row.gatewayToken);
    if (parsed?.customerId) return parsed.customerId;
  }
  return '';
}

async function persistStripeCustomerId(clientId, stripeCustomerId) {
  if (!clientId || !stripeCustomerId) return;
  if (!db.pool) {
    const c = (db.localStore?.clients || []).find(item => item.id === clientId);
    if (c) {
      c.stripe_customer_id = stripeCustomerId;
      db.saveLocalStore();
    }
    return;
  }
  await db.query(
    'UPDATE public.clients SET stripe_customer_id = $1 WHERE id = $2',
    [stripeCustomerId, clientId]
  ).catch(() => {});
}

async function ensureCustomer({ clientId, clientPhone, clientEmail, clientName }) {
  const existing = await readStoredStripeCustomerId(clientId, clientPhone);
  if (existing && existing.startsWith('cus_')) {
    return existing;
  }
  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    name: String(clientName || 'Passageiro Kavro Drive').trim(),
    email: clientEmail ? String(clientEmail).trim().toLowerCase() : undefined,
    phone: clientPhone ? String(clientPhone).trim() : undefined,
    metadata: {
      kavroClientId: String(clientId || ''),
      phoneDigits: String(clientPhone || '').replace(/\D/g, '')
    }
  });
  await persistStripeCustomerId(clientId, customer.id);
  return customer.id;
}

async function createCardSetupIntent({ clientId, clientPhone, clientEmail, clientName }) {
  const stripe = getStripeClient();
  const customerId = await ensureCustomer({ clientId, clientPhone, clientEmail, clientName });
  const si = await stripe.setupIntents.create({
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    usage: 'off_session',
    metadata: {
      kavroClientId: String(clientId || ''),
      purpose: 'save_passenger_card'
    }
  });
  return {
    setupIntentId: si.id,
    clientSecret: si.client_secret,
    customerId,
    publishableKey: getStripePublishableKey()
  };
}

async function resolveSavedCard({ setupIntentId, paymentMethodId, clientId, clientPhone, preferredCardType }) {
  const stripe = getStripeClient();
  const expectedCustomerId = await readStoredStripeCustomerId(clientId, clientPhone);
  let pmId = String(paymentMethodId || '').trim();
  let customerId = expectedCustomerId;

  if (setupIntentId) {
    const si = await stripe.setupIntents.retrieve(String(setupIntentId).trim());
    if (!si || si.status !== 'succeeded') {
      throw new Error('Configuração do cartão na Stripe não foi concluída.');
    }
    const siCustomer = typeof si.customer === 'string' ? si.customer : si.customer?.id || '';
    if (expectedCustomerId && siCustomer && siCustomer !== expectedCustomerId) {
      throw new Error('Cartão pertence a outro cliente.');
    }
    customerId = siCustomer || customerId;
    if (!pmId) {
      pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id || '';
    }
  }

  if (!pmId) {
    throw new Error('Método de pagamento Stripe (PaymentMethod) ausente.');
  }

  const pm = await stripe.paymentMethods.retrieve(pmId);
  const pmCustomer = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id || '';
  if (expectedCustomerId && pmCustomer && pmCustomer !== expectedCustomerId) {
    throw new Error('PaymentMethod pertence a outro cliente.');
  }
  customerId = pmCustomer || customerId;
  if (!customerId) {
    customerId = await ensureCustomer({ clientId, clientPhone });
  }
  if (!pmCustomer && customerId) {
    await stripe.paymentMethods.attach(pmId, { customer: customerId });
  }
  await persistStripeCustomerId(clientId, customerId);

  const card = pm.card || {};
  const funding = String(card.funding || '').toLowerCase();
  const resolvedType =
    preferredCardType === 'cartao_debito' || preferredCardType === 'cartao_credito'
      ? preferredCardType
      : (funding === 'debit' ? 'cartao_debito' : 'cartao_credito');

  return {
    brand: normalizeStripeBrand(card.brand),
    last4: String(card.last4 || '4242'),
    expMonth: String(card.exp_month || 12).padStart(2, '0'),
    expYear: String(card.exp_year || 2030),
    cardType: resolvedType,
    gatewayToken: `stripe_pm_${customerId}:${pm.id}`,
    customerId,
    paymentMethodId: pm.id
  };
}

async function authorizeCardHold({
  amountBrl,
  rideId,
  rideCode,
  customerId,
  paymentMethodId,
  clientEmail,
  driverId
}) {
  const stripe = getStripeClient();
  const amountCents = toBrlCents(amountBrl);
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'brl',
        customer: customerId,
        payment_method: paymentMethodId,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        capture_method: 'manual',
        confirm: true,
        off_session: true,
        description: `Corrida Kavro Drive ${rideCode || rideId}`,
        receipt_email: clientEmail ? String(clientEmail).trim().toLowerCase() : undefined,
        metadata: {
          purpose: 'ride_card',
          rideId: String(rideId || ''),
          rideCode: String(rideCode || ''),
          driverId: String(driverId || '')
        }
      },
      {
        idempotencyKey: `kavro_st_auth_${rideId}_${amountCents}`
      }
    );

    if (pi.status === 'requires_capture' || pi.status === 'succeeded') {
      return {
        authorized: true,
        paymentIntentId: pi.id,
        authCode: pi.latest_charge ? String(pi.latest_charge) : `ST-${pi.id.slice(-8).toUpperCase()}`
      };
    }

    if (pi.status === 'requires_action') {
      return {
        authorized: false,
        requiresAction: true,
        paymentIntentId: pi.id,
        clientSecret: pi.client_secret,
        error: 'Seu banco solicitou autenticação 3DS do cartão.'
      };
    }

    return {
      authorized: false,
      error: `Autorização não concluída (${pi.status}).`
    };
  } catch (err) {
    const rawPi = err?.raw?.payment_intent || err?.payment_intent;
    if ((err?.code === 'authentication_required' || rawPi?.status === 'requires_action') && rawPi?.client_secret) {
      return {
        authorized: false,
        requiresAction: true,
        paymentIntentId: rawPi.id,
        clientSecret: rawPi.client_secret,
        error: 'Seu banco solicitou confirmação 3DS para pré-autorizar esta corrida.'
      };
    }
    return {
      authorized: false,
      error: formatStripeErrorPt(err)
    };
  }
}

async function verifyAuthorizedPaymentIntent(paymentIntentId) {
  const stripe = getStripeClient();
  const pi = await stripe.paymentIntents.retrieve(String(paymentIntentId).trim(), {
    expand: ['latest_charge', 'payment_method']
  });
  const ok = pi && (pi.status === 'requires_capture' || pi.status === 'succeeded');
  const chargeObj = pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const chargeCard = chargeObj?.payment_method_details?.card || null;
  const pmCard = pi?.payment_method && typeof pi.payment_method === 'object' ? pi.payment_method.card : null;
  const cardInfo = chargeCard || pmCard || {};
  const walletType = String(cardInfo?.wallet?.type || '').toLowerCase();
  const cardBrand =
    walletType === 'apple_pay'
      ? 'Apple Pay'
      : walletType === 'google_pay'
        ? 'Google Pay'
        : cardInfo?.brand
          ? normalizeStripeBrand(cardInfo.brand)
          : undefined;
  return {
    authorized: Boolean(ok),
    paymentIntentId: pi?.id,
    status: pi?.status,
    amountBrl: toBrlFromCents(pi?.amount || 0),
    authCode: chargeObj?.id ? String(chargeObj.id) : (pi?.latest_charge ? String(pi.latest_charge) : `ST-${String(pi?.id || '').slice(-8).toUpperCase()}`),
    cardBrand,
    cardLast4: cardInfo?.last4 ? String(cardInfo.last4) : undefined,
    walletType: walletType || undefined
  };
}

async function createWalletHoldIntent({
  amountBrl,
  clientId = '',
  clientPhone = '',
  clientEmail = '',
  clientName = '',
  categoryId = ''
}) {
  const stripe = getStripeClient();
  const amountCents = toBrlCents(amountBrl);
  const customerId = await ensureCustomer({ clientId, clientPhone, clientEmail, clientName });

  const pi = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'brl',
    customer: customerId,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    capture_method: 'manual',
    description: `Pré-autorização de corrida Kavro Drive`,
    metadata: {
      purpose: 'ride_wallet',
      clientId: String(clientId || ''),
      categoryId: String(categoryId || '')
    }
  });

  return {
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
    customerId,
    amountBrl: toBrlFromCents(pi.amount || amountCents)
  };
}

async function captureCardHold({ paymentIntentId, finalAmountBrl }) {
  const stripe = getStripeClient();
  const pi = await stripe.paymentIntents.retrieve(String(paymentIntentId).trim());
  if (!pi) {
    return { captured: false, error: 'PaymentIntent Stripe não encontrado.' };
  }
  if (pi.status === 'succeeded') {
    return {
      captured: true,
      gatewayTxId: pi.id,
      capturedAmountBrl: toBrlFromCents(pi.amount_received || pi.amount),
      provider: 'stripe'
    };
  }
  if (pi.status !== 'requires_capture') {
    return {
      captured: false,
      error: `Pré-autorização Stripe em status inválido para captura (${pi.status}).`
    };
  }
  const desiredCents = toBrlCents(finalAmountBrl);
  const capturable = Number(pi.amount_capturable || pi.amount || desiredCents);
  const toCapture = Math.min(capturable, desiredCents);
  const cap = await stripe.paymentIntents.capture(pi.id, {
    amount_to_capture: toCapture
  });
  if (cap.status !== 'succeeded') {
    return {
      captured: false,
      error: `Falha ao capturar cobrança na Stripe (${cap.status}).`
    };
  }
  return {
    captured: true,
    gatewayTxId: cap.id,
    capturedAmountBrl: toBrlFromCents(cap.amount_received || toCapture),
    provider: 'stripe'
  };
}

async function createPixCharge({
  amountBrl,
  rideId = '',
  rideCode = '',
  driverId = '',
  purpose = 'ride_pix',
  payerName = 'Passageiro Kavro Drive',
  payerEmail = 'pagamento@kavro.app',
  description = '',
  qrFallbackGenerator = null
}) {
  const stripe = getStripeClient();
  const amountCents = toBrlCents(amountBrl);
  const expiresSec = Math.min(1209600, Math.max(60, parseInt(String(env.STRIPE_PIX_EXPIRES_SECONDS || '900'), 10) || 900));
  const idempSuffix = purpose === 'driver_debt_pix'
    ? `debt_${driverId}_${amountCents}_${Math.floor(Date.now() / 5000)}`
    : `ride_${rideId}_${amountCents}`;

  const pi = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: 'brl',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      payment_method_data: {
        type: 'pix',
        billing_details: {
          name: String(payerName || 'Passageiro Kavro Drive').trim().slice(0, 120),
          email: String(payerEmail || 'pagamento@kavro.app').trim().toLowerCase().slice(0, 120)
        }
      },
      payment_method_options: {
        pix: {
          expires_after_seconds: expiresSec
        }
      },
      confirm: true,
      description: description || (purpose === 'driver_debt_pix'
        ? `Quitação de saldo Kavro Drive (${driverId})`
        : `Corrida Kavro Drive ${rideCode || rideId}`),
      metadata: {
        purpose,
        rideId: String(rideId || ''),
        rideCode: String(rideCode || ''),
        driverId: String(driverId || '')
      }
    },
    {
      idempotencyKey: `kavro_st_pix_${idempSuffix}`
    }
  );

  const qrData = pi.next_action?.pix_display_qr_code || {};
  const pixCopyPaste = String(qrData.data || '').trim();
  const hostedQr = String(qrData.image_url_png || qrData.image_url_svg || '').trim();
  const pixQrCode = hostedQr || (pixCopyPaste && typeof qrFallbackGenerator === 'function' ? qrFallbackGenerator(pixCopyPaste, 260) : '');
  const expiresAt = qrData.expires_at
    ? new Date(Number(qrData.expires_at) * 1000).toISOString()
    : new Date(Date.now() + expiresSec * 1000).toISOString();

  return {
    paymentIntentId: pi.id,
    pixCopyPaste,
    pixQrCode,
    expiresAt,
    hostedInstructionsUrl: qrData.hosted_instructions_url || null
  };
}

async function cancelOrRefundPayment({ paymentIntentId, refundAmountBrl = null }) {
  const stripe = getStripeClient();
  const id = String(paymentIntentId || '').trim();
  const pi = await stripe.paymentIntents.retrieve(id);
  if (!pi) return { ok: false, error: 'PaymentIntent Stripe não encontrado.' };

  if (['requires_capture', 'requires_payment_method', 'requires_confirmation', 'requires_action'].includes(pi.status)) {
    await stripe.paymentIntents.cancel(id);
    return { ok: true, provider: 'stripe', action: 'canceled_authorization' };
  }

  if (pi.status === 'canceled') {
    return { ok: true, provider: 'stripe', action: 'already_canceled' };
  }

  if (pi.status === 'succeeded') {
    const refund = await stripe.refunds.create({
      payment_intent: id,
      ...(refundAmountBrl ? { amount: toBrlCents(refundAmountBrl) } : {})
    });
    return { ok: true, provider: 'stripe', action: 'refunded', refundId: refund.id };
  }

  return { ok: false, error: `Status Stripe não estornável (${pi.status}).` };
}

function constructWebhookEvent(rawBody, signatureHeader) {
  const secret = getStripeWebhookSecret();
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET não configurada no servidor.');
  }
  const sig = String(signatureHeader || '').trim();
  if (!sig) {
    throw new Error('Cabeçalho Stripe-Signature ausente.');
  }
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, sig, secret);
}

module.exports = {
  getStripeSecretKey,
  getStripePublishableKey,
  getStripeWebhookSecret,
  isStripeEnabled,
  getStripeClient,
  toBrlCents,
  toBrlFromCents,
  parseStripeGatewayToken,
  ensureCustomer,
  createCardSetupIntent,
  createWalletHoldIntent,
  resolveSavedCard,
  authorizeCardHold,
  verifyAuthorizedPaymentIntent,
  captureCardHold,
  createPixCharge,
  cancelOrRefundPayment,
  constructWebhookEvent,
  _setStripeClientFactoryForTest
};
