// Subscription comparison is informational until a verified billing runtime exists.
// Telegram starts @richDonateBot with a source-specific payload; no automatic payment.
(() => {
  "use strict";
  const BOT = "richDonateBot";
  const OFFERS = Object.freeze([
    { name: "Free", text: 20000, emojiPacks: 2 },
    { name: "Plus", text: 25000, emojiPacks: 8 },
    { name: "Golden Ticket", text: 32000, emojiPacks: 50 },
  ]);
  const strings = {
    ar: {
      heading: "وصلت إلى حد الباقة",
      text: "وصلت إلى حد النص المتاح في الخطة المجانية.",
      emojiPacks: "وصلت إلى حد حزم الإيموجي المميزة في الخطة المجانية.",
      other: "وصلت إلى أحد حدود المحرر الحالية. زيادة هذا الحد بالاشتراك مو معتمدة بعد.",
      usage: "استخدامك: {actual} من {limit}",
      plans: "مقارنة الخطط",
      chars: "{count} حرف",
      packs: "{count} حزمة إيموجي",
      current: "خطتك الحالية",
      planned: "قيد التجهيز",
      notice: "اشتراكات Plus وGolden Ticket بعدُها مو مفعّلة للبيع. الأسعار ما تحددت، وفتح البوت ما يعني إتمام شراء.",
      link: "افتح بوت التبرع لمعرفة الخطط",
      dismiss: "رجوع إلى المحرر",
      close: "إغلاق",
    },
    en: {
      heading: "Plan limit reached",
      text: "You've reached the Free plan's text limit.",
      emojiPacks: "You've reached the Free plan's custom emoji pack limit.",
      other: "You've reached an editor limit. Higher limits for this feature have not been approved as paid benefits.",
      usage: "Used: {actual} of {limit}",
      plans: "Compare plans",
      chars: "{count} characters",
      packs: "{count} custom emoji packs",
      current: "Current plan",
      planned: "In preparation",
      notice: "Plus and Golden Ticket are not available for purchase yet. Prices are not finalized, and opening the bot does not make a payment.",
      link: "Open donation bot to see plans",
      dismiss: "Back to editor",
      close: "Close",
    },
  };
  const language = () => window.MiniAppI18n?.language === "ar" ? "ar" : "en";
  function tr(key, vars = {}) {
    return strings[language()][key].replace(/\{(\w+)\}/g, (_, n) => String(vars[n] ?? ""));
  }
  function format(number) {
    return new Intl.NumberFormat(language() === "ar" ? "ar-IQ" : "en-US")
      .format(Number(number));
  }
  function linkFor(kind) {
    const source = kind === "text" ? "text" : kind === "emojiPacks" ? "emoji" : "limits";
    return "https://t.me/" + BOT + "?start=rich_plans_" + source;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  let overlay = null;
  let returnFocus = null;
  function close() {
    if (!overlay) return;
    const target = overlay;
    overlay = null;
    target.remove();
    document.removeEventListener("keydown", onKeydown);
    if (returnFocus?.isConnected && typeof returnFocus.focus === "function") {
      returnFocus.focus({ preventScroll: true });
    }
    returnFocus = null;
  }
  function onKeydown(event) {
    if (event.key === "Escape") close();
  }
  function show(kind = "other", { actual, limit } = {}) {
    if (!["text", "emojiPacks", "other"].includes(kind)) kind = "other";
    if (typeof document === "undefined" || !document.body) return false;
    if (overlay) close();
    returnFocus = document.activeElement;
    overlay = element("div", "rich-subscription-backdrop");
    const modal = element("section", "rich-subscription-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "richSubscriptionTitle");
    modal.dir = language() === "ar" ? "rtl" : "ltr";
    const head = element("div", "rich-subscription-head");
    const textArea = element("div", "rich-subscription-headcopy");
    const title = element("h2", "", tr("heading"));
    title.id = "richSubscriptionTitle";
    textArea.append(title, element("p", "", tr(kind)));
    if (Number.isFinite(Number(actual)) && actual !== undefined &&
        Number.isFinite(Number(limit)) && limit !== undefined &&
        Number(limit) > 0) {
      textArea.append(element("small", "rich-subscription-usage",
        tr("usage", { actual: format(actual), limit: format(limit) })));
    }
    const closeButton = element("button", "rich-subscription-close", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", tr("close"));
    closeButton.addEventListener("click", close);
    head.append(textArea, closeButton);
    modal.append(head, element("h3", "rich-subscription-section-title", tr("plans")));
    const list = element("div", "rich-subscription-plans");
    for (const [index, plan] of OFFERS.entries()) {
      const item = element("div", "rich-subscription-plan");
      const top = element("div", "rich-subscription-plan-head");
      top.append(element("strong", "", plan.name), element("small", "",
        tr(index === 0 ? "current" : "planned")));
      item.append(top);
      item.append(element("span", "", tr("chars", { count: format(plan.text) })));
      item.append(element("span", "", tr("packs", { count: format(plan.emojiPacks) })));
      list.append(item);
    }
    modal.append(list, element("p", "rich-subscription-notice", tr("notice")));
    const actions = element("div", "rich-subscription-actions");
    const cta = element("a", "rich-subscription-cta", tr("link"));
    cta.href = linkFor(kind);
    cta.target = "_blank";
    cta.rel = "noopener noreferrer";
    cta.addEventListener("click", event => {
      const open = window.Telegram?.WebApp?.openTelegramLink;
      if (typeof open === "function") {
        event.preventDefault();
        try { open.call(window.Telegram.WebApp, cta.href); }
        catch (_) { window.location.href = cta.href; }
      }
    });
    const dismiss = element("button", "rich-subscription-dismiss", tr("dismiss"));
    dismiss.type = "button";
    dismiss.addEventListener("click", close);
    actions.append(cta, dismiss);
    modal.append(actions);
    overlay.append(modal);
    overlay.addEventListener("click", event => {
      if (event.target === overlay) close();
    });
    document.body.append(overlay);
    document.addEventListener("keydown", onKeydown);
    closeButton.focus({ preventScroll: true });
    return true;
  }
  function quotaKind(error) {
    const value = [error?.code, error?.message].filter(Boolean).join(" ");
    if (/custom_emoji_pack_limit|emoji\.pack_limit_reached/i.test(value)) return "emojiPacks";
    if (/editor limit exceeded:\s*characters|EDITOR_LIMIT[_:]CHARACTERS|limits\.characters/i.test(value)) return "text";
    if (/editor limit exceeded:\s*(?:blocks|table_rows|table_columns)|EDITOR_LIMIT[_:](?:BLOCKS|TABLE_ROWS|TABLE_COLUMNS)|\bPAGE_LIMIT\b|page limit reached/i.test(value)) return "other";
    return null;
  }
  function showForError(error) {
    const kind = quotaKind(error);
    if (!kind) return false;
    const match = String(error?.message || "").match(/characters\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i);
    return show(kind, match ? { actual: Number(match[1]), limit: Number(match[2]) } : {});
  }
  window.RichSubscriptionOffers = Object.freeze({ show, close, showForError, quotaKind, linkFor });
})();
