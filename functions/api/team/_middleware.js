// /api/team/* — кабінет працівника (/kabinet/team). Лише активний працівник; права й видимість обʼєктів — в обробниках (need, canSeeProject).
import { bad } from '../../_lib.js';
import { need } from '../../_roles.js';

export async function onRequest({ request, env, next }) {
  if (!env.DB) return bad('Немає доступу', 403);
  const { error } = await need(request, env);
  return error || next();
}
