// ============================================================
// GURPS Rules Engine v2 — 全8パート対応
// ============================================================
const GURPS_RULES = {
  _ready: false,
  _data: null,

  _defaults: {
    core: {
      title: "GURPS Lite 4th Edition",
      cpBudget: 100,
      disadvantageLimit: 0.5,
      quirksLimit: 5,
      minEffectiveSkill: 3,
      offHandPenalty: -4,
      ruleOf20: true,
      attributes: {
        st: { base: 10, costPerLevel: 10, min: 1, max: 20, label: "筋力(ST)" },
        dx: { base: 10, costPerLevel: 20, min: 1, max: 20, label: "敏捷性(DX)" },
        iq: { base: 10, costPerLevel: 20, min: 1, max: 20, label: "知力(IQ)" },
        ht: { base: 10, costPerLevel: 10, min: 1, max: 20, label: "生命力(HT)" }
      },
      secondaries: {
        hp: { baseAttr: "st", costPerLevel: 2, min: 1, max: 40, label: "HP" },
        fp: { baseAttr: "ht", costPerLevel: 3, min: 1, max: 40, label: "FP" },
        will: { baseAttr: "iq", costPerLevel: 5, min: 1, max: 20, label: "意志" },
        per: { baseAttr: "iq", costPerLevel: 5, min: 1, max: 20, label: "知覚" }
      },
      derived: [
        { key: "basicSpeed", label: "基本速度", formula: "(DX+HT)/4（端数切捨てなし）" },
        { key: "basicMove", label: "基本移動力", formula: "基本速度の整数部" },
        { key: "dodge", label: "よけ", formula: "基本速度+3（端数切捨て）" },
        { key: "basicLift", label: "基本リフト(BL)", formula: "(ST×ST)/5", unit: "ポンド" }
      ],
      reaction: {
        table: [
          { min: -99, max: 0, label: "破滅的", description: "即座に攻撃、裏切りなど" },
          { min: 1, max: 3, label: "非常に悪い", description: "露骨な敵意、不当な取引" },
          { min: 4, max: 6, label: "悪い", description: "無関心、利益があれば敵対" },
          { min: 7, max: 9, label: "お粗末", description: "非協力的、高額な賄賂を要求" },
          { min: 10, max: 12, label: "中立", description: "事務的、儀礼的" },
          { min: 13, max: 15, label: "良い", description: "協力的、常識的な依頼に応じる" },
          { min: 16, max: 18, label: "非常に良い", description: "友好的、自発的な援助" },
          { min: 19, max: 99, label: "最高", description: "心酔、自己犠牲的な援助" }
        ]
      }
    },
    skills: {
      difficulties: {
        E: { label: "易(E)", costTable: { "0": -4, "1": -1, "2": 0, "4": 1, "8": 2, "12": 3, "16": 4, "20": 5, "24": 6, "28": 7 }, validCpLevels: [0, 1, 2, 4, 8, 12, 16, 20, 24, 28] },
        A: { label: "並(A)", costTable: { "0": -5, "1": -2, "2": -1, "4": 0, "8": 1, "12": 2, "16": 3, "20": 4, "24": 5, "28": 6 }, validCpLevels: [0, 1, 2, 4, 8, 12, 16, 20, 24, 28] },
        H: { label: "難(H)", costTable: { "0": -6, "1": -3, "2": -2, "4": -1, "8": 0, "12": 1, "16": 2, "20": 3, "24": 4, "28": 5 }, validCpLevels: [0, 1, 2, 4, 8, 12, 16, 20, 24, 28] },
        VH: { label: "至難(VH)", costTable: { "0": -7, "1": -4, "2": -3, "4": -2, "8": -1, "12": 0, "16": 1, "20": 2, "24": 3, "28": 4, "32": 5, "36": 6, "40": 7 }, validCpLevels: [0, 1, 2, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40] }
      },
      defaultAttr: "iq",
      defaultPenalties: { E: -4, A: -5, H: -6, VH: -7 },
      ruleOf20: true,
      maxQuirks: 5,
      quirksCost: -1
    },
    combat: {
      woundingModifiers: { imp: 2.0, cut: 1.5, "pi+": 1.5, "pi-": 0.5, pi: 1.0, cr: 1.0, burn: 1.0, tox: 1.0, fat: 1.0, spec: 1.0 },
      minimumInjury: 1,
      damageTable: {
        thrust: [0,"1d-6","1d-6","1d-5","1d-5","1d-4","1d-4","1d-3","1d-3","1d-2","1d-2","1d-1","1d-1","1d","1d","1d+1","1d+1","1d+2","1d+2","2d-1","2d-1"],
        swing: [0,"1d-5","1d-5","1d-4","1d-4","1d-3","1d-3","1d-2","1d-2","1d-1","1d","1d+1","1d+2","2d-1","2d","2d+1","2d+2","3d-1","3d","3d+1","3d+2"]
      }
    }
  },

  // === 初期化 ===
  async init(basePath) {
    basePath = basePath || '.';
    var self = this;
    try {
      var [core, skills, combat, equip] = await Promise.all([
        fetch(basePath + '/rules/core.json').then(function(r) { if (!r.ok) throw new Error('core.json'); return r.json(); }),
        fetch(basePath + '/rules/skills.json').then(function(r) { if (!r.ok) throw new Error('skills.json'); return r.json(); }),
        fetch(basePath + '/rules/combat.json').then(function(r) { if (!r.ok) throw new Error('combat.json'); return r.json(); }),
        fetch(basePath + '/rules/equipment.json').then(function(r) { if (!r.ok) throw new Error('equipment.json'); return r.json(); }).catch(function() { return null; })
      ]);
      self._data = { core: core, skills: skills, combat: combat, equipment: equip };
    } catch (e) {
      console.warn('[GURPS_RULES] JSON読み込み失敗、デフォルト使用:', e.message);
      self._data = self._defaults;
    }
    self._ready = true;
    console.log('[GURPS_RULES] v2 初期化完了');
    return self;
  },

  ready: function() { return this._ready; },

  // === 属性 ===
  getAttrDef: function(attr) {
    var d = this._data.core.attributes[attr];
    if (d) return d;
    var low = attr.toLowerCase();
    return this._data.core.attributes[low] || null;
  },
  attrCostPerLevel: function(attr) { var d = this.getAttrDef(attr); return d ? d.costPerLevel : 10; },
  attrBase: function(attr) { var d = this.getAttrDef(attr); return d ? d.base : 10; },
  attrLabel: function(attr) {
    var labels = { st: '筋力', dx: '敏捷性', iq: '知力', ht: '生命力' };
    return labels[attr] || attr.toUpperCase();
  },

  // === 副属性 ===
  getSecondaryDef: function(key) { return this._data.core.secondaries[key] || null; },
  secondaryCostPerLevel: function(key) { var d = this.getSecondaryDef(key); return d ? d.costPerLevel : 0; },
  secondaryBaseAttr: function(key) { var d = this.getSecondaryDef(key); return d ? d.baseAttr : null; },

  // === 技能 ===
  getSkillDiff: function(diff) { return this._data.skills.difficulties[diff] || null; },
  getSkillCostTable: function(diff) { var d = this.getSkillDiff(diff); return d ? d.costTable : null; },
  skillValidCpLevels: function() {
    var any = this.getSkillDiff('E');
    return any ? any.validCpLevels : [1, 2, 4, 8, 12, 16, 20, 24, 28];
  },
  skillDefaultAttr: function() { return this._data.skills.defaultAttr || 'iq'; },
  skillLabel: function(diff) { var d = this.getSkillDiff(diff); return d ? d.label : '並'; },
  skillDefaultPenalty: function(diff) {
    var p = this._data.skills.defaultPenalties;
    return p ? (p[diff] || -4) : -4;
  },
  skillCpForLevel: function(diff, attrVal, targetLevel) {
    var table = this.getSkillCostTable(diff);
    if (!table) return null;
    var needed = targetLevel - attrVal;
    var best = 999;
    for (var cp in table) {
      if (table[cp] >= needed) { var n = parseInt(cp); if (n > 0 && n < best) best = n; }
    }
    return best === 999 ? null : best;
  },
  skillRelativeBonus: function(diff, cp) {
    var table = this.getSkillCostTable(diff);
    if (!table) return -4;
    var best = -10;
    var levels = this.skillValidCpLevels();
    for (var i = levels.length - 1; i >= 0; i--) {
      var c = levels[i];
      if (cp >= c && table[c] !== undefined) { best = table[c]; break; }
    }
    return best === -10 ? -4 : best;
  },

  // === 戦闘 ===
  woundingMod: function(type) { return this._data.combat.woundingModifiers[type] || 1.0; },
  getDamageTypes: function() { return this._data.combat.damageTypes || []; },
  getMinInjury: function() { return this._data.combat.minimumInjury || 1; },
  getThrustDmg: function(st) {
    var idx = Math.min(Math.max(Math.round(st), 1), 20);
    return this._data.combat.damageTable.thrust[idx] || '1d-2';
  },
  getSwingDmg: function(st) {
    var idx = Math.min(Math.max(Math.round(st), 1), 20);
    return this._data.combat.damageTable.swing[idx] || '1d';
  },
  getAllManeuvers: function() { return this._data.combat.maneuvers || []; },
  getPosture: function() { return this._data.combat.posture || {}; },
  getDefenseMods: function() { return this._data.combat.defenseModifiers || {}; },

  // === CP計算 ===
  calcAttrCp: function(attr, value) {
    var def = this.getAttrDef(attr);
    if (!def) return 0;
    return (value - def.base) * def.costPerLevel;
  },
  calcSecondaryCp: function(key, value, baseAttrValue) {
    var def = this.getSecondaryDef(key);
    if (!def) return 0;
    return (value - baseAttrValue) * def.costPerLevel;
  },
  calcSkillCp: function(skillCp) { return skillCp || 0; },
  calcAdvantageCp: function(advCost) { return advCost || 0; },

  // === 状態 ===
  getShockPenalty: function(hpLost) { return Math.min(Math.max(hpLost, 0), 4); },
  isMajorWound: function(damage, maxHp) {
    return damage > maxHp * (this._data.combat.injuryEffects ? this._data.combat.injuryEffects.majorWoundThreshold : 0.5);
  },
  getHpThresholdEffects: function(currentHp, maxHp) {
    var ratio = currentHp / maxHp;
    var effects = [];
    var thresholds = this._data.combat.injuryEffects ? this._data.combat.injuryEffects.hpThresholds : [];
    for (var i = 0; i < thresholds.length; i++) {
      var t = thresholds[i];
      if (ratio < (t.belowFraction !== undefined ? t.belowFraction : t.below)) { effects = effects.concat(t.effects); }
    }
    return effects;
  },
  getFpThresholdEffects: function(currentFp, maxFp) {
    var ratio = currentFp / maxFp;
    var effects = [];
    var thresholds = this._data.combat.fatigue ? this._data.combat.fatigue.thresholds : [];
    for (var i = 0; i < thresholds.length; i++) {
      var t = thresholds[i];
      if (ratio < (t.belowFraction !== undefined ? t.belowFraction : t.below)) { effects = effects.concat(t.effects); }
    }
    return effects;
  },
  getEncumbrance: function(load, st) {
    var bl = (st * st) / 5;
    var ratio = load / bl;
    var table = this._data.combat.encumbrance || this._data.core.encumbrance || [];
    for (var i = table.length - 1; i >= 0; i--) {
      if (ratio > table[i].maxMultiplier) return table[i];
    }
    return table[0] || { level: 0, name: "無", moveMult: 1.0, dodgePenalty: 0 };
  },

  // === 反応表 ===
  getReactionResult: function(total) {
    var table = this._data.core.reaction ? this._data.core.reaction.table : [];
    for (var i = 0; i < table.length; i++) {
      if (total >= table[i].min && total <= table[i].max) return table[i];
    }
    return { label: "中立", description: "事務的" };
  },

  // === システムプロンプト自動生成 ===
  buildReferenceText: function() {
    var lines = [];
    var core = this._data.core;
    var skills = this._data.skills;
    var combat = this._data.combat;

    lines.push('【GURPS Lite 4th Edition】');
    lines.push('');

    // ──────────────────────────────────────────
    // 1. 成功判定
    // ──────────────────────────────────────────
    lines.push('■ 成功判定');
    lines.push('• 3d6 <= 目標値 → 成功');
    lines.push('• 3 → 自動的成功（必殺成功）');
    lines.push('• 18 → 自動的失敗（致命的失敗）');
    lines.push('• 3d6 が目標値を超える → 失敗');
    lines.push('• 成功度 (Margin of Success) = 目標値 - 出目');
    lines.push('• 失敗度 (Margin of Failure) = 出目 - 目標値');
    lines.push('• 修正値は累積。最低有効値は3');
    lines.push('• 競合判定 (Quick Contest): 両者の成功度を比較');
    lines.push('• 通常競合 (Regular Contest): 両者成功→成功度比較、両者失敗→引き分け');
    lines.push('• 反応判定 (Reaction Roll): 3d6に修正値を加算し反応表を参照');
    lines.push('');

    // ──────────────────────────────────────────
    // 2. キャラクター作成
    // ──────────────────────────────────────────
    lines.push('■ キャラクター作成');
    lines.push('• 基本CP: ' + core.cpBudget);
    if (core.disadvantageLimit) lines.push('• 不利な特徴の上限: CP合計の50%（自己制御不可を含む）');
    if (core.quirksLimit) lines.push('• 癖 (Quirks): 最大' + core.quirksLimit + '個、各-1CP');
    lines.push('');
    lines.push('【能力値】');
    for (var ak in core.attributes) {
      var a = core.attributes[ak];
      lines.push('• ' + a.label + ': 基本値' + a.base + '、±' + a.costPerLevel + 'CP/level');
    }
    lines.push('');
    lines.push('【副属性】');
    for (var sk in core.secondaries) {
      var s = core.secondaries[sk];
      lines.push('• ' + s.label + ': ' + core.attributes[s.baseAttr].label + '基準、±' + s.costPerLevel + 'CP/level');
    }
    lines.push('');
    lines.push('【二次的特性】');
    for (var di = 0; di < core.derived.length; di++) {
      var d2 = core.derived[di];
      lines.push('• ' + d2.label + ' = ' + d2.formula + (d2.unit ? ' (' + d2.unit + ')' : ''));
    }
    lines.push('');

    // ──────────────────────────────────────────
    // 3. 特徴 (Advantages / Disadvantages)
    // ──────────────────────────────────────────
    lines.push('■ 特徴');
    lines.push('• 有利な特徴: CP消費');
    lines.push('• 不利な特徴: CP獲得（上限' + (core.disadvantageLimit ? (core.disadvantageLimit * 100) + '%' : '50%') + '）');
    lines.push('• 癖 (Quirks): 各-1CP、最大' + (core.quirksLimit || 5) + '個');
    lines.push('• 自己制御 (Self-Control): Will基準。例: 12以下で抵抗(3d6<=12で発動)');
    lines.push('• 外見 (Appearance): 反応修正。美しい+1/+4、醜い-1/-4');
    lines.push('• カリスマ (Charisma): 1レベル毎に反応+1');
    lines.push('• 声 (Voice): 会話関連の反応+2');
    lines.push('• 才能 (Talent): 特定技能グループに+1/level');
    lines.push('• 逆手ペナルティ: 利き手でない手は-4（両利きで0）');
    lines.push('• 特徴修正(増強+%/限定-%): 最終CP=基本CP×(1+(増強%-限定%)/100)、限定上限-80%');
    lines.push('');

    lines.push('【魔法】');
    lines.push('• 呪文: IQ/難〜至難技能、技能なし値なし、魔法の素質(Magery)でIQ加算');
    lines.push('• 集中(Concentrate): 1秒集中後発動、負傷でWill-3中断');
    lines.push('• 技能15: 移動可/FP-1、20: 準備半分/FP-2、25: 準備1/4、30+: 5Lv毎半減');
    lines.push('• FP消費: HP代用可(-1/HP)、パワーストーン使用可');
    lines.push('• マナ: 無/疎(-5)/並/密/濃密(FP即還元+全失敗ﾌｧﾝﾌﾞﾙ)');
    lines.push('• 呪文クラス: 通常/範囲/白兵/射撃/防御/情報/抵抗/魔化');
    lines.push('');

    lines.push('【超能力】');
    lines.push('• パワー修正(-10%): 超能力属性(中和/装置で妨害可)');
    lines.push('• 系統: アンチサイ/ESP/ヒーリング/テレパシー/テレポーテーション/PK');
    lines.push('• 才能: 5CP/level、系統内全判定+level');
    lines.push('');

    // ──────────────────────────────────────────
    // 4. 技能
    // ──────────────────────────────────────────
    lines.push('■ 技能');
    lines.push('• 技能レベル = 関連能力値 + 相対ボーナス');
    lines.push('• 技能の未訓練ペナルティ: E:-4、A:-5、H:-6');
    lines.push('• ルール20: 能力値>20でも、技能の基本値・未訓練判定の基準値は20');
    lines.push('• Tech Level (TL): 時代設定スキルは【TL】付記');
    lines.push('');
    lines.push('【技能コスト表】');
    for (var dk in skills.difficulties) {
      var sd = skills.difficulties[dk];
      var parts = [];
      var ctable = sd.costTable;
      var cpKeys = Object.keys(ctable).sort(function(a,b){return parseInt(a)-parseInt(b);});
      for (var ci = 0; ci < cpKeys.length; ci++) {
        var cpv = cpKeys[ci];
        var rel = ctable[cpv];
        parts.push(cpv + 'CP→' + (rel > 0 ? '+' : '') + rel);
      }
      lines.push('  ' + sd.label + ': ' + parts.join(', '));
    }
    lines.push('');
    // 技能カタログ
    var catalog = skills.catalog || [];
    if (catalog.length) {
      lines.push('');
      lines.push('【技能一覧】');
      for (var sci = 0; sci < catalog.length; sci++) {
        var sc = catalog[sci];
        lines.push('• ' + sc.name + ' (' + sc.attr.toUpperCase() + '/' + sc.diff + ') 初期値:' + sc.default + (sc.note ? ' — ' + sc.note : ''));
      }
    }

    // ──────────────────────────────────────────
    // 5. 荷重と移動
    // ──────────────────────────────────────────
    lines.push('');
    lines.push('■ 荷重と移動');
    lines.push('• BL = ST^2/5 ポンド');
    var encTable = combat.encumbrance || core.encumbrance || [];
    if (encTable.length) {
      for (var ei = 0; ei < encTable.length; ei++) {
        var e = encTable[ei];
        lines.push('• ' + e.name + ': BL×' + e.maxMultiplier + 'まで、移動×' + e.moveMult + '、よけ' + e.dodgePenalty + '、技能' + (e.skillPenalty||0));
      }
    }
    lines.push('• 最小移動力: 1');
    lines.push('• 走行: 基本移動力の+20%');
    lines.push('• ハイキング: 1日あたり10×基本移動力マイル（地形依存）');
    lines.push('• 水泳: 移動力/5、5秒毎に体力判定');
    lines.push('• 跳躍: 高跳び=(6×基本移動力-10)インチ、幅跳び=(2×基本移動力-3)フィート');
    lines.push('');

    // ──────────────────────────────────────────
    // 6. 戦闘
    // ──────────────────────────────────────────
    lines.push('■ 戦闘');
    lines.push('• 1ターン = 1秒。行動順: 基本速度降順');
    lines.push('• 同値: DX→ダイス');
    lines.push('• 構造: (1)防御リセット (2)動作選択 (3)動作実行');
    lines.push('');
    lines.push('【動作 (Maneuvers)】');
    var maneuvers = combat.maneuvers || [];
    for (var mi = 0; mi < maneuvers.length; mi++) {
      var m = maneuvers[mi];
      var attackInfo = m.attack ? '攻撃可' : '攻撃不可';
      if (m.subtypes) {
        var subNames = m.subtypes.map(function(s){return s.name;}).join('/');
        attackInfo = subNames;
      }
      var defInfo = m.defense ? '防御可' : '防御不可';
      lines.push('• ' + m.name + ': ' + (m.move ? '移動可' : '移動不可') + '、' + attackInfo + '、' + defInfo + (m.note ? ' — ' + m.note : ''));
    }
    lines.push('');
    lines.push('【姿勢修正】');
    var posture = combat.posture || {};
    for (var pk in posture) {
      var pv = posture[pk];
      var moveStr = pv.moveOverride || (Math.round(pv.moveMult * 100) + '%');
      lines.push('• ' + pk + ': 攻撃' + (pv.attack >= 0 ? '+' : '') + pv.attack + '、防御' + (pv.defense >= 0 ? '+' : '') + pv.defense + '、射撃標的' + pv.shot + '、移動' + moveStr);
    }
    lines.push('');
    lines.push('【感覚判定】');
    var senses = combat.senseRolls || {};
    if (senses.vision) lines.push('• 視覚: ' + senses.vision);
    if (senses.hearing) lines.push('• 聴覚: ' + senses.hearing);
    if (senses.tasteSmell) lines.push('• 味覚/嗅覚: ' + senses.tasteSmell);
    lines.push('');

    lines.push('【恐怖判定】');
    var fright = combat.frightChecks || {};
    lines.push('• 判定: 3d6 <= 意志');
    if (fright.failure) lines.push('• 失敗: ' + fright.failure);
    if (fright.criticalFailure) lines.push('• 致命的失敗: ' + fright.criticalFailure);
    lines.push('');

    lines.push('【命中修正】');
    var hmods = combat.hitModifiers || {};
    if (hmods.common) {
      for (var hi = 0; hi < hmods.common.length; hi++) {
        var hm = hmods.common[hi];
        lines.push('• ' + hm.condition + ': ' + hm.penalty);
      }
    }
    lines.push('• SSR表: 射程yd+標的速度→対数表を参照');
    if (hmods.aimLonger) {
      lines.push('• 照準: 1秒目=武器Acc、2秒目+1、3秒目以降+2');
    }
    var dopt = combat.defenseOptions || {};
    lines.push('【防御オプション】');
    if (dopt.retreatDodge) lines.push('• 後退よけ: +' + dopt.retreatDodge);
    if (dopt.retreatParryFencing) lines.push('• 後退受け(ﾌｪﾝｼﾝｸﾞ): +' + dopt.retreatParryFencing);
    if (dopt.retreatParryOther) lines.push('• 後退受け(他): +' + dopt.retreatParryOther);
    if (dopt.retreatBlock) lines.push('• 後退止め: +' + dopt.retreatBlock);
    if (dopt.dodgeAndDrop) lines.push('• よけ＆伏せ: +' + dopt.dodgeAndDrop);
    if (dopt.acrobaticDodgeSuccess) lines.push('• ｱｸﾛﾊﾞｯﾄ★: 成功+' + dopt.acrobaticDodgeSuccess + ' 失敗' + dopt.acrobaticDodgeFailure);
    lines.push('');
    var hlocs = combat.hitLocations || {};
    var hasHL = false;
    for (var hlk in hlocs) { hasHL = true; break; }
    if (hasHL) {
      lines.push('【命中部位(簡略)】');
      for (var hlk2 in hlocs) {
        var hl = hlocs[hlk2];
        lines.push('• ' + hlk2 + ': 修正' + hl.penalty + (hl.note ? ' (' + hl.note + ')' : ''));
      }
    }
    var swe = combat.specialWeaponEffects || {};
    var hasSWE = false;
    for (var swk in swe) { hasSWE = true; break; }
    if (hasSWE) {
      lines.push('【特殊武器効果】');
      if (swe.armorDivisor) lines.push('• アーマーディバイダー: ' + swe.armorDivisor);
      if (swe.halfDamageRange) lines.push('• 1/2D: ' + swe.halfDamageRange);
      if (swe.recoil) lines.push('• 反動(Rcl): ' + swe.recoil);
    }
    lines.push('');

    lines.push('【能動防御】');
    var ad = combat.activeDefenses || {};
    if (ad.dodge) lines.push('• よけ(Dodge): ' + ad.dodge.formula);
    if (ad.parry) lines.push('• 受け(Parry): ' + ad.parry.formula);
    if (ad.block) lines.push('• 止め(Block): ' + ad.block.formula);
    var defMods = combat.defenseModifiers || {};
    var hasDefMods = false;
    for (var dmk in defMods) { hasDefMods = true; break; }
    if (hasDefMods) {
      lines.push('• 防御修正:');
      if (defMods.stunned !== undefined) lines.push('  - 朦朧: ' + defMods.stunned);
      if (defMods.allOutDefense !== undefined) lines.push('  - 全力防御: +' + defMods.allOutDefense);
      if (defMods.backAttack) lines.push('  - 背後: ' + defMods.backAttack);
      if (defMods.invisible) {
        var inv = defMods.invisible;
        lines.push('  - 見えない敵: 聴覚成功で' + (inv.hearingSuccess > 0 ? '+' : '') + inv.hearingSuccess + (inv.hearingFail ? '、失敗で' + inv.hearingFail : ''));
      }
    }

    // ──────────────────────────────────────────
    // 7. ダメージ表
    // ──────────────────────────────────────────
    lines.push('');
    lines.push('■ ダメージ表（ST別）');
    lines.push('• 突き(ST×1)=thrust、振り(ST×2)=swing');
    lines.push('• 負傷 = (ダメージ - DR) × 負傷倍率');
    lines.push('• 最低負傷: DRを超えた場合、最低1点');
    lines.push('');
    var dt = combat.damageTypes || [];
    if (dt.length) {
      lines.push('【負傷倍率】');
      for (var dti = 0; dti < dt.length; dti++) {
        lines.push('• ' + dt[dti].type + ' (' + dt[dti].label + '): ×' + dt[dti].woundMultiplier);
      }
    }
    lines.push('');

    // ──────────────────────────────────────────
    // 8. 負傷と状態
    // ──────────────────────────────────────────
    lines.push('■ 負傷と状態');
    lines.push('• 衝撃(Shock): 負傷直後の自分のターンのみ、IQ/DX修正に負傷HP(最大-4)');
    lines.push('• 大負傷(Major Wound): 一撃で最大HPの1/2超→HT判定、失敗で朦朧+転倒、5差で気絶');
    lines.push('• 朦朧(Stun): 動作「何もしない」のみ、能動防御-4、毎ターン終了時HT回復');
    lines.push('• HP1/3未満(Reeling): 移動力/よけ半分');
    lines.push('• HP0以下: 毎ターン開始時HT(修正=-|現在HP|/最大HP)、失敗で気絶');
    lines.push('• 致命傷(Mortal Wound): 死亡判定失敗差1-2時に発生、30分毎HT継続');
    lines.push('• HP=-最大HP×1/2/3/4: 死のHT判定、失敗で死亡');
    lines.push('• HP=-最大HP×5: 即死');
    lines.push('• HP=-最大HP×10: 死体破壊');
    lines.push('');

    var crit = combat.criticalDetails || {};
    if (crit.criticalSuccess || crit.criticalFailureDefense) {
      lines.push('【クリティカル詳細】');
      if (crit.criticalSuccess) lines.push('• クリティカル成功(攻撃): ' + crit.criticalSuccess);
      if (crit.criticalFailureDefense) lines.push('• クリティカル失敗(防御): ' + crit.criticalFailureDefense);
      lines.push('');
    }

    // 応急手当TL表
    var faTL = combat.recovery ? combat.recovery.firstAidByTL : null;
    if (faTL && faTL.length) {
      lines.push('【応急手当TL表】');
      for (var fti = 0; fti < faTL.length; fti++) {
        var ft = faTL[fti];
        lines.push('• TL' + ft.tl + ': ' + ft.time + ' / ' + ft.recovery + '回復');
      }
      lines.push('');
    }

    lines.push('【回復】');
    var rec = combat.recovery || {};
    if (rec.unconsciousness) {
      for (var ri = 0; ri < rec.unconsciousness.length; ri++) {
        lines.push('• ' + rec.unconsciousness[ri].condition + ': ' + rec.unconsciousness[ri].interval + '判定');
      }
    }
    if (rec.naturalHealing) lines.push('• 自然回復: ' + rec.naturalHealing);
    if (rec.firstAid) {
      if (rec.firstAid.bandage) lines.push('• 応急手当(包帯): ' + rec.firstAid.bandage);
      if (rec.firstAid.shockTreatment) lines.push('• 応急手当(ショック治療): ' + rec.firstAid.shockTreatment);
    }
    lines.push('');

    // ──────────────────────────────────────────
    // 9. 疲労
    // ──────────────────────────────────────────
    lines.push('■ 疲労');
    lines.push('• FP1/3未満: 移動力/よけ/ST半分');
    lines.push('• FP0以下: 行動毎にWill(失敗で気絶)、FP消費の代わりにHP-1');
    lines.push('• FP回復: 10分休息毎に1FP');
    var facc = combat.fatigue ? combat.fatigue.accumulation : null;
    if (facc) {
      lines.push('【疲労蓄積】');
      if (facc.combatEnd) lines.push('• 戦闘終了: ' + facc.combatEnd);
      if (facc.hunger) lines.push('• 飢え: ' + facc.hunger);
      if (facc.dehydration) lines.push('• 脱水: ' + facc.dehydration);
      if (facc.sleepDeprivation) lines.push('• 睡眠不足: ' + facc.sleepDeprivation);
      if (facc.heat) lines.push('• 熱: ' + facc.heat);
      if (facc.cold) lines.push('• 寒冷: ' + facc.cold);
    }
    lines.push('');

    // ──────────────────────────────────────────
    // 10. 環境
    // ──────────────────────────────────────────
    lines.push('■ 環境');
    var env = combat.environmental || {};
    if (env.fallDamage) lines.push('• 衝突ダメージ: ' + env.fallDamage);
    if (env.falling) lines.push('• 落下: ' + env.falling);
    if (env.fire && env.fire.length) {
      for (var fi = 0; fi < env.fire.length; fi++) lines.push('• 炎: ' + env.fire[fi]);
    }
    if (env.suffocation) lines.push('• 窒息: ' + env.suffocation);
    if (env.poison) lines.push('• 毒: ' + env.poison + '（摂取/吸入/接触/注入）');
    if (env.disease) lines.push('• 病気: ' + env.disease);
    lines.push('');

    // ──────────────────────────────────────────
    // 11. 装備データ
    // ──────────────────────────────────────────
    var equip = this._data.equipment;
    if (equip) {
      if (equip.armors && equip.armors.length) {
        lines.push('【防具】');
        for (var ai = 0; ai < equip.armors.length; ai++) {
          var ar = equip.armors[ai];
          lines.push('• ' + ar.name + ': DR' + ar.dr + ' $' + ar.cost + ' ' + ar.weight + 'lbs');
        }
        lines.push('');
      }
      if (equip.shields && equip.shields.length) {
        lines.push('【盾】');
        for (var si = 0; si < equip.shields.length; si++) {
          var sh = equip.shields[si];
          lines.push('• ' + sh.name + ': DB+' + sh.db + ' $' + sh.cost + ' ' + sh.weight + 'lbs');
        }
        lines.push('');
      }
      if (equip.tlWealth && equip.tlWealth.length) {
        lines.push('【TL別初期資金】');
        for (var tli = 0; tli < equip.tlWealth.length; tli++) {
          var tw = equip.tlWealth[tli];
          lines.push('• TL' + tw.tl + ' (' + tw.era + '): $' + tw.startingWealth);
        }
        lines.push('');
      }
      if (equip.wealthLevels && equip.wealthLevels.length) {
        lines.push('【財産レベル】');
        for (var wi = 0; wi < equip.wealthLevels.length; wi++) {
          var wl = equip.wealthLevels[wi];
          lines.push('• ' + wl.name + ' [' + (wl.cp >= 0 ? '+' : '') + wl.cp + 'CP] ×' + wl.multiplier);
        }
        lines.push('');
      }
      if (equip.languages && equip.languages.length) {
        lines.push('【言語習熟】');
        for (var li = 0; li < equip.languages.length; li++) {
          var lg = equip.languages[li];
          lines.push('• ' + lg.level + ': 会話' + lg.spokenCp + 'CP/読書' + lg.writtenCp + 'CP' + (lg.penalty ? ' ペナルティ' + lg.penalty : ''));
        }
        lines.push('');
      }
    }

    // ──────────────────────────────────────────
    // 12. 反応表
    // ──────────────────────────────────────────
    var reactTable = core.reaction ? core.reaction.table : [];
    if (reactTable.length) {
      lines.push('【反応表】');
      for (var rti = 0; rti < reactTable.length; rti++) {
        var r = reactTable[rti];
        lines.push('• ' + r.min + '～' + r.max + ': ' + r.label + ' — ' + r.description);
      }
    }

    return lines.join('\n');
  },

  // === ルール概要（UI表示用） ===
  buildSummaryHtml: function() {
    var h = '';
    var core = this._data.core;
    var skills = this._data.skills;
    var combat = this._data.combat;

    h += '<div class="text-xs space-y-3">';

    h += '<div><span class="font-semibold text-gray-700 dark:text-gray-200">基本CP: ' + core.cpBudget + '</span>' +
      (core.disadvantageLimit ? ' / 不利上限: ' + (core.disadvantageLimit * 100) + '%' : '') +
      (core.quirksLimit ? ' / 癖上限: ' + core.quirksLimit : '') + '</div>';

    // 能力値
    h += '<div><div class="font-semibold text-gray-600 dark:text-gray-300 mb-1">■ 能力値</div>';
    h += '<table class="w-full text-[10px]"><tr><th class="text-left text-gray-400">属性</th><th class="text-right text-gray-400">基本値</th><th class="text-right text-gray-400">単価</th></tr>';
    for (var k in core.attributes) {
      var a = core.attributes[k];
      h += '<tr><td class="text-gray-600 dark:text-gray-300">' + a.label + '</td><td class="text-right text-gray-500">' + a.base + '</td><td class="text-right text-gray-500">±' + a.costPerLevel + 'CP/level</td></tr>';
    }
    h += '</table></div>';

    // 副属性
    h += '<div><div class="font-semibold text-gray-600 dark:text-gray-300 mb-1">■ 副属性</div>';
    h += '<table class="w-full text-[10px]"><tr><th class="text-left text-gray-400">属性</th><th class="text-right text-gray-400">基準</th><th class="text-right text-gray-400">単価</th></tr>';
    for (var sk in core.secondaries) {
      var s = core.secondaries[sk];
      h += '<tr><td class="text-gray-600 dark:text-gray-300">' + s.label + '</td><td class="text-right text-gray-500">' + core.attributes[s.baseAttr].label + '</td><td class="text-right text-gray-500">±' + s.costPerLevel + 'CP/level</td></tr>';
    }
    h += '</table></div>';

    // 二次的特性
    h += '<div><div class="font-semibold text-gray-600 dark:text-gray-300 mb-1">■ 二次的特性</div>';
    for (var di = 0; di < core.derived.length; di++) {
      var d2 = core.derived[di];
      h += '<div class="text-gray-500">- ' + d2.label + ' = ' + d2.formula + (d2.unit ? ' ' + d2.unit : '') + '</div>';
    }
    h += '</div>';

    // 技能
    h += '<div><div class="font-semibold text-gray-600 dark:text-gray-300 mb-1">■ 技能コスト</div>';
    for (var dk in skills.difficulties) {
      var sd = skills.difficulties[dk];
      var costs = Object.keys(sd.costTable).sort(function(a,b){return parseInt(a)-parseInt(b);}).filter(function(v){return v>0;}).join(' / ');
      h += '<div class="text-gray-500">' + sd.label + ': ' + costs + 'CP</div>';
    }
    h += '</div>';

    // 負傷倍率
    var dt = combat.damageTypes || [];
    if (dt.length) {
      h += '<div><div class="font-semibold text-gray-600 dark:text-gray-300 mb-1">■ 負傷倍率</div>';
      var wmItems = [];
      for (var dti = 0; dti < dt.length; dti++) {
        wmItems.push(dt[dti].type + ': ×' + dt[dti].woundMultiplier);
      }
      h += '<div class="text-gray-500">' + wmItems.join(', ') + '</div></div>';
    }

    // 動作
    var maneuvers = combat.maneuvers || [];
    if (maneuvers.length) {
      h += '<div><div class="font-semibold text-gray-600 dark:text-gray-300 mb-1">■ 動作</div>';
      for (var mi = 0; mi < maneuvers.length; mi++) {
        var m = maneuvers[mi];
        h += '<div class="text-gray-500">- ' + m.name + '</div>';
      }
      h += '</div>';
    }

    // 荷重
    var encTable = combat.encumbrance || core.encumbrance || [];
    if (encTable.length) {
      h += '<div><div class="font-semibold text-gray-600 dark:text-gray-300 mb-1">■ 荷重</div>';
      for (var ei = 0; ei < encTable.length; ei++) {
        var e = encTable[ei];
        h += '<div class="text-gray-500">- ' + e.name + ': BL×' + e.maxMultiplier + ', 移動×' + e.moveMult + ', よけ' + e.dodgePenalty + '</div>';
      }
      h += '</div>';
    }

    // 反応表
    var reactTable = core.reaction ? core.reaction.table : [];
    if (reactTable.length) {
      h += '<div><div class="font-semibold text-gray-600 dark:text-gray-300 mb-1">■ 反応表</div>';
      for (var ri = 0; ri < reactTable.length; ri++) {
        var r = reactTable[ri];
        h += '<div class="text-gray-500">- ' + r.min + '～' + r.max + ': ' + r.label + '</div>';
      }
      h += '</div>';
    }

    h += '</div>';
    return h;
  }
};
