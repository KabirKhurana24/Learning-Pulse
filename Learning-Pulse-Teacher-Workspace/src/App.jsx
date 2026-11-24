import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, ArrowRight, ArrowUpRight, Award, BarChart3, Bell, BookOpen, CalendarDays,
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardCheck, Clock3,
  Download, FileSpreadsheet, FileUp, Filter, LayoutDashboard, Layers3, Lightbulb, LockKeyhole,
  Pencil, RefreshCw, School, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Target,
  Users, UploadCloud, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip,
  XAxis, YAxis, BarChart, Bar, Cell,
} from 'recharts';
import { createDemoData } from './data/demo.js';
import {
  average, formatPct, getAssessmentRows, getClassStats, getClassrooms, getDashboardStats,
  getLatestScoreForTopic, getRecentStudentTrend, getStudentAverage, getStudentTopicStats,
  makeLearningGroups, round, unique,
} from './lib/analytics.js';
import {
  assessmentFields, autoDetectKind, detectWideTopicColumns, mapAssessmentRows, mapRosterRows, readTabularFile,
  rosterFields, suggestMapping, validateMapping, downloadCsvTemplate,
} from './lib/importers.js';

const STORAGE_KEY = 'learning-pulse-workspace-v1';
const DEMO_STORAGE_KEY = 'learning-pulse-demo-workspace-v1';
const WORKSPACE_MODE_KEY = 'learning-pulse-workspace-mode';
const AUTH_KEY = 'learning-pulse-local-preview-auth';
const GROUP_OVERRIDES_KEY = 'learning-pulse-group-overrides-v1';

function createEmptyWorkspace(teacher = {}) {
  return {
    teacher: { name: 'Your Name', role: 'Teacher', school: 'My School Workspace', email: '', ...teacher },
    students: [],
    assessments: [],
    trend: [],
    source: 'workspace',
    updatedAt: new Date().toISOString(),
  };
}

function readWorkspace(storageKey, fallback) {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.students) && Array.isArray(parsed.assessments)) return parsed;
    }
  } catch (error) {
    console.warn(`Could not restore ${storageKey}.`, error);
  }
  return fallback();
}

function loadInitialData() {
  // Keep the sample workspace and the teacher's own workspace separate.
  const mode = localStorage.getItem(WORKSPACE_MODE_KEY) === 'demo' ? 'demo' : 'personal';
  return mode === 'demo'
    ? readWorkspace(DEMO_STORAGE_KEY, createDemoData)
    : readWorkspace(STORAGE_KEY, createEmptyWorkspace);
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'LP';
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function exportCsv(filename, records) {
  if (!records.length) return;
  const headers = [...new Set(records.flatMap((row) => Object.keys(row)))];
  const escape = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [headers.join(','), ...records.map((record) => headers.map((header) => escape(record[header])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Button({ children, variant = 'primary', size = 'md', icon: Icon, disabled, onClick, className = '', type = 'button' }) {
  return <button type={type} disabled={disabled} onClick={onClick} className={`btn btn-${variant} btn-${size} ${className}`}>
    {Icon && <Icon size={16} strokeWidth={2} />}{children}
  </button>;
}

function Avatar({ name, size = 'md', tone = 'purple' }) {
  return <span className={`avatar avatar-${size} avatar-${tone}`}>{initials(name)}</span>;
}

function Status({ children, type = 'neutral' }) {
  return <span className={`status status-${type}`}><i />{children}</span>;
}

function Progress({ value, tone = 'purple', compact = false }) {
  return <div className={`progress ${compact ? 'progress-compact' : ''}`}>
    <span className={`progress-fill progress-${tone}`} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
  </div>;
}

function MetricCard({ label, value, note, icon: Icon, tone = 'purple', trend }) {
  return <div className="metric-card">
    <div className={`metric-icon metric-${tone}`}><Icon size={18} strokeWidth={1.9} /></div>
    <div className="metric-label">{label}</div>
    <div className="metric-value-row"><strong>{value}</strong>{trend && <span className="trend-up"><ArrowUpRight size={14} />{trend}</span>}</div>
    <div className="metric-note">{note}</div>
  </div>;
}

function SectionHeading({ title, subtitle, action }) {
  return <div className="section-heading">
    <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
    {action}
  </div>;
}

function EmptyState({ icon: Icon = FileSpreadsheet, title, description, action }) {
  return <div className="empty-state">
    <div className="empty-icon"><Icon size={24} /></div>
    <h3>{title}</h3><p>{description}</p>{action}
  </div>;
}

function App() {
  const [workspaceMode, setWorkspaceMode] = useState(() => localStorage.getItem(WORKSPACE_MODE_KEY) === 'demo' ? 'demo' : 'personal');
  const [data, setData] = useState(loadInitialData);
  const [authenticated, setAuthenticated] = useState(() => localStorage.getItem(AUTH_KEY) === 'true');
  const [authMode, setAuthMode] = useState('login');
  const [page, setPage] = useState('dashboard');
  const [selectedClass, setSelectedClass] = useState('Grade 6B');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importState, setImportState] = useState({ stage: 'choose', kind: 'roster', file: null, parsed: null, mapping: {}, replace: true, error: '', warnings: [], wideFormat: false, wideColumns: [] });
  const [groupOverrides, setGroupOverrides] = useState(() => { try { return JSON.parse(localStorage.getItem(GROUP_OVERRIDES_KEY) || '{}'); } catch { return {}; } });
  const [groupEdit, setGroupEdit] = useState(null);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approved, setApproved] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const storageKey = workspaceMode === 'demo' ? DEMO_STORAGE_KEY : STORAGE_KEY;
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      localStorage.setItem(WORKSPACE_MODE_KEY, workspaceMode);
    } catch (error) {
      console.warn('Could not save Learning Pulse data.', error);
      setToast('Browser storage is full. Export your data before importing more.');
    }
  }, [data, workspaceMode]);

  useEffect(() => {
    try { localStorage.setItem(GROUP_OVERRIDES_KEY, JSON.stringify(groupOverrides)); } catch (error) { console.warn('Could not save group edits.', error); }
  }, [groupOverrides]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const classrooms = useMemo(() => getClassrooms(data), [data]);
  const dashboard = useMemo(() => getDashboardStats(data), [data]);
  const classStats = useMemo(() => getClassStats(data, selectedClass), [data, selectedClass]);
  const selectedStudent = data.students.find((student) => student.id === selectedStudentId) || null;
  const recordsForAssessment = useMemo(() => getAssessmentRows(data), [data]);

  const navigate = (nextPage) => {
    setPage(nextPage);
    setSearch('');
    setMobileNavOpen(false);
    if (nextPage !== 'students') setSelectedStudentId('');
  };

  const showStudent = (student) => {
    setSelectedStudentId(student.id);
    setPage('students');
    setSearch('');
  };

  const openClass = (classroom) => {
    setSelectedClass(classroom);
    setPage('classrooms');
    setSearch('');
  };

  const resetDemo = () => {
    const demo = createDemoData();
    setWorkspaceMode('demo');
    setData(demo);
    setGroupOverrides({});
    setApproved(false);
    setSelectedClass('Grade 6B');
    setSelectedStudentId('');
    setPage('dashboard');
    setToast('Demo workspace restored. Your personal workspace is unchanged.');
  };

  const openImport = () => {
    setImportState({ stage: 'choose', kind: 'roster', file: null, parsed: null, mapping: {}, replace: data.source === 'demo', error: '', warnings: [], wideFormat: false, wideColumns: [] });
    setImportOpen(true);
  };

  const handleFile = async (file) => {
    if (!file) return;
    try {
      const parsed = await readTabularFile(file);
      const detectedWideColumns = detectWideTopicColumns(parsed.headers, parsed.rows);
      const detectedKind = autoDetectKind(parsed.headers, parsed.rows);
      const kind = detectedKind === 'assessment' ? 'assessment' : importState.kind;
      const wideFormat = kind === 'assessment' && !parsed.headers.some((header) => ['topic','unit','skill','concept','learning objective'].includes(String(header).toLowerCase().replace(/[_-]+/g, ' ').trim())) && detectedWideColumns.length > 0;
      setImportState((current) => ({ ...current, file, parsed, kind, mapping: suggestMapping(parsed.headers, kind), wideFormat, wideColumns: detectedWideColumns, stage: 'map', error: '', warnings: [] }));
    } catch (error) {
      setImportState((current) => ({ ...current, error: error.message || 'Could not read this file.' }));
    }
  };

  const confirmImport = () => {
    const validation = validateMapping(importState.kind, importState.mapping, importState.wideFormat, importState.wideColumns);
    if (validation) {
      setImportState((current) => ({ ...current, error: validation }));
      return;
    }
    const mapper = importState.kind === 'roster' ? mapRosterRows : mapAssessmentRows;
    const result = importState.kind === 'assessment'
      ? mapAssessmentRows(importState.parsed.rows, importState.mapping, importState.wideFormat, importState.wideColumns)
      : mapper(importState.parsed.rows, importState.mapping);
    if (!result.records.length) {
      setImportState((current) => ({ ...current, error: 'No usable records were found. Check the column mapping and file contents.' }));
      return;
    }

    setData((current) => {
      const base = importState.replace
        ? { ...createDemoData(), students: [], assessments: [], trend: [], groupAssignments: {} }
        : current;
      if (importState.kind === 'roster') {
        const nextStudents = [...base.students];
        const nextAssessments = [...base.assessments];
        result.records.forEach((incoming) => {
          const existingIndex = nextStudents.findIndex((student) =>
            (incoming.id && student.id === incoming.id) ||
            (`${student.name.toLowerCase()}__${student.classroom.toLowerCase()}` === `${incoming.name.toLowerCase()}__${incoming.classroom.toLowerCase()}`)
          );
          if (existingIndex >= 0) {
            const previousId = nextStudents[existingIndex].id;
            nextStudents[existingIndex] = { ...nextStudents[existingIndex], ...incoming };
            if (previousId !== incoming.id) {
              nextAssessments.forEach((record, index) => {
                if (record.studentId === previousId) nextAssessments[index] = { ...record, studentId: incoming.id, studentName: incoming.name };
              });
            }
          } else nextStudents.push(incoming);
        });
        return { ...base, students: nextStudents, assessments: nextAssessments, source: 'uploaded', updatedAt: new Date().toISOString() };
      }
      const nextStudents = [...base.students];
      const nextAssessments = [...base.assessments];
      result.records.forEach((record, index) => {
        let student = record.studentId ? nextStudents.find((item) => item.id === record.studentId) : null;
        if (!student && record.studentName) {
          student = nextStudents.find((item) => item.name.toLowerCase() === record.studentName.toLowerCase() && (!record.classroom || item.classroom.toLowerCase() === record.classroom.toLowerCase()));
        }
        if (!student) {
          const generatedId = record.studentId || `IMP-ST-${Date.now().toString(36)}-${index + 1}`;
          student = {
            id: generatedId,
            name: record.studentName || `Student ${index + 1}`,
            classroom: record.classroom || 'Imported classroom',
            grade: String(record.classroom || '').match(/\d+/)?.[0] || '',
            subject: record.subject || 'Mathematics',
            email: '',
          };
          nextStudents.push(student);
        }
        nextAssessments.push({ ...record, studentId: student.id, studentName: student.name, classroom: record.classroom || student.classroom });
      });
      return { ...base, students: nextStudents, assessments: nextAssessments, source: 'uploaded', updatedAt: new Date().toISOString() };
    });

    setGroupOverrides({});
    setApproved(false);
    const firstImported = result.records[0];
    const matchedStudent = importState.kind === 'assessment' ? data.students.find((student) => (firstImported?.studentId && student.id === firstImported.studentId) || (firstImported?.studentName && student.name.toLowerCase() === firstImported.studentName.toLowerCase() && (!firstImported.classroom || student.classroom.toLowerCase() === firstImported.classroom.toLowerCase()))) : null;
    const importedClass = importState.kind === 'roster' ? firstImported?.classroom : (firstImported?.classroom || matchedStudent?.classroom || 'Imported classroom');
    if (importedClass) setSelectedClass(importedClass);
    setImportOpen(false);
    setPage(importState.kind === 'roster' ? 'students' : 'assessments');
    setToast(`${result.records.length} ${importState.kind === 'roster' ? 'students' : 'assessment results'} imported${result.warnings.length ? ` · ${result.warnings.length} rows skipped` : ''}.`);
    if (result.warnings.length) setImportState((current) => ({ ...current, warnings: result.warnings }));
  };

  const getGroupsWithOverrides = (classroom) => {
    const generated = makeLearningGroups(data, classroom);
    if (!generated.groups.length) return generated;
    const overrides = groupOverrides[classroom] || {};
    const groups = generated.groups.map((group) => ({ ...group, students: [] }));
    let movedToUnassigned = 0;
    generated.groups.forEach((group) => group.students.forEach((student) => {
      const assigned = Object.prototype.hasOwnProperty.call(overrides, student.id) ? overrides[student.id] : group.id;
      if (assigned === 'none') {
        movedToUnassigned += 1;
        return;
      }
      const target = groups.find((item) => item.id === assigned) || groups.find((item) => item.id === group.id);
      if (target) target.students.push(student);
    }));
    return { ...generated, groups, unassigned: generated.unassigned + movedToUnassigned };
  };

  const moveStudentGroup = (classroom, studentId, groupId) => {
    setGroupOverrides((current) => ({ ...current, [classroom]: { ...(current[classroom] || {}), [studentId]: groupId } }));
    setApproved(false);
  };

  const renameGroup = (classroom, groupId, name) => {
    setGroupEdit({ classroom, groupId, name });
  };

  const applyGroupRename = () => {
    if (!groupEdit?.name.trim()) return;
    // Group labels are stored per classroom and applied as a local UI override.
    setData((current) => ({ ...current, groupNames: { ...(current.groupNames || {}), [groupEdit.classroom]: { ...((current.groupNames || {})[groupEdit.classroom] || {}), [groupEdit.groupId]: groupEdit.name.trim() } } }));
    setGroupEdit(null);
    setToast('Group name updated.');
  };

  const handleExport = (type) => {
    if (type === 'students') exportCsv('learning-pulse-students.csv', data.students);
    if (type === 'assessments') exportCsv('learning-pulse-assessments.csv', data.assessments);
    if (type === 'groups') {
      const generated = getGroupsWithOverrides(selectedClass);
      const rows = generated.groups.flatMap((group) => group.students.map((student) => ({ classroom: selectedClass, group: data.groupNames?.[selectedClass]?.[group.id] || group.name, student_id: student.id, student_name: student.name, learning_focus: group.focus, suggested_activity: group.activity, score: student.score })));
      exportCsv('learning-pulse-learning-groups.csv', rows);
    }
    setToast('Your CSV export is ready.');
  };

  const enterDemoWorkspace = () => {
    const demo = createDemoData();
    setWorkspaceMode('demo');
    setData(demo);
    setGroupOverrides({});
    setApproved(false);
    setSelectedClass('Grade 6B');
    setSelectedStudentId('');
    localStorage.setItem(AUTH_KEY, 'true');
    setAuthenticated(true);
    setPage('dashboard');
  };

  const signInToLocalWorkspace = ({ email }) => {
    const emailName = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    const personalWorkspace = readWorkspace(STORAGE_KEY, createEmptyWorkspace);
    setWorkspaceMode('personal');
    setData({
      ...personalWorkspace,
      teacher: {
        ...personalWorkspace.teacher,
        name: personalWorkspace.teacher?.name && personalWorkspace.teacher.name !== 'Your Name' ? personalWorkspace.teacher.name : (emailName || 'Teacher'),
        email,
      },
    });
    localStorage.setItem(AUTH_KEY, 'true');
    setAuthenticated(true);
    setPage('dashboard');
  };

  const createLocalProfile = (profile) => {
    const personalWorkspace = readWorkspace(STORAGE_KEY, createEmptyWorkspace);
    setWorkspaceMode('personal');
    setData({ ...personalWorkspace, teacher: { ...personalWorkspace.teacher, ...profile } });
    localStorage.setItem(AUTH_KEY, 'true');
    setAuthenticated(true);
    setPage('dashboard');
  };

  const signOut = () => {
    localStorage.removeItem(AUTH_KEY);
    setAuthenticated(false);
    setAuthMode('login');
  };

  if (!authenticated) {
    return <AuthScreen mode={authMode} setMode={setAuthMode} teacher={data.teacher} onDemo={enterDemoWorkspace} onLocalSignIn={signInToLocalWorkspace} onCreateProfile={createLocalProfile} />;
  }

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'classrooms', label: 'My Classrooms', icon: School },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'assessments', label: 'Assessments', icon: ClipboardCheck },
    { id: 'groups', label: 'Learning Groups', icon: Layers3 },
  ];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup">
        <span className="brand-mark"><Activity size={19} strokeWidth={2.6} /></span>
        <span>learning<span>pulse</span></span>
      </div>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav className="side-nav">
        {sidebarItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={`nav-item ${page === id ? 'active' : ''}`}>
          <Icon size={18} strokeWidth={1.9} /><span>{label}</span>{id === 'groups' && <span className="nav-new">NEW</span>}
        </button>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-help">
        <div className="help-icon"><CircleHelp size={17} /></div>
        <div><strong>Need a hand?</strong><span>Visit help centre</span></div>
        <ChevronRight size={15} />
      </div>
      <div className="sidebar-profile">
        <Avatar name={data.teacher?.name || 'Ananya Sharma'} size="lg" />
        <div className="profile-copy"><strong>{data.teacher?.name || 'Ananya Sharma'}</strong><span>{data.teacher?.role || 'Teacher'}</span></div>
        <button className="icon-button ghost" title="Settings" onClick={() => setToast('Settings are part of the next product iteration.')}><Settings size={17} /></button>
      </div>
    </aside>
    {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}

    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu icon-button" onClick={() => setMobileNavOpen((open) => !open)}><Layers3 size={19} /></button>
        <div className="breadcrumb"><span>Learning Pulse</span><ChevronRight size={14} /><strong>{selectedStudent ? 'Student profile' : sidebarItems.find((item) => item.id === page)?.label || 'Dashboard'}</strong></div>
        <div className="topbar-actions">
          <label className="global-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students, classes..." /></label>
          <div className="notification-wrap">
            <button className={`icon-button ${notificationsOpen ? 'icon-active' : ''}`} onClick={() => setNotificationsOpen((open) => !open)} title="Notifications"><Bell size={18} /><i className="notification-dot" /></button>
            {notificationsOpen && <div className="notification-popover"><div className="popover-head"><strong>Notifications</strong><span>2 new</span></div><div className="notification-item"><span className="notification-symbol lavender"><Lightbulb size={15} /></span><div><strong>Learning insight ready</strong><p>Grade 6B has a new topic recommendation.</p><small>Today · 10:24 AM</small></div></div><div className="notification-item"><span className="notification-symbol mint"><ClipboardCheck size={15} /></span><div><strong>Assessment summary updated</strong><p>Fractions — Unit Assessment is ready to review.</p><small>Yesterday</small></div></div></div>}
          </div>
          <button className="top-avatar-button" title="Sign out" onClick={signOut}><Avatar name={data.teacher?.name || 'Ananya Sharma'} /></button>
        </div>
      </header>

      <div className="page-content">
        {page === 'dashboard' && <DashboardPage data={data} dashboard={dashboard} onOpenClass={openClass} onOpenImport={openImport} onNavigate={navigate} onExport={handleExport} />}
        {page === 'classrooms' && <ClassroomPage data={data} classrooms={classrooms} selectedClass={selectedClass} setSelectedClass={setSelectedClass} stats={classStats} search={search} setSearch={setSearch} onShowStudent={showStudent} onNavigate={navigate} onOpenImport={openImport} />}
        {page === 'students' && (selectedStudent
          ? <StudentPage data={data} student={selectedStudent} onBack={() => setSelectedStudentId('')} onNavigate={navigate} onShowGroups={() => { setSelectedClass(selectedStudent.classroom); navigate('groups'); }} />
          : <StudentsPage data={data} search={search} onShowStudent={showStudent} onOpenImport={openImport} onExport={() => handleExport('students')} />)}
        {page === 'assessments' && <AssessmentsPage data={data} rows={recordsForAssessment} onOpenImport={openImport} onExport={() => handleExport('assessments')} onShowGroups={() => navigate('groups')} />}
        {page === 'groups' && <GroupsPage data={data} classrooms={classrooms} selectedClass={selectedClass} setSelectedClass={setSelectedClass} generated={getGroupsWithOverrides(selectedClass)} onMoveStudent={moveStudentGroup} onRenameGroup={renameGroup} onApprove={() => setApprovalOpen(true)} onExport={() => handleExport('groups')} approved={approved} onOpenImport={openImport} />}
      </div>
      <footer className="app-footer"><span>© 2026 Learning Pulse</span><span>{workspaceMode === 'demo' ? 'Demo workspace · your personal workspace is separate' : 'My workspace · data stays in this browser'}</span><button onClick={resetDemo}><RefreshCw size={13} /> Restore demo data</button></footer>
    </main>

    {importOpen && <ImportModal state={importState} setState={setImportState} fileInputRef={fileInputRef} onFile={handleFile} onClose={() => setImportOpen(false)} onConfirm={confirmImport} onDownloadTemplate={downloadCsvTemplate} />}
    {groupEdit && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setGroupEdit(null)}><div className="modal small-modal"><div className="modal-header"><div><span className="eyebrow">EDIT GROUP</span><h2>Rename learning group</h2></div><button className="icon-button" onClick={() => setGroupEdit(null)}><X size={18} /></button></div><label className="field-label">Group name<input className="text-input" value={groupEdit.name} autoFocus onChange={(event) => setGroupEdit((current) => ({ ...current, name: event.target.value }))} /></label><div className="modal-actions"><Button variant="secondary" onClick={() => setGroupEdit(null)}>Cancel</Button><Button onClick={applyGroupRename}>Save changes</Button></div></div></div>}
    {approvalOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setApprovalOpen(false)}><div className="modal approval-modal"><div className="success-emblem"><CheckCircle2 size={28} /></div><h2>Learning groups approved</h2><p>Your recommendations are now saved in this local workspace. You can export the group plan or continue editing it at any time.</p><div className="approval-stats"><div><strong>{getGroupsWithOverrides(selectedClass).groups.length}</strong><span>Groups</span></div><div><strong>{getGroupsWithOverrides(selectedClass).groups.reduce((sum, group) => sum + group.students.length, 0)}</strong><span>Students</span></div><div><strong>{getGroupsWithOverrides(selectedClass).groups.length}</strong><span>Activities</span></div></div><Button block onClick={() => { setApproved(true); setApprovalOpen(false); setToast('Learning plan approved in this workspace.'); }}>Done</Button></div></div>}
    {toast && <div className="toast"><CheckCircle2 size={16} />{toast}</div>}
  </div>;
}

function AuthScreen({ mode, setMode, teacher, onDemo, onLocalSignIn, onCreateProfile }) {
  const [form, setForm] = useState({ name: '', email: teacher?.email || '', role: 'Mathematics Teacher', password: '' });
  const [error, setError] = useState('');
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submitLogin = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) || form.password.length < 8) {
      setError('Enter a valid work email and a password with at least 8 characters.');
      return;
    }
    // This starter build creates a local browser session only. Connect a real
    // authentication provider before using it with real school accounts.
    onLocalSignIn({ email: form.email.trim().toLowerCase() });
  };
  const submitSignup = () => {
    if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) || form.password.length < 8) {
      setError('Enter your name, a valid email and a password with at least 8 characters.');
      return;
    }
    onCreateProfile({ name: form.name.trim(), role: form.role, email: form.email.trim().toLowerCase(), school: teacher?.school || 'My School Workspace' });
  };
  const switchMode = (nextMode) => {
    setError('');
    setMode(nextMode);
  };

  return <div className="auth-screen">
    <section className="auth-brand-panel">
      <div className="auth-brand-lockup"><span className="auth-brand-symbol"><Activity size={19} strokeWidth={2.6} /></span><span>learning<span>pulse</span></span></div>
      <div className="auth-brand-content"><span className="auth-eyebrow">TEACHING, WITH MORE CLARITY</span><h1>Better insights.<br/>More meaningful learning.</h1><p>One connected workspace to understand your students, support their progress, and make every learning experience count.</p>
        <div className="auth-illustration"><div className="auth-illustration-card"><div className="auth-illustration-top"><span>Class progress</span><span className="auth-positive">↗ 6.4%</span></div><strong>78%</strong><small>Learning progress</small><div className="auth-mini-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div></div><div className="auth-floating-chip"><span className="mini-check"><Check size={12}/></span><span><strong>Student insights</strong><small>Ready to explore</small></span></div><div className="auth-node node-one"/><div className="auth-node node-two"/><div className="auth-node node-three"/></div>
      </div>
      <div className="auth-brand-footer">Making every learner visible.</div>
    </section>
    <section className="auth-workspace">
      <div className="auth-topline"><span>TEACHER WORKSPACE</span><span>Need help? <CircleHelp size={14}/></span></div>
      <div className="auth-form-wrap">
        {mode === 'login' ? <>
          <span className="auth-form-eyebrow">WELCOME TO LEARNING PULSE</span>
          <h2>Welcome back</h2>
          <p className="auth-intro">Sign in to continue to your teaching workspace.</p>
          <div className="auth-field"><label>Work email</label><input type="email" autoComplete="username" placeholder="name@school.edu" value={form.email} onChange={(event) => { update('email', event.target.value); setError(''); }} /></div>
          <div className="auth-field"><label>Password</label><input type="password" autoComplete="current-password" placeholder="Enter your password" value={form.password} onChange={(event) => { update('password', event.target.value); setError(''); }} onKeyDown={(event) => event.key === 'Enter' && submitLogin()} /></div>
          {error && <div className="auth-error"><AlertCircle size={14}/>{error}</div>}
          <button className="auth-submit" onClick={submitLogin}>Continue to my workspace <ArrowRight size={16}/></button>
          <div className="auth-divider"><span/> <small>OR</small> <span/></div>
          <button className="auth-demo-button" onClick={onDemo}><Sparkles size={16}/><span><strong>Explore demo workspace</strong><small>Open sample classrooms, students and assessments</small></span><ArrowRight size={16} className="auth-demo-arrow"/></button>
          <div className="auth-switch">New to Learning Pulse? <button onClick={() => switchMode('signup')}>Create an account</button></div>
        </> : <>
          <span className="auth-form-eyebrow">CREATE YOUR ACCOUNT</span>
          <h2>Set up your profile</h2>
          <p className="auth-intro">Create a local teacher profile to start using your workspace.</p>
          <div className="auth-field"><label>Full name</label><input placeholder="Enter your full name" value={form.name} onChange={(event) => update('name', event.target.value)}/></div>
          <div className="auth-field"><label>Work email</label><input type="email" autoComplete="email" placeholder="name@school.edu" value={form.email} onChange={(event) => update('email', event.target.value)}/></div>
          <div className="auth-field"><label>Your role</label><select value={form.role} onChange={(event) => update('role', event.target.value)}><option>Mathematics Teacher</option><option>Teacher</option><option>School Coordinator</option><option>Academic Leader</option><option>School Administrator</option></select></div>
          <div className="auth-field"><label>Password</label><input type="password" autoComplete="new-password" placeholder="At least 8 characters" value={form.password} onChange={(event) => update('password', event.target.value)}/></div>
          {error && <div className="auth-error"><AlertCircle size={14}/>{error}</div>}
          <button className="auth-submit" onClick={submitSignup}>Create local profile <ArrowRight size={16}/></button>
          <div className="auth-switch">Already have a profile? <button onClick={() => switchMode('login')}>Back to sign in</button></div>
        </>}
      </div>
      <div className="auth-bottom-note"><ShieldCheck size={13}/> Local preview: data stays in this browser. Server authentication is not connected yet.</div>
      <div className="auth-footer"><span>Privacy</span><span>Terms</span><span>© Learning Pulse</span></div>
    </section>
  </div>;
}

function ScoreDistribution({ data, classroom, topic }) {
  const students = data.students.filter((student) => student.classroom === classroom);
  const scores = students.map((student) => {
    const records = data.assessments.filter((record) => record.studentId === student.id && record.topic === topic);
    return records.length ? round(average(records.map((record) => record.score))) : null;
  }).filter((score) => score !== null);
  const ranges = [
    { label: '0–40%', matches: (score) => score >= 0 && score <= 40, tone: '#D98263' },
    { label: '41–60%', matches: (score) => score > 40 && score <= 60, tone: '#D9A36D' },
    { label: '61–80%', matches: (score) => score > 60 && score <= 80, tone: '#6D9BD5' },
    { label: '81–100%', matches: (score) => score > 80 && score <= 100, tone: '#4C9D7E' },
  ].map((range) => ({ ...range, students: scores.filter(range.matches).length }));
  return <div className="distribution-chart"><ResponsiveContainer width="100%" height={105}><BarChart data={ranges} margin={{ top: 4, right: 6, left: -25, bottom: 0 }}><CartesianGrid stroke="#F0F1F5" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#9AA1B1', fontSize: 8 }}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#A0A6B4', fontSize: 8 }}/><Tooltip formatter={(value) => [`${value} students`, 'Count']}/><Bar dataKey="students" radius={[4,4,0,0]}>{ranges.map((entry) => <Cell key={entry.label} fill={entry.tone}/>)}</Bar></BarChart></ResponsiveContainer></div>;
}

function DashboardPage({ data, dashboard, onOpenClass, onOpenImport, onNavigate, onExport }) {
  const hasData = data.students.length > 0;
  const [classFilter, setClassFilter] = useState('All classrooms');
  const [trendMetric, setTrendMetric] = useState('learning');
  const insights = dashboard.classroomRows.slice().sort((a, b) => a.average - b.average);
  const lowClass = insights[0];
  const lowStats = lowClass ? getClassStats(data, lowClass.classroom) : null;
  const lowTopic = lowStats?.topicStats[0];
  const trend = data.trend?.length ? data.trend : [{ week: 'Current', ...Object.fromEntries(dashboard.classroomRows.map((row) => [row.classroom, row.average])) }];
  const completed = dashboard.assessmentCount;
  return <>
    <div className="page-title-row dashboard-title-row">
      <div><div className="eyebrow">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}</div><h1>Good morning, {data.teacher?.name?.split(' ')[0] || 'Ananya'}</h1><p>Here's what's happening across your classrooms today.</p></div>
      <div className="title-actions"><div className="academic-select"><CalendarDays size={15} /><span>2026–27</span><ChevronDown size={14} /></div><Button onClick={onOpenImport} icon={UploadCloud}>Import data</Button></div>
    </div>
    {!hasData ? <EmptyState icon={Users} title="Start with your student data" description="Upload a class roster or assessment spreadsheet to populate your Learning Pulse workspace." action={<Button onClick={onOpenImport} icon={UploadCloud}>Upload student data</Button>} /> : <>
      <div className="metric-grid four-grid">
        <MetricCard label="TOTAL STUDENTS" value={data.students.length} note={`Across ${dashboard.classrooms.length} classrooms`} icon={Users} tone="purple" />
        <MetricCard label="AVERAGE PERFORMANCE" value={formatPct(dashboard.avg)} note="Across imported assessment results" icon={BarChart3} tone="blue" trend={data.source === 'demo' ? '+6%' : undefined} />
        <MetricCard label="NEEDING SUPPORT" value={dashboard.needsSupport} note="Based on current assessment data" icon={Target} tone="coral" />
        <MetricCard label="ASSESSMENTS" value={completed} note="Unique assessment activities" icon={ClipboardCheck} tone="green" />
      </div>

      <div className="dashboard-grid-main">
        <section className="panel chart-panel">
          <div className="panel-header"><div><h2>Classroom learning progress</h2><p>Performance trend across your classrooms</p></div><div className="legend-inline"><span><i className="legend-dot purple-dot" />Grade 6A</span><span><i className="legend-dot blue-dot" />Grade 6B</span><span><i className="legend-dot green-dot" />Grade 7A</span></div></div>
          {data.source === 'demo' ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 12, right: 10, left: -18, bottom: 0 }}><CartesianGrid stroke="#EEF0F5" vertical={false} /><XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#9299AA', fontSize: 11 }} dy={10} /><YAxis domain={[40, 100]} axisLine={false} tickLine={false} tick={{ fill: '#9299AA', fontSize: 11 }} tickFormatter={(value) => `${value}%`} /><Tooltip contentStyle={{ border: '1px solid #E7E9F0', borderRadius: 10, boxShadow: '0 8px 30px rgba(34,39,70,.08)', fontSize: 12 }} formatter={(value) => [`${value}%`, '']} /><Line type="monotone" dataKey="Grade 6A" stroke="#6558D3" strokeWidth={2.5} dot={{ r: 3, fill: '#6558D3', strokeWidth: 0 }} activeDot={{ r: 5 }} /><Line type="monotone" dataKey="Grade 6B" stroke="#5B94D9" strokeWidth={2.5} dot={{ r: 3, fill: '#5B94D9', strokeWidth: 0 }} activeDot={{ r: 5 }} /><Line type="monotone" dataKey="Grade 7A" stroke="#3A9B78" strokeWidth={2.5} dot={{ r: 3, fill: '#3A9B78', strokeWidth: 0 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div> : <ImportedTrendChart data={data} />}
          <div className="chart-footnote"><span><i className="footnote-dot" />Based on recorded assessment scores</span><span>{data.source === 'demo' ? 'Demo data' : 'Uploaded data'}</span></div>
        </section>

        <section className="panel snapshot-panel">
          <div className="panel-header"><div><h2>Classroom snapshot</h2><p>Performance at a glance</p></div><button className="text-link" onClick={() => onNavigate('classrooms')}>View all <ArrowRight size={13} /></button></div>
          <div className="snapshot-table">
            <div className="snapshot-head"><span>CLASSROOM</span><span>STUDENTS</span><span>AVG. SCORE</span></div>
            {dashboard.classroomRows.slice(0, 5).map((row) => <button className="snapshot-row" key={row.classroom} onClick={() => onOpenClass(row.classroom)}><strong>{row.classroom}</strong><span>{row.count}</span><b>{formatPct(row.average)}</b></button>)}
          </div>
          <div className="snapshot-bottom"><span><span className="tiny-dot purple-dot" />{dashboard.classrooms.length} active classrooms</span><span>Updated just now</span></div>
        </section>
      </div>

      <div className="dashboard-bottom-grid">
        <section className="insight-banner">
          <div className="insight-icon"><Lightbulb size={19} /></div>
          <div className="insight-copy"><span className="eyebrow">LEARNING INSIGHT</span><h3>{lowTopic ? `${lowTopic.topic} needs attention in ${lowClass.classroom}` : 'Explore your classroom learning insights'}</h3><p>{lowTopic ? `${lowTopic.score}% average performance across this topic. Review student understanding and consider a focused learning activity.` : 'Upload assessment results to identify topics where students may need support.'}</p></div>
          <Button variant="secondary" size="sm" onClick={() => onNavigate('groups')}>Explore learning gaps <ArrowRight size={14} /></Button>
        </section>
        <section className="panel quick-actions-panel">
          <div className="panel-header"><div><h2>Quick actions</h2><p>Keep your workspace moving</p></div></div>
          <div className="quick-actions"><button onClick={onOpenImport}><span className="quick-icon lavender"><FileUp size={17} /></span><span><strong>Upload data</strong><small>Bring in a roster or results</small></span><ChevronRight size={15} /></button><button onClick={() => onNavigate('groups')}><span className="quick-icon mint"><Layers3 size={17} /></span><span><strong>Review learning groups</strong><small>See suggested student groups</small></span><ChevronRight size={15} /></button></div>
        </section>
      </div>
    </>}
  </>;
}

function ImportedTrendChart({ data }) {
  const rows = getAssessmentRows(data).slice(0, 8).reverse().map((row, index) => ({ name: row.assessment.length > 14 ? `${row.assessment.slice(0, 14)}…` : row.assessment, score: row.average, index }));
  if (!rows.length) return <div className="chart-empty"><BarChart3 size={22} /><span>Assessment trend will appear when results are uploaded.</span></div>;
  return <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="importTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6558D3" stopOpacity={0.2} /><stop offset="95%" stopColor="#6558D3" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#EEF0F5" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9299AA', fontSize: 10 }} dy={9} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#9299AA', fontSize: 11 }} tickFormatter={(value) => `${value}%`} /><Tooltip formatter={(value) => [`${value}%`, 'Average score']} /><Area type="monotone" dataKey="score" stroke="#6558D3" strokeWidth={2.5} fill="url(#importTrend)" /></AreaChart></ResponsiveContainer></div>;
}

function ClassroomPage({ data, classrooms, selectedClass, setSelectedClass, stats, search, setSearch, onShowStudent, onNavigate, onOpenImport }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const filtered = stats.students.filter((student) => {
    const matchesSearch = student.name.toLowerCase().includes(search.toLowerCase()) || student.id.toLowerCase().includes(search.toLowerCase());
    const score = getStudentAverage(data, student);
    const hasTopicGap = getStudentTopicStats(data, student).some((topic) => topic.score < 60);
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'support' && hasTopicGap) || (statusFilter === 'on-track' && !hasTopicGap && score < 75) || (statusFilter === 'strong' && !hasTopicGap && score >= 75);
    return matchesSearch && matchesStatus;
  });
  return <>
    <div className="page-title-row"><div><div className="breadcrumb-small">My Classrooms <ChevronRight size={13} /> Classroom detail</div><h1>{selectedClass || 'Classroom overview'}</h1><p>{stats.students.length} students · {stats.students[0]?.subject || 'Mathematics'} · Academic year 2026–27</p></div><div className="title-actions"><select className="select-control" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}>{classrooms.map((classroom) => <option key={classroom}>{classroom}</option>)}</select><Button onClick={onOpenImport} icon={UploadCloud}>Import data</Button></div></div>
    <div className="metric-grid four-grid compact-metrics">
      <MetricCard label="TOTAL STUDENTS" value={stats.students.length} note="Class roster" icon={Users} tone="purple" />
      <MetricCard label="AVERAGE PERFORMANCE" value={formatPct(stats.overall)} note="Across recorded assessments" icon={BarChart3} tone="blue" />
      <MetricCard label="NEEDING SUPPORT" value={stats.needsSupport} note="Current learning indicators" icon={Target} tone="coral" />
      <MetricCard label="ASSESSMENTS" value={stats.assessmentCount} note="Unique assessment activities" icon={ClipboardCheck} tone="green" />
    </div>

    <section className="panel topic-panel">
      <SectionHeading title="Learning performance" subtitle="How students are progressing across learning topics." action={<span className="mini-filter"><Filter size={14} /> All topics</span>} />
      {stats.topicStats.length ? <div className="topic-grid">{stats.topicStats.slice().sort((a, b) => b.score - a.score).map((topic) => {
        const type = topic.score < 60 ? 'coral' : topic.score < 75 ? 'blue' : 'green';
        const label = topic.score < 60 ? 'Needs attention' : topic.score < 75 ? 'Developing' : 'On track';
        return <div className={`topic-row ${type === 'coral' ? 'topic-attention' : ''}`} key={topic.topic}><div className="topic-info"><span>{topic.topic}</span><strong>{formatPct(topic.score)}</strong></div><Progress value={topic.score} tone={type} /><div className="topic-meta"><Status type={type === 'coral' ? 'attention' : type === 'blue' ? 'info' : 'success'}>{label}</Status><span>{topic.count} results</span></div></div>;
      })}</div> : <EmptyState title="No assessment data yet" description="Upload assessment results to see topic-level learning performance." action={<Button onClick={onOpenImport} icon={UploadCloud}>Import results</Button>} />}
    </section>

    <section className="panel roster-panel">
      <div className="section-heading roster-heading"><div><h2>Students</h2><p>Track individual progress and identify students who may need attention.</p></div><div className="roster-tools"><label className="table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students..." /></label><select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter students by learning status"><option value="all">All students</option><option value="strong">Strong</option><option value="on-track">On track</option><option value="support">Needs support</option></select></div></div>
      {filtered.length ? <StudentTable students={filtered.slice(0, 12)} data={data} onShowStudent={onShowStudent} /> : <EmptyState icon={Search} title="No students found" description="Try another student name or ID." />}
      <div className="table-bottom"><span>Showing {Math.min(filtered.length, 12)} of {stats.students.length} students</span><div className="pagination"><button disabled><ChevronLeft size={14} /></button><button className="current">1</button><button disabled><ChevronRight size={14} /></button></div></div>
    </section>
    <div className="classroom-insight-inline"><div className="insight-icon"><Lightbulb size={18} /></div><div><span className="eyebrow">CLASSROOM INSIGHT</span><strong>{stats.topicStats[0] ? `${stats.topicStats[0].topic} is the biggest opportunity for ${selectedClass}.` : 'Add assessment data to reveal learning opportunities.'}</strong><p>{stats.topicStats[0] ? `${formatPct(stats.topicStats[0].score)} average across ${stats.topicStats[0].count} recorded results.` : 'Learning Pulse will highlight topics and students that may need extra support.'}</p></div><Button variant="secondary" size="sm" onClick={() => onNavigate('groups')}>Explore learning gaps <ArrowRight size={14} /></Button></div>
  </>;
}

function StudentTable({ students, data, onShowStudent }) {
  return <div className="table-scroll"><table className="data-table"><thead><tr><th>STUDENT</th><th>OVERALL PROGRESS</th><th>LATEST ASSESSMENT</th><th>LEARNING STATUS</th><th>LAST ACTIVITY</th><th></th></tr></thead><tbody>{students.map((student, index) => {
    const averageScore = getStudentAverage(data, student);
    const records = data.assessments.filter((record) => record.studentId === student.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const latest = records[0];
    const hasTopicGap = getStudentTopicStats(data, student).some((topic) => topic.score < 60);
    const status = hasTopicGap ? 'attention' : averageScore < 75 ? 'info' : 'success';
    const label = hasTopicGap ? 'Needs support' : averageScore < 75 ? 'On track' : 'Strong';
    return <tr key={student.id} onClick={() => onShowStudent(student)} className="clickable-row"><td><div className="student-cell"><Avatar name={student.name} tone={['purple','blue','green','coral'][index % 4]} /><span><strong>{student.name}</strong><small>{student.id}</small></span></div></td><td><div className="table-progress"><Progress value={averageScore} tone={status === 'attention' ? 'coral' : status === 'info' ? 'blue' : 'green'} compact /><strong>{formatPct(averageScore)}</strong></div></td><td><span className="assessment-score">{latest ? formatPct(latest.score) : '—'}</span><small className="table-subtext">{latest?.topic || 'No result'}</small></td><td><Status type={status}>{label}</Status></td><td className="muted-cell">{latest ? dateLabel(latest.date) : 'No activity'}</td><td><ChevronRight size={16} className="row-chevron" /></td></tr>;
  })}</tbody></table></div>;
}

function StudentsPage({ data, search, onShowStudent, onOpenImport, onExport }) {
  const students = data.students.filter((student) => student.name.toLowerCase().includes(search.toLowerCase()) || student.classroom.toLowerCase().includes(search.toLowerCase()) || student.id.toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="page-title-row"><div><div className="eyebrow">LEARNER DIRECTORY</div><h1>Students</h1><p>Understand individual progress across your classrooms.</p></div><div className="title-actions"><Button variant="secondary" onClick={onExport} icon={Download}>Export</Button><Button onClick={onOpenImport} icon={UploadCloud}>Import students</Button></div></div>
    <section className="panel roster-panel full-roster"><div className="section-heading"><div><h2>All students <span className="count-pill">{students.length}</span></h2><p>Choose a student to explore their learning journey.</p></div><span className="source-tag">{data.source === 'demo' ? 'Demo records' : 'Imported records'}</span></div>
      {students.length ? <StudentTable students={students.slice(0, 30)} data={data} onShowStudent={onShowStudent} /> : <EmptyState icon={Users} title="No student records yet" description="Upload a student roster in CSV or Excel format to get started." action={<Button onClick={onOpenImport} icon={UploadCloud}>Upload roster</Button>} />}
      {students.length > 30 && <div className="table-bottom"><span>Showing 30 of {students.length} students</span></div>}
    </section>
  </>;
}

function StudentPage({ data, student, onBack, onNavigate, onShowGroups }) {
  const records = data.assessments.filter((record) => record.studentId === student.id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const topics = getStudentTopicStats(data, student);
  const score = getStudentAverage(data, student);
  const trend = records.slice(-8).map((record, index) => ({ label: record.topic.length > 12 ? record.topic.slice(0, 12) : record.topic, score: record.score, date: record.date, topic: record.topic }));
  const strengths = topics.filter((topic) => topic.score >= 70).sort((a, b) => b.score - a.score);
  const support = topics.filter((topic) => topic.score < 70).sort((a, b) => a.score - b.score);
  const focus = support[0] || topics[topics.length - 1];
  const status = score < 60 ? 'attention' : score < 75 ? 'info' : 'success';
  return <>
    <button className="back-link" onClick={onBack}><ChevronLeft size={15} /> Back to students</button>
    <div className="student-profile-header"><div className="student-profile-identity"><Avatar name={student.name} size="xl" /><div><div className="eyebrow">STUDENT PROFILE</div><h1>{student.name}</h1><p>{student.classroom} · {student.subject || 'Mathematics'} · Student ID: {student.id}</p></div></div><div className="title-actions"><Button variant="secondary" onClick={() => onNavigate('assessments')} icon={ClipboardCheck}>Assessment history</Button><Button onClick={onShowGroups} icon={Sparkles}>Create learning plan</Button></div></div>
    <div className="metric-grid four-grid compact-metrics"><MetricCard label="OVERALL PROGRESS" value={formatPct(score)} note="Average across recorded results" icon={Activity} tone="purple" /><MetricCard label="ASSESSMENT RESULTS" value={records.length} note="Recorded learning checks" icon={ClipboardCheck} tone="blue" /><MetricCard label="STRENGTH AREAS" value={strengths.length} note="Topics at 70% or above" icon={Award} tone="green" /><MetricCard label="LAST ACTIVE" value={records.length ? dateLabel(records[records.length - 1].date) : '—'} note="Most recent result date" icon={Clock3} tone="coral" /> </div>
    <div className="student-insights-grid"><section className="panel student-trend-panel"><SectionHeading title="Learning progress" subtitle="Recorded assessment results over time." />{trend.length ? <div className="student-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}><defs><linearGradient id="studentTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6558D3" stopOpacity={0.22} /><stop offset="100%" stopColor="#6558D3" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#EEF0F5" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#9299AA', fontSize: 11 }} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#9299AA', fontSize: 11 }} tickFormatter={(value) => `${value}%`} /><Tooltip formatter={(value, name, props) => [`${value}%`, props.payload.topic]} labelFormatter={(label, payload) => payload?.[0]?.payload?.date ? dateLabel(payload[0].payload.date) : label} /><Area type="monotone" dataKey="score" stroke="#6558D3" strokeWidth={2.5} fill="url(#studentTrend)" activeDot={{ r: 5 }} /></AreaChart></ResponsiveContainer></div> : <div className="chart-empty"><BarChart3 size={22} /><span>Assessment history will appear here after results are imported.</span></div>}<div className="chart-footnote"><span><i className="footnote-dot" />Assessment performance</span><span>{records.length} recorded results</span></div></section>
      <section className="panel student-topics-panel"><SectionHeading title="Topic understanding" subtitle="Current performance by topic." />{topics.length ? topics.sort((a, b) => b.score - a.score).map((topic) => <div className="student-topic-row" key={topic.topic}><div><strong>{topic.topic}</strong><span>{formatPct(topic.score)}</span></div><Progress value={topic.score} tone={topic.score < 60 ? 'coral' : topic.score < 75 ? 'blue' : 'green'} /><Status type={topic.score < 60 ? 'attention' : topic.score < 75 ? 'info' : 'success'}>{topic.score < 60 ? 'Needs support' : topic.score < 75 ? 'Developing' : 'Strong'}</Status></div>) : <p className="empty-inline">No topic-level results found.</p>}</section></div>
    <div className="student-bottom-grid"><section className="panel"><SectionHeading title="Strengths" subtitle="Topics showing stronger understanding." />{strengths.length ? strengths.map((topic) => <div className="strength-row" key={topic.topic}><span className="topic-check"><Check size={15} /></span><div><strong>{topic.topic}</strong><small>{formatPct(topic.score)} average</small></div><Status type="success">Strong</Status></div>) : <p className="empty-inline">Strength areas will appear as results are added.</p>}</section><section className="panel"><SectionHeading title="Areas to explore" subtitle="Topics where focused practice may help." />{support.length ? support.map((topic) => <div className="strength-row" key={topic.topic}><span className="topic-alert"><Target size={15} /></span><div><strong>{topic.topic}</strong><small>{formatPct(topic.score)} average</small></div><Status type="attention">Review</Status></div>) : <p className="empty-inline">No priority support areas identified.</p>}</section></div>
    <section className="recommendation-card"><div className="recommendation-mark"><Sparkles size={19} /></div><div className="recommendation-copy"><span className="eyebrow">LEARNING PULSE RECOMMENDATION</span><h3>{focus ? `Build confidence with ${focus.topic.toLowerCase()}` : 'Explore a personalised learning activity'}</h3><p>{focus ? `Recent results suggest that ${student.name.split(' ')[0]} may benefit from a short, guided activity focused on ${focus.topic.toLowerCase()}. Review the suggested group and activity before assigning.` : 'Upload assessment results to create a relevant learning recommendation.'}</p><div className="chip-row"><span>{focus?.topic || 'Learning activity'}</span><span>15–20 minute activity</span><span>Teacher-reviewed</span></div></div><Button onClick={onShowGroups}>Create learning plan <ArrowRight size={14} /></Button></section>
  </>;
}

function AssessmentsPage({ data, rows, onOpenImport, onExport, onShowGroups }) {
  return <>
    <div className="page-title-row"><div><div className="eyebrow">MEASURE AND UNDERSTAND</div><h1>Assessments</h1><p>Review results and turn evidence of learning into the next step.</p></div><div className="title-actions"><Button variant="secondary" onClick={onExport} icon={Download}>Export results</Button><Button onClick={onOpenImport} icon={UploadCloud}>Import results</Button></div></div>
    <div className="metric-grid three-grid"><MetricCard label="RESULT RECORDS" value={data.assessments.length} note="Individual student results" icon={FileSpreadsheet} tone="purple" /><MetricCard label="ASSESSMENT ACTIVITIES" value={rows.length} note="Unique class assessments" icon={ClipboardCheck} tone="blue" /><MetricCard label="AVERAGE SCORE" value={formatPct(average(data.assessments.map((record) => record.score)))} note="Across available results" icon={BarChart3} tone="green" /></div>
    <section className="panel assessment-list-panel"><div className="section-heading"><div><h2>Assessment history</h2><p>Imported and recorded assessment activities.</p></div><span className="source-tag">{data.source === 'demo' ? 'Demo dataset' : 'Uploaded dataset'}</span></div>{rows.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>ASSESSMENT</th><th>CLASSROOM</th><th>SUBJECT</th><th>STUDENTS</th><th>AVERAGE SCORE</th><th>DATE</th><th></th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="assessment-name-cell"><span className="assessment-file-icon"><ClipboardCheck size={16} /></span><span><strong>{row.assessment}</strong><small>{row.id}</small></span></div></td><td>{row.classroom}</td><td>{row.subject}</td><td>{row.students}</td><td><div className="score-cell"><strong>{formatPct(row.average)}</strong><Progress value={row.average} compact tone={row.average < 60 ? 'coral' : row.average < 75 ? 'blue' : 'green'} /></div></td><td className="muted-cell">{dateLabel(row.date)}</td><td><button className="icon-button ghost" title="View learning gaps" onClick={onShowGroups}><ArrowUpRight size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={ClipboardCheck} title="No assessments yet" description="Upload assessment results from a CSV or Excel file. Learning Pulse will calculate performance and identify areas that may need support." action={<Button onClick={onOpenImport} icon={UploadCloud}>Import assessment results</Button>} />}</section>
    <div className="assessment-next-step"><div className="next-step-icon"><Sparkles size={18} /></div><div><strong>Ready to turn results into action?</strong><p>Explore topic-level learning gaps and create editable student groups based on the uploaded assessment data.</p></div><Button variant="secondary" onClick={onShowGroups}>Open learning groups <ArrowRight size={14} /></Button></div>
  </>;
}

function GroupsPage({ data, classrooms, selectedClass, setSelectedClass, generated, onMoveStudent, onRenameGroup, onApprove, onExport, approved, onOpenImport }) {
  const [activeGroup, setActiveGroup] = useState('all');
  const groupNames = data.groupNames?.[selectedClass] || {};
  const totalAssigned = generated.groups.reduce((sum, group) => sum + group.students.length, 0);
  return <>
    <div className="page-title-row"><div><div className="eyebrow">FROM INSIGHT TO ACTION</div><h1>Assessment insights</h1><p>Turn assessment results into focused learning experiences.</p></div><div className="title-actions"><select className="select-control" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}>{classrooms.map((classroom) => <option key={classroom}>{classroom}</option>)}</select><Button variant="secondary" onClick={onExport} icon={Download}>Export plan</Button></div></div>
    {!generated.groups.length ? <EmptyState icon={Layers3} title="Learning groups need assessment data" description={generated.note || 'Import a student roster and assessment results. Learning Pulse will identify the lowest-performing topic and recommend editable groups.'} action={<Button onClick={onOpenImport} icon={UploadCloud}>Import assessment data</Button>} /> : <>
      <section className="assessment-summary-card"><div className="summary-assessment-icon"><ClipboardCheck size={20} /></div><div className="summary-assessment-info"><span className="eyebrow">SELECTED CLASS ASSESSMENT</span><h2>{generated.focusTopic?.topic || 'Learning assessment'} — Learning analysis</h2><p>{selectedClass} <i /> {generated.focusTopic?.count || 0} topic results <i /> Mathematics</p></div><div className="summary-score"><span>TOPIC AVERAGE</span><strong>{formatPct(generated.focusTopic?.score || 0)}</strong><Status type={(generated.focusTopic?.score || 0) < 60 ? 'attention' : 'info'}>{(generated.focusTopic?.score || 0) < 60 ? 'Needs attention' : 'Review opportunity'}</Status></div></section>
      <section className="panel gaps-panel"><SectionHeading title="Where students need support" subtitle="The lowest-performing topic is highlighted for focused review." action={<span className="ai-label"><Sparkles size={13} /> Learning Pulse analysis</span>} />
        <div className="gap-summary-grid"><div className="gap-summary-main"><div className="gap-topic-icon"><Target size={18} /></div><div><span className="eyebrow">PRIORITY TOPIC</span><h3>{generated.focusTopic?.topic}</h3><p>{generated.focusTopic?.score < 60 ? 'Students may benefit from explicit instruction and guided practice.' : 'A targeted review could help strengthen understanding and build confidence.'}</p></div><strong className="gap-average">{formatPct(generated.focusTopic?.score || 0)}</strong></div><div className="gap-summary-side"><span>Students in class</span><strong>{getClassStats(data, selectedClass).students.length}</strong><span>Students recommended for groups</span><strong>{totalAssigned}</strong></div></div>
        <div className="distribution-row"><div><strong>Score distribution</strong><span>Student results in {generated.focusTopic?.topic}</span></div><ScoreDistribution data={data} classroom={selectedClass} topic={generated.focusTopic?.topic} /></div>
        <div className="gap-topic-footer"><span><AlertCircle size={14} /> Recommendations are based on recorded topic scores below 85%.</span><span>{generated.unassigned} students not assigned to an intervention group</span></div>
      </section>
      <div className="groups-section-heading"><div><h2>Recommended learning groups</h2><p>Review the suggested groups, edit membership and approve when ready.</p></div><span className="suggested-tag"><Sparkles size={12} /> SUGGESTED BY LEARNING PULSE</span></div>
      <div className="learning-group-grid">{generated.groups.map((group, index) => <div className={`learning-group-card group-${group.color}`} key={group.id}><div className="group-card-top"><div className="group-symbol"><Users size={17} /></div><button className="icon-button ghost" title="Rename group" onClick={() => onRenameGroup(selectedClass, group.id, groupNames[group.id] || group.name)}><Pencil size={15} /></button></div><span className="group-kicker">GROUP {String(index + 1).padStart(2, '0')}</span><h3>{groupNames[group.id] || group.name}</h3><div className="group-count"><strong>{group.students.length}</strong><span>students</span></div><div className="group-focus"><span>LEARNING FOCUS</span><strong>{group.focus}</strong></div><div className="group-activity"><div className="activity-symbol"><BookOpen size={16} /></div><div><span>Suggested activity</span><strong>{group.activity}</strong><small><Clock3 size={12} /> {group.duration}</small></div></div><p className="group-description">{group.description}</p><div className="group-students-preview"><div className="avatar-stack">{group.students.slice(0, 4).map((student) => <Avatar key={student.id} name={student.name} size="xs" />)}{group.students.length > 4 && <span className="avatar-more">+{group.students.length - 4}</span>}</div><span>{group.students.length} assigned</span></div><button className="group-expand-button" onClick={() => setActiveGroup(activeGroup === group.id ? 'all' : group.id)}>{activeGroup === group.id ? 'Hide students' : 'View / edit students'}<ChevronDown size={14} className={activeGroup === group.id ? 'rotate-up' : ''} /></button>{activeGroup === group.id && <div className="group-members-list">{group.students.map((student) => <div className="group-member-row" key={student.id}><Avatar name={student.name} size="xs" /><span>{student.name}</span><select value={group.id} onChange={(event) => onMoveStudent(selectedClass, student.id, event.target.value)} aria-label={`Move ${student.name} to another group`}><option value="foundation">Foundations</option><option value="guided">Guided practice</option><option value="challenge">Challenge & apply</option><option value="none">Unassigned</option></select></div>)}</div>}</div>)}</div>
      <section className="panel group-management-panel"><div className="section-heading"><div><h2>Group management</h2><p>Review the student allocations before activating the plan.</p></div><span className="count-pill">{totalAssigned} students</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>STUDENT</th><th>CURRENT GROUP</th><th>TOPIC SCORE</th><th>LEARNING FOCUS</th><th>CHANGE GROUP</th></tr></thead><tbody>{generated.groups.flatMap((group) => group.students.map((student) => <tr key={student.id}><td><div className="student-cell"><Avatar name={student.name} size="sm" /><span><strong>{student.name}</strong><small>{student.id}</small></span></div></td><td>{groupNames[group.id] || group.name}</td><td><strong>{formatPct(student.score)}</strong></td><td className="muted-cell">{group.focus}</td><td><select className="table-select" value={group.id} onChange={(event) => onMoveStudent(selectedClass, student.id, event.target.value)}><option value="foundation">Building Foundations</option><option value="guided">Guided Practice</option><option value="challenge">Challenge & Apply</option><option value="none">Unassigned</option></select></td></tr>))}</tbody></table></div><div className="group-table-footnote"><InfoMark /> {generated.unassigned} students are currently performing at or above the suggested intervention threshold and have not been assigned to a group.</div></section>
      <section className="approval-panel"><div className="approval-panel-icon"><ShieldCheck size={19} /></div><div className="approval-panel-copy"><span className="eyebrow">YOUR NEXT STEP</span><h3>{approved ? 'Learning plan approved' : 'Review and activate your learning plan'}</h3><p>{approved ? 'Your group plan is saved locally. You can still make changes or export the current version.' : 'These groups are recommendations based on assessment results. You can edit group membership and activity suggestions before approving.'}</p><div className="approval-mini-stats"><span><strong>{generated.groups.length}</strong> groups</span><span><strong>{totalAssigned}</strong> students</span><span><strong>{generated.groups.length}</strong> activities</span></div></div><div className="approval-actions"><Button variant="secondary" onClick={onExport} icon={Download}>Export plan</Button><Button onClick={onApprove} icon={CheckCircle2}>{approved ? 'Approve again' : 'Approve learning groups'}</Button></div></section>
    </>}
  </>;
}

function InfoMark() { return <span className="info-mark"><CircleHelp size={14} /></span>; }

function ImportModal({ state, setState, fileInputRef, onFile, onClose, onConfirm, onDownloadTemplate }) {
  const fields = state.kind === 'assessment' ? (state.wideFormat ? assessmentFields.filter((field) => !['topic', 'score'].includes(field.key)) : assessmentFields) : rosterFields;
  const wideTopicCandidates = state.parsed ? detectWideTopicColumns(state.parsed.headers, state.parsed.rows) : [];
  const update = (key, value) => setState((current) => ({ ...current, mapping: { ...current.mapping, [key]: value }, error: '' }));
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal import-modal"><div className="modal-header"><div><span className="eyebrow">DATA IMPORT</span><h2>Bring your classroom data into Learning Pulse</h2><p>Upload a student roster or assessment results. Your file is processed in this browser.</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
    <div className="import-steps"><span className={state.stage === 'choose' ? 'current' : 'complete'}><i>{state.stage === 'map' ? <Check size={12} /> : '1'}</i> Upload file</span><b /><span className={state.stage === 'map' ? 'current' : ''}><i>2</i> Map columns</span><b /><span><i>3</i> Import</span></div>
    {state.stage === 'choose' ? <>
      <div className="import-type-grid"><button className={`import-type-card ${state.kind === 'roster' ? 'selected' : ''}`} onClick={() => setState((current) => ({ ...current, kind: 'roster' }))}><span className="import-type-icon lavender"><Users size={19} /></span><strong>Student roster</strong><small>Names, classroom, grade and student IDs.</small></button><button className={`import-type-card ${state.kind === 'assessment' ? 'selected' : ''}`} onClick={() => setState((current) => ({ ...current, kind: 'assessment' }))}><span className="import-type-icon blue"><ClipboardCheck size={19} /></span><strong>Assessment results</strong><small>Student scores, topics and assessment dates.</small></button></div>
      <button className="upload-dropzone" onClick={() => fileInputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onFile(event.dataTransfer.files?.[0]); }}><span className="upload-drop-icon"><UploadCloud size={24} /></span><strong>Choose a CSV or Excel file</strong><span>or drag and drop it here</span><small>Supported formats: .csv, .xlsx, .xls</small></button>
      <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.txt" hidden onChange={(event) => onFile(event.target.files?.[0])} />
      <div className="import-modal-bottom"><button className="template-link" onClick={() => onDownloadTemplate(state.kind)}><Download size={14} /> Download {state.kind === 'roster' ? 'roster' : 'assessment'} template</button><span><LockKeyhole size={13} /> Files stay in this browser</span></div>
    </> : <>
      <div className="file-summary"><span className="file-summary-icon"><FileSpreadsheet size={18} /></span><div><strong>{state.file?.name}</strong><small>{state.parsed?.totalRows || 0} rows · {state.parsed?.headers?.length || 0} columns</small></div><button className="text-link" onClick={() => setState((current) => ({ ...current, stage: 'choose', file: null, parsed: null }))}>Change file</button></div>
      <div className="import-kind-selector"><label>What does this file contain?</label><div className="segmented-control"><button className={state.kind === 'roster' ? 'selected' : ''} onClick={() => setState((current) => ({ ...current, kind: 'roster', mapping: suggestMapping(current.parsed.headers, 'roster'), wideFormat: false, error: '' }))}>Student roster</button><button className={state.kind === 'assessment' ? 'selected' : ''} onClick={() => setState((current) => ({ ...current, kind: 'assessment', mapping: suggestMapping(current.parsed.headers, 'assessment'), wideFormat: !current.parsed.headers.some((header) => ['topic','unit','skill','concept','learning objective'].includes(String(header).toLowerCase().replace(/[_-]+/g, ' ').trim())) && (current.wideColumns || []).length > 0, error: '' }))}>Assessment results</button></div></div>
      <div className="mapping-heading"><div><strong>Match your spreadsheet columns</strong><span>We have suggested matches based on your header names. Review before importing.</span></div><span className="auto-match"><Sparkles size={12} /> Auto-detected</span></div>
      <div className="mapping-grid">{fields.map((field) => <label className="mapping-field" key={field.key}><span>{field.label}{field.required && <b>*</b>}</span><select value={state.mapping[field.key] || ''} onChange={(event) => update(field.key, event.target.value)}><option value="">Not mapped</option>{state.parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
      {state.kind === 'assessment' && state.wideFormat && <div className="wide-topic-picker"><div><strong>Topic score columns</strong><span>Choose the columns that contain scores. Each selected column becomes a topic.</span></div><div className="wide-topic-options">{wideTopicCandidates.map((column) => <label key={column}><input type="checkbox" checked={state.wideColumns.includes(column)} onChange={(event) => setState((current) => ({ ...current, wideColumns: event.target.checked ? [...current.wideColumns, column] : current.wideColumns.filter((item) => item !== column), error: '' }))}/>{column}</label>)}</div></div>}
      <div className="import-preview"><div className="preview-heading"><strong>Data preview</strong><span>First 3 rows</span></div><div className="preview-scroll"><table><thead><tr>{state.parsed.headers.slice(0, 5).map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{state.parsed.rows.slice(0, 3).map((row, index) => <tr key={index}>{state.parsed.headers.slice(0, 5).map((header) => <td key={header}>{String(row[header] ?? '—').slice(0, 32)}</td>)}</tr>)}</tbody></table></div></div>
      <label className="replace-check"><input type="checkbox" checked={state.replace} onChange={(event) => setState((current) => ({ ...current, replace: event.target.checked }))} /><span><strong>Replace current dataset</strong><small>{state.replace ? 'The demo/sample records will be cleared before import.' : 'Merge these rows with the records already in this workspace.'}</small></span></label>
      {state.error && <div className="inline-error"><AlertCircle size={15} />{state.error}</div>}
      <div className="import-actions"><Button variant="secondary" onClick={() => setState((current) => ({ ...current, stage: 'choose', error: '' }))}>Back</Button><Button onClick={onConfirm} icon={FileUp}>Import {state.kind === 'roster' ? 'students' : 'results'}</Button></div>
    </>}
    <div className="privacy-note"><ShieldCheck size={14} /> Learning Pulse processes this file locally. No data is uploaded to a server.</div>
  </div></div>;
}

export default App;
