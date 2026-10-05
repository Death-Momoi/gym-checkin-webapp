import { init as appInit } from '../auth/index.js';
export async function mount(){
await appInit({ requireAuth: false });
}
