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

  // 最新モデル指定に修正（旧: gemini-2.5-flash -> 新: gemini-3.6-flash）
  const modelName = 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt || 'Hello' }] }]
      })
    });

    const contentType = response.headers.get('content-type') || '';
    let data;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const textError = await response.text();
      return res.status(200).json({
        candidates: [{
          content: {
            parts: [{ text: `【要約】\nAPIレスポンスエラー (Status: ${response.status})\n\n【本文】\n${textError}` }]
          }
        }]
      });
    }

    if (!response.ok || !data.candidates) {
      const errMsg = JSON.stringify(data, null, 2);
      return res.status(200).json({
        candidates: [{
          content: {
            parts: [{ text: `【要約】\nAPIエラーが発生しました (Status: ${response.status})\n\n【本文】\n${errMsg}` }]
          }
        }]
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(200).json({
      candidates: [{
        content: {
          parts: [{ text: `【要約】\n通信例外エラーが発生しました。\n\n【本文】\n${error.message}` }]
        }
      }]
    });
  }
};
