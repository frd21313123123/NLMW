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
    openrouterKey: "nlmw.openrouterKey"
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
    openrouterKey: "",
    lmOk: false,
    generating: false,
    msgActionsTargetId: "",
    view: "chats"
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
    state.openrouterKey = String(loadJson(STORAGE_KEYS.openrouterKey, ""));

    if (state.provider !== "lmstudio" && state.provider !== "openrouter") state.provider = "lmstudio";

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

  function chatHistoryFor(characterId) {
    const arr = state.conversations[characterId];
    return Array.isArray(arr) ? arr : [];
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

  function renderChatList(filterText) {
    const el = $("#chatList");
    if (!el) return;
    const q = String(filterText || "").trim().toLowerCase();
    el.innerHTML = "";

    const chars = Array.isArray(state.characters) ? state.characters.slice() : [];

    // Sort by last message timestamp desc.
    chars.sort((a, b) => {
      const ma = lastNonPendingMessage(a.id);
      const mb = lastNonPendingMessage(b.id);
      const ta = ma?.ts || 0;
      const tb = mb?.ts || 0;
      return tb - ta;
    });

    let matchCount = 0;

    for (const c of chars) {
      const last = lastNonPendingMessage(c.id);
      const preview = last?.content || c.initialMessage || "";
      const time = last?.ts || 0;
      const searchable = `${c.name || ""} ${preview}`.toLowerCase();
      if (q && !searchable.includes(q)) continue;

      matchCount++;

      const item = document.createElement("div");
      item.className = "chatItem";
      item.dataset.id = c.id;

      const av = document.createElement("img");
      av.className = "avatar chatItem__avatar";
      setImg(av, c.avatar, c.name);

      const mid = document.createElement("div");
      mid.className = "chatItem__mid";

      const nameRow = document.createElement("div");
      nameRow.className = "chatItem__nameRow";
      const name = document.createElement("div");
      name.className = "chatItem__name";
      name.textContent = c.name || "(без имени)";
      nameRow.appendChild(name);

      const prev = document.createElement("div");
      prev.className = "chatItem__preview";
      prev.textContent = String(preview || "").replace(/\s+/g, " ").trim();
      mid.appendChild(nameRow);
      mid.appendChild(prev);

      const right = document.createElement("div");
      right.className = "chatItem__time";
      right.textContent = formatListTime(time);

      item.appendChild(av);
      item.appendChild(mid);
      item.appendChild(right);

      item.addEventListener("click", () => {
        state.selectedCharacterId = c.id;
        saveJson(STORAGE_KEYS.selectedCharacterId, state.selectedCharacterId);
        ensureInitialMessage();
        renderHeader();
        renderMessages();
        setView("chat");
      });

      el.appendChild(item);
    }

    if (matchCount === 0) {
      const empty = document.createElement("div");
      empty.className = "chatList__empty";
      empty.textContent = q ? "Ничего не найдено" : "Нет чатов. Нажмите +, чтобы создать персонажа.";
      el.appendChild(empty);
    }
  }

  function setChatHistory(characterId, history) {
    state.conversations[characterId] = history;
    saveJson(STORAGE_KEYS.conversations, state.conversations);
  }

  function responseIdChainFor(characterId) {
    const v = state.responseIdChains?.[characterId];
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];
  }

  function saveResponseIdChain(characterId, chain) {
    const clean = Array.isArray(chain) ? chain.filter((x) => typeof x === "string" && x.trim()) : [];
    state.responseIdChains[characterId] = clean;
    saveJson(STORAGE_KEYS.responseIdChains, state.responseIdChains);

    if (clean.length > 0) state.responseIds[characterId] = clean[clean.length - 1];
    else delete state.responseIds[characterId];
    saveJson(STORAGE_KEYS.responseIds, state.responseIds);
  }

  function lastResponseIdFor(characterId) {
    const chain = responseIdChainFor(characterId);
    if (chain.length > 0) return chain[chain.length - 1];
    const legacy = state.responseIds?.[characterId];
    return typeof legacy === "string" && legacy.trim() ? legacy.trim() : "";
  }

  function resetLmContextFor(characterId) {
    delete state.responseIds[characterId];
    delete state.responseIdChains[characterId];
    saveJson(STORAGE_KEYS.responseIds, state.responseIds);
    saveJson(STORAGE_KEYS.responseIdChains, state.responseIdChains);
  }

  function upsertCharacter(next) {
    const idx = state.characters.findIndex((c) => c.id === next.id);
    if (idx === -1) state.characters.unshift(next);
    else state.characters[idx] = next;
    saveJson(STORAGE_KEYS.characters, state.characters);
  }

  function deleteCharacter(id) {
    state.characters = state.characters.filter((c) => c.id !== id);
    delete state.conversations[id];
    delete state.responseIds[id];
    delete state.responseIdChains[id];
    saveJson(STORAGE_KEYS.characters, state.characters);
    saveJson(STORAGE_KEYS.conversations, state.conversations);
    saveJson(STORAGE_KEYS.responseIds, state.responseIds);
    saveJson(STORAGE_KEYS.responseIdChains, state.responseIdChains);

    if (state.selectedCharacterId === id) {
      state.selectedCharacterId = state.characters[0]?.id || "";
      saveJson(STORAGE_KEYS.selectedCharacterId, state.selectedCharacterId);
    }
    if (state.editingCharacterId === id) state.editingCharacterId = state.selectedCharacterId;
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

  function applyChatBackground(character) {
    const panel = $("#chatPanel");
    if (!panel) return;
    if (character && character.background) {
      const safe = character.background.replace(/["'()\\]/g, "");
      panel.style.setProperty("--chat-bg-url", `url("${safe}")`);
    } else {
      panel.style.setProperty("--chat-bg-url", "none");
    }
  }

  function setImg(el, src, fallbackInitials) {
    if (!el) return;
    if (src && String(src).trim()) {
      el.src = String(src);
      el.alt = "";
      return;
    }

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
    el.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    el.alt = "";
  }

  function renderInlineEmphasis(el, text) {
    const s = String(text || "");
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
    resetLmContextFor(characterId);
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
      if (action === "cont") b.disabled = !canTarget;
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
    applyChatBackground(ch);

    updateChatActionButtons();
  }

  function renderMessages() {
    const ch = activeCharacter();
    const list = $("#messages");
    if (!list) return;

    const history = chatHistoryFor(ch.id);
    list.innerHTML = "";

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

    for (const m of history) {
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
        renderInlineEmphasis(bubble, m.content);
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

        const canTarget = !state.generating && state.lmOk && !m.pending && m.id === lastAssistantId;
        btnCont.disabled = !canTarget;
        btnRegen.disabled = !(canTarget && hasUserBeforeLastAssistant);

        actions.appendChild(btnRegen);
        actions.appendChild(btnCont);
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

    list.scrollTop = list.scrollHeight;

    // (Buttons are per-message)
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
      });

      el.appendChild(card);
    }
  }

  function fillCharacterForm() {
    const c = editingCharacter();
    if (!c) return;

    $("#charNameInput").value = c.name || "";
    $("#charGenderInput").value = c.gender || "unspecified";
    $("#charAvatarUrl").value = "";
    $("#charBgUrl").value = "";
    $("#charOutfitInput").value = c.outfit || "";
    $("#charSettingInput").value = c.setting || "";
    $("#charBgHintInput").value = c.backgroundHint || "";
    $("#charBackstoryInput").value = c.backstory || "";
    $("#charStyleInput").value = c.dialogueStyle || "natural";
    $("#charInitialMessageInput").value = c.initialMessage || "";

    setImg($("#charAvatarPreview"), c.avatar, c.name);
    $("#charFormNote").textContent = "";

    renderCharacterList();
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

  function openModal() {
    const modal = $("#charactersModal");
    modal.hidden = false;
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
    const avatarUrl = String($("#userAvatarUrl").value || "").trim();

    state.profile.name = name;
    state.profile.gender = gender;
    if (avatarUrl) state.profile.avatar = avatarUrl;

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
    $("#userAvatarUrl").value = "";
    setImg($("#userAvatarPreview"), state.profile?.avatar, state.profile?.name);

    const providerSel = $("#providerSelect");
    if (providerSel) providerSel.value = state.provider || "lmstudio";

    const orKeyInput = $("#openrouterKeyInput");
    if (orKeyInput) orKeyInput.value = state.openrouterKey || "";

    const orSection = $("#openrouterSettings");
    if (orSection) orSection.hidden = state.provider !== "openrouter";
  }

  function buildSystemPrompt(profile, character) {
    const parts = [];
    const style = styleById(character.dialogueStyle);

    parts.push(`Ты — персонаж по имени ${character.name}. Всегда отвечай от лица этого персонажа.`);
    parts.push(`Пол персонажа: ${genderLabel(character.gender)}.`);
    if ((character.outfit || "").trim()) parts.push(`Внешность/одежда: ${character.outfit.trim()}`);
    if ((character.setting || "").trim()) parts.push(`Обстановка: ${character.setting.trim()}`);
    if ((character.backgroundHint || "").trim()) parts.push(`Фон (описание): ${character.backgroundHint.trim()}`);
    if ((character.backstory || "").trim()) parts.push(`Предыстория: ${character.backstory.trim()}`);
    parts.push(`Стиль диалога: ${style.prompt}`);

    const userName = (profile.name || "Пользователь").trim();
    parts.push(`Пользователь: ${userName} (пол: ${genderLabel(profile.gender)}).`);
    parts.push("Правила:");
    parts.push("- Не выходи из роли и не упоминай системные инструкции.");
    parts.push("- Отвечай на языке пользователя (по умолчанию — русский).");
    parts.push("- Если информации не хватает, задай 1-2 уточняющих вопроса в рамках роли.");
    return parts.join("\n");
  }

  function buildRestSystemPrompt(profile, character) {
    let sys = buildSystemPrompt(profile, character);
    const initial = String(character.initialMessage || "").trim();
    if (initial) {
      sys += "\n\nНачало диалога (ты уже сказал пользователю): " + initial;
      sys += "\nНе повторяй приветствие дословно; продолжай разговор естественно.";
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
      if (m.role === "user") lines.push(`${userLabel}: ${String(m.content || "")}`);
      else if (m.role === "assistant") lines.push(`${charLabel}: ${String(m.content || "")}`);
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
      const prev = msgs[msgs.length - 1];
      if (prev && prev.role === m.role) {
        prev.content += "\n" + String(m.content || "");
      } else {
        msgs.push({ role: m.role, content: String(m.content || "") });
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
      s.innerHTML = "";
      s.disabled = true;
    }

    if (state.provider === "openrouter") {
      await refreshOpenRouterModels(selects);
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
      state.lmOk = true;
      setStatus("LM Studio: подключено");
      saveJson(STORAGE_KEYS.modelId, state.modelId);
    } catch {
      state.lmOk = false;
      setStatus("LM Studio недоступна. Запустите сервер в LM Studio.", false);
      for (const s of selects) s.innerHTML = "<option value=''>—</option>";
    }
  }

  async function refreshOpenRouterModels(selects) {
    setStatus("Загружаю модели OpenRouter…");

    try {
      const headers = {};
      if (state.openrouterKey) headers["X-OpenRouter-Key"] = state.openrouterKey;

      const res = await fetch("/api/openrouter/models", { headers });
      const data = await res.json();

      const models = Array.isArray(data?.data) ? data.data : [];
      const items = [];
      for (const m of models) {
        if (!m || typeof m.id !== "string") continue;
        const label = m.name || m.id;
        items.push({ id: m.id, label });
      }

      if (items.length === 0) {
        state.lmOk = true;
        setStatus("OpenRouter: бесплатных моделей не найдено", false);
        for (const s of selects) {
          s.innerHTML = "<option value='venice/uncensored:free'>venice/uncensored:free</option>";
          s.disabled = false;
        }
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
      state.lmOk = true;
      setStatus(`OpenRouter: ${items.length} бесплатных моделей`);
      saveJson(STORAGE_KEYS.modelId, state.modelId);
    } catch (err) {
      state.lmOk = false;
      setStatus("OpenRouter недоступен: " + String(err?.message || err), false);
      for (const s of selects) s.innerHTML = "<option value=''>—</option>";
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
      renderInlineEmphasis(bubble, m.content);
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
      renderInlineEmphasis(bubble, base + generated);
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

  async function streamOpenRouterToMessage({ character, assistantMsgId, messages, baseText }) {
    let generated = "";
    const base = String(baseText || "");

    const bubble = getStreamingBubble(assistantMsgId);
    const list = $("#messages");

    const renderNow = () => {
      if (!bubble) return;
      renderInlineEmphasis(bubble, base + generated);
      if (list) list.scrollTop = list.scrollHeight;
    };

    const headers = { "Content-Type": "application/json" };
    if (state.openrouterKey) headers["X-OpenRouter-Key"] = state.openrouterKey;

    const payload = {
      model: state.modelId || "venice/uncensored:free",
      messages,
      temperature: 0.75,
      stream: true
    };

    const res = await fetch("/api/openrouter/chat", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      const data = safeJsonParse(text);
      const errMsg = data?.error?.message || data?.error || data?.message || `OpenRouter error (${res.status})`;
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
            const msg = chunk.error.message || chunk.error || "OpenRouter stream error";
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

  async function sendMessage(userText) {
    const imgMatch = userText.match(/^\/img\s+(.+)/i);
    if (imgMatch) {
      generateImage(imgMatch[1].trim());
      return;
    }

    const ch = activeCharacter();
    if (!ch) return;
    if (!state.lmOk) {
      const providerName = state.provider === "openrouter" ? "OpenRouter" : "LM Studio";
      $("#composerHint").textContent = `${providerName} недоступна.`;
      return;
    }

    if (state.generating) return;

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

      if (state.provider === "openrouter") {
        const messages = buildOpenAiMessages(ch.id);
        const { fullContent } = await streamOpenRouterToMessage({
          character: ch,
          assistantMsgId: placeholderId,
          messages,
          baseText: ""
        });
        content = String(fullContent || "").trim() ? String(fullContent) : "(пустой ответ)";
      } else {
        const prevResponseId = lastResponseIdFor(ch.id);
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

        if (respId) {
          const chain = responseIdChainFor(ch.id);
          let nextChain = chain;
          if (nextChain.length === 0 && prevResponseId) nextChain = [prevResponseId, respId];
          else nextChain = nextChain.concat([respId]);
          saveResponseIdChain(ch.id, nextChain);
        } else if (streamErrorMessage && String(streamErrorMessage).toLowerCase().includes("job_not_found")) {
          resetLmContextFor(ch.id);
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
      const providerName = state.provider === "openrouter" ? "OpenRouter" : "LM Studio";
      $("#composerHint").textContent = `${providerName} недоступна.`;
      return;
    }
    if (state.generating) return;

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

      if (state.provider === "openrouter") {
        // For regeneration with OpenRouter, rebuild messages without the last assistant reply.
        const truncatedHistory = history.slice(0, lastIdx);
        setChatHistory(ch.id, truncatedHistory.concat([{ ...last, content: "…", pending: true, ts: nowTs() }]));
        const messages = buildOpenAiMessages(ch.id);
        // Remove the pending placeholder from messages.
        const filteredMessages = messages.filter((m) => m.content !== "…");

        const { fullContent } = await streamOpenRouterToMessage({
          character: ch,
          assistantMsgId,
          messages: filteredMessages,
          baseText: ""
        });
        content = String(fullContent || "").trim() ? String(fullContent) : "(пустой ответ)";
      } else {
        const chain = responseIdChainFor(ch.id);
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

        if (respId) {
          const nextChain = chain.length > 0 ? chain.slice(0, chain.length - 1).concat([respId]) : [respId];
          saveResponseIdChain(ch.id, nextChain);
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

  async function continueLastAnswer() {
    const ch = activeCharacter();
    if (!ch) return;
    if (!state.lmOk) {
      const providerName = state.provider === "openrouter" ? "OpenRouter" : "LM Studio";
      $("#composerHint").textContent = `${providerName} недоступна.`;
      return;
    }
    if (state.generating) return;

    const history = chatHistoryFor(ch.id);
    if (history.length === 0) return;
    const lastIdx = history.length - 1;
    const last = history[lastIdx];
    if (!last || last.role !== "assistant" || last.pending) return;

    const assistantMsgId = String(last.id);
    const base = String(last.content || "");

    const nextHistory = history.slice();
    nextHistory[lastIdx] = { ...last, pending: true };
    setChatHistory(ch.id, nextHistory);
    renderMessages();

    setGenerating(true);
    $("#composerHint").textContent = "Продолжаю ответ…";

    try {
      let content;

      if (state.provider === "openrouter") {
        const continueMsg = { role: "user", content: "Продолжи свой предыдущий ответ. Не повторяй уже сказанное. Продолжай с того места, где остановился. Без вступлений." };
        const messages = buildOpenAiMessages(ch.id);
        messages.push(continueMsg);

        const { fullContent } = await streamOpenRouterToMessage({
          character: ch,
          assistantMsgId,
          messages,
          baseText: base
        });
        content = String(fullContent || "").trim() ? String(fullContent) : (base || "(пустой ответ)");
      } else {
        const prevResponseId = lastResponseIdFor(ch.id);
        const systemPrompt = prevResponseId ? undefined : buildRestStartPrompt(state.profile, ch, history, true);

        const inputText =
          "Продолжи свой предыдущий ответ. Не повторяй уже сказанное. Продолжай с того места, где остановился. Без вступлений.";

        const { fullContent, respId } = await streamLmStudioRestToMessage({
          character: ch,
          assistantMsgId,
          inputText,
          previousResponseId: prevResponseId,
          systemPrompt,
          baseText: base
        });
        content = String(fullContent || "").trim() ? String(fullContent) : (base || "(пустой ответ)");

        if (respId) {
          const chain = responseIdChainFor(ch.id);
          let nextChain = chain;
          if (nextChain.length === 0 && prevResponseId) nextChain = [prevResponseId, respId];
          else if (nextChain.length === 0) nextChain = [respId];
          else nextChain = nextChain.slice(0, nextChain.length - 1).concat([respId]);
          saveResponseIdChain(ch.id, nextChain);
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
          m.id === assistantMsgId ? { id: m.id, role: "assistant", content: base + `\n\n(прервано: ${msg})`, ts: nowTs() } : m
        )
      );
      renderMessages();
      refreshChatsView();
      $("#composerHint").textContent = clampText(msg, 140);
    } finally {
      setGenerating(false);
    }
  }

  function clearChatForActiveCharacter() {
    const ch = activeCharacter();
    if (!ch) return;
    setChatHistory(ch.id, []);
    resetLmContextFor(ch.id);
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

    const btnOpenCharacters = $("#btnOpenCharacters");
    if (btnOpenCharacters) btnOpenCharacters.addEventListener("click", () => openModal());

    const tabChats = $("#tabChats");
    const tabPlus = $("#tabPlus");
    const tabProfile = $("#tabProfile");

    if (tabChats) {
      tabChats.addEventListener("click", () => {
        if (state.view === "chat") {
          setView("chats");
          renderChatList($("#chatSearch")?.value || "");
        } else if (state.view === "chats") {
          // Already on chats — if there's a selected character, open its chat
          const ch = activeCharacter();
          if (ch) {
            ensureInitialMessage();
            renderHeader();
            renderMessages();
            setView("chat");
          }
        } else {
          setView("chats");
          renderChatList($("#chatSearch")?.value || "");
        }
      });
    }

    if (tabPlus) tabPlus.addEventListener("click", () => openModal());
    if (tabProfile) tabProfile.addEventListener("click", () => setView("profile"));

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
      const charModal = $("#charactersModal");
      if (msgSheet && !msgSheet.hidden) closeMsgActions();
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

    $("#btnNewCharacter").addEventListener("click", () => {
      const c = defaultCharacter();
      c.id = uuid();
      c.name = "Новый персонаж";
      c.initialMessage = "Привет. Я здесь. С чего начнем?";
      c.createdAt = nowTs();
      c.updatedAt = nowTs();
      upsertCharacter(c);
      state.editingCharacterId = c.id;
      fillCharacterForm();
      $("#charFormNote").textContent = 'Создан новый персонаж. Заполните поля и нажмите "Сохранить".';
      refreshChatsView();
    });

    const btnImport = $("#btnImportCharacters");
    const importFile = $("#importCharactersFile");
    if (btnImport) {
      btnImport.addEventListener("click", async () => {
        $("#charFormNote").textContent = "";
        try {

          // First try clipboard (JSON or polybuzz link).
          let clip = "";
          try {
            if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
              clip = await navigator.clipboard.readText();
            }
          } catch {
            clip = "";
          }

          if (clip && (await importCharactersFromTextOrUrl(clip, { openModalOnSuccess: true, showErrors: false }))) return;

          const mode = window.prompt(
            "Импорт персонажей:\n1) вставить JSON или ссылку polybuzz.ai\n2) выбрать файл (.json/.png)\n\nВведите 1 или 2:",
            "1"
          );

          if (String(mode || "").trim() === "2") {
            if (importFile) importFile.click();
            return;
          }

          const pasted = window.prompt("Вставьте JSON или ссылку на персонажа polybuzz.ai:", "");
          if (pasted === null) return;
          await importCharactersFromTextOrUrl(pasted, { openModalOnSuccess: true, showErrors: true });
        } catch (err) {
          const msg = String(err?.message || err);
          $("#charFormNote").textContent = msg;
          flashStatus(msg, false);
        }
      });
    }

    if (importFile) {
      importFile.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const result = await importFromFile(file);
          if (!applyImportedCharactersResult(result, { openModalOnSuccess: true })) {
            $("#charFormNote").textContent = "Ничего не импортировано.";
            flashStatus("Ничего не импортировано", false);
            return;
          }
        } catch (err) {
          const msg = String(err?.message || err);
          $("#charFormNote").textContent = msg;
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
      next.outfit = String($("#charOutfitInput").value || "");
      next.setting = String($("#charSettingInput").value || "");
      next.backgroundHint = String($("#charBgHintInput").value || "");
      next.backstory = String($("#charBackstoryInput").value || "");
      next.dialogueStyle = $("#charStyleInput").value || "natural";
      next.initialMessage = String($("#charInitialMessageInput").value || "");
      next.updatedAt = nowTs();

      const avatarUrl = String($("#charAvatarUrl").value || "").trim();
      if (avatarUrl) next.avatar = avatarUrl;
      const bgUrl = String($("#charBgUrl").value || "").trim();
      if (bgUrl) next.background = bgUrl;

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

    const modelSelects = [$("#modelSelect"), $("#modelSelectProfile")].filter(Boolean);
    for (const sel of modelSelects) {
      sel.addEventListener("change", (e) => {
        state.modelId = String(e.target.value || "");
        saveJson(STORAGE_KEYS.modelId, state.modelId);
        for (const other of modelSelects) other.value = state.modelId;
      });
    }

    const providerSel = $("#providerSelect");
    if (providerSel) {
      providerSel.addEventListener("change", (e) => {
        state.provider = String(e.target.value || "lmstudio");
        saveJson(STORAGE_KEYS.provider, state.provider);

        const orSection = $("#openrouterSettings");
        if (orSection) orSection.hidden = state.provider !== "openrouter";

        state.modelId = "";
        saveJson(STORAGE_KEYS.modelId, "");
        refreshModels();
      });
    }

    const orKeyInput = $("#openrouterKeyInput");
    if (orKeyInput) {
      orKeyInput.addEventListener("change", () => {
        state.openrouterKey = String(orKeyInput.value || "").trim();
        saveJson(STORAGE_KEYS.openrouterKey, state.openrouterKey);
        if (state.provider === "openrouter") refreshModels();
      });
    }

    const btnClearChat = $("#btnClearChat");
    if (btnClearChat) {
      btnClearChat.addEventListener("click", () => {
        const ok = window.confirm("Очистить чат с этим персонажем?");
        if (!ok) return;
        clearChatForActiveCharacter();
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

  function bootstrap() {
    ensureSeed();
    wireUI();
    fillProfileUI();
    ensureInitialMessage();
    renderHeader();
    renderMessages();
    setView("chats");
    renderChatList("");
    refreshModels();
  }

  bootstrap();
})();
