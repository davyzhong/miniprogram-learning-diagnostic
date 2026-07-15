const RELATIONS = [
  { id: 'there-their', words: ['there', 'their'], explanation: 'there 表示“那里”；their 表示“他们的”。', prompt: 'This is ___ classroom.', answer: 'their' },
  { id: 'borrow-lend', words: ['borrow', 'lend'], explanation: 'borrow 是“借入”；lend 是“借出”。', prompt: 'Can I ___ your pencil?', answer: 'borrow' },
  { id: 'quiet-quite', words: ['quiet', 'quite'], explanation: 'quiet 是“安静的”；quite 是“相当、十分”。', prompt: 'Please be ___.', answer: 'quiet' }
]

function findRelations(words = []) {
  const set = new Set((words || []).map(word => String(word.word || word).toLowerCase()))
  return RELATIONS.filter(relation => relation.words.some(word => set.has(word)))
}

module.exports = { findRelations }
