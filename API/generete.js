module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { prompt } = req.body || {};
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (!apiKey) {
    return res.status(200).json({
      candidates: [{
        content: {
          parts: [{ text: '【要約】\nAPIキーがVercelに設定されていません。\n\n【本文】\nVercelのEnvironment Variablesで GEMINI_API_KEY を登録してください。' }]
        }
      }]
    });
  }

  // ★ 優先順モデルリスト（上から試す）
  const MODELS = [
    'gemini-2.0-flash',      // 第一候補（高速・無料枠あり）
    'gemini-1.5-flash',      // 第二候補（旧安定版）
    'gemini-1.5-pro',        // 第三候補（高精度・低速）
  ];

  const makeUrl = (modelName) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  // 各モデルを順に試す
  for (const modelName of MODELS) {
    try {
      const response = await fetch(makeUrl(modelName), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt || 'Hello' }] }]
        })
      });

      // 429（レート制限）なら次のモデルへ
      if (response.status === 429) {
        console.warn(`429 on ${modelName}, trying next model...`);
        continue; // 次のモデルへ
      }

      const contentType = response.headers.get('content-type') || '';
      let data;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const textError = await response.text();
        // 429以外のエラーなら次のモデルへ（503などもカバー）
        if (response.status >= 500) {
          console.warn(`${response.status} on ${modelName}, trying next model...`);
          continue;
        }
        return res.status(200).json({
          candidates: [{
            content: {
              parts: [{ text: `【要約】\nAPIレスポンスエラー (Status: ${response.status})\n\n【本文】\n${textError}` }]
            }
          }]
        });
      }

      // 成功
      if (response.ok && data.candidates) {
        return res.status(200).json(data);
      }

      // モデルが見つからないなど（404）なら次のモデルへ
      if (response.status === 404) {
        console.warn(`404 on ${modelName}, trying next model...`);
        continue;
      }

      // その他のエラー
      const errMsg = JSON.stringify(data, null, 2);
      return res.status(200).json({
        candidates: [{
          content: {
            parts: [{ text: `【要約】\nAPIエラーが発生しました (Status: ${response.status})\n\n【本文】\n${errMsg}` }]
          }
        }]
      });

    } catch (error) {
      // 通信エラーなら次のモデルへ
      console.warn(`Network error on ${modelName}: ${error.message}`);
      continue;
    }
  }

  // 全モデル失敗
  return res.status(200).json({
    candidates: [{
      content: {
        parts: [{ text: '【要約】\n全てのモデルで応答を得られませんでした。\n\n【本文】\n時間をおいて再度お試しください。' }]
      }
    }]
  });
};
