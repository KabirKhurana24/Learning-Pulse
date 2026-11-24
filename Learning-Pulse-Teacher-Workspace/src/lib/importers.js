import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export const rosterFields = [
  { key: 'studentName', label: 'Student name', required: true, aliases: ['student name', 'student', 'name', 'full name', 'learner name', 'pupil name'] },
  { key: 'studentId', label: 'Student ID', required: false, aliases: ['student id', 'student code', 'student number', 'id', 'roll number', 'roll no', 'admission number', 'admission no', 'adm no'] },
  { key: 'classroom', label: 'Classroom', required: true, aliases: ['classroom', 'classroom name', 'class', 'section', 'section name', 'class name', 'grade section', 'class section'] },
  { key: 'grade', label: 'Grade', required: false, aliases: ['grade', 'year', 'standard', 'grade level'] },
  { key: 'subject', label: 'Subject', required: false, aliases: ['subject', 'subject name', 'course'] },
  { key: 'email', label: 'Email', required: false, aliases: ['email', 'email address', 'student email'] },
];

export const assessmentFields = [
  { key: 'studentName', label: 'Student name', required: false, aliases: ['student name', 'student', 'name', 'full name', 'learner name', 'pupil name'] },
  { key: 'studentId', label: 'Student ID', required: false, aliases: ['student id', 'student code', 'student number', 'id', 'roll number', 'roll no', 'admission number', 'admission no', 'adm no'] },
  { key: 'classroom', label: 'Classroom', required: false, aliases: ['classroom', 'classroom name', 'class', 'section', 'section name', 'class name', 'grade section', 'class section'] },
  { key: 'assessment', label: 'Assessment', required: false, aliases: ['assessment', 'assessment name', 'assessment title', 'test', 'exam', 'quiz', 'activity'] },
  { key: 'subject', label: 'Subject', required: false, aliases: ['subject', 'subject name', 'course'] },
  { key: 'topic', label: 'Topic', required: true, aliases: ['topic', 'learning objective', 'unit', 'skill', 'concept'] },
  { key: 'score', label: 'Score', required: true, aliases: ['score', 'score percent', 'score percentage', 'assessment score', 'marks obtained', 'marks earned', 'marks', 'result', 'percentage', 'percent', 'points', 'obtained marks'] },
  { key: 'maxScore', label: 'Maximum score', required: false, aliases: ['maximum score', 'max score', 'out of', 'total marks', 'max marks', 'possible points', 'total possible marks', 'maximum points'] },
  { key: 'date', label: 'Date', required: false, aliases: ['date', 'assessment date', 'submitted at', 'completed date'] },
];

const cleanHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

export function detectWideTopicColumns(headers, rows = []) {
  const reserved = new Set([
    ...rosterFields.flatMap((field) => field.aliases.map(cleanHeader)),
    ...assessmentFields.flatMap((field) => field.aliases.map(cleanHeader)),
    'assessment date', 'submitted at', 'completed date', 'max score', 'maximum score', 'total marks', 'out of',
    'age', 'date of birth', 'dob', 'gender', 'parent', 'guardian', 'parent name', 'guardian name',
    'phone', 'phone number', 'contact', 'contact number', 'address', 'attendance', 'attendance rate',
    'house', 'bus route', 'medical notes', 'emergency contact', 'email address',
  ]);
  return headers.filter((header) => {
    const normalized = cleanHeader(header);
    if (reserved.has(normalized) || /^(date|id|email|name|class|grade|section|subject|assessment|test|exam|quiz)/.test(normalized)) return false;
    const sample = rows.slice(0, 40).map((row) => String(row[header] ?? '').trim()).filter(Boolean);
    if (!sample.length) return false;
    const numeric = sample.filter((value) => {
      const cleaned = value.replace(/%/g, '').replace(/,/g, '').trim();
      if (/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(cleaned)) return true;
      return Number.isFinite(Number(cleaned));
    }).length;
    return numeric / sample.length >= 0.6;
  });
}

export function autoDetectKind(headers, rows = []) {
  const normalized = headers.map(cleanHeader);
  const scoreMatch = normalized.some((header) => ['score', 'marks', 'marks obtained', 'percentage', 'percent', 'result'].includes(header));
  const topicMatch = normalized.some((header) => ['topic', 'unit', 'skill', 'concept', 'learning objective'].includes(header));
  return (scoreMatch && topicMatch) || detectWideTopicColumns(headers, rows).length > 0 ? 'assessment' : 'roster';
}

export function suggestMapping(headers, kind) {
  const fields = kind === 'assessment' ? assessmentFields : rosterFields;
  const mapping = {};
  fields.forEach((field) => {
    const matchIndex = headers.findIndex((header) => {
      const normalized = cleanHeader(header);
      return field.aliases.some((alias) => cleanHeader(alias) === normalized);
    });
    mapping[field.key] = matchIndex >= 0 ? headers[matchIndex] : '';
  });
  return mapping;
}

export async function readTabularFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  let rows = [];
  if (extension === 'csv' || extension === 'txt') {
    const parsed = await new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header) => String(header).trim(),
        complete: (result) => resolve(result),
        error: (error) => reject(error),
      });
    });
    if (parsed.errors?.length && !parsed.data?.length) throw new Error(parsed.errors[0].message || 'Could not read the CSV file.');
    rows = parsed.data;
  } else if (['xlsx', 'xls'].includes(extension)) {
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw new Error('The spreadsheet does not contain a worksheet.');
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '', raw: false });
  } else {
    throw new Error('Please choose a CSV or Excel file (.csv, .xlsx, .xls).');
  }
  const cleaned = rows.filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
  if (!cleaned.length) throw new Error('No data rows were found in this file.');
  const headers = Object.keys(cleaned[0]);
  return { headers, rows: cleaned, totalRows: cleaned.length };
}

export function validateMapping(kind, mapping, wideFormat = false, wideColumns = []) {
  if (kind === 'roster') {
    if (!mapping.studentName) return 'Map the Student name column to continue.';
    if (!mapping.classroom) return 'Map the Classroom column to continue.';
    return '';
  }
  if (!mapping.studentName && !mapping.studentId) return 'Map either Student name or Student ID.';
  if (wideFormat) {
    if (!wideColumns.length) return 'Select at least one topic column containing student scores.';
    return '';
  }
  if (!mapping.topic) return 'Map the Topic column to continue.';
  if (!mapping.score) return 'Map the Score column to continue.';
  return '';
}

function valueFrom(row, header) {
  if (!header) return '';
  return row[header] ?? '';
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  const dayFirst = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (dayFirst) {
    const year = dayFirst[3].length === 2 ? `20${dayFirst[3]}` : dayFirst[3];
    return `${year}-${dayFirst[2].padStart(2, '0')}-${dayFirst[1].padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw;
}

function normalizeScore(value, maxScore) {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (!raw) return null;
  const ratio = raw.replace(/%/g, '').match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (ratio) {
    const numerator = Number(ratio[1]);
    const denominator = Number(ratio[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
    return Math.max(0, Math.min(100, (numerator / denominator) * 100));
  }
  const score = Number(raw.replace('%', '').trim());
  if (!Number.isFinite(score)) return null;
  const max = Number(String(maxScore ?? '').replace(/,/g, '').trim());
  const percentage = Number.isFinite(max) && max > 0 ? (score / max) * 100 : score;
  return Math.max(0, Math.min(100, percentage));
}

export function mapRosterRows(rows, mapping) {
  const output = [];
  const warnings = [];
  rows.forEach((row, index) => {
    const name = String(valueFrom(row, mapping.studentName)).trim();
    const classroom = String(valueFrom(row, mapping.classroom)).trim();
    if (!name || !classroom) {
      warnings.push(`Row ${index + 2}: missing student name or classroom; skipped.`);
      return;
    }
    const rawId = String(valueFrom(row, mapping.studentId)).trim();
    output.push({
      id: rawId || `IMP-${Date.now().toString(36)}-${index + 1}`,
      name,
      classroom,
      grade: String(valueFrom(row, mapping.grade)).trim(),
      subject: String(valueFrom(row, mapping.subject)).trim() || 'Mathematics',
      email: String(valueFrom(row, mapping.email)).trim(),
    });
  });
  return { records: output, warnings };
}

export function mapAssessmentRows(rows, mapping, wideFormat = false, wideColumns = []) {
  const output = [];
  const warnings = [];
  rows.forEach((row, index) => {
    const studentName = String(valueFrom(row, mapping.studentName)).trim();
    const studentId = String(valueFrom(row, mapping.studentId)).trim();
    if ((!studentName && !studentId)) {
      warnings.push(`Row ${index + 2}: missing student name or ID; skipped.`);
      return;
    }
    const classroom = String(valueFrom(row, mapping.classroom)).trim();
    const assessment = String(valueFrom(row, mapping.assessment)).trim() || 'Imported assessment';
    const subject = String(valueFrom(row, mapping.subject)).trim() || 'Mathematics';
    const date = normalizeDate(valueFrom(row, mapping.date));
    if (wideFormat) {
      let topicRows = 0;
      wideColumns.forEach((column) => {
        const score = normalizeScore(valueFrom(row, column), valueFrom(row, mapping.maxScore));
        if (score === null) return;
        topicRows += 1;
        output.push({
          id: `IMP-AS-${Date.now().toString(36)}-${index + 1}-${topicRows}`,
          studentId, studentName, classroom, assessment, subject,
          topic: column, score: Math.round(score * 10) / 10, date,
        });
      });
      if (!topicRows) warnings.push(`Row ${index + 2}: no numeric topic scores found; skipped.`);
      return;
    }
    const topic = String(valueFrom(row, mapping.topic)).trim();
    const score = normalizeScore(valueFrom(row, mapping.score), valueFrom(row, mapping.maxScore));
    if (!topic || score === null) {
      warnings.push(`Row ${index + 2}: missing topic or valid score; skipped.`);
      return;
    }
    output.push({
      id: `IMP-AS-${Date.now().toString(36)}-${index + 1}`,
      studentId, studentName, classroom, assessment, subject, topic,
      score: Math.round(score * 10) / 10, date,
    });
  });
  return { records: output, warnings };
}

export function downloadCsvTemplate(kind) {
  const content = kind === 'roster'
    ? 'student_id,student_name,classroom,grade,subject,email\nLP-001,Aarav Mehta,Grade 6B,6,Mathematics,aarav@example.edu\nLP-002,Diya Kapoor,Grade 6B,6,Mathematics,diya@example.edu'
    : 'student_id,student_name,classroom,assessment,subject,topic,score,max_score,date\nLP-001,Aarav Mehta,Grade 6B,Fractions Unit Assessment,Mathematics,Fractions,18,20,2026-11-12\nLP-002,Diya Kapoor,Grade 6B,Fractions Unit Assessment,Mathematics,Fractions,15,20,2026-11-12';
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = kind === 'roster' ? 'learning-pulse-student-roster-template.csv' : 'learning-pulse-assessment-template.csv';
  link.click();
  URL.revokeObjectURL(url);
}
