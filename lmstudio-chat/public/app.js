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
    savedPrompts: "nlmw.savedPrompts",
    promptFolders: "nlmw.promptFolders",
    groupChats: "nlmw.groupChats",
    activeGroupChatId: "nlmw.activeGroupChatId"
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
    promptFolders: [],
    promptActiveFolder: "__all__",
    editingPromptId: null,
    lmOk: false,
    generating: false,
    msgActionsTargetId: "",
    view: "chats",
    discoverTab: "explore",
    discoverCategory: "all",
    groupChats: [],
    activeGroupChatId: "",
    chatsSubTab: "personal"
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
    state.promptFolders = loadJson(STORAGE_KEYS.promptFolders, []);

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
    if (!Array.isArray(state.promptFolders)) state.promptFolders = [];

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
        folderId: typeof x.folderId === "string" ? x.folderId : "",
        createdAt: typeof x.createdAt === "number" && Number.isFinite(x.createdAt) ? x.createdAt : nowTs(),
        updatedAt: typeof x.updatedAt === "number" && Number.isFinite(x.updatedAt) ? x.updatedAt : nowTs()
      }))
      .filter((x) => x.text);
    saveJson(STORAGE_KEYS.savedPrompts, state.savedPrompts);

    state.promptFolders = state.promptFolders
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        id: typeof x.id === "string" && x.id.trim() ? x.id.trim() : uuid(),
        name: clampText(String(x.name || "").trim() || "Папка", 40),
        createdAt: typeof x.createdAt === "number" && Number.isFinite(x.createdAt) ? x.createdAt : nowTs()
      }));
    saveJson(STORAGE_KEYS.promptFolders, state.promptFolders);
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
      initialMessage: greeting,
      source_url: String(obj.source_url ?? obj.sourceUrl ?? "").trim()
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
    // Collect existing source_urls to prevent duplicate imports
    const existingSourceUrls = new Set(
      state.characters.map((c) => c.source_url).filter(Boolean)
    );
    let imported = 0;
    let firstId = "";

    for (const raw of items) {
      const c = normalizeImportedCharacter(raw);
      if (!c) continue;

      // Skip if a character with the same source_url already exists
      if (c.source_url && existingSourceUrls.has(c.source_url)) continue;

      // Avoid id collisions.
      let id = c.id;
      if (!id || existingIds.has(id)) id = uuid();
      c.id = id;
      if (!firstId) firstId = id;
      existingIds.add(id);
      if (c.source_url) existingSourceUrls.add(c.source_url);

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
        savedPrompts: state.savedPrompts,
        promptFolders: state.promptFolders
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
    saveJson(STORAGE_KEYS.promptFolders, Array.isArray(src.promptFolders) ? src.promptFolders : []);

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

    const tempCharacters = Array.isArray(raw?.tempCharacters)
      ? raw.tempCharacters.map(normalizeTempCharacter).filter(Boolean)
      : [];

    return { id, title, createdAt, updatedAt, messages, tempCharacters };
  }

  function normalizeTempCharacter(raw) {
    if (!raw || typeof raw !== "object") return null;
    return {
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : uuid(),
      name: String(raw.name || "").trim() || "НПС",
      gender: normalizeGender(raw.gender),
      intro: String(raw.intro || "").trim(),
      avatar: typeof raw.avatar === "string" ? raw.avatar : "",
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : nowTs()
    };
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
      const searchable = `${item.character.name || ""} ${item.summary} ${item.tags.join(" ")}`.toLowerCase();
      return !q || searchable.includes(q);
    });

    {
      // Messenger-style list for chats
      const list = document.createElement("div");
      list.className = "messengerList";

      let lastDateGroup = null;
      for (const item of visible) {
        const { character, snapshot } = item;
        const group = getDateGroup(item.time);
        if (group && group !== lastDateGroup) {
          const sep = document.createElement("div");
          sep.className = "messengerList__dateSep";
          sep.textContent = group;
          list.appendChild(sep);
          lastDateGroup = group;
        }

        const row = document.createElement("button");
        row.type = "button";
        row.className = "messengerItem";

        const avatar = document.createElement("img");
        avatar.className = "messengerItem__avatar";
        setImg(avatar, getBestCharacterDisplayImage(character), character.name);

        const info = document.createElement("div");
        info.className = "messengerItem__info";

        const name = document.createElement("div");
        name.className = "messengerItem__name";
        name.textContent = character.name || "(без имени)";

        const preview = document.createElement("div");
        preview.className = "messengerItem__preview";
        preview.textContent = messengerPreview(character, snapshot);

        info.appendChild(name);
        info.appendChild(preview);

        const menuBtn = document.createElement("button");
        menuBtn.type = "button";
        menuBtn.className = "messengerItem__menuBtn";
        menuBtn.innerHTML = "&#x2026;";
        menuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          showMessengerMenu(character, e);
        });

        row.appendChild(avatar);
        row.appendChild(info);
        row.appendChild(menuBtn);
        row.addEventListener("click", () => openCharacterChat(character.id, snapshot.chat?.id || ""));
        list.appendChild(row);
      }

      shell.appendChild(list);
    }
    el.appendChild(shell);

    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chatList__empty";
      empty.textContent = q
        ? "Ничего не найдено по этому запросу."
        : "Нет персонажей. Откройте импорт и загрузите карточки Polybuzz.";
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

  // ─── NPC (temporary in-chat characters) ────────────────────────────────────

  function getTempCharactersForChat(characterId) {
    const chat = activeChatFor(characterId);
    return Array.isArray(chat?.tempCharacters) ? chat.tempCharacters : [];
  }

  function saveTempCharacters(characterId, npcs) {
    const bucket = conversationBucketFor(characterId);
    const chat = activeChatFor(characterId);
    if (!chat) return;
    chat.tempCharacters = npcs;
    const idx = bucket.chats.findIndex((c) => c.id === chat.id);
    if (idx >= 0) bucket.chats[idx] = chat;
    state.conversations[characterId] = bucket;
    saveJson(STORAGE_KEYS.conversations, state.conversations);
  }

  function addTempCharacter(characterId, npcData) {
    const npcs = getTempCharactersForChat(characterId).slice();
    npcs.push(normalizeTempCharacter({ ...npcData, id: uuid(), createdAt: nowTs() }));
    saveTempCharacters(characterId, npcs);
  }

  function updateTempCharacter(characterId, npcId, patch) {
    const npcs = getTempCharactersForChat(characterId).map((n) =>
      n.id === npcId ? normalizeTempCharacter({ ...n, ...patch }) : n
    );
    saveTempCharacters(characterId, npcs);
  }

  function deleteTempCharacter(characterId, npcId) {
    const npcs = getTempCharactersForChat(characterId).filter((n) => n.id !== npcId);
    saveTempCharacters(characterId, npcs);
    // Mark the NPC's messages as deleted
    const history = chatHistoryFor(characterId).map((m) =>
      m.npcId === npcId ? { ...m, npcDeleted: true } : m
    );
    setChatHistory(characterId, history);
  }

  // ───────────────────────────────────────────────────────────────────────────

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

  // ── Group Chats ──

  function defaultGroupChat() {
    return {
      id: uuid(),
      title: "Групповой чат",
      characterIds: [],
      messages: [],
      createdAt: nowTs(),
      updatedAt: nowTs()
    };
  }

  function normalizeGroupChat(raw) {
    if (!raw || typeof raw !== "object") return defaultGroupChat();
    return {
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id : uuid(),
      title: String(raw.title || "Групповой чат").trim(),
      characterIds: Array.isArray(raw.characterIds) ? raw.characterIds.filter((x) => typeof x === "string" && x.trim()) : [],
      messages: Array.isArray(raw.messages) ? raw.messages : [],
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : nowTs(),
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : nowTs()
    };
  }

  function loadGroupChats() {
    const raw = loadJson(STORAGE_KEYS.groupChats, []);
    state.groupChats = Array.isArray(raw) ? raw.map(normalizeGroupChat) : [];
    state.activeGroupChatId = String(loadJson(STORAGE_KEYS.activeGroupChatId, ""));
  }

  function saveGroupChats() {
    saveJson(STORAGE_KEYS.groupChats, state.groupChats);
  }

  function saveActiveGroupChatId() {
    saveJson(STORAGE_KEYS.activeGroupChatId, state.activeGroupChatId);
  }

  function activeGroupChat() {
    return state.groupChats.find((g) => g.id === state.activeGroupChatId) || null;
  }

  function createGroupChat(title, characterIds) {
    const gc = normalizeGroupChat({
      title: title || "Групповой чат",
      characterIds
    });
    state.groupChats.unshift(gc);
    state.activeGroupChatId = gc.id;
    saveGroupChats();
    saveActiveGroupChatId();

    // Add initial greeting messages from all characters
    const msgs = [];
    for (const cid of gc.characterIds) {
      const ch = state.characters.find((c) => c.id === cid);
      if (!ch) continue;
      const initial = (ch.initialMessage || "").trim();
      const content = initial || `Привет. Я ${ch.name}.`;
      msgs.push({ id: uuid(), role: "assistant", characterId: cid, content, ts: nowTs() + msgs.length });
    }
    gc.messages = msgs;
    gc.updatedAt = nowTs();
    saveGroupChats();
    return gc;
  }

  function deleteGroupChat(gcId) {
    state.groupChats = state.groupChats.filter((g) => g.id !== gcId);
    if (state.activeGroupChatId === gcId) {
      state.activeGroupChatId = state.groupChats[0]?.id || "";
    }
    saveGroupChats();
    saveActiveGroupChatId();
  }

  function setGroupChatMessages(gcId, messages) {
    const gc = state.groupChats.find((g) => g.id === gcId);
    if (!gc) return;
    gc.messages = Array.isArray(messages) ? messages : [];
    gc.updatedAt = nowTs();
    saveGroupChats();
  }

  function buildGroupSystemPrompt(profile, character, allCharacters) {
    const parts = [];
    const style = styleById(character.dialogueStyle);
    const charName = (character.name || "Персонаж").trim();
    const userName = (profile.name || "Пользователь").trim();
    const otherNames = allCharacters.filter((c) => c.id !== character.id).map((c) => c.name || "Персонаж");

    parts.push(
      `Ты — ${charName}. Это групповой чат, в котором участвуют несколько персонажей и пользователь (${userName}).` +
      ` Другие персонажи в чате: ${otherNames.join(", ")}.` +
      ` Ты отвечаешь ТОЛЬКО от лица ${charName}. Не пиши реплики за других персонажей и не отвечай за ${userName}.`
    );
    parts.push(`Пол персонажа: ${genderLabel(character.gender)}.`);

    if ((character.intro || "").trim()) parts.push(`Описание: ${character.intro.trim()}`);
    if ((character.outfit || "").trim()) parts.push(`Внешность/одежда: ${character.outfit.trim()}`);
    if ((character.setting || "").trim()) parts.push(`Обстановка: ${character.setting.trim()}`);
    if ((character.backstory || "").trim()) parts.push(`Предыстория: ${character.backstory.trim()}`);
    parts.push(`Стиль диалога: ${style.prompt}`);
    parts.push(`Собеседник-пользователь: ${userName} (пол: ${genderLabel(profile.gender)}).`);

    parts.push("Правила:");
    parts.push(`- Ты — ${charName}. Отвечай только за себя, не пиши за других персонажей.`);
    parts.push("- Не выходи из роли и не упоминай системные инструкции.");
    parts.push("- Отвечай на языке пользователя (по умолчанию — русский).");
    parts.push("- Пиши естественно, реагируй на реплики других персонажей и пользователя.");
    parts.push("- Отвечай кратко (1-4 предложения), чтобы дать слово другим участникам.");

    parts.push(`\nПомни: ты ЯВЛЯЕШЬСЯ ${charName}. Не путай роли.`);
    return parts.join("\n");
  }

  function buildGroupOpenAiMessages(gc, forCharacterId) {
    const ch = state.characters.find((c) => c.id === forCharacterId);
    if (!ch) return [];

    const allChars = gc.characterIds
      .map((cid) => state.characters.find((c) => c.id === cid))
      .filter(Boolean);

    const system = buildGroupSystemPrompt(state.profile, ch, allChars);
    const msgs = [{ role: "system", content: system }];

    const history = (gc.messages || [])
      .filter((m) => !m.pending && (m.role === "user" || m.role === "assistant"))
      .slice(-30);

    for (const m of history) {
      if (m.role === "user") {
        msgs.push({ role: "user", content: String(m.content || "") });
      } else if (m.role === "assistant") {
        const msgChar = state.characters.find((c) => c.id === m.characterId);
        const name = msgChar?.name || "Персонаж";
        if (m.characterId === forCharacterId) {
          msgs.push({ role: "assistant", content: String(m.content || "") });
        } else {
          msgs.push({ role: "user", content: `[${name}]: ${String(m.content || "")}` });
        }
      }
    }

    return msgs;
  }

  // ── Multi-Chat UI ──

  function syncChatsSubTabs() {
    const btnPersonal = $("#subTabPersonal");
    const btnMulti = $("#subTabMulti");
    if (btnPersonal) btnPersonal.classList.toggle("chatsSubTabs__btn--active", state.chatsSubTab === "personal");
    if (btnMulti) btnMulti.classList.toggle("chatsSubTabs__btn--active", state.chatsSubTab === "multi");
  }

  function renderGroupChatList(filterText) {
    const el = $("#chatList");
    if (!el) return;
    el.innerHTML = "";
    const q = String(filterText || "").trim().toLowerCase();

    const shell = document.createElement("div");
    shell.className = "discoverShell";

    // "Create new multi-chat" button
    const createBtn = document.createElement("button");
    createBtn.type = "button";
    createBtn.className = "multiCreateBtn";
    createBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;flex-shrink:0"><path d="M12 5v14"/><path d="M5 12h14"/></svg> <span>Создать мульти-чат</span>';
    createBtn.addEventListener("click", () => openMultiChatModal());
    shell.appendChild(createBtn);

    const list = document.createElement("div");
    list.className = "messengerList";

    const gcs = state.groupChats.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    let visibleCount = 0;
    for (const gc of gcs) {
      const chars = gc.characterIds
        .map((cid) => state.characters.find((c) => c.id === cid))
        .filter(Boolean);
      const names = chars.map((c) => c.name || "?").join(", ");
      const searchable = `${gc.title} ${names}`.toLowerCase();
      if (q && !searchable.includes(q)) continue;
      visibleCount++;

      const lastMsg = gc.messages[gc.messages.length - 1];
      const preview = lastMsg ? clampText(cleanOneLineText(lastMsg.content || ""), 80) : "Нет сообщений";

      const row = document.createElement("button");
      row.type = "button";
      row.className = "messengerItem";

      // Stacked avatars
      const avatarWrap = document.createElement("div");
      avatarWrap.className = "groupAvatarStack";
      const showChars = chars.slice(0, 3);
      showChars.forEach((ch, i) => {
        const img = document.createElement("img");
        img.className = "groupAvatarStack__img";
        img.style.zIndex = String(showChars.length - i);
        setImg(img, getBestCharacterDisplayImage(ch), ch.name);
        avatarWrap.appendChild(img);
      });
      if (chars.length > 3) {
        const more = document.createElement("span");
        more.className = "groupAvatarStack__more";
        more.textContent = `+${chars.length - 3}`;
        avatarWrap.appendChild(more);
      }

      const info = document.createElement("div");
      info.className = "messengerItem__info";

      const nameEl = document.createElement("div");
      nameEl.className = "messengerItem__name";
      nameEl.textContent = gc.title || "Мульти-чат";

      const previewEl = document.createElement("div");
      previewEl.className = "messengerItem__preview";
      previewEl.textContent = preview;

      info.appendChild(nameEl);
      info.appendChild(previewEl);

      const menuBtn = document.createElement("button");
      menuBtn.type = "button";
      menuBtn.className = "messengerItem__menuBtn";
      menuBtn.innerHTML = "&#x2026;";
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showGroupChatMenu(gc, e);
      });

      row.appendChild(avatarWrap);
      row.appendChild(info);
      row.appendChild(menuBtn);
      row.addEventListener("click", () => openGroupChat(gc.id));
      list.appendChild(row);
    }

    shell.appendChild(list);
    el.appendChild(shell);

    if (visibleCount === 0 && gcs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chatList__empty";
      empty.textContent = "Нет мульти-чатов. Создайте первый!";
      el.appendChild(empty);
    }
  }

  function showGroupChatMenu(gc, event) {
    closeMessengerDropdown();
    const overlay = document.createElement("div");
    overlay.className = "messengerDropdown__overlay";
    overlay.addEventListener("click", closeMessengerDropdown);

    const menu = document.createElement("div");
    menu.className = "messengerDropdown";

    const btnOpen = document.createElement("button");
    btnOpen.type = "button";
    btnOpen.className = "messengerDropdown__item";
    btnOpen.textContent = "Открыть чат";
    btnOpen.addEventListener("click", () => { closeMessengerDropdown(); openGroupChat(gc.id); });

    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "messengerDropdown__item messengerDropdown__item--danger";
    btnDelete.textContent = "Удалить";
    btnDelete.addEventListener("click", () => {
      closeMessengerDropdown();
      if (!window.confirm("Удалить этот мульти-чат?")) return;
      deleteGroupChat(gc.id);
      refreshChatsView();
    });

    menu.appendChild(btnOpen);
    menu.appendChild(btnDelete);

    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = rect.bottom + "px";
    menu.style.right = (window.innerWidth - rect.right) + "px";

    document.body.appendChild(overlay);
    document.body.appendChild(menu);
  }

  function openGroupChat(gcId) {
    state.activeGroupChatId = gcId;
    saveActiveGroupChatId();
    renderGroupChatHeader();
    renderGroupMessages();
    setView("groupchat");
  }

  function renderGroupChatHeader() {
    const gc = activeGroupChat();
    if (!gc) return;
    const chars = gc.characterIds
      .map((cid) => state.characters.find((c) => c.id === cid))
      .filter(Boolean);

    const nameEl = $("#groupChatName");
    const metaEl = $("#groupChatMeta");
    const avatarsEl = $("#groupAvatars");
    if (nameEl) nameEl.textContent = gc.title || "Мульти-чат";
    if (metaEl) metaEl.textContent = chars.map((c) => c.name).join(", ");

    if (avatarsEl) {
      avatarsEl.innerHTML = "";
      chars.slice(0, 4).forEach((ch) => {
        const img = document.createElement("img");
        img.className = "groupAvatars__img";
        setImg(img, getBestCharacterDisplayImage(ch), ch.name);
        avatarsEl.appendChild(img);
      });
    }
  }

  function renderGroupMessages() {
    const gc = activeGroupChat();
    const list = $("#groupMessages");
    if (!list || !gc) return;
    list.innerHTML = "";

    const disclaimer = document.createElement("div");
    disclaimer.className = "chatDisclaimer";
    disclaimer.textContent = "Мульти-чат: все персонажи отвечают по очереди.";
    list.appendChild(disclaimer);

    for (const m of gc.messages) {
      const row = document.createElement("div");

      if (m.role === "user") {
        row.className = "msg msg--me";

        const avatar = document.createElement("img");
        avatar.className = "avatar avatar--me";
        setImg(avatar, state.profile?.avatar, state.profile?.name);

        const bubbleWrap = document.createElement("div");
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        renderBubbleContent(bubble, m.content, { role: "user", characterName: "" });

        const meta = document.createElement("div");
        meta.className = "msg__meta";
        meta.textContent = m.ts ? formatTime(m.ts) : "";

        bubbleWrap.appendChild(bubble);
        bubbleWrap.appendChild(meta);
        row.appendChild(bubbleWrap);
        row.appendChild(avatar);
      } else {
        const ch = state.characters.find((c) => c.id === m.characterId);
        row.className = "msg msg--group";

        const avatar = document.createElement("img");
        avatar.className = "avatar";
        setImg(avatar, ch ? getBestCharacterDisplayImage(ch) : "", ch?.name || "?");

        const bubbleWrap = document.createElement("div");

        const charLabel = document.createElement("div");
        charLabel.className = "msg__charName";
        charLabel.textContent = ch?.name || "Персонаж";

        const bubble = document.createElement("div");
        bubble.className = "bubble";
        if (m.pending) {
          bubble.textContent = "...";
          bubble.classList.add("bubble--pending");
        } else {
          renderBubbleContent(bubble, m.content, { role: "assistant", characterName: ch?.name || "" });
        }

        const meta = document.createElement("div");
        meta.className = "msg__meta";
        meta.textContent = m.ts ? formatTime(m.ts) : "";

        bubbleWrap.appendChild(charLabel);
        bubbleWrap.appendChild(bubble);
        bubbleWrap.appendChild(meta);
        row.appendChild(avatar);
        row.appendChild(bubbleWrap);
      }

      row.dataset.msgId = m.id;
      list.appendChild(row);
    }

    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  }

  function getGroupStreamingBubble(msgId) {
    const list = $("#groupMessages");
    if (!list) return null;
    const row = list.querySelector(`[data-msg-id="${msgId}"]`);
    return row ? row.querySelector(".bubble") : null;
  }

  async function sendGroupMessage(userText) {
    const gc = activeGroupChat();
    if (!gc) return;
    if (!state.lmOk) {
      const hint = $("#groupComposerHint");
      if (hint) hint.textContent = `${providerLabel()} недоступна.`;
      return;
    }
    if (state.generating) return;

    // Add user message
    const userMsg = { id: uuid(), role: "user", content: userText, ts: nowTs() };
    gc.messages.push(userMsg);
    gc.updatedAt = nowTs();
    saveGroupChats();
    renderGroupMessages();

    setGenerating(true);
    const hint = $("#groupComposerHint");
    if (hint) hint.textContent = "Генерирую ответы...";

    // Each character responds sequentially
    for (const cid of gc.characterIds) {
      const ch = state.characters.find((c) => c.id === cid);
      if (!ch) continue;

      const placeholderId = uuid();
      const placeholder = { id: placeholderId, role: "assistant", characterId: cid, content: "...", ts: nowTs(), pending: true };
      gc.messages.push(placeholder);
      saveGroupChats();
      renderGroupMessages();

      try {
        let content;

        if (state.provider === "mistral") {
          const messages = buildGroupOpenAiMessages(gc, cid);
          const bubble = getGroupStreamingBubble(placeholderId);
          const listEl = $("#groupMessages");

          // Stream manually for group chat
          const headers = { "Content-Type": "application/json" };
          if (state.mistralKey) headers["X-Mistral-Key"] = state.mistralKey;
          const payload = {
            model: state.modelId || "mistral-small-latest",
            messages,
            temperature: 0.75,
            stream: true
          };
          const res = await fetch("/api/mistral/chat", { method: "POST", headers, body: JSON.stringify(payload) });
          if (!res.ok) {
            const text = await res.text();
            const data = safeJsonParse(text);
            throw new Error(data?.error?.message || data?.error || `Mistral error (${res.status})`);
          }

          let generated = "";
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
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
              const delta = chunk.choices?.[0]?.delta?.content;
              if (typeof delta === "string") {
                generated += delta;
                if (bubble) {
                  renderBubbleContent(bubble, generated, { role: "assistant", characterName: ch.name });
                  if (listEl) listEl.scrollTop = listEl.scrollHeight;
                }
              }
            }
          }
          content = generated.trim() || "(пустой ответ)";
        } else {
          // LM Studio
          const allChars = gc.characterIds.map((id) => state.characters.find((c) => c.id === id)).filter(Boolean);
          const systemPrompt = buildGroupSystemPrompt(state.profile, ch, allChars);

          // Build input text from recent messages
          const recentMsgs = gc.messages.filter((m) => !m.pending).slice(-20);
          const inputLines = [];
          for (const m of recentMsgs) {
            if (m.role === "user") {
              inputLines.push(`${state.profile?.name || "Пользователь"}: ${m.content}`);
            } else {
              const mc = state.characters.find((c) => c.id === m.characterId);
              inputLines.push(`${mc?.name || "Персонаж"}: ${m.content}`);
            }
          }
          const inputText = inputLines.join("\n");

          const bubble = getGroupStreamingBubble(placeholderId);
          const listEl = $("#groupMessages");

          const payload = {
            api: "rest",
            model: state.modelId || "local-model",
            input: inputText,
            temperature: 0.75,
            stream: true,
            store: false,
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
            throw new Error(data?.error || `LM Studio error (${res.status})`);
          }

          let generated = "";
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("text/event-stream") && res.body) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split("\n");
              buf = lines.pop() || "";
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data:")) continue;
                const jsonStr = trimmed.slice(5).trim();
                if (jsonStr === "[DONE]") continue;
                const chunk = safeJsonParse(jsonStr);
                if (!chunk) continue;
                // REST v1 streaming
                if (chunk.type === "content.delta" && typeof chunk.delta === "string") {
                  generated += chunk.delta;
                } else if (chunk.choices?.[0]?.delta?.content) {
                  generated += chunk.choices[0].delta.content;
                } else if (chunk.type === "response.completed" && chunk.response) {
                  const respText = extractRestMessagesFromResult(chunk.response);
                  if (respText && !generated) generated = respText;
                }
                if (bubble) {
                  renderBubbleContent(bubble, generated, { role: "assistant", characterName: ch.name });
                  if (listEl) listEl.scrollTop = listEl.scrollHeight;
                }
              }
            }
          } else {
            const text = await res.text();
            const data = safeJsonParse(text);
            generated = extractRestMessagesFromResult(data) || extractChatTextFromResponse(data) || "";
          }
          content = generated.trim() || "(пустой ответ)";
        }

        // Replace placeholder with final content
        const idx = gc.messages.findIndex((m) => m.id === placeholderId);
        if (idx >= 0) {
          gc.messages[idx] = { id: placeholderId, role: "assistant", characterId: cid, content, ts: nowTs() };
        }
        gc.updatedAt = nowTs();
        saveGroupChats();
        renderGroupMessages();

      } catch (err) {
        const msg = String(err?.message || err || "Ошибка");
        const idx = gc.messages.findIndex((m) => m.id === placeholderId);
        if (idx >= 0) {
          gc.messages[idx] = { id: placeholderId, role: "assistant", characterId: cid, content: `Ошибка: ${msg}`, ts: nowTs() };
        }
        gc.updatedAt = nowTs();
        saveGroupChats();
        renderGroupMessages();
      }
    }

    setGenerating(false);
    if (hint) hint.textContent = "";
    refreshChatsView();
  }

  // Multi-chat modal
  function openMultiChatModal() {
    const modal = $("#multiChatModal");
    if (!modal) return;
    modal.hidden = false;

    const titleInput = $("#multiChatTitle");
    if (titleInput) titleInput.value = "";

    const noteEl = $("#multiModalNote");
    if (noteEl) noteEl.textContent = "";

    renderMultiCharPicker();
  }

  function closeMultiChatModal() {
    const modal = $("#multiChatModal");
    if (modal) modal.hidden = true;
  }

  function renderMultiCharPicker() {
    const el = $("#multiCharPicker");
    if (!el) return;
    el.innerHTML = "";

    for (const ch of state.characters) {
      const item = document.createElement("label");
      item.className = "multiCharPicker__item";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "multiCharPicker__cb";
      cb.value = ch.id;

      const avatar = document.createElement("img");
      avatar.className = "multiCharPicker__avatar";
      setImg(avatar, getBestCharacterDisplayImage(ch), ch.name);

      const name = document.createElement("span");
      name.className = "multiCharPicker__name";
      name.textContent = ch.name || "(без имени)";

      item.appendChild(cb);
      item.appendChild(avatar);
      item.appendChild(name);
      el.appendChild(item);
    }
  }

  function createMultiChatFromModal() {
    const titleInput = $("#multiChatTitle");
    const noteEl = $("#multiModalNote");
    const picker = $("#multiCharPicker");
    if (!picker) return;

    const selected = [];
    picker.querySelectorAll(".multiCharPicker__cb:checked").forEach((cb) => {
      selected.push(cb.value);
    });

    if (selected.length < 2) {
      if (noteEl) noteEl.textContent = "Выберите минимум 2 персонажа.";
      return;
    }

    const title = String(titleInput?.value || "").trim() || "Мульти-чат";
    const gc = createGroupChat(title, selected);
    closeMultiChatModal();
    openGroupChat(gc.id);
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
    const v = next === "chat" || next === "profile" || next === "polybuzz" || next === "groupchat" ? next : "chats";
    state.view = v;

    const views = {
      chats: $("#viewChats"),
      chat: $("#viewChat"),
      groupchat: $("#viewGroupChat"),
      polybuzz: $("#viewPolybuzz"),
      profile: $("#viewProfile")
    };

    for (const k of Object.keys(views)) {
      const el = views[k];
      if (!el) continue;
      el.classList.toggle("view--active", k === v);
    }

    const appbarChats = $("#appbarChats");
    const appbarChat = $("#appbarChat");
    const appbarGroupChat = $("#appbarGroupChat");
    const appbarPolybuzz = $("#appbarPolybuzz");
    const appbarProfile = $("#appbarProfile");
    if (appbarChats) appbarChats.hidden = v !== "chats";
    if (appbarChat) appbarChat.hidden = v !== "chat";
    if (appbarGroupChat) appbarGroupChat.hidden = v !== "groupchat";
    if (appbarPolybuzz) appbarPolybuzz.hidden = v !== "polybuzz";
    if (appbarProfile) appbarProfile.hidden = v !== "profile";

    const tChats = $("#tabChats");
    const tPolybuzz = $("#tabPolybuzz");
    const tProfile = $("#tabProfile");
    if (tChats) tChats.classList.toggle("tab--active", v === "chats" || v === "chat" || v === "groupchat");
    if (tPolybuzz) tPolybuzz.classList.toggle("tab--active", v === "polybuzz");
    if (tProfile) tProfile.classList.toggle("tab--active", v === "profile");

    // Sidebar active state
    const sChats = $("#sideChats");
    const sPolybuzz = $("#sidePolybuzz");
    const sProfile = $("#sideProfile");
    const sPlus = $("#sidePlus");
    if (sChats) sChats.classList.toggle("sidebar__item--active", v === "chats" || v === "chat" || v === "groupchat");
    if (sPolybuzz) sPolybuzz.classList.toggle("sidebar__item--active", v === "polybuzz");
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

  function getDateGroup(ts) {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      const now = new Date();
      const sameDay =
        d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      if (sameDay) return "Сегодня";
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (
        d.getFullYear() === yesterday.getFullYear() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getDate() === yesterday.getDate()
      )
        return "Вчера";
      return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    } catch {
      return "";
    }
  }

  function messengerPreview(character, snapshot) {
    if (snapshot?.last?.content) {
      const text = cleanOneLineText(snapshot.last.content);
      if (text) return clampText(text, 80);
    }
    return characterSummary(character, snapshot);
  }

  function closeMessengerDropdown() {
    document.querySelectorAll(".messengerDropdown, .messengerDropdown__overlay").forEach((el) => el.remove());
  }

  function showMessengerMenu(character, event) {
    closeMessengerDropdown();
    const rect = event.currentTarget.getBoundingClientRect();

    const overlay = document.createElement("div");
    overlay.className = "messengerDropdown__overlay";
    overlay.addEventListener("click", closeMessengerDropdown);

    const menu = document.createElement("div");
    menu.className = "messengerDropdown";

    const btnOpen = document.createElement("button");
    btnOpen.type = "button";
    btnOpen.className = "messengerDropdown__item";
    btnOpen.textContent = "Открыть чат";
    btnOpen.addEventListener("click", () => {
      closeMessengerDropdown();
      const snap = latestChatSnapshotForCharacter(character.id);
      openCharacterChat(character.id, snap.chat?.id || "");
    });

    const btnSettings = document.createElement("button");
    btnSettings.type = "button";
    btnSettings.className = "messengerDropdown__item";
    btnSettings.textContent = "Настройки персонажа";
    btnSettings.addEventListener("click", () => {
      closeMessengerDropdown();
      state.editingCharacterId = character.id;
      fillCharacterForm();
      const modal = $("#charactersModal");
      if (modal) modal.hidden = false;
    });

    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "messengerDropdown__item messengerDropdown__item--danger";
    btnDelete.textContent = "Удалить";
    btnDelete.addEventListener("click", () => {
      closeMessengerDropdown();
      if (state.characters.length <= 1) {
        alert("Нельзя удалить последнего персонажа.");
        return;
      }
      if (!window.confirm(`Удалить персонажа "${character.name}"?`)) return;
      deleteCharacter(character.id);
      ensureInitialMessage();
      renderHeader();
      renderMessages();
      renderChatList($("#chatSearch")?.value || "");
    });

    menu.appendChild(btnOpen);
    menu.appendChild(btnSettings);
    menu.appendChild(btnDelete);

    document.body.appendChild(overlay);
    document.body.appendChild(menu);

    // Position the dropdown
    const menuW = 190;
    let left = rect.right - menuW;
    let top = rect.bottom + 4;
    if (left < 8) left = 8;
    if (top + 160 > window.innerHeight) top = rect.top - 160;
    menu.style.left = left + "px";
    menu.style.top = top + "px";
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

  function openMsgActions(msgId, pointerEvent) {
    const ch = activeCharacter();
    if (!ch) return;

    const { msg } = findMessageById(ch.id, msgId);
    if (!msg) return;

    state.msgActionsTargetId = msgId;

    const menu = $("#ctxMenu");
    const popup = $("#ctxMenuPopup");
    const btnEdit = $("#ctxEdit");
    if (!menu || !popup) return;

    // Only show edit for user messages and when not generating
    const disabled = !!msg.pending || state.generating;
    if (btnEdit) {
      btnEdit.hidden = msg.role !== "user" || disabled;
    }

    menu.hidden = false;

    // Position the popup near the message bubble
    const bubbleEl = document.querySelector(`.msg[data-msg-id="${msgId}"] .bubble`);
    const rect = bubbleEl ? bubbleEl.getBoundingClientRect() : null;

    requestAnimationFrame(() => {
      const popW = popup.offsetWidth;
      const popH = popup.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 12;

      let x, y;
      if (rect) {
        // Place above or below the bubble, aligned to its horizontal center
        const cx = rect.left + rect.width / 2;
        x = Math.max(pad, Math.min(cx - popW / 2, vw - popW - pad));

        const spaceAbove = rect.top;
        const spaceBelow = vh - rect.bottom;
        if (spaceBelow >= popH + pad || spaceBelow >= spaceAbove) {
          y = Math.min(rect.bottom + 8, vh - popH - pad);
          popup.style.setProperty("--ctx-origin", "center top");
        } else {
          y = Math.max(pad, rect.top - popH - 8);
          popup.style.setProperty("--ctx-origin", "center bottom");
        }
      } else if (pointerEvent) {
        x = Math.max(pad, Math.min(pointerEvent.clientX - popW / 2, vw - popW - pad));
        y = Math.max(pad, Math.min(pointerEvent.clientY + 8, vh - popH - pad));
        popup.style.setProperty("--ctx-origin", "center top");
      } else {
        x = (vw - popW) / 2;
        y = (vh - popH) / 2;
        popup.style.setProperty("--ctx-origin", "center center");
      }

      popup.style.left = `${x}px`;
      popup.style.top = `${y}px`;

      // Re-trigger animation
      popup.style.animation = "none";
      popup.offsetHeight; // force reflow
      popup.style.animation = "";
    });

    // Haptic feedback on mobile
    if (navigator.vibrate) navigator.vibrate(25);
  }

  function closeMsgActions() {
    const menu = $("#ctxMenu");
    if (menu) menu.hidden = true;
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
    // Only allow editing user messages
    if (msg.role !== "user") return;

    const bubbleEl = document.querySelector(`.msg[data-msg-id="${msgId}"] .bubble`);
    if (!bubbleEl) return;

    // Already editing?
    if (bubbleEl.querySelector(".msg__editWrap")) return;

    const current = String(msg.content || "");

    // Save original content and replace bubble with edit UI
    const origHTML = bubbleEl.innerHTML;

    const wrap = document.createElement("div");
    wrap.className = "msg__editWrap";

    const textarea = document.createElement("textarea");
    textarea.className = "msg__editArea";
    textarea.value = current;
    textarea.rows = Math.min(8, Math.max(2, current.split("\n").length));

    const actions = document.createElement("div");
    actions.className = "msg__editActions";

    const btnCancel = document.createElement("button");
    btnCancel.className = "msg__editBtn msg__editBtn--cancel";
    btnCancel.type = "button";
    btnCancel.textContent = "Отмена";

    const btnSave = document.createElement("button");
    btnSave.className = "msg__editBtn msg__editBtn--save";
    btnSave.type = "button";
    btnSave.textContent = "Сохранить и отправить";

    actions.appendChild(btnCancel);
    actions.appendChild(btnSave);
    wrap.appendChild(textarea);
    wrap.appendChild(actions);

    bubbleEl.innerHTML = "";
    bubbleEl.appendChild(wrap);

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Auto-resize textarea
    const autoResize = () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(200, textarea.scrollHeight) + "px";
    };
    textarea.addEventListener("input", autoResize);
    autoResize();

    // Cancel: restore original bubble
    btnCancel.addEventListener("click", () => {
      bubbleEl.innerHTML = origHTML;
    });

    // Save: update message, truncate subsequent messages, regenerate
    btnSave.addEventListener("click", () => {
      const newText = textarea.value.trim();
      if (!newText) return;

      applyEditAndRegenerate(characterId, msgId, newText);
    });

    // Ctrl+Enter to save
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        btnSave.click();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        btnCancel.click();
      }
    });
  }

  async function applyEditAndRegenerate(characterId, msgId, newText) {
    const ch = state.characters.find((c) => c.id === characterId);
    if (!ch) return;

    const history = chatHistoryFor(characterId);
    const msgIdx = history.findIndex((m) => m?.id === msgId);
    if (msgIdx === -1) return;

    const msg = history[msgIdx];
    if (!msg || msg.role !== "user") return;

    // --- Branch logic: save current content + tail into branchVersions ---
    const isLastMsg = msgIdx === history.length - 1;
    const currentTail = isLastMsg ? [] : history.slice(msgIdx + 1);
    const existingBranches = Array.isArray(msg.branchVersions) ? [...msg.branchVersions] : [];
    const currentBranchIdx = typeof msg.activeBranchIdx === "number" ? msg.activeBranchIdx : 0;

    // Save current version if first time, or update the current slot
    if (existingBranches.length === 0) {
      existingBranches.push({ content: msg.content, tail: currentTail });
    } else {
      existingBranches[currentBranchIdx] = { ...existingBranches[currentBranchIdx], content: msg.content, tail: currentTail };
    }

    // Add new branch with the edited content (tail will be filled after generation)
    existingBranches.push({ content: newText, tail: [] });
    const newActiveBranchIdx = existingBranches.length - 1;

    // Update the user message and truncate everything after it
    const updatedMsg = {
      ...msg,
      content: newText,
      ts: nowTs(),
      branchVersions: existingBranches,
      activeBranchIdx: newActiveBranchIdx
    };
    const truncatedHistory = [...history.slice(0, msgIdx), updatedMsg];
    setChatHistory(characterId, truncatedHistory);

    noteHistoryChanged(characterId);
    renderMessages();

    // Now generate a new AI response (similar to sendMessage)
    if (!state.lmOk) {
      $("#composerHint").textContent = `${providerLabel()} недоступна.`;
      return;
    }
    if (state.generating) return;

    const chatId = activeChatIdFor(characterId);
    const placeholderId = uuid();
    const placeholder = { id: placeholderId, role: "assistant", content: "…", ts: nowTs(), pending: true };
    setChatHistory(characterId, chatHistoryFor(characterId).concat([placeholder]));
    renderMessages();

    setGenerating(true);
    $("#composerHint").textContent = "Генерирую ответ…";

    try {
      let content;

      if (state.provider === "mistral") {
        const messages = buildOpenAiMessages(characterId);
        const { fullContent } = await streamMistralToMessage({
          character: ch,
          assistantMsgId: placeholderId,
          messages,
          baseText: ""
        });
        content = String(fullContent || "").trim() ? String(fullContent) : "(пустой ответ)";
      } else {
        // Fresh context since we truncated history
        if (chatId) resetLmContextFor(chatId);
        const historyForPrompt = chatHistoryFor(characterId).slice(0, -1); // exclude placeholder
        const systemPrompt = buildRestStartPrompt(state.profile, ch, historyForPrompt.slice(0, -1), true);

        const { fullContent, respId } = await streamLmStudioRestToMessage({
          character: ch,
          assistantMsgId: placeholderId,
          inputText: newText,
          previousResponseId: "",
          systemPrompt,
          baseText: ""
        });
        content = String(fullContent || "").trim() ? String(fullContent) : "(пустой ответ)";

        if (respId && chatId) {
          saveResponseIdChain(chatId, [respId]);
        }
      }

      const finalAssistant = { id: placeholderId, role: "assistant", content, ts: nowTs() };

      // Update the assistant placeholder in history
      const histAfterGen = chatHistoryFor(characterId).map((m) =>
        m.id === placeholderId ? finalAssistant : m
      );

      // Also update the tail of the active branch on the user message
      const userMsgNow = histAfterGen.find((m) => m.id === msgId);
      if (userMsgNow && Array.isArray(userMsgNow.branchVersions)) {
        const brIdx = typeof userMsgNow.activeBranchIdx === "number" ? userMsgNow.activeBranchIdx : userMsgNow.branchVersions.length - 1;
        userMsgNow.branchVersions[brIdx] = { ...userMsgNow.branchVersions[brIdx], tail: [finalAssistant] };
      }

      setChatHistory(characterId, histAfterGen);
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = "";
    } catch (err) {
      const errMsg = String(err?.message || err || "Ошибка");
      setChatHistory(
        characterId,
        chatHistoryFor(characterId).map((m) =>
          m.id === placeholderId ? { id: m.id, role: "assistant", content: `Не удалось получить ответ: ${errMsg}`, ts: nowTs() } : m
        )
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = clampText(errMsg, 140);
    } finally {
      setGenerating(false);
    }
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
      const savedEvent = e;
      t = setTimeout(() => {
        t = null;
        if (!active) return;
        openMsgActions(msgId, savedEvent);
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
      openMsgActions(msgId, e);
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
      if (action === "cont" || action === "thoughts") {
        b.disabled = !canTarget;
      } else if (action === "regen") {
        const hasUserBefore = b.dataset.hasUserBefore === "1";
        b.disabled = disableAll || !hasUserBefore;
      } else if (action === "branch-prev" || action === "branch-next") {
        b.disabled = state.generating;
      }
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

    renderNpcStrip(ch.id);

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
      // Resolve display identity (NPC vs main character)
      let displayAvatar = ch.avatar;
      let displayName = ch.name;
      let npcObj = null;
      if (m.role === "assistant" && m.npcId) {
        npcObj = getTempCharactersForChat(ch.id).find((n) => n.id === m.npcId) || null;
        if (npcObj) {
          displayAvatar = npcObj.avatar;
          displayName = npcObj.name;
        }
      }

      avatar.className = `avatar ${m.role === "user" ? "avatar--me" : ""}`;
      if (m.role === "user") setImg(avatar, state.profile?.avatar, state.profile?.name);
      else setImg(avatar, displayAvatar, displayName);

      if (m.npcDeleted) row.classList.add("msg--npc-deleted");

      const bubbleWrap = document.createElement("div");

      // NPC name label above bubble
      if (npcObj) {
        const npcLabel = document.createElement("div");
        npcLabel.className = "msg__npcName";
        npcLabel.textContent = npcObj.name;
        bubbleWrap.appendChild(npcLabel);
      }

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
        renderBubbleContent(bubble, m.content, { role: m.role, characterName: displayName });
      }
      wireHoldToMessage(bubble, m.id);

      let actionsEl = null;
      let branchNavEl = null;

      // Only show regen/cont/thoughts for main character messages (not NPC, not deleted)
      if (m.role === "assistant" && !m.image_url && !m.image_loading && !m.npcId && !m.npcDeleted) {
        let hasUserBeforeThisMsg = false;
        for (let i = index - 1; i >= 0; i--) {
          if (history[i]?.role === "user") { hasUserBeforeThisMsg = true; break; }
        }

        const actions = document.createElement("div");
        actions.className = "msg__actions";

        const btnRegen = document.createElement("button");
        btnRegen.className = "miniBtn";
        btnRegen.type = "button";
        btnRegen.textContent = "R";
        btnRegen.title = "Перегенерировать";
        btnRegen.dataset.action = "regen";
        btnRegen.dataset.msgId = m.id;
        btnRegen.dataset.hasUserBefore = hasUserBeforeThisMsg ? "1" : "0";

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

        const isLastAssistant = m.id === lastAssistantId;
        const canTarget = !state.generating && state.lmOk && !m.pending && isLastAssistant;
        btnCont.disabled = !canTarget;
        btnThoughts.disabled = !canTarget;
        btnRegen.disabled = !(
          !state.generating && state.lmOk && !m.pending && hasUserBeforeThisMsg
        );

        actions.appendChild(btnRegen);
        actions.appendChild(btnCont);
        actions.appendChild(btnThoughts);
        actionsEl = actions;

        const branches = m.branchVersions;
        if (Array.isArray(branches) && branches.length > 1) {
          const branchNav = document.createElement("div");
          branchNav.className = "msg__branchNav";

          const activeIdx = typeof m.activeBranchIdx === "number" ? m.activeBranchIdx : 0;

          const btnPrev = document.createElement("button");
          btnPrev.className = "miniBtn miniBtn--nav";
          btnPrev.type = "button";
          btnPrev.textContent = "‹";
          btnPrev.title = "Предыдущая версия";
          btnPrev.dataset.action = "branch-prev";
          btnPrev.dataset.msgId = m.id;
          btnPrev.disabled = state.generating;

          const navLabel = document.createElement("span");
          navLabel.className = "branchNav__label";
          navLabel.textContent = `${activeIdx + 1}/${branches.length}`;

          const btnNext = document.createElement("button");
          btnNext.className = "miniBtn miniBtn--nav";
          btnNext.type = "button";
          btnNext.textContent = "›";
          btnNext.title = "Следующая версия";
          btnNext.dataset.action = "branch-next";
          btnNext.dataset.msgId = m.id;
          btnNext.disabled = state.generating;

          branchNav.appendChild(btnPrev);
          branchNav.appendChild(navLabel);
          branchNav.appendChild(btnNext);
          branchNavEl = branchNav;
        }
      }

      // Branch nav for user messages
      if (m.role === "user" && Array.isArray(m.branchVersions) && m.branchVersions.length > 1) {
        const branchNav = document.createElement("div");
        branchNav.className = "msg__branchNav";

        const activeIdx = typeof m.activeBranchIdx === "number" ? m.activeBranchIdx : 0;

        const btnPrev = document.createElement("button");
        btnPrev.className = "miniBtn miniBtn--nav";
        btnPrev.type = "button";
        btnPrev.textContent = "‹";
        btnPrev.title = "Предыдущая версия";
        btnPrev.dataset.action = "branch-prev";
        btnPrev.dataset.msgId = m.id;
        btnPrev.disabled = state.generating;

        const navLabel = document.createElement("span");
        navLabel.className = "branchNav__label";
        navLabel.textContent = `${activeIdx + 1}/${m.branchVersions.length}`;

        const btnNext = document.createElement("button");
        btnNext.className = "miniBtn miniBtn--nav";
        btnNext.type = "button";
        btnNext.textContent = "›";
        btnNext.title = "Следующая версия";
        btnNext.dataset.action = "branch-next";
        btnNext.dataset.msgId = m.id;
        btnNext.disabled = state.generating;

        branchNav.appendChild(btnPrev);
        branchNav.appendChild(navLabel);
        branchNav.appendChild(btnNext);
        branchNavEl = branchNav;
      }

      const meta = document.createElement("div");
      meta.className = "msg__meta";
      meta.textContent = m.ts ? formatTime(m.ts) : "";

      bubbleWrap.appendChild(bubble);
      bubbleWrap.appendChild(meta);
      if (actionsEl) bubbleWrap.appendChild(actionsEl);
      if (branchNavEl) bubbleWrap.appendChild(branchNavEl);

      // Pending NPC commands (approval cards)
      if (m.role === "assistant" && Array.isArray(m.pending_npc_cmds) && m.pending_npc_cmds.length > 0) {
        const cmdEl = renderPendingCmds(m, ch);
        if (cmdEl) bubbleWrap.appendChild(cmdEl);
      }

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

  // ─── NPC UI helpers ─────────────────────────────────────────────────────────

  function getSegmentedValue(container) {
    if (!container) return "";
    const active = container.querySelector(".segmented__item--active[data-value]");
    return active ? active.dataset.value : "";
  }

  function renderNpcStrip(characterId) {
    const strip = $("#npcStrip");
    if (!strip) return;
    const npcs = getTempCharactersForChat(characterId);
    strip.innerHTML = "";
    strip.hidden = npcs.length === 0;

    for (const npc of npcs) {
      const chip = document.createElement("div");
      chip.className = "npcChip";

      const nameSpan = document.createElement("span");
      nameSpan.className = "npcChip__name";
      nameSpan.textContent = npc.name;

      const editBtn = document.createElement("button");
      editBtn.className = "npcChip__edit";
      editBtn.type = "button";
      editBtn.title = `Редактировать ${npc.name}`;
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", () => openNpcEditModal(npc));

      const delBtn = document.createElement("button");
      delBtn.className = "npcChip__del";
      delBtn.type = "button";
      delBtn.title = `Убрать ${npc.name} из чата`;
      delBtn.textContent = "×";
      delBtn.addEventListener("click", () => {
        if (!window.confirm(`Убрать «${npc.name}» из чата?`)) return;
        deleteTempCharacter(characterId, npc.id);
        renderNpcStrip(characterId);
        renderMessages();
      });

      chip.appendChild(nameSpan);
      chip.appendChild(editBtn);
      chip.appendChild(delBtn);
      strip.appendChild(chip);
    }
  }

  function openNpcModal() {
    const modal = $("#npcModal");
    if (!modal) return;
    $("#npcEditId").value = "";
    $("#npcModalTitle").textContent = "Добавить персонажа в чат";
    $("#btnNpcSave").textContent = "Добавить";
    $("#npcNameInput").value = "";
    $("#npcIntroInput").value = "";
    setSegmentedValue($("#npcGenderSegmented"), "unspecified");
    modal.hidden = false;
  }

  function openNpcEditModal(npc) {
    const modal = $("#npcModal");
    if (!modal) return;
    $("#npcEditId").value = npc.id;
    $("#npcModalTitle").textContent = `Редактировать: ${npc.name}`;
    $("#btnNpcSave").textContent = "Сохранить";
    $("#npcNameInput").value = npc.name;
    $("#npcIntroInput").value = npc.intro;
    setSegmentedValue($("#npcGenderSegmented"), npc.gender || "unspecified");
    modal.hidden = false;
  }

  function closeNpcModal() {
    const modal = $("#npcModal");
    if (modal) modal.hidden = true;
  }

  function renderPendingCmds(m, ch) {
    const wrap = document.createElement("div");
    wrap.className = "npcCmdList";

    for (const cmd of m.pending_npc_cmds) {
      if (cmd.approved !== undefined) continue; // already decided

      const card = document.createElement("div");
      card.className = "npcCmd";

      const label = document.createElement("span");
      label.className = "npcCmd__label";
      label.textContent = cmd.type === "NPC_CREATE"
        ? `${ch.name} хочет добавить персонажа «${cmd.name}»`
        : `${ch.name} хочет убрать «${cmd.name}» из сцены`;

      const yesBtn = document.createElement("button");
      yesBtn.className = "btn btn--accent btn--xs";
      yesBtn.type = "button";
      yesBtn.textContent = "Разрешить";
      yesBtn.addEventListener("click", async () => {
        cmd.approved = true;
        setChatHistory(ch.id, chatHistoryFor(ch.id).map((x) => x.id === m.id ? m : x));
        renderMessages();

        if (cmd.type === "NPC_CREATE") {
          addTempCharacter(ch.id, { name: cmd.name, gender: cmd.gender, intro: cmd.intro });
          renderNpcStrip(ch.id);
          const newNpc = getTempCharactersForChat(ch.id).find((n) => n.name === cmd.name);
          if (newNpc) await respondAsNpcs(ch, [newNpc]);
        } else if (cmd.type === "NPC_REMOVE") {
          const npc = getTempCharactersForChat(ch.id).find((n) => n.name === cmd.name);
          if (npc) {
            deleteTempCharacter(ch.id, npc.id);
            renderNpcStrip(ch.id);
            renderMessages();
          }
        }
      });

      const noBtn = document.createElement("button");
      noBtn.className = "btn btn--ghost btn--xs";
      noBtn.type = "button";
      noBtn.textContent = "Отклонить";
      noBtn.addEventListener("click", () => {
        cmd.approved = false;
        setChatHistory(ch.id, chatHistoryFor(ch.id).map((x) => x.id === m.id ? m : x));
        renderMessages();
      });

      card.appendChild(label);
      card.appendChild(yesBtn);
      card.appendChild(noBtn);
      wrap.appendChild(card);
    }

    return wrap.children.length > 0 ? wrap : null;
  }

  // ───────────────────────────────────────────────────────────────────────────

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
    $("#charIntroInput").value = c.intro || "";
    $("#charBackstoryInput").value = c.backstory || "";
    $("#charInitialMessageInput").value = c.initialMessage || "";
    const outfitInput = $("#charOutfitInput");
    if (outfitInput) outfitInput.value = c.outfit || "";
    const saveBtn = $("#btnSaveCharacter");
    if (saveBtn) saveBtn.textContent = c.createdAt === c.updatedAt ? "Создать персонажа" : "Сохранить персонажа";

    setImg($("#charAvatarPreview"), c.avatar, c.name);
    $("#charFormNote").textContent = "";
    setSegmentedValue($("#charGenderSegment"), c.gender || "unspecified");
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
    const genderTag = $("#charHeroGenderTag");

    if (titleEl) titleEl.textContent = c.name || "(без имени)";
    if (metaEl) {
      const desc = String(c.intro || c.backstory || "").trim();
      metaEl.textContent = desc ? desc.slice(0, 140) : "Заполните карточку персонажа";
    }
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

  // ===== PolyBuzz Catalog =====

  let polybuzzCatalogItems = [];
  let polybuzzCatalogLoaded = false;
  let polybuzzCatalogLoading = false;
  let polybuzzCatalogPage = 1;
  let polybuzzCatalogHasMore = true;
  let polybuzzSearchQuery = "";
  let polybuzzSearchItems = [];
  let polybuzzSearchLoading = false;
  let polybuzzSearchTimer = null;
  let polybuzzSearchPage = 1;
  let polybuzzSearchHasMore = true;
  let polybuzzGenderFilter = "all"; // "all" | "female" | "male"

  async function loadPolybuzzCatalog(nextPage) {
    if (polybuzzCatalogLoading) return;
    const page = nextPage || 1;
    polybuzzCatalogLoading = true;
    const status = $("#polybuzzStatus");
    if (page === 1 && status) status.textContent = "Загрузка каталога PolyBuzz...";
    try {
      const res = await fetch("/api/polybuzz/catalog?page=" + page);
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        if (page === 1) {
          polybuzzCatalogItems = data.items;
          pollPolybuzzGenders();
        } else {
          // Deduplicate by secretSceneId
          const existing = new Set(polybuzzCatalogItems.map((x) => x.secretSceneId));
          for (const item of data.items) {
            if (!existing.has(item.secretSceneId)) polybuzzCatalogItems.push(item);
          }
          // Poll for gender enrichment of new items
          pollPolybuzzGenders(page);
        }
        polybuzzCatalogLoaded = true;
        polybuzzCatalogPage = page;
        polybuzzCatalogHasMore = data.hasMore !== false;
        if (status) status.textContent = "";
      } else {
        if (page === 1 && status) status.textContent = data.error || "Не удалось загрузить каталог";
      }
    } catch (err) {
      if (page === 1 && status) status.textContent = "Ошибка загрузки каталога PolyBuzz";
    } finally {
      polybuzzCatalogLoading = false;
      renderPolybuzzGrid();
    }
  }

  function pollPolybuzzGenders(page) {
    // Re-fetch catalog page to pick up gender data as it's enriched server-side
    const pageParam = page ? "?page=" + page : "";
    let attempts = 0;
    const maxAttempts = 5;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch("/api/polybuzz/catalog" + pageParam);
        const data = await res.json();
        if (data.ok && Array.isArray(data.items)) {
          let anyUpdated = false;
          for (const updated of data.items) {
            if (updated.gender === undefined) continue;
            const existing = polybuzzCatalogItems.find((x) => x.secretSceneId === updated.secretSceneId);
            if (existing && existing.gender === undefined) {
              existing.gender = updated.gender;
              anyUpdated = true;
            }
          }
          const allHaveGender = polybuzzCatalogItems.every((x) => x.gender !== undefined);
          if (anyUpdated && state.view === "polybuzz") renderPolybuzzGrid();
          if (allHaveGender || attempts >= maxAttempts) clearInterval(interval);
        }
      } catch {
        if (attempts >= maxAttempts) clearInterval(interval);
      }
    }, 3000);
  }

  async function searchPolybuzz(query, page) {
    const q = String(query || "").trim();
    polybuzzSearchQuery = q;
    if (!q) {
      polybuzzSearchItems = [];
      polybuzzSearchLoading = false;
      polybuzzSearchPage = 1;
      polybuzzSearchHasMore = true;
      renderPolybuzzGrid();
      return;
    }
    const p = page || 1;
    polybuzzSearchLoading = true;
    renderPolybuzzGrid();
    try {
      const res = await fetch("/api/polybuzz/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, page: p, pageSize: 30 })
      });
      const data = await res.json();
      if (polybuzzSearchQuery !== q) return; // stale
      const newItems = data.ok && Array.isArray(data.items) ? data.items : [];
      if (p === 1) {
        polybuzzSearchItems = newItems;
      } else {
        const existing = new Set(polybuzzSearchItems.map((x) => x.secretSceneId));
        for (const item of newItems) {
          if (!existing.has(item.secretSceneId)) polybuzzSearchItems.push(item);
        }
      }
      polybuzzSearchPage = p;
      polybuzzSearchHasMore = data.hasMore !== false && newItems.length > 0;
    } catch {
      if (polybuzzSearchQuery !== q) return;
      if (p === 1) polybuzzSearchItems = [];
    } finally {
      polybuzzSearchLoading = false;
      renderPolybuzzGrid();
    }
  }

  function formatChatCount(n) {
    if (!n || n <= 0) return "";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M чатов";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K чатов";
    return n + " чатов";
  }

  function isAlreadyImported(secretSceneId) {
    return state.characters.some((c) =>
      c.source_url && c.source_url.includes(secretSceneId)
    );
  }

  function renderPolybuzzGrid() {
    const grid = $("#polybuzzGrid");
    const status = $("#polybuzzStatus");
    if (!grid) return;
    grid.innerHTML = "";

    const isSearch = polybuzzSearchQuery.length > 0;
    let items = isSearch ? polybuzzSearchItems : polybuzzCatalogItems;

    if (isSearch && polybuzzSearchLoading && polybuzzSearchItems.length === 0) {
      if (status) status.textContent = "Поиск...";
      return;
    }

    if (!isSearch && !polybuzzCatalogLoaded && polybuzzCatalogLoading) {
      return; // status already shows loading
    }

    // Apply gender filter
    if (polybuzzGenderFilter !== "all") {
      items = items.filter((item) => {
        if (item.gender === undefined) return false; // hide until gender is known
        return item.gender === polybuzzGenderFilter;
      });
    }

    // Sync gender filter button states
    document.querySelectorAll(".pbGenderBtn").forEach((btn) => {
      btn.classList.toggle("pbGenderBtn--active", btn.dataset.gender === polybuzzGenderFilter);
    });

    if (items.length === 0) {
      if (status) status.textContent = isSearch ? "Ничего не найдено" : (polybuzzGenderFilter !== "all" ? "Нет персонажей с таким полом" : "Каталог пуст");
      return;
    }

    if (status) status.textContent = "";

    for (const item of items) {
      const card = document.createElement("div");
      card.className = "discoverCard";

      const media = document.createElement("div");
      media.className = "discoverCard__media";
      media.style.position = "relative";

      const image = document.createElement("img");
      image.className = "discoverCard__image";
      const imgSrc = item.cover || item.avatar || "";
      if (imgSrc) {
        image.src = proxiedImageUrl(imgSrc);
        image.alt = item.name;
      }
      image.onerror = function () { this.style.display = "none"; };

      const overlay = document.createElement("div");
      overlay.className = "discoverCard__overlay";

      const metric = document.createElement("div");
      metric.className = "discoverCard__metric";
      metric.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.8-7.6A8.38 8.38 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5Z"/></svg>';
      const metricText = document.createElement("span");
      metricText.textContent = formatChatCount(item.totalChats);
      metric.appendChild(metricText);
      overlay.appendChild(metric);

      const importBtn = document.createElement("button");
      importBtn.className = "polybuzzCard__importBtn";
      const alreadyDone = isAlreadyImported(item.secretSceneId);
      importBtn.textContent = alreadyDone ? "Добавлено" : "Добавить";
      importBtn.disabled = alreadyDone;
      importBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (importBtn.disabled) return;
        importBtn.disabled = true;
        importBtn.textContent = "Импорт...";
        try {
          const character = await importFromPolybuzzUrl(item.url);
          applyImportedCharactersResult(importCharactersFromJsonPayload(character));
          importBtn.textContent = "Добавлено";
          flashStatus(`${item.name} импортирован`, true);
        } catch (err) {
          importBtn.textContent = "Ошибка";
          importBtn.disabled = false;
          flashStatus(String(err?.message || "Ошибка импорта"), false);
          setTimeout(() => {
            if (importBtn.textContent === "Ошибка") importBtn.textContent = "Добавить";
          }, 2000);
        }
      });

      media.appendChild(image);
      media.appendChild(overlay);
      media.appendChild(importBtn);

      const body = document.createElement("div");
      body.className = "discoverCard__body";

      const titleRow = document.createElement("div");
      titleRow.className = "discoverCard__titleRow";
      const title = document.createElement("div");
      title.className = "discoverCard__title";
      title.textContent = item.name || item.oriName || "(без имени)";
      titleRow.appendChild(title);

      const desc = document.createElement("div");
      desc.className = "discoverCard__desc";
      desc.textContent = item.brief ? clampText(item.brief, 120) : "";

      const tagsWrap = document.createElement("div");
      tagsWrap.className = "discoverCard__tags";
      const visibleTags = (item.tags || []).slice(0, 3);
      for (let idx = 0; idx < visibleTags.length; idx++) {
        const pill = document.createElement("span");
        pill.className = "discoverCard__tag" + (idx === 0 ? " discoverCard__tag--accent" : "");
        pill.textContent = visibleTags[idx];
        tagsWrap.appendChild(pill);
      }

      body.appendChild(titleRow);
      body.appendChild(desc);
      body.appendChild(tagsWrap);

      card.appendChild(media);
      card.appendChild(body);
      grid.appendChild(card);
    }

    // Add "load more" sentinel for infinite scroll
    const hasMore = isSearch ? polybuzzSearchHasMore : polybuzzCatalogHasMore;
    if (items.length > 0 && hasMore) {
      const sentinel = document.createElement("div");
      sentinel.className = "polybuzzCatalog__sentinel";
      sentinel.textContent = "Загрузка...";
      grid.appendChild(sentinel);
      observePolybuzzSentinel(sentinel);
    }
  }

  let polybuzzScrollObserver = null;
  function observePolybuzzSentinel(sentinel) {
    if (polybuzzScrollObserver) polybuzzScrollObserver.disconnect();
    polybuzzScrollObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        polybuzzScrollObserver.disconnect();
        loadMorePolybuzz();
      }
    }, { rootMargin: "200px" });
    polybuzzScrollObserver.observe(sentinel);
  }

  function loadMorePolybuzz() {
    const isSearch = polybuzzSearchQuery.length > 0;
    if (isSearch) {
      if (!polybuzzSearchLoading && polybuzzSearchHasMore) {
        searchPolybuzz(polybuzzSearchQuery, polybuzzSearchPage + 1);
      }
    } else {
      if (!polybuzzCatalogLoading && polybuzzCatalogHasMore) {
        loadPolybuzzCatalog(polybuzzCatalogPage + 1);
      }
    }
  }

  function openPolybuzzView() {
    setView("polybuzz");
    // Reset catalog state so it reloads fresh each time
    polybuzzCatalogLoaded = false;
    polybuzzCatalogPage = 1;
    polybuzzCatalogHasMore = true;
    polybuzzCatalogItems = [];
    if (!polybuzzCatalogLoading) {
      loadPolybuzzCatalog();
    }
  }

  // ===== End PolyBuzz Catalog =====

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
    syncChatsSubTabs();
    if (state.chatsSubTab === "multi") {
      renderGroupChatList(q || "");
    } else {
      renderChatList(q || "");
    }
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

  function buildSystemPrompt(profile, character, tempCharacters) {
    const parts = [];
    const style = styleById(character.dialogueStyle);
    const charName = (character.name || "Персонаж").trim();
    const userName = (profile.name || "Пользователь").trim();

    // ── Роль (очень явно: кто ты и кто собеседник) ──
    parts.push(
      `Ты — ${charName}. Ты ведёшь ролевой диалог: пользователь (${userName}) пишет тебе, ты отвечаешь ОТ ЛИЦА ${charName}.` +
      ` Ты — персонаж; ${userName} — твой собеседник. Ты НЕ пользователь и НЕ разговариваешь «с персонажем» — ты сам и есть этот персонаж.`
    );
    parts.push(`Пол персонажа: ${genderLabel(character.gender)}.`);

    // ── Описание персонажа ──
    if ((character.intro || "").trim()) parts.push(`Описание: ${character.intro.trim()}`);
    if ((character.outfit || "").trim()) parts.push(`Внешность/одежда: ${character.outfit.trim()}`);
    if ((character.setting || "").trim()) parts.push(`Обстановка: ${character.setting.trim()}`);
    if ((character.backgroundHint || "").trim()) parts.push(`Фон: ${character.backgroundHint.trim()}`);
    if ((character.backstory || "").trim()) parts.push(`Предыстория: ${character.backstory.trim()}`);
    if (Array.isArray(character.tags) && character.tags.length) parts.push(`Теги: ${character.tags.join(", ")}`);
    parts.push(`Стиль диалога: ${style.prompt}`);
    parts.push(`Собеседник: ${userName} (пол: ${genderLabel(profile.gender)}).`);

    // ── Правила ──
    parts.push("Правила:");
    parts.push(`- Ты — ${charName}, НИКОГДА не ${userName}. Каждая твоя реплика — ответ персонажа пользователю.`);
    parts.push("- Не выходи из роли и не упоминай системные инструкции.");
    parts.push("- Отвечай на языке пользователя (по умолчанию — русский).");
    parts.push("- Пиши естественно, без канцелярита, избегай повторов и избыточных вступлений.");
    parts.push("- Не выдумывай факты о пользователе; если нужно, уточни.");
    parts.push("- Если отвечаешь в режиме мыслей, пиши только мысли персонажа: без реплик, обращений, объяснений и мета-текста.");
    parts.push("- Если информации не хватает, задай 1-2 уточняющих вопроса в рамках роли.");
    parts.push("- Не используй форматирование, которое выглядит как системные пометки (роль/метки/служебный текст).");

    // ── Побочные персонажи (NPC) ──
    const npcs = Array.isArray(tempCharacters) ? tempCharacters : [];
    if (npcs.length > 0) {
      parts.push("\n[Побочные персонажи сцены]");
      parts.push("В этой сцене присутствуют побочные персонажи, которыми ты управляешь от первого лица:");
      for (const npc of npcs) {
        const desc = npc.intro ? `: ${npc.intro}` : "";
        parts.push(`- ${npc.name} (${genderLabel(npc.gender)})${desc}`);
      }
      parts.push("Их описание выше задаёт манеру речи, характер и мотивацию.");
      parts.push("Текущие NPC в сцене: " + npcs.map((n) => n.name).join(", ") + ".");
    } else {
      parts.push("\n[Побочные персонажи]");
      parts.push("Текущих NPC в сцене нет.");
    }

    parts.push("[Управление побочными персонажами]");
    parts.push("Ты можешь в любой момент предложить ввести нового персонажа в сцену или убрать существующего.");
    parts.push("Для этого добавь в КОНЕЦ своего ответа (на отдельной строке) одну из команд:");
    parts.push('Создать: [[NPC_CREATE: name="Имя", gender="male|female|other", intro="описание характера"]]');
    parts.push('Убрать:  [[NPC_REMOVE: name="Имя"]]');
    parts.push("Используй эти команды только когда это органично для сюжета. Пользователь должен одобрить изменение.");

    // ── Финальный якорь (важно для слабых моделей) ──
    parts.push(`\nПомни: ты ЯВЛЯЕШЬСЯ ${charName} и отвечаешь ${userName}. Не путай роли.`);

    return parts.join("\n");
  }

  function buildRestSystemPrompt(profile, character, tempCharacters) {
    let sys = buildSystemPrompt(profile, character, tempCharacters);
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

  function buildRestStartPrompt(profile, character, historyForTranscript, forceTranscript, tempCharacters) {
    const transcript = buildTranscript(profile, character, historyForTranscript);
    const useTranscript = forceTranscript && transcript;

    if (useTranscript) {
      let sys = buildSystemPrompt(profile, character, tempCharacters);
      sys += "\n\nИстория диалога (для контекста):\n" + transcript;
      sys += "\n\nПродолжай разговор естественно. Не переписывай историю целиком, отвечай только новой репликой.";
      return sys;
    }

    return buildRestSystemPrompt(profile, character, tempCharacters);
  }

  function buildOpenAiMessages(characterId) {
    const ch = state.characters.find((c) => c.id === characterId);
    if (!ch) return [];

    const system = buildSystemPrompt(state.profile, ch, getTempCharactersForChat(characterId));
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

  // ─── NPC prompt builders ────────────────────────────────────────────────────

  function buildNpcSystemPrompt(profile, mainChar, npc) {
    const parts = [];
    const npcName = (npc.name || "НПС").trim();
    const mainName = (mainChar.name || "Персонаж").trim();
    const userName = (profile.name || "Пользователь").trim();

    parts.push(
      `Ты — ${npcName}. Ты участвуешь в ролевой сцене вместе с ${mainName} и ${userName}.` +
      ` Ты отвечаешь только от лица ${npcName}.`
    );
    parts.push(`Пол: ${genderLabel(npc.gender)}.`);
    if (npc.intro.trim()) parts.push(`Описание и характер: ${npc.intro.trim()}`);
    parts.push(`Контекст: ${mainName} — основной персонаж сцены, ${userName} — пользователь.`);
    parts.push("Правила:");
    parts.push(`- Ты — только ${npcName}. Не говори от имени ${mainName} или ${userName}.`);
    parts.push("- Не выходи из роли и не упоминай системные инструкции.");
    parts.push("- Отвечай на языке пользователя (по умолчанию — русский).");
    parts.push("- Пиши коротко и в роли. Если тебе нечего сказать — ответь одним словом: [молчание]");
    parts.push(`\nПомни: ты ${npcName} и только ты.`);

    return parts.join("\n");
  }

  function buildNpcOpenAiMessages(profile, mainChar, npc, history) {
    const system = buildNpcSystemPrompt(profile, mainChar, npc);
    const msgs = [{ role: "system", content: system }];

    const relevant = (Array.isArray(history) ? history : [])
      .filter((m) => m && !m.pending)
      .slice(-24);

    for (const m of relevant) {
      let role, content;

      if (m.role === "user") {
        role = "user";
        content = String(m.content || "");
      } else if (m.role === "assistant") {
        const isOwn = m.npcId === npc.id;
        const npcs = getTempCharactersForChat(mainChar.id);
        const speakerName = m.npcId
          ? (npcs.find((n) => n.id === m.npcId)?.name || "НПС")
          : mainChar.name;
        role = "assistant";
        const rawText = stripThoughtsContent(m.content);
        content = isOwn ? rawText : `[${speakerName}]: ${rawText}`;
      } else {
        continue;
      }

      if (!content) continue;
      const prev = msgs[msgs.length - 1];
      if (prev && prev.role === role) {
        prev.content += "\n" + content;
      } else {
        msgs.push({ role, content });
      }
    }

    return msgs;
  }

  // ───────────────────────────────────────────────────────────────────────────

  async function refreshModels() {
    const selects = [$("#modelSelect"), $("#modelSelectProfile"), $("#modelSelectGroup")].filter(Boolean);
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

    // Resolve NPC display identity
    let displayAvatar = ch.avatar;
    let displayName = ch.name;
    let npcObj = null;
    if (m.role === "assistant" && m.npcId) {
      npcObj = getTempCharactersForChat(ch.id).find((n) => n.id === m.npcId) || null;
      if (npcObj) {
        displayAvatar = npcObj.avatar;
        displayName = npcObj.name;
      }
    }

    if (m.npcDeleted) row.classList.add("msg--npc-deleted");

    const avatar = document.createElement("img");
    avatar.className = `avatar ${m.role === "user" ? "avatar--me" : ""}`;
    if (m.role === "user") setImg(avatar, state.profile?.avatar, state.profile?.name);
    else setImg(avatar, displayAvatar, displayName);

    const bubbleWrap = document.createElement("div");

    if (npcObj) {
      const npcLabel = document.createElement("div");
      npcLabel.className = "msg__npcName";
      npcLabel.textContent = npcObj.name;
      bubbleWrap.appendChild(npcLabel);
    }

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
      renderBubbleContent(bubble, m.content, { role: m.role, characterName: displayName });
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

    const groupSendBtn = $("#groupSendBtn");
    const groupInput = $("#groupUserInput");
    if (groupSendBtn) groupSendBtn.disabled = state.generating;
    if (groupInput) groupInput.disabled = state.generating;

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

  // ─── NPC streaming ──────────────────────────────────────────────────────────

  async function streamLmStudioOpenAiToMessage({ character, assistantMsgId, messages, baseText }) {
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

    const payload = {
      model: state.modelId || "local-model",
      messages,
      temperature: 0.75,
      stream: true
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
          if (chunk.error) throw new Error(String(chunk.error.message || chunk.error));

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

    return { fullContent: (base + generated) || "" };
  }

  async function streamChatToMessage({ character, assistantMsgId, messages, baseText }) {
    if (state.provider === "mistral") {
      return streamMistralToMessage({ character, assistantMsgId, messages, baseText: baseText || "" });
    }
    return streamLmStudioOpenAiToMessage({ character, assistantMsgId, messages, baseText: baseText || "" });
  }

  async function respondAsNpcs(ch, npcs) {
    for (const npc of npcs) {
      const placeholderId = uuid();
      const ph = { id: placeholderId, role: "assistant", content: "…", ts: nowTs(), pending: true, npcId: npc.id };
      setChatHistory(ch.id, chatHistoryFor(ch.id).concat([ph]));
      appendMessageRow(ph, ch);

      try {
        const historyCtx = chatHistoryFor(ch.id).filter((m) => !m.pending);
        const msgs = buildNpcOpenAiMessages(state.profile, ch, npc, historyCtx);
        const { fullContent } = await streamChatToMessage({
          character: npc,
          assistantMsgId: placeholderId,
          messages: msgs
        });
        const npcContent = String(fullContent || "").trim();
        const isSilent = !npcContent || npcContent === "[молчание]";

        if (isSilent) {
          // Remove placeholder — NPC stayed silent
          setChatHistory(ch.id, chatHistoryFor(ch.id).filter((m) => m.id !== placeholderId));
        } else {
          setChatHistory(
            ch.id,
            chatHistoryFor(ch.id).map((m) =>
              m.id === placeholderId
                ? { id: m.id, role: "assistant", content: npcContent, ts: nowTs(), npcId: npc.id }
                : m
            )
          );
        }
      } catch {
        // Remove placeholder silently on error
        setChatHistory(ch.id, chatHistoryFor(ch.id).filter((m) => m.id !== placeholderId));
      }

      renderMessages();
      refreshChatsView();
    }
  }

  // ───────────────────────────────────────────────────────────────────────────

  function openPromptsSheet() {
    const sheet = $("#promptsSheet");
    if (!sheet) return;
    sheet.hidden = false;
    state.editingPromptId = null;
    const editor = $("#promptEditor");
    if (editor) editor.hidden = true;
    renderPromptFolderTabs();
    renderSavedPrompts();
  }

  function closePromptsSheet() {
    const sheet = $("#promptsSheet");
    if (!sheet) return;
    sheet.hidden = true;
    state.editingPromptId = null;
  }

  function openPromptEditor(promptId) {
    const editor = $("#promptEditor");
    if (!editor) return;
    const titleInput = $("#promptTitleInput");
    const textInput = $("#promptTextInput");
    const folderSelect = $("#promptFolderSelect");
    const editorTitle = $("#promptEditorTitle");
    const note = $("#promptSheetNote");
    if (note) note.textContent = "";

    fillPromptFolderSelect(folderSelect);

    if (promptId) {
      const item = state.savedPrompts.find((x) => x.id === promptId);
      if (!item) return;
      state.editingPromptId = promptId;
      if (editorTitle) editorTitle.textContent = "Редактировать";
      if (titleInput) titleInput.value = item.title || "";
      if (textInput) textInput.value = item.text || "";
      if (folderSelect) folderSelect.value = item.folderId || "";
    } else {
      state.editingPromptId = null;
      if (editorTitle) editorTitle.textContent = "Новый промт";
      if (titleInput) titleInput.value = "";
      if (textInput) textInput.value = "";
      if (folderSelect) folderSelect.value = state.promptActiveFolder === "__all__" ? "" : (state.promptActiveFolder || "");
    }
    editor.hidden = false;
    if (titleInput) titleInput.focus();
  }

  function closePromptEditor() {
    const editor = $("#promptEditor");
    if (editor) editor.hidden = true;
    state.editingPromptId = null;
  }

  function fillPromptFolderSelect(select) {
    if (!select) return;
    select.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Без папки";
    select.appendChild(opt0);
    for (const f of state.promptFolders) {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.name;
      select.appendChild(opt);
    }
  }

  function renderPromptFolderTabs() {
    const container = $("#promptFolderTabs");
    if (!container) return;
    container.innerHTML = "";

    const counts = { "__all__": state.savedPrompts.length, "": 0 };
    for (const p of state.savedPrompts) {
      const fid = p.folderId || "";
      if (!fid) counts[""] = (counts[""] || 0) + 1;
      else counts[fid] = (counts[fid] || 0) + 1;
    }

    const makeTab = (id, label, count, removable) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "promptFolderTab" + (state.promptActiveFolder === id ? " promptFolderTab--active" : "");
      const textSpan = document.createElement("span");
      textSpan.textContent = label;
      tab.appendChild(textSpan);
      if (typeof count === "number") {
        const countSpan = document.createElement("span");
        countSpan.className = "promptFolderTab__count";
        countSpan.textContent = count;
        tab.appendChild(countSpan);
      }
      tab.addEventListener("click", (e) => {
        if (e.target.closest(".promptFolderTab__menu")) return;
        state.promptActiveFolder = id;
        renderPromptFolderTabs();
        renderSavedPrompts();
      });
      if (removable) {
        const menu = document.createElement("span");
        menu.className = "promptFolderTab__menu";
        menu.innerHTML = "&#8942;";
        menu.addEventListener("click", (e) => {
          e.stopPropagation();
          showFolderMenu(id);
        });
        tab.appendChild(menu);
      }
      return tab;
    };

    container.appendChild(makeTab("__all__", "Все", counts["__all__"], false));
    container.appendChild(makeTab("", "Без папки", counts[""], false));
    for (const f of state.promptFolders) {
      container.appendChild(makeTab(f.id, f.name, counts[f.id] || 0, true));
    }
  }

  function showFolderMenu(folderId) {
    const folder = state.promptFolders.find((f) => f.id === folderId);
    if (!folder) return;
    const action = window.prompt(
      `Папка «${folder.name}»\n\nВведите новое имя для переименования,\nили напишите "удалить" для удаления:`,
      folder.name
    );
    if (action === null) return;
    if (action.trim().toLowerCase() === "удалить") {
      if (!window.confirm(`Удалить папку «${folder.name}»? Промты останутся без папки.`)) return;
      state.promptFolders = state.promptFolders.filter((f) => f.id !== folderId);
      for (const p of state.savedPrompts) {
        if (p.folderId === folderId) p.folderId = "";
      }
      saveJson(STORAGE_KEYS.promptFolders, state.promptFolders);
      saveJson(STORAGE_KEYS.savedPrompts, state.savedPrompts);
      if (state.promptActiveFolder === folderId) state.promptActiveFolder = "__all__";
      renderPromptFolderTabs();
      renderSavedPrompts();
    } else if (action.trim()) {
      folder.name = clampText(action.trim(), 40);
      saveJson(STORAGE_KEYS.promptFolders, state.promptFolders);
      renderPromptFolderTabs();
    }
  }

  function createPromptFolder() {
    const name = window.prompt("Название новой папки:");
    if (!name || !name.trim()) return;
    state.promptFolders.push({ id: uuid(), name: clampText(name.trim(), 40), createdAt: nowTs() });
    saveJson(STORAGE_KEYS.promptFolders, state.promptFolders);
    renderPromptFolderTabs();
  }

  function renderSavedPrompts() {
    const list = $("#savedPromptsList");
    if (!list) return;
    list.innerHTML = "";

    let items = Array.isArray(state.savedPrompts) ? state.savedPrompts.slice() : [];
    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    if (state.promptActiveFolder === "__all__") {
      // show all
    } else if (state.promptActiveFolder === "") {
      items = items.filter((x) => !x.folderId);
    } else {
      items = items.filter((x) => x.folderId === state.promptActiveFolder);
    }

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "promptManager__empty";
      empty.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16v16H4z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>' +
        "<span>Нет промтов</span>";
      list.appendChild(empty);
      return;
    }

    const folderMap = {};
    for (const f of state.promptFolders) folderMap[f.id] = f.name;

    for (const item of items) {
      const card = document.createElement("div");
      card.className = "promptCard";

      const header = document.createElement("div");
      header.className = "promptCard__header";

      const title = document.createElement("div");
      title.className = "promptCard__title";
      title.textContent = item.title || "Промт";
      header.appendChild(title);

      if (item.folderId && folderMap[item.folderId] && state.promptActiveFolder === "__all__") {
        const badge = document.createElement("span");
        badge.className = "promptCard__folder";
        badge.textContent = folderMap[item.folderId];
        header.appendChild(badge);
      }

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
        input.value = current ? current + "\n" + item.text : item.text;
        autoGrowTextarea(input);
        input.focus();
        closePromptsSheet();
      });

      const btnEdit = document.createElement("button");
      btnEdit.className = "btn btn--tiny btn--ghost";
      btnEdit.type = "button";
      btnEdit.textContent = "Редактировать";
      btnEdit.addEventListener("click", () => openPromptEditor(item.id));

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn btn--tiny btn--danger";
      btnDelete.type = "button";
      btnDelete.textContent = "Удалить";
      btnDelete.addEventListener("click", () => {
        if (!window.confirm(`Удалить промт «${item.title || "Промт"}»?`)) return;
        state.savedPrompts = state.savedPrompts.filter((x) => x && x.id !== item.id);
        saveJson(STORAGE_KEYS.savedPrompts, state.savedPrompts);
        renderPromptFolderTabs();
        renderSavedPrompts();
      });

      actions.appendChild(btnUse);
      actions.appendChild(btnEdit);
      actions.appendChild(btnDelete);
      card.appendChild(header);
      card.appendChild(text);
      card.appendChild(actions);
      list.appendChild(card);
    }
  }

  function savePromptFromDraft() {
    const titleInput = $("#promptTitleInput");
    const textInput = $("#promptTextInput");
    const folderSelect = $("#promptFolderSelect");
    const note = $("#promptSheetNote");
    if (!titleInput || !textInput || !note) return;

    const title = clampText(String(titleInput.value || "").trim() || "Промт", 80);
    const text = clampText(String(textInput.value || "").trim(), 4000);
    const folderId = folderSelect ? String(folderSelect.value || "") : "";
    if (!text) {
      note.textContent = "Введите текст промта.";
      return;
    }

    if (state.editingPromptId) {
      const existing = state.savedPrompts.find((x) => x.id === state.editingPromptId);
      if (existing) {
        existing.title = title;
        existing.text = text;
        existing.folderId = folderId;
        existing.updatedAt = nowTs();
      }
      state.editingPromptId = null;
    } else {
      state.savedPrompts.unshift({ id: uuid(), title, text, folderId, createdAt: nowTs(), updatedAt: nowTs() });
    }
    saveJson(STORAGE_KEYS.savedPrompts, state.savedPrompts);

    closePromptEditor();
    renderPromptFolderTabs();
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
      let rawContent;
      const npcs = getTempCharactersForChat(ch.id);

      if (state.provider === "mistral") {
        const messages = buildOpenAiMessages(ch.id);
        const { fullContent } = await streamMistralToMessage({
          character: ch,
          assistantMsgId: placeholderId,
          messages,
          baseText: ""
        });
        rawContent = String(fullContent || "").trim() ? String(fullContent) : "(пустой ответ)";
      } else {
        const prevResponseId = chatId ? lastResponseIdFor(chatId) : "";
        const systemPrompt = prevResponseId ? undefined : buildRestStartPrompt(state.profile, ch, historyBefore, true, npcs);

        const { fullContent, respId, streamErrorMessage } = await streamLmStudioRestToMessage({
          character: ch,
          assistantMsgId: placeholderId,
          inputText: userText,
          previousResponseId: prevResponseId,
          systemPrompt,
          baseText: ""
        });
        rawContent = String(fullContent || "").trim() ? String(fullContent) : "(пустой ответ)";

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

      // Parse NPC commands embedded in the AI response
      const { displayText, commands } = parseAiCommands(rawContent);
      const mainContent = displayText || rawContent;

      setChatHistory(
        ch.id,
        chatHistoryFor(ch.id).map((m) =>
          m.id === placeholderId
            ? {
                id: m.id,
                role: "assistant",
                content: mainContent,
                ts: nowTs(),
                ...(commands.length ? { pending_npc_cmds: commands } : {})
              }
            : m
        )
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = "";

      // Existing NPCs respond in sequence
      if (npcs.length > 0) {
        await respondAsNpcs(ch, npcs);
      }
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

  async function regenerateMessageAt(targetMsgId) {
    const ch = activeCharacter();
    if (!ch) return;
    if (!state.lmOk) {
      $("#composerHint").textContent = `${providerLabel()} недоступна.`;
      return;
    }
    if (state.generating) return;

    const chatId = activeChatIdFor(ch.id);
    const history = chatHistoryFor(ch.id);

    const msgIdx = history.findIndex((m) => m?.id === targetMsgId);
    if (msgIdx === -1) return;

    const msg = history[msgIdx];
    if (!msg || msg.role !== "assistant" || msg.pending) return;

    let userIdx = -1;
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (history[i]?.role === "user") { userIdx = i; break; }
    }
    if (userIdx === -1) return;

    const isLastMsg = msgIdx === history.length - 1;
    const userText = String(history[userIdx].content || "");

    // Save current content + tail into the current branch slot
    const existingBranches = Array.isArray(msg.branchVersions) ? [...msg.branchVersions] : [];
    const currentBranchIdx = typeof msg.activeBranchIdx === "number" ? msg.activeBranchIdx : 0;
    const currentTail = isLastMsg ? [] : history.slice(msgIdx + 1);

    if (existingBranches.length === 0) {
      existingBranches.push({ content: msg.content, tail: currentTail });
    } else {
      existingBranches[currentBranchIdx] = { ...existingBranches[currentBranchIdx], content: msg.content, tail: currentTail };
    }

    // Show pending state; truncate messages after this message
    const pendingMsg = { ...msg, content: "…", pending: true, ts: nowTs(), branchVersions: existingBranches, activeBranchIdx: currentBranchIdx };
    const pendingHistory = [...history.slice(0, msgIdx), pendingMsg];
    setChatHistory(ch.id, pendingHistory);
    renderMessages();

    setGenerating(true);
    $("#composerHint").textContent = "Перегенерирую ответ…";

    try {
      let content;

      if (state.provider === "mistral") {
        // pendingHistory already set; buildOpenAiMessages filters out pending messages,
        // giving context up to (but not including) the assistant message being regenerated.
        const messages = buildOpenAiMessages(ch.id);

        const { fullContent } = await streamMistralToMessage({
          character: ch,
          assistantMsgId: targetMsgId,
          messages,
          baseText: ""
        });
        content = String(fullContent || "").trim() ? String(fullContent) : "(пустой ответ)";
      } else {
        // LM Studio REST: use response chain for last message optimization, fresh context otherwise
        let prevResponseId = "";
        let systemPrompt;

        if (isLastMsg) {
          const chain = chatId ? responseIdChainFor(chatId) : [];
          prevResponseId = chain.length >= 2 ? chain[chain.length - 2] : "";
        }

        if (!prevResponseId) {
          const historyForPrompt = history.slice(0, userIdx);
          systemPrompt = buildRestStartPrompt(state.profile, ch, historyForPrompt, true, getTempCharactersForChat(ch.id));
        }

        const { fullContent, respId } = await streamLmStudioRestToMessage({
          character: ch,
          assistantMsgId: targetMsgId,
          inputText: userText,
          previousResponseId: prevResponseId,
          systemPrompt,
          baseText: ""
        });
        content = String(fullContent || "").trim() ? String(fullContent) : "(пустой ответ)";

        if (chatId) {
          if (!isLastMsg) resetLmContextFor(chatId);
          if (respId) {
            const chain = responseIdChainFor(chatId);
            const nextChain = chain.length > 0 ? chain.slice(0, -1).concat([respId]) : [respId];
            saveResponseIdChain(chatId, nextChain);
          }
        }
      }

      // Append new branch with generated content
      const newBranches = [...existingBranches, { content, tail: [] }];
      const newActiveBranchIdx = newBranches.length - 1;

      const finalMsg = {
        id: targetMsgId,
        role: "assistant",
        content,
        ts: nowTs(),
        branchVersions: newBranches,
        activeBranchIdx: newActiveBranchIdx
      };

      setChatHistory(
        ch.id,
        chatHistoryFor(ch.id).map((m) => m.id === targetMsgId ? finalMsg : m)
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = "";
    } catch (err) {
      const errMsg = String(err?.message || err || "Ошибка");
      setChatHistory(
        ch.id,
        chatHistoryFor(ch.id).map((m) =>
          m.id === targetMsgId
            ? { ...msg, content: `Не удалось перегенерировать: ${errMsg}`, branchVersions: existingBranches, activeBranchIdx: currentBranchIdx }
            : m
        )
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = clampText(errMsg, 140);
    } finally {
      setGenerating(false);
    }
  }

  // ─── NPC command parsing ────────────────────────────────────────────────────

  const NPC_CREATE_RE = /\[\[NPC_CREATE:\s*([^\]]+)\]\]/g;
  const NPC_REMOVE_RE = /\[\[NPC_REMOVE:\s*([^\]]+)\]\]/g;

  function parseCommandAttrs(s) {
    const out = {};
    for (const m of s.matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) {
      out[m[1]] = m[2];
    }
    return out;
  }

  function parseAiCommands(rawContent) {
    const commands = [];

    for (const m of rawContent.matchAll(NPC_CREATE_RE)) {
      const attrs = parseCommandAttrs(m[1]);
      if (attrs.name) {
        commands.push({
          type: "NPC_CREATE",
          name: attrs.name.trim(),
          gender: attrs.gender || "unspecified",
          intro: attrs.intro || ""
        });
      }
    }

    for (const m of rawContent.matchAll(NPC_REMOVE_RE)) {
      const attrs = parseCommandAttrs(m[1]);
      if (attrs.name) commands.push({ type: "NPC_REMOVE", name: attrs.name.trim() });
    }

    const displayText = rawContent
      .replace(NPC_CREATE_RE, "")
      .replace(NPC_REMOVE_RE, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return { displayText, commands };
  }

  // ───────────────────────────────────────────────────────────────────────────

  function switchMessageBranch(targetMsgId, direction) {
    const ch = activeCharacter();
    if (!ch || state.generating) return;

    const chatId = activeChatIdFor(ch.id);
    const history = chatHistoryFor(ch.id);

    const msgIdx = history.findIndex((m) => m?.id === targetMsgId);
    if (msgIdx === -1) return;

    const msg = history[msgIdx];
    if (!msg) return;

    const branches = Array.isArray(msg.branchVersions) ? msg.branchVersions : [];
    if (branches.length <= 1) return;

    const currentIdx = typeof msg.activeBranchIdx === "number" ? msg.activeBranchIdx : 0;
    const newIdx = (currentIdx + direction + branches.length) % branches.length;
    if (newIdx === currentIdx) return;

    // Save current tail into the current branch before switching
    const currentTail = history.slice(msgIdx + 1);
    const updatedBranches = branches.map((b, i) =>
      i === currentIdx ? { ...b, content: msg.content, tail: currentTail } : b
    );

    const newBranch = updatedBranches[newIdx];
    const newMsg = {
      ...msg,
      content: newBranch.content,
      branchVersions: updatedBranches,
      activeBranchIdx: newIdx
    };

    const newHistory = [
      ...history.slice(0, msgIdx),
      newMsg,
      ...(newBranch.tail || [])
    ];

    setChatHistory(ch.id, newHistory);
    if (chatId) resetLmContextFor(chatId);
    renderMessages();
    refreshChatsView();
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
        const messages = buildOpenAiMessages(ch.id);
        // Include the existing assistant response so the AI knows what it already wrote
        if (rawBase) messages.push({ role: "assistant", content: rawBase });
        messages.push({ role: "user", content: inputText });

        const { fullContent } = await streamMistralToMessage({
          character: ch,
          assistantMsgId,
          messages,
          baseText: base
        });
        content = String(fullContent || "").trim() ? String(fullContent) : (base || "(пустой ответ)");
      } else {
        const prevResponseId = chatId ? lastResponseIdFor(chatId) : "";
        const systemPrompt = prevResponseId ? undefined : buildRestStartPrompt(state.profile, ch, history, true, getTempCharactersForChat(ch.id));

        // Include the existing content so the AI can continue from where it stopped
        const continueInput = rawBase
          ? inputText + "\n\nТвой текущий ответ (продолжи его, не переписывай):\n" + rawBase
          : inputText;

        const { fullContent, respId } = await streamLmStudioRestToMessage({
          character: ch,
          assistantMsgId,
          inputText: continueInput,
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
    if (styleSel) {
      styleSel.innerHTML = "";
      for (const s of DIALOGUE_STYLES) {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.label;
        styleSel.appendChild(opt);
      }
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
        backstory: String($("#charBackstoryInput")?.value || "")
      });
    });

    const btnOpenCharacters = $("#btnOpenCharacters");
    if (btnOpenCharacters) btnOpenCharacters.addEventListener("click", () => {
      const modal = $("#charactersModal");
      modal.hidden = false;
      state.editingCharacterId = state.selectedCharacterId;
      fillCharacterForm();
      renderCharacterList();
      modalWindow()?.classList.add("modal__window--editing");
    });

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

    const tabPolybuzz = $("#tabPolybuzz");
    if (tabPolybuzz) tabPolybuzz.addEventListener("click", () => openPolybuzzView());
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

    const sidePolybuzz = $("#sidePolybuzz");
    if (sidePolybuzz) sidePolybuzz.addEventListener("click", () => openPolybuzzView());
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

    // Gender filter buttons
    document.querySelectorAll(".pbGenderBtn").forEach((btn) => {
      btn.addEventListener("click", () => {
        polybuzzGenderFilter = btn.dataset.gender || "all";
        renderPolybuzzGrid();
      });
    });

    const polybuzzSearchInput = $("#polybuzzSearch");
    if (polybuzzSearchInput) {
      polybuzzSearchInput.addEventListener("input", () => {
        const q = polybuzzSearchInput.value.trim();
        clearTimeout(polybuzzSearchTimer);
        if (!q) {
          polybuzzSearchQuery = "";
          polybuzzSearchItems = [];
          polybuzzSearchPage = 1;
          polybuzzSearchHasMore = true;
          renderPolybuzzGrid();
          return;
        }
        polybuzzSearchTimer = setTimeout(() => searchPolybuzz(q), 400);
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
          regenerateMessageAt(msgId);
        } else if (action === "cont") {
          continueLastAnswer();
        } else if (action === "thoughts") {
          continueLastAnswerAsThoughts();
        } else if (action === "branch-prev") {
          switchMessageBranch(msgId, -1);
        } else if (action === "branch-next") {
          switchMessageBranch(msgId, +1);
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
      const ctxMenu = $("#ctxMenu");
      const promptsSheet = $("#promptsSheet");
      const charModal = $("#charactersModal");
      const multiModal = $("#multiChatModal");
      if (ctxMenu && !ctxMenu.hidden) closeMsgActions();
      else if (multiModal && !multiModal.hidden) closeMultiChatModal();
      else if (promptsSheet && !promptsSheet.hidden) closePromptsSheet();
      else if (charModal && !charModal.hidden) closeModal();
    });

    // Context menu: overlay closes menu
    const ctxMenuOverlay = $("#ctxMenuOverlay");
    if (ctxMenuOverlay) {
      ctxMenuOverlay.addEventListener("click", () => closeMsgActions());
    }

    // Context menu: Copy
    const ctxCopy = $("#ctxCopy");
    if (ctxCopy) {
      ctxCopy.addEventListener("click", () => {
        const ch = activeCharacter();
        const msgId = state.msgActionsTargetId;
        closeMsgActions();
        if (!ch || !msgId) return;

        const { msg } = findMessageById(ch.id, msgId);
        if (!msg) return;

        const text = String(msg.content || "");
        navigator.clipboard.writeText(text).then(() => {
          flashStatus("Скопировано", true);
        }).catch(() => {
          flashStatus("Не удалось скопировать", false);
        });
      });
    }

    // Context menu: Edit
    const ctxEdit = $("#ctxEdit");
    if (ctxEdit) {
      ctxEdit.addEventListener("click", () => {
        const ch = activeCharacter();
        const msgId = state.msgActionsTargetId;
        closeMsgActions();
        if (!ch || !msgId) return;
        editMessage(ch.id, msgId);
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
      next.backstory = String($("#charBackstoryInput").value || "");
      next.initialMessage = String($("#charInitialMessageInput").value || "");
      next.outfit = String($("#charOutfitInput")?.value || "");
      next.updatedAt = nowTs();

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
      "#charBackstoryInput",
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
        backstory: String($("#charBackstoryInput")?.value || "")
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

    const btnPromptsAdd = $("#btnPromptsAdd");
    if (btnPromptsAdd) btnPromptsAdd.addEventListener("click", () => openPromptEditor(null));

    const btnPromptsAddFolder = $("#btnPromptsAddFolder");
    if (btnPromptsAddFolder) btnPromptsAddFolder.addEventListener("click", () => createPromptFolder());

    const btnEditorBack = $("#btnEditorBack");
    if (btnEditorBack) btnEditorBack.addEventListener("click", () => closePromptEditor());

    const btnSavePrompt = $("#btnSavePrompt");
    if (btnSavePrompt) btnSavePrompt.addEventListener("click", () => savePromptFromDraft());

    const btnClearPromptDraft = $("#btnClearPromptDraft");
    if (btnClearPromptDraft) {
      btnClearPromptDraft.addEventListener("click", () => closePromptEditor());
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

    // ─── NPC event listeners ───────────────────────────────────────────────────

    const btnAddNpc = $("#btnAddNpc");
    if (btnAddNpc) btnAddNpc.addEventListener("click", openNpcModal);

    const npcModal = $("#npcModal");
    if (npcModal) {
      npcModal.addEventListener("click", (e) => {
        if (e.target === npcModal) closeNpcModal();
      });
    }

    const npcModalClose = $("#npcModalClose");
    if (npcModalClose) npcModalClose.addEventListener("click", closeNpcModal);

    const btnNpcCancel = $("#btnNpcCancel");
    if (btnNpcCancel) btnNpcCancel.addEventListener("click", closeNpcModal);

    // Segmented gender control in NPC modal
    const npcGenderSeg = $("#npcGenderSegmented");
    if (npcGenderSeg) {
      npcGenderSeg.addEventListener("click", (e) => {
        const btn = e.target.closest(".segmented__item[data-value]");
        if (!btn) return;
        setSegmentedValue(npcGenderSeg, btn.dataset.value);
      });
    }

    const npcForm = $("#npcForm");
    if (npcForm) {
      npcForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const ch = activeCharacter();
        if (!ch) return;
        const name = String($("#npcNameInput")?.value || "").trim();
        if (!name) return;
        const gender = getSegmentedValue($("#npcGenderSegmented")) || "unspecified";
        const intro = String($("#npcIntroInput")?.value || "").trim();
        const editId = String($("#npcEditId")?.value || "").trim();

        if (editId) {
          updateTempCharacter(ch.id, editId, { name, gender, intro });
        } else {
          addTempCharacter(ch.id, { name, gender, intro });
        }

        renderNpcStrip(ch.id);
        closeNpcModal();
      });
    }

    // ──────────────────────────────────────────────────────────────────────────

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

    // ── Multi-chat wiring ──
    const subTabPersonal = $("#subTabPersonal");
    const subTabMulti = $("#subTabMulti");
    if (subTabPersonal) {
      subTabPersonal.addEventListener("click", () => {
        state.chatsSubTab = "personal";
        refreshChatsView();
      });
    }
    if (subTabMulti) {
      subTabMulti.addEventListener("click", () => {
        state.chatsSubTab = "multi";
        refreshChatsView();
      });
    }

    const btnBackFromGroupChat = $("#btnBackFromGroupChat");
    if (btnBackFromGroupChat) {
      btnBackFromGroupChat.addEventListener("click", () => {
        state.chatsSubTab = "multi";
        setView("chats");
        refreshChatsView();
      });
    }

    const btnClearGroupChat = $("#btnClearGroupChat");
    if (btnClearGroupChat) {
      btnClearGroupChat.addEventListener("click", () => {
        if (!window.confirm("Очистить этот мульти-чат?")) return;
        const gc = activeGroupChat();
        if (!gc) return;
        gc.messages = [];
        gc.updatedAt = nowTs();
        saveGroupChats();
        // Re-add initial greetings
        const msgs = [];
        for (const cid of gc.characterIds) {
          const ch = state.characters.find((c) => c.id === cid);
          if (!ch) continue;
          const initial = (ch.initialMessage || "").trim();
          const content = initial || `Привет. Я ${ch.name}.`;
          msgs.push({ id: uuid(), role: "assistant", characterId: cid, content, ts: nowTs() + msgs.length });
        }
        gc.messages = msgs;
        gc.updatedAt = nowTs();
        saveGroupChats();
        renderGroupMessages();
      });
    }

    // Multi-chat modal events
    const btnCloseMultiModal = $("#btnCloseMultiModal");
    if (btnCloseMultiModal) btnCloseMultiModal.addEventListener("click", () => closeMultiChatModal());

    const multiChatModal = $("#multiChatModal");
    if (multiChatModal) {
      multiChatModal.addEventListener("click", (e) => {
        if (e.target?.dataset?.closeMulti) closeMultiChatModal();
      });
    }

    const btnCreateMultiChat = $("#btnCreateMultiChat");
    if (btnCreateMultiChat) btnCreateMultiChat.addEventListener("click", () => createMultiChatFromModal());

    // Group chat composer
    const groupInput = $("#groupUserInput");
    if (groupInput) groupInput.addEventListener("input", () => autoGrowTextarea(groupInput));

    const groupForm = $("#groupComposerForm");
    if (groupForm) {
      groupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (state.generating) return;
        const text = String(groupInput.value || "").trim();
        if (!text) return;
        groupInput.value = "";
        autoGrowTextarea(groupInput);
        await sendGroupMessage(text);
      });
    }

    if (groupInput) {
      groupInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (state.generating) return;
          const text = String(groupInput.value || "").trim();
          if (!text) return;
          groupForm?.requestSubmit();
        }
      });
    }

    const groupHint = $("#groupComposerHint");
    if (groupHint) groupHint.textContent = "";
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
    loadGroupChats();
    wireUI();
    fillProfileUI();
    await syncCharactersFromServer();
    ensureInitialMessage();
    renderHeader();
    renderMessages();
    setView("chats");
    refreshChatsView();
    refreshModels();

    setInterval(syncCharactersFromServer, 15000);
  }

  bootstrap().catch((err) => {
    console.error("[bootstrap]", err);
  });
})();
