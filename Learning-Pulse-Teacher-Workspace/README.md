# Learning Pulse — Teacher Workspace

A Vite + React teacher workspace prototype. The demo is an option **inside the app's login screen**; there is no separate HTML demo experience.

## Run on Windows

1. Install Node.js 22 LTS (22.12+) from https://nodejs.org/. Node 20.19+ is also supported.
2. Extract the ZIP to a normal folder.
3. Double-click `run.bat`.
4. On first run, it installs npm dependencies. Internet access is required for this one-time setup.
5. Vite opens the application at http://localhost:5173.
6. Keep the terminal window open while using the application. Press Ctrl+C to stop it.

## Demo and personal workspace

The login screen offers two paths into the same React application:

- **Continue to my workspace** opens the browser-local workspace for your uploaded data.
- **Explore demo workspace** loads 90 fictional students across three classrooms with sample assessments and learning groups.
- **Create an account** creates a local teacher profile for the prototype.

The demo and uploaded-data workflows use the same dashboard, classroom, student insight, assessment and learning-group screens.

## Features

- Teacher dashboard with classroom metrics and performance trends.
- Classroom overview and searchable student roster.
- Individual student learning insights and recommended activities.
- Assessment analysis and score-based learning groups.
- Teacher-editable group names and student membership.
- Learning plan approval state.
- CSV exports for students, assessments and groups.
- CSV and XLSX imports for student rosters and assessment results.
- Long-format assessment imports and wide-format marksheets.
- Local browser persistence.

## Sample files

Located in `public/data/`:

- `sample-students.csv`
- `sample-students.xlsx`
- `sample-assessments.csv`
- `sample-assessment-marksheet.csv`
- `sample-assessment-marksheet.xlsx`

## Import formats

### Student roster

Required columns:
- `student_name` (or `name`)
- `classroom` (or `class` / `section`)

Optional columns:
- `student_id`
- `grade`
- `subject`
- `email`

### Assessment results (long format)

Required columns:
- `student_name` or `student_id`
- `topic`
- `score`

Recommended columns:
- `classroom`
- `assessment`
- `date`
- `subject`
- `max_score`

### Assessment marksheet (wide format)

One row per student with identifying columns such as `student_id`, `student_name`, `classroom`, and separate topic columns such as `Fractions`, `Decimals`, `Geometry`, and `Number Systems`.

Scores can be percentages (0–100), raw marks when `max_score` is supplied, or ratios such as `8/10`.

## Important limitations

This is a local MVP, not a deployed multi-school SaaS product. Authentication/profile creation is a browser-only preview; it does not verify credentials against a server. Imported records and edits are stored in the current browser's local storage. Recommendations use transparent score-based rules, not AI predictions, and should be reviewed by a teacher.

Before real school deployment, add server-side authentication, role-based permissions, secure database storage, encryption, audit logs, retention controls and appropriate school/parent consent.
