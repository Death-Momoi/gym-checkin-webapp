export const FALLBACK_AVATAR =
    'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
      '<rect width="100%" height="100%" fill="#1f2937"/>' +
      '<text x="50%" y="56%" text-anchor="middle" fill="#67e8f9" font-size="32">👤</text>' +
      '</svg>'
    );


export function profileName(profile, session) {
    const metadata = session?.user?.user_metadata || {};
    return profile?.display_name || metadata.full_name || metadata.name || '未命名使用者';
  }

export function profileAvatar(profile, session) {
    const metadata = session?.user?.user_metadata || {};
    return profile?.avatar_url || metadata.avatar_url || metadata.picture || FALLBACK_AVATAR;
  }

export function roleLabel(role) {
    return role === 'primary' ? '主要借用者' : '共同使用者';
  }
