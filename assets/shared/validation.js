export const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export const validID=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(v);
export const validMonth=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v)&&Number(v.slice(0,4))>=1970;
export const nonnegative=v=>Number.isFinite(v)&&v>=0;
