// ============================================================
// GURPS AI TRPG GM - Cloudflare Worker
// Tool Calling (Function Calling) によるAI主導ステータス管理
// ============================================================

// --------------- Tool Definitions ---------------
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'set_attributes',
      description: 'プレイヤーの基本能力値を絶対値で設定します。省略した項目は変更しません。',
      parameters: {
        type: 'object',
        properties: {
          st: { type: 'integer', minimum: 1, maximum: 20, description: '筋力 (Strength)' },
          dx: { type: 'integer', minimum: 1, maximum: 20, description: '敏捷性 (Dexterity)' },
          iq: { type: 'integer', minimum: 1, maximum: 20, description: '知力 (Intelligence)' },
          ht: { type: 'integer', minimum: 1, maximum: 20, description: '生命力 (Health)' },
          hp: { type: 'integer', minimum: 0, description: '現在HP' },
          fp: { type: 'integer', minimum: 0, description: '現在FP' },
          hp_max: { type: 'integer', minimum: 0, description: '最大HP' },
          fp_max: { type: 'integer', minimum: 0, description: '最大FP' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_skill',
      description: '技能を追加または更新します。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '技能名' },
          difficulty: { type: 'string', enum: ['E', 'A', 'H'], description: '難度 E(易)/A(並)/H(難)' },
          cp: { type: 'integer', description: '消費CP (1/2/4/8/12/16/20/24/28)' },
          attr: { type: 'string', enum: ['st', 'dx', 'iq', 'ht'], description: '基準属性 (省略時: iq)' }
        },
        required: ['name', 'difficulty', 'cp']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_skill',
      description: '技能を削除します。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '削除する技能名' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_advantage',
      description: '有利な特徴(正のCP)または不利な特徴(負のCP)を追加・更新します。同名称の場合は上書きされます。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '特徴名' },
          cost: { type: 'integer', description: 'CP (有利は正の値、不利は負の値)' }
        },
        required: ['name', 'cost']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_advantage',
      description: '特徴を削除します。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '削除する特徴名' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_character_name',
      description: 'キャラクター名を設定します。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'キャラクター名' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'roll_dice',
      description: '3D6で成功判定を行います。目標値以下で成功。結果はチャットに表示されます。',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'integer', description: '目標値' },
          modifier: { type: 'integer', description: '修正値 (省略可)' }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reset_character',
      description: 'キャラクターを初期状態にリセットします。ユーザーが明示的に要求した場合のみ使用してください。',
      parameters: {
        type: 'object',
        properties: {
          confirm: { type: 'boolean', description: '本当にリセットする場合はtrue' }
        },
        required: ['confirm']
      }
    }
  }
];

// --------------- GURPS Rules (server-side) ---------------
const ATTR_COST = { st: 10, dx: 20, iq: 20, ht: 10 };
const HP_COST = 2, FP_COST = 3;

function calcUsedCp(char) {
  let total = (char.st - 10) * ATTR_COST.st;
  total += (char.dx - 10) * ATTR_COST.dx;
  total += (char.iq - 10) * ATTR_COST.iq;
  total += (char.ht - 10) * ATTR_COST.ht;
  total += (char.hp_max - char.st) * HP_COST;
  total += (char.fp_max - char.ht) * FP_COST;
  const skills = JSON.parse(char.skills || '[]');
  for (const s of skills) total += s.cp || 0;
  const advs = JSON.parse(char.advantages || '[]');
  for (const a of advs) total += a.cost || 0;
  return total;
}

// --------------- D1 Operations ---------------
async function getChar(db) {
  const row = await db.prepare('SELECT * FROM characters WHERE id = 1').first();
  if (!row) {
    await db.prepare('INSERT INTO characters (id) VALUES (1)').run();
    return await db.prepare('SELECT * FROM characters WHERE id = 1').first();
  }
  return row;
}

async function updateChar(db, updates) {
  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const vals = Object.values(updates);
  vals.push(new Date().toISOString());
  await db.prepare(`UPDATE characters SET ${sets}, updated_at = ? WHERE id = 1`).bind(...vals).run();
  return await getChar(db);
}

// --------------- System Prompt ---------------
const SYSTEM_PROMPT = `あなたはGURPS（ガープス）TRPGの優秀なゲームマスター（GM）です。
【絶対ルール】
- 必ず日本語のみで出力してください。英単語・他言語を一切混ぜないでください。
- あなたが全てのキャラクターステータスを管理します。数値の変更は必ず provided functions を使用してください。
- プレイヤーは直接数値を変更できません。チャットで依頼を受け、あなたが判断して functions を呼び出してください。
- CAP(キャラクターポイント)の基本値は100CPです。能力値・技能・特徴の合計が100CPに収まるようにしてください。
- 戦闘やイベントでHP/FPが変動した場合も functions を使用して即座に反映してください。
- NPCとして発言する場合は 【NPC名】 の形式で先頭に付けてください。`;

const GURPS_RULES = `
【基本ルール】
■ 成功判定（3D6）: 3D6の合計 <= 実効スキルで成功
■ キャラクター作成（基本CP: 100）
- ST/HT: ±10CP/レベル（基本値10）
- DX/IQ: ±20CP/レベル（基本値10）
- HP: ST基準 ±2CP/レベル、FP: HT基準 ±3CP/レベル
■ 技能コスト表
- Easy: 1CP=属性-1, 2CP=属性+0, 4CP=属性+1, 以降+4CPで+1
- Average: 1CP=属性-2, 2CP=属性-1, 4CP=属性+0, 以降+4CPで+1
- Hard: 0CP=属性-3, 1CP=属性-2, 2CP=属性-1, 4CP=属性+0, 以降+4CPで+1`;

// --------------- Tool Handlers ---------------
async function handleToolCall(name, args, db) {
  const char = await getChar(db);

  switch (name) {
    case 'set_attributes': {
      const updates = {};
      const attrFields = { st: 'st', dx: 'dx', iq: 'iq', ht: 'ht' };
      for (const [k, v] of Object.entries(attrFields)) {
        if (args[k] !== undefined) updates[k] = args[k];
      }
      if (args.hp !== undefined) updates.hp = Math.min(args.hp, updates.hp_max || char.hp_max);
      if (args.fp !== undefined) updates.fp = Math.min(args.fp, updates.fp_max || char.fp_max);
      if (args.hp_max !== undefined) updates.hp_max = args.hp_max;
      if (args.fp_max !== undefined) updates.fp_max = args.fp_max;
      await updateChar(db, updates);
      return { success: true, message: '能力値を更新しました' };
    }

    case 'set_character_name': {
      await updateChar(db, { name: args.name });
      return { success: true, message: `名前を「${args.name}」に設定しました` };
    }

    case 'add_skill': {
      const skills = JSON.parse(char.skills || '[]');
      const idx = skills.findIndex(s => s.name === args.name);
      const skill = { name: args.name, diff: args.difficulty, cp: args.cp, attr: args.attr || 'iq' };
      if (idx >= 0) skills[idx] = skill;
      else skills.push(skill);
      const used = calcUsedCp({ ...char, skills: JSON.stringify(skills) });
      if (used > char.total_cp) return { success: false, message: `CP超過です (現在${used}/${char.total_cp})` };
      await updateChar(db, { skills: JSON.stringify(skills) });
      return { success: true, message: `技能「${args.name}」を追加しました` };
    }

    case 'remove_skill': {
      const skills = JSON.parse(char.skills || '[]').filter(s => s.name !== args.name);
      await updateChar(db, { skills: JSON.stringify(skills) });
      return { success: true, message: `技能「${args.name}」を削除しました` };
    }

    case 'add_advantage': {
      const advs = JSON.parse(char.advantages || '[]');
      const idx = advs.findIndex(a => a.name === args.name);
      const adv = { name: args.name, cost: args.cost };
      if (idx >= 0) advs[idx] = adv;
      else advs.push(adv);
      const used = calcUsedCp({ ...char, advantages: JSON.stringify(advs) });
      if (used > char.total_cp) return { success: false, message: `CP超過です (現在${used}/${char.total_cp})` };
      await updateChar(db, { advantages: JSON.stringify(advs) });
      return { success: true, message: `特徴「${args.name}」を追加しました` };
    }

    case 'remove_advantage': {
      const advs = JSON.parse(char.advantages || '[]').filter(a => a.name !== args.name);
      await updateChar(db, { advantages: JSON.stringify(advs) });
      return { success: true, message: `特徴「${args.name}」を削除しました` };
    }

    case 'roll_dice': {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const d3 = Math.floor(Math.random() * 6) + 1;
      const total = d1 + d2 + d3;
      const target = args.target + (args.modifier || 0);
      const success = total <= target;
      return {
        success: true,
        message: `【判定】目標値${target} | 出目:${total}(${d1},${d2},${d3}) | ${success ? '成功' : '失敗'}`,
        roll: { d1, d2, d3, total, target, success }
      };
    }

    case 'reset_character': {
      if (!args.confirm) return { success: false, message: 'リセットがキャンセルされました' };
      await db.prepare(`UPDATE characters SET name='', st=10, dx=10, iq=10, ht=10, hp=10, hp_max=10, fp=10, fp_max=10, total_cp=100, will=10, per=10, skills='[]', advantages='[]', updated_at=datetime('now') WHERE id=1`).run();
      return { success: true, message: 'キャラクターを初期化しました' };
    }

    default:
      return { success: false, message: `未知の関数: ${name}` };
  }
}

// --------------- Character Data Formatter ---------------
function formatCharacterData(char) {
  const skills = JSON.parse(char.skills || '[]');
  const advs = JSON.parse(char.advantages || '[]');
  const used = calcUsedCp(char);
  let text = `【現在のキャラクター】
名前: ${char.name || '未設定'}
ST:${char.st} DX:${char.dx} IQ:${char.iq} HT:${char.ht}
HP:${char.hp}/${char.hp_max} FP:${char.fp}/${char.fp_max}
CP: ${used}/${char.total_cp} (残り${char.total_cp - used})`;
  if (skills.length) {
    text += '\n【技能】';
    for (const s of skills) text += `\n- ${s.name} (難度${s.diff}/${s.attr.toUpperCase()}) CP:${s.cp}`;
  }
  if (advs.length) {
    text += '\n【特徴】';
    for (const a of advs) text += `\n- ${a.name} (${a.cost >= 0 ? '-' : '+'}${Math.abs(a.cost)}CP)`;
  }
  return text;
}

// --------------- OpenRouter API Call ---------------
async function callOpenRouter(apiKey, model, messages) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
      'HTTP-Referer': 'https://gurps-trpg.app',
      'X-Title': 'GURPS AI TRPG GM'
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      tools: TOOLS,
      tool_choice: 'auto'
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return await res.json();
}

// --------------- Message History ---------------
async function getMessages(db) {
  const rows = await db.prepare('SELECT role, content, ts FROM messages ORDER BY id ASC').all();
  // Map to OpenAI message format, preserving last tool result
  const msgs = [];
  let lastToolCallId = null;
  for (const r of rows.results) {
    if (r.role === 'tool') {
      if (lastToolCallId) {
        msgs.push({ role: 'tool', tool_call_id: lastToolCallId, content: r.content });
        lastToolCallId = null;
      }
    } else if (r.role === 'assistant') {
      // Check if this message has tool_calls embedded
      try {
        const parsed = JSON.parse(r.content);
        if (parsed.tool_calls) {
          msgs.push({ role: 'assistant', content: parsed.text || null, tool_calls: parsed.tool_calls });
          if (parsed.tool_calls.length) lastToolCallId = parsed.tool_calls[0].id;
        } else {
          msgs.push({ role: 'assistant', content: r.content });
        }
      } catch {
        msgs.push({ role: 'assistant', content: r.content });
      }
    } else {
      msgs.push({ role: r.role, content: r.content });
      lastToolCallId = null;
    }
  }
  return msgs;
}

async function addMessage(db, role, content, ts) {
  await db.prepare('INSERT INTO messages (role, content, ts) VALUES (?, ?, ?)').bind(role, content, ts || Date.now()).run();
}

// --------------- Main Router ---------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const db = env.DB;

    // POST /api/chat
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const { message, apiKey, model } = await request.json();
        if (!apiKey) return new Response(JSON.stringify({ error: 'APIキーが必要です' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        // Save user message
        await addMessage(db, 'user', message);

        // Build message list
        const char = await getChar(db);
        const systemText = SYSTEM_PROMPT + GURPS_RULES + '\n\n' + formatCharacterData(char);
        const history = await getMessages(db);
        const messages = [{ role: 'system', content: systemText }, ...history];

        // Call OpenRouter
        const data = await callOpenRouter(apiKey, model || 'nvidia/nemotron-3-super-120b-a12b:free', messages);

        const choice = data.choices[0];
        const replyText = choice.message.content || '';
        const toolCalls = choice.message.tool_calls;

        // Save assistant response
        let finalReply = replyText;
        const toolResults = [];

        if (toolCalls && toolCalls.length) {
          // Save assistant message with tool calls
          await addMessage(db, 'assistant', JSON.stringify({
            text: replyText,
            tool_calls: toolCalls.map(tc => ({ id: tc.id, type: tc.type, function: tc.function }))
          }));

          // Execute tool calls
          for (const tc of toolCalls) {
            const args = JSON.parse(tc.function.arguments);
            const result = await handleToolCall(tc.function.name, args, db);
            toolResults.push({ name: tc.function.name, result });
            await addMessage(db, 'tool', JSON.stringify(result), Date.now());

            // If dice roll, show result in reply
            if (tc.function.name === 'roll_dice' && result.roll) {
              finalReply += (finalReply ? '\n' : '') + result.message;
            }
            // If error, append to reply
            if (!result.success) {
              finalReply += (finalReply ? '\n' : '') + `⚠️ ${result.message}`;
            }
          }

          // Build second request with tool results for AI to summarize
          const updatedChar = await getChar(db);
          const secondMessages = [
            { role: 'system', content: SYSTEM_PROMPT + GURPS_RULES + '\n\n' + formatCharacterData(updatedChar) },
            ...await getMessages(db)
          ];

          const secondData = await callOpenRouter(apiKey, model || 'nvidia/nemotron-3-super-120b-a12b:free', secondMessages);
          const secondChoice = secondData.choices[0];
          if (secondChoice.message.content) {
            finalReply = secondChoice.message.content;
            // Update the assistant message in DB
            await addMessage(db, 'assistant', finalReply);
          }
        } else {
          await addMessage(db, 'assistant', replyText);
        }

        const finalChar = await getChar(db);

        return new Response(JSON.stringify({
          reply: finalReply,
          character: {
            name: finalChar.name,
            st: finalChar.st, dx: finalChar.dx, iq: finalChar.iq, ht: finalChar.ht,
            hp: finalChar.hp, hpMax: finalChar.hp_max, fp: finalChar.fp, fpMax: finalChar.fp_max,
            totalCp: finalChar.total_cp, will: finalChar.will, per: finalChar.per
          },
          skills: JSON.parse(finalChar.skills || '[]'),
          advantages: JSON.parse(finalChar.advantages || '[]'),
          toolResults
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // POST /api/reset
    if (url.pathname === '/api/reset' && request.method === 'POST') {
      await db.prepare('DELETE FROM messages').run();
      await db.prepare(`UPDATE characters SET name='', st=10, dx=10, iq=10, ht=10, hp=10, hp_max=10, fp=10, fp_max=10, total_cp=100, will=10, per=10, skills='[]', advantages='[]', updated_at=datetime('now') WHERE id=1`).run();
      await db.prepare('DELETE FROM world').run();
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // GET /api/character
    if (url.pathname === '/api/character') {
      const char = await getChar(db);
      return new Response(JSON.stringify({
        name: char.name,
        st: char.st, dx: char.dx, iq: char.iq, ht: char.ht,
        hp: char.hp, hpMax: char.hp_max, fp: char.fp, fpMax: char.fp_max,
        totalCp: char.total_cp, will: char.will, per: char.per,
        skills: JSON.parse(char.skills || '[]'),
        advantages: JSON.parse(char.advantages || '[]')
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // POST /api/world (save world info)
    if (url.pathname === '/api/world' && request.method === 'POST') {
      const { name, description } = await request.json();
      await db.prepare('DELETE FROM world').run();
      await db.prepare('INSERT INTO world (name, description) VALUES (?, ?)').bind(name || '', description || '').run();
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // GET /api/world
    if (url.pathname === '/api/world') {
      const row = await db.prepare('SELECT * FROM world ORDER BY id DESC LIMIT 1').first();
      return new Response(JSON.stringify(row || { name: '', description: '' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- Saved Characters CRUD ----

    // GET /api/characters - list all saved characters
    if (url.pathname === '/api/characters' && request.method === 'GET') {
      const rows = await db.prepare('SELECT id, name, world_name, total_cp, created_at, updated_at FROM saved_characters ORDER BY updated_at DESC').all();
      return new Response(JSON.stringify(rows.results || []), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // POST /api/characters - save current character
    if (url.pathname === '/api/characters' && request.method === 'POST') {
      try {
        const _b = await request.json();
        const _n = (_b.name||'')+'', _wn = (_b.world_name||'')+'';
        const _st = Number(_b.st)||10, _dx = Number(_b.dx)||10, _iq = Number(_b.iq)||10, _ht = Number(_b.ht)||10;
        const _hp = Number(_b.hp)||10, _hm = Number(_b.hp_max)||10, _fp = Number(_b.fp)||10, _fm = Number(_b.fp_max)||10;
        const _tc = Number(_b.total_cp)||100, _wl = Number(_b.will)||10, _pr = Number(_b.per)||10;
        const _sk = JSON.stringify(_b.skills||[]), _ad = JSON.stringify(_b.advantages||[]), _nt = (_b.notes||'')+'';
        const _sql = 'INSERT INTO saved_characters (name,world_name,st,dx,iq,ht,hp,hp_max,fp,fp_max,total_cp,will,per,skills,advantages,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
        await db.prepare(_sql).bind(_n,_wn,_st,_dx,_iq,_ht,_hp,_hm,_fp,_fm,_tc,_wl,_pr,_sk,_ad,_nt).run();
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // DELETE /api/characters - clear all (with confirm)
    if (url.pathname === '/api/characters' && request.method === 'DELETE') {
      await db.prepare('DELETE FROM saved_characters').run();
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // GET /api/characters/:id - get one character
    const charDetailMatch = url.pathname.match(/^\/api\/characters\/(\d+)$/);
    if (charDetailMatch && request.method === 'GET') {
      const row = await db.prepare('SELECT * FROM saved_characters WHERE id = ?').bind(parseInt(charDetailMatch[1])).first();
      if (!row) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      row.skills = JSON.parse(row.skills || '[]');
      row.advantages = JSON.parse(row.advantages || '[]');
      return new Response(JSON.stringify(row), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // DELETE /api/characters/:id - delete one
    if (charDetailMatch && request.method === 'DELETE') {
      await db.prepare('DELETE FROM saved_characters WHERE id = ?').bind(parseInt(charDetailMatch[1])).run();
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // GET / - serve index.html
    return new Response('GURPS AI TRPG GM Worker is running. POST /api/chat to send messages.', {
      headers: { 'Content-Type': 'text/plain', ...corsHeaders }
    });
  }
};
