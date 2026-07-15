const FAMILIES = [
  { id: 'bian', members: ['辩', '辨', '辫'], hint: '“辩”与说话争论有关，“辨”与分清有关，“辫”与头发有关。' },
  { id: 'zai', members: ['在', '再'], hint: '“在”表示地点或正在进行，“再”表示又一次。' },
  { id: 'dai', members: ['带', '戴'], hint: '“带”多与携带有关，“戴”多与穿戴在身上有关。' },
  { id: 'jing', members: ['睛', '晴', '情'], hint: '“睛”与眼睛有关，“晴”与天气有关，“情”与心情有关。' }
]

function familyFor(text = '') {
  const target = String(text || '').trim()
  return FAMILIES.find(family => family.members.includes(target)) || null
}

module.exports = { familyFor }
