'use strict';

// Клиент облака: Firebase Authentication + Firestore через REST (запросы идут из основного процесса).
const Cloud = (() => {
  const CFG = window.CLOUD_CONFIG || {};
  const enabled = () => !!(CFG.apiKey && CFG.projectId);
  const docUrl = (uid) => `https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents/users/${uid}`;

  const coded = (code, message) => { const e = new Error(message || code); e.code = code; return e; };

  async function call(url, method, body, token, contentType) {
    const headers = { 'Content-Type': contentType || 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    try {
      return await window.api.http({
        url, method, headers,
        body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
      });
    } catch {
      throw coded('network');
    }
  }

  function authErr(res) {
    const raw = (res.json && res.json.error && res.json.error.message) || 'UNKNOWN';
    let code = raw.split(/[ :]/)[0];
    if (/API key not valid|API_KEY_INVALID/i.test(raw)) code = 'API_KEY';
    return coded(code, raw);
  }

  async function auth(endpoint, email, password) {
    const res = await call(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${CFG.apiKey}`, 'POST',
      { email, password, returnSecureToken: true });
    if (res.status !== 200) throw authErr(res);
    const j = res.json;
    return { uid: j.localId, idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + Number(j.expiresIn) * 1000 };
  }

  const signUp = (email, password) => auth('signUp', email, password);
  const signIn = (email, password) => auth('signInWithPassword', email, password);

  async function refresh(refreshToken) {
    const res = await call(`https://securetoken.googleapis.com/v1/token?key=${CFG.apiKey}`, 'POST',
      `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`, null, 'application/x-www-form-urlencoded');
    if (res.status !== 200) throw authErr(res);
    const j = res.json;
    return { idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + Number(j.expires_in) * 1000 };
  }

  async function getDoc(uid, token) {
    const res = await call(docUrl(uid), 'GET', null, token);
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) throw coded('denied');
    if (res.status !== 200) throw coded('server');
    const f = (res.json && res.json.fields) || {};
    return {
      data: f.data ? JSON.parse(f.data.stringValue) : null,
      updatedAt: f.updatedAt ? Number(f.updatedAt.integerValue) : 0
    };
  }

  async function putDoc(uid, token, data, updatedAt) {
    const url = docUrl(uid) + '?updateMask.fieldPaths=data&updateMask.fieldPaths=updatedAt';
    const res = await call(url, 'PATCH',
      { fields: { data: { stringValue: JSON.stringify(data) }, updatedAt: { integerValue: String(updatedAt) } } }, token);
    if (res.status === 401 || res.status === 403) throw coded('denied');
    if (res.status !== 200) throw coded('server');
  }

  return { enabled, signUp, signIn, refresh, getDoc, putDoc };
})();
