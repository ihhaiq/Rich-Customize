// Subscription comparison is informational until a verified billing runtime exists.
// Telegram starts @richDonateBot with a source-specific payload; no automatic payment.
(() => {
  "use strict";
  const BOT = "richDonateBot";
  // All plan benefits are approved by the owner. Billing and entitlement
  // activation remain unavailable until trusted Telegram-side rollout.
  const OFFERS = Object.freeze([
    { name: "Free", text: 20000, emojiPacks: 2, tableColumns: 8, media:10, nesting:4,
      pages: 12, blocks: 50, rights: "separate", price:0, earlyAccess: false },
    { name: "Plus", text: 25000, emojiPacks: 8, tableColumns: 12, media:25, nesting:8,
      pages: 50, blocks: 200, rights: "included", price:150, earlyAccess: false },
    { name: "Golden Ticket", text: 32768, emojiPacks: 50, tableColumns: 20, media:50, nesting:16,
      pages: 150, blocks: 500, rights: "included", price:350, earlyAccess: true },
  ]);
  const strings = {
    ar: {
      heading: "وصلت إلى حد الباقة",
      text: "وصلت إلى حد النص المتاح في الخطة المجانية.",
      emojiPacks: "وصلت إلى حد حزم الإيموجي المميزة في الخطة المجانية.",
      tableColumns: "وصلت إلى حد أعمدة الجدول المسموح بها في باقتك.",
      other: "وصلت إلى أحد حدود المحرر الحالية. قارن حدود الباقات لمعرفة التفاصيل.",
      usage: "استخدامك: {actual} من {limit}",
      plans: "مقارنة الخطط",
      chars: "{count} حرف",
      packs: "{count} حزمة إيموجي",
      current: "خطتك الحالية",
      planned: "النسخة التجريبية",
      everyMonth: "كل ٣٠ يوم",
      freeTier: "مجاني",
      textQuotaLabel: "عدد الأحرف",
      packQuotaLabel: "حزم الإيموجي",
      tableColumnsLabel: "أعمدة الجدول",
      mediaLimitLabel:"المرفقات بالرسالة",
      nestingLimitLabel:"مستويات التداخل",
      pages: "الصفحات المحفوظة",
      blocks: "البلوكات",
      rights: "إزالة الحقوق",
      earlyAccess: "الوصول المبكر للميزات",
      currentLimit: "الحد الحالي",
      notIncluded: "غير مشمول",
      separatePurchase: "شراء منفصل بـ٩٩ نجمة",
      couldInclude: "مشمولة بالاشتراك",
      earlyProposed: "مشمولة",
      roadmapNotice: "",
      priceLabel: "السعر الشهري",
      monthlyPrice: "{count} نجمة / ٣٠ يوم",
      freePrice: "مجاناً",

      notice: "الباقات في الإصدار التجريبي وغير متاحة للبيع حالياً.",
      link: "افتح بوت التبرع لمعرفة الخطط",
      dismiss: "رجوع إلى المحرر",
      close: "إغلاق",
    },
    en: {
      heading: "Plan limit reached",
      text: "You've reached the Free plan's text limit.",
      emojiPacks: "You've reached the Free plan's custom emoji pack limit.",
      tableColumns: "You've reached the table column limit for your plan.",
      other: "You've reached an editor limit. Compare the plans to see their included limits.",
      usage: "Used: {actual} of {limit}",
      plans: "Compare plans",
      chars: "{count} characters",
      packs: "{count} custom emoji packs",
      current: "Current plan",
      planned: "Beta",
      everyMonth: "Every 30 days",
      freeTier: "Free",
      textQuotaLabel: "Text",
      packQuotaLabel: "Emoji packs",
      tableColumnsLabel: "Table columns",
      mediaLimitLabel:"Media per message",
      nestingLimitLabel:"Nesting levels",
      pages: "Saved pages",
      blocks: "Blocks",
      rights: "Remove branding",
      earlyAccess: "Early feature access",
      currentLimit: "Current limit",
      notIncluded: "Not included",
      separatePurchase: "Separate 99 Stars purchase",
      couldInclude: "Included with subscription",
      earlyProposed: "Included",
      roadmapNotice: "",
      priceLabel: "Monthly price",
      monthlyPrice: "{count} Stars / 30 days",
      freePrice: "Free",

      notice: "Subscriptions are in beta and not available for purchase yet.",
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
    if (!["text", "emojiPacks", "tableColumns", "other"].includes(kind)) kind = "other";
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
    function perk(target, label, value, { included = true } = {}) {
      const item = element("div", "rich-subscription-perk" + (included ? "" : " is-unavailable"));
      item.append(
        element("strong", "rich-subscription-perk-value", value),
        element("span", "rich-subscription-perk-label", tr(label)),
      );
      target.append(item);
    }
    for (const [index, plan] of OFFERS.entries()) {
      const tier = index === 0 ? "free" : index === 1 ? "plus" : "golden";
      const card = element("article", "rich-subscription-plan is-" + tier);
      const top = element("div", "rich-subscription-plan-head");
      const identity = element("div", "rich-subscription-plan-identity");
      identity.append(element("strong", "rich-subscription-name", plan.name));
      if (index === 0) identity.append(element("small", "rich-subscription-current", tr("current")));
      top.append(identity);
      const pricing = element("div", "rich-subscription-pricing");
      if (index === 0) {
        pricing.append(element("strong", "rich-subscription-price-amount", tr("freeTier")));
      } else {
        const line = element("div", "rich-subscription-price-line");
        line.append(
          element("strong", "rich-subscription-price-amount", format(plan.price)),
          element("span", "rich-subscription-star", "★"),
        );
        pricing.append(line, element("small", "rich-subscription-period", tr("everyMonth")));
      }
      top.append(pricing);
      card.append(top);
      const benefits = element("div", "rich-subscription-perks");
      perk(benefits, "textQuotaLabel", format(plan.text));
      perk(benefits, "packQuotaLabel", format(plan.emojiPacks));
      perk(benefits, "tableColumnsLabel", format(plan.tableColumns));
      perk(benefits, "mediaLimitLabel", format(plan.media));
      perk(benefits, "nestingLimitLabel", format(plan.nesting));
      perk(benefits, "pages", format(plan.pages));
      perk(benefits, "blocks", format(plan.blocks));
      perk(benefits, "rights",
        index === 0 ? tr("separatePurchase") : tr("couldInclude"));
      if (plan.earlyAccess) {
        perk(benefits, "earlyAccess", tr("earlyProposed"));
      }
      card.append(benefits);
      list.append(card);
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
    if (/EDITOR_LIMIT[_:]TABLE_COLUMNS|editor limit exceeded:\s*table_columns/i.test(value)) return "tableColumns";
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
