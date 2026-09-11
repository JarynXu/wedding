export class InvalidInvitationLinkError extends Error {}

/** 家长署名与亲属称谓供分享信息和请柬正文共用。无家长参数时返回 null。 */
export function getFamilyInvitation(config, search = '') {
  const params = new URLSearchParams(search);
  if (!params.has('side') && !params.has('parents')) return null;
  if (params.getAll('side').length !== 1 || params.getAll('parents').length !== 1) {
    throw new InvalidInvitationLinkError('家长邀请链接须各提供一项 side 和 parents 参数。');
  }
  const side = params.get('side');
  if (side !== 'groom' && side !== 'bride') throw new InvalidInvitationLinkError('side 须为 groom（新郎家）或 bride（新娘家）。');
  const rawParents = params.get('parents');
  const parents = rawParents.normalize('NFC').trim();
  if (!parents || [...parents].length > 60 || /[\u0000-\u001f\u007f<>]/u.test(rawParents)) {
    throw new InvalidInvitationLinkError('parents 须为 1–60 字的家长署名，不能包含换行、控制字符或尖括号。');
  }
  const groomFamily = side === 'groom';
  return {
    side,
    parents,
    child: { role: groomFamily ? '爱子' : '爱女', name: groomFamily ? config.groom.name : config.bride.name },
    partner: { role: groomFamily ? '儿媳' : '女婿', name: groomFamily ? config.bride.name : config.groom.name },
  };
}
