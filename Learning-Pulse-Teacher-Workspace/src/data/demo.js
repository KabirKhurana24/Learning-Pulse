const firstNames = [
  'Aarav','Diya','Rohan','Meera','Kabir','Anaya','Ishaan','Aadhya','Vivaan','Kiara',
  'Arjun','Myra','Reyansh','Sara','Advik','Tara','Neil','Ira','Krish','Avni',
  'Dhruv','Siya','Atharv','Navya','Rudra','Saanvi','Yuvaan','Mira','Ayaan','Riya',
  'Veer','Anika','Dev','Ishita','Parth','Amaira','Shaurya','Prisha','Arnav','Naina',
  'Aditya','Aarohi','Kian','Vanya','Samarth','Diya','Manav','Aanya','Rehan','Sia'
];
const lastNames = [
  'Mehta','Kapoor','Malhotra','Shah','Sethi','Rao','Bhatia','Khanna','Iyer','Jain',
  'Singh','Nair','Chopra','Das','Verma','Menon','Gupta','Pillai','Mishra','Gill',
  'Joshi','Kaur','Reddy','Saxena','Bose','Arora','Kulkarni','Sen','Dutta','Ahuja'
];
const classSpecs = [
  { name: 'Grade 6A', count: 32, grade: '6', offset: 0 },
  { name: 'Grade 6B', count: 28, grade: '6', offset: 1 },
  { name: 'Grade 7A', count: 30, grade: '7', offset: 2 },
];
const fractions6B = [38, 35, 28, 40, 44, 48, 50, 52, 55, 58, 60, 59, 62, 65, 68, 70, 72, 74, 76, 78, 79, 80, 82, 85, 88, 90, 92, 95];

export function createDemoData() {
  const students = [];
  const assessments = [];
  const topics = ['Fractions', 'Decimals', 'Geometry', 'Number Systems'];
  let globalIndex = 0;

  classSpecs.forEach((spec, classIndex) => {
    for (let i = 0; i < spec.count; i += 1) {
      const first = firstNames[(globalIndex * 3 + 1) % firstNames.length];
      const last = lastNames[(globalIndex * 2 + classIndex) % lastNames.length];
      const name = classIndex === 1 && i === 0 ? 'Aarav Mehta' :
        classIndex === 1 && i === 1 ? 'Diya Kapoor' :
        classIndex === 1 && i === 2 ? 'Rohan Malhotra' :
        classIndex === 1 && i === 3 ? 'Meera Shah' :
        classIndex === 1 && i === 4 ? 'Kabir Sethi' :
        classIndex === 1 && i === 5 ? 'Anaya Rao' : `${first} ${last}`;
      const id = `LP-${spec.grade}${spec.name.endsWith('A') ? '01' : '02'}-${String(i + 1).padStart(2, '0')}`;
      const student = {
        id,
        name,
        classroom: spec.name,
        grade: spec.grade,
        subject: 'Mathematics',
        email: '',
      };
      students.push(student);

      topics.forEach((topic, topicIndex) => {
        let score = 55 + ((globalIndex * 11 + topicIndex * 17 + classIndex * 8) % 42) + (classIndex === 0 ? 9 : classIndex === 2 ? 3 : 0);
        if (spec.name === 'Grade 6B' && topic === 'Fractions') score = fractions6B[i];
        if (spec.name === 'Grade 6B' && name === 'Rohan Malhotra') {
          score = topic === 'Fractions' ? 48 : topic === 'Decimals' ? 58 : topic === 'Geometry' ? 76 : 85;
        }
        if (spec.name === 'Grade 6B' && name === 'Kabir Sethi') {
          score = topic === 'Fractions' ? 50 : topic === 'Decimals' ? 61 : topic === 'Geometry' ? 70 : 78;
        }
        if (spec.name === 'Grade 6B' && name === 'Aarav Mehta') {
          score = topic === 'Fractions' ? 90 : topic === 'Decimals' ? 82 : topic === 'Geometry' ? 86 : 88;
        }
        if (spec.name === 'Grade 6B' && name === 'Diya Kapoor') {
          score = topic === 'Fractions' ? 75 : topic === 'Decimals' ? 80 : topic === 'Geometry' ? 79 : 82;
        }
        if (spec.name === 'Grade 6B' && name === 'Meera Shah') {
          score = topic === 'Fractions' ? 95 : topic === 'Decimals' ? 90 : topic === 'Geometry' ? 93 : 91;
        }
        if (spec.name === 'Grade 6B' && name === 'Anaya Rao') {
          score = topic === 'Fractions' ? 70 : topic === 'Decimals' ? 76 : topic === 'Geometry' ? 80 : 77;
        }
        const assessmentName = topic === 'Fractions' ? 'Fractions — Unit Assessment' : `${topic} — Topic Check`;
        assessments.push({
          id: `DEMO-${id}-${topicIndex}`,
          studentId: id,
          studentName: name,
          classroom: spec.name,
          subject: 'Mathematics',
          assessment: assessmentName,
          topic,
          score: Math.max(0, Math.min(100, score)),
          date: topic === 'Fractions' ? '2026-11-12' : ['2026-11-15','2026-11-10','2026-11-07'][topicIndex % 3],
        });
      });
      globalIndex += 1;
    }
  });

  // Add a small history for the teacher's dashboard trend chart.
  const trend = [
    { week: '13 Oct', 'Grade 6A': 68, 'Grade 6B': 63, 'Grade 7A': 67 },
    { week: '20 Oct', 'Grade 6A': 72, 'Grade 6B': 65, 'Grade 7A': 70 },
    { week: '27 Oct', 'Grade 6A': 75, 'Grade 6B': 68, 'Grade 7A': 71 },
    { week: '03 Nov', 'Grade 6A': 77, 'Grade 6B': 69, 'Grade 7A': 74 },
    { week: '10 Nov', 'Grade 6A': 81, 'Grade 6B': 70, 'Grade 7A': 76 },
    { week: '17 Nov', 'Grade 6A': 84, 'Grade 6B': 72, 'Grade 7A': 78 },
  ];

  return {
    teacher: { name: 'Ananya Sharma', role: 'Mathematics Teacher', school: 'Greenfield International School' },
    students,
    assessments,
    trend,
    source: 'demo',
    updatedAt: new Date().toISOString(),
  };
}
