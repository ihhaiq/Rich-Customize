// Beta 0.3.30 — Telegram-style LaTeX editor with live preview.
(() => {
  const KATEX_VERSION = "0.16.11";
  let katexPromise = null;

  function ensureKatex() {
    if (window.katex?.render) return Promise.resolve(window.katex);
    if (katexPromise) return katexPromise;

    if (!document.querySelector('link[data-rich-katex]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
      link.crossOrigin = "anonymous";
      link.dataset.richKatex = "1";
      document.head.appendChild(link);
    }

    katexPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-rich-katex]');
      if (existing) {
        existing.addEventListener("load", () => resolve(window.katex), {once:true});
        existing.addEventListener("error", reject, {once:true});
        return;
      }
      const script = document.createElement("script");
      script.src = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;
      script.crossOrigin = "anonymous";
      script.dataset.richKatex = "1";
      script.addEventListener("load", () => resolve(window.katex), {once:true});
      script.addEventListener("error", reject, {once:true});
      document.head.appendChild(script);
    }).catch(() => null);

    return katexPromise;
  }

  function haptic() {
    try { window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(); } catch (_) {}
  }

  function inlineMathPayload(expression) {
    return {
      type:"paragraph",
      text:{type:"mathematical_expression", expression},
    };
  }

  function blockMathPayload(expression) {
    return {type:"mathematical_expression", expression};
  }

  function inferSeparateLine(data) {
    if (typeof data.separate_line === "boolean") return data.separate_line;
    if (data.native_data?.type === "paragraph") return false;
    if (data.native_data?.type === "mathematical_expression") return true;
    // Preserve old non-empty math blocks, but make newly inserted empty formulas
    // match Telegram's composer default (inline until the checkbox is enabled).
    return Boolean(String(data.text || "").trim());
  }

  function syncMathData(block, expression, separateLine) {
    const d = block.data || (block.data = {});
    d.text = expression;
    d.separate_line = Boolean(separateLine);
    d.rich_text = null;
    d.native = true;
    if (separateLine) {
      d.html = `<tg-math-block>${escapeHtml(expression)}</tg-math-block>`;
      d.native_data = blockMathPayload(expression);
    } else {
      d.html = `<p><tg-math>${escapeHtml(expression)}</tg-math></p>`;
      d.native_data = inlineMathPayload(expression);
    }
  }

  function renderFormula(preview, expression, separateLine) {
    preview.dataset.latex = expression;
    preview.dataset.display = separateLine ? "block" : "inline";
    preview.classList.toggle("display-formula", Boolean(separateLine));
    preview.classList.toggle("inline-formula", !separateLine);

    if (!String(expression || "").trim()) {
      preview.classList.add("is-empty");
      preview.textContent = "اكتب صيغة LaTeX حتى تظهر المعاينة هنا";
      return;
    }
    preview.classList.remove("is-empty");

    if (window.katex?.render) {
      try {
        window.katex.render(expression, preview, {
          displayMode:Boolean(separateLine),
          throwOnError:false,
          strict:"ignore",
          trust:false,
          output:"htmlAndMathml",
        });
        return;
      } catch (_) {}
    }

    preview.textContent = expression;
    ensureKatex().then(katex => {
      if (!katex?.render || !preview.isConnected) return;
      if (preview.dataset.latex !== expression) return;
      renderFormula(preview, expression, separateLine);
    });
  }

  function mathEditor(block) {
    const d = block.data || (block.data = {});
    let separateLine = inferSeparateLine(d);
    syncMathData(block, String(d.text || ""), separateLine);

    const wrap = document.createElement("section");
    wrap.className = "telegram-math-editor";
    wrap.setAttribute("aria-label", "محرر المعادلة");

    const field = document.createElement("label");
    field.className = "math-field";
    const fieldTitle = document.createElement("span");
    fieldTitle.className = "math-field-title";
    fieldTitle.textContent = "LaTeX";
    const input = document.createElement("textarea");
    input.className = "math-latex-input";
    input.rows = 2;
    input.spellcheck = false;
    input.autocapitalize = "off";
    input.autocomplete = "off";
    input.placeholder = "x_{1,2}=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}";
    input.value = String(d.text || "");
    field.append(fieldTitle, input);

    const option = document.createElement("label");
    option.className = "math-line-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = separateLine;
    checkbox.setAttribute("aria-label", "صيغة في سطر منفصل");
    const box = document.createElement("span");
    box.className = "math-check-box";
    box.setAttribute("aria-hidden", "true");
    const optionText = document.createElement("span");
    optionText.textContent = "صيغة في سطر منفصل";
    option.append(checkbox, box, optionText);

    const resultHead = document.createElement("div");
    resultHead.className = "math-result-head";
    resultHead.textContent = "النتيجة";
    const preview = document.createElement("div");
    preview.className = "math-live-preview";
    preview.setAttribute("aria-live", "polite");

    function update({dirty = true} = {}) {
      separateLine = checkbox.checked;
      syncMathData(block, input.value, separateLine);
      renderFormula(preview, input.value, separateLine);
      if (dirty) {
        try { markDirty(); } catch (_) {}
      }
    }

    input.addEventListener("focus", () => {
      try { selectBlock(block.id); } catch (_) {}
    });
    input.addEventListener("input", () => update());
    checkbox.addEventListener("change", () => {
      haptic();
      update();
    });

    wrap.append(field, option, resultHead, preview);
    renderFormula(preview, input.value, separateLine);
    ensureKatex();
    return wrap;
  }

  const baseTextEditor = typeof textEditor === "function" ? textEditor : null;
  if (!baseTextEditor) return;

  textEditor = function(block) {
    if (block?.type === "mathematical_expression") return mathEditor(block);
    return baseTextEditor(block);
  };

  // The app can finish booting before this enhancement file loads from cache.
  // Refresh once so an already-visible math block upgrades immediately.
  requestAnimationFrame(() => {
    try {
      if (current?.blocks?.some?.(block => block.type === "mathematical_expression")) {
        renderBlocks?.();
      }
    } catch (_) {}
  });
})();
