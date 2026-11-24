export const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, Number(n) || 0));
export const round = (n) => Math.round((Number(n) || 0) * 10) / 10;
export const average = (values) => values.length ? values.reduce((sum, n) => sum + Number(n || 0), 0) / values.length : 0;
export const formatPct = (value) => `${Math.round(value || 0)}%`;

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function getStudentRecords(data, studentId) {
  return data.assessments.filter((record) => record.studentId === studentId);
}

export function getStudentTopicStats(data, student) {
  const records = getStudentRecords(data, student.id);
  const topics = unique(records.map((record) => record.topic));
  return topics.map((topic) => {
    const topicRecords = records.filter((record) => record.topic === topic);
    return { topic, score: round(average(topicRecords.map((record) => record.score))), count: topicRecords.length };
  }).sort((a, b) => b.score - a.score);
}

export function getStudentAverage(data, student) {
  const records = getStudentRecords(data, student.id);
  return round(average(records.map((record) => record.score)));
}

export function getClassrooms(data) {
  return unique(data.students.map((student) => student.classroom)).sort((a, b) => a.localeCompare(b));
}

export function getClassStats(data, classroom) {
  const students = data.students.filter((student) => student.classroom === classroom);
  const ids = new Set(students.map((student) => student.id));
  const records = data.assessments.filter((record) => ids.has(record.studentId));
  const overall = round(average(records.map((record) => record.score)));
  const needsSupport = students.filter((student) => getStudentTopicStats(data, student).some((topic) => topic.score < 60)).length;
  const topicStats = unique(records.map((record) => record.topic)).map((topic) => {
    const topicRecords = records.filter((record) => record.topic === topic);
    return { topic, score: round(average(topicRecords.map((record) => record.score))), count: topicRecords.length };
  }).sort((a, b) => a.score - b.score);
  return { students, records, overall, needsSupport, assessmentCount: unique(records.map((record) => `${record.assessment}__${record.date || ''}`)).length, topicStats };
}

export function getDashboardStats(data) {
  const classrooms = getClassrooms(data);
  const allRecords = data.assessments;
  const avg = round(average(allRecords.map((record) => record.score)));
  const needsSupport = data.students.filter((student) => getStudentTopicStats(data, student).some((topic) => topic.score < 60)).length;
  const assessmentCount = getAssessmentRows(data).length;
  const classroomRows = classrooms.map((classroom) => {
    const stats = getClassStats(data, classroom);
    return { classroom, count: stats.students.length, average: stats.overall, needsSupport: stats.needsSupport };
  });
  const lowestTopic = unique(allRecords.map((record) => record.topic)).map((topic) => {
    const records = allRecords.filter((record) => record.topic === topic);
    return { topic, average: round(average(records.map((record) => record.score))), records };
  }).sort((a, b) => a.average - b.average)[0];
  const lowestClass = classroomRows.slice().sort((a, b) => a.average - b.average)[0];
  return { classrooms, avg, needsSupport, assessmentCount, classroomRows, lowestTopic, lowestClass };
}

export function getAssessmentRows(data) {
  const map = new Map();
  data.assessments.forEach((record) => {
    const key = `${record.classroom}__${record.assessment}__${record.date}`;
    if (!map.has(key)) map.set(key, { classroom: record.classroom, assessment: record.assessment, date: record.date, scores: [], studentIds: new Set(), subject: record.subject || 'Mathematics' });
    const row = map.get(key);
    row.scores.push(record.score);
    if (record.studentId) row.studentIds.add(record.studentId);
  });
  return [...map.values()].map((row, index) => ({
    id: `assessment-${index}`,
    classroom: row.classroom,
    assessment: row.assessment,
    date: row.date,
    subject: row.subject,
    students: row.studentIds.size || row.scores.length,
    average: round(average(row.scores)),
  })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function makeLearningGroups(data, classroom) {
  const stats = getClassStats(data, classroom);
  const topics = stats.topicStats;
  if (!stats.students.length || !stats.records.length || !topics.length) return { focusTopic: null, groups: [], unassigned: stats.students.length, note: 'Upload assessment results to generate learning groups.' };
  const focusTopic = topics[0];
  const studentScores = stats.students.map((student) => {
    const topicStat = getStudentTopicStats(data, student).find((item) => item.topic === focusTopic.topic);
    return { student, score: topicStat?.score ?? getStudentAverage(data, student) };
  }).sort((a, b) => a.score - b.score);

  const eligible = studentScores.filter((entry) => entry.score < 85);
  if (!eligible.length) return { focusTopic, groups: [], unassigned: stats.students.length, note: 'Students are performing strongly on this topic. No intervention group is recommended.' };

  const bucketSize = Math.ceil(eligible.length / 3);
  const definitions = [
    { id: 'foundation', name: 'Building Foundations', activity: `Visual ${focusTopic.topic.toLowerCase()} models`, duration: '15 min', focus: `Revisit core ${focusTopic.topic.toLowerCase()} concepts`, color: 'coral', description: 'Use visual representations and guided examples to reinforce foundational understanding.' },
    { id: 'guided', name: 'Guided Practice', activity: 'Step-by-step problem solving', duration: '20 min', focus: `Build fluency in ${focusTopic.topic.toLowerCase()}`, color: 'blue', description: 'Build confidence through structured practice and gradually more complex examples.' },
    { id: 'challenge', name: 'Challenge & Apply', activity: 'Real-world problem challenge', duration: '20 min', focus: `Apply ${focusTopic.topic.toLowerCase()} in context`, color: 'green', description: 'Help students apply their understanding to more complex and practical problems.' },
  ];
  const groups = definitions.map((definition, index) => {
    const start = index * bucketSize;
    const end = index === 2 ? eligible.length : Math.min(eligible.length, start + bucketSize);
    const members = eligible.slice(start, end).map((entry) => ({ ...entry.student, score: entry.score }));
    return { ...definition, students: members };
  }).filter((group) => group.students.length > 0);
  return { focusTopic, groups, unassigned: stats.students.length - eligible.length, note: 'Recommendations are based on the lowest-performing topic. Review and edit before assigning.' };
}

export function getRecentStudentTrend(data, student) {
  const records = getStudentRecords(data, student.id).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!records.length) return [];
  return records.slice(-6).map((record, index) => ({ label: record.date ? new Date(record.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : `Check ${index + 1}`, score: record.score, topic: record.topic }));
}

export function getLatestScoreForTopic(data, student, topic) {
  const records = getStudentRecords(data, student.id).filter((record) => record.topic === topic).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return records[0]?.score ?? 0;
}
