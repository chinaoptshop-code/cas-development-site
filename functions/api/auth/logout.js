import { clearCookie, json } from '../../_lib.js';

export const onRequestPost = () => json({ ok: true }, 200, { 'set-cookie': clearCookie });
