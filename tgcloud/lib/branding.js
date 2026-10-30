import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { brandingEntitlements, brandingPreferences } from 'schema';
import { logError } from 'lib/error-log';
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import { planBenefit } from 'lib/subscription-policy';
import { resolveLanguage, tr } from 'lib/i18n';

export const BRANDING_PRICE_STARS = 99;
export const BRANDING_INVOICE_PAYLOAD = 'remove_branding:v1';

const BRANDING_TEXT = [
  'تريد نفس التصميم لقناتك؟',
  'افتح @RichCustomizebot ← وابدأ المحرر',
].join('\n');

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function brandingToggleButton(settings, languageCode) {
  const locale = resolveLanguage(languageCode);
  return {
    text: locale === 'ar'
      ? (settings.includeBranding ? 'إخفاء الحقوق' : 'إظهار الحقوق')
      : tr(locale, settings.includeBranding ? 'Hide branding' : 'Show branding'),
    callback_data: 'r:branding-toggle:' + (settings.includeBranding ? '0' : '1'),
  };
}

export function brandingFooterBlock() {
  return {
    type: 'footer',
    text: BRANDING_TEXT,
  };
}

export async function isBrandingRemoved(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  const row = await db.select({
    rightsRemoved: brandingEntitlements.rightsRemoved,
  }).from(brandingEntitlements)
    .where(eq(brandingEntitlements.userId, id))
    .get();
  return Boolean(Number(row?.rightsRemoved || 0));
}

export async function canManageBranding(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  if (await isBrandingRemoved(id)) return true;
  return planBenefit(await getEditorEntitlement(id), 'brandingIncluded');
}

export async function getBrandingPreference(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  const row = await db.select({
    includeBranding: brandingPreferences.includeBranding,
  }).from(brandingPreferences)
    .where(eq(brandingPreferences.userId, id))
    .get();
  return Number(row?.includeBranding) === 1;
}

export async function getBrandingSettings(userId) {
  const canManage = await canManageBranding(userId);
  return {
    canManage,
    includeBranding: canManage ? await getBrandingPreference(userId) : true,
  };
}

export async function setBrandingPreference(userId, includeBranding) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof includeBranding !== 'boolean') {
    return false;
  }
  if (!await canManageBranding(id)) return false;
  const stamp = nowSeconds();
  await db.insert(brandingPreferences).values({
    userId: id,
    includeBranding: includeBranding ? 1 : 0,
    updatedAt: stamp,
  }).onConflictDoUpdate({
    target: brandingPreferences.userId,
    set: {
      includeBranding: includeBranding ? 1 : 0,
      updatedAt: stamp,
    },
  }).run();
  return true;
}

export async function shouldIncludeBranding(userId) {
  return (await getBrandingSettings(userId)).includeBranding;
}

export async function createBrandingRemovalInvoiceLink() {
  return api.createInvoiceLink({
    title: 'إزالة حقوق Rich Customize',
    description: 'ادفع 99 نجمة مرة وحدة لإخفاء حقوق Rich Customize افتراضياً، وتقدر تظهرها أو تخفيها من أدوات المحرر.',
    payload: BRANDING_INVOICE_PAYLOAD,
    currency: 'XTR',
    prices: [{
      label: 'إزالة الحقوق',
      amount: BRANDING_PRICE_STARS,
    }],
  });
}

function validPaymentShape(payment) {
  return Boolean(
    payment
    && String(payment.currency || '') === 'XTR'
    && Number(payment.total_amount) === BRANDING_PRICE_STARS
    && String(payment.invoice_payload || '') === BRANDING_INVOICE_PAYLOAD
    && String(payment.telegram_payment_charge_id || '').trim()
  );
}

export async function handleBrandingPreCheckout(query) {
  if (!query?.id) return false;
  if (String(query.invoice_payload || '') !== BRANDING_INVOICE_PAYLOAD) return false;

  const userId = Number(query.from?.id);
  let ok = (
    Number.isSafeInteger(userId)
    && String(query.currency || '') === 'XTR'
    && Number(query.total_amount) === BRANDING_PRICE_STARS
  );
  let errorMessage = 'صار خطأ بالتحقق من الدفع. سوِ رابط دفع جديد وجرب مرة ثانية.';

  if (ok && await isBrandingRemoved(userId)) {
    ok = false;
    errorMessage = 'انت شايل الحقوق من حسابك أصلًا، ما تحتاج تدفع مرة ثانية.';
  }

  await api.answerPreCheckoutQuery({
    pre_checkout_query_id: query.id,
    ok,
    ...(ok ? {} : { error_message: errorMessage }),
  });
  return true;
}

export async function handleBrandingSuccessfulPayment(message) {
  const payment = message?.successful_payment;
  if (!payment || String(payment.invoice_payload || '') !== BRANDING_INVOICE_PAYLOAD) {
    return false;
  }

  const userId = Number(message?.from?.id);
  if (!Number.isSafeInteger(userId) || !validPaymentShape(payment)) {
    await logError('payment.fulfillment', new Error('BRANDING_PAYMENT_INVALID_SHAPE'), {
      userId: message?.from?.id, chatId: message?.chat?.id,
      extra: 'product=branding; payment_received=1',
    });
    if (message?.chat?.id) {
      try {
        await api.sendMessage({chat_id:message.chat.id,
          text:'وصل إشعار دفع لكن تعذر التحقق منه تلقائياً. إذا انخصمت النجوم لا تدفع مرة ثانية؛ احتفظ بإيصال تليكرام وتواصل مع الدعم.'});
      } catch (noticeError) {
        console.warn('Could not notify user of unverified branding payment', noticeError);
      }
    }
    return true;
  }

  const existing = await db.select().from(brandingEntitlements)
    .where(eq(brandingEntitlements.userId, userId)).get();
  if (Number(existing?.rightsRemoved || 0) === 1
      && String(existing?.telegramPaymentChargeId || '') === String(payment.telegram_payment_charge_id)) {
    return true;
  }

  const stamp = nowSeconds();
  await db.insert(brandingEntitlements).values({
    userId,
    rightsRemoved: 1,
    source: 'telegram_stars',
    currency: 'XTR',
    amount: BRANDING_PRICE_STARS,
    telegramPaymentChargeId: String(payment.telegram_payment_charge_id),
    paidAt: stamp,
    updatedAt: stamp,
  }).onConflictDoUpdate({
    target: brandingEntitlements.userId,
    set: {
      rightsRemoved: 1,
      source: 'telegram_stars',
      currency: 'XTR',
      amount: BRANDING_PRICE_STARS,
      telegramPaymentChargeId: String(payment.telegram_payment_charge_id),
      paidAt: stamp,
      updatedAt: stamp,
    },
  }).run();

  try {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: [
        '✅ تم الدفع.',
        '',
        'الحقوق مخفية افتراضياً عن المعاينات والصفحات والمنشورات الجديدة.',
        'تقدر تظهرها أو تخفيها بأي وقت من زر الحقوق في أدوات المحرر.',
      ].join('\n'),
    });
  } catch (notificationError) {
    await logError('payment.receipt', notificationError, {
      userId, chatId: message?.chat?.id, extra:'product=branding; rights_removed=1',
    });
  }
  return true;
}

export async function handleBrandingCallback(query) {
  const data = String(query?.data || '');
  if (data !== 'r:branding' && !data.startsWith('r:branding-toggle:')) return false;

  const userId = Number(query.from?.id);
  if (!Number.isSafeInteger(userId)) {
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data.startsWith('r:branding-toggle:')) {
    if (
      !query?.message?.chat?.id
      || !query?.message?.message_id
      || String(query.message.chat.type || '') !== 'private'
      || Number(query.message.chat.id) !== userId
    ) {
      await api.answerCallbackQuery({ callback_query_id: query.id });
      return true;
    }
    const requested = data.slice('r:branding-toggle:'.length);
    if (requested !== '0' && requested !== '1') {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: 'إعداد الحقوق غير صالح. أعد فتح لوحة الأدوات.',
        show_alert: true,
      });
      return true;
    }
    const saved = await setBrandingPreference(userId, requested === '1');
    if (!saved) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: 'هذا الخيار متاح فقط لحساب لديه اشتراك نشط أو وصول المطور أو شراء إزالة الحقوق.',
        show_alert: true,
      });
      return true;
    }
    const settings = await getBrandingSettings(userId);
    const keyboard = query.message.reply_markup?.inline_keyboard;
    if (!Array.isArray(keyboard)) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: 'تم حفظ الإعداد. أعد فتح لوحة الأدوات لتحديث الزر.',
      });
      return true;
    }
    let replaced = false;
    const inlineKeyboard = keyboard.map((row) => row.map((button) => {
      if (!String(button?.callback_data || '').startsWith('r:branding-toggle:')) return button;
      replaced = true;
      return brandingToggleButton(settings, query.from.language_code || 'ar');
    }));
    if (!replaced) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: 'تم حفظ الإعداد. أعد فتح لوحة الأدوات لتحديث الزر.',
      });
      return true;
    }
    await api.editMessageReplyMarkup({
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: settings.includeBranding ? 'تم إظهار الحقوق.' : 'تم إخفاء الحقوق.',
    });
    return true;
  }

  if (await canManageBranding(userId)) {
    const settings = await getBrandingSettings(userId);
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: settings.includeBranding ? 'الحقوق ظاهرة حالياً.' : 'الحقوق مخفية حالياً.',
    });
    await api.sendMessage({
      chat_id: userId,
      text: 'تفضيل الحقوق الحالي محفوظ لحسابك.',
      reply_markup: { inline_keyboard: [[brandingToggleButton(settings, query.from.language_code || 'ar')]] },
    });
    return true;
  }

  const invoiceLink = 'https://t.me/richDonateBot?start=cart_branding';
  await api.sendMessage({
    chat_id: userId,
    text: [
      'إزالة حقوق Rich Customize',
      '',
      '99 ⭐️ — دفعة وحدة.',
      'بعد الدفع تصير الحقوق مخفية افتراضياً في المعاينات والصفحات والمنشورات الجديدة، وتقدر تظهرها بأي وقت من أدوات المحرر.',
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [[{
        text: 'إزالة الحقوق — 99 ⭐️',
        url: String(invoiceLink),
      }]],
    },
  });
  await api.answerCallbackQuery({ callback_query_id: query.id });
  return true;
}
