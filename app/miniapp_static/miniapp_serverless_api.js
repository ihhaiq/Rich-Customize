(() => {
  const originalFetch = window.fetch.bind(window);
  const cloudflareApiOrigin = "https://rich-customize.pages.dev";
  const telegramApp = window.Telegram?.WebApp;
  const isTelegramServerlessHost = location.hostname.endsWith(".tgcloud.ai");

  function apiPath(input) {
    const value = typeof input === "string" ? input : String(input?.url || "");
    try { return new URL(value, location.origin); } catch (_) { return null; }
  }

  async function requestBody(input, init, request) {
    if (typeof init?.body === "string") {
      try { return JSON.parse(init.body); } catch (_) { return null; }
    }
    if (request?.body) {
      try { return await request.clone().json(); } catch (_) { return null; }
    }
    return null;
  }

  function serverlessAction(url, method, body) {
    const path = url.pathname;
    if (path === "/miniapp/api/session" && method === "POST") return {action:"pages"};
    if (path === "/miniapp/api/me" && method === "GET") return {action:"me"};
    if (path === "/miniapp/api/pages" && method === "GET") return {action:"pages"};
    if (path === "/miniapp/api/pages" && method === "POST") return {...(body||{}),action:"create"};
    if (path === "/miniapp/api/destinations" && method === "GET") return {action:"destinations"};
    if (path === "/miniapp/api/send" && method === "POST") return {...(body||{}),action:"publish"};
    if (path === "/miniapp/api/rich-buttons/user-picker" && method === "POST") {
      return {...(body||{}),action:"user_picker"};
    }
    if (path === "/miniapp/api/client-error" && method === "POST") return {...(body||{}),action:"client_error"};
    if (path === "/miniapp/api/custom-emoji/pack" && method === "GET") {
      return {action:"custom_emoji_pack_read",set:url.searchParams.get("set")||""};
    }
    if (path === "/miniapp/api/custom-emoji/pack" && method === "POST") {
      return {...(body||{}),action:"custom_emoji_pack"};
    }
    if (path === "/miniapp/api/custom-emoji/packs" && method === "GET") {
      return {action:"custom_emoji_packs"};
    }
    if (path === "/miniapp/api/custom-emoji/packs" && method === "PUT") {
      return {...(body||{}),action:"custom_emoji_manage",manage_action:body?.action};
    }
    if (path === "/miniapp/api/custom-emoji/packs" && method === "DELETE") {
      return {...(body||{}),action:"custom_emoji_manage",manage_action:"delete"};
    }
    const emojiPreviewMatch = path.match(/^\/miniapp\/api\/custom-emoji\/([^/]+)$/);
    if (emojiPreviewMatch && method === "GET") {
      let emojiId;
      try { emojiId = decodeURIComponent(emojiPreviewMatch[1]); } catch (_) { return null; }
      return {action:"custom_emoji_preview",custom_emoji_id:emojiId};
    }

    const pageMatch = path.match(/^\/miniapp\/api\/pages\/([^/]+)$/);
    if (!pageMatch) return null;
    let pageId;
    try { pageId = decodeURIComponent(pageMatch[1]); } catch (_) { return null; }
    if (method === "GET") return {action:"page",page_id:pageId};
    if (method === "PUT") return {...(body||{}),action:"save",page_id:pageId};
    if (method === "DELETE") return {
      action:"delete",
      page_id:pageId,
      base_revision:Number(url.searchParams.get("base_revision")||0),
      base_updated_at:Number(url.searchParams.get("base_updated_at")||0),
    };
    return null;
  }

  function callEndpoint(input) {
    return new Promise((resolve, reject) => {
      const call = telegramApp?.Serverless?.call;
      if (typeof call !== "function") {
        reject(Object.assign(new Error("Telegram Serverless Mini App API is unavailable"), {code:"SERVERLESS_API_UNAVAILABLE"}));
        return;
      }
      call.call(telegramApp.Serverless, "miniapp", input, (error, result) => {
        if (error) {
          const code = String(error?.parameters?.code || error?.code || "MINIAPP_REQUEST_FAILED");
          reject(Object.assign(new Error(String(error?.message || error?.description || "Mini App request failed")), {code}));
          return;
        }
        resolve(result);
      });
    });
  }

  function errorStatus(code) {
    if (code === "UNAUTHORIZED") return 401;
    if (code === "RATE_LIMITED") return 429;
    if (code === "PAGE_NOT_FOUND") return 404;
    if (code === "PAGE_CONFLICT" || code === "REQUEST_IN_PROGRESS" || code === "DUPLICATE_REQUEST") return 409;
    if (/^INTERNAL|SERVICE_UNAVAILABLE/.test(code)) return 503;
    return 400;
  }

  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"},
    });
  }

  async function importLegacyEmojiPacks(fetchOptions) {
    const headers = new Headers(fetchOptions?.headers || {});
    const response = await originalFetch(
      cloudflareApiOrigin + "/miniapp/api/custom-emoji/packs",
      {method:"GET",headers,cache:"no-store",credentials:"omit"},
    );
    if (!response.ok) throw new Error("CUSTOM_EMOJI_LEGACY_IMPORT_UNAVAILABLE");
    const legacy = await response.json();
    const sourceNames = legacy?.access?.custom_emoji_all_packs ?? legacy?.access?.custom_emoji_packs;
    const names = Array.isArray(sourceNames)
      ? sourceNames.map(name => String(name || ""))
      : [];
    if (!legacy?.ok || !legacy?.access) throw new Error("CUSTOM_EMOJI_LEGACY_IMPORT_INVALID");
    const imported = await callEndpoint({
      action:"custom_emoji_import",
      pack_names:names,
      pinned_pack:String(legacy.access.custom_emoji_pinned_pack || ""),
      request_id:"emoji_import_" + (window.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`).replaceAll("-",""),
    });
    if (!imported?.ok || !imported?.access) throw new Error("CUSTOM_EMOJI_LEGACY_IMPORT_FAILED");
    return imported;
  }

  function previewResponse(result) {
    if (!result?.data_base64 || !result?.content_type) {
      return jsonResponse({ok:false,error:{code:"CUSTOM_EMOJI_PREVIEW_UNAVAILABLE"}},404);
    }
    const binary = atob(result.data_base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Response(bytes, {
      status:200,
      headers:{"content-type":String(result.content_type),"cache-control":"private, max-age=3600","x-content-type-options":"nosniff"},
    });
  }

  async function fetchFromServerless(url, method, body, init) {
    const action = serverlessAction(url, method, body);
    if (!action) {
      const request = typeof Request !== "undefined" && init.request instanceof Request
        ? init.request
        : null;
      return originalFetch(
        request ? new Request(cloudflareApiOrigin + url.pathname + url.search, request) : cloudflareApiOrigin + url.pathname + url.search,
        init.fetchOptions,
      );
    }
    if (["create","save","delete","publish","user_picker","client_error","custom_emoji_pack","custom_emoji_manage","custom_emoji_import"].includes(action.action)
      && !action.request_id) {
      const requestId = window.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`;
      action.request_id = "web_" + requestId.replaceAll("-","");
    }
    try {
      let result = await callEndpoint(action);
      if (action.action === "custom_emoji_packs" && result?.access?.migration_required) {
        result = await importLegacyEmojiPacks(init.fetchOptions);
      }
      if (action.action === "custom_emoji_preview") return previewResponse(result);
      return jsonResponse(result);
    } catch (error) {
      const code = String(error?.code || "MINIAPP_REQUEST_FAILED");
      return jsonResponse({ok:false,error:{code,message:String(error?.message || "Mini App request failed")}},errorStatus(code));
    }
  }

  window.RichMiniAppServerless = {isHosted:isTelegramServerlessHost,cloudflareApiOrigin};
  window.fetch = async function(input, fetchOptions = {}) {
    const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
    const url = apiPath(input);
    if (!url || !url.pathname.startsWith("/miniapp/api/")) return originalFetch(input, fetchOptions);

    const method = String(fetchOptions?.method || request?.method || "GET").toUpperCase();
    if (!isTelegramServerlessHost) return originalFetch(input, fetchOptions);
    const body = await requestBody(input, fetchOptions, request);
    return fetchFromServerless(url, method, body, {request,fetchOptions});
  };
})();
