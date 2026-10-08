// Subscription comparison is informational until a verified billing runtime exists.
// Telegram starts @richDonateBot with a source-specific payload; no automatic payment.
(() => {
  "use strict";
  const BOT = "richDonateBot";
  // Only text and emoji pack allowances are approved paid-plan policy.
  // All Plus/Golden values below in proposed fields are roadmap ideas, NOT entitlements.
  const OFFERS = Object.freeze([
    { name: "Free", text: 20000, emojiPacks: 2,
      pages: 12, blocks: 30, rights: "separate", templates: false,
      history: 0, earlyAccess: false },
    { name: "Plus", text: 25000, emojiPacks: 8,
      pages: 50, blocks: 60, rights: "proposed", templates: true,
      history: 5, earlyAccess: false },
    { name: "Golden Ticket", text: 32000, emojiPacks: 50,
      pages: 150, blocks: 120, rights: "proposed", templates: true,
      history: 20, earlyAccess: true },
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
      approvedGroup: "الحدود المعتمدة",
      roadmapGroup: "بقية الميزات",
      textQuotaLabel: "عدد الأحرف",
      packQuotaLabel: "حزم الإيموجي",
      pages: "الصفحات المحفوظة",
      blocks: "البلوكات",
      rights: "إزالة الحقوق",
      templates: "القوالب المحفوظة",
      history: "سجل نسخ الصفحة",
      earlyAccess: "الوصول المبكر للميزات",
      featureProposed: "مقترح",
      currentLimit: "الحد الحالي",
      notIncluded: "غير مشمول",
      separatePurchase: "شراء منفصل بـ٩٩ نجمة",
      couldInclude: "قد تُضمّن بالباقة",
      savedTemplates: "مقترحة للباقة",
      lastVersions: "آخر {count} نسخ",
      lastVersionsMany: "آخر {count} نسخة",
      earlyProposed: "مقترح للباقة",
      roadmapNotice: "الصفحات والبلوكات ومزايا Plus وGolden الإضافية مجرد مقترحات في خطة التطوير، وليست مزايا مفعّلة أو مضمونة. الحصص الحالية للمجاني هي ١٢ صفحة و٣٠ بلوك.",
      scheduling: "الجدولة: فكرة مستقبلية غير معتمدة أو مفعّلة حالياً.",

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
      approvedGroup: "Approved limits",
      roadmapGroup: "Other features",
      textQuotaLabel: "Text",
      packQuotaLabel: "Emoji packs",
      pages: "Saved pages",
      blocks: "Blocks",
      rights: "Remove branding",
      templates: "Saved templates",
      history: "Page version history",
      earlyAccess: "Early feature access",
      featureProposed: "Proposed",
      currentLimit: "Current limit",
      notIncluded: "Not included",
      separatePurchase: "Separate 99 Stars purchase",
      couldInclude: "May be included",
      savedTemplates: "Proposed for this plan",
      lastVersions: "Last {count} versions",
      lastVersionsMany: "Last {count} versions",
      earlyProposed: "Proposed for this plan",
      roadmapNotice: "Pages, blocks and other Plus/Golden features are roadmap proposals, not enabled or guaranteed benefits. Current Free limits remain 12 pages and 30 blocks.",
      scheduling: "Scheduling is a future idea, not an approved or active entitlement.",

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
    function featureRow(target, label, value, { proposed = false } = {}) {
      const row = element("div", "rich-subscription-feature" + (proposed ? " is-proposed" : ""));
      row.append(element("span", "rich-subscription-feature-label", tr(label)));
      const detail = element("span", "rich-subscription-feature-value");
      detail.append(element("span", "", value));
      if (proposed) detail.append(element("small", "rich-subscription-feature-status", tr("featureProposed")));
      row.append(detail);
      target.append(row);
    }
    for (const [index, plan] of OFFERS.entries()) {
      const item = element("div", "rich-subscription-plan");
      const top = element("div", "rich-subscription-plan-head");
      top.append(element("strong", "", plan.name), element("small", "",
        tr(index === 0 ? "current" : "planned")));
      item.append(top);
      item.append(element("small", "rich-subscription-group-title", tr("approvedGroup")));
      const approved = element("div", "rich-subscription-features");
      featureRow(approved, "textQuotaLabel", tr("chars", { count: format(plan.text) }));
      featureRow(approved, "packQuotaLabel", tr("packs", { count: format(plan.emojiPacks) }));
      item.append(approved);
      item.append(element("small", "rich-subscription-group-title rich-subscription-roadmap-title", tr("roadmapGroup")));
      const roadmap = element("div", "rich-subscription-features");
      featureRow(roadmap, "pages", format(plan.pages), { proposed: index > 0 });
      featureRow(roadmap, "blocks", format(plan.blocks), { proposed: index > 0 });
      featureRow(roadmap, "rights", index === 0 ? tr("separatePurchase") : tr("couldInclude"), { proposed: index > 0 });
      featureRow(roadmap, "templates", plan.templates ? tr("savedTemplates") : tr("notIncluded"), { proposed: Boolean(plan.templates) });
      featureRow(roadmap, "history", plan.history ? tr(plan.history > 10 ? "lastVersionsMany" : "lastVersions", { count: format(plan.history) }) : tr("notIncluded"), { proposed: plan.history > 0 });
      featureRow(roadmap, "earlyAccess", plan.earlyAccess ? tr("earlyProposed") : tr("notIncluded"), { proposed: plan.earlyAccess });
      item.append(roadmap);
      list.append(item);
    }
    modal.append(list,
      element("p", "rich-subscription-notice", tr("roadmapNotice")),
      element("p", "rich-subscription-notice rich-subscription-scheduling", tr("scheduling")),
      element("p", "rich-subscription-notice", tr("notice")));
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
