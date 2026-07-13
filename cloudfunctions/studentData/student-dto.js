function publicStudent(student = {}) {
  return {
    _id: student._id,
    name: student.name || '',
    grade: student.grade,
    avatarColor: student.avatarColor || '',
    reportCount: Number(student.reportCount) || 0,
    createdAt: student.createdAt || '',
    updatedAt: student.updatedAt || '',
  };
}

module.exports = { publicStudent };
