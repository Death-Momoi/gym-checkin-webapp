import { client } from '../../core/client.js';
export const AssistRepository={checkOut:args=>client.rpc('gym_assist_check_out',args)};
