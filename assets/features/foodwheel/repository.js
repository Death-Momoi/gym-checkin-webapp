const KEY='food_wheel_custom_restaurants';
export const readCustomItems=()=>localStorage.getItem(KEY);
export const writeCustomItems=value=>localStorage.setItem(KEY,value);
export const removeCustomItems=()=>localStorage.removeItem(KEY);
