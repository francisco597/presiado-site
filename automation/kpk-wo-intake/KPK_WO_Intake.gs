/**
 * KPK WO INTAKE — turns a Kirkplan work order into a live job.
 *
 * Order of operations matters. The acknowledgment to the Kirkplan PM is the
 * only client-facing step, so it is the one step that must never be blocked by
 * an internal failure: the intake work is wrapped, and the reply goes out
 * either way. A degraded acknowledgment beats a silent inbox.
 *
 * Chain this closes:
 *   WO email -> job number -> Drive folder -> JOBS row -> PO for Lowe's
 *   -> Lowe's Pro carries "PO#PH2026044" through every order email
 *   -> receipt scanner files the spend against the right job.
 * Before this script the first link was manual, so the rest of the chain
 * only ran when somebody remembered to start it.
 */

/** Entry point. Installed on a 5-minute time-driven trigger. */
function runKpkWoIntake() {
  var threads = findWorkOrderThreads_();
  if (!threads.length) return;

  Logger.log('KPK intake: %s candidate thread(s)', threads.length);

  threads.forEach(function (thread) {
    var message = firstInboundKpkMessage_(thread);
    if (!message) return;
    try {
      processWorkOrder_(thread, message);
    } catch (err) {
      handleIntakeFailure_(thread, message, err);
    }
  });
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Candidate threads: inbound Kirkplan mail carrying a PDF that has not been
 * processed yet. Replies and money mail are excluded by subject — every work
 * order observed so far is a fresh subject shaped "<Lastname> <Scope>".
 */
function findWorkOrderThreads_() {
  var query = [
    'from:' + CFG.KPK_DOMAIN,
    'has:attachment',
    'newer_than:' + CFG.SEARCH_WINDOW,
    '-label:' + CFG.LABEL_DONE.replace(/\//g, '-'),
    '-label:' + CFG.LABEL_ERROR.replace(/\//g, '-'),
    '-in:sent',
    '-in:draft'
  ].join(' ');

  return GmailApp.search(query, 0, 25).filter(function (thread) {
    if (hasLabel_(thread, CFG.LABEL_DONE) || hasLabel_(thread, CFG.LABEL_ERROR)) return false;
    return !!firstInboundKpkMessage_(thread);
  });
}

/** The first Kirkplan-sent message in the thread that carries a PDF work order. */
function firstInboundKpkMessage_(thread) {
  var found = null;
  thread.getMessages().forEach(function (msg) {
    if (found) return;
    var from = msg.getFrom().toLowerCase();
    if (from.indexOf('@' + CFG.KPK_DOMAIN) === -1) return;
    if (!looksLikeWorkOrderSubject_(msg.getSubject())) return;
    if (!pdfAttachment_(msg)) return;
    found = msg;
  });
  return found;
}

/**
 * A work order subject names a property and a scope. Replies, invoices and
 * statements are not work orders even when they carry a PDF.
 */
function looksLikeWorkOrderSubject_(subject) {
  var s = (subject || '').trim();
  if (!s) return false;
  if (/^(re|fwd|fw)\s*:/i.test(s)) return false;
  if (/\b(invoice|statement|payment|remittance|receipt|lien|w-?9|coi|certificate)\b/i.test(s)) return false;
  return SCOPE_WORDS_RE.test(s);
}

var SCOPE_WORDS_RE = new RegExp(
  '\\b(drywall|paint|painting|repair|texture|ceiling|popcorn|finish|finishing|' +
  'trim|tub|shower|kitchen|bath|remodel|patch|stucco|skim)\\b', 'i');

/** First PDF attachment on a message, or null. */
function pdfAttachment_(message) {
  var hit = null;
  message.getAttachments({ includeInlineImages: false }).forEach(function (att) {
    if (hit) return;
    var isPdf = att.getContentType() === 'application/pdf' ||
                /\.pdf$/i.test(att.getName());
    if (isPdf) hit = att;
  });
  return hit;
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

function processWorkOrder_(thread, message) {
  var parsed = parseWorkOrder_(message);
  Logger.log('Processing WO: %s | homeowner=%s', message.getSubject(), parsed.homeowner);

  // Everything that touches canonical state is wrapped. If any of it fails the
  // acknowledgment still goes out and the owner gets told what broke.
  var job = null;
  var intakeError = null;
  try {
    job = createJob_(parsed, message);
  } catch (err) {
    intakeError = err;
    Logger.log('Intake failed, sending bare acknowledgment: %s', err.message);
  }

  sendAcknowledgment_(message, parsed, job);
  notifyOwner_(parsed, job, message, intakeError);

  if (intakeError) {
    labelThread_(thread, CFG.LABEL_ERROR);
    throw intakeError; // surfaces in the Apps Script execution log
  }

  labelThread_(thread, CFG.LABEL_DONE);
  // Claim the thread for the legacy vigilante as well. Its search excludes
  // this label, so if that script is ever revived it will leave alone the work
  // orders we already filed into their job folders.
  labelThread_(thread, CFG.LEGACY_ATTACH_LABEL);
}

/**
 * Pulls what the email itself can prove. Anything not proven stays flagged.
 * Nothing here is inferred by plausibility — a missing address is reported
 * missing, never borrowed from a neighbouring job.
 */
function parseWorkOrder_(message) {
  var subject = (message.getSubject() || '').trim();
  var attachment = pdfAttachment_(message);

  return {
    subject: subject,
    homeowner: homeownerFromSubject_(subject),
    scope: scopeFromSubject_(subject),
    address: addressFromPdf_(attachment),
    senderEmail: extractEmail_(message.getFrom()),
    senderName: extractName_(message.getFrom()),
    messageId: message.getId(),
    receivedAt: message.getDate(),
    attachment: attachment
  };
}

/** "McClain Drywall and Paint" -> "McClain". Stops at the first scope word. */
function homeownerFromSubject_(subject) {
  var words = subject.split(/\s+/);
  var name = [];
  for (var i = 0; i < words.length; i++) {
    if (SCOPE_WORDS_RE.test(words[i])) break;
    name.push(words[i]);
  }
  return name.length ? name.join(' ') : '[REQUIERE_REVISION]';
}

/** The remainder of the subject after the homeowner name. */
function scopeFromSubject_(subject) {
  var homeowner = homeownerFromSubject_(subject);
  if (homeowner === '[REQUIERE_REVISION]') return subject;
  return subject.substring(homeowner.length).trim() || subject;
}

/**
 * Best-effort address extraction from the work order PDF via Drive OCR.
 * Returns [REQUIERE_REVISION] when OCR is off, fails, or finds nothing that
 * matches a street address. An unverified address is worse than a blank one:
 * it would name the folder, the invoice and the Lowe's delivery.
 */
function addressFromPdf_(attachment) {
  if (!CFG.ENABLE_PDF_OCR || !attachment) return '[REQUIERE_REVISION]';

  var tempId = null;
  try {
    var file = Drive.Files.insert(
      { title: 'TEMP_OCR_' + Date.now(), mimeType: 'application/vnd.google-apps.document' },
      attachment.copyBlob(),
      { ocr: true, ocrLanguage: 'en' }
    );
    tempId = file.id;
    var text = DocumentApp.openById(tempId).getBody().getText();
    var match = text.match(STREET_RE);
    if (!match) return '[REQUIERE_REVISION]';

    var street = match[0].replace(/\s+/g, ' ').trim();
    var zip = text.match(/\b(3\d{4})\b/); // Florida ZIPs
    return zip ? street + ', FL ' + zip[1] : street;
  } catch (err) {
    Logger.log('OCR failed (address left for review): %s', err.message);
    return '[REQUIERE_REVISION]';
  } finally {
    if (tempId) {
      try { Drive.Files.trash(tempId); } catch (ignore) {}
    }
  }
}

var STREET_RE = new RegExp(
  '\\d{2,6}\\s+[A-Za-z0-9.\\-\' ]{2,40}?\\s' +
  '(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Ct|Court|' +
  'Way|Pl|Place|Ter|Terrace|Cir|Circle|Trl|Trail|Pkwy|Parkway|Run|Loop)\\b\\.?', 'i');

// ---------------------------------------------------------------------------
// Job creation
// ---------------------------------------------------------------------------

/**
 * Reserves the job number, builds the Drive folder and writes the JOBS row.
 *
 * The number is taken under a script lock after reading both JOBS and
 * FIN_JOBS, which is the same verification the manual close step performs.
 * Guessing the next number without reading canonical state is what produced
 * the documented collisions — so this never guesses.
 */
function createJob_(parsed, message) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Could not acquire script lock for job numbering.');

  try {
    var jobId = nextJobId_();
    var poLowes = jobId.replace(/-/g, ''); // Lowe's carries PO#PH2026044

    if (CFG.SIMULATE) {
      Logger.log('[SIMULATE] would create %s for %s', jobId, parsed.homeowner);
      return { jobId: jobId, poLowes: poLowes, folderUrl: '(simulated)', woUrl: '(simulated)' };
    }

    var folder = createJobFolder_(jobId, parsed);
    var woFile = folder.documents.createFile(parsed.attachment.copyBlob())
      .setName('Work_Order_' + jobId + '.pdf');

    if (CFG.MIRROR_TO_LEGACY_ARCHIVE) {
      mirrorToLegacyArchive_(parsed.attachment);
    }

    appendJobsRow_(jobId, parsed, folder.root.getUrl(), woFile.getUrl(), message);

    return {
      jobId: jobId,
      poLowes: poLowes,
      folderUrl: folder.root.getUrl(),
      woUrl: woFile.getUrl()
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Highest PH-YYYY-### across JOBS and FIN_JOBS, plus one.
 *
 * A read failure and an empty year look identical from the caller's side, and
 * confusing them is how you hand out PH-2026-001 to a job that should have been
 * 045. So the read reports failure explicitly, and only a *successful* read that
 * genuinely finds no job for the current year is allowed to start at 001 —
 * which is the correct behaviour every January.
 */
function nextJobId_() {
  var year = new Date().getFullYear();
  var prefix = 'PH-' + year + '-';
  var highest = 0;
  var readAny = false;

  [[CFG.JOB_TRACKER_ID, CFG.JOBS_TAB], [CFG.FINANCE_OS_ID, CFG.FIN_JOBS_TAB]]
    .forEach(function (pair) {
      var result = readCellsContaining_(pair[0], pair[1], 'PH-');
      if (!result.ok) return;
      readAny = true;
      result.values.forEach(function (v) {
        var m = String(v).match(/PH-(\d{4})-(\d{3})/);
        if (m && Number(m[1]) === year) highest = Math.max(highest, Number(m[2]));
      });
    });

  if (!readAny) {
    throw new Error('Could not read JOBS or FIN_JOBS; refusing to assign a job number blind.');
  }
  return prefix + padLeft_(highest + 1, 3);
}

/**
 * Every cell of the sheet mentioning the fragment.
 * Returns {ok, values} so the caller can tell "nothing there" from "could not look".
 */
function readCellsContaining_(spreadsheetId, tabName, fragment) {
  try {
    var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(tabName);
    if (!sheet) return { ok: false, values: [] };
    if (sheet.getLastRow() < 2) return { ok: true, values: [] };

    var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn())
      .getValues()
      .reduce(function (acc, row) { return acc.concat(row); }, [])
      .filter(function (v) { return String(v).indexOf(fragment) !== -1; });

    return { ok: true, values: values };
  } catch (err) {
    Logger.log('Could not read %s!%s: %s', spreadsheetId, tabName, err.message);
    return { ok: false, values: [] };
  }
}

/** Active Projects/PH-YYYY-###_Homeowner_Address/{Documents,Photos,Receipts,Invoices} */
function createJobFolder_(jobId, parsed) {
  var addressSlug = parsed.address === '[REQUIERE_REVISION]'
    ? 'ADDRESS-PENDING'
    : slug_(parsed.address);

  var name = jobId + '_' + slug_(parsed.homeowner) + '_' + addressSlug;
  var root = DriveApp.getFolderById(CFG.ACTIVE_PROJECTS_FOLDER).createFolder(name);

  return {
    root: root,
    documents: root.createFolder('Documents'),
    photos: root.createFolder('Photos'),
    receipts: root.createFolder('Receipts'),
    invoices: root.createFolder('Invoices')
  };
}

/**
 * Optional mirror into the legacy flat archive, keeping the original filename
 * and the old script's duplicate check.
 */
function mirrorToLegacyArchive_(attachment) {
  try {
    var archive = DriveApp.getFolderById(CFG.KPK_ARCHIVE_FOLDER);
    if (archive.getFilesByName(attachment.getName()).hasNext()) return;
    archive.createFile(attachment.copyBlob()).setName(attachment.getName());
  } catch (err) {
    // A mirror is a convenience; never let it fail the intake.
    Logger.log('Legacy archive mirror skipped: %s', err.message);
  }
}

/** Appends the job to the canonical JOBS tab, writing by header name. */
function appendJobsRow_(jobId, parsed, folderUrl, woUrl, message) {
  var sheet = SpreadsheetApp.openById(CFG.JOB_TRACKER_ID).getSheetByName(CFG.JOBS_TAB);
  if (!sheet) throw new Error('JOBS tab not found in the Job Tracker.');

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var now = formatTs_(new Date());
  var row = new Array(headers.length).fill('');

  var values = {
    JOB_ID: jobId,
    CLIENT_ID: CFG.KPK_CLIENT_ID,
    PROJECT_NAME: parsed.subject,
    PROJECT_ADDRESS: parsed.address,
    PROJECT_TYPE: parsed.scope.toUpperCase(),
    SCOPE_SUMMARY: 'Per Kirkplan work order: ' + parsed.subject + '. Scope per attached WO PDF.',
    CURRENT_STATUS: 'SCHEDULED',
    PROJECT_MANAGER: CFG.OWNER_NAME,
    DRIVE_FOLDER_LINK: folderUrl,
    ACCOUNTING_LINK_STATUS: 'NOT_LINKED',
    NOTES: 'Auto-intake from Kirkplan WO email ' + formatTs_(parsed.receivedAt) +
           '. Sent by ' + parsed.senderName + ' <' + parsed.senderEmail + '>. ' +
           'Invoice routes back to this sender (owner rule 2026-07-22). ' +
           'Lowe\'s PO = ' + jobId.replace(/-/g, '') + '.',
    CREATED_AT: now,
    UPDATED_AT: now,
    HOMEOWNER_NAME: parsed.homeowner,
    WORK_ORDER_PDF_LINK: woUrl,
    PO_REFERENCE: jobId,
    SOURCE_EMAIL: parsed.senderEmail,
    SOURCE_MESSAGE_ID: parsed.messageId,
    SOURCE_TYPE: CFG.KPK_SOURCE_TYPE
  };

  Object.keys(values).forEach(function (key) {
    var idx = headers.indexOf(key);
    if (idx === -1) {
      Logger.log('JOBS header missing, field skipped: %s', key);
      return;
    }
    row[idx] = values[key];
  });

  sheet.appendRow(row);
}

// ---------------------------------------------------------------------------
// Client-facing acknowledgment
// ---------------------------------------------------------------------------

/**
 * Replies to whoever sent the work order. Kirkplan is a trade partner, so this
 * carries no warranty stack and no consumer framing — the brand rule for B2B.
 * When the job number exists it goes in the reply, because that same number is
 * the P.O. Kirkplan will see on the invoice.
 */
function sendAcknowledgment_(message, parsed, job) {
  var firstName = (parsed.senderName || '').split(' ')[0] || 'there';

  var lines = [
    firstName + ',',
    '',
    'Received — ' + parsed.subject + '. The work order and attached scope are ' +
      'logged on our end and the job is in our schedule queue.'
  ];

  if (job && job.jobId) {
    lines.push('');
    lines.push('Our reference for this job is ' + job.jobId + '. That number will ' +
               'appear as the P.O. on the invoice so it reconciles cleanly on your side.');
  }

  lines.push('');
  lines.push('I will confirm the start date with you shortly. If there is a required ' +
             'completion date on your side, send it over and we will build the schedule around it.');
  lines.push('');
  lines.push('If anything changes on the scope before we mobilize, reply on this thread ' +
             'and it stays with the file.');
  lines.push('');
  lines.push('Thank you,');
  lines.push('');
  lines.push(CFG.OWNER_NAME);
  lines.push(CFG.OWNER_TITLE);
  lines.push(CFG.COMPANY);
  lines.push(CFG.TRUST_LINE);
  lines.push(CFG.PHONE + ' · ' + CFG.WEB);

  var body = lines.join('\n');

  if (CFG.SIMULATE) {
    Logger.log('[SIMULATE] acknowledgment to %s:\n%s', parsed.senderEmail, body);
    return;
  }

  // reply() goes to the sender of this message and nobody else, which is the
  // behaviour we want: the PM who issued the work order, not the five other
  // Kirkplan addresses copied on it. GmailApp.reply has no "to" option — the
  // recipient is the message's sender by definition.
  message.reply(body);
  Logger.log('Acknowledgment sent to %s', parsed.senderEmail);
}

// ---------------------------------------------------------------------------
// Internal alert
// ---------------------------------------------------------------------------

/**
 * The owner's copy. Its job is to carry the one string Francisco needs before
 * he reaches a Lowe's checkout: the P.O. Without it the purchase lands on no
 * job and the receipt scanner has nothing to file it against.
 */
function notifyOwner_(parsed, job, message, intakeError) {
  var ok = !!job && !intakeError;
  var subject = ok
    ? 'WO intake — ' + job.jobId + ' · ' + parsed.homeowner
    : 'WO intake NEEDS ATTENTION — ' + parsed.subject;

  var rows = [
    ['Work order', parsed.subject],
    ['From', parsed.senderName + ' <' + parsed.senderEmail + '>'],
    ['Homeowner', parsed.homeowner],
    ['Address', parsed.address],
    ['Received', formatTs_(parsed.receivedAt)]
  ];

  if (ok) {
    rows.push(['Job number', job.jobId]);
    rows.push(['Lowe\'s P.O.', job.poLowes]);
    rows.push(['Folder', '<a href="' + job.folderUrl + '">Open in Drive</a>']);
    rows.push(['Work order PDF', '<a href="' + job.woUrl + '">Open PDF</a>']);
  } else {
    rows.push(['Intake error', intakeError ? intakeError.message : 'unknown']);
  }

  var table = rows.map(function (r) {
    return '<tr>' +
      '<td style="padding:6px 14px 6px 0;color:#777;white-space:nowrap;vertical-align:top;">' + r[0] + '</td>' +
      '<td style="padding:6px 0;color:' + BRAND.graphite + ';"><b>' + r[1] + '</b></td>' +
      '</tr>';
  }).join('');

  var callout = ok
    ? '<div style="margin:20px 0;padding:16px 18px;background:' + BRAND.cream +
      ';border-left:4px solid ' + BRAND.gold + ';">' +
      '<div style="font-size:12px;letter-spacing:1px;color:#777;text-transform:uppercase;">' +
      'Type this in the P.O. field at Lowe\'s</div>' +
      '<div style="font-size:26px;font-weight:bold;color:' + BRAND.charcoal +
      ';letter-spacing:1px;margin-top:6px;">' + job.poLowes + '</div>' +
      '<div style="font-size:12px;color:#777;margin-top:6px;">' +
      'Lowe\'s carries it through the order, pickup and receipt emails, and the ' +
      'receipt scanner files the spend against ' + job.jobId + ' automatically.</div>' +
      '</div>'
    : '<div style="margin:20px 0;padding:16px 18px;background:#FBEAEA;border-left:4px solid #B3261E;">' +
      '<b>The acknowledgment went out, but the job was not created.</b><br>' +
      'Create it by hand, or fix the cause and remove the ' + CFG.LABEL_ERROR +
      ' label to let the next run retry.</div>';

  var html =
    '<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;color:' + BRAND.charcoal + ';">' +
    '<div style="background:' + BRAND.charcoal + ';padding:16px 20px;">' +
    '<span style="color:' + BRAND.gold + ';font-weight:bold;letter-spacing:2px;">PRESIADO HOME</span>' +
    '<span style="color:#888;letter-spacing:1px;font-size:12px;"> · KPK WO INTAKE</span></div>' +
    '<div style="padding:20px;font-size:14px;line-height:1.6;">' +
    callout +
    '<table style="border-collapse:collapse;font-size:14px;">' + table + '</table>' +
    '<p style="margin-top:20px;font-size:12px;color:#888;">' +
    'Acknowledgment already sent to ' + parsed.senderEmail + '. ' +
    'Invoice routes back to the same sender.</p>' +
    '</div></div>';

  if (CFG.SIMULATE) {
    Logger.log('[SIMULATE] owner alert: %s', subject);
    return;
  }
  MailApp.sendEmail({ to: CFG.OWNER_EMAIL, subject: subject, htmlBody: html });
}

// ---------------------------------------------------------------------------
// Failure path
// ---------------------------------------------------------------------------

function handleIntakeFailure_(thread, message, err) {
  Logger.log('KPK intake error on "%s": %s', message.getSubject(), err.stack || err.message);
  labelThread_(thread, CFG.LABEL_ERROR);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasLabel_(thread, name) {
  return thread.getLabels().some(function (l) { return l.getName() === name; });
}

function labelThread_(thread, name) {
  if (CFG.SIMULATE) { Logger.log('[SIMULATE] would label thread: %s', name); return; }
  var label = GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
  thread.addLabel(label);
}

function extractEmail_(from) {
  var m = String(from).match(/<([^>]+)>/);
  return (m ? m[1] : String(from)).trim().toLowerCase();
}

function extractName_(from) {
  var s = String(from).replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  return s || extractEmail_(from);
}

/** Filesystem-safe fragment for folder names. */
function slug_(text) {
  return String(text)
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 48);
}

function padLeft_(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

function formatTs_(date) {
  return Utilities.formatDate(date, 'America/New_York', 'yyyy-MM-dd HH:mm');
}
