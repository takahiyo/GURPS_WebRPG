# モデル設定

## 現在の動作設定 (2026-07-29)

| 項目 | 値 |
|------|-----|
| APIエンドポイント | `https://openrouter.ai/api/v1/chat/completions` |
| デフォルトモデル | `nvidia/nemotron-3-super-120b-a12b:free` |
| プロバイダ | Nvidia |
| 認証 | OpenRouter API Key (`sk-or-v1-...`) |

## 確認済み動作モデル

| モデルID | 状態 | 備考 |
|----------|------|------|
| `nvidia/nemotron-3-super-120b-a12b:free` | ✅ 動作確認済 | 現在のデフォルト |
| `openai/gpt-oss-20b:free` | 未確認 | バックアップ候補 |
| `inclusionai/ling-3.0-flash:free` | 未確認 | 軽量高速 |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 未確認 | 推論機能付き |

## 利用不可・非推奨モデル

| モデルID | 理由 |
|----------|------|
| `openrouter/free` | 自動選択がコンテンツセーフティモデルを拾う問題あり |
| `meta-llama/llama-3.3-70b-instruct:free` | 無料提供終了 (404) |
| `google/gemini-2.0-flash-exp:free` | 無料提供終了 |
| `qwen/qwen3-8b-instruct:free` | 無料提供終了 |
| `google/gemma-4-31b-it:free` | レート制限多発 (429) |

## コード内モデル設定箇所

### 選択肢 (`index.html:132-138`)
```html
<select id="model-select">
  <option value="openrouter/free">openrouter/free (自動選択)</option>
  <option value="nvidia/nemotron-3-super-120b-a12b:free">Nemotron 3 Super 120B (free) ★推奨</option>
  <option value="openai/gpt-oss-20b:free">GPT-OSS 20B (free)</option>
  <option value="inclusionai/ling-3.0-flash:free">Ling 3.0 Flash (free)</option>
  <option value="nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free">Nemotron 3 Nano Omni (free)</option>
</select>
```

### デフォルト値 (`loadState`)
- `state.model` のフォールバック: `nvidia/nemotron-3-super-120b-a12b:free`
- `STATE_DEFAULTS.model`: 同上
- `let state = { model: ... }`: 同上

### 移行ロジック (`loadState`)
- 非推奨モデルリストに含まれるモデルが保存されていた場合、自動的にデフォルトに置き換え:
  ```js
  var deprecatedModels = [
    'openrouter/free',
    'google/gemma-4-31b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
    'qwen/qwen3-8b-instruct:free'
  ];
  ```

## トラブルシューティング

### 404 - モデルが見つからない
- モデル名が古くなっている（無料提供終了）
- モデルセレクターで別のモデルを選択して再試行

### 429 - レート制限
- 一時的な制限。時間をおいて再試行
- 別のモデルに切り替えても可

### content-safety モデルが応答する
- モデルに `openrouter/free`（自動選択）を使用している場合に発生
- 特定のモデル ID を直接指定することで回避
