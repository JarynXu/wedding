/** 未指定或不支持的主题使用现有法式版；URL 值不进入样式或文件路径。 */
export function resolveInvitationTheme(search = '') {
  const params = new URLSearchParams(search);
  return params.getAll('theme').length === 1 && params.get('theme') === 'chinese' ? 'chinese' : 'classic';
}
