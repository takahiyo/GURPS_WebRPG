// ============================================================
// GURPS Rules Engine — 単一ソースのルール管理
// rules/*.json から読み込むか、デフォルト値を内蔵
// ============================================================
const GURPS_RULES = {
  _ready: false,
  _data: null,

  // === デフォルトルールデータ（JSON読込失敗時のフォールバック） ===
  _defaults: {
    core: {
      title: "GURPS Lite 4th Edition",
      cpBudget: 100,
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
        { key: "basicSpeed", label: "基本速度", formula: "(DX+HT)/4" },
        { key: "basicMove", label: "移動力", formula: "基本速度の整数部" },
        { key: "dodge", label: "よけ", formula: "基本速度+3（端数切捨て）" },
        { key: "basicLift", label: "基本リフト(BL)", formula: "(ST×ST)/5", unit: "ポンド" }
      ]
    },
    skills: {
      difficulties: {
        E: { label: "易", costTable: { 1: -1, 2: 0, 4: 1, 8: 2, 12: 3, 16: 4, 20: 5, 24: 6, 28: 7 } },
        A: { label: "並", costTable: { 1: -2, 2: -1, 4: 0, 8: 1, 12: 2, 16: 3, 20: 4, 24: 5, 28: 6 } },
        H: { label: "難", costTable: { 0: -3, 1: -2, 2: -1, 4: 0, 8: 1, 12: 2, 16: 3, 20: 4, 24: 5, 28: 6 } }
      },
      validCpLevels: [0, 1, 2, 4, 8, 12, 16, 20, 24, 28],
      defaultAttr: "iq"
    },
    combat: {
      woundingModifiers: { imp: 2.0, cut: 1.5, "pi+": 1.5, "pi-": 0.5, pi: 1.0, cr: 1.0, burn: 1.0, tox: 1.0, fat: 1.0, spec: 1.0 },
      damageTable: {
        thrust: [0,0,0,0,0,0,0,"1d-3","1d-2","1d-2","1d-2","1d-1","1d-1","1d","1d","1d+1","1d+1","1d+2","1d+2","2d-1","2d-1"],
        swing: [0,0,0,0,0,0,0,"1d-1","1d","1d","1d+1","1d+2","1d+2","2d-1","2d","2d","2d+1","2d+2","2d+2","3d-1","3d-1"]
      }
    }
  },

  // === 初期化 ===
  async init(basePath) {
    basePath = basePath || '.';
    var self = this;
    try {
      var [core, skills, combat] = await Promise.all([
        fetch(basePath + '/rules/core.json').then(function(r) { if (!r.ok) throw new Error('core.json'); return r.json(); }),
        fetch(basePath + '/rules/skills.json').then(function(r) { if (!r.ok) throw new Error('skills.json'); return r.json(); }),
        fetch(basePath + '/rules/combat.json').then(function(r) { if (!r.ok) throw new Error('combat.json'); return r.json(); })
      ]);
      self._data = { core: core, skills: skills, combat: combat };
    } catch (e) {
      console.warn('[GURPS_RULES] JSON読み込み失敗、デフォルト使用:', e.message);
      self._data = self._defaults;
    }
    self._ready = true;
    console.log('[GURPS_RULES] 初期化完了');
    return self;
  },

  ready: function() { return this._ready; },

  // === 属性 ===
  getAttrDef: function(attr) {
    var d = this._data.core.attributes[attr];
    if (d) return d;
    // 大文字小文字対応
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
  skillValidCpLevels: function() { return this._data.skills.validCpLevels; },
  skillDefaultAttr: function() { return this._data.skills.defaultAttr || 'iq'; },
  skillLabel: function(diff) { var d = this.getSkillDiff(diff); return d ? d.label : '並'; },

  // 技能CP → 相対ボーナス
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

  // 目標レベル → 最少CP（自動変換用）
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

  // === 戦闘 ===
  woundingMod: function(type) { return this._data.combat.woundingModifiers[type] || 1.0; },
  getThrustDmg: function(st) {
    var idx = Math.min(Math.max(Math.round(st), 1), 20);
    return this._data.combat.damageTable.thrust[idx] || '1d-2';
  },
  getSwingDmg: function(st) {
    var idx = Math.min(Math.max(Math.round(st), 1), 20);
    return this._data.combat.damageTable.swing[idx] || '1d';
  },

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

  // === 状態変化 ===
  getShockPenalty: function(hpLost) { return Math.min(Math.max(hpLost, 0), 4); },

  // === システムプロンプト自動生成（GURPS_RULES_REFERENCE 置き換え） ===
  buildReferenceText: function() {
    var lines = [];
    var core = this._data.core;
    var skills = this._data.skills;
    var combat = this._data.combat;

    lines.push('【GURPS Lite 4th Edition 基本ルール】');
    lines.push('');

    // 成功判定
    if (combat.successRoll && combat.successRoll.promptLines) {
      lines = lines.concat(combat.successRoll.promptLines);
      lines.push('');
    }

    // キャラクター作成
    lines.push('■ キャラクター作成（基本CP: ' + core.cpBudget + '）');
    for (var k in core.attributes) {
      var a = core.attributes[k];
      if (a.promptLine) lines.push('- ' + a.promptLine);
    }
    for (var k2 in core.secondaries) {
      var s = core.secondaries[k2];
      if (s.promptLine) lines.push('- ' + s.promptLine);
    }
    lines.push('');

    // 二次的特性
    lines.push('■ 二次的特性');
    for (var i = 0; i < core.derived.length; i++) {
      var d = core.derived[i];
      if (d.promptLine) lines.push('- ' + d.promptLine);
    }
    lines.push('');

    // 技能
    lines.push('■ 技能コスト表');
    for (var diffKey in skills.difficulties) {
      var sd = skills.difficulties[diffKey];
      if (sd.promptLine) lines.push('- ' + sd.promptLine);
    }
    lines.push('');

    // ダメージ表
    if (combat.damageTable && combat.damageTable.promptLines) {
      lines = lines.concat(combat.damageTable.promptLines);
      lines.push('');
    }

    // 戦闘
    if (combat.combat && combat.combat.promptLines) {
      lines = lines.concat(combat.combat.promptLines);
      lines.push('');
    }

    // 状態変化
    if (combat.injuryAndDeath && combat.injuryAndDeath.promptLines) {
      lines = lines.concat(combat.injuryAndDeath.promptLines);
      lines.push('');
    }

    // 重荷修正
    if (combat.encumbrance && combat.encumbrance.promptLines) {
      lines = lines.concat(combat.encumbrance.promptLines);
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

    // CP予算
    h += '<div><span class="font-semibold text-gray-700 dark:text-gray-200">基本CP: ' + core.cpBudget + '</span></div>';

    // 属性
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
    for (var k2 in core.secondaries) {
      var s = core.secondaries[k2];
      var baseLbl = core.attributes[s.baseAttr] ? core.attributes[s.baseAttr].label : s.baseAttr;
      h += '<tr><td class="text-gray-600 dark:text-gray-300">' + s.label + '</td><td class="text-right text-gray-500">' + baseLbl + '</td><td class="text-right text-gray-500">±' + s.costPerLevel + 'CP/level</td></tr>';
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
      var sd2 = skills.difficulties[dk];
      var costs = Object.keys(sd2.costTable).sort(function(a,b){return parseInt(a)-parseInt(b);}).filter(function(v){return v>0;}).join(' / ');
      h += '<div class="text-gray-500">' + sd2.label + '(' + dk + '): ' + costs + 'CP → 属性' + sd2.costTable[costs.split(' / ')[0]] + '〜 以降+4CP/+1</div>';
    }
    h += '</div>';

    // 負傷倍率
    h += '<div><div class="font-semibold text-gray-600 dark:text-gray-300 mb-1">■ 負傷倍率</div>';
    var wmLines = [];
    for (var wt in combat.woundingModifiers) {
      wmLines.push(wt + ': x' + combat.woundingModifiers[wt]);
    }
    h += '<div class="text-gray-500">' + wmLines.join(', ') + '</div>';
    h += '</div>';

    h += '</div>';
    return h;
  }
};
