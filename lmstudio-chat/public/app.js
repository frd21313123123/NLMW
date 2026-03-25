(() => {
  const $ = (sel, el = document) => el.querySelector(sel);

  const STORAGE_KEYS = {
    profile: "nlmw.profile",
    characters: "nlmw.characters",
    selectedCharacterId: "nlmw.selectedCharacterId",
    conversations: "nlmw.conversations",
    modelId: "nlmw.lmstudioModelId",
    responseIds: "nlmw.lmstudioResponseIds",
    responseIdChains: "nlmw.lmstudioResponseIdChains",
    provider: "nlmw.provider",
    mistralKey: "nlmw.mistralKey",
    savedPrompts: "nlmw.savedPrompts"
  };

  const DIALOGUE_STYLES = [
    { id: "natural", label: "Естественно", prompt: "Говори живо и естественно. Без канцелярита." },
    { id: "friendly", label: "Дружелюбно", prompt: "Дружелюбный тон, поддерживай и уточняй мягко." },
    {
      id: "roleplay",
      label: "Ролевой (RP)",
      prompt: "Это ролевая сцена. Добавляй детали обстановки и действий, но не перегружай."
    },
    { id: "formal", label: "Официально", prompt: "Официальный тон: четко, вежливо, без фамильярности." },
    { id: "flirty", label: "Флирт", prompt: "Легкий флирт и игривость, уважительно и без навязчивости." },
    { id: "short", label: "Коротко", prompt: "Короткие ответы: 1-4 предложения, по делу." },
    {
      id: "detailed",
      label: "Подробно",
      prompt: "Развернутые ответы: эмоции персонажа, мотивация и детали сцены."
    }
  ];

  const state = {
    profile: null,
    characters: [],
    selectedCharacterId: "",
    editingCharacterId: "",
    conversations: {},
    responseIds: {},
    responseIdChains: {},
    modelId: "",
    provider: "lmstudio",
    mistralKey: "",
    savedPrompts: [],
    lmOk: false,
    generating: false,
    msgActionsTargetId: "",
    view: "chats",
    discoverTab: "explore",
    discoverCategory: "all"
  };

  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function loadJson(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = safeJsonParse(raw);
    return parsed === null ? fallback : parsed;
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }

  function nowTs() {
    return Date.now();
  }

  function genderLabel(g) {
    if (g === "female") return "женский";
    if (g === "male") return "мужской";
    if (g === "other") return "другое";
    return "не указан";
  }

  function clampText(s, maxLen) {
    const str = String(s || "");
    if (str.length <= maxLen) return str;
    return `${str.slice(0, maxLen - 1)}…`;
  }

  function styleById(id) {
    return DIALOGUE_STYLES.find((x) => x.id === id) || DIALOGUE_STYLES[0];
  }

  function providerLabel() {
    if (state.provider === "mistral") return "Mistral";
    return "LM Studio";
  }

  function syncModelSelectTitles(selects) {
    for (const s of selects) {
      if (!s) continue;
      const opt = s.options && s.selectedIndex >= 0 ? s.options[s.selectedIndex] : null;
      const label = String(opt?.textContent || opt?.label || s.value || "").trim();
      s.title = label ? `Модель: ${label}` : "Модель";
    }
  }

  function defaultProfile() {
    return {
      name: "Вы",
      gender: "unspecified",
      avatar: ""
    };
  }

  function normalizeProfileRecord(p) {
    const base = defaultProfile();
    const merged = { ...base, ...(p && typeof p === "object" ? p : {}) };
    merged.name = String(merged.name || "").trim() || base.name;
    merged.gender = normalizeGender(merged.gender);
    merged.avatar = typeof merged.avatar === "string" ? merged.avatar : "";
    return merged;
  }

  function defaultCharacter() {
    return {
      id: uuid(),
      name: "Алиса",
      gender: "female",
      intro: "Наблюдательная собеседница с мягкой иронией и вниманием к деталям.",
      visibility: "public",
      tags: ["город", "неон"],
      avatar: "",
      background: "",
      backgroundHint: "ночной город, неон, дождь",
      outfit: "Темная куртка, короткие перчатки, внимательный взгляд.",
      setting: "Вы стоите под навесом у маленького кафе; за стеклом теплый свет, снаружи шумит дождь.",
      backstory: "Алиса — наблюдательная собеседница, любит точные вопросы и умеет держать интригу.",
      dialogueStyle: "roleplay",
      initialMessage: "Привет. Кажется, дождь решил задержаться. Ты сюда случайно — или искал именно это место?",
      createdAt: nowTs(),
      updatedAt: nowTs()
    };
  }

  function normalizeGender(g) {
    const s = String(g || "").trim().toLowerCase();
    if (!s) return "unspecified";
    if (s === "female" || s === "f" || s === "woman" || s === "girl" || s === "женский" || s === "ж") return "female";
    if (s === "male" || s === "m" || s === "man" || s === "boy" || s === "мужской" || s === "м") return "male";
    if (s === "other" || s === "nonbinary" || s === "non-binary" || s === "nb") return "other";
    return "unspecified";
  }

  function normalizeDialogueStyleId(styleIdOrName, styleText) {
    const raw = String(styleIdOrName || "").trim().toLowerCase();
    const txt = String(styleText || "").trim().toLowerCase();

    if (DIALOGUE_STYLES.some((s) => s.id === raw)) return raw;

    const probe = `${raw} ${txt}`;
    if (probe.includes("flirt") || probe.includes("флирт")) return "flirty";
    if (probe.includes("formal") || probe.includes("официал")) return "formal";
    if (probe.includes("short") || probe.includes("кратк") || probe.includes("корот")) return "short";
    if (probe.includes("detail") || probe.includes("подроб")) return "detailed";
    if (probe.includes("role") || probe.includes("rp") || probe.includes("рол") || probe.includes("сцена")) return "roleplay";
    if (probe.includes("friend") || probe.includes("друж")) return "friendly";
    return "natural";
  }

  function appendSection(base, title, text) {
    const b = String(base || "").trim();
    const t = String(text || "").trim();
    if (!t) return b;
    const section = `${title}: ${t}`;
    if (!b) return section;
    if (b.includes(section)) return b;
    return `${b}\n\n${section}`;
  }

  function normalizeCharacterRecord(c) {
    const base = defaultCharacter();

    const id = typeof c?.id === "string" && c.id.trim() ? c.id.trim() : uuid();
    const createdAt = typeof c?.createdAt === "number" && Number.isFinite(c.createdAt) ? c.createdAt : nowTs();
    const updatedAt = typeof c?.updatedAt === "number" && Number.isFinite(c.updatedAt) ? c.updatedAt : createdAt;

    // Merge defaults with stored record; then sanitize core fields.
    const merged = { ...base, ...(c && typeof c === "object" ? c : {}), id, createdAt, updatedAt };

    merged.name = String(merged.name || "").trim() || "(без имени)";
    merged.gender = normalizeGender(merged.gender);
    merged.intro = String(merged.intro || "").trim();
    merged.visibility = String(merged.visibility || "").trim().toLowerCase() === "private" ? "private" : "public";
    merged.tags = Array.isArray(merged.tags)
      ? merged.tags.map((x) => cleanOneLineText(x)).filter(Boolean).slice(0, 5)
      : splitCharacterTags(merged.tags).slice(0, 5);
    merged.avatar = typeof merged.avatar === "string" ? merged.avatar : "";
    merged.background = typeof merged.background === "string" ? merged.background : "";
    merged.backgroundHint = String(merged.backgroundHint || "");
    merged.outfit = String(merged.outfit || "");
    merged.setting = String(merged.setting || "");
    merged.backstory = String(merged.backstory || "");
    merged.dialogueStyle = normalizeDialogueStyleId(merged.dialogueStyle, "");
    merged.initialMessage = String(merged.initialMessage || "");

    return merged;
  }

  function ensureSeed() {
    state.profile = normalizeProfileRecord(loadJson(STORAGE_KEYS.profile, defaultProfile()));
    state.characters = loadJson(STORAGE_KEYS.characters, []);
    state.selectedCharacterId = String(loadJson(STORAGE_KEYS.selectedCharacterId, ""));
    state.conversations = loadJson(STORAGE_KEYS.conversations, {});
    state.responseIds = loadJson(STORAGE_KEYS.responseIds, {});
    state.responseIdChains = loadJson(STORAGE_KEYS.responseIdChains, {});
    state.modelId = String(loadJson(STORAGE_KEYS.modelId, ""));
    state.provider = String(loadJson(STORAGE_KEYS.provider, "lmstudio"));
    state.mistralKey = String(loadJson(STORAGE_KEYS.mistralKey, ""));
    state.savedPrompts = loadJson(STORAGE_KEYS.savedPrompts, []);

    if (state.provider !== "lmstudio" && state.provider !== "mistral") {
      state.provider = "lmstudio";
    }

    saveJson(STORAGE_KEYS.profile, state.profile);

    if (Array.isArray(state.characters)) {
      state.characters = state.characters.filter((x) => x && typeof x === "object").map(normalizeCharacterRecord);
      saveJson(STORAGE_KEYS.characters, state.characters);
    }

    if (!Array.isArray(state.characters) || state.characters.length === 0) {
      const seed = defaultCharacter();
      state.characters = [seed];
      state.selectedCharacterId = seed.id;
      state.editingCharacterId = seed.id;
      saveJson(STORAGE_KEYS.characters, state.characters);
      saveJson(STORAGE_KEYS.selectedCharacterId, state.selectedCharacterId);
    }

    if (!state.selectedCharacterId || !state.characters.some((c) => c.id === state.selectedCharacterId)) {
      state.selectedCharacterId = state.characters[0].id;
      saveJson(STORAGE_KEYS.selectedCharacterId, state.selectedCharacterId);
    }

    if (!state.editingCharacterId) state.editingCharacterId = state.selectedCharacterId;

    if (!state.conversations || typeof state.conversations !== "object" || Array.isArray(state.conversations)) state.conversations = {};
    if (!state.responseIds || typeof state.responseIds !== "object" || Array.isArray(state.responseIds)) state.responseIds = {};
    if (!state.responseIdChains || typeof state.responseIdChains !== "object" || Array.isArray(state.responseIdChains)) state.responseIdChains = {};
    if (!Array.isArray(state.savedPrompts)) state.savedPrompts = [];

    // Normalize conversations to support multiple chats per character.
    const normalizedConversations = {};
    for (const c of state.characters) {
      const bucket = normalizeConversationBucket(c.id, state.conversations?.[c.id]);
      if (!bucket.chats || bucket.chats.length === 0) {
        const chat = normalizeChatRecord({}, defaultChatTitle(1));
        bucket.chats = [chat];
        bucket.activeChatId = chat.id;
      }
      if (!bucket.activeChatId || !bucket.chats.some((x) => x.id === bucket.activeChatId)) {
        bucket.activeChatId = bucket.chats[0]?.id || "";
      }
      normalizedConversations[c.id] = bucket;
    }
    state.conversations = normalizedConversations;
    saveJson(STORAGE_KEYS.conversations, state.conversations);

    // Migrate response ids from characterId-based to chatId-based (if needed).
    const legacyChains = state.responseIdChains || {};
    const legacyIds = state.responseIds || {};
    const nextChains = {};
    const nextIds = {};

    const readChain = (key) => (Array.isArray(legacyChains[key]) ? legacyChains[key] : []);
    const readId = (key) => (typeof legacyIds[key] === "string" && legacyIds[key].trim() ? legacyIds[key].trim() : "");

    for (const c of state.characters) {
      const bucket = state.conversations[c.id];
      if (!bucket) continue;

      for (const chat of bucket.chats) {
        const chain = readChain(chat.id);
        if (chain.length > 0) nextChains[chat.id] = chain;
        const id = readId(chat.id);
        if (id) nextIds[chat.id] = id;
      }

      const activeId = bucket.activeChatId;
      if (activeId) {
        if (!nextChains[activeId]) {
          const chain = readChain(c.id);
          if (chain.length > 0) nextChains[activeId] = chain;
        }
        if (!nextIds[activeId]) {
          const id = readId(c.id);
          if (id) nextIds[activeId] = id;
        }
      }
    }

    state.responseIdChains = nextChains;
    state.responseIds = nextIds;
    saveJson(STORAGE_KEYS.responseIdChains, state.responseIdChains);
    saveJson(STORAGE_KEYS.responseIds, state.responseIds);

    state.savedPrompts = state.savedPrompts
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        id: typeof x.id === "string" && x.id.trim() ? x.id.trim() : uuid(),
        title: clampText(String(x.title || "").trim() || "Промт", 80),
        text: clampText(String(x.text || "").trim(), 4000),
        createdAt: typeof x.createdAt === "number" && Number.isFinite(x.createdAt) ? x.createdAt : nowTs(),
        updatedAt: typeof x.updatedAt === "number" && Number.isFinite(x.updatedAt) ? x.updatedAt : nowTs()
      }))
      .filter((x) => x.text);
    saveJson(STORAGE_KEYS.savedPrompts, state.savedPrompts);
  }

  function normalizeImportedCharacter(raw) {
    if (!raw || typeof raw !== "object") return null;

    // Common wrappers: { data: {...} }, { character: {...} }, { card: {...} }
    const obj =
      (raw.data && typeof raw.data === "object" && raw.data) ||
      (raw.character && typeof raw.character === "object" && raw.character) ||
      (raw.card && typeof raw.card === "object" && raw.card) ||
      raw;

    const name = String(
      obj.name ?? obj.char_name ?? obj.character_name ?? obj.display_name ?? obj.displayName ?? ""
    ).trim();

    const greeting = String(
      obj.initialMessage ?? obj.greeting ?? obj.first_mes ?? obj.char_greeting ?? obj.firstMessage ?? ""
    ).trim();

    // "Intro" / persona / description.
    const intro = String(
      obj.intro ?? obj.description ?? obj.char_persona ?? obj.persona ?? obj.profile ?? ""
    ).trim();

    // "Scenario" / world.
    const scenario = String(
      obj.setting ?? obj.scenario ?? obj.world_scenario ?? obj.worldScenario ?? ""
    ).trim();

    const backgroundText = String(obj.background ?? obj.backstory ?? "").trim();
    const dialogueStyleText = String(obj.dialogue_style ?? obj.dialogueStyle ?? obj.style ?? "").trim();
    const example = String(obj.mes_example ?? obj.example_dialogue ?? obj.exampleDialogue ?? "").trim();

    // Images: try common keys. (Polybuzz often has avatar + cover.)
    const avatar = String(
      obj.avatar ?? obj.avatar_url ?? obj.avatarUrl ?? obj.image ?? obj.image_url ?? obj.profile_image ?? ""
    ).trim();

    const backgroundImage = String(
      obj.background_image ?? obj.background_url ?? obj.backgroundUrl ?? obj.cover ?? obj.cover_url ?? obj.coverUrl ?? ""
    ).trim();

    let backstory = String(obj.backstory ?? "").trim();
    backstory = backstory || intro || "";
    backstory = appendSection(backstory, "Бэкграунд", backgroundText);
    backstory = appendSection(backstory, "Стиль диалога", dialogueStyleText);
    backstory = appendSection(backstory, "Пример диалога", example);

    const out = normalizeCharacterRecord({
      id: typeof obj.id === "string" ? obj.id : "",
      name: name || "Импортированный персонаж",
      gender: normalizeGender(obj.gender ?? obj.sex ?? ""),
      intro,
      visibility: String(obj.visibility ?? obj.permission ?? obj.access ?? "public"),
      tags: Array.isArray(obj.tags) ? obj.tags : String(obj.tags ?? obj.tag_list ?? ""),
      avatar,
      background: backgroundImage,
      backgroundHint: String(obj.backgroundHint ?? obj.background_hint ?? "").trim(),
      outfit: String(obj.outfit ?? obj.appearance ?? "").trim(),
      setting: scenario,
      backstory,
      dialogueStyle: normalizeDialogueStyleId(obj.dialogueStyle ?? obj.dialogue_style_id ?? "", dialogueStyleText),
      initialMessage: greeting
    });

    return out;
  }

  function normalizeImportedCharactersPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object") {
      if (Array.isArray(payload.characters)) return payload.characters;
      if (Array.isArray(payload.data)) return payload.data;
      // Single character object.
      return [payload];
    }
    return [];
  }

  function importCharactersFromJsonPayload(payload) {
    const items = normalizeImportedCharactersPayload(payload);
    if (!items.length) return { imported: 0, firstId: "" };

    const existingIds = new Set(state.characters.map((c) => c.id));
    let imported = 0;
    let firstId = "";

    for (const raw of items) {
      const c = normalizeImportedCharacter(raw);
      if (!c) continue;

      // Avoid id collisions.
      let id = c.id;
      if (!id || existingIds.has(id)) id = uuid();
      c.id = id;
      if (!firstId) firstId = id;
      existingIds.add(id);

      c.createdAt = nowTs();
      c.updatedAt = nowTs();

      upsertCharacter(c);
      imported++;
    }

    return { imported, firstId };
  }

  function downloadText(filename, text) {
    const blob = new Blob([String(text || "")], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildFullExportPayload() {
    return {
      format: "nlmw-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        profile: state.profile,
        characters: state.characters,
        selectedCharacterId: state.selectedCharacterId,
        conversations: state.conversations,
        responseIds: state.responseIds,
        responseIdChains: state.responseIdChains,
        modelId: state.modelId,
        provider: state.provider,
        mistralKey: state.mistralKey,
        savedPrompts: state.savedPrompts
      }
    };
  }

  async function applyImportedAppData(payload) {
    const src = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
      ? payload.data
      : payload;
    if (!src || typeof src !== "object") throw new Error("Неверный формат файла.");
    if (!Array.isArray(src.characters)) throw new Error("В файле нет списка персонажей (characters).");
    if (!src.conversations || typeof src.conversations !== "object" || Array.isArray(src.conversations)) {
      throw new Error("В файле нет данных чатов (conversations).");
    }

    saveJson(STORAGE_KEYS.profile, normalizeProfileRecord(src.profile));
    saveJson(STORAGE_KEYS.characters, src.characters);
    saveJson(STORAGE_KEYS.selectedCharacterId, String(src.selectedCharacterId || ""));
    saveJson(STORAGE_KEYS.conversations, src.conversations);
    saveJson(STORAGE_KEYS.responseIds, src.responseIds && typeof src.responseIds === "object" && !Array.isArray(src.responseIds) ? src.responseIds : {});
    saveJson(
      STORAGE_KEYS.responseIdChains,
      src.responseIdChains && typeof src.responseIdChains === "object" && !Array.isArray(src.responseIdChains) ? src.responseIdChains : {}
    );
    saveJson(STORAGE_KEYS.modelId, String(src.modelId || ""));
    saveJson(STORAGE_KEYS.provider, src.provider === "mistral" ? "mistral" : "lmstudio");
    saveJson(STORAGE_KEYS.mistralKey, String(src.mistralKey || ""));
    saveJson(STORAGE_KEYS.savedPrompts, Array.isArray(src.savedPrompts) ? src.savedPrompts : []);

    ensureSeed();
    if (!state.characters.some((c) => c.id === state.editingCharacterId)) {
      state.editingCharacterId = state.selectedCharacterId || state.characters[0]?.id || "";
    }

    ensureInitialMessage();
    fillProfileUI();
    renderHeader();
    renderMessages();
    refreshChatsView();

    const modal = $("#charactersModal");
    if (modal && !modal.hidden) {
      renderCharacterList();
      fillCharacterForm();
    }

    await fetch("/api/characters/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.characters)
    }).catch(() => {});
  }

  function parsePngTextChunks(arrayBuffer) {
    const u8 = new Uint8Array(arrayBuffer);
    if (u8.length < 8) return [];
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < sig.length; i++) if (u8[i] !== sig[i]) return [];

    const dv = new DataView(arrayBuffer);
    let off = 8;
    const out = [];

    const readAscii = (start, len) => {
      let s = "";
      for (let i = 0; i < len; i++) s += String.fromCharCode(u8[start + i]);
      return s;
    };

    const readLatin1 = (bytes) => {
      let s = "";
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return s;
    };

    while (off + 8 <= u8.length) {
      const len = dv.getUint32(off, false);
      off += 4;
      const type = readAscii(off, 4);
      off += 4;
      if (off + len + 4 > u8.length) break;
      const data = u8.slice(off, off + len);
      off += len;
      off += 4; // CRC

      if (type === "tEXt") {
        const nul = data.indexOf(0);
        if (nul > 0) {
          const keyword = readLatin1(data.slice(0, nul));
          const text = readLatin1(data.slice(nul + 1));
          out.push({ type, keyword, text });
        }
      } else if (type === "iTXt") {
        // keyword\0 compFlag\0 compMethod\0 lang\0 translated\0 text (UTF-8)
        const nul1 = data.indexOf(0);
        if (nul1 > 0 && nul1 + 2 < data.length) {
          const keyword = readLatin1(data.slice(0, nul1));
          const compFlag = data[nul1 + 1];
          const compMethod = data[nul1 + 2];
          if (compFlag === 0 && compMethod === 0) {
            let p = nul1 + 3;
            const readNullTerm = () => {
              const n = data.indexOf(0, p);
              if (n === -1) return null;
              const s = readLatin1(data.slice(p, n));
              p = n + 1;
              return s;
            };
            readNullTerm(); // language tag
            readNullTerm(); // translated keyword
            const textBytes = data.slice(p);
            try {
              const text = new TextDecoder("utf-8").decode(textBytes);
              out.push({ type, keyword, text });
            } catch {
              // ignore
            }
          }
        }
      }
    }

    return out;
  }

  function tryParseJsonFromCharacterCardText(text) {
    const s = String(text || "").trim();
    if (!s) return null;

    if (s.startsWith("{") || s.startsWith("[")) {
      const obj = safeJsonParse(s);
      if (obj) return obj;
    }

    // Most character cards store base64(JSON).
    try {
      const decoded = atob(s.replace(/\s+/g, ""));
      const obj = safeJsonParse(decoded);
      if (obj) return obj;
    } catch {
      // ignore
    }

    return null;
  }

  async function importFromFile(file) {
    const n = String(file?.name || "").toLowerCase();
    const t = String(file?.type || "").toLowerCase();

    if (t.includes("json") || n.endsWith(".json")) {
      const text = await file.text();
      const payload = safeJsonParse(text);
      if (!payload) throw new Error("Не удалось прочитать JSON (проверьте формат).");
      return importCharactersFromJsonPayload(payload);
    }

    if (t === "image/png" || n.endsWith(".png")) {
      const ab = await file.arrayBuffer();
      const chunks = parsePngTextChunks(ab);
      const candidates = chunks
        .filter((c) => String(c.keyword || "").toLowerCase().includes("chara") || String(c.keyword || "").toLowerCase().includes("character"))
        .map((c) => c.text)
        .concat(chunks.map((c) => c.text));

      let payload = null;
      for (const txt of candidates) {
        payload = tryParseJsonFromCharacterCardText(txt);
        if (payload) break;
      }

      if (!payload) throw new Error("Не нашел JSON в PNG character card (tEXt/iTXt). Попробуйте JSON-файл.");

      const result = importCharactersFromJsonPayload(payload);

      // If card import didn't include an avatar, use the PNG itself (within size limit).
      try {
        const url = await fileToDataUrl(file);
        if (result.firstId) {
          const c = state.characters.find((x) => x.id === result.firstId);
          if (c && (!c.avatar || String(c.avatar).trim() === "")) {
            upsertCharacter({ ...c, avatar: url, updatedAt: nowTs() });
          }
        }
      } catch {
        // PNG might be too big for localStorage; still import text fields.
      }

      return result;
    }

    throw new Error("Поддерживаются только .json и .png");
  }

  function isPolybuzzUrl(text) {
    const s = String(text || "").trim();
    if (!s) return false;
    try {
      const u = new URL(s);
      const host = String(u.hostname || "").toLowerCase();
      return (u.protocol === "https:" || u.protocol === "http:") && (host === "polybuzz.ai" || host.endsWith(".polybuzz.ai"));
    } catch {
      return false;
    }
  }

  async function importFromPolybuzzUrl(url) {
    const u = String(url || "").trim();
    if (!isPolybuzzUrl(u)) throw new Error("Нужна ссылка polybuzz.ai");

    const res = await fetch("/api/import/polybuzz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: u })
    });

    const text = await res.text();
    const data = safeJsonParse(text);

    if (!res.ok) {
      const msg = data?.error || `Ошибка импорта (${res.status})`;
      throw new Error(String(msg));
    }

    if (!data || data.ok !== true || !data.character) throw new Error("Неожиданный ответ сервера импорта");
    return data.character;
  }

  let importCharactersBusy = false;

  function applyImportedCharactersResult(result, { openModalOnSuccess = false } = {}) {
    const imported = Number(result?.imported || 0);
    const firstId = String(result?.firstId || "");
    if (!(imported > 0)) return false;

    if (firstId) state.editingCharacterId = firstId;
    if (openModalOnSuccess) openModal();

    fillCharacterForm();
    refreshChatsView();

    const note = `Импортировано: ${imported}`;
    $("#charFormNote").textContent = note;
    flashStatus(note, true);
    return true;
  }

  async function importCharactersFromTextOrUrl(text, { openModalOnSuccess = false, showErrors = true } = {}) {
    const s = String(text || "").trim();
    if (!s) return false;
    if (importCharactersBusy) return false;

    importCharactersBusy = true;
    try {
      const payload = safeJsonParse(s);
      if (payload) {
        return applyImportedCharactersResult(importCharactersFromJsonPayload(payload), { openModalOnSuccess });
      }

      if (isPolybuzzUrl(s)) {
        $("#charFormNote").textContent = "Импортирую с PolyBuzz…";
        flashStatus("Импорт PolyBuzz…", true, 2500);

        const character = await importFromPolybuzzUrl(s);
        return applyImportedCharactersResult(importCharactersFromJsonPayload(character), { openModalOnSuccess });
      }

      if (showErrors) {
        $("#charFormNote").textContent = "Не удалось импортировать: проверьте JSON или ссылку.";
        flashStatus("Не удалось импортировать", false);
      }
      return false;
    } catch (err) {
      if (showErrors) {
        const msg = String(err?.message || err);
        $("#charFormNote").textContent = msg;
        flashStatus(msg, false);
      }
      return false;
    } finally {
      importCharactersBusy = false;
    }
  }

  function activeCharacter() {
    return state.characters.find((c) => c.id === state.selectedCharacterId) || state.characters[0];
  }

  function editingCharacter() {
    return state.characters.find((c) => c.id === state.editingCharacterId) || activeCharacter();
  }

  function defaultChatTitle(index) {
    return `Чат ${index}`;
  }

  function normalizeChatRecord(raw, fallbackTitle) {
    const isObj = raw && typeof raw === "object" && !Array.isArray(raw);
    const messages = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.messages)
        ? raw.messages
        : Array.isArray(raw?.history)
          ? raw.history
          : [];

    const id = typeof raw?.id === "string" && raw.id.trim() ? raw.id.trim() : uuid();
    const title = String((isObj && raw.title) || fallbackTitle || "Чат").trim() || "Чат";
    const createdAt =
      typeof raw?.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : nowTs();
    let updatedAt =
      typeof raw?.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0;

    if (!updatedAt) {
      const last = messages[messages.length - 1];
      updatedAt = typeof last?.ts === "number" ? last.ts : createdAt;
    }

    return { id, title, createdAt, updatedAt, messages };
  }

  function normalizeConversationBucket(characterId, raw) {
    if (Array.isArray(raw)) {
      const chat = normalizeChatRecord({ messages: raw }, defaultChatTitle(1));
      return { activeChatId: chat.id, chats: [chat] };
    }

    if (raw && typeof raw === "object" && Array.isArray(raw.chats)) {
      const chats = raw.chats
        .map((c, idx) => normalizeChatRecord(c, defaultChatTitle(idx + 1)))
        .filter((c) => c && c.id);
      let activeChatId = typeof raw.activeChatId === "string" ? raw.activeChatId.trim() : "";
      if (!chats.some((c) => c.id === activeChatId)) activeChatId = chats[0]?.id || "";
      return { activeChatId, chats };
    }

    return { activeChatId: "", chats: [] };
  }

  function conversationBucketFor(characterId) {
    if (!state.conversations || typeof state.conversations !== "object") state.conversations = {};
    let bucket = state.conversations[characterId];

    if (!bucket || typeof bucket !== "object" || !Array.isArray(bucket.chats)) {
      bucket = normalizeConversationBucket(characterId, bucket);
    }

    if (!Array.isArray(bucket.chats) || bucket.chats.length === 0) {
      const chat = normalizeChatRecord({}, defaultChatTitle(1));
      bucket.chats = [chat];
      bucket.activeChatId = chat.id;
    }

    if (!bucket.activeChatId || !bucket.chats.some((c) => c.id === bucket.activeChatId)) {
      bucket.activeChatId = bucket.chats[0]?.id || "";
    }

    state.conversations[characterId] = bucket;
    saveJson(STORAGE_KEYS.conversations, state.conversations);
    return bucket;
  }

  function activeChatIdFor(characterId) {
    return conversationBucketFor(characterId).activeChatId || "";
  }

  function activeChatFor(characterId) {
    const bucket = conversationBucketFor(characterId);
    return bucket.chats.find((c) => c.id === bucket.activeChatId) || bucket.chats[0];
  }

  function setActiveChat(characterId, chatId) {
    const bucket = conversationBucketFor(characterId);
    if (bucket.chats.some((c) => c.id === chatId)) {
      bucket.activeChatId = chatId;
      state.conversations[characterId] = bucket;
      saveJson(STORAGE_KEYS.conversations, state.conversations);
    }
  }

  function chatHistoryFor(characterId) {
    const chat = activeChatFor(characterId);
    return Array.isArray(chat?.messages) ? chat.messages : [];
  }

  function lastNonPendingMessage(characterId) {
    const history = chatHistoryFor(characterId);
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      if (!m || m.pending) continue;
      if (m.role !== "user" && m.role !== "assistant") continue;
      return m;
    }
    return null;
  }

  function lastNonPendingMessageForChat(chat) {
    const history = Array.isArray(chat?.messages) ? chat.messages : [];
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      if (!m || m.pending) continue;
      if (m.role !== "user" && m.role !== "assistant") continue;
      return m;
    }
    return null;
  }

  function lastNonPendingMessageForCharacter(characterId) {
    const bucket = conversationBucketFor(characterId);
    let best = null;
    for (const chat of bucket.chats) {
      const last = lastNonPendingMessageForChat(chat);
      if (!last) continue;
      if (!best || (last.ts || 0) > (best.ts || 0)) best = last;
    }
    return best;
  }

  function normalizeTagToken(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[~*"'`]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanOneLineText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function splitCharacterTags(value) {
    return String(value || "")
      .split(/[,\n|/]+/g)
      .map((part) => cleanOneLineText(part))
      .filter(Boolean);
  }

  function characterTags(character) {
    const tags = [];
    const seen = new Set();
    const rawTags = [
      ...(Array.isArray(character?.tags) ? character.tags : []),
      ...splitCharacterTags(character?.backgroundHint),
      ...splitCharacterTags(character?.setting),
      styleById(character?.dialogueStyle)?.label || ""
    ];

    for (const tag of rawTags) {
      const shortTag = tag.length > 28 ? tag.slice(0, 28).trim() : tag;
      const key = normalizeTagToken(shortTag);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      tags.push(shortTag);
      if (tags.length >= 6) break;
    }

    return tags;
  }

  function isRomanceCharacter(character) {
    const haystack = normalizeTagToken(
      `${character?.backgroundHint || ""} ${character?.setting || ""} ${character?.backstory || ""}`
    );
    return ["роман", "романтик", "влюб", "люб", "flirt", "flirty", "date", "girlfriend", "boyfriend"].some((token) =>
      haystack.includes(token)
    );
  }

  function buildDiscoverCategories(characters) {
    const categories = [{ id: "all", label: "Для вас" }];
    if (characters.some(isRomanceCharacter)) {
      categories.push({ id: "romance", label: "Встречаться", icon: true });
    }

    const counts = new Map();
    for (const character of characters) {
      for (const tag of characterTags(character)) {
        const key = normalizeTagToken(tag);
        if (!key) continue;
        counts.set(key, { id: key, label: tag, count: (counts.get(key)?.count || 0) + 1 });
      }
    }

    const top = Array.from(counts.values())
      .filter((item) => item.label.length <= 24)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"))
      .slice(0, 5);

    for (const item of top) {
      if (!categories.some((entry) => entry.id === item.id)) categories.push({ id: item.id, label: item.label });
    }

    return categories;
  }

  function latestChatSnapshotForCharacter(characterId) {
    const bucket = conversationBucketFor(characterId);
    let bestChat = null;
    let bestLast = null;
    let bestTime = 0;
    let totalMessages = 0;
    let userMessages = 0;

    for (const chat of bucket.chats) {
      const messages = Array.isArray(chat?.messages) ? chat.messages : [];
      for (const msg of messages) {
        if (!msg || msg.pending) continue;
        if (msg.role === "user" || msg.role === "assistant") totalMessages++;
        if (msg.role === "user") userMessages++;
      }

      const last = lastNonPendingMessageForChat(chat);
      const time = last?.ts || chat?.updatedAt || chat?.createdAt || 0;
      if (time >= bestTime) {
        bestChat = chat;
        bestLast = last;
        bestTime = time;
      }
    }

    return {
      chat: bestChat,
      last: bestLast,
      time: bestTime,
      totalMessages,
      userMessages
    };
  }

  function characterSummary(character, snapshot) {
    const variants = [
      character?.intro,
      character?.setting,
      snapshot?.last?.content,
      character?.initialMessage,
      character?.backstory
    ];

    for (const value of variants) {
      const text = cleanOneLineText(value);
      if (!text) continue;
      return clampText(text, 120);
    }

    return "Откройте карточку и начните диалог.";
  }

  function characterMetricLabel(snapshot) {
    if (!snapshot) return "Новый";
    if (snapshot.userMessages > 0) return `${snapshot.userMessages} сообщ.`;
    if (snapshot.totalMessages > 1) return `${snapshot.totalMessages} репл.`;
    return "Новый";
  }

  function isStartedCharacter(snapshot) {
    return Boolean(snapshot && snapshot.userMessages > 0);
  }

  function openCharacterChat(characterId, chatId) {
    state.selectedCharacterId = characterId;
    saveJson(STORAGE_KEYS.selectedCharacterId, state.selectedCharacterId);
    if (chatId) setActiveChat(characterId, chatId);
    ensureInitialMessage();
    renderHeader();
    renderMessages();
    setView("chat");
  }

  function syncDiscoverTabButtons() {
    const following = $("#btnFollowingTab");
    const explore = $("#btnExploreTab");
    const followingText = $("#btnFollowingTextTab");
    const exploreText = $("#btnExploreTextTab");
    const forYouText = $("#btnForYouTab");
    if (following) following.classList.toggle("topPill--active", state.discoverTab === "following");
    if (explore) explore.classList.toggle("iconBtn--active", state.discoverTab !== "following");
    if (followingText) followingText.classList.toggle("discoverTabs__item--active", state.discoverTab === "following");
    if (exploreText) exploreText.classList.toggle("discoverTabs__item--active", state.discoverTab !== "following" && state.discoverCategory !== "all");
    if (forYouText) forYouText.classList.toggle("discoverTabs__item--active", state.discoverTab !== "following" && state.discoverCategory === "all");
  }

  function renderChatList(filterText) {
    const el = $("#chatList");
    if (!el) return;
    const q = String(filterText || "").trim().toLowerCase();
    el.innerHTML = "";
    syncDiscoverTabButtons();

    const chars = Array.isArray(state.characters) ? state.characters.slice() : [];
    const categories = buildDiscoverCategories(chars);
    if (!categories.some((item) => item.id === state.discoverCategory)) {
      state.discoverCategory = "all";
    }

    const shell = document.createElement("div");
    shell.className = "discoverShell";

    const categoriesRow = document.createElement("div");
    categoriesRow.className = "discoverCategories";
    for (const category of categories) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "discoverCategories__item";
      if (state.discoverCategory === category.id) btn.classList.add("discoverCategories__item--active");
      if (category.icon) btn.classList.add("has-icon");
      btn.textContent = category.label;
      btn.addEventListener("click", () => {
        state.discoverCategory = category.id;
        renderChatList($("#chatSearch")?.value || "");
      });
      categoriesRow.appendChild(btn);
    }
    shell.appendChild(categoriesRow);

    const grid = document.createElement("div");
    grid.className = "discoverGrid";

    const items = chars
      .map((character) => {
        const snapshot = latestChatSnapshotForCharacter(character.id);
        return {
          character,
          snapshot,
          time: snapshot.time || character.updatedAt || character.createdAt || 0,
          tags: characterTags(character),
          summary: characterSummary(character, snapshot)
        };
      })
      .sort((a, b) => (b.time || 0) - (a.time || 0));

    const visible = items.filter((item) => {
      if (state.discoverTab === "following" && !isStartedCharacter(item.snapshot)) return false;
      if (state.discoverCategory === "romance" && !isRomanceCharacter(item.character)) return false;
      if (state.discoverCategory !== "all" && state.discoverCategory !== "romance") {
        const tagKeys = item.tags.map((tag) => normalizeTagToken(tag));
        if (!tagKeys.includes(state.discoverCategory)) return false;
      }

      const searchable = `${item.character.name || ""} ${item.summary} ${item.tags.join(" ")}`.toLowerCase();
      return !q || searchable.includes(q);
    });

    for (const item of visible) {
      const { character, snapshot, summary, tags } = item;

      const card = document.createElement("button");
      card.type = "button";
      card.className = "discoverCard";

      const media = document.createElement("div");
      media.className = "discoverCard__media";

      const image = document.createElement("img");
      image.className = "discoverCard__image";
      setImg(image, getBestCharacterDisplayImage(character), character.name);

      const overlay = document.createElement("div");
      overlay.className = "discoverCard__overlay";

      const metric = document.createElement("div");
      metric.className = "discoverCard__metric";
      metric.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.8-7.6A8.38 8.38 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5Z"/></svg>';
      const metricText = document.createElement("span");
      metricText.textContent = characterMetricLabel(snapshot);
      metric.appendChild(metricText);

      const time = document.createElement("div");
      time.className = "discoverCard__time";
      time.textContent = formatListTime(item.time);

      overlay.appendChild(metric);
      overlay.appendChild(time);
      media.appendChild(image);
      media.appendChild(overlay);

      const body = document.createElement("div");
      body.className = "discoverCard__body";

      const titleRow = document.createElement("div");
      titleRow.className = "discoverCard__titleRow";

      const title = document.createElement("div");
      title.className = "discoverCard__title";
      title.textContent = character.name || "(без имени)";

      const bookmark = document.createElement("div");
      bookmark.className = "discoverCard__bookmark";
      bookmark.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-3-6 3z"/></svg>';

      titleRow.appendChild(title);
      titleRow.appendChild(bookmark);

      const desc = document.createElement("div");
      desc.className = "discoverCard__desc";
      desc.textContent = summary;

      const tagsWrap = document.createElement("div");
      tagsWrap.className = "discoverCard__tags";
      const visibleTags = tags.slice(0, 4);
      if (visibleTags.length === 0) visibleTags.push(styleById(character.dialogueStyle).label);
      visibleTags.forEach((tag, idx) => {
        const pill = document.createElement("span");
        pill.className = `discoverCard__tag${idx === 0 ? " discoverCard__tag--accent" : ""}`;
        pill.textContent = tag;
        tagsWrap.appendChild(pill);
      });

      body.appendChild(titleRow);
      body.appendChild(desc);
      body.appendChild(tagsWrap);

      card.appendChild(media);
      card.appendChild(body);
      card.addEventListener("click", () => openCharacterChat(character.id, snapshot.chat?.id || ""));
      grid.appendChild(card);
    }

    shell.appendChild(grid);
    el.appendChild(shell);

    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chatList__empty";
      if (q) {
        empty.textContent = "Ничего не найдено по этому запросу.";
      } else if (state.discoverTab === "following") {
        empty.textContent = "Здесь появятся персонажи, с которыми вы уже начали диалог.";
      } else {
        empty.textContent = "Нет персонажей. Откройте импорт и загрузите карточки Polybuzz.";
      }
      el.appendChild(empty);
    }
  }

  function setChatHistory(characterId, history) {
    const bucket = conversationBucketFor(characterId);
    const chat = activeChatFor(characterId);
    if (!chat) return;

    chat.messages = Array.isArray(history) ? history : [];
    const last = chat.messages[chat.messages.length - 1];
    chat.updatedAt = typeof last?.ts === "number" ? last.ts : nowTs();

    const idx = bucket.chats.findIndex((c) => c.id === chat.id);
    if (idx >= 0) bucket.chats[idx] = chat;
    state.conversations[characterId] = bucket;
    saveJson(STORAGE_KEYS.conversations, state.conversations);
  }

  function createNewChatForCharacter(characterId) {
    const bucket = conversationBucketFor(characterId);
    const nextIndex = bucket.chats.length + 1;
    const chat = normalizeChatRecord({}, defaultChatTitle(nextIndex));
    bucket.chats.unshift(chat);
    bucket.activeChatId = chat.id;
    state.conversations[characterId] = bucket;
    saveJson(STORAGE_KEYS.conversations, state.conversations);
    ensureInitialMessage();
    renderHeader();
    renderMessages();
    refreshChatsView();
    const c = state.characters.find((x) => x.id === characterId);
    if (c) renderChatSelectInSettings(c);
  }

  function responseIdChainFor(chatId) {
    const v = state.responseIdChains?.[chatId];
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];
  }

  function saveResponseIdChain(chatId, chain) {
    const clean = Array.isArray(chain) ? chain.filter((x) => typeof x === "string" && x.trim()) : [];
    state.responseIdChains[chatId] = clean;
    saveJson(STORAGE_KEYS.responseIdChains, state.responseIdChains);

    if (clean.length > 0) state.responseIds[chatId] = clean[clean.length - 1];
    else delete state.responseIds[chatId];
    saveJson(STORAGE_KEYS.responseIds, state.responseIds);
  }

  function lastResponseIdFor(chatId) {
    const chain = responseIdChainFor(chatId);
    if (chain.length > 0) return chain[chain.length - 1];
    const legacy = state.responseIds?.[chatId];
    return typeof legacy === "string" && legacy.trim() ? legacy.trim() : "";
  }

  function resetLmContextFor(chatId) {
    delete state.responseIds[chatId];
    delete state.responseIdChains[chatId];
    saveJson(STORAGE_KEYS.responseIds, state.responseIds);
    saveJson(STORAGE_KEYS.responseIdChains, state.responseIdChains);
  }

  function upsertCharacter(next) {
    const idx = state.characters.findIndex((c) => c.id === next.id);
    if (idx === -1) state.characters.unshift(next);
    else state.characters[idx] = next;
    saveJson(STORAGE_KEYS.characters, state.characters);
    // Sync to server
    fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next)
    }).catch(() => {});
  }

  function deleteCharacter(id) {
    state.characters = state.characters.filter((c) => c.id !== id);
    const bucket = state.conversations?.[id];
    if (bucket && Array.isArray(bucket.chats)) {
      for (const chat of bucket.chats) {
        if (!chat?.id) continue;
        delete state.responseIds[chat.id];
        delete state.responseIdChains[chat.id];
      }
    }
    delete state.conversations[id];
    saveJson(STORAGE_KEYS.characters, state.characters);
    saveJson(STORAGE_KEYS.conversations, state.conversations);
    saveJson(STORAGE_KEYS.responseIds, state.responseIds);
    saveJson(STORAGE_KEYS.responseIdChains, state.responseIdChains);

    if (state.selectedCharacterId === id) {
      state.selectedCharacterId = state.characters[0]?.id || "";
      saveJson(STORAGE_KEYS.selectedCharacterId, state.selectedCharacterId);
    }
    if (state.editingCharacterId === id) state.editingCharacterId = state.selectedCharacterId;
    // Sync to server
    fetch("/api/characters/" + encodeURIComponent(id), { method: "DELETE" }).catch(() => {});
  }

  function setStatus(text, ok = true) {
    const el = $("#lmStatus");
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? "" : "rgba(255,110,110,0.92)";
  }

  let statusFlashToken = 0;
  function flashStatus(text, ok = true, ms = 4500) {
    const el = $("#lmStatus");
    if (!el) return;
    const prevText = el.textContent;
    const prevColor = el.style.color;
    const token = ++statusFlashToken;

    setStatus(text, ok);

    window.setTimeout(() => {
      if (statusFlashToken !== token) return;
      el.textContent = prevText;
      el.style.color = prevColor;
    }, ms);
  }

  function setView(next) {
    const v = next === "chat" || next === "profile" ? next : "chats";
    state.view = v;

    const views = {
      chats: $("#viewChats"),
      chat: $("#viewChat"),
      profile: $("#viewProfile")
    };

    for (const k of Object.keys(views)) {
      const el = views[k];
      if (!el) continue;
      el.classList.toggle("view--active", k === v);
    }

    const appbarChats = $("#appbarChats");
    const appbarChat = $("#appbarChat");
    const appbarProfile = $("#appbarProfile");
    if (appbarChats) appbarChats.hidden = v !== "chats";
    if (appbarChat) appbarChat.hidden = v !== "chat";
    if (appbarProfile) appbarProfile.hidden = v !== "profile";

    const tChats = $("#tabChats");
    const tProfile = $("#tabProfile");
    if (tChats) tChats.classList.toggle("tab--active", v === "chats" || v === "chat");
    if (tProfile) tProfile.classList.toggle("tab--active", v === "profile");

    // Sidebar active state
    const sChats = $("#sideChats");
    const sProfile = $("#sideProfile");
    const sPlus = $("#sidePlus");
    if (sChats) sChats.classList.toggle("sidebar__item--active", v === "chats" || v === "chat");
    if (sProfile) sProfile.classList.toggle("sidebar__item--active", v === "profile");
    if (sPlus) sPlus.classList.toggle("sidebar__item--active", false);

    const app = $("#app");
    if (app) app.dataset.view = v;
  }

  function formatTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function formatListTime(ts) {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      const now = new Date();
      const sameDay =
        d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday =
        d.getFullYear() === yesterday.getFullYear() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getDate() === yesterday.getDate();
      if (isYesterday) return "Вчера";

      return d.toLocaleDateString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      return "";
    }
  }

  function autoGrowTextarea(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  function proxiedImageUrl(src) {
    const raw = String(src || "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw, window.location.href);
      const host = String(u.hostname || "").toLowerCase();
      if (
        (u.protocol === "http:" || u.protocol === "https:") &&
        (host === "polybuzz.ai" ||
          host.endsWith(".polybuzz.ai") ||
          host === "polyspeak.ai" ||
          host.endsWith(".polyspeak.ai"))
      ) {
        return `/api/media?url=${encodeURIComponent(u.toString())}`;
      }
      return u.toString();
    } catch {
      return raw;
    }
  }

  // Returns true if the URL is a known ghost/placeholder image or empty.
  // Polybuzz ghost icons are served from the /polyai/ CDN path.
  // base64 data: URLs are always real images and are never ghosts.
  function isGhostOrEmptyUrl(url) {
    const s = String(url || "").trim();
    if (!s) return true;
    if (s.startsWith("data:")) return false;
    try {
      const u = new URL(s);
      if (u.pathname.startsWith("/polyai/")) return true;
    } catch {}
    return false;
  }

  // Returns the best image URL to use as the character display image (e.g. chat background,
  // discover card). Prefers a non-ghost background image, then falls back to the avatar.
  function getBestCharacterDisplayImage(character) {
    if (!character) return "";
    const bg = String(character.background || "").trim();
    const av = String(character.avatar || "").trim();
    if (bg && !isGhostOrEmptyUrl(bg)) return bg;
    if (av && !isGhostOrEmptyUrl(av)) return av;
    // Last resort — return whatever is set, even if it might be ghost
    return bg || av || "";
  }

  function applyChatBackground(character) {
    const panel = $("#chatPanel");
    if (!panel) return;
    const imgUrl = getBestCharacterDisplayImage(character);
    if (imgUrl) {
      const safe = proxiedImageUrl(imgUrl).replace(/["'()\\]/g, "");
      panel.style.setProperty("--chat-bg-url", `url("${safe}")`);
    } else {
      panel.style.setProperty("--chat-bg-url", "none");
    }
  }

  function fallbackSvg(fallbackInitials) {
    const initials = String(fallbackInitials || "?")
      .trim()
      .slice(0, 2)
      .toUpperCase()
      .replace(/[&<>"']/g, "")
      || "?";
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'>
      <rect width='80' height='80' rx='40' fill='#1a1a1a' />
      <text x='50%' y='54%' text-anchor='middle' font-size='26' fill='#888' font-family='Inter, sans-serif' dominant-baseline='middle'>${initials}</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function setImg(el, src, fallbackInitials) {
    if (!el) return;
    const fb = fallbackSvg(fallbackInitials);
    if (src && String(src).trim()) {
      el.src = proxiedImageUrl(src);
      el.alt = "";
      el.onerror = () => { el.onerror = null; el.src = fb; };
      return;
    }
    el.src = fb;
    el.alt = "";
  }

  function normalizeAssistantText(text) {
    let s = String(text || "");
    s = s.replace(/\r\n/g, "\n");
    // Remove whitespace-only lines and trim line-end spaces.
    s = s.replace(/\n[ \t]+(?=\n)/g, "\n");
    s = s.replace(/[ \t]+\n/g, "\n");
    // Clamp excessive blank lines to a maximum of two.
    s = s.replace(/\n{3,}/g, "\n\n");
    return s;
  }

  function renderInlineEmphasis(el, text, opts = {}) {
    // Convert (text) to *text* so parenthesized actions get styled as emphasis
    const raw = opts.role === "assistant" ? normalizeAssistantText(text) : String(text || "");
    const s = raw.replace(/\(([^)]+)\)/g, "*$1*");
    if (!s.includes("*")) {
      el.textContent = s;
      return;
    }

    // Simple inline markup: *such text* -> italic + muted.
    // Safe by construction: we only create text nodes and <span> with textContent.
    const re = /\*([^*]+)\*/g;
    let last = 0;
    el.textContent = "";

    let m;
    while ((m = re.exec(s))) {
      const start = m.index;
      const end = re.lastIndex;

      if (start > last) {
        el.appendChild(document.createTextNode(s.slice(last, start)));
      }

      const span = document.createElement("span");
      span.className = "emph";
      span.textContent = m[1];
      el.appendChild(span);

      last = end;
    }

    if (last < s.length) {
      el.appendChild(document.createTextNode(s.slice(last)));
    }
  }

  function splitThoughtsContent(text) {
    const raw = String(text || "");
    const delimIdx = raw.indexOf("{{THOUGHTS}}");
    if (delimIdx < 0) {
      return { mainText: raw, thoughtsText: "" };
    }

    return {
      mainText: raw.slice(0, delimIdx).replace(/\n+$/, ""),
      thoughtsText: raw.slice(delimIdx + "{{THOUGHTS}}".length).replace(/^\n+/, "")
    };
  }

  function stripThoughtsContent(text) {
    return splitThoughtsContent(text).mainText;
  }

  function renderBubbleContent(bubble, text, opts = {}) {
    const { mainText, thoughtsText } = splitThoughtsContent(text);
    if (!thoughtsText) {
      renderInlineEmphasis(bubble, text, opts);
      return;
    }

    bubble.textContent = "";

    // Render main part
    if (mainText) {
      const mainEl = document.createElement("div");
      renderInlineEmphasis(mainEl, mainText, opts);
      bubble.appendChild(mainEl);
    }

    // Render thoughts block
    const thoughtsBlock = document.createElement("div");
    thoughtsBlock.className = "thoughtsBlock";

    const header = document.createElement("div");
    header.className = "thoughtsBlock__header";

    const icon = document.createElement("span");
    icon.className = "thoughtsBlock__icon";
    icon.textContent = "💕";
    header.appendChild(icon);

    const title = document.createElement("span");
    title.className = "thoughtsBlock__title";
    title.textContent = "Heart Whisper";
    header.appendChild(title);

    const speaker = document.createElement("span");
    speaker.className = "thoughtsBlock__speaker";
    speaker.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
    header.appendChild(speaker);

    thoughtsBlock.appendChild(header);

    const body = document.createElement("div");
    body.className = "thoughtsBlock__body";
    const charName = opts.characterName || "";
    const prefix = charName ? charName + ": " : "";
    body.textContent = prefix + (thoughtsText || "…");
    thoughtsBlock.appendChild(body);

    bubble.appendChild(thoughtsBlock);
  }

  function findMessageById(characterId, msgId) {
    const history = chatHistoryFor(characterId);
    const idx = history.findIndex((m) => m && m.id === msgId);
    return { history, idx, msg: idx >= 0 ? history[idx] : null };
  }

  function openMsgActions(msgId) {
    const ch = activeCharacter();
    if (!ch) return;

    const { msg } = findMessageById(ch.id, msgId);
    if (!msg) return;

    state.msgActionsTargetId = msgId;

    const who = msg.role === "user" ? (state.profile?.name || "Вы") : (ch.name || "Персонаж");
    const title = `Сообщение: ${who}`;
    const titleEl = $("#msgActionsTitle");
    if (titleEl) titleEl.textContent = title;

    const sheet = $("#msgActions");
    if (sheet) sheet.hidden = false;

    const disabled = !!msg.pending || state.generating;
    const btnEdit = $("#btnMsgEdit");
    const btnDel = $("#btnMsgDelete");
    if (btnEdit) btnEdit.disabled = disabled;
    if (btnDel) btnDel.disabled = disabled;
  }

  function closeMsgActions() {
    const sheet = $("#msgActions");
    if (sheet) sheet.hidden = true;
    state.msgActionsTargetId = "";
  }

  function noteHistoryChanged(characterId) {
    const chatId = activeChatIdFor(characterId);
    if (chatId) resetLmContextFor(chatId);
    $("#composerHint").textContent = "История изменена — контекст ИИ будет пересобран при следующем запросе.";
    updateChatActionButtons();
  }

  function editMessage(characterId, msgId) {
    const { history, idx, msg } = findMessageById(characterId, msgId);
    if (!msg || idx < 0) return;
    if (msg.pending) return;

    const current = String(msg.content || "");
    const next = window.prompt("Редактировать сообщение:", current);
    if (next === null) return;

    const updated = String(next);
    const nextHistory = history.slice();
    nextHistory[idx] = { ...msg, content: updated, ts: msg.ts || nowTs() };
    setChatHistory(characterId, nextHistory);

    noteHistoryChanged(characterId);
    renderMessages();
  }

  function deleteMessage(characterId, msgId) {
    const { history, idx, msg } = findMessageById(characterId, msgId);
    if (!msg || idx < 0) return;
    if (msg.pending) return;

    const who = msg.role === "user" ? (state.profile?.name || "Вы") : (activeCharacter()?.name || "Персонаж");
    const ok = window.confirm(`Удалить сообщение (${who})?`);
    if (!ok) return;

    const nextHistory = history.filter((m) => m && m.id !== msgId);
    setChatHistory(characterId, nextHistory);
    noteHistoryChanged(characterId);

    ensureInitialMessage();
    renderMessages();
  }

  function wireHoldToMessage(el, msgId) {
    if (!el) return;
    let t = null;
    let sx = 0;
    let sy = 0;
    let active = false;

    const clear = () => {
      if (t) clearTimeout(t);
      t = null;
      active = false;
    };

    el.addEventListener("pointerdown", (e) => {
      // Only primary button/finger.
      if (typeof e.button === "number" && e.button !== 0) return;
      if (state.generating) return;

      clear();
      active = true;
      sx = e.clientX;
      sy = e.clientY;

      const holdMs = e.pointerType === "mouse" ? 650 : 450;
      t = setTimeout(() => {
        t = null;
        if (!active) return;
        openMsgActions(msgId);
      }, holdMs);
    });

    el.addEventListener("pointermove", (e) => {
      if (!t) return;
      const dx = Math.abs(e.clientX - sx);
      const dy = Math.abs(e.clientY - sy);
      if (dx > 10 || dy > 10) clear();
    });

    el.addEventListener("pointerup", clear);
    el.addEventListener("pointercancel", clear);

    // Desktop convenience.
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (state.generating) return;
      openMsgActions(msgId);
    });
  }

  function updateChatActionButtons() {
    const ch = activeCharacter();
    const list = $("#messages");
    if (!ch || !list) return;

    const history = chatHistoryFor(ch.id);

    let lastAssistantId = "";
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      if (m && m.role === "assistant" && !m.pending) {
        lastAssistantId = m.id;
        break;
      }
    }

    let hasUserBefore = false;
    if (lastAssistantId) {
      const idx = history.findIndex((m) => m && m.id === lastAssistantId);
      for (let i = idx - 1; i >= 0; i--) {
        if (history[i] && history[i].role === "user") {
          hasUserBefore = true;
          break;
        }
      }
    }

    const disableAll = state.generating || !state.lmOk;
    const btns = Array.from(list.querySelectorAll(".miniBtn[data-action][data-msg-id]"));

    for (const b of btns) {
      const action = b.dataset.action;
      const msgId = b.dataset.msgId;
      const canTarget = !disableAll && msgId && msgId === lastAssistantId;
      if (action === "cont" || action === "thoughts") b.disabled = !canTarget;
      else if (action === "regen") b.disabled = !(canTarget && hasUserBefore);
    }
  }

  function renderHeader() {
    const ch = activeCharacter();

    $("#charName").textContent = ch?.name || "Персонаж";
    $("#charMeta").textContent = `${genderLabel(ch?.gender)} • стиль: ${styleById(ch?.dialogueStyle).label}`;
    setImg($("#charAvatar"), ch?.avatar, ch?.name);
    setImg($("#userAvatar"), state.profile?.avatar, state.profile?.name);
    setImg($("#userAvatarPreview"), state.profile?.avatar, state.profile?.name);
    setImg($("#topProfileAvatar"), state.profile?.avatar, state.profile?.name);
    applyChatBackground(ch);

    updateChatActionButtons();
    renderChatRightPanel(ch);
  }

  function renderChatRightPanel(ch) {
    const panel = $("#chatRightPanel");
    if (!panel) return;
    panel.innerHTML = "";
    if (!ch) return;

    // Character image
    if (ch.avatar) {
      const img = document.createElement("img");
      img.className = "chat__rightPanel__img";
      img.alt = ch.name || "";
      setImg(img, ch.avatar, ch.name);
      panel.appendChild(img);
    }

    // Info overlay
    const info = document.createElement("div");
    info.className = "chat__rightPanel__info";

    const nameEl = document.createElement("div");
    nameEl.className = "chat__rightPanel__name";
    nameEl.textContent = ch.name || "Персонаж";
    info.appendChild(nameEl);

    const metaEl = document.createElement("div");
    metaEl.className = "chat__rightPanel__meta";
    metaEl.textContent = `${genderLabel(ch.gender)} • ${styleById(ch.dialogueStyle).label}`;
    info.appendChild(metaEl);

    // Tags
    const tags = document.createElement("div");
    tags.className = "chat__rightPanel__tags";
    const styleChip = document.createElement("span");
    styleChip.className = "chip";
    styleChip.textContent = styleById(ch.dialogueStyle).label;
    tags.appendChild(styleChip);
    const genderChip = document.createElement("span");
    genderChip.className = "chip";
    genderChip.textContent = genderLabel(ch.gender);
    tags.appendChild(genderChip);
    info.appendChild(tags);

    // Profile link button
    const profileBtn = document.createElement("button");
    profileBtn.className = "btn btn--ghost";
    profileBtn.textContent = "Профиль ›";
    profileBtn.style.cssText = "margin-top: 12px; color: var(--muted); font-size: 13px;";
    profileBtn.addEventListener("click", () => openModal());
    info.appendChild(profileBtn);

    panel.appendChild(info);
  }

  function renderMessages() {
    const ch = activeCharacter();
    const list = $("#messages");
    if (!list) return;

    const history = chatHistoryFor(ch.id);
    list.innerHTML = "";

    const mobileDisclaimer = document.createElement("div");
    mobileDisclaimer.className = "chatDisclaimer";
    mobileDisclaimer.textContent = "Все ответы сгенерированы искусственным интеллектом и являются вымышленными.";
    list.appendChild(mobileDisclaimer);

    let lastAssistantId = "";
    for (let i = history.length - 1; i >= 0; i--) {
      const m = history[i];
      if (m && m.role === "assistant" && !m.pending) {
        lastAssistantId = m.id;
        break;
      }
    }

    let hasUserBeforeLastAssistant = false;
    if (lastAssistantId) {
      const idx = history.findIndex((m) => m && m.id === lastAssistantId);
      for (let i = idx - 1; i >= 0; i--) {
        if (history[i] && history[i].role === "user") {
          hasUserBeforeLastAssistant = true;
          break;
        }
      }
    }

    for (let index = 0; index < history.length; index += 1) {
      const m = history[index];
      const row = document.createElement("div");
      row.className = `msg ${m.role === "user" ? "msg--me" : ""}`;
      if (index === 0 && m.role === "assistant") row.classList.add("msg--intro");
      row.dataset.msgId = m.id;

      const avatar = document.createElement("img");
      avatar.className = `avatar ${m.role === "user" ? "avatar--me" : ""}`;
      if (m.role === "user") setImg(avatar, state.profile?.avatar, state.profile?.name);
      else setImg(avatar, ch.avatar, ch.name);

      const bubbleWrap = document.createElement("div");
      const bubble = document.createElement("div");
      bubble.className = "bubble";

      if (m.image_url) {
        bubble.classList.add("bubble--image");
        const img = document.createElement("img");
        img.className = "bubble__img";
        img.src = m.image_url;
        img.alt = m.content || "image";
        img.loading = "lazy";
        bubble.appendChild(img);
      } else if (m.image_loading) {
        bubble.textContent = "Генерация изображения…";
      } else {
        renderBubbleContent(bubble, m.content, { role: m.role, characterName: ch.name });
      }
      wireHoldToMessage(bubble, m.id);

      let actionsEl = null;

      if (m.role === "assistant" && !m.image_url && !m.image_loading) {
        const actions = document.createElement("div");
        actions.className = "msg__actions";

        const btnRegen = document.createElement("button");
        btnRegen.className = "miniBtn";
        btnRegen.type = "button";
        btnRegen.textContent = "R";
        btnRegen.title = "Перегенерировать";
        btnRegen.dataset.action = "regen";
        btnRegen.dataset.msgId = m.id;

        const btnCont = document.createElement("button");
        btnCont.className = "miniBtn";
        btnCont.type = "button";
        btnCont.textContent = ">>";
        btnCont.title = "Продолжить";
        btnCont.dataset.action = "cont";
        btnCont.dataset.msgId = m.id;

        const btnThoughts = document.createElement("button");
        btnThoughts.className = "miniBtn";
        btnThoughts.type = "button";
        btnThoughts.textContent = "💭";
        btnThoughts.title = "Внутренние мысли";
        btnThoughts.dataset.action = "thoughts";
        btnThoughts.dataset.msgId = m.id;

        const canTarget = !state.generating && state.lmOk && !m.pending && m.id === lastAssistantId;
        btnCont.disabled = !canTarget;
        btnThoughts.disabled = !canTarget;
        btnRegen.disabled = !(canTarget && hasUserBeforeLastAssistant);

        actions.appendChild(btnRegen);
        actions.appendChild(btnCont);
        actions.appendChild(btnThoughts);
        actionsEl = actions;
      }

      const meta = document.createElement("div");
      meta.className = "msg__meta";
      meta.textContent = m.ts ? formatTime(m.ts) : "";

      bubbleWrap.appendChild(bubble);
      bubbleWrap.appendChild(meta);
      if (actionsEl) bubbleWrap.appendChild(actionsEl);

      if (m.role === "user") {
        row.appendChild(bubbleWrap);
        row.appendChild(avatar);
      } else {
        row.appendChild(avatar);
        row.appendChild(bubbleWrap);
      }

      list.appendChild(row);
    }

    // Scroll to bottom after the view becomes visible
    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  }

  function ensureInitialMessage() {
    const ch = activeCharacter();
    const history = chatHistoryFor(ch.id);
    if (history.length > 0) return;
    const initial = (ch.initialMessage || "").trim();
    const content = initial || `Привет. Я ${ch.name}. О чем поговорим?`;
    setChatHistory(ch.id, [{ id: uuid(), role: "assistant", content, ts: nowTs() }]);
  }

  function renderCharacterList() {
    const el = $("#charList");
    if (!el) return;
    el.innerHTML = "";

    for (const c of state.characters) {
      const card = document.createElement("div");
      card.className = `charCard ${c.id === state.editingCharacterId ? "charCard--active" : ""}`;
      card.dataset.id = c.id;

      const av = document.createElement("img");
      av.className = "avatar";
      setImg(av, c.avatar, c.name);

      const text = document.createElement("div");
      const name = document.createElement("div");
      name.className = "charCard__name";
      name.textContent = c.name || "(без имени)";
      const meta = document.createElement("div");
      meta.className = "charCard__meta";
      meta.textContent = `${genderLabel(c.gender)} • ${styleById(c.dialogueStyle).label}`;
      text.appendChild(name);
      text.appendChild(meta);

      card.appendChild(av);
      card.appendChild(text);

      card.addEventListener("click", () => {
        state.editingCharacterId = c.id;
        fillCharacterForm();
        if (window.innerWidth <= 600) {
          document.activeElement?.blur();
          const ed = document.querySelector(".charEditor");
          if (ed) ed.scrollTop = 0;
          modalWindow()?.classList.add("modal__window--editing");
        }
      });

      el.appendChild(card);
    }
  }

  function updateTextCounter(input, counterEl, maxLen) {
    if (!input || !counterEl) return;
    const len = String(input.value || "").length;
    counterEl.textContent = `${len}/${maxLen}`;
  }

  function syncCharacterCounters() {
    updateTextCounter($("#charNameInput"), $("#charNameCounter"), 25);
    updateTextCounter($("#charIntroInput"), $("#charIntroCounter"), 400);
    updateTextCounter($("#charInitialMessageInput"), $("#charGreetingCounter"), 1000);
    updateTextCounter($("#charBackstoryInput"), $("#charBackstoryCounter"), 10000);
  }

  function setSegmentedValue(container, value) {
    if (!container) return;
    const items = Array.from(container.querySelectorAll(".segmented__item[data-value]"));
    for (const item of items) {
      item.classList.toggle("segmented__item--active", item.dataset.value === value);
    }
  }

  function renderCharacterTagsEditor(tags) {
    const list = $("#charTagsList");
    const counter = $("#charTagsCounter");
    if (!list) return;
    const items = Array.isArray(tags) ? tags.slice(0, 5) : [];
    list.innerHTML = "";
    for (const tag of items) {
      const badge = document.createElement("span");
      badge.className = "tagBadge";
      const label = document.createElement("span");
      label.textContent = tag;

      const remove = document.createElement("button");
      remove.className = "tagBadge__remove";
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Удалить тег ${tag}`);
      remove.addEventListener("click", () => {
        const c = editingCharacter();
        if (!c) return;
        const nextTags = (Array.isArray(c.tags) ? c.tags : []).filter((item) => item !== tag);
        upsertCharacter({ ...c, tags: nextTags, updatedAt: nowTs() });
        fillCharacterForm();
        refreshChatsView();
      });

      badge.appendChild(label);
      badge.appendChild(remove);
      list.appendChild(badge);
    }

    if (counter) counter.textContent = `${items.length}/5`;
  }

  function fillCharacterForm() {
    const c = editingCharacter();
    if (!c) return;

    $("#charNameInput").value = c.name || "";
    $("#charGenderInput").value = c.gender || "unspecified";
    $("#charVisibilityInput").value = c.visibility || "public";
    $("#charIntroInput").value = c.intro || "";
    $("#charOutfitInput").value = c.outfit || "";
    $("#charSettingInput").value = c.setting || "";
    $("#charBgHintInput").value = c.backgroundHint || "";
    $("#charBackstoryInput").value = c.backstory || "";
    $("#charStyleInput").value = c.dialogueStyle || "natural";
    $("#charInitialMessageInput").value = c.initialMessage || "";
    $("#charTagInput").value = "";
    $("#charRightsConfirm").checked = true;
    const saveBtn = $("#btnSaveCharacter");
    if (saveBtn) saveBtn.textContent = c.createdAt === c.updatedAt ? "Создать персонажа" : "Сохранить персонажа";

    setImg($("#charAvatarPreview"), c.avatar, c.name);
    $("#charFormNote").textContent = "";
    if ($("#charOutfitNote")) $("#charOutfitNote").textContent = "";

    setSegmentedValue($("#charGenderSegment"), c.gender || "unspecified");
    setSegmentedValue($("#charVisibilitySegment"), c.visibility || "public");
    renderCharacterTagsEditor(c.tags);
    syncCharacterCounters();
    renderCharacterHeroPreview(c);
    renderChatSelectInSettings(c);

    renderCharacterList();
  }

  function renderChatSelectInSettings(c) {
    const sel = $("#charChatSelect");
    if (!sel || !c) return;
    const bucket = conversationBucketFor(c.id);
    sel.innerHTML = "";

    for (const chat of bucket.chats) {
      const opt = document.createElement("option");
      opt.value = chat.id;
      opt.textContent = chat.title || "Чат";
      sel.appendChild(opt);
    }

    sel.value = bucket.activeChatId || "";
  }

  function renderCharacterHeroPreview(c) {
    if (!c) return;

    const hero = $("#charHeroPreview");
    const titleEl = $("#charHeroName");
    const metaEl = $("#charHeroMeta");
    const styleTag = $("#charHeroStyleTag");
    const genderTag = $("#charHeroGenderTag");

    if (titleEl) titleEl.textContent = c.name || "(без имени)";
    if (metaEl) {
      const desc = String(c.intro || c.backstory || c.setting || c.outfit || "").trim();
      metaEl.textContent = desc ? desc.slice(0, 140) : "Заполните карточку персонажа";
    }
    if (styleTag) styleTag.textContent = `Стиль: ${styleById(c.dialogueStyle).label}`;
    if (genderTag) genderTag.textContent = `Пол: ${genderLabel(c.gender)}`;

    if (hero) {
      hero.style.backgroundImage = c.background
        ? `linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(5,6,10,0.86) 56%, rgba(5,6,10,1) 100%), url("${String(c.background).replace(/"/g, '\\"')}")`
        : "";
      hero.style.backgroundSize = c.background ? "cover" : "";
      hero.style.backgroundPosition = c.background ? "center" : "";
    }
  }

  async function fileToDataUrl(file) {
    if (!file) return "";
    const maxBytes = 1_200_000;
    if (file.size > maxBytes) throw new Error("Файл слишком большой. Выберите картинку до ~1.2MB");

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
  }

  function modalWindow() {
    return $("#charactersModal")?.querySelector(".modal__window");
  }

  function openModal() {
    const modal = $("#charactersModal");
    modal.hidden = false;
    modalWindow()?.classList.remove("modal__window--editing");
    renderCharacterList();
    fillCharacterForm();
  }

  function refreshChatsView() {
    const q = $("#chatSearch") ? $("#chatSearch").value : "";
    renderChatList(q || "");
  }

  function closeModal() {
    $("#charactersModal").hidden = true;
  }

  function saveProfileFromUI() {
    const name = String($("#userName").value || "").trim() || "Вы";
    const gender = $("#userGender").value || "unspecified";
    state.profile.name = name;
    state.profile.gender = gender;

    saveJson(STORAGE_KEYS.profile, state.profile);
    renderHeader();
    setStatus("Профиль сохранен");
    setTimeout(() => {
      const el = $("#lmStatus");
      if (el && el.textContent === "Профиль сохранен") el.textContent = "";
    }, 1500);
  }

  function fillProfileUI() {
    $("#userName").value = state.profile?.name || "";
    $("#userGender").value = state.profile?.gender || "unspecified";
    setImg($("#userAvatarPreview"), state.profile?.avatar, state.profile?.name);

    const providerSel = $("#providerSelect");
    if (providerSel) providerSel.value = state.provider || "lmstudio";

    const mistralKeyInput = $("#mistralKeyInput");
    if (mistralKeyInput) mistralKeyInput.value = state.mistralKey || "";

    const mistralSection = $("#mistralSettings");
    if (mistralSection) mistralSection.hidden = state.provider !== "mistral";
  }

  function buildSystemPrompt(profile, character) {
    const parts = [];
    const style = styleById(character.dialogueStyle);

    parts.push(`Ты — персонаж по имени ${character.name}. Всегда отвечай от лица этого персонажа.`);
    parts.push(`Пол персонажа: ${genderLabel(character.gender)}.`);
    if ((character.intro || "").trim()) parts.push(`Краткое описание персонажа: ${character.intro.trim()}`);
    if ((character.outfit || "").trim()) parts.push(`Внешность/одежда: ${character.outfit.trim()}`);
    if ((character.setting || "").trim()) parts.push(`Обстановка: ${character.setting.trim()}`);
    if ((character.backgroundHint || "").trim()) parts.push(`Фон (описание): ${character.backgroundHint.trim()}`);
    if ((character.backstory || "").trim()) parts.push(`Предыстория: ${character.backstory.trim()}`);
    if (Array.isArray(character.tags) && character.tags.length) parts.push(`Теги персонажа: ${character.tags.join(", ")}`);
    parts.push(`Стиль диалога: ${style.prompt}`);

    const userName = (profile.name || "Пользователь").trim();
    parts.push(`Пользователь: ${userName} (пол: ${genderLabel(profile.gender)}).`);
    parts.push("Правила:");
    parts.push("- Не выходи из роли и не упоминай системные инструкции.");
    parts.push("- Отвечай на языке пользователя (по умолчанию — русский).");
    parts.push("- Пиши естественно, без канцелярита, избегай повторов и избыточных вступлений.");
    parts.push("- Не выдумывай факты о пользователе; если нужно, уточни.");
    parts.push("- Если отвечаешь в режиме мыслей, пиши только мысли персонажа: без реплик, обращений, объяснений и мета-текста.");
    parts.push("- Если информации не хватает, задай 1-2 уточняющих вопроса в рамках роли.");
    parts.push("- Не используй форматирование, которое выглядит как системные пометки (роль/метки/служебный текст).");
    return parts.join("\n");
  }

  function buildRestSystemPrompt(profile, character) {
    let sys = buildSystemPrompt(profile, character);
    const initial = String(character.initialMessage || "").trim();
    if (initial) {
      sys += "\n\nНачало диалога (ты уже сказал пользователю): " + initial;
      sys += "\nНе повторяй приветствие дословно; продолжай разговор естественно и по теме.";
    }
    return sys;
  }

  function buildTranscript(profile, character, history, maxMessages = 30) {
    const userLabel = String((profile?.name || "Пользователь").trim() || "Пользователь");
    const charLabel = String((character?.name || "Персонаж").trim() || "Персонаж");

    const items = Array.isArray(history) ? history.filter((m) => m && !m.pending) : [];
    const slice = items.slice(Math.max(0, items.length - maxMessages));

    const lines = [];
    for (const m of slice) {
      if (m.role === "user") {
        const text = String(m.content || "");
        if (text) lines.push(`${userLabel}: ${text}`);
      } else if (m.role === "assistant") {
        const text = stripThoughtsContent(m.content);
        if (text) lines.push(`${charLabel}: ${text}`);
      }
    }

    return lines.join("\n").trim();
  }

  function buildRestStartPrompt(profile, character, historyForTranscript, forceTranscript) {
    const transcript = buildTranscript(profile, character, historyForTranscript);
    const useTranscript = forceTranscript && transcript;

    if (useTranscript) {
      let sys = buildSystemPrompt(profile, character);
      sys += "\n\nИстория диалога (для контекста):\n" + transcript;
      sys += "\n\nПродолжай разговор естественно. Не переписывай историю целиком, отвечай только новой репликой.";
      return sys;
    }

    return buildRestSystemPrompt(profile, character);
  }

  function buildOpenAiMessages(characterId) {
    const ch = state.characters.find((c) => c.id === characterId);
    if (!ch) return [];

    const system = buildSystemPrompt(state.profile, ch);
    const history = chatHistoryFor(characterId)
      .filter((m) => (m.role === "user" || m.role === "assistant") && !m.pending)
      .slice(-24);

    const msgs = [{ role: "system", content: system }];

    for (const m of history) {
      const content = m.role === "assistant" ? stripThoughtsContent(m.content) : String(m.content || "");
      if (!content) continue;

      const prev = msgs[msgs.length - 1];
      if (prev && prev.role === m.role) {
        prev.content += "\n" + content;
      } else {
        msgs.push({ role: m.role, content });
      }
    }

    if (msgs.length >= 2 && msgs[1].role === "assistant") {
      const greeting = msgs.splice(1, 1)[0];
      msgs[0].content += "\n\nПервая реплика персонажа (приветствие): " + greeting.content;
    }

    return msgs;
  }

  async function refreshModels() {
    const selects = [$("#modelSelect"), $("#modelSelectProfile")].filter(Boolean);
    for (const s of selects) {
      s.innerHTML = "<option value=''>Загрузка…</option>";
      s.disabled = true;
    }
    syncModelSelectTitles(selects);

    if (state.provider === "mistral") {
      await refreshMistralModels(selects);
    } else {
      await refreshLmStudioModels(selects);
    }
  }

  async function refreshLmStudioModels(selects) {
    setStatus("Проверяю LM Studio…");

    try {
      const res = await fetch("/api/lmstudio/models");
      const text = await res.text();
      const data = safeJsonParse(text);

      if (!res.ok) {
        const msg = data?.error || `LM Studio вернула ошибку (${res.status})`;
        state.lmOk = false;
        setStatus(msg, false);
        for (const s of selects) s.innerHTML = "<option value=''>—</option>";
        syncModelSelectTitles(selects);
        return;
      }

      const openAiModels = Array.isArray(data?.data) ? data.data : null;
      const restModels = Array.isArray(data?.models) ? data.models : null;

      const items = [];
      if (openAiModels) {
        for (const m of openAiModels) {
          if (!m || typeof m.id !== "string") continue;
          items.push({ id: m.id, label: m.id });
        }
      } else if (restModels) {
        for (const m of restModels) {
          if (!m || m.type !== "llm") continue;
          if (typeof m.key !== "string") continue;
          const label = typeof m.display_name === "string" && m.display_name.trim()
            ? `${m.display_name} (${m.key})`
            : m.key;
          items.push({ id: m.key, label });
        }
      }

      if (items.length === 0) {
        state.lmOk = true;
        setStatus("LM Studio: моделей не найдено", false);
        for (const s of selects) {
          s.innerHTML = "<option value='local-model'>local-model</option>";
          s.disabled = false;
        }
        syncModelSelectTitles(selects);
        return;
      }

      for (const s of selects) s.innerHTML = "";

      for (const it of items) {
        for (const s of selects) {
          const opt = document.createElement("option");
          opt.value = it.id;
          opt.textContent = it.label;
          s.appendChild(opt);
        }
      }

      const ids = items.map((m) => m.id);
      if (!state.modelId || !ids.includes(state.modelId)) state.modelId = ids[0];
      for (const s of selects) {
        s.value = state.modelId;
        s.disabled = false;
      }
      syncModelSelectTitles(selects);
      state.lmOk = true;
      setStatus("LM Studio: подключено");
      saveJson(STORAGE_KEYS.modelId, state.modelId);
    } catch {
      state.lmOk = false;
      setStatus("LM Studio недоступна. Запустите сервер в LM Studio.", false);
      for (const s of selects) s.innerHTML = "<option value=''>—</option>";
      syncModelSelectTitles(selects);
    }
  }

  async function refreshMistralModels(selects) {
    setStatus("Загружаю модели Mistral…");

    try {
      const headers = {};
      if (state.mistralKey) headers["X-Mistral-Key"] = state.mistralKey;

      const res = await fetch("/api/mistral/models", { headers });
      const text = await res.text();
      const data = safeJsonParse(text);

      if (!res.ok) {
        const msg = data?.error || data?.message || `Ошибка Mistral (${res.status})`;
        state.lmOk = false;
        setStatus(String(msg), false);
        for (const s of selects) s.innerHTML = "<option value=''>—</option>";
        syncModelSelectTitles(selects);
        return;
      }

      state.lmOk = true;
      const models = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      const items = models
        .map((m) => ({
          id: String(m?.id || m?.name || "").trim(),
          name: String(m?.name || m?.id || "").trim()
        }))
        .filter((m) => m.id);

      if (items.length === 0) {
        state.lmOk = false;
        setStatus("Mistral: моделей не найдено", false);
        for (const s of selects) s.innerHTML = "<option value=''>—</option>";
        syncModelSelectTitles(selects);
        return;
      }

      for (const s of selects) {
        s.innerHTML = "";
        for (const m of items) {
          const opt = document.createElement("option");
          opt.value = m.id;
          opt.textContent = m.name || m.id;
          s.appendChild(opt);
        }
      }

      const ids = items.map((x) => x.id);
      if (!state.modelId || !ids.includes(state.modelId)) state.modelId = ids[0];
      for (const s of selects) {
        s.value = state.modelId;
        s.disabled = false;
      }
      syncModelSelectTitles(selects);
      setStatus(`Mistral: ${items.length} моделей`);
      saveJson(STORAGE_KEYS.modelId, state.modelId);
    } catch (err) {
      state.lmOk = false;
      setStatus("Mistral недоступен: " + String(err?.message || err), false);
      for (const s of selects) s.innerHTML = "<option value=''>—</option>";
      syncModelSelectTitles(selects);
    }
  }

  function getStreamingBubble(placeholderId) {
    const list = $("#messages");
    if (!list) return null;
    const row = list.querySelector(`[data-msg-id="${placeholderId}"]`);
    return row ? row.querySelector(".bubble") : null;
  }

  function appendMessageRow(m, ch) {
    const list = $("#messages");
    if (!list) return;

    const row = document.createElement("div");
    row.className = `msg ${m.role === "user" ? "msg--me" : ""}`;
    row.dataset.msgId = m.id;

    const avatar = document.createElement("img");
    avatar.className = `avatar ${m.role === "user" ? "avatar--me" : ""}`;
    if (m.role === "user") setImg(avatar, state.profile?.avatar, state.profile?.name);
    else setImg(avatar, ch.avatar, ch.name);

    const bubbleWrap = document.createElement("div");
    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (m.image_url) {
      bubble.classList.add("bubble--image");
      const img = document.createElement("img");
      img.className = "bubble__img";
      img.src = m.image_url;
      img.alt = m.content || "image";
      img.loading = "lazy";
      bubble.appendChild(img);
    } else if (m.image_loading) {
      bubble.textContent = "Генерация изображения…";
    } else {
      renderBubbleContent(bubble, m.content, { role: m.role, characterName: ch.name });
    }
    wireHoldToMessage(bubble, m.id);

    const meta = document.createElement("div");
    meta.className = "msg__meta";
    meta.textContent = m.ts ? formatTime(m.ts) : "";

    bubbleWrap.appendChild(bubble);
    bubbleWrap.appendChild(meta);

    if (m.role === "user") {
      row.appendChild(bubbleWrap);
      row.appendChild(avatar);
    } else {
      row.appendChild(avatar);
      row.appendChild(bubbleWrap);
    }

    list.appendChild(row);
    list.scrollTop = list.scrollHeight;

    updateChatActionButtons();
  }

  function setGenerating(flag) {
    state.generating = !!flag;

    const sendBtn = $("#sendBtn");
    const input = $("#userInput");
    if (sendBtn) sendBtn.disabled = state.generating;
    if (input) input.disabled = state.generating;

    updateChatActionButtons();
  }

  function extractRestMessagesFromResult(obj) {
    const out = Array.isArray(obj?.output) ? obj.output : [];
    const msgs = out.filter((x) => x && x.type === "message" && typeof x.content === "string");
    return msgs.map((x) => x.content).join("\n\n");
  }

  function extractChatTextFromResponse(data) {
    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
    if (typeof content === "string") return content.trim();
    if (!Array.isArray(content)) return "";

    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        if (typeof part.text === "string") return part.text;
        if (typeof part.content === "string") return part.content;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function currentCharacterAvatarForVision() {
    return String(editingCharacter()?.avatar || "").trim();
  }

  function preferredMistralVisionModel() {
    const selected = String(state.modelId || "").trim();
    if (!selected) return "mistral-small-latest";

    const probe = selected.toLowerCase();
    const likelyVision =
      probe.includes("pixtral") ||
      probe.includes("mistral-small") ||
      probe.includes("mistral-medium") ||
      probe.includes("mistral-large") ||
      probe.includes("ministral");

    return likelyVision ? selected : "mistral-small-latest";
  }

  function shouldUseMistralForOutfitVision() {
    return Boolean(String(state.mistralKey || "").trim()) || state.provider === "mistral";
  }

  async function generateOutfitFromAvatar() {
    const btn = $("#btnAutoOutfit");
    const note = $("#charOutfitNote");
    const input = $("#charOutfitInput");
    const avatar = currentCharacterAvatarForVision();

    if (!input) return;

    if (!avatar) {
      if (note) note.textContent = "Сначала добавьте фото персонажа.";
      return;
    }

    if (!/^data:image\/|^https?:\/\//i.test(avatar)) {
      if (note) note.textContent = "Фото должно быть изображением в виде файла, data URL или http(s) URL.";
      return;
    }

    const openAiStyleMessages = [
      {
        role: "system",
        content:
          "Ты кратко описываешь видимую одежду и внешние детали персонажа по изображению. Не выдумывай скрытые или неразличимые элементы. Если что-то плохо видно, прямо скажи об этом. Верни только готовое описание на русском языке: 1-3 коротких предложения, без списков и без пояснений."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Посмотри на фото персонажа и опиши, во что он одет и какие заметные детали внешности действительно видны."
          },
          {
            type: "image_url",
            image_url: { url: avatar }
          }
        ]
      }
    ];

    const mistralMessages = [
      {
        role: "system",
        content:
          "Ты кратко описываешь видимую одежду и внешние детали персонажа по изображению. Не выдумывай скрытые или неразличимые элементы. Если что-то плохо видно, прямо скажи об этом. Верни только готовое описание на русском языке: 1-3 коротких предложения, без списков и без пояснений."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Посмотри на фото персонажа и опиши, во что он одет и какие заметные детали внешности действительно видны."
          },
          {
            type: "image_url",
            image_url: avatar
          }
        ]
      }
    ];

    if (note) note.textContent = "Анализирую фото персонажа…";
    if (btn) btn.disabled = true;

    try {
      let res;
      if (shouldUseMistralForOutfitVision()) {
        const headers = { "Content-Type": "application/json" };
        if (state.mistralKey) headers["X-Mistral-Key"] = state.mistralKey;

        res = await fetch("/api/mistral/chat", {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: preferredMistralVisionModel(),
            messages: mistralMessages,
            temperature: 0.2,
            max_tokens: 220,
            stream: false
          })
        });
      } else {
        res = await fetch("/api/lmstudio/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: state.modelId || "local-model",
            messages: openAiStyleMessages,
            temperature: 0.2,
            max_tokens: 220,
            stream: false
          })
        });
      }

      const text = await res.text();
      const data = safeJsonParse(text);

      if (!res.ok) {
        const errMsg =
          data?.error?.message || data?.error || data?.message || `Ошибка анализа изображения (${res.status})`;
        throw new Error(String(errMsg));
      }

      const outfit = extractChatTextFromResponse(data);
      if (!outfit) throw new Error("Модель не вернула описание. Проверьте, что выбрана vision-модель.");

      input.value = outfit;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (note) note.textContent = "Готово: описание подставлено в поле.";
    } catch (err) {
      let msg = String(err?.message || err || "Не удалось описать одежду по фото.");
      if (!shouldUseMistralForOutfitVision() && /LM Studio/i.test(msg)) {
        msg = "Не удалось получить ответ от LM Studio. Для заполнения по фото укажите Mistral API key в настройках или включите vision-модель в LM Studio.";
      }
      if (note) note.textContent = msg;
    } finally {
      if (btn) btn.disabled = false;
    }
  }



  function detectCyrillic(text) {
    return /[Ѐ-ӿ]/.test(String(text || ""));
  }

  function detectLanguageDirection(text) {
    const s = String(text || "");
    const cyr = (s.match(/[Ѐ-ӿ]/g) || []).length;
    const lat = (s.match(/[A-Za-z]/g) || []).length;

    if (cyr === 0 && lat === 0) return "unknown";
    if (cyr === 0) return "en";
    if (lat === 0) return "ru";

    if (cyr >= lat * 1.2) return "ru";
    if (lat >= cyr * 1.2) return "en";
    return cyr >= lat ? "ru" : "en";
  }

  async function translateTextByDirection(sourceText, emptyErrorMessage) {
    const src = String(sourceText || "").trim();
    if (!src) throw new Error(emptyErrorMessage || "Введите текст для перевода.");

    const detected = detectLanguageDirection(src);
    const toRussian = detected === "en" ? true : detected === "ru" ? false : !detectCyrillic(src);
    const target = toRussian ? "русский" : "английский";
    const source = toRussian ? "английский" : "русский";

    const prompt = [
      `Переведи текст с ${source} на ${target}.`,
      "Сохрани смысл, стиль и структуру абзацев.",
      "Верни только перевод, без пояснений и кавычек.",
      "Текст:",
      src
    ].join("\n");

    if (state.provider === "mistral") {
      const headers = { "Content-Type": "application/json" };
      if (state.mistralKey) headers["X-Mistral-Key"] = state.mistralKey;

      const payload = {
        model: state.modelId || "mistral-small-latest",
        messages: [
          { role: "system", content: "Ты профессиональный переводчик." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 4096,
        stream: false
      };

      const res = await fetch("/api/mistral/chat", {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      const text = await res.text();
      const data = safeJsonParse(text);
      if (!res.ok) {
        const errMsg = data?.error?.message || data?.error || data?.message || `Mistral error (${res.status})`;
        throw new Error(String(errMsg));
      }

      const translated = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";
      const out = String(translated || "").trim();
      if (!out) throw new Error("Модель вернула пустой перевод.");
      return { translated: out, directionLabel: `${source} → ${target}` };
    }

    const payload = {
      api: "rest",
      model: state.modelId || "local-model",
      input: prompt,
      temperature: 0.2,
      max_tokens: 4096,
      stream: false,
      store: false,
      system_prompt: "Ты профессиональный переводчик. Возвращай только перевод без пояснений."
    };

    const res = await fetch("/api/lmstudio/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    const data = safeJsonParse(text);

    if (!res.ok) {
      const errMsg = data?.error || data?.message || `Ошибка LM Studio (${res.status})`;
      throw new Error(String(errMsg));
    }

    let translated = "";
    if (data && Array.isArray(data.output)) translated = extractRestMessagesFromResult(data);
    else translated = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";

    const out = String(translated || "").trim();
    if (!out) throw new Error("Модель вернула пустой перевод.");

    return { translated: out, directionLabel: `${source} → ${target}` };
  }
  async function translateCharacterFields(fields) {
    const translated = {};
    const errors = [];
    for (const field of fields) {
      const key = field?.key;
      if (!key) continue;
      const value = String(field.value || "").trim();
      if (!value) continue;
      try {
        const result = await translateTextByDirection(value, `Поле «${field.label || key}» пустое.`);
        translated[key] = result.translated;
      } catch (err) {
        errors.push(field.label || key);
      }
    }
    if (errors.length > 0 && Object.keys(translated).length === 0) {
      throw new Error("Не удалось перевести: " + errors.join(", "));
    }
    translated._errors = errors;
    return translated;
  }



  async function streamLmStudioRestToMessage({
    character,
    assistantMsgId,
    inputText,
    previousResponseId,
    systemPrompt,
    baseText
  }) {
    const ch = character;

    const base = String(baseText || "");
    let generated = "";
    let chatEndResult = null;
    let streamErrorMessage = "";

    const bubble = getStreamingBubble(assistantMsgId);
    const list = $("#messages");

    const renderNow = () => {
      if (!bubble) return;
      renderBubbleContent(bubble, base + generated, { role: "assistant", characterName: ch.name });
      if (list) list.scrollTop = list.scrollHeight;
    };

    const payload = {
      api: "rest",
      model: state.modelId || "local-model",
      input: String(inputText || ""),
      temperature: 0.75,
      stream: true,
      store: true,
      previous_response_id: previousResponseId || undefined,
      system_prompt: systemPrompt
    };

    const res = await fetch("/api/lmstudio/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      const data = safeJsonParse(text);
      const errMsg = data?.error || data?.message || `Ошибка LM Studio (${res.status})`;
      throw new Error(errMsg);
    }

    const contentType = res.headers.get("content-type") || "";
    const isSSE = contentType.includes("text/event-stream");

    if (isSSE && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let started = base.length > 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === "[DONE]") continue;

          const chunk = safeJsonParse(jsonStr);
          if (!chunk) continue;

          // LM Studio REST v1 streaming events.
          if (typeof chunk.type === "string") {
            if (chunk.type === "model_load.progress" && typeof chunk.progress === "number") {
              const pct = Math.max(0, Math.min(100, Math.round(chunk.progress * 100)));
              $("#composerHint").textContent = `Загрузка модели… ${pct}%`;
              continue;
            }
            if (chunk.type === "prompt_processing.progress" && typeof chunk.progress === "number") {
              const pct = Math.max(0, Math.min(100, Math.round(chunk.progress * 100)));
              $("#composerHint").textContent = `Обработка запроса… ${pct}%`;
              continue;
            }
            if (chunk.type === "message.start") {
              $("#composerHint").textContent = "Генерирую ответ…";
              continue;
            }
            if (chunk.type === "error" && chunk.error) {
              const msg = chunk.error.message || chunk.error || "Ошибка";
              streamErrorMessage = String(msg);
              continue;
            }
            if (chunk.type === "chat.end" && chunk.result) {
              chatEndResult = chunk.result;
              continue;
            }
          }

          // OpenAI-compatible streaming chunks (fallback).
          if (chunk.error) {
            const msg = chunk.error.message || chunk.error || "Ошибка стрима";
            throw new Error(String(msg));
          }

          let delta = "";
          if (chunk.type === "message.delta" && typeof chunk.content === "string") {
            delta = chunk.content;
          } else {
            const choice0 = chunk.choices?.[0];
            delta =
              (typeof choice0?.delta?.content === "string" ? choice0.delta.content : "") ||
              (typeof choice0?.delta?.text === "string" ? choice0.delta.text : "") ||
              (typeof choice0?.text === "string" ? choice0.text : "");
          }

          if (typeof delta === "string" && delta.length > 0) {
            if (!started) {
              started = true;
              if (bubble && bubble.textContent === "…") bubble.textContent = "";
            }

            generated += delta;
            renderNow();
          }
        }
      }
    } else {
      const text = await res.text();
      const data = safeJsonParse(text);

      if (data && Array.isArray(data.output)) {
        generated = extractRestMessagesFromResult(data);
        if (typeof data.response_id === "string") chatEndResult = data;
      } else {
        const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";
        generated = String(content || "");
      }

      renderNow();
    }

    if (!generated && chatEndResult) {
      const fallback = extractRestMessagesFromResult(chatEndResult);
      if (fallback) {
        generated = fallback;
        renderNow();
      }
    }

    if (!generated && streamErrorMessage) {
      throw new Error(String(streamErrorMessage));
    }

    const fullContent = (base + generated) || "";
    const respId = typeof chatEndResult?.response_id === "string" ? chatEndResult.response_id : "";

    return { fullContent, respId, streamErrorMessage };
  }

  function buildAvatarPrompt(character) {
    const parts = [];
    const name = String(character.name || "").trim();
    const gender = character.gender;
    const outfit = String(character.outfit || "").trim();
    const bgHint = String(character.backgroundHint || "").trim();

    parts.push("character portrait");
    if (gender === "female") parts.push("female");
    else if (gender === "male") parts.push("male");
    if (name) parts.push("named " + name);
    if (outfit) parts.push(outfit);
    if (bgHint) parts.push(bgHint + " background");
    parts.push("detailed face, high quality, digital art, bust shot");

    return parts.join(", ");
  }

  async function generateCharacterAvatar() {
    const c = editingCharacter();
    if (!c) return;

    const note = $("#genAvatarNote");
    const btn = $("#btnGenAvatar");
    if (btn) btn.disabled = true;
    if (note) note.textContent = "Генерация…";

    const prompt = buildAvatarPrompt(c);
    const imageUrl = "https://image.pollinations.ai/prompt/"
      + encodeURIComponent(prompt)
      + "?width=512&height=512&nologo=true&model=flux&seed=" + Math.floor(Math.random() * 1e9);

    const img = new Image();
    img.onload = () => {
      upsertCharacter({ ...c, avatar: imageUrl, updatedAt: nowTs() });
      fillCharacterForm();
      if (state.selectedCharacterId === c.id) renderHeader();
      refreshChatsView();
      if (note) note.textContent = "Готово!";
      if (btn) btn.disabled = false;
      setTimeout(() => { if (note && note.textContent === "Готово!") note.textContent = ""; }, 2000);
    };
    img.onerror = () => {
      if (note) note.textContent = "Ошибка генерации";
      if (btn) btn.disabled = false;
    };
    img.src = imageUrl;
  }

  async function generateImage(prompt) {
    const ch = activeCharacter();
    if (!ch) return;
    if (state.generating) return;

    const historyBefore = chatHistoryFor(ch.id);

    const userMsg = { id: uuid(), role: "user", content: "/img " + prompt, ts: nowTs() };
    setChatHistory(ch.id, historyBefore.concat([userMsg]));
    renderMessages();
    refreshChatsView();

    const placeholderId = uuid();
    const placeholder = {
      id: placeholderId, role: "assistant", content: "",
      ts: nowTs(), pending: true, image_loading: true
    };
    setChatHistory(ch.id, chatHistoryFor(ch.id).concat([placeholder]));
    appendMessageRow(placeholder, ch);

    setGenerating(true);
    $("#composerHint").textContent = "Генерация изображения…";

    const imageUrl = "https://image.pollinations.ai/prompt/"
      + encodeURIComponent(prompt)
      + "?width=1024&height=1024&nologo=true&model=flux&seed=" + Math.floor(Math.random() * 1e9);

    const img = new Image();
    img.onload = () => {
      setChatHistory(
        ch.id,
        chatHistoryFor(ch.id).map((m) =>
          m.id === placeholderId
            ? { id: m.id, role: "assistant", content: prompt, image_url: imageUrl, ts: nowTs() }
            : m
        )
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = "";
      setGenerating(false);
    };
    img.onerror = () => {
      setChatHistory(
        ch.id,
        chatHistoryFor(ch.id).map((m) =>
          m.id === placeholderId
            ? { id: m.id, role: "assistant", content: "Не удалось сгенерировать изображение.", ts: nowTs() }
            : m
        )
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = "Ошибка генерации изображения";
      setGenerating(false);
    };
    img.src = imageUrl;
  }

  async function streamMistralToMessage({ character, assistantMsgId, messages, baseText }) {
    const ch = character;
    let generated = "";
    const base = String(baseText || "");

    const bubble = getStreamingBubble(assistantMsgId);
    const list = $("#messages");

    const renderNow = () => {
      if (!bubble) return;
      renderBubbleContent(bubble, base + generated, { role: "assistant", characterName: ch.name });
      if (list) list.scrollTop = list.scrollHeight;
    };

    const headers = { "Content-Type": "application/json" };
    if (state.mistralKey) headers["X-Mistral-Key"] = state.mistralKey;

    const payload = {
      model: state.modelId || "mistral-small-latest",
      messages,
      temperature: 0.75,
      stream: true
    };

    const res = await fetch("/api/mistral/chat", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      const data = safeJsonParse(text);
      const errMsg = data?.error?.message || data?.error || data?.message || `Mistral error (${res.status})`;
      throw new Error(String(errMsg));
    }

    const contentType = res.headers.get("content-type") || "";
    const isSSE = contentType.includes("text/event-stream");

    if (isSSE && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let started = base.length > 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === "[DONE]") continue;

          const chunk = safeJsonParse(jsonStr);
          if (!chunk) continue;

          if (chunk.error) {
            const msg = chunk.error.message || chunk.error || "Mistral stream error";
            throw new Error(String(msg));
          }

          const choice0 = chunk.choices?.[0];
          const delta =
            (typeof choice0?.delta?.content === "string" ? choice0.delta.content : "") ||
            (typeof choice0?.text === "string" ? choice0.text : "");

          if (typeof delta === "string" && delta.length > 0) {
            if (!started) {
              started = true;
              if (bubble && bubble.textContent === "…") bubble.textContent = "";
            }
            generated += delta;
            renderNow();
          }
        }
      }
    } else {
      const text = await res.text();
      const data = safeJsonParse(text);
      const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";
      generated = String(content || "");
      renderNow();
    }

    const fullContent = (base + generated) || "";
    return { fullContent };
  }

  function openPromptsSheet() {
    const sheet = $("#promptsSheet");
    if (!sheet) return;
    sheet.hidden = false;
    renderSavedPrompts();
  }

  function closePromptsSheet() {
    const sheet = $("#promptsSheet");
    if (!sheet) return;
    sheet.hidden = true;
  }

  function renderSavedPrompts() {
    const list = $("#savedPromptsList");
    if (!list) return;
    list.innerHTML = "";

    const items = Array.isArray(state.savedPrompts) ? state.savedPrompts.slice() : [];
    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "smallNote";
      empty.textContent = "Пока нет сохраненных промтов.";
      list.appendChild(empty);
      return;
    }

    for (const item of items) {
      const card = document.createElement("div");
      card.className = "promptCard";

      const title = document.createElement("div");
      title.className = "promptCard__title";
      title.textContent = item.title || "Промт";

      const text = document.createElement("div");
      text.className = "promptCard__text";
      text.textContent = item.text || "";

      const actions = document.createElement("div");
      actions.className = "promptCard__actions";

      const btnUse = document.createElement("button");
      btnUse.className = "btn btn--tiny";
      btnUse.type = "button";
      btnUse.textContent = "Вставить";
      btnUse.addEventListener("click", () => {
        const input = $("#userInput");
        if (!input) return;
        const current = String(input.value || "");
        input.value = current ? `${current}
${item.text}` : item.text;
        autoGrowTextarea(input);
        input.focus();
        $("#promptSheetNote").textContent = "Промт вставлен в поле сообщения.";
      });

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn btn--tiny btn--danger";
      btnDelete.type = "button";
      btnDelete.textContent = "Удалить";
      btnDelete.addEventListener("click", () => {
        const ok = window.confirm(`Удалить промт «${item.title || "Промт"}»?`);
        if (!ok) return;
        state.savedPrompts = state.savedPrompts.filter((x) => x && x.id !== item.id);
        saveJson(STORAGE_KEYS.savedPrompts, state.savedPrompts);
        renderSavedPrompts();
        $("#promptSheetNote").textContent = "Промт удален.";
      });

      actions.appendChild(btnUse);
      actions.appendChild(btnDelete);
      card.appendChild(title);
      card.appendChild(text);
      card.appendChild(actions);
      list.appendChild(card);
    }
  }

  function savePromptFromDraft() {
    const titleInput = $("#promptTitleInput");
    const textInput = $("#promptTextInput");
    const note = $("#promptSheetNote");
    if (!titleInput || !textInput || !note) return;

    const title = clampText(String(titleInput.value || "").trim() || "Промт", 80);
    const text = clampText(String(textInput.value || "").trim(), 4000);
    if (!text) {
      note.textContent = "Введите текст промта.";
      return;
    }

    state.savedPrompts.unshift({ id: uuid(), title, text, createdAt: nowTs(), updatedAt: nowTs() });
    saveJson(STORAGE_KEYS.savedPrompts, state.savedPrompts);

    titleInput.value = "";
    textInput.value = "";
    note.textContent = "Промт сохранен.";
    renderSavedPrompts();
  }

  async function sendMessage(userText) {
    const imgMatch = userText.match(/^\/img\s+(.+)/i);
    if (imgMatch) {
      generateImage(imgMatch[1].trim());
      return;
    }

    const ch = activeCharacter();
    if (!ch) return;
    if (!state.lmOk) {
      $("#composerHint").textContent = `${providerLabel()} недоступна.`;
      return;
    }

    if (state.generating) return;

    const chatId = activeChatIdFor(ch.id);
    const historyBefore = chatHistoryFor(ch.id);

    const userMsg = { id: uuid(), role: "user", content: userText, ts: nowTs() };
    setChatHistory(ch.id, historyBefore.concat([userMsg]));
    renderMessages();
    refreshChatsView();

    const placeholderId = uuid();
    const placeholder = { id: placeholderId, role: "assistant", content: "…", ts: nowTs(), pending: true };
    setChatHistory(ch.id, chatHistoryFor(ch.id).concat([placeholder]));
    appendMessageRow(placeholder, ch);

    setGenerating(true);
    $("#composerHint").textContent = "Генерирую ответ…";

    try {
      let content;

      if (state.provider === "mistral") {
        const messages = buildOpenAiMessages(ch.id);
        const { fullContent } = await streamMistralToMessage({
          character: ch,
          assistantMsgId: placeholderId,
          messages,
          baseText: ""
        });
        content = String(fullContent || "").trim() ? String(fullContent) : "(пустой ответ)";
      } else {
        const prevResponseId = chatId ? lastResponseIdFor(chatId) : "";
        const systemPrompt = prevResponseId ? undefined : buildRestStartPrompt(state.profile, ch, historyBefore, true);

        const { fullContent, respId, streamErrorMessage } = await streamLmStudioRestToMessage({
          character: ch,
          assistantMsgId: placeholderId,
          inputText: userText,
          previousResponseId: prevResponseId,
          systemPrompt,
          baseText: ""
        });
        content = String(fullContent || "").trim() ? String(fullContent) : "(пустой ответ)";

        if (respId && chatId) {
          const chain = responseIdChainFor(chatId);
          let nextChain = chain;
          if (nextChain.length === 0 && prevResponseId) nextChain = [prevResponseId, respId];
          else nextChain = nextChain.concat([respId]);
          saveResponseIdChain(chatId, nextChain);
        } else if (streamErrorMessage && String(streamErrorMessage).toLowerCase().includes("job_not_found")) {
          if (chatId) resetLmContextFor(chatId);
        }
      }

      setChatHistory(
        ch.id,
        chatHistoryFor(ch.id).map((m) =>
          m.id === placeholderId ? { id: m.id, role: "assistant", content, ts: nowTs() } : m
        )
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = "";
    } catch (err) {
      const msg = String(err?.message || err || "Ошибка");
      setChatHistory(
        ch.id,
        chatHistoryFor(ch.id).map((m) =>
          m.id === placeholderId ? { id: m.id, role: "assistant", content: `Не удалось получить ответ: ${msg}`, ts: nowTs() } : m
        )
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = clampText(msg, 140);
    } finally {
      setGenerating(false);
    }
  }

  async function regenerateLastAnswer() {
    const ch = activeCharacter();
    if (!ch) return;
    if (!state.lmOk) {
      $("#composerHint").textContent = `${providerLabel()} недоступна.`;
      return;
    }
    if (state.generating) return;

    const chatId = activeChatIdFor(ch.id);
    const history = chatHistoryFor(ch.id);
    if (history.length === 0) return;

    const lastIdx = history.length - 1;
    const last = history[lastIdx];
    if (!last || last.role !== "assistant" || last.pending) return;

    let userIdx = -1;
    for (let i = lastIdx - 1; i >= 0; i--) {
      if (history[i] && history[i].role === "user") {
        userIdx = i;
        break;
      }
    }
    if (userIdx === -1) return;

    const userText = String(history[userIdx].content || "");
    const assistantMsgId = String(last.id);

    const nextHistory = history.slice(0, lastIdx + 1);
    nextHistory[lastIdx] = { ...last, content: "…", pending: true, ts: nowTs() };
    setChatHistory(ch.id, nextHistory);
    renderMessages();

    setGenerating(true);
    $("#composerHint").textContent = "Перегенерирую ответ…";

    try {
      let content;

      if (state.provider === "mistral") {
        // For regeneration with Mistral, rebuild messages without the last assistant reply.
        const truncatedHistory = history.slice(0, lastIdx);
        setChatHistory(ch.id, truncatedHistory.concat([{ ...last, content: "…", pending: true, ts: nowTs() }]));
        const messages = buildOpenAiMessages(ch.id);
        const filteredMessages = messages.filter((m) => m.content !== "…");

        const { fullContent } = await streamMistralToMessage({
          character: ch,
          assistantMsgId,
          messages: filteredMessages,
          baseText: ""
        });
        content = String(fullContent || "").trim() ? String(fullContent) : "(пустой ответ)";
      } else {
        const chain = chatId ? responseIdChainFor(chatId) : [];
        const prevResponseId = chain.length >= 2 ? chain[chain.length - 2] : "";
        const historyForPrompt = history.slice(0, userIdx);
        const systemPrompt = prevResponseId ? undefined : buildRestStartPrompt(state.profile, ch, historyForPrompt, true);

        const { fullContent, respId } = await streamLmStudioRestToMessage({
          character: ch,
          assistantMsgId,
          inputText: userText,
          previousResponseId: prevResponseId,
          systemPrompt,
          baseText: ""
        });
        content = String(fullContent || "").trim() ? String(fullContent) : "(пустой ответ)";

        if (respId && chatId) {
          const nextChain = chain.length > 0 ? chain.slice(0, chain.length - 1).concat([respId]) : [respId];
          saveResponseIdChain(chatId, nextChain);
        }
      }

      setChatHistory(
        ch.id,
        chatHistoryFor(ch.id).map((m) =>
          m.id === assistantMsgId ? { id: m.id, role: "assistant", content, ts: nowTs() } : m
        )
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = "";
    } catch (err) {
      const msg = String(err?.message || err || "Ошибка");
      setChatHistory(
        ch.id,
        chatHistoryFor(ch.id).map((m) =>
          m.id === assistantMsgId ? { id: m.id, role: "assistant", content: `Не удалось перегенерировать: ${msg}`, ts: nowTs() } : m
        )
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = clampText(msg, 140);
    } finally {
      setGenerating(false);
    }
  }

  const THOUGHT_DELIM = "\n\n{{THOUGHTS}}\n";

  async function continueLastAnswerWithPrompt({ inputText, hintText, failurePrefix, isThoughts }) {
    const ch = activeCharacter();
    if (!ch) return;
    if (!state.lmOk) {
      $("#composerHint").textContent = `${providerLabel()} недоступна.`;
      return;
    }
    if (state.generating) return;

    const chatId = activeChatIdFor(ch.id);
    const history = chatHistoryFor(ch.id);
    if (history.length === 0) return;
    const lastIdx = history.length - 1;
    const last = history[lastIdx];
    if (!last || last.role !== "assistant" || last.pending) return;

    const assistantMsgId = String(last.id);
    const rawBase = stripThoughtsContent(last.content);
    const base = isThoughts ? rawBase + THOUGHT_DELIM : rawBase;

    const nextHistory = history.slice();
    nextHistory[lastIdx] = { ...last, pending: true };
    setChatHistory(ch.id, nextHistory);
    renderMessages();

    setGenerating(true);
    $("#composerHint").textContent = hintText;

    try {
      let content;

      if (state.provider === "mistral") {
        const continueMsg = { role: "user", content: inputText };
        const messages = buildOpenAiMessages(ch.id);
        messages.push(continueMsg);

        const { fullContent } = await streamMistralToMessage({
          character: ch,
          assistantMsgId,
          messages,
          baseText: base
        });
        content = String(fullContent || "").trim() ? String(fullContent) : (base || "(пустой ответ)");
      } else {
        const prevResponseId = chatId ? lastResponseIdFor(chatId) : "";
        const systemPrompt = prevResponseId ? undefined : buildRestStartPrompt(state.profile, ch, history, true);

        const { fullContent, respId } = await streamLmStudioRestToMessage({
          character: ch,
          assistantMsgId,
          inputText,
          previousResponseId: prevResponseId,
          systemPrompt,
          baseText: base
        });
        content = String(fullContent || "").trim() ? String(fullContent) : (base || "(пустой ответ)");

        if (respId && chatId && !isThoughts) {
          const chain = responseIdChainFor(chatId);
          let nextChain = chain;
          if (nextChain.length === 0 && prevResponseId) nextChain = [prevResponseId, respId];
          else if (nextChain.length === 0) nextChain = [respId];
          else nextChain = nextChain.slice(0, nextChain.length - 1).concat([respId]);
          saveResponseIdChain(chatId, nextChain);
        }
      }

      setChatHistory(
        ch.id,
        chatHistoryFor(ch.id).map((m) =>
          m.id === assistantMsgId ? { id: m.id, role: "assistant", content, ts: nowTs() } : m
        )
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = "";
    } catch (err) {
      const msg = String(err?.message || err || "Ошибка");
      setChatHistory(
        ch.id,
        chatHistoryFor(ch.id).map((m) =>
          m.id === assistantMsgId ? { id: m.id, role: "assistant", content: base + `\n\n(${failurePrefix}: ${msg})`, ts: nowTs() } : m
        )
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = clampText(msg, 140);
    } finally {
      setGenerating(false);
    }
  }

  async function continueLastAnswer() {
    return continueLastAnswerWithPrompt({
      inputText: "Продолжи свой предыдущий ответ. Не повторяй уже сказанное. Продолжай с того места, где остановился. Без вступлений.",
      hintText: "Продолжаю ответ…",
      failurePrefix: "прервано"
    });
  }

  async function continueLastAnswerAsThoughts() {
    return continueLastAnswerWithPrompt({
      inputText:
        "Продолжи свой предыдущий ответ в формате внутренних мыслей персонажа. Пиши как поток мыслей в текущий момент, в первом лице, без обращения к собеседнику и без повторов уже сказанного. Только мысли: без реплик, диалогов, объяснений, вступлений, мета-текста и оформления (без кавычек, двоеточий, ролей, меток).",
      hintText: "Генерирую внутренние мысли…",
      failurePrefix: "мысли прерваны",
      isThoughts: true
    });
  }

  function clearChatForActiveCharacter() {
    const ch = activeCharacter();
    if (!ch) return;
    setChatHistory(ch.id, []);
    const chatId = activeChatIdFor(ch.id);
    if (chatId) resetLmContextFor(chatId);
    ensureInitialMessage();
    renderMessages();
    refreshChatsView();
  }

  function wireUI() {
    const styleSel = $("#charStyleInput");
    styleSel.innerHTML = "";
    for (const s of DIALOGUE_STYLES) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      styleSel.appendChild(opt);
    }

    const bindSegmented = (containerSel, hiddenSel, onChange) => {
      const container = $(containerSel);
      const hidden = $(hiddenSel);
      if (!container || !hidden) return;
      container.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest(".segmented__item[data-value]") : null;
        if (!btn) return;
        const value = String(btn.dataset.value || "");
        hidden.value = value;
        setSegmentedValue(container, value);
        if (typeof onChange === "function") onChange(value);
      });
    };

    bindSegmented("#charGenderSegment", "#charGenderInput", () => {
      renderCharacterHeroPreview({
        ...editingCharacter(),
        name: String($("#charNameInput")?.value || "").trim(),
        gender: String($("#charGenderInput")?.value || "unspecified"),
        intro: String($("#charIntroInput")?.value || ""),
        dialogueStyle: String($("#charStyleInput")?.value || "natural")
      });
    });
    bindSegmented("#charVisibilitySegment", "#charVisibilityInput");

    const btnOpenCharacters = $("#btnOpenCharacters");
    if (btnOpenCharacters) btnOpenCharacters.addEventListener("click", () => openModal());

    const tabChats = $("#tabChats");
    const tabPlus = $("#tabPlus");
    const tabProfile = $("#tabProfile");
    const btnFollowingTab = $("#btnFollowingTab");
    const btnExploreTab = $("#btnExploreTab");
    const btnForYouTab = $("#btnForYouTab");
    const btnFollowingTextTab = $("#btnFollowingTextTab");
    const btnExploreTextTab = $("#btnExploreTextTab");
    const btnOpenProfileFromChats = $("#btnOpenProfileFromChats");

    if (tabChats) {
      tabChats.addEventListener("click", () => {
        setView("chats");
        renderChatList($("#chatSearch")?.value || "");
      });
    }

    if (tabPlus) tabPlus.addEventListener("click", () => openModal());
    if (tabProfile) tabProfile.addEventListener("click", () => setView("profile"));
    if (btnOpenProfileFromChats) btnOpenProfileFromChats.addEventListener("click", () => setView("profile"));
    if (btnFollowingTab) {
      btnFollowingTab.addEventListener("click", () => {
        state.discoverTab = "following";
        renderChatList($("#chatSearch")?.value || "");
      });
    }
    if (btnExploreTab) {
      btnExploreTab.addEventListener("click", () => {
        state.discoverTab = "explore";
        renderChatList($("#chatSearch")?.value || "");
      });
    }
    if (btnForYouTab) {
      btnForYouTab.addEventListener("click", () => {
        state.discoverTab = "explore";
        state.discoverCategory = "all";
        renderChatList($("#chatSearch")?.value || "");
      });
    }
    if (btnFollowingTextTab) {
      btnFollowingTextTab.addEventListener("click", () => {
        state.discoverTab = "following";
        renderChatList($("#chatSearch")?.value || "");
      });
    }
    if (btnExploreTextTab) {
      btnExploreTextTab.addEventListener("click", () => {
        state.discoverTab = "explore";
        renderChatList($("#chatSearch")?.value || "");
      });
    }

    // Desktop sidebar navigation
    const sideChats = $("#sideChats");
    const sidePlus = $("#sidePlus");
    const sideProfile = $("#sideProfile");

    if (sideChats) {
      sideChats.addEventListener("click", () => {
        setView("chats");
        renderChatList($("#chatSearch")?.value || "");
      });
    }

    if (sidePlus) sidePlus.addEventListener("click", () => openModal());
    if (sideProfile) sideProfile.addEventListener("click", () => setView("profile"));

    const btnBack = $("#btnBackToChats");
    if (btnBack) {
      btnBack.addEventListener("click", () => {
        setView("chats");
        renderChatList($("#chatSearch")?.value || "");
      });
    }

    const search = $("#chatSearch");
    if (search) {
      search.addEventListener("input", () => {
        renderChatList(search.value);
      });
    }

    const messages = $("#messages");
    if (messages) {
      messages.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest(".miniBtn[data-action][data-msg-id]") : null;
        if (!btn) return;
        const action = btn.dataset.action;
        const msgId = btn.dataset.msgId;
        if (!action || !msgId) return;
        if (btn.disabled) return;

        if (action === "regen") {
          regenerateLastAnswer();
        } else if (action === "cont") {
          continueLastAnswer();
        } else if (action === "thoughts") {
          continueLastAnswerAsThoughts();
        }
      });
    }

    const modal = $("#charactersModal");
    modal.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.close) closeModal();
    });

    // Paste-to-import:
    // - PolyBuzz links: works anywhere (as long as you're not pasting into an input/textarea).
    // - JSON: only auto-import when the Characters modal is open, to avoid surprises.
    document.addEventListener("paste", async (e) => {
      try {
        const t = e.target;
        const tag = t && t.tagName ? String(t.tagName).toUpperCase() : "";
        if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;

        const raw = e.clipboardData ? e.clipboardData.getData("text") : "";
        const s = String(raw || "").trim();
        if (!s) return;

        const isPb = isPolybuzzUrl(s);
        const looksJson = s.startsWith("{") || s.startsWith("[");

        const charModal = $("#charactersModal");
        const modalOpen = !!(charModal && !charModal.hidden);

        if (isPb && !modalOpen) openModal();
        else if (looksJson && !modalOpen) return;
        else if (!isPb && !looksJson) return;

        e.preventDefault();
        await importCharactersFromTextOrUrl(s, { openModalOnSuccess: true, showErrors: true });
      } catch (err) {
        const msg = String(err?.message || err);
        $("#charFormNote").textContent = msg;
        flashStatus(msg, false);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const msgSheet = $("#msgActions");
      const promptsSheet = $("#promptsSheet");
      const charModal = $("#charactersModal");
      if (msgSheet && !msgSheet.hidden) closeMsgActions();
      else if (promptsSheet && !promptsSheet.hidden) closePromptsSheet();
      else if (charModal && !charModal.hidden) closeModal();
    });

    const msgActions = $("#msgActions");
    if (msgActions) {
      msgActions.addEventListener("click", (e) => {
        const t = e.target;
        if (t && t.dataset && t.dataset.close) closeMsgActions();
      });
    }

    const btnMsgEdit = $("#btnMsgEdit");
    const btnMsgDelete = $("#btnMsgDelete");

    if (btnMsgEdit) {
      btnMsgEdit.addEventListener("click", () => {
        const ch = activeCharacter();
        const msgId = state.msgActionsTargetId;
        closeMsgActions();
        if (!ch || !msgId) return;
        editMessage(ch.id, msgId);
      });
    }

    if (btnMsgDelete) {
      btnMsgDelete.addEventListener("click", () => {
        const ch = activeCharacter();
        const msgId = state.msgActionsTargetId;
        closeMsgActions();
        if (!ch || !msgId) return;
        deleteMessage(ch.id, msgId);
      });
    }

    const btnCharEditorBack = $("#btnCharEditorBack");
    if (btnCharEditorBack) {
      btnCharEditorBack.addEventListener("click", () => {
        modalWindow()?.classList.remove("modal__window--editing");
      });
    }

    $("#btnNewCharacter").addEventListener("click", () => {
      const c = defaultCharacter();
      c.id = uuid();
      c.name = "Новый персонаж";
      c.intro = "";
      c.tags = [];
      c.visibility = "public";
      c.initialMessage = "Привет. Я здесь. С чего начнем?";
      c.createdAt = nowTs();
      c.updatedAt = nowTs();
      upsertCharacter(c);
      state.editingCharacterId = c.id;
      fillCharacterForm();
      if (window.innerWidth <= 600) {
        const ed = document.querySelector(".charEditor");
        if (ed) ed.scrollTop = 0;
        modalWindow()?.classList.add("modal__window--editing");
      }
      $("#charFormNote").textContent = 'Создан новый персонаж. Заполните поля и нажмите "Сохранить".';
      refreshChatsView();
    });

    const btnImport = $("#btnImportCharacters");
    const importFile = $("#importCharactersFile");
    const importTextInput = $("#importTextInput");
    const importPanelNote = $("#importPanelNote");
    const btnImportApply = $("#btnImportApply");
    const btnImportPaste = $("#btnImportPaste");
    const btnImportFilePick = $("#btnImportFilePick");

    if (btnImport) {
      btnImport.addEventListener("click", () => {
        $("#charFormNote").textContent = "";
        if (importTextInput) {
          importTextInput.focus();
          importTextInput.scrollIntoView({ block: "start", behavior: "smooth" });
        }
      });
    }

    if (btnImportApply) {
      btnImportApply.addEventListener("click", async () => {
        const raw = String(importTextInput?.value || "").trim();
        if (!raw) {
          if (importPanelNote) importPanelNote.textContent = "Вставьте ссылку PolyBuzz или JSON для импорта.";
          return;
        }
        if (importPanelNote) importPanelNote.textContent = "Импортирую…";
        const ok = await importCharactersFromTextOrUrl(raw, { openModalOnSuccess: true, showErrors: true });
        if (ok) {
          if (importPanelNote) importPanelNote.textContent = "Импорт завершен.";
          if (importTextInput) importTextInput.value = "";
        }
      });
    }

    if (btnImportPaste) {
      btnImportPaste.addEventListener("click", async () => {
        if (!importTextInput) return;
        try {
          let clip = "";
          if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
            clip = await navigator.clipboard.readText();
          }
          if (!clip) {
            if (importPanelNote) importPanelNote.textContent = "Буфер пуст или недоступен. Вставьте текст вручную.";
            return;
          }
          importTextInput.value = clip.trim();
          importTextInput.focus();
          if (importPanelNote) importPanelNote.textContent = "Готово. Нажмите «Импортировать».";
        } catch (err) {
          if (importPanelNote) importPanelNote.textContent = "Не удалось прочитать буфер. Вставьте текст вручную.";
        }
      });
    }

    if (btnImportFilePick) {
      btnImportFilePick.addEventListener("click", () => {
        if (importFile) importFile.click();
      });
    }

    if (importFile) {
      importFile.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const result = await importFromFile(file);
          if (!applyImportedCharactersResult(result, { openModalOnSuccess: true })) {
            const msg = "Ничего не импортировано.";
            $("#charFormNote").textContent = msg;
            if (importPanelNote) importPanelNote.textContent = msg;
            flashStatus(msg, false);
            return;
          }
          if (importPanelNote) importPanelNote.textContent = "Импорт завершен.";
        } catch (err) {
          const msg = String(err?.message || err);
          $("#charFormNote").textContent = msg;
          if (importPanelNote) importPanelNote.textContent = msg;
          flashStatus(msg, false);
        } finally {
          e.target.value = "";
        }
      });
    }

    const btnExport = $("#btnExportCharacters");
    if (btnExport) {
      btnExport.addEventListener("click", async () => {
        const current = editingCharacter();
        if (!current) return;

        const all = window.confirm("Экспортировать всех персонажей?\nOK: все\nCancel: только текущего");
        const payload = all ? state.characters : current;
        const json = JSON.stringify(payload, null, 2);

        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(json);
            $("#charFormNote").textContent = all ? "Экспортировано в буфер: все персонажи" : "Экспортировано в буфер: персонаж";
            return;
          }
        } catch {
          // ignore -> fall back to download
        }

        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        const filename = all ? `nlmw-characters-${ts}.json` : `nlmw-character-${ts}.json`;
        downloadText(filename, json);
        $("#charFormNote").textContent = `Экспорт: ${filename}`;
      });
    }

    $("#btnUseCharacter").addEventListener("click", () => {
      const c = editingCharacter();
      if (!c) return;
      state.selectedCharacterId = c.id;
      saveJson(STORAGE_KEYS.selectedCharacterId, state.selectedCharacterId);
      ensureInitialMessage();
      renderHeader();
      renderMessages();
      closeModal();
      setView("chat");
    });

    const btnUploadAvatar = $("#btnUploadAvatar");
    if (btnUploadAvatar) {
      btnUploadAvatar.addEventListener("click", () => $("#charAvatarFile")?.click());
    }

    const btnUploadBackground = $("#btnUploadBackground");
    if (btnUploadBackground) {
      btnUploadBackground.addEventListener("click", () => $("#charBgFile")?.click());
    }

    const btnAddTag = $("#btnAddTag");
    const tagInput = $("#charTagInput");
    const addTagFromInput = () => {
      const c = editingCharacter();
      if (!c || !tagInput) return;
      const raw = cleanOneLineText(tagInput.value || "");
      if (!raw) return;
      const nextTags = Array.isArray(c.tags) ? c.tags.slice() : [];
      if (nextTags.length >= 5) {
        $("#charFormNote").textContent = "Можно добавить не больше 5 тегов.";
        return;
      }
      if (nextTags.some((item) => normalizeTagToken(item) === normalizeTagToken(raw))) {
        tagInput.value = "";
        return;
      }
      nextTags.push(raw);
      upsertCharacter({ ...c, tags: nextTags, updatedAt: nowTs() });
      tagInput.value = "";
      fillCharacterForm();
      refreshChatsView();
    };

    if (btnAddTag) btnAddTag.addEventListener("click", addTagFromInput);
    if (tagInput) {
      tagInput.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        addTagFromInput();
      });
    }


    const btnAutoOutfit = $("#btnAutoOutfit");

    if (btnAutoOutfit) {
      btnAutoOutfit.addEventListener("click", async () => {
        await generateOutfitFromAvatar();
      });
    }


    const btnTranslateAll = $("#btnTranslateAll");

    if (btnTranslateAll) {
      btnTranslateAll.addEventListener("click", async () => {
        const note = $("#charTranslateNote");
        const fields = [
          { key: "name", label: "Имя", input: $("#charNameInput") },
          { key: "intro", label: "Интро", input: $("#charIntroInput") },
          { key: "outfit", label: "Описание", input: $("#charOutfitInput") },
          { key: "setting", label: "Обстановка", input: $("#charSettingInput") },
          { key: "backgroundHint", label: "Фон для ИИ", input: $("#charBgHintInput") },
          { key: "backstory", label: "Предыстория", input: $("#charBackstoryInput") },
          { key: "initialMessage", label: "Начальное сообщение", input: $("#charInitialMessageInput") }
        ].filter((x) => x.input);

        const nonEmptyFields = fields.filter((x) => String(x.input.value || "").trim());
        if (!nonEmptyFields.length) {
          if (note) note.textContent = "Заполните хотя бы одно текстовое поле персонажа.";
          return;
        }

        if (note) note.textContent = "Перевод всех полей…";
        btnTranslateAll.disabled = true;

        try {
          const translated = await translateCharacterFields(nonEmptyFields.map((x) => ({
            key: x.key,
            label: x.label,
            value: x.input.value
          })));
          const fieldErrors = translated._errors || [];
          let changed = 0;
          for (const field of nonEmptyFields) {
            if (Object.prototype.hasOwnProperty.call(translated, field.key)) {
              field.input.value = translated[field.key];
              field.input.dispatchEvent(new Event("input", { bubbles: true }));
              changed += 1;
            }
          }
          let msg = `Готово: переведено полей ${changed}.`;
          if (fieldErrors.length > 0) msg += ` Не удалось: ${fieldErrors.join(", ")}.`;
          if (note) note.textContent = msg;
        } catch (err) {
          const msg = String(err?.message || err || "Ошибка перевода");
          if (note) note.textContent = msg;
        } finally {
          btnTranslateAll.disabled = false;
        }
      });
    }

    const btnGenAvatar = $("#btnGenAvatar");
    if (btnGenAvatar) btnGenAvatar.addEventListener("click", () => generateCharacterAvatar());

    $("#btnDeleteCharacter").addEventListener("click", () => {
      const c = editingCharacter();
      if (!c) return;
      if (state.characters.length <= 1) {
        $("#charFormNote").textContent = "Нельзя удалить последнего персонажа.";
        return;
      }
      const ok = window.confirm(`Удалить персонажа “${c.name}”?`);
      if (!ok) return;
      deleteCharacter(c.id);
      fillCharacterForm();
      ensureInitialMessage();
      renderHeader();
      renderMessages();
      refreshChatsView();
    });

    $("#charForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const c = editingCharacter();
      if (!c) return;

      const next = { ...c };
      next.name = String($("#charNameInput").value || "").trim() || "(без имени)";
      next.gender = $("#charGenderInput").value || "unspecified";
      next.intro = String($("#charIntroInput").value || "").trim();
      next.visibility = $("#charVisibilityInput").value || "public";
      next.tags = Array.isArray(c.tags) ? c.tags.slice(0, 5) : [];
      next.outfit = String($("#charOutfitInput").value || "");
      next.setting = String($("#charSettingInput").value || "");
      next.backgroundHint = String($("#charBgHintInput").value || "");
      next.backstory = String($("#charBackstoryInput").value || "");
      next.dialogueStyle = $("#charStyleInput").value || "natural";
      next.initialMessage = String($("#charInitialMessageInput").value || "");
      next.updatedAt = nowTs();

      const rightsOk = $("#charRightsConfirm")?.checked;
      if (!rightsOk) {
        $("#charFormNote").textContent = "Подтвердите права на контент персонажа.";
        return;
      }

      if (next.name.length < 3) {
        $("#charFormNote").textContent = "Имя персонажа должно быть не короче 3 символов.";
        return;
      }

      upsertCharacter(next);
      $("#charFormNote").textContent = "Сохранено";
      setTimeout(() => {
        if ($("#charFormNote").textContent === "Сохранено") $("#charFormNote").textContent = "";
      }, 900);

      fillCharacterForm();
      if (state.selectedCharacterId === next.id) {
        renderHeader();
        renderMessages();
      }
      refreshChatsView();
    });

    const previewInputs = [
      "#charNameInput",
      "#charIntroInput",
      "#charOutfitInput",
      "#charSettingInput",
      "#charBackstoryInput",
      "#charStyleInput"
    ]
      .map((sel) => $(sel))
      .filter(Boolean);

    const rerenderCharacterHeroFromInputs = () => {
      const c = editingCharacter();
      if (!c) return;
      renderCharacterHeroPreview({
        ...c,
        name: String($("#charNameInput")?.value || "").trim() || c.name,
        gender: String($("#charGenderInput")?.value || c.gender || "unspecified"),
        intro: String($("#charIntroInput")?.value || ""),
        outfit: String($("#charOutfitInput")?.value || ""),
        setting: String($("#charSettingInput")?.value || ""),
        backstory: String($("#charBackstoryInput")?.value || ""),
        dialogueStyle: String($("#charStyleInput")?.value || c.dialogueStyle || "natural")
      });
      syncCharacterCounters();
    };

    for (const input of previewInputs) {
      input.addEventListener("input", rerenderCharacterHeroFromInputs);
      input.addEventListener("change", rerenderCharacterHeroFromInputs);
    }

    ["#charInitialMessageInput", "#charNameInput", "#charIntroInput", "#charBackstoryInput"].forEach((sel) => {
      const input = $(sel);
      if (!input) return;
      input.addEventListener("input", syncCharacterCounters);
      input.addEventListener("change", syncCharacterCounters);
    });

    $("#charAvatarFile").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const url = await fileToDataUrl(file);
        const c = editingCharacter();
        upsertCharacter({ ...c, avatar: url, updatedAt: nowTs() });
        fillCharacterForm();
        refreshChatsView();
      } catch (err) {
        $("#charFormNote").textContent = String(err?.message || err);
      } finally {
        e.target.value = "";
      }
    });

    $("#charBgFile").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const url = await fileToDataUrl(file);
        const c = editingCharacter();
        const next = { ...c, background: url, updatedAt: nowTs() };
        upsertCharacter(next);
        fillCharacterForm();
        if (state.selectedCharacterId === next.id) applyChatBackground(next);
        refreshChatsView();
      } catch (err) {
        $("#charFormNote").textContent = String(err?.message || err);
      } finally {
        e.target.value = "";
      }
    });

    $("#userAvatarFile").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const url = await fileToDataUrl(file);
        state.profile.avatar = url;
        saveJson(STORAGE_KEYS.profile, state.profile);
        fillProfileUI();
        renderHeader();
      } catch (err) {
        setStatus(String(err?.message || err), false);
      } finally {
        e.target.value = "";
      }
    });

    $("#btnSaveProfile").addEventListener("click", () => saveProfileFromUI());

    const profileDataNote = $("#profileDataNote");
    const importAllDataFile = $("#importAllDataFile");
    const btnExportAllData = $("#btnExportAllData");
    if (btnExportAllData) {
      btnExportAllData.addEventListener("click", async () => {
        const payload = buildFullExportPayload();
        const json = JSON.stringify(payload, null, 2);

        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(json);
            if (profileDataNote) profileDataNote.textContent = "Экспортировано в буфер обмена.";
            flashStatus("Экспорт данных завершен", true);
            return;
          }
        } catch {
          // ignore -> fall back to download
        }

        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        const filename = `nlmw-backup-${ts}.json`;
        downloadText(filename, json);
        if (profileDataNote) profileDataNote.textContent = `Экспорт: ${filename}`;
        flashStatus("Экспорт данных завершен", true);
      });
    }

    const btnImportAllData = $("#btnImportAllData");
    if (btnImportAllData) {
      btnImportAllData.addEventListener("click", () => {
        if (importAllDataFile) importAllDataFile.click();
      });
    }

    if (importAllDataFile) {
      importAllDataFile.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        try {
          const text = await file.text();
          const payload = safeJsonParse(text);
          if (!payload) throw new Error("Не удалось прочитать JSON (проверьте формат файла).");

          const ok = window.confirm("Импорт заменит текущие локальные данные (профиль, персонажей и чаты). Продолжить?");
          if (!ok) return;

          await applyImportedAppData(payload);
          if (profileDataNote) profileDataNote.textContent = "Импорт завершен.";
          flashStatus("Импорт данных завершен", true);
        } catch (err) {
          const msg = String(err?.message || err || "Ошибка импорта");
          if (profileDataNote) profileDataNote.textContent = msg;
          flashStatus(msg, false);
        } finally {
          e.target.value = "";
        }
      });
    }

    const modelSelects = [$("#modelSelect"), $("#modelSelectProfile")].filter(Boolean);
    for (const sel of modelSelects) {
      sel.addEventListener("change", (e) => {
        state.modelId = String(e.target.value || "");
        saveJson(STORAGE_KEYS.modelId, state.modelId);
        for (const other of modelSelects) other.value = state.modelId;
        syncModelSelectTitles(modelSelects);
      });
    }

    const providerSel = $("#providerSelect");
    if (providerSel) {
      providerSel.addEventListener("change", (e) => {
        state.provider = String(e.target.value || "lmstudio");
        saveJson(STORAGE_KEYS.provider, state.provider);

        const mistralSection = $("#mistralSettings");
        if (mistralSection) mistralSection.hidden = state.provider !== "mistral";

        state.modelId = "";
        saveJson(STORAGE_KEYS.modelId, "");
        refreshModels();
      });
    }

    let mistralKeyTimer = null;
    const mistralKeyInput = $("#mistralKeyInput");
    if (mistralKeyInput) {
      mistralKeyInput.addEventListener("change", () => {
        state.mistralKey = String(mistralKeyInput.value || "").trim();
        saveJson(STORAGE_KEYS.mistralKey, state.mistralKey);
        if (state.provider === "mistral") refreshModels();
      });

      mistralKeyInput.addEventListener("input", () => {
        state.mistralKey = String(mistralKeyInput.value || "").trim();
        saveJson(STORAGE_KEYS.mistralKey, state.mistralKey);
        if (state.provider !== "mistral") return;
        if (mistralKeyTimer) clearTimeout(mistralKeyTimer);
        mistralKeyTimer = setTimeout(() => {
          refreshModels();
        }, 400);
      });
    }

    const btnOpenPrompts = $("#btnOpenPrompts");
    if (btnOpenPrompts) {
      btnOpenPrompts.addEventListener("click", () => openPromptsSheet());
    }

    const btnPromptQuick = $("#btnPromptQuick");
    if (btnPromptQuick) {
      btnPromptQuick.addEventListener("click", () => openPromptsSheet());
    }

    const promptsSheet = $("#promptsSheet");
    if (promptsSheet) {
      promptsSheet.addEventListener("click", (e) => {
        const t = e.target;
        if (t && t.dataset && t.dataset.closePrompts) closePromptsSheet();
      });
    }

    const btnSavePrompt = $("#btnSavePrompt");
    if (btnSavePrompt) btnSavePrompt.addEventListener("click", () => savePromptFromDraft());

    const btnClearPromptDraft = $("#btnClearPromptDraft");
    if (btnClearPromptDraft) {
      btnClearPromptDraft.addEventListener("click", () => {
        const titleInput = $("#promptTitleInput");
        const textInput = $("#promptTextInput");
        if (titleInput) titleInput.value = "";
        if (textInput) textInput.value = "";
        const note = $("#promptSheetNote");
        if (note) note.textContent = "";
      });
    }

    const btnClearChat = $("#btnClearChat");
    if (btnClearChat) {
      btnClearChat.addEventListener("click", () => {
        const ok = window.confirm("Очистить текущий чат?");
        if (!ok) return;
        clearChatForActiveCharacter();
      });
    }

    const chatSelect = $("#charChatSelect");
    if (chatSelect) {
      chatSelect.addEventListener("change", (e) => {
        const c = editingCharacter();
        const chatId = String(e.target.value || "");
        if (!c || !chatId) return;
        setActiveChat(c.id, chatId);
        ensureInitialMessage();
        if (state.selectedCharacterId === c.id) {
          renderHeader();
          renderMessages();
        }
        refreshChatsView();
        renderChatSelectInSettings(c);
      });
    }

    const btnNewChat = $("#btnNewChatInSettings");
    if (btnNewChat) {
      btnNewChat.addEventListener("click", () => {
        const c = editingCharacter();
        if (!c) return;
        createNewChatForCharacter(c.id);
      });
    }

    const input = $("#userInput");
    input.addEventListener("input", () => autoGrowTextarea(input));

    $("#composerForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (state.generating) return;
      const text = String(input.value || "").trim();
      if (!text) return;
      input.value = "";
      autoGrowTextarea(input);
      await sendMessage(text);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (state.generating) return;
        const text = String(input.value || "").trim();
        if (!text) return;
        $("#composerForm").requestSubmit();
      }
    });

    const hint = $("#composerHint");
    if (hint) hint.textContent = "";
  }

  // Fetch characters from server and merge into local state
  async function syncCharactersFromServer() {
    try {
      const resp = await fetch("/api/characters");
      if (!resp.ok) return;
      const serverChars = await resp.json();
      if (!Array.isArray(serverChars)) return;

      if (serverChars.length === 0 && state.characters.length > 0) {
        // Server empty, push local characters (first-time migration)
        await fetch("/api/characters/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state.characters)
        }).catch(() => {});
        return;
      }

      if (serverChars.length === 0) return;

      // Merge server characters into local state
      const localIds = new Set(state.characters.map((c) => c.id));
      const serverIds = new Set(serverChars.map((c) => c.id));
      let changed = false;

      // Add or update from server
      for (const sc of serverChars) {
        if (!sc || !sc.id) continue;
        const norm = normalizeCharacterRecord(sc);
        const idx = state.characters.findIndex((c) => c.id === norm.id);
        if (idx === -1) {
          state.characters.push(norm);
          changed = true;
        } else {
          const local = state.characters[idx];
          if ((norm.updatedAt || 0) > (local.updatedAt || 0)) {
            state.characters[idx] = norm;
            changed = true;
          }
        }
      }

      // Remove characters that were deleted on server
      const before = state.characters.length;
      state.characters = state.characters.filter((c) => serverIds.has(c.id));
      if (state.characters.length !== before) changed = true;

      if (changed) {
        saveJson(STORAGE_KEYS.characters, state.characters);
        // Fix selected/editing if deleted
        if (!state.characters.some((c) => c.id === state.selectedCharacterId)) {
          state.selectedCharacterId = state.characters[0]?.id || "";
          saveJson(STORAGE_KEYS.selectedCharacterId, state.selectedCharacterId);
        }
        if (!state.characters.some((c) => c.id === state.editingCharacterId)) {
          state.editingCharacterId = state.selectedCharacterId;
        }
        renderChatList($("#chatSearch")?.value || "");
        if (state.view === "chat") {
          renderHeader();
          renderMessages();
        }
      }
    } catch {
      // Server unavailable — keep working with local data
    }
  }

  async function bootstrap() {
    ensureSeed();
    wireUI();
    fillProfileUI();
    await syncCharactersFromServer();
    ensureInitialMessage();
    renderHeader();
    renderMessages();
    setView("chats");
    renderChatList("");
    refreshModels();

    setInterval(syncCharactersFromServer, 15000);
  }

  bootstrap().catch((err) => {
    console.error("[bootstrap]", err);
  });
})();
