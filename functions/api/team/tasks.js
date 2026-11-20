// «Мої задачі» в кабінеті працівника (/kabinet/team, CRM v4): ті самі обробники, що й у панелі (functions/api/admin/tasks.js).
// Працівник без tasks.manage бачить лише задачі, призначені собі, і може тільки відмітити «виконано» / «повернути» (з коментарем);
// створення, правка й масові дії — лише tasks.manage (перевіряє обробник).
export { onRequestGet, onRequestPatch } from '../admin/tasks.js';
