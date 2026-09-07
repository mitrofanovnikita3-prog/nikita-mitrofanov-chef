const TOPICS = {
  dinner: 'Закрытый ужин',
  masterclass: 'Мастер-класс',
  consult: 'Консультация',
  collab: 'Сотрудничество',
  other: 'Другое',
};

function cors(origin, allowedOrigin) {
  return {
    'Access-Control-Allow-Origin': origin === allowedOrigin ? origin : allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function clean(value, maxLength) {
  return typeof value === 'string'
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, maxLength)
    : '';
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin, env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      if (origin !== env.ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') return json({ ok: false }, 405, headers);
    if (origin !== env.ALLOWED_ORIGIN) return json({ ok: false }, 403, headers);

    const length = Number(request.headers.get('Content-Length') || 0);
    if (length > 4096) return json({ ok: false }, 413, headers);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false }, 400, headers);
    }

    // Invisible field and minimum completion time reject basic automated spam.
    if (body.website || !Number.isFinite(body.startedAt) || Date.now() - body.startedAt < 2500) {
      return json({ ok: true }, 200, headers);
    }

    const name = clean(body.name, 80);
    const phone = clean(body.phone, 100);
    const comment = clean(body.comment, 1000);
    const topic = TOPICS[body.topic] || 'Не выбрана';
    const nameLetters = name.match(/\p{L}/gu)?.length || 0;
    const contactCharacters = phone.match(/[\p{L}\p{N}]/gu)?.length || 0;

    if (name.length < 2 || nameLetters < 2 || phone.length < 5 || contactCharacters < 3) {
      return json({ ok: false, error: 'validation' }, 400, headers);
    }

    const message = [
      '🍽 <b>Новая заявка с сайта</b>',
      '',
      `<b>Имя:</b> ${escapeHtml(name)}`,
      `<b>Контакт:</b> ${escapeHtml(phone)}`,
      `<b>Тема:</b> ${escapeHtml(topic)}`,
      ...(comment ? [`<b>Сообщение:</b> ${escapeHtml(comment)}`] : []),
    ].join('\n');

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      },
    );

    if (!telegramResponse.ok) {
      console.error('Telegram API rejected the message', telegramResponse.status);
      return json({ ok: false }, 502, headers);
    }

    return json({ ok: true }, 200, headers);
  },
};

