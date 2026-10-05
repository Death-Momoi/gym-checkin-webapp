import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { loadScript } from './vendor-loader.js';
export let client=null;
export async function initializeClient(){
 await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',()=>typeof window.supabase?.createClient==='function');
 if(!client)client=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 return client;
}
