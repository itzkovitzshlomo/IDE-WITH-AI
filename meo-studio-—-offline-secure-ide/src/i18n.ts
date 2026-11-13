import { UiLocale } from './types/ide';

const LOCALE_STORAGE_KEY = 'meo_studio_ui_locale';

export function loadUiLocale(): UiLocale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return raw === 'he' ? 'he' : 'en';
  } catch {
    return 'en';
  }
}

export function saveUiLocale(locale: UiLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore storage errors
  }
}

export const UI_COPY: Record<
  UiLocale,
  {
    topBar: {
      workspace: string;
      security: string;
      models: string;
      sandbox: string;
      runSimulate: string;
      switchLabel: string;
    };
    sidebar: {
      activeProject: string;
      newProject: string;
      explorer: string;
      uploadFolder: string;
      uploadFolderTitle: string;
      uploadFilesTitle: string;
      newFileIn: string;
      newFolderIn: string;
      cancel: string;
      add: string;
      downloadZip: string;
      exportJson: string;
      offlineReady: string;
      offlineActive: string;
    };
    viewSwitcher: {
      preview: string;
      code: string;
      files: string;
      showAgent: string;
      hideAgent: string;
    };
    previewView: {
      targetLabel: string;
      refreshRun: string;
      openInCode: string;
      switchToReact: string;
      reactSandboxBadge: string;
      nativeSimBadge: string;
      emptyReact: string;
      consoleOutput: string;
      cycles: string;
      variables: string;
      callStack: string;
      memoryMap: string;
      noOutputYet: string;
    };
    filesView: {
      title: string;
      subtitle: string;
      totalFiles: string;
      totalFolders: string;
      securityIssues: string;
      uploadFolderBtn: string;
      newFileBtn: string;
      newFolderBtn: string;
      colName: string;
      colPath: string;
      colLanguage: string;
      colLines: string;
      colSecurity: string;
      colActions: string;
      clean: string;
      openInEditor: string;
    };
    editor: {
      findReplace: string;
      securityScan: string;
      debug: string;
      step: string;
      continue: string;
      stop: string;
      run: string;
      agentCreated: string;
      agentModified: string;
      viewDiff: string;
      codeEditor: string;
      reject: string;
      acceptChange: string;
      findPlaceholder: string;
      replacePlaceholder: string;
      replace: string;
      replaceAll: string;
      zeroMatches: string;
      autoHealedSuffix: string;
    };
    bottom: {
      console: string;
      debugger: string;
      preview: string;
      security: string;
      sandbox: string;
      clearConsole: string;
      autoFixFile: string;
      scanAll: string;
      consoleEmpty: string;
      callStack: string;
      noFrames: string;
      variables: string;
      noVariables: string;
      memoryMap: string;
      noMemory: string;
      reactPreviewEmpty: string;
      zeroSecurity: string;
      severity: string;
      findingTitle: string;
      location: string;
      action: string;
      manualReview: string;
      sandboxPolicyTitle: string;
      enforced: string;
      blockNetwork: string;
      strictPointers: string;
      isolatedFs: string;
      resourceCaps: string;
      maxCycles: string;
      maxMem: string;
    };
    agent: {
      missionTab: string;
      modelsTab: string;
      goalTitle: string;
      sparkRouting: string;
      offlineOrch: string;
      goalPlaceholder: string;
      launchMission: string;
      executing: string;
      agentChanges: string;
      rejectAll: string;
      acceptAll: string;
      architectChecklist: string;
      telemetryFeed: string;
      feedEmpty: string;
      stages: {
        planning: string;
        scaffolding: string;
        executing: string;
        testing: string;
        selfHealing: string;
      };
      presets: {
        tcpLabel: string;
        tcpGoal: string;
        rustLabel: string;
        rustGoal: string;
        hardenLabel: string;
        hardenGoal: string;
      };
    };
    models: {
      executionEngine: string;
      loadFile: string;
      sparkToggleTitle: string;
      sparkToggleDesc: string;
      qwenPresetLabel: string;
      mountPreset: string;
      ringCapLabel: string;
      ramCapLabel: string;
      activeExpert: string;
      diskBandwidth: string;
      ringFootprint: string;
      swapsHits: string;
      ssdShardsTitle: string;
      clickToStream: string;
      dropHint: string;
      ramArena: string;
      pages64k: string;
      throughput: string;
      chatEmpty: string;
      chatPlaceholder: string;
    };
    modal: {
      title: string;
      projectName: string;
      projectTemplate: string;
      cancel: string;
      create: string;
    };
  }
> = {
  en: {
    topBar: {
      workspace: 'Workspace',
      security: 'Security Scan',
      models: 'Local Models',
      sandbox: 'Sandbox',
      runSimulate: 'Run & Simulate (F5)',
      switchLabel: 'עברית',
    },
    sidebar: {
      activeProject: 'Active Project',
      newProject: 'New Project',
      explorer: 'Explorer',
      uploadFolder: 'Upload Folder / Project',
      uploadFolderTitle: 'Import an entire local folder & subfolders into workspace',
      uploadFilesTitle: 'Import individual source files',
      newFileIn: 'New file in ',
      newFolderIn: 'New folder in ',
      cancel: 'Cancel',
      add: 'Add',
      downloadZip: 'Download Full Project Zip',
      exportJson: 'Export Workspace JSON',
      offlineReady: 'Offline Ready (PWA)',
      offlineActive: 'Offline Mode Active',
    },
    viewSwitcher: {
      preview: 'Preview',
      code: 'Code',
      files: 'Files',
      showAgent: 'Agents',
      hideAgent: 'Hide Agents',
    },
    previewView: {
      targetLabel: 'Active Target',
      refreshRun: 'Run & Refresh (F5)',
      openInCode: 'Open in Code',
      switchToReact: 'Preview React UI',
      reactSandboxBadge: 'CSP Offline React Viewport',
      nativeSimBadge: 'Isolated Native Sandbox Viewport',
      emptyReact: 'Compiling offline React viewport...',
      consoleOutput: 'Live Sandbox Output',
      cycles: 'Cycles',
      variables: 'Variables',
      callStack: 'Call Stack',
      memoryMap: 'Memory Map',
      noOutputYet: 'Press Run & Refresh (F5) to execute and inspect output.',
    },
    filesView: {
      title: 'Project Files & Folder Architecture',
      subtitle: 'Inspect nested folders, import a local project directory from disk, or open files in the editor.',
      totalFiles: 'Files',
      totalFolders: 'Folders',
      securityIssues: 'Security Findings',
      uploadFolderBtn: 'Upload Folder / Project',
      newFileBtn: 'New File',
      newFolderBtn: 'New Folder',
      colName: 'File',
      colPath: 'Folder Path',
      colLanguage: 'Language',
      colLines: 'Lines',
      colSecurity: 'Security',
      colActions: 'Actions',
      clean: 'Clean',
      openInEditor: 'Open in Code',
    },
    editor: {
      findReplace: 'Find / Replace',
      securityScan: 'Security Scan',
      debug: 'Debug',
      step: 'Step (F10)',
      continue: 'Continue',
      stop: 'Stop',
      run: 'Run (F5)',
      agentCreated: 'Agent Created File',
      agentModified: 'Agent Modified File',
      viewDiff: 'View Diff',
      codeEditor: 'Code Editor',
      reject: 'Reject',
      acceptChange: 'Accept Change',
      findPlaceholder: 'Find...',
      replacePlaceholder: 'Replace with...',
      replace: 'Replace',
      replaceAll: 'Replace All',
      zeroMatches: '0 matches',
      autoHealedSuffix: 'security fix(es) auto-healed',
    },
    bottom: {
      console: 'Console',
      debugger: 'Call Stack & Variables',
      preview: 'React Sandbox',
      security: 'Security Scanner',
      sandbox: 'Sandbox Policy',
      clearConsole: 'Clear Console',
      autoFixFile: 'Auto-Fix Active File',
      scanAll: 'Scan All Files',
      consoleEmpty:
        'Press F5 or click Run & Simulate to execute the active file inside the isolated sandbox.',
      callStack: 'Call Stack',
      noFrames: 'No active stack frames. Start Debug mode to inspect execution frames.',
      variables: 'Variables & Registers',
      noVariables: 'No local variables captured in current scope.',
      memoryMap: 'Sandbox Memory Map (Hex)',
      noMemory: 'Virtual memory allocations will appear during simulation or debugging.',
      reactPreviewEmpty:
        'Select a React (.tsx) file and press F5 to compile and preview inside an offline CSP-locked sandbox iframe.',
      zeroSecurity: 'Zero CWE security vulnerabilities or unsafe memory patterns detected.',
      severity: 'Severity',
      findingTitle: 'Finding & Recommendation',
      location: 'Location',
      action: 'Action',
      manualReview: 'Manual review',
      sandboxPolicyTitle: 'Offline Sandbox Isolation Policy',
      enforced: 'Enforced',
      blockNetwork: 'Block External Network Access (CSP Lock)',
      strictPointers: 'Strict Pointer & Array Bounds Guard',
      isolatedFs: 'Virtual Isolated Filesystem',
      resourceCaps: 'Runtime Resource Caps',
      maxCycles: 'Max Instruction Cycles (Infinite Loop Guard)',
      maxMem: 'Sandbox Virtual Memory Cap',
    },
    agent: {
      missionTab: 'Mission Control',
      modelsTab: 'SparkMoE & Qwen',
      goalTitle: 'Autonomous Software Goal (EN / עברית)',
      sparkRouting: 'SparkMoE + Qwen Routing',
      offlineOrch: 'Offline MEO Orchestrator',
      goalPlaceholder: 'Describe architecture or goal in English or Hebrew...',
      launchMission: 'Launch Mission',
      executing: 'Executing...',
      agentChanges: 'Agent Changes',
      rejectAll: 'Reject All',
      acceptAll: 'Accept All',
      architectChecklist: 'Architect Checklist',
      telemetryFeed: 'Agent Telemetry Feed',
      feedEmpty:
        'Enter a software goal in English or Hebrew and click Launch Mission. SparkMoE streams the required Qwen expert shards from SSD, executes F5 sandboxes, and self-heals CWE vulnerabilities offline.',
      stages: {
        planning: 'Planning',
        scaffolding: 'Scaffolding',
        executing: 'Executing',
        testing: 'Testing',
        selfHealing: 'Self-Healing',
      },
      presets: {
        tcpLabel: 'C TCP + React',
        tcpGoal:
          'Build a concurrent TCP server in C with unit tests and a React frontend dashboard',
        rustLabel: 'Rust Slab',
        rustGoal: 'Create a Rust paged slab allocator with safety audit unit tests',
        hardenLabel: 'Harden Code',
        hardenGoal: 'Audit, harden, and auto-fix workspace CWE security issues',
      },
    },
    models: {
      executionEngine: 'Execution Engine',
      loadFile: 'Load .meo / .gguf',
      sparkToggleTitle: 'SparkMoE SSD Streaming Mode',
      sparkToggleDesc: 'Stream active Qwen/MoE expert shards via File.slice() · zero-bloat RAM',
      qwenPresetLabel: 'Qwen Coder Checkpoint Preset',
      mountPreset: 'Mount Checkpoint',
      ringCapLabel: 'Ring-Buffer RAM Cache Cap',
      ramCapLabel: 'Normal System RAM Cap',
      activeExpert: 'Active Expert Shard',
      diskBandwidth: 'Disk Read Bandwidth',
      ringFootprint: 'Ring Cache Footprint',
      swapsHits: 'Swaps / Cache Hits',
      ssdShardsTitle: 'SSD Expert Shards',
      clickToStream: 'Click to stream',
      dropHint: 'Drop a .meo or .gguf (Qwen 4 / Qwen 2.5-Coder) checkpoint',
      ramArena: 'RAM Arena',
      pages64k: '64KB Pages',
      throughput: 'Throughput',
      chatEmpty:
        'Query the active Qwen SparkMoE shard or Normal-RAM model offline in English or Hebrew.',
      chatPlaceholder: 'Ask active Qwen / SparkMoE expert (EN / עברית)...',
    },
    modal: {
      title: 'New Project Workspace',
      projectName: 'Project Name',
      projectTemplate: 'Project Template',
      cancel: 'Cancel',
      create: 'Create Workspace',
    },
  },
  he: {
    topBar: {
      workspace: 'סביבת עבודה',
      security: 'סריקת בטיחות',
      models: 'מודלים מקומיים',
      sandbox: 'סביבת הרצה',
      runSimulate: 'הרץ ודמה (F5)',
      switchLabel: 'English',
    },
    sidebar: {
      activeProject: 'פרויקט פעיל',
      newProject: 'פרויקט חדש',
      explorer: 'סייר קבצים',
      uploadFolder: 'העלה תיקייה / פרויקט',
      uploadFolderTitle: 'ייבוא תיקייה שלמה ותתי-תיקיות מהמחשב לסביבת העבודה',
      uploadFilesTitle: 'ייבוא קבצי קוד בודדים',
      newFileIn: 'קובץ חדש ב-',
      newFolderIn: 'תיקייה חדשה ב-',
      cancel: 'ביטול',
      add: 'הוסף',
      downloadZip: 'הורד פרויקט מלא (ZIP)',
      exportJson: 'ייצא גיבוי JSON',
      offlineReady: 'מוכן לעבודה אופליין (PWA)',
      offlineActive: 'מצב אופליין פעיל',
    },
    viewSwitcher: {
      preview: 'תצוגה מקדימה',
      code: 'עורך קוד',
      files: 'קבצים',
      showAgent: 'סוכנים',
      hideAgent: 'הסתר סוכנים',
    },
    previewView: {
      targetLabel: 'יעד פעיל',
      refreshRun: 'הרץ ורענן (F5)',
      openInCode: 'פתח בעורך הקוד',
      switchToReact: 'הצג ממשק React',
      reactSandboxBadge: 'תצוגת React מבודדת אופליין',
      nativeSimBadge: 'סימולציית הרצה מבודדת (C / C++ / Rust)',
      emptyReact: 'מקמפל תצוגה מקדימה של React...',
      consoleOutput: 'פלט הרצה חי',
      cycles: 'מחזורים',
      variables: 'משתנים',
      callStack: 'מחסנית קריאות',
      memoryMap: 'מיפוי זיכרון',
      noOutputYet: 'לחץ על "הרץ ורענן (F5)" כדי להריץ את הקוד ולצפות בתוצאות.',
    },
    filesView: {
      title: 'ארכיטקטורת קבצים ותיקיות בפרויקט',
      subtitle: 'צפייה במבנה התיקיות, העלאת תיקיית פרויקט שלמה מהמחשב ופתיחת קבצים לעריכה.',
      totalFiles: 'קבצים',
      totalFolders: 'תיקיות',
      securityIssues: 'ממצאי אבטחה',
      uploadFolderBtn: 'העלה תיקייה / פרויקט',
      newFileBtn: 'קובץ חדש',
      newFolderBtn: 'תיקייה חדשה',
      colName: 'שם קובץ',
      colPath: 'נתיב תיקייה',
      colLanguage: 'שפה',
      colLines: 'שורות',
      colSecurity: 'אבטחה',
      colActions: 'פעולות',
      clean: 'תקין',
      openInEditor: 'פתח בעורך',
    },
    editor: {
      findReplace: 'חיפוש / החלפה',
      securityScan: 'סריקת אבטחה',
      debug: 'דיבאג',
      step: 'צעד (F10)',
      continue: 'המשך',
      stop: 'עצור',
      run: 'הרץ (F5)',
      agentCreated: 'קובץ חדש מהסוכן',
      agentModified: 'קובץ עודכן ע"י הסוכן',
      viewDiff: 'הצג שינויים (Diff)',
      codeEditor: 'עורך קוד',
      reject: 'דחה',
      acceptChange: 'אשר שינוי',
      findPlaceholder: 'חיפוש בקוד...',
      replacePlaceholder: 'החלף ב...',
      replace: 'החלף',
      replaceAll: 'החלף הכל',
      zeroMatches: '0 תוצאות',
      autoHealedSuffix: 'תיקוני אבטחה אוטומטיים',
    },
    bottom: {
      console: 'טרמינל ופלט',
      debugger: 'מחסנית ומשתנים',
      preview: 'תצוגת React',
      security: 'סורק אבטחה (CWE)',
      sandbox: 'מדיניות ארגז חול',
      clearConsole: 'נקה פלט',
      autoFixFile: 'תקן קובץ אוטומטית',
      scanAll: 'סרוק את כל הקבצים',
      consoleEmpty:
        'לחץ F5 או על "הרץ ודמה" כדי להריץ את הקובץ הפעיל בתוך סביבת הרצה מבודדת.',
      callStack: 'מחסנית קריאות (Call Stack)',
      noFrames: 'אין מסגרות פעילות. הפעל מצב דיבאג כדי לנטר קריאות.',
      variables: 'משתנים ואוגרים',
      noVariables: 'לא נלכדו משתנים מקומיים בסקופ הנוכחי.',
      memoryMap: 'מיפוי זיכרון מבודד (Hex)',
      noMemory: 'הקצאות זיכרון וירטואלי יופיעו בעת סימולציה או דיבאג.',
      reactPreviewEmpty:
        'בחר קובץ React (.tsx) ולחץ F5 לקומפילציה ותצוגה מקדימה מבודדת אופליין.',
      zeroSecurity: 'לא נמצאו פגיעויות CWE או דפוסי זיכרון לא בטוחים.',
      severity: 'חומרה',
      findingTitle: 'ממצא והמלצה',
      location: 'מיקום',
      action: 'פעולה',
      manualReview: 'בדיקה ידנית',
      sandboxPolicyTitle: 'מדיניות בידוד סביבת הרצה אופליין',
      enforced: 'נאכף',
      blockNetwork: 'חסימת גישה לרשת חיצונית (CSP)',
      strictPointers: 'אכיפת גבולות מצביעים ומערכים',
      isolatedFs: 'מערכת קבצים וירטואלית מבודדת',
      resourceCaps: 'מגבלות משאבי ריצה',
      maxCycles: 'מקסימום מחזורי מעבד (מניעת לולאות אינסופיות)',
      maxMem: 'מגבלת זיכרון וירטואלי בארגז החול',
    },
    agent: {
      missionTab: 'חדר בקרה (Agents)',
      modelsTab: 'SparkMoE ו-Qwen',
      goalTitle: 'הנחיית משימה אוטונומית (עברית / EN)',
      sparkRouting: 'ניתוב SparkMoE + Qwen',
      offlineOrch: 'מתזמן סוכנים אופליין',
      goalPlaceholder: 'תאר ארכיטקטורה, רכיבים או מטרה בעברית או באנגלית...',
      launchMission: 'שגר משימה',
      executing: 'מבצע...',
      agentChanges: 'שינויי סוכנים',
      rejectAll: 'דחה הכל',
      acceptAll: 'אשר הכל',
      architectChecklist: 'תוכנית האדריכל (Checklist)',
      telemetryFeed: 'יומן פעילות סוכנים',
      feedEmpty:
        'הזן יעד תוכנה בעברית או באנגלית ולחץ "שגר משימה". מנוע SparkMoE יזרים מה-SSD רק את מומחי ה-Qwen הנדרשים, יריץ בדיקות F5 ויתקן פרצות CWE אוטומטית.',
      stages: {
        planning: 'תכנון',
        scaffolding: 'בניית קבצים',
        executing: 'הרצה',
        testing: 'בדיקות',
        selfHealing: 'תיקון עצמי',
      },
      presets: {
        tcpLabel: 'שרת TCP + React',
        tcpGoal: 'בנה שרת TCP מקבילי בשפת C עם בדיקות יחידה ודשבורד ניטור ב-React',
        rustLabel: 'מקצה זיכרון Rust',
        rustGoal: 'צור מנהל זיכרון מבוסס דפים ב-Rust עם בדיקות בטיחות ואבטחה',
        hardenLabel: 'הקשחת אבטחה',
        hardenGoal: 'סרוק, הקשח ותקן אוטומטית פרצות CWE בקבצי הפרויקט',
      },
    },
    models: {
      executionEngine: 'מנוע הרצה מקומי',
      loadFile: 'טען .meo / .gguf',
      sparkToggleTitle: 'מצב הזרמה מ-SSD (SparkMoE)',
      sparkToggleDesc: 'הזרמת מומחי Qwen/MoE לפי דרישה עם File.slice() · חיסכון מקסימלי בזיכרון',
      qwenPresetLabel: 'פרופיל מודל Qwen Coder',
      mountPreset: 'טען מודל מובנה',
      ringCapLabel: 'מגבלת מטמון טבעתי (RAM Cache)',
      ramCapLabel: 'מגבלת זיכרון מערכת רגיל (RAM)',
      activeExpert: 'מומחה פעיל כרגע',
      diskBandwidth: 'רוחב פס קריאה מהדיסק',
      ringFootprint: 'ניצול מטמון RAM',
      swapsHits: 'החלפות / פגיעות מטמון',
      ssdShardsTitle: 'חלקי מומחים ב-SSD',
      clickToStream: 'לחץ להזרמה',
      dropHint: 'גרור קובץ .meo או .gguf (Qwen 4 / Qwen 2.5-Coder) לכאן',
      ramArena: 'שטח RAM מוקצה',
      pages64k: 'דפי 64KB',
      throughput: 'קצב יצירה',
      chatEmpty:
        'שאל את מומחה ה-Qwen SparkMoE הפעיל שאלות על הקוד בעברית או באנגלית לחלוטין אופליין.',
      chatPlaceholder: 'שאל את מודל ה-Qwen הפעיל (עברית / EN)...',
    },
    modal: {
      title: 'יצירת סביבת פרויקט חדשה',
      projectName: 'שם הפרויקט',
      projectTemplate: 'תבנית פרויקט',
      cancel: 'ביטול',
      create: 'צור סביבת עבודה',
    },
  },
};
